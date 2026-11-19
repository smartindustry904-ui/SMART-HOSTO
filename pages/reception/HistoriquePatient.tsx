import React, { useState, useEffect, useMemo } from 'react';
import { 
  History, Search, Filter, Calendar, Stethoscope, BedDouble, 
  Beaker, Baby, ShieldAlert, User, Clock, ArrowRight, ShieldCheck, 
  Lock, Eye, RefreshCw, X, ChevronRight, FileText, CheckCircle2,
  CalendarRange, AlertCircle, Activity, UserCheck, Layers, Sparkles, LogOut, Syringe, Printer, Download
} from 'lucide-react';
import { Patient, User as UserType } from '../../types';
import { db } from '../../src/firebase';
import { collection, onSnapshot, query, orderBy, getDocs } from 'firebase/firestore';
import { getActiveTenantId, belongsToTenant } from '../../src/utils/tenant';
import { useSettings, useHospitalServices } from '../../hooks/useSettings';
import { InpatientTrackingDashboard, InpatientStaySummary } from '../../components/inpatient/InpatientTrackingDashboard';

export interface PatientHistoryEvent {
  id: string;
  patientId: string;
  patientName: string;
  dmeId?: string;
  type: 'CONSULTATION' | 'HOSPITALISATION' | 'LABORATOIRE' | 'IMAGERIE' | 'MATERNITE' | 'URGENCE' | 'ORIENTATION' | 'SORTIE' | 'SOINS';
  date: string;
  time?: string;
  timestamp: number;
  service: string;
  doctorName?: string;
  motif?: string;
  mainDiagnosis?: string;
  // Hospitalization specific
  ward?: string;
  roomBed?: string;
  dischargeDate?: string;
  dischargeReason?: string;
  // Lab / Imaging specific
  examNames?: string[];
  examCategory?: string;
  status?: string;
  // Emergency specific
  priority?: string;
  triageScore?: string;
}

interface HistoriquePatientProps {
  user?: UserType;
  establishment?: any;
  selectedPatient?: Patient | null;
  onSelectPatientForAdmission?: (patient: Patient) => void;
  theme?: 'light' | 'dark';
}

const HistoriquePatient: React.FC<HistoriquePatientProps> = ({
  user,
  establishment: propEstablishment,
  selectedPatient: propSelectedPatient,
  onSelectPatientForAdmission,
  theme = 'light'
}) => {
  const { establishment: hookEstablishment } = useSettings();
  const { services: hospitalServices } = useHospitalServices();
  const establishment = propEstablishment || hookEstablishment;
  const activeTenantId = useMemo(() => getActiveTenantId(user, establishment), [user, establishment]);

  // Dynamic Active-Service Filters: strictly populated from active hospital services
  const activeHospitalServices = useMemo(() => {
    const excluded = new Set(['SRV-ACCUEIL', 'SRV-CAISSE', 'SRV-ADMIN', 'SRV-RH', 'SRV-ARCHIVES', 'SRV-PHARMACIE']);
    return (hospitalServices || []).filter((s: any) => {
      const isAct = s.status === 'active' || s.isActive === true || s.active === true || (!s.status && s.isActive !== false);
      if (!isAct || excluded.has(s.id)) return false;
      if (s.type === 'administratif' && !String(s.id || '').toLowerCase().includes('consult')) return false;
      return true;
    });
  }, [hospitalServices]);

  const [patients, setPatients] = useState<Patient[]>([]);
  const [activeVisitPatientIds, setActiveVisitPatientIds] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIF' | 'CLOTURE'>('ALL');
  const [detailPatientGroup, setDetailPatientGroup] = useState<any | null>(null);
  const [selectedPatientId, setSelectedPatientId] = useState<string>(propSelectedPatient?.id || propSelectedPatient?.patientId || 'ALL');
  const [patientSearchTerm, setPatientSearchTerm] = useState('');
  const [allEvents, setAllEvents] = useState<PatientHistoryEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'patients' | 'hospitalisations'>('patients');
  const [closedHospitalStays, setClosedHospitalStays] = useState<InpatientStaySummary[]>([]);
  const [selectedArchivedStay, setSelectedArchivedStay] = useState<InpatientStaySummary | null>(null);

  // Filters
  const [selectedServiceType, setSelectedServiceType] = useState<string>('ALL');
  const [dateRangePreset, setDateRangePreset] = useState<'ALL' | 'TODAY' | '7D' | '30D' | '6M' | '1Y' | 'CUSTOM'>('ALL');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');
  const [selectedDoctor, setSelectedDoctor] = useState<string>('ALL');
  const [searchKeyword, setSearchKeyword] = useState<string>('');

  // 1. Fetch patients list for selector (Strict Tenant Scoped)
  useEffect(() => {
    const unsubPatients = onSnapshot(collection(db, 'patients'), (snapshot) => {
      const pList: Patient[] = snapshot.docs
        .map(d => ({
          id: d.id,
          ...d.data()
        } as Patient))
        .filter(p => belongsToTenant(p, activeTenantId));
      setPatients(pList);
    }, (err) => console.error("Error fetching patients in Historique:", err));

    return () => unsubPatients();
  }, [activeTenantId]);

  // 1a. Listen to active visites for live Global Status badge (ACTIF vs CLOTURE)
  useEffect(() => {
    const unsubVisites = onSnapshot(collection(db, 'visites'), (snap) => {
      const activeSet = new Set<string>();
      snap.docs.forEach((d) => {
        const data = d.data() as any;
        if (!belongsToTenant(data, activeTenantId)) return;
        if (String(data.status || data.statut || '').toUpperCase() === 'ACTIF') {
          if (data.patientId) activeSet.add(String(data.patientId).replace(/^(PAT|DME)-/i, 'CANON-'));
          if (data.dmeId) activeSet.add(String(data.dmeId).replace(/^(PAT|DME)-/i, 'CANON-'));
        }
      });
      setActiveVisitPatientIds(activeSet);
    }, () => {});
    return () => unsubVisites();
  }, [activeTenantId]);

  // 1b. Listen to closed inpatient_records for Historique des Hospitalisations
  useEffect(() => {
    const unsubInpatient = onSnapshot(collection(db, 'inpatient_records'), (snap) => {
      const list = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as any) }))
        .filter((r) => belongsToTenant(r, activeTenantId))
        .filter((r) => {
          const st = String(r.status || '').toUpperCase();
          return st === 'DISCHARGED' || st === 'CLOTURE' || st === 'SORTI' || Boolean(r.dischargeDate);
        })
        .map((r): InpatientStaySummary => ({
          id: r.id,
          hospitalisation_id: r.hospitalisation_id || r.id,
          visite_id: r.visite_id || '',
          patientId: r.patientId || '',
          patientName: r.patientName || 'Patient',
          roomName: r.roomName || 'Chambre',
          bedName: r.bedName || 'Lit',
          wardName: r.wardName || '',
          admissionDate: r.admissionDate || r.createdAt || '',
          dischargeDate: r.dischargeDate || r.dischargedAt || r.updatedAt || '',
          doctorName: r.doctorName || 'Médecin traitant',
          reason: r.admissionReason || r.reason || 'Hospitalisation',
          status: r.status || 'DISCHARGED',
          vitals: r.vitals || [],
          cares: r.cares || [],
          observations: r.observations || [],
        }))
        .sort((a, b) => new Date(b.admissionDate || 0).getTime() - new Date(a.admissionDate || 0).getTime());
      setClosedHospitalStays(list);
    });
    return () => unsubInpatient();
  }, [activeTenantId]);

  // Update selectedPatientId when prop changes
  useEffect(() => {
    if (propSelectedPatient?.id || propSelectedPatient?.patientId) {
      setSelectedPatientId(propSelectedPatient.id || propSelectedPatient.patientId);
    } else {
      setSelectedPatientId('ALL');
    }
  }, [propSelectedPatient]);

  // 2. Fetch history records across all modules (Strict Tenant Scoped)
  useEffect(() => {
    setIsLoading(true);
    let consultations: PatientHistoryEvent[] = [];
    let patientHistoryRecords: PatientHistoryEvent[] = [];
    let hospitalizations: PatientHistoryEvent[] = [];
    let dischargesList: PatientHistoryEvent[] = [];
    let labRequests: PatientHistoryEvent[] = [];
    let emergencyEvents: PatientHistoryEvent[] = [];
    let serviceQueues: PatientHistoryEvent[] = [];
    let maternityAdmissions: PatientHistoryEvent[] = [];
    let nursingActs: PatientHistoryEvent[] = [];

    const compileAll = () => {
      const merged = [
        ...consultations,
        ...patientHistoryRecords,
        ...hospitalizations,
        ...dischargesList,
        ...labRequests,
        ...emergencyEvents,
        ...serviceQueues,
        ...maternityAdmissions,
        ...nursingActs
      ];
      // Deduplicate by ID
      const map = new Map<string, PatientHistoryEvent>();
      merged.forEach(item => {
        if (!map.has(item.id)) {
          map.set(item.id, item);
        }
      });
      const sorted = Array.from(map.values()).sort((a, b) => b.timestamp - a.timestamp);
      setAllEvents(sorted);
      setIsLoading(false);
    };

    // A. Consultations
    const unsubConsultations = onSnapshot(collection(db, 'consultations'), (snap) => {
      consultations = snap.docs
        .filter(docSnap => belongsToTenant(docSnap.data(), activeTenantId))
        .map(docSnap => {
          const d = docSnap.data();
          const dateStr = d.date || (d.createdAt ? d.createdAt.split('T')[0] : 'N/A');
          const ts = d.createdAt ? new Date(d.createdAt).getTime() : Date.now();
          return {
            id: `cons-${docSnap.id}`,
            patientId: d.patientId || d.patientIdRaw || '',
            patientName: d.patient || d.patientName || 'Patient',
            dmeId: d.dmeId || d.patientId || '',
            type: 'CONSULTATION',
            date: dateStr,
            time: d.time || (d.createdAt ? new Date(d.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : undefined),
            timestamp: isNaN(ts) ? Date.now() : ts,
            service: d.type === 'CPN / Maternité' ? 'Maternité / CPN' : d.specialty || d.service || 'Médecine Générale',
            doctorName: d.doctor || d.doctorName || 'Dr. Référent',
            motif: d.motif || d.reason || 'Consultation médicale',
            mainDiagnosis: d.diagnosis || d.diagnosticPrincipal || d.motif || 'Non précisé (Lecture Seule)'
          };
        });
      compileAll();
    }, () => compileAll());

    // A2. Patient History (Secondary Consultation Register)
    const unsubPatientHistory = onSnapshot(collection(db, 'patient_history'), (snap) => {
      patientHistoryRecords = snap.docs
        .filter(docSnap => belongsToTenant(docSnap.data(), activeTenantId))
        .map(docSnap => {
          const d = docSnap.data();
          const dateStr = d.date || (d.createdAt ? d.createdAt.split('T')[0] : 'N/A');
          const ts = d.createdAt ? new Date(d.createdAt).getTime() : (d.timestamp ? new Date(d.timestamp).getTime() : Date.now());
          return {
            id: `phist-${docSnap.id}`,
            patientId: d.patientId || '',
            patientName: d.patient || d.patientName || 'Patient',
            dmeId: d.dmeId || d.patientId || '',
            type: 'CONSULTATION',
            date: dateStr,
            time: d.time || (d.createdAt ? new Date(d.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : undefined),
            timestamp: isNaN(ts) ? Date.now() : ts,
            service: d.service || 'Consultation Médicale',
            doctorName: d.doctor || d.doctorName || 'Dr. Référent',
            motif: d.motif || 'Consultation',
            mainDiagnosis: d.diagnosis || d.diagnosticPrincipal || 'Observation médicale enregistrée'
          };
        });
      compileAll();
    }, () => compileAll());

    // B. Hospitalizations / Discharges Waiting
    const unsubDischarges = onSnapshot(collection(db, 'discharges_waiting'), (snap) => {
      hospitalizations = snap.docs
        .filter(docSnap => belongsToTenant(docSnap.data(), activeTenantId))
        .map(docSnap => {
          const d = docSnap.data();
          const entryDate = d.admissionDate || d.entryDate || (d.createdAt ? d.createdAt.split('T')[0] : 'N/A');
          const exitDate = d.dischargeDate || d.exitDate || (d.updatedAt ? d.updatedAt.split('T')[0] : 'En cours');
          const ts = d.createdAt ? new Date(d.createdAt).getTime() : Date.now();
          return {
            id: `hosp-${docSnap.id}`,
            patientId: d.patientId || docSnap.id,
            patientName: d.patientName || `${d.lastName || ''} ${d.firstName || ''}`.trim() || 'Patient',
            dmeId: d.dmeId || d.patientId || '',
            type: 'HOSPITALISATION',
            date: entryDate,
            time: d.admissionTime || undefined,
            timestamp: isNaN(ts) ? Date.now() : ts,
            service: d.service || d.department || 'Hospitalisation Médicale',
            doctorName: d.prescriberName || d.doctor || 'Dr. Hospitalier',
            ward: d.service || d.department || 'Pavillon Principal',
            roomBed: d.bedId || d.bed || d.room ? `Lit ${d.bedId || d.bed || ''} - ${d.room || ''}` : 'Chambre Standard',
            dischargeDate: exitDate,
            dischargeReason: d.dischargeReason || d.motifSortie || d.motif || 'Séjour hospitalier régularisé',
            motif: d.admissionReason || d.motif || 'Hospitalisation'
          };
        });
      compileAll();
    }, () => compileAll());

    // B2. Validated Administrative Discharges (discharges)
    const unsubDischargesCompleted = onSnapshot(collection(db, 'discharges'), (snap) => {
      dischargesList = snap.docs
        .filter(docSnap => belongsToTenant(docSnap.data(), activeTenantId))
        .map(docSnap => {
          const d = docSnap.data();
          const dateStr = d.dischargeDate || (d.createdAt ? d.createdAt.split('T')[0] : 'N/A');
          const ts = d.createdAt ? new Date(d.createdAt).getTime() : Date.now();
          return {
            id: `disch-${docSnap.id}`,
            patientId: d.patientId || docSnap.id,
            patientName: d.patientName || 'Patient',
            dmeId: d.dmeId || d.patientId || '',
            type: 'SORTIE',
            date: dateStr,
            time: d.dischargeTime || (d.createdAt ? new Date(d.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : undefined),
            timestamp: isNaN(ts) ? Date.now() : ts,
            service: d.department || 'Sorties Administratives',
            doctorName: d.user || 'Agent Accueil',
            motif: `Sortie administrative validée (${d.department || 'Services Cliniques'})`,
            status: 'Sortie Effectuée'
          };
        });
      compileAll();
    }, () => compileAll());

    // C. Lab Requests (Exam names only, strictly NO sensitive biological results)
    const unsubLab = onSnapshot(collection(db, 'lab_requests'), (snap) => {
      labRequests = snap.docs
        .filter(docSnap => belongsToTenant(docSnap.data(), activeTenantId))
        .map(docSnap => {
          const d = docSnap.data();
          const dateStr = d.date ? (d.date.includes('T') ? d.date.split('T')[0] : d.date) : (d.createdAt ? d.createdAt.split('T')[0] : 'N/A');
          const ts = d.createdAt ? new Date(d.createdAt).getTime() : Date.now();
          const rawExams = d.exams || [];
          const examNamesList = Array.isArray(rawExams)
            ? rawExams.map((e: any) => typeof e === 'string' ? e : e.name).filter(Boolean)
            : [d.examName || 'Bilan biologique'];

          const isImaging = examNamesList.some(name => /radio|echo|scanner|irm|échographie|rx/i.test(name));

          return {
            id: `lab-${docSnap.id}`,
            patientId: d.patientId || '',
            patientName: d.patientName || 'Patient',
            dmeId: d.dmeId || d.patientId || '',
            type: isImaging ? 'IMAGERIE' : 'LABORATOIRE',
            date: dateStr,
            time: d.time || (d.createdAt ? new Date(d.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : undefined),
            timestamp: isNaN(ts) ? Date.now() : ts,
            service: isImaging ? 'Imagerie Médicale & Radiologie' : 'Laboratoire de Biologie Médicale',
            doctorName: d.prescriberName || d.doctor || 'Praticien prescripteur',
            examNames: examNamesList,
            examCategory: isImaging ? 'Imagerie' : 'Biologie',
            status: d.status || 'Effectué',
            motif: `Prescription : ${examNamesList.slice(0, 3).join(', ')}${examNamesList.length > 3 ? '...' : ''}`
          };
        });
      compileAll();
    }, () => compileAll());

    // D. Emergency Patients
    const unsubEmergency = onSnapshot(collection(db, 'emergency_patients'), (snap) => {
      emergencyEvents = snap.docs
        .filter(docSnap => belongsToTenant(docSnap.data(), activeTenantId))
        .map(docSnap => {
          const d = docSnap.data();
          const dateStr = d.arrivalTimestamp ? d.arrivalTimestamp.split('T')[0] : (d.createdAt ? d.createdAt.split('T')[0] : 'N/A');
          const ts = d.arrivalTimestamp ? new Date(d.arrivalTimestamp).getTime() : (d.createdAt ? new Date(d.createdAt).getTime() : Date.now());
          return {
            id: `urg-${docSnap.id}`,
            patientId: d.patientId || d.id || '',
            patientName: `${d.lastName || ''} ${d.firstName || ''}`.trim() || d.patientName || 'Patient',
            dmeId: d.dmeId || d.id || '',
            type: 'URGENCE',
            date: dateStr,
            time: d.arrivalTimestamp ? new Date(d.arrivalTimestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : undefined,
            timestamp: isNaN(ts) ? Date.now() : ts,
            service: 'Service des Urgences',
            doctorName: d.responsibleStaff || d.discharge?.professional || d.management?.doctorName || d.triage?.nurseName || 'Équipe Urgences',
            motif: d.arrivalMotif || d.triage?.motif || d.motif || 'Passage aux Urgences',
            priority: d.status || d.triage?.level || d.priority || 'URGENCE',
            mainDiagnosis: d.discharge?.conclusion || d.followUps?.[d.followUps.length - 1]?.conclusion || d.management?.diagnosis || 'Prise en charge d\'urgence'
          };
        });
      compileAll();
    }, () => compileAll());

    // E. Service Queues / Past Orientations & Completed Consultations
    const unsubQueues = onSnapshot(collection(db, 'service_queues'), (snap) => {
      serviceQueues = snap.docs
        .filter(docSnap => belongsToTenant(docSnap.data(), activeTenantId))
        .map(docSnap => {
          const d = docSnap.data();
          const dateStr = d.createdAt ? d.createdAt.split('T')[0] : 'N/A';
          const ts = d.createdAt ? new Date(d.createdAt).getTime() : Date.now();
          const isConsulted = d.status === 'consulted' || d.status === 'ready_for_discharge' || d.isClotured === true;
          return {
            id: `queue-${docSnap.id}`,
            patientId: d.patientId || '',
            patientName: `${d.lastName || ''} ${d.firstName || ''}`.trim() || 'Patient',
            dmeId: d.dmeId || d.patientId || '',
            type: isConsulted ? 'CONSULTATION' : 'ORIENTATION',
            date: dateStr,
            time: d.createdAt ? new Date(d.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : undefined,
            timestamp: isNaN(ts) ? Date.now() : ts,
            service: d.service || d.queueName || 'Accueil & Triage',
            doctorName: d.practitionerName || d.agentName || 'Agent d\'Accueil',
            motif: isConsulted ? `Consultation clôturée (${d.service || d.queueName || 'Médecine'})` : `Admission & Orientation : ${d.motif || d.service || 'Général'}`,
            priority: d.priority || 'normal',
            mainDiagnosis: isConsulted ? 'Session médicale terminée' : undefined
          };
        });
      compileAll();
    }, () => compileAll());

    // F. Maternity Admissions
    const unsubMaternity = onSnapshot(collection(db, 'maternity_admissions'), (snap) => {
      maternityAdmissions = snap.docs
        .filter(docSnap => belongsToTenant(docSnap.data(), activeTenantId))
        .map(docSnap => {
          const d = docSnap.data();
          const dateStr = d.admissionDate || (d.createdAt ? d.createdAt.split('T')[0] : 'N/A');
          const ts = d.createdAt ? new Date(d.createdAt).getTime() : Date.now();
          return {
            id: `mat-${docSnap.id}`,
            patientId: d.patientId || '',
            patientName: d.patientName || 'Patiente',
            dmeId: d.dmeId || d.patientId || '',
            type: 'MATERNITE',
            date: dateStr,
            time: d.admissionTime || undefined,
            timestamp: isNaN(ts) ? Date.now() : ts,
            service: 'Maternité & Salle d\'Accouchement',
            doctorName: d.midwife || d.doctor || 'Sage-femme de garde',
            motif: d.reason || d.motif || 'Suivi obstétrical / Accouchement',
            mainDiagnosis: d.gestationalAge ? `Grossesse (${d.gestationalAge} SA)` : 'Suivi Maternité'
          };
        });
      compileAll();
    }, () => compileAll());

    // G. Nursing Acts (Soins Infirmiers & Soins Ambulatoires / Lambda)
    const unsubNursing = onSnapshot(collection(db, 'nursing_acts'), (snap) => {
      nursingActs = snap.docs
        .filter(docSnap => belongsToTenant(docSnap.data(), activeTenantId))
        .map(docSnap => {
          const d = docSnap.data();
          const dateStr = d.date || (d.createdAt ? d.createdAt.split('T')[0] : 'N/A');
          const ts = d.createdAt ? new Date(d.createdAt).getTime() : Date.now();
          const isFait = d.status === 'FAIT' || d.status === 'DONE';
          return {
            id: `care-${docSnap.id}`,
            patientId: d.patientId || '',
            patientName: d.patientName || 'Patient',
            dmeId: d.dmeId || d.patientId || '',
            type: 'SOINS' as const,
            date: dateStr,
            time: d.time || (d.createdAt ? new Date(d.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : undefined),
            timestamp: isNaN(ts) ? Date.now() : ts,
            service: 'Soins Infirmiers',
            doctorName: d.prescribedBy || d.prescriberName || d.executedBy || 'Soignant',
            motif: d.actType || d.instructions || 'Soin infirmier administré',
            mainDiagnosis: d.instructions || d.actType || 'Soin infirmier',
            status: isFait ? 'Exécuté' : 'En attente'
          };
        });
      compileAll();
    }, () => compileAll());

    return () => {
      unsubConsultations();
      unsubPatientHistory();
      unsubDischarges();
      unsubDischargesCompleted();
      unsubLab();
      unsubEmergency();
      unsubQueues();
      unsubMaternity();
      unsubNursing();
    };
  }, [activeTenantId]);

  // Filtered patient list for selector dropdown
  const filteredPatientsForDropdown = useMemo(() => {
    if (!patientSearchTerm.trim()) return patients.slice(0, 15);
    const term = patientSearchTerm.toLowerCase().trim();
    return patients.filter(p => {
      const fullName = `${p.lastName || ''} ${p.firstName || ''}`.toLowerCase();
      const idStr = `${p.id || ''} ${p.patientId || ''}`.toLowerCase();
      const phone = `${p.phone || ''}`.toLowerCase();
      return fullName.includes(term) || idStr.includes(term) || phone.includes(term);
    }).slice(0, 20);
  }, [patients, patientSearchTerm]);

  // Selected Patient Details Object
  const currentActivePatient = useMemo(() => {
    if (selectedPatientId === 'ALL') return null;
    return patients.find(p => p.id === selectedPatientId || p.patientId === selectedPatientId) || null;
  }, [selectedPatientId, patients]);

  // Distinct doctors list for filter
  const availableDoctors = useMemo(() => {
    const docSet = new Set<string>();
    allEvents.forEach(e => {
      if (e.doctorName && e.doctorName !== 'Dr. Référent' && e.doctorName !== 'N/A') {
        docSet.add(e.doctorName);
      }
    });
    return Array.from(docSet).sort();
  }, [allEvents]);

  // Filtered Events Engine
  const filteredEvents = useMemo(() => {
    return allEvents.filter(event => {
      // 1. Patient match
      if (selectedPatientId !== 'ALL') {
        const matchesId = event.patientId === selectedPatientId || 
                          event.dmeId === selectedPatientId ||
                          (currentActivePatient && (
                            event.patientId === currentActivePatient.id || 
                            event.patientId === currentActivePatient.patientId ||
                            event.dmeId === currentActivePatient.id ||
                            event.dmeId === currentActivePatient.patientId
                          ));
        if (!matchesId) return false;
      }

      // 2. Dynamic Active-Service filter
      if (selectedServiceType !== 'ALL') {
        const srvTarget = selectedServiceType.toLowerCase();
        const evService = String(event.service || '').toLowerCase();
        const evType = String(event.type || '').toLowerCase();
        const matchesDirect = evService.includes(srvTarget) || srvTarget.includes(evService);
        const matchesSemantic =
          (srvTarget.includes('consult') && evType === 'consultation') ||
          (srvTarget.includes('hospitalis') && evType === 'hospitalisation') ||
          (srvTarget.includes('labo') && evType === 'laboratoire') ||
          (srvTarget.includes('imager') && evType === 'imagerie') ||
          (srvTarget.includes('matern') && evType === 'maternite') ||
          (srvTarget.includes('urgence') && evType === 'urgence') ||
          ((srvTarget.includes('soin') || srvTarget.includes('infirm')) && evType === 'soins');
        if (!matchesDirect && !matchesSemantic) return false;
      }

      // 3. Date Range Filter
      const eventDate = new Date(event.timestamp);
      const now = new Date();

      if (dateRangePreset === 'TODAY') {
        const todayStr = new Date().toISOString().split('T')[0];
        if (event.date !== todayStr) return false;
      } else if (dateRangePreset === '7D') {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(now.getDate() - 7);
        if (eventDate < sevenDaysAgo) return false;
      } else if (dateRangePreset === '30D') {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(now.getDate() - 30);
        if (eventDate < thirtyDaysAgo) return false;
      } else if (dateRangePreset === '6M') {
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(now.getMonth() - 6);
        if (eventDate < sixMonthsAgo) return false;
      } else if (dateRangePreset === '1Y') {
        const oneYearAgo = new Date();
        oneYearAgo.setFullYear(now.getFullYear() - 1);
        if (eventDate < oneYearAgo) return false;
      } else if (dateRangePreset === 'CUSTOM') {
        if (customStartDate && event.date < customStartDate) return false;
        if (customEndDate && event.date > customEndDate) return false;
      }

      // 4. Doctor Filter
      if (selectedDoctor !== 'ALL' && event.doctorName !== selectedDoctor) {
        return false;
      }

      // 5. Keyword search
      if (searchKeyword.trim()) {
        const kw = searchKeyword.toLowerCase().trim();
        const matchMotif = (event.motif || '').toLowerCase().includes(kw);
        const matchDiag = (event.mainDiagnosis || '').toLowerCase().includes(kw);
        const matchDoctor = (event.doctorName || '').toLowerCase().includes(kw);
        const matchService = (event.service || '').toLowerCase().includes(kw);
        const matchExams = (event.examNames || []).some(name => name.toLowerCase().includes(kw));
        const matchPatient = (event.patientName || '').toLowerCase().includes(kw);
        const matchId = (event.patientId || '').toLowerCase().includes(kw) || (event.dmeId || '').toLowerCase().includes(kw);

        if (!matchMotif && !matchDiag && !matchDoctor && !matchService && !matchExams && !matchPatient && !matchId) {
          return false;
        }
      }

      return true;
    });
  }, [allEvents, selectedPatientId, currentActivePatient, selectedServiceType, dateRangePreset, customStartDate, customEndDate, selectedDoctor, searchKeyword]);

  // Statistics Summary
  const stats = useMemo(() => {
    const total = filteredEvents.length;
    const consultationsCount = filteredEvents.filter(e => e.type === 'CONSULTATION').length;
    const hospitalizationsCount = filteredEvents.filter(e => e.type === 'HOSPITALISATION').length;
    const labCount = filteredEvents.filter(e => e.type === 'LABORATOIRE' || e.type === 'IMAGERIE').length;
    const emergencyCount = filteredEvents.filter(e => e.type === 'URGENCE').length;
    const maternityCount = filteredEvents.filter(e => e.type === 'MATERNITE').length;
    const sortiesCount = filteredEvents.filter(e => e.type === 'SORTIE').length;
    const soinsCount = filteredEvents.filter(e => e.type === 'SOINS').length;

    return { total, consultationsCount, hospitalizationsCount, labCount, emergencyCount, maternityCount, sortiesCount, soinsCount };
  }, [filteredEvents]);

  const handlePrintArchive = () => {
    window.print();
  };

  const handleExportCSV = () => {
    if (filteredEvents.length === 0) {
      alert("Aucune donnée à exporter.");
      return;
    }
    const headers = ['Date', 'Heure', 'Type', 'Patient', 'ID DME', 'Service', 'Praticien', 'Motif / Diagnostic', 'Statut'];
    const rows = filteredEvents.map(e => [
      `"${e.date || ''}"`,
      `"${e.time || ''}"`,
      `"${e.type || ''}"`,
      `"${(e.patientName || '').replace(/"/g, '""')}"`,
      `"${e.dmeId || e.patientId || ''}"`,
      `"${(e.service || '').replace(/"/g, '""')}"`,
      `"${(e.doctorName || '').replace(/"/g, '""')}"`,
      `"${(e.motif || e.mainDiagnosis || '').replace(/"/g, '""')}"`,
      `"${e.status || ''}"`
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `archives_patients_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const resetFilters = () => {
    setSelectedServiceType('ALL');
    setDateRangePreset('ALL');
    setCustomStartDate('');
    setCustomEndDate('');
    setSelectedDoctor('ALL');
    setSearchKeyword('');
  };

  const getEventBadge = (type: PatientHistoryEvent['type']) => {
    switch (type) {
      case 'CONSULTATION':
        return {
          icon: Stethoscope,
          label: 'Consultation',
          color: 'bg-blue-50 text-blue-700 border-blue-200',
          dot: 'bg-blue-600'
        };
      case 'SORTIE':
        return {
          icon: LogOut,
          label: 'Sortie Administrative',
          color: 'bg-emerald-50 text-emerald-700 border-emerald-200',
          dot: 'bg-emerald-600'
        };
      case 'HOSPITALISATION':
        return {
          icon: BedDouble,
          label: 'Hospitalisation',
          color: 'bg-purple-50 text-purple-700 border-purple-200',
          dot: 'bg-purple-600'
        };
      case 'LABORATOIRE':
        return {
          icon: Beaker,
          label: 'Laboratoire',
          color: 'bg-emerald-50 text-emerald-700 border-emerald-200',
          dot: 'bg-emerald-600'
        };
      case 'IMAGERIE':
        return {
          icon: Eye,
          label: 'Imagerie Médicale',
          color: 'bg-cyan-50 text-cyan-700 border-cyan-200',
          dot: 'bg-cyan-600'
        };
      case 'MATERNITE':
        return {
          icon: Baby,
          label: 'Maternité / CPN',
          color: 'bg-pink-50 text-pink-700 border-pink-200',
          dot: 'bg-pink-600'
        };
      case 'URGENCE':
        return {
          icon: ShieldAlert,
          label: 'Urgences',
          color: 'bg-rose-50 text-rose-700 border-rose-200',
          dot: 'bg-rose-600'
        };
      case 'SOINS':
        return {
          icon: Syringe,
          label: 'Soin Infirmier',
          color: 'bg-teal-50 text-teal-700 border-teal-200',
          dot: 'bg-teal-600'
        };
      default:
        return {
          icon: History,
          label: 'Orientation',
          color: 'bg-slate-50 text-slate-700 border-slate-200',
          dot: 'bg-slate-600'
        };
    }
  };


  // Per-Patient Grouping (1 row per canonical patient_id)
  const groupedPatientsHistory = useMemo(() => {
    const patientLookup = new Map<string, Patient>();
    patients.forEach((p: any) => {
      if (p.id) patientLookup.set(String(p.id), p);
      if (p.patientId) patientLookup.set(String(p.patientId), p);
      if (p.dmeId) patientLookup.set(String(p.dmeId), p);
    });

    const groups = new Map<string, {
      canonicalKey: string;
      patientId: string;
      dmeId: string;
      patientName: string;
      patientObj: Patient | null;
      totalVisits: number;
      lastVisitDate: string;
      lastVisitTime: string;
      lastTimestamp: number;
      lastService: string;
      globalStatus: 'ACTIF' | 'CLOTURE';
      events: PatientHistoryEvent[];
    }>();

    filteredEvents.forEach((ev) => {
      const rawId = ev.patientId || ev.dmeId || ev.patientName || ev.id;
      const matchedPt = patientLookup.get(String(ev.patientId || '')) || patientLookup.get(String(ev.dmeId || '')) || null;
      const primaryId = (matchedPt as any)?.patientId || matchedPt?.id || ev.patientId || ev.dmeId || rawId;
      const canonKey = /^(PAT|DME)-/i.test(String(primaryId))
        ? String(primaryId).replace(/^(PAT|DME)-/i, 'CANON-')
        : String(primaryId);

      const isActif =
        activeVisitPatientIds.has(canonKey) ||
        (ev.patientId ? activeVisitPatientIds.has(String(ev.patientId).replace(/^(PAT|DME)-/i, 'CANON-')) : false);

      const resolvedName = matchedPt
        ? `${matchedPt.lastName || ''} ${matchedPt.firstName || ''}`.trim() || ev.patientName
        : ev.patientName || 'Patient';

      const existing = groups.get(canonKey);
      if (!existing) {
        groups.set(canonKey, {
          canonicalKey: canonKey,
          patientId: primaryId,
          dmeId: (matchedPt as any)?.dmeId || matchedPt?.id || ev.dmeId || primaryId,
          patientName: resolvedName,
          patientObj: matchedPt,
          totalVisits: 1,
          lastVisitDate: ev.date || 'N/A',
          lastVisitTime: ev.time || '',
          lastTimestamp: ev.timestamp || 0,
          lastService: ev.service || ev.type,
          globalStatus: isActif ? 'ACTIF' : 'CLOTURE',
          events: [ev],
        });
      } else {
        existing.events.push(ev);
        existing.totalVisits = existing.events.length;
        if (isActif) existing.globalStatus = 'ACTIF';
        if ((ev.timestamp || 0) > existing.lastTimestamp) {
          existing.lastTimestamp = ev.timestamp || 0;
          existing.lastVisitDate = ev.date || existing.lastVisitDate;
          existing.lastVisitTime = ev.time || '';
          existing.lastService = ev.service || ev.type;
        }
      }
    });

    return Array.from(groups.values())
      .filter((g) => statusFilter === 'ALL' || g.globalStatus === statusFilter)
      .sort((a, b) => b.lastTimestamp - a.lastTimestamp);
  }, [filteredEvents, patients, activeVisitPatientIds, statusFilter]);

  return (
    <div className="space-y-2.5 animate-in fade-in duration-200">
      {/* Compact Single-Line Control Bar (Zero Redundancy, Driven Strictly by Active Hospital Services) */}
      <div className={`px-3 py-2 rounded-2xl border shadow-2xs flex flex-wrap items-center gap-2 ${
        theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
      }`}>
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
          <input
            type="text"
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            placeholder="Rechercher patient, DME, motif, médecin..."
            className={`w-full pl-9 pr-7 py-2 rounded-xl border text-xs font-semibold outline-none transition-all ${
              theme === 'dark'
                ? 'bg-slate-800 border-slate-700 text-slate-100 focus:border-blue-500'
                : 'bg-slate-50 border-slate-200 text-slate-800 focus:border-blue-500 focus:bg-white'
            }`}
          />
          {searchKeyword && (
            <button
              type="button"
              onClick={() => setSearchKeyword('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              <X size={13} />
            </button>
          )}
        </div>

        {/* Dynamic Active-Service Dropdown */}
        <select
          value={selectedServiceType}
          onChange={(e) => setSelectedServiceType(e.target.value)}
          className={`px-3 py-2 rounded-xl border text-xs font-bold outline-none cursor-pointer ${
            theme === 'dark'
              ? 'bg-slate-800 border-slate-700 text-slate-200'
              : 'bg-slate-50 border-slate-200 text-slate-700'
          }`}
        >
          <option value="ALL">Tous les services ({activeHospitalServices.length})</option>
          {activeHospitalServices.map((srv: any) => (
            <option key={srv.id} value={srv.name}>{srv.name}</option>
          ))}
        </select>

        {/* Period Dropdown */}
        <select
          value={dateRangePreset}
          onChange={(e) => setDateRangePreset(e.target.value as any)}
          className={`px-3 py-2 rounded-xl border text-xs font-bold outline-none cursor-pointer ${
            theme === 'dark'
              ? 'bg-slate-800 border-slate-700 text-slate-200'
              : 'bg-slate-50 border-slate-200 text-slate-700'
          }`}
        >
          <option value="ALL">Toutes périodes</option>
          <option value="TODAY">Aujourd&apos;hui</option>
          <option value="7D">7 jours</option>
          <option value="30D">30 jours</option>
        </select>

        {/* Global Status Filter */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as any)}
          className={`px-3 py-2 rounded-xl border text-xs font-bold outline-none cursor-pointer ${
            theme === 'dark'
              ? 'bg-slate-800 border-slate-700 text-slate-200'
              : 'bg-slate-50 border-slate-200 text-slate-700'
          }`}
        >
          <option value="ALL">Tous statuts</option>
          <option value="ACTIF">Cycle Actif</option>
          <option value="CLOTURE">Clôturé / Archivé</option>
        </select>

        {/* Compact Mode Switch: Patients vs Archives Hospitalisation */}
        <div className="inline-flex bg-slate-100 dark:bg-slate-800 p-0.5 rounded-xl border border-slate-200 dark:border-slate-700">
          <button
            type="button"
            onClick={() => setViewMode('patients')}
            className={`px-2.5 py-1.5 rounded-lg text-[11px] font-black transition-all cursor-pointer ${
              viewMode === 'patients' ? 'bg-white dark:bg-slate-900 text-blue-600 shadow-2xs' : 'text-slate-500'
            }`}
          >
            Patients ({groupedPatientsHistory.length})
          </button>
          <button
            type="button"
            onClick={() => setViewMode('hospitalisations')}
            className={`px-2.5 py-1.5 rounded-lg text-[11px] font-black transition-all cursor-pointer flex items-center gap-1 ${
              viewMode === 'hospitalisations' ? 'bg-white dark:bg-slate-900 text-blue-600 shadow-2xs' : 'text-slate-500'
            }`}
          >
            <BedDouble size={12} />
            Séjours ({closedHospitalStays.length})
          </button>
        </div>

        <button
          type="button"
          onClick={handleExportCSV}
          title="Exporter CSV"
          className="p-2 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-xl transition-all cursor-pointer"
        >
          <Download size={14} />
        </button>

        {(searchKeyword || selectedServiceType !== 'ALL' || dateRangePreset !== 'ALL' || statusFilter !== 'ALL' || selectedPatientId !== 'ALL') && (
          <button
            type="button"
            onClick={() => {
              resetFilters();
              setStatusFilter('ALL');
              setSelectedPatientId('ALL');
            }}
            className="px-2.5 py-1.5 text-[11px] font-bold text-rose-600 hover:bg-rose-50 rounded-xl cursor-pointer"
          >
            Réinitialiser
          </button>
        )}
      </div>

      {/* Dominant Table-First Workspace */}
      {viewMode === 'patients' && (
        <div className={`rounded-2xl border shadow-xs overflow-hidden min-h-[70vh] flex flex-col ${
          theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
        }`}>
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className={`text-[10px] font-black uppercase tracking-wider border-b ${
                  theme === 'dark'
                    ? 'bg-slate-950/60 border-slate-800 text-slate-400'
                    : 'bg-slate-50 border-slate-200 text-slate-500'
                }`}>
                  <th className="py-3 px-4">Patient</th>
                  <th className="py-3 px-3">DME / ID</th>
                  <th className="py-3 px-3 text-center">Total Visites</th>
                  <th className="py-3 px-3">Dernière Visite</th>
                  <th className="py-3 px-3">Dernier Service</th>
                  <th className="py-3 px-3">Statut Global</th>
                  <th className="py-3 px-4 text-right">Détail</th>
                </tr>
              </thead>
              <tbody className={`divide-y text-xs ${theme === 'dark' ? 'divide-slate-800' : 'divide-slate-100'}`}>
                {isLoading ? (
                  <tr>
                    <td colSpan={7} className="py-16 text-center text-slate-400 font-bold">
                      Chargement de l&apos;historique...
                    </td>
                  </tr>
                ) : groupedPatientsHistory.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-20 text-center text-slate-400 font-bold">
                      Aucun patient trouvé pour les filtres sélectionnés.
                    </td>
                  </tr>
                ) : (
                  groupedPatientsHistory.map((g) => (
                    <tr
                      key={g.canonicalKey}
                      onClick={() => setDetailPatientGroup(g)}
                      className={`transition-colors cursor-pointer ${
                        theme === 'dark' ? 'hover:bg-slate-800/60' : 'hover:bg-blue-50/40'
                      }`}
                    >
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 font-black text-xs flex items-center justify-center shrink-0">
                            {(g.patientName[0] || 'P').toUpperCase()}
                          </div>
                          <span className={`font-extrabold ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>
                            {g.patientName}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-3 font-mono text-[11px] font-bold text-slate-500">
                        {g.patientId}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span className="inline-flex items-center justify-center px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-black text-[11px]">
                          {g.totalVisits}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-mono text-[11px] font-bold text-slate-700 dark:text-slate-300 whitespace-nowrap">
                        {g.lastVisitDate} {g.lastVisitTime ? `• ${g.lastVisitTime}` : ''}
                      </td>
                      <td className="py-3 px-3">
                        <span className="text-[11px] font-bold text-blue-600 dark:text-blue-400">
                          {g.lastService}
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        {g.globalStatus === 'ACTIF' ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-100 text-emerald-800 border border-emerald-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            Cycle Actif
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-slate-100 text-slate-600 border border-slate-200">
                            Clôturé
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <span className="inline-flex items-center gap-1 text-[11px] font-black text-blue-600">
                          <Eye size={13} /> Voir <ChevronRight size={13} />
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Closed Hospital Stays Archive View */}
      {viewMode === 'hospitalisations' && (() => {
        const visibleStays = closedHospitalStays.filter((s) => {
          if (!searchKeyword.trim()) return true;
          const q = searchKeyword.toLowerCase();
          return (
            s.patientName.toLowerCase().includes(q) ||
            s.patientId.toLowerCase().includes(q) ||
            (s.reason || '').toLowerCase().includes(q)
          );
        });
        return (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden min-h-[68vh]">
            {visibleStays.length === 0 ? (
              <div className="p-16 text-center space-y-2">
                <BedDouble size={32} className="mx-auto text-slate-300" />
                <p className="font-black text-sm text-slate-700">Aucun séjour d&apos;hospitalisation clôturé</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {visibleStays.map((stay) => (
                  <button
                    key={stay.id}
                    type="button"
                    onClick={() => setSelectedArchivedStay(stay)}
                    className="w-full p-4 text-left hover:bg-blue-50/40 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer"
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-black text-sm text-slate-900">{stay.patientName}</span>
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[10px] font-mono font-bold">
                          {stay.roomName} — {stay.bedName}
                        </span>
                        <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-black uppercase">
                          Séjour Clôturé
                        </span>
                      </div>
                      <p className="text-xs font-semibold text-slate-600">
                        Motif : <strong className="text-slate-800">{stay.reason || 'Hospitalisation'}</strong> • Médecin : {stay.doctorName}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs font-black text-blue-600 shrink-0">
                      <Eye size={14} /> Ouvrir l&apos;archive <ChevronRight size={14} />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      {/* Click-to-Detail Patient Visits Drawer/Modal */}
      {detailPatientGroup && (
        <div className="fixed inset-0 z-[95] bg-slate-950/60 backdrop-blur-xs flex justify-end animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-2xl h-full shadow-2xl border-l border-slate-200 flex flex-col animate-in slide-in-from-right duration-200">
            <div className="p-4 sm:p-5 border-b border-slate-200 flex items-center justify-between gap-3 bg-slate-50">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-base font-black text-slate-900 truncate">{detailPatientGroup.patientName}</h3>
                  <span className="px-2 py-0.5 rounded-md bg-blue-100 text-blue-800 font-mono text-[10px] font-black">
                    {detailPatientGroup.patientId}
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                    detailPatientGroup.globalStatus === 'ACTIF'
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-slate-200 text-slate-600'
                  }`}>
                    {detailPatientGroup.globalStatus === 'ACTIF' ? 'Cycle Actif' : 'Clôturé'}
                  </span>
                </div>
                <p className="text-[11px] font-semibold text-slate-500 mt-0.5">
                  {detailPatientGroup.totalVisits} passage(s) enregistrés • Dernier service : {detailPatientGroup.lastService}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {onSelectPatientForAdmission && detailPatientGroup.patientObj && (
                  <button
                    type="button"
                    onClick={() => {
                      const ptObj = detailPatientGroup.patientObj;
                      setDetailPatientGroup(null);
                      onSelectPatientForAdmission(ptObj);
                    }}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-[11px] font-black uppercase tracking-wider cursor-pointer flex items-center gap-1"
                  >
                    Orienter <ArrowRight size={12} />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setDetailPatientGroup(null)}
                  className="p-2 rounded-xl bg-white border border-slate-200 text-slate-500 hover:text-rose-600 cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3 custom-scrollbar">
              {/* Closed Hospital Stays for this Patient */}
              {(() => {
                const ptStays = closedHospitalStays.filter(
                  s => s.patientId === detailPatientGroup.patientId || s.patientId === detailPatientGroup.dmeId
                );
                if (ptStays.length === 0) return null;
                return (
                  <div className="p-3 rounded-2xl bg-indigo-50/70 border border-indigo-200 space-y-2">
                    <p className="text-[10px] font-black uppercase tracking-wider text-indigo-800">
                      Séjours d&apos;Hospitalisation Archivés ({ptStays.length})
                    </p>
                    {ptStays.map((st) => (
                      <button
                        key={st.id}
                        type="button"
                        onClick={() => setSelectedArchivedStay(st)}
                        className="w-full p-2.5 rounded-xl bg-white border border-indigo-200 hover:border-indigo-400 text-left flex items-center justify-between gap-2 cursor-pointer"
                      >
                        <div className="text-xs">
                          <span className="font-black text-slate-900">{st.roomName} — {st.bedName}</span>
                          <span className="block text-[10px] text-slate-500">{st.reason} • {st.doctorName}</span>
                        </div>
                        <span className="text-[10px] font-black text-indigo-700 flex items-center gap-1 shrink-0">
                          <Eye size={12} /> Fiche de Suivi
                        </span>
                      </button>
                    ))}
                  </div>
                );
              })()}

              {/* Chronological Visits List */}
              {detailPatientGroup.events.map((ev: PatientHistoryEvent) => {
                const style = getEventBadge(ev.type);
                const IconComp = style.icon;
                return (
                  <div key={ev.id} className="p-3.5 rounded-2xl border border-slate-200 bg-white space-y-1.5 shadow-2xs">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-black uppercase ${style.color}`}>
                        <IconComp size={11} />
                        {style.label}
                      </span>
                      <span className="text-[11px] font-mono font-bold text-slate-500">
                        {ev.date} {ev.time ? `• ${ev.time}` : ''}
                      </span>
                    </div>
                    <p className="text-xs font-extrabold text-slate-900">{ev.motif || ev.service}</p>
                    {ev.mainDiagnosis && (
                      <p className="text-[11px] font-semibold text-slate-600">{ev.mainDiagnosis}</p>
                    )}
                    <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 pt-1">
                      <span>Service : {ev.service}</span>
                      {ev.doctorName && <span>Praticien : {ev.doctorName}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Read-Only Archive Modal rendering the exact same Fiche de Suivi */}
      {selectedArchivedStay && (
        <div className="fixed inset-0 z-[100] bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6">
          <div className="bg-slate-100 rounded-3xl w-full max-w-6xl max-h-[94vh] overflow-y-auto p-4 sm:p-6 shadow-2xl border border-slate-300">
            <InpatientTrackingDashboard
              stay={selectedArchivedStay}
              readOnly={true}
              currentUser={user}
              onClose={() => setSelectedArchivedStay(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default HistoriquePatient;
