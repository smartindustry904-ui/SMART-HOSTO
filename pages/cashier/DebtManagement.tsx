import React, { useState, useMemo, useEffect } from 'react';
import { 
  AlertCircle, 
  Search, 
  CheckCircle, 
  CreditCard, 
  Clock, 
  DollarSign, 
  Printer, 
  User, 
  X, 
  ArrowRight,
  ShieldAlert,
  Calendar,
  Building,
  Lock,
  Unlock,
  Coins,
  Receipt
} from 'lucide-react';
import { DettePatient, CashierSession, User as UserType, Patient } from '../../types';
import { db, sanitizeData } from '../../src/firebase';
import { doc, updateDoc, setDoc, writeBatch, collection, onSnapshot } from 'firebase/firestore';
import { AvatarPlaceholder } from '../../components/common/AvatarPlaceholder';
import { Avatar } from '../../components/common/Avatar';
import { useSettings } from '../../hooks/useSettings';
import { formatPatientFullName } from '../../src/patientUtils';
import { getActiveTenantId, belongsToTenant } from '../../src/utils/tenant';

interface DebtManagementProps {
  user: UserType;
  activeSession: CashierSession | null;
  dettesPatient: DettePatient[];
  onOpenSessionRequest?: () => void;
  onPaymentProcessed?: (tx: any) => void;
  theme?: string;
}

export const DebtManagement: React.FC<DebtManagementProps> = ({
  user,
  activeSession,
  dettesPatient = [],
  onOpenSessionRequest,
  onPaymentProcessed,
  theme
}) => {
  const { establishment } = useSettings();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL_ACTIVE' | 'PENDING' | 'PARTIAL' | 'ALL'>('ALL_ACTIVE');
  
  // Payment Modal State
  const [selectedDebt, setSelectedDebt] = useState<DettePatient | null>(null);
  const [paymentType, setPaymentType] = useState<'FULL' | 'PARTIAL'>('FULL');
  const [paymentAmountInput, setPaymentAmountInput] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'MOBILE_MONEY' | 'CARD' | 'TRANSFER' | 'CHECK'>('CASH');
  const [notes, setNotes] = useState('');
  const [cashRemis, setCashRemis] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Receipt Modal State
  const [printedReceipt, setPrintedReceipt] = useState<any | null>(null);

  // Synchronize patients collection for robust name resolution (strict active session isolation)
  const [patientsList, setPatientsList] = useState<Patient[]>([]);
  const activeTenantId = getActiveTenantId(user, establishment);
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'patients'), snap => {
      setPatientsList(
        snap.docs
          .map(d => ({ id: d.id, ...d.data() } as Patient))
          .filter(p => belongsToTenant(p, activeTenantId))
      );
    });
    return () => unsub();
  }, [activeTenantId]);

  const patientsMap = useMemo(() => {
    const map = new Map<string, Patient>();
    patientsList.forEach(p => {
      if (p.id) map.set(p.id, p);
      if ((p as any).patientId) map.set((p as any).patientId, p);
      if ((p as any).ipd) map.set((p as any).ipd, p);
    });
    return map;
  }, [patientsList]);

  // Active Debts Metrics
  const activeDebts = useMemo(() => {
    return (dettesPatient || []).filter(d => d.status !== 'PAID' && (d.montantRestant || 0) > 0);
  }, [dettesPatient]);

  const totalOutstandingDebt = useMemo(() => {
    return activeDebts.reduce((sum, d) => sum + (d.montantRestant || 0), 0);
  }, [activeDebts]);

  const uniqueDebtorPatients = useMemo(() => {
    const pts = new Set<string>();
    activeDebts.forEach(d => {
      if (d.patientId) pts.add(d.patientId);
    });
    return pts.size;
  }, [activeDebts]);

  const emergencyDebtsCount = useMemo(() => {
    return activeDebts.filter(d => d.isEmergencyOverride || d.origin?.toLowerCase().includes('urgence')).length;
  }, [activeDebts]);

  // Filtered list
  const filteredDebts = useMemo(() => {
    let list = [...(dettesPatient || [])];

    if (statusFilter === 'ALL_ACTIVE') {
      list = list.filter(d => d.status !== 'PAID' && (d.montantRestant || 0) > 0);
    } else if (statusFilter === 'PENDING') {
      list = list.filter(d => d.status === 'PENDING' && (d.montantRestant || 0) > 0);
    } else if (statusFilter === 'PARTIAL') {
      list = list.filter(d => d.status === 'PARTIAL' && (d.montantRestant || 0) > 0);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(d => {
        const pObj = d.patientId ? patientsMap.get(d.patientId) : null;
        const pFullName = formatPatientFullName(pObj, d.patientName);
        return (
          pFullName.toLowerCase().includes(q) ||
          (d.patientName || '').toLowerCase().includes(q) ||
          (d.patientId || '').toLowerCase().includes(q) ||
          (d.id || '').toLowerCase().includes(q) ||
          (d.origin || '').toLowerCase().includes(q) ||
          (d.description || '').toLowerCase().includes(q)
        );
      });
    }

    // Sort by remaining debt amount desc, then date desc
    return list.sort((a, b) => {
      if (b.montantRestant !== a.montantRestant) {
        return (b.montantRestant || 0) - (a.montantRestant || 0);
      }
      return new Date(b.dateCreation || 0).getTime() - new Date(a.dateCreation || 0).getTime();
    });
  }, [dettesPatient, statusFilter, searchQuery]);

  const handleOpenPayment = (debt: DettePatient) => {
    setSelectedDebt(debt);
    setPaymentType('FULL');
    setPaymentAmountInput(String(debt.montantRestant || 0));
    setPaymentMethod('CASH');
    setCashRemis(String(debt.montantRestant || 0));
    setNotes('');
    setErrorMessage(null);
  };

  const handlePaymentTypeChange = (type: 'FULL' | 'PARTIAL') => {
    setPaymentType(type);
    if (!selectedDebt) return;
    if (type === 'FULL') {
      setPaymentAmountInput(String(selectedDebt.montantRestant || 0));
      setCashRemis(String(selectedDebt.montantRestant || 0));
    } else {
      const half = Math.round((selectedDebt.montantRestant || 0) / 2);
      setPaymentAmountInput(String(half));
      setCashRemis(String(half));
    }
  };

  const handleProcessPayment = async () => {
    if (!selectedDebt) return;
    if (!activeSession) {
      setErrorMessage("Aucune session de caisse active. Veuillez ouvrir une session avant d'encaisser.");
      return;
    }

    const payAmount = parseFloat(paymentAmountInput);
    if (isNaN(payAmount) || payAmount <= 0) {
      setErrorMessage("Veuillez saisir un montant de remboursement valide (> 0 F).");
      return;
    }

    if (payAmount > (selectedDebt.montantRestant || 0)) {
      setErrorMessage(`Le montant saisi (${payAmount.toLocaleString()} F) dépasse la dette restante (${(selectedDebt.montantRestant || 0).toLocaleString()} F).`);
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const txId = `TX-DETTE-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const oldRemaining = selectedDebt.montantRestant || 0;
      const newRemaining = Math.max(0, oldRemaining - payAmount);
      const newStatus: 'PENDING' | 'PARTIAL' | 'PAID' = newRemaining <= 0 ? 'PAID' : 'PARTIAL';
      const nowIso = new Date().toISOString();

      const pObj = selectedDebt.patientId ? patientsMap.get(selectedDebt.patientId) : null;
      const resolvedPatientName = formatPatientFullName(pObj, selectedDebt.patientName);

      // Cashier Transaction record strictly bound to activeSession.id
      const newTransaction: any = {
        id: txId,
        patientId: selectedDebt.patientId,
        patientName: resolvedPatientName,
        date: nowIso,
        amount: payAmount, // Net cash credited to caisse drawer
        montantPaye: payAmount,
        type: 'DETTE_RECOVERY',
        sourceModule: 'Recouvrement Dette',
        detteId: selectedDebt.id,
        detteInitiale: selectedDebt.montantInitial,
        detteRestanteAvant: oldRemaining,
        detteRestanteApres: newRemaining,
        notes: notes || `Règlement dette (${selectedDebt.origin || 'Soins'})`,
        paymentMethod: paymentMethod,
        cashierId: user.id || 'cashier',
        cashierName: user.name || 'Caissier',
        sessionId: activeSession.id,
        caisseSessionId: activeSession.id,
        status: 'VALIDATED',
        createdAt: nowIso
      };

      const batch = writeBatch(db);

      // 1. Write Cashier Transaction
      const txRef = doc(db, 'cashier_transactions', txId);
      batch.set(txRef, sanitizeData(newTransaction));

      // 2. Update Dette Patient
      const detteRef = doc(db, 'dettes_patient', selectedDebt.id);
      batch.update(detteRef, sanitizeData({
        montantRestant: newRemaining,
        status: newStatus,
        derniereDatePaiement: nowIso,
        dernierCaissierId: user.id,
        dernierCaissierName: user.name,
        derniereSessionId: activeSession.id,
        updatedAt: nowIso
      }));

      // 3. If linked to a payment request, update payment request amountPaid
      if (selectedDebt.transactionSourceId) {
        try {
          const prRef = doc(db, 'payment_requests', selectedDebt.transactionSourceId);
          batch.update(prRef, sanitizeData({
            updatedAt: nowIso,
            lastDebtRecoveryAmount: payAmount,
            lastDebtRecoveryDate: nowIso
          }));
        } catch {
          // Silent catch if transactionSourceId is not a direct PR
        }
      }

      await batch.commit();

      if (onPaymentProcessed) {
        onPaymentProcessed(newTransaction);
      }

      // Prepare receipt
      setPrintedReceipt({
        transactionId: txId,
        detteId: selectedDebt.id,
        patientName: resolvedPatientName,
        patientId: selectedDebt.patientId,
        amountPaid: payAmount,
        oldDebt: oldRemaining,
        newRemaining: newRemaining,
        paymentMethod,
        cashierName: user.name || 'Caissier',
        sessionId: activeSession.id,
        date: nowIso,
        notes: notes || selectedDebt.description || selectedDebt.origin || 'Règlement de dette médicale'
      });

      setSelectedDebt(null);
    } catch (err: any) {
      console.error("Error processing debt payment:", err);
      setErrorMessage(err?.message || "Erreur lors de l'enregistrement du règlement de dette.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const cashRemisNum = parseFloat(cashRemis) || 0;
  const payAmountNum = parseFloat(paymentAmountInput) || 0;
  const monnaieRendue = Math.max(0, cashRemisNum - payAmountNum);

  return (
    <div className="space-y-6">
      {/* Top Banner: Session status alert */}
      {!activeSession ? (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center text-amber-700 shrink-0">
              <Lock size={20} />
            </div>
            <div>
              <h4 className="font-black text-amber-900 text-sm">Session de caisse fermée</h4>
              <p className="text-xs text-amber-700 font-medium mt-0.5">
                Une session de caisse ouverte est obligatoire pour enregistrer et créditer les encaissements de dettes.
              </p>
            </div>
          </div>
          {onOpenSessionRequest && (
            <button
              onClick={onOpenSessionRequest}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-2 cursor-pointer shrink-0"
            >
              <Unlock size={14} /> Ouvrir une session
            </button>
          )}
        </div>
      ) : (
        <div className="bg-emerald-50 border border-emerald-200/80 rounded-2xl p-3 px-4 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-emerald-800 font-bold">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Session de Caisse Active : <span className="font-mono">{activeSession.id}</span></span>
          </div>
          <span className="text-emerald-700 font-medium hidden sm:inline">
            Tout versement de dette sera directement comptabilisé dans ce poste
          </span>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Dettes Actives</span>
            <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
              <Coins size={18} />
            </div>
          </div>
          <p className="text-2xl font-black text-slate-900 mt-2">
            {totalOutstandingDebt.toLocaleString()} <span className="text-xs font-bold text-slate-400">FCFA</span>
          </p>
          <p className="text-[11px] text-rose-600 font-semibold mt-1">
            Créances à recouvrer auprès des usagers
          </p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Dossiers en Dette</span>
            <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <Receipt size={18} />
            </div>
          </div>
          <p className="text-2xl font-black text-slate-900 mt-2">
            {activeDebts.length}
          </p>
          <p className="text-[11px] text-slate-500 font-medium mt-1">
            Lignes de créances non soldées
          </p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Patients Débiteurs</span>
            <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <User size={18} />
            </div>
          </div>
          <p className="text-2xl font-black text-slate-900 mt-2">
            {uniqueDebtorPatients}
          </p>
          <p className="text-[11px] text-slate-500 font-medium mt-1">
            Usagers identifiés avec solde débiteur
          </p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Dérogations Urgences</span>
            <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
              <ShieldAlert size={18} />
            </div>
          </div>
          <p className="text-2xl font-black text-slate-900 mt-2">
            {emergencyDebtsCount}
          </p>
          <p className="text-[11px] text-purple-600 font-semibold mt-1">
            Soins d'urgence passés en priorité
          </p>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs overflow-hidden">
        {/* Filter & Search Bar */}
        <div className="p-5 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50/50">
          <div className="flex-1 relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              placeholder="Rechercher un patient (Nom, ID, Ref dette, Service)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
            />
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0">
            {[
              { id: 'ALL_ACTIVE', label: `Dettes Actives (${activeDebts.length})` },
              { id: 'PENDING', label: 'Non Entamées' },
              { id: 'PARTIAL', label: 'Règlements Partiels' },
              { id: 'ALL', label: 'Tout l\'historique' }
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setStatusFilter(f.id as any)}
                className={`px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                  statusFilter === f.id
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Debts Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/80 text-[10px] font-black uppercase tracking-wider text-slate-500">
                <th className="py-3 px-6">Patient Débiteur</th>
                <th className="py-3 px-6">Date & Origine</th>
                <th className="py-3 px-6 text-right">Montant Initial</th>
                <th className="py-3 px-6 text-right">Déjà Réglé</th>
                <th className="py-3 px-6 text-right">Reste à Payer</th>
                <th className="py-3 px-6 text-center">Statut</th>
                <th className="py-3 px-6 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {filteredDebts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-16 text-slate-400 font-bold">
                    <AlertCircle className="mx-auto mb-2 opacity-30" size={32} />
                    Aucune dette trouvée pour ce critère
                  </td>
                </tr>
              ) : (
                filteredDebts.map((debt) => {
                  const dejaRegle = Math.max(0, (debt.montantInitial || 0) - (debt.montantRestant || 0));
                  const isPaid = debt.status === 'PAID' || (debt.montantRestant || 0) <= 0;
                  const pObj = debt.patientId ? patientsMap.get(debt.patientId) : null;
                  const resolvedRowName = formatPatientFullName(pObj, debt.patientName);

                  return (
                    <tr key={debt.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-3">
                          <AvatarPlaceholder size={36} iconSize={18} alt={resolvedRowName} />
                          <div>
                            <p className="font-bold text-slate-900">{resolvedRowName}</p>
                            <p className="text-[10px] font-mono text-slate-400">{debt.patientId}</p>
                          </div>
                        </div>
                      </td>

                      <td className="py-4 px-6">
                        <div className="space-y-0.5">
                          <span className="inline-flex items-center gap-1 font-bold text-slate-700">
                            {debt.origin || 'Prestation Médicale'}
                            {debt.isEmergencyOverride && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded-sm bg-purple-100 text-purple-700 font-extrabold uppercase">
                                Urgence
                              </span>
                            )}
                          </span>
                          <p className="text-[10px] text-slate-400 font-mono">
                            {debt.dateCreation ? new Date(debt.dateCreation).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : 'N/A'}
                          </p>
                        </div>
                      </td>

                      <td className="py-4 px-6 text-right font-semibold text-slate-600">
                        {(debt.montantInitial || 0).toLocaleString()} F
                      </td>

                      <td className="py-4 px-6 text-right font-semibold text-emerald-600">
                        {dejaRegle > 0 ? `${dejaRegle.toLocaleString()} F` : '-'}
                      </td>

                      <td className="py-4 px-6 text-right">
                        <span className={`font-black text-sm ${isPaid ? 'text-slate-400' : 'text-rose-600'}`}>
                          {(debt.montantRestant || 0).toLocaleString()} <span className="text-[10px]">FCFA</span>
                        </span>
                      </td>

                      <td className="py-4 px-6 text-center">
                        {isPaid ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800">
                            <CheckCircle size={10} /> SOLDÉE
                          </span>
                        ) : debt.status === 'PARTIAL' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black bg-amber-100 text-amber-800">
                            <Clock size={10} /> PARTIEL
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black bg-rose-100 text-rose-800">
                            <AlertCircle size={10} /> EN ATTENTE
                          </span>
                        )}
                      </td>

                      <td className="py-4 px-6 text-right">
                        {isPaid ? (
                          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Soldé</span>
                        ) : (
                          <button
                            onClick={() => handleOpenPayment(debt)}
                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 ml-auto cursor-pointer"
                          >
                            <CreditCard size={13} /> Régler
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Payment Modal */}
      {selectedDebt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-lg w-full max-h-[90vh] flex flex-col border border-slate-200 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
                  <CreditCard size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900">Encaisser un Remboursement</h3>
                  <p className="text-xs text-slate-500 font-medium">Recouvrement de créance patient</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedDebt(null)}
                className="w-8 h-8 rounded-full hover:bg-slate-200/60 text-slate-400 hover:text-slate-600 flex items-center justify-center transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-5 flex-1 overflow-y-auto custom-scrollbar">
              {errorMessage && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-bold flex items-center gap-2">
                  <AlertCircle size={16} className="shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* Debt Snapshot */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500 font-medium">Patient</span>
                  <span className="font-bold text-slate-900">{selectedDebt.patientName || selectedDebt.patientId}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500 font-medium">Origine</span>
                  <span className="font-semibold text-slate-700">{selectedDebt.origin || 'Prestation'}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500 font-medium">Montant initial</span>
                  <span className="font-semibold text-slate-700">{(selectedDebt.montantInitial || 0).toLocaleString()} F</span>
                </div>
                <div className="flex justify-between items-center text-sm pt-2 border-t border-slate-200/60">
                  <span className="font-bold text-slate-700">Dette restante à solder</span>
                  <span className="font-black text-rose-600 text-base">{(selectedDebt.montantRestant || 0).toLocaleString()} FCFA</span>
                </div>
              </div>

              {/* Active Session Warning or Tag */}
              {!activeSession ? (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 font-medium flex items-center justify-between gap-2">
                  <span>Session fermée : vous devez ouvrir une session.</span>
                  {onOpenSessionRequest && (
                    <button
                      onClick={() => {
                        setSelectedDebt(null);
                        onOpenSessionRequest();
                      }}
                      className="px-2.5 py-1 bg-amber-600 text-white font-bold rounded-lg text-[10px]"
                    >
                      Ouvrir
                    </button>
                  )}
                </div>
              ) : (
                <div className="text-[11px] text-emerald-700 font-semibold flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  Crédit lié à la session : <span className="font-mono font-bold">{activeSession.id}</span>
                </div>
              )}

              {/* Payment Type Selection */}
              <div>
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-2">
                  Option de règlement
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handlePaymentTypeChange('FULL')}
                    className={`py-2 px-3 rounded-xl text-xs font-bold transition-all border cursor-pointer ${
                      paymentType === 'FULL'
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    Règlement Total (Solde complet)
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePaymentTypeChange('PARTIAL')}
                    className={`py-2 px-3 rounded-xl text-xs font-bold transition-all border cursor-pointer ${
                      paymentType === 'PARTIAL'
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    Règlement Partiel (Acompte)
                  </button>
                </div>
              </div>

              {/* Amount Input */}
              <div>
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">
                  Montant à Encaisser (FCFA)
                </label>
                <input
                  type="number"
                  value={paymentAmountInput}
                  onChange={(e) => setPaymentAmountInput(e.target.value)}
                  max={selectedDebt.montantRestant}
                  min={1}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-base font-black text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>

              {/* Payment Method */}
              <div>
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">
                  Mode de règlement
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'CASH', label: 'Espèces' },
                    { id: 'MOBILE_MONEY', label: 'Mobile Money' },
                    { id: 'CARD', label: 'Carte Bancaire' },
                    { id: 'TRANSFER', label: 'Virement' },
                    { id: 'CHECK', label: 'Chèque' }
                  ].map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setPaymentMethod(m.id as any)}
                      className={`py-2 px-2.5 rounded-xl text-xs font-bold transition-all border cursor-pointer ${
                        paymentMethod === m.id
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Cash Remis / Monnaie calculation for Espèces */}
              {paymentMethod === 'CASH' && (
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/70 grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Espèces Remises</label>
                    <input
                      type="number"
                      value={cashRemis}
                      onChange={(e) => setCashRemis(e.target.value)}
                      className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold"
                      placeholder="Montant remis"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Monnaie à Rendre</label>
                    <div className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-black text-emerald-600">
                      {monnaieRendue.toLocaleString()} F
                    </div>
                  </div>
                </div>
              )}

              {/* Notes */}
              <div>
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                  Note ou Référence (Optionnelle)
                </label>
                <input
                  type="text"
                  placeholder="Ex: Réf Wave, N° Chèque, Décharge..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>
            </div>

            {/* Modal Footer - Sticky Bottom */}
            <div className="p-6 border-t border-slate-100 bg-slate-50/90 backdrop-blur-xs flex items-center justify-end gap-3 shrink-0 sticky bottom-0 z-10">
              <button
                type="button"
                onClick={() => setSelectedDebt(null)}
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 text-xs font-bold transition-colors cursor-pointer"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleProcessPayment}
                disabled={isSubmitting || !activeSession}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white text-xs font-black transition-all shadow-xs flex items-center gap-2 cursor-pointer"
              >
                {isSubmitting ? (
                  <span>Validation...</span>
                ) : (
                  <>
                    <CheckCircle size={15} /> Valider le paiement
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Printable Receipt Modal */}
      {printedReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-md w-full border border-slate-200 shadow-2xl overflow-hidden p-6 space-y-6">
            <div className="text-center border-b border-dashed border-slate-200 pb-4">
              <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-700 mx-auto flex items-center justify-center mb-2">
                <Receipt size={24} />
              </div>
              <h3 className="text-base font-black text-slate-900 uppercase">
                {establishment?.name || 'SmartHosto'}
              </h3>
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">
                Quittance de Règlement de Dette
              </p>
              <p className="text-[10px] text-slate-400 font-mono mt-1">
                Réf: {printedReceipt.transactionId}
              </p>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Date & Heure:</span>
                <span className="font-mono font-bold text-slate-700">
                  {new Date(printedReceipt.date).toLocaleString('fr-FR')}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Patient:</span>
                <span className="font-bold text-slate-900">{printedReceipt.patientName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Mode de règlement:</span>
                <span className="font-semibold text-slate-700">{printedReceipt.paymentMethod}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Dette antérieure:</span>
                <span className="font-mono text-slate-600">{printedReceipt.oldDebt.toLocaleString()} F</span>
              </div>
              <div className="flex justify-between text-emerald-700 font-black text-sm pt-2 border-t border-slate-100">
                <span>Montant Encaissé:</span>
                <span>{printedReceipt.amountPaid.toLocaleString()} FCFA</span>
              </div>
              <div className="flex justify-between font-bold text-xs pt-1">
                <span className="text-slate-500">Solde Restant Dû:</span>
                <span className={printedReceipt.newRemaining > 0 ? 'text-rose-600 font-black' : 'text-emerald-600 font-black'}>
                  {printedReceipt.newRemaining > 0 ? `${printedReceipt.newRemaining.toLocaleString()} FCFA` : 'SOLDÉ (0 F)'}
                </span>
              </div>
            </div>

            <div className="pt-4 border-t border-dashed border-slate-200 text-center text-xs text-slate-600">
              <div className="flex items-center justify-center gap-2">
                <Avatar user={{ name: printedReceipt.cashierName }} size={20} />
                <p className="font-bold text-slate-800 uppercase tracking-wider">
                  Caissier : {printedReceipt.cashierName}
                </p>
              </div>
              <p className="text-[10px] text-slate-400 font-mono mt-1">
                Session: {printedReceipt.sessionId}
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => window.print()}
                className="flex-1 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center justify-center gap-2 cursor-pointer"
              >
                <Printer size={14} /> Imprimer Reçu
              </button>
              <button
                type="button"
                onClick={() => setPrintedReceipt(null)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold cursor-pointer"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
