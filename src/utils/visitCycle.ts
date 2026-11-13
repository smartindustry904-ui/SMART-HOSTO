import { db, sanitizeData } from '../firebase';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
  arrayUnion,
} from 'firebase/firestore';
import { EstablishmentConfig, PaymentRequest, User } from '../../types';
import { belongsToTenant, getActiveTenantId, stampTenantData } from './tenant';

export type VisitCycleStatus = 'ACTIF' | 'CLOTURE';

export interface VisitDestination {
  service: string;
  serviceId?: string;
  motif?: string;
  motifLabel?: string;
  queueId?: string;
  routedAt: string;
  routedBy?: string;
  isReroute?: boolean;
}

export interface VisitCycle {
  id: string;
  visite_id: string;
  patientId: string;
  dmeId?: string;
  patientName: string;
  status: VisitCycleStatus;
  openedAt: string;
  openedDate: string;
  openedTime: string;
  openedBy: string;
  closedAt?: string;
  closedBy?: string;
  dischargeId?: string;
  destinations: VisitDestination[];
}

export type PaymentBadgeCode = 'PAID' | 'EXONERE' | 'PENDING';

export interface ResolvedPaymentBadge {
  code: PaymentBadgeCode;
  label: 'PAYÉ' | 'EXONÉRÉ / SUIVI' | 'EN ATTENTE CAISSE';
}

const PAID_STATUSES = new Set([
  'PAID',
  'SOLDE',
  'SOLDÉ',
  'PAYE',
  'PAYÉ',
  'VALIDE',
  'VALIDÉ',
  'DELIVERED',
  'DISPENSED',
]);

const EXONERE_STATUSES = new Set([
  'EXONERE',
  'EXONÉRÉ',
  'ASSURANCE',
  'PEC',
  'TIERS_PAYANT',
  'GRATUIT',
  'SUIVI',
]);

const IGNORED_UNPAID_STATUSES = new Set([
  ...PAID_STATUSES,
  ...EXONERE_STATUSES,
  'CANCELLED',
  'ANNULE',
  'ANNULÉ',
]);

/**
 * Finds an active visit cycle (status === 'ACTIF') for any of the given patient IDs.
 */
export async function findActiveVisitForPatient(
  patientIds: string[],
  tenantId?: string
): Promise<VisitCycle | null> {
  const cleanIds = Array.from(new Set(patientIds.filter(Boolean)));
  if (cleanIds.length === 0) return null;

  const snap = await getDocs(
    query(collection(db, 'visites'), where('status', '==', 'ACTIF'))
  );

  for (const d of snap.docs) {
    const data = d.data() as any;
    if (tenantId && !belongsToTenant(data, tenantId)) continue;
    const matches =
      cleanIds.includes(data.patientId) ||
      (data.dmeId && cleanIds.includes(data.dmeId));
    if (matches) {
      return { ...data, id: d.id, visite_id: data.visite_id || d.id } as VisitCycle;
    }
  }
  return null;
}

/**
 * Opens a brand new Visit Cycle (visites) with status 'ACTIF'.
 */
export async function openVisitCycle(params: {
  patientId: string;
  dmeId?: string;
  patientName: string;
  destination: VisitDestination;
  user?: User | null;
  establishment?: EstablishmentConfig | null;
}): Promise<VisitCycle> {
  const docRef = doc(collection(db, 'visites'));
  const now = new Date();
  const payload: VisitCycle = {
    id: docRef.id,
    visite_id: docRef.id,
    patientId: params.patientId,
    dmeId: params.dmeId || params.patientId,
    patientName: params.patientName,
    status: 'ACTIF',
    openedAt: now.toISOString(),
    openedDate: now.toISOString().split('T')[0],
    openedTime: now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
    openedBy: params.user?.name || params.user?.username || 'Agent Accueil',
    destinations: [params.destination],
  };

  const stamped = stampTenantData(payload, params.user, params.establishment);
  await setDoc(docRef, sanitizeData(stamped));
  return payload;
}

/**
 * Appends a new destination to an existing active Visit Cycle.
 */
export async function appendDestinationToVisitCycle(params: {
  visiteId: string;
  destination: VisitDestination;
}): Promise<void> {
  if (!params.visiteId) return;
  const ref = doc(db, 'visites', params.visiteId);
  await updateDoc(ref, {
    destinations: arrayUnion(sanitizeData({ ...params.destination, isReroute: true })),
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Strictly closes an active Visit Cycle (status -> 'CLOTURE') during Sortie Admin.
 */
export async function closeVisitCycle(params: {
  visiteId?: string;
  patientIds?: string[];
  dischargeId?: string;
  closedBy?: string;
  tenantId?: string;
}): Promise<string[]> {
  const closedIds: string[] = [];
  const nowIso = new Date().toISOString();

  if (params.visiteId) {
    const ref = doc(db, 'visites', params.visiteId);
    const snap = await getDoc(ref);
    if (snap.exists() && snap.data()?.status === 'ACTIF') {
      await updateDoc(ref, {
        status: 'CLOTURE',
        closedAt: nowIso,
        closedBy: params.closedBy || 'Sortie Admin',
        dischargeId: params.dischargeId || '',
      });
      closedIds.push(params.visiteId);
    }
  }

  const cleanIds = Array.from(new Set((params.patientIds || []).filter(Boolean)));
  if (cleanIds.length > 0) {
    const activeSnap = await getDocs(
      query(collection(db, 'visites'), where('status', '==', 'ACTIF'))
    );
    const activeTenant = params.tenantId || getActiveTenantId();
    for (const d of activeSnap.docs) {
      if (closedIds.includes(d.id)) continue;
      const data = d.data() as any;
      if (activeTenant && !belongsToTenant(data, activeTenant)) continue;
      if (
        cleanIds.includes(data.patientId) ||
        (data.dmeId && cleanIds.includes(data.dmeId))
      ) {
        await updateDoc(doc(db, 'visites', d.id), {
          status: 'CLOTURE',
          closedAt: nowIso,
          closedBy: params.closedBy || 'Sortie Admin',
          dischargeId: params.dischargeId || '',
        });
        closedIds.push(d.id);
      }
    }
  }

  return closedIds;
}

/**
 * Resolves a universal live payment badge (PAYÉ, EXONÉRÉ / SUIVI, EN ATTENTE CAISSE)
 * for a patient visit or a specific prescribed act/lab request.
 */
export function resolvePaymentBadgeStatus(params: {
  item?: any;
  paymentRequests?: PaymentRequest[];
  patientIds?: string[];
  visiteId?: string;
}): ResolvedPaymentBadge {
  const { item, paymentRequests = [], patientIds = [], visiteId } = params;

  if (item) {
    if (
      item.isFreeFollowUp ||
      item.billingStatus === 'exonéré' ||
      item.isExonerated
    ) {
      return { code: 'EXONERE', label: 'EXONÉRÉ / SUIVI' };
    }

    const itemPaySt = String(item.paymentStatus || '').toUpperCase().trim();
    const itemSt = String(item.status || '').toUpperCase().trim();
    const itemBilling = String(item.billingStatus || '').toLowerCase().trim();

    if (EXONERE_STATUSES.has(itemPaySt) || itemBilling === 'exonéré') {
      return { code: 'EXONERE', label: 'EXONÉRÉ / SUIVI' };
    }
    if (PAID_STATUSES.has(itemPaySt) || PAID_STATUSES.has(itemSt) || itemBilling === 'payé') {
      // If item has a paymentRequestId, double-check if that request is actually unpaid
      if (item.paymentRequestId) {
        const linkedPr = paymentRequests.find((pr) => pr.id === item.paymentRequestId);
        if (linkedPr) {
          const prSt = String(linkedPr.status || '').toUpperCase();
          const rem = Number(
            (linkedPr as any).remainingAmount ??
              ((linkedPr.totalAmount || 0) - ((linkedPr as any).amountPaid || 0))
          );
          if (!IGNORED_UNPAID_STATUSES.has(prSt) && rem > 0) {
            return { code: 'PENDING', label: 'EN ATTENTE CAISSE' };
          }
        }
      }
      return { code: 'PAID', label: 'PAYÉ' };
    }

    if (item.paymentRequestId) {
      const linkedPr = paymentRequests.find((pr) => pr.id === item.paymentRequestId);
      if (linkedPr) {
        const prSt = String(linkedPr.status || '').toUpperCase();
        const rem = Number(
          (linkedPr as any).remainingAmount ??
            ((linkedPr.totalAmount || 0) - ((linkedPr as any).amountPaid || 0))
        );
        if (EXONERE_STATUSES.has(prSt) || (linkedPr as any).isExonerated) {
          return { code: 'EXONERE', label: 'EXONÉRÉ / SUIVI' };
        }
        if (PAID_STATUSES.has(prSt) || rem <= 0) {
          return { code: 'PAID', label: 'PAYÉ' };
        }
        return { code: 'PENDING', label: 'EN ATTENTE CAISSE' };
      }
    }
  }

  // Fallback / Visit-level check against live paymentRequests
  const cleanPids = Array.from(new Set(patientIds.filter(Boolean)));
  const relevantPrs = paymentRequests.filter((pr: any) => {
    if (visiteId && pr.visite_id) {
      return pr.visite_id === visiteId;
    }
    return (
      cleanPids.includes(pr.patientId) ||
      (pr.patientDme && cleanPids.includes(pr.patientDme))
    );
  });

  if (relevantPrs.length > 0) {
    const hasPending = relevantPrs.some((pr: any) => {
      const prSt = String(pr.status || '').toUpperCase();
      if (IGNORED_UNPAID_STATUSES.has(prSt)) return false;
      const rem = Number(pr.remainingAmount ?? ((pr.totalAmount || 0) - (pr.amountPaid || 0)));
      return rem > 0 || prSt === 'PENDING' || prSt === 'AWAITING_PAYMENT';
    });
    if (hasPending) {
      return { code: 'PENDING', label: 'EN ATTENTE CAISSE' };
    }
    const hasExonere = relevantPrs.some((pr: any) =>
      EXONERE_STATUSES.has(String(pr.status || '').toUpperCase())
    );
    if (hasExonere) {
      return { code: 'EXONERE', label: 'EXONÉRÉ / SUIVI' };
    }
    return { code: 'PAID', label: 'PAYÉ' };
  }

  return { code: 'PENDING', label: 'EN ATTENTE CAISSE' };
}
