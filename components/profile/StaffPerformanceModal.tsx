import React, { useState, useEffect } from 'react';
import { 
  X, 
  Stethoscope, 
  Activity, 
  TrendingUp, 
  CheckCircle2, 
  Clock, 
  Filter, 
  RefreshCw, 
  Loader2, 
  FileText, 
  Calendar, 
  User as UserIcon, 
  Printer, 
  Download, 
  Shield, 
  Mail, 
  Phone, 
  Award,
  CheckCircle,
  AlertCircle
} from 'lucide-react';
import { User } from '../../types';
import { Avatar } from '../common/Avatar';

interface StaffPerformanceModalProps {
  staffUser: User;
  currentUser: User;
  isOpen: boolean;
  onClose: () => void;
  theme?: 'light' | 'dark';
}

export const StaffPerformanceModal: React.FC<StaffPerformanceModalProps> = ({
  staffUser,
  currentUser,
  isOpen,
  onClose,
  theme = 'light'
}) => {
  const [activeTab, setActiveTab] = useState<'PERFORMANCE' | 'DETAILS'>('PERFORMANCE');

  // Universal Filters
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
  const [isLoading, setIsLoading] = useState(false);
  const [performanceData, setPerformanceData] = useState<{
    staff: any;
    kpis: {
      totalConsultations: number;
      totalActs: number;
      totalCommissionsEarned: number;
      totalCommissionsPaid: number;
    };
    acts: Array<any>;
  }>({
    staff: staffUser,
    kpis: {
      totalConsultations: 0,
      totalActs: 0,
      totalCommissionsEarned: 0,
      totalCommissionsPaid: 0
    },
    acts: []
  });

  const fetchPerformance = async () => {
    if (!staffUser?.id) return;
    setIsLoading(true);

    try {
      const params = new URLSearchParams({
        requester_id: currentUser?.id || 'admin',
        requester_role: currentUser?.role || 'ADMIN',
        startDate,
        endDate,
        type: typeFilter,
        paymentStatus: paymentStatusFilter
      });

      const res = await fetch(`/api/staff/${staffUser.id}/performance?${params.toString()}`, {
        headers: {
          'x-user-id': currentUser?.id || 'admin',
          'x-user-role': currentUser?.role || 'ADMIN'
        }
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || 'Erreur lors de la récupération des performances RH');
      }

      const data = await res.json();
      setPerformanceData({
        staff: data.staff || staffUser,
        kpis: data.kpis || {
          totalConsultations: 0,
          totalActs: 0,
          totalCommissionsEarned: 0,
          totalCommissionsPaid: 0
        },
        acts: data.acts || []
      });
    } catch (err) {
      console.error('Error fetching admin staff performance:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchPerformance();
    }
  }, [isOpen, staffUser?.id, startDate, endDate, typeFilter, paymentStatusFilter]);

  if (!isOpen || !staffUser) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div 
        className={`w-full max-w-5xl max-h-[92vh] flex flex-col rounded-3xl shadow-2xl overflow-hidden transition-all border ${
          theme === 'dark' 
            ? 'bg-[#0f1117] border-zinc-800 text-zinc-100' 
            : 'bg-white border-slate-200 text-slate-900'
        }`}
        onClick={e => e.stopPropagation()}
      >
        {/* Header with Staff Profile Overview */}
        <div className={`p-6 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0 ${
          theme === 'dark' ? 'border-zinc-800 bg-zinc-900/70' : 'border-slate-100 bg-slate-50/80'
        }`}>
          <div className="flex items-center gap-4">
            <Avatar user={staffUser} size={60} roundedClassName="rounded-2xl" />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-black uppercase tracking-tight">{staffUser.name}</h2>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-blue-500/10 text-blue-500 border border-blue-500/20">
                  {staffUser.role}
                </span>
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${
                  staffUser.status === 'ACTIVE' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-slate-200 dark:bg-zinc-800 text-slate-500'
                }`}>
                  {staffUser.status || 'Actif'}
                </span>
              </div>
              <p className="text-xs text-slate-400 dark:text-zinc-500 font-medium mt-0.5">
                Identifiant: <span className="font-mono text-slate-700 dark:text-zinc-300">@{staffUser.username}</span> • {staffUser.profession || 'Personnel Hospitalier'}
                {staffUser.email ? ` • ${staffUser.email}` : ''}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-center">
            <button
              onClick={() => window.print()}
              className="p-2 rounded-xl bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 text-slate-600 dark:text-zinc-300 transition-colors cursor-pointer"
              title="Imprimer la Fiche Performance"
            >
              <Printer size={18} />
            </button>
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-slate-200 dark:hover:bg-zinc-800 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 transition-colors cursor-pointer"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Tab switcher */}
        <div className={`flex border-b px-6 shrink-0 ${theme === 'dark' ? 'border-zinc-800 bg-zinc-950/40' : 'border-slate-100 bg-slate-50/40'}`}>
          <button
            onClick={() => setActiveTab('PERFORMANCE')}
            className={`py-3.5 px-4 font-black text-xs uppercase tracking-wider flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
              activeTab === 'PERFORMANCE'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-700 dark:hover:text-zinc-300'
            }`}
          >
            <TrendingUp size={16} />
            <span>Fiche Performance RH & Quotes-parts</span>
          </button>

          <button
            onClick={() => setActiveTab('DETAILS')}
            className={`py-3.5 px-4 font-black text-xs uppercase tracking-wider flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
              activeTab === 'DETAILS'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-700 dark:hover:text-zinc-300'
            }`}
          >
            <UserIcon size={16} />
            <span>Informations RH & Compte</span>
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {activeTab === 'PERFORMANCE' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              {/* Universal Filters */}
              <div className={`p-5 rounded-3xl border ${theme === 'dark' ? 'bg-zinc-900/60 border-zinc-800' : 'bg-slate-50 border-slate-200/80'}`}>
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <Filter size={18} className="text-blue-500 shrink-0" />
                    <div>
                      <h4 className="text-xs font-black uppercase tracking-wider">Filtres d'Audit Performance</h4>
                      <p className="text-[10px] text-slate-400">Recalcul instantané des quotas et quotes-parts</p>
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
                      disabled={isLoading}
                      className="p-2 rounded-xl bg-blue-500/10 hover:bg-blue-500/20 text-blue-500 transition-colors cursor-pointer"
                      title="Actualiser les calculs"
                    >
                      <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
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

              {/* Overarching Table Listing EVERY SINGLE ACT performed by this user */}
              <div className={`rounded-3xl border overflow-hidden ${theme === 'dark' ? 'bg-zinc-900/40 border-zinc-800' : 'bg-white border-slate-100 shadow-sm'}`}>
                <div className="p-4 border-b border-slate-100 dark:border-zinc-800 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText size={16} className="text-blue-500" />
                    <h5 className="text-xs font-black uppercase tracking-wider">
                      Audit Détaillé des Actes Cliniques & Commissions
                    </h5>
                  </div>
                  <span className="text-xs font-bold text-slate-400">
                    {performanceData.acts.length} acte(s) réalisé(s)
                  </span>
                </div>

                {isLoading ? (
                  <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-400">
                    <Loader2 size={28} className="animate-spin text-blue-500" />
                    <span className="text-xs font-bold">Calcul et extraction des actes...</span>
                  </div>
                ) : performanceData.acts.length === 0 ? (
                  <div className="py-12 text-center text-slate-400">
                    <p className="text-xs font-bold">Aucun acte répertorié pour ce collaborateur sur cette période.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse whitespace-nowrap">
                      <thead>
                        <tr className="bg-slate-50/50 dark:bg-zinc-900/50 border-b border-slate-100 dark:border-zinc-800 text-[10px] font-black uppercase tracking-widest text-slate-400">
                          <th className="px-5 py-3.5">Date & Heure exacte</th>
                          <th className="px-5 py-3.5">Type d'acte</th>
                          <th className="px-5 py-3.5">Patient associé</th>
                          <th className="px-5 py-3.5">Prestation / Motif</th>
                          <th className="px-5 py-3.5 text-right">Tarif Brut</th>
                          <th className="px-5 py-3.5 text-right">Quote-part (%)</th>
                          <th className="px-5 py-3.5 text-center">Statut Paiement</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-zinc-800 text-xs">
                        {performanceData.acts.map((act) => (
                          <tr key={act.id} className="hover:bg-slate-50/60 dark:hover:bg-zinc-800/40 transition-colors">
                            <td className="px-5 py-3.5 font-medium text-slate-500 dark:text-zinc-400 font-mono">
                              {new Date(act.date).toLocaleDateString('fr-FR', {
                                day: '2-digit',
                                month: '2-digit',
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
                            <td className="px-5 py-3.5 text-slate-600 dark:text-zinc-400 max-w-xs truncate">
                              {act.description}
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

          {activeTab === 'DETAILS' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className={`p-6 rounded-3xl border grid grid-cols-1 md:grid-cols-2 gap-6 ${
                theme === 'dark' ? 'bg-zinc-900/40 border-zinc-800' : 'bg-slate-50 border-slate-100'
              }`}>
                <div>
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">
                    Identité & Login
                  </h4>
                  <p className="text-base font-bold text-slate-900 dark:text-zinc-100">{staffUser.name}</p>
                  <p className="text-xs text-slate-500 font-mono mt-0.5">@{staffUser.username}</p>
                </div>

                <div>
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">
                    Fonction & Titre
                  </h4>
                  <p className="text-base font-bold text-slate-900 dark:text-zinc-100">{staffUser.profession || 'Personnel Soignant'}</p>
                  <p className="text-xs text-slate-500 mt-0.5">Rôle: {staffUser.role}</p>
                </div>

                <div>
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">
                    Coordonnées de contact
                  </h4>
                  <p className="text-xs font-medium text-slate-700 dark:text-zinc-300 flex items-center gap-2">
                    <Mail size={14} className="text-slate-400" />
                    <span>{staffUser.email || 'Email non renseigné'}</span>
                  </p>
                  {staffUser.phone && (
                    <p className="text-xs font-medium text-slate-700 dark:text-zinc-300 flex items-center gap-2 mt-1">
                      <Phone size={14} className="text-slate-400" />
                      <span>{staffUser.phone}</span>
                    </p>
                  )}
                </div>

                <div>
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">
                    Statut du Compte & Sécurité
                  </h4>
                  <div className="flex items-center gap-2">
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase ${
                      staffUser.status === 'ACTIVE' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'
                    }`}>
                      {staffUser.status || 'Actif'}
                    </span>
                    {staffUser.forcePasswordChange && (
                      <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-amber-500/10 text-amber-500">
                        Changement MDP requis
                      </span>
                    )}
                  </div>
                </div>
              </div>
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
