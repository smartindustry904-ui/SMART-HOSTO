import React, { useState, useEffect, useMemo } from 'react';
import { 
  Stethoscope, 
  Calendar, 
  Clock, 
  User as UserIcon, 
  FileText, 
  Plus, 
  Search, 
  CheckCircle2, 
  AlertTriangle, 
  Baby, 
  Pill, 
  Beaker, 
  Heart, 
  Activity, 
  Scale, 
  Save, 
  Printer, 
  X, 
  ChevronRight, 
  ArrowLeft,
  CalendarCheck,
  Loader2,
  History,
  TrendingUp,
  Eye,
  Edit3,
  ShieldCheck,
  Thermometer,
  RotateCcw,
  BadgeCheck
} from 'lucide-react';
import { 
  collection, 
  doc, 
  setDoc, 
  updateDoc, 
  onSnapshot, 
  query, 
  where, 
  orderBy 
} from 'firebase/firestore';
import { db, sanitizeData } from '../../src/firebase';
import { 
  User, 
  PregnancyDossier, 
  CPNVisit, 
  PaymentRequest, 
  Medication 
} from '../../types';
import { useSettings } from '../../hooks/useSettings';

interface CpnTabProps {
  user: User;
  initialPatient?: any | null;
  onClearInitialPatient?: () => void;
  onAdmitForDelivery?: (patient: any, pregnancy?: any) => void;
  theme?: 'light' | 'dark';
}

const COMMON_PRENATAL_EXAMS = [
  { id: 'nfs', name: 'NFS / Numération Formule Sanguine', category: 'Hématologie', price: 3000 },
  { id: 'glycemie', name: 'Glycémie à jeun', category: 'Biochimie', price: 1500 },
  { id: 'gs_rh', name: 'Groupe Sanguin + Facteur Rhésus', category: 'Immuno-Hématologie', price: 2500 },
  { id: 'vih', name: 'Sérologie VIH 1 & 2', category: 'Sérologie', price: 0 },
  { id: 'ag_hbs', name: 'Hépatite B (Ag HBs)', category: 'Sérologie', price: 3000 },
  { id: 'syphilis', name: 'Sérologie Syphilis (VDRL / TPHA)', category: 'Sérologie', price: 2000 },
  { id: 'ecbu', name: 'ECBU / Examen Cytobactériologique des Urines', category: 'Bactériologie', price: 3500 },
  { id: 'echo_t1', name: 'Échographie Obstétricale T1 / Datation', category: 'Imagerie', price: 10000 },
  { id: 'echo_t2', name: 'Échographie Morphologique T2', category: 'Imagerie', price: 12000 },
  { id: 'echo_t3', name: 'Échographie de Fin de Grossesse T3', category: 'Imagerie', price: 10000 },
  { id: 'toxo_rubeole', name: 'Sérologies Toxoplasmose & Rubéole', category: 'Sérologie', price: 6000 }
];

const COMMON_PRENATAL_MEDS = [
  { name: 'Fer + Acide Folique', dosage: '60mg + 400µg', frequency: '1 comprimé par jour', duration: '90 jours', price: 1200 },
  { name: 'Sulfadoxine-Pyriméthamine (TPI Paludisme)', dosage: '500mg/25mg', frequency: '3 comprimés en prise unique sous surveillance', duration: '1 jour', price: 1000 },
  { name: 'Mébendazole (Déparasitage T2)', dosage: '500mg', frequency: '1 comprimé prise unique', duration: '1 jour', price: 500 },
  { name: 'Calcium élément', dosage: '500mg', frequency: '1 comprimé matin et soir', duration: '30 jours', price: 2500 },
  { name: 'Phloroglucinol (Spasfon)', dosage: '80mg', frequency: '1 à 2 lyocs si contractions douloureuses', duration: '5 jours', price: 1800 },
  { name: 'Paracétamol', dosage: '1000mg', frequency: '1 comprimé toutes les 8h si douleurs ou fièvre', duration: '3 jours', price: 800 }
];

export const CpnTab: React.FC<CpnTabProps> = ({
  user,
  initialPatient,
  onClearInitialPatient,
  onAdmitForDelivery,
  theme = 'light'
}) => {
  const { establishment } = useSettings();
  const currency = establishment?.currency || 'FCFA';

  // Active Patient for CPN
  const [selectedPatient, setSelectedPatient] = useState<any | null>(initialPatient || null);
  const [patientSearch, setPatientSearch] = useState('');
  const [patientSearchResults, setPatientSearchResults] = useState<any[]>([]);
  const [isSearchingPatient, setIsSearchingPatient] = useState(false);

  // Active Pregnancy Dossiers from Firestore
  const [activePregnancies, setActivePregnancies] = useState<PregnancyDossier[]>([]);
  const [selectedPregnancy, setSelectedPregnancy] = useState<PregnancyDossier | null>(null);

  // All CPN visits from Firestore
  const [cpnVisitsHistory, setCpnVisitsHistory] = useState<CPNVisit[]>([]);
  const [selectedVisitModal, setSelectedVisitModal] = useState<CPNVisit | null>(null);

  // Patient-Centric Sub-Navigation (3 strictly defined tabs when patient is opened)
  // 'previous_visits' | 'current_visit' | 'pregnancy_history'
  const [patientSubTab, setPatientSubTab] = useState<'previous_visits' | 'current_visit' | 'pregnancy_history'>('current_visit');

  // Currently loaded visit for editing (if editing an existing visit instead of drafting a new one)
  const [activeVisitId, setActiveVisitId] = useState<string | null>(null);

  // Form State: Informations sur la grossesse
  const [pregnancyForm, setPregnancyForm] = useState({
    ddr: '',
    dpa: '',
    gestationalAgeWeeks: 0,
    pregnancyType: 'SINGLE' as 'SINGLE' | 'MULTIPLE',
    gestity: 1,
    parity: 0,
    previousMiscarriages: 0,
    previousNeonatalDeaths: 0,
    previousCesareans: 0,
    previousComplications: '',
    obstetricalHistory: ''
  });

  // Form State: Constantes & Examen obstétrical & Symptômes
  const [visitForm, setVisitForm] = useState({
    visitNumber: 1,
    date: new Date().toISOString().split('T')[0],
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    motif: 'Consultation Prénatale de Suivi',
    // Constantes
    weight: 60,
    bpSys: 110,
    bpDia: 70,
    pulse: 78,
    temp: 36.8,
    respiratoryRate: 18,
    spo2: 99,
    // Examen obstétrical
    fundalHeight: 24,
    fetalMovements: 'Présents',
    bcf: 140,
    presentation: 'Céphalique',
    position: 'Antérieure',
    edema: 'Absents',
    proteinuria: 'Négative',
    glycemia: 0.85,
    obstetricalObservations: '',
    // Symptômes / Observations
    complaints: '',
    symptoms: '',
    clinicalNotes: '',
    eventsSinceLastVisit: '',
    // Antécédents obstétricaux
    obstetricalAntecedents: '',
    // Conseils
    dietaryAdvice: 'Alimentation variée et équilibrée, riche en fer et calcium. Bonne hydratation (2L d’eau/jour).',
    supplementation: 'Supplémentation martiale et acide folique quotidienne.',
    hygieneAdvice: 'Repos suffisant, marche douce quotidienne, éviter les charges lourdes et longs trajets en piste.',
    surveillanceAdvice: 'Consulter d’urgence en cas de : saignements vaginaux, céphalées intenses avec troubles visuels, fièvre, diminution des mouvements de l’enfant ou pertes de liquide.',
    generalAdvice: '',
    // Conclusion
    conclusion: 'Grossesse d’évolution favorable.',
    finalObservations: '',
    diagnosis: 'Grossesse mono-fœtale évolutive',
    actionPlan: 'Poursuite de la supplémentation, bilans du trimestre, CPN suivante dans 4 semaines.',
    nextVisitDate: new Date(Date.now() + 28 * 24 * 3600 * 1000).toISOString().split('T')[0]
  });

  // Prescribed exams list for this CPN
  const [selectedExams, setSelectedExams] = useState<any[]>([]);
  const [customExamName, setCustomExamName] = useState('');
  const [customExamPrice, setCustomExamPrice] = useState(2500);

  // Prescriptions list for this CPN
  const [prescriptionsList, setPrescriptionsList] = useState<any[]>([
    { ...COMMON_PRENATAL_MEDS[0], quantity: 3 }
  ]);
  const [newMedName, setNewMedName] = useState('');
  const [newMedDosage, setNewMedDosage] = useState('');
  const [newMedFrequency, setNewMedFrequency] = useState('');
  const [newMedDuration, setNewMedDuration] = useState('');
  const [newMedQuantity, setNewMedQuantity] = useState(1);
  const [newMedPrice, setNewMedPrice] = useState(1500);

  // Submitting state & feedback
  const [isSaving, setIsSaving] = useState(false);
  const [isScheduling, setIsScheduling] = useState(false);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);

  // Appointment scheduling modal/state
  const [showAppointmentModal, setShowAppointmentModal] = useState(false);
  const [appointmentDate, setAppointmentDate] = useState(
    new Date(Date.now() + 28 * 24 * 3600 * 1000).toISOString().split('T')[0]
  );
  const [appointmentTime, setAppointmentTime] = useState('09:00');
  const [appointmentReason, setAppointmentReason] = useState('Prochaine CPN');

  // Load active pregnancies from Firestore
  useEffect(() => {
    const q = query(collection(db, 'pregnancy_dossiers'), orderBy('updatedAt', 'desc'));
    const unsub = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(d => ({ ...d.data(), id: d.id } as PregnancyDossier));
      setActivePregnancies(list);
    });
    return () => unsub();
  }, []);

  // Load all CPN visits history
  useEffect(() => {
    const q = query(collection(db, 'cpn_visits'), orderBy('date', 'desc'));
    const unsub = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(d => ({ ...d.data(), id: d.id } as CPNVisit));
      setCpnVisitsHistory(list);
    });
    return () => unsub();
  }, []);

  // Calculate gestational age from DDR
  const calculateGestationalAge = (ddrString: string): number => {
    if (!ddrString) return 0;
    const ddrDate = new Date(ddrString);
    if (isNaN(ddrDate.getTime())) return 0;
    const now = new Date();
    const diffMs = now.getTime() - ddrDate.getTime();
    if (diffMs <= 0) return 0;
    return Math.floor(diffMs / (1000 * 60 * 60 * 24 * 7));
  };

  // Calculate DPA (Date Prévue d'Accouchement: DDR + 287 jours / 41 SA)
  const calculateDPA = (ddrString: string): string => {
    if (!ddrString) return '';
    const ddrDate = new Date(ddrString);
    if (isNaN(ddrDate.getTime())) return '';
    const dpaDate = new Date(ddrDate.getTime() + 287 * 24 * 60 * 60 * 1000);
    return dpaDate.toISOString().split('T')[0];
  };

  // Synchronize initialPatient prop if passed from parent
  useEffect(() => {
    if (initialPatient) {
      setSelectedPatient(initialPatient);
      setPatientSubTab('current_visit');
    }
  }, [initialPatient]);

  // Visits specifically for the current active pregnancy (STRICT ISOLATION)
  const currentPregnancyVisits = useMemo(() => {
    if (!selectedPatient) return [];
    const patientId = selectedPatient.id || selectedPatient.dmeId;
    const pregnancyId = selectedPregnancy?.id;

    return cpnVisitsHistory.filter(v => {
      if (pregnancyId && v.pregnancyId) {
        return v.pregnancyId === pregnancyId;
      }
      return v.patientId === patientId;
    });
  }, [selectedPatient, selectedPregnancy, cpnVisitsHistory]);

  // Chronologically sorted visits (DESC: most recent first for Previous Visits)
  const visitsSortedDesc = useMemo(() => {
    return [...currentPregnancyVisits].sort((a, b) => {
      const timeA = new Date(`${a.date}T${a.time || '00:00'}`).getTime();
      const timeB = new Date(`${b.date}T${b.time || '00:00'}`).getTime();
      return timeB - timeA;
    });
  }, [currentPregnancyVisits]);

  // Chronologically sorted visits (ASC: chronological sequence for Timeline)
  const visitsSortedAsc = useMemo(() => {
    return [...currentPregnancyVisits].sort((a, b) => {
      const numA = Number(a.visitNumber) || 0;
      const numB = Number(b.visitNumber) || 0;
      if (numA !== numB) return numA - numB;
      const timeA = new Date(`${a.date}T${a.time || '00:00'}`).getTime();
      const timeB = new Date(`${b.date}T${b.time || '00:00'}`).getTime();
      return timeA - timeB;
    });
  }, [currentPregnancyVisits]);

  // Robust calculation of Next Available CPN Number (Section 4)
  const calculatedNextVisitNumber = useMemo(() => {
    const existingNums = currentPregnancyVisits
      .map(v => Number(v.visitNumber) || 0)
      .filter(n => n > 0);
    if (existingNums.length === 0) return 1;
    return Math.max(...existingNums) + 1;
  }, [currentPregnancyVisits]);

  // When selected patient changes, find active pregnancy and configure forms
  useEffect(() => {
    if (!selectedPatient) {
      setSelectedPregnancy(null);
      setActiveVisitId(null);
      return;
    }

    const patientId = selectedPatient.id || selectedPatient.dmeId;
    const existingPreg = activePregnancies.find(p => p.patientId === patientId && p.status !== 'TERMINEE');

    if (existingPreg) {
      setSelectedPregnancy(existingPreg);
      setPregnancyForm({
        ddr: existingPreg.ddr || '',
        dpa: existingPreg.dpa || (existingPreg.ddr ? calculateDPA(existingPreg.ddr) : ''),
        gestationalAgeWeeks: existingPreg.ddr ? calculateGestationalAge(existingPreg.ddr) : (existingPreg.gestationalAgeWeeks || 0),
        pregnancyType: existingPreg.pregnancyType || 'SINGLE',
        gestity: existingPreg.gestity || 1,
        parity: existingPreg.parity || 0,
        previousMiscarriages: existingPreg.previousMiscarriages || 0,
        previousNeonatalDeaths: existingPreg.previousNeonatalDeaths || 0,
        previousCesareans: existingPreg.previousCesareans || 0,
        previousComplications: existingPreg.previousComplications || '',
        obstetricalHistory: existingPreg.obstetricalHistory || ''
      });

      // Prepare default new visit with correctly computed sequential number
      const nextNum = calculatedNextVisitNumber;
      setVisitForm(prev => ({
        ...prev,
        visitNumber: nextNum,
        motif: `Consultation Prénatale CPN ${nextNum}`
      }));
    } else {
      setSelectedPregnancy(null);
      setPregnancyForm({
        ddr: '',
        dpa: '',
        gestationalAgeWeeks: 0,
        pregnancyType: 'SINGLE',
        gestity: 1,
        parity: 0,
        previousMiscarriages: 0,
        previousNeonatalDeaths: 0,
        previousCesareans: 0,
        previousComplications: '',
        obstetricalHistory: 'Première consultation prénatale'
      });
      setVisitForm(prev => ({
        ...prev,
        visitNumber: 1,
        motif: 'Consultation Prénatale CPN 1'
      }));
    }
  }, [selectedPatient, activePregnancies, calculatedNextVisitNumber]);

  // Handle patient directory search
  const handleSearchPatient = async (term: string) => {
    setPatientSearch(term);
    if (!term.trim() || term.length < 2) {
      setPatientSearchResults([]);
      return;
    }

    setIsSearchingPatient(true);
    try {
      const q = query(collection(db, 'patients'));
      const unsub = onSnapshot(q, (snapshot) => {
        const patients = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const filtered = patients.filter((p: any) => {
          const full = `${p.lastName || ''} ${p.firstName || ''} ${p.phone || ''} ${p.id || ''} ${p.dmeId || ''}`.toLowerCase();
          return full.includes(term.toLowerCase());
        });
        setPatientSearchResults(filtered.slice(0, 6));
        setIsSearchingPatient(false);
      });
      return () => unsub();
    } catch (e) {
      console.warn('Patient search error:', e);
      setIsSearchingPatient(false);
    }
  };

  // Change DDR -> recalculate term & DPA
  const handleDdrChange = (val: string) => {
    const weeks = calculateGestationalAge(val);
    const dpaVal = calculateDPA(val);
    setPregnancyForm(prev => ({
      ...prev,
      ddr: val,
      gestationalAgeWeeks: weeks,
      dpa: dpaVal
    }));
  };

  // Toggle Exam in prescription list
  const toggleExam = (exam: any) => {
    if (selectedExams.some(e => e.name === exam.name)) {
      setSelectedExams(selectedExams.filter(e => e.name !== exam.name));
    } else {
      setSelectedExams([...selectedExams, exam]);
    }
  };

  const addCustomExam = () => {
    if (!customExamName.trim()) return;
    setSelectedExams([
      ...selectedExams,
      {
        id: `cust-${Date.now()}`,
        name: customExamName.trim(),
        category: 'Examen CPN',
        price: customExamPrice || 2500
      }
    ]);
    setCustomExamName('');
  };

  const removeExam = (examName: string) => {
    setSelectedExams(selectedExams.filter(e => e.name !== examName));
  };

  // Add Medication to prescription
  const addMedication = () => {
    if (!newMedName.trim()) return;
    setPrescriptionsList([
      ...prescriptionsList,
      {
        name: newMedName.trim(),
        dosage: newMedDosage || 'Standard',
        frequency: newMedFrequency || '1 prise/jour',
        duration: newMedDuration || '30 jours',
        quantity: newMedQuantity || 1,
        price: newMedPrice || 1500
      }
    ]);
    setNewMedName('');
    setNewMedDosage('');
    setNewMedFrequency('');
    setNewMedDuration('');
    setNewMedQuantity(1);
  };

  const removeMedication = (index: number) => {
    setPrescriptionsList(prescriptionsList.filter((_, i) => i !== index));
  };

  // Load an existing visit into the active editor WITHOUT changing its visit number
  const handleLoadVisitForEditing = (visit: CPNVisit) => {
    setActiveVisitId(visit.id);
    setVisitForm({
      visitNumber: visit.visitNumber || 1,
      date: visit.date || new Date().toISOString().split('T')[0],
      time: visit.time || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      motif: visit.motif || `Consultation Prénatale CPN ${visit.visitNumber || 1}`,
      weight: visit.weight || 60,
      bpSys: visit.bpSys || 110,
      bpDia: visit.bpDia || 70,
      pulse: visit.pulse || 78,
      temp: visit.temp || 36.8,
      respiratoryRate: visit.respiratoryRate || 18,
      spo2: visit.spo2 || 99,
      fundalHeight: visit.fundalHeight || 24,
      fetalMovements: (visit.fetalMovements as string) || 'Présents',
      bcf: visit.bcf || 140,
      presentation: visit.presentation || 'Céphalique',
      position: visit.position || 'Antérieure',
      edema: (visit.edema as string) || 'Absents',
      proteinuria: visit.proteinuria || 'Négative',
      glycemia: visit.glycemia || 0.85,
      obstetricalObservations: visit.obstetricalObservations || '',
      complaints: Array.isArray(visit.complaints) ? visit.complaints.join(', ') : (visit.complaints || ''),
      symptoms: visit.symptoms || '',
      clinicalNotes: visit.clinicalNotes || '',
      eventsSinceLastVisit: visit.eventsSinceLastVisit || '',
      obstetricalAntecedents: visit.obstetricalAntecedents || '',
      dietaryAdvice: visit.dietaryAdvice || '',
      supplementation: visit.supplementation || '',
      hygieneAdvice: visit.hygieneAdvice || '',
      surveillanceAdvice: visit.surveillanceAdvice || '',
      generalAdvice: visit.generalAdvice || '',
      conclusion: visit.conclusion || '',
      finalObservations: visit.finalObservations || '',
      diagnosis: visit.diagnosis || '',
      actionPlan: visit.actionPlan || '',
      nextVisitDate: visit.nextVisitDate || new Date(Date.now() + 28 * 24 * 3600 * 1000).toISOString().split('T')[0]
    });

    if (visit.prescribedExams && Array.isArray(visit.prescribedExams)) {
      setSelectedExams(visit.prescribedExams);
    }
    if (visit.prescriptions && Array.isArray(visit.prescriptions)) {
      setPrescriptionsList(visit.prescriptions);
    }

    setPatientSubTab('current_visit');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Reset to create a fresh new CPN
  const handleStartFreshVisit = () => {
    setActiveVisitId(null);
    const nextNum = calculatedNextVisitNumber;
    setVisitForm(prev => ({
      ...prev,
      visitNumber: nextNum,
      date: new Date().toISOString().split('T')[0],
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      motif: `Consultation Prénatale CPN ${nextNum}`,
      conclusion: 'Grossesse d’évolution favorable.',
      diagnosis: 'Grossesse mono-fœtale évolutive',
      actionPlan: 'Poursuite du suivi prénatal et supplémentation.'
    }));
    setSelectedExams([]);
    setPrescriptionsList([{ ...COMMON_PRENATAL_MEDS[0], quantity: 3 }]);
    setPatientSubTab('current_visit');
  };

  // Save the entire CPN consultation
  const handleSaveCpn = async () => {
    if (isSaving) return;
    if (!selectedPatient) {
      alert('Veuillez sélectionner une patiente avant d’enregistrer.');
      return;
    }

    setIsSaving(true);
    try {
      const patientId = selectedPatient.id || selectedPatient.dmeId;
      const patientFullName = `${selectedPatient.lastName || ''} ${selectedPatient.firstName || ''}`.trim() || 'Patiente Maternité';
      const patientDossier = selectedPatient.dmeId || selectedPatient.id || '';
      const nowIso = new Date().toISOString();

      // 1. Ensure Pregnancy Dossier exists or create/update it
      let pregId = selectedPregnancy?.id;
      if (!pregId) {
        pregId = `PREG-${Date.now()}`;
        const newPregnancyDoc: PregnancyDossier = {
          id: pregId,
          patientId: patientId,
          patientName: patientFullName,
          patientDossierNum: patientDossier,
          patientAge: selectedPatient.age,
          gestity: Number(pregnancyForm.gestity) || 1,
          parity: Number(pregnancyForm.parity) || 0,
          previousMiscarriages: Number(pregnancyForm.previousMiscarriages) || 0,
          previousNeonatalDeaths: Number(pregnancyForm.previousNeonatalDeaths) || 0,
          previousCesareans: Number(pregnancyForm.previousCesareans) || 0,
          previousComplications: pregnancyForm.previousComplications,
          obstetricalHistory: pregnancyForm.obstetricalHistory || 'Grossesse enregistrée',
          pregnancyType: pregnancyForm.pregnancyType,
          ddr: pregnancyForm.ddr,
          dpa: pregnancyForm.dpa,
          gestationalAgeWeeks: Number(pregnancyForm.gestationalAgeWeeks) || 0,
          riskFactors: [],
          status: 'A_JOUR',
          cpnCount: 1,
          lastCpnDate: visitForm.date,
          createdAt: nowIso,
          updatedAt: nowIso
        };
        await setDoc(doc(db, 'pregnancy_dossiers', pregId), sanitizeData(newPregnancyDoc));
        setSelectedPregnancy(newPregnancyDoc);
      } else {
        const updatedCount = activeVisitId 
          ? (selectedPregnancy.cpnCount || currentPregnancyVisits.length) 
          : (currentPregnancyVisits.length + 1);

        await updateDoc(doc(db, 'pregnancy_dossiers', pregId), sanitizeData({
          gestity: Number(pregnancyForm.gestity) || 1,
          parity: Number(pregnancyForm.parity) || 0,
          previousMiscarriages: Number(pregnancyForm.previousMiscarriages) || 0,
          previousNeonatalDeaths: Number(pregnancyForm.previousNeonatalDeaths) || 0,
          previousCesareans: Number(pregnancyForm.previousCesareans) || 0,
          previousComplications: pregnancyForm.previousComplications,
          obstetricalHistory: pregnancyForm.obstetricalHistory,
          pregnancyType: pregnancyForm.pregnancyType,
          ddr: pregnancyForm.ddr,
          dpa: pregnancyForm.dpa,
          gestationalAgeWeeks: Number(pregnancyForm.gestationalAgeWeeks) || 0,
          cpnCount: updatedCount,
          lastCpnDate: visitForm.date,
          updatedAt: nowIso
        }));
      }

      // 2. Save CPN Visit Document in 'cpn_visits'
      const visitId = activeVisitId || `CPN-${Date.now()}`;
      const cpnVisitDoc: CPNVisit = {
        id: visitId,
        pregnancyId: pregId,
        patientId: patientId,
        patientName: patientFullName,
        patientDossierNum: patientDossier,
        patientAge: selectedPatient.age,
        date: visitForm.date,
        time: visitForm.time,
        visitNumber: visitForm.visitNumber,
        status: 'VALIDEE',
        week: Number(pregnancyForm.gestationalAgeWeeks) || 0,
        motif: visitForm.motif,
        complaints: visitForm.complaints ? [visitForm.complaints] : [],
        symptoms: visitForm.symptoms,
        clinicalNotes: visitForm.clinicalNotes,
        eventsSinceLastVisit: visitForm.eventsSinceLastVisit,
        bpSys: Number(visitForm.bpSys) || 120,
        bpDia: Number(visitForm.bpDia) || 80,
        weight: Number(visitForm.weight) || 60,
        temp: Number(visitForm.temp) || 37,
        pulse: Number(visitForm.pulse) || 75,
        respiratoryRate: Number(visitForm.respiratoryRate) || 18,
        spo2: Number(visitForm.spo2) || 98,
        fundalHeight: Number(visitForm.fundalHeight) || 0,
        bcf: Number(visitForm.bcf) || 140,
        fetalMovements: visitForm.fetalMovements,
        presentation: visitForm.presentation,
        position: visitForm.position,
        edema: visitForm.edema,
        proteinuria: visitForm.proteinuria,
        glycemia: Number(visitForm.glycemia) || 0,
        obstetricalObservations: visitForm.obstetricalObservations,
        obstetricalAntecedents: pregnancyForm.obstetricalHistory,
        prescribedExams: selectedExams,
        prescriptions: prescriptionsList,
        dietaryAdvice: visitForm.dietaryAdvice,
        supplementation: visitForm.supplementation,
        hygieneAdvice: visitForm.hygieneAdvice,
        surveillanceAdvice: visitForm.surveillanceAdvice,
        generalAdvice: visitForm.generalAdvice,
        conclusion: visitForm.conclusion,
        finalObservations: visitForm.finalObservations,
        diagnosis: visitForm.diagnosis,
        actionPlan: visitForm.actionPlan,
        nextVisitDate: visitForm.nextVisitDate,
        userId: user.id || 'maternity_user',
        userName: user.name || 'Sage-femme',
        createdAt: nowIso
      };

      await setDoc(doc(db, 'cpn_visits', visitId), sanitizeData(cpnVisitDoc), { merge: true });

      // 3. Integration with Laboratory (`lab_requests`) + Caisse (`payment_requests`)
      if (selectedExams.length > 0) {
        const labRequestId = `LAB-CPN-${Date.now()}`;
        await setDoc(doc(db, 'lab_requests', labRequestId), sanitizeData({
          id: labRequestId,
          patientId: patientId,
          patientName: patientFullName,
          consultationId: visitId,
          cpnId: visitId,
          prescriberId: user.id || 'maternity',
          prescriberName: user.name || 'Sage-femme',
          department: 'Maternité',
          requestingService: 'Maternité (CPN)',
          date: nowIso,
          status: 'en attente',
          priority: 'normal',
          exams: selectedExams.map(e => ({
            name: e.name,
            category: e.category || 'CPN',
            price: e.price || 2500,
            urgent: false
          })),
          totalAmount: selectedExams.reduce((sum, e) => sum + (e.price || 0), 0),
          billingStatus: 'pending',
          createdAt: nowIso
        }));

        const labTotal = selectedExams.reduce((sum, e) => sum + (e.price || 0), 0);
        if (labTotal > 0) {
          const invoiceId = `PR-LAB-${Date.now()}`;
          const labInvoice: PaymentRequest = {
            id: invoiceId,
            patientId: patientId,
            patientName: patientFullName,
            requestingService: 'Maternité',
            sourceModule: 'Maternité',
            type: 'LABORATOIRE',
            items: selectedExams.map((e, idx) => ({
              id: `item-lab-${invoiceId}-${idx}`,
              name: `Examen Lab CPN : ${e.name}`,
              quantity: 1,
              unitPrice: e.price || 2500,
              totalPrice: e.price || 2500
            })),
            totalAmount: labTotal,
            amountPaid: 0,
            status: 'PENDING',
            createdAt: nowIso,
            createdBy: user.name || 'Sage-femme'
          };
          await setDoc(doc(db, 'payment_requests', invoiceId), sanitizeData(labInvoice));
        }
      }

      // 4. Integration with Pharmacy (`pending_prescriptions`) + Caisse (`payment_requests`)
      if (prescriptionsList.length > 0) {
        const prescId = `RX-CPN-${Date.now()}`;
        await setDoc(doc(db, 'pending_prescriptions', prescId), sanitizeData({
          id: prescId,
          patientId: patientId,
          patientName: patientFullName,
          consultationId: visitId,
          cpnId: visitId,
          prescriberName: user.name || 'Sage-femme',
          sourceService: 'Maternité',
          date: nowIso,
          items: prescriptionsList.map(p => ({
            name: p.name,
            dosage: p.dosage,
            frequency: p.frequency,
            duration: p.duration,
            quantity: p.quantity || 1,
            price: p.price || 1200
          })),
          status: 'pending',
          createdAt: nowIso
        }));

        const medsTotal = prescriptionsList.reduce((sum, p) => sum + ((p.price || 1200) * (p.quantity || 1)), 0);
        if (medsTotal > 0) {
          const pharmInvoiceId = `PR-PHARM-${Date.now()}`;
          const pharmInvoice: PaymentRequest = {
            id: pharmInvoiceId,
            patientId: patientId,
            patientName: patientFullName,
            requestingService: 'Maternité',
            sourceModule: 'Maternité',
            type: 'PHARMACIE',
            items: prescriptionsList.map((p, idx) => ({
              id: `item-rx-${pharmInvoiceId}-${idx}`,
              name: `Médicament CPN : ${p.name} ${p.dosage}`,
              quantity: p.quantity || 1,
              unitPrice: p.price || 1200,
              totalPrice: (p.price || 1200) * (p.quantity || 1)
            })),
            totalAmount: medsTotal,
            amountPaid: 0,
            status: 'PENDING',
            createdAt: nowIso,
            createdBy: user.name || 'Sage-femme'
          };
          await setDoc(doc(db, 'payment_requests', pharmInvoiceId), sanitizeData(pharmInvoice));
        }
      }

      // 5. Update patient queue status if present
      if (selectedPatient.queueDocId) {
        try {
          await updateDoc(doc(db, 'service_queues', selectedPatient.queueDocId), sanitizeData({
            status: 'ready_for_discharge',
            completedAt: nowIso
          }));
        } catch (queueErr) {
          console.warn('Queue update warning:', queueErr);
        }
      }

      setSaveSuccessMessage(`La CPN n° ${visitForm.visitNumber} a été enregistrée et validée pour ${patientFullName}.`);
      setAppointmentDate(visitForm.nextVisitDate || appointmentDate);
      setShowAppointmentModal(true);

      // Reset active editing ID
      setActiveVisitId(null);

    } catch (err) {
      console.error('Erreur lors de l’enregistrement de la CPN:', err);
      alert('Une erreur est survenue lors de l’enregistrement de la consultation.');
    } finally {
      setIsSaving(false);
    }
  };

  // Schedule Next CPN Appointment in 'appointments'
  const handleScheduleAppointment = async () => {
    if (isScheduling) return;
    if (!selectedPatient) return;
    setIsScheduling(true);
    try {
      const patientId = selectedPatient.id || selectedPatient.dmeId;
      const patientFullName = `${selectedPatient.lastName || ''} ${selectedPatient.firstName || ''}`.trim();
      const apptId = `APPT-${Date.now()}`;

      await setDoc(doc(db, 'appointments', apptId), sanitizeData({
        id: apptId,
        patientId: patientId,
        patient: patientFullName,
        age: selectedPatient.age ? String(selectedPatient.age) : '',
        gender: 'F',
        reason: appointmentReason || `CPN n° ${(visitForm.visitNumber || 1) + 1}`,
        doctor: user.name || 'Sage-femme Maternité',
        service: 'Maternité',
        type: 'CPN',
        date: appointmentDate,
        time: appointmentTime,
        status: 'PENDING',
        createdAt: new Date().toISOString()
      }));

      window.dispatchEvent(new CustomEvent('app-notification', {
        detail: `Rendez-vous CPN programmé pour le ${new Date(appointmentDate).toLocaleDateString('fr-FR')} à ${appointmentTime}.`
      }));

      setShowAppointmentModal(false);
      setPatientSubTab('previous_visits');
    } catch (err) {
      console.error('Erreur programmation RDV:', err);
      alert('Erreur lors de la programmation du rendez-vous.');
    } finally {
      setIsScheduling(false);
    }
  };

  // Clinical term status helper for header
  const pregnancyTermDisplay = useMemo(() => {
    const ddr = pregnancyForm.ddr || selectedPregnancy?.ddr;
    if (!ddr) return { text: 'Non calculable', badge: 'bg-slate-100 text-slate-600' };
    const weeks = calculateGestationalAge(ddr);
    if (weeks <= 0) return { text: 'Non calculable', badge: 'bg-slate-100 text-slate-600' };
    if (weeks >= 37 && weeks <= 41) {
      return { text: `${weeks} SA (À terme)`, badge: 'bg-emerald-100 text-emerald-800 border border-emerald-200' };
    }
    if (weeks > 41) {
      return { text: `${weeks} SA (Terme dépassé)`, badge: 'bg-rose-100 text-rose-800 border border-rose-200' };
    }
    return { text: `${weeks} SA (Grossesse évolutive)`, badge: 'bg-pink-100 text-pink-800 border border-pink-200' };
  }, [pregnancyForm.ddr, selectedPregnancy?.ddr]);

  return (
    <div className="space-y-6">
      {/* =========================================================================
          CONDITION 1: AUCUNE PATIENTE OUVERTE -> ÉCRAN D'ACCUEIL & SÉLECTION
          ========================================================================= */}
      {!selectedPatient ? (
        <div className="space-y-6">
          {/* Hero Banner Recherche & Sélection Patiente */}
          <div className="bg-white rounded-3xl border border-slate-200 p-8 shadow-sm text-center">
            <div className="w-16 h-16 rounded-3xl bg-pink-50 text-pink-600 flex items-center justify-center mx-auto mb-4 shadow-xs">
              <Stethoscope size={28} />
            </div>
            <h3 className="text-xl font-black text-slate-900 mb-1">Espace de Suivi Obstétrical & CPN</h3>
            <p className="text-xs text-slate-500 mb-6 max-w-lg mx-auto">
              Sélectionnez une patiente pour ouvrir son dossier obstétrical et accéder à son historique, ses consultations précédentes et sa CPN en cours.
            </p>

            {/* Barre de recherche patiente */}
            <div className="max-w-md mx-auto relative mb-4">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Rechercher par nom, prénom, N° dossier/DME..."
                value={patientSearch}
                onChange={e => handleSearchPatient(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-semibold outline-none focus:border-pink-500 focus:bg-white transition-all shadow-xs"
              />
            </div>

            {isSearchingPatient && <p className="text-xs text-slate-400 animate-pulse">Recherche dans la base patiente...</p>}

            {patientSearchResults.length > 0 && (
              <div className="max-w-md mx-auto border border-slate-200 rounded-2xl overflow-hidden divide-y divide-slate-100 bg-white shadow-xl text-left">
                {patientSearchResults.map(p => (
                  <div
                    key={p.id}
                    onClick={() => {
                      setSelectedPatient(p);
                      setPatientSearchResults([]);
                    }}
                    className="p-3.5 hover:bg-pink-50/60 cursor-pointer flex justify-between items-center transition-colors"
                  >
                    <div>
                      <p className="font-bold text-slate-900 text-xs">{p.lastName} {p.firstName}</p>
                      <p className="text-[10px] text-slate-400 font-mono">
                        Dossier N° {p.dmeId || p.id} {p.age ? `• ${p.age} ans` : ''} {p.phone ? `• ${p.phone}` : ''}
                      </p>
                    </div>
                    <button className="px-3 py-1.5 bg-pink-600 text-white rounded-xl text-xs font-bold hover:bg-pink-700 shadow-xs">
                      Ouvrir le dossier CPN
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Registre des Grossesses Actives pour Sélection Directe */}
          <div className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <div>
                <h4 className="font-black text-slate-900 text-sm flex items-center gap-2">
                  <Baby className="text-pink-600" size={18} />
                  Dossiers de Grossesses Actives ({activePregnancies.filter(p => p.status !== 'TERMINEE').length})
                </h4>
                <p className="text-xs text-slate-500">Accès direct au dossier obstétrical individuel de chaque parturiente</p>
              </div>
            </div>

            {activePregnancies.filter(p => p.status !== 'TERMINEE').length === 0 ? (
              <div className="bg-white rounded-3xl border border-slate-200 p-8 text-center text-slate-400 text-xs">
                Aucune grossesse active répertoriée. Utilisez la recherche ci-dessus pour initialiser un dossier.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {activePregnancies.filter(p => p.status !== 'TERMINEE').map(preg => {
                  const currentWeeks = preg.ddr ? calculateGestationalAge(preg.ddr) : preg.gestationalAgeWeeks;

                  return (
                    <div
                      key={preg.id}
                      className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm hover:border-pink-300 transition-all flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2 mb-3">
                          <div className="flex items-center gap-2.5">
                            <div className="w-10 h-10 rounded-2xl bg-pink-100 text-pink-600 flex items-center justify-center font-black text-xs">
                              {(preg.patientName?.[0] || 'P')}
                            </div>
                            <div>
                              <h4 className="font-bold text-slate-900 text-sm">{preg.patientName || 'Patiente'}</h4>
                              <p className="text-[10px] text-slate-400 font-mono">Dossier N° {preg.patientDossierNum || preg.patientId}</p>
                            </div>
                          </div>
                          <span className="px-2.5 py-1 bg-pink-50 text-pink-700 font-black text-xs rounded-xl">
                            {currentWeeks ? `${currentWeeks} SA` : 'En cours'}
                          </span>
                        </div>

                        <div className="bg-slate-50 rounded-2xl p-3 space-y-1 text-xs text-slate-600 mb-4">
                          <div className="flex justify-between">
                            <span className="text-slate-400">DDR :</span>
                            <span className="font-semibold">{preg.ddr ? new Date(preg.ddr).toLocaleDateString('fr-FR') : 'Non renseignée'}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">DPA (Terme prévu) :</span>
                            <span className="font-semibold text-pink-700">{preg.dpa ? new Date(preg.dpa).toLocaleDateString('fr-FR') : 'Non renseignée'}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">Gestité / Parité :</span>
                            <span className="font-semibold">G{preg.gestity} P{preg.parity}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">CPN réalisées :</span>
                            <span className="font-bold text-emerald-600">{preg.cpnCount || 0} visite{(preg.cpnCount || 0) > 1 ? 's' : ''}</span>
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={() => {
                          setSelectedPatient({
                            id: preg.patientId,
                            dmeId: preg.patientDossierNum || preg.patientId,
                            lastName: preg.patientName?.split(' ')[0] || '',
                            firstName: preg.patientName?.split(' ').slice(1).join(' ') || '',
                            age: preg.patientAge
                          });
                          setSelectedPregnancy(preg);
                          setPatientSubTab('current_visit');
                        }}
                        className="w-full py-2.5 bg-pink-600 text-white rounded-xl text-xs font-bold hover:bg-pink-700 flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                      >
                        <Stethoscope size={14} />
                        Ouvrir le suivi CPN de la patiente
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* =========================================================================
           CONDITION 2: PATIENTE OUVERTE -> ESPACE DE SUIVI OBSTÉTRICAL CENTRÉ
           ========================================================================= */
        <div className="space-y-6 animate-in fade-in duration-200">
          
          {/* =======================================================================
              3.A. EN-TÊTE DU DOSSIER OBSTÉTRICAL
              ======================================================================= */}
          <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm relative overflow-hidden">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              
              {/* Identité patiente & Dossier */}
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-pink-500 to-rose-600 text-white flex items-center justify-center font-black text-xl shadow-md shrink-0">
                  {selectedPatient.lastName?.[0] || 'P'}
                </div>
                <div>
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <h2 className="text-lg font-black text-slate-900">
                      {selectedPatient.lastName || ''} {selectedPatient.firstName || ''}
                    </h2>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-pink-100 text-pink-700">
                      Dossier Obstétrical Actif
                    </span>
                  </div>

                  <div className="flex items-center gap-3 text-xs text-slate-500 mt-1 flex-wrap font-medium">
                    <span>
                      Identifiant : <strong className="text-slate-800 font-mono">{selectedPatient.id || selectedPatient.dmeId || 'Non renseigné'}</strong>
                    </span>
                    <span>•</span>
                    <span>
                      Dossier DME : <strong className="text-slate-800 font-mono">{selectedPatient.dmeId || selectedPregnancy?.patientDossierNum || 'Non renseigné'}</strong>
                    </span>
                    <span>•</span>
                    <span>
                      Âge : <strong className="text-slate-800">{selectedPatient.age ? `${selectedPatient.age} ans` : 'Non renseigné'}</strong>
                    </span>
                  </div>
                </div>
              </div>

              {/* Paramètres Clés de la Grossesse (DDR, Terme, DPA, Statut, CPN Active) */}
              <div className="flex items-center gap-3 flex-wrap">
                <div className="bg-slate-50 border border-slate-100 px-3.5 py-2 rounded-2xl text-xs">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">DDR (Référence)</span>
                  <span className="font-bold text-slate-800">
                    {pregnancyForm.ddr ? new Date(pregnancyForm.ddr).toLocaleDateString('fr-FR') : (selectedPregnancy?.ddr ? new Date(selectedPregnancy.ddr).toLocaleDateString('fr-FR') : 'Non renseigné')}
                  </span>
                </div>

                <div className="bg-slate-50 border border-slate-100 px-3.5 py-2 rounded-2xl text-xs">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Terme (SA)</span>
                  <span className={`px-2 py-0.5 rounded-lg text-xs font-black inline-block mt-0.5 ${pregnancyTermDisplay.badge}`}>
                    {pregnancyTermDisplay.text}
                  </span>
                </div>

                <div className="bg-slate-50 border border-slate-100 px-3.5 py-2 rounded-2xl text-xs">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">DPA (Terme prévu)</span>
                  <span className="font-bold text-pink-700">
                    {pregnancyForm.dpa ? new Date(pregnancyForm.dpa).toLocaleDateString('fr-FR') : (selectedPregnancy?.dpa ? new Date(selectedPregnancy.dpa).toLocaleDateString('fr-FR') : 'Non renseigné')}
                  </span>
                </div>

                <div className="bg-pink-50/80 border border-pink-200 px-3.5 py-2 rounded-2xl text-xs">
                  <span className="text-[10px] font-black text-pink-600 uppercase tracking-wider block">CPN Active</span>
                  <span className="font-black text-pink-700">
                    CPN n° {visitForm.visitNumber}
                  </span>
                </div>

                {/* Actions globales sur la patiente */}
                <div className="flex items-center gap-1.5 pl-2 border-l border-slate-200">
                  {onAdmitForDelivery && (
                    <button
                      onClick={() => onAdmitForDelivery(selectedPatient, selectedPregnancy)}
                      className="px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
                      title="Admettre la parturiente en Salle d'Accouchement"
                    >
                      <Baby size={14} />
                      Admettre en Accouchement
                    </button>
                  )}

                  <button
                    onClick={() => {
                      setSelectedPatient(null);
                      setSelectedPregnancy(null);
                      setActiveVisitId(null);
                      if (onClearInitialPatient) onClearInitialPatient();
                    }}
                    className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
                    title="Fermer le dossier et changer de patiente"
                  >
                    <X size={18} />
                  </button>
                </div>

              </div>

            </div>
          </div>

          {/* =======================================================================
              3.B. MENU DE NAVIGATION PROPRE À LA PATIENTE (3 RUBRIQUES STRICTES)
              ======================================================================= */}
          <div className="bg-white rounded-2xl border border-slate-200 p-2 shadow-sm flex items-center gap-2 overflow-x-auto">
            <button
              onClick={() => setPatientSubTab('previous_visits')}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                patientSubTab === 'previous_visits'
                  ? 'bg-pink-600 text-white shadow-md shadow-pink-600/20'
                  : 'bg-slate-50 text-slate-700 hover:bg-slate-100'
              }`}
            >
              <History size={15} />
              1. Consultations précédentes
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                patientSubTab === 'previous_visits' ? 'bg-white/20 text-white' : 'bg-pink-100 text-pink-700'
              }`}>
                {currentPregnancyVisits.length}
              </span>
            </button>

            <button
              onClick={() => setPatientSubTab('current_visit')}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                patientSubTab === 'current_visit'
                  ? 'bg-pink-600 text-white shadow-md shadow-pink-600/20'
                  : 'bg-slate-50 text-slate-700 hover:bg-slate-100'
              }`}
            >
              <Stethoscope size={15} />
              2. Consultation en cours (CPN n° {visitForm.visitNumber})
              {activeVisitId ? (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-400 text-slate-900">
                  Édition
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-400 text-slate-900">
                  Nouvelle
                </span>
              )}
            </button>

            <button
              onClick={() => setPatientSubTab('pregnancy_history')}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                patientSubTab === 'pregnancy_history'
                  ? 'bg-pink-600 text-white shadow-md shadow-pink-600/20'
                  : 'bg-slate-50 text-slate-700 hover:bg-slate-100'
              }`}
            >
              <TrendingUp size={15} />
              3. Historique de la grossesse (Chronologie)
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                patientSubTab === 'pregnancy_history' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
              }`}>
                {currentPregnancyVisits.length}
              </span>
            </button>
          </div>

          {/* =======================================================================
              RUBRIQUE 1 : CONSULTATIONS PRÉCÉDENTES DE LA GROSSESSE ACTIVE
              ======================================================================= */}
          {patientSubTab === 'previous_visits' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm flex items-center justify-between">
                <div>
                  <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                    <History className="text-pink-600" size={18} />
                    Consultations Prénatales Précédentes de la Grossesse
                  </h3>
                  <p className="text-xs text-slate-500">
                    Liste ordonnée de la plus récente à la plus ancienne ({visitsSortedDesc.length} visite{visitsSortedDesc.length > 1 ? 's' : ''})
                  </p>
                </div>

                <button
                  onClick={handleStartFreshVisit}
                  className="px-4 py-2 bg-pink-600 text-white rounded-xl text-xs font-bold hover:bg-pink-700 flex items-center gap-1.5 shadow-sm cursor-pointer"
                >
                  <Plus size={14} /> Démarrer la CPN n° {calculatedNextVisitNumber}
                </button>
              </div>

              {visitsSortedDesc.length === 0 ? (
                <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center text-slate-400 space-y-3">
                  <Stethoscope size={36} className="mx-auto text-pink-300 opacity-60" />
                  <p className="text-sm font-bold text-slate-700">Aucune CPN précédente pour cette grossesse</p>
                  <p className="text-xs text-slate-400 max-w-sm mx-auto">
                    La patiente n'a pas encore de visite prénatale enregistrée pour ce dossier de grossesse.
                  </p>
                  <button
                    onClick={handleStartFreshVisit}
                    className="mt-2 px-5 py-2.5 bg-pink-600 hover:bg-pink-700 text-white rounded-xl text-xs font-bold shadow-sm"
                  >
                    Démarrer la première CPN (CPN n° 1)
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {visitsSortedDesc.map((visit) => (
                    <div
                      key={visit.id}
                      className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm hover:border-pink-200 transition-all flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
                    >
                      <div className="space-y-2 flex-1">
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className="px-3 py-1 rounded-xl bg-pink-100 text-pink-700 font-black text-xs">
                            CPN n° {visit.visitNumber || 1}
                          </span>
                          <span className="text-xs font-bold text-slate-900 flex items-center gap-1">
                            <Calendar size={13} className="text-slate-400" />
                            {visit.date ? new Date(visit.date).toLocaleDateString('fr-FR') : 'Date non renseignée'}
                            {visit.time && <span className="text-slate-400 text-[11px]">à {visit.time}</span>}
                          </span>
                          <span className="px-2 py-0.5 rounded-lg text-[10px] font-black uppercase bg-emerald-100 text-emerald-800 flex items-center gap-1">
                            <BadgeCheck size={12} /> {visit.status || 'Validée'}
                          </span>
                          <span className="text-xs text-slate-500 font-medium">
                            Praticien : <strong>{visit.userName || 'Sage-femme'}</strong>
                          </span>
                        </div>

                        {/* Paramètres cliniques résumés */}
                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 bg-slate-50 p-3 rounded-2xl text-xs text-slate-700">
                          <div>
                            <span className="text-slate-400 text-[10px] block">Terme</span>
                            <span className="font-bold text-pink-600">{visit.week ? `${visit.week} SA` : '-'}</span>
                          </div>
                          <div>
                            <span className="text-slate-400 text-[10px] block">Tension Artérielle</span>
                            <span className="font-bold">{visit.bpSys}/{visit.bpDia} mmHg</span>
                          </div>
                          <div>
                            <span className="text-slate-400 text-[10px] block">Poids & HU</span>
                            <span className="font-bold">{visit.weight} kg • HU {visit.fundalHeight} cm</span>
                          </div>
                          <div>
                            <span className="text-slate-400 text-[10px] block">BCF (Cœur fœtal)</span>
                            <span className="font-bold text-emerald-600">{visit.bcf ? `${visit.bcf} bpm` : '-'}</span>
                          </div>
                          <div>
                            <span className="text-slate-400 text-[10px] block">Examens / Trait.</span>
                            <span className="font-bold">
                              {(visit.prescribedExams?.length || 0)} bilan(s) • {(visit.prescriptions?.length || 0)} méd.
                            </span>
                          </div>
                        </div>

                        {visit.conclusion && (
                          <p className="text-xs text-slate-600 italic bg-pink-50/40 px-3 py-1.5 rounded-xl border border-pink-100/50">
                            Conclusion : {visit.conclusion}
                          </p>
                        )}
                      </div>

                      {/* Actions sur la visite */}
                      <div className="flex items-center gap-2 self-end md:self-center shrink-0">
                        <button
                          onClick={() => setSelectedVisitModal(visit)}
                          className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <Eye size={13} />
                          Consulter
                        </button>

                        <button
                          onClick={() => handleLoadVisitForEditing(visit)}
                          className="px-3.5 py-2 bg-pink-50 hover:bg-pink-100 text-pink-700 border border-pink-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                          title="Reprendre les données de cette consultation dans la zone en cours"
                        >
                          <Edit3 size={13} />
                          Charger / Modifier
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* =======================================================================
              RUBRIQUE 2 : CONSULTATION EN COURS (LE FORMULAIRE CLINIQUE CPN COMPLET)
              ======================================================================= */}
          {patientSubTab === 'current_visit' && (
            <div className="space-y-6 animate-in fade-in duration-150">
              
              {/* Bandeau d'état de la visite en cours */}
              <div className="bg-gradient-to-r from-pink-50 via-rose-50 to-pink-50 border border-pink-200 p-4 rounded-3xl flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-pink-600 text-white flex items-center justify-center font-black text-sm shadow-xs">
                    {visitForm.visitNumber}
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                      <span>CPN n° {visitForm.visitNumber} — Consultation en cours</span>
                      {activeVisitId && (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase bg-amber-200 text-amber-900">
                          Mode Modification
                        </span>
                      )}
                    </h3>
                    <p className="text-xs text-slate-500">
                      Rattachée au dossier de grossesse N° <strong className="font-mono text-slate-700">{selectedPregnancy?.id || 'Nouveau'}</strong> • Patiente : <strong className="text-slate-800">{selectedPatient.lastName} {selectedPatient.firstName}</strong>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {activeVisitId && (
                    <button
                      onClick={handleStartFreshVisit}
                      className="px-3.5 py-2 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <RotateCcw size={13} />
                      Repartir sur une nouvelle CPN (n° {calculatedNextVisitNumber})
                    </button>
                  )}
                  <span className="text-xs font-bold text-slate-400">
                    Date : <strong className="text-slate-800">{visitForm.date}</strong>
                  </span>
                </div>
              </div>

              {/* Form Card 1: Informations sur la grossesse & Antécédents obstétricaux */}
              <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm">
                <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-3">
                  <h3 className="text-sm font-black text-slate-900 uppercase tracking-wide flex items-center gap-2">
                    <Baby size={18} className="text-pink-600" />
                    Informations sur la Grossesse & Antécédents
                  </h3>
                  {selectedPregnancy && (
                    <span className="text-[10px] font-bold bg-pink-100 text-pink-700 px-2.5 py-1 rounded-lg">
                      Dossier Grossesse ({currentPregnancyVisits.length} CPN enregistrée{currentPregnancyVisits.length > 1 ? 's' : ''})
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      DDR (Date des Dernières Règles)
                    </label>
                    <input
                      type="date"
                      value={pregnancyForm.ddr}
                      onChange={e => handleDdrChange(e.target.value)}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:border-pink-500 font-medium"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Terme / Âge Gestationnel (SA)
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="1"
                        max="44"
                        value={pregnancyForm.gestationalAgeWeeks}
                        onChange={e => setPregnancyForm({ ...pregnancyForm, gestationalAgeWeeks: Number(e.target.value) })}
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:border-pink-500 font-bold text-pink-600"
                      />
                      <span className="text-xs font-bold text-slate-400">SA</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      DPA (Date Prévue d'Accouchement)
                    </label>
                    <input
                      type="date"
                      value={pregnancyForm.dpa}
                      onChange={e => setPregnancyForm({ ...pregnancyForm, dpa: e.target.value })}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:border-pink-500 font-medium"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Type de Grossesse
                    </label>
                    <select
                      value={pregnancyForm.pregnancyType}
                      onChange={e => setPregnancyForm({ ...pregnancyForm, pregnancyType: e.target.value as any })}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:border-pink-500 font-medium"
                    >
                      <option value="SINGLE">Grossesse Simple (1 fœtus)</option>
                      <option value="MULTIPLE">Grossesse Multiple (Jumeaux / +)</option>
                    </select>
                  </div>
                </div>

                {/* Section Antécédents Obstétricaux */}
                <div className="mt-6 pt-4 border-t border-slate-100">
                  <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">
                    Antécédents Obstétricaux (Gestité / Parité)
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">Gestité (G)</label>
                      <input
                        type="number"
                        min="1"
                        value={pregnancyForm.gestity}
                        onChange={e => setPregnancyForm({ ...pregnancyForm, gestity: Number(e.target.value) })}
                        className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">Parité (P)</label>
                      <input
                        type="number"
                        min="0"
                        value={pregnancyForm.parity}
                        onChange={e => setPregnancyForm({ ...pregnancyForm, parity: Number(e.target.value) })}
                        className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">Fausses Couches</label>
                      <input
                        type="number"
                        min="0"
                        value={pregnancyForm.previousMiscarriages}
                        onChange={e => setPregnancyForm({ ...pregnancyForm, previousMiscarriages: Number(e.target.value) })}
                        className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">Césariennes</label>
                      <input
                        type="number"
                        min="0"
                        value={pregnancyForm.previousCesareans}
                        onChange={e => setPregnancyForm({ ...pregnancyForm, previousCesareans: Number(e.target.value) })}
                        className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">Décès néonatals</label>
                      <input
                        type="number"
                        min="0"
                        value={pregnancyForm.previousNeonatalDeaths}
                        onChange={e => setPregnancyForm({ ...pregnancyForm, previousNeonatalDeaths: Number(e.target.value) })}
                        className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800"
                      />
                    </div>
                  </div>

                  <div className="mt-3">
                    <input
                      type="text"
                      placeholder="Notes antécédents ou complications antérieures (ex: HTA gravidique en 2021, hémorragie...)"
                      value={pregnancyForm.previousComplications}
                      onChange={e => setPregnancyForm({ ...pregnancyForm, previousComplications: e.target.value })}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:border-pink-500"
                    />
                  </div>
                </div>
              </div>

              {/* Form Card 2: Constantes & Examen Obstétrical & Symptômes */}
              <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-6">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h3 className="text-sm font-black text-slate-900 uppercase tracking-wide flex items-center gap-2">
                    <Activity size={18} className="text-pink-600" />
                    Données Cliniques de la Consultation (CPN {visitForm.visitNumber})
                  </h3>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-slate-400 font-bold">Date de la visite :</span>
                    <input
                      type="date"
                      value={visitForm.date}
                      onChange={e => setVisitForm({ ...visitForm, date: e.target.value })}
                      className="p-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold"
                    />
                  </div>
                </div>

                {/* Constantes Maternelles */}
                <div>
                  <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                    <Scale size={14} className="text-slate-400" />
                    Constantes Maternelles
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">Poids (kg)</label>
                      <input
                        type="number"
                        step="0.1"
                        value={visitForm.weight}
                        onChange={e => setVisitForm({ ...visitForm, weight: Number(e.target.value) })}
                        className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">TA Systolique</label>
                      <input
                        type="number"
                        value={visitForm.bpSys}
                        onChange={e => setVisitForm({ ...visitForm, bpSys: Number(e.target.value) })}
                        className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">TA Diastolique</label>
                      <input
                        type="number"
                        value={visitForm.bpDia}
                        onChange={e => setVisitForm({ ...visitForm, bpDia: Number(e.target.value) })}
                        className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">Pouls (bpm)</label>
                      <input
                        type="number"
                        value={visitForm.pulse}
                        onChange={e => setVisitForm({ ...visitForm, pulse: Number(e.target.value) })}
                        className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">Température (°C)</label>
                      <input
                        type="number"
                        step="0.1"
                        value={visitForm.temp}
                        onChange={e => setVisitForm({ ...visitForm, temp: Number(e.target.value) })}
                        className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">SpO2 (%)</label>
                      <input
                        type="number"
                        value={visitForm.spo2}
                        onChange={e => setVisitForm({ ...visitForm, spo2: Number(e.target.value) })}
                        className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
                      />
                    </div>
                  </div>
                </div>

                {/* Examen Obstétrical */}
                <div className="pt-4 border-t border-slate-100">
                  <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                    <Heart size={14} className="text-pink-500" />
                    Examen Obstétrical
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Hauteur Utérine (cm)
                      </label>
                      <input
                        type="number"
                        value={visitForm.fundalHeight}
                        onChange={e => setVisitForm({ ...visitForm, fundalHeight: Number(e.target.value) })}
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900"
                        placeholder="Ex: 28 cm"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Bruits du Cœur Fœtal (BCF bpm)
                      </label>
                      <input
                        type="number"
                        value={visitForm.bcf}
                        onChange={e => setVisitForm({ ...visitForm, bcf: Number(e.target.value) })}
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-emerald-600"
                        placeholder="Ex: 140 bpm"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Mouvements Fœtaux
                      </label>
                      <select
                        value={visitForm.fetalMovements}
                        onChange={e => setVisitForm({ ...visitForm, fetalMovements: e.target.value })}
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium"
                      >
                        <option value="Présents">Présents et vifs</option>
                        <option value="Diminués">Diminués (À surveiller)</option>
                        <option value="Absents">Absents (Urgence)</option>
                        <option value="Non perçus">Non encore perçus (&lt; 18 SA)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Présentation Fœtale
                      </label>
                      <select
                        value={visitForm.presentation}
                        onChange={e => setVisitForm({ ...visitForm, presentation: e.target.value })}
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium"
                      >
                        <option value="Céphalique">Céphalique (Tête en bas)</option>
                        <option value="Siège">Siège</option>
                        <option value="Transverse">Transverse / Oblique</option>
                        <option value="Indéterminée">Indéterminée (&lt; 28 SA)</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Œdèmes des membres inférieurs
                      </label>
                      <select
                        value={visitForm.edema}
                        onChange={e => setVisitForm({ ...visitForm, edema: e.target.value })}
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium"
                      >
                        <option value="Absents">Absents</option>
                        <option value="Discrets (+)">Discrets (+)</option>
                        <option value="Modérés (++)">Modérés (++)</option>
                        <option value="Majeurs (+++)">Majeurs (+++ à risque pré-éclampsie)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Protéinurie (Bandelette Urinaire)
                      </label>
                      <select
                        value={visitForm.proteinuria}
                        onChange={e => setVisitForm({ ...visitForm, proteinuria: e.target.value })}
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium"
                      >
                        <option value="Négative">Négative</option>
                        <option value="Traces">Traces</option>
                        <option value="+ (0.3g/L)">+ (0.3 g/L)</option>
                        <option value="++ (1g/L)">++ (1.0 g/L)</option>
                        <option value="+++ (3g/L)">+++ (3.0 g/L - Alerte)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Glycémie capillaire (g/L)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={visitForm.glycemia}
                        onChange={e => setVisitForm({ ...visitForm, glycemia: Number(e.target.value) })}
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
                        placeholder="0.85"
                      />
                    </div>
                  </div>
                </div>

                {/* Symptômes, Plaintes & Notes Cliniques */}
                <div className="pt-4 border-t border-slate-100">
                  <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">
                    Plaintes de la Patiente & Notes Cliniques
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Plaintes ou Symptômes exprimés</label>
                      <input
                        type="text"
                        value={visitForm.complaints}
                        onChange={e => setVisitForm({ ...visitForm, complaints: e.target.value })}
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:border-pink-500"
                        placeholder="Ex: Douleurs pelviennes légères, nausées matinales, fatigue..."
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Événements depuis la dernière visite</label>
                      <input
                        type="text"
                        value={visitForm.eventsSinceLastVisit}
                        onChange={e => setVisitForm({ ...visitForm, eventsSinceLastVisit: e.target.value })}
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:border-pink-500"
                        placeholder="Ex: Épisode fébrile traité il y a 2 semaines, voyage..."
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Form Card 3: Examens Complémentaires (Intégration Laboratoire & Caisse) */}
              <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h3 className="text-sm font-black text-slate-900 uppercase tracking-wide flex items-center gap-2">
                    <Beaker size={18} className="text-blue-600" />
                    Bilans & Examens Biologiques (Liaison Laboratoire)
                  </h3>
                  <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-xl">
                    {selectedExams.length} examen(s) sélectionné(s)
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                  {COMMON_PRENATAL_EXAMS.map(exam => {
                    const isSelected = selectedExams.some(e => e.name === exam.name);
                    return (
                      <button
                        type="button"
                        key={exam.id}
                        onClick={() => toggleExam(exam)}
                        className={`p-3 rounded-2xl border text-left transition-all text-xs font-bold flex items-center justify-between gap-1 cursor-pointer ${
                          isSelected
                            ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        <span className="truncate">{exam.name}</span>
                        {isSelected && <CheckCircle2 size={14} className="shrink-0" />}
                      </button>
                    );
                  })}
                </div>

                {/* Ajout d'examen personnalisé */}
                <div className="flex items-center gap-2 pt-2">
                  <input
                    type="text"
                    placeholder="Autre examen biologique spécifique..."
                    value={customExamName}
                    onChange={e => setCustomExamName(e.target.value)}
                    className="flex-1 p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:border-blue-500"
                  />
                  <input
                    type="number"
                    placeholder="Tarif"
                    value={customExamPrice}
                    onChange={e => setCustomExamPrice(Number(e.target.value))}
                    className="w-24 p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
                  />
                  <button
                    type="button"
                    onClick={addCustomExam}
                    className="px-4 py-2.5 bg-blue-600 text-white font-bold text-xs rounded-xl hover:bg-blue-700 shrink-0 cursor-pointer"
                  >
                    Ajouter
                  </button>
                </div>
              </div>

              {/* Form Card 4: Prescriptions Médicamenteuses (Intégration Pharmacie & Caisse) */}
              <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h3 className="text-sm font-black text-slate-900 uppercase tracking-wide flex items-center gap-2">
                    <Pill size={18} className="text-indigo-600" />
                    Prescriptions & Supplémentations (Liaison Pharmacie)
                  </h3>
                  <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-xl">
                    {prescriptionsList.length} produit(s)
                  </span>
                </div>

                {/* Liste des prescriptions */}
                <div className="space-y-2">
                  {prescriptionsList.map((med, idx) => (
                    <div key={idx} className="flex items-center justify-between bg-slate-50 p-3 rounded-2xl border border-slate-200 text-xs">
                      <div>
                        <span className="font-bold text-slate-900">{med.name}</span>
                        <span className="text-slate-400 mx-2">•</span>
                        <span className="text-indigo-700 font-semibold">{med.dosage}</span>
                        <span className="text-slate-400 mx-2">•</span>
                        <span className="text-slate-600">{med.frequency} ({med.duration})</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeMedication(idx)}
                        className="text-slate-400 hover:text-rose-600 p-1"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>

                {/* Ajout de médicament */}
                <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 pt-2">
                  <input
                    type="text"
                    placeholder="Médicament..."
                    value={newMedName}
                    onChange={e => setNewMedName(e.target.value)}
                    className="sm:col-span-2 p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:border-indigo-500"
                  />
                  <input
                    type="text"
                    placeholder="Posologie (ex: 1 cp/j)"
                    value={newMedFrequency}
                    onChange={e => setNewMedFrequency(e.target.value)}
                    className="p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:border-indigo-500"
                  />
                  <input
                    type="text"
                    placeholder="Durée (ex: 30j)"
                    value={newMedDuration}
                    onChange={e => setNewMedDuration(e.target.value)}
                    className="p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:border-indigo-500"
                  />
                  <button
                    type="button"
                    onClick={addMedication}
                    className="p-2 bg-indigo-600 text-white font-bold text-xs rounded-xl hover:bg-indigo-700 cursor-pointer"
                  >
                    + Ajouter
                  </button>
                </div>
              </div>

              {/* Form Card 5: Conseils Hygiéno-Diététiques & Signes d'Alerte */}
              <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-4">
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-wide flex items-center gap-2 border-b border-slate-100 pb-3">
                  <ShieldCheck size={18} className="text-emerald-600" />
                  Conseils Hygiéno-Diététiques & Signes d'Alerte
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Alimentation & Hygiène de vie
                    </label>
                    <textarea
                      rows={2}
                      value={visitForm.dietaryAdvice}
                      onChange={e => setVisitForm({ ...visitForm, dietaryAdvice: e.target.value })}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Signes de danger à surveiller (Consignes d'urgence)
                    </label>
                    <textarea
                      rows={2}
                      value={visitForm.surveillanceAdvice}
                      onChange={e => setVisitForm({ ...visitForm, surveillanceAdvice: e.target.value })}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>
              </div>

              {/* Form Card 6: Conclusion, Diagnostic & Enregistrement */}
              <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-4">
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-wide flex items-center gap-2 border-b border-slate-100 pb-3">
                  <CheckCircle2 size={18} className="text-pink-600" />
                  Conclusion de la Consultation Prénatale & Conduite à Tenir
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Diagnostic / Situation Obstétricale
                    </label>
                    <input
                      type="text"
                      value={visitForm.diagnosis}
                      onChange={e => setVisitForm({ ...visitForm, diagnosis: e.target.value })}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
                      placeholder="Ex: Grossesse mono-fœtale évolutive de 24 SA sans anomalie"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Date Prévue de la Prochaine CPN
                    </label>
                    <input
                      type="date"
                      value={visitForm.nextVisitDate}
                      onChange={e => setVisitForm({ ...visitForm, nextVisitDate: e.target.value })}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-pink-600"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Conclusion Générale & Plan d'Action
                    </label>
                    <textarea
                      rows={2}
                      value={visitForm.actionPlan}
                      onChange={e => setVisitForm({ ...visitForm, actionPlan: e.target.value })}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:border-pink-500"
                      placeholder="Conduite à tenir, résultats attendus, suivi..."
                    />
                  </div>
                </div>

                {/* Bouton Enregistrer Final */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-slate-100">
                  <span className="text-xs text-slate-500 font-medium">
                    Validation CPN n° {visitForm.visitNumber} avec synchronisation laboratoire, pharmacie et facturation.
                  </span>

                  <button
                    type="button"
                    onClick={handleSaveCpn}
                    disabled={isSaving}
                    className="w-full sm:w-auto px-8 py-3.5 bg-pink-600 hover:bg-pink-700 text-white font-black text-xs uppercase tracking-wider rounded-2xl shadow-lg shadow-pink-600/25 flex items-center justify-center gap-2 cursor-pointer transition-all disabled:opacity-50"
                  >
                    {isSaving ? (
                      <>
                        <Loader2 size={18} className="animate-spin" />
                        Enregistrement en cours...
                      </>
                    ) : (
                      <>
                        <Save size={18} />
                        VALIDER ET ENREGISTRER LA CPN N° {visitForm.visitNumber}
                      </>
                    )}
                  </button>
                </div>
              </div>

            </div>
          )}

          {/* =======================================================================
              RUBRIQUE 3 : HISTORIQUE CHRONOLOGIQUE DE LA GROSSESSE ACTIF (TIMELINE)
              ======================================================================= */}
          {patientSubTab === 'pregnancy_history' && (
            <div className="space-y-6 animate-in fade-in duration-150">
              <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm flex items-center justify-between">
                <div>
                  <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                    <TrendingUp className="text-pink-600" size={18} />
                    Historique Chronologique de la Grossesse Active
                  </h3>
                  <p className="text-xs text-slate-500">
                    Suivi évolutif de toutes les consultations de cette grossesse ({visitsSortedAsc.length} visite{visitsSortedAsc.length > 1 ? 's' : ''})
                  </p>
                </div>

                <button
                  onClick={handleStartFreshVisit}
                  className="px-4 py-2 bg-pink-600 text-white rounded-xl text-xs font-bold hover:bg-pink-700 flex items-center gap-1.5 shadow-sm cursor-pointer"
                >
                  <Plus size={14} /> Nouvelle CPN n° {calculatedNextVisitNumber}
                </button>
              </div>

              {visitsSortedAsc.length === 0 ? (
                <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center text-slate-400 space-y-3">
                  <TrendingUp size={36} className="mx-auto text-pink-300 opacity-60" />
                  <p className="text-sm font-bold text-slate-700">Aucun historique disponible pour cette grossesse</p>
                  <p className="text-xs text-slate-400">
                    L'historique chronologique se construira automatiquement à mesure que les consultations prénatales seront enregistrées.
                  </p>
                </div>
              ) : (
                <div className="relative pl-6 sm:pl-8 border-l-2 border-pink-200 space-y-8 my-4 ml-2">
                  {visitsSortedAsc.map((visit, index) => (
                    <div key={visit.id} className="relative group">
                      {/* Timeline Dot Indicator */}
                      <div className="absolute -left-[31px] sm:-left-[39px] top-1.5 w-7 h-7 rounded-full bg-pink-600 text-white flex items-center justify-center font-black text-xs shadow-md border-4 border-white">
                        {visit.visitNumber || (index + 1)}
                      </div>

                      <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm hover:border-pink-300 transition-all space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                          <div className="flex items-center gap-3">
                            <span className="px-3 py-1 bg-pink-100 text-pink-800 font-black text-xs rounded-xl">
                              CPN n° {visit.visitNumber || (index + 1)}
                            </span>
                            <span className="font-bold text-slate-900 text-sm">
                              {visit.date ? new Date(visit.date).toLocaleDateString('fr-FR') : 'Date non renseignée'}
                              {visit.time && <span className="text-slate-400 font-normal text-xs ml-1.5">à {visit.time}</span>}
                            </span>
                            <span className="font-bold text-pink-600 text-xs">
                              {visit.week ? `(${visit.week} SA)` : ''}
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            <span className="text-xs text-slate-500 font-medium">
                              Par : <strong>{visit.userName || 'Sage-femme'}</strong>
                            </span>
                            <button
                              onClick={() => setSelectedVisitModal(visit)}
                              className="px-3 py-1.5 bg-slate-100 hover:bg-pink-100 hover:text-pink-700 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                            >
                              Détail complet
                            </button>
                          </div>
                        </div>

                        {/* Paramètres mesurés lors de cette étape */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2 text-xs">
                          <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                            <span className="text-[10px] text-slate-400 block font-bold">Poids</span>
                            <span className="font-bold text-slate-900">{visit.weight} kg</span>
                          </div>
                          <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                            <span className="text-[10px] text-slate-400 block font-bold">Tension (TA)</span>
                            <span className="font-bold text-slate-900">{visit.bpSys}/{visit.bpDia} mmHg</span>
                          </div>
                          <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                            <span className="text-[10px] text-slate-400 block font-bold">Hauteur Utérine</span>
                            <span className="font-bold text-slate-900">{visit.fundalHeight} cm</span>
                          </div>
                          <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                            <span className="text-[10px] text-slate-400 block font-bold">BCF Fœtal</span>
                            <span className="font-bold text-emerald-600">{visit.bcf ? `${visit.bcf} bpm` : '-'}</span>
                          </div>
                          <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                            <span className="text-[10px] text-slate-400 block font-bold">Présentation</span>
                            <span className="font-bold text-slate-900">{visit.presentation || '-'}</span>
                          </div>
                          <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                            <span className="text-[10px] text-slate-400 block font-bold">Protéinurie</span>
                            <span className="font-bold text-slate-900">{visit.proteinuria || 'Négative'}</span>
                          </div>
                        </div>

                        {/* Observations & Conclusion de cette CPN */}
                        <div className="space-y-1.5 text-xs">
                          {visit.diagnosis && (
                            <p className="font-semibold text-slate-800">
                              Diagnostic : <span className="text-slate-600 font-normal">{visit.diagnosis}</span>
                            </p>
                          )}
                          {visit.conclusion && (
                            <p className="font-semibold text-slate-800">
                              Conclusion : <span className="text-slate-600 font-normal">{visit.conclusion}</span>
                            </p>
                          )}
                          {visit.prescriptions && visit.prescriptions.length > 0 && (
                            <p className="text-slate-500 text-[11px]">
                              💊 Traitements prescrits : {visit.prescriptions.map((p: any) => p.name).join(', ')}
                            </p>
                          )}
                          {visit.prescribedExams && visit.prescribedExams.length > 0 && (
                            <p className="text-slate-500 text-[11px]">
                              🔬 Examens demandés : {visit.prescribedExams.map((e: any) => e.name).join(', ')}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

        </div>
      )}

      {/* =======================================================================
          MODAL 1: PROGRAMMER LA PROCHAINE CPN
          ======================================================================= */}
      {showAppointmentModal && selectedPatient && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2 text-pink-600 font-bold">
                <CalendarCheck size={20} />
                <h3>Programmer la Prochaine CPN</h3>
              </div>
              <button onClick={() => setShowAppointmentModal(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X size={18} />
              </button>
            </div>

            <div className="bg-emerald-50 border border-emerald-200 p-3.5 rounded-2xl text-xs text-emerald-900 font-semibold">
              {saveSuccessMessage}
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Patiente</label>
                <p className="font-bold text-sm text-slate-900">{selectedPatient.lastName} {selectedPatient.firstName}</p>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Date du prochain rendez-vous CPN</label>
                <input
                  type="date"
                  value={appointmentDate}
                  onChange={e => setAppointmentDate(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Heure</label>
                <input
                  type="time"
                  value={appointmentTime}
                  onChange={e => setAppointmentTime(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Motif</label>
                <input
                  type="text"
                  value={appointmentReason}
                  onChange={e => setAppointmentReason(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                onClick={() => setShowAppointmentModal(false)}
                className="px-4 py-2 bg-slate-100 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-200 cursor-pointer"
              >
                Fermer sans programmer
              </button>
              <button
                type="button"
                disabled={isScheduling}
                onClick={handleScheduleAppointment}
                className="px-5 py-2.5 bg-pink-600 hover:bg-pink-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all disabled:opacity-50 cursor-pointer shadow-md shadow-pink-600/20"
              >
                {isScheduling ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    Enregistrement...
                  </>
                ) : (
                  'Confirmer le Rendez-vous'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =======================================================================
          MODAL 2: DÉTAIL COMPLET DE CPN ARCHIVÉE EN LECTURE SEULE
          ======================================================================= */}
      {selectedVisitModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6 shadow-2xl space-y-5 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-black text-base text-slate-900">
                    Fiche Consultation Prénatale CPN n° {selectedVisitModal.visitNumber || 1}
                  </h3>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-100 text-emerald-800">
                    {selectedVisitModal.status || 'Validée'}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Patiente : <strong>{selectedVisitModal.patientName}</strong> • Date : <strong>{selectedVisitModal.date ? new Date(selectedVisitModal.date).toLocaleDateString('fr-FR') : 'Non renseignée'}</strong> {selectedVisitModal.time ? `à ${selectedVisitModal.time}` : ''} • Terme : <strong>{selectedVisitModal.week} SA</strong>
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                  title="Imprimer cette fiche CPN"
                >
                  <Printer size={18} />
                </button>
                <button onClick={() => setSelectedVisitModal(null)} className="text-slate-400 hover:text-slate-600 p-2 cursor-pointer">
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Constantes cliniques */}
            <div>
              <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Constantes & Paramètres Maternels</h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-4 rounded-2xl text-xs">
                <div>
                  <span className="text-slate-400 text-[10px] block">Poids</span>
                  <p className="font-bold text-slate-900">{selectedVisitModal.weight} kg</p>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block">Tension Artérielle</span>
                  <p className="font-bold text-slate-900">{selectedVisitModal.bpSys}/{selectedVisitModal.bpDia} mmHg</p>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block">Pouls & Température</span>
                  <p className="font-bold text-slate-900">{selectedVisitModal.pulse || '-'} bpm • {selectedVisitModal.temp || '-'} °C</p>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block">SpO2</span>
                  <p className="font-bold text-slate-900">{selectedVisitModal.spo2 || '-'} %</p>
                </div>
              </div>
            </div>

            {/* Examen obstétrical */}
            <div>
              <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Examen Obstétrical</h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-4 rounded-2xl text-xs">
                <div>
                  <span className="text-slate-400 text-[10px] block">Hauteur Utérine</span>
                  <p className="font-bold text-slate-900">{selectedVisitModal.fundalHeight} cm</p>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block">Bruits du Cœur Fœtal</span>
                  <p className="font-bold text-emerald-600">{selectedVisitModal.bcf ? `${selectedVisitModal.bcf} bpm` : '-'}</p>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block">Mouvements Fœtaux</span>
                  <p className="font-bold text-slate-900">{selectedVisitModal.fetalMovements || 'Présents'}</p>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block">Présentation</span>
                  <p className="font-bold text-slate-900">{selectedVisitModal.presentation || '-'}</p>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block">Œdèmes</span>
                  <p className="font-bold text-slate-900">{selectedVisitModal.edema || 'Absents'}</p>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block">Protéinurie</span>
                  <p className="font-bold text-slate-900">{selectedVisitModal.proteinuria || 'Négative'}</p>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block">Glycémie</span>
                  <p className="font-bold text-slate-900">{selectedVisitModal.glycemia ? `${selectedVisitModal.glycemia} g/L` : '-'}</p>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block">Praticien</span>
                  <p className="font-bold text-slate-900">{selectedVisitModal.userName || 'Sage-femme'}</p>
                </div>
              </div>
            </div>

            {/* Diagnostic & Conduite à tenir */}
            {selectedVisitModal.conclusion && (
              <div className="space-y-1 text-xs">
                <span className="font-bold text-slate-700">Diagnostic & Conclusion :</span>
                <div className="bg-pink-50/70 p-3.5 rounded-2xl border border-pink-100 text-slate-800 space-y-1">
                  {selectedVisitModal.diagnosis && (
                    <p className="font-bold text-pink-900">Diagnostic : {selectedVisitModal.diagnosis}</p>
                  )}
                  <p>{selectedVisitModal.conclusion}</p>
                  {selectedVisitModal.actionPlan && (
                    <p className="text-slate-600 mt-1 pt-1 border-t border-pink-200/50">Plan d'action : {selectedVisitModal.actionPlan}</p>
                  )}
                </div>
              </div>
            )}

            {/* Examens demandés */}
            {selectedVisitModal.prescribedExams && selectedVisitModal.prescribedExams.length > 0 && (
              <div className="space-y-1.5 text-xs">
                <span className="font-bold text-slate-700">Examens Biologiques Prescrits :</span>
                <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100 flex flex-wrap gap-2">
                  {selectedVisitModal.prescribedExams.map((e: any, i: number) => (
                    <span key={i} className="px-2.5 py-1 bg-blue-100 text-blue-800 rounded-lg text-xs font-bold">
                      {e.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Médicaments prescrits */}
            {selectedVisitModal.prescriptions && selectedVisitModal.prescriptions.length > 0 && (
              <div className="space-y-1.5 text-xs">
                <span className="font-bold text-slate-700">Prescriptions Médicamenteuses :</span>
                <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100 space-y-1">
                  {selectedVisitModal.prescriptions.map((p: any, i: number) => (
                    <p key={i} className="text-slate-800">
                      • <strong>{p.name}</strong> {p.dosage} — {p.frequency} ({p.duration})
                    </p>
                  ))}
                </div>
              </div>
            )}

            {/* Conseils consignés */}
            {(selectedVisitModal.dietaryAdvice || selectedVisitModal.surveillanceAdvice) && (
              <div className="space-y-1 text-xs">
                <span className="font-bold text-slate-700">Consignes & Surveillance :</span>
                <div className="bg-emerald-50/60 p-3 rounded-2xl border border-emerald-100 text-slate-700 text-xs space-y-1">
                  {selectedVisitModal.dietaryAdvice && <p>• {selectedVisitModal.dietaryAdvice}</p>}
                  {selectedVisitModal.surveillanceAdvice && <p className="text-rose-700 font-semibold">• {selectedVisitModal.surveillanceAdvice}</p>}
                </div>
              </div>
            )}

            <div className="flex justify-between items-center pt-3 border-t border-slate-100">
              <span className="text-xs text-slate-400">
                Prochaine CPN prévue le : <strong>{selectedVisitModal.nextVisitDate ? new Date(selectedVisitModal.nextVisitDate).toLocaleDateString('fr-FR') : 'Non renseignée'}</strong>
              </span>
              <button
                onClick={() => setSelectedVisitModal(null)}
                className="px-5 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 cursor-pointer"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CpnTab;
