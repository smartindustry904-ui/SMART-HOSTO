import React, { useState, useEffect, useRef } from 'react';
import { 
  X, Save, FileText, Activity, Stethoscope, 
  ClipboardList, History, Beaker, Pill, CheckCircle2, AlertCircle,
  ChevronRight, ChevronLeft, Printer, Download, Mic, Trash2, Check,
  Heart, Thermometer, Calendar, MapPin, Scissors, Baby, Search, Hospital,
  Lock, Unlock, ShieldCheck, AlertTriangle, Plus, Clock, UserCheck, Sparkles, RefreshCw, Send, Syringe
} from 'lucide-react';
import { User, PaymentRequest, ConsultationAddendum } from '../../types';
import { db, sanitizeData } from '../../src/firebase';
import { collection, doc, setDoc, getDocs, query, where, updateDoc, addDoc, onSnapshot, orderBy } from 'firebase/firestore';
import VoiceDictationButton from '../../components/VoiceDictationButton';
import { 
  symptom_catalog, 
  system_review_catalog, 
  cim11_catalog, 
  protocol_catalog_links, 
  diagnostic_exam_links, 
  diagnostic_drug_links, 
  clinical_scores 
} from '../../constants/referentials';

const PREDEFINED_SYMPTOMS = [
  'Fièvre',
  'Douleur abdominale',
  'Céphalée',
  'Toux',
  'Dyspnée',
  'Vomissements',
  'Diarrhée',
  'Métrorragies',
  'Douleurs pelviennes',
  'Traumatisme',
  'Fatigue'
];

const getCharacteristicsConfig = (name: string) => {
  const n = (name || '').toLowerCase();
  if (n.includes('fièvre')) {
    return [
      { key: 'température', label: 'Température (°C)', type: 'number' },
      { key: 'type', label: 'Type', type: 'select', options: ['Continue', 'Intermittente', 'En plateau'] }
    ];
  } else if (n.includes('céphalée') || n.includes('cephalée')) {
    return [
      { key: 'localisation', label: 'Localisation', type: 'select', options: ['En casque', 'Hémicrânienne', 'Frontale', 'Occipitale'] },
      { key: 'type', label: 'Type', type: 'select', options: ['Pulsatile', 'Constrictive', 'Pesanteur'] },
      { key: 'intensité', label: 'Intensité (1-10)', type: 'number', min: 1, max: 10 }
    ];
  } else if (n.includes('douleur') || n.includes('traumatisme')) {
    return [
      { key: 'siège', label: 'Siège exact', type: 'text' },
      { key: 'type', label: 'Type', type: 'select', options: ['Brûlure', 'Colique', 'Crampe', 'Pesanteur', 'Coup de poignard'] },
      { key: 'intensité', label: 'Intensité (1-10)', type: 'number', min: 1, max: 10 },
      { key: 'irradiation', label: 'Irradiation', type: 'text' }
    ];
  } else if (n.includes('toux')) {
    return [
      { key: 'type', label: 'Type', type: 'select', options: ['Sèche', 'Grasse', 'Aboyante', 'Quinteuse'] },
      { key: 'horaire', label: 'Horaire', type: 'select', options: ['Prédominance nocturne', 'Matinale', 'Permanente'] }
    ];
  } else if (n.includes('vomiss') || n.includes('diarrhée') || n.includes('sang') || n.includes('métrorragie')) {
      return [
        { key: 'aspect', label: 'Aspect', type: 'text' },
        { key: 'fréquence', label: 'Fréquence par jour', type: 'number' }
      ]
  }
  return [
    { key: 'description', label: 'Description', type: 'text' },
    { key: 'intensité', label: 'Intensité (1-10)', type: 'number', min: 1, max: 10 }
  ];
};

interface ConsultationActiveProps {
  patient: any;
  user: User;
  onClose: () => void;
  onSave: (observation: any) => void;
  onCloturer?: (observation: any) => void;
  onSendPrescription?: (observation: any) => void;
  onSendExams?: (observation: any) => void;
  onHospitalize?: (data?: any) => void;
  isCurrentlyHospitalized?: boolean;
  paymentRequests: PaymentRequest[];
  setPaymentRequests: React.Dispatch<React.SetStateAction<PaymentRequest[]>>;
}

type ConsultationMode = 'pediatrie' | 'gynecologie' | 'obstetrique' | 'medecine_generale' | 'chirurgie' | 'traumatologie';
type TabId = 'motif' | 'histoire' | 'antecedents' | 'systemes' | 'examen' | 'raisonnement' | 'examens' | 'prise_en_charge' | 'observation' | 'addenda';

export default function ConsultationActive({
  patient,
  user,
  onClose,
  onSave,
  onCloturer,
  onSendPrescription,
  onSendExams,
  onHospitalize,
  isCurrentlyHospitalized,
  paymentRequests,
  setPaymentRequests
}: ConsultationActiveProps) {
  const [mode, setMode] = useState<ConsultationMode | null>(() => {
    if (!patient) return null;
    
    // Check motifId or motif
    const mId = patient.motifId || '';
    const mot = (patient.motif || '').toLowerCase();
    const spec = (patient.speciality || '').toLowerCase();
    const qName = (patient.queueName || '').toLowerCase();

    // Mapping based on motifId
    if (['medecine_generale', 'medecine_interne'].includes(mId)) return 'medecine_generale';
    if (['pediatrie', 'urgence_pediatrique'].includes(mId)) return 'pediatrie';
    if (['gynecologie', 'consultation_gynecologique'].includes(mId)) return 'gynecologie';
    if (['obstetrique', 'cpn_consultation', 'postnatale_consultation', 'travail_accouchement', 'consultation_obstetricale', 'cpn_maternite', 'postnatale_maternite', 'urgence_obstetricale'].includes(mId)) return 'obstetrique';
    if (mId === 'chirurgie') return 'chirurgie';
    if (['traumatologie', 'traumatisme'].includes(mId)) return 'traumatologie';

    // Fallbacks using text matches
    if (mot.includes('pédiatrie') || spec.includes('pédiatrie') || qName.includes('pédiatrie') || mot.includes('pediatrie') || spec.includes('pediatrie') || qName.includes('pediatrie')) return 'pediatrie';
    if (mot.includes('gynéco') || spec.includes('gynéco') || qName.includes('gynéco') || mot.includes('gyneco') || spec.includes('gyneco') || qName.includes('gyneco')) return 'gynecologie';
    if (mot.includes('obstétrique') || mot.includes('maternité') || mot.includes('cpn') || spec.includes('obstétrique') || spec.includes('maternité') || qName.includes('obstétrique') || qName.includes('cpn') || mot.includes('obstetrique') || mot.includes('maternite') || spec.includes('obstetrique') || spec.includes('maternite') || qName.includes('obstetrique')) return 'obstetrique';
    if (mot.includes('chirurgie') || spec.includes('chirurgie') || qName.includes('chirurgie')) return 'chirurgie';
    if (mot.includes('traumato') || mot.includes('traumatisme') || spec.includes('traumato') || qName.includes('traumato')) return 'traumatologie';
    if (mot.includes('générale') || mot.includes('interne') || spec.includes('générale') || spec.includes('interne') || qName.includes('générale') || qName.includes('interne') || mot.includes('generale') || spec.includes('generale') || qName.includes('generale')) return 'medecine_generale';

    // Default fallback to 'medecine_generale' so starting/resuming doesn't prompt to select specialty
    return null;
  });
  const [activeTab, setActiveTab] = useState<TabId>('motif');

  // Data states
  const [motif, setMotif] = useState(patient?.motif || '');
  const [motifSymptoms, setMotifSymptoms] = useState<string[]>([]);
  const [motifDuree, setMotifDuree] = useState<string>('');
  const [motifUnite, setMotifUnite] = useState<string>('jours');
  const [symptomSearch, setSymptomSearch] = useState('');
  const [customSymptoms, setCustomSymptoms] = useState<string[]>([]);
  const [showChroniqueAlert, setShowChroniqueAlert] = useState(false);
  const [symptomSystemFilter, setSymptomSystemFilter] = useState('Tous');
  const [symptomFavorites, setSymptomFavorites] = useState<string[]>(() => {
    const saved = localStorage.getItem('symptom_favs');
    return saved ? JSON.parse(saved) : ['Fièvre', 'Céphalée', 'Toux', 'Dyspnée'];
  });
  const [symptomRecents, setSymptomRecents] = useState<string[]>(() => {
    const saved = localStorage.getItem('symptom_recs');
    return saved ? JSON.parse(saved) : ['Douleur abdominale', 'Vomissements', 'Fatigue'];
  });

  const [symptoms, setSymptoms] = useState<{
    name: string, 
    characteristics: Record<string, string>,
    installation?: string,
    conduiteType?: string,
    conduiteDetails?: any,
    evolution?: string,
    delaiApparition?: string
  }[]>([]);
  const [hmaText, setHmaText] = useState('');
  
  const [antecedents, setAntecedents] = useState({
    personnels: {
      medicaux: '',
      chirurgicaux: '',
      immunoAllergiques: '',
      toxicologiques: '',
      environnementaux: '',
      obstetricaux: ''
    },
    familiaux: ''
  });
  const [systemes, setSystemes] = useState<Record<string, boolean>>({});
  const [systemDetails, setSystemDetails] = useState<Record<string, string>>({});
  const [symptomesGeneraux, setSymptomesGeneraux] = useState<Record<string, boolean>>({
    fièvre: false,
    asthénie: false,
    anorexie: false,
    amaigrissement: false
  });
  const [constantes, setConstantes] = useState({
    ta: patient?.vitals?.bp || '',
    fc: patient?.vitals?.pulse?.toString() || '',
    fr: '',
    temp: patient?.vitals?.temp?.toString() || '',
    sat: patient?.vitals?.spo2?.toString() || ''
  });
  const [etatGeneral, setEtatGeneral] = useState('');
  const [examenAppareils, setExamenAppareils] = useState<Record<string, string>>({});
  
  const [hypotheses, setHypotheses] = useState<{principal: string, differentiels: string[]}>({
    principal: '', differentiels: []
  });

  const [examensDemandes, setExamensDemandes] = useState<{name: string, urgent: boolean, price?: number, status?: 'demandé' | 'payé' | 'prélevé' | 'validé'}[]>([]);
  const [prescriptions, setPrescriptions] = useState<{name: string, posologie: string, price?: number}[]>([]);
  const [orientation, setOrientation] = useState('');
  
  const [observation, setObservation] = useState('');

  // CIM-10 and prescription-related top-level states to avoid Hook order rules violation
  const [searchCim, setSearchCim] = useState('');
  const [favorites, setFavorites] = useState<string[]>(() => {
    const favs = localStorage.getItem('cim10_favs');
    return favs ? JSON.parse(favs) : ['B54.9', 'I10', 'N39.0'];
  });
  const [recents, setRecents] = useState<string[]>(() => {
    const recs = localStorage.getItem('cim10_recs');
    return recs ? JSON.parse(recs) : ['B54.9', 'A09.9'];
  });

  const [selectedDrugIndex, setSelectedDrugIndex] = useState<number | null>(null);
  const [customDrugName, setCustomDrugName] = useState('');
  const [customDrugPrice, setCustomDrugPrice] = useState(1550);
  const [customPosology, setCustomPosology] = useState('');
  const [selectedSpecialty, setSelectedSpecialty] = useState('Tous');

  // Dynamic catalogs from Firestore
  const [dbMedications, setDbMedications] = useState<any[]>([]);
  const [dbExams, setDbExams] = useState<any[]>([]);
  const [examSearchQuery, setExamSearchQuery] = useState('');
  const [selectedExamCategory, setSelectedExamCategory] = useState('Tous');
  const [customExamName, setCustomExamName] = useState('');
  const [customExamPrice, setCustomExamPrice] = useState<number>(2500);
  const [isPrescriptionTransmitted, setIsPrescriptionTransmitted] = useState(false);
  const [isExamsTransmitted, setIsExamsTransmitted] = useState(false);

  // Debounce / Transaction lock refs to prevent duplicate trigger clicks
  const isSubmittingPrescrRef = useRef(false);
  const isSubmittingExamsRef = useRef(false);
  const isSubmittingClotureRef = useRef(false);

  // Medico-Legal Immutability: Determine if this record is finalized & locked
  const isReadOnly = Boolean(
    patient?.status === 'ready_for_discharge' || 
    patient?.status === 'consulted' || 
    patient?.status === 'cloture' || 
    patient?.isClotured || 
    patient?.consultationStatus === 'cloture'
  );

  // Addendum Management State
  const [addenda, setAddenda] = useState<ConsultationAddendum[]>([]);
  const [showAddendumModal, setShowAddendumModal] = useState(false);
  const [addendumReason, setAddendumReason] = useState<'Précision diagnostique' | 'Ajustement posologique' | 'Observation complémentaire' | 'Évolution clinique' | 'Correction médico-légale'>('Précision diagnostique');
  const [addendumContent, setAddendumContent] = useState('');
  const [isSavingAddendum, setIsSavingAddendum] = useState(false);

  // Auto-Save / Draft State
  const [lastAutoSavedAt, setLastAutoSavedAt] = useState<string | null>(null);
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  const [draftToastVisible, setDraftToastVisible] = useState(false);

  // Zero-Stock Warning State
  const [showZeroStockModal, setShowZeroStockModal] = useState(false);
  const [zeroStockDrug, setZeroStockDrug] = useState<any | null>(null);
  const [zeroStockAlternatives, setZeroStockAlternatives] = useState<any[]>([]);

  // Caisse Confirmation Modal State
  const [caisseNotice, setCaisseNotice] = useState<{ title: string; message: string; ticketId?: string; totalAmount?: number } | null>(null);

  // Unsent Orders Guardrail Warning State
  const [showUnsentWarningModal, setShowUnsentWarningModal] = useState(false);
  const [unsentPendingAction, setUnsentPendingAction] = useState<'EXIT' | 'CLOTURER' | null>(null);

  // Real-time listener for nursing care acts prescribed for this patient
  const [liveNursingActs, setLiveNursingActs] = useState<any[]>([]);

  useEffect(() => {
    if (!patient?.id) return;
    const patientId = String(patient.id);
    try {
      const q = query(
        collection(db, 'nursing_acts'),
        orderBy('createdAt', 'desc')
      );
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const list = snapshot.docs
          .map(docSnap => ({ id: docSnap.id, ...docSnap.data() }))
          .filter((a: any) => a.patientId === patientId || String(a.patientId) === patientId);
        setLiveNursingActs(list);
      }, (err) => {
        console.warn("Error listening to patient nursing_acts in ConsultationActive:", err);
      });
      return () => unsubscribe();
    } catch (e) {
      console.error("Error setting up nursing_acts listener in ConsultationActive:", e);
    }
  }, [patient?.id]);

  // Fetch medication catalog from central pharmacy_inventory
  useEffect(() => {
    try {
      const q = query(collection(db, 'pharmacy_inventory'));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const fallbackMedications = [
          { id: 'm1', name: 'Paracétamol 500mg (Boite)', price: 500, defaultPosology: '1 comprimé toutes les 8 heures (3 fois/jour) pendant 5 jours', family: 'Antalgique', stock: 100, forms: ['Comprimé'] },
          { id: 'm2', name: 'Amoxicilline 1g (Boite)', price: 2500, defaultPosology: '1 comprimé matin et soir pendant 7 jours', family: 'Antibiotique', stock: 50, forms: ['Gélule'] },
          { id: 'm3', name: 'Artemether-Lumefantrine (Coartem)', price: 2000, defaultPosology: '1 comprimé par jour au cours des repas pendant 3 jours', family: 'Antipaludique', stock: 30, forms: ['Comprimé'] },
          { id: 'm4', name: 'Amlodipine 5mg (Boite)', price: 2250, defaultPosology: '1 comprimé par jour le matin en continu', family: 'Anti-hypertenseur', stock: 40, forms: ['Comprimé'] },
          { id: 'm5', name: 'Ciprofloxacine 500mg', price: 3500, defaultPosology: '1 comprimé 2 fois par jour pendant 5 jours', family: 'Antibiotique', stock: 60, forms: ['Comprimé'] },
          { id: 'm6', name: 'Spasfon Comprimés', price: 1500, defaultPosology: '1 comprimé lors des accès douloureux, max 3/jour', family: 'Antispasmodique', stock: 80, forms: ['Comprimé'] },
          { id: 'm7', name: 'Gaviscon Suspension (Flacon)', price: 3000, defaultPosology: '1 sachet / cuillère 3 fois par jour après les repas', family: 'Antiacide', stock: 45, forms: ['Suspension Buvable'] },
          { id: 'm8', name: 'Metformine 500mg (Flacon)', price: 1800, defaultPosology: '1 comprimé matin et soir pendant le repas', family: 'Antidiabétique', stock: 70, forms: ['Comprimé'] }
        ];

        if (snapshot.empty) {
          setDbMedications(fallbackMedications);
        } else {
          const list = snapshot.docs.map(ds => {
            const d = ds.data();
            return {
              id: ds.id,
              name: d.name || d.nomCommercial || d.nom,
              price: parseFloat(d.price) || parseFloat(d.prixVente) || 1500,
              defaultPosology: d.defaultPosology || d.frequenceStandard || d.posology || 'Selon prescription',
              family: d.family || d.classeTherapeutique || 'Autre',
              stock: parseInt(d.stock) || parseInt(d.quantite) || parseInt(d.unitesParConditionnement) || 50,
              forms: d.forms || (d.formeGalenique ? [d.formeGalenique] : ['Comprimé'])
            };
          });
          setDbMedications(list);
        }
      });
      return () => unsubscribe();
    } catch (e) {
      console.warn("Error subscribing to pharmacy_inventory:", e);
    }
  }, []);

  // Fetch exam catalog from central medical_acts
  useEffect(() => {
    try {
      const q = query(collection(db, 'medical_acts'));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const fallbackExams = [
          { id: 'e1', name: 'NFS (Hémogramme)', price: 4000, category: 'Hématologie' },
          { id: 'e2', name: 'TDR Paludisme / Goutte Épaisse', price: 2000, category: 'Parasitologie' },
          { id: 'e3', name: 'CRP (Protéine C Réactive)', price: 5000, category: 'Immunologie' },
          { id: 'e4', name: 'ECBU (Urines)', price: 6000, category: 'Bactériologie' },
          { id: 'e5', name: 'Créatininémie', price: 3500, category: 'Biochimie' },
          { id: 'e6', name: 'Glycémie à jeun', price: 1500, category: 'Biochimie' },
          { id: 'e7', name: 'Échographie Obstétricale / Pelvienne', price: 10000, category: 'Imagerie' },
          { id: 'e8', name: 'Radiographie Thoracique (Face)', price: 8000, category: 'Imagerie' },
          { id: 'e9', name: 'ECG de repos 12 dérivations', price: 7000, category: 'Imagerie' }
        ];

        if (snapshot.empty) {
          setDbExams(fallbackExams);
        } else {
          const list = snapshot.docs.map(ds => {
            const d = ds.data();
            return {
              id: ds.id,
              name: d.name || d.nom,
              price: parseFloat(d.price) || parseFloat(d.prixVente) || 2500,
              category: d.category || d.categorie || d.sousCategorie || 'Général'
            };
          });
          setDbExams(list);
        }
      });
      return () => unsubscribe();
    } catch (e) {
      console.warn("Error subscribing to medical_acts:", e);
    }
  }, []);

  // Chronological prescription states
  const [posologyDose, setPosologyDose] = useState('1 comprimé');
  const [posologyFreq, setPosologyFreq] = useState('3 fois par jour');
  const [posologyDuration, setPosologyDuration] = useState('5 jours');
  const [posologyTiming, setPosologyTiming] = useState('après les repas');
  const [prescriptionStep, setPrescriptionStep] = useState(1); // 1: Selection, 2: Posology, 3: Review
  const [medSearchQuery, setMedSearchQuery] = useState('');
  const [selectedMedFamily, setSelectedMedFamily] = useState('Tous');
  const [posologyMode, setPosologyMode] = useState<'calculator' | 'manual'>('calculator');

  // Auto-update customPosology based on chronological inputs in step 2 (only in calculator mode)
  useEffect(() => {
    if (posologyMode === 'calculator') {
      setCustomPosology(`${posologyDose}, ${posologyFreq} pendant ${posologyDuration} (${posologyTiming})`);
    }
  }, [posologyDose, posologyFreq, posologyDuration, posologyTiming, posologyMode]);

  // Reset/sync state when active patient changes to prevent data leakage and load correct values
  useEffect(() => {
    if (patient) {
      setMotif(patient.motif || '');
      setMotifSymptoms([]);
      setMotifDuree('');
      setMotifUnite('jours');
      setSymptoms([]);
      setHmaText('');
      setSystemes({});
      setSystemDetails({});
      setSymptomesGeneraux({
        fièvre: false,
        asthénie: false,
        anorexie: false,
        amaigrissement: false
      });
      setConstantes({
        ta: patient.vitals?.bp || '',
        fc: patient.vitals?.pulse?.toString() || '',
        fr: patient.vitals?.respRate?.toString() || '',
        temp: patient.vitals?.temp?.toString() || '',
        sat: patient.vitals?.spo2?.toString() || ''
      });
      setEtatGeneral('');
      setExamenAppareils({});
      setHypotheses({ principal: '', differentiels: [] });
      setExamensDemandes([]);
      setPrescriptions([]);
      setOrientation('');
      setObservation('');
      setAntecedents({
        personnels: {
          medicaux: patient.antecedents?.personnels?.medicaux || '',
          chirurgicaux: patient.antecedents?.personnels?.chirurgicaux || '',
          immunoAllergiques: (patient.allergies || []).join(', ') || patient.antecedents?.personnels?.immunoAllergiques || '',
          toxicologiques: patient.antecedents?.personnels?.toxicologiques || '',
          environnementaux: patient.antecedents?.personnels?.environnementaux || '',
          obstetricaux: patient.antecedents?.personnels?.obstetricaux || ''
        },
        familiaux: patient.antecedents?.familiaux || ''
      });
    }
  }, [patient?.id]);

  // Listen to Addenda in real-time
  useEffect(() => {
    if (!patient?.id) return;
    try {
      const qAdd = query(
        collection(db, 'consultation_addenda'),
        where('patientId', '==', patient.id)
      );
      const unsub = onSnapshot(qAdd, (snap) => {
        const list: ConsultationAddendum[] = [];
        snap.docs.forEach(d => {
          const data = d.data() as any;
          list.push({
            id: d.id,
            consultationId: data.consultationId || '',
            patientId: data.patientId,
            date: data.date || '',
            time: data.time || '',
            timestamp: data.timestamp || '',
            authorId: data.authorId || '',
            authorName: data.authorName || 'Dr. Sarr',
            authorRole: data.authorRole || 'Médecin Référent',
            reason: data.reason || 'Observation complémentaire',
            content: data.content || ''
          });
        });
        list.sort((a, b) => new Date(a.timestamp || 0).getTime() - new Date(b.timestamp || 0).getTime());
        setAddenda(list);
      });
      return () => unsub();
    } catch (e) {
      console.warn("Could not listen to addenda:", e);
    }
  }, [patient?.id]);

  // Restore Auto-Save Draft on Mount (if not closed)
  useEffect(() => {
    if (!patient?.id || isReadOnly) return;
    const draftKey = `consultation_draft_${patient.id}`;
    try {
      const saved = localStorage.getItem(draftKey);
      if (saved) {
        const d = JSON.parse(saved);
        if (d.mode) setMode(d.mode);
        if (d.motif) setMotif(d.motif);
        if (d.motifSymptoms && d.motifSymptoms.length > 0) setMotifSymptoms(d.motifSymptoms);
        if (d.motifDuree) setMotifDuree(d.motifDuree);
        if (d.motifUnite) setMotifUnite(d.motifUnite);
        if (d.symptoms && d.symptoms.length > 0) setSymptoms(d.symptoms);
        if (d.hmaText) setHmaText(d.hmaText);
        if (d.antecedents) setAntecedents(d.antecedents);
        if (d.systemes) setSystemes(d.systemes);
        if (d.systemDetails) setSystemDetails(d.systemDetails);
        if (d.symptomesGeneraux) setSymptomesGeneraux(d.symptomesGeneraux);
        if (d.constantes) setConstantes(d.constantes);
        if (d.etatGeneral) setEtatGeneral(d.etatGeneral);
        if (d.examenAppareils) setExamenAppareils(d.examenAppareils);
        if (d.hypotheses) setHypotheses(d.hypotheses);
        if (d.examensDemandes && d.examensDemandes.length > 0) {
          const map = new Map<string, any>();
          d.examensDemandes.forEach((e: any) => {
            const key = (e.name || '').toLowerCase().trim();
            if (key && !map.has(key)) {
              map.set(key, { ...e, id: e.id || `exam-${Date.now()}-${Math.floor(Math.random() * 1000)}` });
            }
          });
          setExamensDemandes(Array.from(map.values()));
        }
        if (d.prescriptions && d.prescriptions.length > 0) {
          const map = new Map<string, any>();
          d.prescriptions.forEach((p: any) => {
            const key = (p.name || '').toLowerCase().trim();
            if (key && !map.has(key)) {
              map.set(key, { ...p, id: p.id || `med-${Date.now()}-${Math.floor(Math.random() * 1000)}` });
            }
          });
          setPrescriptions(Array.from(map.values()));
        }
        if (d.orientation) setOrientation(d.orientation);
        if (d.observation) setObservation(d.observation);
        if (d.savedTimeStr) setLastAutoSavedAt(d.savedTimeStr);
        setDraftToastVisible(true);
        setTimeout(() => setDraftToastVisible(false), 4500);
      }
    } catch (e) {
      console.warn("Could not parse draft:", e);
    }
  }, [patient?.id, isReadOnly]);

  // Debounced Auto-Save to localStorage
  useEffect(() => {
    if (isReadOnly || !patient?.id) return;
    setIsAutoSaving(true);
    const draftKey = `consultation_draft_${patient.id}`;
    const timer = setTimeout(() => {
      const now = new Date();
      const timeStr = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const draftData = {
        mode,
        motif,
        motifSymptoms,
        motifDuree,
        motifUnite,
        symptoms,
        hmaText,
        antecedents,
        systemes,
        systemDetails,
        symptomesGeneraux,
        constantes,
        etatGeneral,
        examenAppareils,
        hypotheses,
        examensDemandes,
        prescriptions,
        orientation,
        observation,
        savedAt: now.toISOString(),
        savedTimeStr: timeStr
      };
      try {
        localStorage.setItem(draftKey, JSON.stringify(draftData));
        setLastAutoSavedAt(timeStr);
      } catch (err) {
        console.warn("Auto-save storage warning:", err);
      } finally {
        setIsAutoSaving(false);
      }
    }, 1200);

    return () => clearTimeout(timer);
  }, [
    patient?.id, isReadOnly, mode, motif, motifSymptoms, motifDuree, motifUnite,
    symptoms, hmaText, antecedents, systemes, systemDetails, symptomesGeneraux,
    constantes, etatGeneral, examenAppareils, hypotheses, examensDemandes,
    prescriptions, orientation, observation
  ]);

  // Save Addendum Handler
  const handleSaveAddendum = async () => {
    if (!addendumContent.trim() || !patient?.id) {
      alert("Veuillez rédiger le texte de votre addendum médico-légal.");
      return;
    }
    setIsSavingAddendum(true);
    const now = new Date();
    const dateStr = now.toLocaleDateString('fr-FR');
    const timeStr = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    const addendumId = `ADD-${Math.floor(Math.random() * 1000000)}`;
    const consultationId = patient.consultationId || `CONS-${patient.id}`;

    const newAdd: ConsultationAddendum = {
      id: addendumId,
      consultationId: consultationId,
      patientId: patient.id,
      date: dateStr,
      time: timeStr,
      timestamp: now.toISOString(),
      authorId: user?.id || user?.email || 'doc-1',
      authorName: user?.name || 'Dr. Sarr',
      authorRole: user?.profession || user?.role || 'Médecin',
      reason: addendumReason,
      content: addendumContent.trim()
    };

    try {
      await setDoc(doc(db, 'consultation_addenda', addendumId), sanitizeData(newAdd));

      await addDoc(collection(db, 'audit_logs'), sanitizeData({
        user: user?.name || 'Docteur',
        role: user?.role || 'DOCTOR',
        date: dateStr,
        time: timeStr,
        timestamp: now.toISOString(),
        action: `Ajout Addendum Médico-Légal (${addendumReason}) - Patient: ${patient.lastName || ''} ${patient.firstName || ''}`,
        details: { addendumId, consultationId, reason: addendumReason },
        module: 'Consultation'
      }));

      setAddenda(prev => [...prev, newAdd]);
      setAddendumContent('');
      setShowAddendumModal(false);
      window.dispatchEvent(new CustomEvent('app-notification', { 
        detail: { message: `✓ Addendum médico-légal validé, signé et archivé avec succès.`, type: 'success' }
      }));
    } catch (err) {
      console.error("Error saving addendum:", err);
      alert("Erreur lors de l'enregistrement de l'addendum.");
    } finally {
      setIsSavingAddendum(false);
    }
  };

  // Synchronise le motif avec les variables structurées
  useEffect(() => {
    if (motifSymptoms.length === 0 && !motifDuree) {
      // If there are no structured symptoms or duration, keep the prepopulated motif.
      return;
    }
    
    let sympText = '';
    if (motifSymptoms.length === 1) {
      sympText = (motifSymptoms[0] || '').toLowerCase();
    } else if (motifSymptoms.length === 2) {
      sympText = `${(motifSymptoms[0] || '').toLowerCase()} et ${(motifSymptoms[1] || '').toLowerCase()}`;
    } else if (motifSymptoms.length === 3) {
      sympText = `${(motifSymptoms[0] || '').toLowerCase()}, ${(motifSymptoms[1] || '').toLowerCase()} et ${(motifSymptoms[2] || '').toLowerCase()}`;
    }

    if (sympText && motifDuree) {
      setMotif(`Motif de consultation : ${sympText} évoluant depuis ${motifDuree} ${motifUnite}`);
    } else if (sympText) {
      setMotif(`Motif de consultation : ${sympText}`);
    } else {
      setMotif('');
    }

    if (motifUnite === 'jours' && parseInt(motifDuree) >= 30) {
      setShowChroniqueAlert(true);
    } else {
      setShowChroniqueAlert(false);
    }
  }, [motifSymptoms, motifDuree, motifUnite]);

  // Synchronise History when Motif symptoms change
  useEffect(() => {
    // Basic sync: if a symptom is added in motif, add it conceptually to history if not there
    const updatedHistory = [...symptoms];
    let changed = false;
    motifSymptoms.forEach(s => {
      if (!s) return;
      if (!updatedHistory.find(h => (h?.name || '').toLowerCase() === (s || '').toLowerCase())) {
        updatedHistory.push({ 
          name: s, 
          characteristics: {},
          installation: '',
          conduiteType: '',
          conduiteDetails: {},
          evolution: '',
          delaiApparition: ''
        });
        changed = true;
      }
    });
    if (changed) {
      setSymptoms(updatedHistory);
    }
  }, [motifSymptoms]);

  // Generate HMA text dynamically
  useEffect(() => {
    if (symptoms.length === 0) {
      setHmaText('');
      return;
    }
    
    let txt = `Le début des symptômes remonterait à environ ${motifDuree || '[durée]'} ${motifUnite || 'jours'}`;
    
    symptoms.forEach((s, idx) => {
      if (!s) return;
      if (idx === 0) {
        txt += `, marqué par l'installation ${s.installation ? String(s.installation).toLowerCase() : '...'} d'`;
      } else {
        txt += `\npuis ${s.delaiApparition ? String(s.delaiApparition).toLowerCase() + ' plus tard' : 'secondairement'}, par l'apparition d'`;
      }
      
      let prefix = 'une ';
      const nameLower = (s.name || '').toLowerCase();
      if (['vomissements', 'vertiges', 'traumatismes'].some(x => nameLower.includes(x))) prefix = 'épisodes de ';
      else if (['toux', 'fatigue', 'dyspnée', 'diarrhée', 'fièvre'].some(x => nameLower.includes(x))) prefix = 'une ';
      else if (nameLower.match(/^[aeiouy]/)) prefix = 'une ';
      
      txt += `${prefix && prefix !== 'une ' ? prefix : (nameLower.match(/^[aeiouy]/) ? "une " : "une ")}${nameLower}`;
      
      let chars = [];
      const characteristics = s.characteristics || {};
      if (nameLower.includes('fièvre') && characteristics['température']) {
        chars.push(`chiffrée à ${characteristics['température']}°C`);
      }
      if (characteristics['localisation'] || characteristics['siège']) {
        chars.push(`localisée à ${characteristics['localisation'] || characteristics['siège']}`);
      }
      if (characteristics['type']) {
        const typeStr = String(characteristics['type'] || '');
        if (nameLower.includes('céphalée')) {
             chars.push(`en ${typeStr.toLowerCase()}`);
        } else {
             chars.push(`de type ${typeStr.toLowerCase()}`);
        }
      }
      if (characteristics['intensité']) {
        chars.push(`d'intensité ${characteristics['intensité']}/10`);
      }
      if (characteristics['irradiation']) {
        chars.push(`irradiant vers ${String(characteristics['irradiation'] || '').toLowerCase()}`);
      }
      if (characteristics['horaire']) {
        chars.push(`à prédominance ${String(characteristics['horaire'] || '').toLowerCase()}`);
      }
      if (characteristics['fréquence']) {
         chars.push(`à une fréquence de ${characteristics['fréquence']} fois/jour`);
      }
      if (characteristics['aspect']) {
         chars.push(`d'aspect ${String(characteristics['aspect'] || '').toLowerCase()}`);
      }
      // Any other custom characteristics added
      Object.keys(characteristics).forEach(k => {
         const knownKeys = ['température', 'localisation', 'siège', 'type', 'intensité', 'irradiation', 'horaire', 'fréquence', 'aspect'];
         if (!knownKeys.includes(k) && characteristics[k]) {
             chars.push(`${String(k).toLowerCase()} ${String(characteristics[k] || '').toLowerCase()}`);
         }
      });
      
      if (chars.length > 0) {
        txt += ` ${chars.join(', ')}`;
      }
      
      if (s.conduiteType) {
        if (s.conduiteType === 'automédication') {
           txt += `, motivant une automédication faite de ${s.conduiteDetails?.medicament || '[médicament]'} ${s.conduiteDetails?.dose ? `(${s.conduiteDetails.dose})` : ''} ${s.conduiteDetails?.frequence || ''} ${s.conduiteDetails?.duree ? `pendant ${s.conduiteDetails.duree}` : ''}`.replace(/\s+/g, ' ');
        } else if (s.conduiteType === 'consultation' || s.conduiteType === 'hospitalisation') {
           txt += `, motivant une ${s.conduiteType} dans une structure de type ${s.conduiteDetails?.structure || '[non précisée]'}, avec administration de ${s.conduiteDetails?.traitementRecu || '[aucun traitement]'} et réalisation de ${s.conduiteDetails?.actesRealises || '[aucun acte]'}`;
        } else if (s.conduiteType === 'abstention') {
           txt += `, motivant une abstention thérapeutique`;
        }
      }
      
      if (s.evolution) {
        txt += `. L'évolution sera marquée par une ${String(s.evolution).toLowerCase()}`;
      } else {
        txt += '.';
      }
    });
    
    setHmaText(txt.trim());
  }, [symptoms, motifDuree, motifUnite]);

  // Synchronise Systemes when Motif symptoms change
  useEffect(() => {
    const sysMap: Record<string, string[]> = {
      'Respiratoire': ['toux', 'dyspnée', 'douleur thoracique', 'hémoptysie'],
      'Digestif': ['abdominale', 'vomissements', 'diarrhée', 'méléna', 'hématémèse', 'nausée'],
      'Neuro': ['céphalée', 'vertige', 'convulsion', 'paralysie', 'coma'], // Neurologique
      'Gynéco': ['métrorragies', 'douleurs pelviennes', 'leucorrhée'], // Urogénital
      'Général': ['fièvre', 'fatigue', 'asthénie', 'anorexie']
    };
    
    setSystemes(prev => {
      const newSys = { ...prev };
      motifSymptoms.forEach(s => {
        if (!s) return;
        const lowerS = (s || '').toLowerCase();
        if (sysMap['Respiratoire'].some(x => lowerS.includes(x))) newSys['Respiratoire'] = true;
        if (sysMap['Digestif'].some(x => lowerS.includes(x))) newSys['Digestif'] = true;
        if (sysMap['Neuro'].some(x => lowerS.includes(x))) newSys['Neurologique'] = true;
        if (sysMap['Gynéco'].some(x => lowerS.includes(x))) newSys['Urogénital'] = true;
      });
      return newSys;
    });

    setSymptomesGeneraux(prev => {
      const newGen = { ...prev };
      motifSymptoms.forEach(s => {
        if (!s) return;
        const lowerS = (s || '').toLowerCase();
        if (lowerS.includes('fièvre')) newGen['fièvre'] = true;
        if (lowerS.includes('asthénie') || lowerS.includes('fatigue')) newGen['asthénie'] = true;
        if (lowerS.includes('anorexie') || lowerS.includes('appétit')) newGen['anorexie'] = true;
        if (lowerS.includes('amaigrissement') || lowerS.includes('poids')) newGen['amaigrissement'] = true;
      });
      return newGen;
    });
  }, [motifSymptoms]);

  const toggleSymptom = (s: string) => {
    setMotifSymptoms(prev => {
      if (prev.includes(s)) {
        return prev.filter(x => x !== s);
      } else {
        if (prev.length >= 3) return prev; // limit to 3
        
        // Add to recents
        setSymptomRecents(recs => {
          const filtered = recs.filter(r => r !== s);
          const updated = [s, ...filtered].slice(0, 5);
          localStorage.setItem('symptom_recs', JSON.stringify(updated));
          return updated;
        });

        return [...prev, s];
      }
    });
  };

  const tabs: {id: TabId, label: string, icon: any}[] = [
    { id: 'motif', label: 'Motif', icon: ClipboardList },
    { id: 'histoire', label: 'Histoire', icon: History },
    { id: 'antecedents', label: 'Antécédents', icon: FileText },
    { id: 'systemes', label: 'Systèmes', icon: Activity },
    { id: 'examen', label: 'Examen', icon: Stethoscope },
    { id: 'raisonnement', label: 'Raisonnement', icon: ClipboardList },
    { id: 'examens', label: 'Examens', icon: Beaker },
    { id: 'prise_en_charge', label: 'Prise en charge', icon: Pill },
    { id: 'observation', label: 'Observation', icon: FileText },
    { id: 'addenda', label: `Addenda (${addenda.length})`, icon: ShieldCheck }
  ];

  const generateObservation = () => {
    const obs = `
OBSERVATION MÉDICALE
-------------------
Patient: ${patient?.lastName} ${patient?.firstName} (${patient?.age} ans, ${patient?.gender})
Mode de consultation: ${mode}

MOTIF DE CONSULTATION:
${motif}

HISTOIRE DE LA MALADIE:
${hmaText || symptoms.map(s => `- ${s.name}: ${Object.entries(s.characteristics || {}).map(([k, v]) => `${k}=${v}`).join(', ')}`).join('\n')}

SYMPTÔMES GÉNÉRAUX:
${Object.entries(symptomesGeneraux).filter(([_, v]) => v).map(([k]) => `${k}${systemDetails[k] ? `: ${systemDetails[k]}` : ''}`).join(', ') || 'Néant'}

ENQUÊTE DES SYSTÈMES:
${Object.entries(systemes).filter(([_, v]) => v).map(([k]) => `${k}${systemDetails[k] ? `: ${systemDetails[k]}` : ''}`).join(', ') || 'Rien à signaler'}

ANTÉCÉDENTS PERSONNELS:
- Médicaux: ${antecedents.personnels.medicaux}
- Chirurgicaux: ${antecedents.personnels.chirurgicaux}
- Immuno-allergiques: ${antecedents.personnels.immunoAllergiques}
- Toxicologiques: ${antecedents.personnels.toxicologiques}
- Environnementaux: ${antecedents.personnels.environnementaux}
${mode === 'gynecologie' || mode === 'obstetrique' ? `- Obstétricaux: ${antecedents.personnels.obstetricaux}` : ''}

ANTÉCÉDENTS FAMILIAUX:
${antecedents.familiaux}

EXAMEN PHYSIQUE:
Constantes: TA: ${constantes.ta}, FC: ${constantes.fc}, FR: ${constantes.fr}, T°: ${constantes.temp}, Sat: ${constantes.sat}
État général: ${etatGeneral}
Examen par appareil:
${Object.entries(examenAppareils).map(([k, v]) => `- ${k}: ${v}`).join('\n')}

HYPOTHÈSES DIAGNOSTIQUES:
Principal: ${hypotheses.principal}
Différentiels: ${hypotheses.differentiels.join(', ')}

EXAMENS DEMANDÉS:
${examensDemandes.map(e => `- ${e.name} ${e.urgent ? '(URGENT)' : ''}`).join('\n')}

CONDUITE À TENIR:
Prescriptions:
${prescriptions.map(p => `- ${p.name}: ${p.posologie}`).join('\n')}
Orientation: ${orientation}
    `.trim();
    setObservation(obs);
  };

  const handleSave = () => {
    if (!motif) {
      alert("Le motif de consultation est obligatoire.");
      return;
    }
    onSave({
      mode,
      motif,
      symptoms,
      antecedents,
      constantes,
      etatGeneral,
      examenAppareils,
      hypotheses,
      examensDemandes,
      prescriptions,
      orientation,
      observation
    });
  };

  const handleTriggerHospitalize = () => {
    if (onHospitalize) {
      onHospitalize({
        motif: motif,
        observation: observation,
        diagnosis: hypotheses.principal
      });
    }
  };

  const executeCloturer = () => {
    setShowUnsentWarningModal(false);
    setUnsentPendingAction(null);

    if (isSubmittingClotureRef.current) return;
    isSubmittingClotureRef.current = true;
    setTimeout(() => { isSubmittingClotureRef.current = false; }, 2000);

    const finalMotif = motif || "Consultation";
    if (patient?.id) {
      try {
        localStorage.removeItem(`consultation_draft_${patient.id}`);
      } catch (e) {
        console.warn("Draft cleanup error:", e);
      }
    }
    if (onCloturer) {
      onCloturer({
        mode,
        motif: finalMotif,
        symptoms,
        antecedents,
        constantes,
        etatGeneral,
        examenAppareils,
        hypotheses,
        examensDemandes,
        prescriptions,
        orientation,
        observation
      });
    }
  };

  const executeClose = () => {
    setShowUnsentWarningModal(false);
    setUnsentPendingAction(null);
    onClose();
  };

  const handleTransmitAllPendingOrders = async () => {
    let transmittedCount = 0;
    const today = new Date();
    const dateStr = today.toLocaleDateString('fr-FR');
    const timeStr = today.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

    // 1. Transmit Prescriptions if not sent
    if (prescriptions.length > 0 && !isPrescriptionTransmitted) {
      try {
        // Strict deduplication by normalized name
        const uniquePrescriptions = Array.from(
          prescriptions.reduce((map, p: any) => {
            const key = (p.name || '').trim().toLowerCase();
            if (key && !map.has(key)) map.set(key, p);
            return map;
          }, new Map<string, any>()).values()
        );

        const prescriptionId = `ORD-${Math.floor(Math.random() * 1000000)}`;
        await setDoc(doc(db, 'pending_prescriptions', prescriptionId), {
          id: prescriptionId,
          patientId: patient?.id || 'unknown',
          patient: `${patient?.lastName || ''} ${patient?.firstName || ''}`.trim() || patient?.nom || 'Patient',
          doctor: user?.name || 'Dr. Sarr',
          date: dateStr,
          items: uniquePrescriptions.map((p: any) => ({
            name: p.name,
            posology: p.posologie || 'Selon prescription',
            price: p.price || 1500
          })),
          createdAt: today.toISOString(),
          status: 'pending'
        });

        // Prescription bill is routed exclusively to Pharmacy POS
        setIsPrescriptionTransmitted(true);
        transmittedCount++;
      } catch (err) {
        console.error("Auto prescription transmit error:", err);
      }
    }

    // 2. Transmit Lab Exams if not sent
    if (examensDemandes.length > 0 && !isExamsTransmitted) {
      try {
        // Strict deduplication by normalized name
        const uniqueExams = Array.from(
          examensDemandes.reduce((map, e: any) => {
            const key = (e.name || '').trim().toLowerCase();
            if (key && !map.has(key)) map.set(key, e);
            return map;
          }, new Map<string, any>()).values()
        );

        const labRequestId = `LAB-${Math.floor(Math.random() * 1000000)}`;
        await setDoc(doc(db, 'lab_requests', labRequestId), {
          id: labRequestId,
          patientId: patient?.id || 'unknown',
          patientName: `${patient?.lastName || ''} ${patient?.firstName || ''}`.trim() || patient?.nom || 'Patient',
          consultationId: patient?.consultationId || `CONS-${Math.floor(Math.random() * 1000000)}`,
          prescriberName: user?.name || 'Dr. Sarr',
          date: dateStr,
          time: timeStr,
          status: 'pending',
          exams: uniqueExams.map((e: any) => ({
            name: e.name,
            urgent: e.urgent || false
          })),
          createdAt: today.toISOString()
        });

        const invoiceItems = uniqueExams.map((e: any, idx: number) => {
          const itemPrice = e.price || 2500;
          return {
            id: `item-exam-${labRequestId}-${idx}`,
            name: `Examen Lab : ${e.name}`,
            quantity: 1,
            unitPrice: itemPrice,
            totalPrice: itemPrice
          };
        });

        const totalAmount = invoiceItems.reduce((sum: number, item: any) => sum + item.totalPrice, 0);
        const invoiceId = `PR-${Math.floor(Math.random() * 1000000)}`;
        await setDoc(doc(db, 'payment_requests', invoiceId), {
          id: invoiceId,
          patientId: patient?.id || 'unknown',
          patientName: `${patient?.lastName || ''} ${patient?.firstName || ''}`.trim() || patient?.nom || 'Patient',
          requestingService: 'Consultation',
          sourceModule: 'Consultation',
          type: 'LABORATOIRE',
          items: invoiceItems,
          totalAmount: totalAmount,
          amountPaid: 0,
          status: 'PENDING',
          createdAt: today.toISOString(),
          createdBy: user?.name || 'Docteur'
        });

        setIsExamsTransmitted(true);
        setExamensDemandes(prev => prev.map(e => ({ ...e, status: e.status === 'demandé' ? 'payé' : e.status })));
        transmittedCount++;
      } catch (err) {
        console.error("Auto exams transmit error:", err);
      }
    }

    if (transmittedCount > 0) {
      window.dispatchEvent(new CustomEvent('app-notification', { 
        detail: `✓ Examens et Ordonnances transmis automatiquement à la Pharmacie, au Laboratoire et à la Caisse.` 
      }));
    }
  };

  const handleTransmitAndProceed = async () => {
    await handleTransmitAllPendingOrders();
    if (unsentPendingAction === 'CLOTURER') {
      executeCloturer();
    } else {
      executeClose();
    }
  };

  const handleForceProceedWithoutSending = () => {
    if (unsentPendingAction === 'CLOTURER') {
      executeCloturer();
    } else {
      executeClose();
    }
  };

  const handleTriggerCloturer = () => {
    // Unsent orders guardrail check
    const hasUnsentPrescr = prescriptions.length > 0 && !isPrescriptionTransmitted;
    const hasUnsentEx = examensDemandes.length > 0 && !isExamsTransmitted;

    if (hasUnsentPrescr || hasUnsentEx) {
      setUnsentPendingAction('CLOTURER');
      setShowUnsentWarningModal(true);
      return;
    }

    executeCloturer();
  };

  const handleTriggerSendPrescription = () => {
    if (isSubmittingPrescrRef.current || isPrescriptionTransmitted) return;
    isSubmittingPrescrRef.current = true;
    setTimeout(() => { isSubmittingPrescrRef.current = false; }, 2000);

    if (onSendPrescription) {
      onSendPrescription({
        mode,
        motif,
        symptoms,
        antecedents,
        constantes,
        etatGeneral,
        examenAppareils,
        hypotheses,
        examensDemandes,
        prescriptions,
        orientation,
        observation
      });
      setIsPrescriptionTransmitted(true);
    }
  };

  const handleTriggerSendExams = () => {
    if (isSubmittingExamsRef.current || isExamsTransmitted) return;
    isSubmittingExamsRef.current = true;
    setTimeout(() => { isSubmittingExamsRef.current = false; }, 2000);

    if (onSendExams) {
      onSendExams({
        mode,
        motif,
        symptoms,
        antecedents,
        constantes,
        etatGeneral,
        examenAppareils,
        hypotheses,
        examensDemandes,
        prescriptions,
        orientation,
        observation
      });
      setIsExamsTransmitted(true);
    }
  };

  useEffect(() => {
    const handleSaveDraftEv = () => {
      handleSave();
    };
    const handleCloturerEv = () => {
      handleTriggerCloturer();
    };
    const handleSendPrescriptionEv = () => {
      handleTriggerSendPrescription();
    };
    const handleSendExamsEv = () => {
      handleTriggerSendExams();
    };

    window.addEventListener('trigger-consultation-save-draft', handleSaveDraftEv);
    window.addEventListener('trigger-consultation-cloturer', handleCloturerEv);
    window.addEventListener('trigger-consultation-send-prescription', handleSendPrescriptionEv);
    window.addEventListener('trigger-consultation-send-exams', handleSendExamsEv);

    return () => {
      window.removeEventListener('trigger-consultation-save-draft', handleSaveDraftEv);
      window.removeEventListener('trigger-consultation-cloturer', handleCloturerEv);
      window.removeEventListener('trigger-consultation-send-prescription', handleSendPrescriptionEv);
      window.removeEventListener('trigger-consultation-send-exams', handleSendExamsEv);
    };
  }, [mode, motif, symptoms, antecedents, constantes, etatGeneral, examenAppareils, hypotheses, examensDemandes, prescriptions, orientation, observation, onSave, onCloturer, onSendPrescription, onSendExams, isPrescriptionTransmitted, isExamsTransmitted]);

  const handleClose = () => {
    // Unsent orders guardrail check on exit
    const hasUnsentPrescr = prescriptions.length > 0 && !isPrescriptionTransmitted;
    const hasUnsentEx = examensDemandes.length > 0 && !isExamsTransmitted;

    if (hasUnsentPrescr || hasUnsentEx) {
      setUnsentPendingAction('EXIT');
      setShowUnsentWarningModal(true);
      return;
    }

    executeClose();
  };






  if (!mode) {
    const specialtiesList = [
      {
        id: 'medecine_generale',
        label: 'Médecine Générale',
        desc: 'Suivi de l\'adulte, pathologies générales, aiguës et chroniques.',
        icon: Stethoscope,
        color: 'text-indigo-600 border-indigo-100',
        bg: 'bg-indigo-50/60',
        border: 'hover:border-indigo-500 hover:bg-indigo-50/10 hover:shadow-indigo-500/5',
        badge: 'Médecine Interne'
      },
      {
        id: 'pediatrie',
        label: 'Pédiatrie',
        desc: 'Développement de l\'enfant, croissance et pathologies pédiatriques.',
        icon: Baby,
        color: 'text-purple-600 border-purple-100',
        bg: 'bg-purple-50/60',
        border: 'hover:border-purple-500 hover:bg-purple-50/10 hover:shadow-purple-500/5',
        badge: 'Moins de 15 ans'
      },
      {
        id: 'gynecologie',
        label: 'Gynécologie',
        desc: 'Santé de la femme, dépistages gynécologiques et contraception.',
        icon: Heart,
        color: 'text-rose-600 border-rose-100',
        bg: 'bg-rose-50/60',
        border: 'hover:border-rose-500 hover:bg-rose-50/10 hover:shadow-rose-500/5',
        badge: 'Gynécologie Médicale'
      },
      {
        id: 'obstetrique',
        label: 'Obstétrique',
        desc: 'Suivi de grossesse, consultations prénatales (CPN) et maternité.',
        icon: Activity,
        color: 'text-pink-600 border-pink-100',
        bg: 'bg-pink-50/60',
        border: 'hover:border-pink-500 hover:bg-pink-50/10 hover:shadow-pink-500/5',
        badge: 'Grossesse & CPN'
      },
      {
        id: 'chirurgie',
        label: 'Chirurgie',
        desc: 'Évaluation pré/post-opératoire et actes de petite chirurgie.',
        icon: Scissors,
        color: 'text-teal-600 border-teal-100',
        bg: 'bg-teal-50/60',
        border: 'hover:border-teal-500 hover:bg-teal-50/10 hover:shadow-teal-500/5',
        badge: 'Consultation Chirurgicale'
      },
      {
        id: 'traumatologie',
        label: 'Traumatologie',
        desc: 'Pathologies osseuses, musculaires et traumatologie aiguë.',
        icon: Activity,
        color: 'text-amber-600 border-amber-100',
        bg: 'bg-amber-50/60',
        border: 'hover:border-amber-500 hover:bg-amber-50/10 hover:shadow-amber-500/5',
        badge: 'Appareil Locomoteur'
      }
    ];

    return (
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col p-8 border border-slate-150 overflow-hidden animate-in zoom-in-95 duration-300">
          
          {/* Header */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6 pb-6 border-b border-slate-100 shrink-0">
            <div>
              <span className="inline-flex items-center gap-1.5 bg-blue-50 text-blue-700 border border-blue-100 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider mb-2">
                <Activity size={12} /> Espace Clinique
              </span>
              <h2 className="text-2xl font-black text-slate-900 tracking-tight">Configuration de la consultation</h2>
              <p className="text-xs text-slate-500 font-semibold italic mt-0.5">Veuillez sélectionner le type de consultation adapté pour ce patient.</p>
            </div>
          </div>

          {/* Grid of Specialties - Scrollable Area */}
          <div className="flex-1 overflow-y-auto pr-2 min-h-0 py-2 custom-scrollbar">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {specialtiesList.map(m => {
                const IconComponent = m.icon;
                return (
                  <button
                    key={m.id}
                    onClick={() => setMode(m.id as ConsultationMode)}
                    className={`group relative p-6 rounded-2xl border border-slate-200/80 bg-white transition-all duration-300 flex flex-col items-start text-left cursor-pointer ${m.border}`}
                  >
                    {/* Badge top right */}
                    <span className="absolute top-4 right-4 bg-slate-100 group-hover:bg-white text-slate-500 text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md transition-colors">
                      {m.badge}
                    </span>

                    {/* Icon wrapper */}
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 border transition-all ${m.bg} ${m.color} group-hover:scale-110`}>
                      <IconComponent size={24} />
                    </div>

                    {/* Text details */}
                    <h3 className="font-extrabold text-slate-900 group-hover:text-blue-600 transition-colors text-base mb-1.5">{m.label}</h3>
                    <p className="text-xs text-slate-500 font-semibold leading-relaxed mb-2">{m.desc}</p>
                    
                    {/* Dynamic action link indicator */}
                    <div className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-blue-600 opacity-0 group-hover:opacity-100 transition-all duration-300 mt-auto pt-1">
                      Sélectionner <ChevronRight size={12} className="translate-x-0 group-hover:translate-x-1 transition-transform" />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Footer Actions */}
          <div className="mt-6 pt-6 border-t border-slate-100 flex justify-between items-center shrink-0">
            <p className="text-[10px] text-slate-400 font-extrabold uppercase tracking-widest">SIH Hospitalier v3.5</p>
            <button 
              onClick={handleClose} 
              className="px-6 py-2.5 bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200/60 rounded-xl font-bold text-xs uppercase tracking-wider transition-all"
            >
              Annuler & Fermer
            </button>
          </div>

        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-md z-50 flex items-center justify-center p-2 sm:p-3 md:p-4 overflow-hidden animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl md:rounded-3xl shadow-2xl w-[96vw] h-[96vh] max-w-[98vw] max-h-[98vh] flex flex-col overflow-hidden border border-slate-200/80">
        {/* Header */}
        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/90 backdrop-blur shrink-0">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
                <Activity className="text-blue-600" /> Consultation Médicale
              </h2>
              {isReadOnly ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-100/80 text-amber-900 text-[10px] font-black uppercase tracking-wider rounded-lg border border-amber-300 shadow-xs">
                  <Lock size={12} className="text-amber-700" /> Dossier Clôturé & Invariable
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 text-emerald-700 text-[10px] font-black uppercase tracking-wider rounded-lg border border-emerald-200">
                  <span className={`w-2 h-2 rounded-full ${isAutoSaving ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}`}></span>
                  {isAutoSaving ? 'Sauvegarde brouillon...' : lastAutoSavedAt ? `Brouillon auto-sauvegardé (${lastAutoSavedAt})` : 'Brouillon actif'}
                </span>
              )}
            </div>
            <p className="text-sm text-slate-500 font-medium mt-0.5">
              Patient: <span className="font-bold text-slate-800">{patient?.lastName} {patient?.firstName}</span> ({patient?.age || 35} ans) • Mode: <span className="uppercase text-blue-600 font-bold">{mode.replace('_', ' ')}</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isReadOnly && (
              <button 
                type="button"
                onClick={() => setShowAddendumModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-sm transition-all cursor-pointer"
              >
                <Plus size={14} /> + Addendum
              </button>
            )}
            <button onClick={handleClose} className="p-2 hover:bg-slate-200 rounded-xl transition-colors text-slate-500" title="Fermer la consultation">
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Medico-Legal Immutability Lock Banner */}
        {isReadOnly && (
          <div className="bg-gradient-to-r from-amber-500/15 via-amber-500/10 to-amber-500/5 border-b border-amber-300/40 px-6 py-2.5 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-amber-500/20 flex items-center justify-center text-amber-800 font-bold shrink-0 border border-amber-400/30">
                <Lock size={15} />
              </div>
              <div>
                <h4 className="text-xs font-black text-amber-950 uppercase tracking-wide flex items-center gap-2">
                  Protection Médico-Légale Active (Verrouillage Post-Clôture)
                  <span className="text-[10px] text-amber-700 lowercase font-medium bg-amber-200/60 px-2 py-0.5 rounded-full font-mono font-bold">dossier scellé</span>
                </h4>
                <p className="text-[11px] text-amber-800/90 font-medium">
                  Les observations, antécédents, diagnostics et ordonnances sont en lecture seule. Pour consigner tout fait nouveau, veuillez rédiger un Addendum horodaté.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setActiveTab('addenda');
                setShowAddendumModal(true);
              }}
              className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-[11px] font-black uppercase tracking-wider shadow-xs transition-all flex items-center gap-1.5 shrink-0"
            >
              <Plus size={13} /> Rédiger un Addendum
            </button>
          </div>
        )}

        {/* Main Content */}
        <div className="flex flex-1 overflow-hidden min-h-0">
          {/* Sidebar Stepper - Strictly Read-Only / Non-clickable Navigation Lock */}
          <div className="w-52 md:w-60 bg-slate-50 border-r border-slate-200/80 p-3 shrink-0 flex flex-col justify-between overflow-y-auto custom-scrollbar select-none">
            <div>
              <div className="px-2 py-1.5 mb-2.5 border-b border-slate-200/60 flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-slate-600">
                  <Lock size={12} className="text-blue-600" />
                  <span>Parcours Séquentiel</span>
                </div>
                <span className="text-[10px] font-black text-blue-600 bg-blue-50 border border-blue-100 px-1.5 py-0.5 rounded-md">
                  {tabs.findIndex(t => t.id === activeTab) + 1}/{tabs.length}
                </span>
              </div>

              <div className="space-y-1.5">
                {tabs.map((tab, idx) => {
                  const currentIdx = tabs.findIndex(t => t.id === activeTab);
                  const isCurrent = activeTab === tab.id;
                  const isPast = idx < currentIdx;

                  return (
                    <div
                      key={tab.id}
                      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition-all pointer-events-none cursor-default select-none ${
                        isCurrent
                          ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20 ring-2 ring-blue-400/40'
                          : isPast
                          ? 'bg-emerald-50/90 text-emerald-900 border border-emerald-200/70'
                          : 'text-slate-400 bg-white/70 border border-slate-150/70 opacity-60'
                      }`}
                      title={`Étape ${idx + 1}: ${tab.label}`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div className={`w-5 h-5 rounded-lg flex items-center justify-center text-[10px] font-black shrink-0 ${
                          isCurrent 
                            ? 'bg-white/20 text-white' 
                            : isPast 
                            ? 'bg-emerald-600 text-white' 
                            : 'bg-slate-200 text-slate-500'
                        }`}>
                          {isPast ? '✓' : idx + 1}
                        </div>
                        <span className="truncate">{tab.label}</span>
                      </div>

                      {isPast ? (
                        <Check size={13} className="text-emerald-600 shrink-0 stroke-[3]" />
                      ) : isCurrent ? (
                        <ChevronRight size={13} className="text-white shrink-0 animate-pulse" />
                      ) : (
                        <Lock size={11} className="text-slate-300 shrink-0" />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="p-2.5 bg-blue-50/70 border border-blue-100 rounded-xl mt-3">
              <p className="text-[10px] font-black uppercase tracking-wider text-blue-900 flex items-center gap-1">
                <ShieldCheck size={12} className="text-blue-600" /> Flux Séquentiel
              </p>
              <p className="text-[10px] text-blue-800/80 font-medium mt-0.5 leading-snug">
                Progressez étape par étape avec les boutons « Précédent » et « Suivant » ci-dessous.
              </p>
            </div>
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-y-auto p-8 bg-white">
            {activeTab === 'motif' && (
              <div className="space-y-8 animate-in fade-in">
                <div>
                  <h3 className="text-lg font-black text-slate-800 border-b pb-2 mb-4">A. Sélection de symptômes</h3>
                  
                  <div className="space-y-6">
                    {/* Search & Custom Add */}
                    <div className="flex items-center gap-2">
                       <input 
                         type="text" 
                         value={symptomSearch}
                         onChange={e => setSymptomSearch(e.target.value)}
                         placeholder="Rechercher un symptôme dans les référentiels..."
                         className="flex-1 p-3 border border-slate-200 rounded-xl outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all font-semibold"
                       />
                       {symptomSearch && !symptom_catalog.some(s => (s?.label || '').toLowerCase() === symptomSearch.toLowerCase()) && ![...customSymptoms].some(s => (s || '').toLowerCase() === symptomSearch.toLowerCase()) && (
                         <button 
                           onClick={() => {
                             if (!customSymptoms.includes(symptomSearch)) {
                               setCustomSymptoms([...customSymptoms, symptomSearch]);
                             }
                             toggleSymptom(symptomSearch);
                             setSymptomSearch('');
                           }}
                           className="px-4 py-3 bg-blue-50 text-blue-700 font-bold rounded-xl whitespace-nowrap hover:bg-blue-100"
                         >
                           + Ajouter personnalisé
                         </button>
                       )}
                    </div>

                    {/* Limits Alert */}
                    {motifSymptoms.length >= 3 && (
                      <p className="text-sm font-bold text-amber-600 flex items-center gap-2 bg-amber-50 p-3 rounded-xl border border-amber-100">
                        <AlertCircle size={16} /> Maximum 3 symptômes autorisés pour structurer le motif principal
                      </p>
                    )}

                    {/* Quick Access Layers: Favorites and Recents */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Favorites */}
                      <div className="p-4 bg-amber-50/40 rounded-2xl border border-amber-100/50">
                        <p className="text-[10px] font-black uppercase tracking-widest text-amber-600 mb-2">Symptômes Favoris ★</p>
                        <div className="flex flex-wrap gap-2">
                          {symptomFavorites.map(fav => {
                            const isSelected = motifSymptoms.includes(fav);
                            return (
                              <div key={fav} className="flex gap-1">
                                <button
                                  type="button"
                                  onClick={() => toggleSymptom(fav)}
                                  className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-all ${
                                    isSelected 
                                      ? 'bg-amber-500 text-white border-amber-500 shadow-sm'
                                      : 'bg-white text-slate-600 border-slate-200 hover:bg-amber-50'
                                  }`}
                                  disabled={!isSelected && motifSymptoms.length >= 3}
                                >
                                  {fav}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSymptomFavorites(prev => {
                                      const updated = prev.filter(f => f !== fav);
                                      localStorage.setItem('symptom_favs', JSON.stringify(updated));
                                      return updated;
                                    });
                                  }}
                                  className="text-slate-300 hover:text-rose-500 text-xs px-1"
                                >
                                  ×
                                </button>
                              </div>
                            );
                          })}
                          {symptomFavorites.length === 0 && <p className="text-[11px] text-slate-400 italic">Aucun symptôme favori.</p>}
                        </div>
                      </div>

                      {/* Recents */}
                      <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Sélections Récentes ↻</p>
                        <div className="flex flex-wrap gap-2">
                          {symptomRecents.map(rec => {
                            const isSelected = motifSymptoms.includes(rec);
                            return (
                              <button
                                key={rec}
                                type="button"
                                onClick={() => toggleSymptom(rec)}
                                className={`px-2.5 py-1.5 text-xs font-bold rounded-lg border transition-all ${
                                  isSelected 
                                    ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                                }`}
                                disabled={!isSelected && motifSymptoms.length >= 3}
                              >
                                {rec}
                              </button>
                            );
                          })}
                          {symptomRecents.length === 0 && <p className="text-[11px] text-slate-400 italic">Aucune sélection récente.</p>}
                        </div>
                      </div>
                    </div>

                    {/* System tabs selector */}
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Trier par système anatomique</p>
                      <div className="flex flex-wrap gap-1.5 border-b pb-3 mb-3">
                        {['Tous', 'Général', 'Respiratoire', 'Digestif', 'Neurologique', 'Gynécologique', 'Cardio-vasculaire', 'Uro-néphrologique', 'Autre'].map(sys => (
                          <button
                            key={sys}
                            type="button"
                            onClick={() => setSymptomSystemFilter(sys)}
                            className={`px-3 py-1 text-xs font-black rounded-lg transition-all ${
                              symptomSystemFilter === sys 
                                ? 'bg-slate-900 text-white' 
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                          >
                            {sys}
                          </button>
                        ))}
                      </div>

                      {/* Symptom list from catalog */}
                      <div className="flex flex-wrap gap-2 max-h-[160px] overflow-y-auto p-2 border border-slate-100 rounded-2xl bg-slate-50/50">
                        {symptom_catalog
                          .filter(sc => {
                            // System filter
                            if (symptomSystemFilter !== 'Tous' && sc.category !== symptomSystemFilter) return false;
                            // Search query filter
                            if (symptomSearch && !(sc.label || '').toLowerCase().includes(symptomSearch.toLowerCase())) return false;
                            return true;
                          })
                          .map(sc => {
                            const isSelected = motifSymptoms.includes(sc.label);
                            const isFav = symptomFavorites.includes(sc.label);
                            return (
                              <div key={sc.label} className="flex bg-white rounded-xl border border-slate-200/60 shadow-xs hover:border-blue-200 transition-all">
                                <button 
                                  type="button" 
                                  onClick={() => toggleSymptom(sc.label)}
                                  className={`pl-3 pr-2 py-1.5 text-xs font-bold rounded-l-xl transition-all ${
                                    isSelected 
                                      ? 'bg-blue-600 text-white'
                                      : 'text-slate-600 hover:bg-slate-50'
                                  }`}
                                  disabled={!isSelected && motifSymptoms.length >= 3}
                                >
                                  {sc.label}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSymptomFavorites(prev => {
                                      const updated = prev.includes(sc.label)
                                        ? prev.filter(f => f !== sc.label)
                                        : [...prev, sc.label];
                                      localStorage.setItem('symptom_favs', JSON.stringify(updated));
                                      return updated;
                                    });
                                  }}
                                  className="px-2 border-l border-slate-100 hover:bg-amber-50 hover:text-amber-500 rounded-r-xl transition-all text-xs font-bold"
                                >
                                  {isFav ? '★' : '☆'}
                                </button>
                              </div>
                            )
                          })}
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-black text-slate-800 border-b pb-2 mb-4">B. Durée globale d'évolution</h3>
                  <div className="flex gap-4 items-center">
                    <input 
                      type="number"
                      min="1"
                      value={motifDuree}
                      onChange={e => setMotifDuree(e.target.value)}
                      placeholder="Ex: 3"
                      className="w-32 p-3 border border-slate-200 rounded-xl outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all font-bold text-center"
                    />
                    <select 
                      value={motifUnite}
                      onChange={e => setMotifUnite(e.target.value)}
                      className="p-3 border border-slate-200 rounded-xl outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all bg-white font-bold text-slate-700"
                    >
                      <option value="jours">Jours</option>
                      <option value="semaines">Semaines</option>
                    </select>
                  </div>
                  {showChroniqueAlert && (
                     <p className="text-sm font-bold text-amber-600 flex items-center gap-2 mt-3 p-3 bg-amber-50 rounded-xl border border-amber-100">
                        <AlertCircle size={16} /> Le motif de consultation correspond à une évolution chronique, vérifier la saisie.
                     </p>
                  )}
                </div>

                {motif && (
                  <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl">
                    <p className="text-sm font-bold text-slate-700">Texte généré :</p>
                    <p className="text-slate-600 italic mt-1">{motif}</p>
                  </div>
                )}
                
                <div className="pt-4 flex justify-end">
                  <button 
                    onClick={() => setActiveTab('histoire')}
                    disabled={motifSymptoms.length === 0 || !motifDuree}
                    className={`px-6 py-3 rounded-xl font-bold flex items-center gap-2 ${
                      motifSymptoms.length > 0 && motifDuree
                        ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-lg hover:shadow-blue-500/25'
                        : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                    } transition-all`}
                  >
                    Continuer <ChevronRight size={20} />
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'histoire' && (
              <div className="space-y-6 animate-in fade-in">
                <h3 className="text-lg font-black text-slate-800 border-b pb-2">Histoire de la maladie</h3>
                <div className="flex gap-2 mb-4">
                  <input 
                    type="text" 
                    placeholder="Ajouter un symptôme supplémentaire..." 
                    className="flex-1 p-3 border border-slate-200 rounded-xl outline-none"
                    onKeyDown={e => {
                      if (e.key === 'Enter' && e.currentTarget.value) {
                        setSymptoms([...symptoms, { name: e.currentTarget.value, characteristics: {} }]);
                        e.currentTarget.value = '';
                      }
                    }}
                  />
                </div>
                <div className="space-y-6">
                  {symptoms.map((s, i) => {
                    const charConfig = getCharacteristicsConfig(s.name);
                    return (
                      <div key={i} className="p-6 border border-slate-200 rounded-[24px] bg-white shadow-sm space-y-6 relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-1 h-full bg-blue-500"></div>
                        <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                          <h4 className="font-black text-slate-800 text-lg uppercase tracking-tight">
                            Symptôme {i + 1} : <span className="text-blue-600">{s.name}</span>
                          </h4>
                          <button onClick={() => setSymptoms(symptoms.filter((_, idx) => idx !== i))} className="text-rose-500 hover:bg-rose-50 p-2 rounded-xl transition-colors">
                            <X size={18} />
                          </button>
                        </div>

                        {/* Chronologie et Installation */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-2xl">
                          {i > 0 && (
                            <div>
                              <label className="text-[10px] font-bold text-slate-500 uppercase">Délai d'apparition</label>
                              <input 
                                type="text"
                                placeholder="ex: 2 jours plus tard"
                                value={s.delaiApparition || ''}
                                onChange={e => {
                                  const newSymp = [...symptoms];
                                  newSymp[i].delaiApparition = e.target.value;
                                  setSymptoms(newSymp);
                                }}
                                className="w-full p-3 text-sm border border-slate-200 rounded-xl outline-none focus:border-blue-500 font-medium"
                              />
                            </div>
                          )}
                          <div>
                            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Mode d'installation</label>
                            <div className="flex gap-2">
                              {['brutale', 'progressive'].map(mode => (
                                <button
                                  key={mode}
                                  onClick={() => {
                                    const newSymp = [...symptoms];
                                    newSymp[i].installation = mode;
                                    setSymptoms(newSymp);
                                  }}
                                  className={`flex-1 py-2 px-3 rounded-xl border text-sm font-bold capitalize transition-all ${
                                    s.installation === mode ? 'bg-blue-600 text-white border-blue-600 shadow-md' : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'
                                  }`}
                                >
                                  {mode}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* Caractéristiques cliniques */}
                        <div>
                          <h5 className="text-xs font-black text-slate-800 uppercase tracking-widest mb-3">Caractéristiques de {s.name}</h5>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {charConfig.map(char => (
                              <div key={char.key}>
                                <label className="text-[10px] font-bold text-slate-500 uppercase">{char.label}</label>
                                {char.type === 'select' ? (
                                  <select
                                    value={s.characteristics[char.key] || ''}
                                    onChange={e => {
                                      const newSymp = [...symptoms];
                                      newSymp[i].characteristics[char.key] = e.target.value;
                                      setSymptoms(newSymp);
                                    }}
                                    className="w-full p-2.5 text-sm font-medium border border-slate-200 rounded-xl outline-none focus:border-blue-500 bg-white"
                                  >
                                    <option value="">Sélectionner</option>
                                    {(char.options || []).map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                  </select>
                                ) : (
                                  <input 
                                    type={char.type}
                                    min={char.min}
                                    max={char.max}
                                    value={s.characteristics[char.key] || ''}
                                    onChange={e => {
                                      const newSymp = [...symptoms];
                                      newSymp[i].characteristics[char.key] = e.target.value;
                                      setSymptoms(newSymp);
                                    }}
                                    placeholder={`Saisir ${(char.label || '').toLowerCase()}`}
                                    className="w-full p-2.5 text-sm font-medium border border-slate-200 rounded-xl outline-none focus:border-blue-500"
                                  />
                                )}
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Conduite du patient */}
                        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                          <h5 className="text-xs font-black text-slate-800 uppercase tracking-widest mb-3">Conduite du patient</h5>
                          <div className="flex flex-wrap gap-2 mb-4">
                            {['automédication', 'consultation', 'hospitalisation', 'abstention'].map(type => (
                              <button
                                key={type}
                                onClick={() => {
                                  const newSymp = [...symptoms];
                                  newSymp[i].conduiteType = type;
                                  if (!newSymp[i].conduiteDetails) newSymp[i].conduiteDetails = {};
                                  setSymptoms(newSymp);
                                }}
                                className={`px-4 py-2 rounded-xl border text-sm font-bold capitalize transition-all ${
                                  s.conduiteType === type ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'
                                }`}
                              >
                                {type}
                              </button>
                            ))}
                          </div>

                          {s.conduiteType === 'automédication' && (
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                              {[
                                {k: 'medicament', l: 'Médicament'},
                                {k: 'dose', l: 'Dose (ex: 1g)'},
                                {k: 'frequence', l: 'Fréquence (ex: 3x/j)'},
                                {k: 'duree', l: 'Durée (ex: 2j)'}
                              ].map(f => (
                                <div key={f.k}>
                                  <label className="text-[10px] font-bold text-slate-500 uppercase">{f.l}</label>
                                  <input 
                                    type="text"
                                    value={s.conduiteDetails?.[f.k] || ''}
                                    onChange={e => {
                                      const newSymp = [...symptoms];
                                      newSymp[i].conduiteDetails[f.k] = e.target.value;
                                      setSymptoms(newSymp);
                                    }}
                                    className="w-full p-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-500"
                                  />
                                </div>
                              ))}
                            </div>
                          )}

                          {(s.conduiteType === 'consultation' || s.conduiteType === 'hospitalisation') && (
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                              {[
                                {k: 'structure', l: 'Structure / Clinique'},
                                {k: 'traitementRecu', l: 'Traitement Reçu'},
                                {k: 'actesRealises', l: 'Actes Réalisés'}
                              ].map(f => (
                                <div key={f.k}>
                                  <label className="text-[10px] font-bold text-slate-500 uppercase">{f.l}</label>
                                  <input 
                                    type="text"
                                    value={s.conduiteDetails?.[f.k] || ''}
                                    onChange={e => {
                                      const newSymp = [...symptoms];
                                      newSymp[i].conduiteDetails[f.k] = e.target.value;
                                      setSymptoms(newSymp);
                                    }}
                                    className="w-full p-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-500"
                                  />
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Évolution */}
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 uppercase block mb-2">Évolution du symptôme</label>
                          <div className="flex gap-2">
                            {['amélioration', 'persistance', 'aggravation'].map(evo => (
                              <button
                                key={evo}
                                onClick={() => {
                                  const newSymp = [...symptoms];
                                  newSymp[i].evolution = evo;
                                  setSymptoms(newSymp);
                                }}
                                className={`flex-1 py-2 px-3 rounded-xl border text-sm font-bold capitalize transition-all ${
                                  s.evolution === evo ? 'bg-amber-500 text-white border-amber-500 shadow-md' : 'bg-white text-slate-600 border-slate-200 hover:border-amber-300'
                                }`}
                              >
                                {evo}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  
                  {symptoms.length > 0 && hmaText && (
                    <div className="mt-8 p-6 bg-blue-50 border border-blue-100 rounded-[24px]">
                       <h4 className="font-black text-blue-900 text-sm uppercase tracking-widest mb-2 flex items-center gap-2">
                         <FileText size={16} /> Texte généré de l'HMA
                       </h4>
                       <p className="text-blue-800 leading-relaxed bg-white/50 p-4 rounded-xl border border-blue-100/50">{hmaText}</p>
                    </div>
                  )}

                  <div className="pt-4 flex justify-end">
                    <button 
                      onClick={() => setActiveTab('antecedents')}
                      disabled={symptoms.some(s => !s.evolution || !s.installation)}
                      className={`px-6 py-3 rounded-xl font-bold flex items-center gap-2 ${
                        symptoms.every(s => s.evolution && s.installation)
                          ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-lg hover:shadow-blue-500/25'
                          : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                      } transition-all`}
                    >
                      Continuer <ChevronRight size={20} />
                    </button>
                  </div>

                </div>
              </div>
            )}

            {activeTab === 'antecedents' && (
              <div className="space-y-10 animate-in fade-in pb-10">
                <div className="border-b border-slate-100 pb-4">
                  <h3 className="text-2xl font-black text-slate-800 flex items-center gap-2">
                    <FileText className="text-blue-600" size={24} /> Antécédents
                  </h3>
                  <p className="text-sm text-slate-500 font-medium mt-1">Renseignez l'historique médical personnel et familial du patient.</p>
                </div>

                {/* Section Personnels */}
                <div className="space-y-6">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-1 bg-blue-600 rounded-full"></div>
                    <h4 className="text-lg font-black text-slate-800 uppercase tracking-tight">I. Antécédents Personnels</h4>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Médicaux */}
                    <div className="bg-slate-50 p-6 rounded-[24px] border border-slate-100 space-y-4 hover:shadow-md transition-all">
                      <div className="flex justify-between items-center">
                        <label className="text-xs font-black text-slate-500 uppercase tracking-widest">A. Médicaux</label>
                        <VoiceDictationButton
                          currentValue={antecedents.personnels.medicaux}
                          onTranscript={text => setAntecedents({...antecedents, personnels: {...antecedents.personnels, medicaux: text}})}
                          fieldLabel="Antécédents Médicaux"
                        />
                      </div>
                      <textarea
                        value={antecedents.personnels.medicaux}
                        onChange={e => setAntecedents({...antecedents, personnels: {...antecedents.personnels, medicaux: e.target.value}})}
                        className="w-full p-4 border-2 border-slate-200 rounded-xl outline-none focus:border-blue-500 bg-white min-h-[100px] text-sm font-medium transition-all"
                        placeholder="Pathologies chroniques, hospitalisations antérieures..."
                      />
                    </div>

                    {/* Chirurgicaux */}
                    <div className="bg-slate-50 p-6 rounded-[24px] border border-slate-100 space-y-4 hover:shadow-md transition-all">
                      <div className="flex justify-between items-center">
                        <label className="text-xs font-black text-slate-500 uppercase tracking-widest">B. Chirurgicaux</label>
                        <VoiceDictationButton
                          currentValue={antecedents.personnels.chirurgicaux}
                          onTranscript={text => setAntecedents({...antecedents, personnels: {...antecedents.personnels, chirurgicaux: text}})}
                          fieldLabel="Antécédents Chirurgicaux"
                        />
                      </div>
                      <textarea
                        value={antecedents.personnels.chirurgicaux}
                        onChange={e => setAntecedents({...antecedents, personnels: {...antecedents.personnels, chirurgicaux: e.target.value}})}
                        className="w-full p-4 border-2 border-slate-200 rounded-xl outline-none focus:border-blue-500 bg-white min-h-[100px] text-sm font-medium transition-all"
                        placeholder="Interventions, dates, complications..."
                      />
                    </div>

                    {/* Immuno-allergiques */}
                    <div className="bg-slate-50 p-6 rounded-[24px] border border-slate-100 space-y-4 hover:shadow-md transition-all">
                      <div className="flex justify-between items-center">
                        <label className="text-xs font-black text-slate-500 uppercase tracking-widest">C. Immuno-allergiques</label>
                        <VoiceDictationButton
                          currentValue={antecedents.personnels.immunoAllergiques}
                          onTranscript={text => setAntecedents({...antecedents, personnels: {...antecedents.personnels, immunoAllergiques: text}})}
                          fieldLabel="Antécédents Allergiques"
                        />
                      </div>
                      <textarea
                        value={antecedents.personnels.immunoAllergiques}
                        onChange={e => setAntecedents({...antecedents, personnels: {...antecedents.personnels, immunoAllergiques: e.target.value}})}
                        className="w-full p-4 border-2 border-rose-100 rounded-xl outline-none focus:border-rose-500 bg-white min-h-[100px] text-sm font-medium transition-all"
                        placeholder="Allergies alimentaires, médicamenteuses, atopie..."
                      />
                    </div>

                    {/* Toxicologiques */}
                    <div className="bg-slate-50 p-6 rounded-[24px] border border-slate-100 space-y-4 hover:shadow-md transition-all">
                      <div className="flex justify-between items-center">
                        <label className="text-xs font-black text-slate-500 uppercase tracking-widest">D. Toxicologiques</label>
                        <VoiceDictationButton
                          currentValue={antecedents.personnels.toxicologiques}
                          onTranscript={text => setAntecedents({...antecedents, personnels: {...antecedents.personnels, toxicologiques: text}})}
                          fieldLabel="Antécédents Toxicologiques"
                        />
                      </div>
                      <textarea
                        value={antecedents.personnels.toxicologiques}
                        onChange={e => setAntecedents({...antecedents, personnels: {...antecedents.personnels, toxicologiques: e.target.value}})}
                        className="w-full p-4 border-2 border-slate-200 rounded-xl outline-none focus:border-blue-500 bg-white min-h-[100px] text-sm font-medium transition-all"
                        placeholder="Tabac, Alcool, autres substances..."
                      />
                    </div>

                    {/* Environnementaux */}
                    <div className="bg-slate-50 p-6 rounded-[24px] border border-slate-100 space-y-4 hover:shadow-md transition-all">
                      <div className="flex justify-between items-center">
                        <label className="text-xs font-black text-slate-500 uppercase tracking-widest">E. Environnementaux</label>
                        <VoiceDictationButton
                          currentValue={antecedents.personnels.environnementaux}
                          onTranscript={text => setAntecedents({...antecedents, personnels: {...antecedents.personnels, environnementaux: text}})}
                          fieldLabel="Antécédents Environnementaux"
                        />
                      </div>
                      <textarea
                        value={antecedents.personnels.environnementaux}
                        onChange={e => setAntecedents({...antecedents, personnels: {...antecedents.personnels, environnementaux: e.target.value}})}
                        className="w-full p-4 border-2 border-slate-200 rounded-xl outline-none focus:border-blue-500 bg-white min-h-[100px] text-sm font-medium transition-all"
                        placeholder="Conditions de vie, profession, exposition..."
                      />
                    </div>

                    {/* Obstétricaux (si applicable) */}
                    {(mode === 'gynecologie' || mode === 'obstetrique') && (
                      <div className="bg-slate-50 p-6 rounded-[24px] border border-slate-100 space-y-4 hover:shadow-md transition-all">
                        <div className="flex justify-between items-center">
                          <label className="text-xs font-black text-slate-500 uppercase tracking-widest">F. Obstétricaux</label>
                          <VoiceDictationButton
                            currentValue={antecedents.personnels.obstetricaux}
                            onTranscript={text => setAntecedents({...antecedents, personnels: {...antecedents.personnels, obstetricaux: text}})}
                            fieldLabel="Antécédents Obstétricaux"
                          />
                        </div>
                        <textarea
                          value={antecedents.personnels.obstetricaux}
                          onChange={e => setAntecedents({...antecedents, personnels: {...antecedents.personnels, obstetricaux: e.target.value}})}
                          className="w-full p-4 border-2 border-slate-200 rounded-xl outline-none focus:border-blue-500 bg-white min-h-[100px] text-sm font-medium transition-all"
                          placeholder="Gestité, Parité, cycles..."
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* Section Familiaux */}
                <div className="space-y-6">
                   <div className="flex items-center gap-3">
                    <div className="h-8 w-1 bg-emerald-500 rounded-full"></div>
                    <h4 className="text-lg font-black text-slate-800 uppercase tracking-tight">II. Antécédents Familiaux</h4>
                  </div>
                  
                  <div className="bg-emerald-50/50 p-6 rounded-[24px] border border-emerald-100 space-y-4 hover:shadow-md transition-all">
                    <div className="flex justify-between items-center">
                      <label className="text-xs font-black text-emerald-700 uppercase tracking-widest">Antécédents du premier degré</label>
                      <VoiceDictationButton
                        currentValue={antecedents.familiaux}
                        onTranscript={text => setAntecedents({...antecedents, familiaux: text})}
                        fieldLabel="Antécédents Familiaux"
                      />
                    </div>
                    <textarea
                      value={antecedents.familiaux}
                      onChange={e => setAntecedents({...antecedents, familiaux: e.target.value})}
                      className="w-full p-4 border-2 border-emerald-100 rounded-xl outline-none focus:border-emerald-500 bg-white min-h-[120px] text-sm font-medium transition-all"
                      placeholder="Hypertension, Diabète, Cancer, Tuberculose familiale..."
                    />
                  </div>
                </div>

                <div className="pt-4 flex justify-end">
                   <button 
                    onClick={() => setActiveTab('systemes')}
                    className="px-8 py-4 bg-blue-600 text-white rounded-[20px] font-black uppercase tracking-widest text-xs flex items-center gap-2 hover:bg-blue-700 shadow-xl shadow-blue-500/20 transition-all active:scale-95"
                  >
                    Phase Suivante : Systèmes <ChevronRight size={18} />
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'systemes' && (
              <div className="space-y-8 animate-in fade-in">
                <div className="border-b border-slate-100 pb-4">
                  <h3 className="text-xl font-black text-slate-800">Enquête des systèmes</h3>
                  <p className="text-sm text-slate-500">Sélectionnez les systèmes présentant des anomalies.</p>
                </div>

                <div className="bg-slate-50 p-6 rounded-[24px] border border-slate-100">
                  <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-4">I. Symptômes Généraux</h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {Object.keys(symptomesGeneraux).map(symp => (
                      <div key={symp} className="space-y-2">
                        <button
                          onClick={() => setSymptomesGeneraux({...symptomesGeneraux, [symp]: !symptomesGeneraux[symp]})}
                          className={`w-full p-4 rounded-xl border-2 text-left transition-all ${
                            symptomesGeneraux[symp] ? 'border-orange-500 bg-orange-50 shadow-sm' : 'border-white bg-white hover:border-orange-200 shadow-sm'
                          }`}
                        >
                          <div className="flex justify-between items-center">
                            <span className="font-bold text-sm text-slate-700 capitalize">{symp}</span>
                            {symptomesGeneraux[symp] && <CheckCircle2 size={16} className="text-orange-600" />}
                          </div>
                        </button>
                        
                        {symptomesGeneraux[symp] && (
                          <div className="animate-in slide-in-from-top-2 duration-200">
                             <div className="p-3 bg-white border border-orange-100 rounded-xl shadow-sm space-y-2">
                               <div className="flex justify-between items-center">
                                 <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Précisions ({symp})</label>
                               </div>
                               <textarea
                                 value={systemDetails[symp] || ''}
                                 onChange={(e) => setSystemDetails({...systemDetails, [symp]: e.target.value})}
                                 placeholder="Détails..."
                                 className="w-full p-2 text-xs border border-slate-100 rounded-lg outline-none focus:border-orange-300 min-h-[50px] resize-none"
                               />
                             </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest ml-2">II. Revue par Système</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {system_review_catalog.map(item => {
                      const sys = item.system;
                      return (
                        <div key={sys} className="space-y-2">
                          <button
                            onClick={() => setSystemes({...systemes, [sys]: !systemes[sys]})}
                            className={`w-full p-4 rounded-xl border-2 text-left transition-all ${
                              systemes[sys] ? 'border-blue-500 bg-blue-50 shadow-sm' : 'border-slate-100 bg-white hover:border-blue-200 shadow-sm'
                            }`}
                          >
                            <div className="flex justify-between items-center">
                              <span className="font-bold text-sm text-slate-705">{sys}</span>
                              {systemes[sys] && <CheckCircle2 size={16} className="text-blue-600" />}
                            </div>
                          </button>
                          
                          {systemes[sys] && (
                            <div className="animate-in slide-in-from-top-2 duration-200">
                               <div className="p-3 bg-white border border-blue-100 rounded-xl shadow-sm space-y-3">
                                 {/* Symptom chips for quick generation */}
                                 <div className="flex flex-wrap gap-1 border-b border-dashed border-slate-100 pb-2.5">
                                   <p className="text-[8px] font-black uppercase text-slate-400 w-full mb-1">Cliquer pour insérer :</p>
                                   {item.symptoms.map(s => {
                                     const currentVal = systemDetails[sys] || '';
                                     const hasSymptom = currentVal.includes(s);
                                     return (
                                       <button
                                         key={s}
                                         type="button"
                                         onClick={() => {
                                           let newVal = currentVal;
                                           if (hasSymptom) {
                                             newVal = currentVal.replace(new RegExp(`\\b${s}\\b,?\\s*|\\s*,?\\s*\\b${s}\\b`), '').trim();
                                             if (newVal.endsWith(',')) newVal = newVal.slice(0, -1);
                                           } else {
                                             newVal = currentVal ? `${currentVal}, ${s}` : s;
                                           }
                                           setSystemDetails({
                                             ...systemDetails,
                                             [sys]: newVal
                                           });
                                         }}
                                         className={`px-2 py-1 text-[10px] font-bold rounded ${
                                           hasSymptom 
                                             ? 'bg-blue-100 text-blue-700' 
                                             : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
                                         }`}
                                       >
                                         {s}
                                       </button>
                                     );
                                   })}
                                 </div>

                                 <div className="flex justify-between items-center">
                                   <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Symptômes observés ({sys})</label>
                                 </div>
                                 <textarea
                                   value={systemDetails[sys] || ''}
                                   onChange={(e) => setSystemDetails({...systemDetails, [sys]: e.target.value})}
                                   placeholder="Précisez les symptômes ou complétez..."
                                   className="w-full p-2 text-xs border border-slate-100 rounded-lg outline-none focus:border-blue-300 min-h-[60px] resize-none font-medium"
                                 />
                               </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="pt-6 flex justify-end">
                   <button 
                    onClick={() => setActiveTab('examen')}
                    className="px-8 py-4 bg-blue-600 text-white rounded-[20px] font-black uppercase tracking-widest text-xs flex items-center gap-2 hover:bg-blue-700 shadow-xl shadow-blue-500/20 transition-all active:scale-95"
                  >
                    Phase Suivante : Examen <ChevronRight size={18} />
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'examen' && (
              <div className="space-y-6 animate-in fade-in">
                <h3 className="text-lg font-black text-slate-800 border-b pb-2">Examen Physique</h3>
                
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
                  <h4 className="font-bold text-slate-700 mb-3 text-sm uppercase">Constantes</h4>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    {Object.keys(constantes).map(c => (
                      <div key={c}>
                        <label className="text-[10px] font-bold text-slate-500 uppercase">{c}</label>
                        <input
                          type="text"
                          value={(constantes as any)[c]}
                          onChange={e => setConstantes({...constantes, [c]: e.target.value})}
                          className="w-full p-2 border border-slate-200 rounded-lg text-sm"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="font-bold text-slate-700 text-sm uppercase">État Général</label>
                    <VoiceDictationButton
                      currentValue={etatGeneral}
                      onTranscript={setEtatGeneral}
                      fieldLabel="État Général"
                    />
                  </div>
                  <textarea
                    value={etatGeneral}
                    onChange={e => setEtatGeneral(e.target.value)}
                    className="w-full p-3 border border-slate-200 rounded-xl outline-none focus:border-blue-500 bg-white"
                    rows={2}
                    placeholder="Bon état général / altéré, faciès, coloration des téguments..."
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 mb-2 block text-sm uppercase">Examen par appareil</label>
                  <div className="space-y-3">
                    {['Cardio-vasculaire', 'Pleuro-pulmonaire', 'Abdominal', 'Neurologique', 'ORL & Stomatologie', 'Locomoteur & Cutané'].map(app => (
                      <div key={app} className="flex flex-col sm:flex-row gap-2 sm:gap-3 items-start bg-slate-50/70 p-3 rounded-xl border border-slate-150">
                        <div className="sm:w-1/3 flex items-center justify-between w-full pt-1">
                          <span className="text-xs font-bold text-slate-700">{app}</span>
                          <VoiceDictationButton
                            currentValue={examenAppareils[app] || ''}
                            onTranscript={text => setExamenAppareils({...examenAppareils, [app]: text})}
                            fieldLabel={app}
                          />
                        </div>
                        <textarea
                          value={examenAppareils[app] || ''}
                          onChange={e => setExamenAppareils({...examenAppareils, [app]: e.target.value})}
                          placeholder={`Constatations pour ${(app || '').toLowerCase()}...`}
                          className="flex-1 w-full p-2.5 border border-slate-200 rounded-lg text-xs outline-none focus:border-blue-500 bg-white"
                          rows={2}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'raisonnement' && (() => {
              // State variables searchCim, favorites, recents, and selectedSpecialty are now declared at the top level of the component

              const toggleFavorite = (code: string) => {
                const newFavs = favorites.includes(code)
                  ? favorites.filter(c => c !== code)
                  : [...favorites, code];
                setFavorites(newFavs);
                localStorage.setItem('cim10_favs', JSON.stringify(newFavs));
              };

              const addRecent = (code: string) => {
                const newRecs = recents.includes(code)
                  ? [code, ...recents.filter(c => c !== code)].slice(0, 5)
                  : [code, ...recents].slice(0, 5);
                setRecents(newRecs);
                localStorage.setItem('cim10_recs', JSON.stringify(newRecs));
              };

              const filteredCim = (cim11_catalog || []).filter(c => {
                if (!c) return false;
                const searchLower = (searchCim || '').toLowerCase();
                const queryMatch = (c.code || '').toLowerCase().includes(searchLower) ||
                  (c.label || '').toLowerCase().includes(searchLower) ||
                  (c.chapter || '').toLowerCase().includes(searchLower) ||
                  (c.category || '').toLowerCase().includes(searchLower);
                
                const specMatch = selectedSpecialty === 'Tous' || c.specialty === selectedSpecialty;
                return queryMatch && specMatch;
              });

              const handleSelectDiagnosis = (c: any, forceDiff = false) => {
                addRecent(c.code);
                
                const diagText = `[${c.code}] ${c.label}`;
                if (forceDiff) {
                  if (!hypotheses.differentiels.includes(diagText)) {
                    setHypotheses({ ...hypotheses, differentiels: [...hypotheses.differentiels, diagText] });
                  }
                } else {
                  setHypotheses({ ...hypotheses, principal: diagText });
                }

                // Point 10 & 11: Auto-detection of linked clinical packs
                const linkedExams = diagnostic_exam_links[c.code];
                const linkedDrugs = diagnostic_drug_links[c.code];
                if (linkedExams || linkedDrugs) {
                  const confirmPack = window.confirm(
                    `📊 RECOMMANDATIONS CLINIQUES (Protocole Cible):\n\n` +
                    `Pour le diagnostic CIM-11 "${c.label}" : \n` +
                    (linkedExams ? `- Examens recommandés : ${linkedExams.join(', ')}\n` : '') +
                    (linkedDrugs ? `- Traitements conseillés : ${linkedDrugs.map(d => d.name).join(', ')}\n\n` : '\n') +
                    `Souhaitez-vous charger automatiquement ce pack d'ordonnances et d'examens ?`
                  );
                  if (confirmPack) {
                    if (linkedExams) {
                      let addedExamsCount = 0;
                      setExamensDemandes(prev => {
                        const updated = [...prev];
                        linkedExams.forEach(exName => {
                          const clean = exName.trim();
                          if (!updated.some(e => e.name.trim().toLowerCase() === clean.toLowerCase())) {
                            updated.push({ id: `exam-${Date.now()}-${Math.floor(Math.random() * 1000)}`, name: clean, urgent: false });
                            addedExamsCount++;
                          }
                        });
                        return updated;
                      });
                      if (addedExamsCount === 0) {
                        window.dispatchEvent(new CustomEvent('app-notification', { detail: `ℹ️ Tous les examens recommandés sont déjà présents dans le bulletin (aucun doublon).` }));
                      }
                    }
                    if (linkedDrugs) {
                      setPrescriptions(prev => {
                        const updated = [...prev];
                        linkedDrugs.forEach(dr => {
                          const clean = dr.name.trim();
                          const existingIdx = updated.findIndex(p => p.name.trim().toLowerCase() === clean.toLowerCase());
                          if (existingIdx >= 0) {
                            // Update existing without duplicating
                            updated[existingIdx] = {
                              ...updated[existingIdx],
                              posologie: dr.posology,
                              price: dr.price
                            };
                          } else {
                            updated.push({ id: `med-${Date.now()}-${Math.floor(Math.random() * 1000)}`, name: clean, posologie: dr.posology, price: dr.price });
                          }
                        });
                        return updated;
                      });
                    }
                  }
                }
              };

              return (
                <div className="space-y-6 animate-in fade-in">
                  <div className="flex justify-between items-center border-b pb-2">
                    <h3 className="text-lg font-black text-slate-800">Moteur Clinique CIM-11</h3>
                    <span className="text-[10px] font-black uppercase text-blue-600 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-100">CIM-11 (OMS) Standard</span>
                  </div>
                  
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Diagnostic Selections (Left 2 cols) */}
                    <div className="lg:col-span-2 space-y-6">
                      <div>
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 block">Diagnostic Principal (Requis pour clôturer la consultation)</label>
                        <div className="flex gap-3">
                          <input
                            type="text"
                            value={hypotheses.principal}
                            onChange={e => setHypotheses({...hypotheses, principal: e.target.value})}
                            className="flex-1 p-4 border-2 border-blue-100 bg-blue-50/50 rounded-2xl outline-none focus:border-blue-500 font-bold text-blue-900 text-sm shadow-inner"
                            placeholder="Sélectionnez dans le catalogue CIM-11 ou saisissez directement..."
                          />
                          {hypotheses.principal && (
                            <button 
                              type="button"
                              onClick={() => setHypotheses({...hypotheses, principal: ''})}
                              className="px-4 bg-slate-100 text-slate-500 rounded-2xl hover:bg-rose-50 hover:text-rose-600 transition-colors cursor-pointer text-xs font-bold"
                            >
                              Effacer
                            </button>
                          )}
                        </div>
                      </div>

                      <div>
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 block">Diagnostics Différentiels</label>
                        <div className="flex gap-2 mb-3">
                          <input
                            type="text"
                            id="custom-diff-input"
                            placeholder="Saisir et ajouter un diagnostic alternatif..."
                            className="flex-1 p-3 border border-slate-200 rounded-2xl outline-none text-xs font-semibold"
                            onKeyDown={e => {
                              if (e.key === 'Enter' && e.currentTarget.value) {
                                const val = e.currentTarget.value;
                                if (!hypotheses.differentiels.includes(val)) {
                                  setHypotheses({
                                    ...hypotheses, 
                                    differentiels: [...hypotheses.differentiels, val]
                                  });
                                }
                                e.currentTarget.value = '';
                              }
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const input = document.getElementById('custom-diff-input') as HTMLInputElement;
                              if (input && input.value) {
                                if (!hypotheses.differentiels.includes(input.value)) {
                                  setHypotheses({
                                    ...hypotheses,
                                    differentiels: [...hypotheses.differentiels, input.value]
                                  });
                                }
                                input.value = '';
                              }
                            }}
                            className="bg-slate-900 hover:bg-blue-600 text-white rounded-2xl px-5 text-xs font-bold transition-all cursor-pointer"
                          >
                            Ajouter
                          </button>
                        </div>
                        
                        <div className="flex flex-wrap gap-2">
                          {hypotheses.differentiels.map((d, i) => (
                            <span key={i} className="px-3.5 py-1.5 bg-slate-50 border border-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-2">
                              {d}
                              <button 
                                type="button"
                                onClick={() => setHypotheses({...hypotheses, differentiels: hypotheses.differentiels.filter((_, idx) => idx !== i)})} 
                                className="text-rose-500 hover:bg-rose-100 p-0.5 rounded cursor-pointer"
                              >
                                <X size={12} />
                              </button>
                            </span>
                          ))}
                          {hypotheses.differentiels.length === 0 && (
                            <p className="text-xs text-slate-400 italic">Aucun diagnostic différentiel défini.</p>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* CIM11 Interactive Catalogue Selector (Right 1 col) */}
                    <div className="lg:col-span-1 bg-slate-50 p-6 rounded-3xl border border-slate-200/60 max-h-[460px] overflow-y-auto custom-scrollbar flex flex-col gap-4">
                      <div>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Recherche CIM-11 OMS</p>
                        <div className="relative">
                          <input 
                            type="text" 
                            placeholder="Code CIM-11, libellé, chapitre..."
                            value={searchCim}
                            onChange={e => setSearchCim(e.target.value)}
                            className="w-full pl-3 pr-8 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-blue-500 shadow-xs"
                          />
                          {searchCim && (
                            <button onClick={() => setSearchCim('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                              <X size={14} />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Filter by Specialty */}
                      <div>
                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Filtrer par Spécialité</p>
                        <div className="flex flex-wrap gap-1">
                          {['Tous', 'Médecine Générale', 'Urgences', 'Maternité', 'Pédiatrie', 'Chirurgie', 'Traumatologie'].map(spec => (
                            <button
                              key={spec}
                              type="button"
                              onClick={() => setSelectedSpecialty(spec)}
                              className={`px-2 py-0.5 rounded text-[9px] font-bold transition-all ${
                                selectedSpecialty === spec 
                                  ? 'bg-blue-600 text-white' 
                                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                              }`}
                            >
                              {spec}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Favorites list */}
                      {!searchCim && favorites.length > 0 && (
                        <div>
                          <p className="text-[8px] font-black text-amber-500 uppercase tracking-widest mb-1.5">Favoris Cliniques ★</p>
                          <div className="space-y-1.5">
                            {cim11_catalog.filter(c => favorites.includes(c.code)).map(c => (
                              <div key={c.code} className="flex items-center justify-between p-2 bg-white rounded-lg border border-slate-100 text-[11px] font-semibold gap-2 hover:border-blue-300">
                                <button 
                                  onClick={() => handleSelectDiagnosis(c, false)}
                                  className="flex-1 text-left truncate hover:text-blue-600 cursor-pointer text-xs font-bold"
                                  type="button"
                                >
                                  <span className="font-mono text-[9px] bg-slate-100 px-1 py-0.5 rounded text-slate-500 mr-1.5 font-bold">{c.code}</span>
                                  {c.label}
                                </button>
                                <button type="button" onClick={() => toggleFavorite(c.code)} className="text-amber-500 hover:text-slate-300 cursor-pointer">
                                  ★
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Catalog view */}
                      <div>
                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
                          {searchCim ? 'Résultats de recherche' : 'Codes CIM-11 Référencés'}
                        </p>
                        <div className="space-y-1.5">
                          {filteredCim.map(c => (
                            <div key={c.code} className="flex flex-col p-2 bg-white rounded-xl border border-slate-100 text-[11px] font-semibold gap-1 hover:border-blue-300 transition-all">
                              <div className="flex items-center justify-between gap-1.5">
                                <button 
                                  type="button"
                                  onClick={() => {
                                    const setDiff = window.confirm(`Voulez-vous ajouter "${c.label}" comme diagnostic DIFFERENTIEL ?\n(Annuler l'ajoutera comme DIAGNOSTIC PRINCIPAL)`);
                                    handleSelectDiagnosis(c, setDiff);
                                  }}
                                  className="flex-1 text-left truncate hover:text-blue-600 cursor-pointer text-xs font-black text-slate-800"
                                >
                                  <span className="font-mono text-[9px] bg-slate-100 px-1 py-0.5 rounded text-slate-600 mr-1.5 font-bold">{c.code}</span>
                                  {c.label}
                                </button>
                                <button 
                                  type="button"
                                  onClick={() => toggleFavorite(c.code)} 
                                  className={favorites.includes(c.code) ? 'text-amber-500 cursor-pointer' : 'text-slate-300 hover:text-amber-500 cursor-pointer'}
                                >
                                  {favorites.includes(c.code) ? '★' : '☆'}
                                </button>
                              </div>
                              <div className="flex justify-between items-center text-[8px] text-slate-400 font-bold border-t border-slate-50 pt-1">
                                <span className="truncate max-w-[120px]">{c.chapter}</span>
                                <span className="bg-slate-100 px-1 rounded text-slate-500 uppercase">{c.specialty}</span>
                              </div>
                            </div>
                          ))}
                          {filteredCim.length === 0 && (
                            <p className="text-[10px] text-slate-400 italic">Aucun diagnostic correspondant.</p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {activeTab === 'examens' && (() => {
              // Predefined catalog of exams
              const EXAMS_CATALOG = dbExams.length > 0 ? dbExams : [
                { name: 'NFS (Hémogramme)', price: 4000, category: 'Hématologie' },
                { name: 'TDR Paludisme / Goutte Épaisse', price: 2000, category: 'Parasitologie' },
                { name: 'CRP (Protéine C Réactive)', price: 5000, category: 'Immunologie' },
                { name: 'ECBU (Urines)', price: 6000, category: 'Bactériologie' },
                { name: 'Créatininémie', price: 3500, category: 'Biochimie' },
                { name: 'Glycémie à jeun', price: 1500, category: 'Biochimie' },
                { name: 'Échographie Obstétricale / Pelvienne', price: 10000, category: 'Imagerie' },
                { name: 'Radiographie Thoracique (Face)', price: 8000, category: 'Imagerie' },
                { name: 'ECG de repos 12 dérivations', price: 7000, category: 'Imagerie' }
              ];

              // Predefined clinical packs (Point 6)
              const CLINICAL_PACKS = [
                {
                  id: 'pack_palu',
                  name: 'Pack Paludisme',
                  description: 'TDR Paludisme + NFS (Hémogramme) + Goutte Épaisse',
                  exams: [
                    { name: 'NFS (Hémogramme)', price: 4000 },
                    { name: 'TDR Paludisme / Goutte Épaisse', price: 2000 }
                  ]
                },
                {
                  id: 'pack_cardio',
                  name: 'Pack Cardio / Rénal',
                  description: 'Créatininémie + Glycémie + ECG de repos',
                  exams: [
                    { name: 'Créatininémie', price: 3500 },
                    { name: 'Glycémie à jeun', price: 1500 },
                    { name: 'ECG de repos 12 dérivations', price: 7000 }
                  ]
                },
                {
                  id: 'pack_inf',
                  name: 'Pack Syndr. Infectieux',
                  description: 'NFS + CRP + ECBU',
                  exams: [
                    { name: 'NFS (Hémogramme)', price: 4000 },
                    { name: 'CRP (Protéine C Réactive)', price: 5000 },
                    { name: 'ECBU (Urines)', price: 6000 }
                  ]
                }
              ];

              const handleAddPack = (pack: any) => {
                let addedCount = 0;
                setExamensDemandes(prev => {
                  const currentExams = [...prev];
                  pack.exams.forEach((item: any) => {
                    const cleanName = item.name.trim();
                    if (!currentExams.some(e => e.name.trim().toLowerCase() === cleanName.toLowerCase())) {
                      currentExams.push({ id: `exam-${Date.now()}-${Math.floor(Math.random() * 1000)}`, name: cleanName, urgent: false, price: item.price });
                      addedCount++;
                    }
                  });
                  return currentExams;
                });
                if (addedCount === 0) {
                  window.dispatchEvent(new CustomEvent('app-notification', { detail: `ℹ️ Tous les examens du pack « ${pack.name} » sont déjà dans le bulletin (aucun doublon créé).` }));
                } else {
                  window.dispatchEvent(new CustomEvent('app-notification', { detail: `✓ ${addedCount} examen(s) du pack « ${pack.name} » ajouté(s) sans doublon.` }));
                }
              };

              const handleAddCustomExam = () => {
                if (!customExamName.trim()) return;
                const clean = customExamName.trim();
                if (examensDemandes.some(e => e.name.trim().toLowerCase() === clean.toLowerCase())) {
                  window.dispatchEvent(new CustomEvent('app-notification', { detail: `⚠️ L'examen « ${clean} » est déjà présent dans le bulletin (doublon refusé).` }));
                  return;
                }
                setExamensDemandes(prev => [
                  ...prev,
                  {
                    id: `exam-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
                    name: clean,
                    urgent: false,
                    price: customExamPrice || 2500,
                    status: 'demandé'
                  }
                ]);
                window.dispatchEvent(new CustomEvent('app-notification', { detail: `✓ Examen « ${clean} » ajouté au bulletin.` }));
                setCustomExamName('');
                setCustomExamPrice(2500);
              };

              return (
                <div className="space-y-6 animate-in fade-in">
                  <div className="flex justify-between items-center border-b pb-2">
                    <h3 className="text-lg font-black text-slate-800">Bulletin d'Examens Connecté</h3>
                    <span className="text-[10px] font-black uppercase text-purple-600 bg-purple-50 px-2.5 py-1 rounded-lg border border-purple-100">Facturation & Labo Liés</span>
                  </div>

                  {/* Predefined packs & protocoles */}
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 block font-bold">Packs & Protocoles Cliniques Rapides</label>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {CLINICAL_PACKS.map(p => (
                        <div key={p.id} className="p-4 bg-purple-50/50 border border-purple-100 rounded-2xl flex flex-col justify-between hover:border-purple-300 transition-all border-dashed">
                          <div>
                            <h4 className="font-black text-xs text-purple-900 mb-0.5">{p.name}</h4>
                            <p className="text-[10px] text-purple-600 font-semibold mb-3 leading-tight">{p.description}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleAddPack(p)}
                            className="w-full py-2 bg-purple-600 text-white rounded-xl text-[9px] font-black uppercase tracking-wider hover:bg-purple-700 transition-colors shadow-sm cursor-pointer"
                          >
                            Sélectionner le pack
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 border-t pt-4">
                    {/* Add individual exam */}
                    <div className="lg:col-span-2 space-y-4">
                      {(() => {
                        const categories = ['Tous', ...Array.from(new Set(EXAMS_CATALOG.map(e => e.category || 'Général')))];
                        const filteredExams = EXAMS_CATALOG.filter(ex => {
                          const qEx = (examSearchQuery || '').toLowerCase();
                          const matchesSearch = (ex.name || '').toLowerCase().includes(qEx) || 
                                                (ex.category || '').toLowerCase().includes(qEx);
                          const matchesCategory = selectedExamCategory === 'Tous' || (ex.category || 'Général') === selectedExamCategory;
                          return matchesSearch && matchesCategory;
                        });

                        return (
                          <div className="p-5 bg-slate-50 border border-slate-200/60 rounded-3xl space-y-4">
                            <div className="flex flex-col md:flex-row gap-3 items-start md:items-center justify-between">
                              {/* Search Input */}
                              <div className="relative flex-1 w-full">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                <input 
                                  type="text"
                                  value={examSearchQuery}
                                  onChange={(e) => setExamSearchQuery(e.target.value)}
                                  placeholder="Rechercher un examen (ex: NFS, ECBU, Échographie...)"
                                  className="w-full pl-9 pr-8 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-purple-500 shadow-sm"
                                />
                                {examSearchQuery && (
                                  <button type="button" onClick={() => setExamSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                                    <X size={14} />
                                  </button>
                                )}
                              </div>

                              {/* Category select as badge buttons */}
                              <div className="flex items-center gap-1 flex-wrap shrink-0">
                                {categories.map(cat => (
                                  <button
                                    key={cat}
                                    type="button"
                                    onClick={() => setSelectedExamCategory(cat)}
                                    className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                                      selectedExamCategory === cat 
                                        ? 'bg-purple-600 text-white' 
                                        : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                                    }`}
                                  >
                                    {cat}
                                  </button>
                                ))}
                              </div>
                            </div>

                            {/* Filtered Exams List */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[220px] overflow-y-auto pr-1 custom-scrollbar">
                              {filteredExams.map((ex) => {
                                const cleanExamName = ex.name.trim();
                                const isAdded = examensDemandes.some(item => item.name.trim().toLowerCase() === cleanExamName.toLowerCase());
                                return (
                                  <button
                                    key={ex.id || cleanExamName}
                                    type="button"
                                    onClick={() => {
                                      setExamensDemandes(prev => {
                                        if (isAdded) {
                                          return prev.filter(item => item.name.trim().toLowerCase() !== cleanExamName.toLowerCase());
                                        } else {
                                          return [...prev, { id: ex.id || `exam-${Date.now()}-${Math.floor(Math.random() * 1000)}`, name: cleanExamName, urgent: false, price: ex.price || 2500 }];
                                        }
                                      });
                                    }}
                                    className={`p-3 rounded-2xl border text-left flex items-center justify-between transition-all group cursor-pointer ${
                                      isAdded 
                                        ? 'bg-purple-50 border-purple-300 shadow-sm' 
                                        : 'bg-white border-slate-200 hover:border-purple-300 hover:bg-purple-50/20'
                                    }`}
                                  >
                                    <div>
                                      <span className="font-extrabold text-xs text-slate-800 block group-hover:text-purple-700 transition-colors">{ex.name}</span>
                                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{ex.category || 'Général'}</span>
                                    </div>
                                    <div className="text-right flex flex-col items-end gap-1 shrink-0">
                                      <span className="text-[10px] font-black text-purple-600">{ex.price || 2500} FCFA</span>
                                      {isAdded ? (
                                        <span className="inline-flex items-center gap-1 bg-purple-100 text-purple-700 text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md">
                                          Ajouté ✓
                                        </span>
                                      ) : (
                                        <span className="text-[9px] font-bold text-slate-450 group-hover:text-purple-600 transition-colors">
                                          + Ajouter
                                        </span>
                                      )}
                                    </div>
                                  </button>
                                );
                              })}
                              {filteredExams.length === 0 && (
                                <p className="col-span-2 text-center p-6 text-slate-450 text-xs italic">Aucun examen trouvé pour cette recherche.</p>
                              )}
                            </div>
                            {/* Custom Exam Input */}
                            <div className="pt-3 border-t border-slate-200/80 flex flex-col sm:flex-row gap-2 items-center">
                              <input 
                                type="text"
                                value={customExamName}
                                onChange={(e) => setCustomExamName(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    handleAddCustomExam();
                                  }
                                }}
                                placeholder="Ajouter un autre examen personnalisé..."
                                className="flex-1 w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-purple-500 shadow-sm"
                              />
                              <div className="flex items-center gap-2 w-full sm:w-auto">
                                <input 
                                  type="number"
                                  value={customExamPrice}
                                  onChange={(e) => setCustomExamPrice(Number(e.target.value))}
                                  placeholder="Prix"
                                  className="w-24 px-2 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-center focus:outline-none focus:border-purple-500 shadow-sm"
                                />
                                <button
                                  type="button"
                                  onClick={handleAddCustomExam}
                                  disabled={!customExamName.trim()}
                                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-sm shrink-0 flex items-center gap-1 cursor-pointer"
                                >
                                  + Ajouter
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })()}

                      {/* Selected exams list */}
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 font-bold block mb-1">Examens prescrits dans le bulletin</label>
                        {examensDemandes.map((e, i) => {
                          const status = e.status || 'demandé';
                          const examKey = (e as any).id || `${e.name}-${i}`;
                          return (
                            <div key={examKey} className="flex justify-between items-center p-4 bg-slate-50 border border-slate-200 rounded-2xl">
                              <div>
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="font-bold text-slate-800 text-sm block">{e.name}</span>
                                  {e.urgent && <span className="bg-rose-100 text-rose-700 text-[8px] font-black uppercase px-1.5 py-0.5 rounded-md">Urgent</span>}
                                </div>
                                <div className="flex items-center gap-3">
                                  <span className="text-[10px] font-black text-slate-400 uppercase">Tarif : {e.price || 2500} FCFA</span>
                                  
                                  {/* Status badge and manual selector */}
                                  <div className="flex items-center gap-1">
                                    <span className="text-[9px] text-slate-450 font-semibold">Statut :</span>
                                    <select
                                      value={status}
                                      onChange={(evt) => {
                                        const newEx = [...examensDemandes];
                                        newEx[i].status = evt.target.value as any;
                                        setExamensDemandes(newEx);
                                      }}
                                      className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${
                                        status === 'demandé' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                        status === 'payé' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' :
                                        status === 'prélevé' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                        'bg-emerald-50 text-emerald-700 border-emerald-200'
                                      }`}
                                    >
                                      <option value="demandé">🕒 Demandé</option>
                                      <option value="payé">💳 Payé</option>
                                      <option value="prélevé">🔬 Prélevé</option>
                                      <option value="validé">✅ Validé</option>
                                    </select>
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-4">
                                <label className="flex items-center gap-1.5 text-xs font-black text-rose-500 cursor-pointer select-none font-bold">
                                  <input 
                                    type="checkbox" 
                                    checked={e.urgent}
                                    onChange={() => {
                                      const newEx = [...examensDemandes];
                                      newEx[i].urgent = !newEx[i].urgent;
                                      setExamensDemandes(newEx);
                                    }}
                                    className="accent-rose-500 scale-110"
                                  /> Urgent
                                </label>
                                <button 
                                  type="button"
                                  onClick={() => setExamensDemandes(examensDemandes.filter((_, idx) => idx !== i))} 
                                  className="p-1 text-slate-450 hover:text-rose-600 cursor-pointer"
                                >
                                  <X size={15} />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                        {examensDemandes.length === 0 && (
                          <p className="p-4 bg-slate-50 text-slate-400 text-xs italic rounded-2xl text-center border-2 border-dashed border-slate-200">
                            Aucun examen programmé sur ce bulletin.
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Laboratory Pre-estimation breakdown (Right 1 col) */}
                    <div className="lg:col-span-1 bg-slate-950 text-white p-6 rounded-3xl flex flex-col justify-between gap-4">
                      <div className="space-y-4">
                        <div>
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Estimation Laboratoire</p>
                          <h4 className="text-sm font-semibold">Valorisation des examens</h4>
                        </div>
                        
                        <div className="divide-y divide-slate-850 text-xs font-semibold space-y-2.5">
                          {examensDemandes.map((ex, idx) => (
                            <div key={idx} className="flex justify-between pt-2">
                              <span className="text-slate-450 truncate max-w-[150px]">{ex.name}</span>
                              <span className="text-slate-350">{ex.price || 2500} FCFA</span>
                            </div>
                          ))}
                          {examensDemandes.length === 0 && (
                            <p className="text-[11px] text-slate-600 italic pt-4">Aucun frais estimé.</p>
                          )}
                          <div className="flex justify-between pt-3 font-black text-blue-400 text-sm border-t border-slate-800">
                            <span>Total Estimations</span>
                            <span>{examensDemandes.reduce((sum, e) => sum + (e.price || 2500), 0)} FCFA</span>
                          </div>
                        </div>
                      </div>

                      {examensDemandes.length > 0 && (
                        <button
                          type="button"
                          disabled={isExamsTransmitted}
                          onClick={() => {
                            if (isExamsTransmitted) return;
                            const uncommitted = examensDemandes.some(e => (e.status || 'demandé') === 'demandé');
                            if (!uncommitted) {
                              alert("Tous les examens de ce bulletin sont déjà en cours/payés !");
                              return;
                            }
                            
                            // Log transmission in audit log
                            addDoc(collection(db, 'audit_logs'), {
                              action: 'EXAM_BULLETIN_TRANSMISSION',
                              patientId: patient?.id || 'unknown',
                              patientName: patient?.nom || 'Inconnu',
                              userId: user?.id || 'unknown',
                              userName: user?.name || 'Medecin',
                              timestamp: new Date().toISOString(),
                              details: {
                                examCount: examensDemandes.length,
                                totalCost: examensDemandes.reduce((sum, e) => sum + (e.price || 2500), 0),
                                exams: examensDemandes.map(e => ({ name: e.name, price: e.price || 2500, status: 'demandé' }))
                              }
                            }).catch(err => console.error("Could not write audit log :", err));

                            handleTriggerSendExams();
                            // Turn todos into status paye or transmitted
                            setExamensDemandes(prev => prev.map(e => ({ ...e, status: e.status === 'demandé' ? 'payé' : e.status })));
                            setIsExamsTransmitted(true);
                            alert(`📡 TRANSMISSION AUTOMATIQUE RÉUSSIE !\n\nLes examens ont été transmis aux modules Laboratoire (pour bons de prélèvement) et Facturation (pour encaissement des frais).`);
                          }}
                          className="w-full py-3 bg-purple-600 font-extrabold text-[10px] uppercase tracking-widest text-white rounded-xl hover:bg-purple-700 transition-colors shadow-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isExamsTransmitted ? '✓ Examens Transmis au Labo & Caisse' : '⚡ Transmettre au Labo & Caisse'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}

            {activeTab === 'prise_en_charge' && (() => {
              // Drug catalog with details & pricing (Point 5)
              const MEDICINE_CATALOG = dbMedications.length > 0 ? dbMedications : [
                { name: 'Paracétamol 500mg (Boite)', price: 500, defaultPosology: '1 comprimé toutes les 8 heures (3 fois/jour) pendant 5 jours', family: 'Antalgique' },
                { name: 'Amoxicilline 1g (Boite)', price: 2500, defaultPosology: '1 comprimé matin et soir pendant 7 jours', family: 'Antibiotique' },
                { name: 'Artemether-Lumefantrine (Coartem)', price: 2000, defaultPosology: '1 comprimé par jour au cours des repas pendant 3 jours', family: 'Antipaludique' },
                { name: 'Amlodipine 5mg (Boite)', price: 2250, defaultPosology: '1 comprimé par jour le matin en continu', family: 'Anti-hypertenseur' },
                { name: 'Ciprofloxacine 500mg', price: 3500, defaultPosology: '1 comprimé 2 fois par jour pendant 5 jours', family: 'Antibiotique' },
                { name: 'Spasfon Comprimés', price: 1500, defaultPosology: '1 comprimé lors des accès douloureux, max 3/jour', family: 'Antispasmodique' },
                { name: 'Gaviscon Suspension (Flacon)', price: 3000, defaultPosology: '1 sachet / cuillère 3 fois par jour après les repas', family: 'Antiacide' },
                { name: 'Metformine 500mg (Flacon)', price: 1800, defaultPosology: '1 comprimé matin et soir pendant le repas', family: 'Antidiabétique' }
              ];

              const families = ['Tous', ...Array.from(new Set(MEDICINE_CATALOG.map(d => d.family)))];

              const filteredCatalog = MEDICINE_CATALOG.filter(drug => {
                const qMed = (medSearchQuery || '').toLowerCase();
                const matchesSearch = (drug.name || '').toLowerCase().includes(qMed) || 
                                      (drug.family || '').toLowerCase().includes(qMed);
                const matchesFamily = selectedMedFamily === 'Tous' || drug.family === selectedMedFamily;
                return matchesSearch && matchesFamily;
              });

              const handleAddPrescription = (name: string, posology: string, price: number) => {
                if (!name.trim()) return;
                const cleanName = name.trim();
                const isExisting = prescriptions.some(p => p.name.trim().toLowerCase() === cleanName.toLowerCase());

                setPrescriptions(prev => {
                  const existingIdx = prev.findIndex(p => p.name.trim().toLowerCase() === cleanName.toLowerCase());
                  if (existingIdx >= 0) {
                    const updated = [...prev];
                    updated[existingIdx] = {
                      ...updated[existingIdx],
                      posologie: posology || updated[existingIdx].posologie || 'Selon prescription',
                      price: price || updated[existingIdx].price || 1500
                    };
                    return updated;
                  }
                  return [...prev, { id: `med-${Date.now()}-${Math.floor(Math.random() * 1000)}`, name: cleanName, posologie: posology, price }];
                });

                if (isExisting) {
                  window.dispatchEvent(new CustomEvent('app-notification', { 
                    detail: `ℹ️ Posologie mise à jour pour « ${cleanName} » (évite les doublons dans l'ordonnance).` 
                  }));
                } else {
                  window.dispatchEvent(new CustomEvent('app-notification', { 
                    detail: `✓ « ${cleanName} » ajouté à l'ordonnance.` 
                  }));
                }

                setSelectedDrugIndex(null);
                setCustomDrugName('');
                setCustomPosology('');
                // Reset step controls
                setPosologyDose('1 comprimé');
                setPosologyFreq('3 fois par jour');
                setPosologyDuration('5 jours');
                setPosologyTiming('après les repas');
              };

              return (
                <div className="space-y-6">
                  <div className="flex justify-between items-center border-b pb-2">
                    <h3 className="text-lg font-black text-slate-800">Ordonnance Clinique & Pharmacie</h3>
                    <span className="text-[10px] font-black uppercase text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-100 font-mono font-bold">Prescription Directe</span>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                    {/* COL 1: Medicine Selection (lg:col-span-4) */}
                    <div className="lg:col-span-4 bg-white border border-slate-200 rounded-[32px] p-6 shadow-sm space-y-4">
                      <div>
                        <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider mb-1">1. Choisir le médicament</h4>
                        <p className="text-[11px] text-slate-500 font-medium">Recherchez ou sélectionnez un produit.</p>
                      </div>

                      {/* Search & Categories */}
                      <div className="space-y-3">
                        <input 
                          type="text"
                          placeholder="🔍 Rechercher un produit..."
                          value={medSearchQuery}
                          onChange={e => setMedSearchQuery(e.target.value)}
                          className="w-full p-3 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-blue-600 bg-slate-50/50"
                        />
                        
                        <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto custom-scrollbar">
                          {families.map(fam => (
                            <button
                              key={fam}
                              type="button"
                              onClick={() => setSelectedMedFamily(fam)}
                              className={`px-2.5 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer border ${
                                selectedMedFamily === fam 
                                  ? 'bg-blue-600 text-white border-blue-600' 
                                  : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                              }`}
                            >
                              {fam}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Medicine Cards List */}
                      <div className="space-y-2 max-h-[250px] overflow-y-auto pr-1 custom-scrollbar">
                        {filteredCatalog.map((drug, cIdx) => {
                          const realIdx = MEDICINE_CATALOG.findIndex(d => d.name === drug.name);
                          const isSelected = selectedDrugIndex === realIdx;
                          const currentStock = drug.stock !== undefined ? drug.stock : 50;
                          const isOutOfStock = currentStock <= 0;
                          const existingPrescr = prescriptions.find(p => p.name.trim().toLowerCase() === drug.name.trim().toLowerCase());
                          const isPrescribed = Boolean(existingPrescr);

                          return (
                            <button
                              key={cIdx}
                              type="button"
                              onClick={() => {
                                if (isOutOfStock) {
                                  // Open zero-stock alert modal with available alternatives
                                  const alts = MEDICINE_CATALOG.filter(d => 
                                    d.family === drug.family && 
                                    (d.stock !== undefined ? d.stock > 0 : true) && 
                                    d.name !== drug.name
                                  );
                                  setZeroStockDrug(drug);
                                  setZeroStockAlternatives(alts);
                                  setShowZeroStockModal(true);
                                  return;
                                }

                                setSelectedDrugIndex(realIdx);
                                setCustomDrugName(drug.name);
                                setCustomDrugPrice(drug.price);
                                
                                if (isPrescribed && existingPrescr) {
                                  setCustomPosology(existingPrescr.posologie);
                                } else if (posologyMode === 'manual') {
                                  setCustomPosology(drug.defaultPosology);
                                } else {
                                  // Default smart presets based on drug names
                                  if (drug.name.toLowerCase().includes('paracétamol')) {
                                    setPosologyDose('1 comprimé');
                                    setPosologyFreq('toutes les 8 heures (3 fois/jour)');
                                    setPosologyDuration('5 jours');
                                    setPosologyTiming('après les repas');
                                  } else if (drug.name.toLowerCase().includes('amoxicilline')) {
                                    setPosologyDose('1 comprimé');
                                    setPosologyFreq('matin et soir (2 fois/jour)');
                                    setPosologyDuration('7 jours');
                                    setPosologyTiming('pendant les repas');
                                  } else {
                                    setPosologyDose('1 comprimé');
                                    setPosologyFreq('3 fois par jour');
                                    setPosologyDuration('5 jours');
                                    setPosologyTiming('après les repas');
                                  }
                                }
                              }}
                              className={`w-full p-3 text-left transition-all rounded-xl border flex flex-col justify-between cursor-pointer ${
                                isOutOfStock
                                  ? 'bg-rose-50/60 border-rose-200 hover:border-rose-400'
                                  : isSelected 
                                    ? 'bg-blue-50 border-blue-500 ring-2 ring-blue-100 shadow-sm' 
                                    : isPrescribed
                                      ? 'bg-emerald-50/40 border-emerald-300 hover:border-emerald-400'
                                      : 'bg-slate-50 border-slate-150 hover:border-slate-300 hover:bg-white'
                              }`}
                            >
                              <div className="flex justify-between items-center w-full">
                                <span className="text-[8px] font-black uppercase tracking-widest text-slate-400">{drug.family}</span>
                                <div className="flex items-center gap-1.5">
                                  {isOutOfStock ? (
                                    <span className="text-[8px] font-black uppercase tracking-wider bg-rose-600 text-white px-1.5 py-0.5 rounded flex items-center gap-1">
                                      <AlertTriangle size={10} /> 0 en stock
                                    </span>
                                  ) : (
                                    <span className="text-[8px] font-black text-emerald-700 bg-emerald-100/80 px-1.5 py-0.5 rounded">
                                      Stock: {currentStock}
                                    </span>
                                  )}
                                  {isPrescribed && (
                                    <span className="text-[8px] font-black text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded flex items-center gap-0.5">
                                      ✓ Prescrit
                                    </span>
                                  )}
                                  <span className={`text-[10px] font-black font-mono px-1.5 py-0.5 rounded ${
                                    isSelected ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-600'
                                  }`}>{drug.price} F</span>
                                </div>
                              </div>
                              <h5 className={`font-extrabold text-xs mt-1 ${isOutOfStock ? 'text-rose-900' : 'text-slate-900'}`}>{drug.name}</h5>
                              <p className="text-[9px] text-slate-400 font-medium italic mt-0.5 truncate w-full">
                                {isPrescribed && existingPrescr ? `Posologie actuelle : ${existingPrescr.posologie}` : drug.defaultPosology}
                              </p>
                            </button>
                          );
                        })}
                        {filteredCatalog.length === 0 && (
                          <p className="text-center text-xs text-slate-400 italic py-4">Aucun médicament trouvé.</p>
                        )}
                      </div>

                      {/* Custom Medicine (Hors Catalogue) */}
                      <div className="border-t border-slate-100 pt-3 space-y-2">
                        <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Ou Saisir un autre médicament</span>
                        <div className="space-y-2">
                          <input
                            type="text"
                            placeholder="Nom du médicament personnalisé..."
                            value={selectedDrugIndex === null ? customDrugName : ''}
                            onChange={e => {
                              setSelectedDrugIndex(null);
                              setCustomDrugName(e.target.value);
                              if (posologyMode === 'manual') {
                                setCustomPosology('');
                              }
                            }}
                            className="w-full p-2.5 text-xs font-bold border border-slate-200 rounded-xl outline-none focus:border-blue-500 bg-slate-50/50"
                          />
                          <input
                            type="number"
                            placeholder="Prix estimé (FCFA)"
                            value={selectedDrugIndex === null ? (customDrugPrice || '') : ''}
                            onChange={e => {
                              setSelectedDrugIndex(null);
                              setCustomDrugPrice(parseInt(e.target.value) || 0);
                            }}
                            className="w-full p-2.5 text-xs font-bold border border-slate-200 rounded-xl outline-none focus:border-blue-500 bg-slate-50/50"
                          />
                        </div>
                      </div>
                    </div>

                    {/* COL 2: Dosage Calculator & Personalized input (lg:col-span-5) */}
                    <div className="lg:col-span-5 bg-white border border-slate-200 rounded-[32px] p-6 shadow-sm flex flex-col min-h-[480px]">
                      
                      {!customDrugName ? (
                        <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-slate-400">
                          <div className="w-14 h-14 rounded-full bg-slate-50 flex items-center justify-center mb-3">
                            <Pill size={24} className="text-slate-300" />
                          </div>
                          <h5 className="text-xs font-black uppercase tracking-wider text-slate-700">Aucun produit sélectionné</h5>
                          <p className="text-xs text-slate-400 mt-1 max-w-[200px]">Sélectionnez un médicament à gauche pour configurer sa posologie.</p>
                        </div>
                      ) : (
                        <div className="flex-1 flex flex-col justify-between space-y-4 animate-in fade-in duration-300">
                          
                          {/* Selected Drug Banner */}
                          <div className="bg-slate-50 border border-slate-150 p-4 rounded-2xl flex justify-between items-center">
                            <div>
                              <span className="text-[8px] font-black uppercase tracking-widest text-slate-400">PRODUIT SÉLECTIONNÉ</span>
                              <h5 className="text-sm font-black text-slate-900 mt-0.5">{customDrugName}</h5>
                            </div>
                            <span className="text-xs font-black text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-xl font-mono font-bold">
                              {customDrugPrice} FCFA
                            </span>
                          </div>

                          {/* Toggle Mode: Calculator vs Manual */}
                          <div className="grid grid-cols-2 p-1 bg-slate-100 rounded-xl border border-slate-200">
                            <button
                              type="button"
                              onClick={() => setPosologyMode('calculator')}
                              className={`py-2 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
                                posologyMode === 'calculator' 
                                  ? 'bg-white text-blue-600 shadow-sm font-bold' 
                                  : 'text-slate-500 hover:text-slate-800'
                              }`}
                            >
                              📟 Calculateur de Dose
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setPosologyMode('manual');
                                // Prefill customPosology with current calculated or catalog default if empty
                                if (!customPosology) {
                                  const catalogDrug = MEDICINE_CATALOG.find(d => d.name === customDrugName);
                                  setCustomPosology(catalogDrug?.defaultPosology || `${posologyDose}, ${posologyFreq} pendant ${posologyDuration} (${posologyTiming})`);
                                }
                              }}
                              className={`py-2 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
                                posologyMode === 'manual' 
                                  ? 'bg-white text-blue-600 shadow-sm font-bold' 
                                  : 'text-slate-500 hover:text-slate-800'
                              }`}
                            >
                              ✍️ Posologie Libre / Perso
                            </button>
                          </div>

                          {/* Mode-Specific Content Container */}
                          <div className="flex-1 space-y-4">
                            {posologyMode === 'calculator' ? (
                              <div className="space-y-3.5 max-h-[320px] overflow-y-auto pr-1 custom-scrollbar">
                                
                                {/* 1. Dose */}
                                <div>
                                  <label className="text-[8px] font-black uppercase tracking-widest text-slate-500 mb-1 block">1. Dose par prise</label>
                                  <div className="flex flex-wrap gap-1">
                                    {['1 comprimé', '2 comprimés', '0.5 comprimé', '1 sachet', '1 gélule', '1 cuillère à café', '1 cuillère à soupe', '1 ampoule'].map(d => (
                                      <button
                                        key={d}
                                        type="button"
                                        onClick={() => setPosologyDose(d)}
                                        className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all border cursor-pointer ${
                                          posologyDose === d 
                                            ? 'bg-blue-50 text-blue-700 border-blue-400 font-bold' 
                                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                                        }`}
                                      >
                                        {d}
                                      </button>
                                    ))}
                                  </div>
                                  <input 
                                    type="text"
                                    placeholder="Saisir autre dose..."
                                    value={posologyDose}
                                    onChange={e => setPosologyDose(e.target.value)}
                                    className="w-full mt-1.5 p-2 text-xs font-bold border border-slate-200 rounded-lg outline-none focus:border-blue-500 bg-white"
                                  />
                                </div>

                                {/* 2. Freq */}
                                <div>
                                  <label className="text-[8px] font-black uppercase tracking-widest text-slate-500 mb-1 block">2. Fréquence quotidienne</label>
                                  <div className="flex flex-wrap gap-1">
                                    {[
                                      { label: '1 fois/j', val: '1 fois par jour' },
                                      { label: '2 fois/j', val: 'matin et soir (2 fois/jour)' },
                                      { label: '3 fois/j', val: 'matin, midi et soir (3 fois/jour)' },
                                      { label: '4 fois/j', val: '4 fois par jour' },
                                      { label: 'Toutes les 8h', val: 'toutes les 8 heures (3 fois/jour)' },
                                      { label: 'Si besoin', val: 'uniquement en cas de crise (douleur/fièvre)' }
                                    ].map(f => (
                                      <button
                                        key={f.label}
                                        type="button"
                                        onClick={() => setPosologyFreq(f.val)}
                                        className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all border cursor-pointer ${
                                          posologyFreq === f.val 
                                            ? 'bg-blue-50 text-blue-700 border-blue-400 font-bold' 
                                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                                        }`}
                                      >
                                        {f.label}
                                      </button>
                                    ))}
                                  </div>
                                  <input 
                                    type="text"
                                    placeholder="Saisir autre fréquence..."
                                    value={posologyFreq}
                                    onChange={e => setPosologyFreq(e.target.value)}
                                    className="w-full mt-1.5 p-2 text-xs font-bold border border-slate-200 rounded-lg outline-none focus:border-blue-500 bg-white"
                                  />
                                </div>

                                {/* 3. Duree */}
                                <div>
                                  <label className="text-[8px] font-black uppercase tracking-widest text-slate-500 mb-1 block">3. Durée</label>
                                  <div className="flex flex-wrap gap-1">
                                    {['3 jours', '5 jours', '7 jours', '10 jours', '14 jours', '30 jours', 'Dose unique'].map(dur => (
                                      <button
                                        key={dur}
                                        type="button"
                                        onClick={() => setPosologyDuration(dur)}
                                        className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all border cursor-pointer ${
                                          posologyDuration === dur 
                                            ? 'bg-blue-50 text-blue-700 border-blue-400 font-bold' 
                                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                                        }`}
                                      >
                                        {dur}
                                      </button>
                                    ))}
                                  </div>
                                  <input 
                                    type="text"
                                    placeholder="Saisir autre durée..."
                                    value={posologyDuration}
                                    onChange={e => setPosologyDuration(e.target.value)}
                                    className="w-full mt-1.5 p-2 text-xs font-bold border border-slate-200 rounded-lg outline-none focus:border-blue-500 bg-white"
                                  />
                                </div>

                                {/* 4. Moment */}
                                <div>
                                  <label className="text-[8px] font-black uppercase tracking-widest text-slate-500 mb-1 block">4. Moment de prise</label>
                                  <div className="flex flex-wrap gap-1">
                                    {['après les repas', 'pendant les repas', 'à jeun', 'au coucher', 'indifférent'].map(t => (
                                      <button
                                        key={t}
                                        type="button"
                                        onClick={() => setPosologyTiming(t)}
                                        className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all border cursor-pointer ${
                                          posologyTiming === t 
                                            ? 'bg-blue-50 text-blue-700 border-blue-400 font-bold' 
                                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                                        }`}
                                      >
                                        {t}
                                      </button>
                                    ))}
                                  </div>
                                </div>

                              </div>
                            ) : (
                              <div className="space-y-2 animate-in fade-in duration-300">
                                <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1 block">Rédiger votre posologie personnalisée</label>
                                <textarea
                                  value={customPosology}
                                  onChange={e => setCustomPosology(e.target.value)}
                                  className="w-full p-4 border border-slate-200 bg-white rounded-xl text-xs font-bold text-slate-800 h-44 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                                  placeholder="Saisissez la posologie libre... ex: 2 comprimés le soir en cas d'épisode douloureux intense, max 3 jours."
                                />
                                <p className="text-[10px] text-slate-400 italic">Vous pouvez rédiger librement ou copier-coller des instructions spécifiques.</p>
                              </div>
                            )}

                            {/* Generated Posology Display (Interactive) */}
                            {posologyMode === 'calculator' && (
                              <div className="bg-blue-50/60 border border-blue-150 rounded-2xl p-3.5 shadow-inner">
                                <span className="text-[8px] font-black text-blue-500 uppercase tracking-widest block mb-0.5">Aperçu de la posologie générée</span>
                                <p className="text-xs font-black text-slate-800 italic">
                                  "{customPosology}"
                                </p>
                              </div>
                            )}
                          </div>

                          {/* Save to prescription button */}
                          <div className="pt-2">
                            <button
                              type="button"
                              onClick={() => handleAddPrescription(customDrugName, customPosology, customDrugPrice)}
                              className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[10px] uppercase tracking-widest rounded-xl transition-all shadow-lg shadow-emerald-600/15 flex items-center justify-center gap-1.5 cursor-pointer"
                            >
                              <CheckCircle2 size={16} /> Ajouter à l'Ordonnance
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* COL 3: Current Prescriptions & Billing (lg:col-span-3) */}
                    <div className="lg:col-span-3 space-y-4">
                      {/* Prescriptions Box */}
                      <div className="bg-white border border-slate-200 rounded-[32px] p-5 shadow-sm space-y-4">
                        <div>
                          <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">Lignes prescrites ({prescriptions.length})</h4>
                          <p className="text-[10px] text-slate-400 font-medium">Contenu actuel de l'ordonnance.</p>
                        </div>

                        <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1 custom-scrollbar">
                          {prescriptions.map((p, idx) => {
                            const prescrKey = (p as any).id || `${p.name}-${idx}`;
                            return (
                            <div key={prescrKey} className="p-3 bg-slate-50 border border-slate-150 rounded-xl flex justify-between items-start gap-2 relative group hover:bg-white transition-colors">
                              <div className="flex-1 min-w-0">
                                <h6 className="font-extrabold text-slate-900 text-xs truncate">{p.name}</h6>
                                <p className="text-[9px] text-slate-500 font-semibold italic line-clamp-2 mt-0.5">{p.posologie}</p>
                                <span className="text-[9px] font-black text-emerald-600 font-mono mt-1 block font-bold">{p.price || 1500} F</span>
                              </div>
                              <button
                                type="button"
                                onClick={() => setPrescriptions(prev => prev.filter((_, i) => i !== idx))}
                                className="text-slate-400 hover:text-rose-600 p-1 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer"
                                title="Supprimer de l'ordonnance"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          );
                          })}

                          {prescriptions.length === 0 && (
                            <p className="text-center text-xs text-slate-400 italic py-6">Aucune ligne pour l'instant.</p>
                          )}
                        </div>

                        {/* Invoice & pricing summary */}
                        <div className="bg-gradient-to-br from-slate-900 to-slate-950 text-white rounded-2xl p-4 space-y-2 shadow-lg">
                          <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest block">RÉCAPITULATIF CAISSE & PHARMACIE</span>
                          <div className="flex justify-between items-center py-1">
                            <span className="text-[11px] font-bold text-slate-300">Lignes</span>
                            <span className="text-xs font-black">{prescriptions.length}</span>
                          </div>
                          <div className="flex justify-between items-center border-t border-slate-800 pt-2 font-black text-sm">
                            <span>Total Estimé</span>
                            <span className="text-emerald-400 font-mono font-bold">
                              {prescriptions.reduce((sum, p) => sum + (p.price || 0), 0)} F
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Transmit button */}
                      {prescriptions.length > 0 && (
                        <button
                          type="button"
                          disabled={isPrescriptionTransmitted}
                          onClick={() => {
                            if (isPrescriptionTransmitted) return;
                            handleTriggerSendPrescription();
                          }}
                          className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-black text-[10px] uppercase tracking-widest rounded-2xl transition-all shadow-xl shadow-blue-600/20 flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isPrescriptionTransmitted ? '✓ Ordonnance Transmise à la Caisse & Pharmacie' : '⚡ Transmettre au Labo & Caisse'}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Suivi des Soins Infirmiers Prescrits en temps réel */}
                  <div className="bg-slate-50 border border-slate-200/90 rounded-[32px] p-5 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200/60 pb-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-teal-100 text-teal-700 flex items-center justify-center font-bold">
                          <Syringe size={16} />
                        </div>
                        <div>
                          <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                            Soins Infirmiers Prescrits ({liveNursingActs.length})
                            <span className="text-[9px] font-bold text-teal-700 bg-teal-50 border border-teal-200 px-2 py-0.5 rounded-full lowercase">
                              synchro temps réel
                            </span>
                          </h4>
                          <p className="text-[10px] text-slate-500 font-medium">
                            Statut de réalisation par l'équipe infirmière
                          </p>
                        </div>
                      </div>
                      <span className="text-[10px] font-mono text-slate-400 font-bold self-start sm:self-auto">
                        Table: nursing_acts
                      </span>
                    </div>

                    {liveNursingActs.length === 0 ? (
                      <div className="py-5 text-center bg-white rounded-2xl border border-dashed border-slate-200">
                        <p className="text-xs font-bold text-slate-400">Aucun soin infirmier prescrit pour cette consultation</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">Les actes prescrits apparaîtront ici avec leur statut d'exécution en direct.</p>
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        {liveNursingActs.map((act) => {
                          const isDone = act.status === 'FAIT';
                          return (
                            <div
                              key={act.id}
                              className={`p-3.5 rounded-2xl border transition-all ${
                                isDone 
                                  ? 'bg-emerald-50/60 border-emerald-200/80 shadow-xs' 
                                  : 'bg-amber-50/50 border-amber-200/80'
                              }`}
                            >
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                  {act.priority && (
                                    <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider ${
                                      act.priority === 'CRITIQUE' ? 'bg-rose-100 text-rose-700 border border-rose-200' :
                                      act.priority === 'URGENT' ? 'bg-amber-100 text-amber-700 border border-amber-200' :
                                      'bg-slate-100 text-slate-600 border border-slate-200'
                                    }`}>
                                      {act.priority}
                                    </span>
                                  )}
                                  <span className="text-xs font-black text-slate-900">{act.actType}</span>
                                  {act.timing && <span className="text-[11px] text-slate-400 font-medium">• {act.timing}</span>}
                                </div>

                                <div className="flex items-center gap-2">
                                  <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 ${
                                    isDone
                                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                      : 'bg-amber-100 text-amber-800 border border-amber-300'
                                  }`}>
                                    {isDone ? (
                                      <>
                                        <CheckCircle2 size={13} className="text-emerald-600" />
                                        <span>Exécuté / Fait</span>
                                      </>
                                    ) : (
                                      <>
                                        <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                                        <span>En attente</span>
                                      </>
                                    )}
                                  </span>
                                </div>
                              </div>

                              {act.instructions && (
                                <p className="text-[11px] text-slate-700 mt-1.5 bg-white/70 p-2 rounded-xl border border-slate-200/40">
                                  <span className="font-bold text-slate-900">Consigne médecin : </span>{act.instructions}
                                </p>
                              )}

                              {isDone && (
                                <div 
                                  title={`Exécuté par ${act.executedBy || 'Infirmier(ère)'} à ${act.executionTime || act.time}`}
                                  className="mt-2 text-xs bg-emerald-100/70 text-emerald-950 p-2.5 rounded-xl border border-emerald-200 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5"
                                >
                                  <div>
                                    <span className="font-black">✓ Exécuté par : </span>
                                    <span className="underline decoration-emerald-400 font-bold">{act.executedBy || 'Infirmier(ère)'}</span>
                                    {act.executionNotes && (
                                      <p className="mt-0.5 text-[11px] italic text-emerald-900 font-medium">« {act.executionNotes} »</p>
                                    )}
                                  </div>
                                  <span className="text-[10px] font-mono text-emerald-800 font-bold shrink-0">
                                    {act.executionDate || act.date} à {act.executionTime || act.time}
                                  </span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Notes / Orientation */}
                  <div className="mt-4">
                    <div className="flex justify-between items-center mb-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 font-bold">Orientation / Indications d'hospitalisation</label>
                      <VoiceDictationButton
                        currentValue={orientation}
                        onTranscript={setOrientation}
                        fieldLabel="Orientation & Conduite"
                      />
                    </div>
                    <textarea
                      value={orientation}
                      onChange={e => setOrientation(e.target.value)}
                      className="w-full p-4 border border-slate-200 rounded-2xl outline-none text-xs font-semibold focus:border-blue-500 bg-white"
                      placeholder="Ex: Patient orienté de toute urgence pour surveillance continue clinique..."
                      rows={3}
                    />
                  </div>
                </div>
              );
            })()}

            {activeTab === 'observation' && (
              <div className="space-y-6 animate-in fade-in h-full flex flex-col">
                <div className="flex justify-between items-center border-b pb-2">
                  <h3 className="text-lg font-black text-slate-800">Observation Médicale Générée</h3>
                  <div className="flex items-center gap-2">
                    {!isReadOnly && (
                      <VoiceDictationButton
                        currentValue={observation}
                        onTranscript={setObservation}
                        fieldLabel="Observation Médicale"
                      />
                    )}
                    <button onClick={generateObservation} className="px-3 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-xs font-bold hover:bg-slate-200">
                      Régénérer
                    </button>
                  </div>
                </div>
                <textarea
                  value={observation}
                  readOnly={isReadOnly}
                  onChange={e => setObservation(e.target.value)}
                  className={`flex-1 w-full p-6 border rounded-2xl outline-none font-mono text-sm ${
                    isReadOnly 
                      ? 'bg-slate-50 text-slate-700 border-slate-200 cursor-not-allowed select-text' 
                      : 'bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 border-slate-200'
                  }`}
                />
              </div>
            )}

            {activeTab === 'addenda' && (
              <div className="space-y-6 animate-in fade-in h-full flex flex-col">
                <div className="flex justify-between items-center border-b pb-3">
                  <div>
                    <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                      <ShieldCheck className="text-amber-600" /> Addenda & Notes Médico-Légales
                    </h3>
                    <p className="text-xs text-slate-500 font-medium mt-0.5">
                      Compléments, rectifications et résultats parvenus après clôture de la consultation.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowAddendumModal(true)}
                    className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-sm flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    <Plus size={14} /> + Nouvel Addendum
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto space-y-4 pr-1 custom-scrollbar">
                  {addenda.length > 0 ? (
                    addenda.map((add, idx) => (
                      <div 
                        key={add.id || idx} 
                        className="bg-white border-2 border-amber-200/80 rounded-2xl p-5 shadow-xs space-y-3 relative overflow-hidden"
                      >
                        <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full -translate-y-8 translate-x-8 pointer-events-none"></div>
                        
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-100 pb-2">
                          <div className="flex items-center gap-2">
                            <span className="px-2.5 py-1 rounded-lg bg-amber-100 text-amber-900 text-[10px] font-black uppercase tracking-wider">
                              {add.reason || 'Note complémentaire'}
                            </span>
                            <span className="inline-flex items-center gap-1 text-[10px] font-black text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
                              <Lock size={10} /> Scellé & Invariable
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-slate-500 text-xs font-medium">
                            <Clock size={13} className="text-slate-400" />
                            <span>{add.date} à {add.time}</span>
                          </div>
                        </div>

                        <div className="text-xs font-semibold text-slate-800 leading-relaxed whitespace-pre-wrap bg-slate-50/70 p-3.5 rounded-xl border border-slate-150">
                          {add.content}
                        </div>

                        <div className="flex items-center justify-between pt-1 text-[11px] text-slate-500">
                          <div className="flex items-center gap-1.5">
                            <UserCheck size={14} className="text-blue-600" />
                            <span>Rédigé par : <strong className="text-slate-800">{add.authorName}</strong> ({add.authorRole})</span>
                          </div>
                          <span className="font-mono text-[9px] text-slate-400 font-bold">RÉF: {add.id}</span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="h-64 flex flex-col items-center justify-center p-8 bg-slate-50 border-2 border-dashed border-slate-200 rounded-3xl text-center">
                      <div className="w-12 h-12 rounded-2xl bg-amber-100/60 text-amber-700 flex items-center justify-center mb-3">
                        <ShieldCheck size={24} />
                      </div>
                      <h4 className="text-sm font-black text-slate-800">Aucun addendum enregistré</h4>
                      <p className="text-xs text-slate-500 max-w-md mt-1 mb-4">
                        Si de nouveaux résultats biologiques ou une réévaluation surviennent, utilisez le bouton ci-dessous pour consigner un addendum médico-légal horodaté.
                      </p>
                      <button
                        type="button"
                        onClick={() => setShowAddendumModal(true)}
                        className="px-4 py-2 bg-amber-600 text-white rounded-xl text-xs font-black uppercase tracking-wider hover:bg-amber-700 shadow-sm flex items-center gap-1.5"
                      >
                        <Plus size={14} /> Rédiger le Premier Addendum
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-between items-center">
          <div className="flex gap-2">
            <button 
              onClick={() => {
                const currentIndex = tabs.findIndex(t => t.id === activeTab);
                if (currentIndex > 0) setActiveTab(tabs[currentIndex - 1].id);
              }}
              disabled={activeTab === tabs[0].id}
              className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-600 disabled:opacity-50 flex items-center gap-1"
            >
              <ChevronLeft size={16} /> Précédent
            </button>
            <button 
              onClick={() => {
                const currentIndex = tabs.findIndex(t => t.id === activeTab);
                if (currentIndex < tabs.length - 1) {
                  const nextTab = tabs[currentIndex + 1].id;
                  if (nextTab === 'observation') generateObservation();
                  setActiveTab(nextTab);
                }
              }}
              disabled={activeTab === tabs[tabs.length - 1].id}
              className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-600 disabled:opacity-50 flex items-center gap-1"
            >
              Suivant <ChevronRight size={16} />
            </button>
          </div>
          <div className="flex gap-2">
            {isReadOnly ? (
              <>
                <button
                  type="button"
                  onClick={() => setShowAddendumModal(true)}
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-sm font-black flex items-center gap-2 shadow-md shadow-amber-600/20"
                >
                  <Plus size={16} /> Ajouter un Addendum
                </button>
                <button 
                  type="button"
                  onClick={handleClose}
                  className="px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-sm font-black flex items-center gap-2 shadow-sm"
                >
                  Fermer la vue
                </button>
              </>
            ) : (
              <>
                {(isCurrentlyHospitalized || patient?.hospitalizationStatus === 'en_cours' || patient?.status === 'hospitalise') ? (
                  <button 
                    disabled
                    className="px-5 py-2 bg-slate-100 border border-slate-200 text-slate-400 rounded-xl text-sm font-black flex items-center gap-2 cursor-not-allowed opacity-80"
                    title="Ce patient est déjà admis en hospitalisation"
                    type="button"
                  >
                    <Hospital size={16} /> Patient Déjà Hospitalisé
                  </button>
                ) : (
                  onHospitalize && (
                    <button 
                      onClick={handleTriggerHospitalize}
                      className="px-5 py-2 bg-amber-50 border border-amber-200 text-amber-700 rounded-xl text-sm font-black flex items-center gap-2 hover:bg-amber-100"
                      type="button"
                    >
                      <Hospital size={16} /> Hospitaliser
                    </button>
                  )
                )}
                <button 
                  onClick={handleSave}
                  className="px-5 py-2 bg-white border border-slate-300 text-slate-700 rounded-xl text-sm font-black flex items-center gap-2 hover:bg-slate-50 shadow-sm"
                  type="button"
                >
                  <Save size={16} className="text-slate-500" /> Enregistrer Brouillon
                </button>
                <button 
                  onClick={handleTriggerCloturer}
                  className="px-5 py-2 bg-emerald-600 text-white rounded-xl text-sm font-black flex items-center gap-2 hover:bg-emerald-700 shadow-lg shadow-emerald-600/20"
                  type="button"
                >
                  <Check size={16} /> Clôturer la Consultation
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Addendum Modal */}
      {showAddendumModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl p-6 border border-slate-200 animate-in zoom-in-95">
            <div className="flex justify-between items-start mb-4 pb-4 border-b border-slate-150">
              <div>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-50 text-amber-800 border border-amber-200 mb-1.5">
                  <ShieldCheck size={12} /> Protection Médico-Légale
                </span>
                <h3 className="text-lg font-black text-slate-900">Rédiger un Addendum Horodaté</h3>
                <p className="text-xs text-slate-500 font-medium">Les observations d'un dossier clôturé ne peuvent être modifiées silencieusement. Cet addendum sera annexé au dossier avec horodatage et signature électronique.</p>
              </div>
              <button 
                onClick={() => setShowAddendumModal(false)}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-black text-slate-700 uppercase tracking-wider block mb-1.5">Motif / Nature de l'Addendum</label>
                <select 
                  value={addendumReason}
                  onChange={(e) => setAddendumReason(e.target.value)}
                  className="w-full p-3 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 bg-slate-50 focus:bg-white focus:border-amber-500 outline-none"
                >
                  <option value="Résultat d'examen complémentaire">🔬 Réception de résultats d'examens (Laboratoire / Imagerie)</option>
                  <option value="Précision diagnostique">📋 Précision / Ajustement diagnostique</option>
                  <option value="Réévaluation clinique">🩺 Réévaluation clinique suite à l'évolution</option>
                  <option value="Modification thérapeutique">💊 Modification de posologie ou thérapeutique</option>
                  <option value="Autre précision médico-légale">📝 Autre note médico-légale</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-black text-slate-700 uppercase tracking-wider block mb-1.5">Observations / Complément Médical</label>
                <textarea
                  rows={5}
                  value={addendumContent}
                  onChange={(e) => setAddendumContent(e.target.value)}
                  placeholder="Ex: Réception ce jour des résultats d'hémoculture confirmant la présence de Salmonella sp. Adaptation de l'antibiothérapie par Ciprofloxacine 500mg 2x/j..."
                  className="w-full p-4 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 bg-white focus:border-amber-500 outline-none"
                />
              </div>

              <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-3 flex items-center justify-between text-[11px] text-amber-800 font-medium">
                <div className="flex items-center gap-2">
                  <Lock size={14} className="text-amber-700 shrink-0" />
                  <span>Signé par : <strong>{user?.name || 'Docteur'}</strong> ({user?.profession || user?.role || 'Praticien'})</span>
                </div>
                <span className="font-mono text-[10px] font-bold text-amber-900">{new Date().toLocaleDateString('fr-FR')} {new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-150 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowAddendumModal(false)}
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={isSavingAddendum || !addendumContent.trim()}
                onClick={handleSaveAddendum}
                className="px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-black uppercase tracking-wider shadow-md flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSavingAddendum ? <RefreshCw size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
                {isSavingAddendum ? 'Scellement...' : 'Sceller l\'Addendum'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Zero-Stock Warning Modal */}
      {showZeroStockModal && zeroStockDrug && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xl p-6 border border-slate-200 animate-in zoom-in-95">
            <div className="flex items-start gap-4 mb-4 pb-4 border-b border-slate-150">
              <div className="w-12 h-12 rounded-2xl bg-rose-100 flex items-center justify-center text-rose-600 shrink-0">
                <AlertTriangle size={24} />
              </div>
              <div className="flex-1 min-w-0">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-rose-100 text-rose-800 mb-1">
                  Rupture Pharmacie Centrale
                </span>
                <h3 className="text-base font-black text-slate-900">{zeroStockDrug.name}</h3>
                <p className="text-xs text-slate-500 font-semibold mt-0.5">
                  Ce produit a un stock disponible de <strong className="text-rose-600">0 unité</strong> à la pharmacie interne.
                </p>
              </div>
              <button 
                onClick={() => {
                  setShowZeroStockModal(false);
                  setZeroStockDrug(null);
                }}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <h4 className="text-xs font-black text-slate-700 uppercase tracking-wider mb-2">
                  Alternatives disponibles en stock ({zeroStockAlternatives.length})
                </h4>
                {zeroStockAlternatives.length > 0 ? (
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {zeroStockAlternatives.map((alt, idx) => (
                      <div key={idx} className="p-3 bg-emerald-50/50 border border-emerald-200 rounded-xl flex items-center justify-between">
                        <div>
                          <h5 className="text-xs font-black text-slate-900">{alt.name}</h5>
                          <p className="text-[10px] text-slate-500 font-medium">{alt.family} • Stock: <strong>{alt.stock || 50}</strong> • {alt.price} FCFA</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setCustomDrugName(alt.name);
                            setCustomDrugPrice(alt.price);
                            setCustomPosology(alt.defaultPosology || '1 comprimé 3 fois par jour');
                            setShowZeroStockModal(false);
                            setZeroStockDrug(null);
                          }}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-black uppercase tracking-wider"
                        >
                          Choisir cette alternative
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-center">
                    <p className="text-xs text-slate-500 italic">Aucun équivalent direct en stock dans la même famille thérapeutique ({zeroStockDrug.family}).</p>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-150 flex justify-between items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setCustomDrugName(`${zeroStockDrug.name} (Prescription Externe / Rupture Int.)`);
                  setCustomDrugPrice(zeroStockDrug.price);
                  setCustomPosology(zeroStockDrug.defaultPosology || '1 comprimé 3 fois par jour');
                  setShowZeroStockModal(false);
                  setZeroStockDrug(null);
                }}
                className="text-[10px] font-black uppercase tracking-wider text-rose-600 hover:text-rose-800 underline cursor-pointer"
              >
                Prescrire en externe malgré la rupture
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowZeroStockModal(false);
                  setZeroStockDrug(null);
                }}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Unsent Orders Guardrail Warning Modal */}
      {showUnsentWarningModal && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-md z-[120] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xl p-6 border-2 border-amber-300 animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="flex items-start gap-4 mb-4 pb-4 border-b border-amber-100">
              <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0 border border-amber-300">
                <AlertTriangle size={26} className="animate-bounce" />
              </div>
              <div className="flex-1">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-100 text-amber-900 border border-amber-300 mb-1">
                  <ShieldCheck size={12} /> Sécurité des Prescriptions
                </span>
                <h3 className="text-lg font-black text-slate-900 leading-tight">
                  Attention : Prescriptions non transmises
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowUnsentWarningModal(false);
                  setUnsentPendingAction(null);
                }}
                className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Core Warning Text */}
            <div className="p-4 bg-amber-50/80 border border-amber-200/80 rounded-2xl mb-4">
              <p className="text-sm font-bold text-amber-950 leading-relaxed">
                Attention: Vous avez sélectionné des examens ou médicaments sans les envoyer. Voulez-vous vraiment quitter ?
              </p>
              <p className="text-xs text-amber-800/90 font-medium mt-1">
                Si vous quittez sans envoyer, ces éléments ne parviendront pas à la Caisse, à la Pharmacie ou au Laboratoire pour exécution.
              </p>
            </div>

            {/* Unsent Items Breakdown */}
            <div className="space-y-3 max-h-56 overflow-y-auto pr-1 custom-scrollbar mb-5">
              {prescriptions.length > 0 && !isPrescriptionTransmitted && (
                <div className="p-3.5 bg-blue-50/60 border border-blue-200/70 rounded-2xl space-y-2">
                  <div className="flex items-center justify-between text-xs font-black uppercase text-blue-900">
                    <span className="flex items-center gap-1.5"><Pill size={14} className="text-blue-600" /> Médicaments en attente ({prescriptions.length})</span>
                    <span className="text-[10px] bg-blue-200/60 text-blue-800 px-2 py-0.5 rounded-md font-bold">Non transmis</span>
                  </div>
                  <ul className="space-y-1.5 pt-1">
                    {prescriptions.map((p, idx) => (
                      <li key={idx} className="text-xs text-slate-700 bg-white p-2 rounded-xl border border-blue-100 flex items-center justify-between">
                        <span className="font-bold text-slate-900">{p.name}</span>
                        <span className="text-[11px] text-slate-500 font-medium italic truncate max-w-[200px]">{p.posologie || 'Posologie standard'}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {examensDemandes.length > 0 && !isExamsTransmitted && (
                <div className="p-3.5 bg-purple-50/60 border border-purple-200/70 rounded-2xl space-y-2">
                  <div className="flex items-center justify-between text-xs font-black uppercase text-purple-900">
                    <span className="flex items-center gap-1.5"><Beaker size={14} className="text-purple-600" /> Examens Biologiques/Imagerie en attente ({examensDemandes.length})</span>
                    <span className="text-[10px] bg-purple-200/60 text-purple-800 px-2 py-0.5 rounded-md font-bold">Non transmis</span>
                  </div>
                  <ul className="space-y-1.5 pt-1">
                    {examensDemandes.map((e, idx) => (
                      <li key={idx} className="text-xs text-slate-700 bg-white p-2 rounded-xl border border-purple-100 flex items-center justify-between">
                        <span className="font-bold text-slate-900">{e.name}</span>
                        {e.urgent && (
                          <span className="text-[10px] font-black uppercase bg-rose-100 text-rose-700 px-2 py-0.5 rounded">Urgent</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Actions Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setShowUnsentWarningModal(false);
                  setUnsentPendingAction(null);
                }}
                className="w-full sm:w-auto px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all text-center cursor-pointer"
              >
                Rester sur la consultation
              </button>

              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                <button
                  type="button"
                  onClick={handleForceProceedWithoutSending}
                  className="px-3.5 py-2.5 text-rose-600 hover:bg-rose-50 border border-rose-200 rounded-xl text-xs font-bold transition-all text-center cursor-pointer"
                >
                  Quitter sans envoyer
                </button>

                <button
                  type="button"
                  onClick={handleTransmitAndProceed}
                  className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-lg shadow-emerald-600/25 flex items-center gap-1.5 transition-all text-center cursor-pointer"
                >
                  <Send size={14} /> Envoyer & {unsentPendingAction === 'CLOTURER' ? 'Clôturer' : 'Quitter'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
