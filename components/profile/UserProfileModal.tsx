import React, { useState, useEffect, useMemo } from 'react';
import { 
  User as UserIcon, 
  Key, 
  TrendingUp, 
  Stethoscope, 
  Activity, 
  CheckCircle2, 
  Clock, 
  Calendar, 
  Filter, 
  X, 
  Loader2, 
  Lock, 
  Mail, 
  Phone, 
  Briefcase, 
  Shield, 
  RefreshCw,
  AlertCircle,
  FileText,
  DollarSign,
  MessageSquare
} from 'lucide-react';
import { User } from '../../types';
import { ImageUpload } from '../common/ImageUpload';
import { Avatar } from '../common/Avatar';
import WhatsAppAgentSettings from '../../pages/settings/WhatsAppAgentSettings';
import { sanitizeData, db } from '../../src/firebase';
import { doc, updateDoc, collection, getDocs, getDocsFromCache } from 'firebase/firestore';

interface UserProfileModalProps {
  user: User;
  isOpen: boolean;
  onClose: () => void;
  onUserUpdated?: (updatedUser: User) => void;
  theme?: 'light' | 'dark';
}

export const UserProfileModal: React.FC<UserProfileModalProps> = ({
  user,
  isOpen,
  onClose,
  onUserUpdated,
  theme = 'light'
}) => {
  const [activeTab, setActiveTab] = useState<'INFO' | 'FINANCE' | 'WHATSAPP'>('INFO');
  
  // Basic info form state
  const [name, setName] = useState(user.name || '');
  const [email, setEmail] = useState(user.email || '');
  const [phone, setPhone] = useState(user.phone || '');
  const [profession, setProfession] = useState(user.profession || '');
  const [profilePhoto, setProfilePhoto] = useState<string | null>(user.profile_image_url || user.profileImage || null);
  const [isSavingInfo, setIsSavingInfo] = useState(false);
  const [infoMessage, setInfoMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Password reset form state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Universal Filters for "Mes Activités & Finances"
  const [startDate, setStartDate] = useState<string>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState<string>(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<string>('ALL');

  // Performance data state
  const [isLoadingPerformance, setIsLoadingPerformance] = useState(false);
  const [performanceData, setPerformanceData] = useState<{
    kpis: {
      totalConsultations: number;
      totalActs: number;
      totalCommissionsEarned: number;
      totalCommissionsPaid: number;
    };
    acts: Array<any>;
  }>({
    kpis: {
      totalConsultations: 0,
      totalActs: 0,
      totalCommissionsEarned: 0,
      totalCommissionsPaid: 0
    },
    acts: []
  });

  // Sync user changes when modal opens
  useEffect(() => {
    if (isOpen) {
      setName(user.name || '');
      setEmail(user.email || '');
      setPhone(user.phone || '');
      setProfession(user.profession || '');
      setProfilePhoto(user.profile_image_url || user.profileImage || null);
      setInfoMessage(null);
      setPasswordMessage(null);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    }
  }, [isOpen, user]);

  // Helper to read collection cache-first (0ms delay if cached in IndexedDB)
  const getCollectionCacheFirst = async (colName: string) => {
    const colRef = collection(db, colName);
    try {
      const cached = await getDocsFromCache(colRef);
      if (!cached.empty) {
        // Trigger background refresh without blocking
        getDocs(colRef).catch(() => {});
        return cached;
      }
    } catch {}
    return await getDocs(colRef);
  };

  // Fetch performance and financials (Offline-First directly from client Firestore cache + DB, ONLY clotured/completed acts)
  const fetchPerformance = async () => {
    if (!user?.id) return;
    setIsLoadingPerformance(true);
    try {
      const targetStaffId = String(user.id).trim();
      const staffNameLower = String(user.name || '').toLowerCase().trim();
      const staffEmailLower = String(user.email || '').toLowerCase().trim();
      const staffRole = String(user.role || user.profession || '').toUpperCase();

      let defaultRate = Number((user as any).quotePartRate) || 0;
      if (!defaultRate) {
        if (staffRole.includes('MEDECIN') || staffRole.includes('DOCTOR') || staffRole.includes('CHIRURGIEN')) {
          defaultRate = 20;
        } else if (staffRole.includes('MATERNITE') || staffRole.includes('SAGE_FEMME') || staffRole.includes('MIDWIFE')) {
          defaultRate = 15;
        } else if (staffRole.includes('INFIRMIER') || staffRole.includes('NURSE') || staffRole.includes('SOIN')) {
          defaultRate = 10;
        } else if (staffRole.includes('LAB') || staffRole.includes('BIOLOGISTE') || staffRole.includes('TECHNICIEN')) {
          defaultRate = 10;
        } else {
          defaultRate = 5;
        }
      }

      const acts: Array<any> = [];

      // 1. Consultations (ONLY clotured/completed acts assigned to this practitioner)
      try {
        const cSnap = await getCollectionCacheFirst('consultations');
        cSnap.forEach(d => {
          const c = d.data();
          const isClotured =
            c.isClotured === true ||
            c.status === 'cloture' ||
            c.status === 'CLOTURE' ||
            c.status === 'completed' ||
            c.status === 'TERMINEE' ||
            c.status === 'FAIT';
          if (!isClotured) return;

          const cDoctor = String(c.practitionerName || c.doctor || c.doctorName || '').toLowerCase().trim();
          const cEmail = String(c.doctorEmail || '').toLowerCase().trim();
          const cDocId = String(c.practitionerId || c.doctorId || '').trim();

          if (
            cDocId === targetStaffId ||
            (staffNameLower && cDoctor && cDoctor === staffNameLower) ||
            (staffEmailLower && cEmail && cEmail === staffEmailLower)
          ) {
            const fee = Number(c.fee || c.amount || c.cost || 15000);
            const rate = Number(c.quotePartRate) || defaultRate;
            const comm = Math.round((fee * rate) / 100);
            const isPaid = c.paymentStatus === 'PAID' || c.paymentStatus === 'SOLDE';
            acts.push({
              id: d.id,
              type: 'CONSULTATION',
              typeLabel: c.specialty || c.type || 'Consultation Médicale',
              date: c.cloturedAt || c.createdAt || c.date || new Date().toISOString(),
              patientId: c.patientId || '',
              patientName: c.patientName || c.patient || 'Patient',
              description: c.diagnosis || c.motif || 'Consultation clinique clôturée',
              amount: fee,
              commissionRate: rate,
              commissionAmount: comm,
              paymentStatus: isPaid ? 'PAID' : 'PENDING',
              paymentDate: isPaid ? (c.paidAt || c.cloturedAt || c.date || c.createdAt) : undefined
            });
          }
        });
      } catch {}

      // 2. Nursing Acts / Soins Infirmiers (ONLY completed/FAIT acts assigned to this practitioner)
      try {
        const naSnap = await getCollectionCacheFirst('nursing_acts');
        naSnap.forEach(d => {
          const na = d.data();
          const isDone =
            na.isClotured === true ||
            na.status === 'FAIT' ||
            na.status === 'cloture' ||
            na.status === 'COMPLETED';
          if (!isDone) return;

          const naPracId = String(na.practitionerId || na.nurseId || na.executedById || '').trim();
          const naPracName = String(na.practitionerName || na.executedBy || '').toLowerCase().trim();
          if (
            naPracId === targetStaffId ||
            (staffNameLower && naPracName && naPracName === staffNameLower)
          ) {
            const fee = Number(na.price || na.amount || na.cost || 5000);
            const rate = Number(na.quotePartRate) || defaultRate;
            const comm = Math.round((fee * rate) / 100);
            const isPaid = na.paymentStatus === 'PAID' || na.paymentStatus === 'SOLDE';
            acts.push({
              id: d.id,
              type: 'SOIN',
              typeLabel: na.actName || 'Soin Infirmier',
              date: na.cloturedAt || na.executedAt || na.createdAt || new Date().toISOString(),
              patientId: na.patientId || '',
              patientName: na.patientName || 'Patient',
              description: na.executionNote || na.actName || 'Acte de soin infirmier réalisé',
              amount: fee,
              commissionRate: rate,
              commissionAmount: comm,
              paymentStatus: isPaid ? 'PAID' : 'PENDING',
              paymentDate: isPaid ? (na.paidAt || na.cloturedAt || na.executedAt) : undefined
            });
          }
        });
      } catch {}

      // 3. Payment Requests (ONLY clotured/completed acts assigned to this practitioner)
      try {
        const prSnap = await getCollectionCacheFirst('payment_requests');
        prSnap.forEach(d => {
          const pr = d.data();
          const isClotured =
            pr.isClotured === true ||
            pr.actStatus === 'cloture' ||
            pr.actStatus === 'FAIT' ||
            pr.actStatus === 'COMPLETED';
          if (!isClotured) return;

          const prDoc = String(pr.practitionerName || pr.doctor || pr.doctorName || '').toLowerCase().trim();
          const prDocId = String(pr.practitionerId || pr.doctorId || '').trim();
          if (prDocId === targetStaffId || (staffNameLower && prDoc && prDoc === staffNameLower)) {
            const already = acts.some(
              a =>
                a.id === d.id ||
                (a.patientName === pr.patientName &&
                  a.date.slice(0, 10) === String(pr.cloturedAt || pr.createdAt || pr.date).slice(0, 10))
            );
            if (!already) {
              const fee = Number(pr.totalAmount || pr.amount || 0);
              const rate = Number(pr.quotePartRate) || defaultRate;
              const comm = Math.round((fee * rate) / 100);
              const isPaid = pr.status === 'PAID' || pr.paymentStatus === 'PAID';
              let type: 'CONSULTATION' | 'SOIN' | 'ACCOUCHEMENT' | 'LABO' | 'AUTRE' = 'AUTRE';
              const tStr = String(pr.type || pr.motif || '').toUpperCase();
              if (tStr.includes('CONSULT')) type = 'CONSULTATION';
              else if (tStr.includes('SOIN') || tStr.includes('PANSEMENT') || tStr.includes('INJECTION')) type = 'SOIN';
              else if (tStr.includes('MATERN') || tStr.includes('ACCOUCH')) type = 'ACCOUCHEMENT';
              else if (tStr.includes('LAB') || tStr.includes('EXAMEN') || tStr.includes('ANALYSE')) type = 'LABO';

              acts.push({
                id: d.id,
                type,
                typeLabel: pr.type || 'Acte Spécialisé / Prestation',
                date: pr.cloturedAt || pr.createdAt || pr.date || new Date().toISOString(),
                patientId: pr.patientId || '',
                patientName: pr.patientName || 'Patient',
                description: pr.description || pr.motif || 'Prestation médicale clôturée',
                amount: fee,
                commissionRate: rate,
                commissionAmount: comm,
                paymentStatus: isPaid ? 'PAID' : 'PENDING',
                paymentDate: isPaid ? (pr.paidAt || pr.cloturedAt || pr.createdAt) : undefined
              });
            }
          }
        });
      } catch {}

      acts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      const filteredActs = acts.filter(act => {
        const actDate = String(act.date || '').slice(0, 10);
        if (startDate && actDate < startDate) return false;
        if (endDate && actDate > endDate) return false;
        if (typeFilter !== 'ALL' && act.type !== typeFilter) return false;
        if (paymentStatusFilter !== 'ALL' && act.paymentStatus !== paymentStatusFilter) return false;
        return true;
      });

      const totalConsultations = filteredActs.filter(a => a.type === 'CONSULTATION').length;
      const totalActs = filteredActs.length;
      const totalCommissionsEarned = filteredActs.reduce((sum, a) => sum + a.commissionAmount, 0);
      const totalCommissionsPaid = filteredActs
        .filter(a => a.paymentStatus === 'PAID')
        .reduce((sum, a) => sum + a.commissionAmount, 0);

      setPerformanceData({
        kpis: {
          totalConsultations,
          totalActs,
          totalCommissionsEarned,
          totalCommissionsPaid
        },
        acts: filteredActs
      });
    } catch (err: any) {
      console.warn('Error fetching personal performance:', err);
    } finally {
      setIsLoadingPerformance(false);
    }
  };

  useEffect(() => {
    if (isOpen && activeTab === 'FINANCE') {
      fetchPerformance();
    }
  }, [isOpen, activeTab, startDate, endDate, typeFilter, paymentStatusFilter]);

  // Update Profile (0ms Optimistic UI + Offline-First Firestore sync)
  const handleSaveInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setInfoMessage({ text: 'Le nom ne peut pas être vide.', type: 'error' });
      return;
    }

    setIsSavingInfo(true);
    setInfoMessage(null);

    try {
      const updates = {
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        profession: profession.trim(),
        profileImage: profilePhoto,
        profile_image_url: profilePhoto,
        updatedAt: new Date().toISOString()
      };

      const updatedUser: User = {
        ...user,
        name: updates.name,
        email: updates.email,
        phone: updates.phone,
        profession: updates.profession,
        profileImage: profilePhoto || undefined,
        profile_image_url: profilePhoto || undefined
      };

      // Optimistically update local session and UI immediately (0ms delay)
      localStorage.setItem('hospital_session', JSON.stringify(updatedUser));
      onUserUpdated?.(updatedUser);
      setInfoMessage({ text: 'Profil mis à jour avec succès.', type: 'success' });
      setTimeout(() => setInfoMessage(null), 3500);

      // Sync with client Firestore cache + server in background
      updateDoc(doc(db, 'hospital_users', user.id), sanitizeData(updates)).catch(() => {});
      fetch(`/api/staff/${user.id}/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': user.id,
          'x-user-role': user.role || 'MEDECIN'
        },
        body: JSON.stringify(updates)
      }).catch(() => {});
    } catch (err: any) {
      console.error('Error saving user profile:', err);
      setInfoMessage({ text: err?.message || 'Erreur lors de la mise à jour du profil.', type: 'error' });
    } finally {
      setIsSavingInfo(false);
    }
  };

  // Change Password
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword || newPassword.length < 4) {
      setPasswordMessage({ text: 'Le mot de passe doit comporter au moins 4 caractères.', type: 'error' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMessage({ text: 'Les deux mots de passe ne correspondent pas.', type: 'error' });
      return;
    }

    setIsChangingPassword(true);
    setPasswordMessage(null);

    try {
      const res = await fetch(`/api/staff/${user.id}/change-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': user.id,
          'x-user-role': user.role || 'MEDECIN'
        },
        body: JSON.stringify({
          currentPassword,
          newPassword
        })
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.message || 'Erreur lors du changement de mot de passe.');
      }

      setPasswordMessage({ text: 'Votre mot de passe a été mis à jour avec succès.', type: 'success' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setPasswordMessage(null), 4000);
    } catch (err: any) {
      console.error('Error changing password:', err);
      setPasswordMessage({ text: err?.message || 'Erreur lors du changement de mot de passe.', type: 'error' });
    } finally {
      setIsChangingPassword(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div 
        className={`w-full max-w-4xl max-h-[90vh] flex flex-col rounded-3xl shadow-2xl overflow-hidden transition-all border ${
          theme === 'dark' 
            ? 'bg-[#0f1117] border-zinc-800 text-zinc-100' 
            : 'bg-white border-slate-200 text-slate-900'
        }`}
        onClick={e => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className={`p-6 border-b flex items-center justify-between shrink-0 ${
          theme === 'dark' ? 'border-zinc-800 bg-zinc-900/60' : 'border-slate-100 bg-slate-50/80'
        }`}>
          <div className="flex items-center gap-4">
            <div className="relative">
              <Avatar user={{ ...user, profileImage: profilePhoto || undefined, profile_image_url: profilePhoto || undefined }} size={52} roundedClassName="rounded-2xl" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-black uppercase tracking-tight">{user.name}</h2>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-blue-500/10 text-blue-500 border border-blue-500/20">
                  {user.role}
                </span>
              </div>
              <p className="text-xs text-slate-400 dark:text-zinc-500 font-medium">
                @{user.username} • {user.profession || 'Personnel Soignant'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-slate-200 dark:hover:bg-zinc-800 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 transition-colors cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className={`flex border-b px-6 shrink-0 ${theme === 'dark' ? 'border-zinc-800 bg-zinc-950/40' : 'border-slate-100 bg-slate-50/40'}`}>
          <button
            onClick={() => setActiveTab('INFO')}
            className={`py-3.5 px-4 font-black text-xs uppercase tracking-wider flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
              activeTab === 'INFO'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-700 dark:hover:text-zinc-300'
            }`}
          >
            <UserIcon size={16} />
            <span>Informations de base</span>
          </button>

          <button
            onClick={() => setActiveTab('FINANCE')}
            className={`py-3.5 px-4 font-black text-xs uppercase tracking-wider flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
              activeTab === 'FINANCE'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-700 dark:hover:text-zinc-300'
            }`}
          >
            <TrendingUp size={16} />
            <span>Mes Activités & Finances</span>
          </button>

          <button
            onClick={() => setActiveTab('WHATSAPP')}
            className={`py-3.5 px-4 font-black text-xs uppercase tracking-wider flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
              activeTab === 'WHATSAPP'
                ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-700 dark:hover:text-zinc-300'
            }`}
          >
            <MessageSquare size={16} />
            <span>Assistant WhatsApp IA</span>
          </button>
        </div>

        {/* Modal Body (Scrollable) */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* TAB 1: INFORMATIONS DE BASE */}
          {activeTab === 'INFO' && (
            <div className="space-y-8 animate-in fade-in duration-200">
              {/* Profile Photo Upload */}
              <div className={`p-6 rounded-3xl border ${theme === 'dark' ? 'bg-zinc-900/40 border-zinc-800/80' : 'bg-slate-50 border-slate-100'}`}>
                <h3 className="text-sm font-black uppercase tracking-wider mb-4 flex items-center gap-2 text-slate-700 dark:text-zinc-300">
                  <UserIcon size={16} className="text-blue-500" />
                  <span>Avatar & Photo de profil</span>
                </h3>
                <ImageUpload
                  currentImageUrl={profilePhoto}
                  userId={user.id}
                  label="Sélectionnez ou modifiez votre photo officielle"
                  onImageUploaded={(url) => setProfilePhoto(url)}
                  onImageRemoved={() => setProfilePhoto(null)}
                />
              </div>

              {/* Personal Details Form */}
              <form onSubmit={handleSaveInfo} className={`p-6 rounded-3xl border space-y-4 ${theme === 'dark' ? 'bg-zinc-900/40 border-zinc-800/80' : 'bg-slate-50 border-slate-100'}`}>
                <h3 className="text-sm font-black uppercase tracking-wider mb-2 flex items-center gap-2 text-slate-700 dark:text-zinc-300">
                  <Briefcase size={16} className="text-blue-500" />
                  <span>Coordonnées & Informations professionnelles</span>
                </h3>

                {infoMessage && (
                  <div className={`p-3 rounded-2xl text-xs font-bold flex items-center gap-2 ${
                    infoMessage.type === 'success' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-500 border border-rose-500/20'
                  }`}>
                    {infoMessage.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                    <span>{infoMessage.text}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1">
                      Nom complet
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className={`w-full px-4 py-2.5 rounded-xl border text-sm font-bold outline-none transition-all ${
                        theme === 'dark' ? 'bg-zinc-950 border-zinc-800 text-zinc-100 focus:border-blue-500' : 'bg-white border-slate-200 text-slate-900 focus:border-blue-600'
                      }`}
                      placeholder="Dr. Nom Prénom"
                      required
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1">
                      Identifiant (Username)
                    </label>
                    <input
                      type="text"
                      value={user.username}
                      disabled
                      className={`w-full px-4 py-2.5 rounded-xl border text-sm font-bold opacity-60 cursor-not-allowed ${
                        theme === 'dark' ? 'bg-zinc-900 border-zinc-800 text-zinc-400' : 'bg-slate-100 border-slate-200 text-slate-500'
                      }`}
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1">
                      Adresse Email
                    </label>
                    <div className="relative">
                      <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className={`w-full pl-10 pr-4 py-2.5 rounded-xl border text-sm font-bold outline-none transition-all ${
                          theme === 'dark' ? 'bg-zinc-950 border-zinc-800 text-zinc-100 focus:border-blue-500' : 'bg-white border-slate-200 text-slate-900 focus:border-blue-600'
                        }`}
                        placeholder="email@hopital.com"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1">
                      Numéro de Téléphone
                    </label>
                    <div className="relative">
                      <Phone size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className={`w-full pl-10 pr-4 py-2.5 rounded-xl border text-sm font-bold outline-none transition-all ${
                          theme === 'dark' ? 'bg-zinc-950 border-zinc-800 text-zinc-100 focus:border-blue-500' : 'bg-white border-slate-200 text-slate-900 focus:border-blue-600'
                        }`}
                        placeholder="+225 07 00 00 00 00"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1">
                      Spécialité / Profession
                    </label>
                    <input
                      type="text"
                      value={profession}
                      onChange={(e) => setProfession(e.target.value)}
                      className={`w-full px-4 py-2.5 rounded-xl border text-sm font-bold outline-none transition-all ${
                        theme === 'dark' ? 'bg-zinc-950 border-zinc-800 text-zinc-100 focus:border-blue-500' : 'bg-white border-slate-200 text-slate-900 focus:border-blue-600'
                      }`}
                      placeholder="Ex: Gynécologue, Pédiatre, Infirmier"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1">
                      Rôle Système
                    </label>
                    <div className="flex items-center gap-2 pt-1.5">
                      <span className="px-3 py-1.5 rounded-xl text-xs font-black uppercase bg-slate-200 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300">
                        {user.role}
                      </span>
                      {user.quotePartRate ? (
                        <span className="px-3 py-1.5 rounded-xl text-xs font-black uppercase bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                          Taux quote-part: {user.quotePartRate}%
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    disabled={isSavingInfo}
                    className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-xs uppercase tracking-wider shadow-lg shadow-blue-600/20 flex items-center gap-2 cursor-pointer transition-all disabled:opacity-50"
                  >
                    {isSavingInfo ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                    <span>Enregistrer les modifications</span>
                  </button>
                </div>
              </form>

              {/* Password Change Section */}
              <form onSubmit={handleChangePassword} className={`p-6 rounded-3xl border space-y-4 ${theme === 'dark' ? 'bg-zinc-900/40 border-zinc-800/80' : 'bg-slate-50 border-slate-100'}`}>
                <h3 className="text-sm font-black uppercase tracking-wider mb-2 flex items-center gap-2 text-slate-700 dark:text-zinc-300">
                  <Lock size={16} className="text-amber-500" />
                  <span>Sécurité & Changement de mot de passe</span>
                </h3>

                {passwordMessage && (
                  <div className={`p-3 rounded-2xl text-xs font-bold flex items-center gap-2 ${
                    passwordMessage.type === 'success' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-500 border border-rose-500/20'
                  }`}>
                    {passwordMessage.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                    <span>{passwordMessage.text}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1">
                      Mot de passe actuel
                    </label>
                    <input
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      className={`w-full px-4 py-2.5 rounded-xl border text-sm font-bold outline-none transition-all ${
                        theme === 'dark' ? 'bg-zinc-950 border-zinc-800 text-zinc-100 focus:border-amber-500' : 'bg-white border-slate-200 text-slate-900 focus:border-amber-600'
                      }`}
                      placeholder="••••••••"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1">
                      Nouveau mot de passe
                    </label>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className={`w-full px-4 py-2.5 rounded-xl border text-sm font-bold outline-none transition-all ${
                        theme === 'dark' ? 'bg-zinc-950 border-zinc-800 text-zinc-100 focus:border-blue-500' : 'bg-white border-slate-200 text-slate-900 focus:border-blue-600'
                      }`}
                      placeholder="Min. 4 caractères"
                      required
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1">
                      Confirmer le mot de passe
                    </label>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className={`w-full px-4 py-2.5 rounded-xl border text-sm font-bold outline-none transition-all ${
                        theme === 'dark' ? 'bg-zinc-950 border-zinc-800 text-zinc-100 focus:border-blue-500' : 'bg-white border-slate-200 text-slate-900 focus:border-blue-600'
                      }`}
                      placeholder="Confirmer"
                      required
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    disabled={isChangingPassword}
                    className="px-6 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-black text-xs uppercase tracking-wider shadow-lg shadow-amber-600/20 flex items-center gap-2 cursor-pointer transition-all disabled:opacity-50"
                  >
                    {isChangingPassword ? <Loader2 size={16} className="animate-spin" /> : <Key size={16} />}
                    <span>Mettre à jour le mot de passe</span>
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* TAB 2: MES ACTIVITÉS & FINANCES */}
          {activeTab === 'FINANCE' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              {/* Universal Filters Header */}
              <div className={`p-5 rounded-3xl border ${theme === 'dark' ? 'bg-zinc-900/60 border-zinc-800' : 'bg-slate-50 border-slate-200/80'}`}>
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <Filter size={18} className="text-blue-500 shrink-0" />
                    <div>
                      <h4 className="text-xs font-black uppercase tracking-wider">Filtres Universels d'Activité</h4>
                      <p className="text-[10px] text-slate-400">Recalcul instantané des KPI et honoraires</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    {/* Date Range Du / Au */}
                    <div className="flex items-center gap-2 bg-white dark:bg-zinc-950 px-3 py-1.5 rounded-2xl border border-slate-200 dark:border-zinc-800">
                      <span className="text-[10px] font-black uppercase text-slate-400">Du</span>
                      <input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="bg-transparent text-xs font-bold outline-none cursor-pointer"
                      />
                      <span className="text-[10px] font-black uppercase text-slate-400">Au</span>
                      <input
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="bg-transparent text-xs font-bold outline-none cursor-pointer"
                      />
                    </div>

                    {/* Type d'acte Filter */}
                    <select
                      value={typeFilter}
                      onChange={(e) => setTypeFilter(e.target.value)}
                      className={`px-3 py-2 rounded-2xl border text-xs font-bold outline-none cursor-pointer ${
                        theme === 'dark' ? 'bg-zinc-950 border-zinc-800 text-zinc-200' : 'bg-white border-slate-200 text-slate-700'
                      }`}
                    >
                      <option value="ALL">Tous les actes</option>
                      <option value="CONSULTATION">Consultations</option>
                      <option value="SOIN">Soins & Pansements</option>
                      <option value="ACCOUCHEMENT">Maternité & Accouchements</option>
                      <option value="LABO">Examens Labo</option>
                      <option value="AUTRE">Autres actes</option>
                    </select>

                    {/* Statut de paiement Filter */}
                    <select
                      value={paymentStatusFilter}
                      onChange={(e) => setPaymentStatusFilter(e.target.value)}
                      className={`px-3 py-2 rounded-2xl border text-xs font-bold outline-none cursor-pointer ${
                        theme === 'dark' ? 'bg-zinc-950 border-zinc-800 text-zinc-200' : 'bg-white border-slate-200 text-slate-700'
                      }`}
                    >
                      <option value="ALL">Tous les statuts</option>
                      <option value="PAID">Payé</option>
                      <option value="PENDING">En attente</option>
                    </select>

                    <button
                      onClick={fetchPerformance}
                      disabled={isLoadingPerformance}
                      className="p-2 rounded-xl bg-blue-500/10 hover:bg-blue-500/20 text-blue-500 transition-colors cursor-pointer"
                      title="Actualiser les calculs"
                    >
                      <RefreshCw size={16} className={isLoadingPerformance ? 'animate-spin' : ''} />
                    </button>
                  </div>
                </div>
              </div>

              {/* 4 Required KPI Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* 1. Total Consultations */}
                <div className={`p-5 rounded-3xl border flex items-center gap-4 ${
                  theme === 'dark' ? 'bg-zinc-900/40 border-zinc-800' : 'bg-white border-slate-100 shadow-sm'
                }`}>
                  <div className="w-12 h-12 rounded-2xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                    <Stethoscope size={24} />
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total Consultations</p>
                    <p className="text-2xl font-black font-heading mt-0.5">
                      {performanceData.kpis.totalConsultations}
                    </p>
                  </div>
                </div>

                {/* 2. Total Soins/Actes */}
                <div className={`p-5 rounded-3xl border flex items-center gap-4 ${
                  theme === 'dark' ? 'bg-zinc-900/40 border-zinc-800' : 'bg-white border-slate-100 shadow-sm'
                }`}>
                  <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                    <Activity size={24} />
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total Soins / Actes</p>
                    <p className="text-2xl font-black font-heading mt-0.5">
                      {performanceData.kpis.totalActs}
                    </p>
                  </div>
                </div>

                {/* 3. Quotes-parts générées (Total Commissions Earned) */}
                <div className={`p-5 rounded-3xl border flex items-center gap-4 ${
                  theme === 'dark' ? 'bg-zinc-900/40 border-zinc-800' : 'bg-white border-slate-100 shadow-sm'
                }`}>
                  <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                    <TrendingUp size={24} />
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Quotes-parts générées</p>
                    <p className="text-xl font-black font-heading mt-0.5 text-amber-600 dark:text-amber-400">
                      {performanceData.kpis.totalCommissionsEarned.toLocaleString('fr-FR')} <span className="text-xs font-bold text-slate-400">FCFA</span>
                    </p>
                  </div>
                </div>

                {/* 4. Quotes-parts payées (Commissions already paid by Accounting) */}
                <div className={`p-5 rounded-3xl border flex items-center gap-4 ${
                  theme === 'dark' ? 'bg-zinc-900/40 border-zinc-800' : 'bg-white border-slate-100 shadow-sm'
                }`}>
                  <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                    <CheckCircle2 size={24} />
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Quotes-parts payées</p>
                    <p className="text-xl font-black font-heading mt-0.5 text-emerald-600 dark:text-emerald-400">
                      {performanceData.kpis.totalCommissionsPaid.toLocaleString('fr-FR')} <span className="text-xs font-bold text-slate-400">FCFA</span>
                    </p>
                  </div>
                </div>
              </div>

              {/* Personal Output Clinical Table */}
              <div className={`rounded-3xl border overflow-hidden ${theme === 'dark' ? 'bg-zinc-900/40 border-zinc-800' : 'bg-white border-slate-100 shadow-sm'}`}>
                <div className="p-4 border-b border-slate-100 dark:border-zinc-800 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText size={16} className="text-blue-500" />
                    <h5 className="text-xs font-black uppercase tracking-wider">Historique de mes Actes & Commissions</h5>
                  </div>
                  <span className="text-xs font-bold text-slate-400">
                    {performanceData.acts.length} acte(s) répertorié(s)
                  </span>
                </div>

                {isLoadingPerformance ? (
                  <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-400">
                    <Loader2 size={28} className="animate-spin text-blue-500" />
                    <span className="text-xs font-bold">Chargement des actes en cours...</span>
                  </div>
                ) : performanceData.acts.length === 0 ? (
                  <div className="py-12 text-center text-slate-400">
                    <p className="text-xs font-bold">Aucun acte trouvé pour la période et les filtres sélectionnés.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse whitespace-nowrap">
                      <thead>
                        <tr className="bg-slate-50/50 dark:bg-zinc-900/50 border-b border-slate-100 dark:border-zinc-800 text-[10px] font-black uppercase tracking-widest text-slate-400">
                          <th className="px-5 py-3.5">Date & Heure</th>
                          <th className="px-5 py-3.5">Type d'acte</th>
                          <th className="px-5 py-3.5">Patient</th>
                          <th className="px-5 py-3.5 text-right">Montant Brut</th>
                          <th className="px-5 py-3.5 text-right">Ma Quote-part</th>
                          <th className="px-5 py-3.5 text-center">Statut Paiement</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-zinc-800 text-xs">
                        {performanceData.acts.map((act) => (
                          <tr key={act.id} className="hover:bg-slate-50/60 dark:hover:bg-zinc-800/40 transition-colors">
                            <td className="px-5 py-3.5 font-medium text-slate-500 dark:text-zinc-400">
                              {new Date(act.date).toLocaleDateString('fr-FR', {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </td>
                            <td className="px-5 py-3.5 font-bold">
                              <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase ${
                                act.type === 'CONSULTATION' ? 'bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400' :
                                act.type === 'SOIN' ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400' :
                                act.type === 'ACCOUCHEMENT' ? 'bg-pink-50 text-pink-600 dark:bg-pink-950/40 dark:text-pink-400' :
                                act.type === 'LABO' ? 'bg-purple-50 text-purple-600 dark:bg-purple-950/40 dark:text-purple-400' :
                                'bg-slate-100 text-slate-600 dark:bg-zinc-800 dark:text-zinc-400'
                              }`}>
                                {act.typeLabel || act.type}
                              </span>
                            </td>
                            <td className="px-5 py-3.5 font-bold">
                              <div>{act.patientName}</div>
                              <span className="text-[10px] font-mono text-slate-400">{act.patientId}</span>
                            </td>
                            <td className="px-5 py-3.5 text-right font-medium">
                              {Number(act.amount).toLocaleString('fr-FR')} FCFA
                            </td>
                            <td className="px-5 py-3.5 text-right font-black text-amber-600 dark:text-amber-400">
                              {Number(act.commissionAmount).toLocaleString('fr-FR')} FCFA
                              <span className="text-[10px] font-bold text-slate-400 block font-sans">
                                ({act.commissionRate}%)
                              </span>
                            </td>
                            <td className="px-5 py-3.5 text-center">
                              <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider inline-flex items-center gap-1 ${
                                act.paymentStatus === 'PAID'
                                  ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                                  : 'bg-amber-500/10 text-amber-500 border border-amber-500/20'
                              }`}>
                                {act.paymentStatus === 'PAID' ? (
                                  <>
                                    <CheckCircle2 size={11} />
                                    <span>Payé</span>
                                  </>
                                ) : (
                                  <>
                                    <Clock size={11} />
                                    <span>En attente</span>
                                  </>
                                )}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: ASSISTANT WHATSAPP IA */}
          {activeTab === 'WHATSAPP' && (
            <div className="animate-in fade-in duration-200">
              <WhatsAppAgentSettings
                currentUser={user}
                staffOnlyMode={true}
                theme={theme}
                onUserPhoneUpdated={(newPhone) => {
                  setPhone(newPhone);
                  if (onUserUpdated) {
                    onUserUpdated({ ...user, phone: newPhone });
                  }
                }}
              />
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className={`p-4 border-t flex justify-end shrink-0 ${theme === 'dark' ? 'border-zinc-800 bg-zinc-950/60' : 'border-slate-100 bg-slate-50'}`}>
          <button
            onClick={onClose}
            className="px-6 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-zinc-400 hover:bg-slate-200 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
};
