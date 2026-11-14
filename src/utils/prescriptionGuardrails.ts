import { collection, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { db, sanitizeData } from '../firebase';
import { stampTenantData } from './tenant';
import { PaymentRequest, User } from '../../types';

export type PrescribedItemKind = 'SOIN' | 'PHARMA' | 'LABO';

export interface GuardrailEvaluation {
  editable: boolean;
  isPaid: boolean;
  isProgressed: boolean;
  isCancelled: boolean;
  canCancelForRefund: boolean;
  clinicalStatus: string;
  lockReason: string;
}

const LOCK_REASON_MSG =
  "Modification impossible : Cet élément a déjà été payé ou est en cours d'exécution.";

export function getCollectionForKind(
  kind: PrescribedItemKind
): 'nursing_acts' | 'pending_prescriptions' | 'lab_requests' {
  if (kind === 'SOIN') return 'nursing_acts';
  if (kind === 'PHARMA') return 'pending_prescriptions';
  return 'lab_requests';
}

export function evaluatePrescriptionGuardrails(
  item: any,
  kind: PrescribedItemKind,
  paymentRequests: PaymentRequest[] = []
): GuardrailEvaluation {
  if (!item) {
    return {
      editable: false,
      isPaid: false,
      isProgressed: true,
      isCancelled: false,
      canCancelForRefund: false,
      clinicalStatus: 'INCONNU',
      lockReason: LOCK_REASON_MSG,
    };
  }

  const paySt = String(item.paymentStatus || item.payment_status || '').toUpperCase().trim();
  const billingSt = String(item.billingStatus || '').toLowerCase().trim();
  const linkedPr = item.paymentRequestId
    ? paymentRequests.find((pr) => pr.id === item.paymentRequestId)
    : undefined;
  const linkedPrSt = String(linkedPr?.status || '').toUpperCase().trim();

  const isPaid =
    item.isPaid === true ||
    ['PAID', 'PAYE', 'PAYÉ', 'SOLDE', 'SOLDÉ'].includes(paySt) ||
    billingSt === 'paid' ||
    billingSt === 'payé' ||
    ['PAID', 'PAYE', 'PAYÉ', 'SOLDE', 'SOLDÉ'].includes(linkedPrSt);

  const rawStatus = String(item.status || '').toUpperCase().trim();
  const rawClinical = String(item.clinicalStatus || item.clinical_status || '').toUpperCase().trim();
  const combined = `${rawStatus} ${rawClinical}`;

  const isCancelled =
    item.isCancelled === true ||
    combined.includes('ANNUL') ||
    combined.includes('CANCEL');

  let isProgressed = false;
  if (kind === 'SOIN') {
    isProgressed =
      ['FAIT', 'REALISE', 'RÉALISÉ', 'EXECUTED', 'EXÉCUTÉ'].includes(rawStatus) ||
      ['FAIT', 'REALISE', 'RÉALISÉ'].includes(rawClinical);
  } else if (kind === 'PHARMA') {
    isProgressed =
      item.isDelivered === true ||
      item.isAdministered === true ||
      ['DELIVERED', 'DISPENSED', 'DÉLIVRÉ', 'DELIVRE', 'SERVI', 'ADMINISTERED', 'ADMINISTRÉ', 'ADMINISTRE'].includes(rawStatus) ||
      ['DÉLIVRÉ', 'DELIVRE', 'ADMINISTRÉ', 'ADMINISTRE'].includes(rawClinical);
  } else if (kind === 'LABO') {
    const stLower = combined.toLowerCase();
    isProgressed =
      stLower.includes('prélèvement') ||
      stLower.includes('prelevement') ||
      stLower.includes('cours') ||
      stLower.includes('analyse') ||
      stLower.includes('termin') ||
      stLower.includes('valid') ||
      (Array.isArray(item.results) && item.results.length > 0);
  }

  const editable = !isPaid && !isProgressed && !isCancelled;

  return {
    editable,
    isPaid,
    isProgressed,
    isCancelled,
    canCancelForRefund: !isCancelled && isPaid,
    clinicalStatus: rawClinical || rawStatus || 'PRESCRIT',
    lockReason: editable ? '' : LOCK_REASON_MSG,
  };
}

export async function saveEditedPrescribedItem(params: {
  kind: PrescribedItemKind;
  docId: string;
  updates: Record<string, any>;
  paymentRequests?: PaymentRequest[];
  user?: User;
  establishment?: any;
}): Promise<void> {
  const { kind, docId, updates, paymentRequests = [], user, establishment } = params;
  const colName = getCollectionForKind(kind);

  // 1. Fresh Firestore lock verification
  const docRef = doc(db, colName, docId);
  const snap = await getDoc(docRef);
  if (!snap.exists()) {
    throw new Error("Élément introuvable dans la base de données.");
  }
  const latestData = { id: snap.id, ...snap.data() };
  const check = evaluatePrescriptionGuardrails(latestData, kind, paymentRequests);
  if (!check.editable) {
    throw new Error("L'élément ne peut plus être modifié.");
  }

  // 2. Call backend API if available (403 strictly aborts)
  const endpoint =
    kind === 'PHARMA'
      ? `/api/prescriptions/${encodeURIComponent(docId)}`
      : kind === 'SOIN'
      ? `/api/soins/${encodeURIComponent(docId)}`
      : `/api/lab-requests/${encodeURIComponent(docId)}`;

  try {
    const resp = await fetch(endpoint, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (resp.status === 403) {
      const errJson = await resp.json().catch(() => ({}));
      throw new Error(errJson.error || "L'élément ne peut plus être modifié.");
    }
    if (resp.ok) {
      return;
    }
  } catch (err: any) {
    if (err?.message?.includes('ne peut plus être modifié')) {
      throw err;
    }
    // Static Firebase Hosting fallback: proceed with Firestore update after lock check
  }

  const nowIso = new Date().toISOString();
  await updateDoc(
    docRef,
    sanitizeData({
      ...updates,
      updatedAt: nowIso,
      updatedBy: user?.name || user?.email || 'Médecin',
    })
  );

  // Sync linked unpaid payment_requests if amount/label changed
  const prId = (latestData as any).paymentRequestId;
  if (prId && updates._paymentRequestPatch) {
    const prRef = doc(db, 'payment_requests', prId);
    const prSnap = await getDoc(prRef);
    if (prSnap.exists()) {
      const prData = prSnap.data() as any;
      const prSt = String(prData.status || '').toUpperCase();
      if (prSt === 'PENDING') {
        await updateDoc(
          prRef,
          sanitizeData(
            stampTenantData(
              {
                ...updates._paymentRequestPatch,
                updatedAt: nowIso,
              },
              user,
              establishment
            )
          )
        );
      }
    }
  }
}

export async function cancelPrescribedItemWithRefund(params: {
  kind: PrescribedItemKind;
  docId: string;
  item: any;
  reason?: string;
  user?: User;
  establishment?: any;
}): Promise<void> {
  const { kind, docId, item, reason, user, establishment } = params;
  const colName = getCollectionForKind(kind);
  const nowIso = new Date().toISOString();
  const actorName = user?.name || user?.email || 'Médecin';
  const cancelReason = (reason || '').trim() || 'Erreur de prescription — Annulation médecin';

  await updateDoc(
    doc(db, colName, docId),
    sanitizeData({
      status: 'ANNULÉ',
      clinicalStatus: 'Annulé',
      isCancelled: true,
      cancelledAt: nowIso,
      cancelledBy: actorName,
      cancelReason,
      updatedAt: nowIso,
    })
  );

  // Notify Caisse for potential refund / Avoir if item was paid
  const notifRef = doc(collection(db, 'caisse_avoir_notifications'));
  await setDoc(
    notifRef,
    sanitizeData(
      stampTenantData(
        {
          id: notifRef.id,
          type: 'AVOIR_REMBOURSEMENT',
          kind,
          sourceCollection: colName,
          sourceDocId: docId,
          paymentRequestId: item?.paymentRequestId || '',
          patientId: item?.patientId || '',
          patientName: item?.patientName || 'Patient',
          itemLabel:
            item?.actName ||
            item?.actType ||
            item?.examName ||
            (item?.items?.[0]?.name) ||
            'Prescription',
          amount: Number(item?.totalAmount ?? item?.totalCost ?? item?.price ?? item?.unitPrice ?? 0),
          reason: cancelReason,
          status: 'A_VERIFIER_CAISSE',
          createdAt: nowIso,
          createdBy: actorName,
        },
        user,
        establishment
      )
    )
  );

  if (item?.paymentRequestId) {
    await updateDoc(
      doc(db, 'payment_requests', item.paymentRequestId),
      sanitizeData({
        refundRequested: true,
        refundStatus: 'A_VERIFIER_CAISSE',
        refundReason: cancelReason,
        refundRequestedAt: nowIso,
        refundRequestedBy: actorName,
      })
    ).catch(() => {});
  }
}
