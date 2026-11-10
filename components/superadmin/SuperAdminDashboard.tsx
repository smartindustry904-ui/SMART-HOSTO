import React, { useState, useMemo } from 'react';
import { 
  Building2, 
  ShieldCheck, 
  Clock, 
  AlertTriangle, 
  Users, 
  TrendingUp, 
  DollarSign, 
  Calendar, 
  Layers, 
  CreditCard, 
  CheckCircle2, 
  XCircle, 
  ArrowUpRight, 
  Filter,
  BarChart3,
  PieChart,
  ShieldAlert,
  ArrowRight
} from 'lucide-react';
import { SAAS_PLANS, SaaSPlanId } from '../../src/config/plans';
import { ClinicTenant, SubscriptionInvoice } from '../../pages/ControlCenter';

interface SuperAdminDashboardProps {
  clinics: ClinicTenant[];
  plans?: Record<string, any>;
  invoices: SubscriptionInvoice[];
  superAdminsCount: number;
  totalHospitalUsersCount: number;
  onNavigateToTab: (tabId: string) => void;
}

type TimeFilter = 'THIS_MONTH' | 'LAST_MONTH' | 'THIS_YEAR' | 'CUSTOM' | 'ALL';

export const SuperAdminDashboard: React.FC<SuperAdminDashboardProps> = ({
  clinics,
  plans = SAAS_PLANS,
  invoices,
  superAdminsCount,
  totalHospitalUsersCount,
  onNavigateToTab
}) => {
  const effectivePlans = useMemo(() => ({ ...SAAS_PLANS, ...(plans || {}) }), [plans]);
  const totalUserSeatCapacity = useMemo(() => {
    return clinics.reduce((sum, c) => sum + (Number(c.quotas?.maxUsers) || 5), 0);
  }, [clinics]);
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('THIS_YEAR');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');

  // Helper date calculation
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0-indexed

  // 1. Structures Status Breakdown
  const totalClinics = clinics.length;
  
  const isExpired = (endDateStr?: string, status?: string) => {
    if (status === 'EXPIRED') return true;
    if (!endDateStr) return false;
    const end = new Date(endDateStr);
    return end.getTime() < now.getTime();
  };

  const isExpiringSoon = (endDateStr?: string, daysLimit = 30) => {
    if (!endDateStr) return false;
    const end = new Date(endDateStr);
    const diffDays = (end.getTime() - now.getTime()) / (1000 * 3600 * 24);
    return diffDays > 0 && diffDays <= daysLimit;
  };

  const activeClinics = useMemo(() => {
    return clinics.filter(c => c.status === 'ACTIVE' && !isExpired(c.licenseEnd, c.status));
  }, [clinics]);

  const expiredClinics = useMemo(() => {
    return clinics.filter(c => isExpired(c.licenseEnd, c.status));
  }, [clinics]);

  const expiringSoonClinics = useMemo(() => {
    return clinics.filter(c => isExpiringSoon(c.licenseEnd, 30));
  }, [clinics]);

  // 2. Financial Calculations with Time Filters
  const dateRange = useMemo(() => {
    let start: Date | null = null;
    let end: Date | null = null;

    if (timeFilter === 'THIS_MONTH') {
      start = new Date(currentYear, currentMonth, 1);
      end = new Date(currentYear, currentMonth + 1, 0, 23, 59, 59);
    } else if (timeFilter === 'LAST_MONTH') {
      start = new Date(currentYear, currentMonth - 1, 1);
      end = new Date(currentYear, currentMonth, 0, 23, 59, 59);
    } else if (timeFilter === 'THIS_YEAR') {
      start = new Date(currentYear, 0, 1);
      end = new Date(currentYear, 11, 31, 23, 59, 59);
    } else if (timeFilter === 'CUSTOM') {
      if (customStartDate) start = new Date(customStartDate);
      if (customEndDate) end = new Date(customEndDate + 'T23:59:59');
    }
    return { start, end };
  }, [timeFilter, customStartDate, customEndDate, currentYear, currentMonth]);

  const filteredInvoices = useMemo(() => {
    return invoices.filter(inv => {
      const invDate = new Date(inv.paidDate || inv.dueDate || inv.createdAt || '');
      if (isNaN(invDate.getTime())) return true; // keep if no date
      if (dateRange.start && invDate < dateRange.start) return false;
      if (dateRange.end && invDate > dateRange.end) return false;
      return true;
    });
  }, [invoices, dateRange]);

  // Turnover (Chiffre d'Affaires Encaissé)
  const totalRevenueCollected = useMemo(() => {
    return filteredInvoices
      .filter(inv => inv.status === 'PAID')
      .reduce((acc, inv) => acc + (Number(inv.amount) || 0), 0);
  }, [filteredInvoices]);

  // Invoiced but Pending/Overdue
  const totalPendingInvoiced = useMemo(() => {
    return filteredInvoices
      .filter(inv => inv.status === 'PENDING' || inv.status === 'OVERDUE')
      .reduce((acc, inv) => acc + (Number(inv.amount) || 0), 0);
  }, [filteredInvoices]);

  // 3. Distribution of Subscriptions by License Tier
  const planDistribution = useMemo(() => {
    const counts: Record<string, number> = {
      DEMO: 0,
      BASIC: 0,
      STANDARD: 0,
      PREMIUM: 0,
      ENTERPRISE: 0
    };
    clinics.forEach(c => {
      const p = (c.licenseType || 'STANDARD').toUpperCase();
      if (counts[p] !== undefined) counts[p]++;
      else counts[p] = (counts[p] || 0) + 1;
    });
    return counts;
  }, [clinics]);

  // 4. Recent Payment Transactions
  const recentPayments = useMemo(() => {
    return [...invoices]
      .sort((a, b) => new Date(b.paidDate || b.dueDate || '').getTime() - new Date(a.paidDate || a.dueDate || '').getTime())
      .slice(0, 5);
  }, [invoices]);

  const formatFCFA = (val: number) => {
    return `${val.toLocaleString('fr-FR')} FCFA`;
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      
      {/* COMPACT HEADER & TIME FILTER BAR */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-gradient-to-b from-[#161a29] to-[#0f121d] border border-white/15 px-4 py-3 rounded-2xl shadow-[0_10px_28px_rgba(0,0,0,0.5),inset_0_1px_0_0_rgba(255,255,255,0.16)]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-rose-500/20 border border-rose-400/30 flex items-center justify-center text-rose-300 shrink-0">
            <BarChart3 size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-extrabold text-white tracking-tight">Synthèse de l'Activité Commerciale</h2>
              <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest bg-rose-500/20 text-rose-300 border border-rose-500/30">
                Cockpit Exécutif
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-medium">Données temps réel de la plateforme multi-tenant</p>
          </div>
        </div>

        {/* Temporal Filters */}
        <div className="flex flex-wrap items-center gap-1.5 bg-slate-950/70 p-1 rounded-xl border border-white/10">
          <button
            onClick={() => setTimeFilter('THIS_MONTH')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              timeFilter === 'THIS_MONTH' ? 'bg-rose-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
            }`}
          >
            Mois en cours
          </button>
          <button
            onClick={() => setTimeFilter('LAST_MONTH')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              timeFilter === 'LAST_MONTH' ? 'bg-rose-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
            }`}
          >
            Mois précédent
          </button>
          <button
            onClick={() => setTimeFilter('THIS_YEAR')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              timeFilter === 'THIS_YEAR' ? 'bg-rose-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
            }`}
          >
            Année en cours
          </button>
          <button
            onClick={() => setTimeFilter('ALL')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              timeFilter === 'ALL' ? 'bg-rose-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
            }`}
          >
            Tout l'historique
          </button>
          <button
            onClick={() => setTimeFilter('CUSTOM')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              timeFilter === 'CUSTOM' ? 'bg-rose-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
            }`}
          >
            Personnalisé
          </button>
        </div>
      </div>

      {/* CUSTOM DATE SELECTOR IF ACTIVE */}
      {timeFilter === 'CUSTOM' && (
        <div className="flex flex-wrap items-center gap-4 bg-slate-900/40 border border-white/5 p-4 rounded-2xl">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-400">Du :</span>
            <input 
              type="date"
              value={customStartDate}
              onChange={(e) => setCustomStartDate(e.target.value)}
              className="bg-slate-950 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-rose-500"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-400">Au :</span>
            <input 
              type="date"
              value={customEndDate}
              onChange={(e) => setCustomEndDate(e.target.value)}
              className="bg-slate-950 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-rose-500"
            />
          </div>
        </div>
      )}

      {/* TOP ROW: PLATFORM COMMERCIAL KPIS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Total Structures */}
        <div 
          onClick={() => onNavigateToTab('USERS')}
          className="bg-slate-900/50 border border-white/10 hover:border-rose-500/50 p-5 rounded-3xl relative overflow-hidden group cursor-pointer transition-all"
        >
          <div className="flex justify-between items-start">
            <div className="p-3 bg-blue-500/10 text-blue-400 rounded-2xl border border-blue-500/20">
              <Building2 size={24} />
            </div>
            <span className="text-xs font-bold text-slate-400 group-hover:text-white flex items-center gap-1">
              Gérer <ArrowRight size={12} />
            </span>
          </div>
          <p className="text-xs uppercase font-black text-slate-400 tracking-wider mt-4">Structures Enregistrées</p>
          <div className="flex items-baseline gap-2 mt-1">
            <h3 className="text-3xl font-extrabold text-white">{totalClinics}</h3>
            <span className="text-xs text-emerald-400 font-bold">{activeClinics.length} actives</span>
          </div>
          <div className="mt-2 flex items-center gap-2 text-[11px] text-slate-400">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>Cliniques, centres et hôpitaux</span>
          </div>
        </div>

        {/* Active vs Expired Licenses */}
        <div 
          onClick={() => onNavigateToTab('LICENSES')}
          className="bg-slate-900/50 border border-white/10 hover:border-emerald-500/50 p-5 rounded-3xl relative overflow-hidden group cursor-pointer transition-all"
        >
          <div className="flex justify-between items-start">
            <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-2xl border border-emerald-500/20">
              <ShieldCheck size={24} />
            </div>
            <span className="text-xs font-bold text-slate-400 group-hover:text-white flex items-center gap-1">
              Licences <ArrowRight size={12} />
            </span>
          </div>
          <p className="text-xs uppercase font-black text-slate-400 tracking-wider mt-4">Licences Actives</p>
          <div className="flex items-baseline gap-2 mt-1">
            <h3 className="text-3xl font-extrabold text-emerald-400">{activeClinics.length}</h3>
            <span className="text-xs text-rose-400 font-bold">{expiredClinics.length} expirée(s)</span>
          </div>
          <div className="mt-2 text-[11px] text-amber-400 flex items-center gap-1.5 font-bold">
            <Clock size={12} />
            <span>{expiringSoonClinics.length} arrive(nt) à expiration sous 30 j</span>
          </div>
        </div>

        {/* Chiffre d'Affaires Encaissé */}
        <div 
          onClick={() => onNavigateToTab('FINANCES')}
          className="bg-slate-900/50 border border-white/10 hover:border-rose-500/50 p-5 rounded-3xl relative overflow-hidden group cursor-pointer transition-all"
        >
          <div className="flex justify-between items-start">
            <div className="p-3 bg-rose-500/10 text-rose-400 rounded-2xl border border-rose-500/20">
              <DollarSign size={24} />
            </div>
            <span className="text-xs font-bold text-slate-400 group-hover:text-white flex items-center gap-1">
              Finances <ArrowRight size={12} />
            </span>
          </div>
          <p className="text-xs uppercase font-black text-slate-400 tracking-wider mt-4">CA Abonnements Encaissé</p>
          <div className="flex items-baseline gap-2 mt-1">
            <h3 className="text-2xl font-extrabold text-white">{totalRevenueCollected.toLocaleString('fr-FR')}</h3>
            <span className="text-xs text-rose-400 font-black">FCFA</span>
          </div>
          <div className="mt-2 text-[11px] text-slate-400 flex items-center gap-1">
            <span>En attente : </span>
            <span className="font-bold text-amber-400">{totalPendingInvoiced.toLocaleString('fr-FR')} FCFA</span>
          </div>
        </div>

        {/* Utilisateurs Plateforme & Hôpitaux */}
        <div 
          onClick={() => onNavigateToTab('USERS')}
          className="bg-slate-900/50 border border-white/10 hover:border-purple-500/50 p-5 rounded-3xl relative overflow-hidden group cursor-pointer transition-all"
        >
          <div className="flex justify-between items-start">
            <div className="p-3 bg-purple-500/10 text-purple-400 rounded-2xl border border-purple-500/20">
              <Users size={24} />
            </div>
            <span className="text-xs font-bold text-slate-400 group-hover:text-white flex items-center gap-1">
              Comptes <ArrowRight size={12} />
            </span>
          </div>
          <p className="text-xs uppercase font-black text-slate-400 tracking-wider mt-4">Comptes & Sièges Licences</p>
          <div className="flex items-baseline gap-2 mt-1">
            <h3 className="text-3xl font-extrabold text-white">{totalHospitalUsersCount}</h3>
            <span className="text-xs text-purple-300 font-bold">/ {totalUserSeatCapacity} sièges autorisés</span>
          </div>
          <div className="mt-2 text-[11px] text-slate-400 font-bold flex items-center justify-between">
            <span>+{superAdminsCount} Super Admins plateforme</span>
            <span className="text-emerald-400">{totalUserSeatCapacity > 0 ? Math.round((totalHospitalUsersCount / totalUserSeatCapacity) * 100) : 0}% occupé</span>
          </div>
        </div>

      </div>

      {/* SECOND ROW: PLAN DISTRIBUTION & EXPIRING WARNINGS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Plan Distribution (2 cols) */}
        <div className="lg:col-span-2 bg-slate-900/50 border border-white/10 p-6 rounded-3xl backdrop-blur-xl">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-rose-500/10 text-rose-400 rounded-xl">
                <BarChart3 size={20} />
              </div>
              <div>
                <h3 className="text-base font-black text-white">Répartition des Abonnements par Formule</h3>
                <p className="text-xs text-slate-400">Distribution contractuelle des structures enregistrées</p>
              </div>
            </div>
            <button 
              onClick={() => onNavigateToTab('LICENSES')}
              className="text-xs font-bold text-rose-400 hover:text-rose-300 transition-colors"
            >
              Gérer le catalogue →
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            {Object.keys(effectivePlans).map((planKey) => {
              const plan = effectivePlans[planKey as SaaSPlanId] || SAAS_PLANS[planKey as SaaSPlanId] || SAAS_PLANS.STANDARD;
              const count = planDistribution[planKey] || 0;
              const percentage = totalClinics > 0 ? Math.round((count / totalClinics) * 100) : 0;

              return (
                <div key={planKey} className="bg-slate-950/60 border border-white/5 p-4 rounded-2xl flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between gap-1 mb-2">
                      <span className={`inline-block px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider border ${plan.badgeColor}`}>
                        {plan.id}
                      </span>
                      <span className="text-[9px] font-extrabold text-emerald-400">
                        ≤{plan.max_users || 5} util.
                      </span>
                    </div>
                    <p className="text-xs font-bold text-slate-300 line-clamp-1">{(plan.label || plan.id).split('(')[0]}</p>
                  </div>
                  <div className="mt-4">
                    <div className="flex items-baseline justify-between">
                      <span className="text-2xl font-black text-white">{count}</span>
                      <span className="text-[10px] text-slate-500 font-bold">{percentage}%</span>
                    </div>
                    {/* Progress bar */}
                    <div className="w-full bg-slate-800 h-1.5 rounded-full mt-2 overflow-hidden">
                      <div 
                        className="bg-rose-500 h-full rounded-full transition-all duration-500" 
                        style={{ width: `${percentage}%` }}
                      ></div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Expiring Soon Watchlist (1 col) */}
        <div className="bg-slate-900/50 border border-white/10 p-6 rounded-3xl backdrop-blur-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-amber-500/10 text-amber-400 rounded-xl">
                <AlertTriangle size={20} />
              </div>
              <div>
                <h3 className="text-base font-black text-white">Échéances à Proximité</h3>
                <p className="text-xs text-slate-400">Licences arrivant à expiration sous 30 jours</p>
              </div>
            </div>

            {expiringSoonClinics.length === 0 ? (
              <div className="text-center py-8">
                <CheckCircle2 size={36} className="text-emerald-400 mx-auto mb-2 opacity-60" />
                <p className="text-xs font-bold text-slate-400">Aucune licence n'expire dans les 30 prochains jours.</p>
                <p className="text-[10px] text-slate-500 mt-1">Toutes les structures actives sont à jour.</p>
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[220px] overflow-y-auto pr-1">
                {expiringSoonClinics.map(c => {
                  const end = new Date(c.licenseEnd);
                  const diffDays = Math.ceil((end.getTime() - now.getTime()) / (1000 * 3600 * 24));
                  return (
                    <div key={c.id} className="bg-slate-950/60 border border-amber-500/20 p-3 rounded-2xl flex items-center justify-between">
                      <div>
                        <p className="text-xs font-bold text-white">{c.name}</p>
                        <p className="text-[10px] text-slate-400">{c.city}, {c.country} • Formule {c.licenseType}</p>
                      </div>
                      <div className="text-right">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-500/20 text-amber-300 border border-amber-500/30">
                          {diffDays} jour{diffDays > 1 ? 's' : ''}
                        </span>
                        <p className="text-[9px] text-slate-500 mt-0.5 font-bold">{c.licenseEnd}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <button 
            onClick={() => onNavigateToTab('FINANCES')}
            className="w-full mt-4 py-2.5 bg-white/5 hover:bg-white/10 text-white rounded-xl text-xs font-bold transition-all text-center border border-white/5"
          >
            Voir les transactions & renouvellements →
          </button>
        </div>

      </div>

      {/* THIRD ROW: RECENT SUBSCRIPTION INVOICES & PAYMENTS */}
      <div className="bg-slate-900/50 border border-white/10 p-6 rounded-3xl backdrop-blur-xl">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-xl">
              <CreditCard size={20} />
            </div>
            <div>
              <h3 className="text-base font-black text-white">Derniers Encaissements & Factures SaaS</h3>
              <p className="text-xs text-slate-400">Historique des transactions d'abonnement plateforme</p>
            </div>
          </div>
          <button 
            onClick={() => onNavigateToTab('FINANCES')}
            className="text-xs font-bold text-rose-400 hover:text-rose-300 transition-colors"
          >
            Consulter toutes les transactions ({invoices.length}) →
          </button>
        </div>

        {recentPayments.length === 0 ? (
          <div className="text-center py-10 bg-slate-950/40 rounded-2xl border border-white/5">
            <CreditCard size={36} className="text-slate-600 mx-auto mb-2" />
            <p className="text-xs font-bold text-slate-400">Aucune transaction d'abonnement enregistrée pour l'instant.</p>
            <p className="text-[10px] text-slate-500 mt-1">Créez votre première structure ou enregistrez un encaissement dans Paramètres Financiers.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-white/5 text-[10px] font-black text-slate-400 uppercase tracking-wider">
                  <th className="pb-3 pl-2">Réf / Facture</th>
                  <th className="pb-3">Structure Cliente</th>
                  <th className="pb-3">Formule</th>
                  <th className="pb-3">Date</th>
                  <th className="pb-3">Statut</th>
                  <th className="pb-3 text-right pr-2">Montant</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-xs">
                {recentPayments.map(inv => {
                  const isPaid = inv.status === 'PAID';
                  return (
                    <tr key={inv.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="py-3 pl-2 font-mono font-bold text-slate-300">
                        {inv.id}
                      </td>
                      <td className="py-3 font-bold text-white">
                        {inv.clinicName}
                      </td>
                      <td className="py-3">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-300">
                          {inv.plan}
                        </span>
                      </td>
                      <td className="py-3 text-slate-400">
                        {inv.paidDate || inv.dueDate || 'N/A'}
                      </td>
                      <td className="py-3">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black ${
                          isPaid 
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                            : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                        }`}>
                          {isPaid ? <CheckCircle2 size={10} /> : <Clock size={10} />}
                          {isPaid ? 'PAYÉ' : 'EN ATTENTE'}
                        </span>
                      </td>
                      <td className="py-3 text-right pr-2 font-black text-white">
                        {formatFCFA(Number(inv.amount) || 0)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
};
