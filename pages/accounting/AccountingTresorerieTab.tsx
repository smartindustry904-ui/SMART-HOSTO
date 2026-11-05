import React, { useState, useMemo } from 'react';
import { 
  Landmark, 
  ShieldCheck, 
  Calendar, 
  Filter, 
  DollarSign, 
  Smartphone, 
  CreditCard, 
  Wallet, 
  AlertTriangle, 
  Eye, 
  Printer, 
  CheckCircle,
  FileSpreadsheet,
  Lock,
  ArrowUpDown,
  Receipt
} from 'lucide-react';
import { CashierSession, CashierTransaction, Patient } from '../../types';
import { SessionTransactionsModal } from './SessionTransactionsModal';

interface AccountingTresorerieTabProps {
  sessions: CashierSession[];
  transactions: CashierTransaction[];
  patients?: Patient[];
  currency?: string;
  onOpenSessionSlip: (session: CashierSession) => void;
}

export const AccountingTresorerieTab: React.FC<AccountingTresorerieTabProps> = ({
  sessions,
  transactions,
  patients = [],
  currency = 'FCFA',
  onOpenSessionSlip
}) => {
  const [periodFilter, setPeriodFilter] = useState<'TODAY' | 'WEEK' | 'MONTH' | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSessionForTransactions, setSelectedSessionForTransactions] = useState<CashierSession | null>(null);

  // 1. Filtered closed sessions
  const filteredSessions = useMemo(() => {
    const closedOnly = sessions.filter(s => s.status === 'CLOSED');
    const now = new Date();

    return closedOnly.filter(s => {
      // Date filter
      if (periodFilter !== 'ALL') {
        const sessionDate = new Date(s.closedAt || s.openedAt || '');
        if (isNaN(sessionDate.getTime())) return true;

        if (periodFilter === 'TODAY') {
          if (sessionDate.toDateString() !== now.toDateString()) return false;
        } else if (periodFilter === 'WEEK') {
          const sevenDaysAgo = new Date();
          sevenDaysAgo.setDate(now.getDate() - 7);
          if (sessionDate < sevenDaysAgo) return false;
        } else if (periodFilter === 'MONTH') {
          if (sessionDate.getMonth() !== now.getMonth() || sessionDate.getFullYear() !== now.getFullYear()) return false;
        }
      }

      // Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesCashier = (s.cashierName || '').toLowerCase().includes(q);
        const matchesId = (s.id || s.sessionNumber || '').toLowerCase().includes(q);
        if (!matchesCashier && !matchesId) return false;
      }

      return true;
    });
  }, [sessions, periodFilter, searchQuery]);

  // 2. Pure live aggregated totals from filtered sessions
  const aggregatedTotals = useMemo(() => {
    let totalCollected = 0;
    let totalCash = 0;
    let totalMobile = 0;
    let totalCardAndTransfer = 0;
    let totalAvoirUsed = 0;
    let totalDifference = 0;

    filteredSessions.forEach(s => {
      totalCollected += Number(s.totalCollected || 0);
      totalCash += Number(s.actualCashInHand || s.totalCash || 0);
      totalMobile += Number(s.totalMobileMoney || 0);
      totalCardAndTransfer += (Number(s.totalCard || 0) + Number(s.totalTransfer || 0) + Number(s.totalCheck || 0));
      totalAvoirUsed += Number(s.totalAvoirUsed || 0);
      totalDifference += Number(s.difference || 0);
    });

    return {
      totalCollected,
      totalCash,
      totalMobile,
      totalCardAndTransfer,
      totalAvoirUsed,
      totalDifference
    };
  }, [filteredSessions]);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      
      {/* Strict Read-Only Governance Banner */}
      <div className="bg-emerald-950/40 border border-emerald-500/30 rounded-3xl p-5 text-emerald-100 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
            <Lock size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-extrabold text-sm text-emerald-200 uppercase tracking-wide">
                Source Unique de Vérité : Agrégation Caisse en Lecture Seule
              </h3>
              <span className="bg-emerald-500/20 text-emerald-300 text-[10px] font-black uppercase px-2 py-0.5 rounded-full border border-emerald-500/30">
                Certifié Intègre
              </span>
            </div>
            <p className="text-xs text-emerald-300/80 mt-1 max-w-3xl leading-relaxed">
              Les recettes et flux de trésorerie sont calculés directement et exclusivement depuis les clôtures de session validées par les caissiers. Aucune modification manuelle de chiffre d'affaires n'est admise dans la vue comptable : toute régularisation doit être effectuée à la source opérationnelle (Caisse).
            </p>
          </div>
        </div>
      </div>

      {/* Filter and Period Controls */}
      <div className="bg-white p-4 rounded-3xl border border-slate-200/80 shadow-sm flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-2xl w-fit">
          <button
            onClick={() => setPeriodFilter('ALL')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
              periodFilter === 'ALL' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Tout l'historique
          </button>
          <button
            onClick={() => setPeriodFilter('TODAY')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
              periodFilter === 'TODAY' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Aujourd'hui
          </button>
          <button
            onClick={() => setPeriodFilter('WEEK')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
              periodFilter === 'WEEK' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            7 derniers jours
          </button>
          <button
            onClick={() => setPeriodFilter('MONTH')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
              periodFilter === 'MONTH' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Ce mois
          </button>
        </div>

        <div className="relative">
          <input
            type="text"
            placeholder="Rechercher par caissier ou N° session..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full sm:w-64 pl-3.5 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-emerald-500 outline-none"
          />
        </div>
      </div>

      {/* Aggregated KPI Cards for Selected Period */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        
        {/* Total Encaissé Validé */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm col-span-2 lg:col-span-1">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
            Total Encaissé Validé
          </span>
          <p className="text-xl font-black text-emerald-600 font-mono mt-1">
            {aggregatedTotals.totalCollected.toLocaleString()} <span className="text-xs font-bold text-slate-400">{currency}</span>
          </p>
          <span className="text-[10px] text-slate-400 mt-1 block">
            {filteredSessions.length} session{filteredSessions.length > 1 ? 's' : ''} close{filteredSessions.length > 1 ? 's' : ''}
          </span>
        </div>

        {/* Espèces Physiques */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block flex items-center gap-1">
            <DollarSign size={12} className="text-emerald-500" /> Espèces Comptées
          </span>
          <p className="text-lg font-black text-slate-900 font-mono mt-1">
            {aggregatedTotals.totalCash.toLocaleString()} <span className="text-xs font-bold text-slate-400">{currency}</span>
          </p>
          <span className="text-[10px] text-slate-400 mt-1 block">Physique en coffre</span>
        </div>

        {/* Mobile Money */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block flex items-center gap-1">
            <Smartphone size={12} className="text-blue-500" /> Mobile Money
          </span>
          <p className="text-lg font-black text-blue-600 font-mono mt-1">
            {aggregatedTotals.totalMobile.toLocaleString()} <span className="text-xs font-bold text-slate-400">{currency}</span>
          </p>
          <span className="text-[10px] text-slate-400 mt-1 block">Wave / Orange / Free</span>
        </div>

        {/* Cartes & Virements */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block flex items-center gap-1">
            <CreditCard size={12} className="text-purple-500" /> Cartes & Virements
          </span>
          <p className="text-lg font-black text-purple-600 font-mono mt-1">
            {aggregatedTotals.totalCardAndTransfer.toLocaleString()} <span className="text-xs font-bold text-slate-400">{currency}</span>
          </p>
          <span className="text-[10px] text-slate-400 mt-1 block">Bancaire certifié</span>
        </div>

        {/* Écart Net Constaté */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block flex items-center gap-1">
            <AlertTriangle size={12} className={aggregatedTotals.totalDifference !== 0 ? "text-amber-500" : "text-slate-400"} /> Écart Net Caisse
          </span>
          <p className={`text-lg font-black font-mono mt-1 ${
            aggregatedTotals.totalDifference === 0 
              ? 'text-emerald-600' 
              : aggregatedTotals.totalDifference < 0 
              ? 'text-rose-600' 
              : 'text-amber-600'
          }`}>
            {aggregatedTotals.totalDifference > 0 ? `+${aggregatedTotals.totalDifference.toLocaleString()}` : aggregatedTotals.totalDifference.toLocaleString()} <span className="text-xs font-bold text-slate-400">{currency}</span>
          </p>
          <span className="text-[10px] text-slate-400 mt-1 block">
            {aggregatedTotals.totalDifference === 0 ? 'Parfaitement équilibré' : 'Écart total constaté'}
          </span>
        </div>

      </div>

      {/* Main Shift Closings (Bordereaux de Caisse) Table */}
      <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <div>
            <h3 className="text-sm font-black uppercase tracking-wider text-slate-900 flex items-center gap-2">
              <Landmark size={18} className="text-emerald-600" /> Registre Officiel des Clôtures de Caisse
            </h3>
            <p className="text-xs text-slate-500">Bordereaux arrêtés avec ventilation détaillée par caissier</p>
          </div>
          <span className="text-xs font-bold text-slate-600 bg-white px-3 py-1 rounded-xl border border-slate-200 font-mono">
            {filteredSessions.length} session{filteredSessions.length > 1 ? 's' : ''}
          </span>
        </div>

        {filteredSessions.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100/75 text-slate-600 font-extrabold uppercase text-[10px] tracking-wider border-b border-slate-200">
                <tr>
                  <th className="p-4">N° Session & Date</th>
                  <th className="p-4">Caissier</th>
                  <th className="p-4 text-right">Espèces</th>
                  <th className="p-4 text-right">Mobile Money</th>
                  <th className="p-4 text-right">Carte / Virement</th>
                  <th className="p-4 text-right">Avances déduites</th>
                  <th className="p-4 text-right">Total Encaissé</th>
                  <th className="p-4 text-right">Écart</th>
                  <th className="p-4 text-center">Opérations & Bordereau</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {filteredSessions.map((session) => {
                  const diff = Number(session.difference || 0);
                  const isBalanced = Math.abs(diff) < 1;
                  const totalEnc = Number(session.totalCollected || 0);

                  return (
                    <tr 
                      key={session.id} 
                      className="hover:bg-emerald-50/40 transition-colors group cursor-pointer"
                      onClick={() => setSelectedSessionForTransactions(session)}
                      title="Cliquer pour afficher la liste détaillée des transactions de cette session"
                    >
                      <td className="p-4">
                        <p className="font-bold text-slate-900 font-mono flex items-center gap-1.5">
                          <Receipt size={13} className="text-emerald-600 shrink-0" />
                          <span>{session.id?.slice(0, 16) || 'SESSION'}</span>
                        </p>
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          {session.closedAt ? new Date(session.closedAt).toLocaleString('fr-FR') : '-'}
                        </p>
                      </td>

                      <td className="p-4">
                        <span className="font-bold text-slate-900 block">
                          {session.cashierName || 'Caissier'}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {session.transactionCount || (session as any).totalTransactionsCount || 0} opérations
                        </span>
                      </td>

                      <td className="p-4 text-right font-mono font-bold text-slate-900">
                        {Number(session.totalCash || 0).toLocaleString()} F
                      </td>

                      <td className="p-4 text-right font-mono font-bold text-blue-600">
                        {Number(session.totalMobileMoney || 0).toLocaleString()} F
                      </td>

                      <td className="p-4 text-right font-mono font-bold text-purple-600">
                        {(Number(session.totalCard || 0) + Number(session.totalTransfer || 0) + Number(session.totalCheck || 0)).toLocaleString()} F
                      </td>

                      <td className="p-4 text-right font-mono font-bold text-indigo-600">
                        {Number((session as any).totalAvoirUsed || 0) > 0 ? `-${Number((session as any).totalAvoirUsed).toLocaleString()} F` : '-'}
                      </td>

                      <td className="p-4 text-right font-mono font-black text-emerald-600 text-sm">
                        {totalEnc.toLocaleString()} F
                      </td>

                      <td className="p-4 text-right font-mono font-bold">
                        <span className={`px-2 py-0.5 rounded text-[10px] ${
                          isBalanced 
                            ? 'bg-emerald-50 text-emerald-700' 
                            : diff < 0 
                            ? 'bg-rose-50 text-rose-700' 
                            : 'bg-amber-50 text-amber-700'
                        }`}>
                          {diff > 0 ? `+${diff.toLocaleString()} F` : `${diff.toLocaleString()} F`}
                        </span>
                      </td>

                      <td className="p-4 text-center whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => setSelectedSessionForTransactions(session)}
                            className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-600 text-emerald-800 hover:text-white rounded-xl text-xs font-bold inline-flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer border border-emerald-200"
                            title="Voir la liste détaillée des transactions de cette session"
                          >
                            <Eye size={13} />
                            <span>Voir détails</span>
                          </button>
                          <button
                            onClick={() => onOpenSessionSlip(session)}
                            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-800 hover:text-white text-slate-700 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer border border-slate-200"
                            title="Imprimer le bordereau de clôture officiel"
                          >
                            <Printer size={13} />
                            <span>Bordereau</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-12 text-center flex flex-col items-center justify-center">
            <Landmark size={40} className="text-slate-300 mb-3" />
            <p className="text-sm font-bold text-slate-700">Aucune clôture de caisse pour cette période</p>
            <p className="text-xs text-slate-400 mt-1 max-w-sm">
              Les bordereaux de trésorerie sont créés automatiquement lors de la fermeture d'une session en Caisse.
            </p>
          </div>
        )}
      </div>

      {/* SESSION TRANSACTIONS DRILL-DOWN MODAL */}
      {selectedSessionForTransactions && (
        <SessionTransactionsModal
          session={selectedSessionForTransactions}
          transactions={transactions}
          patients={patients}
          currency={currency}
          onClose={() => setSelectedSessionForTransactions(null)}
          onOpenBordereau={() => {
            const s = selectedSessionForTransactions;
            setSelectedSessionForTransactions(null);
            onOpenSessionSlip(s);
          }}
        />
      )}

    </div>
  );
};
