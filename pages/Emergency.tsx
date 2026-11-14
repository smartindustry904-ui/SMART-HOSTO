import React, { useState, useEffect, useMemo } from 'react';
import { 
  ShieldAlert, Activity, Stethoscope, History, Users, 
  ArrowLeft, CheckCircle2, AlertCircle, Clock, Bed
} from 'lucide-react';
import { db, sanitizeData, handleFirestoreError, OperationType } from '../src/firebase';
import { deductConsumablesForAct } from '../src/utils/consumablesStock';
import { 
  collection, query, where, onSnapshot, orderBy, setDoc, doc, updateDoc 
} from 'firebase/firestore';
import { MicroHeader } from '../components/common/MicroHeader';
import { 
  EmergencyEncounter, EmergencySubMenu, EmergencyStatusV1, 
  EmergencyVitalSign, EmergencyCare, EmergencyFollowUp, 
  EmergencyDischarge, User as UserType 
} from '../types';
import { getActiveTenantId, belongsToTenant, stampTenantData } from '../src/utils/tenant';
import { PatientsListTab } from './emergency/PatientsListTab';
import { PriseEnChargeTab } from './emergency/PriseEnChargeTab';
import { HistoriqueTab } from './emergency/HistoriqueTab';

interface EmergencyProps {
  user: UserType;
  globalWaitingQueue?: any[];
  setGlobalWaitingQueue?: React.Dispatch<React.SetStateAction<any[]>>;
  paymentRequests?: any[];
  setPaymentRequests?: React.Dispatch<React.SetStateAction<any[]>>;
  activeMenu: EmergencySubMenu;
  setActiveMenu: (menu: EmergencySubMenu) => void;
  onBackToDashboard: () => void;
  theme?: 'light' | 'dark';
}

const Emergency: React.FC<EmergencyProps> = ({ 
  user, 
  activeMenu, 
  setActiveMenu, 
  onBackToDashboard, 
  theme = 'light' 
}) => {
  const [erEncounters, setErEncounters] = useState<EmergencyEncounter[]>([]);
  const [visiteErEncounters, setVisiteErEncounters] = useState<EmergencyEncounter[]>([]);
  const encounters = useMemo(() => {
    const merged = [...erEncounters];
    const existingPatientIds = new Set(erEncounters.map(e => e.patientId).filter(Boolean));
    visiteErEncounters.forEach(ve => {
      if (!existingPatientIds.has(ve.patientId)) {
        merged.push(ve);
      }
    });
    return merged;
  }, [erEncounters, visiteErEncounters]);
  const [selectedEncounterId, setSelectedEncounterId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const activeTenantId = getActiveTenantId(user);

  // Real-time listener for emergency encounters + active visit cycles flagged for Urgences
  useEffect(() => {
    setIsLoading(true);
    const q = query(collection(db, 'emergency_patients'), orderBy('arrivalTimestamp', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: EmergencyEncounter[] = snapshot.docs
        .filter(docSnap => belongsToTenant(docSnap.data(), activeTenantId))
        .map(docSnap => {
        const d = docSnap.data();
        
        // Map legacy or current data to V1 EmergencyEncounter
        let status: EmergencyStatusV1 = 'En attente';
        if (d.status === 'Sortie' || d.status === 'ORIENTED' || d.discharge) {
          status = 'Sortie';
        } else if (d.status === 'Pris en charge' || d.status === 'ER_ROOM' || d.status === 'MANAGEMENT') {
          status = 'Pris en charge';
        } else if (d.status === 'En cours de suivi' || d.status === 'OBSERVATION') {
          status = 'En cours de suivi';
        } else {
          status = 'En attente';
        }

        const vitalsList: EmergencyVitalSign[] = Array.isArray(d.vitals) 
          ? d.vitals 
          : (d.triage?.vitals ? [{
              id: 'vit_legacy',
              timestamp: d.arrivalTimestamp || new Date().toISOString(),
              date: d.arrivalDate || new Date().toISOString().split('T')[0],
              time: d.arrivalTime || '12:00',
              bpSys: d.triage.vitals.bpSys,
              bpDia: d.triage.vitals.bpDia,
              heartRate: d.triage.vitals.heartRate,
              spo2: d.triage.vitals.spo2,
              temp: d.triage.vitals.temp,
              respRate: d.triage.vitals.respRate,
              measuredBy: d.triage.nurseName || 'Soignant Accueil',
              painScale: d.triage.painScale || 0
            }] : []);

        const caresList: EmergencyCare[] = Array.isArray(d.cares)
          ? d.cares
          : (d.management?.acts ? d.management.acts.map((act: string, idx: number) => ({
              id: `care_legacy_${idx}`,
              type: 'Soin d\'urgence',
              description: act,
              timestamp: d.arrivalTimestamp || new Date().toISOString(),
              date: d.arrivalDate || new Date().toISOString().split('T')[0],
              time: d.arrivalTime || '12:00',
              professional: d.management?.doctorName || 'Praticien',
              status: 'Réalisé'
            })) : []);

        const followUpsList: EmergencyFollowUp[] = Array.isArray(d.followUps)
          ? d.followUps
          : (d.management?.diagnosis ? [{
              id: 'fu_legacy',
              timestamp: d.arrivalTimestamp || new Date().toISOString(),
              date: d.arrivalDate || new Date().toISOString().split('T')[0],
              time: d.arrivalTime || '12:00',
              author: d.management.doctorName || 'Praticien',
              conclusion: d.management.diagnosis,
              treatments: d.management.treatments?.join(', ')
            }] : []);

        const dischargeData: EmergencyDischarge | undefined = d.discharge || (d.orientation ? {
          date: d.orientation.timestamp ? d.orientation.timestamp.split('T')[0] : new Date().toISOString().split('T')[0],
          time: d.orientation.timestamp ? new Date(d.orientation.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '12:00',
          timestamp: d.orientation.timestamp || new Date().toISOString(),
          professional: 'Praticien Urgences',
          conclusion: d.orientation.summary || 'Fin de prise en charge',
          orientation: d.orientation.type === 'TRANSFER' ? 'Transfert' : 'Retour à domicile'
        } : undefined);

        return {
          id: docSnap.id,
          patientId: d.patientId || docSnap.id,
          patientDme: d.patientDme || d.dmeId || d.patientId || docSnap.id,
          patientName: d.patientName || `${d.lastName || ''} ${d.firstName || ''}`.trim() || 'Patient',
          firstName: d.firstName || '',
          lastName: d.lastName || '',
          age: d.age !== undefined ? d.age : 30,
          gender: d.gender || 'M',
          arrivalDate: d.arrivalDate || (d.arrivalTimestamp ? d.arrivalTimestamp.split('T')[0] : new Date().toISOString().split('T')[0]),
          arrivalTime: d.arrivalTime || (d.arrivalTimestamp ? new Date(d.arrivalTimestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '00:00'),
          arrivalTimestamp: d.arrivalTimestamp || new Date().toISOString(),
          arrivalMotif: d.arrivalMotif || d.chiefComplaint || d.triage?.motif || 'Recours Urgences',
          orientationSource: d.orientationSource || 'Accueil',
          status,
          responsibleStaff: d.responsibleStaff || d.management?.doctorName,
          responsibleStaffId: d.responsibleStaffId || d.management?.doctorId,
          vitals: vitalsList,
          cares: caresList,
          followUps: followUpsList,
          voiceNotes: d.voiceNotes || [],
          discharge: dischargeData
        };
      });

      setErEncounters(list);
      setIsLoading(false);
    }, (error) => {
      console.error("Emergency patients listener error:", error);
      setIsLoading(false);
      try {
        handleFirestoreError(error, OperationType.LIST, 'emergency_patients');
      } catch (e) {
        // logged
      }
    });

    const qVisites = query(collection(db, 'visites'), where('status', '==', 'ACTIF'));
    const unsubVisites = onSnapshot(qVisites, (snapshot) => {
      const list: EmergencyEncounter[] = snapshot.docs
        .filter(docSnap => {
          const d = docSnap.data() as any;
          return d.inUrgencesQueue === true && belongsToTenant(d, activeTenantId);
        })
        .map(docSnap => {
          const d = docSnap.data() as any;
          const ts = d.urgencesTransferredAt || d.openedAt || new Date().toISOString();
          const nameParts = String(d.patientName || 'Patient').trim().split(/\s+/);
          const lastName = nameParts[0] || 'Patient';
          const firstName = nameParts.slice(1).join(' ');
          const rawVitals = d.urgencesVitals;
          const vitalsList: EmergencyVitalSign[] = Array.isArray(rawVitals)
            ? rawVitals
            : rawVitals
            ? [{
                id: 'vit_transfer',
                timestamp: ts,
                date: ts.split('T')[0],
                time: new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
                bpSys: rawVitals.bpSys,
                bpDia: rawVitals.bpDia,
                heartRate: rawVitals.heartRate,
                spo2: rawVitals.spo2,
                temp: rawVitals.temp,
                respRate: rawVitals.respRate,
                measuredBy: d.urgencesTransferredBy || 'Consultation',
                painScale: rawVitals.painScale || 0,
              }]
            : [];
          return {
            id: `visite_${docSnap.id}`,
            patientId: d.patientId || docSnap.id,
            patientDme: d.dmeId || d.patientId || docSnap.id,
            patientName: d.patientName || 'Patient',
            firstName,
            lastName,
            age: d.age || 30,
            gender: d.gender || 'M',
            arrivalDate: ts.split('T')[0],
            arrivalTime: new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
            arrivalTimestamp: ts,
            arrivalMotif: d.urgencesMotif || 'Transfert depuis Consultation',
            orientationSource: d.urgencesSource || 'Consultation',
            status: (d.urgencesStatus as EmergencyStatusV1) || 'En attente',
            responsibleStaff: d.urgencesResponsibleStaff,
            vitals: vitalsList,
            cares: Array.isArray(d.urgencesCares) ? d.urgencesCares : [],
            followUps: Array.isArray(d.urgencesFollowUps) ? d.urgencesFollowUps : [],
            voiceNotes: [],
            discharge: d.urgencesDischarge,
          } as EmergencyEncounter;
        });
      setVisiteErEncounters(list);
    });

    return () => {
      unsubscribe();
      unsubVisites();
    };
  }, [activeTenantId]);

  // Selected encounter
  const selectedEncounter = useMemo(() => {
    if (!selectedEncounterId) return null;
    return encounters.find(e => e.id === selectedEncounterId) || null;
  }, [encounters, selectedEncounterId]);

  // Handler: Select a patient from list to open workspace
  const handleSelectPatient = (patient: EmergencyEncounter) => {
    setSelectedEncounterId(patient.id);
    setActiveMenu('prise_en_charge');
  };

  // Handler: Quick update encounter status (e.g. En attente -> Pris en charge)
  const handleUpdateStatus = async (encounterId: string, newStatus: EmergencyStatusV1, assignedStaff?: string) => {
    try {
      if (encounterId.startsWith('visite_')) {
        const visiteId = encounterId.replace(/^visite_/, '');
        const updates: any = { urgencesStatus: newStatus };
        if (assignedStaff) updates.urgencesResponsibleStaff = assignedStaff;
        await updateDoc(doc(db, 'visites', visiteId), sanitizeData(updates));
        return;
      }
      const docRef = doc(db, 'emergency_patients', encounterId);
      const updates: any = { status: newStatus };
      if (assignedStaff) {
        updates.responsibleStaff = assignedStaff;
      }
      await updateDoc(docRef, sanitizeData(updates));
    } catch (err) {
      console.error("Failed to update emergency encounter status:", err);
      alert("Erreur lors de la mise à jour du statut.");
    }
  };

  // Handler: Add vital sign
  const handleSaveVitals = async (encounterId: string, vitals: EmergencyVitalSign): Promise<boolean> => {
    try {
      const encounter = encounters.find(e => e.id === encounterId);
      if (!encounter) return false;

      const updatedVitals = [...(encounter.vitals || []), vitals];
      if (encounterId.startsWith('visite_')) {
        const visiteId = encounterId.replace(/^visite_/, '');
        const vUpdates: any = { urgencesVitals: updatedVitals };
        if (encounter.status === 'En attente') {
          vUpdates.urgencesStatus = 'Pris en charge';
          if (!encounter.responsibleStaff && user?.name) vUpdates.urgencesResponsibleStaff = user.name;
        }
        await updateDoc(doc(db, 'visites', visiteId), sanitizeData(vUpdates));
        return true;
      }
      const updates: any = { vitals: updatedVitals };

      // Auto upgrade status if it was waiting
      if (encounter.status === 'En attente') {
        updates.status = 'Pris en charge';
        if (!encounter.responsibleStaff && user?.name) {
          updates.responsibleStaff = user.name;
        }
      }

      await updateDoc(doc(db, 'emergency_patients', encounterId), sanitizeData(updates));
      return true;
    } catch (err) {
      console.error("Failed to save emergency vitals:", err);
      alert("Erreur lors de l'enregistrement des constantes.");
      return false;
    }
  };

  // Handler: Add care
  const handleSaveCare = async (encounterId: string, care: EmergencyCare, billToCashier?: boolean): Promise<boolean> => {
    try {
      const encounter = encounters.find(e => e.id === encounterId);
      if (!encounter) return false;

      const enrichedCare: EmergencyCare = {
        ...care,
        professional: care.professional || user?.name || 'Soignant Urgences',
        professionalId: care.professionalId || user?.id || ''
      };

      const updatedCares = [...(encounter.cares || []), enrichedCare];
      const updates: any = { cares: updatedCares };

      if (encounter.status === 'En attente') {
        updates.status = 'Pris en charge';
      }

      await updateDoc(doc(db, 'emergency_patients', encounterId), sanitizeData(updates));

      // If marked for cashier billing, transmit to payment_requests
      if (billToCashier) {
        const payDocRef = doc(collection(db, 'payment_requests'));
        const actFee = 5000;
        await setDoc(payDocRef, sanitizeData(stampTenantData({
          id: payDocRef.id,
          patientId: encounter.patientId,
          patientDme: encounter.patientDme,
          patientName: `${encounter.lastName} ${encounter.firstName}`,
          service: 'Urgences',
          requestingService: 'Urgences',
          sourceModule: 'Emergency',
          serviceType: 'URGENCES',
          type: 'URGENCES',
          items: [{
            id: `ITEM-URG-${Date.now()}`,
            name: `Acte d'urgence : ${care.type} - ${care.description}`,
            quantity: 1,
            unitPrice: actFee,
            totalPrice: actFee,
            practitionerId: user?.id || '',
            practitionerName: user?.name || 'Soignant Urgences',
            practitionerRole: user?.role || 'MEDECIN'
          }],
          totalAmount: actFee,
          amountPaid: 0,
          description: `Acte d'urgence : ${care.type} - ${care.description}`,
          amount: actFee,
          status: 'PENDING',
          paymentStatus: 'AWAITING_PAYMENT',
          date: new Date().toISOString().split('T')[0],
          time: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
          createdAt: new Date().toISOString(),
          createdBy: user?.name || 'Soignant Urgences',
          createdById: user?.id || '',
          requestedBy: user?.name || 'Soignant Urgences',
          requestedById: user?.id || '',
          practitionerId: user?.id || '',
          practitionerName: user?.name || 'Soignant Urgences',
          practitionerRole: user?.role || 'MEDECIN'
        }, user)));
      }

      return true;
    } catch (err) {
      console.error("Failed to save emergency care:", err);
      alert("Erreur lors de l'enregistrement du soin.");
      return false;
    }
  };

  // Handler: Update care status
  const handleUpdateCareStatus = async (encounterId: string, careId: string, status: 'Prévu' | 'Réalisé' | 'Annulé'): Promise<boolean> => {
    try {
      const encounter = encounters.find(e => e.id === encounterId);
      if (!encounter) return false;

      const updatedCares = (encounter.cares || []).map(c => 
        c.id === careId ? { ...c, status } : c
      );

      await updateDoc(doc(db, 'emergency_patients', encounterId), sanitizeData({ cares: updatedCares }));
      if (status === 'Réalisé') {
        const targetCare = (encounter.cares || []).find(c => c.id === careId);
        if (targetCare) {
          deductConsumablesForAct({
            actId: (targetCare as any).actId,
            actName: targetCare.type || targetCare.description,
            user,
            moduleSource: 'Urgences'
          }).catch(() => {});
        }
      }
      return true;
    } catch (err) {
      console.error("Failed to update care status:", err);
      return false;
    }
  };

  // Handler: Save follow-up with optional voice note
  const handleSaveFollowUp = async (
    encounterId: string, 
    followUp: EmergencyFollowUp, 
    audioUrl?: string, 
    durationSec?: number, 
    transcript?: string
  ): Promise<boolean> => {
    try {
      const encounter = encounters.find(e => e.id === encounterId);
      if (!encounter) return false;

      const updatedFollowUps = [...(encounter.followUps || []), followUp];
      const updates: any = { followUps: updatedFollowUps };

      if (audioUrl) {
        const newVoiceNote = {
          id: `vn_${Date.now()}`,
          timestamp: new Date().toISOString(),
          date: new Date().toISOString().split('T')[0],
          time: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
          author: user?.name || 'Praticien Urgences',
          audioUrl,
          durationSec: durationSec || 0,
          transcript
        };
        updates.voiceNotes = [...(encounter.voiceNotes || []), newVoiceNote];
      }

      if (encounter.status === 'En attente') {
        updates.status = 'Pris en charge';
      }

      await updateDoc(doc(db, 'emergency_patients', encounterId), sanitizeData(updates));
      return true;
    } catch (err) {
      console.error("Failed to save emergency follow-up:", err);
      alert("Erreur lors de l'enregistrement du suivi médical.");
      return false;
    }
  };

  // Handler: Authorize discharge
  const handleAuthorizeDischarge = async (encounterId: string, discharge: EmergencyDischarge): Promise<boolean> => {
    try {
      const encounter = encounters.find(e => e.id === encounterId);
      if (!encounter) return false;

      if (encounterId.startsWith('visite_')) {
        const visiteId = encounterId.replace(/^visite_/, '');
        await updateDoc(doc(db, 'visites', visiteId), sanitizeData({
          urgencesStatus: 'Sortie',
          urgencesDischarge: discharge,
          inUrgencesQueue: false,
        }));
      } else {
        const updates: any = {
          status: 'Sortie',
          discharge
        };

        await updateDoc(doc(db, 'emergency_patients', encounterId), sanitizeData(updates));
      }

      // If orientation is Hospitalisation, create request in hospitalisation_requests
      if (discharge.orientation === 'Hospitalisation') {
        const hospDocRef = doc(collection(db, 'hospitalisation_requests'));
        await setDoc(hospDocRef, sanitizeData(stampTenantData({
          id: hospDocRef.id,
          patientId: encounter.patientId,
          patientDme: encounter.patientDme,
          patientName: `${encounter.lastName} ${encounter.firstName}`,
          service: discharge.destinationDetails || 'Médecine / Soins Continus',
          motif: `Admission depuis Urgences : ${discharge.conclusion}`,
          priority: 'Urgent',
          status: 'pending',
          createdAt: new Date().toISOString(),
          requestedBy: discharge.professional || user?.name || 'Praticien Urgences'
        }, user)));
      }

      // Log in audit_logs
      const auditDocRef = doc(collection(db, 'audit_logs'));
      await setDoc(auditDocRef, sanitizeData(stampTenantData({
        id: auditDocRef.id,
        action: `Sortie Urgences validée - Orientation: ${discharge.orientation}`,
        patientId: encounter.patientId,
        patientName: `${encounter.lastName} ${encounter.firstName}`,
        user: user?.name || 'Praticien Urgences',
        timestamp: new Date().toISOString(),
        date: discharge.date,
        time: discharge.time
      }, user)));

      return true;
    } catch (err) {
      console.error("Failed to authorize discharge:", err);
      alert("Erreur lors de la clôture du passage.");
      return false;
    }
  };

  // Active encounters count (not discharged)
  const activeCount = useMemo(() => {
    return encounters.filter(e => e.status !== 'Sortie').length;
  }, [encounters]);

  const historyCount = useMemo(() => {
    return encounters.filter(e => e.status === 'Sortie' || !!e.discharge).length;
  }, [encounters]);

  return (
    <div className={`h-screen flex flex-col overflow-hidden p-3 sm:p-5 font-sans ${theme === 'dark' ? 'bg-[#090d16] text-slate-100' : 'bg-[#F8FAFC] text-slate-900'}`}>
      <MicroHeader
        icon={ShieldAlert}
        breadcrumbs={[
          { label: 'Urgences', onClick: () => setActiveMenu('patients') },
          { 
            label: activeMenu === 'patients' ? 'Patients aux urgences' : 
                   activeMenu === 'prise_en_charge' ? (selectedEncounter ? `${selectedEncounter.lastName} ${selectedEncounter.firstName}` : 'Prise en charge') : 
                   'Historique',
            active: true
          }
        ]}
        onHomeClick={onBackToDashboard}
        onBackClick={activeMenu !== 'patients' ? () => setActiveMenu('patients') : undefined}
        user={{ name: user?.name || 'Personnel' }}
        theme={theme}
        actions={
          <div className="flex items-center gap-1.5 overflow-x-auto">
            {/* Tab: Patients aux urgences */}
            <button
              onClick={() => setActiveMenu('patients')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-semibold text-xs transition-all shrink-0 cursor-pointer ${
                activeMenu === 'patients'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : theme === 'dark'
                  ? 'bg-slate-800/80 border border-slate-700/80 text-slate-300 hover:bg-slate-800'
                  : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Users size={13} className={activeMenu === 'patients' ? 'text-white' : 'text-slate-400'} />
              <span>Patients aux urgences</span>
              <span className={`text-[11px] font-bold px-1.5 py-0.2 rounded-full ${
                activeMenu === 'patients' ? 'bg-white/20 text-white' : theme === 'dark' ? 'bg-slate-700 text-slate-200' : 'bg-slate-100 text-slate-600'
              }`}>
                {activeCount}
              </span>
            </button>

            {/* Tab: Prise en charge */}
            <button
              onClick={() => setActiveMenu('prise_en_charge')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-semibold text-xs transition-all shrink-0 cursor-pointer ${
                activeMenu === 'prise_en_charge'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : theme === 'dark'
                  ? 'bg-slate-800/80 border border-slate-700/80 text-slate-300 hover:bg-slate-800'
                  : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Stethoscope size={13} className={activeMenu === 'prise_en_charge' ? 'text-white' : 'text-slate-400'} />
              <span>Prise en charge</span>
              {selectedEncounter && (
                <span className={`text-[11px] font-bold px-1.5 py-0.2 rounded-full truncate max-w-[100px] ${
                  activeMenu === 'prise_en_charge' ? 'bg-white/20 text-white' : 'bg-rose-500/15 text-rose-500'
                }`}>
                  {selectedEncounter.lastName}
                </span>
              )}
            </button>

            {/* Tab: Historique */}
            <button
              onClick={() => setActiveMenu('historique')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-semibold text-xs transition-all shrink-0 cursor-pointer ${
                activeMenu === 'historique'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : theme === 'dark'
                  ? 'bg-slate-800/80 border border-slate-700/80 text-slate-300 hover:bg-slate-800'
                  : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <History size={13} className={activeMenu === 'historique' ? 'text-white' : 'text-slate-400'} />
              <span>Historique</span>
              <span className={`text-[11px] font-bold px-1.5 py-0.2 rounded-full ${
                activeMenu === 'historique' ? 'bg-white/20 text-white' : theme === 'dark' ? 'bg-slate-700 text-slate-200' : 'bg-slate-100 text-slate-600'
              }`}>
                {historyCount}
              </span>
            </button>
          </div>
        }
      />

      {/* Main Container */}
      <main className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pt-2">
        {activeMenu === 'patients' && (
          <PatientsListTab
            patients={encounters}
            onSelectPatient={handleSelectPatient}
            onUpdateStatus={handleUpdateStatus}
            currentUser={user}
            theme={theme}
          />
        )}

        {activeMenu === 'prise_en_charge' && (
          <PriseEnChargeTab
            encounter={selectedEncounter}
            onBackToList={() => setActiveMenu('patients')}
            onSaveVitals={handleSaveVitals}
            onSaveCare={handleSaveCare}
            onUpdateCareStatus={handleUpdateCareStatus}
            onSaveFollowUp={handleSaveFollowUp}
            onAuthorizeDischarge={handleAuthorizeDischarge}
            onUpdateStatus={handleUpdateStatus}
            currentUser={user}
            theme={theme}
          />
        )}

        {activeMenu === 'historique' && (
          <HistoriqueTab
            encounters={encounters}
            theme={theme}
          />
        )}
      </main>
    </div>
  );
};

export default Emergency;
