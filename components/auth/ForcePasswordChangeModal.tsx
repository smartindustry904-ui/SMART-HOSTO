import React, { useState } from 'react';
import { 
  ShieldAlert, 
  Lock, 
  KeyRound, 
  CheckCircle2, 
  XCircle, 
  Eye, 
  EyeOff, 
  ArrowRight, 
  LogOut, 
  Building2, 
  UserCheck, 
  AlertCircle,
  Loader2,
  Sparkles
} from 'lucide-react';
import { User } from '../../types';
import { db, sanitizeData } from '../../src/firebase';
import { doc, updateDoc, getDoc, collection, query, where, getDocs, addDoc } from 'firebase/firestore';

interface ForcePasswordChangeModalProps {
  user: User;
  onPasswordChanged: (updatedUser: User) => void;
  onLogout: () => void;
  theme?: 'light' | 'dark';
}

export const ForcePasswordChangeModal: React.FC<ForcePasswordChangeModalProps> = ({
  user,
  onPasswordChanged,
  onLogout,
  theme = 'light'
}) => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Criteria validation
  const hasMinLength = newPassword.length >= 8;
  const hasUpper = /[A-Z]/.test(newPassword);
  const hasLower = /[a-z]/.test(newPassword);
  const hasDigitOrSpecial = /[\d!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(newPassword);
  const isDifferentFromCurrent = newPassword.trim().length > 0 && newPassword !== currentPassword && newPassword !== user.password;
  const passwordsMatch = newPassword.length > 0 && newPassword === confirmPassword;

  const isFormValid = 
    currentPassword.trim().length > 0 &&
    hasMinLength &&
    hasUpper &&
    hasLower &&
    hasDigitOrSpecial &&
    isDifferentFromCurrent &&
    passwordsMatch;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // 1. Verify current temporary password
    if (user.password && currentPassword !== user.password) {
      setError("Le mot de passe temporaire actuel saisi est incorrect.");
      return;
    }

    // 2. Validate rules
    if (!hasMinLength) {
      setError("Le nouveau mot de passe doit comporter au moins 8 caractères.");
      return;
    }
    if (!hasUpper || !hasLower) {
      setError("Le mot de passe doit contenir des majuscules et des minuscules.");
      return;
    }
    if (!hasDigitOrSpecial) {
      setError("Le mot de passe doit contenir au moins un chiffre ou un caractère spécial.");
      return;
    }
    if (newPassword === currentPassword || newPassword === user.password) {
      setError("Le nouveau mot de passe doit être différent du mot de passe temporaire initial.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("La confirmation ne correspond pas au nouveau mot de passe.");
      return;
    }

    setIsSubmitting(true);
    try {
      const nowIso = new Date().toISOString();
      const updatedUserFields = {
        password: newPassword,
        forcePasswordChange: false,
        passwordChangedAt: nowIso,
        updatedAt: nowIso
      };

      // Find user doc in hospital_users
      let userDocRef = doc(db, 'hospital_users', user.id);
      const userSnap = await getDoc(userDocRef);

      if (userSnap.exists()) {
        await updateDoc(userDocRef, sanitizeData(updatedUserFields));
      } else {
        // Query by username if ID didn't match document key directly
        const q = query(collection(db, 'hospital_users'), where('username', '==', user.username));
        const qSnap = await getDocs(q);
        if (!qSnap.empty) {
          const docId = qSnap.docs[0].id;
          await updateDoc(doc(db, 'hospital_users', docId), sanitizeData(updatedUserFields));
        } else {
          // If still not found, set doc directly
          await updateDoc(userDocRef, sanitizeData(updatedUserFields));
        }
      }

      // Add audit log
      try {
        await addDoc(collection(db, 'saas_logs'), sanitizeData({
          timestamp: nowIso,
          user: user.username,
          action: 'FORCE_PASSWORD_CHANGE_SUCCESS',
          details: `L'administrateur ${user.name} (@${user.username}) a personnalisé son mot de passe initial temporaire avec succès.`,
          category: 'SECURITY',
          clinicId: (user as any).clinicId || ''
        }));
      } catch (logErr) {
        console.warn("Could not write security audit log:", logErr);
      }

      // Updated user object in state and local storage
      const finalUser: User = {
        ...user,
        password: newPassword,
        forcePasswordChange: false,
        passwordChangedAt: nowIso
      };

      localStorage.setItem('hospital_session', JSON.stringify(finalUser));

      // Trigger app notification
      window.dispatchEvent(new CustomEvent('app-notification', {
        detail: {
          message: "Mot de passe personnalisé avec succès ! Bienvenue sur SmartHosto.",
          type: 'success'
        }
      }));

      // Call callback to unblock dashboard
      onPasswordChanged(finalUser);
    } catch (err: any) {
      console.error("Error updating forced password:", err);
      setError("Une erreur est survenue lors de l'enregistrement de votre mot de passe. Veuillez réessayer.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const isDark = theme === 'dark';

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto ${
      isDark ? 'bg-slate-950 text-slate-100' : 'bg-slate-900/90 backdrop-blur-md text-slate-800'
    }`}>
      {/* Background glow effects */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/3 w-96 h-96 bg-amber-500/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-1/4 right-1/3 w-96 h-96 bg-rose-500/10 rounded-full blur-[140px]" />
      </div>

      <div className="relative w-full max-w-lg my-8 bg-slate-900 border border-white/10 rounded-3xl shadow-2xl overflow-hidden p-6 sm:p-8 animate-in fade-in zoom-in-95 duration-300">
        
        {/* TOP BADGE & ICON */}
        <div className="text-center space-y-3 mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-tr from-amber-500/20 via-rose-500/20 to-indigo-500/20 border border-amber-500/30 text-amber-400 shadow-xl shadow-amber-950/40">
            <ShieldAlert size={32} />
          </div>

          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-500/10 border border-amber-500/30 text-amber-400 mb-2">
              <Sparkles size={12} />
              Premier Accès — Sécurité Obligatoire
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
              Changement Obligatoire du Mot de Passe
            </h1>
            <p className="text-xs text-slate-400 mt-1.5 max-w-sm mx-auto leading-relaxed">
              Le mot de passe généré par le Super Administrateur est strictly temporaire. 
              Pour protéger l'établissement et ses données médicales, vous devez définir votre propre mot de passe personnel avant d'accéder au tableau de bord.
            </p>
          </div>
        </div>

        {/* RECAP CARD: HOSPITAL & USER */}
        <div className="bg-slate-950/70 border border-white/10 rounded-2xl p-4 mb-6 space-y-2">
          <div className="flex items-center justify-between text-xs pb-2 border-b border-white/5">
            <span className="text-slate-500 flex items-center gap-1.5 font-bold">
              <Building2 size={13} className="text-rose-400" />
              Établissement
            </span>
            <span className="font-bold text-white">
              {(user as any).structureName || 'Centre Hospitalier'}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-500 flex items-center gap-1.5 font-bold">
              <UserCheck size={13} className="text-emerald-400" />
              Titulaire du compte
            </span>
            <span className="font-bold text-slate-200">
              {user.name} <span className="text-slate-500 font-mono text-[11px]">(@{user.username})</span>
            </span>
          </div>
        </div>

        {/* ERROR DISPLAY */}
        {error && (
          <div className="mb-5 p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-2xl flex items-start gap-3 text-rose-300 text-xs animate-in fade-in">
            <AlertCircle size={16} className="shrink-0 mt-0.5 text-rose-400" />
            <p className="font-medium leading-relaxed">{error}</p>
          </div>
        )}

        {/* FORM */}
        <form onSubmit={handleSubmit} className="space-y-4">
          
          {/* Champ 1: Mot de passe temporaire actuel */}
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1.5">
              Mot de passe temporaire actuel <span className="text-rose-400">*</span>
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                <KeyRound size={16} />
              </div>
              <input 
                type={showCurrent ? "text" : "password"}
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Entrez le mot de passe reçu du Super Admin"
                className="w-full pl-9 pr-10 py-2.5 bg-slate-950 border border-white/10 rounded-xl text-xs font-mono text-white placeholder-slate-600 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all"
              />
              <button
                type="button"
                onClick={() => setShowCurrent(!showCurrent)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-500 hover:text-white transition-colors"
              >
                {showCurrent ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          {/* Champ 2: Nouveau mot de passe */}
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1.5">
              Nouveau mot de passe personnel <span className="text-emerald-400">*</span>
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                <Lock size={16} />
              </div>
              <input 
                type={showNew ? "text" : "password"}
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Définissez votre nouveau mot de passe"
                className="w-full pl-9 pr-10 py-2.5 bg-slate-950 border border-white/10 rounded-xl text-xs font-mono text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
              />
              <button
                type="button"
                onClick={() => setShowNew(!showNew)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-500 hover:text-white transition-colors"
              >
                {showNew ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          {/* Champ 3: Confirmation du mot de passe */}
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1.5">
              Confirmez le nouveau mot de passe <span className="text-emerald-400">*</span>
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                <Lock size={16} />
              </div>
              <input 
                type={showConfirm ? "text" : "password"}
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Retapez le nouveau mot de passe"
                className="w-full pl-9 pr-10 py-2.5 bg-slate-950 border border-white/10 rounded-xl text-xs font-mono text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
              />
              <button
                type="button"
                onClick={() => setShowConfirm(!showConfirm)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-500 hover:text-white transition-colors"
              >
                {showConfirm ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          {/* CHECKLIST DES CRITÈRES DE SÉCURITÉ */}
          <div className="p-3.5 bg-slate-950/60 border border-white/5 rounded-2xl space-y-1.5 text-[11px]">
            <p className="font-bold text-slate-400 mb-1">Exigences de sécurité :</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              <div className={`flex items-center gap-1.5 ${hasMinLength ? 'text-emerald-400' : 'text-slate-500'}`}>
                {hasMinLength ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
                <span>8 caractères minimum</span>
              </div>
              <div className={`flex items-center gap-1.5 ${hasUpper && hasLower ? 'text-emerald-400' : 'text-slate-500'}`}>
                {hasUpper && hasLower ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
                <span>Majuscule & minuscule</span>
              </div>
              <div className={`flex items-center gap-1.5 ${hasDigitOrSpecial ? 'text-emerald-400' : 'text-slate-500'}`}>
                {hasDigitOrSpecial ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
                <span>Chiffre ou symbole (@, #, !)</span>
              </div>
              <div className={`flex items-center gap-1.5 ${isDifferentFromCurrent ? 'text-emerald-400' : 'text-slate-500'}`}>
                {isDifferentFromCurrent ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
                <span>Différent du mot temporaire</span>
              </div>
              <div className={`flex items-center gap-1.5 sm:col-span-2 ${passwordsMatch ? 'text-emerald-400' : 'text-slate-500'}`}>
                {passwordsMatch ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
                <span>Mots de passe identiques</span>
              </div>
            </div>
          </div>

          {/* SUBMISSION & CANCEL BUTTONS */}
          <div className="pt-2 space-y-2">
            <button
              type="submit"
              disabled={isSubmitting || !isFormValid}
              className={`w-full py-3.5 px-4 rounded-2xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-lg ${
                isFormValid && !isSubmitting
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-emerald-950/40 cursor-pointer active:scale-[0.99]'
                  : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-white/5'
              }`}
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Sécurisation du compte en cours...
                </>
              ) : (
                <>
                  <ShieldAlert size={16} />
                  Valider et débloquer mon espace
                  <ArrowRight size={16} />
                </>
              )}
            </button>

            {/* Logout escape hatch: allows user to exit safely without accessing app */}
            <button
              type="button"
              onClick={onLogout}
              disabled={isSubmitting}
              className="w-full py-2.5 px-4 rounded-xl text-slate-400 hover:text-white hover:bg-white/5 text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <LogOut size={14} />
              Quitter la session et revenir à la page de connexion
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};

export default ForcePasswordChangeModal;
