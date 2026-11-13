import React, { useState } from 'react';
import { UserCheck, AlertTriangle, X, Phone, CreditCard, User, Loader2, ShieldCheck } from 'lucide-react';
import { db, sanitizeData } from '../../src/firebase';
import { doc, setDoc, updateDoc } from 'firebase/firestore';
import { stampTenantData } from '../../src/utils/tenant';
import { Patient } from '../../types';

interface LambdaConversionModalProps {
  isOpen: boolean;
  onClose: () => void;
  patient?: Patient | null;
  patientId?: string;
  patientName?: string;
  user?: any;
  establishment?: any;
  onConverted: (updatedPatient: Patient) => void;
}

export const LambdaConversionModal: React.FC<LambdaConversionModalProps> = ({
  isOpen,
  onClose,
  patient,
  patientId,
  patientName,
  user,
  establishment,
  onConverted
}) => {
  const [step, setStep] = useState<'CONFIRM' | 'FORM'>('CONFIRM');
  const [lastName, setLastName] = useState(
    patient?.lastName && patient.lastName.toUpperCase() !== 'LAMBDA' ? patient.lastName : ''
  );
  const [firstName, setFirstName] = useState(
    patient?.firstName && patient.firstName.toUpperCase() !== 'ANONYME' ? patient.firstName : ''
  );
  const [phone, setPhone] = useState(patient?.phone || '');
  const [idNumber, setIdNumber] = useState((patient as any)?.idNumber || (patient as any)?.cni || '');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  if (!isOpen) return null;

  const handleConfirmConversion = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!lastName.trim() || !firstName.trim()) {
      setError('Le nom et le prénom complets sont obligatoires.');
      return;
    }
    if (!phone.trim() || phone.trim().length < 6) {
      setError('Un numéro de téléphone valide est obligatoire.');
      return;
    }
    if (!idNumber.trim() || idNumber.trim().length < 4) {
      setError('Un numéro de pièce d\'identité (CNI / Passeport) valide est obligatoire.');
      return;
    }

    setIsSaving(true);
    try {
      const resolvedId = (patient?.id && !patient.id.startsWith('PATIENT-COMPTANT'))
        ? patient.id
        : (patientId && !patientId.startsWith('PATIENT-COMPTANT'))
          ? patientId
          : `PAT-${Date.now()}`;

      const cleanLast = lastName.trim().toUpperCase();
      const cleanFirst = firstName.trim();
      const fullName = `${cleanFirst} ${cleanLast}`;

      const updatedFields: any = {
        id: resolvedId,
        dmeId: patient?.dmeId || resolvedId,
        lastName: cleanLast,
        firstName: cleanFirst,
        name: fullName,
        phone: phone.trim(),
        idNumber: idNumber.trim(),
        cni: idNumber.trim(),
        isLambda: false,
        isAnonymous: false,
        patientStatus: 'REGISTERED',
        convertedFromLambdaAt: new Date().toISOString(),
        convertedBy: user?.name || user?.username || 'Caisse',
        updatedAt: new Date().toISOString()
      };

      const targetRef = doc(db, 'patients', resolvedId);
      const stamped = sanitizeData(stampTenantData(updatedFields, user, establishment));

      if (patient?.id && !patient.id.startsWith('PATIENT-COMPTANT')) {
        await setDoc(targetRef, stamped, { merge: true });
      } else {
        stamped.createdAt = new Date().toISOString();
        stamped.age = patient?.age || 30;
        stamped.gender = patient?.gender || 'M';
        await setDoc(targetRef, stamped, { merge: true });
      }

      // Also update appointment or waiting records if same ID exists
      try {
        await updateDoc(doc(db, 'patient_records', resolvedId), sanitizeData({
          lastName: cleanLast,
          firstName: cleanFirst,
          phone: phone.trim(),
          idNumber: idNumber.trim(),
          isLambda: false,
          isAnonymous: false
        })).catch(() => {});
      } catch {}

      const resultPatient: Patient = {
        ...(patient || {
          id: resolvedId,
          age: 30,
          gender: 'M',
          status: 'REGISTERED',
          admissionDate: new Date().toISOString()
        }),
        ...updatedFields
      } as Patient;

      onConverted(resultPatient);
      onClose();
    } catch (err) {
      console.error('Error converting Lambda patient:', err);
      setError('Erreur lors de la conversion du patient. Veuillez réessayer.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-sm z-[130] flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-5 bg-amber-50 border-b border-amber-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-md shadow-amber-500/20">
              <AlertTriangle size={20} />
            </div>
            <div>
              <h3 className="text-sm font-black text-amber-950 uppercase tracking-wider">
                Sécurité Financière — Patient Lambda
              </h3>
              <p className="text-[11px] font-bold text-amber-700">
                {patientName || (patient ? `${patient.firstName} ${patient.lastName}` : 'Client Anonyme')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-amber-700 hover:bg-amber-100 rounded-xl transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {step === 'CONFIRM' ? (
          <div className="p-6 space-y-5">
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-xs font-bold text-rose-900 leading-relaxed">
              Les patients Lambda ne peuvent pas avoir de dette. Voulez-vous convertir ce patient en Patient Enregistré ?
            </div>
            <p className="text-xs text-slate-600 font-medium leading-relaxed">
              Pour autoriser un crédit, une avance ou un paiement partiel, un dossier nominatif avec un numéro de téléphone et une pièce d'identité vérifiés est obligatoire.
            </p>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-3 px-4 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs hover:bg-slate-50 transition-colors"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => setStep('FORM')}
                className="flex-1 py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-xs uppercase tracking-wider shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2 transition-colors"
              >
                <UserCheck size={16} /> Convertir en Enregistré
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleConfirmConversion} className="p-6 space-y-4">
            <p className="text-xs font-bold text-slate-600">
              Veuillez saisir les informations d'identification officielles du patient :
            </p>

            {error && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs font-bold text-rose-700">
                {error}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">
                  Nom <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    required
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="NOM"
                    className="w-full pl-8 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 uppercase focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">
                  Prénom <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="Prénom"
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">
                Téléphone <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Ex: 677 00 00 00"
                  className="w-full pl-8 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">
                Numéro Pièce d'Identité (CNI / Passeport) <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <CreditCard size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  required
                  value={idNumber}
                  onChange={(e) => setIdNumber(e.target.value)}
                  placeholder="Ex: 1122334455"
                  className="w-full pl-8 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setStep('CONFIRM')}
                className="py-3 px-4 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs hover:bg-slate-50 transition-colors"
              >
                Retour
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="flex-1 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-black text-xs uppercase tracking-wider shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2 transition-colors"
              >
                {isSaving ? (
                  <><Loader2 size={15} className="animate-spin" /> Enregistrement...</>
                ) : (
                  <><ShieldCheck size={16} /> Valider & Débloquer Dette</>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
