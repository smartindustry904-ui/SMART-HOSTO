
import React, { useState, useEffect, useMemo } from 'react';
import { 
  Search, UserPlus, Heart, 
  Users, Stethoscope, Beaker, 
  Activity, AlertCircle, ChevronRight,
  CheckCircle2, CreditCard, ShieldAlert, Calendar,
  Clock, UserCheck, Printer,
  LogOut, FileText, CheckCircle, X,
  User as UserIcon, ArrowRightLeft,
  Scale, Thermometer, Info, Award, Settings,
  TrendingUp, Home, Loader2, ArrowLeft, History,
  Bed, Syringe, Sparkles
} from 'lucide-react';
import { Patient, VisitMotif, Role, User as UserType, PatientStatus, LabExamRequest, PaymentRequest, Service, MedicalAct } from '../types';
import LabExamRequestForm from '../components/LabExamRequestForm';
import { useSettings, useHospitalServices, useMedicalActs, getDefaultServices, getDefaultMedicalActs } from '../hooks/useSettings';
import { Avatar } from '../components/common/Avatar';

import { 
  collection, 
  doc, 
  setDoc, 
  getDocs, 
  query, 
  where,
  orderBy, 
  limit, 
  onSnapshot,
  deleteDoc
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, auth, sanitizeData } from '../src/firebase';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import ReceptionDashboard from '../components/ReceptionDashboard';
import PatientDeduplicationModal from '../components/PatientDeduplicationModal';
import HistoriquePatient from './reception/HistoriquePatient';
import { Breadcrumbs } from '../components/common/Breadcrumbs';
import { MedicalStatusBadge } from '../components/common/MedicalStatusBadge';
import { MicroHeader } from '../components/common/MicroHeader';

interface ReceptionProps {
  user?: UserType;
  globalWaitingQueue?: any[];
  setGlobalWaitingQueue?: React.Dispatch<React.SetStateAction<any[]>>;
  paymentRequests?: PaymentRequest[];
  setPaymentRequests?: React.Dispatch<React.SetStateAction<PaymentRequest[]>>;
  activeTab: 'dashboard' | 'triage' | 'historique' | 'sorties' | 'demandes' | 'profil';
  setActiveTab: (tab: 'dashboard' | 'triage' | 'historique' | 'sorties' | 'demandes' | 'profil') => void;
  onBackToDashboard: () => void;
  theme?: 'light' | 'dark';
}

export interface MotifPriseEnCharge {
  id: string;
  label: string;
  category: 'CONSULTATIONS' | 'MATERNITE' | 'URGENCES' | 'HOSPITALISATION' | 'AUTRES';
  serviceId: string;       // SRV-CONSULTATION, SRV-MATERNITE, etc.
  queueName: string;       // File d'attente
  speciality: string;      // Spécialité médicale
  fee: number;             // Frais de consultation ou d'admission
  actId?: string;
  codeInterne?: string;
  description?: string;
}

export const buildMotifsFromMedicalActsAndServices = (
  medicalActs: MedicalAct[] = [],
  servicesList: Service[] = []
): MotifPriseEnCharge[] => {
  const actsToUse = medicalActs && medicalActs.length > 0 ? medicalActs : getDefaultMedicalActs();
  const servicesToUse = servicesList && servicesList.length > 0 ? servicesList : getDefaultServices();

  // Index services by ID and by normalized name
  const serviceById = new Map<string, Service>();
  const serviceByName = new Map<string, Service>();

  for (const s of servicesToUse) {
    if (s.id) serviceById.set(s.id.toLowerCase(), s);
    if (s.name) serviceByName.set(s.name.toLowerCase().trim(), s);
  }

  // Helper to determine if a service is active
  const isServiceActive = (service?: Service): boolean => {
    if (!service) return true; // If not tracked in services, assume active unless found
    return service.status === 'active' || (service as any).is_active === true;
  };

  // Helper to resolve the hospital service from an act
  const resolveServiceForAct = (act: MedicalAct): Service | undefined => {
    // 1. Direct match by act's serviceId or servicePrincipal
    const sId = (act.serviceId || act.servicePrincipal || '').toLowerCase();
    if (serviceById.has(sId)) return serviceById.get(sId);

    // 2. Direct match by sousService or name
    const sousService = (act.sousService || '').toLowerCase().trim();
    if (sousService && serviceByName.has(sousService)) return serviceByName.get(sousService);

    // 3. Match predefined service patterns
    const nameLower = (act.name || act.nom || '').toLowerCase();
    const catLower = (act.category || act.categorie || '').toLowerCase();
    const combined = `${nameLower} ${catLower} ${sId} ${sousService}`;

    if (combined.includes('matern') || combined.includes('cpn') || combined.includes('accouchement') || combined.includes('obstétri') || combined.includes('postnatale')) {
      return serviceById.get('srv-maternite');
    }
    if (combined.includes('urgence') || combined.includes('trauma') || combined.includes('déchoquage')) {
      return serviceById.get('srv-urgences');
    }
    if (combined.includes('hospitalis')) {
      return serviceById.get('srv-hospitalisation');
    }
    if (combined.includes('labo') || combined.includes('biologie') || combined.includes('analyse')) {
      return serviceById.get('srv-labo');
    }
    if (combined.includes('infirmier') || combined.includes('soin') || combined.includes('pansement')) {
      return serviceById.get('srv-infirmier');
    }
    if (combined.includes('vaccin')) {
      return serviceById.get('srv-vaccination');
    }
    if (combined.includes('pharmacie') || combined.includes('dispensaire')) {
      return serviceById.get('srv-pharmacie');
    }
    if (combined.includes('imagerie') || combined.includes('radio') || combined.includes('écho')) {
      return serviceById.get('srv-imagerie');
    }
    if (combined.includes('kiné')) {
      return serviceById.get('srv-kine');
    }
    if (combined.includes('cardio')) {
      return serviceById.get('srv-cardiologie');
    }
    if (combined.includes('ophta')) {
      return serviceById.get('srv-ophtalmologie');
    }
    if (combined.includes('dermato')) {
      return serviceById.get('srv-dermatologie');
    }
    if (combined.includes('orl')) {
      return serviceById.get('srv-orl');
    }
    if (combined.includes('psy')) {
      return serviceById.get('srv-psychiatrie');
    }
    if (combined.includes('onco')) {
      return serviceById.get('srv-oncologie');
    }
    if (combined.includes('dialyse')) {
      return serviceById.get('srv-dialyse');
    }
    if (combined.includes('pédiatri') || combined.includes('pediatri')) {
      return serviceById.get('srv-pediatrie');
    }
    if (combined.includes('bloc') || combined.includes('chirurg')) {
      return serviceById.get('srv-bloc') || serviceById.get('srv-consultation');
    }

    // Default to general consultation service
    return serviceById.get('srv-consultation');
  };

  const motifs: MotifPriseEnCharge[] = [];
  const coveredServiceIds = new Set<string>();

  // Filter active acts
  const activeActs = actsToUse.filter(a => a.status !== 'inactive' && a.is_active !== false);

  for (const act of activeActs) {
    const matchedService = resolveServiceForAct(act);

    // If the service is tracked and DEACTIVATED, skip this act completely!
    if (matchedService && !isServiceActive(matchedService)) {
      continue;
    }

    // Check specificSettings activeSpecialties if configured
    if (matchedService?.specificSettings?.activeSpecialties && Array.isArray(matchedService.specificSettings.activeSpecialties)) {
      const allowedSpecialties: string[] = matchedService.specificSettings.activeSpecialties;
      const actSousService = (act.sousService || '').toLowerCase();
      const actId = (act.id || '').toLowerCase();
      const actName = (act.name || act.nom || '').toLowerCase();
      
      const isAllowed = allowedSpecialties.some(sp => {
        const spLower = sp.toLowerCase();
        return actSousService.includes(spLower) || 
               actId.includes(spLower) || 
               actName.includes(spLower) ||
               (spLower === 'cpn_consultation' && (actName.includes('cpn') || actName.includes('prénatale'))) ||
               (spLower === 'postnatale_consultation' && actName.includes('postnatale')) ||
               (spLower === 'cpn_maternite' && (actName.includes('cpn') || actName.includes('prénatale'))) ||
               (spLower === 'travail_accouchement' && actName.includes('accouchement')) ||
               (spLower === 'urgence_adulte' && actName.includes('adulte')) ||
               (spLower === 'urgence_pediatrique' && actName.includes('pédiatrique')) ||
               (spLower === 'urgence_obstetricale' && actName.includes('obstétricale')) ||
               (spLower === 'traumatisme' && (actName.includes('traumatisme') || actName.includes('déchoquage')));
      });

      if (!isAllowed) {
        continue;
      }
    }

    const serviceId = matchedService?.id || act.serviceId || act.servicePrincipal || 'SRV-CONSULTATION';
    coveredServiceIds.add(serviceId.toLowerCase());

    const actName = act.name || act.nom || (matchedService ? matchedService.name : 'Acte médical');
    const actPrice = Number(act.price ?? act.prixBase ?? (matchedService?.specificSettings?.consultationFee || matchedService?.specificSettings?.fee || 10000));

    // Determine category based on matched service and act
    let category: 'CONSULTATIONS' | 'MATERNITE' | 'URGENCES' | 'HOSPITALISATION' | 'AUTRES' = 'CONSULTATIONS';

    if (serviceId === 'SRV-MATERNITE' || (matchedService?.type === 'clinique' && /matern/i.test(matchedService.name))) {
      category = 'MATERNITE';
    } else if (serviceId === 'SRV-URGENCES' || /urgence/i.test(matchedService?.name || '')) {
      category = 'URGENCES';
    } else if (serviceId === 'SRV-HOSPITALISATION' || /hospitalis/i.test(matchedService?.name || '')) {
      category = 'HOSPITALISATION';
    } else if (
      ['SRV-LABO', 'SRV-INFIRMIER', 'SRV-VACCINATION', 'SRV-PHARMACIE', 'SRV-IMAGERIE', 'SRV-KINE', 'SRV-NUTRITION'].includes(serviceId) ||
      matchedService?.type === 'technique' || 
      matchedService?.type === 'soutien'
    ) {
      category = 'AUTRES';
    } else {
      category = 'CONSULTATIONS';
    }

    const queueName = act.sousService || matchedService?.name || (
      category === 'MATERNITE' ? 'Maternité' :
      category === 'URGENCES' ? 'Urgences' :
      category === 'HOSPITALISATION' ? 'Hospitalisation' :
      'Consultation'
    );

    const speciality = act.sousService || matchedService?.name || 'Médecine générale';

    motifs.push({
      id: act.id,
      label: actName,
      category,
      serviceId,
      queueName,
      speciality,
      fee: actPrice,
      actId: act.id,
      codeInterne: act.codeInterne || (act as any).code || '',
      description: act.description || matchedService?.description || ''
    });
  }

  // DYNAMIC INCLUSION: For every ACTIVE service in servicesToUse not yet covered by an act,
  // create an immediate, usable destination motif in Accueil!
  // Exclude purely administrative internal services (like SRV-ACCUEIL, SRV-CAISSE, SRV-ADMIN, SRV-RH, SRV-ARCHIVES)
  const nonClinicalAdminServices = ['SRV-ACCUEIL', 'SRV-CAISSE', 'SRV-ADMIN', 'SRV-RH', 'SRV-ARCHIVES'];

  for (const s of servicesToUse) {
    if (!isServiceActive(s)) continue;
    if (nonClinicalAdminServices.includes(s.id)) continue;
    if (s.type === 'administratif' && !s.id.toLowerCase().includes('consult')) continue;

    // If no motif exists for this service, create a direct orientation motif
    if (!coveredServiceIds.has(s.id.toLowerCase())) {
      let category: 'CONSULTATIONS' | 'MATERNITE' | 'URGENCES' | 'HOSPITALISATION' | 'AUTRES' = 'CONSULTATIONS';
      if (s.id === 'SRV-MATERNITE' || /matern/i.test(s.name)) {
        category = 'MATERNITE';
      } else if (s.id === 'SRV-URGENCES' || /urgence/i.test(s.name)) {
        category = 'URGENCES';
      } else if (s.id === 'SRV-HOSPITALISATION' || /hospitalis/i.test(s.name)) {
        category = 'HOSPITALISATION';
      } else if (s.type === 'technique' || s.type === 'soutien') {
        category = 'AUTRES';
      } else {
        category = 'CONSULTATIONS';
      }

      const fee = Number(s.specificSettings?.consultationFee || s.specificSettings?.fee || s.specificSettings?.admissionFee || 10000);
      const isConsultationLike = s.type === 'specialise' || s.type === 'clinique';
      const label = isConsultationLike && !s.name.toLowerCase().startsWith('consultation') 
        ? `Consultation ${s.name}` 
        : s.name;

      motifs.push({
        id: `MOTIF-${s.id}`,
        label,
        category,
        serviceId: s.id,
        queueName: s.name,
        speciality: s.name,
        fee,
        codeInterne: s.id,
        description: s.description || `Prise en charge et orientation vers le service ${s.name}`
      });

      coveredServiceIds.add(s.id.toLowerCase());
    }
  }

  // Sort motifs: order based on the service's order if available, then label
  return motifs.sort((a, b) => {
    const sA = serviceById.get(a.serviceId.toLowerCase());
    const sB = serviceById.get(b.serviceId.toLowerCase());
    const orderA = sA?.order ?? 999;
    const orderB = sB?.order ?? 999;
    if (orderA !== orderB) return orderA - orderB;
    return a.label.localeCompare(b.label);
  });
};

// Legacy fallback alias
export const buildMotifsFromServices = (servicesList: Service[]): MotifPriseEnCharge[] => {
  return buildMotifsFromMedicalActsAndServices(getDefaultMedicalActs(), servicesList);
};

export const ALL_MOTIFS: MotifPriseEnCharge[] = buildMotifsFromMedicalActsAndServices(getDefaultMedicalActs(), getDefaultServices());

export const assessPriority = (vitals: any): { priority: 'normal' | 'urgent' | 'critique'; alerts: string[] } => {
  const alerts: string[] = [];
  if (!vitals) return { priority: 'normal', alerts };

  const temp = parseFloat(vitals.temp);
  const sys = parseInt(vitals.bpSys);
  const dia = parseInt(vitals.bpDia);
  const spo2 = parseInt(vitals.spo2);
  const hr = parseInt(vitals.heartRate || vitals.pulse);

  // Severe criteria (Critique)
  if (spo2 > 0 && spo2 < 90) {
    alerts.push("Saturation basse (< 90%)");
  }
  if ((sys > 0 && sys > 180) || (dia > 0 && dia > 110)) {
    alerts.push("TA critique (Hypertension sévère)");
  }
  if (sys > 0 && sys < 85) {
    alerts.push("TA critique (Hypotension sévère)");
  }
  if (temp > 0 && (temp >= 39.5 || temp < 35)) {
    alerts.push("Température critique (< 35°C ou >= 39.5°C)");
  }
  if (hr > 0 && (hr >= 130 || hr < 45)) {
    alerts.push("Fréquence cardiaque critique");
  }

  if (alerts.length > 0) {
    return { priority: 'critique', alerts };
  }

  // Moderate criteria (Urgent)
  if (spo2 > 0 && spo2 >= 90 && spo2 < 94) {
    alerts.push("Saturation faible (90-93%)");
  }
  if ((sys > 0 && (sys > 140 && sys <= 180)) || (dia > 0 && (dia > 90 && dia <= 110))) {
    alerts.push("TA élevée");
  }
  if (temp > 0 && (temp >= 38.5 && temp < 39.5)) {
    alerts.push("Fièvre modérée");
  }
  if (hr > 0 && ((hr >= 100 && hr < 130) || (hr >= 45 && hr < 55))) {
    alerts.push("Fréquence cardiaque anormale");
  }

  if (alerts.length > 0) {
    return { priority: 'urgent', alerts };
  }

  return { priority: 'normal', alerts };
};

const getOrientationData = (motif: VisitMotif) => {
  switch(motif) {
    case 'CONSULTATION': return { dest: Role.DOCTOR, fee: 10000, label: 'Consultation Générale' };
    case 'URGENCE': return { dest: Role.DOCTOR, fee: 15000, label: 'Urgences Vitales' };
    case 'LABORATOIRE': return { dest: Role.LAB, fee: 0, label: 'Prélèvements' };
    case 'MATERNITE': return { dest: Role.MATERNITY, fee: 5000, label: 'Suivi de Grossesse' };
    case 'SOIN_INFIRMIER': return { dest: Role.NURSE, fee: 2500, label: 'Soins / Pansements' };
    default: return { dest: Role.DOCTOR, fee: 10000, label: 'Général' };
  }
};

const Reception: React.FC<ReceptionProps> = ({ 
  user, 
  globalWaitingQueue = [],
  setGlobalWaitingQueue, 
  paymentRequests = [], 
  setPaymentRequests,
  activeTab,
  setActiveTab,
  onBackToDashboard,
  theme = 'light'
}) => {
  const { establishment } = useSettings();
  const { services: hospitalServices } = useHospitalServices();
  const { acts: medicalActs } = useMedicalActs();
  const currency = establishment?.currency || 'CFA';
  const [step, setStep] = useState<'search' | 'register' | 'triage' | 'payment' | 'summary'>('search');
  const [duplicateModalData, setDuplicateModalData] = useState<{ isDuplicate: boolean; matchedPatient: Patient | null; reason: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [motifSearchQuery, setMotifSearchQuery] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [selectedHistoryDate, setSelectedHistoryDate] = useState(new Date().toISOString().split('T')[0]);

  const [patients, setPatients] = useState<Patient[]>([]);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [patientsToDischarge, setPatientsToDischarge] = useState<any[]>([]);
  const [dischargeError, setDischargeError] = useState<{ patientId: string; message: string } | null>(null);
  const [isProcessingDischarge, setIsProcessingDischarge] = useState<string | null>(null);

  const [currentPatient, setCurrentPatient] = useState<Partial<Patient>>({
    gender: 'M',
    maritalStatus: 'CELIBATAIRE',
    vitals: {
      bpSys: 120, bpDia: 80, heartRate: 75, respRate: 18, pulse: 75, spo2: 98, temp: 37,
      height: 170, weight: 70, bmi: 24.2, waistCirc: 85
    }
  });

  // Helper to normalize phone numbers for deduplication
  const normalizePhone = (phone?: string) => {
    if (!phone) return '';
    return phone.replace(/[\s\-\(\)\+\.]/g, '').replace(/^221/, '');
  };

  // Strict Anti-Doublon deduplication check
  const checkDuplicatePatient = (candidate: Partial<Patient>): { isDuplicate: boolean; matchedPatient: Patient | null; reason: string } => {
    const candPhone = normalizePhone(candidate.phone);
    const candLast = (candidate.lastName || '').trim().toLowerCase();
    const candFirst = (candidate.firstName || '').trim().toLowerCase();
    const candDob = (candidate.birthDate || '').trim();

    for (const p of patients) {
      // Exclude self if already existing/editing
      if (candidate.id && p.id === candidate.id) continue;
      if ((candidate as any).patientId && (p as any).patientId === (candidate as any).patientId) continue;

      const pPhone = normalizePhone(p.phone);
      const pLast = (p.lastName || '').trim().toLowerCase();
      const pFirst = (p.firstName || '').trim().toLowerCase();
      const pDob = (p.birthDate || '').trim();

      // Rule 1: Phone number match (min 7 digits)
      if (candPhone.length >= 7 && pPhone.length >= 7 && (candPhone === pPhone || candPhone.endsWith(pPhone) || pPhone.endsWith(candPhone))) {
        return {
          isDuplicate: true,
          matchedPatient: p,
          reason: `Le numéro de téléphone (${candidate.phone}) est déjà associé au dossier existant #${p.id} (${p.lastName} ${p.firstName}).`
        };
      }

      // Rule 2: Exact (First Name + Last Name + Date of Birth)
      if (candLast && candFirst && candDob && pLast === candLast && pFirst === candFirst && pDob === candDob) {
        return {
          isDuplicate: true,
          matchedPatient: p,
          reason: `Les nom (${candidate.lastName}), prénom (${candidate.firstName}) et date de naissance (${candidate.birthDate}) correspondent exactement au dossier existant #${p.id}.`
        };
      }
    }

    return { isDuplicate: false, matchedPatient: null, reason: '' };
  };

  const liveDuplicate = useMemo(() => {
    if (step !== 'register') return { isDuplicate: false, matchedPatient: null, reason: '' };
    return checkDuplicatePatient(currentPatient);
  }, [currentPatient, patients, step]);
  
  const [visitMotif, setVisitMotif] = useState<VisitMotif | null>(null);
  const [selectedMotif, setSelectedMotif] = useState<MotifPriseEnCharge | null>(null);
  const [currentMotifCategory, setCurrentMotifCategory] = useState<'CONSULTATIONS' | 'MATERNITE' | 'URGENCES' | 'HOSPITALISATION' | 'AUTRES'>('CONSULTATIONS');

  const renderStepper = (activeStep: 1 | 2 | 3) => {
    const steps = [
      { label: "Identification & DME", desc: "Recherche / Création" },
      { label: "Orientation", desc: "Motif & Prestation" },
      { label: "Validation", desc: "Pro-forma & Caisse" }
    ];
    return (
      <div className="mb-8 bg-slate-50 border border-slate-150 rounded-2xl p-4 md:p-5">
        <div className="flex justify-between items-center relative">
          <div className="absolute left-[16%] right-[16%] top-1/2 h-0.5 bg-slate-200/80 -translate-y-1/2 z-0 hidden md:block">
            <div 
              className="h-full bg-blue-600 transition-all duration-500"
              style={{ width: `${((activeStep - 1) / 2) * 100}%` }}
            ></div>
          </div>
          {steps.map((s, idx) => {
            const num = idx + 1;
            const isCompleted = num < activeStep;
            const isActive = num === activeStep;
            return (
              <div key={num} className="flex flex-col items-center relative z-10 flex-1">
                <div className={`w-8 h-8 md:w-9 md:h-9 rounded-full flex items-center justify-center font-black text-xs transition-all duration-300 ${
                  isCompleted ? 'bg-blue-600 text-white shadow-md shadow-blue-500/10' :
                  isActive ? 'bg-slate-900 text-white ring-4 ring-blue-50' :
                  'bg-slate-100 text-slate-400 border border-slate-200/60'
                }`}>
                  {isCompleted ? '✓' : num}
                </div>
                <p className={`text-[8px] md:text-[9px] font-black uppercase mt-1.5 tracking-wider ${isActive ? 'text-slate-900' : 'text-slate-400'}`}>
                  {s.label}
                </p>
                <p className="text-[8px] text-slate-400 font-medium italic hidden sm:block">
                  {s.desc}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    );
  };
  const [notebookAdded, setNotebookAdded] = useState(false);
  const [showUpsell, setShowUpsell] = useState(false);
  const [amountReceived, setAmountReceived] = useState<string>('');
  const [showProforma, setShowProforma] = useState(false);
  const [selectedTxForProforma, setSelectedTxForProforma] = useState<any>(null);
  const [showLabExamForm, setShowLabExamForm] = useState(false);
  const [isLabExamEnabled, setIsLabExamEnabled] = useState(false);

  const activeMotifs = useMemo(() => {
    return buildMotifsFromMedicalActsAndServices(medicalActs, hospitalServices);
  }, [medicalActs, hospitalServices]);

  // Firestore Synchronizer Hooks
  useEffect(() => {
    let unsubs: (() => void)[] = [];

    const setupListeners = () => {
      // 1. Synchronize Patients with Firestore & auto-seed if empty
      const unsubPatients = onSnapshot(collection(db, 'patients'), (snapshot) => {
        if (!snapshot.empty) {
          const list = snapshot.docs.map(doc => doc.data() as Patient);
          setPatients(list);
        } else {
          setPatients([]);
        }
      }, (error) => {
        if (auth.currentUser) {
          handleFirestoreError(error, OperationType.LIST, 'patients');
        }
      });

      // 2. Synchronize PatientsToDischarge list with Firestore (discharges_waiting)
      const unsubDischarges = onSnapshot(collection(db, 'discharges_waiting'), (snapshot) => {
        if (!snapshot.empty) {
          const list = snapshot.docs.map(doc => doc.data());
          setPatientsToDischarge(list);
        } else {
          setPatientsToDischarge([]);
        }
      }, (error) => {
        if (auth.currentUser) {
          handleFirestoreError(error, OperationType.LIST, 'discharges_waiting');
        }
      });

      const unsubApps = onSnapshot(collection(db, 'appointments'), (snapshot) => {
        const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setAppointments(list);
      });

      unsubs = [unsubPatients, unsubDischarges, unsubApps];
    };

    const unsubscribeAuth = auth.onAuthStateChanged((firebaseUser) => {
      if (firebaseUser) {
        setupListeners();
      } else {
        unsubs.forEach(unsub => unsub());
        unsubs = [];
      }
    });

    return () => {
      unsubscribeAuth();
      unsubs.forEach(unsub => unsub());
    };
  }, []);

  // Reusable Helper to Generate sequential serial Enterprise patient ID
  const getNextSequentialIdsAndAssign = async () => {
    let nextNum = 3; // start from 3 because 1 & 2 are auto-seeded
    try {
      const snap = await getDocs(collection(db, 'patients'));
      let maxNum = 2; // initial seeds have 1 and 2
      snap.forEach(doc => {
        const data = doc.data();
        const checkId = (idStr: string) => {
          if (!idStr) return;
          const parts = idStr.split('-');
          if (parts.length === 3) {
            const num = parseInt(parts[2], 10);
            if (!isNaN(num) && num > maxNum) {
              maxNum = num;
            }
          }
        };
        checkId(data.id);
        checkId(data.patientId);
      });
      nextNum = maxNum + 1;
    } catch (err) {
      console.error("Error generating sequential patient ID:", err);
      nextNum = Math.floor(Math.random() * 100000) + 3;
    }
    const padded = String(nextNum).padStart(6, '0');
    return {
      patientId: `PAT-2026-${padded}`,
      dmeId: `DME-2026-${padded}`
    };
  };

  // Reusable Audit Log Helper
  const logAudit = async (action: string, details?: any) => {
    try {
      const today = new Date();
      const logData = {
        user: user?.name || user?.email || 'Agent Accueil',
        role: user?.role || 'RECEPTION',
        date: today.toLocaleDateString('fr-FR'),
        time: today.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
        timestamp: today.toISOString(),
        action,
        details: details || {},
        module: 'Reception'
      };
      await setDoc(doc(collection(db, 'audit_logs')), sanitizeData(logData));
    } catch (err) {
      console.error('Audit trace failed:', err);
    }
  };

  // Modern PDF Generator for Receipts, Proformas, Prescriptions and Discharges
  const handleGeneratePDF = (docType: string, data: any) => {
    let logoText = "SH";
    let nameEst = "SmartHosto SIH";
    let addressEst = "Dakar, Senegal";
    let phoneEst = "+221 77 000 00 00";
    let emailEst = "contact@smarthosto.com";
    let sloganEst = "Systeme d'Information Hospitalier Connecte";
    let taxIdEst = "";
    let websiteEst = "";
    let bankInfoEst = "";
    let invoiceFooterEst = "";

    if (establishment) {
      if (establishment.name) nameEst = establishment.name;
      if (establishment.address) addressEst = establishment.address;
      if (establishment.phone) phoneEst = establishment.phone;
      if (establishment.email) emailEst = establishment.email;
      if (establishment.slogan) sloganEst = establishment.slogan;
      if (establishment.taxId) taxIdEst = establishment.taxId;
      if (establishment.website) websiteEst = establishment.website;
      if (establishment.bankInfo) bankInfoEst = establishment.bankInfo;
      if (establishment.invoiceFooter) invoiceFooterEst = establishment.invoiceFooter;
      if (establishment.logo) logoText = establishment.logo;
    } else {
      const savedConfig = localStorage.getItem('hospital_config');
      if (savedConfig) {
        try {
          const config = JSON.parse(savedConfig);
          if (config.name) nameEst = config.name;
          if (config.phone) phoneEst = config.phone;
          
          const addressParts = [];
          if (config.address) addressParts.push(config.address);
          if (config.city) addressParts.push(config.city);
          if (config.country) addressParts.push(config.country);
          if (addressParts.length > 0) {
            addressEst = addressParts.join(', ');
          }
          
          if (config.logo) logoText = config.logo;
          if (config.email) emailEst = config.email;
          if (config.slogan) sloganEst = config.slogan;
          if (config.taxId) taxIdEst = config.taxId;
          if (config.website) websiteEst = config.website;
          if (config.bankInfo) bankInfoEst = config.bankInfo;
          if (config.invoiceFooter) invoiceFooterEst = config.invoiceFooter;
        } catch (e) {
          console.error("Failed to parse hospital_config", e);
        }
      }
    }

    const today = new Date();
    const dateStr = today.toLocaleDateString('fr-FR');
    const timeStr = today.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

    if (docType === "autorisation_sortie") {
      const isArchivedCompleted = data && (data.status === 'completed' || data.validated === true);
      const isCleared = data && (data.medicalClearance === true && data.hospitalizationClosed === true && data.financialClearance === true);
      
      if (!isCleared && !isArchivedCompleted) {
        setDischargeError({
          patientId: data.id,
          message: "Impossible d'imprimer l'autorisation de sortie.\n\nLa sortie administrative n'a pas encore été validée.\n\nVeuillez vérifier :\n- Autorisation médicale\n- Clôture de l'hospitalisation\n- Validation financière"
        });
        setTimeout(() => {
          setDischargeError(null);
        }, 12000);
        return; // block PDF generation
      }

      // Trace logs inside audit_logs collection
      logAudit("Impression d'autorisation de sortie", {
        patient: data.patientName || data.name || 'Patient Inconnu',
        patientId: data.patientId || data.id || 'N/A',
        utilisateur: user?.name || 'Agent d\'accueil',
        date: dateStr,
        heure: timeStr,
        document_imprime: `autorisation_sortie_${data.id || today.getTime()}.pdf`
      });
    }

    const pdfDoc = new jsPDF() as any;

    // Header Design (Slate Dark Theme Banner)
    pdfDoc.setFillColor(30, 41, 59);
    pdfDoc.rect(10, 10, 190, 40, 'F');

    // Logo badge white card
    pdfDoc.setFillColor(255, 255, 255);
    pdfDoc.roundedRect(15, 15, 16, 16, 3, 3, 'F');
    pdfDoc.setTextColor(30, 41, 59);
    pdfDoc.setFont("helvetica", "bold");
    pdfDoc.setFontSize(10);
    pdfDoc.text(logoText, 20, 25);

    // Hospital info
    pdfDoc.setTextColor(255, 255, 255);
    pdfDoc.setFontSize(14);
    pdfDoc.text(nameEst, 38, 23);
    pdfDoc.setFont("helvetica", "normal");
    pdfDoc.setFontSize(7);
    pdfDoc.text(`${addressEst} | Tel: ${phoneEst}`, 38, 29);
    pdfDoc.text(`${sloganEst} ${emailEst ? ' | Email: ' + emailEst : ''}`, 38, 33);
    pdfDoc.text(`${taxIdEst ? taxIdEst + ' | ' : ''}${websiteEst ? websiteEst : ''}`, 38, 37);
    if (bankInfoEst) pdfDoc.text(bankInfoEst, 38, 41);

    // Right header block (Document Type details)
    let docTitle = "DOCUMENT GÉNERIQUE";
    if (docType === "ticket_accueil" || docType === "fiche_orientation") docTitle = "FICHE D'ORIENTATION";
    if (docType === "proforma") docTitle = "FACTURE PRO-FORMA";
    if (docType === "demande_paiement") docTitle = "DEMANDE DE PAIEMENT";
    if (docType === "bulletin_examens") docTitle = "BULLETIN D'EXAMENS";
    if (docType === "autorisation_sortie") docTitle = "AUTORISATION DE SORTIE";

    pdfDoc.setFont("helvetica", "bold");
    pdfDoc.setFontSize(9);
    pdfDoc.text(docTitle, 140, 23);
    pdfDoc.setFont("helvetica", "normal");
    pdfDoc.setFontSize(8);
    pdfDoc.text(`ID Document: ${data.id || 'N/A'}`, 140, 30);
    pdfDoc.text(`Imprimé: ${dateStr} - ${timeStr}`, 140, 35);
    if (docType === "proforma" || docType === "demande_paiement" || docType === "ticket_accueil" || docType === "fiche_orientation") {
      pdfDoc.setFontSize(7);
      pdfDoc.text("VALIDITÉ: 48H", 140, 41);
    }

    // Patient Infobox Block
    pdfDoc.setFillColor(248, 250, 252);
    pdfDoc.rect(10, 55, 190, 30, 'F');
    pdfDoc.setDrawColor(226, 232, 240);
    pdfDoc.rect(10, 55, 190, 30, 'S');

    pdfDoc.setTextColor(30, 41, 59);
    pdfDoc.setFont("helvetica", "bold");
    pdfDoc.setFontSize(9);
    pdfDoc.text("IDENTIFICATION DU PATIENT", 15, 62);
    pdfDoc.setFont("helvetica", "normal");
    pdfDoc.text(`Nom: ${data.patientName || data.name || 'Patient Inconnu'}`, 15, 70);
    pdfDoc.text(`ID DME: ${data.patientId || data.id || 'N/A'}`, 15, 76);
    if (data.age) pdfDoc.text(`Âge: ${data.age} ans`, 110, 70);
    if (data.gender) pdfDoc.text(`Sexe: ${data.gender}`, 150, 70);
    if (data.phone) pdfDoc.text(`Tél: ${data.phone}`, 110, 76);

    // Label Section
    pdfDoc.setFont("helvetica", "bold");
    pdfDoc.setFontSize(10);
    pdfDoc.text("DÉTAILS DES PRESTATIONS & ORIENTATION", 10, 95);

    let finalY = 100;
    if (docType === "ticket_accueil" || docType === "fiche_orientation" || docType === "proforma" || docType === "demande_paiement") {
      const items = data.items || [
        { name: data.motif || data.type || 'Frais d\'Orientation / Dossier', quantity: 1, unitPrice: data.totalAmount || 10000, totalPrice: data.totalAmount || 10000 }
      ];

      const columns = ["Prestation", "Quantité", "Tarif Unitaire (CFA)", "Total (CFA)"];
      const rows = items.map((item: any) => [
        item.name || 'Acte Médical',
        item.quantity || 1,
        (item.unitPrice || 0).toLocaleString(),
        (item.totalPrice || 0).toLocaleString()
      ]);

      autoTable(pdfDoc, {
        head: [columns],
        body: rows,
        startY: 100,
        theme: 'striped',
        headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: 'bold' },
        styles: { fontSize: 8 },
        margin: { left: 10, right: 10 }
      });

      finalY = (pdfDoc as any).lastAutoTable.finalY + 15;

      // Draw total price box
      pdfDoc.setFillColor(30, 41, 59);
      pdfDoc.rect(115, finalY, 85, 26, 'F');
      pdfDoc.setTextColor(255, 255, 255);
      pdfDoc.setFontSize(9);
      pdfDoc.setFont("helvetica", "bold");
      const amountVal = data.totalAmount || items.reduce((sum: number, it: any) => sum + (it.totalPrice || 0), 0);
      pdfDoc.text(`MONTANT À PAYER (CAISSE):`, 120, finalY + 9);
      pdfDoc.setFontSize(12);
      pdfDoc.setTextColor(96, 165, 250); // Light blue accent
      pdfDoc.text(`${(amountVal || 0).toLocaleString()} CFA`, 120, finalY + 19);

      // Warning Box & Watermark Notice (Separation of Duties)
      const warningY = finalY + 34;
      pdfDoc.setFillColor(254, 242, 242); // Rose-50
      pdfDoc.rect(10, warningY, 190, 24, 'F');
      pdfDoc.setDrawColor(244, 63, 94); // Rose-500
      pdfDoc.rect(10, warningY, 190, 24, 'S');

      pdfDoc.setTextColor(190, 18, 60); // Rose-700
      pdfDoc.setFontSize(8);
      pdfDoc.setFont("helvetica", "bold");
      pdfDoc.text("⚠️ AVERTISSEMENT / SÉPARATION DES FONCTIONS :", 15, warningY + 8);
      pdfDoc.setFont("helvetica", "normal");
      pdfDoc.setFontSize(7.5);
      pdfDoc.setTextColor(159, 18, 57);
      pdfDoc.text("Ce document est une Fiche d'Orientation / Facture Pro-forma et ne constitue en aucun cas un reçu de paiement.", 15, warningY + 14);
      pdfDoc.setFont("helvetica", "bold");
      pdfDoc.text("Valable pour consultation uniquement après règlement effectif et validation à la Caisse centrale.", 15, warningY + 20);

      // Add Footer if present
      if (invoiceFooterEst) {
        pdfDoc.setFontSize(7);
        pdfDoc.setTextColor(100, 116, 139);
        const splitFooter = pdfDoc.splitTextToSize(invoiceFooterEst, 190);
        pdfDoc.text(splitFooter, 10, 280);
      }

    } else if (docType === "bulletin_examens") {
      const listExams = data.exams || [];
      const columns = ["Examens Demandes", "Categorie", "Indication Clinique"];
      const rows = listExams.map((e: any) => [
        e.name || e,
        e.category || 'Analyse Medicale',
        e.indication || 'N/A'
      ]);

      autoTable(pdfDoc, {
        head: [columns],
        body: rows,
        startY: 100,
        theme: 'striped',
        headStyles: { fillColor: [147, 51, 234], textColor: [255, 255, 255], fontStyle: 'bold' },
        styles: { fontSize: 8 },
        margin: { left: 10, right: 10 }
      });

      finalY = (pdfDoc as any).lastAutoTable.finalY + 15;

      pdfDoc.setTextColor(30, 41, 59);
      pdfDoc.setFontSize(9);
      pdfDoc.setFont("helvetica", "bold");
      pdfDoc.text(`Prescripteur: ${data.prescriberName || 'Agent Accueil'}`, 10, finalY);
      pdfDoc.text(`Service d'admission: ${data.requestingService || 'Accueil'}`, 10, finalY + 6);

    } else if (docType === "autorisation_sortie") {
      pdfDoc.setFillColor(240, 253, 250); // Teal-50
      pdfDoc.rect(10, 100, 190, 85, 'F');
      pdfDoc.setDrawColor(20, 184, 166); // Teal-500
      pdfDoc.rect(10, 100, 190, 85, 'S');

      pdfDoc.setTextColor(15, 118, 110);
      pdfDoc.setFontSize(14);
      pdfDoc.setFont("helvetica", "bold");
      pdfDoc.text("SORTIE ADMINISTRATIVE VALIDEE", 55, 112);
      
      pdfDoc.setDrawColor(204, 251, 241);
      pdfDoc.line(15, 118, 195, 118);

      pdfDoc.setTextColor(30, 41, 59);
      pdfDoc.setFontSize(9);
      pdfDoc.setFont("helvetica", "normal");
      pdfDoc.text(`Le patient ${data.patientName || data.name} est officiellement autorise a quitter`, 20, 126);
      pdfDoc.text(`l'enceinte de l'etablissement hospitalier en toute conformite.`, 20, 132);

      const userValidator = data.user || user?.name || 'Agent d\'accueil de garde';
      const dischargeDateStr = data.dischargeDate || dateStr;
      const dischargeTimeStr = data.dischargeTime || timeStr;

      pdfDoc.setFont("helvetica", "bold");
      pdfDoc.text("INFORMATIONS DE VALIDATION :", 20, 142);
      pdfDoc.setFont("helvetica", "normal");
      pdfDoc.text(`- Date de sortie : ${dischargeDateStr}`, 25, 148);
      pdfDoc.text(`- Heure de sortie : ${dischargeTimeStr}`, 25, 153);
      pdfDoc.text(`- Valide par : ${userValidator}`, 25, 158);

      pdfDoc.setFont("helvetica", "bold");
      pdfDoc.text("STATUT DES CRITERES OBLIGATOIRES :", 20, 166);
      pdfDoc.setTextColor(15, 118, 110);
      pdfDoc.text(`- Autorisation medicale : VALIDEE`, 25, 172);
      pdfDoc.text(`- Validation financiere : VALIDEE`, 25, 177);
      pdfDoc.text(`- Hospitalisation cloturee : VALIDEE`, 25, 182);

      finalY = 200;
    }

    // Signatures block
    pdfDoc.setFont("helvetica", "normal");
    pdfDoc.setFontSize(8);
    pdfDoc.setTextColor(100, 116, 139);
    pdfDoc.text(`Immatriculation: SH-${docType.toUpperCase()}-${data.id || today.getTime()}`, 10, 275);
    pdfDoc.text(`Etablissement de sante ${nameEst}. Document certifie conforme.`, 10, 280);

    pdfDoc.setTextColor(30, 41, 59);
    pdfDoc.setFont("helvetica", "bold");
    pdfDoc.text("Cachet et Signature de l'accueil", 130, 252);
    pdfDoc.line(130, 268, 190, 268);

    // Save PDF
    pdfDoc.save(`${docType}_${data.id || today.getTime()}.pdf`);
  };

  useEffect(() => {
    const savedTools = localStorage.getItem('hospital_tools');
    if (savedTools) {
      const parsedTools = JSON.parse(savedTools);
      const labTool = parsedTools.find((t: any) => t.code === 'BULLETIN_EXAMENS');
      if (labTool && labTool.status === 'ACTIVE' && user && labTool.authorizedRoles.includes(user.role)) {
        setIsLabExamEnabled(true);
      }
    }
  }, [user]);

  useEffect(() => {
    if (currentPatient.vitals?.height && currentPatient.vitals?.weight) {
      const hMeters = currentPatient.vitals.height / 100;
      const bmi = parseFloat((currentPatient.vitals.weight / (hMeters * hMeters)).toFixed(1));
      setCurrentPatient(prev => ({
        ...prev,
        vitals: { ...prev.vitals!, bmi }
      }));
    }
  }, [currentPatient.vitals?.height, currentPatient.vitals?.weight]);

  const computedBMI = useMemo(() => {
    const w = currentPatient.vitals?.weight;
    const h = currentPatient.vitals?.height;
    if (w && h) {
      const imc = (w / ((h / 100) * (h / 100))).toFixed(1);
      return parseFloat(imc);
    }
    return currentPatient.vitals?.bmi || 0;
  }, [currentPatient.vitals?.weight, currentPatient.vitals?.height, currentPatient.vitals?.bmi]);

  const computedPriorityAndAlerts = useMemo(() => {
    return assessPriority(currentPatient.vitals);
  }, [currentPatient.vitals]);

  const totalToPay = useMemo(() => {
    if (selectedMotif) {
      return selectedMotif.fee + (notebookAdded ? 1000 : 0);
    }
    if (!visitMotif) return 0;
    return getOrientationData(visitMotif).fee + (notebookAdded ? 1000 : 0);
  }, [selectedMotif, visitMotif, notebookAdded]);

  const paymentStats = useMemo(() => {
    const received = parseFloat(amountReceived) || 0;
    const diff = received - totalToPay;
    return { 
      received, 
      remaining: diff < 0 ? Math.abs(diff) : 0, 
      change: diff > 0 ? diff : 0 
    };
  }, [totalToPay, amountReceived]);

  const agentProfile = user || {
    name: "Moussa Diop", profession: "Agent d'accueil Principal", role: Role.RECEPTION,
    schedule: "Lun-Ven (08h00 - 17h00)", salary: "250,000 {currency}", quotePartRate: "1%"
  };

  const filteredPatients = useMemo(() => {
    const q = (searchQuery || '').toLowerCase().trim();
    if (!q) return [];
    return patients.filter(p => 
      (p.lastName || '').toLowerCase().includes(q) ||
      (p.firstName || '').toLowerCase().includes(q) ||
      (p.id || '').toLowerCase().includes(q) ||
      (p.phone || '').includes(q)
    );
  }, [searchQuery, patients]);

  useEffect(() => {
    if (visitMotif === 'CONSULTATION' || visitMotif === 'SOIN_INFIRMIER') {
      setShowUpsell(true);
    } else {
      setShowUpsell(false);
    }
  }, [visitMotif]);

  const handleSelectPatient = (p: Patient) => {
    setCurrentPatient(p);
    setStep('triage');
    setSearchQuery('');
  };

  const finalizeAdmission = async (sendToNurseTriage: boolean = false) => {
    const todayStr = new Date().toISOString().split('T')[0];
    const timeStr = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    
    // Generate sequential IDs if current patient has temporary ones
    let patientId = currentPatient.patientId || currentPatient.id || '';
    let dmeId = currentPatient.id || '';

    setIsSaving(true);
    try {
      if (!String(patientId || '').startsWith('PAT-2026') || !String(dmeId || '').startsWith('DME-2026')) {
        const seqIds = await getNextSequentialIdsAndAssign();
        patientId = seqIds.patientId;
        dmeId = seqIds.dmeId;
      }

      const finalVitals = (!sendToNurseTriage && currentPatient.vitals) ? {
        ...currentPatient.vitals,
        bmi: computedBMI
      } : undefined;

      const finalPatient: Patient = {
        ...currentPatient,
        id: dmeId,
        patientId: patientId,
        status: PatientStatus.DISCHARGED,
        vitals: finalVitals,
        createdAt: currentPatient.createdAt || new Date().toISOString()
      } as Patient;

      // Create PaymentRequest
      const items = [];
      if (selectedMotif) {
        items.push({
          id: `ITEM-${Math.floor(Math.random() * 1000)}`,
          name: selectedMotif.label,
          quantity: 1,
          unitPrice: selectedMotif.fee,
          totalPrice: selectedMotif.fee
        });
      } else if (visitMotif) {
        items.push({
          id: `ITEM-${Math.floor(Math.random() * 1000)}`,
          name: getOrientationData(visitMotif).label,
          quantity: 1,
          unitPrice: getOrientationData(visitMotif).fee,
          totalPrice: getOrientationData(visitMotif).fee
        });
      }

      if (notebookAdded) {
        items.push({
          id: `ITEM-CARNET`,
          name: 'Carnet Médical',
          quantity: 1,
          unitPrice: 1000,
          totalPrice: 1000
        });
      }

      const reqType = selectedMotif?.category === 'CONSULTATIONS' ? 'CONSULTATION' :
                       selectedMotif?.category === 'MATERNITE' ? 'MATERNITE' :
                       selectedMotif?.category === 'URGENCES' ? 'HOSPITALISATION' : // compatible with original type limits
                       visitMotif === 'CONSULTATION' ? 'CONSULTATION' : 
                       visitMotif === 'LABORATOIRE' ? 'LABORATOIRE' : 
                       visitMotif === 'MATERNITE' ? 'MATERNITE' : 
                       visitMotif === 'HOSPITALISATION' ? 'HOSPITALISATION' : 'AUTRE';

      // Specialty-Specific Same-Day Redundancy Check
      const today = new Date().toISOString().split('T')[0];
      const targetSpecialityName = selectedMotif?.speciality || 'Médecine générale';
      const targetMotifLabel = selectedMotif?.label || getOrientationData(visitMotif || 'CONSULTATION').label;

      const existingSameSpecialtyTicket = paymentRequests.find(pr => 
        pr.patientId === patientId && 
        pr.createdAt?.startsWith(today) &&
        (pr.status === 'PENDING' || pr.status === 'PAID') &&
        pr.items?.some(item => 
          (item.name || '').toLowerCase().includes(targetMotifLabel.toLowerCase()) || 
          (item.name || '').toLowerCase().includes(targetSpecialityName.toLowerCase())
        )
      );

      if (existingSameSpecialtyTicket) {
        if (existingSameSpecialtyTicket.status === 'PENDING') {
          window.dispatchEvent(new CustomEvent('app-notification', { 
            detail: `ℹ️ Un ticket d'admission pour « ${targetMotifLabel} » est déjà en cours et en attente de paiement à la Caisse (Réf: ${existingSameSpecialtyTicket.id}).` 
          }));
          setSelectedTxForProforma(existingSameSpecialtyTicket);
          setSelectedHistoryDate(todayStr);
          setStep('summary');
          setIsSaving(false);
          return;
        }
      }

      let p5 = Promise.resolve();
      let reqIdForLog = '';
      let createdRequest: PaymentRequest | null = null;
      createdRequest = {
        id: `REQ-${Math.floor(Math.random() * 9000) + 1000}`,
        patientId: patientId,
        patientName: `${finalPatient.lastName} ${finalPatient.firstName}`,
        requestingService: 'Accueil',
        sourceModule: 'Reception',
        type: reqType,
        items: items,
        totalAmount: totalToPay,
        amountPaid: 0,
        status: 'PENDING',
        createdAt: new Date().toISOString(),
        createdBy: user?.name || 'Système'
      };
      reqIdForLog = createdRequest.id;
      p5 = setDoc(doc(db, 'payment_requests', createdRequest.id), sanitizeData(createdRequest));

      // Calculate Routing Destination Service Name and Queue
      let targetQueue = 'Médecine Générale';
      let targetSpeciality = 'Médecine générale';
      let targetService = 'Consultation';

      if (selectedMotif) {
        targetQueue = selectedMotif.queueName;
        targetSpeciality = selectedMotif.speciality;

        // Check hospital services configurations from live hook or fallback
        const matched = (hospitalServices || []).find((s: any) => 
          s.id.toLowerCase() === selectedMotif.serviceId.toLowerCase() ||
          s.name.toLowerCase() === selectedMotif.serviceId.toLowerCase()
        );
        if (matched) {
          targetService = matched.name;
        } else {
          // fallback standard mappings
          if (selectedMotif.serviceId === 'SRV-MATERNITE') targetService = 'Maternité';
          else if (selectedMotif.serviceId === 'SRV-URGENCES') targetService = 'Urgences';
          else if (selectedMotif.serviceId === 'SRV-HOSPITALISATION') targetService = 'Hospitalisation';
          else if (selectedMotif.serviceId === 'SRV-LABO') targetService = 'Laboratoire';
          else if (selectedMotif.serviceId === 'SRV-INFIRMIER') targetService = 'Soins infirmiers';
          else if (selectedMotif.serviceId === 'SRV-VACCINATION') targetService = 'Vaccination';
          else if (selectedMotif.serviceId === 'SRV-PHARMACIE') targetService = 'Pharmacie';
          else targetService = selectedMotif.queueName || 'Consultation';
        }
      } else {
        targetService = 
          visitMotif === 'CONSULTATION' ? 'Consultation' :
          visitMotif === 'URGENCE' ? 'Urgences' :
          visitMotif === 'LABORATOIRE' ? 'Laboratoire' :
          visitMotif === 'SOIN_INFIRMIER' ? 'Soins infirmiers' :
          visitMotif === 'MATERNITE' ? 'Maternité' : 'Consultation';

        targetQueue = 
          visitMotif === 'CONSULTATION' ? '' :
          visitMotif === 'URGENCE' ? 'Urgences' :
          visitMotif === 'LABORATOIRE' ? 'Laboratoire' :
          visitMotif === 'SOIN_INFIRMIER' ? 'Soins infirmiers' :
          visitMotif === 'MATERNITE' ? 'Maternité' : '';
          
        targetSpeciality = targetQueue;
      }

      // Direct Maternity Routing: Bypass general nursing triage
      // Maternity patients (CPN, labor, obstetrics) have their vitals and fetal heart tones taken directly by midwives
      const isMaternityService = 
        selectedMotif?.category === 'MATERNITE' || 
        selectedMotif?.serviceId === 'SRV-MATERNITE' || 
        visitMotif === 'MATERNITE' ||
        (selectedMotif?.label && /matern|cpn|gynéco|obstétri/i.test(selectedMotif.label)) ||
        (targetService && /matern|cpn|gynéco|obstétri/i.test(targetService)) ||
        (targetQueue && /matern|cpn|gynéco|obstétri/i.test(targetQueue)) ||
        (targetSpeciality && /matern|cpn|gynéco|obstétri/i.test(targetSpeciality));

      const effectiveSendToNurseTriage = isMaternityService ? false : sendToNurseTriage;

      // Write database actions in parallel!
      const p1 = setDoc(doc(db, 'patients', finalPatient.id), sanitizeData(finalPatient));

      const p2 = setDoc(doc(db, 'medical_records', dmeId), sanitizeData({
        id: dmeId,
        patientId: patientId,
        createdAt: new Date().toISOString(),
        createdBy: user?.name || 'Agent Accueil',
        vitals: finalPatient.vitals || {},
        history: [
          {
            action: isMaternityService 
              ? `Patiente admise et orientée directement en Maternité (Triage infirmier général contourné)`
              : `Patient enregistré - Motif de recours: ${selectedMotif?.label || visitMotif}`,
            user: user?.name || 'Agent Accueil',
            date: todayStr,
            time: timeStr
          }
        ]
      }));

      const visitDocRef = doc(collection(db, 'reception_visits'));
      const visitData = {
        id: visitDocRef.id,
        patientId: patientId,
        patientName: `${finalPatient.lastName} ${finalPatient.firstName}`,
        date: todayStr,
        time: timeStr,
        motif: visitMotif,
        motifId: selectedMotif?.id || '',
        motifLabel: selectedMotif?.label || '',
        orientation: isMaternityService ? 'Maternité (Direct)' : (selectedMotif?.label || getOrientationData(visitMotif || 'CONSULTATION').label),
        user: user?.name || 'Agent Accueil',
        createdAt: new Date().toISOString()
      };
      const p3 = setDoc(visitDocRef, sanitizeData(visitData));

      let p4 = Promise.resolve();
      if (!effectiveSendToNurseTriage && finalPatient.vitals) {
        const triageDocRef = doc(collection(db, 'triage_records'));
        p4 = setDoc(triageDocRef, sanitizeData({
          id: triageDocRef.id,
          patientId: patientId,
          visitId: visitDocRef.id,
          vitals: finalPatient.vitals,
          priority: computedPriorityAndAlerts.priority,
          priorityAlerts: computedPriorityAndAlerts.alerts,
          createdAt: new Date().toISOString(),
          createdBy: user?.name || 'Agent Accueil'
        }));
      }

      // Check for duplicate in queue to prevent double clicks creating multiple records
      const initialStatus = effectiveSendToNurseTriage ? 'waiting_triage' : 'waiting';
      const existingQueueQuery = query(
        collection(db, 'service_queues'),
        where('patientId', '==', patientId),
        where('serviceId', '==', selectedMotif?.serviceId || ''),
        where('status', 'in', ['waiting', 'waiting_triage'])
      );
      const existingQueueSnap = await getDocs(existingQueueQuery);
      
      let p6 = Promise.resolve();
      if (existingQueueSnap.empty) {
        const queueDocRef = doc(collection(db, 'service_queues'));
        p6 = setDoc(queueDocRef, sanitizeData({
          id: queueDocRef.id,
          patientId: patientId,
          dmeId: dmeId,
          firstName: finalPatient.firstName,
          lastName: finalPatient.lastName,
          age: calculateAge(finalPatient.birthDate),
          gender: finalPatient.gender,
          time: timeStr,
          date: todayStr,
          motif: visitMotif,
          motifId: selectedMotif?.id || '',
          motifLabel: selectedMotif?.label || '',
          speciality: isMaternityService ? 'Obstétrique / CPN' : targetSpeciality,
          queueName: isMaternityService ? (targetQueue || 'Salle d\'attente Maternité') : targetQueue,
          service: isMaternityService ? 'Maternité' : targetService,
          serviceId: isMaternityService ? 'SRV-MATERNITE' : (selectedMotif?.serviceId || ''),
          status: initialStatus,
          paymentStatus: 'AWAITING_PAYMENT',
          priority: effectiveSendToNurseTriage ? 'normal' : computedPriorityAndAlerts.priority,
          priorityAlerts: effectiveSendToNurseTriage ? [] : computedPriorityAndAlerts.alerts,
          vitals: finalPatient.vitals ? {
            temp: finalPatient.vitals?.temp,
            bp: `${finalPatient.vitals?.bpSys}/${finalPatient.vitals?.bpDia}`,
            pulse: finalPatient.vitals?.pulse,
            spo2: finalPatient.vitals?.spo2,
            weight: finalPatient.vitals?.weight,
            height: finalPatient.vitals?.height,
            bmi: finalPatient.vitals?.bmi
          } : null,
          createdAt: new Date().toISOString()
        }));
      }

      let p7 = Promise.resolve();
      if (selectedMotif?.category === 'HOSPITALISATION') {
        const hospDocRef = doc(collection(db, 'hospitalisation_requests'));
        p7 = setDoc(hospDocRef, sanitizeData({
          id: hospDocRef.id,
          patientId: patientId,
          patientName: `${finalPatient.lastName} ${finalPatient.firstName}`,
          service: 'Admission Directe',
          motif: selectedMotif.label,
          priority: computedPriorityAndAlerts.priority === 'normal' ? 'Normal' : (computedPriorityAndAlerts.priority === 'urgent' ? 'Urgent' : 'Critique'),
          status: 'pending',
          createdAt: new Date().toISOString(),
          requestedBy: user?.name || 'Agent Accueil'
        }));
      }

      let p8 = Promise.resolve();
      if (selectedMotif?.category === 'URGENCES' || visitMotif === 'URGENCE' || targetService === 'Urgences' || targetQueue === 'Urgences') {
        const erDocRef = doc(collection(db, 'emergency_patients'));
        p8 = setDoc(erDocRef, sanitizeData({
          id: erDocRef.id,
          patientId: patientId,
          patientDme: dmeId,
          patientName: `${finalPatient.lastName} ${finalPatient.firstName}`,
          firstName: finalPatient.firstName,
          lastName: finalPatient.lastName,
          age: calculateAge(finalPatient.birthDate),
          gender: finalPatient.gender,
          arrivalDate: todayStr,
          arrivalTime: timeStr,
          arrivalTimestamp: new Date().toISOString(),
          arrivalMotif: selectedMotif?.label || 'Admission Urgences',
          orientationSource: 'Accueil',
          status: 'En attente',
          vitals: finalPatient.vitals ? [{
            id: `vit_${Date.now()}`,
            timestamp: new Date().toISOString(),
            date: todayStr,
            time: timeStr,
            bpSys: finalPatient.vitals.bpSys,
            bpDia: finalPatient.vitals.bpDia,
            heartRate: finalPatient.vitals.pulse,
            temp: finalPatient.vitals.temp,
            spo2: finalPatient.vitals.spo2,
            weight: finalPatient.vitals.weight,
            height: finalPatient.vitals.height,
            measuredBy: user?.name || 'Agent Accueil'
          }] : [],
          cares: [],
          followUps: [],
          voiceNotes: []
        }));
      }

      await Promise.all([p1, p2, p3, p4, p5, p6, p7, p8]);

      // Set selectedTxForProforma for the summary screen ticket view
      setSelectedTxForProforma(createdRequest);

      // Write traceability audit logs in parallel
      await Promise.all([
        logAudit(`Création Dossier Patient & Admission`, { patientId, patientName: `${finalPatient.lastName} ${finalPatient.firstName}` }),
        logAudit(`Création Visite d'admission`, { visitId: visitDocRef.id, motif: selectedMotif?.label || visitMotif }),
        (!effectiveSendToNurseTriage && finalPatient.vitals) ? logAudit(`Triage avec calcul priorité effectué: ${computedPriorityAndAlerts.priority}`, { patientId }) : Promise.resolve(),
        logAudit(isMaternityService ? `Orientation directe en Maternité (Triage infirmier général contourné)` : (effectiveSendToNurseTriage ? `Orientation vers File de Triage Infirmier` : `Orientation Patient vers ${targetService} (${targetQueue})`), { patientId }),
        reqIdForLog ? logAudit(`Création de la demande de paiement d'admission`, { reqId: reqIdForLog, amount: totalToPay }) : Promise.resolve()
      ]);

      // Live trigger notifications toast
      const toastMsg = isMaternityService
        ? `Admission enregistrée pour ${finalPatient.lastName} ${finalPatient.firstName} -> Transférée directement en Maternité (Triage sage-femme)`
        : effectiveSendToNurseTriage
        ? `Admission enregistrée pour ${finalPatient.lastName} ${finalPatient.firstName} -> Transféré(e) en File de Triage Infirmier`
        : `Admission et orientation effectuées pour ${finalPatient.lastName} ${finalPatient.firstName}`;
      
      window.dispatchEvent(new CustomEvent('app-notification', { detail: toastMsg }));

      // setPatients will be handled by onSnapshot
      setSelectedHistoryDate(todayStr);
      setStep('summary');

    } catch (err: any) {
      console.error("Firestore persistence failed matching requirements:", err);
      alert(`Erreur d'enregistrement: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const waitingCount = useMemo(() => {
    return (globalWaitingQueue || []).filter(q => q.status === 'waiting').length;
  }, [globalWaitingQueue]);

  const activeWaitingList = useMemo(() => {
    // Return all patients in the queue for today that are strictly waiting
    return (globalWaitingQueue || []).filter(q => q.status === 'waiting');
  }, [globalWaitingQueue]);

  const todaysRequests = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    return paymentRequests.filter(pr => (pr.sourceModule === 'Reception' || pr.sourceModule === 'RECEPTION') && pr.createdAt && pr.createdAt.startsWith(todayStr));
  }, [paymentRequests]);

  const calculateAge = (dateString?: string) => {
    if (!dateString) return 0;
    const today = new Date();
    const birthDate = new Date(dateString);
    if (isNaN(birthDate.getTime())) return 0;
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
    return age;
  };

  const handleDischarge = async (id: string) => {
    if (isProcessingDischarge) return;
    const patient = patientsToDischarge.find(p => p.id === id);
    if (!patient) return;

    // Strict criteria safety checks
    const unmet = [];
    if (patient.medicalClearance !== true) unmet.push("Autorisation médicale obligatoire manquante");
    if (patient.hospitalizationClosed !== true) unmet.push("Dossier d'hospitalisation non clos");
    if (patient.financialClearance !== true) unmet.push("Solde ou régularisation de facturation de caisse non accomplie");
    if ((patient as any).hasOutstandingEmergencyDebt === true || (patient as any).isLockedForDischarge === true) {
      unmet.push("🔒 BLOQUÉ : Le patient possède une dette d'urgence laboratoire non réglée. Régularisation à la Caisse obligatoire");
    }

    // Check dettes_patient collection for emergency debts
    try {
      const debtQ = query(
        collection(db, 'dettes_patient'), 
        where('patientId', '==', patient.id), 
        where('status', '==', 'PENDING')
      );
      const debtSnap = await getDocs(debtQ);
      if (!debtSnap.empty) {
        const hasLabDebt = debtSnap.docs.some(d => d.data().origin === 'LABORATOIRE_URGENCE');
        if (hasLabDebt) {
          unmet.push("🔒 BLOQUÉ : Dette d'urgence laboratoire non réglée détectée");
        }
      }
    } catch (e) {
      console.error("Error checking patient emergency debts:", e);
    }

    if (unmet.length > 0) {
      setDischargeError({
        patientId: id,
        message: `${unmet.join('. ')}.`
      });
      // Clear message after 10 seconds
      setTimeout(() => {
        setDischargeError(null);
      }, 10000);
      return;
    }

    try {
      setIsProcessingDischarge(id);
      setDischargeError(null);

      // 1. Create entrance inside 'discharges' collection
      const dischargeDocRef = doc(collection(db, 'discharges'));
      const dischargeData = {
        id: dischargeDocRef.id,
        patientId: patient.id,
        patientName: patient.name,
        department: patient.department || 'Général',
        admissionDate: patient.admissionDate,
        dischargeDate: new Date().toLocaleDateString('fr-FR'),
        dischargeTime: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
        user: user?.name || 'Agent d\'accueil',
        status: 'completed',
        createdAt: new Date().toISOString()
      };

      const notifDocRef = doc(collection(db, 'notifications'));

      // Save database actions in parallel
      const p1 = setDoc(dischargeDocRef, sanitizeData(dischargeData));
      const p2 = deleteDoc(doc(db, 'discharges_waiting', patient.id));
      const p3 = setDoc(notifDocRef, sanitizeData({
        id: notifDocRef.id,
        message: `Sortie administrative validée pour ${patient.name} (${patient.id})`,
        module: 'Reception',
        targetModules: ['Cashier', 'Dashboard', 'Doctor'],
        createdAt: new Date().toISOString()
      }));
      const p4 = logAudit(`Sortie administrative validée`, { patientId: patient.id, patientName: patient.name });

      await Promise.all([p1, p2, p3, p4]);

      // Local state sync
      setPatientsToDischarge(prev => prev.filter(p => p.id !== id));

      // System notification toast
      window.dispatchEvent(new CustomEvent('app-notification', { 
        detail: `Sortie administrative validee pour ${patient.name}` 
      }));

      // 5. Generate and download official discharge PDF
      handleGeneratePDF('autorisation_sortie', patient);

    } catch (err: any) {
      console.error("Discharge validation failure:", err);
      alert(`Erreur lors du traitement de la sortie: ${err.message}`);
    } finally {
      setIsProcessingDischarge(null);
    }
  };

  const [dashboardFilter, setDashboardFilter] = useState<string | null>(null);

  const handleDashboardFilterClick = (filterType: string) => {
    if (filterType === 'waiting') {
      setActiveTab('triage');
    } else if (filterType === 'sorties' || filterType === 'discharges') {
      setActiveTab('sorties');
    } else if (filterType === 'emergencies') {
      setActiveTab('triage');
    } else if (filterType === 'admissions') {
      setDashboardFilter(prev => prev === 'admissions' ? null : 'admissions');
    }
  };

  const displayedTodaysRequests = useMemo(() => {
    if (dashboardFilter === 'admissions') {
      return todaysRequests;
    }
    return todaysRequests;
  }, [todaysRequests, dashboardFilter]);

  return (
    <div className={`h-screen flex flex-col overflow-hidden p-3 sm:p-5 font-sans ${theme === 'dark' ? 'bg-[#020617] text-white' : 'bg-slate-50 text-slate-900'}`}>
      {/* MODAL PRO-FORMA IMPRIMABLE */}
      {showProforma && selectedTxForProforma && (() => {
        const txId = selectedTxForProforma.id || '';
        
        let txDate = selectedTxForProforma.date || '';
        let txTime = selectedTxForProforma.time || '';
        if (selectedTxForProforma.createdAt) {
          try {
            const d = new Date(selectedTxForProforma.createdAt);
            if (!isNaN(d.getTime())) {
              txDate = d.toLocaleDateString('fr-FR');
              txTime = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
            }
          } catch (err) {}
        }
        if (!txDate) txDate = new Date().toLocaleDateString('fr-FR');
        if (!txTime) txTime = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

        const patientName = selectedTxForProforma.patient || selectedTxForProforma.patientName || 'Patient Anonyme';
        const dme = selectedTxForProforma.dme || selectedTxForProforma.patientId || 'VENTE DIRECTE';
        
        let motif = selectedTxForProforma.motif || selectedTxForProforma.requestingService || selectedTxForProforma.type || 'Acte Médical';
        if (motif === 'CONSULTATION') motif = 'Consultation Générale';
        
        const totalVal = selectedTxForProforma.total !== undefined ? selectedTxForProforma.total : (selectedTxForProforma.totalAmount || 0);
        const paidVal = selectedTxForProforma.paid !== undefined ? selectedTxForProforma.paid : (selectedTxForProforma.amountPaid || 0);
        
        const changeVal = selectedTxForProforma.change !== undefined ? selectedTxForProforma.change : Math.max(0, paidVal - totalVal);
        const remainingVal = selectedTxForProforma.remaining !== undefined ? selectedTxForProforma.remaining : Math.max(0, totalVal - paidVal);

        return (
          <div className="fixed inset-0 z-[120] bg-slate-900/70 backdrop-blur-md flex items-center justify-center p-3 sm:p-4">
             <div className="ticket-print-wrapper bg-white w-full max-w-md max-h-[90vh] flex flex-col rounded-[32px] shadow-2xl overflow-hidden border border-slate-150 animate-in zoom-in-95 duration-300">
               {/* Fixed Top Header with Dotted Cutout Effect */}
               <div className="p-6 bg-slate-50 border-b border-dashed border-slate-200 relative shrink-0">
                 <div className="flex justify-between items-start">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center font-black text-white italic text-xs shadow-md">{establishment.logo || 'SH'}</div>
                      <div>
                        <h2 className="text-base font-extrabold uppercase tracking-tight text-slate-900">{establishment.name}</h2>
                        <p className="text-[9px] font-bold text-slate-400">Fiche d'Orientation N° {txId}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider mb-1">
                        <span className="w-1 h-1 rounded-full bg-amber-500 animate-pulse"></span> À Régler en Caisse
                      </span>
                      <p className="text-[10px] font-bold text-slate-500">{txDate} • {txTime}</p>
                    </div>
                 </div>
                 {/* Left & Right small visual semicircles for "ticket punch" effect */}
                 <div className="absolute -left-3 bottom-[-12px] w-6 h-6 bg-slate-900/70 rounded-full no-print"></div>
                 <div className="absolute -right-3 bottom-[-12px] w-6 h-6 bg-slate-900/70 rounded-full no-print"></div>
               </div>

               {/* Scrollable Ticket Content Body */}
               <div className="ticket-scroll-area flex-1 overflow-y-auto p-6 space-y-5 custom-scrollbar">
                 {/* Slogan */}
                 {establishment.slogan && (
                   <p className="text-[10px] font-medium italic text-center text-slate-500 mb-2 px-2 leading-tight">
                     "{establishment.slogan}"
                   </p>
                 )}

                 {/* Ticket Identification */}
                 <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4">
                   <div className="grid grid-cols-2 gap-4">
                     <div>
                       <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Patient</p>
                       <p className="font-extrabold text-sm text-slate-900 truncate">{patientName}</p>
                       <p className="text-[10px] text-blue-600 font-mono font-bold tracking-tighter">{dme}</p>
                     </div>
                     <div className="text-right border-l border-slate-100 pl-4">
                       <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Opérateur</p>
                       <p className="font-bold text-xs text-slate-700 truncate">{agentProfile.name}</p>
                       <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Accueil</p>
                     </div>
                   </div>
                 </div>

                 {/* Prestation Details with thermal-style dashed lines */}
                 <div className="space-y-2">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Détails des Prestations</p>
                    <div className="border-t border-b border-dashed border-slate-200 py-3 space-y-2">
                      <div className="flex justify-between items-center text-xs">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-500">1x</span>
                          <span className="font-bold text-slate-800">{motif}</span>
                        </div>
                        <span className="font-extrabold text-slate-900">{(totalVal || 0).toLocaleString()} F</span>
                      </div>
                      {notebookAdded && (
                        <div className="flex justify-between items-center text-xs">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-500">1x</span>
                            <span className="font-bold text-slate-800">Carnet de Santé</span>
                          </div>
                          <span className="font-extrabold text-slate-900">1 000 F</span>
                        </div>
                      )}
                    </div>
                 </div>

                 {/* Premium Summary Grid */}
                 <div className="bg-slate-900 text-white p-5 rounded-2xl space-y-2 relative overflow-hidden">
                    <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-slate-400">
                      <span>Total Prestations</span>
                      <span className="text-slate-200 font-bold">{(totalVal || 0).toLocaleString()} {currency}</span>
                    </div>
                    <div className="pt-2.5 border-t border-white/10 flex justify-between items-center">
                      <div>
                        <span className="text-[10px] font-black uppercase text-amber-400 tracking-wider block">Montant à Payer</span>
                        <span className="text-[8px] text-slate-400 italic">Règlement à effectuer à la Caisse</span>
                      </div>
                      <span className="text-xl font-black text-amber-400">{(totalVal || 0).toLocaleString()} <span className="text-xs font-normal opacity-70 italic">CFA</span></span>
                    </div>
                 </div>

                 {/* Warning Notice Box */}
                 <div className="p-3.5 bg-rose-50 border border-rose-100 rounded-2xl text-left">
                   <p className="text-[10px] font-black uppercase tracking-wider text-rose-700 mb-0.5">⚠️ Document Pro-forma</p>
                   <p className="text-[9px] text-rose-600 font-medium leading-relaxed">
                     Valable pour consultation uniquement après règlement effectif et validation à la Caisse centrale.
                   </p>
                 </div>

                 {/* Invoice Footer */}
                 {establishment.invoiceFooter && (
                   <p className="text-[9px] text-center text-slate-400 font-medium leading-relaxed italic px-2">
                     {establishment.invoiceFooter}
                   </p>
                 )}
                 
                 {establishment.website && (
                   <p className="text-[9px] text-center text-blue-500 font-bold tracking-wider">
                     {establishment.website}
                   </p>
                 )}
               </div>

               {/* Fixed Action Buttons at the Bottom */}
               <div className="ticket-actions-bar p-5 bg-slate-50 border-t border-slate-100 shrink-0 no-print">
                 <div className="flex gap-3">
                   <button 
                     onClick={() => setShowProforma(false)} 
                     className="flex-1 py-3.5 bg-white border border-slate-200 text-slate-700 font-bold text-xs uppercase tracking-wider rounded-2xl hover:bg-slate-100 transition-colors shadow-sm"
                   >
                     Fermer
                   </button>
                   <button 
                     onClick={() => handleGeneratePDF("proforma", selectedTxForProforma)} 
                     className="flex-[2] bg-blue-600 text-white py-3.5 rounded-2xl font-bold text-xs uppercase tracking-wider shadow-md hover:bg-blue-700 transition-all flex items-center justify-center gap-2"
                   >
                     <Printer size={16} /> Imprimer Fiche / Pro-forma
                   </button>
                 </div>
               </div>
             </div>
          </div>
        );
      })()}

      <MicroHeader
        icon={Users}
        breadcrumbs={[
          { label: 'Accueil', onClick: () => setActiveTab('dashboard') },
          { 
            label: activeTab === 'dashboard' ? 'Tableau de Bord' :
                   activeTab === 'triage' ? 'Admissions & Triage' : 
                   activeTab === 'sorties' ? 'Sorties' : 
                   activeTab === 'historique' || activeTab === 'demandes' ? 'Historique' : 'Profil',
            active: true
          }
        ]}
        onHomeClick={onBackToDashboard}
        onBackClick={activeTab !== 'dashboard' ? () => setActiveTab('dashboard') : undefined}
        user={{ name: agentProfile.name }}
        theme={theme}
        actions={
          <div className="flex items-center gap-1.5 overflow-x-auto">
            {[
              { id: 'dashboard', label: 'Dashboard' },
              { id: 'triage', label: `Triage (${globalWaitingQueue.filter(q => q.status === 'waiting' || q.status === 'waiting_triage').length})` },
              { id: 'sorties', label: `Sorties (${patientsToDischarge.length})` },
              { id: 'historique', label: 'Historique' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-3 py-1.5 rounded-xl font-bold text-xs transition-all cursor-pointer ${
                  activeTab === tab.id
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        }
      />

      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
      {activeTab === 'dashboard' && (
        <ReceptionDashboard 
          theme={theme}
          patients={patients}
          globalWaitingQueue={globalWaitingQueue}
          patientsToDischarge={patientsToDischarge}
          paymentRequests={paymentRequests}
          onFilterClick={handleDashboardFilterClick}
          activeFilter={dashboardFilter || undefined}
        >
          {/* Table section for Dashboard */}
          <div className="bg-white rounded-[32px] border border-slate-200 shadow-sm overflow-hidden mt-6">
            <div className="p-6 border-b bg-slate-50/50 flex justify-between items-center">
              <h3 className="font-black text-xs uppercase tracking-wider flex items-center gap-2 text-slate-800">
                <Users size={16} className="text-blue-600" /> Admissions & Orientations Récentes (Temps Réel)
              </h3>
              <button onClick={() => setActiveTab('historique')} className="text-xs font-bold text-blue-600 hover:underline flex items-center gap-1 cursor-pointer">
                Consulter Tout l'Historique →
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-6 py-3.5 text-[9px] font-black text-slate-400 uppercase tracking-widest">Patient</th>
                    <th className="px-6 py-3.5 text-[9px] font-black text-slate-400 uppercase tracking-widest">Type / Motif</th>
                    <th className="px-6 py-3.5 text-[9px] font-black text-slate-400 uppercase tracking-widest">Montant</th>
                    <th className="px-6 py-3.5 text-[9px] font-black text-slate-400 uppercase tracking-widest">Statut</th>
                    <th className="px-6 py-3.5 text-[9px] font-black text-slate-400 uppercase tracking-widest">Heure</th>
                    <th className="px-6 py-3.5 text-[9px] font-black text-slate-400 uppercase tracking-widest">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {displayedTodaysRequests.length > 0 ? displayedTodaysRequests.slice(0, 15).map((p, i) => (
                    <tr 
                      key={p.id || `req-${p.patientId || 'patient'}-${p.createdAt || ''}-${i}`} 
                      onClick={() => { setSelectedTxForProforma(p); setShowProforma(true); }}
                      className="hover:bg-blue-50/50 transition-colors group cursor-pointer"
                    >
                      <td className="px-6 py-4">
                        <p className="font-bold text-slate-900 text-sm group-hover:text-blue-600 transition-colors">{p.patientName}</p>
                        <p className="text-[10px] text-slate-400 font-bold font-mono tracking-tighter uppercase">{p.patientId}</p>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-xs font-bold text-slate-600 uppercase tracking-tight">{p.type}</span>
                      </td>
                      <td className="px-6 py-4 font-black text-sm text-slate-700">
                        {((p.totalAmount || 0) || (p.total || 0)).toLocaleString()} <span className="text-[10px] opacity-50">CFA</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`text-[9px] font-black px-2.5 py-1 rounded-xl border ${p.status === 'PENDING' ? 'bg-amber-50 text-amber-600 border-amber-200' : p.status === 'PAID' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-rose-50 text-rose-600 border-rose-200'}`}>
                          {p.status === 'PENDING' ? 'EN ATTENTE' : p.status === 'PAID' ? 'PAYÉ' : 'ANNULÉ'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-[10px] text-slate-400 font-bold italic">
                        {p.createdAt ? new Date(p.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                      </td>
                      <td className="px-6 py-4">
                        <button 
                          onClick={(e) => { e.stopPropagation(); setSelectedTxForProforma(p); setShowProforma(true); }}
                          className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all cursor-pointer"
                          title="Voir le Ticket"
                        >
                          <Printer size={16} />
                        </button>
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-slate-400 text-xs font-bold uppercase tracking-widest italic opacity-50">
                        Aucune admission aujourd'hui
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </ReceptionDashboard>
      )}

      {activeTab === 'triage' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className="lg:col-span-8 space-y-6">
            {step === 'search' && (
              <div className="space-y-6 animate-in fade-in duration-500">
                <div className="bg-white p-10 rounded-[40px] shadow-sm border border-slate-200">
                  <h2 className="text-2xl font-extrabold mb-8 flex items-center gap-3 font-heading uppercase italic tracking-tight"><Search className="text-blue-600" /> Identifier Patient</h2>
                <div className="relative mb-6">
                  <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400" size={24} />
                  <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Nom ou N° DME..." className="w-full pl-16 pr-6 py-6 bg-slate-50 border-2 border-slate-100 rounded-3xl outline-none focus:border-blue-500 transition-all text-xl font-medium" />
                </div>
                {searchQuery.length > 0 && (
                  <div className="mb-8 overflow-hidden rounded-3xl border border-slate-100 bg-slate-50">
                    {filteredPatients.length > 0 ? filteredPatients.map((p, idx) => {
                      const today = new Date().toISOString().split('T')[0];
                      const patientAppointment = appointments.find(a => 
                        (a.patientId === p.id || a.patientId === p.patientId) && 
                        a.date === today && 
                        (a.status === 'PENDING' || a.status === 'IN_PROGRESS')
                      );

                      return (
                        <div key={`${p.id || idx}-${idx}`} className="w-full p-6 flex items-center justify-between hover:bg-blue-50/70 transition-colors border-b last:border-0 border-slate-100 group">
                          <button onClick={() => handleSelectPatient(p)} className="flex items-center gap-4 text-left flex-1">
                            <div className="w-12 h-12 rounded-2xl bg-white flex items-center justify-center text-slate-400 group-hover:text-blue-600 shadow-sm relative shrink-0">
                              <UserIcon />
                              {patientAppointment && (
                                <div className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full border-2 border-white animate-pulse" title="Rendez-vous aujourd'hui"></div>
                              )}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="font-black text-slate-900">{p.lastName} {p.firstName}</p>
                                {patientAppointment && (
                                  <span className="bg-emerald-50 text-emerald-600 text-[8px] font-black uppercase px-2 py-0.5 rounded-full border border-emerald-100">RDV Confirmé</span>
                                )}
                              </div>
                              <p className="text-xs text-slate-500 font-bold font-mono">{p.id} • {calculateAge(p.birthDate)} ans</p>
                            </div>
                          </button>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setCurrentPatient(p);
                                setActiveTab('historique');
                              }}
                              className="px-3 py-1.5 bg-slate-100 hover:bg-blue-100 text-slate-700 hover:text-blue-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
                              title="Consulter l'historique complet de ce patient"
                            >
                              <History size={14} />
                              <span className="hidden sm:inline">Historique</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSelectPatient(p)}
                              className="p-2 text-slate-300 group-hover:text-blue-600 hover:bg-blue-100 rounded-xl transition-all"
                              title="Orienter ce patient"
                            >
                              <ChevronRight size={20} />
                            </button>
                          </div>
                        </div>
                      );
                    }) : <div className="p-10 text-center"><p className="text-slate-400 font-bold text-sm">Aucun dossier trouvé</p></div>}
                  </div>
                )}
                <button onClick={async () => { const ids = await getNextSequentialIdsAndAssign(); setCurrentPatient({ id: ids.dmeId, patientId: ids.patientId, gender: 'M', maritalStatus: 'CELIBATAIRE', vitals: { bpSys: 120, bpDia: 80, heartRate: 75, respRate: 18, pulse: 75, spo2: 98, temp: 37, height: 170, weight: 70, bmi: 24.2, waistCirc: 85 } }); setStep('register'); }} className="w-full p-8 border-2 border-dashed border-slate-200 rounded-3xl hover:border-blue-500 hover:bg-blue-50/50 transition-all flex flex-col items-center text-center group">
                  <UserPlus size={40} className="text-slate-300 group-hover:text-blue-500 mb-2" /><h3 className="font-bold">Créer un nouveau Dossier DME</h3>
                </button>
              </div>
            </div>
          )}

            {step === 'register' && (
              <div className="bg-white p-10 rounded-[40px] shadow-sm border border-slate-200 animate-in slide-in-from-right-4">
                {renderStepper(1)}
                
                <div className="flex justify-between items-center mb-8 pb-4 border-b border-slate-100">
                  <div>
                    <h2 className="text-3xl font-extrabold italic text-slate-900 font-heading uppercase tracking-tight">Nouveau Dossier DME</h2>
                    <p className="text-sm text-slate-500 font-semibold italic mt-1 font-heading">Étape 1: Saisie des informations d'état-civil essentielles</p>
                  </div>
                  <button 
                    onClick={() => setStep('search')} 
                    className="px-4 py-2 bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200/60 rounded-xl font-bold text-xs uppercase tracking-wider transition-all"
                  >
                    ← Revenir
                  </button>
                </div>

                {/* Live Anti-Doublon Banner */}
                {liveDuplicate.isDuplicate && liveDuplicate.matchedPatient && (
                  <div className="mb-8 p-5 bg-amber-50 border-2 border-amber-400 rounded-3xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 animate-in fade-in shadow-sm">
                    <div className="flex items-start gap-3">
                      <div className="p-2.5 bg-amber-500 text-white rounded-2xl shrink-0 mt-0.5">
                        <ShieldAlert size={22} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] font-black uppercase tracking-wider text-amber-800 bg-amber-200/70 px-2 py-0.5 rounded-full">
                            Anti-Doublon Détecté
                          </span>
                          <span className="text-[10px] font-bold text-amber-700 font-mono">
                            DME #{liveDuplicate.matchedPatient.id || liveDuplicate.matchedPatient.patientId}
                          </span>
                        </div>
                        <p className="text-xs font-bold text-amber-950 mt-1">
                          {liveDuplicate.reason}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleSelectPatient(liveDuplicate.matchedPatient!)}
                      className="w-full sm:w-auto px-5 py-3 bg-amber-600 hover:bg-amber-700 text-white rounded-2xl font-extrabold text-xs uppercase tracking-wider transition-all shrink-0 shadow-md flex items-center justify-center gap-2"
                    >
                      <UserCheck size={16} />
                      Utiliser ce Profil Existant
                    </button>
                  </div>
                )}
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
                  {/* Left Column */}
                  <div className="space-y-6">
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-2 tracking-wider">Nom de Famille</label>
                      <input 
                        type="text" 
                        required
                        className="w-full p-4 bg-slate-50 border border-slate-200/60 rounded-2xl outline-none focus:border-blue-500 focus:bg-white transition-all text-sm font-semibold" 
                        placeholder="Ex: DIOP" 
                        value={currentPatient.lastName || ''} 
                        onChange={e => setCurrentPatient({...currentPatient, lastName: e.target.value})} 
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-2 tracking-wider">Prénom(s)</label>
                      <input 
                        type="text" 
                        required
                        className="w-full p-4 bg-slate-50 border border-slate-200/60 rounded-2xl outline-none focus:border-blue-500 focus:bg-white transition-all text-sm font-semibold" 
                        placeholder="Ex: Amadou" 
                        value={currentPatient.firstName || ''} 
                        onChange={e => setCurrentPatient({...currentPatient, firstName: e.target.value})} 
                      />
                    </div>

                    <div className="flex gap-4">
                       <div className="flex-1">
                          <label className="text-[10px] font-black text-slate-400 uppercase ml-2 mb-2 block tracking-wider">Date de Naissance</label>
                          <input 
                            type="date" 
                            required
                            className="w-full p-4 bg-slate-50 border border-slate-200/60 rounded-2xl outline-none focus:border-blue-500 focus:bg-white transition-all text-sm font-semibold" 
                            value={currentPatient.birthDate || ''} 
                            onChange={e => setCurrentPatient({...currentPatient, birthDate: e.target.value})} 
                          />
                       </div>
                       <div className="w-28">
                          <label className="text-[10px] font-black text-slate-400 uppercase ml-2 mb-2 block tracking-wider">Sexe</label>
                          <select 
                            className="w-full p-4 bg-slate-50 border border-slate-200/60 rounded-2xl outline-none focus:border-blue-500 focus:bg-white transition-all text-sm font-bold" 
                            value={currentPatient.gender} 
                            onChange={e => setCurrentPatient({...currentPatient, gender: e.target.value as 'M'|'F'})}
                          >
                             <option value="M">Masculin</option>
                             <option value="F">Féminin</option>
                          </select>
                       </div>
                    </div>
                  </div>

                  {/* Right Column */}
                  <div className="space-y-6">
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-2 tracking-wider">Adresse de Résidence</label>
                      <input 
                        type="text" 
                        className="w-full p-4 bg-slate-50 border border-slate-200/60 rounded-2xl outline-none focus:border-blue-500 focus:bg-white transition-all text-sm font-semibold" 
                        placeholder="Ex: Dakar Plateau" 
                        value={currentPatient.residence || ''} 
                        onChange={e => setCurrentPatient({...currentPatient, residence: e.target.value})} 
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-2 tracking-wider">Téléphone de contact</label>
                      <input 
                        type="tel" 
                        className="w-full p-4 bg-slate-50 border border-slate-200/60 rounded-2xl outline-none focus:border-blue-500 focus:bg-white transition-all text-sm font-semibold" 
                        placeholder="Ex: +221 77 123 45 67" 
                        value={currentPatient.phone || ''} 
                        onChange={e => setCurrentPatient({...currentPatient, phone: e.target.value})} 
                      />
                    </div>

                    <div className="p-4 bg-blue-50 border border-blue-100 rounded-2xl flex items-center gap-3">
                       <Info size={18} className="text-blue-500" />
                       <p className="text-xs font-bold text-blue-700 italic">Âge automatique calculé: {calculateAge(currentPatient.birthDate)} ans</p>
                    </div>
                  </div>
                </div>

                <button 
                  disabled={!currentPatient.lastName?.trim() || !currentPatient.firstName?.trim() || !currentPatient.birthDate}
                  onClick={() => {
                    const dupCheck = checkDuplicatePatient(currentPatient);
                    if (dupCheck.isDuplicate && dupCheck.matchedPatient) {
                      setDuplicateModalData(dupCheck);
                      return;
                    }
                    setStep('triage');
                  }} 
                  className="w-full bg-slate-900 disabled:opacity-50 disabled:cursor-not-allowed text-white py-5 rounded-3xl font-black shadow-xl hover:bg-blue-600 transition-all flex items-center justify-center gap-2"
                >
                  Passer à l'Orientation <ChevronRight size={18} />
                </button>
              </div>
            )}

            {step === 'triage' && (
              <div className="space-y-6 animate-in slide-in-from-right-4 duration-500">
                <div className="bg-white p-10 rounded-[40px] shadow-sm border border-slate-200">
                  {renderStepper(2)}
                  
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8 pb-6 border-b border-slate-100">
                    <div>
                      <div className="flex items-center gap-3 mb-3">
                        <button 
                          onClick={() => setStep('register')} 
                          className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center gap-1.5 transition-all shadow-sm"
                        >
                          ← Formulaire
                        </button>
                        <button 
                          onClick={() => {
                            if (confirm("Êtes-vous sûr de vouloir annuler l'admission en cours ?")) {
                              setStep('search');
                            }
                          }} 
                          className="px-3.5 py-2 bg-slate-50 hover:bg-rose-50 text-slate-500 hover:text-rose-600 border border-slate-200/60 hover:border-rose-100 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center gap-1.5 transition-all"
                        >
                          Annuler
                        </button>
                      </div>
                      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
                        <div>
                          <h2 className="text-2xl font-black text-slate-900 flex items-center gap-2.5">
                            <span>Orientation & Actes Médicaux</span>
                            <span className="text-[10px] font-bold bg-blue-50 text-blue-700 px-2.5 py-1 rounded-full border border-blue-200 uppercase tracking-widest">
                              Référentiel Paramètres
                            </span>
                          </h2>
                          <p className="text-xs text-slate-500 font-semibold italic mt-1">Étape 2: Choisir l'acte médical ou la consultation configurée pour orienter le patient</p>
                        </div>
                      </div>
                    </div>
                    <div className="text-right whitespace-nowrap bg-slate-50 border border-slate-100 p-4 rounded-2xl">
                       <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest italic">Patient en cours d'orientation</p>
                       <p className="font-bold text-slate-950 text-sm">{currentPatient.lastName} {currentPatient.firstName}</p>
                       <p className="text-xs text-slate-500 font-medium">{calculateAge(currentPatient.birthDate)} ans • {currentPatient.gender === 'F' ? 'Féminin' : 'Masculin'}</p>
                    </div>
                  </div>

                  {/* Search bar */}
                  <div className="mb-6">
                    <div className="relative">
                      <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                      <input
                        type="text"
                        value={motifSearchQuery}
                        onChange={(e) => setMotifSearchQuery(e.target.value)}
                        placeholder="Rechercher un acte médical par libellé, code (ex: C-GEN-01), spécialité..."
                        className="w-full pl-11 pr-10 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-slate-800 placeholder:text-slate-400"
                      />
                      {motifSearchQuery && (
                        <button
                          onClick={() => setMotifSearchQuery('')}
                          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Category Switches */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5 mb-8">
                    {(['CONSULTATIONS', 'MATERNITE', 'URGENCES', 'HOSPITALISATION', 'AUTRES'] as const).map((catName) => {
                      const isActive = currentMotifCategory === catName;
                      const catAttrs = {
                        CONSULTATIONS: { label: 'Consultations', color: 'blue', icon: Stethoscope },
                        MATERNITE: { label: 'Maternité', color: 'pink', icon: Award },
                        URGENCES: { label: 'Urgences', color: 'rose', icon: ShieldAlert },
                        HOSPITALISATION: { label: 'Hospitalisation', color: 'emerald', icon: Bed },
                        AUTRES: { label: 'Autres Actes', color: 'indigo', icon: Activity }
                      }[catName];

                      const CatIcon = catAttrs.icon;
                      const countInCat = activeMotifs.filter(m => m.category === catName).length;
                      
                      return (
                        <button
                          key={catName}
                          onClick={() => {
                            setCurrentMotifCategory(catName);
                            // Clear selected motif when switching tabs to ensure explicit user choices
                            setSelectedMotif(null);
                            setVisitMotif(null);
                          }}
                          className={`flex flex-col sm:flex-row items-center gap-2 p-3.5 rounded-2xl border-2 font-black text-xs uppercase tracking-wider transition-all justify-center ${
                            isActive 
                              ? 'bg-slate-900 text-white border-transparent shadow-lg scale-[1.02]' 
                              : 'bg-slate-50 text-slate-600 border-slate-100 hover:bg-slate-100/70'
                          }`}
                        >
                          <CatIcon size={16} className={isActive ? 'text-blue-400' : 'text-slate-400'} />
                          <span className="truncate">{catAttrs.label}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${isActive ? 'bg-white/20 text-white' : 'bg-slate-200/60 text-slate-600'}`}>
                            {countInCat}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {/* List Motifs for Active Category */}
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em]">
                        Actes & Prestations Médicales ({
                          activeMotifs.filter(m => {
                            if (motifSearchQuery.trim()) {
                              const q = motifSearchQuery.toLowerCase().trim();
                              return (
                                (m.label || '').toLowerCase().includes(q) ||
                                (m.codeInterne && (m.codeInterne || '').toLowerCase().includes(q)) ||
                                (m.speciality || '').toLowerCase().includes(q) ||
                                (m.queueName || '').toLowerCase().includes(q)
                              );
                            }
                            return m.category === currentMotifCategory;
                          }).length
                        })
                      </h3>
                      {motifSearchQuery && (
                        <span className="text-xs text-blue-600 font-bold">Filtre recherche actif</span>
                      )}
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {activeMotifs
                        .filter(m => {
                          if (motifSearchQuery.trim()) {
                            const q = motifSearchQuery.toLowerCase().trim();
                            return (
                              (m.label || '').toLowerCase().includes(q) ||
                              (m.codeInterne && (m.codeInterne || '').toLowerCase().includes(q)) ||
                              (m.speciality || '').toLowerCase().includes(q) ||
                              (m.queueName || '').toLowerCase().includes(q)
                            );
                          }
                          return m.category === currentMotifCategory;
                        })
                        .map((motif) => {
                          const isSelected = selectedMotif?.id === motif.id;

                          return (
                            <button
                              key={motif.id}
                              onClick={() => {
                                setSelectedMotif(motif);
                                // Adapt to legacy VisitMotif
                                let legacyVal: VisitMotif = 'CONSULTATION';
                                if (motif.category === 'CONSULTATIONS') legacyVal = 'CONSULTATION';
                                else if (motif.category === 'MATERNITE') legacyVal = 'MATERNITE';
                                else if (motif.category === 'URGENCES') legacyVal = 'URGENCE';
                                else if (motif.category === 'HOSPITALISATION' || motif.serviceId === 'SRV-HOSPITALISATION') legacyVal = 'HOSPITALISATION';
                                else {
                                  if (motif.serviceId === 'SRV-LABO') legacyVal = 'LABORATOIRE';
                                  else if (motif.serviceId === 'SRV-INFIRMIER') legacyVal = 'SOIN_INFIRMIER';
                                  else if (motif.serviceId === 'SRV-VACCINATION') legacyVal = 'SOIN_INFIRMIER';
                                  else if (motif.serviceId === 'SRV-PHARMACIE') legacyVal = 'PHARMACIE';
                                  else legacyVal = 'AUTRE';
                                }
                                setVisitMotif(legacyVal);
                              }}
                              className={`p-5 rounded-3xl border-2 text-left transition-all relative flex flex-col justify-between min-h-[160px] group ${
                                isSelected 
                                  ? 'border-indigo-600 bg-indigo-50/50 shadow-xl scale-[1.02]' 
                                  : 'border-slate-100 bg-slate-50 hover:border-slate-300'
                              }`}
                            >
                              <div>
                                <div className="flex items-center justify-between gap-2 mb-2">
                                  <span className={`text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full bg-white border border-slate-100 shadow-xs ${
                                    isSelected ? 'border-indigo-300 text-indigo-700' : 'text-slate-500'
                                  }`}>
                                    {motif.speciality}
                                  </span>
                                  {motif.codeInterne && (
                                    <span className="text-[9px] font-mono font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md">
                                      {motif.codeInterne}
                                    </span>
                                  )}
                                </div>
                                <h4 className="font-black text-slate-800 text-sm mt-1 group-hover:text-slate-900 transition-colors">{motif.label}</h4>
                              </div>

                              <div className="mt-4 border-t border-slate-200 pt-3 flex items-center justify-between">
                                <div>
                                  <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">SALLE / FILE</p>
                                  <p className="font-bold text-slate-700 text-[10px] truncate max-w-[140px]">{motif.queueName}</p>
                                </div>
                                <div className="text-right">
                                  <span className="font-black text-xs text-slate-900">{(motif.fee || 0).toLocaleString()} F</span>
                                  <p className="text-[8px] font-bold text-slate-400 uppercase">CFA</p>
                                </div>
                              </div>
                            </button>
                          );
                        })}

                      {activeMotifs.filter(m => {
                        if (motifSearchQuery.trim()) {
                          const q = motifSearchQuery.toLowerCase().trim();
                          return (
                            (m.label || '').toLowerCase().includes(q) ||
                            (m.codeInterne && (m.codeInterne || '').toLowerCase().includes(q)) ||
                            (m.speciality || '').toLowerCase().includes(q) ||
                            (m.queueName || '').toLowerCase().includes(q)
                          );
                        }
                        return m.category === currentMotifCategory;
                      }).length === 0 && (
                        <div className="col-span-full py-12 text-center bg-slate-50 rounded-[32px] border border-dashed border-slate-200">
                          <p className="text-slate-600 text-xs font-black uppercase tracking-wider">AUCUN SERVICE OU PRESTATION DISPONIBLE</p>
                          <p className="text-[11px] text-slate-400 mt-1">
                            Les services de cette catégorie sont désactivés ou non configurés dans <strong>Paramètres &gt; Services &amp; Départements</strong>.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {selectedMotif && (
                  <div className="bg-slate-900 p-8 rounded-[40px] text-white flex flex-col md:flex-row items-center justify-between gap-6 shadow-2xl animate-in slide-in-from-bottom-6">
                    <div className="flex items-center gap-4">
                      <div className="p-4 bg-white/10 rounded-2xl text-blue-400">
                        <Activity size={24} />
                      </div>
                      <div>
                        {selectedMotif.category === 'MATERNITE' || selectedMotif.serviceId === 'SRV-MATERNITE' ? (
                          <span className="text-[9px] font-black uppercase tracking-[0.2em] text-pink-400 bg-pink-500/20 px-2 py-0.5 rounded-full inline-block mb-1">
                            🌸 Routage direct Maternité (Triage infirmier général contourné)
                          </span>
                        ) : (
                          <span className="text-[9px] font-black uppercase tracking-[0.2em] text-cyan-400">Routage automatique configuré</span>
                        )}
                        <h4 className="font-black text-md text-slate-100">{selectedMotif.label}</h4>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400 font-medium mt-1">
                          <p>Service: <strong className="text-slate-200">
                            {(() => {
                              const match = (hospitalServices || []).find((s: any) => 
                                s.id.toLowerCase() === selectedMotif.serviceId.toLowerCase() ||
                                s.name.toLowerCase() === selectedMotif.serviceId.toLowerCase()
                              );
                              if (match) return match.name;
                              if (selectedMotif.serviceId === 'SRV-CONSULTATION') return 'Consultation externe';
                              if (selectedMotif.serviceId === 'SRV-MATERNITE') return 'Maternité';
                              if (selectedMotif.serviceId === 'SRV-URGENCES') return 'Urgences';
                              if (selectedMotif.serviceId === 'SRV-HOSPITALISATION') return 'Hospitalisation';
                              if (selectedMotif.serviceId === 'SRV-LABO') return 'Laboratoire';
                              if (selectedMotif.serviceId === 'SRV-INFIRMIER') return 'Soins infirmiers';
                              if (selectedMotif.serviceId === 'SRV-VACCINATION') return 'Vaccination';
                              if (selectedMotif.serviceId === 'SRV-PHARMACIE') return 'Pharmacie';
                              return selectedMotif.queueName || 'Général';
                            })()}
                          </strong></p>
                          <p>File: <strong className="text-slate-200">{selectedMotif.queueName}</strong></p>
                          <p>Spécialité: <strong className="text-slate-200">{selectedMotif.speciality}</strong></p>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
                      <button 
                        disabled={isSaving}
                        onClick={() => {
                          const isMat = selectedMotif?.category === 'MATERNITE' || selectedMotif?.serviceId === 'SRV-MATERNITE' || visitMotif === 'MATERNITE';
                          finalizeAdmission(isMat ? false : (selectedMotif?.category === 'CONSULTATIONS' || selectedMotif?.category === 'URGENCES' || selectedMotif?.category === 'HOSPITALISATION'));
                        }}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-4 rounded-3xl font-black text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-3 shadow-xl hover:shadow-blue-500/20 disabled:opacity-50 cursor-pointer"
                      >
                        {isSaving ? (
                          <>
                            <Loader2 size={16} className="animate-spin" />
                            <span>Enregistrement...</span>
                          </>
                        ) : (
                          <>
                            <ChevronRight size={16} /> 
                            <span>Valider Admission & Émettre Pro-forma</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {step === 'summary' && (
              <div className="bg-white p-16 rounded-[50px] border border-slate-200 text-center animate-in zoom-in-95 duration-700 shadow-xl">
                {renderStepper(3)}
                <div className="w-32 h-32 bg-amber-50 rounded-[40px] flex items-center justify-center mx-auto mb-10 border-4 border-white shadow-2xl rotate-12">
                  <Clock size={64} className="text-amber-500" />
                </div>
                <h2 className="text-4xl font-black mb-4 tracking-tight">Orientation & Pro-forma Émise</h2>
                <p className="text-slate-500 font-medium mb-12 max-w-md mx-auto italic">
                  La Fiche d'Orientation / Facture Pro-forma a été générée. Le patient doit maintenant régler le montant dû à la <strong>Caisse centrale</strong> pour débloquer sa consultation médicale.
                </p>
                <div className="flex gap-6 justify-center max-w-lg mx-auto">
                   <button onClick={() => setShowProforma(true)} className="flex-1 bg-slate-900 text-white py-6 rounded-3xl font-black flex items-center justify-center gap-3 shadow-xl hover:bg-slate-800 transition-all"><Printer size={24} /> Voir / Imprimer Pro-forma</button>
                   <button onClick={() => { setStep('search'); setAmountReceived(''); setNotebookAdded(false); setVisitMotif(null); }} className="flex-1 bg-blue-600 text-white py-6 rounded-3xl font-black hover:bg-blue-700 shadow-xl transition-all">Nouveau Patient</button>
                </div>
              </div>
            )}
          </div>
          
          <div className="lg:col-span-4 space-y-6">
            <div className="bg-white rounded-[40px] border border-slate-200 shadow-sm overflow-hidden text-slate-900">
              <div className="p-8 border-b bg-slate-50/50 flex justify-between items-center">
                <h3 className="font-black text-[10px] uppercase tracking-widest italic flex items-center gap-2"><Activity size={16} /> Salle d'Attente</h3>
                <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-[10px] font-black">{waitingCount} EN ATTENTE</span>
              </div>
              <div className="divide-y divide-slate-100 max-h-[700px] overflow-y-auto">
                {activeWaitingList.length === 0 ? (
                  <div className="p-12 text-center">
                    <Users size={40} className="mx-auto text-slate-200 mb-4" />
                    <p className="text-slate-400 text-xs font-bold italic">Aucun patient en attente</p>
                  </div>
                ) : (
                  activeWaitingList.map((p, i) => {
                    const isPaid = p.paymentStatus === 'PAID' || p.status === 'SOLDE';
                    return (
                      <div key={p.id || `wait-${p.patientId || 'pt'}-${i}`} className="p-8 hover:bg-slate-50 group transition-all relative overflow-hidden">
                        {(p.status === 'waiting' || p.status === 'waiting_triage') && <div className={`absolute top-0 left-0 w-1.5 h-full ${isPaid ? 'bg-emerald-500' : 'bg-amber-500'} animate-pulse`}></div>}
                        <div className="flex justify-between items-start mb-3">
                           <div>
                             <p className="font-black text-slate-900">{p.lastName} {p.firstName}</p>
                             <p className="text-[10px] text-slate-400 font-black font-mono tracking-tighter uppercase">{p.patientId} • {p.queueName || p.service}</p>
                           </div>
                           <div className="flex gap-2">
                             {p.priority === 'critique' && <span className="bg-rose-100 text-rose-600 px-2 py-1 rounded text-[8px] font-black uppercase">Critique</span>}
                             <span className="text-[10px] text-slate-300 font-bold italic self-center">{p.time}</span>
                           </div>
                        </div>
                        <div className="flex justify-between items-center mt-4">
                           <span className={`text-[9px] font-black px-3 py-1.5 rounded-xl border-2 ${
                             isPaid ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-amber-50 text-amber-700 border-amber-100'
                           }`}>
                             {isPaid ? 'PAYÉ • EN ATTENTE DOCTEUR' : 'EN ATTENTE RÈGLEMENT CAISSE'}
                           </span>
                           <span className="text-[10px] text-slate-400 font-bold italic">{p.priority === 'urgent' ? 'Priorité : Urgent' : 'Routine'}</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    )}

      {activeTab === 'sorties' && (
        <div className="animate-in fade-in slide-in-from-bottom-6 duration-700">
           <div className="bg-white p-8 md:p-12 rounded-[40px] md:rounded-[50px] shadow-sm relative overflow-hidden border border-slate-200">
              {/* Premium Background Soft Accents */}
              <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3 pointer-events-none" />
              <div className="absolute bottom-0 left-0 w-64 h-64 bg-blue-500/5 rounded-full blur-3xl translate-y-1/2 -translate-x-1/3 pointer-events-none" />
              
              <div className="relative z-10 flex flex-col md:flex-row justify-between md:items-end mb-12 gap-6">
                 <div>
                    <h2 className="text-4xl font-black tracking-tight text-slate-900 flex items-center gap-4">
                      <span className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl shadow-sm border border-emerald-100"><LogOut size={32} /></span>
                      Sorties Administratives
                    </h2>
                    <p className="text-slate-500 font-medium mt-3 flex items-center gap-2">
                       <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                       Validation finale avant la sortie administrative définitive du patient.
                    </p>
                 </div>
                 <div className="bg-emerald-50 border border-emerald-100 text-emerald-800 px-6 py-4 rounded-2xl text-sm font-black shadow-sm flex items-center gap-3">
                    <span className="w-8 h-8 rounded-xl bg-emerald-500 text-white flex items-center justify-center text-lg font-black">{patientsToDischarge.length}</span>
                    PATIENTS EN ATTENTE
                 </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 relative z-10">
                 {patientsToDischarge.map((patient, pIdx) => {
                   const isReady = patient.medicalClearance && patient.hospitalizationClosed && patient.financialClearance;
                   const isProcessing = isProcessingDischarge === patient.id;
                   return (
                   <div key={patient.id || `disch-${pIdx}`} className={`p-8 rounded-[32px] border transition-all relative overflow-hidden flex flex-col ${isReady ? 'bg-emerald-50/40 border-emerald-200 hover:border-emerald-300 hover:bg-emerald-50/70' : 'bg-slate-50/50 border-slate-200 hover:border-slate-300 hover:bg-white'}`}>
                      <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-transparent to-white/40 pointer-events-none rounded-bl-full" />
                      
                      <div className="flex justify-between items-start mb-6">
                         <span className="bg-white border border-slate-200 px-3 py-1.5 rounded-lg text-[10px] font-black text-slate-500 font-mono tracking-widest uppercase shadow-xs">
                           {patient.id}
                         </span>
                         {isReady ? (
                           <span className="bg-emerald-100 text-emerald-700 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest shadow-xs flex items-center gap-1.5">
                             <CheckCircle2 size={12} /> Prêt pour sortie
                           </span>
                         ) : (
                           <span className="bg-amber-100 text-amber-700 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest shadow-xs flex items-center gap-1.5">
                             <Clock size={12} /> Dossier incomplet
                           </span>
                         )}
                      </div>

                      <h3 className="text-2xl font-black mb-2 text-slate-900 tracking-tight">{patient.name}</h3>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 mb-8 font-bold">
                        <span className="bg-blue-50 text-blue-700 px-2.5 py-1 rounded-lg uppercase tracking-wider">{patient.department}</span>
                        <span>•</span>
                        <span>Admis le {patient.admissionDate}</span>
                      </div>

                       {/* Critère Checklist Indicators */}
                       <div className="grid grid-cols-3 gap-3 mb-8">
                         <div className={`flex flex-col items-center justify-center p-4 rounded-[20px] border transition-colors ${patient.medicalClearance ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-white border-slate-200 text-slate-400'}`}>
                           <Thermometer size={20} className="mb-2" />
                           <span className="text-[9px] font-black uppercase tracking-widest opacity-75 mb-1 text-center">Médicale</span>
                           <span className="text-[10px] font-bold">{patient.medicalClearance ? "Validée" : "En attente"}</span>
                         </div>
                         <div className={`flex flex-col items-center justify-center p-4 rounded-[20px] border transition-colors ${patient.hospitalizationClosed ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-white border-slate-200 text-slate-400'}`}>
                           <Activity size={20} className="mb-2" />
                           <span className="text-[9px] font-black uppercase tracking-widest opacity-75 mb-1 text-center">Dossier</span>
                           <span className="text-[10px] font-bold">{patient.hospitalizationClosed ? "Clos" : "En cours"}</span>
                         </div>
                         <div className={`flex flex-col items-center justify-center p-4 rounded-[20px] border transition-colors ${patient.financialClearance ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-rose-50 border-rose-100 text-rose-600'}`}>
                           <CreditCard size={20} className="mb-2" />
                           <span className="text-[9px] font-black uppercase tracking-widest opacity-75 mb-1 text-center">Caisse</span>
                           <span className="text-[10px] font-bold">{patient.financialClearance ? "Soldée" : "Impayée"}</span>
                         </div>
                       </div>

                       {dischargeError && dischargeError.patientId === patient.id && (
                         <div className="mb-6 p-5 bg-rose-50 border border-rose-100 rounded-2xl flex items-start gap-3 shadow-xs">
                           <ShieldAlert className="text-rose-600 flex-shrink-0 mt-0.5" size={20} />
                           <div>
                             <p className="text-xs font-black uppercase tracking-widest text-rose-900 mb-1">Validation Impossible</p>
                             <p className="text-xs text-rose-700 leading-relaxed">{dischargeError.message}</p>
                           </div>
                         </div>
                       )}
                      
                      <div className="mt-auto pt-4 flex gap-4">
                        <button 
                          onClick={() => handleDischarge(patient.id)}
                          disabled={isProcessing}
                          className="flex-1 bg-slate-900 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-emerald-600 transition-all shadow-md hover:shadow-emerald-500/10 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2.5"
                        >
                          {isProcessing ? (
                            <><Loader2 size={16} className="animate-spin" /> Traitement...</>
                          ) : (
                            <><CheckCircle size={16} /> Valider Sortie</>
                          )}
                        </button>
                        <button 
                          disabled={!isReady || isProcessing}
                          onClick={() => handleGeneratePDF('autorisation_sortie', patient)}
                          className={`w-14 h-12 rounded-2xl flex items-center justify-center transition-all ${
                            isReady && !isProcessing
                              ? "bg-white border-2 border-slate-200 text-slate-700 hover:text-blue-600 hover:border-blue-300 cursor-pointer shadow-xs"
                              : "bg-slate-100 border border-slate-200 text-slate-300 cursor-not-allowed"
                          }`}
                          title="Imprimer l'Autorisation de Sortie"
                        >
                          <Printer size={18} />
                        </button>
                      </div>
                   </div>
                 )})}

                 {patientsToDischarge.length === 0 && (
                   <div className="col-span-full py-32 text-center bg-slate-50/50 rounded-[40px] border-2 border-dashed border-slate-200 flex flex-col items-center justify-center">
                      <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center mb-6 shadow-xs">
                        <LogOut size={40} className="text-slate-300" />
                      </div>
                      <h3 className="text-2xl font-black text-slate-900 mb-2 tracking-tight">Aucune sortie en attente</h3>
                      <p className="text-slate-500 font-medium">Les patients prêts pour la sortie administrative apparaîtront ici.</p>
                   </div>
                 )}
              </div>
           </div>
        </div>
      )}

      {(activeTab === 'historique' || activeTab === 'demandes') && (
        <HistoriquePatient 
          user={user}
          selectedPatient={currentPatient?.id ? (currentPatient as Patient) : null}
          onSelectPatientForAdmission={(p) => {
            handleSelectPatient(p);
            setActiveTab('triage');
          }}
          theme={theme}
        />
      )}

      {activeTab === 'profil' && (
        <div className="animate-in fade-in slide-in-from-bottom-6 duration-700">
           <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
             <div className="lg:col-span-4 space-y-8">
                <div className="bg-white p-12 rounded-[50px] border border-slate-200 shadow-sm text-center relative overflow-hidden group">
                   <div className="absolute top-0 left-0 w-full h-24 bg-blue-600 group-hover:h-32 transition-all duration-500"></div>
                   <div className="relative z-10 mt-4">
                      <div className="mx-auto mb-6 flex justify-center">
                        <Avatar 
                          user={agentProfile} 
                          size={128} 
                          className="border-8 border-white bg-slate-100 shadow-2xl" 
                          alt={agentProfile.name}
                        />
                      </div>
                      <h2 className="text-3xl font-black italic text-slate-900 tracking-tight">{agentProfile.name}</h2>
                      <p className="text-blue-600 font-black text-xs uppercase tracking-widest mt-2">{agentProfile.role}</p>
                      
                      <div className="mt-10 flex gap-4 justify-center">
                         <div className="bg-slate-50 p-4 rounded-3xl border border-slate-100">
                            <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Actes du jour</p>
                            <p className="text-xl font-black text-slate-900">{todaysRequests.length}</p>
                         </div>
                         <div className="bg-emerald-50 p-4 rounded-3xl border border-emerald-100">
                            <p className="text-[9px] font-black text-emerald-400 uppercase mb-1">Quote-part</p>
                            <p className="text-xl font-black text-emerald-600">{agentProfile.quotePartRate}</p>
                         </div>
                      </div>
                   </div>
                </div>

                <div className="bg-slate-900 p-10 rounded-[45px] text-white shadow-2xl">
                   <h3 className="text-xl font-black mb-8 flex items-center gap-3 italic"><Award className="text-blue-400" /> Mon Badge Digital</h3>
                   <div className="space-y-6">
                      <div className="flex justify-between items-center text-xs">
                         <span className="text-slate-400 font-bold uppercase">Profession</span>
                         <span className="font-black text-blue-400">{agentProfile.profession}</span>
                      </div>
                      <div className="flex justify-between items-center text-xs">
                         <span className="text-slate-400 font-bold uppercase">ID Badge</span>
                         <span className="font-black font-mono tracking-tighter">#SH-2024-{agentProfile.name.split(' ')[0].toUpperCase()}</span>
                      </div>
                      <div className="flex justify-between items-center text-xs">
                         <span className="text-slate-400 font-bold uppercase">Salaire Base</span>
                         <span className="font-black text-emerald-400">{agentProfile.salary}</span>
                      </div>
                   </div>
                   <button className="w-full mt-10 py-5 bg-white/10 hover:bg-white/20 rounded-3xl font-black text-xs uppercase tracking-widest transition-all">Consulter Mes Bulletins</button>
                </div>
             </div>

             <div className="lg:col-span-8 space-y-8">
                <div className="bg-white p-12 rounded-[50px] border border-slate-200 shadow-sm h-full">
                   <div className="flex items-center justify-between mb-12">
                      <h3 className="text-2xl font-black italic flex items-center gap-3"><Clock size={24} className="text-blue-600" /> Planning & Activité</h3>
                      <button className="flex items-center gap-2 text-xs font-black text-slate-400 hover:text-slate-900 transition-colors uppercase italic"><Settings size={16} /> Gérer Mes Disponibilités</button>
                   </div>
                   
                   <div className="grid grid-cols-2 gap-8 mb-12">
                      <div className="p-8 bg-blue-50 rounded-[40px] border border-blue-100 relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:scale-110 transition-transform"><Calendar size={100} /></div>
                        <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-3 italic">Mon Horaire Officiel</p>
                        <h4 className="text-2xl font-black text-blue-900">{agentProfile.schedule}</h4>
                        <div className="text-xs text-blue-600 mt-4 font-bold italic flex items-center gap-2"><div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div> Session en cours depuis 08:00</div>
                      </div>
                      <div className="p-8 bg-slate-50 rounded-[40px] border border-slate-100 group relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:scale-110 transition-transform"><TrendingUp size={100} /></div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 italic">Dernières Demandes Traitées</p>
                        <div className="space-y-2 mt-4 relative z-10">
                           {todaysRequests.slice(0, 3).map((tx, idx) => (
                             <div key={tx.id || `tx-summary-${tx.patientId || 'pt'}-${idx}`} className="flex justify-between items-center text-[11px] font-bold">
                               <span className="text-slate-900 italic">{tx.patientName}</span>
                               <span className="text-blue-600 font-mono">{((tx.totalAmount || 0) || (tx.total || 0)).toLocaleString()} {currency}</span>
                             </div>
                           ))}
                        </div>
                      </div>
                   </div>

                   <section>
                      <h4 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-6 flex items-center gap-2">Droit d'accès & Sécurité</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                         {[
                           { label: "Accès Admissions", enabled: true },
                           { label: "Accès Caisse Centrale", enabled: true },
                           { label: "Accès Boutique SIH", enabled: true },
                           { label: "Accès Dossier Médical (Lecture)", enabled: false },
                           { label: "Accès Stock Pharmacie", enabled: false },
                           { label: "Accès Rapports Financiers", enabled: true }
                         ].map((perm, i) => (
                           <div key={perm.label || `perm-${i}`} className="flex items-center justify-between p-5 bg-slate-50 rounded-2xl border border-slate-100">
                             <span className="text-xs font-bold text-slate-700">{perm.label}</span>
                             <div className={`w-3 h-3 rounded-full ${perm.enabled ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]' : 'bg-rose-300'}`}></div>
                           </div>
                         ))}
                      </div>
                   </section>
                </div>
             </div>
           </div>
        </div>
      )}

      {showLabExamForm && currentPatient && (
        <LabExamRequestForm
          patientId={currentPatient.id || 'unknown'}
          patientName={`${currentPatient.lastName} ${currentPatient.firstName}`}
          patientAge={calculateAge(currentPatient.birthDate || '')}
          patientSex={currentPatient.gender || 'M'}
          patientDossier={currentPatient.id || 'unknown'}
          prescriberId={user?.id || 'unknown'}
          prescriberName={user?.name || 'Réceptionniste'}
          requestingService="Accueil"
          onClose={() => setShowLabExamForm(false)}
          onSave={async (request) => {
            const newRequest: LabExamRequest = {
              ...request,
              id: `REQ-${Date.now()}`,
              date: new Date().toISOString(),
              status: 'en attente',
              billingStatus: 'pending'
            };
            
            // Save to localStorage
            const savedRequests = localStorage.getItem('hospital_lab_requests');
            const parsedRequests = savedRequests ? JSON.parse(savedRequests) : [];
            localStorage.setItem('hospital_lab_requests', JSON.stringify([...parsedRequests, newRequest]));
            
            // 1. Save to Firebase Firestore custom collection `laboratory_requests` and standard `lab_requests`
            try {
              const notifDocRef = doc(collection(db, 'notifications'));

              const p1 = setDoc(doc(db, 'laboratory_requests', newRequest.id), sanitizeData({
                ...newRequest,
                user: user?.name || 'Agent Accueil',
                createdAt: new Date().toISOString()
              }));
              const p2 = setDoc(doc(db, 'lab_requests', newRequest.id), sanitizeData(newRequest));
              const p3 = setDoc(notifDocRef, sanitizeData({
                id: notifDocRef.id,
                message: `Prescription d'analyses de laboratoire pour ${newRequest.patientName}`,
                module: 'Reception',
                targetModules: ['Lab'],
                createdAt: new Date().toISOString()
              }));
              const p4 = logAudit(`Création bulletin d'examens`, { reqId: newRequest.id, exams: newRequest.exams });

              await Promise.all([p1, p2, p3, p4]);

              // 3. Dispatch local notification as toast
              window.dispatchEvent(new CustomEvent('app-notification', { 
                detail: `Nouvelle prescription d'examens labo pour ${newRequest.patientName}` 
              }));

            } catch (error) {
              console.error('Error saving laboratory requirements to Firestore:', error);
            }
            
            // Generate PDF on save too so the user gets a physical bulletin!
            handleGeneratePDF('bulletin_examens', newRequest);

            setShowLabExamForm(false);
            setStep('payment'); // Move to payment after prescribing
          }}
        />
      )}

      </div>

      {/* Strict Anti-Doublon Resolution Modal */}
      {duplicateModalData?.matchedPatient && (
        <PatientDeduplicationModal
          isOpen={duplicateModalData.isDuplicate}
          candidatePatient={currentPatient}
          matchedPatient={duplicateModalData.matchedPatient}
          reason={duplicateModalData.reason}
          onClose={() => setDuplicateModalData(null)}
          onSelectExisting={(matched) => {
            handleSelectPatient(matched);
            setDuplicateModalData(null);
          }}
          theme={theme}
        />
      )}
    </div>
  );
};

export default Reception;
