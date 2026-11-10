import React, { useState, useEffect, useMemo } from 'react';
import { 
  History, Search, Filter, Calendar, Stethoscope, BedDouble, 
  Beaker, Baby, ShieldAlert, User, Clock, ArrowRight, ShieldCheck, 
  Lock, Eye, RefreshCw, X, ChevronRight, FileText, CheckCircle2,
  CalendarRange, AlertCircle, Activity, UserCheck, Layers, Sparkles
} from 'lucide-react';
import { Patient, User as UserType } from '../../types';
import { db } from '../../src/firebase';
import { collection, onSnapshot, query, orderBy, getDocs } from 'firebase/firestore';

export interface PatientHistoryEvent {
  id: string;
  patientId: string;
  patientName: string;
  dmeId?: string;
  type: 'CONSULTATION' | 'HOSPITALISATION' | 'LABORATOIRE' | 'IMAGERIE' | 'MATERNITE' | 'URGENCE' | 'ORIENTATION';
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
  selectedPatient?: Patient | null;
  onSelectPatientForAdmission?: (patient: Patient) => void;
  theme?: 'light' | 'dark';
}

const HistoriquePatient: React.FC<HistoriquePatientProps> = ({
  user,
  selectedPatient: propSelectedPatient,
  onSelectPatientForAdmission,
  theme = 'light'
}) => {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<string>(propSelectedPatient?.id || propSelectedPatient?.patientId || 'ALL');
  const [patientSearchTerm, setPatientSearchTerm] = useState('');
  const [allEvents, setAllEvents] = useState<PatientHistoryEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'timeline' | 'table'>('timeline');

  // Filters
  const [selectedServiceType, setSelectedServiceType] = useState<string>('ALL');
  const [dateRangePreset, setDateRangePreset] = useState<'ALL' | '30D' | '6M' | '1Y' | 'CUSTOM'>('ALL');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');
  const [selectedDoctor, setSelectedDoctor] = useState<string>('ALL');
  const [searchKeyword, setSearchKeyword] = useState<string>('');

  // 1. Fetch patients list for selector
  useEffect(() => {
    const unsubPatients = onSnapshot(collection(db, 'patients'), (snapshot) => {
      const pList: Patient[] = snapshot.docs.map(d => ({
        id: d.id,
        ...d.data()
      } as Patient));
      setPatients(pList);
    }, (err) => console.error("Error fetching patients in Historique:", err));

    return () => unsubPatients();
  }, []);

  // Update selectedPatientId when prop changes
  useEffect(() => {
    if (propSelectedPatient?.id || propSelectedPatient?.patientId) {
      setSelectedPatientId(propSelectedPatient.id || propSelectedPatient.patientId);
    }
  }, [propSelectedPatient]);

  // 2. Fetch history records across all modules
  useEffect(() => {
    setIsLoading(true);
    let consultations: PatientHistoryEvent[] = [];
    let hospitalizations: PatientHistoryEvent[] = [];
    let labRequests: PatientHistoryEvent[] = [];
    let emergencyEvents: PatientHistoryEvent[] = [];
    let serviceQueues: PatientHistoryEvent[] = [];
    let maternityAdmissions: PatientHistoryEvent[] = [];

    const compileAll = () => {
      const merged = [
        ...consultations,
        ...hospitalizations,
        ...labRequests,
        ...emergencyEvents,
        ...serviceQueues,
        ...maternityAdmissions
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
      consultations = snap.docs.map(docSnap => {
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

    // B. Hospitalizations / Discharges
    const unsubDischarges = onSnapshot(collection(db, 'discharges_waiting'), (snap) => {
      hospitalizations = snap.docs.map(docSnap => {
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

    // C. Lab Requests (Exam names only, strictly NO sensitive biological results)
    const unsubLab = onSnapshot(collection(db, 'lab_requests'), (snap) => {
      labRequests = snap.docs.map(docSnap => {
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
      emergencyEvents = snap.docs.map(docSnap => {
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

    // E. Service Queues / Past Orientations
    const unsubQueues = onSnapshot(collection(db, 'service_queues'), (snap) => {
      serviceQueues = snap.docs.map(docSnap => {
        const d = docSnap.data();
        const dateStr = d.createdAt ? d.createdAt.split('T')[0] : 'N/A';
        const ts = d.createdAt ? new Date(d.createdAt).getTime() : Date.now();
        return {
          id: `queue-${docSnap.id}`,
          patientId: d.patientId || '',
          patientName: `${d.lastName || ''} ${d.firstName || ''}`.trim() || 'Patient',
          dmeId: d.dmeId || d.patientId || '',
          type: 'ORIENTATION',
          date: dateStr,
          time: d.createdAt ? new Date(d.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : undefined,
          timestamp: isNaN(ts) ? Date.now() : ts,
          service: d.service || d.queueName || 'Accueil & Triage',
          doctorName: d.agentName || 'Agent d\'Accueil',
          motif: `Admission & Orientation : ${d.motif || d.service || 'Général'}`,
          priority: d.priority || 'normal'
        };
      });
      compileAll();
    }, () => compileAll());

    // F. Maternity Admissions
    const unsubMaternity = onSnapshot(collection(db, 'maternity_admissions'), (snap) => {
      maternityAdmissions = snap.docs.map(docSnap => {
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

    return () => {
      unsubConsultations();
      unsubDischarges();
      unsubLab();
      unsubEmergency();
      unsubQueues();
      unsubMaternity();
    };
  }, []);

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

      // 2. Service / Event Type filter
      if (selectedServiceType !== 'ALL') {
        if (selectedServiceType === 'CONSULTATION' && event.type !== 'CONSULTATION') return false;
        if (selectedServiceType === 'HOSPITALISATION' && event.type !== 'HOSPITALISATION') return false;
        if (selectedServiceType === 'LABORATOIRE' && event.type !== 'LABORATOIRE') return false;
        if (selectedServiceType === 'IMAGERIE' && event.type !== 'IMAGERIE') return false;
        if (selectedServiceType === 'MATERNITE' && event.type !== 'MATERNITE') return false;
        if (selectedServiceType === 'URGENCE' && event.type !== 'URGENCE') return false;
      }

      // 3. Date Range Filter
      const eventDate = new Date(event.timestamp);
      const now = new Date();

      if (dateRangePreset === '30D') {
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

    return { total, consultationsCount, hospitalizationsCount, labCount, emergencyCount, maternityCount };
  }, [filteredEvents]);

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
      default:
        return {
          icon: History,
          label: 'Orientation',
          color: 'bg-slate-50 text-slate-700 border-slate-200',
          dot: 'bg-slate-600'
        };
    }
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      {/* 1. Compact Header Banner & Security Notice */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-blue-950 p-4 sm:p-5 rounded-2xl text-white shadow-sm relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600/30 border border-blue-400/30 flex items-center justify-center text-blue-400 shrink-0">
              <History size={18} />
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-extrabold tracking-tight leading-tight">
                Historique Médical & Visites Patient
              </h1>
              <p className="text-slate-300 text-xs font-medium mt-0.5">
                Consultez l'historique complet des passages, consultations et séjours antérieurs.
              </p>
            </div>
          </div>

          {/* Read-Only Confidentiality Badge */}
          <div className="bg-slate-800/80 border border-blue-400/20 backdrop-blur-md px-3.5 py-2 rounded-xl flex items-center gap-2.5 shrink-0">
            <div className="w-7 h-7 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
              <Lock size={14} />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1">
                <ShieldCheck size={11} /> Lecture Seule (Secret Médical)
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Patient Selector & Quick Context Header */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
          {/* Patient Search & Dropdown Picker */}
          <div className="lg:col-span-5 space-y-1.5 relative">
            <label className="text-xs font-bold text-slate-600 block">
              Dossier Patient Sélectionné
            </label>
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input 
                type="text"
                value={patientSearchTerm}
                onChange={(e) => setPatientSearchTerm(e.target.value)}
                placeholder="Rechercher par nom, DME, téléphone..."
                className="w-full pl-10 pr-8 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-medium outline-none focus:border-blue-500 focus:bg-white transition-all"
              />
              {patientSearchTerm && (
                <button 
                  onClick={() => setPatientSearchTerm('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Quick dropdown when typing search */}
            {patientSearchTerm && (
              <div className="absolute z-30 mt-1 w-full max-w-md bg-white border border-slate-200 rounded-xl shadow-xl max-h-60 overflow-y-auto divide-y divide-slate-100 animate-in fade-in">
                <button
                  onClick={() => {
                    setSelectedPatientId('ALL');
                    setPatientSearchTerm('');
                  }}
                  className={`w-full p-2.5 text-left hover:bg-slate-50 text-xs font-bold flex items-center justify-between cursor-pointer ${selectedPatientId === 'ALL' ? 'bg-blue-50 text-blue-700' : 'text-slate-700'}`}
                >
                  <span>Tous les patients (Historique Global)</span>
                  {selectedPatientId === 'ALL' && <CheckCircle2 size={14} />}
                </button>
                {filteredPatientsForDropdown.map((p, pIdx) => (
                  <button
                    key={p.id || `pt-drop-${pIdx}`}
                    onClick={() => {
                      setSelectedPatientId(p.id);
                      setPatientSearchTerm('');
                    }}
                    className={`w-full p-2.5 text-left hover:bg-slate-50 flex items-center justify-between cursor-pointer ${selectedPatientId === p.id ? 'bg-blue-50' : ''}`}
                  >
                    <div>
                      <p className="font-bold text-slate-900 text-xs sm:text-sm">{p.lastName} {p.firstName}</p>
                      <p className="text-[11px] text-slate-400 font-mono font-medium">{p.id} • {p.phone || 'Pas de tél'}</p>
                    </div>
                    <ChevronRight size={14} className="text-slate-300" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Active Patient Summary Info */}
          <div className="lg:col-span-7">
            {currentActivePatient ? (
              <div className="bg-blue-50/70 border border-blue-200/80 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center font-black text-base shadow-xs shrink-0">
                    {currentActivePatient.lastName?.charAt(0) || 'P'}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-extrabold text-sm sm:text-base text-slate-900">{currentActivePatient.lastName} {currentActivePatient.firstName}</h3>
                      <span className="bg-blue-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-md font-mono">
                        {currentActivePatient.id}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 font-medium mt-0.5">
                      {currentActivePatient.gender === 'F' ? 'Féminin' : 'Masculin'} • Né(e) le {currentActivePatient.birthDate || 'N/A'} • Tél: {currentActivePatient.phone || 'Non renseigné'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setSelectedPatientId('ALL')}
                    className="px-3 py-1.5 text-slate-600 hover:text-slate-900 bg-white border border-slate-200 rounded-lg text-xs font-bold transition-all cursor-pointer"
                  >
                    Voir Tous
                  </button>
                  {onSelectPatientForAdmission && (
                    <button
                      onClick={() => onSelectPatientForAdmission(currentActivePatient)}
                      className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                      <span>Nouvelle Orientation</span>
                      <ArrowRight size={13} />
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3.5 flex items-center justify-between">
                <div className="flex items-center gap-2.5 text-slate-600">
                  <Layers size={18} className="text-blue-600 shrink-0" />
                  <div>
                    <p className="font-bold text-xs sm:text-sm text-slate-800">Vue globale des événements hospitaliers</p>
                    <p className="text-xs text-slate-500 font-medium">Sélectionnez un patient spécifique pour isoler son parcours complet</p>
                  </div>
                </div>
                <span className="bg-slate-200/80 text-slate-700 text-xs font-extrabold px-2.5 py-1 rounded-lg">
                  {filteredEvents.length} Entrées
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 3. Comprehensive Filter Bar */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Filter size={18} className="text-blue-600" />
            <h3 className="font-black text-sm uppercase tracking-wider text-slate-800">
              Filtres Multicritères & Recherche
            </h3>
            <span className="ml-2 bg-blue-100 text-blue-700 text-[10px] font-black px-2.5 py-0.5 rounded-full">
              {stats.total} événements trouvés
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* View Mode Toggle */}
            <div className="bg-slate-100 p-1 rounded-xl flex items-center gap-1">
              <button
                onClick={() => setViewMode('timeline')}
                className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all ${viewMode === 'timeline' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Chronologie
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all ${viewMode === 'table' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Tableau
              </button>
            </div>

            <button
              onClick={resetFilters}
              className="px-3 py-1.5 text-xs font-bold text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
            >
              Réinitialiser
            </button>
          </div>
        </div>

        {/* Filter Controls Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Keyword Search */}
          <div>
            <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider block mb-1.5">
              Recherche Mots-Clés
            </label>
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                type="text"
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                placeholder="Motif, examen, docteur..."
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium outline-none focus:border-blue-500 focus:bg-white"
              />
            </div>
          </div>

          {/* Service / Act Type Dropdown */}
          <div>
            <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider block mb-1.5">
              Type d'Acte / Service
            </label>
            <select
              value={selectedServiceType}
              onChange={(e) => setSelectedServiceType(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:border-blue-500 focus:bg-white"
            >
              <option value="ALL">Tous les types d'actes</option>
              <option value="CONSULTATION">Consultations Médicales</option>
              <option value="HOSPITALISATION">Hospitalisations & Séjours</option>
              <option value="LABORATOIRE">Examens de Laboratoire</option>
              <option value="IMAGERIE">Imagerie Médicale (Radio/Écho)</option>
              <option value="MATERNITE">Maternité & CPN</option>
              <option value="URGENCE">Urgences & Gardes</option>
            </select>
          </div>

          {/* Date Range Preset */}
          <div>
            <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider block mb-1.5">
              Période Temporelle
            </label>
            <select
              value={dateRangePreset}
              onChange={(e) => setDateRangePreset(e.target.value as any)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:border-blue-500 focus:bg-white"
            >
              <option value="ALL">Toute la période (Historique complet)</option>
              <option value="30D">Derniers 30 jours (1 mois)</option>
              <option value="6M">Derniers 6 mois</option>
              <option value="1Y">Dernière année (12 mois)</option>
              <option value="CUSTOM">Dates personnalisées</option>
            </select>
          </div>

          {/* Doctor / Practitioner Filter */}
          <div>
            <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider block mb-1.5">
              Médecin / Praticien
            </label>
            <select
              value={selectedDoctor}
              onChange={(e) => setSelectedDoctor(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:border-blue-500 focus:bg-white"
            >
              <option value="ALL">Tous les praticiens</option>
              {availableDoctors.map(docName => (
                <option key={docName} value={docName}>{docName}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Custom Date Pickers when CUSTOM is active */}
        {dateRangePreset === 'CUSTOM' && (
          <div className="pt-3 flex flex-wrap items-center gap-4 border-t border-slate-100 animate-in fade-in">
            <span className="text-xs font-bold text-slate-500 flex items-center gap-1.5">
              <CalendarRange size={16} /> Du :
            </span>
            <input 
              type="date"
              value={customStartDate}
              onChange={(e) => setCustomStartDate(e.target.value)}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:border-blue-500"
            />
            <span className="text-xs font-bold text-slate-500">Au :</span>
            <input 
              type="date"
              value={customEndDate}
              onChange={(e) => setCustomEndDate(e.target.value)}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:border-blue-500"
            />
          </div>
        )}

        {/* Category Pills Metric Summary */}
        <div className="flex flex-wrap gap-2 pt-2">
          <button 
            onClick={() => setSelectedServiceType('ALL')}
            className={`px-3 py-1 rounded-xl text-[10px] font-black uppercase transition-all ${selectedServiceType === 'ALL' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
          >
            Tous ({stats.total})
          </button>
          <button 
            onClick={() => setSelectedServiceType('CONSULTATION')}
            className={`px-3 py-1 rounded-xl text-[10px] font-black uppercase transition-all flex items-center gap-1 ${selectedServiceType === 'CONSULTATION' ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-700 hover:bg-blue-100'}`}
          >
            <Stethoscope size={12} /> Consultations ({stats.consultationsCount})
          </button>
          <button 
            onClick={() => setSelectedServiceType('HOSPITALISATION')}
            className={`px-3 py-1 rounded-xl text-[10px] font-black uppercase transition-all flex items-center gap-1 ${selectedServiceType === 'HOSPITALISATION' ? 'bg-purple-600 text-white' : 'bg-purple-50 text-purple-700 hover:bg-purple-100'}`}
          >
            <BedDouble size={12} /> Hospitalisations ({stats.hospitalizationsCount})
          </button>
          <button 
            onClick={() => setSelectedServiceType('LABORATOIRE')}
            className={`px-3 py-1 rounded-xl text-[10px] font-black uppercase transition-all flex items-center gap-1 ${selectedServiceType === 'LABORATOIRE' ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'}`}
          >
            <Beaker size={12} /> Labo & Imagerie ({stats.labCount})
          </button>
          <button 
            onClick={() => setSelectedServiceType('URGENCE')}
            className={`px-3 py-1 rounded-xl text-[10px] font-black uppercase transition-all flex items-center gap-1 ${selectedServiceType === 'URGENCE' ? 'bg-rose-600 text-white' : 'bg-rose-50 text-rose-700 hover:bg-rose-100'}`}
          >
            <ShieldAlert size={12} /> Urgences ({stats.emergencyCount})
          </button>
          <button 
            onClick={() => setSelectedServiceType('MATERNITE')}
            className={`px-3 py-1 rounded-xl text-[10px] font-black uppercase transition-all flex items-center gap-1 ${selectedServiceType === 'MATERNITE' ? 'bg-pink-600 text-white' : 'bg-pink-50 text-pink-700 hover:bg-pink-100'}`}
          >
            <Baby size={12} /> Maternité ({stats.maternityCount})
          </button>
        </div>
      </div>

      {/* 4. Display Content: Timeline or Tabular */}
      {isLoading ? (
        <div className="bg-white p-20 rounded-[40px] border border-slate-200 text-center flex flex-col items-center justify-center">
          <RefreshCw size={36} className="text-blue-600 animate-spin mb-4" />
          <p className="text-sm font-extrabold text-slate-700">Synchronisation de l'historique hospitalier...</p>
        </div>
      ) : filteredEvents.length === 0 ? (
        <div className="bg-white p-20 rounded-[40px] border border-slate-200 text-center flex flex-col items-center justify-center">
          <div className="w-20 h-20 bg-slate-100 rounded-3xl flex items-center justify-center text-slate-400 mb-4">
            <History size={36} />
          </div>
          <h3 className="text-lg font-black text-slate-800">Aucun historique trouvé</h3>
          <p className="text-xs text-slate-500 font-medium mt-1 max-w-sm">
            Aucun événement ne correspond aux critères de recherche ou ce patient n'a pas encore d'actes enregistrés.
          </p>
          <button
            onClick={resetFilters}
            className="mt-6 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl text-xs font-bold shadow-md transition-all"
          >
            Réinitialiser les filtres
          </button>
        </div>
      ) : viewMode === 'timeline' ? (
        /* Timeline View */
        <div className="bg-white p-8 md:p-12 rounded-[40px] border border-slate-200 shadow-sm relative">
          <div className="absolute left-[38px] md:left-[55px] top-12 bottom-12 w-0.5 bg-slate-200"></div>

          <div className="space-y-8 relative">
            {filteredEvents.map((event, eventIdx) => {
              const badge = getEventBadge(event.type);
              const IconComp = badge.icon;

              return (
                <div key={event.id || `event-${eventIdx}`} className="relative pl-12 md:pl-16 group">
                  {/* Timeline Icon Node */}
                  <div className={`absolute left-0 top-1.5 w-9 h-9 md:w-11 md:h-11 rounded-2xl ${badge.color} border-2 flex items-center justify-center shadow-md group-hover:scale-110 transition-transform z-10 bg-white`}>
                    <IconComp size={18} />
                  </div>

                  {/* Event Card */}
                  <div className="bg-slate-50/80 hover:bg-white p-6 md:p-7 rounded-3xl border border-slate-150 hover:border-blue-200 transition-all shadow-xs hover:shadow-lg">
                    {/* Header */}
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`px-3 py-1 rounded-xl text-[9px] font-black uppercase tracking-wider border ${badge.color}`}>
                          {badge.label}
                        </span>
                        <span className="text-xs font-black text-slate-800">
                          {event.service}
                        </span>
                        {selectedPatientId === 'ALL' && (
                          <span className="bg-slate-200/80 text-slate-700 text-[10px] font-extrabold px-2.5 py-0.5 rounded-lg">
                            {event.patientName} ({event.patientId || event.dmeId})
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
                        <Calendar size={14} className="text-slate-400" />
                        <span>{event.date}</span>
                        {event.time && (
                          <>
                            <span>•</span>
                            <Clock size={13} className="text-slate-400" />
                            <span>{event.time}</span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Main Content Info */}
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-4 mt-2">
                      <div className="md:col-span-8">
                        <p className="font-extrabold text-sm text-slate-900">{event.motif}</p>

                        {/* High-level Diagnosis / Status */}
                        {event.mainDiagnosis && (
                          <p className="text-xs text-slate-600 mt-1 font-medium flex items-center gap-1.5">
                            <span className="font-bold text-slate-700">Diagnostic / Motif :</span> {event.mainDiagnosis}
                          </p>
                        )}

                        {/* Hospitalization specifics */}
                        {event.type === 'HOSPITALISATION' && (
                          <div className="mt-2 text-xs text-slate-600 space-y-1 bg-white p-3 rounded-2xl border border-slate-200/70">
                            <p><span className="font-bold text-purple-700">Séjour :</span> Entrée le {event.date} • Sortie : {event.dischargeDate || 'En cours'}</p>
                            <p><span className="font-bold text-slate-700">Emplacement :</span> {event.ward} ({event.roomBed})</p>
                            {event.dischargeReason && <p><span className="font-bold text-slate-700">Motif de sortie :</span> {event.dischargeReason}</p>}
                          </div>
                        )}

                        {/* Lab specifics */}
                        {(event.type === 'LABORATOIRE' || event.type === 'IMAGERIE') && event.examNames && event.examNames.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {event.examNames.map((exam, i) => (
                              <span key={i} className="bg-white border border-slate-200 text-slate-800 text-[10px] font-bold px-2.5 py-1 rounded-xl shadow-2xs">
                                ✓ {exam}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Right Meta Column */}
                      <div className="md:col-span-4 md:text-right flex flex-col justify-between border-t md:border-t-0 md:border-l border-slate-200/60 pt-3 md:pt-0 md:pl-4">
                        <div>
                          <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Praticien Référent</p>
                          <p className="font-bold text-xs text-slate-800 mt-0.5 flex md:justify-end items-center gap-1">
                            <UserCheck size={13} className="text-blue-600" />
                            {event.doctorName || 'Praticien'}
                          </p>
                        </div>

                        <div className="mt-3">
                          <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex md:justify-end items-center gap-1">
                            <ShieldCheck size={11} className="text-emerald-500" /> Dossier Archivé
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* Tabular / List View */
        <div className="bg-white rounded-[40px] border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Date & Heure</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Type / Service</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Patient</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Motif / Acte Principal</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Praticien</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Statut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredEvents.map((event, eventIdx) => {
                  const badge = getEventBadge(event.type);
                  return (
                    <tr key={event.id || `event-row-${eventIdx}`} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-6 py-4">
                        <p className="font-extrabold text-xs text-slate-900">{event.date}</p>
                        <p className="text-[10px] text-slate-400 font-medium">{event.time || '--:--'}</p>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[9px] font-black uppercase tracking-wider border ${badge.color}`}>
                          {badge.label}
                        </span>
                        <p className="text-xs font-bold text-slate-700 mt-1">{event.service}</p>
                      </td>
                      <td className="px-6 py-4">
                        <p className="font-bold text-xs text-slate-900">{event.patientName}</p>
                        <p className="text-[10px] text-slate-400 font-mono">{event.patientId || event.dmeId}</p>
                      </td>
                      <td className="px-6 py-4 max-w-md">
                        <p className="font-bold text-xs text-slate-800">{event.motif}</p>
                        {event.mainDiagnosis && (
                          <p className="text-[10px] text-slate-500 truncate mt-0.5">{event.mainDiagnosis}</p>
                        )}
                        {event.examNames && event.examNames.length > 0 && (
                          <p className="text-[10px] text-emerald-700 font-medium mt-0.5 truncate">
                            Analyses : {event.examNames.join(', ')}
                          </p>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <p className="font-bold text-xs text-slate-800">{event.doctorName || 'Dr. Référent'}</p>
                      </td>
                      <td className="px-6 py-4">
                        <span className="bg-slate-100 text-slate-600 text-[9px] font-extrabold px-2.5 py-1 rounded-lg uppercase">
                          {event.status || 'Enregistré'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default HistoriquePatient;
