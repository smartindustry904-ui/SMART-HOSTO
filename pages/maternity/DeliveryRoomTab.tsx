import React, { useState, useEffect } from 'react';
import { 
  Baby, 
  BedDouble, 
  Activity, 
  Clock, 
  Plus, 
  Search, 
  CheckCircle2, 
  AlertTriangle, 
  User as UserIcon, 
  FileText, 
  Heart, 
  X, 
  Save, 
  ArrowRight, 
  LogOut, 
  ShieldCheck,
  Calendar,
  Sparkles,
  Loader2
} from 'lucide-react';
import { 
  collection, 
  doc, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  onSnapshot, 
  query, 
  orderBy 
} from 'firebase/firestore';
import { db, sanitizeData } from '../../src/firebase';
import { deductConsumablesForAct } from '../../src/utils/consumablesStock';
import { 
  User, 
  MaternityAdmission, 
  MaternityDelivery, 
  NewbornRecord, 
  Bed, 
  Room 
} from '../../types';
import { useSettings } from '../../hooks/useSettings';

interface DeliveryRoomTabProps {
  user: User;
  maternityBeds: Bed[];
  rooms: Room[];
  initialPatient?: any | null;
  onClearInitialPatient?: () => void;
  theme?: 'light' | 'dark';
}

export const DeliveryRoomTab: React.FC<DeliveryRoomTabProps> = ({
  user,
  maternityBeds = [],
  rooms = [],
  initialPatient,
  onClearInitialPatient,
  theme = 'light'
}) => {
  const { establishment } = useSettings();

  // Active admissions list in Firestore
  const [admissions, setAdmissions] = useState<MaternityAdmission[]>([]);
  const [deliveries, setDeliveries] = useState<MaternityDelivery[]>([]);
  const [newborns, setNewborns] = useState<NewbornRecord[]>([]);

  // Filter by status: ALL | 'En attente' | 'Admise' | 'En travail' | 'Accouchement réalisé' | 'Suites immédiates'
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [showAdmissionModal, setShowAdmissionModal] = useState(false);
  const [showDeliveryModal, setShowDeliveryModal] = useState(false);
  const [showMonitoringModal, setShowMonitoringModal] = useState(false);
  const [showDischargeModal, setShowDischargeModal] = useState(false);

  // Active patient / admission being edited
  const [selectedAdmission, setSelectedAdmission] = useState<MaternityAdmission | null>(null);

  // Anti-double click strict loading states
  const [isSubmittingAdmission, setIsSubmittingAdmission] = useState(false);
  const [isSubmittingDelivery, setIsSubmittingDelivery] = useState(false);
  const [isSubmittingMonitoring, setIsSubmittingMonitoring] = useState(false);
  const [isSubmittingDischarge, setIsSubmittingDischarge] = useState(false);

  // Admission Form State
  const [admissionForm, setAdmissionForm] = useState({
    patientId: '',
    patientName: '',
    patientDossierNum: '',
    patientAge: '',
    admissionDate: new Date().toISOString().split('T')[0],
    admissionTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    gestationalAge: '39 SA',
    motif: 'Travail spontané',
    contractions: 'Régulières (3 contractions par 10 min)',
    liquidLoss: 'Non',
    bleeding: 'Non',
    fetalMovements: 'Bons',
    bpSys: 115,
    bpDia: 75,
    pulse: 80,
    temp: 36.9,
    bcf: 140,
    presentation: 'Céphalique',
    dilation: 4,
    effacement: '80%',
    waterBag: 'Intacte',
    bedId: '',
    observations: '',
    obstetricalHistory: ''
  });

  // Patient search for admission form
  const [patientSearch, setPatientSearch] = useState('');
  const [patientSearchResults, setPatientSearchResults] = useState<any[]>([]);

  // Delivery & Newborn Form State
  const [deliveryForm, setDeliveryForm] = useState({
    deliveryDate: new Date().toISOString().split('T')[0],
    deliveryTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    deliveryMode: 'Voie basse spontanée',
    location: 'Salle d’Accouchement Maternité',
    attendedBy: user.name || 'Sage-femme',
    fetalPresentation: 'Céphalique',
    placentaMode: 'Délivrance spontanée complète',
    placentaComplete: true,
    placentaTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    perineumState: 'Périnée intact',
    bloodLossMl: 250,
    medsAdministered: 'Ocytocine 10 UI IM après dégagement',
    complications: 'Aucune',
    deliveryObservations: 'Accouchement eutocique sans incident.',
    // Newborn
    newbornGender: 'M' as 'M' | 'F',
    newbornFirstName: '',
    newbornLastName: '',
    newbornBirthTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    newbornWeight: 3250,
    newbornHeight: 50,
    newbornHeadCircumference: 35,
    apgar1Min: 9,
    apgar5Min: 10,
    resuscitation: 'Non (bonne adaptation néonatale immédiate)',
    careGiven: 'Vitamine K1 1mg, Collyre soins yeux, Soins cordon ombilical, Mise au sein précoce',
    newbornObservations: 'Nouveau-né tonique, cri franc à la naissance, réflexes archaïques présents.'
  });

  // Monitoring update form state
  const [monitoringForm, setMonitoringForm] = useState({
    dilation: 4,
    contractions: '',
    bcf: 140,
    bpSys: 120,
    bpDia: 80,
    pulse: 80,
    temp: 37,
    notes: '',
    newStatus: 'En travail' as any
  });

  // Immediate postpartum discharge form state
  const [dischargeForm, setDischargeForm] = useState({
    uterineGlobe: 'Bien tonique (Globe de sécurité présent)',
    bleeding: 'Physiologique minime',
    bpSys: 120,
    bpDia: 75,
    destination: 'Suites de couches Maternité',
    notes: 'Surveillance immédiate satisfaisante, mère et nouveau-né stables.'
  });

  // Listen to maternity admissions
  useEffect(() => {
    const q = query(collection(db, 'maternity_admissions'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MaternityAdmission));
      setAdmissions(list);
    });
    return () => unsub();
  }, []);

  // Listen to maternity deliveries
  useEffect(() => {
    const q = query(collection(db, 'maternity_deliveries'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MaternityDelivery));
      setDeliveries(list);
    });
    return () => unsub();
  }, []);

  // Listen to newborns
  useEffect(() => {
    const q = query(collection(db, 'newborns'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as NewbornRecord));
      setNewborns(list);
    });
    return () => unsub();
  }, []);

  // When initialPatient prop is supplied, prepopulate admission modal
  useEffect(() => {
    if (initialPatient) {
      setAdmissionForm(prev => ({
        ...prev,
        patientId: initialPatient.id || initialPatient.dmeId || '',
        patientName: `${initialPatient.lastName || ''} ${initialPatient.firstName || ''}`.trim(),
        patientDossierNum: initialPatient.dmeId || initialPatient.id || '',
        patientAge: initialPatient.age ? String(initialPatient.age) : '',
        motif: initialPatient.motifLabel || 'Admission Maternité / Travail'
      }));
      setShowAdmissionModal(true);
    }
  }, [initialPatient]);

  // Handle patient search for admission
  const handleSearchPatient = async (term: string) => {
    setPatientSearch(term);
    if (!term.trim() || term.length < 2) {
      setPatientSearchResults([]);
      return;
    }

    try {
      const q = query(collection(db, 'patients'));
      const unsub = onSnapshot(q, (snapshot) => {
        const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const filtered = list.filter((p: any) => {
          const full = `${p.lastName || ''} ${p.firstName || ''} ${p.id || ''}`.toLowerCase();
          return full.includes(term.toLowerCase());
        });
        setPatientSearchResults(filtered.slice(0, 5));
      });
      return () => unsub();
    } catch (e) {
      console.warn('Patient search error:', e);
    }
  };

  // Submit new admission
  const handleSaveAdmission = async () => {
    if (isSubmittingAdmission) return;
    if (!admissionForm.patientName) {
      alert('Veuillez sélectionner ou saisir une patiente.');
      return;
    }

    setIsSubmittingAdmission(true);
    try {
      const admissionId = `ADM-MAT-${Date.now()}`;
      const nowIso = new Date().toISOString();

      const newAdmission: MaternityAdmission = {
        id: admissionId,
        patientId: admissionForm.patientId || `PAT-${Date.now()}`,
        patientName: admissionForm.patientName,
        patientDossierNum: admissionForm.patientDossierNum,
        patientAge: admissionForm.patientAge,
        admissionDate: admissionForm.admissionDate,
        admissionTime: admissionForm.admissionTime,
        admittedAt: nowIso,
        gestationalAge: admissionForm.gestationalAge,
        motif: admissionForm.motif,
        stage: 'LABOR',
        status: 'En travail',
        contractions: admissionForm.contractions,
        liquidLoss: admissionForm.liquidLoss,
        bleeding: admissionForm.bleeding,
        fetalMovements: admissionForm.fetalMovements,
        bpSys: Number(admissionForm.bpSys) || 120,
        bpDia: Number(admissionForm.bpDia) || 80,
        pulse: Number(admissionForm.pulse) || 80,
        temp: Number(admissionForm.temp) || 37,
        bcf: Number(admissionForm.bcf) || 140,
        presentation: admissionForm.presentation,
        dilation: Number(admissionForm.dilation) || 3,
        observations: `${admissionForm.observations} (Effacement: ${admissionForm.effacement}, Poche: ${admissionForm.waterBag})`,
        obstetricalHistory: admissionForm.obstetricalHistory,
        bedId: admissionForm.bedId || undefined,
        midwife: user.name || 'Sage-femme',
        midwifeId: user.id || '',
        practitionerId: user.id || '',
        practitionerName: user.name || user.username || 'Sage-femme',
        practitionerRole: user.role || 'SAGE_FEMME',
        createdAt: nowIso,
        updatedAt: nowIso
      };

      await setDoc(doc(db, 'maternity_admissions', admissionId), sanitizeData(newAdmission));

      // If a bed was assigned, update bed status
      if (admissionForm.bedId) {
        await updateDoc(doc(db, 'beds', admissionForm.bedId), sanitizeData({
          status: 'OCCUPIED',
          patientId: newAdmission.patientId,
          patientName: newAdmission.patientName
        }));
      }

      setShowAdmissionModal(false);
      if (onClearInitialPatient) onClearInitialPatient();
      window.dispatchEvent(new CustomEvent('app-notification', {
        detail: `Patiente ${newAdmission.patientName} admise en salle d'accouchement.`
      }));
    } catch (err) {
      console.error('Erreur enregistrement admission:', err);
      alert('Erreur lors de l’admission de la patiente.');
    } finally {
      setIsSubmittingAdmission(false);
    }
  };

  // Open delivery recording modal
  const openDeliveryModal = (admission: MaternityAdmission) => {
    setSelectedAdmission(admission);
    setDeliveryForm(prev => ({
      ...prev,
      deliveryDate: new Date().toISOString().split('T')[0],
      deliveryTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      newbornLastName: admission.patientName.split(' ')[0] || 'BÉBÉ',
      newbornBirthTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }));
    setShowDeliveryModal(true);
  };

  // Save delivery and create newborn record
  const handleSaveDelivery = async () => {
    if (isSubmittingDelivery) return;
    if (!selectedAdmission) return;

    setIsSubmittingDelivery(true);
    try {
      const deliveryId = `DELIV-${Date.now()}`;
      const newbornId = `NN-${Date.now()}`;
      const newbornDossier = `NN-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
      const nowIso = new Date().toISOString();

      // 1. Create Maternity Delivery Document
      const deliveryDoc: MaternityDelivery = {
        id: deliveryId,
        admissionId: selectedAdmission.id,
        pregnancyId: selectedAdmission.pregnancyId,
        motherPatientId: selectedAdmission.patientId,
        motherName: selectedAdmission.patientName,
        motherDossierNum: selectedAdmission.patientDossierNum,
        motherAge: selectedAdmission.patientAge,
        deliveryDate: deliveryForm.deliveryDate,
        deliveryTime: deliveryForm.deliveryTime,
        deliveryMode: deliveryForm.deliveryMode,
        location: deliveryForm.location,
        attendedBy: deliveryForm.attendedBy || user.name || 'Sage-femme',
        attendedById: user.id || '',
        midwife: user.name || 'Sage-femme',
        midwifeId: user.id || '',
        practitionerId: user.id || '',
        practitionerName: deliveryForm.attendedBy || user.name || 'Sage-femme',
        practitionerRole: user.role || 'SAGE_FEMME',
        fetalPresentation: deliveryForm.fetalPresentation,
        newbornId: newbornId,
        newbornGender: deliveryForm.newbornGender,
        newbornBirthTime: deliveryForm.newbornBirthTime,
        newbornWeight: Number(deliveryForm.newbornWeight) || 3000,
        newbornHeight: Number(deliveryForm.newbornHeight) || 50,
        newbornHeadCircumference: Number(deliveryForm.newbornHeadCircumference) || 35,
        apgar1Min: Number(deliveryForm.apgar1Min) || 10,
        apgar5Min: Number(deliveryForm.apgar5Min) || 10,
        newbornObservations: `${deliveryForm.newbornObservations} | Réanimation: ${deliveryForm.resuscitation} | Soins: ${deliveryForm.careGiven}`,
        maternalImmediateState: `Placenta: ${deliveryForm.placentaMode} | Périnée: ${deliveryForm.perineumState} | Pertes: ${deliveryForm.bloodLossMl} ml`,
        maternalObservations: `${deliveryForm.deliveryObservations} | Médicaments: ${deliveryForm.medsAdministered} | Complications: ${deliveryForm.complications}`,
        immediateDisposition: 'Suites immédiates Maternité',
        createdAt: nowIso
      };
      await setDoc(doc(db, 'maternity_deliveries', deliveryId), sanitizeData(deliveryDoc));
      deductConsumablesForAct({
        actName: deliveryForm.deliveryMode || 'Accouchement',
        user,
        moduleSource: 'Maternité (Accouchement)'
      }).catch(() => {});

      // 2. Create Newborn Record in 'newborns'
      const newbornDoc: NewbornRecord = {
        id: newbornId,
        dossierNumber: newbornDossier,
        firstName: deliveryForm.newbornFirstName || 'Nouveau-né',
        lastName: deliveryForm.newbornLastName || selectedAdmission.patientName,
        motherId: selectedAdmission.patientId,
        motherName: selectedAdmission.patientName,
        motherDossierNum: selectedAdmission.patientDossierNum,
        deliveryId: deliveryId,
        pregnancyId: selectedAdmission.pregnancyId,
        birthDate: deliveryForm.deliveryDate,
        birthTime: deliveryForm.newbornBirthTime,
        gender: deliveryForm.newbornGender,
        weight: Number(deliveryForm.newbornWeight) || 3000,
        height: Number(deliveryForm.newbornHeight) || 50,
        headCircumference: Number(deliveryForm.newbornHeadCircumference) || 35,
        apgar1: Number(deliveryForm.apgar1Min) || 10,
        apgar5: Number(deliveryForm.apgar5Min) || 10,
        establishment: establishment?.name || 'Maternité Hospitalière',
        observations: `${deliveryForm.newbornObservations} | Soins: ${deliveryForm.careGiven}`,
        status: 'VIVANT',
        deliveredBy: deliveryForm.attendedBy || user.name || 'Sage-femme',
        deliveredById: user.id || '',
        practitionerId: user.id || '',
        practitionerName: deliveryForm.attendedBy || user.name || 'Sage-femme',
        createdAt: nowIso
      };
      await setDoc(doc(db, 'newborns', newbornId), sanitizeData(newbornDoc));

      // 3. Update Admission Stage & Status
      await updateDoc(doc(db, 'maternity_admissions', selectedAdmission.id), sanitizeData({
        stage: 'DELIVERY',
        status: 'Accouchement réalisé',
        updatedAt: nowIso
      }));

      setShowDeliveryModal(false);
      window.dispatchEvent(new CustomEvent('app-notification', {
        detail: `Accouchement enregistré avec succès. Nouveau-né N° ${newbornDossier} répertorié.`
      }));
    } catch (err) {
      console.error('Erreur enregistrement accouchement:', err);
      alert('Erreur lors de l’enregistrement de l’accouchement.');
    } finally {
      setIsSubmittingDelivery(false);
    }
  };

  // Open Monitoring update modal
  const openMonitoringModal = (adm: MaternityAdmission) => {
    setSelectedAdmission(adm);
    setMonitoringForm({
      dilation: adm.dilation || 4,
      contractions: adm.contractions || '',
      bcf: adm.bcf || 140,
      bpSys: adm.bpSys || 120,
      bpDia: adm.bpDia || 80,
      pulse: adm.pulse || 80,
      temp: adm.temp || 37,
      notes: '',
      newStatus: adm.status || 'En travail'
    });
    setShowMonitoringModal(true);
  };

  // Save Monitoring update
  const handleSaveMonitoring = async () => {
    if (isSubmittingMonitoring) return;
    if (!selectedAdmission) return;
    setIsSubmittingMonitoring(true);
    try {
      await updateDoc(doc(db, 'maternity_admissions', selectedAdmission.id), sanitizeData({
        dilation: Number(monitoringForm.dilation),
        contractions: monitoringForm.contractions,
        bcf: Number(monitoringForm.bcf),
        bpSys: Number(monitoringForm.bpSys),
        bpDia: Number(monitoringForm.bpDia),
        pulse: Number(monitoringForm.pulse),
        temp: Number(monitoringForm.temp),
        status: monitoringForm.newStatus,
        observations: monitoringForm.notes 
          ? `${selectedAdmission.observations || ''} [${new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}]: ${monitoringForm.notes}`
          : selectedAdmission.observations,
        updatedAt: new Date().toISOString()
      }));

      setShowMonitoringModal(false);
    } catch (err) {
      console.error('Erreur mise à jour suivi:', err);
    } finally {
      setIsSubmittingMonitoring(false);
    }
  };

  // Open Postpartum discharge / suites modal
  const openDischargeModal = (adm: MaternityAdmission) => {
    setSelectedAdmission(adm);
    setShowDischargeModal(true);
  };

  // Save Postpartum discharge
  const handleSaveDischarge = async (action: 'SUITES' | 'SORTIE', targetAdmission?: MaternityAdmission) => {
    if (isSubmittingDischarge) return;
    const target = targetAdmission || selectedAdmission;
    if (!target) return;
    setIsSubmittingDischarge(true);
    try {
      const nowIso = new Date().toISOString();

      if (action === 'SUITES') {
        await updateDoc(doc(db, 'maternity_admissions', target.id), sanitizeData({
          stage: 'POSTPARTUM',
          status: 'Suites immédiates',
          observations: `${target.observations || ''} | Post-partum: Globe: ${dischargeForm.uterineGlobe}, Saignement: ${dischargeForm.bleeding}`,
          updatedAt: nowIso
        }));
      } else {
        // Full discharge
        await updateDoc(doc(db, 'maternity_admissions', target.id), sanitizeData({
          stage: 'DISCHARGED',
          status: 'Sortie/transfert',
          observations: `${target.observations || ''} | Sortie le ${new Date().toLocaleDateString('fr-FR')}: ${dischargeForm.notes}`,
          updatedAt: nowIso
        }));

        // Free bed if occupied
        if (target.bedId) {
          await updateDoc(doc(db, 'beds', target.bedId), sanitizeData({
            status: 'AVAILABLE',
            patientId: null,
            patientName: null
          }));
        }
      }

      setShowDischargeModal(false);
    } catch (err) {
      console.error('Erreur clôture post-partum:', err);
    } finally {
      setIsSubmittingDischarge(false);
    }
  };

  // Filter admissions
  const safeAdmissions = admissions || [];
  const filteredAdmissions = safeAdmissions.filter(adm => {
    const text = `${adm.patientName || ''} ${adm.patientDossierNum || ''} ${adm.bedId || ''}`.toLowerCase();
    const matchSearch = text.includes(searchQuery.toLowerCase());
    if (!matchSearch) return false;

    if (statusFilter === 'ALL') return adm.status !== 'Sortie/transfert';
    return adm.status === statusFilter;
  });

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-purple-100 text-purple-600 flex items-center justify-center font-bold">
              <Baby size={22} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900">Salle d'Accouchement & Travail</h2>
              <p className="text-xs text-slate-500">
                Surveillance obstétricale, accouchements et enregistrement des nouveau-nés
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <div className="relative flex-1 md:w-60">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Rechercher patiente, lit..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:border-purple-500"
            />
          </div>

          <button
            onClick={() => {
              setAdmissionForm({
                patientId: '',
                patientName: '',
                patientDossierNum: '',
                patientAge: '',
                admissionDate: new Date().toISOString().split('T')[0],
                admissionTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                gestationalAge: '39 SA',
                motif: 'Travail spontané',
                contractions: 'Régulières',
                liquidLoss: 'Non',
                bleeding: 'Non',
                fetalMovements: 'Bons',
                bpSys: 115,
                bpDia: 75,
                pulse: 80,
                temp: 36.9,
                bcf: 140,
                presentation: 'Céphalique',
                dilation: 4,
                effacement: '80%',
                waterBag: 'Intacte',
                bedId: '',
                observations: '',
                obstetricalHistory: ''
              });
              setShowAdmissionModal(true);
            }}
            className="px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm shadow-purple-600/20 cursor-pointer"
          >
            <Plus size={15} />
            + Nouvelle Admission
          </button>
        </div>
      </div>

      {/* Status Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <button
          onClick={() => setStatusFilter('ALL')}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors whitespace-nowrap ${
            statusFilter === 'ALL' ? 'bg-purple-600 text-white shadow-sm' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
          }`}
        >
          En cours ({safeAdmissions.filter(a => a.status !== 'Sortie/transfert').length})
        </button>
        <button
          onClick={() => setStatusFilter('En attente')}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors whitespace-nowrap ${
            statusFilter === 'En attente' ? 'bg-purple-600 text-white shadow-sm' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
          }`}
        >
          En attente ({safeAdmissions.filter(a => a.status === 'En attente').length})
        </button>
        <button
          onClick={() => setStatusFilter('Admise')}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors whitespace-nowrap ${
            statusFilter === 'Admise' ? 'bg-purple-600 text-white shadow-sm' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
          }`}
        >
          Admise ({safeAdmissions.filter(a => a.status === 'Admise').length})
        </button>
        <button
          onClick={() => setStatusFilter('En travail')}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors whitespace-nowrap ${
            statusFilter === 'En travail' ? 'bg-purple-600 text-white shadow-sm' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
          }`}
        >
          En travail ({safeAdmissions.filter(a => a.status === 'En travail').length})
        </button>
        <button
          onClick={() => setStatusFilter('Accouchement réalisé')}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors whitespace-nowrap ${
            statusFilter === 'Accouchement réalisé' ? 'bg-purple-600 text-white shadow-sm' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
          }`}
        >
          Accouchement réalisé ({safeAdmissions.filter(a => a.status === 'Accouchement réalisé').length})
        </button>
        <button
          onClick={() => setStatusFilter('Suites immédiates')}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors whitespace-nowrap ${
            statusFilter === 'Suites immédiates' ? 'bg-purple-600 text-white shadow-sm' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
          }`}
        >
          Suites immédiates ({safeAdmissions.filter(a => a.status === 'Suites immédiates').length})
        </button>
      </div>

      {/* Admitted Patients Grid */}
      {filteredAdmissions.length === 0 ? (
        <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center text-slate-400">
          <Baby size={36} className="mx-auto mb-2 opacity-30" />
          <h3 className="text-base font-bold text-slate-700">Aucune patiente dans la catégorie sélectionnée</h3>
          <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
            Utilisez le bouton "+ Nouvelle Admission" pour admettre une parturiente en salle de travail.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredAdmissions.map((adm) => {
            const isDelivered = adm.status === 'Accouchement réalisé' || adm.status === 'Suites immédiates';

            return (
              <div
                key={adm.id}
                className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm hover:border-purple-300 transition-all flex flex-col justify-between"
              >
                <div>
                  {/* Top Bar with Status & Bed */}
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase ${
                      adm.status === 'En travail' ? 'bg-pink-100 text-pink-700' :
                      adm.status === 'Accouchement réalisé' ? 'bg-emerald-100 text-emerald-700' :
                      adm.status === 'Suites immédiates' ? 'bg-blue-100 text-blue-700' :
                      'bg-purple-100 text-purple-700'
                    }`}>
                      {adm.status}
                    </span>

                    <span className="text-[11px] font-bold text-slate-600 flex items-center gap-1 bg-slate-100 px-2 py-0.5 rounded-md">
                      <BedDouble size={13} className="text-slate-400" />
                      {adm.bedId || 'Lit non assigné'}
                    </span>
                  </div>

                  {/* Patient Info */}
                  <div className="flex items-start gap-3 mb-3">
                    <div className="w-11 h-11 rounded-2xl bg-purple-100 text-purple-700 flex items-center justify-center font-black text-sm shrink-0">
                      {adm.patientName?.[0] || 'P'}
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-900 text-sm">{adm.patientName}</h3>
                      <p className="text-[10px] text-slate-400 font-mono">
                        N° {adm.patientDossierNum || adm.patientId} • Terme: <strong className="text-slate-700">{adm.gestationalAge || 'À terme'}</strong>
                      </p>
                    </div>
                  </div>

                  {/* Clinical Parameters Box */}
                  <div className="bg-slate-50 rounded-2xl p-3.5 space-y-1.5 text-xs text-slate-600 mb-4">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Admise à :</span>
                      <span className="font-semibold">{adm.admissionTime || 'N/A'} le {adm.admissionDate || 'Aujourd\'hui'}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Dilatation cervicale :</span>
                      <span className="font-bold text-pink-600 text-sm">
                        {adm.dilation ? `${adm.dilation} cm` : 'Non mesurée'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">BCF (Cœur fœtal) :</span>
                      <span className="font-bold text-emerald-600">{adm.bcf ? `${adm.bcf} bpm` : 'Surveillé'}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Présentation :</span>
                      <span className="font-semibold text-slate-800">{adm.presentation || 'Céphalique'}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Contractions :</span>
                      <span className="font-medium truncate max-w-[170px]">{adm.contractions || 'En évolution'}</span>
                    </div>

                    <div className="flex items-center gap-3 pt-1 border-t border-slate-200/60 text-[11px] text-slate-500">
                      {adm.bpSys && <span>TA: <strong className="text-slate-700">{adm.bpSys}/{adm.bpDia}</strong></span>}
                      {adm.pulse && <span>Pouls: <strong className="text-slate-700">{adm.pulse}</strong></span>}
                      {adm.temp && <span>T°: <strong className="text-slate-700">{adm.temp}°C</strong></span>}
                    </div>
                  </div>
                </div>

                {/* Workflow Actions */}
                <div className="space-y-2 pt-2 border-t border-slate-100">
                  {!isDelivered ? (
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => openMonitoringModal(adm)}
                        className="py-2.5 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <Activity size={13} />
                        Suivi Travail
                      </button>

                      <button
                        onClick={() => openDeliveryModal(adm)}
                        className="py-2.5 bg-purple-600 text-white hover:bg-purple-700 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm shadow-purple-600/20 cursor-pointer"
                      >
                        <Baby size={13} />
                        Accouchement
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => openDischargeModal(adm)}
                        className="py-2.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <ShieldCheck size={13} />
                        Suites de couches
                      </button>

                      <button
                        type="button"
                        disabled={isSubmittingDischarge}
                        onClick={() => handleSaveDischarge('SORTIE', adm)}
                        className="py-2.5 bg-slate-900 text-white hover:bg-slate-800 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isSubmittingDischarge ? (
                          <>
                            <Loader2 size={13} className="animate-spin" />
                            Sortie...
                          </>
                        ) : (
                          <>
                            <LogOut size={13} />
                            Clôturer & Sortie
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL 1: FORMULAIRE D'ADMISSION OBSTÉTRICALE (SECTION 12) */}
      {showAdmissionModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2 text-purple-700 font-bold">
                <Baby size={20} />
                <h3 className="text-base">Admission Obstétricale en Salle de Travail</h3>
              </div>
              <button onClick={() => setShowAdmissionModal(false)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>

            {/* Patient Search if not selected */}
            {!admissionForm.patientName && (
              <div className="bg-purple-50/50 p-4 rounded-2xl border border-purple-100 space-y-2">
                <label className="block text-xs font-bold text-purple-950">Rechercher la Parturiente</label>
                <input
                  type="text"
                  placeholder="Tapez le nom ou N° dossier de la patiente..."
                  value={patientSearch}
                  onChange={e => handleSearchPatient(e.target.value)}
                  className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs outline-none focus:border-purple-500"
                />

                {patientSearchResults.length > 0 && (
                  <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100 bg-white">
                    {patientSearchResults.map(p => (
                      <div
                        key={p.id}
                        onClick={() => {
                          setAdmissionForm({
                            ...admissionForm,
                            patientId: p.id,
                            patientName: `${p.lastName} ${p.firstName}`,
                            patientDossierNum: p.id,
                            patientAge: p.age ? String(p.age) : ''
                          });
                          setPatientSearchResults([]);
                        }}
                        className="p-2.5 hover:bg-purple-50 cursor-pointer flex justify-between items-center text-xs"
                      >
                        <div>
                          <p className="font-bold text-slate-900">{p.lastName} {p.firstName}</p>
                          <p className="text-[10px] text-slate-400">N° {p.id}</p>
                        </div>
                        <span className="text-[10px] font-bold text-purple-600">Choisir</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {admissionForm.patientName && (
              <div className="bg-purple-50 p-3 rounded-2xl flex items-center justify-between border border-purple-200">
                <div>
                  <p className="text-xs font-bold text-purple-950">{admissionForm.patientName}</p>
                  <p className="text-[10px] text-purple-700">Dossier N° {admissionForm.patientDossierNum || admissionForm.patientId}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setAdmissionForm({ ...admissionForm, patientName: '' })}
                  className="text-xs text-purple-600 underline font-bold"
                >
                  Changer
                </button>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Date & Heure d'Admission</label>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="date"
                    value={admissionForm.admissionDate}
                    onChange={e => setAdmissionForm({ ...admissionForm, admissionDate: e.target.value })}
                    className="p-2 bg-slate-50 border border-slate-200 rounded-xl"
                  />
                  <input
                    type="time"
                    value={admissionForm.admissionTime}
                    onChange={e => setAdmissionForm({ ...admissionForm, admissionTime: e.target.value })}
                    className="p-2 bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Terme Gestationnel</label>
                <input
                  type="text"
                  placeholder="Ex: 39 SA + 3 jours"
                  value={admissionForm.gestationalAge}
                  onChange={e => setAdmissionForm({ ...admissionForm, gestationalAge: e.target.value })}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Motif d'Admission</label>
                <select
                  value={admissionForm.motif}
                  onChange={e => setAdmissionForm({ ...admissionForm, motif: e.target.value })}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl"
                >
                  <option value="Travail spontané">Travail spontané</option>
                  <option value="Rupture prématurée des membranes (RPM)">Rupture prématurée des membranes (RPM)</option>
                  <option value="Déclenchement du travail">Déclenchement du travail</option>
                  <option value="Menace d'accouchement prématuré">Menace d'accouchement prématuré</option>
                  <option value="Hémorragie / Saignement">Hémorragie / Saignement</option>
                  <option value="Autre motif obstétrical">Autre motif obstétrical</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Lit d'assignation</label>
                <select
                  value={admissionForm.bedId}
                  onChange={e => setAdmissionForm({ ...admissionForm, bedId: e.target.value })}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-purple-700"
                >
                  <option value="">-- Assigner un lit plus tard --</option>
                  {maternityBeds.map(b => (
                    <option key={b.id} value={b.name || b.id}>
                      {b.name} ({b.status === 'OCCUPIED' ? 'Occupé' : 'Libre'})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Constantes & BCF */}
            <div className="pt-3 border-t border-slate-100">
              <h4 className="text-xs font-bold text-slate-900 mb-2">Constantes Maternelles & Fœtales</h4>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
                <div>
                  <label className="block text-slate-500 mb-1">TA Systolique</label>
                  <input
                    type="number"
                    value={admissionForm.bpSys}
                    onChange={e => setAdmissionForm({ ...admissionForm, bpSys: Number(e.target.value) })}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                  />
                </div>
                <div>
                  <label className="block text-slate-500 mb-1">TA Diastolique</label>
                  <input
                    type="number"
                    value={admissionForm.bpDia}
                    onChange={e => setAdmissionForm({ ...admissionForm, bpDia: Number(e.target.value) })}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                  />
                </div>
                <div>
                  <label className="block text-slate-500 mb-1">Pouls (bpm)</label>
                  <input
                    type="number"
                    value={admissionForm.pulse}
                    onChange={e => setAdmissionForm({ ...admissionForm, pulse: Number(e.target.value) })}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                  />
                </div>
                <div>
                  <label className="block text-slate-500 mb-1">Température (°C)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={admissionForm.temp}
                    onChange={e => setAdmissionForm({ ...admissionForm, temp: Number(e.target.value) })}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                  />
                </div>
                <div>
                  <label className="block text-slate-500 mb-1">BCF (bpm)</label>
                  <input
                    type="number"
                    value={admissionForm.bcf}
                    onChange={e => setAdmissionForm({ ...admissionForm, bcf: Number(e.target.value) })}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-emerald-600"
                  />
                </div>
              </div>
            </div>

            {/* Examen Obstétrical à l'admission */}
            <div className="pt-3 border-t border-slate-100">
              <h4 className="text-xs font-bold text-slate-900 mb-2">Examen Obstétrical Initial</h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div>
                  <label className="block text-slate-500 mb-1">Dilatation (cm)</label>
                  <input
                    type="number"
                    min="0"
                    max="10"
                    value={admissionForm.dilation}
                    onChange={e => setAdmissionForm({ ...admissionForm, dilation: Number(e.target.value) })}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl font-black text-pink-600"
                  />
                </div>
                <div>
                  <label className="block text-slate-500 mb-1">Effacement (%)</label>
                  <input
                    type="text"
                    value={admissionForm.effacement}
                    onChange={e => setAdmissionForm({ ...admissionForm, effacement: e.target.value })}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-slate-500 mb-1">Présentation</label>
                  <select
                    value={admissionForm.presentation}
                    onChange={e => setAdmissionForm({ ...admissionForm, presentation: e.target.value })}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl"
                  >
                    <option value="Céphalique">Céphalique</option>
                    <option value="Siège">Siège</option>
                    <option value="Transverse">Transverse</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-500 mb-1">Poche des eaux</label>
                  <select
                    value={admissionForm.waterBag}
                    onChange={e => setAdmissionForm({ ...admissionForm, waterBag: e.target.value })}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl"
                  >
                    <option value="Intacte">Intacte</option>
                    <option value="Rompue (liquide clair)">Rompue (clair)</option>
                    <option value="Rompue (liquide méconial)">Rompue (méconial)</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowAdmissionModal(false)}
                className="px-4 py-2 bg-slate-100 text-slate-600 rounded-xl text-xs font-bold"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={isSubmittingAdmission}
                onClick={handleSaveAdmission}
                className="px-6 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold cursor-pointer shadow-md shadow-purple-600/20 flex items-center gap-1.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmittingAdmission ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    Enregistrement...
                  </>
                ) : (
                  "Valider l'Admission"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: ENREGISTREMENT DE L'ACCOUCHEMENT & NOUVEAU-NÉ (SECTIONS 13 & 14) */}
      {showDeliveryModal && selectedAdmission && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-base text-slate-900">Enregistrement de l'Accouchement & Nouveau-né</h3>
                <p className="text-xs text-slate-500">Mère : {selectedAdmission.patientName} • N° {selectedAdmission.patientDossierNum || selectedAdmission.patientId}</p>
              </div>
              <button onClick={() => setShowDeliveryModal(false)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>

            {/* PART A: DÉROULEMENT DE L'ACCOUCHEMENT */}
            <div>
              <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                <Baby size={14} className="text-purple-600" />
                Déroulement de l'Accouchement (Section 13)
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div>
                  <label className="block text-slate-600 font-bold mb-1">Date & Heure</label>
                  <div className="grid grid-cols-2 gap-1.5">
                    <input
                      type="date"
                      value={deliveryForm.deliveryDate}
                      onChange={e => setDeliveryForm({ ...deliveryForm, deliveryDate: e.target.value })}
                      className="p-2 bg-slate-50 border border-slate-200 rounded-xl"
                    />
                    <input
                      type="time"
                      value={deliveryForm.deliveryTime}
                      onChange={e => setDeliveryForm({ ...deliveryForm, deliveryTime: e.target.value })}
                      className="p-2 bg-slate-50 border border-slate-200 rounded-xl"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-slate-600 font-bold mb-1">Mode d'Accouchement</label>
                  <select
                    value={deliveryForm.deliveryMode}
                    onChange={e => setDeliveryForm({ ...deliveryForm, deliveryMode: e.target.value })}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                  >
                    <option value="Voie basse spontanée">Voie basse spontanée</option>
                    <option value="Voie basse instrumentale (Ventouse)">Voie basse instrumentale (Ventouse)</option>
                    <option value="Voie basse instrumentale (Forceps)">Voie basse instrumentale (Forceps)</option>
                    <option value="Césarienne d'urgence">Césarienne d'urgence</option>
                    <option value="Césarienne programmée">Césarienne programmée</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-600 font-bold mb-1">Professionnel / Praticien</label>
                  <input
                    type="text"
                    value={deliveryForm.attendedBy}
                    onChange={e => setDeliveryForm({ ...deliveryForm, attendedBy: e.target.value })}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl font-medium"
                  />
                </div>

                <div>
                  <label className="block text-slate-600 font-bold mb-1">Délivrance Placentaire</label>
                  <select
                    value={deliveryForm.placentaMode}
                    onChange={e => setDeliveryForm({ ...deliveryForm, placentaMode: e.target.value })}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl"
                  >
                    <option value="Délivrance spontanée complète">Spontanée complète</option>
                    <option value="Délivrance dirigée (ocytocine)">Dirigée (ocytocine)</option>
                    <option value="Délivrance artificielle / Révision utérine">Artificielle / Révision</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-600 font-bold mb-1">Périnée</label>
                  <select
                    value={deliveryForm.perineumState}
                    onChange={e => setDeliveryForm({ ...deliveryForm, perineumState: e.target.value })}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl"
                  >
                    <option value="Périnée intact">Périnée intact</option>
                    <option value="Épisiotomie suturée">Épisiotomie suturée</option>
                    <option value="Déchirure simple suturée">Déchirure simple suturée</option>
                    <option value="Déchirure complexe">Déchirure complexe</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-600 font-bold mb-1">Pertes sanguines estimées</label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      value={deliveryForm.bloodLossMl}
                      onChange={e => setDeliveryForm({ ...deliveryForm, bloodLossMl: Number(e.target.value) })}
                      className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                    />
                    <span className="text-slate-400">ml</span>
                  </div>
                </div>
              </div>
            </div>

            {/* PART B: DOSSIER DU NOUVEAU-NÉ (SECTION 14) */}
            <div className="pt-4 border-t border-slate-100">
              <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                <Heart size={14} className="text-pink-600" />
                Dossier du Nouveau-Né (Section 14)
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div>
                  <label className="block text-slate-600 font-bold mb-1">Sexe</label>
                  <select
                    value={deliveryForm.newbornGender}
                    onChange={e => setDeliveryForm({ ...deliveryForm, newbornGender: e.target.value as any })}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-purple-700"
                  >
                    <option value="M">Masculin (Garçon)</option>
                    <option value="F">Féminin (Fille)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-600 font-bold mb-1">Prénom (si choisi)</label>
                  <input
                    type="text"
                    placeholder="Prénom..."
                    value={deliveryForm.newbornFirstName}
                    onChange={e => setDeliveryForm({ ...deliveryForm, newbornFirstName: e.target.value })}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>

                <div>
                  <label className="block text-slate-600 font-bold mb-1">Poids de naissance (g)</label>
                  <input
                    type="number"
                    value={deliveryForm.newbornWeight}
                    onChange={e => setDeliveryForm({ ...deliveryForm, newbornWeight: Number(e.target.value) })}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl font-black text-pink-600"
                  />
                </div>

                <div>
                  <label className="block text-slate-600 font-bold mb-1">Taille (cm)</label>
                  <input
                    type="number"
                    value={deliveryForm.newbornHeight}
                    onChange={e => setDeliveryForm({ ...deliveryForm, newbornHeight: Number(e.target.value) })}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                  />
                </div>

                <div>
                  <label className="block text-slate-600 font-bold mb-1">Périmètre Crânien (cm)</label>
                  <input
                    type="number"
                    value={deliveryForm.newbornHeadCircumference}
                    onChange={e => setDeliveryForm({ ...deliveryForm, newbornHeadCircumference: Number(e.target.value) })}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>

                <div>
                  <label className="block text-slate-600 font-bold mb-1">Score Apgar 1 min</label>
                  <input
                    type="number"
                    min="0"
                    max="10"
                    value={deliveryForm.apgar1Min}
                    onChange={e => setDeliveryForm({ ...deliveryForm, apgar1Min: Number(e.target.value) })}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-emerald-600"
                  />
                </div>

                <div>
                  <label className="block text-slate-600 font-bold mb-1">Score Apgar 5 min</label>
                  <input
                    type="number"
                    min="0"
                    max="10"
                    value={deliveryForm.apgar5Min}
                    onChange={e => setDeliveryForm({ ...deliveryForm, apgar5Min: Number(e.target.value) })}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-emerald-600"
                  />
                </div>

                <div>
                  <label className="block text-slate-600 font-bold mb-1">Réanimation</label>
                  <select
                    value={deliveryForm.resuscitation}
                    onChange={e => setDeliveryForm({ ...deliveryForm, resuscitation: e.target.value })}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl"
                  >
                    <option value="Non">Non (bonne adaptation)</option>
                    <option value="Aspiration simple">Aspiration simple</option>
                    <option value="Oxygénothérapie / Masque">Oxygénothérapie / Masque</option>
                    <option value="Transfert néonatalogie">Transfert néonatalogie</option>
                  </select>
                </div>
              </div>

              <div className="mt-3">
                <label className="block text-slate-600 font-bold mb-1 text-xs">Soins immédiats au nouveau-né</label>
                <input
                  type="text"
                  value={deliveryForm.careGiven}
                  onChange={e => setDeliveryForm({ ...deliveryForm, careGiven: e.target.value })}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowDeliveryModal(false)}
                className="px-4 py-2 bg-slate-100 text-slate-600 rounded-xl text-xs font-bold"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={isSubmittingDelivery}
                onClick={handleSaveDelivery}
                className="px-6 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold shadow-lg shadow-purple-600/20 cursor-pointer flex items-center gap-1.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmittingDelivery ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    Enregistrement de l'accouchement...
                  </>
                ) : (
                  "ENREGISTRER L'ACCOUCHEMENT & LE NOUVEAU-NÉ"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: SUIVI DU TRAVAIL RAPIDE */}
      {showMonitoringModal && selectedAdmission && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4 text-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-sm text-slate-900">Mise à Jour Suivi de Travail</h3>
              <button onClick={() => setShowMonitoringModal(false)} className="text-slate-400">
                <X size={18} />
              </button>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Dilatation Cervicale (cm)</label>
              <input
                type="number"
                min="0"
                max="10"
                value={monitoringForm.dilation}
                onChange={e => setMonitoringForm({ ...monitoringForm, dilation: Number(e.target.value) })}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-base font-black text-pink-600"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block font-bold text-slate-700 mb-1">BCF (bpm)</label>
                <input
                  type="number"
                  value={monitoringForm.bcf}
                  onChange={e => setMonitoringForm({ ...monitoringForm, bcf: Number(e.target.value) })}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-emerald-600"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Statut du travail</label>
                <select
                  value={monitoringForm.newStatus}
                  onChange={e => setMonitoringForm({ ...monitoringForm, newStatus: e.target.value })}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                >
                  <option value="En travail">En travail</option>
                  <option value="Accouchement réalisé">Accouchement imminent / réalisé</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Note d'évolution</label>
              <textarea
                rows={2}
                placeholder="Toucher vaginal, rupture des membranes, intensité contractions..."
                value={monitoringForm.notes}
                onChange={e => setMonitoringForm({ ...monitoringForm, notes: e.target.value })}
                className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowMonitoringModal(false)}
                className="px-4 py-2 bg-slate-100 rounded-xl font-bold text-slate-600"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={isSubmittingMonitoring}
                onClick={handleSaveMonitoring}
                className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-bold flex items-center gap-1.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmittingMonitoring ? (
                  <>
                    <Loader2 size={13} className="animate-spin" />
                    Enregistrement...
                  </>
                ) : (
                  'Valider Suivi'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: SUITES IMMÉDIATES POST-PARTUM */}
      {showDischargeModal && selectedAdmission && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4 text-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-sm text-slate-900">Surveillance Post-Partum Immédiate</h3>
              <button onClick={() => setShowDischargeModal(false)} className="text-slate-400">
                <X size={18} />
              </button>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Globe Utérin de Sécurité</label>
              <select
                value={dischargeForm.uterineGlobe}
                onChange={e => setDischargeForm({ ...dischargeForm, uterineGlobe: e.target.value })}
                className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl"
              >
                <option value="Bien tonique (Globe de sécurité présent)">Bien tonique (Globe de sécurité présent)</option>
                <option value="Atonie utérine / Massage requis">Atonie utérine / Massage requis</option>
              </select>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Saignements vaginaux</label>
              <select
                value={dischargeForm.bleeding}
                onChange={e => setDischargeForm({ ...dischargeForm, bleeding: e.target.value })}
                className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl"
              >
                <option value="Physiologique minime">Physiologique minime</option>
                <option value="Modéré sous surveillance">Modéré sous surveillance</option>
                <option value="Hémorragique / Prise en charge urgente">Hémorragique / Prise en charge urgente</option>
              </select>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Observations & Conseils</label>
              <textarea
                rows={2}
                value={dischargeForm.notes}
                onChange={e => setDischargeForm({ ...dischargeForm, notes: e.target.value })}
                className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowDischargeModal(false)}
                className="px-4 py-2 bg-slate-100 rounded-xl font-bold text-slate-600"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={isSubmittingDischarge}
                onClick={() => handleSaveDischarge('SUITES')}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold flex items-center gap-1.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmittingDischarge ? (
                  <>
                    <Loader2 size={13} className="animate-spin" />
                    Enregistrement...
                  </>
                ) : (
                  'Enregistrer Surveillance'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
