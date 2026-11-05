import React from 'react';
import { ShieldAlert, User, Phone, Calendar, MapPin, CheckCircle, ArrowRight, X, AlertTriangle } from 'lucide-react';
import { Patient } from '../types';

interface PatientDeduplicationModalProps {
  isOpen: boolean;
  onClose: () => void;
  candidatePatient: Partial<Patient>;
  matchedPatient: Patient | null;
  reason: string;
  onSelectExisting: (patient: Patient) => void;
  theme?: 'light' | 'dark';
}

export const PatientDeduplicationModal: React.FC<PatientDeduplicationModalProps> = ({
  isOpen,
  onClose,
  candidatePatient,
  matchedPatient,
  reason,
  onSelectExisting,
  theme = 'light'
}) => {
  if (!isOpen || !matchedPatient) return null;

  const calculateAge = (birthDate?: string) => {
    if (!birthDate) return 'N/A';
    const b = new Date(birthDate);
    if (isNaN(b.getTime())) return 'N/A';
    const ageDifMs = Date.now() - b.getTime();
    const ageDate = new Date(ageDifMs);
    return Math.abs(ageDate.getUTCFullYear() - 1970);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-[32px] shadow-2xl border border-amber-200 w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Header Alert Banner */}
        <div className="bg-amber-500 p-6 text-white flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-white/20 rounded-2xl">
              <ShieldAlert size={28} className="text-white" />
            </div>
            <div>
              <span className="text-[10px] font-black uppercase tracking-[0.2em] bg-white/20 px-2.5 py-0.5 rounded-full">
                Contrôle d'Identité • Anti-Doublon
              </span>
              <h2 className="text-xl font-extrabold mt-1">Dossier Patient Déjà Existant Détecté</h2>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-white/20 rounded-xl transition-colors text-white"
            title="Fermer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Reason Explanation */}
        <div className="p-6 bg-amber-50/80 border-b border-amber-150 flex items-center gap-3">
          <AlertTriangle size={20} className="text-amber-600 shrink-0" />
          <p className="text-xs font-bold text-amber-900 leading-relaxed">
            {reason}
          </p>
        </div>

        {/* Comparison Section */}
        <div className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* New Entry (Candidate) */}
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Saisie en cours</span>
                <span className="text-[9px] font-bold text-slate-500 bg-slate-200/60 px-2 py-0.5 rounded-full">Nouveau</span>
              </div>
              <h4 className="font-extrabold text-slate-900 text-base">
                {candidatePatient.lastName || '—'} {candidatePatient.firstName || '—'}
              </h4>
              <div className="mt-3 space-y-1.5 text-xs text-slate-600 font-medium">
                <p className="flex items-center gap-2">
                  <Calendar size={13} className="text-slate-400" />
                  Né(e) le : <strong className="text-slate-800">{candidatePatient.birthDate || 'Non spécifié'}</strong>
                </p>
                <p className="flex items-center gap-2">
                  <Phone size={13} className="text-slate-400" />
                  Tél : <strong className="text-slate-800">{candidatePatient.phone || 'Non spécifié'}</strong>
                </p>
                <p className="flex items-center gap-2">
                  <MapPin size={13} className="text-slate-400" />
                  Adresse : <strong className="text-slate-800">{candidatePatient.residence || 'Non spécifié'}</strong>
                </p>
              </div>
            </div>

            {/* Existing Match */}
            <div className="p-4 bg-emerald-50/80 rounded-2xl border-2 border-emerald-400 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[9px] font-black text-emerald-600 uppercase tracking-widest">Dossier Base DME</span>
                <span className="text-[9px] font-black text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <CheckCircle size={10} /> Correspondance
                </span>
              </div>
              <h4 className="font-extrabold text-emerald-950 text-base">
                {matchedPatient.lastName} {matchedPatient.firstName}
              </h4>
              <div className="mt-3 space-y-1.5 text-xs text-emerald-900 font-medium">
                <p className="flex items-center gap-2">
                  <User size={13} className="text-emerald-600" />
                  Identifiant : <strong className="font-mono text-emerald-800 font-black">{matchedPatient.id || matchedPatient.patientId}</strong>
                </p>
                <p className="flex items-center gap-2">
                  <Calendar size={13} className="text-emerald-600" />
                  Né(e) le : <strong className="text-emerald-950">{matchedPatient.birthDate || 'N/A'}</strong> ({calculateAge(matchedPatient.birthDate)} ans)
                </p>
                <p className="flex items-center gap-2">
                  <Phone size={13} className="text-emerald-600" />
                  Tél : <strong className="text-emerald-950">{matchedPatient.phone || 'N/A'}</strong>
                </p>
                <p className="flex items-center gap-2">
                  <MapPin size={13} className="text-emerald-600" />
                  Adresse : <strong className="text-emerald-950">{matchedPatient.residence || 'N/A'}</strong>
                </p>
              </div>
            </div>

          </div>

          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/60 text-xs text-slate-500">
            <p className="font-semibold text-slate-700 mb-1">💡 Règle d'intégrité hospitalière :</p>
            <p>La création de doublons altère l'historique médical et le suivi du patient. Utilisez le dossier existant pour rattacher les nouveaux soins et tickets.</p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="p-6 bg-slate-50 border-t border-slate-150 flex flex-col sm:flex-row items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-5 py-3 rounded-2xl bg-white border border-slate-200 text-slate-700 font-bold text-xs uppercase tracking-wider hover:bg-slate-100 transition-all"
          >
            Modifier la Saisie
          </button>
          <button
            type="button"
            onClick={() => {
              onSelectExisting(matchedPatient);
              onClose();
            }}
            className="w-full sm:w-auto px-6 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs uppercase tracking-wider transition-all shadow-lg flex items-center justify-center gap-2"
          >
            <CheckCircle size={16} />
            Utiliser ce Profil Existant
          </button>
        </div>

      </div>
    </div>
  );
};

export default PatientDeduplicationModal;
