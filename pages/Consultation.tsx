import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  ClipboardList, Pill, TestTube, Brain, History, 
  LayoutDashboard, LogOut, ChevronRight, UserCheck,
  Activity, Thermometer, AlertTriangle, Calendar, BedDouble,
  TrendingUp, X, Check, MapPin, Clock, User, Heart, AlertCircle, FileText, RefreshCw, Loader2, Home, ArrowLeft,
  MoreVertical, Stethoscope, Syringe
} from 'lucide-react';
import WaitingRoom from './consultation/WaitingRoom';
import ActiveConsultation from './consultation/ActiveConsultation';
import HistoryTab from './consultation/History';
import Appointments from './consultation/Appointments';
import PatientDirectory from './consultation/PatientDirectory';
import VueGenerale from './consultation/VueGenerale';
import OrdonnanceTab from './consultation/OrdonnanceTab';
import ExamensTab from './consultation/ExamensTab';
import PrescriptionSoinsTab from './consultation/PrescriptionSoinsTab';
import DigitalPrescription from './tools/DigitalPrescription';
import LabExamRequestForm from '../components/LabExamRequestForm';
import ConsultationDashboard from '../components/ConsultationDashboard';
import { Breadcrumbs } from '../components/common/Breadcrumbs';
import { MedicalStatusBadge } from '../components/common/MedicalStatusBadge';
import { MicroHeader } from '../components/common/MicroHeader';
import { User as UserType, PaymentRequest } from '../types';
import { useHospitalServices, useSettings } from '../hooks/useSettings';
import { db, sanitizeData } from '../src/firebase';
import { collection, doc, setDoc, getDocs, query, where, updateDoc, onSnapshot, getDoc, writeBatch } from 'firebase/firestore';
import { getActiveTenantId, belongsToTenant, stampTenantData } from '../src/utils/tenant';

interface ConsultationProps {
  user?: UserType;
  waitingQueue?: any[];
  setWaitingQueue?: React.Dispatch<React.SetStateAction<any[]>>;
  paymentRequests?: PaymentRequest[];
  setPaymentRequests?: React.Dispatch<React.SetStateAction<PaymentRequest[]>>;
  activeMenu: 'dashboard' | 'WAITING_ROOM' | 'CONSULTATION' | 'HISTORY' | 'APPOINTMENTS' | 'PATIENT_DIRECTORY';
  setActiveMenu: (menu: 'dashboard' | 'WAITING_ROOM' | 'CONSULTATION' | 'HISTORY' | 'APPOINTMENTS' | 'PATIENT_DIRECTORY') => void;
  onBackToDashboard: () => void;
  theme?: 'light' | 'dark';
}

type ConsultationTab = 'GENERAL' | 'MEDICAL' | 'PRESCRIPTION' | 'EXAMS' | 'SOINS' | 'HISTORY';

const Consultation: React.FC<ConsultationProps> = ({ 
  user, 
  waitingQueue = [], 
  setWaitingQueue, 
  paymentRequests = [], 
  setPaymentRequests,
  activeMenu,
  setActiveMenu,
  onBackToDashboard,
  theme = 'light'
}) => {
  const [activePatient, setActivePatient] = useState<any | null>(null);
  const { establishment } = useSettings();
  const activeTenantId = useMemo(() => getActiveTenantId(user, establishment), [user, establishment]);
  const { services: hospitalServices } = useHospitalServices();
  const [selectedSpecialty, setSelectedSpecialty] = useState<string>('ALL');
  const isSendingPrescriptionRef = useRef(false);
  const isSendingExamsRef = useRef(false);
  const isClosingRef = useRef(false);

  const handleStartConsultationFromAppointment = (rdv: any) => {
    // 1. INSTANT OPTIMISTIC UI TRANSITION (Zero latency)
    const initialPatientData = {
      id: rdv.patientId || rdv.id,
      patientId: rdv.patientId || rdv.id,
      dmeId: rdv.patientId || rdv.id,
      lastName: rdv.lastName || rdv.patient || 'Patient',
      firstName: rdv.firstName || '',
      age: rdv.age || 30,
      gender: rdv.gender || 'M',
      vitals: rdv.vitals || {},
      motif: rdv.reason || rdv.motif || 'CONSULTATION',
      ...rdv
    };
    setActivePatient(initialPatientData);
    setConsultationTab('MEDICAL');
    setActiveMenu('CONSULTATION');

    // 2. BACKGROUND FIRESTORE SYNC (Non-blocking)
    (async () => {
      if (rdv.id) {
        try {
          await updateDoc(doc(db, 'appointments', rdv.id), { status: 'IN_PROGRESS' });
        } catch (err) {
          console.error("Error updating appointment status on start:", err);
        }
      }

      // Ensure patient exists in service_queues as in_consultation so they appear in waiting room / active queue
      try {
        const patientId = rdv.patientId || rdv.id;
        if (patientId) {
          const qSq = query(collection(db, 'service_queues'), where('patientId', '==', patientId));
          const sqSnap = await getDocs(qSq);
          if (!sqSnap.empty) {
            for (const d of sqSnap.docs) {
              await updateDoc(doc(db, 'service_queues', d.id), { status: 'in_consultation' });
            }
          } else {
            await setDoc(doc(collection(db, 'service_queues')), sanitizeData(stampTenantData({
              patientId: patientId,
              dmeId: patientId,
              firstName: rdv.firstName || '',
              lastName: rdv.lastName || rdv.patient || 'Patient',
              age: rdv.age || 30,
              gender: rdv.gender || 'M',
              time: rdv.time || new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
              motif: rdv.reason || rdv.motif || 'CONSULTATION',
              service: 'Médecine Générale',
              status: 'in_consultation',
              paymentStatus: 'SOLDE',
              priority: 'normal',
              createdAt: new Date().toISOString()
            }, user)));
          }
        }
      } catch (e) {
        console.error("Error syncing service_queues for appointment start:", e);
      }

      if (rdv.patientId) {
        try {
          const patientSnap = await getDoc(doc(db, 'patients', rdv.patientId));
          if (patientSnap.exists()) {
            setActivePatient(prev => ({ ...(prev || {}), id: patientSnap.id, ...patientSnap.data() }));
          }
        } catch (err) {
          console.error("Error fetching patient for appointment:", err);
        }
      }
    })();
  };

  // Listen to activePatient's actual record from Firestore in real-time
  useEffect(() => {
    const targetPatientId = activePatient?.patientId || activePatient?.id;
    if (!targetPatientId) return;
    
    try {
      const unsubscribe = onSnapshot(doc(db, 'patients', targetPatientId), (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          setActivePatient(prev => {
            if (!prev) return data;
            return {
              ...prev,
              ...data,
              vitals: { ...(data.vitals || {}), ...(prev.vitals || {}) }
            };
          });
        }
      });
      return () => unsubscribe();
    } catch (e) {
      console.error("Error listening to active patient:", e);
    }
  }, [activePatient?.id, activePatient?.patientId]);

  // Synchronize activePatient in real-time with waitingQueue updates (from nurse triage, reception, cashier)
  useEffect(() => {
    if (!activePatient) return;
    const currentInQueue = (waitingQueue || []).find((p: any) => 
      p.id === activePatient.id || 
      p.queueDocId === (activePatient as any).queueDocId || 
      (p.patientId && p.patientId === activePatient.id) ||
      (activePatient.patientId && (p.id === activePatient.patientId || p.patientId === activePatient.patientId))
    );
    if (currentInQueue) {
      setActivePatient(prev => {
        if (!prev) return currentInQueue;
        const mergedVitals = { ...(prev.vitals || {}), ...(currentInQueue.vitals || {}) };
        return {
          ...prev,
          ...currentInQueue,
          vitals: mergedVitals,
          status: prev.status || currentInQueue.status
        };
      });
    }
  }, [waitingQueue]);
  const [consultationTab, setConsultationTab] = useState<ConsultationTab>('GENERAL');
  const [planningPatient, setPlanningPatient] = useState<any | null>(null);

  // Popup overlay states
  const [showHospitalizationDialog, setShowHospitalizationDialog] = useState(false);
  const [showClosureDialog, setShowClosureDialog] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [isEndingSession, setIsEndingSession] = useState(false);
  const [isHospitalizing, setIsHospitalizing] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [compilationData, setCompilationData] = useState<any | null>(null);
  const [showReorientModal, setShowReorientModal] = useState(false);
  const [activePatientAppointments, setActivePatientAppointments] = useState<any[]>([]);
  const [isCurrentlyHospitalized, setIsCurrentlyHospitalized] = useState(false);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [hospitalizedPatients, setHospitalizedPatients] = useState<any[]>([]);
  const [beds, setBeds] = useState<any[]>([]);
  const [rooms, setRooms] = useState<any[]>([]);
  const [showDirectAdmissionModal, setShowDirectAdmissionModal] = useState(false);
  const [showActionsDropdown, setShowActionsDropdown] = useState(false);
  const actionsMenuRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (actionsMenuRef.current && !actionsMenuRef.current.contains(event.target as Node)) {
        setShowActionsDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Listen to rooms and beds for direct admission (Strict multi-tenant isolation)
  useEffect(() => {
    const unsubRooms = onSnapshot(collection(db, 'rooms'), (snap) => {
      setRooms(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(r => belongsToTenant(r, activeTenantId)));
    });
    const unsubBeds = onSnapshot(collection(db, 'beds'), (snap) => {
      setBeds(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(b => belongsToTenant(b, activeTenantId)));
    });
    return () => {
      unsubRooms();
      unsubBeds();
    };
  }, [activeTenantId]);

  // Listen to all appointments for dashboard (Strict multi-tenant isolation)
  useEffect(() => {
    const q = query(collection(db, 'appointments'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter(a => belongsToTenant(a, activeTenantId));
      setAppointments(list);
    });
    return () => unsubscribe();
  }, [activeTenantId]);

  // Listen to hospitalized patients from Inpatient module (Strict multi-tenant isolation)
  useEffect(() => {
    const q = query(collection(db, 'inpatient_records'), where('status', '==', 'admitted'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs
        .filter(doc => belongsToTenant(doc.data(), activeTenantId))
        .map(doc => {
          const data = doc.data();
          return {
            ...data,
            id: data.patientId || doc.id,
            lastName: data.patientName?.split(' ')[0] || 'Patient',
            firstName: data.patientName?.split(' ').slice(1).join(' ') || '',
            sourceModule: 'Inpatient',
            hospitalizedOrigin: 'Hospitalisation',
            priority: data.priority === 'Haute' ? 'critique' : (data.priority === 'Moyenne' ? 'urgent' : 'normal'),
            time: data.admissionDate ? new Date(data.admissionDate).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '--:--',
            motif: data.motif || 'Suivi Hospitalisation',
            status: 'waiting' // Treat as waiting for doctor visit
          };
        });
      setHospitalizedPatients(prev => {
        const otherHosp = prev.filter(p => p.sourceModule !== 'Inpatient');
        return [...otherHosp, ...list];
      });
    });
    return () => unsubscribe();
  }, [activeTenantId]);

  // Listen to hospitalized patients from Maternity module (Strict multi-tenant isolation)
  useEffect(() => {
    const q = query(collection(db, 'maternity_admissions'), where('status', '==', 'ADMITTED'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs
        .filter(doc => belongsToTenant(doc.data(), activeTenantId))
        .map(doc => {
          const data = doc.data();
          return {
            ...data,
            id: data.patientId || doc.id,
            lastName: data.patientName?.split(' ')[0] || 'Patiente',
            firstName: data.patientName?.split(' ').slice(1).join(' ') || '',
            sourceModule: 'Maternity',
            hospitalizedOrigin: 'Maternité',
            priority: 'normal',
            time: data.admittedAt ? new Date(data.admittedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '--:--',
            motif: data.stage || 'Suivi Maternité',
            status: 'waiting'
          };
        });
      setHospitalizedPatients(prev => {
        const otherHosp = prev.filter(p => p.sourceModule !== 'Maternity');
        return [...otherHosp, ...list];
      });
    });
    return () => unsubscribe();
  }, [activeTenantId]);

  // Listen to active patient's appointments
  useEffect(() => {
    if (activePatient?.id) {
      const q = query(collection(db, 'appointments'), where('patientId', '==', activePatient.id));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter(a => belongsToTenant(a, activeTenantId));
        // Sort by date/time
        list.sort((a: any, b: any) => {
          const dateCompare = (a.date || '').localeCompare(b.date || '');
          if (dateCompare !== 0) return dateCompare;
          return (a.time || '').localeCompare(b.time || '');
        });
        setActivePatientAppointments(list);
      });
      return () => unsubscribe();
    } else {
      setActivePatientAppointments([]);
    }
  }, [activePatient?.id, activeTenantId]);

  // Listen to active patient's hospitalization status
  useEffect(() => {
    if (activePatient?.id) {
      const q = query(
        collection(db, 'inpatient_records'),
        where('patientId', '==', activePatient.id),
        where('status', '==', 'admitted')
      );
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const matches = snapshot.docs.filter(d => belongsToTenant(d.data(), activeTenantId));
        setIsCurrentlyHospitalized(matches.length > 0);
      });
      return () => unsubscribe();
    } else {
      setIsCurrentlyHospitalized(false);
    }
  }, [activePatient?.id, activeTenantId]);

  const handleDischargeDirectly = async (patient: any) => {
    if (!patient) return;
    try {
      const today = new Date();
      const dateStr = today.toLocaleDateString('fr-FR');
      const timeStr = today.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
      const targetPid = patient.patientId || patient.id;
      const targetDmeId = patient.dmeId || targetPid;
      const isPaid = checkPatientIsPaid(patient);

      // 1. Mark status as 'consulted' in service_queues so they leave the doctor's queue entirely
      const targetIds = [patient.id, patient.patientId, patient.dmeId].filter(Boolean);
      for (const pid of targetIds) {
        const q = query(collection(db, 'service_queues'), where('patientId', '==', pid));
        const snaps = await getDocs(q);
        for (const dSnap of snaps.docs) {
          await updateDoc(doc(db, 'service_queues', dSnap.id), { 
            status: 'consulted',
            isClotured: true,
            consultedAt: today.toISOString()
          });
        }
      }
      if (patient.queueDocId) {
        try {
          await updateDoc(doc(db, 'service_queues', patient.queueDocId), { 
            status: 'consulted',
            isClotured: true,
            consultedAt: today.toISOString()
          });
        } catch (_) {}
      }

      // 2. Put into discharges_waiting so Reception can finalize their physical exit paper
      const dischargeId = `DIS-${targetPid}`;
      await setDoc(doc(db, 'discharges_waiting', dischargeId), sanitizeData(stampTenantData({
        id: dischargeId,
        docId: dischargeId,
        patientId: targetPid,
        dmeId: targetDmeId,
        name: `${patient.lastName || ''} ${patient.firstName || ''}`.trim(),
        patientName: `${patient.lastName || ''} ${patient.firstName || ''}`.trim(),
        admissionDate: patient.date || dateStr,
        department: patient.service || patient.queueName || 'Médecine Générale',
        status: 'READY_FOR_DISCHARGE',
        medicalClearance: true,
        hospitalizationClosed: true,
        financialClearance: isPaid,
        doctorName: user?.name || user?.username || 'Docteur',
        source: 'CONSULTATION',
        dischargedAt: today.toISOString(),
        createdAt: today.toISOString()
      }, user)), { merge: true });

      // 3. Trace in audit logs
      await setDoc(doc(collection(db, 'audit_logs')), {
        user: user?.name || user?.email || 'Docteur',
        role: 'DOCTOR',
        date: dateStr,
        time: timeStr,
        timestamp: today.toISOString(),
        action: `Libération du patient (Sortie directe domicile) - Patient : ${patient.lastName || ''} ${patient.firstName || ''}`,
        details: { patientId: targetPid, dischargeId },
        module: 'Consultation'
      });

      // 4. Update the local patients list
      if (setWaitingQueue) {
        setWaitingQueue(prev => prev.filter(p => p.id !== patient.id && p.patientId !== targetPid && p.queueDocId !== patient.queueDocId));
      }

      // 5. Clean active patient state and return
      setActivePatient(null);
      setActiveMenu('WAITING_ROOM');

      window.dispatchEvent(new CustomEvent('app-notification', { 
        detail: `✓ Patient libéré avec succès (Sortie Directe)` 
      }));
    } catch (e) {
      console.error("Discharge error: ", e);
    }
  };

  // Quick hospitalisation form states
  const [hospForm, setHospForm] = useState({
    motif: '',
    service: 'Médecine interne',
    priorite: 'Moyenne',
    duree: 3,
    observations: ''
  });

  // Keep hospitalisation form in sync with active patient
  useEffect(() => {
    if (activePatient) {
      setHospForm(prev => ({
        ...prev,
        motif: activePatient.motif || '',
        observations: ''
      }));
    }
  }, [activePatient]);

  // Robust verification of patient payment status including real-time cross-referencing with paymentRequests
  const checkPatientIsPaid = (patient: any): boolean => {
    if (!patient) return false;
    const pStatus = (patient.paymentStatus || '').toUpperCase();
    if (['SOLDE', 'PAID', 'PAYE', 'PAYÉ', 'VALIDE', 'EXONERE', 'ASSURANCE', 'PEC', 'ADVANCE', 'PARTIAL', 'TIERS_PAYANT', 'PRIS_EN_CHARGE'].includes(pStatus)) {
      return true;
    }
    const tStatus = (patient.ticketStatut || '').toUpperCase();
    if (['PAYE', 'PAYÉ', 'VALIDE', 'SOLDE', 'OK'].includes(tStatus)) {
      return true;
    }
    if (patient.hospitalizedOrigin || patient.isExempt || patient.fee === 0 || patient.emergencyBypass) {
      return true;
    }
    const pid = patient.id || patient.patientId || patient.dmeId;
    const pName = `${patient.lastName || ''} ${patient.firstName || ''}`.trim().toLowerCase();

    if (paymentRequests && paymentRequests.length > 0) {
      const hasPaid = paymentRequests.some(pr => {
        const matchesPatient = (pid && (pr.patientId === pid || (pr as any).dmeId === pid)) ||
          (pName.length > 3 && pr.patientName && pr.patientName.toLowerCase().includes(pName));
        const isHandled = pr.status === 'PAID' || pr.status === 'VALIDATED' || ((pr.amountPaid || 0) >= (pr.totalAmount || 0) && (pr.totalAmount || 0) > 0) || (pr.amountPaid || 0) > 0;
        return matchesPatient && isHandled;
      });
      if (hasPaid) return true;
    }
    return false;
  };

  // Handle starting a consultation with prominent warning system (no hard financial lock)
  const handleStartConsultation = (patient: any) => {
    // 1. INSTANT OPTIMISTIC UI TRANSITION (Zero latency - appears immediately)
    if (setWaitingQueue) {
      setWaitingQueue(prev => prev.map(p => 
        (p.id === patient.id || p.queueDocId === patient.queueDocId || (patient.patientId && p.patientId === patient.patientId))
          ? { ...p, status: 'in_consultation' }
          : p
      ));
    }
    setActivePatient({ ...patient, status: 'in_consultation' });
    setConsultationTab('MEDICAL'); // Default to MEDICAL (active clinical workspace) tab
    setActiveMenu('CONSULTATION');

    const isPaid = checkPatientIsPaid(patient);
    const isEmergency = patient.priority === 'critique' || patient.priority === 'urgent';

    if (!isPaid) {
      window.dispatchEvent(new CustomEvent('app-notification', {
        detail: `⚠️ Information Caisse : Le ticket d'admission de ${patient.lastName} ${patient.firstName} est en attente de règlement. Dossier ouvert pour prise en charge médicale.`
      }));
    }

    // 2. BACKGROUND FIRESTORE SYNC (Non-blocking async)
    (async () => {
      try {
        const today = new Date();
        // Sync updated status to Firestore
        const targetIds = [patient.id, patient.patientId, patient.dmeId].filter(Boolean);
        for (const pid of targetIds) {
          const q = query(collection(db, 'service_queues'), where('patientId', '==', pid));
          const snaps = await getDocs(q);
          for (const dSnap of snaps.docs) {
            await updateDoc(doc(db, 'service_queues', dSnap.id), { 
              status: 'in_consultation',
              calledAt: today.toISOString(),
              emergencyBypass: !isPaid && isEmergency
            });
          }

          const qDme = query(collection(db, 'service_queues'), where('dmeId', '==', pid));
          const snapsDme = await getDocs(qDme);
          for (const dSnap of snapsDme.docs) {
            await updateDoc(doc(db, 'service_queues', dSnap.id), { 
              status: 'in_consultation',
              calledAt: today.toISOString(),
              emergencyBypass: !isPaid && isEmergency
            });
          }
        }

        if (patient.queueDocId) {
          try {
            await updateDoc(doc(db, 'service_queues', patient.queueDocId), {
              status: 'in_consultation',
              calledAt: today.toISOString(),
              emergencyBypass: !isPaid && isEmergency
            });
          } catch (_) {}
        }
        
        // Trace action in audit_logs
        const actionText = (!isPaid && isEmergency)
          ? `⚡ Prise en charge d'URGENCE (Bypass Caisse / Dette) - Statut: En consultation`
          : `Appel Patient - Statut mis à jour: En consultation (in_consultation)`;

        await setDoc(doc(collection(db, 'audit_logs')), {
          user: user?.name || user?.email || 'Docteur',
          role: 'DOCTOR',
          date: today.toLocaleDateString('fr-FR'),
          time: today.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
          timestamp: today.toISOString(),
          action: actionText,
          details: { 
            patientId: patient.id, 
            name: `${patient.lastName} ${patient.firstName}`,
            emergencyOverride: !isPaid && isEmergency,
            priority: patient.priority || 'normal'
          },
          module: 'Consultation'
        });
      } catch(e) {
        console.error("Error setting service_queues in_consultation status:", e);
      }
    })();
  };

  const handleEndSession = async () => {
    if (activePatient) {
      if(isEndingSession) return;
      setIsEndingSession(true);
      try {
        const today = new Date();
        const dateStr = today.toLocaleDateString('fr-FR');
        const timeStr = today.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
        const targetPid = activePatient.patientId || activePatient.id;
        const targetDmeId = activePatient.dmeId || targetPid;
        const practitionerName = user?.name || user?.username || 'Docteur';
        const practitionerId = user?.id || '';
        const isPaid = checkPatientIsPaid(activePatient);

        // 1. Mark status as 'consulted' in service_queues across all aliases
        const targetIds = [activePatient.id, activePatient.patientId, activePatient.dmeId].filter(Boolean);
        for (const pid of targetIds) {
          const q = query(collection(db, 'service_queues'), where('patientId', '==', pid));
          const snaps = await getDocs(q);
          for (const dSnap of snaps.docs) {
            await updateDoc(doc(db, 'service_queues', dSnap.id), { 
              status: 'consulted',
              isClotured: true,
              practitionerId,
              practitionerName,
              consultedAt: today.toISOString()
            });
          }
        }
        if ((activePatient as any).queueDocId) {
          try {
            await updateDoc(doc(db, 'service_queues', (activePatient as any).queueDocId), {
              status: 'consulted',
              isClotured: true,
              practitionerId,
              practitionerName,
              consultedAt: today.toISOString()
            });
          } catch (_) {}
        }
        
        // 2. Push/Update discharges_waiting for Reception so patient appears in Sorties Administratives
        if (activePatient.status !== 'hospitalized') {
          const dischargeId = `DIS-${targetPid}`;
          await setDoc(doc(db, 'discharges_waiting', dischargeId), sanitizeData(stampTenantData({
            id: dischargeId,
            docId: dischargeId,
            patientId: targetPid,
            dmeId: targetDmeId,
            name: `${activePatient.lastName || ''} ${activePatient.firstName || ''}`.trim(),
            patientName: `${activePatient.lastName || ''} ${activePatient.firstName || ''}`.trim(),
            admissionDate: activePatient.date || dateStr,
            dischargeDate: today.toISOString(),
            status: 'waiting',
            medicalClearance: true,
            financialClearance: isPaid,
            hospitalizationClosed: true,
            doctorName: practitionerName,
            source: 'CONSULTATION',
            department: activePatient.service || activePatient.queueName || 'Consultation',
            createdAt: today.toISOString()
          }, user)), { merge: true });
        }

        // 3. Ensure a consultation record exists in 'consultations' and 'patient_history'
        const consultationId = activePatient.consultationId || `CONS-${Math.floor(Math.random() * 1000000)}`;
        const consRef = doc(db, 'consultations', consultationId);
        const consSnap = await getDoc(consRef);
        if (!consSnap.exists()) {
          const nowIso = today.toISOString();
          const consPayload = stampTenantData({
            id: consultationId,
            patientId: targetPid,
            patientName: `${activePatient.lastName || ''} ${activePatient.firstName || ''}`.trim(),
            patient: `${activePatient.lastName || ''} ${activePatient.firstName || ''}`.trim(),
            dmeId: targetDmeId,
            age: activePatient.age,
            gender: activePatient.gender,
            date: dateStr,
            time: timeStr,
            doctor: practitionerName,
            doctorName: practitionerName,
            doctorId: practitionerId,
            practitionerId,
            practitionerName,
            practitionerRole: user?.role || 'MEDECIN',
            motif: activePatient.motif || 'Consultation clinique',
            diagnosis: 'Consultation conclue',
            observation: 'Session terminée par le praticien',
            type: 'Consultation Générale',
            status: 'cloture',
            isClotured: true,
            cloturedAt: nowIso,
            createdAt: nowIso
          }, user);
          await setDoc(consRef, sanitizeData(consPayload));

          const historyId = `HIST-${targetPid}-${consultationId}`;
          await setDoc(doc(db, 'patient_history', historyId), sanitizeData(stampTenantData({
            id: historyId,
            patientId: targetPid,
            consultationId: consultationId,
            dmeId: targetDmeId,
            date: dateStr,
            time: timeStr,
            doctor: practitionerName,
            doctorId: practitionerId,
            practitionerId,
            practitionerName,
            motif: activePatient.motif || 'Consultation',
            diagnosis: 'Consultation conclue',
            status: 'cloture',
            isClotured: true,
            createdAt: nowIso
          }, user)));
        }

        window.dispatchEvent(new CustomEvent('app-notification', {
          detail: `Session terminée pour ${activePatient.firstName || ''} ${activePatient.lastName || ''}`
        }));
      } catch (e) {
        console.error("End session error: ", e);
      } finally {
        setIsEndingSession(false);
      }
    }
    if (setWaitingQueue && activePatient) {
      const pId = activePatient.id;
      const ptId = activePatient.patientId;
      const qDocId = (activePatient as any).queueDocId;
      setWaitingQueue(prev => prev.filter(p => 
        p.id !== pId && 
        p.patientId !== ptId && 
        (!qDocId || p.queueDocId !== qDocId)
      ));
    }
    setActivePatient(null);
    setActiveMenu('WAITING_ROOM');
  };

  // Callback to handle patient cancellation from wait room (Point 1.3)
  const handleCancelPatient = async (patient: any, reason: string) => {
    try {
      const today = new Date();
      const dateStr = today.toLocaleDateString('fr-FR');
      const timeStr = today.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

      // 1. Audit trace
      await setDoc(doc(collection(db, 'audit_logs')), {
        user: user?.name || user?.email || 'Médecin d\'Orientation',
        role: 'DOCTOR',
        date: dateStr,
        time: timeStr,
        timestamp: today.toISOString(),
        action: `Annulation de patient en file d'attente - ${patient.lastName} ${patient.firstName}`,
        details: { patientId: patient.id, reason },
        module: 'Consultation'
      });

      // 2. Local queue removal
      if (setWaitingQueue) {
        setWaitingQueue(prev => prev.filter(p => p.id !== patient.id));
      }

      // 3. Sync into Firestore waiting list
      const q = query(collection(db, 'service_queues'), where('patientId', '==', patient.id));
      const snaps = await getDocs(q);
      snaps.forEach(async (dSnap) => {
        await updateDoc(doc(db, 'service_queues', dSnap.id), { status: 'cancelled', cancelReason: reason });
      });

      window.dispatchEvent(new CustomEvent('app-notification', { 
        detail: `Consultation annulée pour ${patient.lastName} ${patient.firstName}.` 
      }));
    } catch (e) {
      console.error("Cancel patient error: ", e);
    }
  };

  // Callback to handle patient reorientation (Point 1.2)
  const handleReorientPatient = async (patient: any, targetService: string) => {
    try {
      const today = new Date();
      const dateStr = today.toLocaleDateString('fr-FR');
      const timeStr = today.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

      // 1. Trace audit
      await setDoc(doc(collection(db, 'audit_logs')), {
        user: user?.name || user?.email || 'Médecin d\'Orientation',
        role: 'DOCTOR',
        date: dateStr,
        time: timeStr,
        timestamp: today.toISOString(),
        action: `Réorientation du patient : ${patient.lastName} ${patient.firstName} vers ${targetService}`,
        details: { patientId: patient.id, targetService },
        module: 'Consultation'
      });

      // 2. Create target queue document with strict multi-tenant isolation
      const queueDocRef = doc(collection(db, 'service_queues'));
      await setDoc(queueDocRef, sanitizeData(stampTenantData({
        id: queueDocRef.id,
        patientId: patient.id,
        firstName: patient.firstName || '',
        lastName: patient.lastName || '',
        age: patient.age || 0,
        gender: patient.gender || 'M',
        time: timeStr,
        date: dateStr,
        motif: `Réorientation médicale de Consultation vers ${targetService}`,
        speciality: targetService,
        queueName: targetService,
        service: targetService,
        status: 'waiting',
        paymentStatus: 'PENDING',
        priority: (targetService === 'Emergency' || targetService === 'Urgences') ? 'critique' : 'normal',
        vitals: patient.vitals || {},
        createdAt: today.toISOString()
      }, user)));

      // 3. Update patient's service and motif in global queue so they land in the corresponding service's salle d'attente
      if (setWaitingQueue) {
        setWaitingQueue(prev => prev.map(p => {
          if (p.id === patient.id) {
            return {
              ...p,
              service: targetService,
              speciality: targetService,
              queueName: targetService,
              motif: `Réorientation médicale vers ${targetService}`
            };
          }
          return p;
        }));
      }

      // If activePatient is being reoriented, clean active session and direct back to WAITING_ROOM
      if (activePatient && activePatient.id === patient.id) {
        const q = query(collection(db, 'service_queues'), where('patientId', '==', patient.id), where('status', '!=', 'waiting'));
        const snaps = await getDocs(q);
        for (const dSnap of snaps.docs) {
          await updateDoc(doc(db, 'service_queues', dSnap.id), { status: 'reoriented' });
        }
        
        if (setWaitingQueue) {
          setWaitingQueue(prev => prev.filter(p => p.id !== patient.id));
        }
        setActivePatient(null);
        setActiveMenu('WAITING_ROOM');
      }

      window.dispatchEvent(new CustomEvent('app-notification', { 
        detail: `Réorientation médicale réussie de ${patient.lastName} ${patient.firstName} vers ${targetService}.` 
      }));
    } catch (e) {
      console.error("Reorientation error: ", e);
    }
  };

  // Submit clinical hospitalization request (Point 7)
  const handleConfirmHospitalization = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activePatient || isHospitalizing) return;

    // Prevent double hospitalization
    try {
      const q = query(
        collection(db, 'inpatient_records'),
        where('patientId', '==', activePatient.id),
        where('status', '==', 'admitted')
      );
      const snapshot = await getDocs(q);
      
      if (!snapshot.empty) {
        window.dispatchEvent(new CustomEvent('app-notification', { 
          detail: `Erreur: ${activePatient.lastName} ${activePatient.firstName} est déjà hospitalisé.` 
        }));
        setShowHospitalizationDialog(false);
        return;
      }
    } catch (err) {
      console.error("Error checking existing hospitalization:", err);
    }

    setIsHospitalizing(true);
    const today = new Date();
    try {
      const hospReqId = `HOSP-${Math.floor(Math.random() * 1000000)}`;

      await setDoc(doc(db, 'hospitalisation_requests', hospReqId), sanitizeData(stampTenantData({
        id: hospReqId,
        patientId: activePatient.id,
        patientName: `${activePatient.lastName} ${activePatient.firstName}`,
        age: activePatient.age,
        gender: activePatient.gender,
        date: today.toLocaleDateString('fr-FR'),
        time: today.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
        service: hospForm.service,
        priority: hospForm.priorite,
        dureePrevisionnelle: hospForm.duree,
        motif: hospForm.motif,
        observations: hospForm.observations,
        status: 'pending',
        requestedBy: user?.name || user?.username || 'Docteur',
        requestedById: user?.id || '',
        doctor: user?.name || user?.username || 'Docteur',
        doctorId: user?.id || '',
        practitionerId: user?.id || '',
        practitionerName: user?.name || user?.username || 'Docteur',
        practitionerRole: user?.role || 'MEDECIN',
        createdAt: today.toISOString()
      }, user)));

      await setDoc(doc(collection(db, 'audit_logs')), {
        user: user?.name || user?.email || 'Docteur',
        role: 'DOCTOR',
        date: today.toLocaleDateString('fr-FR'),
        time: today.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
        timestamp: today.toISOString(),
        action: `Demande d'hospitalisation initiée - Patient: ${activePatient.lastName} ${activePatient.firstName}`,
        details: { hospReqId, service: hospForm.service, priority: hospForm.priorite },
        module: 'Consultation'
      });

      // Clear queue status in service_queues
      const q = query(collection(db, 'service_queues'), where('patientId', '==', activePatient.id));
      const snaps = await getDocs(q);
      for (const dSnap of snaps.docs) {
        await updateDoc(doc(db, 'service_queues', dSnap.id), { status: 'hospitalized' });
      }

      if (setWaitingQueue) {
        setWaitingQueue(prev => prev.filter(p => p.id !== activePatient.id));
      }

      setActivePatient(null);
      setShowHospitalizationDialog(false);
      setActiveMenu('WAITING_ROOM');

      window.dispatchEvent(new CustomEvent('app-notification', { 
        detail: `Demande d'hospitalisation créée pour ${activePatient.lastName} ${activePatient.firstName} (${hospForm.service}).` 
      }));
    } catch (e) {
      console.error("Inpatient write error: ", e);
    } finally {
      setIsHospitalizing(false);
    }
  };

  // Mandatory Clinical Validation & Closure (Point 9 & Point 8)
  const handleSave = async (data: any) => {
    if (!activePatient) return;

    // Handle generic button click without arguments (forward event to ConsultationActive)
    if (!data || data.nativeEvent) {
      if(isSavingDraft) return;
      setIsSavingDraft(true);
      window.dispatchEvent(new CustomEvent('trigger-consultation-save-draft'));
      return;
    }

    const today = new Date();
    const dateStr = today.toLocaleDateString('fr-FR');
    const timeStr = today.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

    try {
      const consultationId = activePatient.consultationId || `CONS-${Math.floor(Math.random() * 1000000)}`;

      // 1. Create or update consultation in 'consultations'
      const consDocRef = doc(db, 'consultations', consultationId);
      const practitionerName = user?.name || user?.username || 'Dr. Sarr';
      const practitionerId = user?.id || '';
      const consultationPayload = {
        id: consultationId,
        patientId: activePatient.id,
        patient: `${activePatient.lastName} ${activePatient.firstName}`,
        patientName: `${activePatient.lastName} ${activePatient.firstName}`,
        patientIdRaw: activePatient.id,
        age: activePatient.age,
        gender: activePatient.gender,
        date: dateStr,
        time: timeStr,
        doctor: practitionerName,
        doctorName: practitionerName,
        doctorId: practitionerId,
        practitionerId: practitionerId,
        practitionerName: practitionerName,
        practitionerRole: user?.role || 'MEDECIN',
        doctorEmail: user?.email || '',
        motif: data.motif || '',
        diagnosis: data.hypotheses?.principal || 'Diagnostic non précisé',
        treatment: data.prescriptions?.map((p: any) => p.name).join(', ') || 'Néant',
        exams: data.examensDemandes?.map((e: any) => e.name).join(', ') || 'Néant',
        observation: data.observation || '',
        type: data.mode === 'gynecologie' ? 'Consultation Gynécologique' : data.mode === 'obstetrique' ? 'CPN / Maternité' : 'Consultation Générale',
        status: 'draft',
        createdAt: today.toISOString()
      };
      await setDoc(consDocRef, sanitizeData(stampTenantData(consultationPayload, user)));

      // Keep consultationId stored inside activePatient so subsequent edits/closures reference the same doc
      setActivePatient((prev: any) => prev ? { ...prev, consultationId } : null);

      // 2. Write/update in 'patient_history' collection
      const historyId = `HIST-${activePatient.id}-${consultationId}`;
      await setDoc(doc(db, 'patient_history', historyId), sanitizeData(stampTenantData({
        id: historyId,
        patientId: activePatient.id,
        consultationId: consultationId,
        date: dateStr,
        time: timeStr,
        doctor: practitionerName,
        doctorName: practitionerName,
        doctorId: practitionerId,
        practitionerId: practitionerId,
        practitionerName: practitionerName,
        practitionerRole: user?.role || 'MEDECIN',
        motif: data.motif || '',
        diagnosis: data.hypotheses?.principal || 'Diagnostic non précisé',
        treatment: data.prescriptions || [],
        exams: data.examensDemandes || [],
        observation: data.observation || '',
        status: 'draft',
        updatedAt: today.toISOString()
      }, user)));

      // 3. Create entry in 'audit_logs'
      await setDoc(doc(collection(db, 'audit_logs')), sanitizeData({
        user: user?.name || user?.email || 'Docteur',
        role: 'DOCTOR',
        date: dateStr,
        time: timeStr,
        timestamp: today.toISOString(),
        action: `Enregistrement de consultation (Brouillon) - Patient: ${activePatient.lastName} ${activePatient.firstName}`,
        details: { consultationId, diagnosis: data.hypotheses?.principal },
        module: 'Consultation'
      }));

      setCompilationData(data);

      window.dispatchEvent(new CustomEvent('app-notification', { 
        detail: `✓ Consultation enregistrée avec succès` 
      }));
    } catch (e) {
      console.error("Save draft failed: ", e);
      window.dispatchEvent(new CustomEvent('app-notification', { 
        detail: `✗ Échec de l'enregistrement de la consultation` 
      }));
    } finally {
      setIsSavingDraft(false);
    }
  };

  const handleCloturer = (data: any) => {
    if (!activePatient) return;

    if (!data || data.nativeEvent) {
      window.dispatchEvent(new CustomEvent('trigger-consultation-cloturer'));
      return;
    }

    const fallbackDiagnosis = data.hypotheses?.principal || "Diagnostic non précisé";
    const fallbackObservation = (data.observation && data.observation.trim().length >= 10)
      ? data.observation
      : `Consultation réalisée par ${user?.name || 'Dr. Sarr'}. Motif : ${data.motif || 'Non précisé'}.`;

    const validatedData = {
      ...data,
      hypotheses: {
        ...data.hypotheses,
        principal: fallbackDiagnosis
      },
      observation: fallbackObservation
    };

    setCompilationData(validatedData);
    setShowClosureDialog(true);
  };

  const handleConfirmClosure = async () => {
    if (isClosing) return;
    if (!compilationData || !activePatient) return;
    setIsClosing(true);

    const today = new Date();
    const dateStr = today.toLocaleDateString('fr-FR');
    const timeStr = today.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

    try {
      const consultationId = activePatient.consultationId || `CONS-${Math.floor(Math.random() * 1000000)}`;

      const batch = writeBatch(db);

      // 1. Write the Clinical Observation document into 'consultations' as clotured & assigned to this practitioner
      const practitionerName = user?.name || user?.username || 'Médecin';
      const practitionerId = user?.id || '';
      const targetPid = activePatient.patientId || activePatient.id;
      const targetDmeId = activePatient.dmeId || targetPid;
      const consDocRef = doc(db, 'consultations', consultationId);
      const consultationPayload = {
        id: consultationId,
        patientId: targetPid,
        patientName: `${activePatient.lastName} ${activePatient.firstName}`,
        patient: `${activePatient.lastName} ${activePatient.firstName}`,
        patientIdRaw: targetPid,
        dmeId: targetDmeId,
        age: activePatient.age,
        gender: activePatient.gender,
        date: dateStr,
        time: timeStr,
        doctor: practitionerName,
        doctorName: practitionerName,
        doctorId: practitionerId,
        practitionerId: practitionerId,
        practitionerName: practitionerName,
        practitionerRole: user?.role || 'MEDECIN',
        doctorEmail: user?.email || '',
        motif: compilationData.motif,
        diagnosis: compilationData.hypotheses?.principal || 'Diagnostic non précisé',
        treatment: compilationData.prescriptions?.map((p: any) => p.name).join(', ') || 'Néant',
        exams: compilationData.examensDemandes?.map((e: any) => e.name).join(', ') || 'Néant',
        observation: compilationData.observation,
        type: compilationData.mode === 'gynecologie' ? 'Consultation Gynécologique' : compilationData.mode === 'obstetrique' ? 'CPN / Maternité' : 'Consultation Générale',
        status: 'cloture',
        isClotured: true,
        cloturedAt: today.toISOString(),
        cloturedBy: practitionerName,
        cloturedById: practitionerId,
        createdAt: today.toISOString()
      };
      batch.set(consDocRef, sanitizeData(stampTenantData(consultationPayload, user)));

      // Write to patient_history collection with status 'cloture'
      const historyId = `HIST-${targetPid}-${consultationId}`;
      batch.set(doc(db, 'patient_history', historyId), sanitizeData(stampTenantData({
        id: historyId,
        patientId: targetPid,
        consultationId: consultationId,
        dmeId: targetDmeId,
        date: dateStr,
        time: timeStr,
        doctor: practitionerName,
        doctorId: practitionerId,
        practitionerId: practitionerId,
        practitionerName: practitionerName,
        motif: compilationData.motif || '',
        diagnosis: compilationData.hypotheses?.principal || 'Diagnostic non précisé',
        treatment: compilationData.prescriptions || [],
        exams: compilationData.examensDemandes || [],
        observation: compilationData.observation || '',
        status: 'cloture',
        isClotured: true,
        cloturedAt: today.toISOString(),
        updatedAt: today.toISOString()
      }, user)));

      // 2. Create the Pharmacy Request document in 'pending_prescriptions'
      if (compilationData.prescriptions && compilationData.prescriptions.length > 0) {
        const pharmDocRef = doc(collection(db, 'pending_prescriptions'));
        batch.set(pharmDocRef, sanitizeData(stampTenantData({
          id: `ORD-${Math.floor(Math.random() * 1000000)}`,
          patientId: activePatient.id,
          patient: `${activePatient.lastName} ${activePatient.firstName}`,
          doctor: practitionerName,
          doctorName: practitionerName,
          doctorId: practitionerId,
          prescriberId: practitionerId,
          prescriberName: practitionerName,
          practitionerId: practitionerId,
          practitionerName: practitionerName,
          practitionerRole: user?.role || 'MEDECIN',
          date: dateStr,
          items: compilationData.prescriptions.map((p: any) => ({
            name: p.name,
            posology: p.posologie,
            price: p.price || 1500,
            practitionerId: practitionerId,
            practitionerName: practitionerName
          })),
          createdAt: today.toISOString(),
          status: 'pending'
        }, user)));
      }

      // 3. Create the Laboratory Exam Request document in 'lab_requests'
      if (compilationData.examensDemandes && compilationData.examensDemandes.length > 0) {
        const labDocRef = doc(collection(db, 'lab_requests'));
        batch.set(labDocRef, sanitizeData(stampTenantData({
          id: `LAB-${Math.floor(Math.random() * 1000000)}`,
          patientId: activePatient.id,
          patientName: `${activePatient.lastName} ${activePatient.firstName}`,
          date: dateStr,
          time: timeStr,
          doctor: practitionerName,
          doctorName: practitionerName,
          doctorId: practitionerId,
          prescriberId: practitionerId,
          prescriberName: practitionerName,
          practitionerId: practitionerId,
          practitionerName: practitionerName,
          practitionerRole: user?.role || 'MEDECIN',
          status: 'pending',
          exams: compilationData.examensDemandes.map((e: any) => ({
            name: e.name,
            urgent: e.urgent || false,
            practitionerId: practitionerId,
            practitionerName: practitionerName
          })),
          createdAt: today.toISOString()
        }, user)));
      }

      // 4. Update appointment status to COMPLETED asynchronously (offline-first, non-blocking)
      const todayISO = today.toISOString().split('T')[0];
      const qApp = query(
        collection(db, 'appointments'), 
        where('patientId', '==', activePatient.id),
        where('date', '==', todayISO),
        where('status', 'in', ['PENDING', 'IN_PROGRESS'])
      );
      getDocs(qApp)
        .then(appSnaps => {
          appSnaps.docs.forEach(appDoc => {
            updateDoc(doc(db, 'appointments', appDoc.id), sanitizeData({
              status: 'COMPLETED',
              practitionerId: practitionerId,
              practitionerName: practitionerName,
              cloturedAt: today.toISOString()
            })).catch(() => {});
          });
        })
        .catch(() => {});

      // 5. Generate the Cashier Payment Invoice (PaymentRequest) with Strict Double-Billing Prevention
      const invoiceItems: any[] = [];
      
      // Check if consultation fee was already paid (e.g. at Reception / Accueil ticket)
      const todayStr = today.toISOString().split('T')[0];
      const ticketAlreadyPaidAtAccueil = activePatient.ticketStatut === 'PAYE' || activePatient.ticketStatut === 'PAYÉ' || activePatient.ticketStatut === 'VALIDE';
      const hasPaidConsultationInDB = paymentRequests?.some(pr => 
        pr.patientId === activePatient.id && 
        pr.status === 'PAID' && 
        pr.createdAt?.startsWith(todayStr) &&
        (pr.items?.some(item => (item.name || '').toLowerCase().includes('consultation') || (item.name || '').toLowerCase().includes('frais d\'orientation') || (item.name || '').toLowerCase().includes('ticket')))
      );

      const isConsultationPaid = ticketAlreadyPaidAtAccueil || hasPaidConsultationInDB;

      if (!isConsultationPaid) {
        invoiceItems.push({ id: 'item-consult', name: 'Consultation Médicale Clinique', quantity: 1, unitPrice: 10000, totalPrice: 10000, status: 'PENDING' });
      }
      
      // Check existing payment requests for this patient today to avoid double billing transmitted prescriptions and exams
      const existingPendingOrPaidItems = new Set<string>();
      (paymentRequests || [])
        .filter(pr => pr.patientId === activePatient.id && pr.createdAt?.startsWith(todayStr))
        .forEach(pr => {
          pr.items?.forEach(it => {
            if (it.name) {
              existingPendingOrPaidItems.add(it.name.toLowerCase().trim());
            }
          });
        });

      let billCount = 1;
      const seenItemNamesInThisInvoice = new Set<string>();
      
      if (compilationData.prescriptions) {
        compilationData.prescriptions.forEach((p: any) => {
          if (p.status === 'PAID' || p.isPaid) return; // Strict filter on paid prescriptions
          const cleanName = (p.name || '').trim();
          if (!cleanName) return;
          const invoiceItemName = `Ordonnance : ${cleanName}`;
          const normalizedKey = invoiceItemName.toLowerCase();
          
          if (seenItemNamesInThisInvoice.has(normalizedKey) || existingPendingOrPaidItems.has(normalizedKey) || existingPendingOrPaidItems.has(cleanName.toLowerCase())) {
            return; // Already added or already requested via transmit
          }
          seenItemNamesInThisInvoice.add(normalizedKey);

          const itemPrice = p.price || 1500;
          invoiceItems.push({
            id: `item-med-${billCount++}`,
            name: invoiceItemName,
            quantity: 1,
            unitPrice: itemPrice,
            totalPrice: itemPrice,
            status: 'PENDING'
          });
        });
      }
      
      if (compilationData.examensDemandes) {
        compilationData.examensDemandes.forEach((e: any) => {
          if (e.status === 'PAID' || e.isPaid) return; // Strict filter on paid exams
          const cleanName = (e.name || '').trim();
          if (!cleanName) return;
          const invoiceItemName = `Examen Lab : ${cleanName}`;
          const normalizedKey = invoiceItemName.toLowerCase();

          if (seenItemNamesInThisInvoice.has(normalizedKey) || existingPendingOrPaidItems.has(normalizedKey) || existingPendingOrPaidItems.has(cleanName.toLowerCase())) {
            return; // Already added or already requested via transmit
          }
          seenItemNamesInThisInvoice.add(normalizedKey);

          const itemPrice = e.price || 2500;
          invoiceItems.push({
            id: `item-exam-${billCount++}`,
            name: invoiceItemName,
            quantity: 1,
            unitPrice: itemPrice,
            totalPrice: itemPrice,
            status: 'PENDING'
          });
        });
      }

      let totalAmount = 0;
      let invoiceId: string | undefined = undefined;

      // Also assign any existing admission/consultation payment requests for this patient today to the practitioner who closed it
      (paymentRequests || [])
        .filter(pr => pr.patientId === activePatient.id && pr.createdAt?.startsWith(todayStr))
        .forEach(pr => {
          batch.set(doc(db, 'payment_requests', pr.id), sanitizeData({
            practitionerId: practitionerId,
            practitionerName: practitionerName,
            practitionerRole: user?.role || 'MEDECIN',
            doctorId: practitionerId,
            doctor: practitionerName,
            isClotured: true,
            cloturedAt: today.toISOString(),
            cloturedBy: practitionerName
          }), { merge: true });
        });

      if (invoiceItems.length > 0) {
        totalAmount = invoiceItems.reduce((sum, item) => sum + item.totalPrice, 0);
        if (totalAmount > 0) {
          invoiceId = `PR-${Math.floor(Math.random() * 1000000)}`;
          const newPaymentRequest: any = {
            id: invoiceId,
            patientId: activePatient.id,
            patientName: `${activePatient.lastName} ${activePatient.firstName}`,
            requestingService: 'Consultation',
            sourceModule: 'Consultation',
            type: 'CONSULTATION',
            items: invoiceItems,
            totalAmount: totalAmount,
            amountPaid: 0,
            status: 'PENDING',
            createdAt: today.toISOString(),
            createdBy: practitionerName,
            practitionerId: practitionerId,
            practitionerName: practitionerName,
            practitionerRole: user?.role || 'MEDECIN',
            doctorId: practitionerId,
            doctor: practitionerName,
            isClotured: true,
            cloturedAt: today.toISOString()
          };

          batch.set(doc(db, 'payment_requests', invoiceId), sanitizeData(stampTenantData(newPaymentRequest, user)));
        }
      }

      // 6. Trace the final audit trail
      batch.set(doc(collection(db, 'audit_logs')), sanitizeData({
        user: practitionerName,
        role: 'DOCTOR',
        date: dateStr,
        time: timeStr,
        timestamp: today.toISOString(),
        action: `Clôture de consultation - Patient archivé : ${activePatient.lastName} ${activePatient.firstName}`,
        details: { consultationId, invoiceId, totalAmount, diagnosis: compilationData.hypotheses.principal, practitionerId },
        module: 'Consultation'
      }));

      // 7. Route patient to Reception's Sorties Administratives (discharges_waiting)
      const dischargeId = `DIS-${targetPid}`;
      const isPatientPaid = checkPatientIsPaid(activePatient);
      const dischargeDocRef = doc(db, 'discharges_waiting', dischargeId);
      batch.set(dischargeDocRef, sanitizeData(stampTenantData({
        id: dischargeId,
        docId: dischargeId,
        patientId: targetPid,
        dmeId: targetDmeId,
        name: `${activePatient.lastName || ''} ${activePatient.firstName || ''}`.trim(),
        patientName: `${activePatient.lastName || ''} ${activePatient.firstName || ''}`.trim(),
        department: activePatient.service || activePatient.queueName || 'Consultation',
        admissionDate: activePatient.date || dateStr,
        dischargeDate: today.toISOString(),
        status: 'waiting',
        medicalClearance: true,
        hospitalizationClosed: true,
        financialClearance: isPatientPaid,
        doctorName: practitionerName,
        source: 'CONSULTATION',
        consultationId: consultationId,
        createdAt: today.toISOString()
      }, user)), { merge: true });

      // 8. Optimistic Offline-First UI Update (0ms delay)
      const targetPatientId = activePatient.id;
      const targetQueueDocId = (activePatient as any).queueDocId;
      if (targetQueueDocId) {
        batch.set(doc(db, 'service_queues', targetQueueDocId), sanitizeData({
          status: 'ready_for_discharge',
          isClotured: true,
          practitionerId: practitionerId,
          practitionerName: practitionerName,
          cloturedAt: today.toISOString()
        }), { merge: true });
      }

      setWaitingQueue((prev: any[]) => prev.map(p =>
        (p.id === targetPatientId || p.patientId === targetPatientId)
          ? { ...p, status: 'ready_for_discharge', isClotured: true, practitionerId, practitionerName }
          : p
      ));
      setActivePatient(prev => prev ? { ...prev, status: 'ready_for_discharge', isClotured: true } : null);
      setConsultationTab('GENERAL');
      setShowClosureDialog(false);
      setIsClosing(false);
      setCompilationData(null);

      window.dispatchEvent(new CustomEvent('app-notification', { 
        detail: { message: '✓ Consultation clôturée et assignée au praticien avec succès', type: 'success' }
      }));

      // Commit local IndexedDB batch immediately & update remaining queue entries in background
      batch.commit().catch(err => console.warn("Background batch commit warning:", err));
      getDocs(query(collection(db, 'service_queues'), where('patientId', '==', targetPatientId)))
        .then(snaps => {
          snaps.docs.forEach(dSnap => {
            updateDoc(doc(db, 'service_queues', dSnap.id), sanitizeData({
              status: 'ready_for_discharge',
              isClotured: true,
              practitionerId: practitionerId,
              practitionerName: practitionerName,
              cloturedAt: today.toISOString()
            })).catch(() => {});
          });
        })
        .catch(() => {});
    } catch (e) {
      setIsClosing(false);
      console.error("Closure finalize failed: ", e);
      window.dispatchEvent(new CustomEvent('app-notification', { 
        detail: { message: "✗ Échec de la clôture de la consultation.", type: 'error' }
      }));
    }
  };

  const handleGenerateObservation = () => {
    console.log('Generating medical observation...');
  };

  const handleSendPrescription = async (data: any) => {
    if (!activePatient) return;
    if (isSendingPrescriptionRef.current) return;
    isSendingPrescriptionRef.current = true;
    setTimeout(() => { isSendingPrescriptionRef.current = false; }, 2000);

    if (!data || data.nativeEvent) {
      window.dispatchEvent(new CustomEvent('trigger-consultation-send-prescription'));
      return;
    }

    const rawPrescriptions = data.prescriptions || [];
    // Deduplicate medications by normalized name
    const prescrMap = new Map<string, any>();
    rawPrescriptions.forEach((p: any) => {
      const key = (p.name || '').toLowerCase().trim();
      if (key && !prescrMap.has(key)) {
        prescrMap.set(key, p);
      }
    });
    const prescriptions = Array.from(prescrMap.values());

    if (prescriptions.length === 0) {
      alert("⚠️ Erreur : Aucun médicament prescrit.");
      return;
    }

    const today = new Date();
    const dateStr = today.toLocaleDateString('fr-FR');
    const timeStr = today.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

    try {
      const consultationId = activePatient.consultationId || `CONS-${Math.floor(Math.random() * 1000000)}`;
      const prescriptionId = `ORD-${Math.floor(Math.random() * 1000000)}`;

      // 1. Create entry in pending_prescriptions with strict multi-tenant isolation
      await setDoc(doc(db, 'pending_prescriptions', prescriptionId), sanitizeData(stampTenantData({
        id: prescriptionId,
        patientId: activePatient.id,
        patient: `${activePatient.lastName} ${activePatient.firstName}`,
        doctor: user?.name || user?.username || 'Dr. Sarr',
        doctorName: user?.name || user?.username || 'Dr. Sarr',
        doctorId: user?.id || '',
        prescriberId: user?.id || '',
        prescriberName: user?.name || user?.username || 'Dr. Sarr',
        practitionerId: user?.id || '',
        practitionerName: user?.name || user?.username || 'Dr. Sarr',
        practitionerRole: user?.role || 'MEDECIN',
        date: dateStr,
        items: prescriptions.map((p: any) => ({
          name: p.name,
          posology: p.posologie || p.dosage || 'Selon prescription',
          price: p.price || 1500,
          practitionerId: user?.id || '',
          practitionerName: user?.name || user?.username || 'Dr. Sarr'
        })),
        createdAt: today.toISOString(),
        status: 'pending'
      }, user)));

      // 2. Route Payment Request to Caisse
      const invoiceItems = prescriptions.map((p: any, idx: number) => {
        const itemPrice = p.price || 1500;
        return {
          id: `item-med-${prescriptionId}-${idx}`,
          name: `Ordonnance : ${p.name}`,
          quantity: p.quantity || 1,
          unitPrice: itemPrice,
          totalPrice: (p.quantity || 1) * itemPrice,
          practitionerId: user?.id || '',
          practitionerName: user?.name || user?.username || 'Dr. Sarr',
          practitionerRole: user?.role || 'MEDECIN'
        };
      });
      const totalAmount = invoiceItems.reduce((sum: number, p: any) => sum + p.totalPrice, 0);
      const invoiceId = `PR-${Math.floor(Math.random() * 1000000)}`;
      await setDoc(doc(db, 'payment_requests', invoiceId), sanitizeData(stampTenantData({
        id: invoiceId,
        patientId: activePatient.id,
        patientName: `${activePatient.lastName} ${activePatient.firstName}`,
        requestingService: 'Consultation',
        sourceModule: 'Consultation',
        type: 'PHARMACIE',
        items: invoiceItems,
        totalAmount: totalAmount,
        amountPaid: 0,
        status: 'PENDING',
        createdAt: today.toISOString(),
        createdBy: user?.name || user?.username || 'Dr. Sarr',
        createdById: user?.id || '',
        practitionerId: user?.id || '',
        practitionerName: user?.name || user?.username || 'Dr. Sarr',
        practitionerRole: user?.role || 'MEDECIN',
        requestedBy: user?.name || user?.username || 'Dr. Sarr',
        requestedById: user?.id || ''
      }, user)));

      // 3. Create Audit Log
      await setDoc(doc(collection(db, 'audit_logs')), sanitizeData({
        user: user?.name || user?.email || 'Docteur',
        role: 'DOCTOR',
        date: dateStr,
        time: timeStr,
        timestamp: today.toISOString(),
        action: `Transmission ordonnance au comptoir Pharmacie et à la Caisse - Patient: ${activePatient.lastName} ${activePatient.firstName}`,
        details: { prescriptionId, invoiceId, totalAmount, medsCount: prescriptions.length },
        module: 'Consultation'
      }));

      window.dispatchEvent(new CustomEvent('app-notification', { 
        detail: `✓ Ordonnance transmise à la Pharmacie et à la Caisse` 
      }));
    } catch (e) {
      console.error("Prescription dispatch failed: ", e);
      window.dispatchEvent(new CustomEvent('app-notification', { 
        detail: `✗ Échec de transmission` 
      }));
    }
  };

  const handleSendExams = async (data: any) => {
    if (!activePatient) return;
    if (isSendingExamsRef.current) return;
    isSendingExamsRef.current = true;
    setTimeout(() => { isSendingExamsRef.current = false; }, 2000);

    if (!data || data.nativeEvent) {
      window.dispatchEvent(new CustomEvent('trigger-consultation-send-exams'));
      return;
    }

    const rawExams = data.examensDemandes || [];
    // Deduplicate exams by normalized name
    const examMap = new Map<string, any>();
    rawExams.forEach((e: any) => {
      const key = (e.name || '').toLowerCase().trim();
      if (key && !examMap.has(key)) {
        examMap.set(key, e);
      }
    });
    const exams = Array.from(examMap.values());

    if (exams.length === 0) {
      alert("⚠️ Erreur : Aucun examen prescrit.");
      return;
    }

    const today = new Date();
    const dateStr = today.toLocaleDateString('fr-FR');
    const timeStr = today.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

    try {
      const consultationId = activePatient.consultationId || `CONS-${Math.floor(Math.random() * 1000000)}`;
      const labRequestId = `LAB-${Math.floor(Math.random() * 1000000)}`;

      // 1. Create entry in lab_requests with strict multi-tenant isolation
      const practitionerName = user?.name || user?.username || 'Dr. Sarr';
      const practitionerId = user?.id || '';
      await setDoc(doc(db, 'lab_requests', labRequestId), sanitizeData(stampTenantData({
        id: labRequestId,
        patientId: activePatient.id,
        patientName: `${activePatient.lastName} ${activePatient.firstName}`,
        consultationId: consultationId,
        prescriberId: practitionerId,
        prescriberName: practitionerName,
        doctor: practitionerName,
        doctorName: practitionerName,
        doctorId: practitionerId,
        practitionerId: practitionerId,
        practitionerName: practitionerName,
        practitionerRole: user?.role || 'MEDECIN',
        date: today.toISOString(),
        time: timeStr,
        status: 'en attente',
        exams: exams.map((e: any) => ({
          name: e.name,
          urgent: e.urgent || false,
          category: e.category || 'Analyse',
          practitionerId: practitionerId,
          practitionerName: practitionerName
        })),
        createdAt: today.toISOString()
      }, user)));

      // 2. Also register billing for laboratory request so patient can pay
      const invoiceItems = exams.map((e: any, idx: number) => {
        const itemPrice = e.price || 2500;
        return {
          id: `item-exam-${labRequestId}-${idx}`,
          name: `Examen Lab : ${e.name}`,
          quantity: 1,
          unitPrice: itemPrice,
          totalPrice: itemPrice,
          practitionerId: practitionerId,
          practitionerName: practitionerName,
          practitionerRole: user?.role || 'MEDECIN'
        };
      });

      const totalAmount = invoiceItems.reduce((sum: number, item: any) => sum + item.totalPrice, 0);
      const invoiceId = `PR-${Math.floor(Math.random() * 1000000)}`;
      const paymentPayload: PaymentRequest = {
        id: invoiceId,
        patientId: activePatient.id,
        patientName: `${activePatient.lastName} ${activePatient.firstName}`,
        requestingService: 'Consultation',
        sourceModule: 'Consultation',
        type: 'LABORATOIRE',
        items: invoiceItems,
        totalAmount: totalAmount,
        amountPaid: 0,
        status: 'PENDING',
        createdAt: today.toISOString(),
        createdBy: practitionerName,
        createdById: practitionerId,
        practitionerId: practitionerId,
        practitionerName: practitionerName,
        practitionerRole: user?.role || 'MEDECIN',
        requestedBy: practitionerName,
        requestedById: practitionerId
      };

      await setDoc(doc(db, 'payment_requests', invoiceId), sanitizeData(stampTenantData(paymentPayload, user)));

      if (setPaymentRequests) {
        // setPaymentRequests is handled by onSnapshot in App.tsx
      }

      // 3. Create Audit Log
      await setDoc(doc(collection(db, 'audit_logs')), sanitizeData({
        user: user?.name || user?.email || 'Docteur',
        role: 'DOCTOR',
        date: dateStr,
        time: timeStr,
        timestamp: today.toISOString(),
        action: `Transmission examens au laboratoire - Patient: ${activePatient.lastName} ${activePatient.firstName}`,
        details: { labRequestId, invoiceId, examsCount: exams.length },
        module: 'Consultation'
      }));

      window.dispatchEvent(new CustomEvent('app-notification', { 
        detail: `✓ Examens transmis au laboratoire` 
      }));
    } catch (e) {
      console.error("Lab dispatch failed: ", e);
      window.dispatchEvent(new CustomEvent('app-notification', { 
        detail: `✗ Échec de transmission` 
      }));
    }
  };

  const [directAdmissionForm, setDirectAdmissionForm] = useState({
    bedId: '',
    reason: '',
    priority: 'Normal' as 'Normal' | 'Urgent' | 'Critique',
    service: 'Médecine Générale'
  });

  const handleConfirmDirectAdmission = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!activePatient || !directAdmissionForm.bedId) return;

    // Prevent double hospitalization
    try {
      const q = query(
        collection(db, 'inpatient_records'),
        where('patientId', '==', activePatient.id),
        where('status', '==', 'admitted')
      );
      const snapshot = await getDocs(q);
      
      if (!snapshot.empty) {
        window.dispatchEvent(new CustomEvent('app-notification', { 
          detail: `Erreur: ${activePatient.lastName} ${activePatient.firstName} est déjà hospitalisé.` 
        }));
        setShowDirectAdmissionModal(false);
        return;
      }
    } catch (err) {
      console.error("Error checking existing hospitalization:", err);
    }

    setIsHospitalizing(true);
    try {
      const batch = writeBatch(db);

      // 1. Update bed status
      const bedRef = doc(db, 'beds', directAdmissionForm.bedId);
      batch.update(bedRef, {
        status: 'OCCUPIED',
        patientName: `${activePatient.lastName} ${activePatient.firstName}`,
        patientId: activePatient.id,
        lastUpdated: new Date().toISOString()
      });

      // 2. Update patient status
      const patientRef = doc(db, 'patients', activePatient.id);
      batch.update(patientRef, {
        hospitalizationStatus: 'en_cours',
        lastUpdated: new Date().toISOString()
      });

      // 3. Create inpatient record
      const inpatientId = `INP-${Math.floor(Math.random() * 1000000)}`;
      const inpRef = doc(db, 'inpatient_records', inpatientId);
      batch.set(inpRef, sanitizeData({
        id: inpatientId,
        patientId: activePatient.id,
        patientName: `${activePatient.lastName} ${activePatient.firstName}`,
        bedId: directAdmissionForm.bedId,
        admissionDate: new Date().toISOString(),
        status: 'admitted',
        doctorName: user?.name || 'Docteur',
        doctorId: user?.id || '',
        reason: directAdmissionForm.reason || activePatient.motif || '',
        priority: directAdmissionForm.priority,
        service: directAdmissionForm.service
      }));

      // 4. Audit Log
      const auditRef = doc(collection(db, 'audit_logs'));
      batch.set(auditRef, {
        user: user?.name || 'Docteur',
        role: 'DOCTOR',
        date: new Date().toLocaleDateString('fr-FR'),
        time: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
        timestamp: new Date().toISOString(),
        action: `Admission directe depuis consultation - Patient: ${activePatient.lastName} ${activePatient.firstName}`,
        details: { inpatientId, bedId: directAdmissionForm.bedId },
        module: 'Consultation'
      });

      await batch.commit();

      setShowDirectAdmissionModal(false);
      setIsCurrentlyHospitalized(true);

      window.dispatchEvent(new CustomEvent('app-notification', { 
        detail: `Admission réussie pour ${activePatient.lastName} ${activePatient.firstName}` 
      }));
    } catch (e) {
      console.error("Direct admission error:", e);
      window.dispatchEvent(new CustomEvent('app-notification', { 
        detail: `Erreur lors de l'admission: ${e instanceof Error ? e.message : 'Erreur inconnue'}` 
      }));
    } finally {
      setIsHospitalizing(false);
    }
  };

  const handleHospitalize = (data?: any) => {
    if (!activePatient) return;
    if (isCurrentlyHospitalized || activePatient.hospitalizationStatus === 'en_cours' || activePatient.status === 'hospitalise') {
      window.dispatchEvent(new CustomEvent('app-notification', { 
        detail: `Erreur: ${activePatient.lastName} ${activePatient.firstName} est déjà hospitalisé.` 
      }));
      return;
    }
    setDirectAdmissionForm(prev => ({
      ...prev,
      reason: data?.diagnosis || data?.motif || activePatient.motif || '',
      service: activePatient.service || 'Médecine Générale'
    }));
    setShowDirectAdmissionModal(true);
  };

  // Get current permanent context properties (Point 2)
  const getPermanentContext = (patient: any) => {
    if (!patient) return null;
    const defaultAllergies = patient.allergies && patient.allergies.length > 0 
      ? patient.allergies 
      : ['Aucune allergie connue'];
    
    const inputMotif = (patient.motif || '').toLowerCase();
    
    // Constant active medications (should be fetched from patient history in real scenarios)
    const defaultMeds = patient.currentMeds && patient.currentMeds.length > 0 
      ? patient.currentMeds 
      : ['Aucun traitement de fond actif'];

    // Pending exams list
    const pendingExams = patient.pendingExams && patient.pendingExams.length > 0 
      ? patient.pendingExams 
      : ['Aucun examen en attente'];

    // Structured programmed follow-ups
    const defaultAppointments = patient.appointments && patient.appointments.length > 0 
      ? patient.appointments 
      : ['Aucun rendez-vous programmé'];

    // Hospitalization status
    const hospStatus = patient.hospitalisationStatus || 'Patient Externe (Aucun lit)';

    // Pregnancy & Chronic alerts
    const pregnancyStatus = patient.pregnancyStatus || 'Aucune information de grossesse';

    const chronicPathologies = patient.chronicPathologies && patient.chronicPathologies.length > 0 
      ? patient.chronicPathologies 
      : ['Pas de pathologie chronique déclarée'];

    // Calculation of BMI if height & weight exist
    let weightVal = patient.vitals?.weight || 75;
    let heightVal = patient.vitals?.height || 178;
    let bmiValue = (weightVal / ((heightVal / 100) * (heightVal / 100))).toFixed(1);

    return {
      id: patient.id,
      firstName: patient.firstName,
      lastName: patient.lastName,
      age: patient.age,
      gender: patient.gender,
      allergies: defaultAllergies,
      meds: defaultMeds,
      pendingExams,
      appointments: defaultAppointments,
      hospStatus,
      pregnancyStatus,
      chronicPathologies,
      vitals: {
        temp: patient.vitals?.temp || '37.2',
        bp: patient.vitals?.bp || '120/80',
        pulse: patient.vitals?.pulse || '72',
        spo2: patient.vitals?.spo2 || '98',
        respRate: patient.vitals?.respRate || '18',
        weight: weightVal,
        height: heightVal,
        bmi: bmiValue
      }
    };
  };

  const contextData = getPermanentContext(activePatient);

  // Helper to match patients to specialty dynamically
  const matchesSpecialty = (patient: any, targetSpec: string): boolean => {
    if (!targetSpec || targetSpec === 'ALL') return true;

    const target = targetSpec.toLowerCase().trim();
    const patientSpec = (patient.speciality || '').toLowerCase().trim();
    const patientSrv = (patient.service || '').toLowerCase().trim();
    const patientMotif = (patient.motifLabel || patient.motif || '').toLowerCase().trim();
    const patientQueue = (patient.queueName || '').toLowerCase().trim();

    // 1. Pédiatrie
    if (target.includes('pédiatr') || target.includes('pediatr') || target.includes('enfant')) {
      if (patientSpec.includes('pédiatr') || patientSpec.includes('pediatr') || patientSpec.includes('enfant')) return true;
      if (patientSrv.includes('pédiatr') || patientSrv.includes('pediatr') || patientSrv.includes('enfant')) return true;
      if (patientMotif.includes('pédiatr') || patientMotif.includes('pediatr') || patientMotif.includes('enfant')) return true;
      if (patientQueue.includes('pédiatr') || patientQueue.includes('pediatr')) return true;
      if (Number(patient.age) < 15 && (patientSrv.includes('consult') || !patientSrv) && !patientSpec) {
        return true;
      }
      return false;
    }

    // 2. Gynécologie / Obstétrique / Maternité
    if (target.includes('gynéco') || target.includes('gyneco') || target.includes('maternit') || target.includes('obstétr')) {
      if (patientSpec.includes('gynéco') || patientSpec.includes('gyneco') || patientSpec.includes('maternit') || patientSpec.includes('obstétr') || patientSpec.includes('cpn')) return true;
      if (patientSrv.includes('gynéco') || patientSrv.includes('gyneco') || patientSrv.includes('maternit')) return true;
      if (patientMotif.includes('gynéco') || patientMotif.includes('gyneco') || patientMotif.includes('maternit') || patientMotif.includes('grossesse') || patientMotif.includes('cpn')) return true;
      if (patientQueue.includes('gynéco') || patientQueue.includes('gyneco') || patientQueue.includes('maternit')) return true;
      return false;
    }

    // 3. Médecine Générale
    if (target.includes('générale') || target.includes('generale') || target.includes('general')) {
      if (patientSpec.includes('général') || patientSpec.includes('general')) return true;
      if (patientSrv.includes('général') || patientSrv.includes('general') || patientSrv === 'consultation' || patientSrv === 'consultation externe') return true;
      if (patientMotif.includes('général') || patientMotif.includes('general')) return true;
      // Default to general medicine if no specific specialty was assigned and patient is not specialized
      if (!patientSpec && (!patientSrv || patientSrv.includes('consultation')) && !patientMotif.includes('pédiatr') && !patientMotif.includes('gynéco')) {
        return true;
      }
      return false;
    }

    // 4. Other clinical specialties (Cardiologie, Ophtalmologie, Dermatologie, etc.)
    return patientSpec.includes(target) || 
           target.includes(patientSpec) || 
           patientSrv.includes(target) || 
           patientMotif.includes(target) ||
           patientQueue.includes(target);
  };

  // Dynamically extract active clinical specialties from configured hospital services and active tickets
  const availableSpecialties = useMemo(() => {
    const specs = new Set<string>();

    if (hospitalServices && Array.isArray(hospitalServices)) {
      hospitalServices.forEach(s => {
        if (s.status === 'active' || !s.status) {
          const type = (s.type || '').toLowerCase();
          const name = (s.name || '').trim();
          const lowerName = name.toLowerCase();

          const isExcluded = ['laboratoire', 'pharmacie', 'caisse', 'comptabilité', 'accueil', 'admission', 'administration', 'rh', 'archives', 'imagerie'].some(ex => lowerName.includes(ex));
          
          if (!isExcluded && (type === 'clinique' || type === 'specialise' || type === 'medical')) {
            if (lowerName.includes('consultation')) {
              specs.add('Médecine Générale');
            } else if (lowerName.includes('maternité')) {
              specs.add('Gynécologie');
            } else {
              specs.add(name);
            }
          }
        }
      });
    }

    // Core guaranteed medical specialties
    ['Médecine Générale', 'Pédiatrie', 'Gynécologie'].forEach(core => specs.add(core));

    // Dynamic queue specialties if any
    (waitingQueue || []).forEach(p => {
      if (p.speciality && typeof p.speciality === 'string' && p.speciality.trim()) {
        const specTrimmed = p.speciality.trim();
        const formatted = specTrimmed.charAt(0).toUpperCase() + specTrimmed.slice(1);
        specs.add(formatted);
      }
    });

    return Array.from(specs).sort((a, b) => {
      const order = ['Médecine Générale', 'Pédiatrie', 'Gynécologie'];
      const idxA = order.indexOf(a);
      const idxB = order.indexOf(b);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.localeCompare(b, 'fr');
    });
  }, [hospitalServices, waitingQueue]);

  // Filter queue to show patients for Consultation / Clinical Medical services and status 'waiting'
  const rawWaiting = (waitingQueue || []).filter(p => {
    const s = (p.service || '').toLowerCase();
    const m = (p.motif || '').toLowerCase();
    const spec = (p.speciality || '').toLowerCase();
    
    // Explicitly exclude technical/support services
    if (['urgences', 'emergency', 'laboratoire', 'pharmacie', 'soins infirmiers', 'vaccination'].includes(s)) {
      return false;
    }
    
    // Dedicated maternity (CPN & Accouchement) belongs to Maternity module. Gynecological consultations belong here in Consultation!
    if (['maternité', 'maternity'].includes(s) && !spec.includes('gynéco') && !m.includes('gynéco') && !(p.queueName || '').toLowerCase().includes('gynéco')) {
      return false;
    }

    // Treat motif containing URGENCE as Emergency if no service is defined
    if (!p.service && m.includes('urg')) {
      return false;
    }
    
    // Patients waiting for doctor consultation must have finished nurse triage (status === 'waiting')
    // Patients with status === 'waiting_triage' are currently at Soins Infirmiers (Nurse Triage)
    return p.status === 'waiting' || !p.status;
  });

  const uniqueWaitingMap = new Map<string, any>();
  rawWaiting.forEach(p => {
    const key = p.queueDocId || p.id;
    if (key && !uniqueWaitingMap.has(key)) {
      uniqueWaitingMap.set(key, p);
    }
  });
  const allConsultationWaitingQueue = Array.from(uniqueWaitingMap.values());

  // Filter queue by selected specialty
  const consultationWaitingQueue = selectedSpecialty === 'ALL'
    ? allConsultationWaitingQueue
    : allConsultationWaitingQueue.filter(p => matchesSpecialty(p, selectedSpecialty));

  // Map appointments that are IN_PROGRESS to queue format
  const inProgressAppointmentPatients = (appointments || [])
    .filter(a => a.status === 'IN_PROGRESS')
    .map(a => ({
      id: a.patientId || a.id,
      patientId: a.patientId || a.id,
      appointmentId: a.id,
      firstName: a.firstName || '',
      lastName: a.lastName || a.patient || 'Patient',
      age: a.age || 30,
      gender: a.gender || 'M',
      time: a.time || 'En cours',
      motif: a.reason || a.motif || 'CONSULTATION',
      service: 'Médecine Générale',
      status: 'in_consultation',
      priority: 'normal'
    }));

  // Filter queue to show patients with status 'in_consultation' or 'ready_for_discharge' plus IN_PROGRESS appointments
  const rawInProgress = (waitingQueue || []).filter(p => {
    const s = (p.service || '').toLowerCase();
    const m = (p.motif || '').toLowerCase();
    
    // Explicitly exclude other services
    if (['maternité', 'maternity', 'urgences', 'emergency', 'laboratoire', 'pharmacie', 'soins infirmiers', 'vaccination'].includes(s)) {
      return false;
    }
    
    // Treat motif containing URGENCE as Emergency if no service is defined
    if (!p.service && m.includes('urg')) {
      return false;
    }
    
    return p.status === 'in_consultation' || p.status === 'ready_for_discharge';
  });

  const uniqueInProgressMap = new Map<string, any>();
  [...rawInProgress, ...inProgressAppointmentPatients].forEach(p => {
    const key = p.queueDocId || p.appointmentId || p.id;
    if (key && !uniqueInProgressMap.has(key)) {
      uniqueInProgressMap.set(key, p);
    }
  });
  const consultationInProgressQueue = Array.from(uniqueInProgressMap.values());

  return (
    <div className={`h-screen flex flex-col overflow-hidden p-3 sm:p-5 font-sans selection:bg-blue-500/20 ${theme === 'dark' ? 'bg-[#090d16] text-slate-100' : 'bg-[#F8FAFC] text-slate-900'}`}>
      <MicroHeader
        icon={ClipboardList}
        breadcrumbs={[
          { label: 'Consultation', onClick: () => setActiveMenu('dashboard') },
          { 
            label: activeMenu === 'dashboard' ? 'Tableau de Bord' :
                   activeMenu === 'WAITING_ROOM' ? 'Salle d\'Attente' : 
                   activeMenu === 'CONSULTATION' ? (activePatient ? `${activePatient.firstName || ''} ${activePatient.lastName || ''}`.trim() : 'Consultation') :
                   activeMenu === 'HISTORY' ? 'Historique' :
                   activeMenu === 'APPOINTMENTS' ? 'Rendez-vous' : 'Répertoire',
            active: true
          }
        ]}
        onHomeClick={onBackToDashboard}
        onBackClick={activeMenu !== 'dashboard' ? () => setActiveMenu('dashboard') : undefined}
        user={{ name: user?.name || 'Dr. Sarr' }}
        theme={theme}
        actions={
          <div className="flex items-center gap-2 overflow-x-auto custom-scrollbar py-0.5">
            {/* Filtre par Spécialité */}
            <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-zinc-900 border border-slate-200/90 dark:border-zinc-800 rounded-xl px-2.5 py-1.5 shadow-xs shrink-0">
              <Stethoscope size={14} className={selectedSpecialty === 'ALL' ? 'text-slate-400' : 'text-blue-600'} />
              <label htmlFor="specialty-filter" className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-zinc-400 hidden sm:inline">
                Spécialité :
              </label>
              <select
                id="specialty-filter"
                value={selectedSpecialty}
                onChange={(e) => setSelectedSpecialty(e.target.value)}
                className="bg-transparent text-xs font-bold text-slate-800 dark:text-zinc-100 outline-none cursor-pointer pr-1"
              >
                <option value="ALL">Toutes ({allConsultationWaitingQueue.length})</option>
                {availableSpecialties.map(spec => {
                  const count = allConsultationWaitingQueue.filter(p => matchesSpecialty(p, spec)).length;
                  return (
                    <option key={spec} value={spec}>
                      {spec} ({count})
                    </option>
                  );
                })}
              </select>
              {selectedSpecialty !== 'ALL' && (
                <button
                  type="button"
                  onClick={() => setSelectedSpecialty('ALL')}
                  title="Réinitialiser le filtre"
                  className="p-0.5 hover:bg-slate-200 dark:hover:bg-zinc-800 rounded text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                >
                  <X size={12} />
                </button>
              )}
            </div>

            {/* Onglets Navigation */}
            <div className="flex items-center gap-1.5 shrink-0">
              {[
                { id: 'dashboard', label: 'Dashboard' },
                { id: 'WAITING_ROOM', label: `Attente (${consultationWaitingQueue.length})` },
                { id: 'APPOINTMENTS', label: `RDV (${appointments.filter(a => a.date === new Date().toISOString().split('T')[0]).length})` },
                { id: 'HISTORY', label: 'Historique' }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveMenu(tab.id as any)}
                  className={`px-3 py-1.5 rounded-xl font-bold text-xs transition-all cursor-pointer whitespace-nowrap ${
                    activeMenu === tab.id
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-slate-700 dark:text-zinc-200 hover:bg-slate-50 dark:hover:bg-zinc-800'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        }
      />

      {/* Dynamic Content Section */}
      <main className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">

          {activeMenu === 'dashboard' && (
            <ConsultationDashboard 
              theme={theme} 
              waitingQueue={consultationWaitingQueue} 
              appointments={appointments} 
              hospitalizedCount={hospitalizedPatients.length}
              paymentRequests={paymentRequests}
              onNavigateMenu={(menu) => setActiveMenu(menu as any)}
              onStartConsultation={(patient) => handleStartConsultation(patient)}
            />
          )}

          {activeMenu === 'WAITING_ROOM' && (
            <WaitingRoom 
              waitingQueue={consultationWaitingQueue} 
              inProgressQueue={consultationInProgressQueue}
              hospitalizedQueue={hospitalizedPatients}
              paymentRequests={paymentRequests}
              onStartConsultation={handleStartConsultation} 
              onCancelPatient={handleCancelPatient}
              onReorientPatient={handleReorientPatient}
              onResumeConsultation={(p) => {
                setActivePatient(p);
                setConsultationTab('MEDICAL');
                setActiveMenu('CONSULTATION');
              }}
              onManageDischarge={(p) => {
                setActivePatient(p);
                setConsultationTab('GENERAL');
                setActiveMenu('CONSULTATION');
              }}
            />
          )}

          {activeMenu === 'PATIENT_DIRECTORY' && (
            <PatientDirectory 
              user={user}
              onSelectPatient={(p) => {
                setActivePatient(p);
                setConsultationTab('GENERAL');
                setActiveMenu('CONSULTATION');
              }}
            />
          )}

          {activeMenu === 'CONSULTATION' && (
            activePatient ? (
              <div className="grid grid-cols-1 xl:grid-cols-4 gap-8 items-start animate-in fade-in duration-150">
                {/* Workspace area (3 columns) */}
                <div className="xl:col-span-3 flex flex-col h-full space-y-6">
                  {/* Hub Tabs Navigation */}
                  <div className="flex flex-col xl:flex-row items-stretch xl:items-center justify-between gap-4 bg-white p-3 rounded-[24px] border border-slate-200 shadow-sm shrink-0">
                    <div className="flex items-center gap-1 bg-slate-50 p-1.5 rounded-[20px] border border-slate-200/60 overflow-x-auto custom-scrollbar">
                      {[
                        { id: 'GENERAL', label: 'Vue générale', icon: LayoutDashboard },
                        { id: 'MEDICAL', label: 'Consultation', icon: ClipboardList },
                        { id: 'PRESCRIPTION', label: 'Ordonnance', icon: Pill },
                        { id: 'EXAMS', label: 'Examens', icon: TestTube },
                        { id: 'SOINS', label: 'Soins Infirmiers', icon: Syringe },
                        { id: 'HISTORY', label: 'Historique', icon: History },
                      ].map((tab) => (
                        <button
                          key={tab.id}
                          onClick={() => setConsultationTab(tab.id as ConsultationTab)}
                          className={`flex items-center gap-2 px-3 py-2 rounded-[16px] text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap ${
                            consultationTab === tab.id 
                              ? 'bg-blue-600 text-white shadow-md shadow-blue-600/10' 
                              : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
                          }`}
                        >
                          <tab.icon size={14} />
                          {tab.label}
                        </button>
                      ))}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setConsultationTab('SOINS')}
                        className={`flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-[16px] text-[9px] font-black uppercase tracking-wider transition-all border cursor-pointer whitespace-nowrap ${
                          consultationTab === 'SOINS'
                            ? 'bg-teal-600 text-white border-teal-600 shadow-sm'
                            : 'bg-teal-50 text-teal-700 border-teal-200 hover:bg-teal-100'
                        }`}
                      >
                        <Syringe size={13} />
                        <span>Prescrire un Soin</span>
                      </button>

                      <button 
                        onClick={handleEndSession}
                        disabled={isEndingSession}
                        className="flex items-center justify-center gap-2 px-4 py-2 bg-rose-50 text-rose-600 rounded-[16px] text-[9px] font-black uppercase tracking-wider hover:bg-rose-100 transition-all border border-rose-150 cursor-pointer whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isEndingSession ? (
                          <><Loader2 size={14} className="animate-spin" /> Traitement...</>
                        ) : (
                          <><LogOut size={14} /> Terminer session</>
                        )}
                      </button>
                    </div>
                  </div>

                  {!checkPatientIsPaid(activePatient) && (
                    <div className="bg-amber-50 border-2 border-amber-300 rounded-[24px] p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm animate-in fade-in slide-in-from-top-2 duration-300">
                      <div className="flex items-center gap-3.5">
                        <div className="w-10 h-10 rounded-2xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-sm">
                          <AlertTriangle size={20} />
                        </div>
                        <div>
                          <p className="text-xs font-black uppercase tracking-wider text-amber-950">
                            Ticket d'admission Non Encaissé à la Caisse
                          </p>
                          <p className="text-xs text-amber-900/90 font-medium">
                            Ce patient n'a pas encore réglé ses frais d'admission à la Caisse. La consultation médicale est autorisée et se déroule normalement.
                          </p>
                        </div>
                      </div>
                      <span className="px-3 py-1.5 bg-amber-200 text-amber-900 font-black text-[10px] uppercase tracking-widest rounded-xl border border-amber-300 shrink-0">
                        Facture en attente Caisse
                      </span>
                    </div>
                  )}

                  {activePatient.status === 'ready_for_discharge' && (
                    <div className="bg-amber-50/90 border border-amber-200/80 rounded-2xl px-4 py-2 flex items-center justify-between gap-3 shadow-xs animate-in fade-in slide-in-from-top duration-300">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-6 h-6 bg-amber-500 text-white rounded-lg flex items-center justify-center shrink-0 shadow-xs">
                          <Check size={14} className="stroke-[3]" />
                        </div>
                        <p className="text-xs font-black text-slate-800 tracking-tight truncate">
                          ✓ Consultation Clôturée <span className="font-medium text-slate-500 hidden sm:inline">— Dossier enregistré & actes transmis</span>
                        </p>
                      </div>

                      <div className="relative shrink-0" ref={actionsMenuRef}>
                        <button 
                          type="button"
                          onClick={() => setShowActionsDropdown(!showActionsDropdown)}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-black uppercase tracking-wider border border-slate-200 shadow-xs transition-all cursor-pointer"
                          title="Actions post-consultation"
                        >
                          <span>Actions</span>
                          <MoreVertical size={14} className="text-slate-500" />
                        </button>

                        {showActionsDropdown && (
                          <div className="absolute right-0 top-full mt-1.5 w-60 bg-white rounded-2xl border border-slate-200 shadow-xl py-1.5 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                            <div className="px-3 py-1 border-b border-slate-100 text-[9px] font-black text-slate-400 uppercase tracking-widest">
                              Orientation Patient
                            </div>
                            <button 
                              onClick={() => {
                                setShowActionsDropdown(false);
                                handleDischargeDirectly(activePatient);
                              }}
                              className="w-full px-3 py-2 text-left text-xs font-bold text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 flex items-center gap-2 transition-colors cursor-pointer"
                            >
                              <div className="w-5 h-5 rounded-md bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                                <Check size={12} />
                              </div>
                              Sortie Directe (Domicile)
                            </button>
                            <button 
                              onClick={() => {
                                setShowActionsDropdown(false);
                                if (!isCurrentlyHospitalized) handleHospitalize();
                              }}
                              disabled={isCurrentlyHospitalized}
                              className={`w-full px-3 py-2 text-left text-xs font-bold flex items-center gap-2 transition-colors ${
                                isCurrentlyHospitalized ? 'text-slate-400 bg-slate-50 cursor-not-allowed' : 'text-slate-700 hover:bg-blue-50 hover:text-blue-700 cursor-pointer'
                              }`}
                            >
                              <div className="w-5 h-5 rounded-md bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                                <Activity size={12} />
                              </div>
                              {isCurrentlyHospitalized ? 'Patient Hospitalisé' : 'Hospitaliser (Transfert)'}
                            </button>
                            <button 
                              onClick={() => {
                                setShowActionsDropdown(false);
                                setPlanningPatient(activePatient);
                                setActiveMenu('APPOINTMENTS');
                              }}
                              className="w-full px-3 py-2 text-left text-xs font-bold text-slate-700 hover:bg-amber-50 hover:text-amber-700 flex items-center gap-2 transition-colors cursor-pointer"
                            >
                              <div className="w-5 h-5 rounded-md bg-amber-100 text-amber-600 flex items-center justify-center shrink-0">
                                <Calendar size={12} />
                              </div>
                              Programmer Rendez-vous
                            </button>
                            <button 
                              onClick={() => {
                                setShowActionsDropdown(false);
                                setShowReorientModal(true);
                              }}
                              className="w-full px-3 py-2 text-left text-xs font-bold text-slate-700 hover:bg-slate-100 hover:text-slate-900 flex items-center gap-2 transition-colors cursor-pointer"
                            >
                              <div className="w-5 h-5 rounded-md bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
                                <ChevronRight size={12} />
                              </div>
                              Réorienter vers Service
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Tab Content */}
                  <div className="flex-1">
                    {consultationTab === 'GENERAL' && (
                      <VueGenerale 
                        patient={activePatient} 
                        onAction={(action) => {
                          if (action === 'HOSPITALIZE') handleHospitalize();
                          else if (action === 'APPOINTMENT') {
                            setPlanningPatient(activePatient);
                            setActiveMenu('APPOINTMENTS');
                          }
                          else setConsultationTab(action as ConsultationTab);
                        }} 
                      />
                    )}

                    {consultationTab === 'MEDICAL' && (
                      <ActiveConsultation 
                        activePatient={activePatient} 
                        user={user}
                        paymentRequests={paymentRequests}
                        setPaymentRequests={setPaymentRequests}
                        onSave={handleSave}
                        isSaving={isSavingDraft}
                        onCloturer={handleCloturer}
                        onGenerateObservation={handleGenerateObservation}
                        onSendPrescription={handleSendPrescription}
                        onSendExams={handleSendExams}
                        onHospitalize={handleHospitalize}
                        isCurrentlyHospitalized={isCurrentlyHospitalized || activePatient?.hospitalizationStatus === 'en_cours' || activePatient?.status === 'hospitalise'}
                        onClose={() => setConsultationTab('GENERAL')}
                      />
                    )}

                    {consultationTab === 'PRESCRIPTION' && (
                      <OrdonnanceTab patient={activePatient} user={user!} />
                    )}

                    {consultationTab === 'EXAMS' && (
                      <ExamensTab patient={activePatient} user={user!} />
                    )}

                    {consultationTab === 'SOINS' && (
                      <PrescriptionSoinsTab patient={activePatient} user={user!} />
                    )}

                    {consultationTab === 'HISTORY' && (
                      <div className="bg-white rounded-[40px] border border-slate-200 p-10 shadow-sm animate-in fade-in">
                        <HistoryTab patientId={activePatient.id} />
                      </div>
                    )}
                  </div>
                </div>

                {/* Permanent Patient Context Panel (1 column) -> Point 2 */}
                {contextData && (
                  <div className="xl:col-span-1 bg-white rounded-2xl border border-slate-200/90 p-4.5 shadow-xs flex flex-col gap-3.5 sticky top-36 max-h-[82vh] overflow-y-auto animate-in slide-in-from-right duration-500">
                    <div className="border-b border-slate-100 pb-2">
                      <h4 className="text-[9px] font-black uppercase tracking-wider text-slate-400 mb-0.5">Cadre Contexte Patient</h4>
                      <p className="text-xs font-black text-slate-800">Affichage Permanent Clinique</p>
                    </div>

                    {/* Patient identity block (Point 2.1) */}
                    <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl flex flex-col gap-1">
                      <p className="text-[7.5px] font-black uppercase tracking-wider text-slate-400">Identité Patient</p>
                      <p className="text-xs font-black text-slate-900">{contextData.lastName} {contextData.firstName}</p>
                      <div className="flex justify-between text-[9px] text-slate-500 font-bold mt-0.5">
                        <span>Genre: {contextData.gender === 'F' ? 'Femme ♀' : 'Homme ♂'}</span>
                        <span>Âge: {contextData.age} ans</span>
                      </div>
                      <p className="text-[9px] text-slate-400 font-mono mt-0.5">DME: {contextData.id}</p>
                    </div>

                    {/* Vitals summary with BMI (Point 2.2) */}
                    <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl flex flex-col gap-2">
                      <p className="text-[7.5px] font-black uppercase tracking-wider text-slate-400">Constantes de Triage</p>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="flex items-center gap-1.5">
                          <Thermometer size={12} className="text-rose-500" />
                          <div>
                            <p className="text-[7.5px] font-bold text-slate-500">Température</p>
                            <p className="text-[11px] font-black text-slate-800">{contextData.vitals.temp} °C</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Activity size={12} className="text-blue-500" />
                          <div>
                            <p className="text-[7.5px] font-bold text-slate-500">Tension (TA)</p>
                            <p className="text-[11px] font-black text-slate-800">{contextData.vitals.bp}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Heart size={12} className="text-emerald-500" />
                          <div>
                            <p className="text-[7.5px] font-bold text-slate-500">Pouls (FC)</p>
                            <p className="text-[11px] font-black text-slate-800">{contextData.vitals.pulse} bpm</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Activity size={12} className="text-orange-500" />
                          <div>
                            <p className="text-[7.5px] font-bold text-slate-500">SPO2</p>
                            <p className="text-[11px] font-black text-slate-800">{contextData.vitals.spo2} %</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 col-span-2 border-t border-slate-100 pt-1.5 text-[9px] font-bold text-slate-600 justify-between">
                          <span>FR: {contextData.vitals.respRate} cpm</span>
                          <span>Poids: {contextData.vitals.weight} kg</span>
                        </div>
                        <div className="flex items-center gap-1.5 col-span-2 text-[9px] font-bold text-slate-600 justify-between">
                          <span>Taille: {contextData.vitals.height} cm</span>
                          <span className="text-blue-600">IMC: {contextData.vitals.bmi}</span>
                        </div>
                      </div>
                    </div>

                    {/* Structured alerts Pregnancy & Chroniques (Point 2.3) */}
                    <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl flex flex-col gap-2">
                      <p className="text-[7.5px] font-black uppercase tracking-wider text-rose-500 flex items-center gap-1">
                        <AlertTriangle size={10} /> Alertes Signalées
                      </p>
                      
                      {/* Allergies */}
                      <div>
                        <p className="text-[7.5px] font-bold text-rose-400 mb-0.5">Allergies</p>
                        <div className="flex flex-wrap gap-1">
                          {contextData.allergies.map((all, i) => (
                            <span key={i} className="bg-white text-rose-700 border border-rose-200 px-1.5 py-0.5 rounded text-[8.5px] font-black leading-tight">
                              {all}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Pregnancy Alert */}
                      <div>
                        <p className="text-[7.5px] font-bold text-rose-400 mb-0.5">Statut de grossesse</p>
                        <p className="text-[9px] font-black text-rose-800">{contextData.pregnancyStatus}</p>
                      </div>

                      {/* Chronic pathologies */}
                      <div>
                        <p className="text-[7.5px] font-bold text-rose-400 mb-0.5">Pathologies chroniques</p>
                        <ul className="text-[8.5px] font-black text-rose-800 list-disc list-inside">
                          {contextData.chronicPathologies.map((patho, i) => (
                            <li key={i}>{patho}</li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    {/* Ongoing activities (Point 2.4) */}
                    <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl flex flex-col gap-2.5">
                      <p className="text-[7.5px] font-black uppercase tracking-wider text-slate-400">Activités & Traitements en cours</p>
                      
                      {/* Active treatments */}
                      <div className="border-b border-slate-100 pb-1.5">
                        <p className="text-[7.5px] font-bold text-slate-500 mb-0.5">Traitements de fond actifs</p>
                        <ul className="text-[9px] font-semibold text-slate-700 space-y-0.5">
                          {contextData.meds.map((med, i) => (
                            <li key={i} className="flex gap-1.5 items-start">
                              <span className="w-1.5 h-1.5 bg-blue-500 rounded-full mt-1 shrink-0"></span>
                              <span>{med}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      {/* Pending Exams */}
                      <div className="border-b border-slate-100 pb-2">
                        <p className="text-[8px] font-bold text-slate-500 mb-1">Examens en attente de résultats</p>
                        <ul className="text-[10px] font-semibold text-slate-700 space-y-1">
                          {contextData.pendingExams.map((ex, i) => (
                            <li key={i} className="flex gap-1.5 items-start">
                              <span className="w-1.5 h-1.5 bg-amber-500 rounded-full mt-1 shrink-0"></span>
                              <span>{ex}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      {/* Hospitalization active status */}
                      <div className="border-b border-slate-100 pb-2">
                        <p className="text-[8px] font-bold text-slate-500 mb-1">Statut d'hospitalisation</p>
                        <div className="flex gap-1.5 items-center text-[10px] font-black text-slate-700 uppercase">
                          <MapPin size={10} className="text-blue-500 shrink-0" />
                          <span>{contextData.hospStatus}</span>
                        </div>
                      </div>

                      {/* Scheduled Appointments */}
                      <div>
                        <p className="text-[8px] font-bold text-slate-500 mb-1">Dernier RDV programmé</p>
                        <ul className="text-[10px] font-semibold text-slate-700 space-y-1">
                          {activePatientAppointments.length > 0 ? activePatientAppointments.map((ap, i) => (
                            <li key={i} className="flex gap-1.5 items-start">
                              <Calendar size={10} className="text-emerald-500 mt-1 shrink-0" />
                              <span>{ap.date} à {ap.time} - {ap.reason || 'Consultation'} ({ap.status})</span>
                            </li>
                          )) : (
                            <li className="text-slate-400 italic">Aucun RDV programmé</li>
                          )}
                        </ul>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center py-20 bg-white rounded-[50px] border-4 border-dashed border-slate-100">
                <div className="w-24 h-24 bg-blue-50 rounded-[32px] flex items-center justify-center text-blue-600 mb-8 animate-bounce">
                  <ClipboardList size={48} />
                </div>
                <h2 className="text-3xl font-black text-slate-900 mb-4">Aucun patient actif</h2>
                <p className="text-slate-500 max-w-md font-medium italic">
                  Veuillez sélectionner un patient dans la salle d'attente pour commencer une nouvelle consultation.
                </p>
                <button 
                  onClick={() => setActiveMenu('WAITING_ROOM')}
                  className="mt-10 bg-slate-900 text-white px-8 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-blue-600 transition-all shadow-xl shadow-slate-900/10 cursor-pointer"
                >
                  Aller à la salle d'attente
                </button>
              </div>
            )
          )}

          {activeMenu === 'HISTORY' && <HistoryTab />}
          {activeMenu === 'APPOINTMENTS' && (
            <Appointments 
              user={user} 
              initialPatient={planningPatient} 
              onStartConsultation={handleStartConsultationFromAppointment}
            />
          )}
        </main>

      {/* 2. DIRECT ADMISSION MODAL (Updated Workflow) */}
      {showDirectAdmissionModal && activePatient && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-2xl rounded-[40px] shadow-2xl overflow-hidden border border-slate-200 animate-in zoom-in-95 duration-300">
            <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-blue-600 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-blue-600/20">
                  <Activity size={24} />
                </div>
                <div>
                  <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Admission Directe</h2>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Hospitalisation immédiate • Consultation Active</p>
                </div>
              </div>
              <button 
                onClick={() => setShowDirectAdmissionModal(false)}
                className="p-3 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-2xl transition-all"
              >
                <X size={24} />
              </button>
            </div>

            <div className="p-8 max-h-[70vh] overflow-y-auto no-scrollbar">
              <div className="space-y-8">
                {/* Fixed Context Info */}
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Patient (Lecture seule)</label>
                    <div className="p-4 bg-slate-100 border border-slate-200 rounded-2xl flex items-center gap-3">
                      <User size={18} className="text-slate-400" />
                      <span className="font-black text-slate-600 uppercase tracking-tight">{activePatient.lastName} {activePatient.firstName}</span>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Médecin Référent (Lecture seule)</label>
                    <div className="p-4 bg-slate-100 border border-slate-200 rounded-2xl flex items-center gap-3">
                      <Activity size={18} className="text-slate-400" />
                      <span className="font-black text-slate-600 uppercase tracking-tight">{user?.name || 'Dr. Sarr'}</span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-6">
                  {/* Bed Selection */}
                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Assignation Lit</label>
                    <select 
                      value={directAdmissionForm.bedId}
                      onChange={(e) => setDirectAdmissionForm({ ...directAdmissionForm, bedId: e.target.value })}
                      className="w-full px-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 font-bold text-slate-900"
                      required
                    >
                      <option value="">Choisir un lit disponible...</option>
                      {beds.filter(b => b.status === 'AVAILABLE' && (!b.category || b.category === 'hospitalisation' || b.category === 'all')).map(b => (
                        <option key={b.id} value={b.id}>
                          {b.name} ({rooms.find(r => r.id === b.roomId)?.name})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Priority */}
                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Priorité Clinique</label>
                    <div className="grid grid-cols-3 gap-2">
                      {(['Normal', 'Urgent', 'Critique'] as const).map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setDirectAdmissionForm({ ...directAdmissionForm, priority: p })}
                          className={`py-3 rounded-xl text-[10px] font-black uppercase tracking-tight transition-all border ${
                            directAdmissionForm.priority === p 
                              ? (p === 'Critique' ? 'bg-rose-600 text-white border-rose-600' : p === 'Urgent' ? 'bg-amber-500 text-white border-amber-500' : 'bg-blue-600 text-white border-blue-600')
                              : 'bg-slate-50 text-slate-400 border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-6">
                  {/* Service */}
                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Service de Destination</label>
                    <select 
                      value={directAdmissionForm.service}
                      onChange={(e) => setDirectAdmissionForm({ ...directAdmissionForm, service: e.target.value })}
                      className="w-full px-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 font-bold text-slate-900"
                    >
                      {['Médecine Générale', 'Chirurgie', 'Pédiatrie', 'Maternité', 'Soins Intensifs', 'Urgences'].map(srv => (
                        <option key={srv} value={srv}>{srv}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Reason */}
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Motif d'Admission / Diagnostic Préliminaire</label>
                  <textarea 
                    value={directAdmissionForm.reason}
                    onChange={(e) => setDirectAdmissionForm({ ...directAdmissionForm, reason: e.target.value })}
                    placeholder="Précisez le motif de l'hospitalisation..."
                    rows={3}
                    className="w-full px-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 font-bold text-slate-900 resize-none"
                    required
                  />
                </div>
              </div>
            </div>

            <div className="p-8 border-t border-slate-100 bg-slate-50/50 flex items-center justify-end gap-4">
              <button 
                onClick={() => setShowDirectAdmissionModal(false)}
                className="px-8 py-4 bg-white border border-slate-200 text-slate-600 font-black text-[10px] uppercase tracking-widest rounded-2xl hover:bg-slate-50 transition-all"
              >
                Annuler
              </button>
              <button 
                onClick={() => handleConfirmDirectAdmission()}
                disabled={isHospitalizing || !directAdmissionForm.bedId || !directAdmissionForm.reason}
                className="px-10 py-4 bg-blue-600 text-white font-black text-[10px] uppercase tracking-widest rounded-2xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-600/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-3"
              >
                {isHospitalizing ? (
                  <><Loader2 size={18} className="animate-spin" /> En cours...</>
                ) : (
                  <>
                    <Check size={18} />
                    Confirmer l'Admission
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. ADVANCED HOSPITALISATION FORM DIALOG (Point 7) */}
      {showHospitalizationDialog && activePatient && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-300">
          <form 
            onSubmit={handleConfirmHospitalization}
            className="bg-white rounded-[40px] border border-slate-200 w-full max-w-md p-10 shadow-2xl relative max-h-[90vh] overflow-y-auto"
          >
            <button 
              type="button"
              onClick={() => setShowHospitalizationDialog(false)} 
              className="absolute top-8 right-8 p-3 bg-slate-100 text-slate-500 rounded-2xl hover:bg-rose-50 hover:text-rose-600 transition-all"
            >
              <X size={18} />
            </button>

            <h3 className="text-2xl font-black text-slate-900 mb-1">Demande d'Hospitalisation</h3>
            <p className="text-slate-500 text-sm mb-6 font-medium italic">
              Formulaire de transmission pour {activePatient.lastName} {activePatient.firstName}.
            </p>

            <div className="space-y-4 mb-6">
              <div>
                <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider block mb-1">Motif principal d'admission</label>
                <input
                  type="text"
                  value={hospForm.motif}
                  onChange={e => setHospForm({ ...hospForm, motif: e.target.value })}
                  className="w-full text-sm p-4 border border-slate-200 rounded-2xl outline-none focus:border-blue-500 font-bold"
                  placeholder="Ex. Surveillance paramètres cliniques, Réhydratation ..."
                  required
                />
              </div>

              <div>
                <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider block mb-1">Service de destination</label>
                <select
                  value={hospForm.service}
                  onChange={e => setHospForm({ ...hospForm, service: e.target.value })}
                  className="w-full text-sm p-4 border border-slate-200 rounded-2xl outline-none focus:border-blue-500 bg-white font-bold"
                >
                  {['Médecine interne', 'Pédiatrie', 'Chirurgie', 'Gynécologie', 'Maternité', 'Urgences'].map(srv => (
                    <option key={srv} value={srv}>{srv}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider block mb-1">Priorité clinique</label>
                  <select
                    value={hospForm.priorite}
                    onChange={e => setHospForm({ ...hospForm, priorite: e.target.value })}
                    className="w-full text-sm p-4 border border-slate-200 rounded-2xl outline-none focus:border-blue-500 bg-white font-bold"
                  >
                    {['Haute', 'Moyenne', 'Basse'].map(pr => (
                      <option key={pr} value={pr}>{pr} priorité</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider block mb-1">Durée prévisionnelle (jours)</label>
                  <input
                    type="number"
                    min="1"
                    max="60"
                    value={hospForm.duree}
                    onChange={e => setHospForm({ ...hospForm, duree: parseInt(e.target.value) || 1 })}
                    className="w-full text-sm p-4 border border-slate-200 rounded-2xl outline-none focus:border-blue-500 font-bold"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider block mb-1">Observations & remarques cliniques</label>
                <textarea
                  value={hospForm.observations}
                  onChange={e => setHospForm({ ...hospForm, observations: e.target.value })}
                  className="w-full text-sm p-4 border border-slate-200 rounded-2xl outline-none focus:border-blue-500 h-24 resize-none font-medium"
                  placeholder="Ex. À isoler si possible, perfusions ..."
                />
              </div>
            </div>

            <div className="flex gap-4">
              <button
                type="button"
                onClick={() => setShowHospitalizationDialog(false)}
                className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-slate-200 transition-colors cursor-pointer"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={isHospitalizing}
                className="flex-1 py-4 bg-blue-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-blue-700 transition-colors shadow-lg shadow-blue-600/20 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2"
              >
                {isHospitalizing ? (
                  <><Loader2 size={16} className="animate-spin" /> En cours...</>
                ) : (
                  "Transmettre"
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 3. STEPPED CLOSURE & BILLING VALIDATION DIALOG (Point 9) */}
      {showClosureDialog && compilationData && activePatient && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="bg-white rounded-[40px] border border-slate-200 w-full max-w-md p-10 shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <button 
              onClick={() => setShowClosureDialog(false)} 
              className="absolute top-8 right-8 p-3 bg-slate-100 text-slate-500 rounded-2xl hover:bg-rose-50 hover:text-rose-600 transition-all"
            >
              <X size={18} />
            </button>

            <h3 className="text-2xl font-black text-slate-900 mb-1">Workflow Validation</h3>
            <p className="text-slate-500 text-sm mb-6 font-medium italic">
              Validation requise pour clôturer le dossier de {activePatient.lastName}.
            </p>

            <div className="space-y-4 mb-8">
              {/* Check 1: Observation note ready */}
              <div className="flex items-start gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                <div className="w-6 h-6 rounded-full bg-emerald-500 text-white flex items-center justify-center shrink-0 mt-0.5">
                  <Check size={14} />
                </div>
                <div>
                  <h4 className="text-xs font-black text-slate-900 uppercase">1. Observation clinique validée</h4>
                  <p className="text-[10px] text-slate-500 font-semibold">Générée avec succès (~{compilationData.observation?.length} car.)</p>
                </div>
              </div>

              {/* Check 2: Diagnosis CIM-10 ready */}
              <div className="flex items-start gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                <div className="w-6 h-6 rounded-full bg-emerald-500 text-white flex items-center justify-center shrink-0 mt-0.5">
                  <Check size={14} />
                </div>
                <div>
                  <h4 className="text-xs font-black text-slate-900 uppercase">2. Diagnostic d'entrée codé</h4>
                  <p className="text-[10px] text-blue-600 font-black uppercase font-mono mt-0.5">{compilationData.hypotheses?.principal}</p>
                </div>
              </div>

              {/* Check 3: Digital Prescription / Pharmacy sync */}
              <div className="flex items-start gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                {compilationData.prescriptions && compilationData.prescriptions.length > 0 ? (
                  <div className="w-6 h-6 rounded-full bg-emerald-500 text-white flex items-center justify-center shrink-0 mt-0.5">
                    <Check size={14} />
                  </div>
                ) : (
                  <div className="w-6 h-6 rounded-full bg-slate-200 text-slate-400 flex items-center justify-center shrink-0 mt-0.5 text-xs font-black">
                    -
                  </div>
                )}
                <div>
                  <h4 className="text-xs font-black text-slate-900 uppercase">3. Ordonnance électronique transmise</h4>
                  <p className="text-[10px] text-slate-500 font-semibold">
                    {compilationData.prescriptions && compilationData.prescriptions.length > 0 
                      ? `${compilationData.prescriptions.length} médicaments configurés`
                      : 'Aucun médicament prescrit'
                    }
                  </p>
                </div>
              </div>

              {/* Check 4: Invoice breakdown */}
              <div className="p-5 bg-blue-50/50 border border-blue-100 rounded-2xl">
                <h4 className="text-xs font-black text-blue-900 uppercase mb-3 tracking-wider">4. Ventilation de paiement générée</h4>
                <div className="text-xs font-bold space-y-2 divide-y divide-blue-100/50">
                  <div className="flex justify-between text-slate-600 pt-1">
                    <span>Acte de Consultation</span>
                    <span>10 000 FCFA</span>
                  </div>
                  {compilationData.prescriptions && compilationData.prescriptions.map((p: any, idx: number) => (
                    <div key={idx} className="flex justify-between text-slate-600 pt-2 font-medium">
                      <span className="truncate max-w-[200px]">{p.name}</span>
                      <span>{p.price || 1500} FCFA</span>
                    </div>
                  ))}
                  {compilationData.examensDemandes && compilationData.examensDemandes.map((e: any, idx: number) => (
                    <div key={idx} className="flex justify-between text-slate-600 pt-2 font-medium">
                      <span className="truncate max-w-[200px]">Ex: {e.name}</span>
                      <span>{e.price || 2500} FCFA</span>
                    </div>
                  ))}
                  <div className="flex justify-between text-blue-900 pt-3 font-black text-sm">
                    <span>Total facturé</span>
                    <span>
                      {10000 + 
                       (compilationData.prescriptions?.reduce((sum: number, p: any) => sum + (p.price || 1500), 0) || 0) + 
                       (compilationData.examensDemandes?.reduce((sum: number, e: any) => sum + (e.price || 2500), 0) || 0)
                      } FCFA
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-4">
              <button
                onClick={() => setShowClosureDialog(false)}
                className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-slate-200 transition-colors cursor-pointer"
              >
                Retour
              </button>
              <button
                onClick={handleConfirmClosure}
                disabled={isClosing}
                className={`flex-1 py-4 text-white rounded-2xl text-xs font-black uppercase tracking-widest transition-colors shadow-lg cursor-pointer flex items-center justify-center gap-2 ${
                  isClosing 
                    ? 'bg-slate-400 cursor-not-allowed shadow-none' 
                    : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20'
                }`}
              >
                {isClosing ? (
                  <>
                    <RefreshCw className="animate-spin text-white shrink-0" size={14} />
                    Clôture...
                  </>
                ) : (
                  'Confirmer & Valoriser'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* 4. DISCHARGE REORIENTATION DIALOG */}
      {showReorientModal && activePatient && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="bg-white rounded-[40px] border border-slate-200 w-full max-w-md p-10 shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <button 
              onClick={() => setShowReorientModal(false)} 
              className="absolute top-8 right-8 p-3 bg-slate-100 text-slate-500 rounded-2xl hover:bg-rose-50 hover:text-rose-600 transition-all"
            >
              <X size={18} />
            </button>

            <h3 className="text-2xl font-black text-slate-900 mb-1">Réorienter le Patient</h3>
            <p className="text-slate-500 text-sm mb-6 font-medium italic">
              Sélectionnez le service cible pour {activePatient.lastName} {activePatient.firstName}.
            </p>

            <div className="space-y-4 mb-8">
              {[
                { name: 'Maternité', desc: 'Consultation prénatale, accouchement, ou suivi postpartum', color: 'border-pink-200 bg-pink-50 text-pink-700' },
                { name: 'Urgences', desc: 'Soins intensifs immédiats, traumatologie ou décompensation', color: 'border-rose-200 bg-rose-50 text-rose-700' },
                { name: 'Laboratoire', desc: 'Prélèvements sanguins additionnels ou examens de pointe', color: 'border-amber-200 bg-amber-50 text-amber-700' },
                { name: 'Soins Infirmiers', desc: 'Injections, pansements, perfusions ou petite chirurgie', color: 'border-blue-200 bg-blue-50 text-blue-700' },
              ].map((srv) => (
                <button
                  key={srv.name}
                  onClick={() => {
                    handleReorientPatient(activePatient, srv.name);
                    setShowReorientModal(false);
                  }}
                  className={`w-full text-left p-5 border rounded-2xl hover:scale-[1.02] hover:shadow-lg transition-all flex flex-col justify-between cursor-pointer ${srv.color}`}
                >
                  <span className="text-sm font-black uppercase tracking-wide">{srv.name}</span>
                  <span className="text-xs mt-1 opacity-80">{srv.desc}</span>
                </button>
              ))}
            </div>

            <button
              onClick={() => setShowReorientModal(false)}
              className="w-full py-4 bg-slate-100 text-slate-600 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-slate-200 transition-colors cursor-pointer"
            >
              Fermer
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Consultation;
