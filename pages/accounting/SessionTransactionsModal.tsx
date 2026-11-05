import React, { useState, useMemo } from 'react';
import { 
  X, 
  Search, 
  Filter, 
  DollarSign, 
  Smartphone, 
  CreditCard, 
  Landmark, 
  Wallet, 
  Printer, 
  Clock, 
  User, 
  FileText, 
  CheckCircle, 
  AlertTriangle,
  Receipt,
  FileSpreadsheet
} from 'lucide-react';
import { CashierSession, CashierTransaction, Patient } from '../../types';
import { formatPatientFullName, getPatientInitials } from '../../src/patientUtils';

interface SessionTransactionsModalProps {
  session: CashierSession;
  transactions: CashierTransaction[];
  patients: Patient[];
  currency?: string;
  onClose: () => void;
  onOpenBordereau: () => void;
}

export const SessionTransactionsModal: React.FC<SessionTransactionsModalProps> = ({
  session,
  transactions,
  patients,
  currency = 'FCFA',
  onClose,
  onOpenBordereau
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [paymentFilter, setPaymentFilter] = useState<string>('ALL');

  // Fast lookup map for patient names by ID to guarantee full patient names are always populated
  const patientsMap = useMemo(() => {
    const map = new Map<string, Patient>();
    patients.forEach(p => {
      if (p.id) map.set(p.id, p);
      if ((p as any).patientId) map.set((p as any).patientId, p);
      if ((p as any).ipd) map.set((p as any).ipd, p);
    });
    return map;
  }, [patients]);

  // Filter transactions belonging to this specific session_id
  const sessionTransactions = useMemo(() => {
    const sId = session.id || '';
    const sNum = (session as any).sessionNumber || '';

    return transactions.filter(t => {
      const txSessionId = t.sessionId || (t as any).caisseSessionId;
      if (!txSessionId) return false;
      return txSessionId === sId || (sNum && txSessionId === sNum);
    });
  }, [transactions, session]);

  // Filtered transactions by user search & payment mode
  const filteredTransactions = useMemo(() => {
    return sessionTransactions.filter(t => {
      // Payment filter
      if (paymentFilter !== 'ALL') {
        const method = (t.paymentMethod || (t as any).modePaiement || '').toUpperCase();
        if (paymentFilter === 'CASH' && !method.includes('CASH') && !method.includes('ESPECE')) return false;
        if (paymentFilter === 'MOBILE' && !method.includes('MOBILE') && !method.includes('WAVE') && !method.includes('ORANGE')) return false;
        if (paymentFilter === 'CARD_TRANSFER' && !method.includes('CARD') && !method.includes('CARTE') && !method.includes('TRANSFER') && !method.includes('VIREMENT') && !method.includes('CHECK')) return false;
        if (paymentFilter === 'AVANCE' && !method.includes('AVANCE') && !method.includes('AVOIR')) return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const pId = (t as any).patientId || '';
        const resolvedPatient = patientsMap.get(pId);
        const patientName = formatPatientFullName(resolvedPatient, (t as any).patientName).toLowerCase();
        const ticketId = (t.paymentRequestId || t.id || '').toLowerCase();
        const cashier = (t.cashierName || (t as any).caissierName || '').toLowerCase();

        return patientName.includes(q) || ticketId.includes(q) || cashier.includes(q);
      }

      return true;
    });
  }, [sessionTransactions, paymentFilter, searchQuery, patientsMap]);

  // Subtotal for filtered results
  const filteredTotal = useMemo(() => {
    return filteredTransactions.reduce((acc, t) => acc + Number(t.amount || (t as any).montantPaye || 0), 0);
  }, [filteredTransactions]);

  const diff = Number(session.difference || 0);
  const isBalanced = Math.abs(diff) < 1;

  const formatTxTime = (dateStr?: string) => {
    if (!dateStr) return { time: '--:--', date: '-' };
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return { time: '--:--', date: dateStr };
    return {
      time: d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      date: d.toLocaleDateString('fr-FR')
    };
  };

  const getMethodBadge = (tx: CashierTransaction) => {
    const method = (tx.paymentMethod || (tx as any).modePaiement || '').toUpperCase();

    if (method.includes('MOBILE') || method.includes('WAVE') || method.includes('ORANGE')) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
          <Smartphone size={12} className="text-blue-500" /> Mobile Money
        </span>
      );
    }
    if (method.includes('CARD') || method.includes('CARTE')) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
          <CreditCard size={12} className="text-purple-500" /> Carte Bancaire
        </span>
      );
    }
    if (method.includes('TRANSFER') || method.includes('VIREMENT') || method.includes('CHECK')) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
          <Landmark size={12} className="text-amber-500" /> Virement / Chèque
        </span>
      );
    }
    if (method.includes('AVANCE') || method.includes('AVOIR') || Number((tx as any).avoirUtilise || 0) > 0) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
          <Wallet size={12} className="text-indigo-500" /> Avoir / Avance
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
        <DollarSign size={12} className="text-emerald-500" /> Espèces
      </span>
    );
  };

  return (
    <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-sm z-[100] flex items-center justify-center p-3 sm:p-5 overflow-hidden animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-5xl max-h-[92vh] border border-slate-200 flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Header Strip */}
        <div className="bg-slate-900 text-white p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0 border-b border-slate-800">
          <div className="flex items-start sm:items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-500/30">
              <Receipt size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-black tracking-tight text-white">
                  Journal Détaillé de la Session de Caisse
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-mono">
                  {session.id?.slice(0, 16) || 'SESSION'}
                </span>
                <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider ${
                  session.status === 'CLOSED' ? 'bg-slate-800 text-slate-300' : 'bg-emerald-500 text-white'
                }`}>
                  {session.status === 'CLOSED' ? 'Session Clôturée' : 'Session Active'}
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-400 mt-1 flex-wrap font-medium">
                <span className="flex items-center gap-1">
                  <User size={13} className="text-slate-500" />
                  Caissier : <strong className="text-slate-200">{session.cashierName || 'Caissier'}</strong>
                </span>
                <span>•</span>
                <span className="flex items-center gap-1 font-mono">
                  <Clock size={13} className="text-slate-500" />
                  {session.closedAt ? new Date(session.closedAt).toLocaleString('fr-FR') : (session.openedAt ? new Date(session.openedAt).toLocaleString('fr-FR') : '-')}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5 self-end sm:self-center shrink-0">
            <button
              onClick={onOpenBordereau}
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
              title="Consulter le bordereau officiel de clôture"
            >
              <Printer size={14} />
              <span>Bordereau Officiel</span>
            </button>
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-xl bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Operational Financial Overview Metrics Bar */}
        <div className="bg-slate-50 p-4 sm:p-5 border-b border-slate-200/80 grid grid-cols-2 sm:grid-cols-5 gap-3 shrink-0">
          <div className="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-xs">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              Total Encaissé
            </span>
            <p className="text-base sm:text-lg font-black text-emerald-600 font-mono mt-0.5">
              {Number(session.totalCollected || 0).toLocaleString()} <span className="text-xs font-bold text-slate-400">{currency}</span>
            </p>
            <span className="text-[10px] text-slate-500 font-bold block mt-0.5">
              {sessionTransactions.length} transaction{sessionTransactions.length > 1 ? 's' : ''} au journal
            </span>
          </div>

          <div className="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-xs">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block flex items-center gap-1">
              <DollarSign size={12} className="text-emerald-500" /> Espèces
            </span>
            <p className="text-base sm:text-lg font-black text-slate-900 font-mono mt-0.5">
              {Number(session.totalCash || 0).toLocaleString()} <span className="text-xs font-bold text-slate-400">{currency}</span>
            </p>
            <span className="text-[10px] text-slate-400 block mt-0.5">Compté au tiroir</span>
          </div>

          <div className="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-xs">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block flex items-center gap-1">
              <Smartphone size={12} className="text-blue-500" /> Mobile Money
            </span>
            <p className="text-base sm:text-lg font-black text-blue-600 font-mono mt-0.5">
              {Number(session.totalMobileMoney || 0).toLocaleString()} <span className="text-xs font-bold text-slate-400">{currency}</span>
            </p>
            <span className="text-[10px] text-slate-400 block mt-0.5">Orange / Wave / Free</span>
          </div>

          <div className="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-xs">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block flex items-center gap-1">
              <CreditCard size={12} className="text-purple-500" /> Cartes & Virements
            </span>
            <p className="text-base sm:text-lg font-black text-purple-600 font-mono mt-0.5">
              {(Number(session.totalCard || 0) + Number(session.totalTransfer || 0) + Number(session.totalCheck || 0)).toLocaleString()} <span className="text-xs font-bold text-slate-400">{currency}</span>
            </p>
            <span className="text-[10px] text-slate-400 block mt-0.5">Comptes bancaires</span>
          </div>

          <div className="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-xs col-span-2 sm:col-span-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block flex items-center gap-1">
              <AlertTriangle size={12} className={diff !== 0 ? "text-amber-500" : "text-emerald-500"} /> Écart Constaté
            </span>
            <p className={`text-base sm:text-lg font-black font-mono mt-0.5 ${
              isBalanced ? 'text-emerald-600' : diff < 0 ? 'text-rose-600' : 'text-amber-600'
            }`}>
              {diff > 0 ? `+${diff.toLocaleString()}` : diff.toLocaleString()} <span className="text-xs font-bold text-slate-400">{currency}</span>
            </p>
            <span className="text-[10px] text-slate-400 block mt-0.5">
              {isBalanced ? 'Équilibré à 0 F' : 'Contrôle à vérifier'}
            </span>
          </div>
        </div>

        {/* Filter Bar: Live Search & Payment Filter Tabs */}
        <div className="p-4 bg-white border-b border-slate-200 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shrink-0">
          
          <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-2xl overflow-x-auto">
            <button
              onClick={() => setPaymentFilter('ALL')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                paymentFilter === 'ALL' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Toutes ({sessionTransactions.length})
            </button>
            <button
              onClick={() => setPaymentFilter('CASH')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                paymentFilter === 'CASH' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Espèces
            </button>
            <button
              onClick={() => setPaymentFilter('MOBILE')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                paymentFilter === 'MOBILE' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Mobile Money
            </button>
            <button
              onClick={() => setPaymentFilter('CARD_TRANSFER')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                paymentFilter === 'CARD_TRANSFER' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Cartes / Virements
            </button>
            <button
              onClick={() => setPaymentFilter('AVANCE')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                paymentFilter === 'AVANCE' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Avances
            </button>
          </div>

          <div className="relative">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Rechercher par patient, ticket ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full sm:w-72 pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-emerald-500 outline-none"
            />
          </div>

        </div>

        {/* Detailed Transactions Table */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-0">
          {filteredTransactions.length > 0 ? (
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100/80 text-slate-600 font-extrabold uppercase text-[10px] tracking-wider border-b border-slate-200 sticky top-0 z-10 backdrop-blur-md">
                <tr>
                  <th className="p-4">Heure & Date</th>
                  <th className="p-4">Nom du Client (Patient)</th>
                  <th className="p-4">N° Facture / Ticket ID</th>
                  <th className="p-4">Mode de Règlement</th>
                  <th className="p-4 text-right">Montant Encaissé</th>
                  <th className="p-4 text-center">Détails / Prestations</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {filteredTransactions.map((tx) => {
                  const pId = (tx as any).patientId || '';
                  const resolvedPatient = patientsMap.get(pId);
                  const patientFullName = formatPatientFullName(resolvedPatient, (tx as any).patientName || 'Patient Anonyme / Comptoir');
                  const patientPhone = resolvedPatient?.phone;
                  const ticketId = tx.paymentRequestId || tx.id;
                  const dt = formatTxTime(tx.date || (tx as any).timestamp || (tx as any).createdAt);
                  const amount = Number(tx.amount || (tx as any).montantPaye || 0);

                  // Extract services/items details if available
                  const lignes = (tx as any).lignes as any[];
                  const servicesDesc = lignes && lignes.length > 0 
                    ? lignes.map(l => l.libelle || l.name).filter(Boolean).slice(0, 2).join(', ') + (lignes.length > 2 ? ` (+${lignes.length - 2})` : '')
                    : (tx.notes || (tx as any).service || 'Prestations médicales / Caisse');

                  return (
                    <tr key={tx.id} className="hover:bg-slate-50 transition-colors">
                      
                      {/* Horodatage */}
                      <td className="p-4 whitespace-nowrap">
                        <span className="font-mono font-bold text-slate-900 block text-xs">
                          {dt.time}
                        </span>
                        <span className="text-[10px] text-slate-400 font-medium block">
                          {dt.date}
                        </span>
                      </td>

                      {/* Prominent Client / Patient Name */}
                      <td className="p-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-xl bg-emerald-100/70 text-emerald-800 flex items-center justify-center font-bold text-xs shrink-0">
                            {getPatientInitials(resolvedPatient, patientFullName.charAt(0).toUpperCase())}
                          </div>
                          <div className="min-w-0">
                            <span className="font-black text-slate-900 text-xs block truncate">
                              {patientFullName}
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono block truncate">
                              {pId ? `Dossier: ${pId.slice(0, 10)}` : 'Vente directe'} {patientPhone ? `• ${patientPhone}` : ''}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Invoice / Ticket ID */}
                      <td className="p-4 font-mono font-bold text-slate-700 whitespace-nowrap">
                        <span className="bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200 text-[11px] text-slate-800">
                          {ticketId}
                        </span>
                      </td>

                      {/* Payment Method Badge */}
                      <td className="p-4 whitespace-nowrap">
                        {getMethodBadge(tx)}
                      </td>

                      {/* Amount */}
                      <td className="p-4 text-right font-mono font-black text-emerald-600 text-sm whitespace-nowrap">
                        {amount.toLocaleString()} <span className="text-[11px] font-bold text-slate-400">{currency}</span>
                      </td>

                      {/* Service / Items Covered */}
                      <td className="p-4 text-center max-w-xs truncate text-[11px] text-slate-500" title={servicesDesc}>
                        {servicesDesc}
                      </td>

                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className="p-16 text-center flex flex-col items-center justify-center text-slate-400">
              <Receipt size={44} className="text-slate-300 mb-3" />
              <p className="text-sm font-bold text-slate-700">Aucune transaction trouvée</p>
              <p className="text-xs text-slate-400 mt-1 max-w-md">
                {sessionTransactions.length === 0
                  ? "Cette session de caisse ne comporte aucune transaction individuelle enregistrée dans la base de données."
                  : "Aucune transaction ne correspond à vos filtres de recherche pour cette session."}
              </p>
            </div>
          )}
        </div>

        {/* Footer Audit Bar */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0 text-xs">
          <div className="flex items-center gap-4 text-slate-600">
            <span>
              Affichage : <strong>{filteredTransactions.length}</strong> sur <strong>{sessionTransactions.length}</strong> opération{sessionTransactions.length > 1 ? 's' : ''}
            </span>
            <span>•</span>
            <span>
              Sous-total filtré : <strong className="font-mono font-black text-slate-900">{filteredTotal.toLocaleString()} {currency}</strong>
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onOpenBordereau}
              className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold rounded-xl text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Printer size={13} /> Voir Bordereau
            </button>
            <button
              onClick={onClose}
              className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer"
            >
              Fermer
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
