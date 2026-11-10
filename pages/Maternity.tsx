import React, { useState, useEffect, useMemo } from 'react';
import { 
  Baby, 
  Activity, 
  Heart, 
  Clock, 
  BedDouble, 
  Plus, 
  Pill, 
  Users, 
  Search, 
  ChevronRight, 
  Beaker, 
  FileText, 
  Calendar, 
  Stethoscope, 
  History, 
  ArrowRight,
  ShieldCheck,
  AlertTriangle
} from 'lucide-react';
import { useSettings } from '../hooks/useSettings';
import { 
  User, 
  Tool, 
  Patient, 
  Medication, 
  PaymentRequest, 
  LabExamRequest, 
  MaternitySubMenu, 
  Bed, 
  Room,
  PregnancyDossier,
  CPNVisit,
  MaternityAdmission,
  MaternityDelivery
} from '../types';
import DigitalPrescription from './tools/DigitalPrescription';
import LabExamRequestForm from '../components/LabExamRequestForm';
import ModuleDashboard from '../components/ModuleDashboard';
import { MicroHeader } from '../components/common/MicroHeader';
import { DEFAULT_TOOLS } from './settings/ToolsManagement';
import { collection, doc, setDoc, query, onSnapshot, orderBy } from 'firebase/firestore';
import { db, sanitizeData } from '../src/firebase';

// Modular Sub-components
import { WaitingRoomTab } from './maternity/WaitingRoomTab';
import { CpnTab } from './maternity/CpnTab';
import { DeliveryRoomTab } from './maternity/DeliveryRoomTab';
import { ObstetricalHistoryTab } from './maternity/ObstetricalHistoryTab';
import { getActiveTenantId, belongsToTenant, stampTenantData } from '../src/utils/tenant';

interface MaternityProps {
  user: User;
  activeTab: MaternitySubMenu | 'dashboard';
  setActiveTab: (tab: MaternitySubMenu | 'dashboard') => void;
  onBackToDashboard: () => void;
  paymentRequests?: PaymentRequest[];
  setPaymentRequests?: React.Dispatch<React.SetStateAction<PaymentRequest[]>>;
  waitingQueue?: any[];
  setWaitingQueue?: React.Dispatch<React.SetStateAction<any[]>>;
  theme?: 'light' | 'dark';
}

const Maternity: React.FC<MaternityProps> = ({ 
  user, 
  activeTab, 
  setActiveTab, 
  onBackToDashboard,
  paymentRequests = [], 
  setPaymentRequests,
  waitingQueue = [],
  setWaitingQueue,
  theme = 'light'
}) => {
  const { establishment } = useSettings();
  const activeTenantId = useMemo(() => getActiveTenantId(user, establishment), [user, establishment]);

  // Selected patient passed between tabs (e.g. from waiting room to CPN or Delivery)
  const [selectedPatient, setSelectedPatient] = useState<any | null>(null);

  // Firestore real collections for dashboard & coordination
  const [admissions, setAdmissions] = useState<MaternityAdmission[]>([]);
  const [deliveries, setDeliveries] = useState<MaternityDelivery[]>([]);
  const [pregnancies, setPregnancies] = useState<PregnancyDossier[]>([]);
  const [cpnVisits, setCpnVisits] = useState<CPNVisit[]>([]);
  const [beds, setBeds] = useState<Bed[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [medications, setMedications] = useState<Medication[]>([]);

  // Prescriptions & Exams Modals
  const [showDigitalPrescription, setShowDigitalPrescription] = useState(false);
  const [showLabExamForm, setShowLabExamForm] = useState(false);

  // Map legacy sub-menus ('labor', 'delivery', 'postpartum') to 'delivery_room'
  const normalizedActiveTab: MaternitySubMenu | 'dashboard' = useMemo(() => {
    if (activeTab === 'labor' || activeTab === 'delivery' || activeTab === 'postpartum') {
      return 'delivery_room';
    }
    return activeTab;
  }, [activeTab]);

  // Subscribe to Admissions
  useEffect(() => {
    const q = query(collection(db, 'maternity_admissions'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snapshot) => {
      const allAdmissions = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as MaternityAdmission));
      setAdmissions(allAdmissions.filter(d => belongsToTenant(d, activeTenantId)));
    });
    return () => unsub();
  }, [activeTenantId]);

  // Subscribe to Deliveries
  useEffect(() => {
    const q = query(collection(db, 'maternity_deliveries'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snapshot) => {
      const allDeliveries = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as MaternityDelivery));
      setDeliveries(allDeliveries.filter(d => belongsToTenant(d, activeTenantId)));
    });
    return () => unsub();
  }, [activeTenantId]);

  // Subscribe to Pregnancies
  useEffect(() => {
    const q = query(collection(db, 'pregnancy_dossiers'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snapshot) => {
      const allPregnancies = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as PregnancyDossier));
      setPregnancies(allPregnancies.filter(d => belongsToTenant(d, activeTenantId)));
    });
    return () => unsub();
  }, [activeTenantId]);

  // Subscribe to CPN Visits for Dashboard Metrics
  useEffect(() => {
    const q = query(collection(db, 'cpn_visits'), orderBy('date', 'desc'));
    const unsub = onSnapshot(q, (snapshot) => {
      const allVisits = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as CPNVisit));
      setCpnVisits(allVisits.filter(d => belongsToTenant(d, activeTenantId)));
    }, (err) => {
      console.warn('Error loading CPN visits in Maternity dashboard:', err);
    });
    return () => unsub();
  }, [activeTenantId]);

  // Subscribe to Beds & Rooms
  useEffect(() => {
    const unsubBeds = onSnapshot(collection(db, 'beds'), (snapshot) => {
      const allBeds = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Bed));
      setBeds(allBeds.filter(b => belongsToTenant(b, activeTenantId)));
    });
    const unsubRooms = onSnapshot(collection(db, 'rooms'), (snapshot) => {
      const allRooms = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Room));
      setRooms(allRooms.filter(r => belongsToTenant(r, activeTenantId)));
    });
    return () => {
      unsubBeds();
      unsubRooms();
    };
  }, [activeTenantId]);

  // Filter beds for Maternity
  const maternityBeds = useMemo(() => {
    return (beds || []).filter(b => b.category === 'materniter' || b.category === 'all');
  }, [beds]);

  // Filter waiting queue for maternity patients: STRICTLY CPN & Accouchement (Gynecology is routed to Consultation)
  const maternityQueue = useMemo(() => {
    return (waitingQueue || []).filter(p => {
      const motifLbl = (p.motifLabel || '').toLowerCase();
      const spec = (p.speciality || '').toLowerCase();
      const svc = (p.service || '').toLowerCase();
      const qName = (p.queueName || '').toLowerCase();

      // Exclude gynecological consultations from maternity queue (handled in Consultation module)
      if (motifLbl.includes('gynéco') || spec.includes('gynéco') || qName.includes('gynéco')) {
        return false;
      }

      const isMaternity = 
        p.serviceId === 'SRV-MATERNITE' || 
        svc === 'maternité' || 
        p.motif === 'MATERNITE' ||
        spec.includes('matern') ||
        spec.includes('obstétri') ||
        spec.includes('cpn') ||
        qName.includes('matern') ||
        motifLbl.includes('accouchement') ||
        motifLbl.includes('matern') ||
        motifLbl.includes('cpn') ||
        motifLbl.includes('travail') ||
        motifLbl.includes('césarienne');

      return isMaternity && p.status !== 'in_consultation';
    });
  }, [waitingQueue]);

  // Distinct Harmonized Dashboard Metrics (Consolidated Non-Redundant KPIs)
  const activePregnanciesCount = useMemo(() => {
    return (pregnancies || []).filter(p => p.status !== 'TERMINEE').length;
  }, [pregnancies]);

  const todayCpnCount = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    return (cpnVisits || []).filter(v => (v.date || '').startsWith(todayStr)).length;
  }, [cpnVisits]);

  const monthlyDeliveriesCount = useMemo(() => {
    const currentMonthStr = new Date().toISOString().slice(0, 7);
    return (deliveries || []).filter(d => (d.deliveryDate || d.createdAt || '').slice(0, 7) === currentMonthStr).length;
  }, [deliveries]);

  const maternityEmergenciesCount = useMemo(() => {
    const queueEmergencies = (maternityQueue || []).filter(p => 
      p.priority === 'URGENT' || 
      p.priority === 'EMERGENCY' || 
      p.isEmergency || 
      (p.motifLabel || p.motif || '').toLowerCase().includes('urgence') ||
      (p.motifLabel || p.motif || '').toLowerCase().includes('saignement') ||
      (p.motifLabel || p.motif || '').toLowerCase().includes('hémorragie')
    ).length;

    const admissionEmergencies = (admissions || []).filter(a => 
      a.isEmergency || 
      a.priority === 'URGENT' || 
      a.priority === 'EMERGENCY' ||
      (a.motif || '').toLowerCase().includes('urgence') ||
      (a.status === 'En travail' && (a.dilation || 0) >= 8)
    ).length;

    return queueEmergencies + admissionEmergencies;
  }, [maternityQueue, admissions]);

  // Load pharmacy inventory for prescription tool
  useEffect(() => {
    const unsubMeds = onSnapshot(collection(db, 'pharmacy_inventory'), (snap) => {
      if (!snap.empty) {
        const list = snap.docs.map(doc => {
          const d = doc.data();
          return {
            id: doc.id,
            name: d.name || d.nomCommercial || d.nom,
            dosage: d.dosage || (d.dosageValeur ? `${d.dosageValeur} ${d.dosageUnite || ''}`.trim() : ''),
            price: parseFloat(d.price) || parseFloat(d.prixVente) || 0,
            stock: parseInt(d.stock) || parseInt(d.quantite) || parseInt(d.unitesParConditionnement) || 0,
            quantityPerBox: parseInt(d.unitesParConditionnement) || 1,
            forms: d.forms || (d.formeGalenique ? [d.formeGalenique] : ['Comprimé'])
          } as Medication;
        });
        setMedications(list);
      } else {
        setMedications([
          { id: '1', name: 'Paracétamol', dosage: '500mg', price: 500, stock: 100, quantityPerBox: 16 },
          { id: '2', name: 'Amoxicilline', dosage: '1g', price: 2500, stock: 50, quantityPerBox: 14 },
          { id: '3', name: 'Ocytocine', dosage: '10 UI/ml', price: 1500, stock: 40, quantityPerBox: 10 },
          { id: '4', name: 'Fer + Acide Folique', dosage: '200mg/0.4mg', price: 1200, stock: 150, quantityPerBox: 30 }
        ]);
      }
    });
    return () => unsubMeds();
  }, []);

  // Handlers from WaitingRoomTab
  const handleSelectPatientForCpn = (patient: any) => {
    setSelectedPatient(patient);
    setActiveTab('cpn');
  };

  const handleSelectPatientForDelivery = (patient: any) => {
    setSelectedPatient(patient);
    setActiveTab('delivery_room');
  };

  // Convert selectedPatient to standard Patient format for digital prescription
  const prescriptionPatient: Patient | null = useMemo(() => {
    if (!selectedPatient) return null;
    return {
      id: selectedPatient.patientId || selectedPatient.id,
      firstName: selectedPatient.firstName || selectedPatient.patientName?.split(' ').slice(1).join(' ') || '',
      lastName: selectedPatient.lastName || selectedPatient.patientName?.split(' ')[0] || 'Patiente',
      birthDate: '1995-01-01',
      gender: 'F',
      phone: selectedPatient.phone || '',
      residence: selectedPatient.residence || '',
      emergencyContact: '',
      emergencyPhone: '',
      maritalStatus: 'MARIE'
    };
  }, [selectedPatient]);

  return (
    <div className={`h-screen flex flex-col overflow-hidden p-3 sm:p-5 font-sans ${theme === 'dark' ? 'bg-[#090d16] text-slate-100' : 'bg-[#F8FAFC] text-slate-900'}`}>
      {/* Universal MicroHeader with 5 tabs conforming to Section 1 & Section 17 */}
      <MicroHeader
        icon={Baby}
        breadcrumbs={[
          { label: 'Maternité', onClick: () => setActiveTab('dashboard') },
          { 
            label: normalizedActiveTab === 'dashboard' ? 'Tableau de Bord' :
                   normalizedActiveTab === 'waiting_room' ? 'Salle d\'Attente' :
                   normalizedActiveTab === 'cpn' ? 'Espace CPN' :
                   normalizedActiveTab === 'delivery_room' ? 'Salle d\'Accouchement' : 'Historique Obstétrical',
            active: true
          }
        ]}
        onHomeClick={onBackToDashboard}
        onBackClick={normalizedActiveTab !== 'dashboard' ? () => setActiveTab('dashboard') : undefined}
        user={{ name: user?.name || 'Maternité' }}
        theme={theme}
        actions={
          <div className="flex items-center gap-1.5 overflow-x-auto">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`px-3 py-1.5 rounded-xl font-semibold text-xs transition-colors cursor-pointer flex items-center gap-1.5 ${
                normalizedActiveTab === 'dashboard' 
                  ? 'bg-pink-600 text-white shadow-xs' 
                  : theme === 'dark'
                  ? 'bg-slate-800/80 border border-slate-700/80 text-slate-300 hover:bg-slate-800'
                  : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              Dashboard
            </button>

            <button
              onClick={() => setActiveTab('waiting_room')}
              className={`px-3 py-1.5 rounded-xl font-semibold text-xs transition-colors cursor-pointer flex items-center gap-1.5 ${
                normalizedActiveTab === 'waiting_room' 
                  ? 'bg-pink-600 text-white shadow-xs' 
                  : theme === 'dark'
                  ? 'bg-slate-800/80 border border-slate-700/80 text-slate-300 hover:bg-slate-800'
                  : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Users size={13} />
              Salle d'Attente
              {maternityQueue.length > 0 && (
                <span className="px-1.5 py-0.2 bg-pink-500/20 text-pink-500 rounded-full text-[11px] font-bold">
                  {maternityQueue.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('cpn')}
              className={`px-3 py-1.5 rounded-xl font-semibold text-xs transition-colors cursor-pointer flex items-center gap-1.5 ${
                normalizedActiveTab === 'cpn' 
                  ? 'bg-pink-600 text-white shadow-xs' 
                  : theme === 'dark'
                  ? 'bg-slate-800/80 border border-slate-700/80 text-slate-300 hover:bg-slate-800'
                  : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Stethoscope size={13} />
              Espace CPN
            </button>

            <button
              onClick={() => setActiveTab('delivery_room')}
              className={`px-3 py-1.5 rounded-xl font-semibold text-xs transition-colors cursor-pointer flex items-center gap-1.5 ${
                normalizedActiveTab === 'delivery_room' 
                  ? 'bg-pink-600 text-white shadow-xs' 
                  : theme === 'dark'
                  ? 'bg-slate-800/80 border border-slate-700/80 text-slate-300 hover:bg-slate-800'
                  : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Baby size={13} />
              Salle d'Accouchement
              {(admissions || []).filter(a => a.status === 'En travail').length > 0 && (
                <span className="px-1.5 py-0.2 bg-pink-500/20 text-pink-500 rounded-full text-[11px] font-bold">
                  {(admissions || []).filter(a => a.status === 'En travail').length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('history')}
              className={`px-3 py-1.5 rounded-xl font-semibold text-xs transition-colors cursor-pointer flex items-center gap-1.5 ${
                normalizedActiveTab === 'history' 
                  ? 'bg-pink-600 text-white shadow-xs' 
                  : theme === 'dark'
                  ? 'bg-slate-800/80 border border-slate-700/80 text-slate-300 hover:bg-slate-800'
                  : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <History size={13} />
              Historique
            </button>

            {/* Quick prescriptions buttons when patient is active */}
            {selectedPatient && (
              <div className="flex items-center gap-1 pl-2 border-l border-slate-200">
                <button 
                  onClick={() => setShowLabExamForm(true)}
                  className="p-1.5 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-100 transition-all cursor-pointer"
                  title="Prescrire un bilan ou examen labo"
                >
                  <Beaker size={14} />
                </button>
                <button 
                  onClick={() => setShowDigitalPrescription(true)}
                  className="p-1.5 bg-indigo-50 text-indigo-700 rounded-xl hover:bg-indigo-100 transition-all cursor-pointer"
                  title="Prescrire une ordonnance"
                >
                  <Pill size={14} />
                </button>
              </div>
            )}
          </div>
        }
      />

      <main className="flex-1 min-h-0 overflow-y-auto custom-scrollbar mt-3">
        {/* VIEW 1: DASHBOARD MATERNITÉ V1 */}
        {normalizedActiveTab === 'dashboard' && (
          <div className="space-y-6">
            <ModuleDashboard 
              theme={theme}
              moduleName="Maternité"
              moduleIcon={Baby}
              accentColor="text-pink-600"
              stats={[
                {
                  title: "Grossesses en cours",
                  value: activePregnanciesCount.toString().padStart(2, '0'),
                  icon: Calendar,
                  color: "bg-pink-600",
                  subtext: "Dossiers obstétricaux actifs",
                  onClick: () => setActiveTab('cpn')
                },
                {
                  title: "CPN du jour",
                  value: todayCpnCount.toString().padStart(2, '0'),
                  icon: Stethoscope,
                  color: "bg-purple-600",
                  subtext: "Consultations ce jour",
                  onClick: () => setActiveTab('cpn')
                },
                {
                  title: "Accouchements du mois",
                  value: monthlyDeliveriesCount.toString().padStart(2, '0'),
                  icon: Baby,
                  color: "bg-emerald-600",
                  subtext: new Date().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }),
                  onClick: () => setActiveTab('delivery_room')
                },
                {
                  title: "Urgences Maternité",
                  value: maternityEmergenciesCount.toString().padStart(2, '0'),
                  icon: AlertTriangle,
                  color: "bg-rose-600",
                  subtext: "Prise en charge prioritaire",
                  onClick: () => setActiveTab('waiting_room')
                }
              ]}
            >
              {/* Quick Navigation Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
                <div 
                  onClick={() => setActiveTab('waiting_room')}
                  className="p-5 rounded-3xl bg-white border border-slate-200 hover:border-pink-300 hover:shadow-md transition-all cursor-pointer group"
                >
                  <div className="w-10 h-10 rounded-2xl bg-pink-100 text-pink-600 flex items-center justify-center font-bold mb-3">
                    <Users size={20} />
                  </div>
                  <h4 className="font-bold text-slate-900 text-sm group-hover:text-pink-600 transition-colors">
                    1. Salle d'Attente
                  </h4>
                  <p className="text-xs text-slate-500 mt-1">
                    Appel vocal des patientes, orientation vers CPN ou admission accouchement.
                  </p>
                  <div className="mt-4 flex items-center text-xs font-bold text-pink-600 gap-1">
                    Accéder <ArrowRight size={13} />
                  </div>
                </div>

                <div 
                  onClick={() => setActiveTab('cpn')}
                  className="p-5 rounded-3xl bg-white border border-slate-200 hover:border-pink-300 hover:shadow-md transition-all cursor-pointer group"
                >
                  <div className="w-10 h-10 rounded-2xl bg-purple-100 text-purple-600 flex items-center justify-center font-bold mb-3">
                    <Stethoscope size={20} />
                  </div>
                  <h4 className="font-bold text-slate-900 text-sm group-hover:text-purple-600 transition-colors">
                    2. Espace CPN
                  </h4>
                  <p className="text-xs text-slate-500 mt-1">
                    Dossiers de grossesse, consultations CPN 1 à 8, bilans et ordonnances.
                  </p>
                  <div className="mt-4 flex items-center text-xs font-bold text-purple-600 gap-1">
                    Accéder <ArrowRight size={13} />
                  </div>
                </div>

                <div 
                  onClick={() => setActiveTab('delivery_room')}
                  className="p-5 rounded-3xl bg-white border border-slate-200 hover:border-pink-300 hover:shadow-md transition-all cursor-pointer group"
                >
                  <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold mb-3">
                    <Baby size={20} />
                  </div>
                  <h4 className="font-bold text-slate-900 text-sm group-hover:text-emerald-600 transition-colors">
                    3. Salle d'Accouchement
                  </h4>
                  <p className="text-xs text-slate-500 mt-1">
                    Suivi du travail, enregistrement accouchement et création dossier nouveau-né.
                  </p>
                  <div className="mt-4 flex items-center text-xs font-bold text-emerald-600 gap-1">
                    Accéder <ArrowRight size={13} />
                  </div>
                </div>

                <div 
                  onClick={() => setActiveTab('history')}
                  className="p-5 rounded-3xl bg-white border border-slate-200 hover:border-pink-300 hover:shadow-md transition-all cursor-pointer group"
                >
                  <div className="w-10 h-10 rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center font-bold mb-3">
                    <History size={20} />
                  </div>
                  <h4 className="font-bold text-slate-900 text-sm group-hover:text-blue-600 transition-colors">
                    4. Historique Obstétrical
                  </h4>
                  <p className="text-xs text-slate-500 mt-1">
                    Carnet obstétrical par patiente, CPN antérieures, naissances et impressions.
                  </p>
                  <div className="mt-4 flex items-center text-xs font-bold text-blue-600 gap-1">
                    Accéder <ArrowRight size={13} />
                  </div>
                </div>
              </div>

              {/* Real Active Admissions Table */}
              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden mt-6">
                <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                  <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                    <Activity size={16} className="text-pink-600" />
                    Parturientes Actives en Maternité
                  </h3>
                  <button 
                    onClick={() => setActiveTab('delivery_room')} 
                    className="text-xs font-bold text-pink-600 hover:underline"
                  >
                    Voir Salle d'Accouchement
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className="bg-slate-50 border-b border-slate-100">
                      <tr>
                        <th className="px-6 py-3.5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Parturiente</th>
                        <th className="px-6 py-3.5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Terme</th>
                        <th className="px-6 py-3.5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Lit / Salle</th>
                        <th className="px-6 py-3.5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Dilatation / BCF</th>
                        <th className="px-6 py-3.5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Statut</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs">
                      {admissions.slice(0, 6).map((adm) => (
                        <tr 
                          key={adm.id} 
                          onClick={() => setActiveTab('delivery_room')}
                          className="hover:bg-slate-50 transition-colors cursor-pointer"
                        >
                          <td className="px-6 py-4">
                            <p className="font-bold text-slate-900">{adm.patientName}</p>
                            <p className="text-[10px] text-slate-400 font-mono">Dossier N° {adm.patientDossierNum || adm.patientId}</p>
                          </td>
                          <td className="px-6 py-4 font-semibold text-slate-700">
                            {adm.gestationalAge || 'À terme'}
                          </td>
                          <td className="px-6 py-4">
                            <span className="font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-md">
                              {adm.bedId || 'Non assigné'}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <span className="font-bold text-pink-600">{adm.dilation ? `${adm.dilation} cm` : '-'}</span>
                            <span className="text-slate-400 mx-1">•</span>
                            <span className="font-bold text-emerald-600">{adm.bcf ? `${adm.bcf} bpm` : '-'}</span>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase ${
                              adm.status === 'En travail' ? 'bg-pink-100 text-pink-700' :
                              adm.status === 'Accouchement réalisé' ? 'bg-emerald-100 text-emerald-700' :
                              'bg-purple-100 text-purple-700'
                            }`}>
                              {adm.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                      {admissions.length === 0 && (
                        <tr>
                          <td colSpan={5} className="px-6 py-12 text-center text-slate-400 italic">
                            Aucune patiente en cours d'admission ou de travail.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </ModuleDashboard>
          </div>
        )}

        {/* VIEW 2: SALLE D'ATTENTE */}
        {normalizedActiveTab === 'waiting_room' && (
          <WaitingRoomTab
            user={user}
            queue={maternityQueue}
            waitingQueue={maternityQueue}
            onStartCpn={handleSelectPatientForCpn}
            onStartAdmission={handleSelectPatientForDelivery}
            onSelectPatientForCpn={handleSelectPatientForCpn}
            onSelectPatientForDelivery={handleSelectPatientForDelivery}
            onOpenDossier={handleSelectPatientForCpn}
            theme={theme}
          />
        )}

        {/* VIEW 3: ESPACE CPN */}
        {normalizedActiveTab === 'cpn' && (
          <CpnTab
            user={user}
            initialPatient={selectedPatient}
            onClearInitialPatient={() => setSelectedPatient(null)}
            onAdmitForDelivery={(patient) => {
              setSelectedPatient(patient);
              setActiveTab('delivery_room');
            }}
            theme={theme}
          />
        )}

        {/* VIEW 4: SALLE D'ACCOUCHEMENT */}
        {normalizedActiveTab === 'delivery_room' && (
          <DeliveryRoomTab
            user={user}
            maternityBeds={maternityBeds}
            rooms={rooms}
            initialPatient={selectedPatient}
            onClearInitialPatient={() => setSelectedPatient(null)}
            theme={theme}
          />
        )}

        {/* VIEW 5: HISTORIQUE OBSTÉTRICAL */}
        {normalizedActiveTab === 'history' && (
          <ObstetricalHistoryTab
            user={user}
            theme={theme}
          />
        )}
      </main>

      {/* Global Digital Prescription Modal */}
      {showDigitalPrescription && prescriptionPatient && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-6xl h-[90vh] flex flex-col overflow-hidden shadow-2xl">
            <DigitalPrescription 
              onCancel={() => setShowDigitalPrescription(false)}
              onValidate={async (ordonnance) => {
                try {
                  const ordId = `ORD-${Date.now()}`;
                  await setDoc(doc(db, 'prescriptions', ordId), sanitizeData({
                    ...ordonnance,
                    id: ordId,
                    patientId: prescriptionPatient.id,
                    sourceService: 'MATERNITE'
                  }));
                  setShowDigitalPrescription(false);
                } catch (error) {
                  console.error("Erreur enregistrement ordonnance:", error);
                }
              }}
              patient={prescriptionPatient}
              prescripteur={user}
              medications={medications}
            />
          </div>
        </div>
      )}

      {/* Global Lab Exam Request Modal */}
      {showLabExamForm && prescriptionPatient && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
            <LabExamRequestForm
              patientId={prescriptionPatient.id}
              patientName={`${prescriptionPatient.lastName} ${prescriptionPatient.firstName}`}
              patientAge="28 ans"
              patientSex="F"
              prescriberId={user?.id || 'maternity_doc'}
              prescriberName={user?.name || 'Sage-femme / Obstétricien'}
              requestingService="Maternité"
              onClose={() => setShowLabExamForm(false)}
              onSave={async (request) => {
                const reqId = `REQ-${Date.now()}`;
                const newRequest: LabExamRequest = {
                  ...request,
                  id: reqId,
                  date: new Date().toISOString(),
                  status: 'en attente',
                  billingStatus: 'pending'
                };
                await setDoc(doc(db, 'lab_requests', reqId), sanitizeData(newRequest));
                setShowLabExamForm(false);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default Maternity;
