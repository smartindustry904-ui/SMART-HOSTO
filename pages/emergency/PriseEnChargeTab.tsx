import React, { useState } from 'react';
import { 
  User, Clock, Activity, Stethoscope, Heart, Thermometer, Wind, 
  Droplets, FileText, CheckCircle2, AlertCircle, ArrowLeft, Plus, 
  Trash2, Mic, Play, Pause, LogOut, Bed, Calendar, ExternalLink, 
  ShieldAlert, Sparkles, Check, ChevronRight, Layers, Volume2
} from 'lucide-react';
import { 
  EmergencyEncounter, EmergencyStatusV1, EmergencyVitalSign, 
  EmergencyCare, EmergencyFollowUp, EmergencyDischarge, User as UserType 
} from '../../types';
import { VoiceNoteRecorder } from './VoiceNoteRecorder';
import { PrescriptionSoinsTab } from '../consultation/PrescriptionSoinsTab';
import { UniversalHospitalisationModal } from '../../components/common/UniversalHospitalisationModal';

interface PriseEnChargeTabProps {
  encounter: EmergencyEncounter | null;
  onBackToList: () => void;
  onSaveVitals: (encounterId: string, vitals: EmergencyVitalSign) => Promise<boolean>;
  onSaveCare: (encounterId: string, care: EmergencyCare, billToCashier?: boolean) => Promise<boolean>;
  onUpdateCareStatus: (encounterId: string, careId: string, status: 'Prévu' | 'Réalisé' | 'Annulé') => Promise<boolean>;
  onSaveFollowUp: (encounterId: string, followUp: EmergencyFollowUp, audioUrl?: string, durationSec?: number, transcript?: string) => Promise<boolean>;
  onAuthorizeDischarge: (encounterId: string, discharge: EmergencyDischarge) => Promise<boolean>;
  onUpdateStatus: (encounterId: string, newStatus: EmergencyStatusV1, assignedStaff?: string) => Promise<void>;
  currentUser?: UserType;
  theme?: 'light' | 'dark';
}

export const PriseEnChargeTab: React.FC<PriseEnChargeTabProps> = ({
  encounter,
  onBackToList,
  onSaveVitals,
  onSaveCare,
  onUpdateCareStatus,
  onSaveFollowUp,
  onAuthorizeDischarge,
  onUpdateStatus,
  currentUser,
  theme = 'light'
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'resume' | 'parametres' | 'soins' | 'suivi' | 'sortie'>('resume');
  const [showHospitalisationModal, setShowHospitalisationModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Form states for Paramètres
  const [vitalsForm, setVitalsForm] = useState({
    bpSys: '',
    bpDia: '',
    heartRate: '',
    respRate: '',
    spo2: '',
    temp: '',
    weight: '',
    height: '',
    glycemia: '',
    painScale: 0,
    notes: ''
  });

  // Form states for Soins
  const [careForm, setCareForm] = useState({
    type: 'Injection',
    description: '',
    product: '',
    quantity: '',
    observation: '',
    status: 'Réalisé' as 'Prévu' | 'Réalisé' | 'Annulé',
    billToCashier: false
  });

  // Form states for Suivi Médical
  const [followUpForm, setFollowUpForm] = useState({
    motif: '',
    clinicalExam: '',
    evolution: '',
    treatments: '',
    requestedExams: '',
    conclusion: '',
    freeText: ''
  });
  const [attachedVoiceNote, setAttachedVoiceNote] = useState<{
    audioUrl: string;
    durationSec: number;
    transcript: string;
  } | null>(null);

  // Form states for Sortie
  const [dischargeForm, setDischargeForm] = useState({
    conclusion: '',
    instructions: '',
    treatment: '',
    appointment: '',
    orientation: 'Retour à domicile' as 'Retour à domicile' | 'Consultation' | 'Hospitalisation' | 'Transfert' | 'Autre',
    destinationDetails: ''
  });

  if (!encounter) {
    return (
      <div className="bg-white p-16 rounded-3xl border border-slate-200 text-center flex flex-col items-center justify-center space-y-4">
        <div className="w-16 h-16 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center">
          <Stethoscope size={32} />
        </div>
        <h3 className="text-lg font-black text-slate-800">Aucun patient sélectionné</h3>
        <p className="text-xs text-slate-500 max-w-sm">
          Veuillez sélectionner un patient dans la liste des Urgences pour ouvrir son espace de prise en charge.
        </p>
        <button
          onClick={onBackToList}
          className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl text-xs font-bold transition-all shadow-md flex items-center gap-2 cursor-pointer"
        >
          <ArrowLeft size={14} />
          Retour à la liste des patients
        </button>
      </div>
    );
  }

  const showNotification = (msg: string) => {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(null), 4000);
  };

  // Vitals submission
  const handleSubmitVitals = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const now = new Date();
      const newVitals: EmergencyVitalSign = {
        id: `vit_${Date.now()}`,
        timestamp: now.toISOString(),
        date: now.toISOString().split('T')[0],
        time: now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
        bpSys: vitalsForm.bpSys ? Number(vitalsForm.bpSys) : undefined,
        bpDia: vitalsForm.bpDia ? Number(vitalsForm.bpDia) : undefined,
        heartRate: vitalsForm.heartRate ? Number(vitalsForm.heartRate) : undefined,
        respRate: vitalsForm.respRate ? Number(vitalsForm.respRate) : undefined,
        spo2: vitalsForm.spo2 ? Number(vitalsForm.spo2) : undefined,
        temp: vitalsForm.temp ? Number(vitalsForm.temp) : undefined,
        weight: vitalsForm.weight ? Number(vitalsForm.weight) : undefined,
        height: vitalsForm.height ? Number(vitalsForm.height) : undefined,
        glycemia: vitalsForm.glycemia ? Number(vitalsForm.glycemia) : undefined,
        painScale: Number(vitalsForm.painScale) || 0,
        measuredBy: currentUser?.name || 'Soignant Urgences',
        measuredById: currentUser?.id,
        notes: vitalsForm.notes || undefined
      };

      const ok = await onSaveVitals(encounter.id, newVitals);
      if (ok) {
        showNotification("Paramètres vitaux enregistrés avec succès.");
        setVitalsForm({
          bpSys: '',
          bpDia: '',
          heartRate: '',
          respRate: '',
          spo2: '',
          temp: '',
          weight: '',
          height: '',
          glycemia: '',
          painScale: 0,
          notes: ''
        });
      }
    } finally {
      setIsSaving(false);
    }
  };

  // Care submission
  const handleSubmitCare = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!careForm.description.trim()) {
      alert("Veuillez renseigner la description du soin.");
      return;
    }

    setIsSaving(true);
    try {
      const now = new Date();
      const newCare: EmergencyCare = {
        id: `care_${Date.now()}`,
        type: careForm.type,
        description: careForm.description.trim(),
        timestamp: now.toISOString(),
        date: now.toISOString().split('T')[0],
        time: now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
        professional: currentUser?.name || 'Soignant Urgences',
        professionalId: currentUser?.id,
        product: careForm.product.trim() || undefined,
        quantity: careForm.quantity.trim() || undefined,
        observation: careForm.observation.trim() || undefined,
        status: careForm.status,
        billed: careForm.billToCashier
      };

      const ok = await onSaveCare(encounter.id, newCare, careForm.billToCashier);
      if (ok) {
        showNotification("Soin enregistré avec succès.");
        setCareForm({
          type: 'Injection',
          description: '',
          product: '',
          quantity: '',
          observation: '',
          status: 'Réalisé',
          billToCashier: false
        });
      }
    } finally {
      setIsSaving(false);
    }
  };

  // Follow-up submission
  const handleSubmitFollowUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!followUpForm.conclusion.trim() && !followUpForm.clinicalExam.trim() && !followUpForm.freeText.trim() && !attachedVoiceNote) {
      alert("Veuillez renseigner au moins une observation ou joindre une note vocale.");
      return;
    }

    setIsSaving(true);
    try {
      const now = new Date();
      const followUp: EmergencyFollowUp = {
        id: `fu_${Date.now()}`,
        timestamp: now.toISOString(),
        date: now.toISOString().split('T')[0],
        time: now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
        author: currentUser?.name || 'Praticien Urgences',
        authorId: currentUser?.id,
        authorRole: currentUser?.role || 'MEDECIN',
        motif: followUpForm.motif.trim() || undefined,
        clinicalExam: followUpForm.clinicalExam.trim() || undefined,
        evolution: followUpForm.evolution.trim() || undefined,
        treatments: followUpForm.treatments.trim() || undefined,
        requestedExams: followUpForm.requestedExams.trim() || undefined,
        conclusion: followUpForm.conclusion.trim() || undefined,
        freeText: followUpForm.freeText.trim() || undefined,
        voiceNoteAudioUrl: attachedVoiceNote?.audioUrl,
        voiceNoteTranscript: attachedVoiceNote?.transcript
      };

      const ok = await onSaveFollowUp(
        encounter.id, 
        followUp, 
        attachedVoiceNote?.audioUrl, 
        attachedVoiceNote?.durationSec, 
        attachedVoiceNote?.transcript
      );

      if (ok) {
        showNotification("Note de suivi médical enregistrée.");
        setFollowUpForm({
          motif: '',
          clinicalExam: '',
          evolution: '',
          treatments: '',
          requestedExams: '',
          conclusion: '',
          freeText: ''
        });
        setAttachedVoiceNote(null);
      }
    } finally {
      setIsSaving(false);
    }
  };

  // Discharge submission
  const handleAuthorizeDischarge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dischargeForm.conclusion.trim()) {
      alert("Veuillez rédiger la conclusion médicale avant d'autoriser la sortie.");
      return;
    }

    const confirmMsg = dischargeForm.orientation === 'Hospitalisation'
      ? "Confirmer la sortie des Urgences et la transmission immédiate vers le module Hospitalisation ?"
      : `Confirmer la sortie du patient avec orientation "${dischargeForm.orientation}" ?`;

    if (!window.confirm(confirmMsg)) return;

    setIsSaving(true);
    try {
      const now = new Date();
      const discharge: EmergencyDischarge = {
        date: now.toISOString().split('T')[0],
        time: now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
        timestamp: now.toISOString(),
        professional: currentUser?.name || 'Praticien Urgences',
        professionalId: currentUser?.id,
        conclusion: dischargeForm.conclusion.trim(),
        instructions: dischargeForm.instructions.trim() || undefined,
        treatment: dischargeForm.treatment.trim() || undefined,
        appointment: dischargeForm.appointment.trim() || undefined,
        orientation: dischargeForm.orientation,
        destinationDetails: dischargeForm.destinationDetails.trim() || undefined
      };

      const ok = await onAuthorizeDischarge(encounter.id, discharge);
      if (ok) {
        showNotification("Sortie autorisée et dossier clôturé avec succès.");
        onBackToList();
      }
    } finally {
      setIsSaving(false);
    }
  };

  const latestVitals = encounter.vitals && encounter.vitals.length > 0 
    ? encounter.vitals[encounter.vitals.length - 1] 
    : null;

  return (
    <div className="space-y-6">
      {/* Top Banner: Patient Identity */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <button
              onClick={onBackToList}
              className="p-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-all cursor-pointer"
              title="Retour à la liste des patients"
            >
              <ArrowLeft size={18} />
            </button>
            <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 border border-rose-100 flex items-center justify-center font-black text-lg shrink-0">
              {encounter.lastName ? encounter.lastName.charAt(0) : 'P'}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-xl font-black text-slate-900">
                  {encounter.lastName} {encounter.firstName}
                </h2>
                <span className="font-mono text-xs font-bold bg-slate-100 text-slate-700 px-2.5 py-0.5 rounded-lg border border-slate-200">
                  Dossier : {encounter.patientDme || encounter.patientId}
                </span>
                <span className="text-xs text-slate-500 font-bold">
                  {encounter.age !== undefined ? `${encounter.age} ans` : ''} • {encounter.gender === 'F' ? 'Femme' : 'Homme'}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 mt-1">
                <span>Arrivé(e) à <strong>{encounter.arrivalTime}</strong> ({encounter.arrivalDate})</span>
                <span>•</span>
                <span className="text-slate-700">Motif : <strong>{encounter.arrivalMotif}</strong></span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Status Switcher */}
            <div className="flex items-center gap-2 bg-slate-50 p-1.5 rounded-2xl border border-slate-200">
              <span className="text-[10px] font-black uppercase text-slate-400 pl-2">Statut :</span>
              {(['En attente', 'Pris en charge', 'En cours de suivi'] as const).map((st) => (
                <button
                  key={st}
                  onClick={() => onUpdateStatus(encounter.id, st, currentUser?.name)}
                  className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    encounter.status === st
                      ? 'bg-rose-600 text-white shadow-xs'
                      : 'text-slate-600 hover:bg-slate-200/60'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setShowHospitalisationModal(true)}
              className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 shadow-sm cursor-pointer"
            >
              <Bed size={14} />
              <span>Hospitaliser le patient</span>
            </button>

            <button
              onClick={onBackToList}
              className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
            >
              Changer de patient
            </button>
          </div>
        </div>
      </div>

      {/* Success alert message */}
      {successMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs font-bold text-emerald-800 flex items-center gap-2 animate-in fade-in duration-300">
          <CheckCircle2 size={16} className="text-emerald-600" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* 5 Simple Tabs Header (Section 31) */}
      <div className="flex items-center gap-2 border-b border-slate-200 overflow-x-auto pb-1">
        {[
          { id: 'resume', label: 'Résumé', count: null },
          { id: 'parametres', label: 'Paramètres', count: encounter.vitals?.length || 0 },
          { id: 'soins', label: 'Prescrire un Soin', count: encounter.cares?.length || 0 },
          { id: 'suivi', label: 'Suivi Médical', count: encounter.followUps?.length || 0 },
          { id: 'sortie', label: 'Sortie', count: null }
        ].map((tab) => {
          const isActive = activeSubTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id as any)}
              className={`px-5 py-3 rounded-2xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer ${
                isActive
                  ? 'bg-rose-600 text-white shadow-md'
                  : 'bg-white hover:bg-slate-50 text-slate-600 border border-slate-200'
              }`}
            >
              <span>{tab.label}</span>
              {tab.count !== null && (
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                  isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* TAB 1: RÉSUMÉ */}
      {activeSubTab === 'resume' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in duration-300">
          {/* Vitals Summary Card */}
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black uppercase text-slate-800 flex items-center gap-2">
                <Activity size={16} className="text-rose-600" />
                Dernières Constantes
              </h3>
              <button
                onClick={() => setActiveSubTab('parametres')}
                className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1 cursor-pointer"
              >
                <span>Ajouter</span>
                <Plus size={14} />
              </button>
            </div>

            {latestVitals ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-3 bg-slate-50 rounded-2xl">
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Tension Artérielle</span>
                    <p className="font-black text-slate-900 text-sm mt-0.5">
                      {latestVitals.bpSys || '--'}/{latestVitals.bpDia || '--'} <small className="font-normal text-[10px]">mmHg</small>
                    </p>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-2xl">
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Pouls</span>
                    <p className="font-black text-slate-900 text-sm mt-0.5">
                      {latestVitals.heartRate || '--'} <small className="font-normal text-[10px]">bpm</small>
                    </p>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-2xl">
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Température</span>
                    <p className="font-black text-slate-900 text-sm mt-0.5">
                      {latestVitals.temp || '--'} <small className="font-normal text-[10px]">°C</small>
                    </p>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-2xl">
                    <span className="text-[10px] font-bold text-slate-400 uppercase">SpO₂</span>
                    <p className="font-black text-slate-900 text-sm mt-0.5">
                      {latestVitals.spo2 || '--'} <small className="font-normal text-[10px]">%</small>
                    </p>
                  </div>
                </div>
                <div className="text-[11px] text-slate-400 italic">
                  Mesuré à {latestVitals.time} le {latestVitals.date} par {latestVitals.measuredBy}
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic py-4 text-center">
                Aucune constante enregistrée pour ce passage.
              </p>
            )}
          </div>

          {/* Cares Summary Card */}
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black uppercase text-slate-800 flex items-center gap-2">
                <Stethoscope size={16} className="text-blue-600" />
                Soins Réalisés ({encounter.cares?.length || 0})
              </h3>
              <button
                onClick={() => setActiveSubTab('soins')}
                className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1 cursor-pointer"
              >
                <span>Nouveau</span>
                <Plus size={14} />
              </button>
            </div>

            {encounter.cares && encounter.cares.length > 0 ? (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {encounter.cares.slice(-3).reverse().map((c) => (
                  <div key={c.id} className="p-2.5 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-between text-xs">
                    <div>
                      <span className="font-black text-slate-800">{c.type}</span>
                      <p className="text-[11px] text-slate-500 truncate max-w-xs">{c.description}</p>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      c.status === 'Réalisé' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                    }`}>
                      {c.status}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic py-4 text-center">
                Aucun soin enregistré.
              </p>
            )}
          </div>

          {/* Follow-up Summary Card */}
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black uppercase text-slate-800 flex items-center gap-2">
                <FileText size={16} className="text-indigo-600" />
                Dernier Suivi Médical
              </h3>
              <button
                onClick={() => setActiveSubTab('suivi')}
                className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1 cursor-pointer"
              >
                <span>Rédiger</span>
                <Plus size={14} />
              </button>
            </div>

            {encounter.followUps && encounter.followUps.length > 0 ? (
              <div className="space-y-2 text-xs">
                {(() => {
                  const last = encounter.followUps[encounter.followUps.length - 1];
                  return (
                    <div className="p-3 bg-slate-50 rounded-2xl space-y-1.5">
                      <div className="flex items-center justify-between text-[11px] font-bold text-slate-700">
                        <span>{last.author}</span>
                        <span className="text-slate-400">{last.time}</span>
                      </div>
                      <p className="text-slate-800 font-medium line-clamp-3">
                        {last.conclusion || last.clinicalExam || last.freeText || 'Observation notée'}
                      </p>
                      {last.voiceNoteAudioUrl && (
                        <div className="flex items-center gap-1.5 text-[11px] text-rose-600 font-bold">
                          <Mic size={12} /> Note vocale associée
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic py-4 text-center">
                Aucun suivi rédigé.
              </p>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: PARAMÈTRES / CONSTANTES (Section 10 & 11) */}
      {activeSubTab === 'parametres' && (
        <div className="space-y-8 animate-in fade-in duration-300">
          {/* New Vitals Form */}
          <form onSubmit={handleSubmitVitals} className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-6">
            <h3 className="text-sm font-black uppercase tracking-wider text-slate-800 flex items-center gap-2">
              <Activity size={18} className="text-rose-600" />
              Enregistrer une Nouvelle Mesure de Constantes
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {/* BP Sys */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">TA Systolique (mmHg)</label>
                <input
                  type="number"
                  placeholder="Ex: 120"
                  value={vitalsForm.bpSys}
                  onChange={(e) => setVitalsForm({ ...vitalsForm, bpSys: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-rose-500"
                />
              </div>

              {/* BP Dia */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">TA Diastolique (mmHg)</label>
                <input
                  type="number"
                  placeholder="Ex: 80"
                  value={vitalsForm.bpDia}
                  onChange={(e) => setVitalsForm({ ...vitalsForm, bpDia: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-rose-500"
                />
              </div>

              {/* Heart Rate */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Pouls (bpm)</label>
                <input
                  type="number"
                  placeholder="Ex: 75"
                  value={vitalsForm.heartRate}
                  onChange={(e) => setVitalsForm({ ...vitalsForm, heartRate: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-rose-500"
                />
              </div>

              {/* Temp */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Température (°C)</label>
                <input
                  type="number"
                  step="0.1"
                  placeholder="Ex: 37.2"
                  value={vitalsForm.temp}
                  onChange={(e) => setVitalsForm({ ...vitalsForm, temp: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-rose-500"
                />
              </div>

              {/* SpO2 */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">SpO₂ (%)</label>
                <input
                  type="number"
                  placeholder="Ex: 98"
                  value={vitalsForm.spo2}
                  onChange={(e) => setVitalsForm({ ...vitalsForm, spo2: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-rose-500"
                />
              </div>

              {/* Resp Rate */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Fréquence Resp. (/min)</label>
                <input
                  type="number"
                  placeholder="Ex: 18"
                  value={vitalsForm.respRate}
                  onChange={(e) => setVitalsForm({ ...vitalsForm, respRate: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-rose-500"
                />
              </div>

              {/* Weight */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Poids (kg)</label>
                <input
                  type="number"
                  step="0.1"
                  placeholder="Ex: 70"
                  value={vitalsForm.weight}
                  onChange={(e) => setVitalsForm({ ...vitalsForm, weight: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-rose-500"
                />
              </div>

              {/* Height */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Taille (cm)</label>
                <input
                  type="number"
                  placeholder="Ex: 172"
                  value={vitalsForm.height}
                  onChange={(e) => setVitalsForm({ ...vitalsForm, height: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-rose-500"
                />
              </div>

              {/* Glycemia */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Glycémie (g/L)</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="Ex: 0.95"
                  value={vitalsForm.glycemia}
                  onChange={(e) => setVitalsForm({ ...vitalsForm, glycemia: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-rose-500"
                />
              </div>

              {/* Pain Scale */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Échelle Douleur (0-10)</label>
                <input
                  type="number"
                  min="0"
                  max="10"
                  value={vitalsForm.painScale}
                  onChange={(e) => setVitalsForm({ ...vitalsForm, painScale: Number(e.target.value) })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-rose-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">Remarques / Observations</label>
              <input
                type="text"
                placeholder="Ex: Patient calme, pouls régulier..."
                value={vitalsForm.notes}
                onChange={(e) => setVitalsForm({ ...vitalsForm, notes: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium outline-none focus:border-rose-500"
              />
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={isSaving}
                className="px-6 py-2.5 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white rounded-2xl text-xs font-bold transition-all shadow-md flex items-center gap-2 cursor-pointer"
              >
                <Check size={16} />
                {isSaving ? "Enregistrement..." : "Enregistrer les constantes"}
              </button>
            </div>
          </form>

          {/* Chronological Vitals Table (Section 11) */}
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-4">
            <h3 className="text-sm font-black uppercase tracking-wider text-slate-800">
              Historique Chronologique des Paramètres
            </h3>

            {encounter.vitals && encounter.vitals.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-black uppercase text-slate-400">
                      <th className="py-3 px-4">Heure & Date</th>
                      <th className="py-3 px-3">TA (mmHg)</th>
                      <th className="py-3 px-3">Pouls</th>
                      <th className="py-3 px-3">Temp.</th>
                      <th className="py-3 px-3">SpO₂</th>
                      <th className="py-3 px-3">FR</th>
                      <th className="py-3 px-3">Glycémie</th>
                      <th className="py-3 px-3">Douleur</th>
                      <th className="py-3 px-4">Mesuré Par</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {encounter.vitals.map((v) => (
                      <tr key={v.id} className="hover:bg-slate-50">
                        <td className="py-3 px-4 font-bold text-slate-800">
                          {v.time} <span className="text-[10px] text-slate-400">({v.date})</span>
                        </td>
                        <td className="py-3 px-3 font-mono font-bold text-slate-900">
                          {v.bpSys ? `${v.bpSys}/${v.bpDia}` : '--'}
                        </td>
                        <td className="py-3 px-3 font-mono font-bold text-slate-900">{v.heartRate || '--'}</td>
                        <td className="py-3 px-3 font-mono font-bold text-slate-900">{v.temp ? `${v.temp}°C` : '--'}</td>
                        <td className="py-3 px-3 font-mono font-bold text-slate-900">{v.spo2 ? `${v.spo2}%` : '--'}</td>
                        <td className="py-3 px-3 font-mono text-slate-700">{v.respRate || '--'}</td>
                        <td className="py-3 px-3 font-mono text-slate-700">{v.glycemia ? `${v.glycemia} g/L` : '--'}</td>
                        <td className="py-3 px-3 font-mono text-slate-700">{v.painScale !== undefined ? `${v.painScale}/10` : '--'}</td>
                        <td className="py-3 px-4 text-slate-600 font-medium">{v.measuredBy}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic py-4 text-center">
                Aucune mesure enregistrée dans l'historique pour ce passage.
              </p>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: SOINS (Section 12, 13, 14, 25) */}
      {activeSubTab === 'soins' && (
        <div className="space-y-8 animate-in fade-in duration-300">
          <PrescriptionSoinsTab
            patient={{
              id: encounter.patientId || encounter.id,
              patientId: encounter.patientId || encounter.id,
              firstName: encounter.firstName,
              lastName: encounter.lastName,
              age: encounter.age,
              gender: encounter.gender
            }}
            user={currentUser || { name: 'Dr. Urgentiste', role: 'MEDECIN' } as UserType}
            source="URGENCES"
            defaultPriority="URGENT"
            onCareRecorded={(careData) => {
              onSaveCare(encounter.id, {
                id: careData.id || `care_${Date.now()}`,
                type: careData.type || 'Soin d\'urgence',
                description: careData.description || 'Prescription de soin urgent',
                timestamp: new Date().toISOString(),
                date: new Date().toISOString().split('T')[0],
                time: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
                professional: currentUser?.name || 'Dr. Urgentiste',
                status: 'Prévu'
              });
            }}
          />
        </div>
      )}

      {/* TAB 4: SUIVI MÉDICAL & RAPPORT & NOTE VOCALE (Section 15, 16, 17, 18, 19) */}
      {activeSubTab === 'suivi' && (
        <div className="space-y-8 animate-in fade-in duration-300">
          {/* New Follow-up Note Form */}
          <form onSubmit={handleSubmitFollowUp} className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-6">
            <h3 className="text-sm font-black uppercase tracking-wider text-slate-800 flex items-center gap-2">
              <FileText size={18} className="text-indigo-600" />
              Rédiger un Suivi Médical / Rapport d'Évolution
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Motif / Intitulé de la note</label>
                <input
                  type="text"
                  placeholder="Ex: Évaluation clinique à H+2, réévaluation douleur..."
                  value={followUpForm.motif}
                  onChange={(e) => setFollowUpForm({ ...followUpForm, motif: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Évolution Clinique</label>
                <input
                  type="text"
                  placeholder="Ex: Amélioration progressive, apyrexie constatée..."
                  value={followUpForm.evolution}
                  onChange={(e) => setFollowUpForm({ ...followUpForm, evolution: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">Examen Clinique & Observations</label>
              <textarea
                rows={3}
                placeholder="Examen physique, auscultation, état de conscience, réactivité..."
                value={followUpForm.clinicalExam}
                onChange={(e) => setFollowUpForm({ ...followUpForm, clinicalExam: e.target.value })}
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium outline-none focus:border-indigo-500"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Traitements Administrés ou Ajustés</label>
                <input
                  type="text"
                  placeholder="Ex: Poursuite perfusion, antalgique palier 1..."
                  value={followUpForm.treatments}
                  onChange={(e) => setFollowUpForm({ ...followUpForm, treatments: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Examens Complémentaires Demandés</label>
                <input
                  type="text"
                  placeholder="Ex: NFS, CRP, Radiographie thorax..."
                  value={followUpForm.requestedExams}
                  onChange={(e) => setFollowUpForm({ ...followUpForm, requestedExams: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">Conduite à Tenir / Conclusion</label>
              <textarea
                rows={2}
                placeholder="Plan d'action thérapeutique et diagnostic retenu..."
                value={followUpForm.conclusion}
                onChange={(e) => setFollowUpForm({ ...followUpForm, conclusion: e.target.value })}
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium outline-none focus:border-indigo-500"
              />
            </div>

            {/* Note Vocale (Section 17 & 18) */}
            <div className="space-y-2">
              <VoiceNoteRecorder
                onSaveVoiceNote={(audioUrl, durationSec, transcript) => {
                  setAttachedVoiceNote({ audioUrl, durationSec, transcript });
                  if (transcript && !followUpForm.clinicalExam) {
                    setFollowUpForm(prev => ({ ...prev, clinicalExam: transcript }));
                  }
                }}
                disabled={isSaving}
              />
              {attachedVoiceNote && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-between text-xs text-emerald-800">
                  <span className="flex items-center gap-2">
                    <CheckCircle2 size={16} className="text-emerald-600" />
                    Note vocale jointe à la rédaction ({attachedVoiceNote.durationSec}s)
                  </span>
                  <button
                    type="button"
                    onClick={() => setAttachedVoiceNote(null)}
                    className="text-slate-400 hover:text-rose-600 cursor-pointer"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              )}
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={isSaving}
                className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-2xl text-xs font-bold transition-all shadow-md flex items-center gap-2 cursor-pointer"
              >
                <Check size={16} />
                {isSaving ? "Enregistrement..." : "Enregistrer la note médicale"}
              </button>
            </div>
          </form>

          {/* Historical Follow-ups List */}
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-4">
            <h3 className="text-sm font-black uppercase tracking-wider text-slate-800">
              Historique des Notes Médicales ({encounter.followUps?.length || 0})
            </h3>

            {encounter.followUps && encounter.followUps.length > 0 ? (
              <div className="space-y-4">
                {encounter.followUps.map((fu) => (
                  <div key={fu.id} className="p-5 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="font-black text-slate-900">{fu.author}</span>
                        <span className="text-[10px] font-bold text-slate-500 uppercase bg-slate-200 px-2 py-0.5 rounded-md">
                          {fu.authorRole || 'Médecin'}
                        </span>
                      </div>
                      <span className="text-slate-400 font-mono text-[11px]">
                        {fu.date} à {fu.time}
                      </span>
                    </div>

                    {fu.motif && (
                      <p className="text-xs font-bold text-indigo-900">Objet : {fu.motif}</p>
                    )}

                    {fu.clinicalExam && (
                      <div>
                        <span className="text-[10px] font-black uppercase text-slate-400">Examen Clinique :</span>
                        <p className="text-xs text-slate-800 mt-0.5">{fu.clinicalExam}</p>
                      </div>
                    )}

                    {fu.evolution && (
                      <div>
                        <span className="text-[10px] font-black uppercase text-slate-400">Évolution :</span>
                        <p className="text-xs text-slate-700 mt-0.5">{fu.evolution}</p>
                      </div>
                    )}

                    {fu.treatments && (
                      <div>
                        <span className="text-[10px] font-black uppercase text-slate-400">Traitements :</span>
                        <p className="text-xs text-slate-700 mt-0.5">{fu.treatments}</p>
                      </div>
                    )}

                    {fu.conclusion && (
                      <div className="p-3 bg-white rounded-xl border border-slate-200">
                        <span className="text-[10px] font-black uppercase text-slate-500">Conclusion :</span>
                        <p className="text-xs font-bold text-slate-900 mt-0.5">{fu.conclusion}</p>
                      </div>
                    )}

                    {/* Voice Note Audio Player (Section 18) */}
                    {fu.voiceNoteAudioUrl && (
                      <div className="pt-2">
                        <div className="flex items-center gap-2 text-xs font-bold text-rose-600 mb-1.5">
                          <Volume2 size={14} />
                          <span>Note vocale du praticien :</span>
                        </div>
                        <audio src={fu.voiceNoteAudioUrl} controls className="w-full h-9 rounded-xl" />
                        {fu.voiceNoteTranscript && (
                          <p className="text-[11px] text-slate-500 italic mt-1 bg-white p-2 rounded-lg border border-slate-100">
                            Transcription : « {fu.voiceNoteTranscript} »
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic py-4 text-center">
                Aucune note médicale rédigée pour ce passage.
              </p>
            )}
          </div>
        </div>
      )}

      {/* TAB 5: SORTIE DES URGENCES (Section 21, 22, 23, 24) */}
      {activeSubTab === 'sortie' && (
        <div className="space-y-8 animate-in fade-in duration-300">
          {/* Pre-Discharge Summary */}
          <div className="bg-slate-50 rounded-3xl p-6 border border-slate-200 space-y-4">
            <h3 className="text-sm font-black uppercase tracking-wider text-slate-800">
              Synthèse Pré-Sortie du Passage aux Urgences
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
              <div className="p-3 bg-white rounded-2xl border border-slate-200">
                <span className="text-[10px] font-bold text-slate-400 uppercase">Identité</span>
                <p className="font-black text-slate-900 mt-0.5">{encounter.lastName} {encounter.firstName}</p>
                <p className="text-[10px] text-slate-500 font-mono mt-0.5">Dossier: {encounter.patientDme || encounter.patientId}</p>
              </div>

              <div className="p-3 bg-white rounded-2xl border border-slate-200">
                <span className="text-[10px] font-bold text-slate-400 uppercase">Arrivée</span>
                <p className="font-black text-slate-900 mt-0.5">{encounter.arrivalTime}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">{encounter.arrivalDate}</p>
              </div>

              <div className="p-3 bg-white rounded-2xl border border-slate-200">
                <span className="text-[10px] font-bold text-slate-400 uppercase">Soins Réalisés</span>
                <p className="font-black text-slate-900 mt-0.5">{encounter.cares?.length || 0} soin(s)</p>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  {encounter.cares?.filter(c => c.status === 'Réalisé').length || 0} validé(s)
                </p>
              </div>

              <div className="p-3 bg-white rounded-2xl border border-slate-200">
                <span className="text-[10px] font-bold text-slate-400 uppercase">Dernière Constante</span>
                <p className="font-black text-slate-900 mt-0.5">
                  {latestVitals ? `${latestVitals.bpSys || '--'}/${latestVitals.bpDia || '--'} mmHg` : 'Non mesurée'}
                </p>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  {latestVitals ? `${latestVitals.heartRate || '--'} bpm • ${latestVitals.temp || '--'}°C` : ''}
                </p>
              </div>
            </div>
          </div>

          {/* Discharge Form */}
          <form onSubmit={handleAuthorizeDischarge} className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-6">
            <h3 className="text-sm font-black uppercase tracking-wider text-slate-800 flex items-center gap-2">
              <LogOut size={18} className="text-emerald-600" />
              Formulaire de Sortie & Orientation Médicale
            </h3>

            {/* Orientation Choice */}
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-2">
                Orientation Post-Urgences <span className="text-rose-600">*</span>
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                {[
                  { id: 'Retour à domicile', label: 'Domicile', icon: CheckCircle2, desc: 'Sortie standard' },
                  { id: 'Consultation', label: 'Consultation', icon: Calendar, desc: 'Suivi externe' },
                  { id: 'Hospitalisation', label: 'Hospitalisation', icon: Bed, desc: 'Admission service' },
                  { id: 'Transfert', label: 'Transfert', icon: ExternalLink, desc: 'Structure externe' },
                  { id: 'Autre', label: 'Autre', icon: Layers, desc: 'Spécifique' }
                ].map((opt) => {
                  const isSelected = dischargeForm.orientation === opt.id;
                  const Icon = opt.icon;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setDischargeForm({ ...dischargeForm, orientation: opt.id as any })}
                      className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                        isSelected
                          ? 'border-emerald-600 bg-emerald-50 text-emerald-900 shadow-sm ring-2 ring-emerald-500/20'
                          : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <Icon size={18} className={isSelected ? 'text-emerald-600' : 'text-slate-400'} />
                      <p className="font-black text-xs mt-2">{opt.label}</p>
                      <p className="text-[10px] text-slate-400 font-medium">{opt.desc}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Orientation Hospitalisation Alert Notice */}
            {dischargeForm.orientation === 'Hospitalisation' && (
              <div className="p-4 bg-purple-50 border border-purple-200 rounded-2xl text-xs text-purple-900 flex items-start gap-3">
                <Bed size={18} className="text-purple-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">Liaison avec le Module Hospitalisation :</span>
                  <p className="mt-0.5 text-purple-800">
                    La validation de cette sortie créera immédiatement une demande d'admission officielle dans le module <strong>Hospitalisation</strong> sans dupliquer le patient.
                  </p>
                </div>
              </div>
            )}

            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                Conclusion Médicale de Fin de Prise en Charge <span className="text-rose-600">*</span>
              </label>
              <textarea
                rows={3}
                placeholder="Diagnostic final de sortie, bilan de l'épisode d'urgence, motif de clôture..."
                value={dischargeForm.conclusion}
                onChange={(e) => setDischargeForm({ ...dischargeForm, conclusion: e.target.value })}
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium outline-none focus:border-emerald-500"
                required
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Consignes Données au Patient</label>
                <textarea
                  rows={2}
                  placeholder="Signes d'alerte, repos, surveillance particulière..."
                  value={dischargeForm.instructions}
                  onChange={(e) => setDischargeForm({ ...dischargeForm, instructions: e.target.value })}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Traitement de Sortie Éventuel</label>
                <textarea
                  rows={2}
                  placeholder="Ordonnance de sortie, posologie, durée..."
                  value={dischargeForm.treatment}
                  onChange={(e) => setDischargeForm({ ...dischargeForm, treatment: e.target.value })}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Rendez-vous Ultérieur de Contrôle</label>
                <input
                  type="text"
                  placeholder="Ex: Contrôle dans 48h en consultation de médecine..."
                  value={dischargeForm.appointment}
                  onChange={(e) => setDischargeForm({ ...dischargeForm, appointment: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Détails Destination / Transfert (Optionnel)</label>
                <input
                  type="text"
                  placeholder="Ex: Hôpital Central, Service Cardiologie..."
                  value={dischargeForm.destinationDetails}
                  onChange={(e) => setDischargeForm({ ...dischargeForm, destinationDetails: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <div className="flex justify-end pt-4 border-t border-slate-100">
              <button
                type="submit"
                disabled={isSaving}
                className="px-8 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-2xl text-xs font-black uppercase tracking-wider transition-all shadow-lg shadow-emerald-600/20 flex items-center gap-2 cursor-pointer"
              >
                <LogOut size={16} />
                {isSaving ? "Clôture en cours..." : "Autoriser la Sortie"}
              </button>
            </div>
          </form>
        </div>
      )}

      <UniversalHospitalisationModal
        isOpen={showHospitalisationModal}
        onClose={() => setShowHospitalisationModal(false)}
        patient={encounter ? {
          id: encounter.patientId || encounter.id,
          firstName: encounter.firstName,
          lastName: encounter.lastName,
          age: encounter.age,
          gender: encounter.gender,
          dossier: encounter.patientId,
          motif: encounter.motif
        } : null}
        sourceModule="Urgences"
        user={currentUser}
        defaultReason={encounter?.motif || 'Hospitalisation depuis Urgences'}
        onSuccess={async () => {
          await onUpdateStatus(encounter.id, 'Sortie');
          showNotification("Patient hospitalisé avec succès sur un lit libre.");
        }}
      />
    </div>
  );
};
