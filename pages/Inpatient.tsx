import React, { useState, useEffect, useMemo } from 'react';
import { 
  BedDouble, Calendar, Activity, Clock, Bell, Plus, 
  ArrowLeft, Pill, Home, ClipboardList, UserPlus, 
  CheckCircle, X, Search, User, ShieldAlert, Sparkles 
} from 'lucide-react';
import { Bed, Room, User as UserType, InpatientSubMenu, PaymentRequest } from '../types';
import { db, sanitizeData } from '../src/firebase';
import { MicroHeader } from '../components/common/MicroHeader';
import { 
  collection, onSnapshot, query, where, doc, 
  getDocs, writeBatch 
} from 'firebase/firestore';

import { BedsOverviewTab } from './inpatient/BedsOverviewTab';
import { PatientBedWorkspace } from './inpatient/PatientBedWorkspace';
import { AdmissionRequestsTab } from './inpatient/AdmissionRequestsTab';
import { StayHistoryTab } from './inpatient/StayHistoryTab';
import { BedAdmissionModal } from './inpatient/BedAdmissionModal';
import { BedDischargeModal } from './inpatient/BedDischargeModal';

interface InpatientProps {
  user?: UserType;
  paymentRequests?: PaymentRequest[];
  setPaymentRequests?: React.Dispatch<React.SetStateAction<PaymentRequest[]>>;
  activeTab?: InpatientSubMenu | 'dashboard';
  setActiveTab?: (tab: InpatientSubMenu | 'dashboard') => void;
  onBackToDashboard: () => void;
  theme?: 'light' | 'dark';
}

const Inpatient: React.FC<InpatientProps> = ({
  user,
  paymentRequests = [],
  setPaymentRequests,
  activeTab: externalActiveTab,
  setActiveTab: externalSetActiveTab,
  onBackToDashboard,
  theme = 'light'
}) => {
  // Internal tab state with external synchronization
  const [currentTab, setCurrentTab] = useState<InpatientSubMenu>(() => {
    if (externalActiveTab && externalActiveTab !== 'dashboard') {
      return externalActiveTab as InpatientSubMenu;
    }
    return 'beds';
  });

  useEffect(() => {
    if (externalActiveTab && externalActiveTab !== 'dashboard') {
      setCurrentTab(externalActiveTab as InpatientSubMenu);
    }
  }, [externalActiveTab]);

  const handleTabChange = (tab: InpatientSubMenu) => {
    setCurrentTab(tab);
    if (externalSetActiveTab) {
      externalSetActiveTab(tab);
    }
  };

  // Firestore Collections
  const [beds, setBeds] = useState<Bed[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [doctors, setDoctors] = useState<UserType[]>([]);
  const [hospRequestsCount, setHospRequestsCount] = useState(0);

  // Selected Bed for "Lit de Patient" clinical tool
  const [activeBedForWorkspace, setActiveBedForWorkspace] = useState<Bed | null>(null);

  // Modals state
  const [isAdmissionModalOpen, setIsAdmissionModalOpen] = useState(false);
  const [preselectedBedId, setPreselectedBedId] = useState<string | null>(null);
  const [preselectedPatient, setPreselectedPatient] = useState<any | null>(null);

  const [isDischargeModalOpen, setIsDischargeModalOpen] = useState(false);
  const [bedForDischarge, setBedForDischarge] = useState<Bed | null>(null);

  // Listen to Beds
  useEffect(() => {
    const unsubBeds = onSnapshot(collection(db, 'beds'), (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as Bed));
      setBeds(list);

      // Keep active workspace bed in sync
      if (activeBedForWorkspace) {
        const updated = list.find(b => b.id === activeBedForWorkspace.id);
        if (updated && updated.status === 'OCCUPIED') {
          setActiveBedForWorkspace(updated);
        } else if (updated && updated.status === 'AVAILABLE') {
          // If the bed was liberated elsewhere, switch back to beds list
          setActiveBedForWorkspace(null);
          handleTabChange('beds');
        }
      }
    });

    return () => unsubBeds();
  }, [activeBedForWorkspace?.id]);

  // Listen to Rooms
  useEffect(() => {
    const unsubRooms = onSnapshot(collection(db, 'rooms'), (snap) => {
      setRooms(snap.docs.map(d => ({ id: d.id, ...d.data() } as Room)));
    });
    return () => unsubRooms();
  }, []);

  // Listen to Doctors / Staff
  useEffect(() => {
    const q = query(collection(db, 'hospital_users'));
    const unsubDocs = onSnapshot(q, (snap) => {
      setDoctors(snap.docs.map(d => ({ id: d.id, ...d.data() } as UserType)));
    });
    return () => unsubDocs();
  }, []);

  // Listen to pending requests count
  useEffect(() => {
    const q = query(
      collection(db, 'hospitalisation_requests'), 
      where('status', '==', 'pending')
    );
    const unsubReqs = onSnapshot(q, (snap) => {
      setHospRequestsCount(snap.docs.length);
    });
    return () => unsubReqs();
  }, []);

  // Hospital Beds (excluding maternity delivery beds if categorized)
  const hospitalBeds = useMemo(() => {
    return beds.filter(b => !b.category || b.category === 'hospitalisation' || b.category === 'all');
  }, [beds]);

  const availableBeds = useMemo(() => {
    return hospitalBeds.filter(b => b.status === 'AVAILABLE');
  }, [hospitalBeds]);

  const occupiedBeds = useMemo(() => {
    return hospitalBeds.filter(b => b.status === 'OCCUPIED');
  }, [hospitalBeds]);

  // Seed standard default rooms & beds if collection is empty
  const handleSeedDefaultBeds = async () => {
    try {
      const batch = writeBatch(db);

      const r1 = { id: 'room_101', name: 'Chambre 101', description: 'Médecine Générale', capacity: 2 };
      const r2 = { id: 'room_102', name: 'Chambre 102', description: 'Chirurgie & Surveillance', capacity: 2 };
      const r3 = { id: 'room_103', name: 'Chambre 103', description: 'Soins Intensifs (USI)', capacity: 2 };

      batch.set(doc(db, 'rooms', r1.id), r1);
      batch.set(doc(db, 'rooms', r2.id), r2);
      batch.set(doc(db, 'rooms', r3.id), r3);

      const defaultBeds = [
        { id: 'lit_a01', name: 'Lit A01', roomId: 'room_101', status: 'AVAILABLE', category: 'hospitalisation', service: 'Médecine Générale' },
        { id: 'lit_a02', name: 'Lit A02', roomId: 'room_101', status: 'AVAILABLE', category: 'hospitalisation', service: 'Médecine Générale' },
        { id: 'lit_b01', name: 'Lit B01', roomId: 'room_102', status: 'AVAILABLE', category: 'hospitalisation', service: 'Chirurgie' },
        { id: 'lit_b02', name: 'Lit B02', roomId: 'room_102', status: 'AVAILABLE', category: 'hospitalisation', service: 'Chirurgie' },
        { id: 'lit_c01', name: 'Lit C01', roomId: 'room_103', status: 'AVAILABLE', category: 'hospitalisation', service: 'Soins Intensifs' },
        { id: 'lit_c02', name: 'Lit C02', roomId: 'room_103', status: 'AVAILABLE', category: 'hospitalisation', service: 'Soins Intensifs' },
      ];

      defaultBeds.forEach(b => {
        batch.set(doc(db, 'beds', b.id), { ...b, lastUpdated: new Date().toISOString() });
      });

      await batch.commit();

      window.dispatchEvent(new CustomEvent('app-notification', {
        detail: { message: "6 lits d'hospitalisation initialisés avec succès.", type: 'success' }
      }));
    } catch (e: any) {
      console.error("Error seeding default beds:", e);
      alert("Erreur lors de l'initialisation des lits.");
    }
  };

  // Open "Occuper un lit" modal
  const handleOpenAdmissionModal = (targetBedId?: string) => {
    setPreselectedBedId(targetBedId || null);
    setPreselectedPatient(null);
    setIsAdmissionModalOpen(true);
  };

  // Open "Lit de Patient" clinical tool
  const handleOpenPatientBed = (bed: Bed) => {
    setActiveBedForWorkspace(bed);
    handleTabChange('patient_bed');
  };

  // Open "Libérer le lit" modal
  const handleOpenDischargeModal = (bed: Bed) => {
    setBedForDischarge(bed);
    setIsDischargeModalOpen(true);
  };

  // Assign bed from pending request
  const handleAssignBedFromRequest = (req: any) => {
    setPreselectedBedId(null);
    setPreselectedPatient({
      id: req.patientId,
      name: req.patientName,
      dossier: req.patientId,
      reason: req.motif || req.reason,
      service: req.service,
      priority: req.priority,
      origin: req.sourceService || 'Consultation',
      requestId: req.id
    });
    setIsAdmissionModalOpen(true);
  };

  return (
    <div className={`h-screen flex flex-col overflow-hidden p-3 sm:p-5 font-sans ${theme === 'dark' ? 'bg-[#020617] text-white' : 'bg-slate-50 text-slate-900'}`}>
      
      {/* MicroHeader Navigation */}
      <MicroHeader
        icon={BedDouble}
        breadcrumbs={[
          { label: 'Hospitalisation', onClick: () => handleTabChange('beds') },
          { 
            label: currentTab === 'beds' ? 'Gestion des Lits' :
                   currentTab === 'patient_bed' ? `Lit Patient (${activeBedForWorkspace?.name || 'Sélection'})` :
                   currentTab === 'requests' ? `Demandes (${hospRequestsCount})` :
                   currentTab === 'history' ? 'Historique des Séjours' : 'Gestion des Lits',
            active: true
          }
        ]}
        onHomeClick={onBackToDashboard}
        onBackClick={currentTab !== 'beds' ? () => handleTabChange('beds') : undefined}
        user={{ name: user?.name || 'Personnel Hospitalisation' }}
        theme={theme}
        actions={
          <div className="flex items-center gap-2">
            
            {/* 1. Lits d'hospitalisation */}
            <button
              onClick={() => handleTabChange('beds')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl font-black text-xs uppercase tracking-wider transition-all cursor-pointer ${
                currentTab === 'beds'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
              }`}
            >
              <BedDouble size={14} />
              <span>Lits</span>
            </button>

            {/* 2. Lit de Patient (Clinical Tool) */}
            <button
              onClick={() => {
                if (activeBedForWorkspace) {
                  handleTabChange('patient_bed');
                } else if (occupiedBeds.length > 0) {
                  handleOpenPatientBed(occupiedBeds[0]);
                } else {
                  window.dispatchEvent(new CustomEvent('app-notification', {
                    detail: { message: "Aucun lit n'est actuellement occupé.", type: 'info' }
                  }));
                }
              }}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl font-black text-xs uppercase tracking-wider transition-all cursor-pointer ${
                currentTab === 'patient_bed'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
              }`}
            >
              <Activity size={14} />
              <span>Lit de Patient</span>
            </button>

            {/* 3. Demandes d'admission */}
            <button
              onClick={() => handleTabChange('requests')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl font-black text-xs uppercase tracking-wider transition-all relative cursor-pointer ${
                currentTab === 'requests'
                  ? 'bg-amber-500 text-white shadow-xs'
                  : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
              }`}
            >
              <Bell size={14} className={hospRequestsCount > 0 ? (currentTab === 'requests' ? 'text-white' : 'text-amber-500') : 'text-slate-400'} />
              <span>Demandes ({hospRequestsCount})</span>
            </button>

            {/* 4. Historique des séjours */}
            <button
              onClick={() => handleTabChange('history')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl font-black text-xs uppercase tracking-wider transition-all cursor-pointer ${
                currentTab === 'history'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
              }`}
            >
              <ClipboardList size={14} />
              <span>Historique</span>
            </button>

            {/* Primary Action Button: Occuper un lit */}
            <button
              onClick={() => handleOpenAdmissionModal()}
              disabled={availableBeds.length === 0}
              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-1.5 rounded-xl font-black text-xs uppercase tracking-wider shadow-sm transition-all cursor-pointer ml-1"
            >
              <Plus size={14} />
              <span>Occuper un Lit</span>
            </button>
          </div>
        }
      />

      {/* Main Content Area */}
      <main className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pt-2">
        
        {/* VIEW 1: BEDS OVERVIEW (Lits disponibles & Lits occupés) */}
        {currentTab === 'beds' && (
          <BedsOverviewTab
            beds={hospitalBeds}
            rooms={rooms}
            onOpenAdmissionModal={handleOpenAdmissionModal}
            onOpenPatientBed={handleOpenPatientBed}
            onOpenDischargeModal={handleOpenDischargeModal}
            onSeedDefaultBeds={hospitalBeds.length === 0 ? handleSeedDefaultBeds : undefined}
            theme={theme}
          />
        )}

        {/* VIEW 2: OUTIL CLINIQUE « LITS DE PATIENT » */}
        {currentTab === 'patient_bed' && (
          activeBedForWorkspace ? (
            <PatientBedWorkspace
              bed={activeBedForWorkspace}
              room={rooms.find(r => r.id === activeBedForWorkspace.roomId)}
              currentUser={user}
              onBackToBeds={() => handleTabChange('beds')}
              onOpenDischargeModal={() => handleOpenDischargeModal(activeBedForWorkspace)}
              theme={theme}
            />
          ) : (
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-16 text-center space-y-4">
              <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-3xl flex items-center justify-center mx-auto">
                <BedDouble size={32} />
              </div>
              <h3 className="text-lg font-black text-slate-900">Aucun lit patient sélectionné</h3>
              <p className="text-sm text-slate-500 max-w-md mx-auto">
                Veuillez sélectionner un lit occupé depuis la liste des lits pour ouvrir le suivi clinique (constantes, soins, observations).
              </p>
              <button
                onClick={() => handleTabChange('beds')}
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-black text-xs uppercase tracking-wider transition-all shadow-xs cursor-pointer inline-flex items-center gap-2"
              >
                <ArrowLeft size={16} />
                <span>Voir les Lits d'Hospitalisation</span>
              </button>
            </div>
          )
        )}

        {/* VIEW 3: DEMANDES D'ADMISSION EN ATTENTE */}
        {currentTab === 'requests' && (
          <AdmissionRequestsTab
            onAssignBed={handleAssignBedFromRequest}
            availableBedsCount={availableBeds.length}
          />
        )}

        {/* VIEW 4: HISTORIQUE DES SÉJOURS */}
        {currentTab === 'history' && (
          <StayHistoryTab />
        )}

      </main>

      {/* MODAL 1: OCCUPER UN LIT / ADMISSION */}
      <BedAdmissionModal
        isOpen={isAdmissionModalOpen}
        onClose={() => {
          setIsAdmissionModalOpen(false);
          setPreselectedBedId(null);
          setPreselectedPatient(null);
        }}
        availableBeds={availableBeds}
        rooms={rooms}
        doctors={doctors}
        preselectedBedId={preselectedBedId}
        preselectedPatient={preselectedPatient}
        currentUser={user}
        onSuccess={() => {
          handleTabChange('beds');
        }}
      />

      {/* MODAL 2: LIBÉRER LE LIT / SORTIE */}
      <BedDischargeModal
        isOpen={isDischargeModalOpen}
        onClose={() => {
          setIsDischargeModalOpen(false);
          setBedForDischarge(null);
        }}
        bed={bedForDischarge}
        room={rooms.find(r => r.id === bedForDischarge?.roomId)}
        currentUser={user}
        onSuccess={() => {
          if (activeBedForWorkspace?.id === bedForDischarge?.id) {
            setActiveBedForWorkspace(null);
            handleTabChange('beds');
          }
        }}
      />

    </div>
  );
};

export default Inpatient;
