import React, { useState, useEffect, useMemo } from 'react';
import { 
  Heart, Activity, Thermometer, Scale, Stethoscope, 
  AlertCircle, CheckCircle, Clock, Search, ArrowRight, 
  User, CheckCircle2, AlertTriangle, ChevronRight, Zap, RefreshCw, X,
  LayoutDashboard, ShieldAlert, FileText, Check, BedDouble, Syringe, Plus, Droplets, Filter
} from 'lucide-react';
import { db, sanitizeData } from '../src/firebase';
import { collection, doc, setDoc, updateDoc, getDoc, getDocs, query, where, onSnapshot, orderBy, limit } from 'firebase/firestore';
import { Patient, User as UserType, NurseSubMenu, PaymentRequest } from '../types';
import Inpatient from './Inpatient';
import { MicroHeader } from '../components/common/MicroHeader';
import { useSettings } from '../hooks/useSettings';
import { getActiveTenantId, belongsToTenant, stampTenantData } from '../src/utils/tenant';
import { UniversalHospitalisationModal } from '../components/common/UniversalHospitalisationModal';
import { deductConsumablesForAct } from '../src/utils/consumablesStock';
import { PaymentStatusBadge } from '../src/components/PaymentStatusBadge';
import { resolvePaymentBadgeStatus } from '../src/utils/visitCycle';

interface SoinsInfirmiersProps {
  user?: UserType;
  globalWaitingQueue?: any[];
  setGlobalWaitingQueue?: React.Dispatch<React.SetStateAction<any[]>>;
  paymentRequests?: PaymentRequest[];
  setPaymentRequests?: React.Dispatch<React.SetStateAction<PaymentRequest[]>>;
  activeTab: NurseSubMenu;
  setActiveTab: (tab: NurseSubMenu) => void;
  onBackToDashboard: () => void;
  theme?: 'light' | 'dark';
}

export const SoinsInfirmiers: React.FC<SoinsInfirmiersProps> = ({
  user,
  globalWaitingQueue = [],
  setGlobalWaitingQueue,
  paymentRequests = [],
  setPaymentRequests,
  activeTab = 'dashboard',
  setActiveTab,
  onBackToDashboard,
  theme = 'light'
}) => {
  const { establishment } = useSettings();
  const activeTenantId = useMemo(() => getActiveTenantId(user, establishment), [user, establishment]);

  const [searchFilter, setSearchFilter] = useState('');
  const [activePatient, setActivePatient] = useState<any | null>(null);
  const [showHospitalisationModal, setShowHospitalisationModal] = useState(false);
  const [earlyExecModalAct, setEarlyExecModalAct] = useState<any | null>(null);
  const [earlyExecReason, setEarlyExecReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [triageHistory, setTriageHistory] = useState<any[]>([]);
  const [historySearch, setHistorySearch] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);

  // Vitals form state for active patient
  const [vitals, setVitals] = useState({
    bpSys: 120,
    bpDia: 80,
    heartRate: 75,
    pulse: 75,
    respRate: 18,
    spo2: 98,
    temp: 37.0,
    height: 170,
    weight: 70,
    waistCirc: 85,
    bloodGlucose: 1.0,
    painScore: 0,
    glasgowScore: 15,
    clinicalNotes: ''
  });

  // Nursing care queue (Receive-Only Execution Queue) state
  const [nursingActs, setNursingActs] = useState<any[]>([]);
  const [selectedActForExecution, setSelectedActForExecution] = useState<any | null>(null);
  const [executionNotes, setExecutionNotes] = useState('');
  const [isExecutingAct, setIsExecutingAct] = useState(false);
  const [soinSearchQuery, setSoinSearchQuery] = useState('');
  const [soinStatusFilter, setSoinStatusFilter] = useState<'ALL' | 'PENDING' | 'DONE'>('PENDING');
  const [soinOriginFilter, setSoinOriginFilter] = useState<'ALL' | 'URGENCES' | 'CONSULTATION' | 'ACCUEIL'>('ALL');

  // Listen to triage history from Firestore
  useEffect(() => {
    try {
      const q = query(
        collection(db, 'triage_records'),
        orderBy('createdAt', 'desc'),
        limit(100)
      );
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const records = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setTriageHistory(records.filter(r => belongsToTenant(r, activeTenantId)));
      }, (err) => {
        console.warn("Error listening to triage_records:", err);
      });
      return () => unsubscribe();
    } catch (e) {
      console.error("Error setting up triage_records listener:", e);
    }
  }, [activeTenantId]);

  // Listen to nursing care acts from Firestore
  useEffect(() => {
    try {
      const q = query(
        collection(db, 'nursing_acts'),
        orderBy('createdAt', 'desc'),
        limit(50)
      );
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const acts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setNursingActs(acts.filter(a => belongsToTenant(a, activeTenantId)));
      }, (err) => {
        console.warn("Error listening to nursing_acts:", err);
      });
      return () => unsubscribe();
    } catch (e) {
      console.error("Error setting up nursing_acts listener:", e);
    }
  }, [activeTenantId]);

  // Filter patients waiting for triage or direct nursing care
  const waitingTriageList = useMemo(() => {
    return (globalWaitingQueue || []).filter(q => {
      if (q.status === 'waiting_triage') return true;
      const s = (q.service || '').toLowerCase();
      const m = (q.motif || '').toLowerCase();
      const ml = (q.motifLabel || '').toLowerCase();
      const sid = (q.serviceId || '');
      const isSoin = s.includes('soin') || s.includes('infirm') || m.includes('soin') || ml.includes('soin') || ml.includes('pansement') || ml.includes('injection') || sid.includes('INFIRMIER');
      return isSoin && (q.status === 'waiting' || q.status === 'waiting_triage');
    });
  }, [globalWaitingQueue]);

  // Patients triaged today
  const triagedTodayList = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    return triageHistory.filter(t => t.createdAt?.startsWith(today));
  }, [triageHistory]);

  // Critical alerts count today
  const criticalCount = useMemo(() => {
    return triagedTodayList.filter(t => t.priority === 'critique').length;
  }, [triagedTodayList]);

  const urgentCount = useMemo(() => {
    return triagedTodayList.filter(t => t.priority === 'urgent').length;
  }, [triagedTodayList]);

  const getActScheduledMs = (act: any): number => {
    if (act?.scheduledAt) {
      const parsed = new Date(act.scheduledAt).getTime();
      if (!isNaN(parsed)) return parsed;
    }
    const rawTime = String(act?.scheduledTime || '').trim();
    const timeMatch = rawTime.match(/(\d{1,2})[:hH](\d{2})/);
    if (timeMatch) {
      const hh = Number(timeMatch[1]);
      const mm = Number(timeMatch[2]);
      const rawDate = String(act?.scheduledDate || act?.date || '').trim();
      let year: number, month: number, day: number;
      if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
        const [y, m, d] = rawDate.split('-').map(Number);
        year = y; month = m - 1; day = d;
      } else if (/^\d{2}\/\d{2}\/\d{4}$/.test(rawDate)) {
        const [d, m, y] = rawDate.split('/').map(Number);
        year = y; month = m - 1; day = d;
      } else {
        const now = new Date();
        year = now.getFullYear(); month = now.getMonth(); day = now.getDate();
      }
      return new Date(year, month, day, hh, mm, 0, 0).getTime();
    }
    if (act?.createdAt) {
      const createdMs = new Date(act.createdAt).getTime();
      if (!isNaN(createdMs)) return createdMs;
    }
    return Number.MAX_SAFE_INTEGER;
  };

  // Nursing care acts counters (strictly sorted ascending by Heure Prévue)
  const hospitalisationActs = useMemo(() => {
    return nursingActs
      .filter(a => a.source === 'HOSPITALISATION' || Boolean(a.bedId) || Boolean(a.locationBadge) || Boolean(a.hospitalizedOrigin))
      .sort((a, b) => getActScheduledMs(a) - getActScheduledMs(b));
  }, [nursingActs]);

  const pendingHospActsCount = useMemo(() => {
    return hospitalisationActs.filter(a => a.status !== 'FAIT' && a.status !== 'REALISE').length;
  }, [hospitalisationActs]);

  const pendingActsCount = useMemo(() => {
    return nursingActs.filter(a => a.status === 'EN ATTENTE' || !a.status).length;
  }, [nursingActs]);

  const urgPendingCount = useMemo(() => {
    return nursingActs.filter(a => (a.source === 'URGENCES' || a.priority === 'HIGH') && a.status !== 'FAIT').length;
  }, [nursingActs]);

  const accueilPendingCount = useMemo(() => {
    return nursingActs.filter(a => (a.source === 'ACCUEIL' || a.origin === 'ACCUEIL') && a.status !== 'FAIT').length;
  }, [nursingActs]);

  const consultPendingCount = useMemo(() => {
    return nursingActs.filter(a => a.source !== 'URGENCES' && a.source !== 'ACCUEIL' && a.origin !== 'ACCUEIL' && a.priority !== 'HIGH' && a.status !== 'FAIT').length;
  }, [nursingActs]);

  const doneActsCount = useMemo(() => {
    return nursingActs.filter(a => a.status === 'FAIT').length;
  }, [nursingActs]);

  const filteredQueue = useMemo(() => {
    if (!searchFilter.trim()) return waitingTriageList;
    const term = searchFilter.toLowerCase();
    return waitingTriageList.filter(p => 
      (p.lastName && p.lastName.toLowerCase().includes(term)) ||
      (p.firstName && p.firstName.toLowerCase().includes(term)) ||
      (p.patientId && p.patientId.toLowerCase().includes(term)) ||
      (p.dmeId && p.dmeId.toLowerCase().includes(term)) ||
      (p.motifLabel && p.motifLabel.toLowerCase().includes(term)) ||
      (p.speciality && p.speciality.toLowerCase().includes(term))
    );
  }, [waitingTriageList, searchFilter]);

  // Dynamic calculated BMI
  const computedBMI = useMemo(() => {
    if (vitals.height > 0 && vitals.weight > 0) {
      const hM = vitals.height / 100;
      return parseFloat((vitals.weight / (hM * hM)).toFixed(1));
    }
    return 0;
  }, [vitals.height, vitals.weight]);

  const getBmiCategory = (bmi: number) => {
    if (bmi === 0) return { label: 'Non calculé', color: 'text-slate-400' };
    if (bmi < 18.5) return { label: 'Insuffisance pondérale', color: 'text-amber-500' };
    if (bmi < 25) return { label: 'Poids normal', color: 'text-emerald-500' };
    if (bmi < 30) return { label: 'Surpoids', color: 'text-amber-600' };
    return { label: 'Obésité', color: 'text-rose-600' };
  };

  // Algorithmic Triage Engine
  const assessPriority = useMemo(() => {
    const alerts: string[] = [];
    let priority: 'normal' | 'urgent' | 'critique' = 'normal';

    // 1. Critical Red Flags (Priority: CRITIQUE - Rouge)
    if (vitals.spo2 && vitals.spo2 < 90) {
      priority = 'critique';
      alerts.push('SpO2 critique (< 90%)');
    }
    if (vitals.bpSys && vitals.bpSys < 85) {
      priority = 'critique';
      alerts.push('Hypotension sévère (PAS < 85 mmHg)');
    }
    if (vitals.bpSys && vitals.bpSys >= 200) {
      priority = 'critique';
      alerts.push('Crise hypertensive sévère (PAS >= 200 mmHg)');
    }
    if (vitals.heartRate && (vitals.heartRate < 40 || vitals.heartRate > 140)) {
      priority = 'critique';
      alerts.push('Trouble du rythme critique (FC < 40 ou > 140 bpm)');
    }
    if (vitals.respRate && (vitals.respRate < 8 || vitals.respRate > 32)) {
      priority = 'critique';
      alerts.push('Détresse respiratoire (FR < 8 ou > 32/min)');
    }
    if (vitals.temp && (vitals.temp > 40.0 || vitals.temp < 35.0)) {
      priority = 'critique';
      alerts.push('Température extrême (< 35°C ou > 40°C)');
    }
    if (vitals.glasgowScore && vitals.glasgowScore < 12) {
      priority = 'critique';
      alerts.push('Trouble sévère de la conscience (Glasgow < 12)');
    }

    // 2. Urgent Yellow Flags (Priority: URGENT - Orange if not already critique)
    if (priority !== 'critique') {
      if (vitals.spo2 && vitals.spo2 >= 90 && vitals.spo2 <= 94) {
        priority = 'urgent';
        alerts.push('Hypoxie modérée (SpO2 90-94%)');
      }
      if (vitals.bpSys && ((vitals.bpSys >= 160 && vitals.bpSys < 200) || (vitals.bpSys >= 85 && vitals.bpSys < 95))) {
        priority = 'urgent';
        alerts.push('Tension instable (PAS 160-199 ou 85-94)');
      }
      if (vitals.heartRate && ((vitals.heartRate >= 110 && vitals.heartRate <= 140) || (vitals.heartRate >= 45 && vitals.heartRate < 55))) {
        priority = 'urgent';
        alerts.push('Tachycardie / Bradycardie (FC 110-140 ou 45-54 bpm)');
      }
      if (vitals.temp && (vitals.temp >= 38.8 && vitals.temp <= 40.0)) {
        priority = 'urgent';
        alerts.push('Hyperthermie marquée (38.8°C - 40°C)');
      }
      if (vitals.painScore && vitals.painScore >= 7) {
        priority = 'urgent';
        alerts.push(`Douleur intense (EVA: ${vitals.painScore}/10)`);
      }
      if (vitals.bloodGlucose && (vitals.bloodGlucose < 0.6 || vitals.bloodGlucose > 3.0)) {
        priority = 'urgent';
        alerts.push(`Déséquilibre glycémique majeur (${vitals.bloodGlucose} g/L)`);
      }
    }

    return { priority, alerts };
  }, [vitals]);

  const handleSelectPatientForTriage = (patient: any) => {
    setActivePatient(patient);
    // Auto-clear from Accueil waiting room immediately on "Prendre en charge"
    (async () => {
      try {
        const pids = [patient.patientId, patient.id, patient.dmeId].filter(Boolean);
        for (const pid of pids) {
          const snap = await getDocs(query(collection(db, 'service_queues'), where('patientId', '==', pid)));
          snap.docs.forEach(d => {
            updateDoc(doc(db, 'service_queues', d.id), {
              takenInCharge: true,
              attente_module: 'EN_COURS',
              calledAt: new Date().toISOString()
            }).catch(() => {});
          });
        }
      } catch {}
    })();
    if (patient.vitals) {
      setVitals(prev => ({
        ...prev,
        ...patient.vitals,
        bpSys: patient.vitals.bpSys || (patient.vitals.bp ? parseInt(patient.vitals.bp.split('/')[0]) : 120),
        bpDia: patient.vitals.bpDia || (patient.vitals.bp ? parseInt(patient.vitals.bp.split('/')[1]) : 80),
        temp: patient.vitals.temp || 37.0,
        height: patient.vitals.height || 170,
        weight: patient.vitals.weight || 70,
        spo2: patient.vitals.spo2 || 98,
        pulse: patient.vitals.pulse || 75,
        heartRate: patient.vitals.heartRate || patient.vitals.pulse || 75
      }));
    } else {
      setVitals({
        bpSys: 120,
        bpDia: 80,
        heartRate: 75,
        pulse: 75,
        respRate: 18,
        spo2: 98,
        temp: 37.0,
        height: 170,
        weight: 70,
        waistCirc: 85,
        bloodGlucose: 1.0,
        painScore: 0,
        glasgowScore: 15,
        clinicalNotes: ''
      });
    }
  };

  // The core transfer action: moves patient from waiting_triage to waiting in doctor's queue
  const handleTransferToDoctor = async () => {
    if (!activePatient) return;
    setIsSubmitting(true);
    try {
      const today = new Date();
      const nurseName = user?.name || user?.email || 'Infirmier(ère) de Triage';

      const finalVitalsData = {
        bpSys: vitals.bpSys,
        bpDia: vitals.bpDia,
        bp: `${vitals.bpSys}/${vitals.bpDia}`,
        heartRate: vitals.heartRate,
        pulse: vitals.pulse,
        respRate: vitals.respRate,
        spo2: vitals.spo2,
        temp: vitals.temp,
        height: vitals.height,
        weight: vitals.weight,
        waistCirc: vitals.waistCirc,
        bmi: computedBMI,
        bloodGlucose: vitals.bloodGlucose,
        painScore: vitals.painScore,
        glasgowScore: vitals.glasgowScore,
        clinicalNotes: vitals.clinicalNotes
      };

      // 1. Update queue entry in service_queues: change status to 'waiting' for doctor
      const directQueueDocId = activePatient.queueDocId || activePatient.docId;
      let targetDocId = directQueueDocId;
      const queuePayload = {
        status: 'waiting',
        priority: assessPriority.priority,
        priorityAlerts: assessPriority.alerts,
        vitals: finalVitalsData,
        triagedAt: today.toISOString(),
        triagedBy: nurseName,
        triagedById: user?.id || ''
      };

      const pId = activePatient.patientId || activePatient.dmeId || activePatient.id;
      const fallbackDocId = targetDocId || (activePatient.id ? activePatient.id : doc(collection(db, 'service_queues')).id);

      // 1. Optimistic Offline-First UI Update (0ms delay)
      setGlobalWaitingQueue((prev: any[]) => prev.map(p =>
        (p.id === pId || p.patientId === pId || p.queueDocId === directQueueDocId)
          ? { ...p, ...queuePayload }
          : p
      ));
      setActivePatient(null);
      setIsSubmitting(false);

      window.dispatchEvent(new CustomEvent('app-notification', {
        detail: `🩺 Triage validé pour ${activePatient.lastName} ${activePatient.firstName} [Priorité: ${assessPriority.priority.toUpperCase()}] -> Transféré en file de consultation médecin.`
      }));

      // 2. Background Firestore persistence via local IndexedDB cache
      if (directQueueDocId) {
        setDoc(doc(db, 'service_queues', directQueueDocId), sanitizeData(stampTenantData(queuePayload, user, establishment)), { merge: true }).catch(() => {});
      } else {
        setDoc(doc(db, 'service_queues', fallbackDocId), sanitizeData(stampTenantData({
          ...activePatient,
          patientId: pId,
          dmeId: activePatient.dmeId || pId,
          firstName: activePatient.firstName || '',
          lastName: activePatient.lastName || '',
          age: activePatient.age || 0,
          gender: activePatient.gender || 'M',
          motif: activePatient.motif || 'CONSULTATION',
          service: activePatient.service || 'Médecine Générale',
          ...queuePayload,
          createdAt: activePatient.createdAt || today.toISOString()
        }, user, establishment)), { merge: true }).catch(() => {});
      }

      if (pId) {
        getDocs(query(collection(db, 'service_queues'), where('patientId', '==', pId)))
          .then(snap => {
            snap.docs.forEach(d => updateDoc(doc(db, 'service_queues', d.id), queuePayload).catch(() => {}));
          })
          .catch(() => {});
      }

      const triageDocRef = doc(collection(db, 'triage_records'));
      setDoc(triageDocRef, sanitizeData(stampTenantData({
        id: triageDocRef.id,
        patientId: pId,
        patientName: `${activePatient.lastName} ${activePatient.firstName}`,
        queueId: directQueueDocId || fallbackDocId,
        vitals: finalVitalsData,
        priority: assessPriority.priority,
        priorityAlerts: assessPriority.alerts,
        nurseName: nurseName,
        nurseId: user?.id || '',
        practitionerId: user?.id || '',
        practitionerName: nurseName,
        practitionerRole: user?.role || 'INFIRMIER',
        isClotured: true,
        cloturedAt: today.toISOString(),
        createdAt: today.toISOString()
      }, user, establishment))).catch(() => {});

      setDoc(doc(collection(db, 'audit_logs')), {
        user: nurseName,
        role: 'NURSE',
        date: today.toLocaleDateString('fr-FR'),
        time: today.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
        timestamp: today.toISOString(),
        action: `Triage infirmier validé (${assessPriority.priority.toUpperCase()}) -> Transféré vers la file médecin`,
        details: {
          patientId: pId,
          patientName: `${activePatient.lastName} ${activePatient.firstName}`,
          priority: assessPriority.priority,
          alerts: assessPriority.alerts,
          practitionerId: user?.id || ''
        },
        module: 'Soins Infirmiers'
      }).catch(() => {});
    } catch (err: any) {
      console.error("Error finalizing nurse triage:", err);
      setIsSubmitting(false);
    }
  };

  // Action for patients who came purely for nursing care (pansement, injection, etc.)
  const handleCompleteNursingCareDirectly = async () => {
    if (!activePatient) return;
    setIsSubmitting(true);
    try {
      const today = new Date();
      const nurseName = user?.name || user?.username || 'Infirmier(ère)';
      const nurseId = user?.id || '';

      const finalVitalsData = {
        bpSys: vitals.bpSys,
        bpDia: vitals.bpDia,
        bp: `${vitals.bpSys}/${vitals.bpDia}`,
        heartRate: vitals.heartRate,
        pulse: vitals.pulse,
        respRate: vitals.respRate,
        spo2: vitals.spo2,
        temp: vitals.temp,
        height: vitals.height,
        weight: vitals.weight,
        waistCirc: vitals.waistCirc,
        bmi: computedBMI,
        bloodGlucose: vitals.bloodGlucose,
        painScore: vitals.painScore,
        glasgowScore: vitals.glasgowScore,
        clinicalNotes: vitals.clinicalNotes
      };

      const pId = activePatient.patientId || activePatient.dmeId || activePatient.id;
      const directQueueDocId = activePatient.queueDocId || activePatient.docId;

      const queuePayload = {
        status: 'completed',
        isClotured: true,
        cloturedAt: today.toISOString(),
        cloturedBy: nurseName,
        vitals: finalVitalsData,
        triagedAt: today.toISOString(),
        triagedBy: nurseName,
        triagedById: nurseId
      };

      // 1. Optimistic Offline-First UI Update (0ms delay)
      if (setGlobalWaitingQueue) {
        setGlobalWaitingQueue((prev: any[]) => prev.filter(p =>
          !(p.id === pId || p.patientId === pId || p.queueDocId === directQueueDocId)
        ));
      }
      setActivePatient(null);
      setIsSubmitting(false);

      window.dispatchEvent(new CustomEvent('app-notification', {
        detail: `✓ Soin infirmier ambulatoire validé & clôturé pour ${activePatient.lastName} ${activePatient.firstName} (Sans transfert en consultation).`
      }));

      // 2. Persist queue update
      if (directQueueDocId) {
        setDoc(doc(db, 'service_queues', directQueueDocId), sanitizeData(stampTenantData(queuePayload, user, establishment)), { merge: true }).catch(() => {});
      }

      // 3. Mark or create act in nursing_acts as FAIT
      const actDocRef = doc(collection(db, 'nursing_acts'));
      const actLabel = activePatient.motifLabel || activePatient.motif || 'Soin Infirmier Ambulatoire';
      setDoc(actDocRef, sanitizeData(stampTenantData({
        id: actDocRef.id,
        patientId: pId,
        patientDme: activePatient.dmeId || pId,
        patientName: `${activePatient.lastName} ${activePatient.firstName}`,
        careName: actLabel,
        actName: actLabel,
        name: actLabel,
        actType: actLabel,
        motif: actLabel,
        source: 'ACCUEIL',
        origin: 'ACCUEIL',
        status: 'FAIT',
        priority: 'NORMAL',
        executedBy: nurseName,
        executedById: nurseId,
        executedAt: today.toISOString(),
        createdAt: today.toISOString()
      }, user, establishment)), { merge: true }).catch(() => {});

      // 4. Record triage record
      const triageDocRef = doc(collection(db, 'triage_records'));
      setDoc(triageDocRef, sanitizeData(stampTenantData({
        id: triageDocRef.id,
        patientId: pId,
        patientName: `${activePatient.lastName} ${activePatient.firstName}`,
        queueId: directQueueDocId || '',
        vitals: finalVitalsData,
        priority: assessPriority.priority,
        priorityAlerts: assessPriority.alerts,
        nurseName: nurseName,
        nurseId: nurseId,
        practitionerId: nurseId,
        practitionerName: nurseName,
        practitionerRole: user?.role || 'INFIRMIER',
        isClotured: true,
        cloturedAt: today.toISOString(),
        createdAt: today.toISOString()
      }, user, establishment))).catch(() => {});

    } catch (err: any) {
      console.error("Error completing nursing care:", err);
      setIsSubmitting(false);
    }
  };

  const isActBeforeScheduledTime = (act: any): boolean => {
    if (!act?.scheduledTime && !act?.scheduledAt) return false;
    const schedMs = getActScheduledMs(act);
    if (schedMs === Number.MAX_SAFE_INTEGER) return false;
    return Date.now() < schedMs;
  };

  // Mark prescribed nursing care act as Done (FAIT) - Assigned to practitioner ONLY upon completion
  const handleMarkActAsDone = async (act: any, overrideReason?: string) => {
    if (!act?.id) return;

    // Logic Trap: intercept if executing before Heure Prévue without a justification reason
    if (overrideReason === undefined && isActBeforeScheduledTime(act)) {
      setEarlyExecModalAct(act);
      setEarlyExecReason('');
      return;
    }

    setIsExecutingAct(true);
    try {
      const today = new Date();
      const nurseName = user?.name || user?.username || user?.email || 'Infirmier(ère)';
      const nurseId = user?.id || '';
      const actRef = doc(db, 'nursing_acts', act.id);

      const cleanOverrideReason = typeof overrideReason === 'string' ? overrideReason.trim() : '';
      const notesToSave = cleanOverrideReason || executionNotes.trim() || 'Soin réalisé conformément aux prescriptions médicales.';
      const dateStr = today.toLocaleDateString('fr-FR');
      const timeStr = today.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
      const isoNow = today.toISOString();
      const schedTimeSnapshot = act.scheduledTime || (act.scheduledAt ? new Date(act.scheduledAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '');

      const completedActPayload: Record<string, any> = {
        status: 'FAIT',
        clinicalStatus: 'Fait',
        isClotured: true,
        cloturedAt: isoNow,
        cloturedBy: nurseName,
        cloturedById: nurseId,
        practitionerId: nurseId,
        practitionerName: nurseName,
        practitionerRole: user?.role || 'INFIRMIER',
        nurseId: nurseId,
        executedBy: nurseName,
        executedById: nurseId,
        completedBy: nurseName,
        executedByRole: 'Infirmier(ère)',
        executionNotes: notesToSave,
        executionDate: dateStr,
        executionTime: timeStr,
        heure_execution: timeStr,
        completedAt: isoNow,
        executedAt: isoNow,
        updatedAt: isoNow
      };

      if (cleanOverrideReason) {
        completedActPayload.executedEarly = true;
        completedActPayload.earlyExecutionReason = cleanOverrideReason;
        completedActPayload.motifAnticipation = cleanOverrideReason;
        if (schedTimeSnapshot) {
          completedActPayload.scheduledTimeSnapshot = schedTimeSnapshot;
        }
      }

      // 1. Optimistic Offline-First UI Update (0ms delay)
      setSelectedActForExecution((prev: any) => prev ? {
        ...prev,
        ...completedActPayload
      } : null);
      setExecutionNotes('');
      setIsExecutingAct(false);

      window.dispatchEvent(new CustomEvent('app-notification', {
        detail: `✓ Soin « ${act.actType} » validé, clôturé et assigné à ${nurseName} (${act.patientName}).`
      }));

      // 2. Background Firestore persistence via local IndexedDB cache
      setDoc(actRef, sanitizeData(stampTenantData(completedActPayload, user, establishment)), { merge: true }).catch(() => {});

      // 2b. Automated Stock Decrement (Consommables linked to this act in Paramètres)
      deductConsumablesForAct({
        actId: act.actId,
        actName: act.actName || act.actType || act.careName,
        user,
        establishment,
        moduleSource: 'Soins Infirmiers'
      }).catch(() => {});

      // Also assign any related payment request for this soin to the nurse who executed it
      if (act.paymentRequestId) {
        setDoc(doc(db, 'payment_requests', act.paymentRequestId), sanitizeData(stampTenantData({
          practitionerId: nurseId,
          practitionerName: nurseName,
          practitionerRole: user?.role || 'INFIRMIER',
          isClotured: true,
          cloturedAt: isoNow,
          cloturedBy: nurseName
        }, user, establishment)), { merge: true }).catch(() => {});
      }
    } catch (err: any) {
      console.error("Error marking nursing act as done:", err);
      setIsExecutingAct(false);
    }
  };

  return (
    <div className={`h-screen flex flex-col overflow-hidden p-3 sm:p-5 font-sans ${theme === 'dark' ? 'bg-[#090d16] text-slate-100' : 'bg-[#F8FAFC] text-slate-900'}`}>
      <MicroHeader
        icon={Heart}
        breadcrumbs={[
          { label: 'Soins Infirmiers', onClick: () => setActiveTab('triage') },
          { 
            label: activeTab === 'soins' ? 'Actes & Soins Prescrits' :
                   activeTab === 'historique' ? 'Historique' :
                   activeTab === 'hospitalisation' ? 'Hospitalisation' : 'Triage & Constantes',
            active: true
          }
        ]}
        onHomeClick={onBackToDashboard}
        onBackClick={activeTab !== 'triage' ? () => setActiveTab('triage') : undefined}
        user={{ name: user?.name || 'Infirmier(ère)' }}
        theme={theme}
        actions={
          <div className="flex items-center gap-1.5 overflow-x-auto">
            <button
              onClick={() => setActiveTab('triage')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-semibold text-xs transition-all whitespace-nowrap cursor-pointer ${
                activeTab === 'triage' || activeTab === 'dashboard'
                  ? 'bg-teal-600 text-white shadow-xs'
                  : theme === 'dark'
                  ? 'bg-slate-800/80 border border-slate-700/80 text-slate-300 hover:bg-slate-800'
                  : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Stethoscope size={14} />
              <span>Triage ({waitingTriageList.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('soins')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-semibold text-xs transition-all whitespace-nowrap cursor-pointer ${
                activeTab === 'soins'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : theme === 'dark'
                  ? 'bg-slate-800/80 border border-slate-700/80 text-slate-300 hover:bg-slate-800'
                  : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Syringe size={14} />
              <span>Soins & Actes ({pendingActsCount})</span>
              {urgPendingCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-600 text-white animate-pulse">
                  {urgPendingCount} URG
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('soins_hosp')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-semibold text-xs transition-all whitespace-nowrap cursor-pointer ${
                activeTab === 'soins_hosp'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : theme === 'dark'
                  ? 'bg-slate-800/80 border border-slate-700/80 text-slate-300 hover:bg-slate-800'
                  : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Clock size={14} />
              <span>Soins Hospitalisation ({pendingHospActsCount})</span>
            </button>
            <button
              onClick={() => setActiveTab('historique')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-semibold text-xs transition-all whitespace-nowrap cursor-pointer ${
                activeTab === 'historique'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : theme === 'dark'
                  ? 'bg-slate-800/80 border border-slate-700/80 text-slate-300 hover:bg-slate-800'
                  : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <FileText size={14} />
              <span>Historique</span>
            </button>
            <button
              onClick={() => setActiveTab('hospitalisation')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-semibold text-xs transition-all whitespace-nowrap cursor-pointer ${
                activeTab === 'hospitalisation'
                  ? 'bg-purple-600 text-white shadow-xs'
                  : theme === 'dark'
                  ? 'bg-slate-800/80 border border-slate-700/80 text-slate-300 hover:bg-slate-800'
                  : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <BedDouble size={14} />
              <span>Lits</span>
            </button>
          </div>
        }
      />

      <main className="flex-1 min-h-0 overflow-y-auto custom-scrollbar space-y-5">

      {/* TAB 1: TRIAGE & CONSTANTES */}
      {(activeTab === 'triage' || activeTab === 'dashboard') && (
        <div className="space-y-6 animate-in fade-in duration-300">
          {/* Key Metric Cards for Tab 1 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div 
              className="bg-white dark:bg-slate-900 p-5 rounded-[24px] border border-slate-200/80 dark:border-slate-800 shadow-xs"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">En attente de Triage</span>
                <div className="w-9 h-9 rounded-xl bg-teal-50 dark:bg-teal-950/40 text-teal-600 flex items-center justify-center">
                  <Clock size={18} />
                </div>
              </div>
              <p className="text-2xl font-black text-slate-900 dark:text-white">{waitingTriageList.length}</p>
              <p className="text-[11px] text-teal-600 font-bold mt-1">Accueil ➔ Prise de constantes</p>
            </div>

            <div 
              onClick={() => setActiveTab('historique')}
              className="bg-white dark:bg-slate-900 p-5 rounded-[24px] border border-slate-200/80 dark:border-slate-800 shadow-xs hover:border-blue-300 transition-all cursor-pointer group"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Triés Aujourd'hui</span>
                <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <CheckCircle2 size={18} />
                </div>
              </div>
              <p className="text-2xl font-black text-slate-900 dark:text-white">{triagedTodayList.length}</p>
              <p className="text-[11px] text-slate-400 font-medium mt-1">Transférés vers consultation</p>
            </div>

            <div 
              className="bg-white dark:bg-slate-900 p-5 rounded-[24px] border border-slate-200/80 dark:border-slate-800 shadow-xs"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Cas Critiques (Rouge)</span>
                <div className="w-9 h-9 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 flex items-center justify-center">
                  <ShieldAlert size={18} />
                </div>
              </div>
              <p className="text-2xl font-black text-rose-600">{criticalCount}</p>
              <p className="text-[11px] text-rose-500 font-medium mt-1">Urgences vitales détectées</p>
            </div>

            <div 
              onClick={() => setActiveTab('soins')}
              className="bg-white dark:bg-slate-900 p-5 rounded-[24px] border border-slate-200/80 dark:border-slate-800 shadow-xs hover:border-indigo-300 transition-all cursor-pointer group"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Soins Prescrits (Tab 2)</span>
                <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Syringe size={18} />
                </div>
              </div>
              <div className="flex items-baseline gap-2">
                <p className="text-2xl font-black text-slate-900 dark:text-white">{pendingActsCount}</p>
                {urgPendingCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-red-600 text-white animate-pulse">
                    {urgPendingCount} URG
                  </span>
                )}
              </div>
              <p className="text-[11px] text-indigo-600 font-bold mt-1 flex items-center gap-1">
                <span>File d'exécution des soins</span>
                <ArrowRight size={12} />
              </p>
            </div>
          </div>
          {/* Header Banner */}
          <div className="bg-slate-900 text-white p-6 md:p-8 rounded-[36px] shadow-xl relative overflow-hidden">
            <div className="absolute -right-16 -top-16 w-60 h-60 rounded-full bg-teal-500/10 blur-3xl"></div>
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative z-10">
              <div className="flex items-center gap-4">
                <div className="p-4 bg-teal-500/20 text-teal-400 rounded-3xl border border-teal-500/30">
                  <Stethoscope size={32} />
                </div>
                <div>
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-black uppercase tracking-[0.25em] text-teal-400">Salle de Triage Active</span>
                    <span className="bg-teal-500/20 text-teal-300 border border-teal-500/40 px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider animate-pulse">
                      {waitingTriageList.length} en attente
                    </span>
                  </div>
                  <h2 className="text-2xl md:text-3xl font-extrabold mt-1 tracking-tight">Prise de Constantes & Évaluation</h2>
                  <p className="text-xs text-slate-400 font-medium mt-0.5">Saisissez les paramètres physiologiques et transférez le patient au médecin de consultation.</p>
                </div>
              </div>

              {activePatient && (
                <button
                  onClick={() => setActivePatient(null)}
                  className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition-all flex items-center gap-2"
                >
                  <X size={14} />
                  <span>Changer de patient</span>
                </button>
              )}
            </div>
          </div>

          {/* Patient Selection & Vitals Workspace */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
            
            {/* Left Column: Waiting Queue */}
            <div className="bg-white p-6 rounded-[32px] border border-slate-200 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                  <Clock size={16} className="text-teal-600" />
                  <span>File d'Attente ({waitingTriageList.length})</span>
                </h3>
              </div>

              {/* Search bar */}
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input
                  type="text"
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  placeholder="Rechercher patient, motif..."
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div className="space-y-2.5 max-h-[550px] overflow-y-auto custom-scrollbar pr-1">
                {filteredQueue.length === 0 ? (
                  <div className="py-12 text-center text-slate-400 text-xs font-medium">
                    Aucun patient trouvé dans la file.
                  </div>
                ) : (
                  filteredQueue.map((patient, idx) => {
                    const isSelected = activePatient && (activePatient.id === patient.id || activePatient.patientId === patient.patientId);
                    return (
                      <div
                        key={idx}
                        onClick={() => handleSelectPatientForTriage(patient)}
                        className={`p-4 rounded-2xl border-2 transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-teal-50 border-teal-600 shadow-md scale-[1.01]'
                            : 'bg-slate-50 hover:bg-slate-100 border-slate-200/70'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1 mb-1">
                          <p className="font-black text-slate-900 text-xs truncate max-w-[150px]">
                            {patient.lastName} {patient.firstName}
                          </p>
                          <span className="text-[9px] font-bold text-slate-400 shrink-0">
                            {patient.time || 'Aujourd\'hui'}
                          </span>
                        </div>
                        <div className="mb-1.5">
                          <PaymentStatusBadge
                            status={resolvePaymentBadgeStatus({
                              item: patient,
                              paymentRequests,
                              patientIds: [patient.patientId, patient.dmeId, patient.id].filter(Boolean),
                              visiteId: patient.visite_id,
                            })}
                          />
                        </div>
                        <p className="text-[11px] text-slate-500 font-medium truncate">
                          {patient.motifLabel || patient.motif || 'Consultation'}
                        </p>
                        <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-200/60 text-[10px]">
                          <span className="text-teal-700 font-bold">{patient.speciality || patient.queueName || 'Médecine Générale'}</span>
                          <span className="font-mono text-slate-400">#{patient.patientId || patient.dmeId || patient.id}</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Center/Right Columns: Vitals Form & Priority Evaluation */}
            <div className="lg:col-span-2 space-y-6">
              {activePatient ? (
                <div className="bg-white p-6 md:p-8 rounded-[36px] border border-slate-200 shadow-xs space-y-8 animate-in zoom-in-95 duration-200">
                  
                  {/* Selected Patient Banner */}
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-2xl bg-teal-50/80 border border-teal-200">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[9px] font-black uppercase tracking-widest text-teal-700">Patient en cours d'évaluation</span>
                        <PaymentStatusBadge
                          status={resolvePaymentBadgeStatus({
                            item: activePatient,
                            paymentRequests,
                            patientIds: [activePatient.patientId, activePatient.dmeId, activePatient.id].filter(Boolean),
                            visiteId: activePatient.visite_id,
                          })}
                        />
                      </div>
                      <h3 className="text-xl font-black text-slate-900">{activePatient.lastName} {activePatient.firstName}</h3>
                      <p className="text-xs text-slate-600 font-medium">
                        {activePatient.age ? `${activePatient.age} ans • ` : ''}{activePatient.gender === 'F' ? 'Femme' : 'Homme'} • Motif: <strong>{activePatient.motifLabel || activePatient.motif}</strong>
                      </p>
                    </div>

                    {/* Calculated Priority Tag & Hospitalisation Action */}
                    <div className="text-right flex flex-col items-end gap-2">
                      <button
                        type="button"
                        onClick={() => setShowHospitalisationModal(true)}
                        className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-[11px] font-black uppercase tracking-wider flex items-center gap-1.5 shadow-sm cursor-pointer"
                      >
                        <BedDouble size={14} />
                        <span>Hospitaliser le patient</span>
                      </button>
                      <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Niveau de Priorité</span>
                      <div className={`px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-widest border transition-all ${
                        assessPriority.priority === 'critique' ? 'bg-rose-500 text-white border-transparent animate-pulse' :
                        assessPriority.priority === 'urgent' ? 'bg-amber-500 text-white border-transparent' :
                        'bg-emerald-100 text-emerald-800 border-emerald-300'
                      }`}>
                        {assessPriority.priority === 'critique' ? '🔴 Critique (Rouge)' :
                         assessPriority.priority === 'urgent' ? '🟡 Urgent (Orange)' :
                         '🟢 Normal (Vert)'}
                      </div>
                    </div>
                  </div>

                  {/* Priority Alerts Warning if any */}
                  {assessPriority.alerts.length > 0 && (
                    <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs space-y-1">
                      <p className="font-black uppercase tracking-wider flex items-center gap-1.5 text-rose-700">
                        <AlertTriangle size={16} />
                        <span>Signes d'alerte détectés par l'algorithme :</span>
                      </p>
                      <ul className="list-disc list-inside space-y-0.5 text-[11px] font-bold">
                        {assessPriority.alerts.map((alt, i) => (
                          <li key={i}>{alt}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Vitals Form Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5">
                    {/* Tension Artérielle */}
                    <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                        <Activity size={14} className="text-teal-600" />
                        <span>Tension Artérielle (mmHg)</span>
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          value={vitals.bpSys}
                          onChange={(e) => setVitals({ ...vitals, bpSys: parseInt(e.target.value) || 0 })}
                          placeholder="PAS"
                          className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-bold text-sm text-center"
                        />
                        <span className="text-slate-400 font-black">/</span>
                        <input
                          type="number"
                          value={vitals.bpDia}
                          onChange={(e) => setVitals({ ...vitals, bpDia: parseInt(e.target.value) || 0 })}
                          placeholder="PAD"
                          className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-bold text-sm text-center"
                        />
                      </div>
                      <p className="text-[10px] text-slate-400 font-medium mt-1">Ex: 120 / 80 mmHg</p>
                    </div>

                    {/* Pouls / Fréquence Cardiaque */}
                    <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                        <Heart size={14} className="text-rose-500" />
                        <span>Fréquence Cardiaque (bpm)</span>
                      </label>
                      <input
                        type="number"
                        value={vitals.heartRate}
                        onChange={(e) => setVitals({ ...vitals, heartRate: parseInt(e.target.value) || 0, pulse: parseInt(e.target.value) || 0 })}
                        className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-bold text-sm text-center"
                      />
                      <p className="text-[10px] text-slate-400 font-medium mt-1">Normal: 60 - 100 bpm</p>
                    </div>

                    {/* Température */}
                    <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                        <Thermometer size={14} className="text-amber-500" />
                        <span>Température (°C)</span>
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        value={vitals.temp}
                        onChange={(e) => setVitals({ ...vitals, temp: parseFloat(e.target.value) || 0 })}
                        className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-bold text-sm text-center"
                      />
                      <p className="text-[10px] text-slate-400 font-medium mt-1">Normal: 36.5 - 37.5 °C</p>
                    </div>

                    {/* Saturation SpO2 */}
                    <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                        <Droplets size={14} className="text-blue-500" />
                        <span>Saturation SpO2 (%)</span>
                      </label>
                      <input
                        type="number"
                        value={vitals.spo2}
                        onChange={(e) => setVitals({ ...vitals, spo2: parseInt(e.target.value) || 0 })}
                        className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-bold text-sm text-center"
                      />
                      <p className="text-[10px] text-slate-400 font-medium mt-1">Normal: &gt;= 95%</p>
                    </div>

                    {/* Fréquence Respiratoire */}
                    <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
                        Fréquence Resp. (/min)
                      </label>
                      <input
                        type="number"
                        value={vitals.respRate}
                        onChange={(e) => setVitals({ ...vitals, respRate: parseInt(e.target.value) || 0 })}
                        className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-bold text-sm text-center"
                      />
                      <p className="text-[10px] text-slate-400 font-medium mt-1">Normal: 12 - 20 /min</p>
                    </div>

                    {/* Glycémie */}
                    <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
                        Glycémie (g/L)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={vitals.bloodGlucose}
                        onChange={(e) => setVitals({ ...vitals, bloodGlucose: parseFloat(e.target.value) || 0 })}
                        className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-bold text-sm text-center"
                      />
                      <p className="text-[10px] text-slate-400 font-medium mt-1">À jeun: 0.70 - 1.10 g/L</p>
                    </div>

                    {/* Taille */}
                    <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
                        Taille (cm)
                      </label>
                      <input
                        type="number"
                        value={vitals.height}
                        onChange={(e) => setVitals({ ...vitals, height: parseInt(e.target.value) || 0 })}
                        className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-bold text-sm text-center"
                      />
                    </div>

                    {/* Poids */}
                    <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
                        Poids (kg)
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        value={vitals.weight}
                        onChange={(e) => setVitals({ ...vitals, weight: parseFloat(e.target.value) || 0 })}
                        className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-bold text-sm text-center"
                      />
                    </div>

                    {/* Calcul IMC Dynamique */}
                    <div className="p-4 rounded-2xl bg-teal-50 border border-teal-200 flex flex-col justify-between">
                      <span className="text-[10px] font-black text-teal-800 uppercase tracking-widest">IMC Dynamique</span>
                      <div>
                        <p className="text-2xl font-black text-teal-900">{computedBMI} <span className="text-xs font-normal">kg/m²</span></p>
                        <p className={`text-[10px] font-bold ${getBmiCategory(computedBMI).color}`}>
                          {getBmiCategory(computedBMI).label}
                        </p>
                      </div>
                    </div>

                    {/* Douleur (EVA 0-10) */}
                    <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
                        Douleur (EVA 0 - 10) : <strong className="text-slate-900">{vitals.painScore}/10</strong>
                      </label>
                      <input
                        type="range"
                        min="0"
                        max="10"
                        value={vitals.painScore}
                        onChange={(e) => setVitals({ ...vitals, painScore: parseInt(e.target.value) || 0 })}
                        className="w-full accent-teal-600"
                      />
                      <div className="flex justify-between text-[8px] text-slate-400 font-bold mt-1">
                        <span>0: Nulle</span>
                        <span>5: Modérée</span>
                        <span>10: Intense</span>
                      </div>
                    </div>

                    {/* Glasgow Score (3-15) */}
                    <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
                        Score Glasgow : <strong className="text-slate-900">{vitals.glasgowScore}/15</strong>
                      </label>
                      <input
                        type="range"
                        min="3"
                        max="15"
                        value={vitals.glasgowScore}
                        onChange={(e) => setVitals({ ...vitals, glasgowScore: parseInt(e.target.value) || 15 })}
                        className="w-full accent-teal-600"
                      />
                      <div className="flex justify-between text-[8px] text-slate-400 font-bold mt-1">
                        <span>3: Coma profond</span>
                        <span>15: Conscient</span>
                      </div>
                    </div>

                    {/* Tour de taille */}
                    <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
                        Tour de Taille (cm)
                      </label>
                      <input
                        type="number"
                        value={vitals.waistCirc}
                        onChange={(e) => setVitals({ ...vitals, waistCirc: parseInt(e.target.value) || 0 })}
                        className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-bold text-sm text-center"
                      />
                    </div>
                  </div>

                  {/* Clinical Notes */}
                  <div>
                    <label className="block text-xs font-black text-slate-700 uppercase tracking-wider mb-2">
                      Observations & Antécédents relevés au Triage
                    </label>
                    <textarea
                      rows={3}
                      value={vitals.clinicalNotes}
                      onChange={(e) => setVitals({ ...vitals, clinicalNotes: e.target.value })}
                      placeholder="Signes fonctionnels, allergies signalées, remarques pour le médecin..."
                      className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-medium text-slate-800 focus:bg-white focus:ring-2 focus:ring-teal-500"
                    />
                  </div>

                  {/* THE TRANSFER / CLOTURE ACTIONS */}
                  {(() => {
                    const isSoinOnly = activePatient && (
                      activePatient.motif === 'SOIN_INFIRMIER' ||
                      (activePatient.service || '').toLowerCase().includes('soin') ||
                      (activePatient.motifLabel || '').toLowerCase().includes('soin') ||
                      (activePatient.motifLabel || '').toLowerCase().includes('pansement') ||
                      (activePatient.motifLabel || '').toLowerCase().includes('injection') ||
                      (activePatient.serviceId || '').includes('INFIRMIER')
                    );

                    return isSoinOnly ? (
                      <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4">
                        <div className="text-xs text-slate-500">
                          <p className="text-amber-700 font-bold flex items-center gap-1.5">
                            <Syringe size={14} className="text-amber-600" />
                            Patient admis pour Soin Ambulatoire uniquement (Sans consultation médicale).
                          </p>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            Enregistrez les constantes et validez le soin pour clôturer sa prise en charge sans encombrer la file du médecin.
                          </p>
                        </div>

                        <div className="flex items-center gap-3 w-full sm:w-auto">
                          <button
                            disabled={isSubmitting}
                            onClick={handleCompleteNursingCareDirectly}
                            className="w-full sm:w-auto px-6 py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-lg hover:shadow-emerald-600/30 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                          >
                            <Check size={18} />
                            <span>{isSubmitting ? 'Clôture en cours...' : 'Valider & Clôturer le Soin'}</span>
                          </button>

                          <button
                            disabled={isSubmitting}
                            onClick={handleTransferToDoctor}
                            title="Orienter exceptionnellement vers le médecin si l'état du patient nécessite un avis médical"
                            className="px-4 py-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                          >
                            <span>Avis Médecin</span>
                            <ChevronRight size={16} />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4">
                        <div className="text-xs text-slate-500">
                          <p>✅ En cliquant sur <strong>« Valider le Triage »</strong>, le dossier est instantanément envoyé dans la file de consultation du médecin avec ses constantes.</p>
                        </div>

                        <button
                          disabled={isSubmitting}
                          onClick={handleTransferToDoctor}
                          className="w-full sm:w-auto px-8 py-4 bg-teal-600 hover:bg-teal-700 text-white rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-lg hover:shadow-teal-600/30 flex items-center justify-center gap-3 cursor-pointer disabled:opacity-50"
                        >
                          <CheckCircle size={18} />
                          <span>{isSubmitting ? 'Validation en cours...' : 'Valider le Triage'}</span>
                          <ChevronRight size={18} />
                        </button>
                      </div>
                    );
                  })()}

                </div>
              ) : (
                <div className="bg-white p-12 rounded-[36px] border border-slate-200 text-center py-24 space-y-4">
                  <div className="w-16 h-16 rounded-full bg-teal-50 text-teal-600 flex items-center justify-center mx-auto">
                    <Stethoscope size={32} />
                  </div>
                  <h3 className="text-lg font-black text-slate-800">Aucun patient sélectionné</h3>
                  <p className="text-xs text-slate-400 max-w-md mx-auto">
                    Sélectionnez un patient dans la file d'attente à gauche pour saisir ses constantes et effectuer l'évaluation de triage.
                  </p>
                </div>
              )}
            </div>

          </div>
        </div>
      )}

      {/* TAB 2 : SOINS & ACTES PRESCRITS - FILE D'EXÉCUTION EN RÉCEPTION STRICTE */}
      {activeTab === 'soins' && (
        <div className="space-y-6 animate-in fade-in duration-300">
          {/* Header Banner & KPIs */}
          <div className="bg-white dark:bg-slate-900 p-6 md:p-8 rounded-[32px] border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="p-4 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 rounded-3xl border border-indigo-200 dark:border-indigo-800">
                <Syringe size={28} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-400">
                    Espace Soins & Actes Médicaux
                  </span>
                  <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                    File Réception Seule
                  </span>
                </div>
                <h2 className="text-xl md:text-2xl font-black text-slate-900 dark:text-white mt-1">
                  Tab 2 : Soins & Actes Prescrits
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">
                  File d'attente d'exécution des actes infirmiers ordonnés par les médecins en Consultation et aux Urgences.
                </p>
              </div>
            </div>

            {/* Harmonized KPI Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 self-stretch lg:self-auto">
              <div 
                onClick={() => { setSoinStatusFilter('PENDING'); setSoinOriginFilter('ALL'); }}
                className={`p-3.5 rounded-2xl border text-center transition-all cursor-pointer ${
                  soinStatusFilter === 'PENDING' && soinOriginFilter === 'ALL'
                    ? 'bg-amber-500/10 border-amber-400 ring-2 ring-amber-400/20'
                    : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                }`}
              >
                <span className="block text-2xl font-black text-amber-600 dark:text-amber-400">{pendingActsCount}</span>
                <span className="block text-[9px] font-black uppercase tracking-wider text-slate-500">Total En Attente</span>
              </div>

              <div 
                onClick={() => { setSoinStatusFilter('PENDING'); setSoinOriginFilter('URGENCES'); }}
                className={`p-3.5 rounded-2xl border text-center transition-all cursor-pointer ${
                  soinOriginFilter === 'URGENCES'
                    ? 'bg-red-500/15 border-red-500 ring-2 ring-red-500/20'
                    : 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900/40 hover:bg-red-100/50'
                }`}
              >
                <span className="block text-2xl font-black text-red-600 dark:text-red-400 flex items-center justify-center gap-1">
                  {urgPendingCount}
                  {urgPendingCount > 0 && <span className="w-2 h-2 rounded-full bg-red-600 animate-ping inline-block" />}
                </span>
                <span className="block text-[9px] font-black uppercase tracking-wider text-red-700 dark:text-red-300">
                  🚨 URGENCES
                </span>
              </div>

              <div 
                onClick={() => { setSoinStatusFilter('PENDING'); setSoinOriginFilter('CONSULTATION'); }}
                className={`p-3.5 rounded-2xl border text-center transition-all cursor-pointer ${
                  soinOriginFilter === 'CONSULTATION'
                    ? 'bg-blue-500/15 border-blue-500 ring-2 ring-blue-500/20'
                    : 'bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900/40 hover:bg-blue-100/50'
                }`}
              >
                <span className="block text-2xl font-black text-blue-600 dark:text-blue-400">{consultPendingCount}</span>
                <span className="block text-[9px] font-black uppercase tracking-wider text-blue-700 dark:text-blue-300">
                  🩺 Consultation
                </span>
              </div>

              <div 
                onClick={() => { setSoinStatusFilter('PENDING'); setSoinOriginFilter('ACCUEIL'); }}
                className={`p-3.5 rounded-2xl border text-center transition-all cursor-pointer ${
                  soinOriginFilter === 'ACCUEIL'
                    ? 'bg-purple-500/15 border-purple-500 ring-2 ring-purple-500/20'
                    : 'bg-purple-50 dark:bg-purple-950/20 border-purple-200 dark:border-purple-900/40 hover:bg-purple-100/50'
                }`}
              >
                <span className="block text-2xl font-black text-purple-600 dark:text-purple-400">{accueilPendingCount}</span>
                <span className="block text-[9px] font-black uppercase tracking-wider text-purple-700 dark:text-purple-300">
                  🏥 Ambulatoire / Accueil
                </span>
              </div>

              <div 
                onClick={() => { setSoinStatusFilter('DONE'); setSoinOriginFilter('ALL'); }}
                className={`p-3.5 rounded-2xl border text-center transition-all cursor-pointer ${
                  soinStatusFilter === 'DONE'
                    ? 'bg-emerald-500/15 border-emerald-500 ring-2 ring-emerald-500/20'
                    : 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/40 hover:bg-emerald-100/50'
                }`}
              >
                <span className="block text-2xl font-black text-emerald-600 dark:text-emerald-400">{doneActsCount}</span>
                <span className="block text-[9px] font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-300">Exécutés</span>
              </div>
            </div>
          </div>

          {/* Filtering and Search Toolbar */}
          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
            {/* Filter Tabs */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Status tabs */}
              <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
                {[
                  { id: 'PENDING', label: `À Réaliser (${pendingActsCount})` },
                  { id: 'DONE', label: `Exécutés (${doneActsCount})` },
                  { id: 'ALL', label: `Tous (${nursingActs.length})` }
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setSoinStatusFilter(tab.id as any)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      soinStatusFilter === tab.id
                        ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Provenance Filter */}
              <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
                <button
                  onClick={() => setSoinOriginFilter('ALL')}
                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                    soinOriginFilter === 'ALL'
                      ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Toutes Provenances
                </button>
                <button
                  onClick={() => setSoinOriginFilter('URGENCES')}
                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-black uppercase transition-all flex items-center gap-1 cursor-pointer ${
                    soinOriginFilter === 'URGENCES'
                      ? 'bg-red-600 text-white shadow-xs'
                      : 'text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30'
                  }`}
                >
                  <Zap size={11} className="fill-current" />
                  <span>Urgences ({urgPendingCount})</span>
                </button>
                <button
                  onClick={() => setSoinOriginFilter('CONSULTATION')}
                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-black uppercase transition-all flex items-center gap-1 cursor-pointer ${
                    soinOriginFilter === 'CONSULTATION'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30'
                  }`}
                >
                  <Stethoscope size={11} />
                  <span>Consultation ({consultPendingCount})</span>
                </button>
                <button
                  onClick={() => setSoinOriginFilter('ACCUEIL')}
                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-black uppercase transition-all flex items-center gap-1 cursor-pointer ${
                    soinOriginFilter === 'ACCUEIL'
                      ? 'bg-purple-600 text-white shadow-xs'
                      : 'text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-950/30'
                  }`}
                >
                  <Syringe size={11} />
                  <span>Ambulatoire / Accueil ({accueilPendingCount})</span>
                </button>
              </div>
            </div>

            {/* Search Input */}
            <div className="relative flex-1 md:max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              <input
                type="text"
                value={soinSearchQuery}
                onChange={(e) => setSoinSearchQuery(e.target.value)}
                placeholder="Rechercher patient, acte, médecin..."
                className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>
          </div>

          {/* TABLE OF PRESCRIBED CARE ACTS */}
          <div className="bg-white dark:bg-slate-900 rounded-[32px] border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
            {(() => {
              const filteredList = nursingActs.filter((act) => {
                // Status filter
                if (soinStatusFilter === 'PENDING' && act.status === 'FAIT') return false;
                if (soinStatusFilter === 'DONE' && act.status !== 'FAIT') return false;

                // Provenance filter
                const isUrgence = act.source === 'URGENCES' || act.priority === 'HIGH';
                const isAccueil = act.source === 'ACCUEIL' || act.origin === 'ACCUEIL';
                const isConsult = !isUrgence && !isAccueil;

                if (soinOriginFilter === 'URGENCES' && !isUrgence) return false;
                if (soinOriginFilter === 'CONSULTATION' && !isConsult) return false;
                if (soinOriginFilter === 'ACCUEIL' && !isAccueil) return false;

                // Search query
                if (!soinSearchQuery.trim()) return true;
                const q = soinSearchQuery.toLowerCase();
                return (
                  (act.patientName && act.patientName.toLowerCase().includes(q)) ||
                  (act.patientId && String(act.patientId).toLowerCase().includes(q)) ||
                  (act.actType && act.actType.toLowerCase().includes(q)) ||
                  (act.prescribedBy && act.prescribedBy.toLowerCase().includes(q)) ||
                  (act.instructions && act.instructions.toLowerCase().includes(q)) ||
                  (act.source && act.source.toLowerCase().includes(q))
                );
              }).sort((a, b) => {
                // 1. Prioritize pending over done
                const isPendingA = a.status !== 'FAIT';
                const isPendingB = b.status !== 'FAIT';
                if (isPendingA && !isPendingB) return -1;
                if (!isPendingA && isPendingB) return 1;

                // 2. Automatically sort URGENCES requests to the top of the pending list!
                const isUrgA = a.source === 'URGENCES' || a.priority === 'HIGH';
                const isUrgB = b.source === 'URGENCES' || b.priority === 'HIGH';
                if (isUrgA && !isUrgB) return -1;
                if (!isUrgA && isUrgB) return 1;

                // 3. Chronological sorting (DESC) - newest first
                const timeA = new Date(a.createdAt || a.prescribedAt || 0).getTime();
                const timeB = new Date(b.createdAt || b.prescribedAt || 0).getTime();
                return timeB - timeA;
              });

              if (filteredList.length === 0) {
                return (
                  <div className="py-20 text-center space-y-3">
                    <div className="w-16 h-16 rounded-3xl bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center mx-auto">
                      <Syringe size={32} />
                    </div>
                    <h3 className="text-base font-black text-slate-800 dark:text-slate-200">
                      Aucun soin dans cette vue
                    </h3>
                    <p className="text-xs text-slate-400 max-w-sm mx-auto">
                      Les prescriptions ordonnées par les médecins en Consultation et aux Urgences s'affichent automatiquement ici.
                    </p>
                  </div>
                );
              }

              return (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-[10px] font-black uppercase tracking-wider text-slate-400">
                        <th className="py-4 px-5">Provenance</th>
                        <th className="py-4 px-4">Priorité / Délai</th>
                        <th className="py-4 px-4">Patient</th>
                        <th className="py-4 px-4">Soin & Consignes Médicales</th>
                        <th className="py-4 px-4">Prescripteur</th>
                        <th className="py-4 px-4">Date & Heure</th>
                        <th className="py-4 px-4">Statut</th>
                        <th className="py-4 px-5 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                      {filteredList.map((act) => {
                        const isUrg = act.source === 'URGENCES' || act.priority === 'HIGH';
                        const isDone = act.status === 'FAIT';
                        const isCritique = act.priority === 'CRITIQUE' || act.priority === 'critique';
                        const isUrgent = act.priority === 'URGENT' || act.priority === 'urgent' || act.priority === 'HIGH';

                        return (
                          <tr
                            key={act.id}
                            className={`hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors ${
                              isUrg && !isDone ? 'bg-red-500/5' : ''
                            }`}
                          >
                            {/* Provenance Column */}
                            <td className="py-4 px-5 whitespace-nowrap">
                              {isUrg ? (
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-red-600 text-white shadow-sm ring-2 ring-red-500/20">
                                  <Zap size={11} className="fill-current animate-pulse" />
                                  <span>URGENCES</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-blue-600 text-white shadow-sm">
                                  <Stethoscope size={11} />
                                  <span>CONSULTATION</span>
                                </span>
                              )}
                            </td>

                            {/* Priorité & Délai Column */}
                            <td className="py-4 px-4 whitespace-nowrap">
                              <div className="flex flex-col gap-1">
                                <span className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-black uppercase border w-fit ${
                                  isUrg || isCritique
                                    ? 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950/40 dark:text-rose-300'
                                    : isUrgent
                                    ? 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300'
                                    : 'bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/40 dark:text-teal-300'
                                }`}>
                                  {isUrg ? 'HAUTE (URGENCES)' : (act.priority || 'NORMAL')}
                                </span>
                                {act.timing && (
                                  <span className="text-[10px] text-slate-500 font-bold">
                                    {act.timing}
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* Patient Column */}
                            <td className="py-4 px-4">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="font-black text-slate-900 dark:text-white text-sm">
                                  {act.patientName}
                                </p>
                                <PaymentStatusBadge
                                  status={resolvePaymentBadgeStatus({
                                    item: act,
                                    paymentRequests,
                                    patientIds: [act.patientId, act.dmeId].filter(Boolean),
                                    visiteId: act.visite_id,
                                  })}
                                />
                              </div>
                              {act.locationBadge && (
                                <span className="inline-flex items-center gap-1 mt-0.5 mb-0.5 px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] font-black uppercase">
                                  🛏️ {act.locationBadge}
                                </span>
                              )}
                              <p className="text-[11px] text-slate-400 font-medium">
                                #{act.patientId || act.id?.slice(0, 6)}
                                {act.age ? ` • ${act.age} ans` : ''}
                                {act.gender ? ` • ${act.gender}` : ''}
                              </p>
                            </td>

                            {/* Acte / Soin Prescrit Column */}
                            <td className="py-4 px-4 max-w-xs">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <p className="font-black text-slate-900 dark:text-white text-xs flex items-center gap-1.5">
                                  <Syringe size={13} className="text-indigo-600 shrink-0" />
                                  <span>{act.actType}</span>
                                </p>
                                <PaymentStatusBadge
                                  status={resolvePaymentBadgeStatus({
                                    item: act,
                                    paymentRequests,
                                    patientIds: [act.patientId, act.dmeId].filter(Boolean),
                                    visiteId: act.visite_id,
                                  })}
                                />
                              </div>
                              {act.instructions ? (
                                <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium truncate mt-0.5" title={act.instructions}>
                                  {act.instructions}
                                </p>
                              ) : (
                                <span className="text-[10px] text-slate-400 italic">Protocole standard</span>
                              )}
                            </td>

                            {/* Prescripteur Column */}
                            <td className="py-4 px-4 whitespace-nowrap">
                              <p className="font-bold text-slate-800 dark:text-slate-200 text-xs">
                                {act.prescribedBy || (isUrg ? 'Dr. Urgentiste' : 'Dr. Traitant')}
                              </p>
                              <span className="text-[10px] text-slate-400">
                                {act.prescribedByRole || (isUrg ? 'Médecin Urgentiste' : 'Médecin')}
                              </span>
                            </td>

                            {/* Date & Heure Column */}
                            <td className="py-4 px-4 whitespace-nowrap">
                              <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
                                {act.date || '--'}
                              </p>
                              <p className="text-[10px] text-slate-400">
                                {act.time || '--'}
                              </p>
                            </td>

                            {/* Statut Column */}
                            <td className="py-4 px-4 whitespace-nowrap">
                              {isDone ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300">
                                  <CheckCircle2 size={11} />
                                  <span>FAIT</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-950/40 dark:text-amber-300">
                                  <Clock size={11} />
                                  <span>EN ATTENTE</span>
                                </span>
                              )}
                            </td>

                            {/* Action Column */}
                            <td className="py-4 px-5 text-right whitespace-nowrap">
                              {isDone ? (
                                <button
                                  type="button"
                                  onClick={() => setSelectedActForExecution(act)}
                                  className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold transition-all inline-flex items-center gap-1.5 cursor-pointer"
                                >
                                  <FileText size={13} />
                                  <span>Voir Rapport</span>
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={async () => {
                                    setSelectedActForExecution(act);
                                    setExecutionNotes(act.instructions ? `Soin réalisé selon consignes médicales.` : '');
                                    // Auto-clear from Accueil Salle d'Attente upon nurse taking charge
                                    try {
                                      const pid = act.patientId || act.patientDme;
                                      if (pid) {
                                        const qSnap = await getDocs(query(collection(db, 'service_queues'), where('patientId', '==', pid)));
                                        qSnap.docs.forEach(d => {
                                          const qData = d.data();
                                          if (belongsToTenant(qData, activeTenantId) && (qData.status === 'waiting' || qData.status === 'waiting_triage')) {
                                            updateDoc(d.ref, {
                                              takenInCharge: true,
                                              attente_module: 'EN_COURS',
                                              calledAt: new Date().toISOString()
                                            }).catch(() => {});
                                          }
                                        });
                                      }
                                    } catch (e) {
                                      console.error('Error clearing queue on act execution:', e);
                                    }
                                  }}
                                  className={`px-4 py-2 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all inline-flex items-center gap-1.5 shadow-sm cursor-pointer ${
                                    isUrg
                                      ? 'bg-red-600 hover:bg-red-700 ring-2 ring-red-500/20 animate-pulse'
                                      : 'bg-indigo-600 hover:bg-indigo-700'
                                  }`}
                                >
                                  <Syringe size={13} />
                                  <span>Exécuter le Soin</span>
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })()}
          </div>

          {/* EXECUTION MODAL / DRAWER */}
          {selectedActForExecution && (
            <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
              <div className="bg-white dark:bg-slate-900 rounded-[32px] border border-slate-200 dark:border-slate-800 max-w-2xl w-full p-6 md:p-8 space-y-6 shadow-2xl relative max-h-[90vh] overflow-y-auto">
                {/* Modal Top Bar */}
                <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* Provenance Badge */}
                      {selectedActForExecution.source === 'URGENCES' || selectedActForExecution.priority === 'HIGH' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-red-600 text-white shadow-xs">
                          <Zap size={10} className="fill-current" />
                          <span>URGENCES</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-blue-600 text-white shadow-xs">
                          <Stethoscope size={10} />
                          <span>CONSULTATION</span>
                        </span>
                      )}

                      <span className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full border ${
                        selectedActForExecution.status === 'FAIT'
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                          : 'bg-amber-100 text-amber-800 border-amber-300'
                      }`}>
                        {selectedActForExecution.status === 'FAIT' ? '✓ Soin Réalisé' : '● À Exécuter'}
                      </span>
                    </div>

                    <h3 className="text-xl font-black text-slate-900 dark:text-white mt-2">
                      {selectedActForExecution.actType}
                    </h3>
                    <p className="text-xs text-slate-500 font-bold mt-0.5">
                      Patient : <strong className="text-slate-800 dark:text-slate-200">{selectedActForExecution.patientName}</strong>
                      <span className="font-mono text-slate-400 ml-2">#{selectedActForExecution.patientId}</span>
                    </p>
                  </div>

                  <button
                    onClick={() => setSelectedActForExecution(null)}
                    className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                  >
                    <X size={20} />
                  </button>
                </div>

                {/* Prescription details box */}
                <div className="p-4 bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 rounded-2xl space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-black text-indigo-900 dark:text-indigo-300 flex items-center gap-1.5">
                      <Stethoscope size={15} />
                      Prescription Médicale
                    </span>
                    <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400">
                      {selectedActForExecution.date} à {selectedActForExecution.time}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase block">Prescrit par</span>
                      <strong className="text-slate-800 dark:text-slate-200">
                        {selectedActForExecution.prescribedBy || 'Médecin'}
                      </strong>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase block">Priorité & Échéance</span>
                      <strong className="text-slate-800 dark:text-slate-200 uppercase">
                        {selectedActForExecution.priority || 'NORMAL'} • {selectedActForExecution.timing || 'STAT'}
                      </strong>
                    </div>
                  </div>

                  {selectedActForExecution.instructions && (
                    <div className="pt-2 border-t border-indigo-100 dark:border-indigo-900/60">
                      <span className="text-[10px] font-black uppercase text-indigo-700 dark:text-indigo-400 block mb-1">
                        Consignes & Posologie du Médecin :
                      </span>
                      <p className="text-xs text-slate-800 dark:text-slate-200 font-medium whitespace-pre-wrap bg-white dark:bg-slate-900 p-3 rounded-xl border border-indigo-100 dark:border-indigo-900/80">
                        {selectedActForExecution.instructions}
                      </p>
                    </div>
                  )}
                </div>

                {/* Action form or completion record */}
                {selectedActForExecution.status !== 'FAIT' ? (
                  <div className="space-y-4 pt-2">
                    <h4 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
                      Observations et Rapport d'Exécution Infirmier
                    </h4>

                    <div>
                      <textarea
                        rows={4}
                        value={executionNotes}
                        onChange={(e) => setExecutionNotes(e.target.value)}
                        placeholder="Précisez le matériel utilisé, le site d'injection / pansement, la tolérance du patient, les constantes de contrôle..."
                        className="w-full p-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl text-xs font-medium text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20"
                      />
                    </div>

                    <div className="flex items-center gap-3 pt-2">
                      <button
                        type="button"
                        onClick={() => setSelectedActForExecution(null)}
                        className="px-5 py-3 rounded-2xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all cursor-pointer"
                      >
                        Annuler
                      </button>

                      <button
                        type="button"
                        disabled={isExecutingAct}
                        onClick={() => handleMarkActAsDone(selectedActForExecution)}
                        className="flex-1 py-3.5 px-6 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-xs font-black uppercase tracking-wider transition-all shadow-md flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                      >
                        {isExecutingAct ? (
                          <>
                            <RefreshCw size={14} className="animate-spin" />
                            <span>Validation du soin en cours...</span>
                          </>
                        ) : (
                          <>
                            <Check size={16} />
                            <span>Valider la Réalisation du Soin (Marquer FAIT)</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="p-5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-2xl space-y-3">
                    <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300 font-black text-xs uppercase tracking-wider">
                      <CheckCircle2 size={18} className="text-emerald-600 dark:text-emerald-400" />
                      <span>Rapport d'Exécution Médicale & Traçabilité</span>
                    </div>

                    <div className="text-xs text-slate-700 dark:text-slate-300 space-y-1">
                      <p>
                        <strong>Soignant exécutant :</strong> {selectedActForExecution.executedBy || 'Infirmier(ère)'}
                      </p>
                      <p>
                        <strong>Horodatage d'exécution :</strong> {selectedActForExecution.executionDate} à {selectedActForExecution.executionTime}
                      </p>
                    </div>

                    {selectedActForExecution.executionNotes && (
                      <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-emerald-100 dark:border-emerald-900/60 text-xs text-slate-800 dark:text-slate-200">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">
                          Observations cliniques infirmières :
                        </span>
                        <p className="font-medium whitespace-pre-wrap">{selectedActForExecution.executionNotes}</p>
                      </div>
                    )}

                    <div className="pt-2 text-right">
                      <button
                        onClick={() => setSelectedActForExecution(null)}
                        className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold cursor-pointer"
                      >
                        Fermer
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* HISTORIQUE TRIAGES TAB */}
      {activeTab === 'historique' && (
        <div className="bg-white p-6 md:p-8 rounded-[32px] border border-slate-200 shadow-xs space-y-6 animate-in fade-in duration-300">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-xl font-black text-slate-900">Historique & Registre des Triages</h3>
              <p className="text-xs text-slate-400 font-medium">Recherchez parmi l'ensemble des constantes et évaluations effectuées</p>
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto">
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800"
              />
              <div className="relative flex-1 sm:w-60">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                <input
                  type="text"
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  placeholder="Rechercher patient..."
                  className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
                />
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-[10px] font-black text-slate-400 uppercase tracking-wider">
                  <th className="pb-3">Heure & Date</th>
                  <th className="pb-3">Patient</th>
                  <th className="pb-3">TA (mmHg)</th>
                  <th className="pb-3">FC (bpm)</th>
                  <th className="pb-3">T° (°C)</th>
                  <th className="pb-3">SpO2 (%)</th>
                  <th className="pb-3">IMC</th>
                  <th className="pb-3">Priorité</th>
                  <th className="pb-3">Infirmier(ère)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {triageHistory
                  .filter(t => {
                    const matchesDate = !selectedDate || t.createdAt?.startsWith(selectedDate);
                    const matchesSearch = !historySearch.trim() || (t.patientName && t.patientName.toLowerCase().includes(historySearch.toLowerCase()));
                    return matchesDate && matchesSearch;
                  })
                  .map((t, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 font-mono text-[11px] text-slate-500">
                        {t.createdAt ? new Date(t.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '--'}
                      </td>
                      <td className="py-3 font-black text-slate-900">{t.patientName}</td>
                      <td className="py-3 font-bold text-slate-700">{t.vitals?.bp || (t.vitals?.bpSys ? `${t.vitals.bpSys}/${t.vitals.bpDia}` : '--')}</td>
                      <td className="py-3 font-bold text-slate-700">{t.vitals?.heartRate || t.vitals?.pulse || '--'}</td>
                      <td className="py-3 font-bold text-slate-700">{t.vitals?.temp || '--'}°</td>
                      <td className="py-3 font-bold text-slate-700">{t.vitals?.spo2 || '--'}%</td>
                      <td className="py-3 font-bold text-slate-700">{t.vitals?.bmi || '--'}</td>
                      <td className="py-3">
                        <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${
                          t.priority === 'critique' ? 'bg-rose-100 text-rose-700' :
                          t.priority === 'urgent' ? 'bg-amber-100 text-amber-700' :
                          'bg-emerald-100 text-emerald-700'
                        }`}>
                          {t.priority || 'normal'}
                        </span>
                      </td>
                      <td className="py-3 text-slate-500 font-medium">{t.nurseName || '--'}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SOINS HOSPITALISATION CHRONOLOGICAL TAB */}
      {activeTab === 'soins_hosp' && (
        <div className="bg-white rounded-[28px] border border-slate-200 p-6 shadow-xs space-y-5 animate-in fade-in duration-200">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
                <BedDouble size={20} className="text-indigo-600" />
                <span>Chronologie des Soins Hospitalisation</span>
              </h2>
              <p className="text-xs text-slate-500 font-medium">
                File infirmière triée chronologiquement par heure prévue — mise à jour en temps réel dans le dossier d'hospitalisation.
              </p>
            </div>
            <span className="px-3 py-1.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-black">
              {pendingHospActsCount} soin(s) à exécuter
            </span>
          </div>

          {hospitalisationActs.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs font-bold">
              Aucun soin d'hospitalisation planifié pour le moment.
            </div>
          ) : (
            <div className="space-y-3">
              {hospitalisationActs.map((act) => {
                const isDone = act.status === 'FAIT' || act.status === 'REALISE';
                const schedTime = act.scheduledTime || (act.scheduledAt ? new Date(act.scheduledAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : (act.createdAt ? new Date(act.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '--:--'));
                const schedDate = act.scheduledDate || act.date || '';
                const locationText = act.locationBadge || `${act.roomName || 'Chambre'} - ${act.bedName || 'Lit'}`;
                const execTime = act.heure_execution || act.executionTime || '--:--';
                const earlyMotif = act.earlyExecutionReason || act.motifAnticipation || '';
                const isEarlyPending = !isDone && isActBeforeScheduledTime(act);
                return (
                  <div
                    key={act.id}
                    className={`p-4 rounded-2xl border-2 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all ${
                      isDone
                        ? 'bg-emerald-50/40 border-emerald-200 opacity-85'
                        : 'bg-white border-indigo-100 hover:border-indigo-300 shadow-xs'
                    }`}
                  >
                    <div className="flex items-start sm:items-center gap-4 min-w-0">
                      <div className={`px-3.5 py-2.5 rounded-xl text-center shrink-0 border ${
                        isDone ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : 'bg-indigo-600 text-white border-indigo-600'
                      }`}>
                        <div className="text-sm font-black font-mono leading-none">[{schedTime}]</div>
                        {schedDate && <div className="text-[9px] font-bold opacity-85 mt-1">{schedDate}</div>}
                      </div>
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="px-2.5 py-0.5 bg-purple-100 text-purple-800 border border-purple-200 rounded-lg text-[10px] font-black uppercase tracking-wider">
                            {locationText}
                          </span>
                          <span className="px-2.5 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg text-[10px] font-black">
                            📅 Prévu pour : {schedTime}{schedDate ? ` (${schedDate})` : ''}
                          </span>
                          <span className="text-sm font-black text-slate-900 truncate">{act.patientName}</span>
                        </div>
                        <p className="text-xs font-bold text-slate-700">{act.actName || act.actType || act.type}</p>
                        {isDone && (
                          <p className="text-[11px] font-bold text-emerald-700">
                            ✓ Fait à {execTime} (Prévu à {schedTime}){earlyMotif ? ` - Motif: ${earlyMotif}` : ''} • par {act.executedBy || act.practitionerName || 'Infirmier(ère)'}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {!isDone ? (
                        <button
                          type="button"
                          disabled={isExecutingAct}
                          onClick={() => handleMarkActAsDone(act)}
                          title={isEarlyPending ? 'Exécution anticipée : un motif sera demandé' : 'Marquer ce soin comme exécuté'}
                          className={`px-4 py-2.5 disabled:opacity-50 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 shadow-sm cursor-pointer transition-colors ${
                            isEarlyPending
                              ? 'bg-amber-600 hover:bg-amber-700'
                              : 'bg-emerald-600 hover:bg-emerald-700'
                          }`}
                        >
                          <Check size={15} />
                          <span>Exécuter</span>
                        </button>
                      ) : (
                        <span className="px-3 py-1.5 bg-emerald-100 text-emerald-700 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center gap-1">
                          <CheckCircle2 size={13} /> Exécuté
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* HOSPITALISATION TAB */}
      {activeTab === 'hospitalisation' && (
        <Inpatient
          user={user}
          paymentRequests={paymentRequests}
          setPaymentRequests={setPaymentRequests}
          activeTab="dashboard"
          setActiveTab={() => {}}
          onBackToDashboard={onBackToDashboard}
          theme={theme}
        />
      )}
      </main>

      <UniversalHospitalisationModal
        isOpen={showHospitalisationModal}
        onClose={() => setShowHospitalisationModal(false)}
        patient={activePatient ? {
          id: activePatient.patientId || activePatient.dmeId || activePatient.id,
          firstName: activePatient.firstName,
          lastName: activePatient.lastName,
          age: activePatient.age,
          gender: activePatient.gender,
          dossier: activePatient.dmeId || activePatient.patientId || activePatient.id,
          motif: activePatient.motifLabel || activePatient.motif
        } : null}
        sourceModule="Soins Infirmiers"
        user={user}
        establishment={establishment}
        onSuccess={async () => {
          if (activePatient?.queueDocId || activePatient?.docId || activePatient?.id) {
            const qId = activePatient.queueDocId || activePatient.docId || activePatient.id;
            await updateDoc(doc(db, 'service_queues', qId), {
              status: 'hospitalized',
              attente_module: 'Hospitalisation',
              lastUpdated: new Date().toISOString()
            }).catch(() => {});
          }
          setActivePatient(null);
        }}
      />

      {/* MANDATORY EARLY EXECUTION CONFIRMATION MODAL */}
      {earlyExecModalAct && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-amber-200 dark:border-amber-800 max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                <Clock size={22} />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-black text-slate-900 dark:text-white">
                  Exécution anticipée du soin
                </h3>
                <p className="text-xs font-bold text-amber-700 dark:text-amber-400">
                  Vous exécutez ce soin avant l'heure prévue. Veuillez indiquer le motif de cette anticipation.
                </p>
              </div>
            </div>

            <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 text-xs space-y-1">
              <p className="font-black text-slate-800 dark:text-slate-100">
                {earlyExecModalAct.actName || earlyExecModalAct.actType || earlyExecModalAct.type}
              </p>
              <p className="font-bold text-slate-500">
                Patient : {earlyExecModalAct.patientName} • 📅 Prévu pour : {earlyExecModalAct.scheduledTime || '--:--'}
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-black uppercase tracking-wider text-slate-600 dark:text-slate-300">
                Motif de l'anticipation <span className="text-rose-500">*</span>
              </label>
              <textarea
                rows={3}
                value={earlyExecReason}
                onChange={(e) => setEarlyExecReason(e.target.value)}
                placeholder="Ex : Patient en douleur, demande expresse du médecin..."
                className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl text-xs font-semibold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500"
                autoFocus
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setEarlyExecModalAct(null);
                  setEarlyExecReason('');
                }}
                className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-black uppercase tracking-wider cursor-pointer"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={!earlyExecReason.trim() || isExecutingAct}
                onClick={() => {
                  const targetAct = earlyExecModalAct;
                  const reason = earlyExecReason.trim();
                  setEarlyExecModalAct(null);
                  setEarlyExecReason('');
                  handleMarkActAsDone(targetAct, reason);
                }}
                className="px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-black uppercase tracking-wider cursor-pointer flex items-center gap-1.5"
              >
                <Check size={14} />
                <span>Confirmer & Exécuter</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default SoinsInfirmiers;
