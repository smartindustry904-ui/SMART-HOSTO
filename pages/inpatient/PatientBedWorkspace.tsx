import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft, BedDouble, Activity, Heart, Thermometer, 
  Stethoscope, Plus, CheckCircle2, Clock, Calendar, 
  User, AlertCircle, FileText, Check, Mic, Volume2, 
  Printer, LogOut, ShieldAlert, Sparkles, Droplet, Eye
} from 'lucide-react';
import { db, sanitizeData } from '../../src/firebase';
import { 
  doc, onSnapshot, updateDoc, setDoc, 
  collection, query, where, getDocs 
} from 'firebase/firestore';
import { 
  Bed, Room, InpatientRecord, InpatientVitalSign, 
  InpatientCare, InpatientObservation, User as UserType 
} from '../../types';
import { VoiceNoteRecorder } from '../emergency/VoiceNoteRecorder';

interface PatientBedWorkspaceProps {
  bed: Bed;
  room?: Room | null;
  currentUser?: UserType;
  onBackToBeds: () => void;
  onOpenDischargeModal: () => void;
  theme?: 'light' | 'dark';
}

export const PatientBedWorkspace: React.FC<PatientBedWorkspaceProps> = ({
  bed,
  room,
  currentUser,
  onBackToBeds,
  onOpenDischargeModal,
  theme = 'light'
}) => {
  const [activeSection, setActiveSection] = useState<'vitals' | 'cares' | 'observations' | 'history'>('vitals');
  const [inpatientRecord, setInpatientRecord] = useState<InpatientRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Forms state
  const [showVitalForm, setShowVitalForm] = useState(false);
  const [vitalForm, setVitalForm] = useState({
    bpSys: 120,
    bpDia: 80,
    pulse: 75,
    temp: 37.0,
    respRate: 18,
    spo2: 98,
    glycemia: 1.0,
    weight: 70,
    notes: ''
  });
  const [isSavingVital, setIsSavingVital] = useState(false);

  const [showCareForm, setShowCareForm] = useState(false);
  const [careForm, setCareForm] = useState({
    type: 'Médicament',
    description: '',
    observation: '',
    status: 'Réalisé' as 'Réalisé' | 'Prévu'
  });
  const [isSavingCare, setIsSavingCare] = useState(false);

  const [showObservationForm, setShowObservationForm] = useState(false);
  const [obsForm, setObsForm] = useState({
    title: 'Visite quotidienne',
    content: ''
  });
  const [showVoiceRecorder, setShowVoiceRecorder] = useState(false);
  const [recordedVoiceNote, setRecordedVoiceNote] = useState<{
    audioUrl: string;
    durationSec: number;
    transcript: string;
  } | null>(null);
  const [isSavingObs, setIsSavingObs] = useState(false);

  // Listen to the active inpatient record for this patient & bed
  useEffect(() => {
    if (!bed.patientId) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const q = query(
      collection(db, 'inpatient_records'),
      where('patientId', '==', bed.patientId),
      where('status', '==', 'admitted')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        const docSnap = snapshot.docs[0];
        setInpatientRecord({ id: docSnap.id, ...docSnap.data() } as InpatientRecord);
      } else {
        // Fallback: create mock or empty record structure from bed info
        setInpatientRecord({
          id: `inp_${bed.id}`,
          patientId: bed.patientId!,
          patientName: bed.patientName || 'Patient',
          patientAge: bed.patientAge,
          patientGender: bed.patientGender,
          patientDossier: bed.patientDossier,
          bedId: bed.id,
          bedName: bed.name,
          roomId: bed.roomId,
          roomName: room?.name,
          service: bed.service,
          admissionDate: bed.admissionDate || new Date().toISOString().split('T')[0],
          admissionTime: bed.admissionTime || '12:00',
          doctorName: bed.admissionDoctor || 'Médecin Référent',
          reason: bed.admissionReason || 'Hospitalisation',
          origin: bed.admissionOrigin,
          priority: bed.priority || 'Normal',
          status: 'admitted',
          vitals: [],
          cares: [],
          observations: []
        });
      }
      setIsLoading(false);
    }, (err) => {
      console.error("Error loading inpatient record:", err);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [bed.patientId, bed.id]);

  // Handler: Add Vital Sign
  const handleSaveVital = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inpatientRecord) return;
    setIsSavingVital(true);

    try {
      const now = new Date();
      const newVital: InpatientVitalSign = {
        id: `vit_${Date.now()}`,
        timestamp: now.toISOString(),
        date: now.toISOString().split('T')[0],
        time: now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
        bpSys: Number(vitalForm.bpSys) || undefined,
        bpDia: Number(vitalForm.bpDia) || undefined,
        heartRate: Number(vitalForm.pulse) || undefined,
        pulse: Number(vitalForm.pulse) || undefined,
        temp: Number(vitalForm.temp) || undefined,
        respRate: Number(vitalForm.respRate) || undefined,
        spo2: Number(vitalForm.spo2) || undefined,
        glycemia: Number(vitalForm.glycemia) || undefined,
        weight: Number(vitalForm.weight) || undefined,
        measuredBy: currentUser?.name || 'Personnel Soignant',
        measuredById: currentUser?.id || '',
        notes: vitalForm.notes.trim() || undefined
      };

      const updatedVitals = [newVital, ...(inpatientRecord.vitals || [])];
      const recRef = doc(db, 'inpatient_records', inpatientRecord.id);
      await updateDoc(recRef, sanitizeData({ vitals: updatedVitals }));

      setShowVitalForm(false);
      window.dispatchEvent(new CustomEvent('app-notification', {
        detail: { message: "Constantes enregistrées avec succès.", type: 'success' }
      }));
    } catch (e: any) {
      console.error("Error saving vitals:", e);
      alert("Erreur lors de l'enregistrement des constantes.");
    } finally {
      setIsSavingVital(false);
    }
  };

  // Handler: Add Care
  const handleSaveCare = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inpatientRecord || !careForm.description.trim()) return;
    setIsSavingCare(true);

    try {
      const now = new Date();
      const newCare: InpatientCare = {
        id: `care_${Date.now()}`,
        type: careForm.type,
        description: careForm.description.trim(),
        timestamp: now.toISOString(),
        date: now.toISOString().split('T')[0],
        time: now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
        professional: currentUser?.name || 'Soignant Hospitalisation',
        professionalId: currentUser?.id || '',
        status: careForm.status,
        observation: careForm.observation.trim() || undefined
      };

      const updatedCares = [newCare, ...(inpatientRecord.cares || [])];
      const recRef = doc(db, 'inpatient_records', inpatientRecord.id);
      await updateDoc(recRef, sanitizeData({ cares: updatedCares }));

      setCareForm({
        type: 'Médicament',
        description: '',
        observation: '',
        status: 'Réalisé'
      });
      setShowCareForm(false);

      window.dispatchEvent(new CustomEvent('app-notification', {
        detail: { message: "Soin enregistré avec succès.", type: 'success' }
      }));
    } catch (e) {
      console.error("Error saving care:", e);
      alert("Erreur lors de l'enregistrement du soin.");
    } finally {
      setIsSavingCare(false);
    }
  };

  // Handler: Toggle Care Status
  const handleToggleCareStatus = async (careId: string, currentStatus: 'Réalisé' | 'Prévu' | 'Annulé') => {
    if (!inpatientRecord) return;
    const nextStatus = currentStatus === 'Prévu' ? 'Réalisé' : 'Prévu';
    const updatedCares = (inpatientRecord.cares || []).map(c => 
      c.id === careId ? { ...c, status: nextStatus } : c
    );

    try {
      const recRef = doc(db, 'inpatient_records', inpatientRecord.id);
      await updateDoc(recRef, sanitizeData({ cares: updatedCares }));
    } catch (e) {
      console.error("Error updating care status:", e);
    }
  };

  // Handler: Add Observation (Daily Note)
  const handleSaveObservation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inpatientRecord) return;
    if (!obsForm.content.trim() && !recordedVoiceNote) {
      alert("Veuillez saisir une note clinique ou enregistrer un message vocal.");
      return;
    }

    setIsSavingObs(true);
    try {
      const now = new Date();
      const newObs: InpatientObservation = {
        id: `obs_${Date.now()}`,
        timestamp: now.toISOString(),
        date: now.toISOString().split('T')[0],
        time: now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
        author: currentUser?.name || 'Praticien Hospitalisation',
        authorId: currentUser?.id || '',
        authorRole: currentUser?.role || 'MEDECIN',
        title: obsForm.title.trim() || 'Observation du jour',
        content: obsForm.content.trim(),
        voiceNoteAudioUrl: recordedVoiceNote?.audioUrl,
        voiceNoteTranscript: recordedVoiceNote?.transcript,
        voiceNoteDurationSec: recordedVoiceNote?.durationSec
      };

      const updatedObs = [newObs, ...(inpatientRecord.observations || [])];
      const recRef = doc(db, 'inpatient_records', inpatientRecord.id);
      await updateDoc(recRef, sanitizeData({ observations: updatedObs }));

      setObsForm({ title: 'Visite quotidienne', content: '' });
      setRecordedVoiceNote(null);
      setShowVoiceRecorder(false);
      setShowObservationForm(false);

      window.dispatchEvent(new CustomEvent('app-notification', {
        detail: { message: "Observation clinique enregistrée.", type: 'success' }
      }));
    } catch (e) {
      console.error("Error saving observation:", e);
      alert("Erreur lors de l'enregistrement de l'observation.");
    } finally {
      setIsSavingObs(false);
    }
  };

  // Latest vitals for banner
  const latestVital = inpatientRecord?.vitals && inpatientRecord.vitals.length > 0
    ? inpatientRecord.vitals[0]
    : null;

  // Print stay report
  const handlePrintStayReport = () => {
    window.print();
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-3 duration-300">
      
      {/* Top Header Card */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-8">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-6 border-b border-slate-100">
          
          {/* Patient permanent identity */}
          <div className="flex items-start sm:items-center gap-4">
            <button
              onClick={onBackToBeds}
              className="p-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl transition-colors cursor-pointer shrink-0"
              title="Retour aux lits"
            >
              <ArrowLeft size={20} />
            </button>
            <div className="w-14 h-14 bg-gradient-to-br from-blue-600 to-indigo-700 text-white rounded-2xl flex items-center justify-center font-black text-xl shadow-lg shadow-blue-500/20 shrink-0">
              {bed.patientName?.charAt(0) || 'P'}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-2xl font-black text-slate-900 tracking-tight">
                  {bed.patientName || 'Patient Hospitalisé'}
                </h1>
                <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-xl text-xs font-black uppercase tracking-wider">
                  Lit Occupé
                </span>
                {bed.priority && (
                  <span className={`px-2.5 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider ${
                    bed.priority === 'Critique' ? 'bg-rose-100 text-rose-700' :
                    bed.priority === 'Urgent' ? 'bg-amber-100 text-amber-700' :
                    'bg-slate-100 text-slate-700'
                  }`}>
                    {bed.priority}
                  </span>
                )}
              </div>
              <p className="text-xs font-bold text-slate-500 font-mono mt-1 flex flex-wrap items-center gap-3">
                <span>Dossier: <strong className="text-slate-800">{bed.patientDossier || bed.patientId}</strong></span>
                <span>•</span>
                <span>Âge: <strong className="text-slate-800">{bed.patientAge ? `${bed.patientAge} ans` : 'N/A'}</strong></span>
                <span>•</span>
                <span>Sexe: <strong className="text-slate-800">{bed.patientGender || 'M'}</strong></span>
              </p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-3 self-end lg:self-auto">
            <button
              onClick={handlePrintStayReport}
              className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl font-bold text-xs uppercase tracking-wider transition-colors cursor-pointer"
            >
              <Printer size={15} />
              <span>Imprimer Séjour</span>
            </button>
            <button
              onClick={onOpenDischargeModal}
              className="flex items-center gap-2 px-5 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-2xl font-black text-xs uppercase tracking-wider transition-all border border-rose-200 cursor-pointer shadow-xs"
            >
              <LogOut size={15} />
              <span>Libérer le Lit</span>
            </button>
          </div>
        </div>

        {/* Admission Info Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-6 text-xs">
          <div>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Lit & Chambre</span>
            <span className="font-extrabold text-blue-700 text-sm flex items-center gap-1.5 mt-0.5">
              <BedDouble size={14} />
              {bed.name} • {room?.name || 'Chambre'}
            </span>
          </div>

          <div>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Date d'admission</span>
            <span className="font-bold text-slate-800 flex items-center gap-1.5 mt-0.5">
              <Calendar size={13} className="text-slate-400" />
              {bed.admissionDate || 'N/A'} {bed.admissionTime ? `à ${bed.admissionTime}` : ''}
            </span>
          </div>

          <div>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Service / Origine</span>
            <span className="font-bold text-slate-800 mt-0.5 block truncate">
              {bed.service || 'Médecine Générale'} ({bed.admissionOrigin || 'Consultation'})
            </span>
          </div>

          <div>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Médecin Référent</span>
            <span className="font-bold text-slate-800 flex items-center gap-1.5 mt-0.5">
              <Stethoscope size={13} className="text-slate-400" />
              {bed.admissionDoctor || 'Non renseigné'}
            </span>
          </div>
        </div>

        {bed.admissionReason && (
          <div className="mt-4 p-3 bg-slate-50 border border-slate-100 rounded-2xl text-xs text-slate-700 flex items-start gap-2">
            <span className="font-black uppercase tracking-wider text-[10px] text-slate-400 shrink-0 mt-0.5">Diagnostic / Motif :</span>
            <span className="font-medium italic">{bed.admissionReason}</span>
          </div>
        )}
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2 overflow-x-auto no-scrollbar">
        <button
          onClick={() => setActiveSection('vitals')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl font-black text-xs uppercase tracking-wider transition-all cursor-pointer ${
            activeSection === 'vitals'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Activity size={16} />
          <span>Paramètres ({inpatientRecord?.vitals?.length || 0})</span>
        </button>

        <button
          onClick={() => setActiveSection('cares')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl font-black text-xs uppercase tracking-wider transition-all cursor-pointer ${
            activeSection === 'cares'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Heart size={16} />
          <span>Soins ({inpatientRecord?.cares?.length || 0})</span>
        </button>

        <button
          onClick={() => setActiveSection('observations')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl font-black text-xs uppercase tracking-wider transition-all cursor-pointer ${
            activeSection === 'observations'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <FileText size={16} />
          <span>Observations du Jour ({inpatientRecord?.observations?.length || 0})</span>
        </button>

        <button
          onClick={() => setActiveSection('history')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl font-black text-xs uppercase tracking-wider transition-all cursor-pointer ${
            activeSection === 'history'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Clock size={16} />
          <span>Historique Global du Séjour</span>
        </button>
      </div>

      {/* SECTION 1: PARAMÈTRES / CONSTANTES */}
      {activeSection === 'vitals' && (
        <div className="space-y-6">
          
          {/* Quick Vital Status Cards (Latest values) */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1">Tension</span>
              <p className="text-xl font-black text-slate-900">
                {latestVital?.bpSys ? `${latestVital.bpSys}/${latestVital.bpDia || 80}` : '--/--'}
                <span className="text-[10px] text-slate-400 font-normal ml-1">mmHg</span>
              </p>
            </div>

            <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1">Pouls</span>
              <p className="text-xl font-black text-slate-900">
                {latestVital?.pulse || latestVital?.heartRate || '--'}
                <span className="text-[10px] text-slate-400 font-normal ml-1">bpm</span>
              </p>
            </div>

            <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1">Température</span>
              <p className="text-xl font-black text-slate-900">
                {latestVital?.temp ? `${latestVital.temp}°` : '--°'}
                <span className="text-[10px] text-slate-400 font-normal ml-1">C</span>
              </p>
            </div>

            <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1">SpO2</span>
              <p className="text-xl font-black text-slate-900">
                {latestVital?.spo2 ? `${latestVital.spo2}%` : '--%'}
              </p>
            </div>

            <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1">Fréq. Resp.</span>
              <p className="text-xl font-black text-slate-900">
                {latestVital?.respRate || '--'}
                <span className="text-[10px] text-slate-400 font-normal ml-1">cpm</span>
              </p>
            </div>

            <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1">Glycémie</span>
              <p className="text-xl font-black text-slate-900">
                {latestVital?.glycemia ? `${latestVital.glycemia}` : '--'}
                <span className="text-[10px] text-slate-400 font-normal ml-1">g/L</span>
              </p>
            </div>
          </div>

          {/* Action Header */}
          <div className="flex items-center justify-between">
            <h3 className="text-base font-black text-slate-900 tracking-tight flex items-center gap-2">
              <Activity size={18} className="text-blue-600" />
              Historique des Constantes & Paramètres
            </h3>
            <button
              onClick={() => setShowVitalForm(!showVitalForm)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-xs cursor-pointer"
            >
              <Plus size={16} />
              <span>{showVitalForm ? 'Fermer le formulaire' : 'Enregistrer Constantes'}</span>
            </button>
          </div>

          {/* Vital Form Modal / Drawer */}
          {showVitalForm && (
            <form onSubmit={handleSaveVital} className="bg-blue-50/50 border border-blue-200 rounded-3xl p-6 sm:p-8 space-y-6 animate-in slide-in-from-top-2">
              <h4 className="text-sm font-black text-slate-900 uppercase tracking-wider">
                Nouvelle Prise de Constantes
              </h4>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">
                    Tension Systolique (mmHg)
                  </label>
                  <input
                    type="number"
                    value={vitalForm.bpSys}
                    onChange={(e) => setVitalForm({ ...vitalForm, bpSys: Number(e.target.value) })}
                    className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl font-bold text-slate-900"
                    placeholder="120"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">
                    Tension Diastolique (mmHg)
                  </label>
                  <input
                    type="number"
                    value={vitalForm.bpDia}
                    onChange={(e) => setVitalForm({ ...vitalForm, bpDia: Number(e.target.value) })}
                    className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl font-bold text-slate-900"
                    placeholder="80"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">
                    Pouls (bpm)
                  </label>
                  <input
                    type="number"
                    value={vitalForm.pulse}
                    onChange={(e) => setVitalForm({ ...vitalForm, pulse: Number(e.target.value) })}
                    className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl font-bold text-slate-900"
                    placeholder="75"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">
                    Température (°C)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={vitalForm.temp}
                    onChange={(e) => setVitalForm({ ...vitalForm, temp: Number(e.target.value) })}
                    className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl font-bold text-slate-900"
                    placeholder="37.0"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">
                    Saturation SpO2 (%)
                  </label>
                  <input
                    type="number"
                    value={vitalForm.spo2}
                    onChange={(e) => setVitalForm({ ...vitalForm, spo2: Number(e.target.value) })}
                    className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl font-bold text-slate-900"
                    placeholder="98"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">
                    Fréquence Respiratoire (cpm)
                  </label>
                  <input
                    type="number"
                    value={vitalForm.respRate}
                    onChange={(e) => setVitalForm({ ...vitalForm, respRate: Number(e.target.value) })}
                    className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl font-bold text-slate-900"
                    placeholder="18"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">
                    Glycémie (g/L)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={vitalForm.glycemia}
                    onChange={(e) => setVitalForm({ ...vitalForm, glycemia: Number(e.target.value) })}
                    className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl font-bold text-slate-900"
                    placeholder="1.0"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">
                    Poids (kg)
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    value={vitalForm.weight}
                    onChange={(e) => setVitalForm({ ...vitalForm, weight: Number(e.target.value) })}
                    className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl font-bold text-slate-900"
                    placeholder="70"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">
                  Notes / Observations cliniques
                </label>
                <input
                  type="text"
                  value={vitalForm.notes}
                  onChange={(e) => setVitalForm({ ...vitalForm, notes: e.target.value })}
                  placeholder="Patient calme, apyrétique, tolère bien la perfusion..."
                  className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl font-bold text-slate-900 text-sm"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowVitalForm(false)}
                  className="px-5 py-2.5 border border-slate-200 text-slate-600 rounded-xl font-bold text-xs cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isSavingVital}
                  className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black text-xs uppercase tracking-wider flex items-center gap-2 cursor-pointer shadow-xs"
                >
                  {isSavingVital ? "Enregistrement..." : "Enregistrer les paramètres"}
                </button>
              </div>
            </form>
          )}

          {/* Vitals History Table */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            {(!inpatientRecord?.vitals || inpatientRecord.vitals.length === 0) ? (
              <div className="py-16 text-center text-slate-400">
                <Activity size={40} className="mx-auto text-slate-300 mb-3" />
                <p className="font-bold text-slate-600">Aucune constante enregistrée pour ce séjour</p>
                <p className="text-xs text-slate-400 mt-1">Utilisez le bouton ci-dessus pour ajouter une prise de paramètres.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50/70 border-b border-slate-100 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    <tr>
                      <th className="py-4 px-6">Date & Heure</th>
                      <th className="py-4 px-6">Tension (TA)</th>
                      <th className="py-4 px-6">Pouls</th>
                      <th className="py-4 px-6">Température</th>
                      <th className="py-4 px-6">SpO2</th>
                      <th className="py-4 px-6">Fréq. Resp.</th>
                      <th className="py-4 px-6">Glycémie</th>
                      <th className="py-4 px-6">Pris par</th>
                      <th className="py-4 px-6">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-bold">
                    {inpatientRecord.vitals.map(v => (
                      <tr key={v.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-4 px-6 font-mono text-slate-700">
                          {v.date} <span className="text-slate-400">{v.time}</span>
                        </td>
                        <td className="py-4 px-6 text-slate-900 font-black">
                          {v.bpSys ? `${v.bpSys}/${v.bpDia || 80}` : '--'}
                        </td>
                        <td className="py-4 px-6 text-slate-800">{v.pulse || v.heartRate || '--'} bpm</td>
                        <td className="py-4 px-6 text-slate-800">{v.temp ? `${v.temp} °C` : '--'}</td>
                        <td className="py-4 px-6">
                          <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black ${
                            (v.spo2 || 100) < 95 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
                          }`}>
                            {v.spo2 ? `${v.spo2}%` : '--'}
                          </span>
                        </td>
                        <td className="py-4 px-6 text-slate-800">{v.respRate ? `${v.respRate}/min` : '--'}</td>
                        <td className="py-4 px-6 text-slate-800">{v.glycemia ? `${v.glycemia} g/L` : '--'}</td>
                        <td className="py-4 px-6 text-slate-600">{v.measuredBy}</td>
                        <td className="py-4 px-6 text-slate-500 italic max-w-xs truncate">{v.notes || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* SECTION 2: SOINS */}
      {activeSection === 'cares' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-black text-slate-900 tracking-tight flex items-center gap-2">
              <Heart size={18} className="text-rose-600" />
              Soins & Actes Administrés
            </h3>
            <button
              onClick={() => setShowCareForm(!showCareForm)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-xs cursor-pointer"
            >
              <Plus size={16} />
              <span>{showCareForm ? 'Fermer le formulaire' : 'Ajouter un Soin'}</span>
            </button>
          </div>

          {/* New Care Form */}
          {showCareForm && (
            <form onSubmit={handleSaveCare} className="bg-slate-50 border border-slate-200 rounded-3xl p-6 sm:p-8 space-y-5 animate-in slide-in-from-top-2">
              <h4 className="text-sm font-black text-slate-900 uppercase tracking-wider">
                Enregistrement d'un Soin Infirmier / Médical
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">
                    Type de Soin
                  </label>
                  <select
                    value={careForm.type}
                    onChange={(e) => setCareForm({ ...careForm, type: e.target.value })}
                    className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl font-bold text-slate-900 text-sm"
                  >
                    <option value="Médicament">Médicament / Perfusion</option>
                    <option value="Injection">Injection (IM / IV / SC)</option>
                    <option value="Pansement">Pansement / Soin de plaie</option>
                    <option value="Surveillance">Surveillance clinique / Monitoring</option>
                    <option value="Hygiène">Soin d'hygiène / Confort</option>
                    <option value="Sonde / Drain">Sonde / Drain / Cathéter</option>
                    <option value="Prélèvement">Prélèvement sanguin / Examen</option>
                    <option value="Autre">Autre acte</option>
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">
                    Description du soin <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={careForm.description}
                    onChange={(e) => setCareForm({ ...careForm, description: e.target.value })}
                    placeholder="Ex: Pose perfusion Sérum Salé 0.9% 500ml + Paracétamol 1g IV..."
                    className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl font-bold text-slate-900 text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">
                    Statut du soin
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setCareForm({ ...careForm, status: 'Réalisé' })}
                      className={`flex-1 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all border ${
                        careForm.status === 'Réalisé'
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-white text-slate-600 border-slate-200'
                      }`}
                    >
                      Réalisé
                    </button>
                    <button
                      type="button"
                      onClick={() => setCareForm({ ...careForm, status: 'Prévu' })}
                      className={`flex-1 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all border ${
                        careForm.status === 'Prévu'
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white text-slate-600 border-slate-200'
                      }`}
                    >
                      Prévu
                    </button>
                  </div>
                </div>

                <div className="sm:col-span-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">
                    Observation éventuelle
                  </label>
                  <input
                    type="text"
                    value={careForm.observation}
                    onChange={(e) => setCareForm({ ...careForm, observation: e.target.value })}
                    placeholder="Ex: Bonne tolérance veineuse, débit 30 gttes/min..."
                    className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl font-bold text-slate-900 text-sm"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCareForm(false)}
                  className="px-5 py-2.5 border border-slate-200 text-slate-600 rounded-xl font-bold text-xs cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isSavingCare}
                  className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black text-xs uppercase tracking-wider flex items-center gap-2 cursor-pointer shadow-xs"
                >
                  {isSavingCare ? "Enregistrement..." : "Enregistrer le soin"}
                </button>
              </div>
            </form>
          )}

          {/* Cares List */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            {(!inpatientRecord?.cares || inpatientRecord.cares.length === 0) ? (
              <div className="py-16 text-center text-slate-400">
                <Heart size={40} className="mx-auto text-slate-300 mb-3" />
                <p className="font-bold text-slate-600">Aucun soin administré enregistré</p>
                <p className="text-xs text-slate-400 mt-1">Cliquez sur « Ajouter un Soin » pour consigner une administration.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {inpatientRecord.cares.map(care => (
                  <div key={care.id} className="p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/60 transition-colors">
                    <div className="flex items-start gap-4">
                      <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${
                        care.status === 'Réalisé' 
                          ? 'bg-emerald-100 text-emerald-700' 
                          : 'bg-blue-100 text-blue-700'
                      }`}>
                        {care.status === 'Réalisé' ? <CheckCircle2 size={20} /> : <Clock size={20} />}
                      </div>
                      <div>
                        <div className="flex items-center gap-2.5 flex-wrap">
                          <span className="px-2 py-0.5 bg-slate-100 text-slate-700 text-[10px] font-black uppercase rounded-lg">
                            {care.type}
                          </span>
                          <h4 className="font-black text-slate-900 text-sm">{care.description}</h4>
                        </div>
                        {care.observation && (
                          <p className="text-xs text-slate-500 italic mt-1">{care.observation}</p>
                        )}
                        <p className="text-[11px] text-slate-400 font-bold mt-1 flex items-center gap-2">
                          <span>{care.date} à {care.time}</span>
                          <span>•</span>
                          <span>Par: {care.professional}</span>
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 self-end sm:self-center">
                      <button
                        onClick={() => handleToggleCareStatus(care.id, care.status)}
                        className={`px-3.5 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                          care.status === 'Réalisé'
                            ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                            : 'bg-blue-100 text-blue-800 hover:bg-blue-200'
                        }`}
                      >
                        {care.status}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* SECTION 3: OBSERVATIONS DU JOUR */}
      {activeSection === 'observations' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-black text-slate-900 tracking-tight flex items-center gap-2">
              <FileText size={18} className="text-indigo-600" />
              Observations Quotidiennes & Évolution Médicale
            </h3>
            <button
              onClick={() => setShowObservationForm(!showObservationForm)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-xs cursor-pointer"
            >
              <Plus size={16} />
              <span>{showObservationForm ? 'Fermer le formulaire' : 'Rédiger une Observation'}</span>
            </button>
          </div>

          {/* Observation Form with Voice Note Support */}
          {showObservationForm && (
            <form onSubmit={handleSaveObservation} className="bg-indigo-50/40 border border-indigo-200 rounded-3xl p-6 sm:p-8 space-y-5 animate-in slide-in-from-top-2">
              <h4 className="text-sm font-black text-slate-900 uppercase tracking-wider">
                Nouvelle Note d'Évolution Clinique
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">
                    Titre / Contexte de l'observation
                  </label>
                  <select
                    value={obsForm.title}
                    onChange={(e) => setObsForm({ ...obsForm, title: e.target.value })}
                    className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl font-bold text-slate-900 text-sm"
                  >
                    <option value="Visite quotidienne">Visite quotidienne du matin</option>
                    <option value="Visite du soir">Visite du soir / Contre-visite</option>
                    <option value="Transmission soignante">Transmission soignante / Garde</option>
                    <option value="Évolution favorable">Évolution clinique favorable</option>
                    <option value="Incident / Dégradation">Incident / Dégradation de l'état</option>
                    <option value="Avis spécialisé">Avis médical spécialisé</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">
                    Auteur / Praticien
                  </label>
                  <div className="px-4 py-2.5 bg-slate-100 border border-slate-200 rounded-xl font-bold text-slate-700 text-sm">
                    {currentUser?.name || 'Praticien'} ({currentUser?.role || 'Médecin'})
                  </div>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                    Contenu de l'observation médicale
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowVoiceRecorder(!showVoiceRecorder)}
                    className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1.5 cursor-pointer"
                  >
                    <Mic size={14} />
                    <span>{showVoiceRecorder ? 'Masquer dictée vocale' : 'Ajouter une note vocale'}</span>
                  </button>
                </div>
                <textarea
                  rows={4}
                  value={obsForm.content}
                  onChange={(e) => setObsForm({ ...obsForm, content: e.target.value })}
                  placeholder="État général, examen clinique du jour, auscultation, bilan biologique en cours, adaptation thérapeutique..."
                  className="w-full p-4 bg-white border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-bold text-slate-900 text-sm resize-none"
                />
              </div>

              {/* Voice Recorder Integration */}
              {showVoiceRecorder && (
                <div className="p-5 bg-white border border-indigo-200 rounded-2xl shadow-xs space-y-3">
                  <h5 className="text-xs font-black text-indigo-900 uppercase tracking-wider flex items-center gap-2">
                    <Mic size={15} className="text-indigo-600" />
                    Enregistrement de la Note Vocale
                  </h5>
                  <VoiceNoteRecorder
                    onSaveVoiceNote={(audioUrl, durationSec, transcript) => {
                      setRecordedVoiceNote({ audioUrl, durationSec, transcript });
                      if (transcript && !obsForm.content) {
                        setObsForm(prev => ({ ...prev, content: transcript }));
                      }
                    }}
                    onCancel={() => {
                      setRecordedVoiceNote(null);
                      setShowVoiceRecorder(false);
                    }}
                  />
                  {recordedVoiceNote && (
                    <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl flex items-center gap-2 text-xs font-bold">
                      <CheckCircle2 size={16} className="text-emerald-600" />
                      <span>Note vocale attachée ({recordedVoiceNote.durationSec}s).</span>
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowObservationForm(false)}
                  className="px-5 py-2.5 border border-slate-200 text-slate-600 rounded-xl font-bold text-xs cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isSavingObs}
                  className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black text-xs uppercase tracking-wider flex items-center gap-2 cursor-pointer shadow-xs"
                >
                  {isSavingObs ? "Enregistrement..." : "Enregistrer l'observation"}
                </button>
              </div>
            </form>
          )}

          {/* Observations List */}
          <div className="space-y-4">
            {(!inpatientRecord?.observations || inpatientRecord.observations.length === 0) ? (
              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm py-16 text-center text-slate-400">
                <FileText size={40} className="mx-auto text-slate-300 mb-3" />
                <p className="font-bold text-slate-600">Aucune observation enregistrée</p>
                <p className="text-xs text-slate-400 mt-1">Rédigez la première observation quotidienne de suivi du patient.</p>
              </div>
            ) : (
              inpatientRecord.observations.map(obs => (
                <div key={obs.id} className="bg-white rounded-3xl border border-slate-200 shadow-xs p-6 space-y-3 hover:border-indigo-200 transition-colors">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-2.5">
                      <span className="px-2.5 py-1 bg-indigo-100 text-indigo-800 text-[10px] font-black uppercase rounded-lg">
                        {obs.title || 'Observation'}
                      </span>
                      <h4 className="font-black text-slate-900 text-sm">{obs.author}</h4>
                    </div>
                    <span className="text-xs font-mono font-bold text-slate-400">
                      {obs.date} à {obs.time}
                    </span>
                  </div>

                  <p className="text-sm font-medium text-slate-800 whitespace-pre-line leading-relaxed">
                    {obs.content}
                  </p>

                  {/* Audio player if voice note exists */}
                  {obs.voiceNoteAudioUrl && (
                    <div className="pt-2">
                      <div className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-2xl w-full sm:w-auto inline-flex">
                        <Volume2 size={16} className="text-indigo-600 shrink-0" />
                        <audio controls src={obs.voiceNoteAudioUrl} className="h-8 max-w-xs" />
                        {obs.voiceNoteDurationSec && (
                          <span className="text-xs font-mono font-bold text-slate-400">
                            {obs.voiceNoteDurationSec}s
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* SECTION 4: HISTORIQUE GLOBAL DU SÉJOUR */}
      {activeSection === 'history' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-black text-slate-900 tracking-tight flex items-center gap-2">
              <Clock size={18} className="text-blue-600" />
              Chronologie Globale du Séjour
            </h3>
            <button
              onClick={handlePrintStayReport}
              className="flex items-center gap-1.5 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs uppercase tracking-wider cursor-pointer"
            >
              <Printer size={15} />
              <span>Exporter / Imprimer</span>
            </button>
          </div>

          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-6">
            
            {/* Timeline event 1: Admission */}
            <div className="flex items-start gap-4 relative">
              <div className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-blue-500/20">
                <BedDouble size={20} />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 bg-blue-100 text-blue-800 text-[10px] font-black uppercase rounded-lg">
                    Admission
                  </span>
                  <span className="text-xs font-mono font-bold text-slate-400">
                    {bed.admissionDate} à {bed.admissionTime || '00:00'}
                  </span>
                </div>
                <h4 className="font-black text-slate-900 text-sm">
                  Admission au lit {bed.name} ({room?.name || 'Chambre'})
                </h4>
                <p className="text-xs text-slate-600">
                  Service : <strong>{bed.service || 'Médecine Générale'}</strong> • Origine : <strong>{bed.admissionOrigin || 'Consultation'}</strong>
                </p>
                {bed.admissionReason && (
                  <p className="text-xs text-slate-500 italic mt-0.5">Motif : {bed.admissionReason}</p>
                )}
              </div>
            </div>

            {/* Combined Timeline of Vitals, Cares, Observations */}
            {(() => {
              const allEvents: any[] = [];
              (inpatientRecord?.vitals || []).forEach(v => allEvents.push({
                type: 'vital',
                timestamp: v.timestamp,
                date: v.date,
                time: v.time,
                title: `Prise de constantes (TA: ${v.bpSys}/${v.bpDia || 80}, Pouls: ${v.pulse || v.heartRate || '-'} bpm, T°: ${v.temp || '-'}°C)`,
                author: v.measuredBy,
                notes: v.notes
              }));
              (inpatientRecord?.cares || []).forEach(c => allEvents.push({
                type: 'care',
                timestamp: c.timestamp,
                date: c.date,
                time: c.time,
                title: `Soin : ${c.type} - ${c.description} [${c.status}]`,
                author: c.professional,
                notes: c.observation
              }));
              (inpatientRecord?.observations || []).forEach(o => allEvents.push({
                type: 'observation',
                timestamp: o.timestamp,
                date: o.date,
                time: o.time,
                title: `Observation : ${o.title}`,
                author: o.author,
                notes: o.content
              }));

              allEvents.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

              if (allEvents.length === 0) {
                return (
                  <p className="text-xs text-slate-400 font-bold italic py-4">
                    Aucun acte supplémentaire consigné pour le moment.
                  </p>
                );
              }

              return allEvents.map((evt, idx) => (
                <div key={idx} className="flex items-start gap-4 pt-4 border-t border-slate-100">
                  <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${
                    evt.type === 'vital' ? 'bg-emerald-100 text-emerald-700' :
                    evt.type === 'care' ? 'bg-rose-100 text-rose-700' :
                    'bg-indigo-100 text-indigo-700'
                  }`}>
                    {evt.type === 'vital' ? <Activity size={18} /> :
                     evt.type === 'care' ? <Heart size={18} /> :
                     <FileText size={18} />}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 text-[9px] font-black uppercase rounded-lg ${
                        evt.type === 'vital' ? 'bg-emerald-50 text-emerald-800' :
                        evt.type === 'care' ? 'bg-rose-50 text-rose-800' :
                        'bg-indigo-50 text-indigo-800'
                      }`}>
                        {evt.type === 'vital' ? 'Paramètres' : evt.type === 'care' ? 'Soin' : 'Observation'}
                      </span>
                      <span className="text-xs font-mono font-bold text-slate-400">
                        {evt.date} à {evt.time}
                      </span>
                    </div>
                    <h5 className="font-black text-slate-900 text-sm mt-0.5">{evt.title}</h5>
                    {evt.notes && <p className="text-xs text-slate-600 italic mt-0.5">{evt.notes}</p>}
                    <p className="text-[10px] text-slate-400 font-bold mt-1">Par: {evt.author}</p>
                  </div>
                </div>
              ));
            })()}

          </div>
        </div>
      )}

    </div>
  );
};
