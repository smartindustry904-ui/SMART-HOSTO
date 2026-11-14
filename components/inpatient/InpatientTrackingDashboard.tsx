import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  BedDouble,
  Beaker,
  Calendar,
  CheckCircle2,
  Clock,
  FileText,
  HeartPulse,
  Layers,
  Lock,
  Microscope,
  Pill,
  Plus,
  Stethoscope,
  Syringe,
  User,
  X,
} from 'lucide-react';
import { db } from '../../src/firebase';
import { collection, doc, onSnapshot, query, updateDoc, where } from 'firebase/firestore';
import { belongsToTenant, getActiveTenantId } from '../../src/utils/tenant';
import { resolvePaymentBadgeStatus, ResolvedPaymentBadge } from '../../src/utils/visitCycle';
import { User as UserType } from '../../types';

export interface InpatientStaySummary {
  id: string;
  hospitalisation_id?: string;
  visite_id?: string;
  patientId: string;
  patientName: string;
  roomName?: string;
  bedName?: string;
  wardName?: string;
  admissionDate?: string;
  admissionTime?: string;
  dischargeDate?: string;
  doctorName?: string;
  reason?: string;
  status?: string;
  vitals?: any[];
  cares?: any[];
  observations?: any[];
}

interface TimelineFeedItem {
  id: string;
  category: 'SOINS' | 'LABO' | 'PHARMA' | 'VISITE';
  title: string;
  subtitle?: string;
  body?: string;
  actor: string;
  timestampMs: number;
  dateStr: string;
  timeStr: string;
  clinicalBadge?: { label: string; tone: 'emerald' | 'amber' | 'blue' | 'rose' | 'slate' };
  financialBadge?: ResolvedPaymentBadge;
  rawDocId?: string;
  rawCollection?: 'pending_prescriptions' | 'nursing_acts' | 'lab_requests';
  canMarkAdministered?: boolean;
  metaChips?: string[];
  resultsList?: Array<{ name: string; value: string; unit?: string; ref?: string }>;
}

interface InpatientTrackingDashboardProps {
  stay: InpatientStaySummary;
  readOnly?: boolean;
  currentUser?: UserType;
  onClose?: () => void;
  onAddVitalClick?: () => void;
  onAddCareClick?: () => void;
  onAddNoteClick?: () => void;
  onPrescribeLabClick?: () => void;
  onPrescribeMedClick?: () => void;
}

const toMs = (val: any): number => {
  if (!val) return 0;
  if (typeof val === 'number') return val;
  if (val?.toDate) return val.toDate().getTime();
  const parsed = new Date(val).getTime();
  return isNaN(parsed) ? 0 : parsed;
};

const formatDateTimeParts = (ms: number, fallbackDate?: string, fallbackTime?: string) => {
  if (!ms) {
    return { dateStr: fallbackDate || '-', timeStr: fallbackTime || '' };
  }
  const d = new Date(ms);
  return {
    dateStr: d.toLocaleDateString('fr-FR'),
    timeStr: d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
  };
};

export const InpatientTrackingDashboard: React.FC<InpatientTrackingDashboardProps> = ({
  stay,
  readOnly = false,
  currentUser,
  onClose,
  onAddVitalClick,
  onAddCareClick,
  onAddNoteClick,
  onPrescribeLabClick,
  onPrescribeMedClick,
}) => {
  const [viewMode, setViewMode] = useState<'chronologique' | 'categorie'>('chronologique');
  const [activeCategoryTab, setActiveCategoryTab] = useState<'SOINS' | 'LABO' | 'PHARMA' | 'VISITE'>('SOINS');

  const [liveRecord, setLiveRecord] = useState<any>(null);
  const [nursingActs, setNursingActs] = useState<any[]>([]);
  const [labRequests, setLabRequests] = useState<any[]>([]);
  const [pharmacyOrders, setPharmacyOrders] = useState<any[]>([]);
  const [pharmacySales, setPharmacySales] = useState<any[]>([]);
  const [paymentRequests, setPaymentRequests] = useState<any[]>([]);
  const [triageRecords, setTriageRecords] = useState<any[]>([]);
  const [markingId, setMarkingId] = useState<string | null>(null);

  const activeTenantId = useMemo(() => getActiveTenantId(currentUser), [currentUser]);
  const stayId = stay.hospitalisation_id || stay.id;

  // 1. Live inpatient_records listener
  useEffect(() => {
    if (!stayId) return;
    const unsub = onSnapshot(doc(db, 'inpatient_records', stayId), (snap) => {
      if (snap.exists()) {
        setLiveRecord({ id: snap.id, ...snap.data() });
      }
    });
    return () => unsub();
  }, [stayId]);

  // 2. Cross-module listeners scoped by patientId
  useEffect(() => {
    if (!stay.patientId) return;
    const pid = stay.patientId;

    const unsubNursing = onSnapshot(
      query(collection(db, 'nursing_acts'), where('patientId', '==', pid)),
      (snap) => {
        setNursingActs(
          snap.docs
            .map((d) => ({ id: d.id, ...d.data() }))
            .filter((x) => belongsToTenant(x, activeTenantId))
        );
      }
    );

    const unsubLab = onSnapshot(
      query(collection(db, 'lab_requests'), where('patientId', '==', pid)),
      (snap) => {
        setLabRequests(
          snap.docs
            .map((d) => ({ id: d.id, ...d.data() }))
            .filter((x) => belongsToTenant(x, activeTenantId))
        );
      }
    );

    const unsubPharma = onSnapshot(
      query(collection(db, 'pending_prescriptions'), where('patientId', '==', pid)),
      (snap) => {
        setPharmacyOrders(
          snap.docs
            .map((d) => ({ id: d.id, ...d.data() }))
            .filter((x) => belongsToTenant(x, activeTenantId))
        );
      }
    );

    const unsubPharmaSales = onSnapshot(
      query(collection(db, 'pharmacy_sales'), where('patientId', '==', pid)),
      (snap) => {
        setPharmacySales(
          snap.docs
            .map((d) => ({ id: d.id, ...d.data() }))
            .filter((x) => belongsToTenant(x, activeTenantId))
        );
      }
    );

    const unsubPayments = onSnapshot(
      query(collection(db, 'payment_requests'), where('patientId', '==', pid)),
      (snap) => {
        setPaymentRequests(
          snap.docs
            .map((d) => ({ id: d.id, ...d.data() }))
            .filter((x) => belongsToTenant(x, activeTenantId))
        );
      }
    );

    const unsubTriage = onSnapshot(
      query(collection(db, 'triage_records'), where('patientId', '==', pid)),
      (snap) => {
        setTriageRecords(
          snap.docs
            .map((d) => ({ id: d.id, ...d.data() }))
            .filter((x) => belongsToTenant(x, activeTenantId))
        );
      }
    );

    return () => {
      unsubNursing();
      unsubLab();
      unsubPharma();
      unsubPharmaSales();
      unsubPayments();
      unsubTriage();
    };
  }, [stay.patientId, activeTenantId]);

  // Strict Cycle Isolation: only items belonging to THIS hospitalisation_id / visite_id (or exact stay window for legacy records)
  const stayStartMs = useMemo(() => {
    const raw = liveRecord?.admissionDate || stay.admissionDate;
    const ms = toMs(raw);
    return ms > 0 ? ms - 3600 * 1000 : 0;
  }, [liveRecord?.admissionDate, stay.admissionDate]);

  const stayEndMs = useMemo(() => {
    const raw = liveRecord?.dischargeDate || stay.dischargeDate;
    const ms = toMs(raw);
    return ms > 0 ? ms + 3600 * 1000 : Number.MAX_SAFE_INTEGER;
  }, [liveRecord?.dischargeDate, stay.dischargeDate]);

  const belongsToCurrentStay = (item: any): boolean => {
    if (item.hospitalisation_id) {
      return item.hospitalisation_id === stayId;
    }
    if (item.admissionId) {
      return item.admissionId === stayId;
    }
    if (stay.visite_id && item.visite_id) {
      return item.visite_id === stay.visite_id;
    }
    const itemMs = toMs(item.createdAt || item.date || item.timestamp || item.scheduledAt);
    if (!itemMs || !stayStartMs) return false;
    return itemMs >= stayStartMs && itemMs <= stayEndMs;
  };

  const mergedStay = {
    ...stay,
    ...(liveRecord || {}),
  };

  // Build unified chronological feed (DESC)
  const timelineItems: TimelineFeedItem[] = useMemo(() => {
    const items: TimelineFeedItem[] = [];

    const getFinBadge = (rawItem: any): ResolvedPaymentBadge =>
      resolvePaymentBadgeStatus({
        item: rawItem,
        paymentRequests,
        patientIds: [stay.patientId],
        visiteId: stay.visite_id,
      });

    // A1. Inpatient Vitals
    (mergedStay.vitals || []).forEach((v: any, idx: number) => {
      const ms = toMs(v.timestamp || v.createdAt || `${v.date || ''}T${v.time || '00:00'}`);
      const { dateStr, timeStr } = formatDateTimeParts(ms, v.date, v.time);
      const chips: string[] = [];
      if (v.bpSys) chips.push(`TA: ${v.bpSys}/${v.bpDia || 80} mmHg`);
      if (v.temp) chips.push(`T°: ${v.temp}°C`);
      if (v.pulse) chips.push(`Pouls: ${v.pulse} bpm`);
      if (v.spo2) chips.push(`SpO2: ${v.spo2}%`);
      items.push({
        id: `vital-${v.id || idx}`,
        category: 'SOINS',
        title: 'Prise de constantes vitales',
        actor: v.recordedBy || v.nurseName || 'Infirmier(ère)',
        timestampMs: ms,
        dateStr,
        timeStr,
        metaChips: chips,
        clinicalBadge: { label: 'Statut : Fait', tone: 'emerald' },
        financialBadge: v.paymentStatus || v.billingStatus ? getFinBadge(v) : { code: 'EXONERE', label: 'EXONÉRÉ / SUIVI' },
      });
    });

    // A2. Triage Records within stay
    triageRecords.filter(belongsToCurrentStay).forEach((t: any) => {
      const ms = toMs(t.createdAt);
      const { dateStr, timeStr } = formatDateTimeParts(ms);
      const vt = t.vitals || {};
      const chips: string[] = [];
      if (vt.bpSys) chips.push(`TA: ${vt.bpSys}/${vt.bpDia || 80}`);
      if (vt.temp) chips.push(`T°: ${vt.temp}°C`);
      if (vt.pulse) chips.push(`Pouls: ${vt.pulse}`);
      if (vt.spo2) chips.push(`SpO2: ${vt.spo2}%`);
      items.push({
        id: `triage-${t.id}`,
        category: 'SOINS',
        title: 'Évaluation & constantes infirmières',
        actor: t.createdBy || 'Soins Infirmiers',
        timestampMs: ms,
        dateStr,
        timeStr,
        metaChips: chips,
        clinicalBadge: { label: 'Statut : Fait', tone: 'emerald' },
        financialBadge: t.paymentStatus || t.billingStatus ? getFinBadge(t) : { code: 'EXONERE', label: 'EXONÉRÉ / SUIVI' },
      });
    });

    // A3. Inpatient Cares + Cross-Module Nursing Acts
    (mergedStay.cares || []).forEach((c: any, idx: number) => {
      const ms = toMs(c.timestamp || c.createdAt || `${c.date || ''}T${c.time || '00:00'}`);
      const { dateStr, timeStr } = formatDateTimeParts(ms, c.date, c.time);
      const isCareDone = c.status === 'Fait' || c.status === 'FAIT' || c.clinicalStatus === 'Fait';
      const isCarePrescribed = c.status === 'Prescrit' || c.clinicalStatus === 'Prescrit';
      items.push({
        id: `care-${c.id || idx}`,
        category: 'SOINS',
        title: c.title || c.type || 'Soin infirmier',
        body: c.notes || c.observations || '',
        actor: c.performedBy || c.nurseName || 'Infirmier(ère)',
        timestampMs: ms,
        dateStr,
        timeStr,
        clinicalBadge: {
          label: isCareDone ? 'Statut : Fait' : isCarePrescribed ? 'Statut : Prescrit' : 'Statut : En attente de soin',
          tone: isCareDone ? 'emerald' : isCarePrescribed ? 'slate' : 'amber',
        },
        financialBadge:
          c.paymentStatus || c.billingStatus || c.paymentRequestId
            ? getFinBadge(c)
            : { code: 'EXONERE', label: 'EXONÉRÉ / SUIVI' },
      });
    });

    nursingActs.filter(belongsToCurrentStay).forEach((na: any) => {
      const ms = toMs(na.completedAt || na.scheduledAt || na.createdAt);
      const { dateStr, timeStr } = formatDateTimeParts(ms, na.scheduledDate, na.scheduledTime);
      const isDone = na.status === 'FAIT' || na.status === 'Fait' || na.clinicalStatus === 'Fait';
      const isPrescribed = !isDone && (na.status === 'Prescrit' || na.clinicalStatus === 'Prescrit');
      items.push({
        id: `na-${na.id}`,
        category: 'SOINS',
        title: na.actType || na.title || 'Soin prescrit',
        subtitle: na.timing || (na.scheduledTime ? `Prévu à ${na.scheduledTime}` : undefined),
        body: na.instructions || na.notes || '',
        actor: isDone
          ? na.completedBy || 'Infirmier(ère)'
          : `Prescrit par ${na.prescribedBy || 'Médecin'}`,
        timestampMs: ms,
        dateStr,
        timeStr,
        clinicalBadge: {
          label: isDone ? 'Statut : Fait' : isPrescribed ? 'Statut : Prescrit' : 'Statut : En attente de soin',
          tone: isDone ? 'emerald' : isPrescribed ? 'slate' : 'amber',
        },
        financialBadge: getFinBadge(na),
      });
    });

    // B. Laboratoire
    labRequests.filter(belongsToCurrentStay).forEach((lr: any) => {
      const ms = toMs(lr.validatedAt || lr.updatedAt || lr.createdAt);
      const { dateStr, timeStr } = formatDateTimeParts(ms, lr.date);
      const examNames = (lr.exams || [])
        .map((e: any) => (typeof e === 'string' ? e : e.name))
        .filter(Boolean);
      const rawResults = lr.results || lr.validatedResults || lr.examResults || [];
      const resultsList: Array<{ name: string; value: string; unit?: string; ref?: string }> = [];
      if (Array.isArray(rawResults)) {
        rawResults.forEach((r: any) => {
          resultsList.push({
            name: r.parameter || r.name || r.examName || 'Paramètre',
            value: String(r.value ?? r.result ?? '-'),
            unit: r.unit || '',
            ref: r.reference || r.normalRange || '',
          });
        });
      } else if (rawResults && typeof rawResults === 'object') {
        Object.entries(rawResults).forEach(([k, v]: [string, any]) => {
          resultsList.push({
            name: k,
            value: typeof v === 'object' ? String(v?.value ?? v?.result ?? JSON.stringify(v)) : String(v),
            unit: typeof v === 'object' ? v?.unit || '' : '',
          });
        });
      }

      const st = String(lr.status || '').toLowerCase();
      const cs = String(lr.clinicalStatus || '').toLowerCase();
      const isDone = st.includes('termin') || st.includes('valid') || cs.includes('termin') || resultsList.length > 0;
      const isInProgress = !isDone && (st.includes('cours') || st.includes('analyse') || cs.includes('cours'));

      items.push({
        id: `lab-${lr.id}`,
        category: 'LABO',
        title: `Laboratoire : ${examNames.join(', ') || 'Analyses biologiques'}`,
        actor: isDone
          ? lr.validatedBy || 'Laborantin'
          : `Demandé par ${lr.prescriberName || 'Médecin'}`,
        timestampMs: ms,
        dateStr,
        timeStr,
        clinicalBadge: {
          label: isDone
            ? 'Statut : Terminé / Résultat Publié'
            : isInProgress
            ? "Statut : En cours d'analyse"
            : 'Statut : Prescrit',
          tone: isDone ? 'emerald' : isInProgress ? 'blue' : 'slate',
        },
        financialBadge: getFinBadge(lr),
        resultsList: resultsList.length > 0 ? resultsList : undefined,
      });
    });

    // C. Pharmacie (pending_prescriptions + deduplicated pharmacy_sales)
    const matchedOrderIds = new Set<string>();
    pharmacyOrders.filter(belongsToCurrentStay).forEach((po: any) => {
      matchedOrderIds.add(po.id);
      const ms = toMs(po.administeredAt || po.dispensedAt || po.updatedAt || po.createdAt);
      const { dateStr, timeStr } = formatDateTimeParts(ms);
      const meds = (po.items || po.medications || [])
        .map((m: any) => `${m.name || m.nom} (x${m.quantity || m.qty || 1}${m.dosage ? ` • ${m.dosage}` : ''})`)
        .filter(Boolean);
      const st = String(po.status || '').toUpperCase();
      const cs = String(po.clinicalStatus || '').toLowerCase();
      const isAdministered =
        po.isAdministered === true || cs.includes('administr') || st === 'ADMINISTERED' || st === 'ADMINISTRÉ';
      const isDispensed =
        !isAdministered &&
        (po.isDelivered === true ||
          ['DISPENSED', 'DELIVERED', 'DÉLIVRÉ', 'SERVI'].includes(st) ||
          cs.includes('délivr') ||
          cs.includes('dispens'));
      const isAwaitingDisp =
        !isAdministered &&
        !isDispensed &&
        (st === 'PENDING' ||
          st === 'EN_ATTENTE' ||
          po.isPaid === true ||
          String(po.paymentStatus || '').toUpperCase() === 'PAID');

      const clinicalLabel = isAdministered
        ? 'Statut : Administré'
        : isDispensed
        ? 'Statut : Délivré'
        : isAwaitingDisp
        ? 'Statut : En attente de délivrance'
        : 'Statut : Prescrit';
      const clinicalTone = isAdministered
        ? 'emerald'
        : isDispensed
        ? 'blue'
        : isAwaitingDisp
        ? 'amber'
        : 'slate';

      items.push({
        id: `pharma-${po.id}`,
        category: 'PHARMA',
        title: `Pharmacie : ${meds.join(', ') || 'Ordonnance de service'}`,
        actor: isAdministered
          ? `Administré par ${po.administeredBy || 'Infirmier(ère)'}`
          : isDispensed
          ? `Délivré par ${po.dispensedBy || 'Pharmacien'}`
          : `Prescrit par ${po.prescriberName || po.doctorName || 'Médecin'}`,
        timestampMs: ms,
        dateStr,
        timeStr,
        clinicalBadge: { label: clinicalLabel, tone: clinicalTone },
        financialBadge: getFinBadge(po),
        rawDocId: po.id,
        rawCollection: 'pending_prescriptions',
        canMarkAdministered: !readOnly && isDispensed && !isAdministered,
      });
    });

    pharmacySales
      .filter(belongsToCurrentStay)
      .filter((ps: any) => !ps.prescriptionId || !matchedOrderIds.has(ps.prescriptionId))
      .forEach((ps: any) => {
        const ms = toMs(ps.administeredAt || ps.createdAt || ps.date);
        const { dateStr, timeStr } = formatDateTimeParts(ms);
        const meds = (ps.items || [])
          .map((m: any) => `${m.name || m.nom} (x${m.quantity || m.qty || 1})`)
          .filter(Boolean);
        const isAdministered =
          ps.isAdministered === true || String(ps.clinicalStatus || '').toLowerCase().includes('administr');
        items.push({
          id: `pharma-sale-${ps.id}`,
          category: 'PHARMA',
          title: `Pharmacie : ${meds.join(', ') || 'Délivrance pharmacie'}`,
          actor: isAdministered
            ? `Administré par ${ps.administeredBy || 'Infirmier(ère)'}`
            : `Délivré par ${ps.cashierName || ps.dispensedBy || 'Pharmacien'}`,
          timestampMs: ms,
          dateStr,
          timeStr,
          clinicalBadge: {
            label: isAdministered ? 'Statut : Administré' : 'Statut : Délivré',
            tone: isAdministered ? 'emerald' : 'blue',
          },
          financialBadge: getFinBadge({
            ...ps,
            paymentStatus: ps.paymentStatus || 'PAID',
            isPaid: ps.isPaid ?? true,
          }),
        });
      });

    // D. Visites Médicales / Doctor Notes
    (mergedStay.observations || []).forEach((obs: any, idx: number) => {
      const ms = toMs(obs.timestamp || obs.createdAt || `${obs.date || ''}T${obs.time || '00:00'}`);
      const { dateStr, timeStr } = formatDateTimeParts(ms, obs.date, obs.time);
      items.push({
        id: `obs-${obs.id || idx}`,
        category: 'VISITE',
        title: obs.title || 'Visite médicale & Observation',
        body: obs.note || obs.content || obs.observation || '',
        actor: obs.doctorName || obs.createdBy || mergedStay.doctorName || 'Médecin Traitant',
        timestampMs: ms,
        dateStr,
        timeStr,
        clinicalBadge: { label: 'Statut : Fait', tone: 'emerald' },
        financialBadge: { code: 'EXONERE', label: 'EXONÉRÉ / SUIVI' },
      });
    });

    return items.sort((a, b) => b.timestampMs - a.timestampMs);
  }, [mergedStay, nursingActs, labRequests, pharmacyOrders, pharmacySales, paymentRequests, triageRecords, stay.patientId, stay.visite_id, readOnly]);

  const counts = useMemo(
    () => ({
      SOINS: timelineItems.filter((i) => i.category === 'SOINS').length,
      LABO: timelineItems.filter((i) => i.category === 'LABO').length,
      PHARMA: timelineItems.filter((i) => i.category === 'PHARMA').length,
      VISITE: timelineItems.filter((i) => i.category === 'VISITE').length,
    }),
    [timelineItems]
  );

  const handleMarkAdministered = async (item: TimelineFeedItem) => {
    if (readOnly || !item.rawDocId || item.rawCollection !== 'pending_prescriptions') return;
    setMarkingId(item.id);
    try {
      await updateDoc(doc(db, 'pending_prescriptions', item.rawDocId), {
        clinicalStatus: 'Administré',
        isAdministered: true,
        administeredAt: new Date().toISOString(),
        administeredBy: currentUser?.name || 'Infirmier(ère)',
      });
    } catch (err) {
      console.error('Error marking medication as administered:', err);
    } finally {
      setMarkingId(null);
    }
  };

  const badgeColors: Record<string, string> = {
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    rose: 'bg-rose-50 text-rose-700 border-rose-200',
    slate: 'bg-slate-100 text-slate-700 border-slate-300',
  };

  const financialBadgeColors: Record<'PAID' | 'EXONERE' | 'PENDING', string> = {
    PAID: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    EXONERE: 'bg-blue-50 text-blue-700 border-blue-200',
    PENDING: 'bg-rose-50 text-rose-700 border-rose-200',
  };

  const financialBadgeText: Record<'PAID' | 'EXONERE' | 'PENDING', string> = {
    PAID: '💰 Payé',
    EXONERE: '💰 Exonéré / Suivi',
    PENDING: '💰 En attente Caisse',
  };

  const categoryIcon = (cat: TimelineFeedItem['category']) => {
    switch (cat) {
      case 'SOINS':
        return { Icon: Syringe, bg: 'bg-rose-100 text-rose-600 border-rose-200' };
      case 'LABO':
        return { Icon: Microscope, bg: 'bg-blue-100 text-blue-600 border-blue-200' };
      case 'PHARMA':
        return { Icon: Pill, bg: 'bg-emerald-100 text-emerald-600 border-emerald-200' };
      case 'VISITE':
        return { Icon: Stethoscope, bg: 'bg-purple-100 text-purple-600 border-purple-200' };
    }
  };

  const renderFeedList = (items: TimelineFeedItem[]) => {
    if (items.length === 0) {
      return (
        <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center space-y-2">
          <Clock size={32} className="mx-auto text-slate-300" />
          <p className="font-black text-slate-700 text-sm">Aucun événement enregistré pour ce séjour</p>
          <p className="text-xs text-slate-400">
            Les constantes, soins infirmiers, résultats de laboratoire, dispensations pharmacie et visites médicales apparaissent ici en temps réel.
          </p>
        </div>
      );
    }

    return (
      <div className="space-y-3">
        {items.map((item) => {
          const { Icon, bg } = categoryIcon(item.category);
          return (
            <div
              key={item.id}
              className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 shadow-2xs hover:shadow-md transition-all flex items-start gap-4"
            >
              <div className={`w-11 h-11 rounded-2xl border flex items-center justify-center shrink-0 ${bg}`}>
                <Icon size={20} />
              </div>

              <div className="flex-1 min-w-0 space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="font-black text-slate-900 text-sm">{item.title}</h4>
                    {item.clinicalBadge && (
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${
                          badgeColors[item.clinicalBadge.tone]
                        }`}
                      >
                        {item.clinicalBadge.label}
                      </span>
                    )}
                    {item.financialBadge && (
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${
                          financialBadgeColors[item.financialBadge.code]
                        }`}
                      >
                        {financialBadgeText[item.financialBadge.code]}
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] font-bold text-slate-400 flex items-center gap-1 shrink-0">
                    <Clock size={12} />
                    {item.dateStr} {item.timeStr ? `à ${item.timeStr}` : ''}
                  </span>
                </div>

                {item.subtitle && (
                  <p className="text-xs font-bold text-indigo-600">{item.subtitle}</p>
                )}

                {item.body && (
                  <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-line bg-slate-50 p-3 rounded-xl border border-slate-100">
                    {item.body}
                  </p>
                )}

                {item.metaChips && item.metaChips.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {item.metaChips.map((chip, idx) => (
                      <span
                        key={idx}
                        className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-800 text-[11px] font-black"
                      >
                        {chip}
                      </span>
                    ))}
                  </div>
                )}

                {item.resultsList && item.resultsList.length > 0 && (
                  <div className="mt-2 p-3 rounded-xl bg-blue-50/60 border border-blue-200/70 space-y-1.5">
                    <span className="text-[10px] font-black uppercase tracking-wider text-blue-700 block">
                      Résultats publiés
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                      {item.resultsList.map((r, rIdx) => (
                        <div key={rIdx} className="bg-white px-3 py-2 rounded-lg border border-blue-100 text-xs">
                          <span className="text-slate-500 font-bold block text-[10px]">{r.name}</span>
                          <span className="font-black text-slate-900">
                            {r.value} {r.unit}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="pt-1 flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
                    <User size={12} />
                    <span>{item.actor}</span>
                  </div>
                  {item.canMarkAdministered && !readOnly && (
                    <button
                      type="button"
                      disabled={markingId === item.id}
                      onClick={() => handleMarkAdministered(item)}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-black transition-colors disabled:opacity-50"
                    >
                      <CheckCircle2 size={12} />
                      {markingId === item.id ? 'Enregistrement...' : 'Marquer Administré'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="w-full space-y-5">
      {/* Full-Width Top Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white rounded-3xl p-5 sm:p-6 shadow-xl border border-slate-700/60">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2.5 py-1 rounded-lg bg-blue-500/20 border border-blue-400/30 text-blue-200 text-[10px] font-black uppercase tracking-wider">
                Fiche de Suivi d&apos;Hospitalisation
              </span>
              {readOnly && (
                <span className="px-2.5 py-1 rounded-lg bg-amber-500/20 border border-amber-400/40 text-amber-200 text-[10px] font-black uppercase tracking-wider flex items-center gap-1">
                  <Lock size={11} /> Archive Médicale (Lecture seule)
                </span>
              )}
              {mergedStay.visite_id && (
                <span className="px-2 py-0.5 rounded-md bg-white/10 text-slate-300 text-[10px] font-mono">
                  Cycle: {mergedStay.visite_id.slice(-6).toUpperCase()}
                </span>
              )}
            </div>

            <h2 className="text-xl sm:text-2xl font-black tracking-tight">
              {mergedStay.patientName}
              <span className="ml-2 text-xs font-mono text-slate-400 font-bold">
                #{mergedStay.patientId}
              </span>
            </h2>

            <div className="flex flex-wrap items-center gap-4 text-xs text-slate-300 font-semibold">
              <span className="flex items-center gap-1.5">
                <BedDouble size={14} className="text-blue-400" />
                {mergedStay.roomName || 'Chambre'} — {mergedStay.bedName || 'Lit'}
              </span>
              <span className="flex items-center gap-1.5">
                <Calendar size={14} className="text-emerald-400" />
                Entrée : {mergedStay.admissionDate ? new Date(mergedStay.admissionDate).toLocaleDateString('fr-FR') : '-'}
                {mergedStay.dischargeDate && (
                  <> • Sortie : {new Date(mergedStay.dischargeDate).toLocaleDateString('fr-FR')}</>
                )}
              </span>
              <span className="flex items-center gap-1.5">
                <Stethoscope size={14} className="text-purple-400" />
                Médecin : {mergedStay.doctorName || 'Médecin traitant'}
              </span>
            </div>

            {mergedStay.reason && (
              <p className="text-xs text-slate-300">
                Motif d&apos;admission : <strong className="text-white">{mergedStay.reason}</strong>
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {!readOnly && (
              <>
                {onAddVitalClick && (
                  <button
                    onClick={onAddVitalClick}
                    className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-black flex items-center gap-1.5 cursor-pointer transition-all"
                  >
                    <HeartPulse size={14} /> + Constantes
                  </button>
                )}
                {onAddCareClick && (
                  <button
                    onClick={onAddCareClick}
                    className="px-3 py-2 rounded-xl bg-rose-500/80 hover:bg-rose-500 text-white text-xs font-black flex items-center gap-1.5 cursor-pointer transition-all"
                  >
                    <Syringe size={14} /> + Prescrire un soin
                  </button>
                )}
                {onAddNoteClick && (
                  <button
                    onClick={onAddNoteClick}
                    className="px-3 py-2 rounded-xl bg-purple-500/80 hover:bg-purple-500 text-white text-xs font-black flex items-center gap-1.5 cursor-pointer transition-all"
                  >
                    <Plus size={14} /> + Ajouter une note
                  </button>
                )}
                {onPrescribeLabClick && (
                  <button
                    onClick={onPrescribeLabClick}
                    className="px-3 py-2 rounded-xl bg-blue-500/80 hover:bg-blue-500 text-white text-xs font-black flex items-center gap-1.5 cursor-pointer transition-all"
                  >
                    <Beaker size={14} /> + Labo
                  </button>
                )}
                {onPrescribeMedClick && (
                  <button
                    onClick={onPrescribeMedClick}
                    className="px-3 py-2 rounded-xl bg-emerald-500/80 hover:bg-emerald-500 text-white text-xs font-black flex items-center gap-1.5 cursor-pointer transition-all"
                  >
                    <Pill size={14} /> + Pharmacie
                  </button>
                )}
              </>
            )}
            {onClose && (
              <button
                onClick={onClose}
                className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white cursor-pointer"
                title="Fermer"
              >
                <X size={18} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* View Toggle: Vue Chronologique vs Vue par Catégorie */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200 shadow-2xs">
        <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl w-fit">
          <button
            type="button"
            onClick={() => setViewMode('chronologique')}
            className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer ${
              viewMode === 'chronologique'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Clock size={14} />
            Vue Chronologique ({timelineItems.length})
          </button>
          <button
            type="button"
            onClick={() => setViewMode('categorie')}
            className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer ${
              viewMode === 'categorie'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Layers size={14} />
            Vue par Catégorie
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold">
          <span className="px-2.5 py-1 rounded-lg bg-rose-50 text-rose-700 border border-rose-200">
            Soins ({counts.SOINS})
          </span>
          <span className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 border border-blue-200">
            Labo ({counts.LABO})
          </span>
          <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200">
            Pharmacie ({counts.PHARMA})
          </span>
          <span className="px-2.5 py-1 rounded-lg bg-purple-50 text-purple-700 border border-purple-200">
            Visites ({counts.VISITE})
          </span>
        </div>
      </div>

      {/* Main Workspace */}
      {viewMode === 'chronologique' ? (
        renderFeedList(timelineItems)
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {(
              [
                { id: 'SOINS', label: `Soins Infirmiers (${counts.SOINS})`, Icon: Syringe },
                { id: 'LABO', label: `Laboratoire (${counts.LABO})`, Icon: Microscope },
                { id: 'PHARMA', label: `Pharmacie (${counts.PHARMA})`, Icon: Pill },
                { id: 'VISITE', label: `Visites Médicales (${counts.VISITE})`, Icon: Stethoscope },
              ] as const
            ).map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setActiveCategoryTab(id)}
                className={`px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 border transition-all cursor-pointer ${
                  activeCategoryTab === id
                    ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                <Icon size={14} />
                {label}
              </button>
            ))}
          </div>

          {renderFeedList(timelineItems.filter((i) => i.category === activeCategoryTab))}
        </div>
      )}
    </div>
  );
};
