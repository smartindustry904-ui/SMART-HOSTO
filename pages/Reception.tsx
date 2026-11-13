
import React, { useState, useEffect, useMemo } from 'react';
import { 
  Search, UserPlus, Heart, 
  Users, Stethoscope, Beaker, 
  Activity, AlertCircle, ChevronRight,
  CheckCircle2, CreditCard, ShieldAlert, Calendar,
  Clock, UserCheck, Printer, Filter, ArrowUpDown,
  LogOut, FileText, CheckCircle, X,
  User as UserIcon, ArrowRightLeft,
  Scale, Thermometer, Info, Award, Settings,
  TrendingUp, Home, Loader2, ArrowLeft, History,
  Bed, Syringe, Sparkles, Lock, Mail, Phone, Shield, Key, Edit3
} from 'lucide-react';
import { Patient, VisitMotif, Role, User as UserType, PatientStatus, LabExamRequest, PaymentRequest, Service, MedicalAct } from '../types';
import LabExamRequestForm from '../components/LabExamRequestForm';
import { useSettings, useHospitalServices, useMedicalActs, getDefaultServices, getDefaultMedicalActs } from '../hooks/useSettings';
import { useCustomRoles } from '../hooks/useCustomRoles';
import { getUserModulePermissions, isUserAuthorizedForModule } from '../src/config/modules';
import { Avatar } from '../components/common/Avatar';
import { PrintReceiptModal, PrintableReceiptData } from '../components/common/PrintReceiptModal';

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
import { getActiveTenantId, belongsToTenant, stampTenantData } from '../src/utils/tenant';

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
  category: 'CONSULTATIONS' | 'SOINS' | 'MATERNITE' | 'URGENCES' | 'HOSPITALISATION' | 'AUTRES';
  serviceId: string;       // SRV-CONSULTATION, SRV-MATERNITE, etc.
  queueName: string;       // File d'attente
  speciality: string;      // Spécialité médicale
  fee: number;             // Frais de consultation ou d'admission
  actId?: string;
  codeInterne?: string;
  description?: string;
  requiresPrescription?: boolean;
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

    // Priority 1: Gynecological consultations ALWAYS route to General/Specialized Consultation
    if (combined.includes('gynéco') || combined.includes('gyneco')) {
      return serviceById.get('srv-consultation') || serviceById.get('srv-gynecologie');
    }

    // Priority 2: ONLY CPN (prenatal/postnatal) and Delivery/Childbirth route to Maternité
    if (combined.includes('cpn') || combined.includes('prénatale') || combined.includes('prenatale') || combined.includes('accouchement') || combined.includes('travail') || combined.includes('césarienne') || combined.includes('cesar') || combined.includes('postnatale') || combined.includes('grossesse')) {
      return serviceById.get('srv-maternite');
    }
    if (combined.includes('matern') && !combined.includes('gyn')) {
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
    const actName = act.name || act.nom || (matchedService ? matchedService.name : 'Acte médical');
    // Strict Module Separation: Pharmacie is NEVER routed by Accueil
    if (serviceId === 'SRV-PHARMACIE' || /pharmacie|dispensaire/i.test(`${serviceId} ${matchedService?.name || ''} ${actName}`)) {
      continue;
    }

    coveredServiceIds.add(serviceId.toLowerCase());

    const actPrice = Number(act.price ?? act.prixBase ?? (matchedService?.specificSettings?.consultationFee || matchedService?.specificSettings?.fee || 10000));

    // Determine category based on matched service and act
    let category: 'CONSULTATIONS' | 'SOINS' | 'MATERNITE' | 'URGENCES' | 'HOSPITALISATION' | 'AUTRES' = 'CONSULTATIONS';

    const isGynecoAct = /gynéco|gyneco/i.test(`${actName} ${act.sousService} ${act.category}`);
    const isCPNAct = /cpn|prénatale|prenatale|postnatale|grossesse/i.test(`${actName} ${act.sousService}`);
    const isAccouchementAct = /accouchement|travail|césarienne|cesar/i.test(`${actName} ${act.sousService}`);

    if (isGynecoAct) {
      // Consultation Gynécologique is always grouped under CONSULTATIONS
      category = 'CONSULTATIONS';
    } else if (isCPNAct || isAccouchementAct || serviceId === 'SRV-MATERNITE' || (matchedService?.type === 'clinique' && /matern/i.test(matchedService.name))) {
      // ONLY CPN and Accouchement are grouped under MATERNITE
      category = 'MATERNITE';
    } else if (serviceId === 'SRV-URGENCES' || /urgence/i.test(matchedService?.name || '')) {
      category = 'URGENCES';
    } else if (serviceId === 'SRV-HOSPITALISATION' || /hospitalis/i.test(matchedService?.name || '')) {
      category = 'HOSPITALISATION';
    } else if (
      serviceId === 'SRV-INFIRMIER' ||
      /soin|infirmier|pansement|injection|perfusion|suture/i.test(actName + ' ' + (act.categorie || '') + ' ' + (matchedService?.name || ''))
    ) {
      category = 'SOINS';
    } else if (
      ['SRV-LABO', 'SRV-VACCINATION', 'SRV-IMAGERIE', 'SRV-KINE', 'SRV-NUTRITION'].includes(serviceId) ||
      matchedService?.type === 'technique' || 
      matchedService?.type === 'soutien'
    ) {
      category = 'AUTRES';
    } else {
      category = 'CONSULTATIONS';
    }

    const queueName = isGynecoAct ? 'Consultation Gynécologique' : (
      act.sousService || matchedService?.name || (
        category === 'MATERNITE' ? (isAccouchementAct ? 'Maternité (Salle de travail)' : 'Salle d\'attente CPN') :
        category === 'URGENCES' ? 'Urgences' :
        category === 'HOSPITALISATION' ? 'Hospitalisation' :
        'Consultation'
      )
    );

    const speciality = isGynecoAct ? 'Gynécologie' : (
      act.sousService || matchedService?.name || (
        category === 'MATERNITE' ? (isAccouchementAct ? 'Salle de travail / Accouchement' : 'Consultation Prénatale (CPN)') :
        'Médecine générale'
      )
    );

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
      description: act.description || matchedService?.description || '',
      requiresPrescription: Boolean(act.requiresPrescription || act.soumisOrdonnance)
    } as any);
  }

  // DYNAMIC INCLUSION: For every ACTIVE service in servicesToUse not yet covered by an act,
  // create an immediate, usable destination motif in Accueil!
  // Exclude purely administrative internal services AND Pharmacie (never routed from Accueil)
  const nonClinicalAdminServices = ['SRV-ACCUEIL', 'SRV-CAISSE', 'SRV-ADMIN', 'SRV-RH', 'SRV-ARCHIVES', 'SRV-PHARMACIE'];

  for (const s of servicesToUse) {
    if (!isServiceActive(s)) continue;
    if (nonClinicalAdminServices.includes(s.id)) continue;
    if (s.type === 'administratif' && !s.id.toLowerCase().includes('consult')) continue;

    // If no motif exists for this service, create a direct orientation motif
    if (!coveredServiceIds.has(s.id.toLowerCase())) {
      let category: 'CONSULTATIONS' | 'SOINS' | 'MATERNITE' | 'URGENCES' | 'HOSPITALISATION' | 'AUTRES' = 'CONSULTATIONS';
      if (s.id === 'SRV-MATERNITE' || /matern/i.test(s.name)) {
        category = 'MATERNITE';
      } else if (s.id === 'SRV-INFIRMIER' || /soin|infirmier/i.test(s.name)) {
        category = 'SOINS';
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
  const activeTenantId = useMemo(() => {
    const tid = getActiveTenantId(user, establishment);
    if (tid === 'ALL') {
      const estId = establishment?.tenantId || (establishment as any)?.hospital_id || (establishment as any)?.clinicId || (establishment as any)?.id;
      return (estId && estId !== 'ALL') ? String(estId).trim() : 'default_hospital';
    }
    return tid;
  }, [user, establishment]);
  const { roles: customRoles } = useCustomRoles(user);
  const permissions = useMemo(() => getUserModulePermissions(user, Role.RECEPTION, customRoles), [user, customRoles]);
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
  const [selectedPatientForHistory, setSelectedPatientForHistory] = useState<Patient | null>(null);
  
  // Sorties Search & Filter States
  const [sortieSearchTerm, setSortieSearchTerm] = useState('');
  const [sortieStatusFilter, setSortieStatusFilter] = useState<'ALL' | 'READY' | 'PENDING_CAISSE' | 'PENDING_MEDICAL'>('ALL');
  const [sortieDepartmentFilter, setSortieDepartmentFilter] = useState<string>('ALL');

  const getSortieTimestamp = (item: any): number => {
    if (item.createdAt) {
      const t = new Date(item.createdAt).getTime();
      if (!isNaN(t)) return t;
    }
    if (item.dischargeDate) {
      const t = new Date(item.dischargeDate).getTime();
      if (!isNaN(t)) return t;
    }
    if (item.dischargedAt) {
      const t = new Date(item.dischargedAt).getTime();
      if (!isNaN(t)) return t;
    }
    if (item.updatedAt) {
      const t = new Date(item.updatedAt).getTime();
      if (!isNaN(t)) return t;
    }
    if (item.admissionDate) {
      const t = new Date(item.admissionDate).getTime();
      if (!isNaN(t)) return t;
    }
    return 0;
  };

  const formatSortieTime = (item: any): string => {
    const rawDate = item.createdAt || item.dischargeDate || item.dischargedAt || item.admissionDate;
    if (!rawDate) return 'Aujourd\'hui';
    try {
      const d = new Date(rawDate);
      if (isNaN(d.getTime())) return String(rawDate);
      const now = new Date();
      const diffMs = now.getTime() - d.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      if (diffMins >= 0 && diffMins < 1) return 'À l\'instant';
      if (diffMins >= 1 && diffMins < 60) return `Il y a ${diffMins} min`;
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours >= 1 && diffHours < 24) return `Il y a ${diffHours} h`;
      return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    } catch {
      return String(rawDate);
    }
  };

  const availableSortieDepartments = useMemo(() => {
    const set = new Set<string>();
    patientsToDischarge.forEach(p => {
      const dep = p.department || p.service;
      if (dep && typeof dep === 'string') set.add(dep.trim());
    });
    return Array.from(set).sort();
  }, [patientsToDischarge]);

  const enrichedPatientsToDischarge = useMemo(() => {
    return patientsToDischarge.map(patient => {
      const pids = [patient.patientId, patient.id, patient.dmeId].filter(Boolean);
      const unpaidReqs = paymentRequests.filter(pr => {
        const matchesPatient = pids.includes(pr.patientId) || pids.includes((pr as any).patientDme);
        if (!matchesPatient) return false;
        const st = String(pr.status || '').toUpperCase();
        if (['PAID', 'SOLDE', 'DELIVERED', 'CANCELLED', 'ANNULE'].includes(st)) return false;
        const rem = Number((pr as any).remainingAmount ?? ((pr.totalAmount || 0) - ((pr as any).amountPaid || 0)));
        return rem > 0;
      });

      const unpaidItems = unpaidReqs.map(pr => {
        const rem = Number((pr as any).remainingAmount ?? ((pr.totalAmount || 0) - ((pr as any).amountPaid || 0)));
        const firstItemName = pr.items && pr.items.length > 0
          ? pr.items.map(i => i.name).join(', ')
          : (pr.type || 'Facture en attente');
        const modLabel = pr.sourceModule || pr.requestingService || pr.type || 'Caisse';
        return {
          id: pr.id,
          label: firstItemName,
          module: modLabel,
          amount: rem
        };
      });

      const totalUnpaidAmount = unpaidItems.reduce((sum, item) => sum + item.amount, 0);
      const hasDebtLock = Boolean((patient as any).hasOutstandingEmergencyDebt || (patient as any).isLockedForDischarge);
      const effectiveFinancialClearance = Boolean(patient.financialClearance) && totalUnpaidAmount === 0 && !hasDebtLock;

      return {
        ...patient,
        financialClearance: effectiveFinancialClearance,
        unpaidItems,
        totalUnpaidAmount
      };
    });
  }, [patientsToDischarge, paymentRequests]);

  const sortieStats = useMemo(() => {
    const total = enrichedPatientsToDischarge.length;
    const ready = enrichedPatientsToDischarge.filter(p => p.medicalClearance && p.hospitalizationClosed && p.financialClearance).length;
    const pendingCaisse = enrichedPatientsToDischarge.filter(p => !p.financialClearance).length;
    const pendingMedical = enrichedPatientsToDischarge.filter(p => !p.medicalClearance || !p.hospitalizationClosed).length;
    return { total, ready, pendingCaisse, pendingMedical };
  }, [enrichedPatientsToDischarge]);

  const filteredAndSortedPatientsToDischarge = useMemo(() => {
    return [...enrichedPatientsToDischarge]
      .sort((a, b) => getSortieTimestamp(b) - getSortieTimestamp(a))
      .filter(patient => {
        // 1. Search Query
        if (sortieSearchTerm.trim()) {
          const q = sortieSearchTerm.toLowerCase().trim();
          const pName = (patient.name || patient.patientName || '').toLowerCase();
          const pId = (patient.patientId || patient.id || '').toLowerCase();
          const pDme = (patient.dmeId || '').toLowerCase();
          const pDept = (patient.department || patient.service || '').toLowerCase();
          const pDoctor = (patient.doctorName || patient.dischargedBy || patient.user || '').toLowerCase();
          const match = pName.includes(q) || pId.includes(q) || pDme.includes(q) || pDept.includes(q) || pDoctor.includes(q);
          if (!match) return false;
        }

        // 2. Status Filter
        const isReady = Boolean(patient.medicalClearance && patient.hospitalizationClosed && patient.financialClearance);
        if (sortieStatusFilter === 'READY' && !isReady) return false;
        if (sortieStatusFilter === 'PENDING_CAISSE' && patient.financialClearance) return false;
        if (sortieStatusFilter === 'PENDING_MEDICAL' && (patient.medicalClearance && patient.hospitalizationClosed)) return false;

        // 3. Department Filter
        if (sortieDepartmentFilter !== 'ALL') {
          const dep = (patient.department || patient.service || '').trim().toLowerCase();
          if (dep !== sortieDepartmentFilter.toLowerCase()) return false;
        }

        return true;
      });
  }, [patientsToDischarge, sortieSearchTerm, sortieStatusFilter, sortieDepartmentFilter]);

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
  const [currentMotifCategory, setCurrentMotifCategory] = useState<'CONSULTATIONS' | 'SOINS' | 'MATERNITE' | 'URGENCES' | 'HOSPITALISATION' | 'AUTRES'>('CONSULTATIONS');
  const [isEditingPatientProfile, setIsEditingPatientProfile] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [soinsPrescriberName, setSoinsPrescriberName] = useState('');
  const [soinsPrescriberLicense, setSoinsPrescriberLicense] = useState('');
  const [soinsSearchQuery, setSoinsSearchQuery] = useState('');

  const renderStepper = (activeStep: 1 | 2 | 3) => {
    const steps = [
      { label: "1. Identification & DME", desc: "Recherche / Dossier" },
      { label: "2. Orientation & Acte", desc: "Motif & Prestation" },
      { label: "3. Validation", desc: "Pro-forma & Caisse" }
    ];
    return (
      <div className="mb-4 bg-slate-50 border border-slate-200/80 rounded-xl p-2.5 px-4">
        <div className="flex items-center justify-between gap-2">
          {steps.map((s, idx) => {
            const num = idx + 1;
            const isCompleted = num < activeStep;
            const isActive = num === activeStep;
            return (
              <React.Fragment key={num}>
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className={`w-6 h-6 rounded-lg flex items-center justify-center font-extrabold text-[11px] shrink-0 transition-all ${
                    isCompleted ? 'bg-emerald-600 text-white shadow-xs' :
                    isActive ? 'bg-blue-600 text-white shadow-xs ring-2 ring-blue-500/20' :
                    'bg-slate-200/80 text-slate-500'
                  }`}>
                    {isCompleted ? '✓' : num}
                  </div>
                  <div className="min-w-0">
                    <p className={`text-xs font-bold truncate leading-tight ${isActive ? 'text-slate-900' : isCompleted ? 'text-emerald-700' : 'text-slate-400'}`}>
                      {s.label}
                    </p>
                    <p className="text-[10px] text-slate-400 font-medium truncate hidden sm:block leading-tight">
                      {s.desc}
                    </p>
                  </div>
                </div>
                {idx < steps.length - 1 && (
                  <div className={`flex-1 h-px max-w-[60px] hidden sm:block ${isCompleted ? 'bg-emerald-500' : 'bg-slate-200'}`} />
                )}
              </React.Fragment>
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
      // 1. Synchronize Patients with Firestore (Strict Multi-Tenant Isolation)
      const unsubPatients = onSnapshot(collection(db, 'patients'), (snapshot) => {
        if (!snapshot.empty) {
          const rawList = snapshot.docs.map(doc => doc.data() as Patient);
          const list = rawList.filter(p => belongsToTenant(p, activeTenantId));
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
          const rawList = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id, docId: doc.id }));
          const list = rawList.filter(d => belongsToTenant(d, activeTenantId));
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
        const rawList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const list = rawList.filter(a => belongsToTenant(a, activeTenantId));
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
  }, [activeTenantId]);

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

  const formatAdmissionTicket = (tx: any): PrintableReceiptData => {
    let txDate = tx.date || '';
    let txTime = tx.time || '';
    if (tx.createdAt) {
      try {
        const d = new Date(tx.createdAt);
        if (!isNaN(d.getTime())) {
          txDate = d.toLocaleDateString('fr-FR');
          txTime = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
        }
      } catch (err) {}
    }
    if (!txDate) txDate = new Date().toLocaleDateString('fr-FR');
    if (!txTime) txTime = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

    const pName = tx.patient || tx.patientName || 'Patient Anonyme';
    const dme = tx.dme || tx.patientId || 'ACCUEIL';
    let motif = tx.motif || tx.requestingService || tx.type || 'Acte Médical / Orientation';
    if (motif === 'CONSULTATION') motif = 'Consultation Générale';

    const totalVal = tx.total !== undefined ? tx.total : (tx.totalAmount || 0);
    const paidVal = tx.paid !== undefined ? tx.paid : (tx.amountPaid || 0);

    const items = [
      {
        id: 'item-1',
        name: motif,
        quantity: 1,
        unitPrice: totalVal,
        totalPrice: totalVal,
        category: 'Orientation'
      }
    ];

    if (notebookAdded) {
      items.push({
        id: 'item-carnet',
        name: 'Carnet de Santé',
        quantity: 1,
        unitPrice: 1000,
        totalPrice: 1000,
        category: 'Fourniture'
      });
    }

    const calculatedTotal = notebookAdded ? totalVal + 1000 : totalVal;

    return {
      id: tx.id || `TKT-${Date.now()}`,
      date: txDate,
      time: txTime,
      type: 'TICKET_ADMISSION',
      title: 'TICKET D\'ADMISSION & FICHE D\'ORIENTATION',
      patientName: pName,
      patientId: dme,
      dmeId: dme,
      department: tx.service || tx.requestingService || 'Orientation',
      operatorName: agentProfile?.name || 'Accueil',
      operatorRole: 'Réceptionniste',
      paymentMethod: tx.paymentMethod || 'À régler en caisse',
      items,
      subtotal: calculatedTotal,
      totalAmount: calculatedTotal,
      amountPaid: paidVal,
      notes: 'Document d\'orientation valable pour consultation après règlement en caisse.',
      isPaid: paidVal >= calculatedTotal
    };
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

  const agentProfile = useMemo(() => {
    if (user) {
      return {
        ...user,
        name: user.name || 'Agent Hospitalier',
        profession: user.profession || "Personnel de Réception",
        role: user.role || Role.RECEPTION,
        schedule: user.schedule || "Lun-Ven (08h00 - 17h00)",
        salary: user.salary ? `${user.salary} ${currency}` : "Confidentiel",
        quotePartRate: user.quotePartRate || "Standard"
      };
    }
    return {
      name: "Moussa Diop", 
      profession: "Agent d'accueil Principal", 
      role: Role.RECEPTION,
      schedule: "Lun-Ven (08h00 - 17h00)", 
      salary: `250,000 ${currency}`, 
      quotePartRate: "1%"
    };
  }, [user, currency]);

  const userRoleLabels = useMemo(() => {
    if (!user) return ['Réceptionniste'];
    const labels: string[] = [];
    if (user.role) {
      labels.push(user.role);
    }
    if (Array.isArray(user.roles)) {
      user.roles.forEach(rid => {
        const found = customRoles.find(r => r.id === rid);
        if (found && !labels.includes(found.name)) {
          labels.push(found.name);
        }
      });
    }
    return labels.length > 0 ? labels : [user.role || 'Personnel'];
  }, [user, customRoles]);

  const userModulesList = useMemo(() => [
    {
      name: "Accueil & Admissions",
      role: Role.RECEPTION,
      enabled: isUserAuthorizedForModule(user, Role.RECEPTION, customRoles),
      detail: permissions.canWrite ? "Lecture & Écriture" : permissions.canRead ? "Lecture Seule" : "Non autorisé"
    },
    {
      name: "Caisse & Règlements",
      role: Role.CASHIER,
      enabled: isUserAuthorizedForModule(user, Role.CASHIER, customRoles),
      detail: isUserAuthorizedForModule(user, Role.CASHIER, customRoles) ? "Accès caisse actif" : "Désactivé"
    },
    {
      name: "Consultation & Dossier Médical",
      role: Role.DOCTOR,
      enabled: isUserAuthorizedForModule(user, Role.DOCTOR, customRoles),
      detail: isUserAuthorizedForModule(user, Role.DOCTOR, customRoles) ? "Accès médical actif" : "Désactivé"
    },
    {
      name: "Soins Infirmiers & Triage",
      role: Role.NURSE,
      enabled: isUserAuthorizedForModule(user, Role.NURSE, customRoles),
      detail: isUserAuthorizedForModule(user, Role.NURSE, customRoles) ? "Accès soins actif" : "Désactivé"
    },
    {
      name: "Laboratoire & Examens",
      role: Role.LAB,
      enabled: isUserAuthorizedForModule(user, Role.LAB, customRoles),
      detail: isUserAuthorizedForModule(user, Role.LAB, customRoles) ? "Accès analyses actif" : "Désactivé"
    },
    {
      name: "Pharmacie & Dispensation",
      role: Role.PHARMACY,
      enabled: isUserAuthorizedForModule(user, Role.PHARMACY, customRoles),
      detail: isUserAuthorizedForModule(user, Role.PHARMACY, customRoles) ? "Accès dispensation actif" : "Désactivé"
    },
    {
      name: "Hospitalisation & Lits",
      role: Role.INPATIENT,
      enabled: isUserAuthorizedForModule(user, Role.INPATIENT, customRoles),
      detail: isUserAuthorizedForModule(user, Role.INPATIENT, customRoles) ? "Accès séjours actif" : "Désactivé"
    },
    {
      name: "Comptabilité & Journaux",
      role: 'accounting',
      enabled: isUserAuthorizedForModule(user, 'accounting', customRoles),
      detail: isUserAuthorizedForModule(user, 'accounting', customRoles) ? "Accès finances actif" : "Désactivé"
    }
  ], [user, customRoles, permissions]);

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

  const handleQuickLambdaAdmission = async () => {
    if (!permissions.canWrite) {
      alert("Action non autorisée : votre rôle dispose d'un accès en lecture seule.");
      return;
    }
    const ids = await getNextSequentialIdsAndAssign();
    const now = new Date();
    const timeCode = `${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}`;
    
    const lambdaPatient: Patient = {
      id: ids.dmeId,
      patientId: ids.patientId,
      lastName: 'LAMBDA',
      firstName: `Patient Anonyme #${timeCode}`,
      gender: 'M',
      maritalStatus: 'CELIBATAIRE',
      birthDate: '1990-01-01',
      phone: '',
      residence: 'Ambulatoire / Soin Express',
      emergencyContact: '',
      emergencyPhone: '',
      isLambda: true,
      isAnonymous: true,
      admissionMode: 'PROMPT_SERVICE',
      vitals: {
        bpSys: 120,
        bpDia: 80,
        heartRate: 75,
        respRate: 18,
        pulse: 75,
        spo2: 98,
        temp: 37,
        height: 170,
        weight: 70,
        bmi: 24.2,
        waistCirc: 85
      }
    };
    setCurrentPatient(lambdaPatient);
    setVisitMotif('SOIN_INFIRMIER');
    setStep('triage');
    window.dispatchEvent(new CustomEvent('app-notification', {
      detail: `⚡ Admission Patient Lambda initialisée pour Soin Express / Soins Infirmiers.`
    }));
  };

  const handleSelectPatient = (p: Patient) => {
    setCurrentPatient(p);
    if (!permissions.canWrite) {
      setSelectedPatientForHistory(p);
      setActiveTab('historique');
    } else {
      setStep('triage');
    }
    setSearchQuery('');
  };

  const finalizeAdmission = async (sendToNurseTriage: boolean = false) => {
    if (!permissions.canWrite) {
      alert("Action non autorisée : votre rôle dispose d'un accès en lecture seule.");
      return;
    }
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

      const finalVitals = currentPatient.vitals ? {
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
          totalPrice: selectedMotif.fee,
          actId: selectedMotif.actId || selectedMotif.id,
          codeInterne: selectedMotif.codeInterne || '',
          practitionerId: user?.id || '',
          practitionerName: user?.name || user?.username || 'Agent Accueil',
          practitionerRole: user?.role || 'RECEPTIONIST'
        });
      } else if (visitMotif) {
        items.push({
          id: `ITEM-${Math.floor(Math.random() * 1000)}`,
          name: getOrientationData(visitMotif).label,
          quantity: 1,
          unitPrice: getOrientationData(visitMotif).fee,
          totalPrice: getOrientationData(visitMotif).fee,
          practitionerId: user?.id || '',
          practitionerName: user?.name || user?.username || 'Agent Accueil',
          practitionerRole: user?.role || 'RECEPTIONIST'
        });
      }

      if (notebookAdded) {
        items.push({
          id: `ITEM-CARNET`,
          name: 'Carnet Médical',
          quantity: 1,
          unitPrice: 1000,
          totalPrice: 1000,
          practitionerId: user?.id || '',
          practitionerName: user?.name || user?.username || 'Agent Accueil',
          practitionerRole: user?.role || 'RECEPTIONIST'
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
        createdBy: user?.name || user?.username || 'Système',
        createdById: user?.id || '',
        practitionerId: user?.id || '',
        practitionerName: user?.name || user?.username || 'Agent Accueil',
        practitionerRole: user?.role || 'RECEPTIONIST',
        requestedBy: user?.name || user?.username || 'Agent Accueil',
        requestedById: user?.id || '',
        prescriberName: soinsPrescriberName.trim() || undefined,
        prescriberLicense: soinsPrescriberLicense.trim() || undefined,
        requiresPrescription: Boolean(selectedMotif?.requiresPrescription)
      };
      reqIdForLog = createdRequest.id;
      const tenantStampedRequest = stampTenantData(createdRequest, user, establishment);
      p5 = setDoc(doc(db, 'payment_requests', createdRequest.id), sanitizeData(tenantStampedRequest));

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

      // Explicit Gynecological Consultation check: ALWAYS routed to Consultation
      const isGynecoRecourse = 
        (selectedMotif?.label && /gynéco|gyneco/i.test(selectedMotif.label)) ||
        (selectedMotif?.speciality && /gynéco|gyneco/i.test(selectedMotif.speciality)) ||
        (selectedMotif?.queueName && /gynéco|gyneco/i.test(selectedMotif.queueName));

      // Direct Maternity Routing: ONLY CPN (prenatal/postnatal) and Accouchement (labor/delivery/cesarean)
      // Gynecological consultation ALWAYS routes to Consultation module
      const isMaternityService = !isGynecoRecourse && (
        selectedMotif?.category === 'MATERNITE' || 
        selectedMotif?.serviceId === 'SRV-MATERNITE' || 
        visitMotif === 'MATERNITE' ||
        (selectedMotif?.label && /cpn|accouchement|travail|césarienne|cesar|postnatale|grossesse/i.test(selectedMotif.label)) ||
        (targetService && /matern|cpn|accouchement|travail|césarienne/i.test(targetService)) ||
        (targetQueue && /matern|cpn|accouchement|travail|césarienne/i.test(targetQueue)) ||
        (targetSpeciality && /matern|cpn|accouchement|travail|césarienne/i.test(targetSpeciality))
      );

      if (isGynecoRecourse) {
        targetService = 'Consultation';
        targetQueue = 'Consultation Gynécologique';
        targetSpeciality = 'Gynécologie';
      }

      // Standard consultations MUST systematically pass through Nurse Triage (Soins Infirmiers)
      // so that vital signs (BP, Temp, Pulse, SpO2, Weight) are measured by the nurse before doctor consultation
      const isConsultationRecourse = 
        !isMaternityService && (
          selectedMotif?.category === 'CONSULTATIONS' ||
          visitMotif === 'CONSULTATION' ||
          targetService === 'Consultation' ||
          isGynecoRecourse
        );

      const effectiveSendToNurseTriage = isMaternityService ? false : (sendToNurseTriage || isConsultationRecourse);

      // Write database actions in parallel! (Stamped with active hospital structure)
      const tenantStampedPatient = stampTenantData(finalPatient, user, establishment);
      const p1 = setDoc(doc(db, 'patients', finalPatient.id), sanitizeData(tenantStampedPatient));

      const p2 = setDoc(doc(db, 'medical_records', dmeId), sanitizeData(stampTenantData({
        id: dmeId,
        patientId: patientId,
        createdAt: new Date().toISOString(),
        createdBy: user?.name || user?.username || 'Agent Accueil',
        createdById: user?.id || '',
        practitionerRole: user?.role || 'RECEPTIONIST',
        vitals: finalPatient.vitals || {},
        history: [
          {
            action: isMaternityService 
              ? `Patiente admise et orientée directement en Maternité (Triage sage-femme)`
              : isGynecoRecourse
              ? `Patiente admise en Consultation Gynécologique (Médecin / Spécialiste)`
              : `Patient enregistré - Motif de recours: ${selectedMotif?.label || visitMotif}`,
            user: user?.name || user?.username || 'Agent Accueil',
            userId: user?.id || '',
            date: todayStr,
            time: timeStr
          }
        ]
      }, user, establishment)));

      const visitDocRef = doc(collection(db, 'reception_visits'));
      const visitData = stampTenantData({
        id: visitDocRef.id,
        patientId: patientId,
        patientName: `${finalPatient.lastName} ${finalPatient.firstName}`,
        date: todayStr,
        time: timeStr,
        motif: visitMotif,
        motifId: selectedMotif?.id || '',
        motifLabel: selectedMotif?.label || '',
        orientation: isMaternityService ? 'Maternité (Direct)' : isGynecoRecourse ? 'Consultation Gynécologique' : (selectedMotif?.label || getOrientationData(visitMotif || 'CONSULTATION').label),
        user: user?.name || user?.username || 'Agent Accueil',
        userId: user?.id || '',
        practitionerRole: user?.role || 'RECEPTIONIST',
        createdAt: new Date().toISOString()
      }, user, establishment);
      const p3 = setDoc(visitDocRef, sanitizeData(visitData));

      let p4 = Promise.resolve();
      if (!effectiveSendToNurseTriage && finalPatient.vitals) {
        const triageDocRef = doc(collection(db, 'triage_records'));
        p4 = setDoc(triageDocRef, sanitizeData(stampTenantData({
          id: triageDocRef.id,
          patientId: patientId,
          visitId: visitDocRef.id,
          vitals: finalPatient.vitals,
          priority: computedPriorityAndAlerts.priority,
          priorityAlerts: computedPriorityAndAlerts.alerts,
          createdAt: new Date().toISOString(),
          createdBy: user?.name || user?.username || 'Agent Accueil',
          createdById: user?.id || '',
          practitionerRole: user?.role || 'RECEPTIONIST'
        }, user, establishment)));
      }

      // Check for duplicate in queue locally (0ms delay) to prevent double clicks creating multiple records
      const initialStatus = effectiveSendToNurseTriage ? 'waiting_triage' : 'waiting';
      const targetSvcId = isGynecoRecourse ? 'SRV-CONSULTATION' : (isMaternityService ? 'SRV-MATERNITE' : (selectedMotif?.serviceId || ''));
      const alreadyInQueue = (globalWaitingQueue || []).some(
        q =>
          q.patientId === patientId &&
          (q.serviceId || '') === targetSvcId &&
          (q.status === 'waiting' || q.status === 'waiting_triage')
      );

      let p6 = Promise.resolve();
      let queueEntry: any = null;
      if (!alreadyInQueue) {
        const queueDocRef = doc(collection(db, 'service_queues'));
        queueEntry = stampTenantData({
          id: queueDocRef.id,
          patientId: patientId,
          dmeId: dmeId,
          firstName: finalPatient.firstName,
          lastName: finalPatient.lastName,
          isLambda: finalPatient.isLambda || false,
          isAnonymous: finalPatient.isAnonymous || false,
          admissionMode: finalPatient.admissionMode || 'STANDARD',
          age: calculateAge(finalPatient.birthDate),
          gender: finalPatient.gender,
          time: timeStr,
          date: todayStr,
          motif: visitMotif,
          motifId: selectedMotif?.id || '',
          motifLabel: selectedMotif?.label || '',
          speciality: isGynecoRecourse 
            ? 'Gynécologie' 
            : isMaternityService 
            ? (/accouchement|travail|césarienne|cesar/i.test(selectedMotif?.label || '') ? 'Salle de travail / Accouchement' : 'Consultation Prénatale (CPN)') 
            : targetSpeciality,
          queueName: isGynecoRecourse 
            ? 'Consultation Gynécologique' 
            : isMaternityService 
            ? (targetQueue || 'Salle d\'attente CPN') 
            : targetQueue,
          service: isGynecoRecourse ? 'Consultation' : isMaternityService ? 'Maternité' : targetService,
          serviceId: targetSvcId,
          status: initialStatus,
          paymentStatus: 'AWAITING_PAYMENT',
          paymentRequestId: createdRequest?.id || '',
          attente_module: 'CAISSE',
          takenInCharge: false,
          prescriberName: soinsPrescriberName.trim() || undefined,
          prescriberLicense: soinsPrescriberLicense.trim() || undefined,
          priority: effectiveSendToNurseTriage ? 'normal' : computedPriorityAndAlerts.priority,
          priorityAlerts: effectiveSendToNurseTriage ? [] : computedPriorityAndAlerts.alerts,
          admittedBy: user?.name || user?.username || 'Agent Accueil',
          admittedById: user?.id || '',
          practitionerId: user?.id || '',
          practitionerName: user?.name || user?.username || 'Agent Accueil',
          practitionerRole: user?.role || 'RECEPTIONIST',
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
        }, user, establishment);
        p6 = setDoc(queueDocRef, sanitizeData(queueEntry));
      }

      let p7 = Promise.resolve();
      if (selectedMotif?.category === 'HOSPITALISATION') {
        const hospDocRef = doc(collection(db, 'hospitalisation_requests'));
        p7 = setDoc(hospDocRef, sanitizeData(stampTenantData({
          id: hospDocRef.id,
          patientId: patientId,
          patientName: `${finalPatient.lastName} ${finalPatient.firstName}`,
          service: 'Admission Directe',
          motif: selectedMotif.label,
          priority: computedPriorityAndAlerts.priority === 'normal' ? 'Normal' : (computedPriorityAndAlerts.priority === 'urgent' ? 'Urgent' : 'Critique'),
          status: 'pending',
          createdAt: new Date().toISOString(),
          requestedBy: user?.name || 'Agent Accueil'
        }, user, establishment)));
      }

      let p8 = Promise.resolve();
      if (selectedMotif?.category === 'URGENCES' || visitMotif === 'URGENCE' || targetService === 'Urgences' || targetQueue === 'Urgences') {
        const erDocRef = doc(collection(db, 'emergency_patients'));
        p8 = setDoc(erDocRef, sanitizeData(stampTenantData({
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
        }, user, establishment)));
      }

      let p9 = Promise.resolve();
      const isSoinRecourse = 
        visitMotif === 'SOIN_INFIRMIER' || 
        selectedMotif?.category === 'SOINS' || 
        selectedMotif?.serviceId === 'SRV-INFIRMIER' || 
        (targetService || '').toLowerCase().includes('soin');

      if (isSoinRecourse) {
        const actDocRef = doc(collection(db, 'nursing_acts'));
        const actLabel = selectedMotif?.label || 'Soin Infirmier / Pansement Ambulatoire';
        p9 = setDoc(actDocRef, sanitizeData(stampTenantData({
          id: actDocRef.id,
          patientId: patientId,
          patientDme: dmeId,
          patientName: `${finalPatient.lastName} ${finalPatient.firstName}`,
          careName: actLabel,
          actName: actLabel,
          name: actLabel,
          actType: actLabel,
          motif: actLabel,
          source: 'ACCUEIL',
          origin: 'ACCUEIL',
          status: 'EN ATTENTE',
          priority: computedPriorityAndAlerts.priority === 'normal' ? 'NORMAL' : (computedPriorityAndAlerts.priority === 'urgent' ? 'HIGH' : 'CRITICAL'),
          paymentStatus: 'AWAITING_PAYMENT',
          paymentRequestId: createdRequest?.id || '',
          prescriberName: soinsPrescriberName.trim() || undefined,
          prescriberLicense: soinsPrescriberLicense.trim() || undefined,
          requiresPrescription: Boolean(selectedMotif?.requiresPrescription),
          createdAt: new Date().toISOString(),
          requestedBy: user?.name || user?.username || 'Agent Accueil',
          requestedById: user?.id || '',
          admittedAt: todayStr
        }, user, establishment)));
      }

      let p10 = Promise.resolve();
      const isLabRecourse = 
        visitMotif === 'LABORATOIRE' || 
        selectedMotif?.category === 'LABORATOIRE' || 
        selectedMotif?.serviceId === 'SRV-LABO' || 
        (targetService || '').toLowerCase().includes('labo');

      if (isLabRecourse) {
        const labDocRef = doc(collection(db, 'lab_requests'));
        const examLabel = selectedMotif?.label || 'Analyse de Laboratoire Demandée';
        p10 = setDoc(labDocRef, sanitizeData(stampTenantData({
          id: labDocRef.id,
          patientId: patientId,
          patientDme: dmeId,
          patientName: `${finalPatient.lastName} ${finalPatient.firstName}`,
          exams: [{
            actId: `ACT-LAB-${Date.now()}`,
            name: examLabel,
            price: totalToPay || 2500,
            category: 'Analyses Générales',
            sampleType: 'Tube standard'
          }],
          clinicalContext: {
            motif: examLabel,
            diagnostic: 'Bilan direct laboratoire',
            note: 'Admission directe accueil'
          },
          status: 'en attente',
          billingStatus: 'pending',
          paymentRequestId: createdRequest?.id || '',
          createdAt: new Date().toISOString(),
          requestedBy: user?.name || user?.username || 'Agent Accueil',
          doctor: user?.name || user?.username || 'Agent Accueil',
          priority: computedPriorityAndAlerts.priority === 'normal' ? 'Normal' : 'Urgent',
          origin: 'ACCUEIL'
        }, user, establishment)));
      }

      // Optimistically update local states immediately (0ms delay)
      setPatients(prev => [finalPatient, ...prev.filter(p => p.id !== finalPatient.id)]);
      if (createdRequest && setPaymentRequests) {
        setPaymentRequests(prev => [createdRequest!, ...prev.filter(r => r.id !== createdRequest!.id)]);
      }
      if (queueEntry && setGlobalWaitingQueue) {
        setGlobalWaitingQueue(prev => [queueEntry, ...prev.filter(q => q.id !== queueEntry.id)]);
      }

      // Set selectedTxForProforma for the summary screen ticket view
      setSelectedTxForProforma(createdRequest);
      setSelectedHistoryDate(todayStr);
      setStep('summary');
      setIsSaving(false);

      // Live trigger notifications toast immediately
      const toastMsg = isMaternityService
        ? `Admission enregistrée pour ${finalPatient.lastName} ${finalPatient.firstName} -> Transférée directement en Maternité (Triage sage-femme)`
        : isSoinRecourse
        ? `Admission enregistrée pour ${finalPatient.lastName} ${finalPatient.firstName} -> Transféré(e) en Soins Infirmiers (Ambulatoire)`
        : isLabRecourse
        ? `Admission enregistrée pour ${finalPatient.lastName} ${finalPatient.firstName} -> Orienté(e) vers le Laboratoire`
        : effectiveSendToNurseTriage
        ? `Admission enregistrée pour ${finalPatient.lastName} ${finalPatient.firstName} -> Transféré(e) en File de Triage Infirmier`
        : `Admission et orientation effectuées pour ${finalPatient.lastName} ${finalPatient.firstName}`;
      
      window.dispatchEvent(new CustomEvent('app-notification', { detail: toastMsg }));

      // Persist all writes and audit logs asynchronously via IndexedDB local cache + background sync
      Promise.all([p1, p2, p3, p4, p5, p6, p7, p8, p9, p10]).catch(err => {
        console.warn("Background admission sync warning:", err);
      });

      Promise.all([
        logAudit(`Création Dossier Patient & Admission`, { patientId, patientName: `${finalPatient.lastName} ${finalPatient.firstName}` }),
        logAudit(`Création Visite d'admission`, { visitId: visitDocRef.id, motif: selectedMotif?.label || visitMotif }),
        (!effectiveSendToNurseTriage && finalPatient.vitals) ? logAudit(`Triage avec calcul priorité effectué: ${computedPriorityAndAlerts.priority}`, { patientId }) : Promise.resolve(),
        logAudit(isMaternityService ? `Orientation directe en Maternité (Triage infirmier général contourné)` : (effectiveSendToNurseTriage ? `Orientation vers File de Triage Infirmier` : `Orientation Patient vers ${targetService} (${targetQueue})`), { patientId }),
        reqIdForLog ? logAudit(`Création de la demande de paiement d'admission`, { reqId: reqIdForLog, amount: totalToPay }) : Promise.resolve()
      ]).catch(() => {});

    } catch (err: any) {
      console.error("Firestore persistence failed matching requirements:", err);
      alert(`Erreur d'enregistrement: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSavePatientProfile = async (continueToTriage = false) => {
    if (!permissions.canWrite || !currentPatient.lastName?.trim() || !currentPatient.firstName?.trim()) return;
    setIsSavingProfile(true);
    try {
      const targetId = currentPatient.id || currentPatient.patientId || `PAT-${Date.now()}`;
      const updatedPatient = stampTenantData({
        ...currentPatient,
        id: targetId,
        patientId: currentPatient.patientId || targetId,
        updatedAt: new Date().toISOString(),
        updatedBy: user?.name || user?.username || 'Agent Accueil'
      }, user, establishment);

      await Promise.all([
        setDoc(doc(db, 'patients', targetId), sanitizeData(updatedPatient), { merge: true }),
        setDoc(doc(db, 'patient_records', targetId), sanitizeData({
          id: targetId,
          patientId: targetId,
          lastName: updatedPatient.lastName,
          firstName: updatedPatient.firstName,
          phone: updatedPatient.phone || '',
          birthDate: updatedPatient.birthDate || '',
          gender: updatedPatient.gender || 'M',
          address: updatedPatient.address || '',
          cni: updatedPatient.cni || '',
          updatedAt: new Date().toISOString()
        }), { merge: true }),
        logAudit('Modification profil patient (Accueil)', { patientId: targetId, patientName: `${updatedPatient.lastName} ${updatedPatient.firstName}` })
      ]);

      setCurrentPatient(updatedPatient);
      setIsEditingPatientProfile(false);
      window.dispatchEvent(new CustomEvent('app-notification', {
        detail: `Profil patient mis à jour : ${updatedPatient.lastName} ${updatedPatient.firstName}`
      }));

      if (continueToTriage) {
        setStep('triage');
      } else {
        setStep('search');
      }
    } catch (err) {
      console.error('Erreur mise à jour profil patient:', err);
    } finally {
      setIsSavingProfile(false);
    }
  };

  const waitingCount = useMemo(() => {
    return (globalWaitingQueue || []).filter(q => {
      const isCleared = Boolean(q.takenInCharge) || q.attente_module === 'EN_COURS' ||
        ['in_consultation', 'IN_PROGRESS', 'COMPLETED', 'discharged'].includes(q.status);
      return !isCleared && (q.status === 'waiting' || q.status === 'waiting_triage');
    }).length;
  }, [globalWaitingQueue]);

  const activeWaitingList = useMemo(() => {
    // Return all patients in the queue for today that are strictly waiting and not yet taken in charge
    return (globalWaitingQueue || []).filter(q => {
      const isCleared = Boolean(q.takenInCharge) || q.attente_module === 'EN_COURS' ||
        ['in_consultation', 'IN_PROGRESS', 'COMPLETED', 'discharged'].includes(q.status);
      return !isCleared && (q.status === 'waiting' || q.status === 'waiting_triage');
    });
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
    if (!permissions.canWrite) {
      setDischargeError({ patientId: id, message: "Action non autorisée : votre rôle dispose d'un accès en lecture seule." });
      return;
    }
    const patient = enrichedPatientsToDischarge.find(p => p.id === id);
    if (!patient) return;

    // Strict criteria safety checks
    const unmet: string[] = [];
    if (patient.medicalClearance !== true) unmet.push("Autorisation médicale obligatoire manquante");
    if (patient.hospitalizationClosed !== true) unmet.push("Dossier d'hospitalisation non clos");
    if ((patient as any).hasOutstandingEmergencyDebt === true || (patient as any).isLockedForDischarge === true) {
      unmet.push("🔒 BLOQUÉ : Dette d'urgence non réglée");
    }

    // Global DB Check across ALL hospital modules (Consultations, Hospitalisation, Labo, Pharmacie, Soins, Dettes)
    const targetPatientIds = Array.from(new Set([patient.patientId, patient.id, patient.dmeId].filter(Boolean)));
    const dbUnpaidDetails: string[] = [];
    let dbUnpaidSum = 0;

    try {
      for (const pid of targetPatientIds) {
        const [prSnap, debtSnap, rxSnap, labSnap] = await Promise.all([
          getDocs(query(collection(db, 'payment_requests'), where('patientId', '==', pid))),
          getDocs(query(collection(db, 'dettes_patient'), where('patientId', '==', pid), where('status', '==', 'PENDING'))),
          getDocs(query(collection(db, 'pending_prescriptions'), where('patientId', '==', pid))),
          getDocs(query(collection(db, 'lab_requests'), where('patientId', '==', pid)))
        ]);

        prSnap.docs.forEach(d => {
          const data = d.data();
          if (!belongsToTenant(data, activeTenantId)) return;
          const st = String(data.status || '').toUpperCase();
          if (['PAID', 'SOLDE', 'DELIVERED', 'CANCELLED', 'ANNULE'].includes(st)) return;
          const rem = Number(data.remainingAmount ?? ((data.totalAmount || 0) - (data.amountPaid || 0)));
          if (rem > 0) {
            dbUnpaidSum += rem;
            const itemLbl = data.items?.[0]?.name || data.type || 'Facture Caisse';
            dbUnpaidDetails.push(`${itemLbl} (${rem.toLocaleString()} FCFA)`);
          }
        });

        debtSnap.docs.forEach(d => {
          const data = d.data();
          if (!belongsToTenant(data, activeTenantId)) return;
          const amt = Number(data.amount || data.remainingAmount || 0);
          if (amt > 0) {
            dbUnpaidSum += amt;
            dbUnpaidDetails.push(`Dette ${data.origin || 'Patient'} (${amt.toLocaleString()} FCFA)`);
          }
        });

        rxSnap.docs.forEach(d => {
          const data = d.data();
          if (!belongsToTenant(data, activeTenantId)) return;
          const st = String(data.status || '').toUpperCase();
          const pSt = String(data.paymentStatus || '').toUpperCase();
          if (!['PAID', 'DELIVERED', 'DISPENSED', 'CANCELLED'].includes(st) && !['PAID', 'SOLDE'].includes(pSt)) {
            const amt = Number(data.totalAmount || 0);
            if (amt > 0) {
              dbUnpaidSum += amt;
              dbUnpaidDetails.push(`Ordonnance Pharmacie (${amt.toLocaleString()} FCFA)`);
            }
          }
        });

        labSnap.docs.forEach(d => {
          const data = d.data();
          if (!belongsToTenant(data, activeTenantId)) return;
          const pSt = String(data.paymentStatus || '').toUpperCase();
          if (!['PAID', 'SOLDE'].includes(pSt) && String(data.status || '').toUpperCase() !== 'CANCELLED') {
            const amt = Number(data.totalCost || data.totalAmount || data.price || 0);
            if (amt > 0) {
              dbUnpaidSum += amt;
              dbUnpaidDetails.push(`Examen Labo ${data.examName || ''} (${amt.toLocaleString()} FCFA)`);
            }
          }
        });
      }
    } catch (e) {
      console.error("Erreur vérification globale des impayés:", e);
    }

    if (dbUnpaidSum > 0 || patient.financialClearance !== true) {
      const uniqueDetails = Array.from(new Set(dbUnpaidDetails));
      const detailText = uniqueDetails.length > 0
        ? `Impayés détectés (${dbUnpaidSum.toLocaleString()} FCFA) : ${uniqueDetails.join(', ')}`
        : "Solde ou régularisation de facturation de caisse non accomplie";
      unmet.push(detailText);
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
      const dischargeData = stampTenantData({
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
      }, user, establishment);

      const notifDocRef = doc(collection(db, 'notifications'));

      // Save database actions in parallel
      const p1 = setDoc(dischargeDocRef, sanitizeData(dischargeData));
      const p2 = deleteDoc(doc(db, 'discharges_waiting', patient.docId || patient.id));
      const p3 = setDoc(notifDocRef, sanitizeData(stampTenantData({
        id: notifDocRef.id,
        message: `Sortie administrative validée pour ${patient.name} (${patient.id})`,
        module: 'Reception',
        targetModules: ['Cashier', 'Dashboard', 'Doctor'],
        createdAt: new Date().toISOString()
      }, user, establishment)));
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
    <div className={`h-screen flex flex-col overflow-hidden p-3 sm:p-5 font-sans ${theme === 'dark' ? 'bg-[#090d16] text-slate-100' : 'bg-[#F8FAFC] text-slate-900'}`}>
      {/* MODAL PRO-FORMA / TICKET D'ADMISSION IMPRIMABLE (Dual format: Supermarché 80mm & A4 Standard) */}
      {showProforma && selectedTxForProforma && (
        <PrintReceiptModal
          receipt={formatAdmissionTicket(selectedTxForProforma)}
          establishment={establishment}
          initialFormat={establishment.ticketFormat || establishment.receiptFormat}
          onClose={() => setShowProforma(false)}
        />
      )}

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
        user={user || agentProfile}
        theme={theme}
        actions={
          <div className="flex items-center gap-1.5 overflow-x-auto">
            {[
              { id: 'dashboard', label: 'Dashboard' },
              { id: 'triage', label: `Admissions (${globalWaitingQueue.filter(q => q.status === 'waiting' || q.status === 'waiting_triage').length})` },
              { id: 'sorties', label: `Sorties (${patientsToDischarge.length})` },
              { id: 'historique', label: 'Archives & Historique' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => {
                  if (tab.id === 'historique') setSelectedPatientForHistory(null);
                  setActiveTab(tab.id as any);
                }}
                className={`px-3 py-1.5 rounded-xl font-semibold text-xs transition-all cursor-pointer ${
                  activeTab === tab.id
                    ? 'bg-blue-600 text-white shadow-xs'
                    : theme === 'dark'
                    ? 'bg-slate-800/80 border border-slate-700/80 text-slate-300 hover:bg-slate-800'
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
        {permissions.isReadOnly && (
          <div className="mx-4 sm:mx-6 mt-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center justify-between gap-3 text-amber-700 dark:text-amber-400 text-xs font-semibold animate-in fade-in">
            <div className="flex items-center gap-2">
              <Lock size={16} className="text-amber-600 dark:text-amber-400 shrink-0" />
              <span>
                <strong>Mode Lecture Seule :</strong> Vous disposez d'un accès en consultation uniquement pour le module Accueil. La création de dossiers, l'orientation et la validation de sorties sont verrouillées.
              </span>
            </div>
          </div>
        )}
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
          <div className={`rounded-2xl border shadow-xs overflow-hidden mt-6 ${
            theme === 'dark' ? 'bg-[#111827] border-slate-800' : 'bg-white border-slate-200'
          }`}>
            <div className={`px-6 py-4 border-b flex justify-between items-center ${
              theme === 'dark' ? 'border-slate-800 bg-slate-900/50' : 'border-slate-200 bg-slate-50/70'
            }`}>
              <h3 className={`font-bold text-xs uppercase tracking-wider flex items-center gap-2 ${
                theme === 'dark' ? 'text-slate-200' : 'text-slate-800'
              }`}>
                <Users size={16} className="text-blue-500" /> Admissions & Orientations Récentes (Temps Réel)
              </h3>
              <button onClick={() => { setSelectedPatientForHistory(null); setActiveTab('historique'); }} className="text-xs font-semibold text-blue-500 hover:underline flex items-center gap-1 cursor-pointer">
                Consulter Tout l'Historique →
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left table-medical">
                <thead>
                  <tr>
                    <th className="px-6 py-3.5">Patient</th>
                    <th className="px-6 py-3.5">Type / Motif</th>
                    <th className="px-6 py-3.5">Montant</th>
                    <th className="px-6 py-3.5">Statut</th>
                    <th className="px-6 py-3.5">Heure</th>
                    <th className="px-6 py-3.5">Action</th>
                  </tr>
                </thead>
                <tbody className={`divide-y ${theme === 'dark' ? 'divide-slate-800/80' : 'divide-slate-100'}`}>
                  {displayedTodaysRequests.length > 0 ? displayedTodaysRequests.slice(0, 15).map((p, i) => (
                    <tr 
                      key={p.id || `req-${p.patientId || 'patient'}-${p.createdAt || ''}-${i}`} 
                      onClick={() => { setSelectedTxForProforma(p); setShowProforma(true); }}
                      className="transition-colors group cursor-pointer"
                    >
                      <td className="px-6 py-3.5">
                        <p className={`font-bold text-sm group-hover:text-blue-500 transition-colors ${theme === 'dark' ? 'text-slate-100' : 'text-slate-900'}`}>{p.patientName}</p>
                        <p className="text-xs text-slate-400 font-mono font-medium uppercase">{p.patientId}</p>
                      </td>
                      <td className="px-6 py-3.5">
                        <span className={`text-xs font-semibold uppercase ${theme === 'dark' ? 'text-slate-300' : 'text-slate-700'}`}>{p.type}</span>
                      </td>
                      <td className={`px-6 py-3.5 font-bold text-sm tabular-nums ${theme === 'dark' ? 'text-slate-200' : 'text-slate-800'}`}>
                        {((p.totalAmount || 0) || (p.total || 0)).toLocaleString()} <span className="text-xs opacity-60">CFA</span>
                      </td>
                      <td className="px-6 py-3.5">
                        <span className={`text-[11px] font-bold px-2.5 py-1 rounded-lg border ${
                          p.status === 'PENDING'
                            ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
                            : p.status === 'PAID'
                            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                            : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20'
                        }`}>
                          {p.status === 'PENDING' ? 'EN ATTENTE' : p.status === 'PAID' ? 'PAYÉ' : 'ANNULÉ'}
                        </span>
                      </td>
                      <td className="px-6 py-3.5 text-xs text-slate-400 font-medium tabular-nums">
                        {p.createdAt ? new Date(p.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                      </td>
                      <td className="px-6 py-3.5">
                        <button 
                          onClick={(e) => { e.stopPropagation(); setSelectedTxForProforma(p); setShowProforma(true); }}
                          className="p-2 text-slate-400 hover:text-blue-500 hover:bg-blue-500/10 rounded-xl transition-all cursor-pointer"
                          title="Voir le Ticket"
                        >
                          <Printer size={16} />
                        </button>
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-slate-400 text-xs font-semibold">
                        Aucune admission enregistrée aujourd'hui
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
        <div className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            <div className="lg:col-span-8 space-y-4">
            {step === 'search' && (
              <div className="space-y-4 animate-in fade-in duration-300">
                <div className="bg-white p-5 sm:p-6 rounded-2xl shadow-xs border border-slate-200">
                  {renderStepper(1)}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                    <div>
                      <h2 className="text-base sm:text-lg font-extrabold flex items-center gap-2 tracking-tight text-slate-900">
                        <Search size={18} className="text-blue-600" /> Identifier ou Créer un Dossier Patient
                      </h2>
                      <p className="text-xs text-slate-500 font-medium mt-0.5">
                        Recherchez un patient existant par nom, prénom, téléphone ou N° DME
                      </p>
                    </div>
                    {!permissions.canWrite ? (
                      <div className="px-3.5 py-2 bg-slate-100 dark:bg-slate-800 text-slate-500 rounded-xl font-bold text-xs flex items-center gap-1.5 border border-slate-200 dark:border-slate-700 shrink-0">
                        <Lock size={14} className="text-slate-400" />
                        <span>Lecture Seule</span>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <button 
                          type="button"
                          onClick={handleQuickLambdaAdmission}
                          className="px-3.5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-black text-xs flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
                          title="Admission directe d'un patient anonyme / lambda pour soins infirmiers ou urgences promptes"
                        >
                          <Sparkles size={15} />
                          <span>Patient Lambda (Anonyme)</span>
                        </button>
                        <button 
                          onClick={async () => { 
                            const ids = await getNextSequentialIdsAndAssign(); 
                            setCurrentPatient({ id: ids.dmeId, patientId: ids.patientId, gender: 'M', maritalStatus: 'CELIBATAIRE', vitals: { bpSys: 120, bpDia: 80, heartRate: 75, respRate: 18, pulse: 75, spo2: 98, temp: 37, height: 170, weight: 70, bmi: 24.2, waistCirc: 85 } }); 
                            setIsEditingPatientProfile(false);
                            setStep('register'); 
                          }} 
                          className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs flex items-center gap-2 shadow-sm transition-all cursor-pointer"
                        >
                          <UserPlus size={15} />
                          <span>Nouveau Dossier DME</span>
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="relative mb-4">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input 
                      type="text" 
                      value={searchQuery} 
                      onChange={(e) => setSearchQuery(e.target.value)} 
                      placeholder="Rechercher par Nom, Prénom, Téléphone ou N° DME..." 
                      className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 focus:bg-white transition-all text-sm font-semibold" 
                    />
                  </div>

                  {searchQuery.length > 0 ? (
                    <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50 divide-y divide-slate-200/70 max-h-[380px] overflow-y-auto custom-scrollbar">
                      {filteredPatients.length > 0 ? filteredPatients.map((p, idx) => {
                        const today = new Date().toISOString().split('T')[0];
                        const patientAppointment = appointments.find(a => 
                          (a.patientId === p.id || a.patientId === p.patientId) && 
                          a.date === today && 
                          (a.status === 'PENDING' || a.status === 'IN_PROGRESS')
                        );

                        return (
                          <div key={`${p.id || idx}-${idx}`} className="w-full px-4 py-3 flex items-center justify-between hover:bg-blue-50/60 transition-colors group">
                            <button onClick={() => handleSelectPatient(p)} className="flex items-center gap-3 text-left flex-1 min-w-0 cursor-pointer">
                              <div className="w-9 h-9 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-500 group-hover:text-blue-600 shadow-2xs relative shrink-0">
                                <UserIcon size={16} />
                                {patientAppointment && (
                                  <div className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-500 rounded-full border-2 border-white animate-pulse" title="Rendez-vous aujourd'hui"></div>
                                )}
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <p className="font-bold text-sm text-slate-900 truncate">{p.lastName} {p.firstName}</p>
                                  {patientAppointment && (
                                    <span className="bg-emerald-50 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded-md border border-emerald-200">RDV Confirmé</span>
                                  )}
                                </div>
                                <p className="text-xs text-slate-500 font-medium font-mono truncate">{p.id} • {calculateAge(p.birthDate)} ans {p.phone ? `• ${p.phone}` : ''}</p>
                              </div>
                            </button>
                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedPatientForHistory(p);
                                  setActiveTab('historique');
                                }}
                                className="px-2.5 py-1.5 bg-white hover:bg-blue-50 border border-slate-200 text-slate-700 hover:text-blue-600 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer"
                                title="Consulter l'historique complet de ce patient"
                              >
                                <History size={13} />
                                <span className="hidden sm:inline">Historique</span>
                              </button>
                              {permissions.canWrite && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setCurrentPatient({
                                      ...p,
                                      vitals: p.vitals || { bpSys: 120, bpDia: 80, heartRate: 75, respRate: 18, pulse: 75, spo2: 98, temp: 37, height: 170, weight: 70, bmi: 24.2, waistCirc: 85 }
                                    });
                                    setIsEditingPatientProfile(true);
                                    setStep('register');
                                  }}
                                  className="px-2.5 py-1.5 bg-white hover:bg-amber-50 border border-slate-200 text-slate-700 hover:text-amber-700 hover:border-amber-300 rounded-lg text-xs font-semibold transition-all flex items-center gap-1 cursor-pointer"
                                  title="Modifier le profil complet du patient"
                                >
                                  <Edit3 size={13} />
                                  <span className="hidden sm:inline">Éditer</span>
                                </button>
                              )}
                              {!permissions.canWrite ? (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedPatientForHistory(p);
                                    setActiveTab('historique');
                                  }}
                                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                                  title="Consulter le dossier de ce patient"
                                >
                                  <span>Consulter</span>
                                  <ChevronRight size={14} />
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleSelectPatient(p)}
                                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                                  title="Orienter ce patient"
                                >
                                  <span>Orienter</span>
                                  <ChevronRight size={14} />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      }) : (
                        <div className="p-6 text-center">
                          <p className="text-slate-400 font-semibold text-xs">Aucun dossier trouvé pour « {searchQuery} »</p>
                        </div>
                      )}
                    </div>
                  ) : !permissions.canWrite ? (
                    <div className="w-full py-4 px-4 border border-dashed border-slate-200 bg-slate-50/50 rounded-xl flex items-center justify-center gap-2 text-slate-400 text-xs font-medium">
                      <Lock size={15} />
                      <span>Mode Consultation : Création de nouveau dossier réservée au personnel d'accueil avec droits d'écriture.</span>
                    </div>
                  ) : (
                    <button 
                      onClick={async () => { 
                        const ids = await getNextSequentialIdsAndAssign(); 
                        setCurrentPatient({ id: ids.dmeId, patientId: ids.patientId, gender: 'M', maritalStatus: 'CELIBATAIRE', vitals: { bpSys: 120, bpDia: 80, heartRate: 75, respRate: 18, pulse: 75, spo2: 98, temp: 37, height: 170, weight: 70, bmi: 24.2, waistCirc: 85 } }); 
                        setIsEditingPatientProfile(false);
                        setStep('register'); 
                      }} 
                      className="w-full py-5 px-4 border border-dashed border-slate-300 rounded-xl hover:border-blue-500 hover:bg-blue-50/30 transition-all flex items-center justify-center gap-3 text-slate-600 hover:text-blue-600 group cursor-pointer"
                    >
                      <UserPlus size={20} className="text-slate-400 group-hover:text-blue-500" />
                      <span className="text-xs sm:text-sm font-bold">Patient non répertorié ? Cliquez ici pour créer un nouveau Dossier DME</span>
                    </button>
                  )}
                </div>
              </div>
            )}

            {step === 'register' && (
              <div className="bg-white p-5 sm:p-6 rounded-2xl shadow-xs border border-slate-200 animate-in slide-in-from-right-4">
                {renderStepper(1)}
                
                <div className="flex justify-between items-center mb-4 pb-3 border-b border-slate-100">
                  <div>
                    <h2 className="text-base sm:text-lg font-extrabold text-slate-900 tracking-tight">
                      {isEditingPatientProfile ? `Modifier Profil Patient (${currentPatient.id})` : 'Nouveau Dossier DME'}
                    </h2>
                    <p className="text-xs text-slate-500 font-medium mt-0.5">
                      {isEditingPatientProfile
                        ? 'Mise à jour complète des informations administratives et médicales du patient'
                        : 'Étape 1 : Saisie des informations d\'état-civil du patient'}
                    </p>
                  </div>
                  <button 
                    onClick={() => { setIsEditingPatientProfile(false); setStep('search'); }} 
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200/70 rounded-lg font-bold text-xs transition-all cursor-pointer"
                  >
                    ← Retour
                  </button>
                </div>

                {/* Quick Lambda Shortcut Banner */}
                <div className="mb-4 p-3 bg-amber-50/90 border border-amber-300 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
                  <div className="flex items-center gap-2 text-amber-950 text-xs font-bold">
                    <Sparkles size={16} className="text-amber-600 shrink-0" />
                    <span>Patient sans identité complète ou soin infirmier express ?</span>
                  </div>
                  <button 
                    type="button" 
                    onClick={handleQuickLambdaAdmission}
                    className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer shrink-0"
                  >
                    ⚡ Basculer en Patient Lambda (Anonyme)
                  </button>
                </div>

                {!permissions.canWrite && (
                  <div className="mb-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center gap-2 text-amber-700 text-xs font-bold">
                    <Lock size={16} className="text-amber-600 shrink-0" />
                    <span>Création de dossier verrouillée : votre rôle dispose d'un accès en lecture seule pour l'accueil.</span>
                  </div>
                )}

                {/* Live Anti-Doublon Banner */}
                {liveDuplicate.isDuplicate && liveDuplicate.matchedPatient && (
                  <div className="mb-4 p-3.5 bg-amber-50 border border-amber-400 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-in fade-in">
                    <div className="flex items-start gap-2.5">
                      <div className="p-2 bg-amber-500 text-white rounded-lg shrink-0 mt-0.5">
                        <ShieldAlert size={16} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-800 bg-amber-200/70 px-2 py-0.5 rounded-md">
                            Anti-Doublon Détecté
                          </span>
                          <span className="text-xs font-bold text-amber-700 font-mono">
                            DME #{liveDuplicate.matchedPatient.id || liveDuplicate.matchedPatient.patientId}
                          </span>
                        </div>
                        <p className="text-xs font-semibold text-amber-950 mt-0.5">
                          {liveDuplicate.reason}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleSelectPatient(liveDuplicate.matchedPatient!)}
                      className="w-full sm:w-auto px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold text-xs transition-all shrink-0 shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <UserCheck size={14} />
                      Utiliser ce Profil
                    </button>
                  </div>
                )}
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
                  {/* Left Column */}
                  <div className="space-y-3.5">
                    <div>
                      <label className="block text-xs font-bold text-slate-600 mb-1">Nom de Famille *</label>
                      <input 
                        type="text" 
                        required
                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 focus:bg-white transition-all text-sm font-semibold" 
                        placeholder="Ex: DIOP" 
                        value={currentPatient.lastName || ''} 
                        onChange={e => setCurrentPatient({...currentPatient, lastName: e.target.value})} 
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-600 mb-1">Prénom(s) *</label>
                      <input 
                        type="text" 
                        required
                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 focus:bg-white transition-all text-sm font-semibold" 
                        placeholder="Ex: Amadou" 
                        value={currentPatient.firstName || ''} 
                        onChange={e => setCurrentPatient({...currentPatient, firstName: e.target.value})} 
                      />
                    </div>

                    <div className="flex gap-3">
                       <div className="flex-1">
                          <label className="text-xs font-bold text-slate-600 mb-1 block">Date de Naissance *</label>
                          <input 
                            type="date" 
                            required
                            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 focus:bg-white transition-all text-sm font-semibold" 
                            value={currentPatient.birthDate || ''} 
                            onChange={e => setCurrentPatient({...currentPatient, birthDate: e.target.value})} 
                          />
                       </div>
                       <div className="w-32">
                          <label className="text-xs font-bold text-slate-600 mb-1 block">Sexe</label>
                          <select 
                            className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 focus:bg-white transition-all text-sm font-semibold" 
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
                  <div className="space-y-3.5">
                    <div>
                      <label className="block text-xs font-bold text-slate-600 mb-1">Téléphone de contact</label>
                      <input 
                        type="tel" 
                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 focus:bg-white transition-all text-sm font-semibold" 
                        placeholder="Ex: +221 77 123 45 67" 
                        value={currentPatient.phone || ''} 
                        onChange={e => setCurrentPatient({...currentPatient, phone: e.target.value})} 
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-600 mb-1">Adresse de Résidence</label>
                      <input 
                        type="text" 
                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 focus:bg-white transition-all text-sm font-semibold" 
                        placeholder="Ex: Dakar Plateau" 
                        value={currentPatient.residence || ''} 
                        onChange={e => setCurrentPatient({...currentPatient, residence: e.target.value})} 
                      />
                    </div>

                    <div className="px-3.5 py-2.5 bg-blue-50/80 border border-blue-200/80 rounded-xl flex items-center justify-between">
                       <div className="flex items-center gap-2">
                         <Info size={15} className="text-blue-600 shrink-0" />
                         <span className="text-xs font-bold text-blue-800">Âge calculé : {calculateAge(currentPatient.birthDate)} ans</span>
                       </div>
                       <span className="text-xs font-mono font-bold text-blue-600">{currentPatient.id}</span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap justify-end gap-2.5">
                  {isEditingPatientProfile ? (
                    <>
                      <button
                        type="button"
                        disabled={!permissions.canWrite || isSavingProfile || !currentPatient.lastName?.trim() || !currentPatient.firstName?.trim()}
                        onClick={() => handleSavePatientProfile(false)}
                        className="w-full sm:w-auto px-5 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl font-bold text-xs sm:text-sm shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
                      >
                        {isSavingProfile ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={16} />}
                        <span>Enregistrer les Modifications</span>
                      </button>
                      <button
                        type="button"
                        disabled={!permissions.canWrite || isSavingProfile || !currentPatient.lastName?.trim() || !currentPatient.firstName?.trim()}
                        onClick={() => handleSavePatientProfile(true)}
                        className="w-full sm:w-auto px-5 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl font-bold text-xs sm:text-sm shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <span>Enregistrer & Orienter</span>
                        <ChevronRight size={16} />
                      </button>
                    </>
                  ) : (
                    <button 
                      disabled={!permissions.canWrite || !currentPatient.lastName?.trim() || !currentPatient.firstName?.trim() || !currentPatient.birthDate}
                      onClick={() => {
                        if (!permissions.canWrite) return;
                        const dupCheck = checkDuplicatePatient(currentPatient);
                        if (dupCheck.isDuplicate && dupCheck.matchedPatient) {
                          setDuplicateModalData(dupCheck);
                          return;
                        }
                        setStep('triage');
                      }} 
                      className="w-full sm:w-auto px-6 py-3 bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-bold text-xs sm:text-sm shadow-md hover:bg-blue-700 transition-all flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <span>Continuer vers l'Orientation</span>
                      <ChevronRight size={16} />
                    </button>
                  )}
                </div>
              </div>
            )}

            {step === 'triage' && (
              <div className="space-y-4 animate-in slide-in-from-right-4 duration-300">
                <div className="bg-white p-5 sm:p-6 rounded-2xl shadow-xs border border-slate-200">
                  {renderStepper(2)}
                  
                  {/* Compact Patient & Step Header */}
                  <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-2.5">
                      <button 
                        onClick={() => setStep('register')} 
                        className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-bold text-xs flex items-center gap-1 transition-all cursor-pointer"
                      >
                        ← Dossier
                      </button>
                      <div>
                        <h2 className="text-base sm:text-lg font-extrabold text-slate-900 flex items-center gap-2">
                          <span>Orientation & Actes Médicaux</span>
                        </h2>
                        <p className="text-xs text-slate-500 font-medium">Sélectionnez le service ou l'acte médical pour orienter le patient</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 bg-slate-50 border border-slate-200/80 px-3.5 py-2 rounded-xl">
                      <div>
                        <p className="font-extrabold text-slate-900 text-xs sm:text-sm leading-tight">{currentPatient.lastName} {currentPatient.firstName}</p>
                        <p className="text-[11px] text-slate-500 font-medium">{calculateAge(currentPatient.birthDate)} ans • {currentPatient.gender === 'F' ? 'Féminin' : 'Masculin'} • <span className="font-mono">{currentPatient.id}</span></p>
                      </div>
                      {permissions.canWrite && (
                        <button
                          type="button"
                          onClick={() => {
                            setIsEditingPatientProfile(true);
                            setStep('register');
                          }}
                          className="p-1.5 bg-white hover:bg-amber-50 border border-slate-200 text-slate-500 hover:text-amber-700 rounded-lg transition-all cursor-pointer"
                          title="Modifier le profil du patient"
                        >
                          <Edit3 size={14} />
                        </button>
                      )}
                      <button 
                        onClick={() => {
                          if (confirm("Êtes-vous sûr de vouloir annuler l'admission en cours ?")) {
                            setStep('search');
                          }
                        }} 
                        className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200/60 rounded-lg font-bold text-xs transition-all cursor-pointer"
                      >
                        Annuler
                      </button>
                    </div>
                  </div>

                  {/* Search bar & Category Tabs inline */}
                  <div className="flex flex-col sm:flex-row gap-3 mb-4">
                    <div className="relative flex-1">
                      <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                      <input
                        type="text"
                        value={motifSearchQuery}
                        onChange={(e) => setMotifSearchQuery(e.target.value)}
                        placeholder="Filtrer un acte par nom, code ou spécialité..."
                        className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-slate-800 placeholder:text-slate-400"
                      />
                      {motifSearchQuery && (
                        <button
                          onClick={() => setMotifSearchQuery('')}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                        >
                          <X size={13} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Compact Category Pills */}
                  <div className="flex flex-wrap gap-1.5 mb-4">
                    {(['CONSULTATIONS', 'SOINS', 'MATERNITE', 'URGENCES', 'HOSPITALISATION', 'AUTRES'] as const).map((catName) => {
                      const isActive = currentMotifCategory === catName;
                      const catAttrs = {
                        CONSULTATIONS: { label: 'Consultations', icon: Stethoscope },
                        SOINS: { label: 'Soins Infirmiers', icon: Syringe },
                        MATERNITE: { label: 'Maternité', icon: Award },
                        URGENCES: { label: 'Urgences', icon: ShieldAlert },
                        HOSPITALISATION: { label: 'Hospitalisation', icon: Bed },
                        AUTRES: { label: 'Labo & Autres', icon: Activity }
                      }[catName];

                      const CatIcon = catAttrs.icon;
                      const countInCat = activeMotifs.filter(m => m.category === catName).length;
                      
                      return (
                        <button
                          key={catName}
                          onClick={() => {
                            setCurrentMotifCategory(catName);
                            setSelectedMotif(null);
                            setVisitMotif(null);
                            setSoinsPrescriberName('');
                            setSoinsPrescriberLicense('');
                          }}
                          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border font-bold text-xs transition-all cursor-pointer ${
                            isActive 
                              ? 'bg-blue-600 text-white border-blue-500 shadow-xs' 
                              : 'bg-slate-50 text-slate-600 border-slate-200/80 hover:bg-slate-100'
                          }`}
                        >
                          <CatIcon size={14} className={isActive ? 'text-white' : 'text-slate-400'} />
                          <span>{catAttrs.label}</span>
                          <span className={`text-[10px] font-extrabold px-1.5 py-0.2 rounded-md ${isActive ? 'bg-white/20 text-white' : 'bg-slate-200/80 text-slate-600'}`}>
                            {countInCat}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {/* List Motifs for Active Category */}
                  <div>
                    {currentMotifCategory === 'SOINS' && !motifSearchQuery.trim() ? (
                      <div className="space-y-3">
                        <div className="relative">
                          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-indigo-500" size={16} />
                          <input
                            type="text"
                            value={soinsSearchQuery}
                            onChange={(e) => setSoinsSearchQuery(e.target.value)}
                            placeholder="Rechercher un soin infirmier (ex: Pansement, Injection IV, Perfusion, Suture...)"
                            className="w-full pl-10 pr-4 py-2.5 bg-indigo-50/40 border border-indigo-200 rounded-xl outline-none focus:border-indigo-500 focus:bg-white text-xs sm:text-sm font-semibold text-slate-800"
                          />
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-100 max-h-[280px] overflow-y-auto custom-scrollbar shadow-2xs">
                          {activeMotifs
                            .filter(m => m.category === 'SOINS')
                            .filter(m => {
                              if (!soinsSearchQuery.trim()) return true;
                              const q = soinsSearchQuery.toLowerCase().trim();
                              return (
                                (m.label || '').toLowerCase().includes(q) ||
                                (m.codeInterne || '').toLowerCase().includes(q) ||
                                (m.speciality || '').toLowerCase().includes(q)
                              );
                            })
                            .map((motif) => {
                              const isSelected = selectedMotif?.id === motif.id;
                              return (
                                <button
                                  key={motif.id}
                                  type="button"
                                  onClick={() => {
                                    setSelectedMotif(motif);
                                    setVisitMotif('SOIN_INFIRMIER');
                                    setSoinsPrescriberName('');
                                    setSoinsPrescriberLicense('');
                                  }}
                                  className={`w-full px-4 py-3 flex items-center justify-between gap-3 text-left transition-all cursor-pointer ${
                                    isSelected ? 'bg-indigo-50/90 border-l-4 border-l-indigo-600' : 'hover:bg-slate-50'
                                  }`}
                                >
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="font-bold text-xs sm:text-sm text-slate-900">{motif.label}</span>
                                      {motif.codeInterne && (
                                        <span className="text-[10px] font-mono text-slate-400">{motif.codeInterne}</span>
                                      )}
                                      {motif.requiresPrescription && (
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 border border-rose-200 text-[10px] font-black uppercase">
                                          <Lock size={10} /> Soumis à ordonnance
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-[11px] text-slate-500 mt-0.5">{motif.queueName}</p>
                                  </div>
                                  <span className="font-black text-xs text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-200/80 shrink-0 tabular-nums">
                                    {(motif.fee || 0).toLocaleString()} FCFA
                                  </span>
                                </button>
                              );
                            })}
                          {activeMotifs.filter(m => m.category === 'SOINS' && (!soinsSearchQuery.trim() || (m.label || '').toLowerCase().includes(soinsSearchQuery.toLowerCase().trim()))).length === 0 && (
                            <div className="p-6 text-center text-xs font-semibold text-slate-400">
                              Aucun soin infirmier trouvé pour « {soinsSearchQuery} ».
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[340px] overflow-y-auto pr-1 custom-scrollbar">
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
                              className={`p-3.5 rounded-xl border text-left transition-all relative flex flex-col justify-between group cursor-pointer ${
                                isSelected 
                                  ? 'border-blue-600 bg-blue-50/60 ring-2 ring-blue-500/20 shadow-sm' 
                                  : 'border-slate-200/80 bg-slate-50/70 hover:border-blue-300 hover:bg-white'
                              }`}
                            >
                              <div>
                                <div className="flex items-center justify-between gap-1.5 mb-1.5">
                                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md bg-white border truncate ${
                                    isSelected ? 'border-blue-300 text-blue-700' : 'border-slate-200 text-slate-500'
                                  }`}>
                                    {motif.speciality}
                                  </span>
                                  {motif.codeInterne && (
                                    <span className="text-[10px] font-mono font-bold text-slate-400 shrink-0">
                                      {motif.codeInterne}
                                    </span>
                                  )}
                                </div>
                                <h4 className="font-bold text-slate-900 text-xs sm:text-sm leading-snug line-clamp-2">{motif.label}</h4>
                              </div>

                              <div className="mt-3 border-t border-slate-200/70 pt-2 flex items-center justify-between gap-2">
                                <span className="font-medium text-slate-500 text-[11px] truncate">{motif.queueName}</span>
                                <span className="font-extrabold text-xs sm:text-sm text-blue-600 shrink-0 tabular-nums">{(motif.fee || 0).toLocaleString()} F</span>
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
                        <div className="col-span-full py-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200">
                          <p className="text-slate-600 text-xs font-bold">Aucun service ou prestation disponible</p>
                        </div>
                      )}
                    </div>
                    )}
                  </div>

                  {/* Sticky Action Bar inside card when motif is selected */}
                  {selectedMotif && (() => {
                    const requiresRx = Boolean(selectedMotif.requiresPrescription);
                    const hasValidPrescriber = !requiresRx || soinsPrescriberName.trim().length > 0 || soinsPrescriberLicense.trim().length > 0;
                    return (
                    <div className="mt-4 pt-4 border-t border-slate-200 space-y-3 bg-blue-50/50 p-3.5 rounded-xl border border-blue-200/80 animate-in fade-in">
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 bg-blue-600 text-white rounded-xl flex items-center justify-center shrink-0">
                            <Activity size={18} />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="font-extrabold text-sm text-slate-900 truncate">{selectedMotif.label}</h4>
                              <span className="text-xs font-black text-blue-600 bg-white px-2 py-0.5 rounded-md border border-blue-200 tabular-nums">
                                {(selectedMotif.fee || 0).toLocaleString()} FCFA
                              </span>
                              {requiresRx && (
                                <span className="text-[10px] font-black text-rose-700 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200 flex items-center gap-1">
                                  <Lock size={10} /> Soumis à ordonnance
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-500 font-medium truncate">
                              File : <strong className="text-slate-700">{selectedMotif.queueName}</strong> • Spécialité : <strong className="text-slate-700">{selectedMotif.speciality}</strong>
                            </p>
                          </div>
                        </div>

                        {!permissions.canWrite ? (
                          <div className="w-full sm:w-auto bg-slate-100 text-slate-500 border border-slate-200 px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shrink-0">
                            <Lock size={15} />
                            <span>Lecture Seule (Validation Désactivée)</span>
                          </div>
                        ) : (
                          <button 
                            disabled={isSaving || !hasValidPrescriber}
                            onClick={() => {
                              finalizeAdmission(false);
                            }}
                            className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition-all flex items-center justify-center gap-2 shadow-md disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shrink-0"
                          >
                            {isSaving ? (
                              <>
                                <Loader2 size={15} className="animate-spin" />
                                <span>Validation...</span>
                              </>
                            ) : (
                              <>
                                <CheckCircle2 size={16} /> 
                                <span>{!hasValidPrescriber ? 'Prescripteur Requis' : 'Valider Admission & Pro-forma'}</span>
                              </>
                            )}
                          </button>
                        )}
                      </div>

                      {requiresRx && (
                        <div className="p-3 bg-rose-50/90 border border-rose-200 rounded-xl space-y-2">
                          <p className="text-[11px] font-black text-rose-800 uppercase tracking-wider flex items-center gap-1.5">
                            <ShieldAlert size={13} className="text-rose-600" />
                            Acte soumis à ordonnance médicale — Identification du prescripteur externe obligatoire
                          </p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            <input
                              type="text"
                              value={soinsPrescriberName}
                              onChange={(e) => setSoinsPrescriberName(e.target.value)}
                              placeholder="Nom du Prescripteur (ex: Dr. Mbarga) *"
                              className="w-full px-3 py-2 bg-white border border-rose-200 rounded-lg text-xs font-bold text-slate-800 outline-none focus:border-rose-500"
                            />
                            <input
                              type="text"
                              value={soinsPrescriberLicense}
                              onChange={(e) => setSoinsPrescriberLicense(e.target.value)}
                              placeholder="OU Numéro d'Ordre (ex: ONMC-4521) *"
                              className="w-full px-3 py-2 bg-white border border-rose-200 rounded-lg text-xs font-bold text-slate-800 outline-none focus:border-rose-500"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                    );
                  })()}
                </div>
              </div>
            )}

            {step === 'summary' && (
              <div className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 text-center animate-in zoom-in-95 duration-300 shadow-sm">
                {renderStepper(3)}
                <div className="w-14 h-14 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-emerald-200 shadow-xs">
                  <CheckCircle2 size={28} />
                </div>
                <h2 className="text-lg sm:text-xl font-extrabold mb-1.5 tracking-tight text-slate-900">Orientation & Pro-forma Émise</h2>
                <p className="text-slate-500 text-xs sm:text-sm font-medium mb-6 max-w-md mx-auto">
                  La Fiche d'Orientation a été générée. Le patient peut maintenant régler à la <strong>Caisse centrale</strong> puis se présenter aux <strong>Soins Infirmiers (Triage)</strong> pour la prise des constantes avant sa consultation.
                </p>
                <div className="flex flex-col sm:flex-row gap-3 justify-center max-w-md mx-auto">
                   <button onClick={() => setShowProforma(true)} className="flex-1 bg-slate-900 text-white py-3 px-4 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-sm hover:bg-slate-800 transition-all cursor-pointer"><Printer size={16} /> Imprimer Pro-forma</button>
                   <button onClick={() => { setStep('search'); setAmountReceived(''); setNotebookAdded(false); setVisitMotif(null); }} className="flex-1 bg-blue-600 text-white py-3 px-4 rounded-xl font-bold text-xs sm:text-sm hover:bg-blue-700 shadow-sm transition-all cursor-pointer">Nouveau Patient</button>
                </div>
              </div>
            )}
          </div>
          
          {/* Compact Right Column: Salle d'Attente */}
          <div className="lg:col-span-4">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden text-slate-900">
              <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/70 flex justify-between items-center">
                <h3 className="font-extrabold text-xs uppercase tracking-wider flex items-center gap-2 text-slate-800">
                  <Activity size={15} className="text-blue-600" /> Salle d'Attente
                </h3>
                <span className="bg-blue-100 text-blue-700 px-2.5 py-0.5 rounded-full text-xs font-extrabold">{waitingCount}</span>
              </div>
              <div className="divide-y divide-slate-100 max-h-[540px] overflow-y-auto custom-scrollbar">
                {activeWaitingList.length === 0 ? (
                  <div className="p-8 text-center">
                    <Users size={28} className="mx-auto text-slate-300 mb-2" />
                    <p className="text-slate-400 text-xs font-semibold">Aucun patient en attente</p>
                  </div>
                ) : (
                  activeWaitingList.map((p, i) => {
                    const linkedReq = paymentRequests.find(pr =>
                      (p.paymentRequestId && pr.id === p.paymentRequestId) ||
                      ((pr.patientId === p.patientId || (pr as any).patientDme === p.dmeId) &&
                        ['PENDING', 'PARTIAL'].includes(String(pr.status || '').toUpperCase()))
                    );
                    const hasUnpaidBill = linkedReq
                      ? ['PENDING', 'PARTIAL'].includes(String(linkedReq.status || '').toUpperCase())
                      : !(p.paymentStatus === 'PAID' || p.status === 'SOLDE');
                    const destinationLabel = p.service || p.queueName || 'Consultation';
                    const attenteLabel = hasUnpaidBill
                      ? 'En attente : Caisse'
                      : `En attente : ${destinationLabel}`;

                    return (
                      <div key={p.id || `wait-${p.patientId || 'pt'}-${i}`} className="p-3.5 hover:bg-slate-50 transition-all relative overflow-hidden">
                        {(p.status === 'waiting' || p.status === 'waiting_triage') && (
                          <div className={`absolute top-0 left-0 w-1 h-full ${!hasUnpaidBill ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                        )}
                        <div className="flex justify-between items-start gap-2 mb-1.5 pl-1.5">
                           <div className="min-w-0">
                             <p className="font-bold text-xs sm:text-sm text-slate-900 truncate">{p.lastName} {p.firstName}</p>
                             <p className="text-[11px] text-slate-500 font-medium font-mono truncate">{p.patientId} • {p.queueName || p.service}</p>
                           </div>
                           <div className="flex items-center gap-1.5 shrink-0">
                             {p.priority === 'critique' && <span className="bg-rose-100 text-rose-600 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase">Critique</span>}
                             <span className="text-[11px] text-slate-400 font-semibold tabular-nums">{p.time}</span>
                           </div>
                        </div>
                        <div className="flex justify-between items-center pl-1.5 mt-2">
                           <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${
                             !hasUnpaidBill
                               ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                               : 'bg-rose-50 text-rose-700 border-rose-200'
                           }`}>
                             {attenteLabel}
                           </span>
                           <span className="text-[11px] text-slate-400 font-medium">{p.priority === 'urgent' ? 'Urgent' : 'Normal'}</span>
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
        <div className="animate-in fade-in duration-300 space-y-4">
          <div className={`p-5 sm:p-6 rounded-3xl shadow-sm border transition-all ${
            theme === 'dark' ? 'bg-[#111827] border-slate-800' : 'bg-white border-slate-200'
          }`}>
            {/* 1. Header Banner */}
            <div className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-slate-100 dark:border-slate-800/80">
              <div className="flex items-center gap-3.5">
                <div className="w-11 h-11 bg-gradient-to-tr from-emerald-600 to-teal-500 text-white rounded-2xl shadow-sm shadow-emerald-500/20 flex items-center justify-center shrink-0">
                  <LogOut size={20} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className={`text-lg sm:text-xl font-black tracking-tight ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>
                      Sorties Administratives & Quittances
                    </h2>
                    <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200/80 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                      Temps Réel
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">
                    Contrôle triple validation : Autorisation médicale, Clôture séjour/hospitalisation et Solde de caisse.
                  </p>
                </div>
              </div>

              {/* Counter Badges Strip */}
              <div className="flex items-center gap-2 flex-wrap">
                <div className={`px-3 py-1.5 rounded-xl text-xs font-black flex items-center gap-2 border ${
                  theme === 'dark' ? 'bg-slate-800/80 border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-200 text-slate-700'
                }`}>
                  <span className="text-[10px] uppercase tracking-wider text-slate-400">Total</span>
                  <span className="font-mono text-xs">{sortieStats.total}</span>
                </div>

                <div className="px-3 py-1.5 rounded-xl text-xs font-black flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-800 dark:bg-emerald-950/40 dark:border-emerald-800/60 dark:text-emerald-300">
                  <CheckCircle2 size={13} className="text-emerald-600 dark:text-emerald-400" />
                  <span className="text-[10px] uppercase tracking-wider">Prêts</span>
                  <span className="font-mono">{sortieStats.ready}</span>
                </div>

                {sortieStats.pendingCaisse > 0 && (
                  <div className="px-3 py-1.5 rounded-xl text-xs font-black flex items-center gap-2 bg-rose-50 border border-rose-200 text-rose-800 dark:bg-rose-950/40 dark:border-rose-800/60 dark:text-rose-300">
                    <CreditCard size={13} className="text-rose-600 dark:text-rose-400" />
                    <span className="text-[10px] uppercase tracking-wider">Attente Caisse</span>
                    <span className="font-mono">{sortieStats.pendingCaisse}</span>
                  </div>
                )}
              </div>
            </div>

            {/* 2. Search, Status Filters & Department Filter Bar */}
            <div className="pt-4 pb-2 space-y-3">
              <div className="flex flex-col md:flex-row gap-2.5 items-stretch md:items-center justify-between">
                {/* Search Bar */}
                <div className="relative flex-1">
                  <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  <input
                    type="text"
                    value={sortieSearchTerm}
                    onChange={(e) => setSortieSearchTerm(e.target.value)}
                    placeholder="Rechercher par nom de patient, identifiant (PAT/DME), service, médecin..."
                    className={`w-full pl-10 pr-9 py-2.5 text-xs font-medium rounded-xl border outline-none transition-all ${
                      theme === 'dark'
                        ? 'bg-slate-800/80 border-slate-700 text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:bg-slate-800'
                        : 'bg-slate-50 border-slate-200 text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white'
                    }`}
                  />
                  {sortieSearchTerm && (
                    <button
                      onClick={() => setSortieSearchTerm('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded-md cursor-pointer"
                      title="Effacer la recherche"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>

                {/* Department Filter & Sorting Tag */}
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <select
                      value={sortieDepartmentFilter}
                      onChange={(e) => setSortieDepartmentFilter(e.target.value)}
                      className={`text-xs font-bold py-2.5 pl-8 pr-7 rounded-xl border outline-none transition-all appearance-none cursor-pointer ${
                        theme === 'dark'
                          ? 'bg-slate-800 border-slate-700 text-slate-200 focus:border-blue-500'
                          : 'bg-white border-slate-200 text-slate-700 focus:border-blue-500 shadow-2xs'
                      }`}
                    >
                      <option value="ALL">Tous les services ({availableSortieDepartments.length})</option>
                      {availableSortieDepartments.map(dep => (
                        <option key={dep} value={dep}>{dep}</option>
                      ))}
                    </select>
                    <Filter size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    <ChevronRight size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 rotate-90 pointer-events-none" />
                  </div>

                  <div className={`hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold border ${
                    theme === 'dark' ? 'bg-slate-800/50 border-slate-700/60 text-slate-400' : 'bg-slate-50 border-slate-200/80 text-slate-500'
                  }`}>
                    <ArrowUpDown size={12} className="text-blue-500" />
                    <span>Récents d'abord</span>
                  </div>
                </div>
              </div>

              {/* Status Quick Filter Chips */}
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                {[
                  { id: 'ALL', label: `Tous (${sortieStats.total})` },
                  { id: 'READY', label: `✓ Prêts pour Sortie (${sortieStats.ready})`, color: 'emerald' },
                  { id: 'PENDING_CAISSE', label: `💳 Attente Caisse (${sortieStats.pendingCaisse})`, color: 'rose' },
                  { id: 'PENDING_MEDICAL', label: `🩺 Attente Médicale (${sortieStats.pendingMedical})`, color: 'amber' }
                ].map(chip => {
                  const isActive = sortieStatusFilter === chip.id;
                  return (
                    <button
                      key={chip.id}
                      onClick={() => setSortieStatusFilter(chip.id as any)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer border ${
                        isActive
                          ? chip.color === 'emerald'
                            ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                            : chip.color === 'rose'
                            ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                            : chip.color === 'amber'
                            ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                            : 'bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900 dark:border-white shadow-xs'
                          : theme === 'dark'
                          ? 'bg-slate-800/80 border-slate-700/80 text-slate-300 hover:bg-slate-800'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {chip.label}
                    </button>
                  );
                })}

                {(sortieSearchTerm || sortieStatusFilter !== 'ALL' || sortieDepartmentFilter !== 'ALL') && (
                  <button
                    onClick={() => {
                      setSortieSearchTerm('');
                      setSortieStatusFilter('ALL');
                      setSortieDepartmentFilter('ALL');
                    }}
                    className="ml-auto text-xs font-bold text-blue-600 hover:text-blue-700 hover:underline flex items-center gap-1 cursor-pointer py-1"
                  >
                    <X size={12} />
                    <span>Réinitialiser les filtres</span>
                  </button>
                )}
              </div>
            </div>

            {/* 3. Patients to Discharge Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 pt-3">
              {filteredAndSortedPatientsToDischarge.map((patient, pIdx) => {
                const isReady = Boolean(patient.medicalClearance && patient.hospitalizationClosed && patient.financialClearance);
                const isProcessing = isProcessingDischarge === patient.id;
                const patientName = patient.name || patient.patientName || 'Patient';
                const patientInitial = (patientName.trim()[0] || 'P').toUpperCase();
                const displayId = patient.patientId || patient.id;
                const timeStr = formatSortieTime(patient);
                const department = patient.department || patient.service || 'Consultation';
                const doctorName = patient.doctorName || patient.dischargedBy || patient.user || '';

                return (
                  <div 
                    key={patient.id || `disch-${pIdx}`} 
                    className={`rounded-2xl border p-4 sm:p-5 transition-all flex flex-col justify-between relative group hover:shadow-md ${
                      isReady 
                        ? theme === 'dark'
                          ? 'bg-slate-900/90 border-emerald-800/80 hover:border-emerald-500'
                          : 'bg-gradient-to-b from-emerald-50/50 via-white to-white border-emerald-200 hover:border-emerald-300 shadow-2xs'
                        : !patient.financialClearance
                        ? theme === 'dark'
                          ? 'bg-slate-900/90 border-slate-800 hover:border-rose-700/80'
                          : 'bg-white border-slate-200 hover:border-rose-300 shadow-2xs'
                        : theme === 'dark'
                        ? 'bg-slate-900/90 border-slate-800 hover:border-slate-700'
                        : 'bg-white border-slate-200 hover:border-slate-300 shadow-2xs'
                    }`}
                  >
                    <div>
                      {/* Top Row: Avatar + Name + Status Badge */}
                      <div className="flex items-start justify-between gap-2.5 mb-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm shrink-0 border ${
                            isReady
                              ? 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/80 dark:text-emerald-300 dark:border-emerald-800'
                              : !patient.financialClearance
                              ? 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950/80 dark:text-rose-300 dark:border-rose-800'
                              : 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-950/80 dark:text-blue-300 dark:border-blue-800'
                          }`}>
                            {patientInitial}
                          </div>
                          <div className="min-w-0">
                            <h3 className={`text-sm sm:text-base font-black truncate leading-tight ${
                              theme === 'dark' ? 'text-white' : 'text-slate-900'
                            }`} title={patientName}>
                              {patientName}
                            </h3>
                            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 mt-0.5">
                              <span className="font-mono text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700">
                                {displayId}
                              </span>
                              <span>•</span>
                              <span className="text-blue-600 dark:text-blue-400 font-bold truncate">{department}</span>
                            </div>
                          </div>
                        </div>

                        {/* Status Badge */}
                        {isReady ? (
                          <span className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-300/80 px-2.5 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 shrink-0 shadow-2xs">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                            Prêt
                          </span>
                        ) : !patient.financialClearance ? (
                          <span className="bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300 border border-rose-300/80 px-2.5 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center gap-1 shrink-0">
                            <CreditCard size={11} className="text-rose-600" /> Caisse
                          </span>
                        ) : (
                          <span className="bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 border border-amber-300/80 px-2.5 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center gap-1 shrink-0">
                            <Clock size={11} className="text-amber-600" /> Incomplet
                          </span>
                        )}
                      </div>

                      {/* Doctor & Date Row */}
                      <div className="flex flex-wrap items-center justify-between gap-1 text-[11px] text-slate-500 dark:text-slate-400 pb-2.5 mb-2.5 border-b border-slate-100 dark:border-slate-800">
                        <div className="flex items-center gap-1">
                          <Clock size={12} className="text-slate-400 shrink-0" />
                          <span className="font-medium">{timeStr}</span>
                        </div>
                        {doctorName && (
                          <div className="flex items-center gap-1 font-semibold text-slate-600 dark:text-slate-300 truncate max-w-[180px]">
                            <Stethoscope size={12} className="text-blue-500 shrink-0" />
                            <span className="truncate">{doctorName}</span>
                          </div>
                        )}
                      </div>

                      {/* 3-Column Criteria Strip */}
                      <div className="grid grid-cols-3 gap-2 mb-3">
                        {/* Médical */}
                        <div className={`p-2 rounded-xl border text-center transition-all ${
                          patient.medicalClearance 
                            ? 'bg-emerald-50/80 border-emerald-200 text-emerald-800 dark:bg-emerald-950/40 dark:border-emerald-800/60 dark:text-emerald-300' 
                            : 'bg-amber-50/70 border-amber-200 text-amber-800 dark:bg-amber-950/40 dark:border-amber-800/60 dark:text-amber-300'
                        }`}>
                          <div className="flex items-center justify-center gap-1 mb-0.5">
                            {patient.medicalClearance ? <CheckCircle2 size={12} /> : <Clock size={12} />}
                            <span className="text-[9.5px] font-black uppercase tracking-wider">Avis Méd.</span>
                          </div>
                          <p className="text-[10.5px] font-extrabold truncate">
                            {patient.medicalClearance ? "Accordé" : "En attente"}
                          </p>
                        </div>

                        {/* Séjour / Hospitalisation */}
                        <div className={`p-2 rounded-xl border text-center transition-all ${
                          patient.hospitalizationClosed 
                            ? 'bg-emerald-50/80 border-emerald-200 text-emerald-800 dark:bg-emerald-950/40 dark:border-emerald-800/60 dark:text-emerald-300' 
                            : 'bg-amber-50/70 border-amber-200 text-amber-800 dark:bg-amber-950/40 dark:border-amber-800/60 dark:text-amber-300'
                        }`}>
                          <div className="flex items-center justify-center gap-1 mb-0.5">
                            {patient.hospitalizationClosed ? <CheckCircle2 size={12} /> : <Activity size={12} />}
                            <span className="text-[9.5px] font-black uppercase tracking-wider">Séjour</span>
                          </div>
                          <p className="text-[10.5px] font-extrabold truncate">
                            {patient.hospitalizationClosed ? "Clôturé" : "Actif"}
                          </p>
                        </div>

                        {/* Caisse / Finance */}
                        <div className={`p-2 rounded-xl border text-center transition-all ${
                          patient.financialClearance 
                            ? 'bg-emerald-50/80 border-emerald-200 text-emerald-800 dark:bg-emerald-950/40 dark:border-emerald-800/60 dark:text-emerald-300' 
                            : 'bg-rose-50/80 border-rose-200 text-rose-800 dark:bg-rose-950/40 dark:border-rose-800/60 dark:text-rose-300'
                        }`}>
                          <div className="flex items-center justify-center gap-1 mb-0.5">
                            {patient.financialClearance ? <CheckCircle2 size={12} /> : <CreditCard size={12} />}
                            <span className="text-[9.5px] font-black uppercase tracking-wider">Caisse</span>
                          </div>
                          <p className="text-[10.5px] font-extrabold truncate">
                            {patient.financialClearance ? "Soldée" : "À régler"}
                          </p>
                        </div>
                      </div>

                      {/* Financial Caution Notice if Unpaid */}
                      {!patient.financialClearance && (
                        <div className="mb-3 p-2.5 bg-rose-50/80 border border-rose-200/90 dark:bg-rose-950/30 dark:border-rose-900 rounded-xl space-y-1.5 text-rose-700 dark:text-rose-300 text-[10.5px] leading-tight">
                          <div className="flex items-center justify-between gap-1.5 font-black">
                            <span className="flex items-center gap-1.5">
                              <AlertCircle size={13} className="text-rose-500 shrink-0" />
                              <span>BLOQUÉ : Impayés Caisse</span>
                            </span>
                            {(patient.totalUnpaidAmount || 0) > 0 && (
                              <span className="font-mono text-rose-800 dark:text-rose-200">
                                {(patient.totalUnpaidAmount || 0).toLocaleString()} FCFA
                              </span>
                            )}
                          </div>
                          {patient.unpaidItems && patient.unpaidItems.length > 0 ? (
                            <ul className="space-y-0.5 pl-4 list-disc text-[10px] font-semibold">
                              {patient.unpaidItems.map((item: any, idx: number) => (
                                <li key={item.id || idx} className="flex justify-between gap-2">
                                  <span className="truncate">{item.module} : {item.label}</span>
                                  <span className="font-mono shrink-0">{(item.amount || 0).toLocaleString()} F</span>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="font-medium">Paiement en attente à la Caisse avant autorisation finale.</p>
                          )}
                        </div>
                      )}

                      {/* Error notice if validation failed */}
                      {dischargeError && dischargeError.patientId === patient.id && (
                        <div className="mb-3 p-2.5 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2 animate-in fade-in">
                          <ShieldAlert className="text-rose-600 shrink-0 mt-0.5" size={14} />
                          <p className="text-[11px] font-semibold text-rose-700 leading-snug">{dischargeError.message}</p>
                        </div>
                      )}
                    </div>
                    
                    {/* Bottom Action Strip */}
                    <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center gap-2">
                      <button 
                        onClick={() => handleDischarge(patient.id)}
                        disabled={isProcessing || !permissions.canWrite}
                        title={!permissions.canWrite ? "Action verrouillée en lecture seule" : undefined}
                        className={`flex-1 py-2.5 px-3 rounded-xl font-black text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-xs ${
                          isReady && permissions.canWrite
                            ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/20 active:scale-[0.98]'
                            : 'bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-800 dark:hover:bg-slate-700'
                        } disabled:opacity-50 disabled:cursor-not-allowed`}
                      >
                        {isProcessing ? (
                          <><Loader2 size={14} className="animate-spin" /> Traitement...</>
                        ) : !permissions.canWrite ? (
                          <><Lock size={14} /> Lecture Seule</>
                        ) : (
                          <><CheckCircle size={14} /> Valider Sortie</>
                        )}
                      </button>

                      <button 
                        disabled={!isReady || isProcessing}
                        onClick={() => handleGeneratePDF('autorisation_sortie', patient)}
                        className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all shrink-0 ${
                          isReady && !isProcessing
                            ? "bg-white border border-slate-200 text-slate-700 hover:text-blue-600 hover:border-blue-300 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200 dark:hover:text-blue-400 cursor-pointer shadow-2xs"
                            : "bg-slate-100 border border-slate-200 text-slate-300 dark:bg-slate-800/40 dark:border-slate-800 dark:text-slate-600 cursor-not-allowed"
                        }`}
                        title="Imprimer le Bon d'Autorisation de Sortie"
                      >
                        <Printer size={16} />
                      </button>

                      <button
                        onClick={() => {
                          const matchedPatient = patients.find(p => p.id === patient.patientId || p.id === patient.id) || {
                            id: patient.patientId || patient.id,
                            lastName: patient.name || patient.patientName || 'Patient',
                            firstName: ''
                          } as Patient;
                          setSelectedPatientForHistory(matchedPatient);
                          setActiveTab('historique');
                        }}
                        className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all shrink-0 border cursor-pointer ${
                          theme === 'dark'
                            ? 'bg-slate-800 border-slate-700 text-slate-400 hover:text-blue-400 hover:border-slate-600'
                            : 'bg-white border-slate-200 text-slate-500 hover:text-blue-600 hover:border-blue-300 shadow-2xs'
                        }`}
                        title="Consulter l'historique complet de ce patient"
                      >
                        <History size={15} />
                      </button>
                    </div>
                  </div>
                );
              })}

              {/* Empty state: No patients at all */}
              {patientsToDischarge.length === 0 && (
                <div className="col-span-full py-16 text-center bg-slate-50/50 dark:bg-slate-900/40 rounded-3xl border border-dashed border-slate-200 dark:border-slate-800 flex flex-col items-center justify-center">
                  <div className="w-14 h-14 bg-white dark:bg-slate-800 rounded-2xl flex items-center justify-center mb-3 shadow-xs border border-slate-100 dark:border-slate-700">
                    <LogOut size={24} className="text-slate-400 dark:text-slate-500" />
                  </div>
                  <h3 className={`text-base font-black mb-1 ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>
                    Aucun patient en attente de sortie
                  </h3>
                  <p className="text-xs text-slate-500 font-medium max-w-sm">
                    Les patients libérés par les médecins ou sortis d'hospitalisation apparaîtront automatiquement ici pour validation administrative.
                  </p>
                </div>
              )}

              {/* Empty state: Filters returned 0 results */}
              {patientsToDischarge.length > 0 && filteredAndSortedPatientsToDischarge.length === 0 && (
                <div className="col-span-full py-14 text-center bg-slate-50/50 dark:bg-slate-900/40 rounded-3xl border border-dashed border-slate-200 dark:border-slate-800 flex flex-col items-center justify-center">
                  <div className="w-12 h-12 bg-white dark:bg-slate-800 rounded-2xl flex items-center justify-center mb-2 shadow-xs border border-slate-100 dark:border-slate-700">
                    <Search size={20} className="text-slate-400" />
                  </div>
                  <h3 className={`text-sm font-black mb-1 ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>
                    Aucun patient ne correspond aux filtres
                  </h3>
                  <p className="text-xs text-slate-500 font-medium mb-3">
                    Modifiez vos critères de recherche ou réinitialisez les filtres.
                  </p>
                  <button
                    onClick={() => {
                      setSortieSearchTerm('');
                      setSortieStatusFilter('ALL');
                      setSortieDepartmentFilter('ALL');
                    }}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-black transition-all cursor-pointer shadow-xs"
                  >
                    Réinitialiser les filtres
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {(activeTab === 'historique' || activeTab === 'demandes') && (
        <HistoriquePatient 
          user={user}
          establishment={establishment}
          selectedPatient={selectedPatientForHistory}
          onSelectPatientForAdmission={permissions.canWrite ? (p) => {
            handleSelectPatient(p);
            setActiveTab('triage');
          } : undefined}
          theme={theme}
        />
      )}

      {activeTab === 'profil' && (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-6xl mx-auto p-2 sm:p-4">
           <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
             {/* Left Column: User Card & Digital Badge */}
             <div className="lg:col-span-5 space-y-6">
                <div className={`p-6 sm:p-8 rounded-3xl border shadow-xs text-center relative overflow-hidden group ${
                  theme === 'dark' ? 'bg-[#111827] border-slate-800' : 'bg-white border-slate-200'
                }`}>
                   <div className="absolute top-0 left-0 w-full h-20 bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700"></div>
                   <div className="relative z-10 mt-3">
                      <div className="mx-auto mb-4 flex justify-center">
                        <Avatar 
                          user={user || agentProfile} 
                          size={104} 
                          className="border-4 border-white bg-slate-100 shadow-xl" 
                          alt={user?.name || agentProfile.name}
                        />
                      </div>
                      <h2 className={`text-xl sm:text-2xl font-black tracking-tight ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>
                        {user?.name || agentProfile.name}
                      </h2>
                      
                      {/* Real User Roles Badges */}
                      <div className="flex flex-wrap items-center justify-center gap-1.5 mt-2.5">
                        {userRoleLabels.map((rl, idx) => (
                          <span key={idx} className="text-[11px] font-black uppercase px-2.5 py-0.5 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                            {rl}
                          </span>
                        ))}
                      </div>

                      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mt-2">
                        {establishment?.name || 'Établissement Hospitalier'}
                      </p>
                      
                      <div className="mt-6 grid grid-cols-2 gap-3">
                         <div className={`p-3 rounded-2xl border ${theme === 'dark' ? 'bg-slate-900/60 border-slate-800' : 'bg-slate-50 border-slate-100'}`}>
                            <p className="text-[10px] font-bold text-slate-400 uppercase">Actes du jour</p>
                            <p className={`text-lg font-black mt-0.5 ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>{todaysRequests.length}</p>
                         </div>
                         <div className={`p-3 rounded-2xl border ${theme === 'dark' ? 'bg-emerald-950/20 border-emerald-800/40' : 'bg-emerald-50 border-emerald-100'}`}>
                            <p className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase">Statut Session</p>
                            <div className="flex items-center justify-center gap-1.5 mt-1">
                              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                              <span className="text-xs font-black text-emerald-600 dark:text-emerald-400">En Ligne</span>
                            </div>
                         </div>
                      </div>

                      <button 
                        type="button"
                        onClick={() => window.dispatchEvent(new CustomEvent('open-user-profile'))}
                        className="mt-6 w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer"
                      >
                        <Edit3 size={15} />
                        <span>Modifier Mon Profil & Sécurité</span>
                      </button>
                   </div>
                </div>

                {/* Digital Badge Card */}
                <div className="bg-slate-900 p-6 sm:p-7 rounded-3xl text-white shadow-xl border border-slate-800">
                   <div className="flex items-center justify-between mb-5">
                     <h3 className="text-base font-black flex items-center gap-2 text-white">
                       <Award className="text-blue-400" size={18} /> Mon Badge Numérique
                     </h3>
                     <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-blue-500/20 text-blue-300 border border-blue-400/30">
                       Vérifié
                     </span>
                   </div>
                   
                   <div className="space-y-3.5 text-xs divide-y divide-slate-800">
                      <div className="flex justify-between items-center pt-2">
                         <span className="text-slate-400 font-medium">Identifiant</span>
                         <span className="font-bold font-mono text-white">{user?.username || user?.id?.slice(0, 8) || 'N/A'}</span>
                      </div>
                      <div className="flex justify-between items-center pt-2">
                         <span className="text-slate-400 font-medium">Matricule ID</span>
                         <span className="font-black font-mono text-blue-400 tracking-wider">
                           #SH-{user?.id ? user.id.slice(-6).toUpperCase() : (user?.username || 'AGENT').toUpperCase()}
                         </span>
                      </div>
                      <div className="flex justify-between items-center pt-2">
                         <span className="text-slate-400 font-medium">Profession</span>
                         <span className="font-bold text-slate-200">{user?.profession || agentProfile.profession}</span>
                      </div>
                      <div className="flex justify-between items-center pt-2">
                         <span className="text-slate-400 font-medium">Email</span>
                         <span className="font-semibold text-slate-300 truncate max-w-[180px]">{user?.email || 'Non renseigné'}</span>
                      </div>
                      <div className="flex justify-between items-center pt-2">
                         <span className="text-slate-400 font-medium">Téléphone</span>
                         <span className="font-semibold text-slate-300">{user?.phone || 'Non renseigné'}</span>
                      </div>
                   </div>

                   <button 
                     type="button"
                     onClick={() => window.dispatchEvent(new CustomEvent('open-user-profile'))}
                     className="w-full mt-6 py-2.5 bg-white/10 hover:bg-white/20 rounded-xl font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer"
                   >
                     <Key size={14} />
                     <span>Changer Mot de passe</span>
                   </button>
                </div>
             </div>

             {/* Right Column: Planning, Activity & Live RBAC Modules */}
             <div className="lg:col-span-7 space-y-6">
                <div className={`p-6 sm:p-8 rounded-3xl border shadow-xs ${
                  theme === 'dark' ? 'bg-[#111827] border-slate-800' : 'bg-white border-slate-200'
                }`}>
                   <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-100 dark:border-slate-800">
                      <div>
                        <h3 className={`text-lg font-black flex items-center gap-2 ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>
                          <Clock size={20} className="text-blue-600" /> Planning & Activité du Poste
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Informations de poste synchronisées en temps réel</p>
                      </div>
                      <span className="text-xs font-mono font-bold text-blue-600 bg-blue-50 dark:bg-blue-900/30 px-2.5 py-1 rounded-lg">
                        {new Date().toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short' })}
                      </span>
                   </div>
                   
                   <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                      <div className="p-4 bg-blue-50 dark:bg-blue-950/30 rounded-2xl border border-blue-100 dark:border-blue-900/40 relative overflow-hidden">
                        <p className="text-[10px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-wider mb-1">Horaire Prévu</p>
                        <h4 className="text-base font-black text-blue-950 dark:text-blue-100">{agentProfile.schedule}</h4>
                        <div className="text-xs text-blue-600 dark:text-blue-400 mt-2 font-semibold flex items-center gap-1.5">
                          <CheckCircle size={13} /> Session hospitalière active
                        </div>
                      </div>
                      <div className={`p-4 rounded-2xl border ${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-slate-50 border-slate-200/70'}`}>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Activité Récente</p>
                        <p className={`text-base font-black ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>{todaysRequests.length} patient(s) accueilli(s)</p>
                        <p className="text-xs text-slate-500 mt-1">Dernière mise à jour automatique en continu</p>
                      </div>
                   </div>

                   {/* Live RBAC Authorized Modules */}
                   <div className="pt-2">
                      <div className="flex items-center justify-between mb-4">
                        <h4 className={`text-xs font-black uppercase tracking-wider flex items-center gap-2 ${theme === 'dark' ? 'text-slate-300' : 'text-slate-700'}`}>
                          <Shield size={15} className="text-blue-600" /> Habilitations & Modules Disponibles
                        </h4>
                        <span className="text-[11px] text-slate-400">Rôle : {user?.role || agentProfile.role}</span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                         {userModulesList.map((mod, i) => (
                           <div 
                             key={mod.name || i} 
                             className={`flex items-center justify-between p-3.5 rounded-2xl border transition-all ${
                               mod.enabled
                                 ? theme === 'dark'
                                   ? 'bg-slate-900/60 border-slate-800 text-slate-200'
                                   : 'bg-slate-50 border-slate-200/70 text-slate-800'
                                 : theme === 'dark'
                                 ? 'bg-slate-900/20 border-slate-800/50 text-slate-500 opacity-60'
                                 : 'bg-slate-50/50 border-slate-200/50 text-slate-400 opacity-60'
                             }`}
                           >
                             <div className="min-w-0 pr-2">
                               <p className="text-xs font-bold truncate">{mod.name}</p>
                               <p className="text-[10px] font-medium opacity-75 truncate">{mod.detail}</p>
                             </div>
                             <div className="shrink-0 flex items-center gap-1.5">
                               <span className={`w-2 h-2 rounded-full ${
                                 mod.enabled 
                                   ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' 
                                   : 'bg-slate-300 dark:bg-slate-700'
                               }`} />
                               <span className={`text-[10px] font-extrabold uppercase ${
                                 mod.enabled ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'
                               }`}>
                                 {mod.enabled ? 'Actif' : 'Inactif'}
                               </span>
                             </div>
                           </div>
                         ))}
                      </div>
                   </div>

                   {/* Quick Link Notice */}
                   <div className="mt-6 p-4 rounded-2xl bg-blue-50/60 dark:bg-blue-950/20 border border-blue-200/60 dark:border-blue-900/40 flex items-center justify-between gap-3 text-xs">
                     <div className="flex items-center gap-2 text-blue-800 dark:text-blue-300">
                       <Info size={16} className="shrink-0 text-blue-600" />
                       <span>Toutes les modifications de profil sont synchronisées en continu avec l'en-tête et votre session active.</span>
                     </div>
                     <button
                       type="button"
                       onClick={() => window.dispatchEvent(new CustomEvent('open-user-profile'))}
                       className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline shrink-0 cursor-pointer"
                     >
                       Gérer →
                     </button>
                   </div>
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
            if (!permissions.canWrite) {
              alert("Action non autorisée en mode lecture seule.");
              return;
            }
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
