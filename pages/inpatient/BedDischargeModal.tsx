import React, { useState } from 'react';
import { 
  X, AlertTriangle, LogOut, CheckCircle2, 
  Calendar, Clock, User, BedDouble, Building2
} from 'lucide-react';
import { db, sanitizeData } from '../../src/firebase';
import { 
  doc, updateDoc, writeBatch, query, 
  collection, where, getDocs, setDoc 
} from 'firebase/firestore';
import { Bed, Room, User as UserType } from '../../types';

interface BedDischargeModalProps {
  isOpen: boolean;
  onClose: () => void;
  bed: Bed | null;
  room?: Room | null;
  currentUser?: UserType;
  onSuccess?: () => void;
}

export const BedDischargeModal: React.FC<BedDischargeModalProps> = ({
  isOpen,
  onClose,
  bed,
  room,
  currentUser,
  onSuccess
}) => {
  const [dischargeReason, setDischargeReason] = useState<'Retour à domicile' | 'Transfert externe' | 'Sortie contre avis médical' | 'Décès' | 'Autre'>('Retour à domicile');
  const [dischargeNotes, setDischargeNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen || !bed) return null;

  // Calculate stay duration
  const getStayDuration = () => {
    if (!bed.admissionDate) return "Non précisé";
    const admDateTimeStr = `${bed.admissionDate}T${bed.admissionTime || '00:00'}:00`;
    const admTime = new Date(admDateTimeStr).getTime();
    const nowTime = new Date().getTime();
    if (isNaN(admTime)) return "Moins d'un jour";
    const diffMs = Math.max(0, nowTime - admTime);
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const days = Math.floor(diffHours / 24);
    const hours = diffHours % 24;

    if (days === 0 && hours === 0) return "Moins d'une heure";
    if (days === 0) return `${hours} heure${hours > 1 ? 's' : ''}`;
    return `${days} jour${days > 1 ? 's' : ''}${hours > 0 ? `, ${hours} heure${hours > 1 ? 's' : ''}` : ''}`;
  };

  const handleConfirmDischarge = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const batch = writeBatch(db);
      const now = new Date();
      const dischargeDate = now.toISOString().split('T')[0];
      const dischargeTime = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
      const duration = getStayDuration();

      // 1. Update Inpatient Record
      if (bed.patientId) {
        const inpQuery = query(
          collection(db, 'inpatient_records'),
          where('patientId', '==', bed.patientId),
          where('status', '==', 'admitted')
        );
        const inpSnap = await getDocs(inpQuery);
        if (!inpSnap.empty) {
          const inpDoc = inpSnap.docs[0];
          batch.update(doc(db, 'inpatient_records', inpDoc.id), sanitizeData({
            status: 'discharged',
            dischargeDate,
            dischargeTime,
            dischargedBy: currentUser?.name || 'Personnel Hospitalisation',
            dischargedById: currentUser?.id || '',
            dischargeReason,
            dischargeNotes: dischargeNotes.trim() || undefined,
            duration,
            lastUpdated: now.toISOString()
          }));
        }

        // 2. Update patient document in patients
        const patientRef = doc(db, 'patients', bed.patientId);
        batch.update(patientRef, sanitizeData({
          hospitalizationStatus: 'sorti',
          status: 'sorti',
          admittedBedId: null,
          admittedBedName: null,
          dischargeDate,
          lastUpdated: now.toISOString()
        }));

        // 3. Register in discharges_waiting for Reception & Cashier clearance
        const dwRef = doc(db, 'discharges_waiting', bed.patientId);
        batch.set(dwRef, sanitizeData({
          id: bed.patientId,
          name: bed.patientName,
          admissionDate: bed.admissionDate || dischargeDate,
          dischargeDate,
          department: 'Hospitalisation',
          bedName: bed.name,
          medicalClearance: true,
          hospitalizationClosed: true,
          financialClearance: false,
          dischargedBy: currentUser?.name || 'Personnel Hospitalisation',
          dischargeReason,
          createdAt: now.toISOString()
        }));
      }

      // 4. Liberate the Bed
      const bedRef = doc(db, 'beds', bed.id);
      batch.update(bedRef, {
        status: 'AVAILABLE',
        patientId: null,
        patientName: null,
        patientAge: null,
        patientGender: null,
        patientDossier: null,
        admissionDate: null,
        admissionTime: null,
        admissionDoctor: null,
        admissionDoctorId: null,
        admissionReason: null,
        admissionOrigin: null,
        priority: null,
        lastUpdated: now.toISOString()
      });

      await batch.commit();

      window.dispatchEvent(new CustomEvent('app-notification', {
        detail: {
          message: `Lit ${bed.name} libéré avec succès. Sortie enregistrée pour ${bed.patientName}.`,
          type: 'success'
        }
      }));

      if (onSuccess) onSuccess();
      onClose();
    } catch (err: any) {
      console.error("Discharge error:", err);
      setErrorMsg(err.message || "Erreur lors de la libération du lit.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-xl rounded-[32px] shadow-2xl border border-slate-200 overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="p-6 sm:p-8 border-b border-slate-100 flex items-center justify-between bg-rose-50/50">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-rose-600 text-white rounded-2xl flex items-center justify-center shadow-md shadow-rose-500/20">
              <LogOut size={24} />
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-900 tracking-tight">Libérer le Lit / Sortie</h2>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-0.5">
                Confirmation de sortie du patient & remise à disposition
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-2xl transition-colors cursor-pointer"
          >
            <X size={22} />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleConfirmDischarge} className="p-6 sm:p-8 space-y-6">
          {errorMsg && (
            <div className="p-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-2xl flex items-center gap-3 text-sm font-bold animate-in fade-in">
              <AlertTriangle size={20} className="shrink-0 text-rose-500" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Patient and Bed Summary */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200/80 pb-3">
              <div>
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Patient</span>
                <h3 className="font-black text-slate-900 text-base">{bed.patientName || 'Patient'}</h3>
                <p className="text-xs text-slate-500 font-bold font-mono">
                  Dossier: {bed.patientDossier || bed.patientId} • {bed.patientAge ? `${bed.patientAge} ans` : ''}
                </p>
              </div>
              <div className="text-right">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Lit & Chambre</span>
                <span className="inline-block bg-blue-100 text-blue-800 text-xs font-black px-3 py-1 rounded-xl">
                  {bed.name} • {room?.name || 'Chambre'}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Date d'admission</span>
                <span className="font-bold text-slate-700 flex items-center gap-1.5 mt-0.5">
                  <Calendar size={13} className="text-slate-400" />
                  {bed.admissionDate || 'Non spécifiée'} {bed.admissionTime ? `à ${bed.admissionTime}` : ''}
                </span>
              </div>
              <div>
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Durée d'hospitalisation</span>
                <span className="font-bold text-blue-600 flex items-center gap-1.5 mt-0.5">
                  <Clock size={13} className="text-blue-500" />
                  {getStayDuration()}
                </span>
              </div>
            </div>
          </div>

          {/* Reason for discharge */}
          <div className="space-y-2">
            <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest block">
              Orientation / Motif de sortie
            </label>
            <select
              value={dischargeReason}
              onChange={(e) => setDischargeReason(e.target.value as any)}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-bold text-slate-900 text-sm"
            >
              <option value="Retour à domicile">Retour à domicile (Fin de soins)</option>
              <option value="Transfert externe">Transfert vers un autre établissement</option>
              <option value="Sortie contre avis médical">Sortie contre avis médical</option>
              <option value="Décès">Décès</option>
              <option value="Autre">Autre</option>
            </select>
          </div>

          {/* Clinical summary notes */}
          <div className="space-y-2">
            <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest block">
              Observations de sortie (optionnel)
            </label>
            <textarea
              rows={2}
              value={dischargeNotes}
              onChange={(e) => setDischargeNotes(e.target.value)}
              placeholder="Consignes de sortie, traitement post-hospitalisation, rendez-vous de contrôle..."
              className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-bold text-slate-900 text-sm resize-none"
            />
          </div>

          {/* Action buttons */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-6 py-3 rounded-2xl border border-slate-200 text-slate-600 font-bold text-xs uppercase tracking-wider hover:bg-slate-50 transition-colors cursor-pointer"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-8 py-3.5 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-black text-xs uppercase tracking-widest rounded-2xl transition-all shadow-md shadow-rose-500/20 flex items-center gap-2 cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  <span>Libération en cours...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 size={16} />
                  <span>Confirmer la Libération</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
