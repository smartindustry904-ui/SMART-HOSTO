import React from 'react';
import { X, Printer, Landmark, CheckCircle, ShieldCheck, User, Calendar, DollarSign, Smartphone, CreditCard, Wallet, AlertCircle } from 'lucide-react';
import { CashierSession } from '../../types';

interface ShiftClosingSlipModalProps {
  session: CashierSession;
  currency?: string;
  onClose: () => void;
}

export const ShiftClosingSlipModal: React.FC<ShiftClosingSlipModalProps> = ({
  session,
  currency = 'FCFA',
  onClose
}) => {
  const handlePrint = () => {
    window.print();
  };

  const openedAt = session.openedAt ? new Date(session.openedAt).toLocaleString('fr-FR') : '-';
  const closedAt = session.closedAt ? new Date(session.closedAt).toLocaleString('fr-FR') : '-';

  const diff = Number(session.difference || 0);
  const isBalanced = Math.abs(diff) < 1;

  return (
    <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-sm z-[100] flex items-center justify-center p-3 sm:p-4 md:p-6 overflow-hidden shift-slip-backdrop">
      <style>{`
        @media print {
          .shift-slip-backdrop {
            position: static !important;
            background: none !important;
            backdrop-filter: none !important;
            padding: 0 !important;
            display: block !important;
            overflow: visible !important;
          }
          .shift-slip-container {
            max-height: none !important;
            overflow: visible !important;
            border: none !important;
            box-shadow: none !important;
            border-radius: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 !important;
          }
          .shift-slip-content {
            max-height: none !important;
            overflow: visible !important;
            padding: 0 !important;
          }
          .no-print {
            display: none !important;
          }
          @page {
            size: A4 portrait;
            margin: 12mm;
          }
        }
      `}</style>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] sm:max-h-[85vh] border border-slate-200 overflow-hidden flex flex-col animate-in zoom-in-95 duration-200 shift-slip-container">
        
        {/* Header - Fixed & No Print */}
        <div className="bg-slate-900 text-white p-4 sm:p-5 flex justify-between items-center no-print shrink-0 border-b border-slate-800">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
              <Landmark size={20} />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-bold text-white truncate">Bordereau Officiel de Clôture de Caisse</h2>
              <p className="text-xs text-slate-400 font-mono truncate">Session ID: {session.id || session.sessionNumber || 'N/A'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handlePrint}
              className="px-3 sm:px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors shadow-sm cursor-pointer"
            >
              <Printer size={14} /> 
              <span className="hidden sm:inline">Imprimer Bordereau</span>
              <span className="sm:hidden">Imprimer</span>
            </button>
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-xl bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Scrollable Printable Content */}
        <div className="p-5 sm:p-6 md:p-8 space-y-6 text-slate-900 printable-slip flex-1 overflow-y-auto custom-scrollbar shift-slip-content">
          
          {/* Slip Header */}
          <div className="border-b border-slate-200 pb-5 flex justify-between items-start">
            <div>
              <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200">
                Service Comptabilité & Trésorerie
              </span>
              <h1 className="text-xl font-black text-slate-900 mt-2">BORDEREAU DE CAISSE CENTRALISÉE</h1>
              <p className="text-xs text-slate-500 font-medium">Arrêté de caisse journalier & contrôle des encaissements</p>
            </div>
            <div className="text-right">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-100 text-slate-800 rounded-lg text-xs font-bold font-mono">
                <ShieldCheck size={14} className="text-emerald-600" />
                {session.status === 'CLOSED' ? 'SESSION CLÔTURÉE' : 'EN COURS'}
              </div>
              <p className="text-[11px] text-slate-400 mt-1">Édité le {new Date().toLocaleDateString('fr-FR')}</p>
            </div>
          </div>

          {/* Operational Context Metadata */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-200 text-xs">
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Caissier</span>
              <span className="font-bold text-slate-900 flex items-center gap-1 mt-0.5">
                <User size={12} className="text-slate-500" /> {session.cashierName || 'Caissier'}
              </span>
            </div>
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Ouverture</span>
              <span className="font-bold text-slate-800 font-mono mt-0.5 block">{openedAt}</span>
            </div>
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Clôture</span>
              <span className="font-bold text-slate-800 font-mono mt-0.5 block">{closedAt}</span>
            </div>
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Transactions</span>
              <span className="font-bold text-slate-900 font-mono mt-0.5 block">
                {session.transactionCount || session.totalTransactionsCount || 0} opérations
              </span>
            </div>
          </div>

          {/* Breakdown by Payment Method */}
          <div className="space-y-3">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-600 flex items-center gap-2">
              <DollarSign size={14} className="text-emerald-600" /> Ventilation des Encaissements par Mode de Règlement
            </h3>
            
            <div className="border border-slate-200 rounded-2xl overflow-hidden divide-y divide-slate-100">
              <div className="p-3 bg-slate-100/70 flex justify-between items-center text-xs font-bold text-slate-700">
                <span>Mode de Règlement</span>
                <span>Montant Encaissé</span>
              </div>

              {/* Cash */}
              <div className="p-3 flex justify-between items-center text-xs hover:bg-slate-50">
                <div className="flex items-center gap-2 font-bold text-slate-800">
                  <div className="w-6 h-6 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
                    <DollarSign size={13} />
                  </div>
                  <span>Espèces physiques (Encaissé)</span>
                </div>
                <span className="font-mono font-black text-slate-900 text-sm">
                  {Number(session.totalCash || 0).toLocaleString()} {currency}
                </span>
              </div>

              {/* Mobile Money */}
              <div className="p-3 flex justify-between items-center text-xs hover:bg-slate-50">
                <div className="flex items-center gap-2 font-bold text-slate-800">
                  <div className="w-6 h-6 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center">
                    <Smartphone size={13} />
                  </div>
                  <span>Mobile Money (Orange / Wave / Free)</span>
                </div>
                <span className="font-mono font-black text-slate-900 text-sm">
                  {Number(session.totalMobileMoney || 0).toLocaleString()} {currency}
                </span>
              </div>

              {/* Bank Cards */}
              <div className="p-3 flex justify-between items-center text-xs hover:bg-slate-50">
                <div className="flex items-center gap-2 font-bold text-slate-800">
                  <div className="w-6 h-6 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center">
                    <CreditCard size={13} />
                  </div>
                  <span>Cartes Bancaires</span>
                </div>
                <span className="font-mono font-black text-slate-900 text-sm">
                  {Number(session.totalCard || 0).toLocaleString()} {currency}
                </span>
              </div>

              {/* Bank Transfers & Checks */}
              <div className="p-3 flex justify-between items-center text-xs hover:bg-slate-50">
                <div className="flex items-center gap-2 font-bold text-slate-800">
                  <div className="w-6 h-6 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center">
                    <Landmark size={13} />
                  </div>
                  <span>Virements & Chèques</span>
                </div>
                <span className="font-mono font-black text-slate-900 text-sm">
                  {(Number(session.totalTransfer || 0) + Number(session.totalCheck || 0)).toLocaleString()} {currency}
                </span>
              </div>

              {/* Avances Utilisées */}
              {Number(session.totalAvoirUsed || 0) > 0 && (
                <div className="p-3 flex justify-between items-center text-xs bg-indigo-50/50">
                  <div className="flex items-center gap-2 font-bold text-indigo-900">
                    <div className="w-6 h-6 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center">
                      <Wallet size={13} />
                    </div>
                    <span>Avances / Avoirs Patients Déduits</span>
                  </div>
                  <span className="font-mono font-black text-indigo-700 text-sm">
                    {Number(session.totalAvoirUsed || 0).toLocaleString()} {currency}
                  </span>
                </div>
              )}

              {/* Total Row */}
              <div className="p-4 bg-emerald-50 flex justify-between items-center text-sm font-black border-t-2 border-emerald-200">
                <span className="text-emerald-950 uppercase tracking-wider">TOTAL RECETTES ENCAISSÉES</span>
                <span className="font-mono text-emerald-700 text-base">
                  {Number(session.totalCollected || 0).toLocaleString()} {currency}
                </span>
              </div>
            </div>
          </div>

          {/* Physical Cash Reconciliation */}
          <div className="bg-slate-900 text-white p-5 rounded-2xl space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Rapprochement du Tiroir-Caisse (Espèces Physiques)
            </h4>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <div className="bg-slate-800/80 p-3 rounded-xl">
                <span className="text-[10px] text-slate-400 block font-medium">Fond Initial</span>
                <span className="font-mono font-bold text-white text-sm">
                  {Number(session.openingFloat || 0).toLocaleString()} F
                </span>
              </div>
              <div className="bg-slate-800/80 p-3 rounded-xl">
                <span className="text-[10px] text-slate-400 block font-medium">Théorique Espèces</span>
                <span className="font-mono font-bold text-white text-sm">
                  {Number(session.expectedCashInDrawer || (Number(session.openingFloat || 0) + Number(session.totalCash || 0))).toLocaleString()} F
                </span>
              </div>
              <div className="bg-slate-800/80 p-3 rounded-xl">
                <span className="text-[10px] text-slate-400 block font-medium">Espèces Comptées</span>
                <span className="font-mono font-bold text-emerald-400 text-sm">
                  {Number(session.actualCashInHand || session.totalCash || 0).toLocaleString()} F
                </span>
              </div>
              <div className={`p-3 rounded-xl border ${
                isBalanced 
                  ? 'bg-emerald-950/60 border-emerald-600 text-emerald-300' 
                  : diff < 0 
                  ? 'bg-rose-950/60 border-rose-600 text-rose-300' 
                  : 'bg-amber-950/60 border-amber-600 text-amber-300'
              }`}>
                <span className="text-[10px] block font-medium opacity-80">Écart Constaté</span>
                <span className="font-mono font-black text-sm">
                  {diff > 0 ? `+${diff.toLocaleString()}` : diff.toLocaleString()} F
                </span>
              </div>
            </div>

            {session.notes && (
              <p className="text-xs text-slate-300 italic pt-1 border-t border-slate-800">
                Observation du caissier : "{session.notes}"
              </p>
            )}
          </div>

          {/* Signatures & Certification */}
          <div className="pt-6 border-t border-slate-200 grid grid-cols-2 gap-8 text-xs">
            <div className="border border-slate-200 rounded-xl p-4 h-28 flex flex-col justify-between">
              <span className="font-bold text-slate-600 uppercase text-[10px]">Signature du Caissier :</span>
              <span className="text-slate-400 text-[10px] italic">Arrêté sincère et conforme</span>
            </div>
            <div className="border border-slate-200 rounded-xl p-4 h-28 flex flex-col justify-between">
              <span className="font-bold text-slate-600 uppercase text-[10px]">Visa Contrôle Comptable :</span>
              <span className="text-slate-400 text-[10px] italic">Enregistré en comptabilité hospitalière</span>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
};
