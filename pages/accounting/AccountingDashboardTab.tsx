import React from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  AlertCircle, 
  Truck, 
  Users, 
  Landmark, 
  ShieldCheck, 
  Calendar, 
  CheckCircle, 
  ArrowRight,
  Clock,
  Building,
  Wallet,
  Pill,
  Eye,
  Printer
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  AreaChart, 
  Area, 
  BarChart, 
  Bar, 
  Cell, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend 
} from 'recharts';
import { CashierSession, CashierTransaction, DettePatient, AvoirPatient, Supplier, SupplierInvoice } from '../../types';

interface AccountingDashboardTabProps {
  sessions: CashierSession[];
  transactions: CashierTransaction[];
  dettes: DettePatient[];
  avoirs: AvoirPatient[];
  suppliers: Supplier[];
  supplierInvoices: SupplierInvoice[];
  currency?: string;
  onNavigateTab: (tab: 'tresorerie' | 'creances' | 'depenses' | 'fournisseurs') => void;
  onOpenSessionSlip: (session: CashierSession) => void;
  onOpenSessionTransactions?: (session: CashierSession) => void;
}

export const AccountingDashboardTab: React.FC<AccountingDashboardTabProps> = ({
  sessions,
  transactions,
  dettes,
  avoirs,
  suppliers,
  supplierInvoices,
  currency = 'FCFA',
  onNavigateTab,
  onOpenSessionSlip,
  onOpenSessionTransactions
}) => {
  // 1. LIVE KPIS - Pure live aggregation, 0 if DB is empty
  const closedSessions = sessions.filter(s => s.status === 'CLOSED');

  // Total Revenue: sum from closed cashier sessions or validated transactions
  const totalRevenue = closedSessions.length > 0 
    ? closedSessions.reduce((acc, s) => acc + (Number(s.totalCollected) || 0), 0)
    : transactions.reduce((acc, t) => acc + (Number(t.amount) || 0), 0);

  // Total Client Receivables (Unpaid Patient Debts)
  const pendingDebts = dettes.filter(d => d.status === 'PENDING' || d.status === 'PARTIAL');
  const totalClientDebts = pendingDebts.reduce((acc, d) => acc + (Number(d.montantRestant) || 0), 0);
  const debtorCount = new Set(pendingDebts.map(d => d.patientId)).size;

  // Total Supplier Payables
  const pendingInvoices = supplierInvoices.filter(i => i.status === 'PENDING' || i.status === 'PARTIAL');
  const totalSupplierPayablesFromInvoices = pendingInvoices.reduce((acc, i) => acc + (Number(i.totalAmount || 0) - Number(i.amountPaid || 0)), 0);
  const totalSupplierPayablesFromSuppliers = suppliers.reduce((acc, s) => acc + (Number(s.outstandingDebt || s.balance || 0)), 0);
  const totalSupplierPayables = Math.max(totalSupplierPayablesFromInvoices, totalSupplierPayablesFromSuppliers);

  // Total Client Advances (Available Avoirs)
  const availableAvoirs = avoirs.filter(a => a.status === 'AVAILABLE');
  const totalClientAdvances = availableAvoirs.reduce((acc, a) => acc + (Number(a.montant) || 0), 0);

  // 2. LIVE PAYMENT METHODS BREAKDOWN
  const paymentMethodsData = React.useMemo(() => {
    let cash = 0;
    let mobile = 0;
    let card = 0;
    let transfer = 0;
    let avoir = 0;

    if (closedSessions.length > 0) {
      closedSessions.forEach(s => {
        cash += Number(s.totalCash || 0);
        mobile += Number(s.totalMobileMoney || 0);
        card += Number(s.totalCard || 0);
        transfer += (Number(s.totalTransfer || 0) + Number(s.totalCheck || 0));
        avoir += Number(s.totalAvoirUsed || 0);
      });
    } else {
      transactions.forEach(t => {
        const m = (t.paymentMethod || '').toUpperCase();
        const amt = Number(t.amount || 0);
        if (m === 'CASH' || m === 'ESPECES') cash += amt;
        else if (m === 'MOBILE_MONEY' || m === 'WAVE' || m === 'ORANGE_MONEY') mobile += amt;
        else if (m === 'CARD' || m === 'CARTE') card += amt;
        else if (m === 'TRANSFER' || m === 'CHECK' || m === 'VIREMENT') transfer += amt;
        else cash += amt;
      });
    }

    return [
      { name: 'Espèces', montant: cash, color: '#10b981' },
      { name: 'Mobile Money', montant: mobile, color: '#3b82f6' },
      { name: 'Cartes Bancaires', montant: card, color: '#8b5cf6' },
      { name: 'Virements / Chèques', montant: transfer, color: '#f59e0b' },
      { name: 'Avances / Avoirs', montant: avoir, color: '#6366f1' },
    ].filter(item => item.montant > 0);
  }, [closedSessions, transactions]);

  // 3. LIVE DAILY REVENUE EVOLUTION (Grouped by date)
  const dailyRevenueData = React.useMemo(() => {
    const map = new Map<string, number>();

    if (closedSessions.length > 0) {
      closedSessions.forEach(s => {
        const dateKey = (s.closedAt || s.openedAt || '').slice(0, 10);
        if (dateKey) {
          map.set(dateKey, (map.get(dateKey) || 0) + (Number(s.totalCollected) || 0));
        }
      });
    } else {
      transactions.forEach(t => {
        const dateKey = (t.timestamp || t.date || '').slice(0, 10);
        if (dateKey) {
          map.set(dateKey, (map.get(dateKey) || 0) + (Number(t.amount) || 0));
        }
      });
    }

    const sortedDates = Array.from(map.keys()).sort();
    if (sortedDates.length === 0) {
      return [];
    }

    return sortedDates.slice(-7).map(date => {
      const [year, month, day] = date.split('-');
      return {
        date: `${day}/${month}`,
        recettes: map.get(date) || 0
      };
    });
  }, [closedSessions, transactions]);

  // 4. LIVE SERVICE REVENUE DISTRIBUTION (from transactions)
  const serviceDistributionData = React.useMemo(() => {
    const map = new Map<string, number>();
    transactions.forEach(t => {
      const service = t.service || t.department || 'Pharmacie & Soins';
      map.set(service, (map.get(service) || 0) + (Number(t.amount) || 0));
    });

    const entries = Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    return entries.slice(0, 5);
  }, [transactions]);

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      
      {/* Top Automated Audit Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 border border-slate-700/60 rounded-3xl p-6 text-white shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 w-96 h-full bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 rounded-full text-xs font-bold">
              <ShieldCheck size={14} /> Synchronisation Comptable Live
            </div>
            <h2 className="text-xl md:text-2xl font-black tracking-tight text-white mt-1">
              Tableau de Bord Financier Hospitalier
            </h2>
            <p className="text-xs text-slate-300 font-medium max-w-2xl">
              Agrégation en temps réel des encaissements de caisse, du poste clients (créances et avances) et des dettes fournisseurs adossées aux réapprovisionnements.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="bg-slate-800/80 border border-slate-700 p-3 rounded-2xl text-right">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Sessions Validées</span>
              <span className="font-mono font-black text-emerald-400 text-base">{closedSessions.length} clôtures</span>
            </div>
            <div className="bg-slate-800/80 border border-slate-700 p-3 rounded-2xl text-right">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Opérations Caisse</span>
              <span className="font-mono font-black text-blue-400 text-base">{transactions.length} reçus</span>
            </div>
          </div>
        </div>
      </div>

      {/* 4 CORE KPI CARDS - Strictly Real Data */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        
        {/* Card 1: Chiffre d'Affaires Encaissé */}
        <div 
          onClick={() => onNavigateTab('tresorerie')}
          className="bg-white p-5 rounded-3xl border border-slate-200/80 hover:border-emerald-500 shadow-sm hover:shadow-md transition-all cursor-pointer group relative overflow-hidden"
        >
          <div className="flex justify-between items-start mb-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Landmark size={22} />
            </div>
            <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
              Caisse Validée
            </span>
          </div>
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
            Chiffre d'Affaires Encaissé
          </span>
          <div className="text-2xl font-black text-slate-900 font-mono mt-1">
            {totalRevenue.toLocaleString()} <span className="text-sm font-bold text-slate-500">{currency}</span>
          </div>
          <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500 pt-3 border-t border-slate-100">
            <span>{closedSessions.length} clôture{closedSessions.length > 1 ? 's' : ''} officielle{closedSessions.length > 1 ? 's' : ''}</span>
            <span className="text-emerald-600 font-bold group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5">
              Trésorerie <ArrowRight size={12} />
            </span>
          </div>
        </div>

        {/* Card 2: Créances Patients en Cours */}
        <div 
          onClick={() => onNavigateTab('creances')}
          className="bg-white p-5 rounded-3xl border border-slate-200/80 hover:border-rose-400 shadow-sm hover:shadow-md transition-all cursor-pointer group relative overflow-hidden"
        >
          <div className="flex justify-between items-start mb-3">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center group-hover:scale-110 transition-transform">
              <AlertCircle size={22} />
            </div>
            <span className="text-[10px] font-black uppercase tracking-wider text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
              {debtorCount} Débiteur{debtorCount > 1 ? 's' : ''}
            </span>
          </div>
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
            Créances & Dettes Clients
          </span>
          <div className="text-2xl font-black text-rose-600 font-mono mt-1">
            {totalClientDebts.toLocaleString()} <span className="text-sm font-bold text-slate-500">{currency}</span>
          </div>
          <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500 pt-3 border-t border-slate-100">
            <span>{pendingDebts.length} facture{pendingDebts.length > 1 ? 's' : ''} différée{pendingDebts.length > 1 ? 's' : ''}</span>
            <span className="text-rose-600 font-bold group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5">
              Recouvrement <ArrowRight size={12} />
            </span>
          </div>
        </div>

        {/* Card 3: Dépenses & Dettes Fournisseurs (Payables) */}
        <div 
          onClick={() => onNavigateTab('depenses')}
          className="bg-white p-5 rounded-3xl border border-slate-200/80 hover:border-amber-400 shadow-sm hover:shadow-md transition-all cursor-pointer group relative overflow-hidden"
        >
          <div className="flex justify-between items-start mb-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Truck size={22} />
            </div>
            <span className="text-[10px] font-black uppercase tracking-wider text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
              {suppliers.length} Fournisseur{suppliers.length > 1 ? 's' : ''}
            </span>
          </div>
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
            Dépenses & Dettes Fournisseurs
          </span>
          <div className="text-2xl font-black text-amber-600 font-mono mt-1">
            {totalSupplierPayables.toLocaleString()} <span className="text-sm font-bold text-slate-500">{currency}</span>
          </div>
          <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500 pt-3 border-t border-slate-100">
            <span>{pendingInvoices.length} facture{pendingInvoices.length > 1 ? 's' : ''} à payer</span>
            <span className="text-amber-600 font-bold group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5">
              Achats <ArrowRight size={12} />
            </span>
          </div>
        </div>

        {/* Card 4: Avances & Avoirs Patients */}
        <div 
          onClick={() => onNavigateTab('creances')}
          className="bg-white p-5 rounded-3xl border border-slate-200/80 hover:border-indigo-400 shadow-sm hover:shadow-md transition-all cursor-pointer group relative overflow-hidden"
        >
          <div className="flex justify-between items-start mb-3">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Wallet size={22} />
            </div>
            <span className="text-[10px] font-black uppercase tracking-wider text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-200">
              {availableAvoirs.length} Avoir{availableAvoirs.length > 1 ? 's' : ''}
            </span>
          </div>
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
            Avances & Avoirs Clients
          </span>
          <div className="text-2xl font-black text-indigo-600 font-mono mt-1">
            {totalClientAdvances.toLocaleString()} <span className="text-sm font-bold text-slate-500">{currency}</span>
          </div>
          <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500 pt-3 border-t border-slate-100">
            <span>Soldes en réserve hospitalière</span>
            <span className="text-indigo-600 font-bold group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5">
              Comptes <ArrowRight size={12} />
            </span>
          </div>
        </div>

      </div>

      {/* CHARTS SECTION - 100% Real Live Queries */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Live AreaChart: Daily Revenue Evolution */}
        <div className="lg:col-span-2 bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h3 className="text-sm font-black uppercase tracking-wider text-slate-900 flex items-center gap-2">
                <TrendingUp size={16} className="text-emerald-600" /> Évolution des Recettes Validées (7 Derniers Jours)
              </h3>
              <p className="text-xs text-slate-500">Chiffre d'affaires journalier issu des clôtures de caisse</p>
            </div>
            <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-xl border border-emerald-100">
              Live DB
            </span>
          </div>

          {dailyRevenueData.length > 0 ? (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dailyRevenueData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorRecettes" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.4}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} tickLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} tickFormatter={(val) => `${(val / 1000).toFixed(0)}k`} />
                  <Tooltip 
                    formatter={(val: any) => [`${Number(val).toLocaleString()} ${currency}`, 'Recettes']}
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px', color: '#fff' }}
                  />
                  <Area type="monotone" dataKey="recettes" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorRecettes)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-64 flex flex-col items-center justify-center text-slate-400 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200 p-6 text-center">
              <Clock size={32} className="text-slate-300 mb-2" />
              <p className="text-xs font-bold text-slate-600">Aucune recette enregistrée pour l'instant</p>
              <p className="text-[11px] text-slate-400 mt-1 max-w-sm">
                Dès qu'une session de caisse sera clôturée ou qu'un règlement sera validé en caisse, la courbe s'affichera ici.
              </p>
            </div>
          )}
        </div>

        {/* Live Breakdown by Payment Method */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm flex flex-col">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h3 className="text-sm font-black uppercase tracking-wider text-slate-900">
                Modes de Règlement
              </h3>
              <p className="text-xs text-slate-500">Ventilation réelle des flux</p>
            </div>
          </div>

          {paymentMethodsData.length > 0 ? (
            <div className="space-y-3 my-auto">
              {paymentMethodsData.map((item) => {
                const total = paymentMethodsData.reduce((s, i) => s + i.montant, 0);
                const percent = total > 0 ? Math.round((item.montant / total) * 100) : 0;
                return (
                  <div key={item.name} className="space-y-1">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-bold text-slate-700 flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                        {item.name}
                      </span>
                      <span className="font-mono font-bold text-slate-900">
                        {item.montant.toLocaleString()} {currency} ({percent}%)
                      </span>
                    </div>
                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div 
                        className="h-full rounded-full transition-all duration-500" 
                        style={{ width: `${percent}%`, backgroundColor: item.color }} 
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="my-auto flex flex-col items-center justify-center text-slate-400 py-12 text-center">
              <DollarSign size={32} className="text-slate-300 mb-2" />
              <p className="text-xs font-bold text-slate-600">0 F Encaissé</p>
              <p className="text-[11px] text-slate-400 mt-1">Base de données à 0 CFA</p>
            </div>
          )}

          <div className="pt-4 border-t border-slate-100 mt-4 text-[11px] text-slate-400 flex justify-between items-center">
            <span>Règlements enregistrés</span>
            <span className="font-bold text-slate-700 font-mono">{transactions.length} reçus</span>
          </div>
        </div>

      </div>

      {/* RECENT OPERATIONAL ACTIVITY (Sessions & Supplier Invoices) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Recent Closed Sessions */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h3 className="text-sm font-black uppercase tracking-wider text-slate-900 flex items-center gap-2">
                <Landmark size={16} className="text-emerald-600" /> Dernières Clôtures de Caisse (Bordereaux)
              </h3>
              <p className="text-xs text-slate-500">Sessions de caisse arrêtées et certifiées</p>
            </div>
            <button
              onClick={() => onNavigateTab('tresorerie')}
              className="text-xs font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-1"
            >
              Voir tout <ArrowRight size={12} />
            </button>
          </div>

          {closedSessions.length > 0 ? (
            <div className="divide-y divide-slate-100">
              {closedSessions.slice(0, 4).map((session) => (
                <div 
                  key={session.id}
                  onClick={() => onOpenSessionTransactions ? onOpenSessionTransactions(session) : onOpenSessionSlip(session)}
                  className="py-3.5 flex items-center justify-between hover:bg-slate-50 px-2 rounded-2xl cursor-pointer transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold text-xs shrink-0 group-hover:scale-105 transition-transform">
                      <ShieldCheck size={18} />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-900 group-hover:text-emerald-600 transition-colors">
                        {session.cashierName || 'Caissier'}
                      </p>
                      <p className="text-[10px] text-slate-400 font-mono">
                        {session.closedAt ? new Date(session.closedAt).toLocaleString('fr-FR') : 'Date N/A'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="font-mono font-black text-slate-900 text-xs">
                        {Number(session.totalCollected || 0).toLocaleString()} {currency}
                      </p>
                      <p className="text-[10px] text-slate-400">
                        {Number(session.totalTransactions || 0)} acte{Number(session.totalTransactions || 0) > 1 ? 's' : ''}
                      </p>
                    </div>
                    
                    <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                      {onOpenSessionTransactions && (
                        <button
                          onClick={() => onOpenSessionTransactions(session)}
                          className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-600 text-emerald-800 hover:text-white rounded-lg text-[10px] font-black inline-flex items-center gap-1 transition-all border border-emerald-200 cursor-pointer"
                          title="Voir les transactions détaillées de cette session"
                        >
                          <Eye size={12} />
                          <span>Détails</span>
                        </button>
                      )}
                      <button
                        onClick={() => onOpenSessionSlip(session)}
                        className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-800 hover:text-white text-slate-700 rounded-lg text-[10px] font-black inline-flex items-center gap-1 transition-all border border-slate-200 cursor-pointer"
                        title="Consulter le bordereau officiel de clôture"
                      >
                        <Printer size={12} />
                        <span>Bordereau</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center bg-slate-50/60 rounded-2xl border border-dashed border-slate-200">
              <p className="text-xs font-bold text-slate-500">Aucune clôture de caisse enregistrée</p>
              <p className="text-[11px] text-slate-400 mt-1">Les bordereaux s'afficheront dès qu'une session sera close.</p>
            </div>
          )}
        </div>

        {/* Recent Supplier Restock Invoices */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h3 className="text-sm font-black uppercase tracking-wider text-slate-900 flex items-center gap-2">
                <Truck size={16} className="text-amber-600" /> Factures Achats & Réapprovisionnements
              </h3>
              <p className="text-xs text-slate-500">Générées automatiquement lors des livraisons de stock</p>
            </div>
            <button
              onClick={() => onNavigateTab('depenses')}
              className="text-xs font-bold text-amber-600 hover:text-amber-700 flex items-center gap-1 cursor-pointer"
            >
              Voir tout <ArrowRight size={12} />
            </button>
          </div>

          {supplierInvoices.length > 0 ? (
            <div className="divide-y divide-slate-100">
              {supplierInvoices.slice(0, 4).map((invoice) => (
                <div key={invoice.id} className="py-3 flex items-center justify-between hover:bg-slate-50 px-2 rounded-xl transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold text-xs">
                      <Pill size={16} />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-900">
                        {invoice.supplierName}
                      </p>
                      <p className="text-[10px] text-slate-400 font-mono">
                        {invoice.invoiceNumber} • {invoice.date ? new Date(invoice.date).toLocaleDateString('fr-FR') : '-'}
                      </p>
                    </div>
                  </div>

                  <div className="text-right">
                    <p className="font-mono font-black text-slate-900 text-xs">
                      {Number(invoice.totalAmount || 0).toLocaleString()} {currency}
                    </p>
                    <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-md ${
                      invoice.status === 'PAID' 
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                        : 'bg-rose-50 text-rose-700 border border-rose-200'
                    }`}>
                      {invoice.status === 'PAID' ? 'Réglé' : 'À régler'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center bg-slate-50/60 rounded-2xl border border-dashed border-slate-200">
              <p className="text-xs font-bold text-slate-500">Aucune facture d'achat fournisseur</p>
              <p className="text-[11px] text-slate-400 mt-1">Chaque réapprovisionnement pharmacie génère automatiquement une facture ici.</p>
            </div>
          )}
        </div>

      </div>

    </div>
  );
};
