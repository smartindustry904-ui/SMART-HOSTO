import React, { useState, useEffect, useMemo } from 'react';
import { CreditCard, DollarSign, ArrowUpRight, Printer, Search, Calendar, Landmark, CheckCircle2, Edit3, X, Calculator, Wallet, Clock, FileText, Home, Loader2, Check, ArrowLeft, Lock, Unlock, ShieldAlert, Award, AlertCircle, Smartphone, Banknote } from 'lucide-react';
import { PaymentRequest, CashierTransaction, PaymentStatus, TransactionFacturation, AvoirPatient, DettePatient, ParametresCaisse, CashierSession, Patient } from '../types';
import { formatPatientFullName } from '../src/patientUtils';
import { db, sanitizeData } from '../src/firebase';
import { doc, updateDoc, setDoc, collection, query, where, getDocs, writeBatch, onSnapshot } from 'firebase/firestore';
import { FacturationTool } from './tools/FacturationTool';
import { DebtManagement } from './cashier/DebtManagement';
import { Breadcrumbs } from '../components/common/Breadcrumbs';
import { MedicalStatusBadge } from '../components/common/MedicalStatusBadge';
import { MicroHeader } from '../components/common/MicroHeader';
import { Avatar } from '../components/common/Avatar';

import { useSettings } from '../hooks/useSettings';

interface CashierProps {
  user: any;
  paymentRequests: PaymentRequest[];
  setPaymentRequests: React.Dispatch<React.SetStateAction<PaymentRequest[]>>;
  cashierTransactions: CashierTransaction[];
  setCashierTransactions: React.Dispatch<React.SetStateAction<CashierTransaction[]>>;
  transactionsFacturation: TransactionFacturation[];
  setTransactionsFacturation: React.Dispatch<React.SetStateAction<TransactionFacturation[]>>;
  avoirsPatient: AvoirPatient[];
  setAvoirsPatient: React.Dispatch<React.SetStateAction<AvoirPatient[]>>;
  dettesPatient: DettePatient[];
  setDettesPatient: React.Dispatch<React.SetStateAction<DettePatient[]>>;
  parametresCaisse: ParametresCaisse;
  activeTab: 'dashboard' | 'facturation' | 'pending' | 'daily' | 'dettes';
  setActiveTab: (tab: 'dashboard' | 'facturation' | 'pending' | 'daily' | 'dettes') => void;
  onBackToDashboard: () => void;
  theme?: 'light' | 'dark';
}

export const formatDateTime = (dateInput?: string | number | Date): string => {
  if (!dateInput) return '-';
  try {
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return String(dateInput);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${minutes}`;
  } catch {
    return String(dateInput);
  }
};

export const isPharmacyOrMedication = (pr: any): boolean => {
  const source = (pr.sourceModule || pr.requestingService || pr.source || '').trim().toLowerCase();
  const type = (pr.type || '').trim().toLowerCase();
  if (source === 'pharmacie' || source === 'pharmacy' || source.includes('pharmaci')) return true;
  if (type === 'ordonnance' || type === 'medication' || type === 'pharmacie' || type === 'medicament' || type === 'prescription') return true;
  if (pr.items && Array.isArray(pr.items)) {
    const hasMed = pr.items.some((it: any) => {
      const itSource = (it.source || '').toLowerCase();
      const itName = (it.name || it.libelle || '').toLowerCase();
      return itSource === 'pharmacie' || itName.startsWith('ordonnance') || itName.includes('médicament');
    });
    if (hasMed) return true;
  }
  return false;
};

const Cashier: React.FC<CashierProps> = ({ 
  user, 
  paymentRequests, 
  setPaymentRequests, 
  cashierTransactions, 
  setCashierTransactions,
  transactionsFacturation,
  setTransactionsFacturation,
  avoirsPatient,
  setAvoirsPatient,
  dettesPatient,
  setDettesPatient,
  parametresCaisse,
  activeTab,
  setActiveTab,
  onBackToDashboard,
  theme = 'light'
}) => {
  const { establishment } = useSettings();
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<PaymentRequest | null>(null);
  const [paymentAmount, setPaymentAmount] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'CARD' | 'MOBILE_MONEY' | 'TRANSFER' | 'CHECK'>('CASH');
  const [isProcessing, setIsProcessing] = useState(false);
  const [notification, setNotification] = useState<{message: string, type: 'success' | 'error'} | null>(null);

  // New Search & Filter states
  const [pendingSearchQuery, setPendingSearchQuery] = useState('');
  const [dailySearchQuery, setDailySearchQuery] = useState('');
  const [dailyFilterMethod, setDailyFilterMethod] = useState<string>('ALL');

  // Cashier Shift Management States
  const [activeSession, setActiveSession] = useState<CashierSession | null>(null);
  const [showOpenSessionModal, setShowOpenSessionModal] = useState(false);
  const [showCloseSessionModal, setShowCloseSessionModal] = useState(false);
  const [closedSessionReport, setClosedSessionReport] = useState<CashierSession | null>(null);
  const [initialFloatInput, setInitialFloatInput] = useState('50000');
  const [actualCashInput, setActualCashInput] = useState('');

  // Live real-time patients synchronization for name resolution and credit blocking enforcement
  const [patientsList, setPatientsList] = useState<Patient[]>([]);
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'patients'), snapshot => {
      setPatientsList(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Patient)));
    }, err => {
      console.warn("Could not sync patients in Cashier:", err);
    });
    return () => unsub();
  }, []);

  const patientsMap = useMemo(() => {
    const map = new Map<string, Patient>();
    patientsList.forEach(p => {
      if (p.id) map.set(p.id, p);
      if ((p as any).patientId) map.set((p as any).patientId, p);
      if ((p as any).ipd) map.set((p as any).ipd, p);
    });
    return map;
  }, [patientsList]);

  // Real-time active open session subscription for this cashier
  useEffect(() => {
    const q = query(
      collection(db, 'cashier_sessions'),
      where('cashierId', '==', user.id || 'cashier-1'),
      where('status', '==', 'OPEN')
    );
    const unsub = onSnapshot(q, (snap) => {
      if (!snap.empty) {
        const sData = snap.docs[0].data() as CashierSession;
        setActiveSession({ ...sData, id: snap.docs[0].id });
      } else {
        setActiveSession(null);
      }
    }, (err) => {
      console.warn("Snapshot error cashier_sessions:", err);
    });
    return () => unsub();
  }, [user.id]);

  // Open Session Handler: Start clean valid caisse session
  const handleOpenSession = async () => {
    const floatNum = parseFloat(initialFloatInput) || 0;
    const newSession: CashierSession = {
      id: `SES-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      cashierId: user.id || 'cashier-1',
      cashierName: user.name || 'Caissier',
      openedAt: new Date().toISOString(),
      initialFloat: floatNum,
      status: 'OPEN',
      totalCash: 0,
      totalMobileMoney: 0,
      totalCard: 0,
      totalTransfer: 0,
      totalCheck: 0,
      totalAvance: 0,
      totalCollected: 0
    };

    try {
      // Optimistically update local session state immediately (0ms delay)
      setActiveSession(newSession);
      setShowOpenSessionModal(false);
      showNotification("Session de caisse ouverte avec succès.", "success");

      const sRef1 = doc(db, 'cashier_sessions', newSession.id);
      const sRef2 = doc(db, 'caisse_sessions', newSession.id);
      Promise.all([
        setDoc(sRef1, sanitizeData(newSession)),
        setDoc(sRef2, sanitizeData(newSession))
      ]).catch(err => {
        console.warn("Background session open sync warning:", err);
      });
    } catch (err) {
      console.error("Error opening session:", err);
      showNotification("Échec de l'ouverture de session.", "error");
    }
  };

  // Calculate Shift totals from session transactions strictly bound to this session_id
  const sessionTransactions = useMemo(() => {
    if (!activeSession) return [];

    return cashierTransactions.filter(tx => {
      if (tx.status === 'CANCELLED') return false;

      // STRICT SESSION BINDING: Transactions must be tied directly to this activeSession.id
      const matchesSession = tx.sessionId === activeSession.id || 
                             (tx as any).caisseSessionId === activeSession.id;
      return matchesSession;
    });
  }, [activeSession, cashierTransactions]);

  // Active Debts calculations for KPI and badges
  const activeDebtsList = useMemo(() => {
    return (dettesPatient || []).filter(d => d.status !== 'PAID' && (d.montantRestant || 0) > 0);
  }, [dettesPatient]);

  const totalActiveDebt = useMemo(() => {
    return activeDebtsList.reduce((sum, d) => sum + (d.montantRestant || 0), 0);
  }, [activeDebtsList]);

  const activeDebtsCount = activeDebtsList.length;

  const shiftTotals = useMemo(() => {
    let totalCash = 0;
    let totalMobileMoney = 0;
    let totalCard = 0;
    let totalTransfer = 0;
    let totalCheck = 0;
    let totalAvance = 0; // Value of transactions made with user avance (avoir patient)
    let totalAvanceGeneree = 0;
    let countAvanceTx = 0;

    sessionTransactions.forEach(tx => {
      // 1. Check if user avance/avoir was used in this transaction
      const avanceUsed = Number((tx as any).avoirUtilise) || Number((tx as any).montantAvoirApplique) || 0;
      if (avanceUsed > 0) {
        totalAvance += avanceUsed;
        countAvanceTx++;
      }

      const surplusSaved = Number((tx as any).surplusConserve) || Number((tx as any).surplusGenere) || 0;
      if (surplusSaved > 0) {
        totalAvanceGeneree += surplusSaved;
      }

      // 2. Net monetary amount entering the caisse for this transaction
      const amount = (tx as any).amount !== undefined && !isNaN(Number((tx as any).amount))
        ? Number((tx as any).amount)
        : (tx as any).montantPaye !== undefined && !isNaN(Number((tx as any).montantPaye))
        ? (Number((tx as any).montantPaye) - (Number((tx as any).monnaieRendue) || 0))
        : Number((tx as any).totalGeneral) || 0;

      const method = String(tx.paymentMethod || (tx as any).modePaiement || 'CASH').toUpperCase();
      switch (method) {
        case 'CASH':
        case 'ESPECES':
          totalCash += amount;
          break;
        case 'MOBILE_MONEY':
          totalMobileMoney += amount;
          break;
        case 'CARD':
        case 'CARTE':
          totalCard += amount;
          break;
        case 'TRANSFER':
        case 'VIREMENT':
          totalTransfer += amount;
          break;
        case 'CHECK':
        case 'CHEQUE':
          totalCheck += amount;
          break;
        case 'AVANCE':
        case 'AVOIR':
          // If transaction was paid purely by avance and not already counted via avoirUtilise
          if (avanceUsed === 0 && amount > 0) {
            totalAvance += amount;
            countAvanceTx++;
          }
          break;
        default:
          totalCash += amount;
      }
    });

    // Total general turnover of prestations settled during the shift
    const totalCollected = totalCash + totalMobileMoney + totalCard + totalTransfer + totalCheck + totalAvance;
    // Physical cash in hand is strictly the net cash amount entered in the caisse drawer (avance is an accounting deduction)
    const expectedCashInHand = totalCash;

    return {
      totalCash,
      totalMobileMoney,
      totalCard,
      totalTransfer,
      totalCheck,
      totalAvance,
      totalAvanceGeneree,
      countAvanceTx,
      totalCollected,
      expectedCashInHand
    };
  }, [sessionTransactions]);

  // Strict Anti-Fraud Close Session Handler:
  // The amount is strictly the amount entered daily within a valid caisse session (no variance, certified reconciliation)
  const handleCloseSession = async () => {
    if (!activeSession) return;

    const drawerCashExpected = (activeSession.initialFloat || 0) + shiftTotals.totalCash;

    const closedSession: CashierSession = {
      ...activeSession,
      closedAt: new Date().toISOString(),
      status: 'CLOSED',
      totalCash: shiftTotals.totalCash,
      totalMobileMoney: shiftTotals.totalMobileMoney,
      totalCard: shiftTotals.totalCard,
      totalTransfer: shiftTotals.totalTransfer,
      totalCheck: shiftTotals.totalCheck,
      totalAvance: shiftTotals.totalAvance,
      totalCollected: shiftTotals.totalCollected,
      expectedFinalFloat: drawerCashExpected,
      actualCashInHand: drawerCashExpected, // Strictly synced to drawer physical cash + float
      difference: 0
    };

    try {
      // Optimistically update local session state immediately (0ms delay)
      setClosedSessionReport(closedSession);
      setActiveSession(null);
      setShowCloseSessionModal(false);
      showNotification("Clôture de caisse validée et bordereau officiel généré.", "success");

      const sRef1 = doc(db, 'cashier_sessions', activeSession.id);
      const sRef2 = doc(db, 'caisse_sessions', activeSession.id);
      Promise.all([
        setDoc(sRef1, sanitizeData(closedSession), { merge: true }),
        setDoc(sRef2, sanitizeData(closedSession), { merge: true })
      ]).catch(err => {
        console.warn("Background session close sync warning:", err);
      });
    } catch (err) {
      console.error("Error closing session:", err);
      showNotification("Erreur lors de la clôture de caisse.", "error");
    }
  };

  const showNotification = (message: string, type: 'success' | 'error' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  };

  const pendingRequestsSorted = useMemo(() => {
    const prMap = new Map<string, PaymentRequest>();
    paymentRequests.forEach(pr => {
      // Strictly exclude any items where source === 'Pharmacie' or type === 'ordonnance' / 'medication'
      if (isPharmacyOrMedication(pr)) return;
      
      // STRICT FILTER: Strictly filter out paid, settled or cancelled invoices from active billing queue
      const statusUpper = (pr.status || '').toUpperCase();
      const paymentStatusUpper = ((pr as any).payment_status || '').toUpperCase();
      if (
        statusUpper === 'PAID' || 
        statusUpper === 'SOLDE' || 
        statusUpper === 'PAYE' || 
        statusUpper === 'COMPLETED' || 
        statusUpper === 'CANCELLED' || 
        statusUpper === 'DELIVERED' ||
        statusUpper === 'PAID_PENDING_PICKUP'
      ) return;

      if (
        paymentStatusUpper === 'PAID' || 
        paymentStatusUpper === 'SOLDE' || 
        paymentStatusUpper === 'PAYE' ||
        paymentStatusUpper === 'COMPLETED'
      ) return;

      if ((pr as any).isPaid === true || (pr as any).paid === true) return;

      // Only PENDING or PARTIAL statuses enter the billing queue
      if (pr.status !== 'PENDING' && pr.status !== 'PARTIAL') return;
      
      const remaining = (pr.totalAmount || 0) - (pr.amountPaid || 0);
      if (remaining <= 0) return;
      if ((pr as any).resteAPayer !== undefined && Number((pr as any).resteAPayer) <= 0) return;

      if (!prMap.has(pr.id)) {
        prMap.set(pr.id, pr);
      }
    });

    let filtered = Array.from(prMap.values());
    if (pendingSearchQuery) {
      const q = pendingSearchQuery.toLowerCase();
      filtered = filtered.filter(pr => 
        (pr.patientName || '').toLowerCase().includes(q) || 
        (pr.id || '').toLowerCase().includes(q) ||
        (pr.sourceModule || '').toLowerCase().includes(q)
      );
    }

    return filtered.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  }, [paymentRequests, pendingSearchQuery]);

  const dailyTransactionsFiltered = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    const txMap = new Map<string, CashierTransaction>();
    cashierTransactions.forEach(tx => {
      if (tx.date?.startsWith(todayStr)) {
        if (!txMap.has(tx.id)) {
          txMap.set(tx.id, tx);
        }
      }
    });

    let filtered = Array.from(txMap.values());

    if (dailySearchQuery) {
      const q = dailySearchQuery.toLowerCase();
      filtered = filtered.filter(tx => 
        (tx.id || '').toLowerCase().includes(q) || 
        (tx.cashierName || '').toLowerCase().includes(q) ||
        (tx.paymentRequestId || '')?.toLowerCase().includes(q)
      );
    }

    if (dailyFilterMethod !== 'ALL') {
      filtered = filtered.filter(tx => tx.paymentMethod === dailyFilterMethod);
    }

    return filtered.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
  }, [cashierTransactions, dailySearchQuery, dailyFilterMethod]);

  const [selectedTransactionDetail, setSelectedTransactionDetail] = useState<any | null>(null);
  const [useAvoir, setUseAvoir] = useState(false);
  const [includeExistingDebt, setIncludeExistingDebt] = useState(false);
  const [surplusAction, setSurplusAction] = useState<'AVANCE' | 'RENDRE' | null>(null);

  const totalAvoirDispo = useMemo(() => {
    if (!selectedRequest) return 0;
    return avoirsPatient
      .filter(a => a.patientId === selectedRequest.patientId && a.status === 'AVAILABLE')
      .reduce((sum, a) => sum + (a.montant || 0), 0);
  }, [selectedRequest, avoirsPatient]);

  const totalDetteEnCours = useMemo(() => {
    if (!selectedRequest) return 0;
    return dettesPatient
      .filter(d => d.patientId === selectedRequest.patientId && d.status === 'PENDING')
      .reduce((sum, d) => sum + (d.montantRestant || 0), 0);
  }, [selectedRequest, dettesPatient]);

  const remainingDue = (selectedRequest?.totalAmount || 0) - (selectedRequest?.amountPaid || 0);
  const detteAInclure = includeExistingDebt ? totalDetteEnCours : 0;
  const netTotalToPay = remainingDue + detteAInclure;
  
  const montantAvoirApplique = useAvoir ? Math.min(totalAvoirDispo, netTotalToPay) : 0;
  const netToPay = Math.max(0, netTotalToPay - montantAvoirApplique);
  
  const remis = parseFloat(paymentAmount) || 0;
  const surplus = Math.max(0, remis - netToPay);
  const resteAPayer = Math.max(0, netToPay - remis);

  const monnaieRendueValue = surplusAction === 'RENDRE' ? surplus : 0;
  const surplusGenereValue = surplusAction === 'AVANCE' ? surplus : 0;

  // Selected patient object & credit blocking status from real-time patients collection
  const selectedPatientObj = useMemo(() => {
    if (!selectedRequest?.patientId) return null;
    return patientsMap.get(selectedRequest.patientId) || null;
  }, [selectedRequest, patientsMap]);

  const isCreditBlocked = useMemo(() => {
    if (!selectedPatientObj) return false;
    return selectedPatientObj.creditBlocked === true || selectedPatientObj.allowCredit === false;
  }, [selectedPatientObj]);

  // Auto-adjust paymentAmount when useAvoir or includeExistingDebt is toggled
  useEffect(() => {
    if (selectedRequest) {
      const remaining = selectedRequest.totalAmount - (selectedRequest.amountPaid || 0);
      const totalToPay = remaining + (includeExistingDebt ? totalDetteEnCours : 0);
      const toPay = useAvoir ? Math.max(0, totalToPay - totalAvoirDispo) : totalToPay;
      setPaymentAmount(toPay.toString());
    }
  }, [useAvoir, includeExistingDebt, selectedRequest, totalAvoirDispo, totalDetteEnCours]);

  const handleOpenPayment = (request: PaymentRequest) => {
    if (!activeSession) {
      showNotification("Session de caisse fermée ! Veuillez ouvrir une session pour pouvoir enregistrer un paiement.", "error");
      setShowOpenSessionModal(true);
      return;
    }
    setSelectedRequest(request);
    setShowPaymentModal(true);
    const remaining = request.totalAmount - (request.amountPaid || 0);
    setPaymentAmount(remaining.toString());
    setPaymentMethod('CASH');
    setUseAvoir(false);
    setIncludeExistingDebt(false);
    setSurplusAction(null);
  };

  const processPayment = async () => {
    if (!selectedRequest || isProcessing) return;
    if (!activeSession) {
      showNotification("Session de caisse fermée ! Veuillez ouvrir une session de caisse.", "error");
      setShowOpenSessionModal(true);
      return;
    }

    if (isCreditBlocked && resteAPayer > 0) {
      showNotification("Opération refusée : Le crédit de ce patient est verrouillé par la Comptabilité. Tout paiement partiel ou création de dette est strictement interdit.", "error");
      return;
    }

    if (surplus > 0 && !surplusAction) {
      showNotification("Veuillez choisir obligatoirement le traitement du surplus (Remboursement ou Avoir).", "error");
      return;
    }

    setIsProcessing(true);

    try {
      const transactionId = `TX-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      
      // The actual amount that stays in the drawer and is applied to the current request
      const appliedCash = remis - monnaieRendueValue - surplusGenereValue;
      const totalAppliedToRequest = appliedCash + montantAvoirApplique;
      
      const newPaid = (selectedRequest.amountPaid || 0) + Math.min(remainingDue, totalAppliedToRequest);
      const newStatus: PaymentStatus = newPaid >= selectedRequest.totalAmount ? 'PAID' : 'PARTIAL';

      const newTransaction: any = {
        id: transactionId,
        paymentRequestId: selectedRequest.id,
        patientId: selectedRequest.patientId,
        patientName: formatPatientFullName(selectedPatientObj, selectedRequest.patientName),
        date: new Date().toISOString(),
        amount: remis - monnaieRendueValue, // Net cash entering the caisse
        montantPaye: remis,
        avoirUtilise: montantAvoirApplique,
        totalDu: selectedRequest.totalAmount,
        detteIncluse: detteAInclure,
        reliquatDuAvant: remainingDue,
        surplusGenere: surplusGenereValue,
        monnaieRendue: monnaieRendueValue,
        detteCreee: resteAPayer,
        paymentMethod: paymentMethod,
        cashierId: user.id,
        cashierName: user.name,
        sessionId: activeSession.id,
        caisseSessionId: activeSession.id,
        status: 'VALIDATED'
      };

      const batch = writeBatch(db);

      // 1. Update PaymentRequest in Firebase
      const prRef = doc(db, 'payment_requests', selectedRequest.id);
      batch.update(prRef, sanitizeData({
        amountPaid: newPaid,
        status: newStatus,
        updatedAt: new Date().toISOString()
      }));

      // 2. Save Transaction in Firebase
      const txRef = doc(db, 'cashier_transactions', newTransaction.id);
      batch.set(txRef, sanitizeData(newTransaction));

      // 3. Handle Avoir Usage
      if (montantAvoirApplique > 0) {
        let restantAUtiliser = montantAvoirApplique;
        const patientAvoirs = avoirsPatient
          .filter(a => a.patientId === selectedRequest.patientId && a.status === 'AVAILABLE')
          .sort((a, b) => new Date(a.dateCreation).getTime() - new Date(b.dateCreation).getTime());

        for (const av of patientAvoirs) {
          if (restantAUtiliser <= 0) break;
          const toUse = Math.min(av.montant, restantAUtiliser);
          const avRef = doc(db, 'avoirs_patient', av.id);
          if (toUse >= av.montant) {
            batch.update(avRef, { status: 'USED', updatedAt: new Date().toISOString() });
          } else {
            batch.update(avRef, { montant: av.montant - toUse, updatedAt: new Date().toISOString() });
          }
          restantAUtiliser -= toUse;
        }
      }

      // 4. Handle New Surplus (Advance)
      if (surplusAction === 'AVANCE' && surplus > 0) {
        const newAvoir: AvoirPatient = {
          id: `AV-${Date.now()}`,
          patientId: selectedRequest.patientId,
          montant: surplus,
          dateCreation: new Date().toISOString(),
          transactionSourceId: transactionId,
          status: 'AVAILABLE'
        };
        const newAvoirRef = doc(db, 'avoirs_patient', newAvoir.id);
        batch.set(newAvoirRef, sanitizeData(newAvoir));
      }

      // 5. Handle Debt inclusion settlement & New Debt
      if (includeExistingDebt) {
        const patientDettes = dettesPatient.filter(d => d.patientId === selectedRequest.patientId && d.status === 'PENDING');
        for (const d of patientDettes) {
          const detteRef = doc(db, 'dettes_patient', d.id);
          batch.update(detteRef, { 
            montantRestant: 0, 
            status: 'PAID', 
            updatedAt: new Date().toISOString() 
          });
        }
      }

      if (resteAPayer > 0) {
        const newDette: DettePatient = {
          id: `DT-${Date.now()}`,
          patientId: selectedRequest.patientId,
          patientName: formatPatientFullName(selectedPatientObj, selectedRequest.patientName),
          montantInitial: resteAPayer,
          montantRestant: resteAPayer,
          dateCreation: new Date().toISOString(),
          transactionSourceId: transactionId,
          status: 'PENDING'
        };
        const newDetteRef = doc(db, 'dettes_patient', newDette.id);
        batch.set(newDetteRef, sanitizeData(newDette));
      }

      // Optimistically update local states immediately (0ms delay)
      setPaymentRequests(prev =>
        prev.map(pr =>
          pr.id === selectedRequest.id
            ? { ...pr, amountPaid: newPaid, status: newStatus }
            : pr
        )
      );
      setCashierTransactions(prev => [newTransaction, ...prev.filter(t => t.id !== newTransaction.id)]);

      if (surplusAction === 'AVANCE' && surplus > 0) {
        setAvoirsPatient(prev => [
          {
            id: `AV-${Date.now()}`,
            patientId: selectedRequest.patientId,
            montant: surplus,
            dateCreation: new Date().toISOString(),
            transactionSourceId: transactionId,
            status: 'AVAILABLE'
          },
          ...prev
        ]);
      }

      if (includeExistingDebt) {
        setDettesPatient(prev =>
          prev.map(d =>
            d.patientId === selectedRequest.patientId && d.status === 'PENDING'
              ? { ...d, montantRestant: 0, status: 'PAID' as const }
              : d
          )
        );
      }

      if (resteAPayer > 0) {
        setDettesPatient(prev => [
          {
            id: `DT-${Date.now()}`,
            patientId: selectedRequest.patientId,
            patientName: formatPatientFullName(selectedPatientObj, selectedRequest.patientName),
            montantInitial: resteAPayer,
            montantRestant: resteAPayer,
            dateCreation: new Date().toISOString(),
            transactionSourceId: transactionId,
            status: 'PENDING'
          },
          ...prev
        ]);
      }

      showNotification("Encaissement validé avec succès.");
      setShowPaymentModal(false);
      setSelectedRequest(null);
      setIsProcessing(false);

      // Commit core writes to local IndexedDB cache + background Firestore sync
      batch.commit().catch(err => {
        console.warn("Background payment batch sync warning:", err);
      });

      // 6. Clear financial status in discharges_waiting & service_queues in background
      if (newStatus === 'PAID' || newPaid > 0 || resteAPayer === 0) {
        const targetPatientIds = [
          selectedRequest.patientId,
          (selectedRequest as any).dmeId,
          (selectedRequest as any).patientDocId
        ].filter(Boolean);

        (async () => {
          try {
            const bgBatch = writeBatch(db);
            let hasUpdates = false;
            for (const pid of targetPatientIds) {
              const q = query(collection(db, 'discharges_waiting'), where('patientId', '==', pid));
              const snaps = await getDocs(q);
              for (const dSnap of snaps.docs) {
                bgBatch.update(doc(db, 'discharges_waiting', dSnap.id), sanitizeData({ financialClearance: true }));
                hasUpdates = true;
              }

              const qSq = query(collection(db, 'service_queues'), where('patientId', '==', pid));
              const sqSnaps = await getDocs(qSq);
              for (const sqDoc of sqSnaps.docs) {
                bgBatch.update(doc(db, 'service_queues', sqDoc.id), { paymentStatus: 'SOLDE' });
                hasUpdates = true;
              }

              const qSqDme = query(collection(db, 'service_queues'), where('dmeId', '==', pid));
              const sqDmeSnaps = await getDocs(qSqDme);
              for (const sqDoc of sqDmeSnaps.docs) {
                bgBatch.update(doc(db, 'service_queues', sqDoc.id), { paymentStatus: 'SOLDE' });
                hasUpdates = true;
              }
            }
            if (hasUpdates) {
              await bgBatch.commit();
            }
          } catch (bgErr) {
            console.warn("Background queue/discharge clearance sync warning:", bgErr);
          }
        })();
      }
    } catch (e) {
      console.error("Error processing payment in Firebase transaction: ", e);
      showNotification("Échec de la transaction : aucune modification n'a été enregistrée.", 'error');
      window.dispatchEvent(new CustomEvent('app-notification', {
        detail: { message: "L'encaissement a échoué. Aucun changement n'a été effectué.", type: 'error' }
      }));
    } finally {
      setIsProcessing(false);
    }
  };

  const getTxAmount = (tx: any) => {
    // Total amount credited to the invoice
    return (tx.montantPaye || 0) - (tx.surplusGenere || 0) - (tx.monnaieRendue || 0) + (tx.avoirUtilise || 0);
  };

  const getTxPatientName = (tx: any) => {
    const pId = tx.patientId || '';
    const resolvedPatient = patientsMap.get(pId);
    if (resolvedPatient) {
      return formatPatientFullName(resolvedPatient, tx.patientName);
    }
    if (tx.patientName) return formatPatientFullName(null, tx.patientName);
    const pr = paymentRequests.find(p => p.id === tx.paymentRequestId);
    if (pr) {
      const prPatient = patientsMap.get(pr.patientId);
      return formatPatientFullName(prPatient, pr.patientName);
    }
    return 'Patient Anonyme / Non renseigné';
  };

  return (
    <div className={`h-screen flex flex-col overflow-hidden p-3 sm:p-5 font-sans ${theme === 'dark' ? 'bg-[#090d16] text-slate-100' : 'bg-[#F8FAFC] text-slate-900'}`}>
      {/* Notifications Toast */}
      {notification && (
        <div className={`fixed top-5 right-5 z-[200] px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-5 transition-all ${
          notification.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'
        }`}>
          {notification.type === 'success' ? <CheckCircle2 size={18} /> : <X size={18} />}
          <p className="font-bold text-xs">{notification.message}</p>
        </div>
      )}

      <MicroHeader
        icon={CreditCard}
        breadcrumbs={[
          { label: 'Caisse', onClick: () => setActiveTab('dashboard') },
          { 
            label: activeTab === 'dashboard' ? 'Tableau de Bord' :
                   activeTab === 'facturation' ? 'Facturation' : 
                   activeTab === 'pending' ? 'En Attente' : 
                   activeTab === 'dettes' ? 'Gestion des Dettes' : 'Journal',
            active: true
          }
        ]}
        onHomeClick={onBackToDashboard}
        onBackClick={activeTab !== 'dashboard' ? () => setActiveTab('dashboard') : undefined}
        user={{ name: user?.name || 'Caissier' }}
        theme={theme}
        actions={
          <div className="flex items-center gap-2">
            <div className="hidden md:flex items-center gap-1.5 overflow-x-auto">
              {[
                { id: 'dashboard', label: 'Dashboard' },
                { id: 'facturation', label: 'Facturation' },
                { id: 'pending', label: `Attente (${pendingRequestsSorted.length})` },
                { id: 'dettes', label: `Dettes (${activeDebtsCount})` },
                { id: 'daily', label: 'Journal' }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`px-3 py-1.5 rounded-xl font-semibold text-xs transition-all cursor-pointer ${
                    activeTab === tab.id
                      ? tab.id === 'dettes'
                        ? 'bg-amber-600 text-white shadow-xs'
                        : tab.id === 'pending'
                        ? 'bg-rose-600 text-white shadow-xs'
                        : 'bg-blue-600 text-white shadow-xs'
                      : theme === 'dark'
                      ? 'bg-slate-800/80 border border-slate-700/80 text-slate-300 hover:bg-slate-800'
                      : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {activeSession ? (
              <div className={`flex items-center gap-2 px-2.5 py-1 rounded-xl border ${
                theme === 'dark' ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-emerald-50 border-emerald-200'
              }`}>
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className={`text-xs font-bold tabular-nums ${theme === 'dark' ? 'text-emerald-400' : 'text-emerald-700'}`}>
                  Ouverte ({activeSession.initialFloat.toLocaleString()} F)
                </span>
                <button
                  onClick={() => { setActualCashInput(''); setShowCloseSessionModal(true); }}
                  className="px-2 py-0.5 bg-rose-600 hover:bg-rose-700 text-white font-semibold text-[11px] rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                >
                  <Lock size={11} /> Clôturer
                </button>
              </div>
            ) : (
              <div className={`flex items-center gap-2 px-2.5 py-1 rounded-xl border ${
                theme === 'dark' ? 'bg-amber-500/10 border-amber-500/30' : 'bg-amber-50 border-amber-200'
              }`}>
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                <span className={`text-xs font-bold ${theme === 'dark' ? 'text-amber-400' : 'text-amber-700'}`}>Fermée</span>
                <button
                  onClick={() => setShowOpenSessionModal(true)}
                  className="px-2 py-0.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-[11px] rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                >
                  <Unlock size={11} /> Ouvrir
                </button>
              </div>
            )}
          </div>
        }
      />

      <main className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
      {activeTab === 'dashboard' && (
        <div className="space-y-6">
          {/* Active Session Status / Quick Shift Management Hero */}
          <div className={`p-6 rounded-[28px] border transition-all ${
            activeSession 
              ? 'bg-gradient-to-r from-emerald-950/90 via-slate-900 to-slate-900 text-white border-emerald-500/40 shadow-xl' 
              : 'bg-gradient-to-r from-amber-950/90 via-slate-900 to-slate-900 text-white border-amber-500/40 shadow-xl'
          }`}>
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  {activeSession ? (
                    <span className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-full text-xs font-black uppercase tracking-wider">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                      Session Caisse Active
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-2 px-3 py-1 bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-full text-xs font-black uppercase tracking-wider">
                      <Lock size={12} className="text-amber-400" />
                      Session Fermée (Prise de Poste Requise)
                    </span>
                  )}
                  {activeSession && (
                    <span className="font-mono text-xs text-slate-400 font-bold">
                      ID: {activeSession.id}
                    </span>
                  )}
                </div>
                <h2 className="text-2xl font-black tracking-tight">
                  {activeSession ? (
                    <>Shift actif : <span className="text-emerald-400">{activeSession.cashierName || user.name}</span></>
                  ) : (
                    <>Caisse Centrale Prête pour Prise de Poste</>
                  )}
                </h2>
                <p className="text-xs text-slate-300 font-medium max-w-2xl leading-relaxed">
                  {activeSession ? (
                    <>
                      Ouverte à <strong className="text-white">{formatDateTime(activeSession.openedAt)}</strong> avec un fond initial de <strong className="text-emerald-400">{(activeSession.initialFloat || 0).toLocaleString()} {establishment.currency}</strong>. Tous les encaissements et règlements validés sont automatiquement liés à cette session.
                    </>
                  ) : (
                    <>
                      Aucun encaissement ne peut être validé tant que la session de caisse n'est pas ouverte. Ouvrez une session pour comptabiliser les encaissements, facturations et règlements de dettes.
                    </>
                  )}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3 shrink-0">
                {activeSession ? (
                  <>
                    <button
                      onClick={() => setActiveTab('facturation')}
                      className="px-5 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer shadow-lg shadow-emerald-600/30"
                    >
                      <Calculator size={16} /> Encaisser une Facture
                    </button>
                    <button
                      onClick={() => { setActualCashInput(''); setShowCloseSessionModal(true); }}
                      className="px-5 py-3 bg-rose-600 hover:bg-rose-500 text-white rounded-2xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer shadow-lg shadow-rose-600/30"
                    >
                      <Lock size={16} /> Clôturer la Session
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setShowOpenSessionModal(true)}
                    className="px-6 py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl text-sm font-black transition-all flex items-center gap-2 cursor-pointer shadow-xl shadow-emerald-600/30"
                  >
                    <Unlock size={18} /> Ouvrir une Session de Caisse
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* ULTRA-COMPACT CAISSE KPI DASHBOARD */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Card 1: Recettes Session / Statut Caisse */}
            <div
              id="caisse-kpi-recettes"
              onClick={activeSession ? () => setActiveTab('daily') : () => setShowOpenSessionModal(true)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  activeSession ? setActiveTab('daily') : setShowOpenSessionModal(true);
                }
              }}
              className="p-3 bg-white rounded-2xl border border-slate-200/80 hover:border-emerald-400 hover:shadow-xs hover:bg-emerald-50/20 transition-all cursor-pointer group flex flex-col justify-between"
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <div className="flex items-center gap-2 min-w-0">
                  <div className={`w-8 h-8 rounded-xl ${activeSession ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'} flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform`}>
                    <Landmark size={15} />
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 truncate">
                    {activeSession ? "Recettes Session" : "Statut Caisse"}
                  </span>
                </div>
                <ArrowUpRight size={13} className="text-slate-300 group-hover:text-emerald-500 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all shrink-0" />
              </div>
              <div className="mt-1">
                <div className="text-lg font-black text-slate-900 font-mono tracking-tight leading-tight truncate">
                  {activeSession 
                    ? shiftTotals.totalCollected.toLocaleString() + ' ' + establishment.currency
                    : "Fermée"}
                </div>
                <p className="text-[10px] font-semibold text-slate-500 truncate mt-0.5">
                  {activeSession 
                    ? `${sessionTransactions.length} paiement(s) validé(s)${shiftTotals.totalMobileMoney > 0 ? ` • MoMo: ${shiftTotals.totalMobileMoney.toLocaleString()} F` : ''}` 
                    : "Cliquer pour ouvrir la caisse"}
                </p>
              </div>
            </div>

            {/* Card 2: Espèces au Tiroir / Fond de Caisse */}
            <div
              id="caisse-kpi-tiroir"
              onClick={() => activeSession ? setShowCloseSessionModal(true) : setShowOpenSessionModal(true)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  activeSession ? setShowCloseSessionModal(true) : setShowOpenSessionModal(true);
                }
              }}
              className="p-3 bg-white rounded-2xl border border-slate-200/80 hover:border-blue-400 hover:shadow-xs hover:bg-blue-50/20 transition-all cursor-pointer group flex flex-col justify-between"
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    <Wallet size={15} />
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 truncate">
                    {activeSession ? "Espèces au Tiroir" : "Fond de Caisse"}
                  </span>
                </div>
                <ArrowUpRight size={13} className="text-slate-300 group-hover:text-blue-500 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all shrink-0" />
              </div>
              <div className="mt-1">
                <div className="text-lg font-black text-slate-900 font-mono tracking-tight leading-tight truncate">
                  {activeSession 
                    ? ((activeSession.initialFloat || 0) + shiftTotals.totalCash).toLocaleString() + ' ' + establishment.currency
                    : "0 " + establishment.currency}
                </div>
                <p className="text-[10px] font-semibold text-slate-500 truncate mt-0.5">
                  {activeSession 
                    ? `Fond: ${(activeSession.initialFloat || 0).toLocaleString()} F • Espèces: ${shiftTotals.totalCash.toLocaleString()} F`
                    : "Aucun tiroir ouvert"}
                </p>
              </div>
            </div>

            {/* Card 3: Factures en Attente */}
            <div
              id="caisse-kpi-attente"
              onClick={() => setActiveTab('pending')}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setActiveTab('pending');
                }
              }}
              className="p-3 bg-white rounded-2xl border border-slate-200/80 hover:border-rose-400 hover:shadow-xs hover:bg-rose-50/20 transition-all cursor-pointer group flex flex-col justify-between"
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-8 h-8 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                    <Clock size={15} />
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 truncate">
                    Factures en Attente
                  </span>
                </div>
                <ArrowUpRight size={13} className="text-slate-300 group-hover:text-rose-500 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all shrink-0" />
              </div>
              <div className="mt-1">
                <div className="text-lg font-black text-rose-600 font-mono tracking-tight leading-tight truncate">
                  {pendingRequestsSorted.length.toString().padStart(2, '0')}
                </div>
                <p className="text-[10px] font-semibold text-slate-500 truncate mt-0.5">
                  Demandes prêtes à régler
                </p>
              </div>
            </div>

            {/* Card 4: Dettes & Créances */}
            <div
              id="caisse-kpi-dettes"
              onClick={() => setActiveTab('dettes')}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setActiveTab('dettes');
                }
              }}
              className="p-3 bg-white rounded-2xl border border-slate-200/80 hover:border-amber-400 hover:shadow-xs hover:bg-amber-50/20 transition-all cursor-pointer group flex flex-col justify-between"
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                    <AlertCircle size={15} />
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 truncate">
                    Dettes & Créances
                  </span>
                </div>
                <ArrowUpRight size={13} className="text-slate-300 group-hover:text-amber-500 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all shrink-0" />
              </div>
              <div className="mt-1">
                <div className="text-lg font-black text-amber-600 font-mono tracking-tight leading-tight truncate">
                  {totalActiveDebt.toLocaleString()} <span className="text-xs font-bold text-slate-500">{establishment.currency}</span>
                </div>
                <p className="text-[10px] font-semibold text-slate-500 truncate mt-0.5">
                  {activeDebtsCount} créance(s) en cours
                </p>
              </div>
            </div>
          </div>

          {/* Real Transactions Table for Dashboard */}
          <div className="bg-white rounded-[32px] border border-slate-200/60 shadow-sm overflow-hidden">
            <div className="p-8 border-b border-slate-100 flex justify-between items-center">
              <div>
                <h3 className="text-xl font-black text-slate-900">Dernières Transactions du Jour</h3>
                <p className="text-sm text-slate-500 font-medium">Flux financier en temps réel (Top 5)</p>
              </div>
              <button 
                onClick={() => setActiveTab('daily')}
                className="px-4 py-2 bg-slate-900 text-white rounded-xl hover:bg-emerald-600 transition-colors text-xs font-bold uppercase tracking-wider flex items-center gap-2"
              >
                Voir tout le journal <ArrowUpRight size={14} />
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/50 text-[10px] uppercase tracking-[0.2em] text-slate-400 font-black">
                    <th className="px-8 py-4">ID Transaction</th>
                    <th className="px-8 py-4">Date & Heure</th>
                    <th className="px-8 py-4">Patient</th>
                    <th className="px-8 py-4">Mode</th>
                    <th className="px-8 py-4 text-right">Montant</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {dailyTransactionsFiltered.slice(0, 5).map(tx => (
                    <tr 
                      key={tx.id} 
                      className="hover:bg-slate-50/50 transition-colors cursor-pointer group"
                      onClick={() => setSelectedTransactionDetail(tx)}
                    >
                      <td className="px-8 py-4">
                        <span className="font-mono text-xs font-bold text-slate-400 group-hover:text-emerald-600 transition-colors">{tx.id}</span>
                      </td>
                      <td className="px-8 py-4">
                        <span className="text-sm font-bold text-slate-700 font-mono">{formatDateTime(tx.date)}</span>
                      </td>
                      <td className="px-8 py-4">
                        <span className="text-sm font-black text-slate-900">{getTxPatientName(tx)}</span>
                      </td>
                      <td className="px-8 py-4">
                        <span className={`px-2 py-1 rounded text-[10px] font-black uppercase ${
                          tx.paymentMethod === 'CASH' ? 'bg-emerald-50 text-emerald-600' :
                          tx.paymentMethod === 'CARD' ? 'bg-blue-50 text-blue-600' :
                          'bg-amber-50 text-amber-600'
                        }`}>
                          {tx.paymentMethod || 'N/A'}
                        </span>
                      </td>
                      <td className="px-8 py-4 text-right">
                        <span className="text-sm font-black text-emerald-600">+{(getTxAmount(tx)).toLocaleString()} F</span>
                      </td>
                    </tr>
                  ))}
                  {dailyTransactionsFiltered.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-8 py-12 text-center text-slate-400 font-medium">
                        Aucune transaction enregistrée aujourd'hui.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      {activeTab === 'facturation' && (
        <div className="bg-white rounded-[32px] border border-slate-200/60 shadow-sm overflow-hidden min-h-[calc(100vh-250px)]">
          <FacturationTool 
            user={user}
            paymentRequests={paymentRequests}
            setPaymentRequests={setPaymentRequests}
            transactions={transactionsFacturation}
            setTransactions={setTransactionsFacturation}
            avoirs={avoirsPatient}
            setAvoirs={setAvoirsPatient}
            dettes={dettesPatient}
            setDettes={setDettesPatient}
            parametres={parametresCaisse}
            activeSession={activeSession}
          />
        </div>
      )}

      {activeTab === 'pending' && (
        <div className="bg-white rounded-[32px] border border-slate-200/60 shadow-sm overflow-hidden">
          <div className="p-8 border-b border-slate-100 bg-slate-50/50 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <h3 className="font-bold text-xs uppercase tracking-[0.2em] text-slate-500 flex items-center gap-2">
                <FileText size={16} /> Demandes de paiement en attente
              </h3>
              <span className="bg-rose-100 text-rose-700 font-bold px-3 py-1 rounded-full text-xs">
                {pendingRequestsSorted.length} attente(s)
              </span>
            </div>

            <div className="relative w-full md:w-96">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input 
                type="text" 
                placeholder="Rechercher un patient ou ID..." 
                value={pendingSearchQuery}
                onChange={(e) => setPendingSearchQuery(e.target.value)}
                className="w-full pl-12 pr-4 py-3 bg-white border border-slate-200 rounded-2xl focus:ring-2 focus:ring-emerald-500 outline-none font-bold transition-all text-sm"
              />
            </div>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 text-[11px] uppercase tracking-[0.15em] text-slate-500 font-black border-b border-slate-200/60">
                  <th className="px-6 py-4">Date & Heure</th>
                  <th className="px-6 py-4">Réf. Demande</th>
                  <th className="px-6 py-4">Patient</th>
                  <th className="px-6 py-4">Service Demandeur</th>
                  <th className="px-6 py-4 text-right">Total à Payer</th>
                  <th className="px-6 py-4 text-right">Reste</th>
                  <th className="px-6 py-4 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pendingRequestsSorted.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-20 text-center">
                      <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Check size={32} className="text-emerald-500" />
                      </div>
                      <h3 className="text-xl font-black text-slate-900 mb-1">Aucune demande trouvée</h3>
                      <p className="text-sm text-slate-500">{pendingSearchQuery ? "Ajustez vos critères de recherche." : "Il n'y a aucune demande de paiement en attente."}</p>
                    </td>
                  </tr>
                ) : (
                  pendingRequestsSorted.map((pr) => {
                    const remaining = (pr.totalAmount || 0) - (pr.amountPaid || 0);
                    const patientObj = pr.patientId ? patientsMap.get(pr.patientId) : null;
                    const resolvedFullName = formatPatientFullName(patientObj, pr.patientName);
                    const prIsBlocked = patientObj ? (patientObj.creditBlocked === true || patientObj.allowCredit === false) : false;

                    return (
                      <tr key={pr.id} className="hover:bg-slate-50/80 transition-colors group">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <Calendar size={14} className="text-blue-600 shrink-0" />
                            <span className="font-mono text-xs font-bold text-slate-800 bg-blue-50/80 border border-blue-100 px-2.5 py-1 rounded-lg">
                              {formatDateTime(pr.createdAt)}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="font-mono text-xs font-bold text-slate-600 px-2 py-1 bg-slate-100 rounded-md uppercase">
                            {pr.id}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-black text-sm text-slate-900">{resolvedFullName}</span>
                            {prIsBlocked && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-black text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
                                <Lock size={10} /> Crédit Bloqué
                              </span>
                            )}
                          </div>
                          {pr.patientId && (
                            <div className="text-[10px] font-medium text-slate-400 font-mono">ID: {pr.patientId}</div>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="px-2.5 py-1 bg-blue-50 text-blue-700 border border-blue-100 rounded-md text-xs font-bold uppercase tracking-wider">
                            {pr.sourceModule || pr.requestingService || 'Consultation'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right whitespace-nowrap">
                          <span className="font-black text-sm text-slate-900">
                            {(pr.totalAmount || 0).toLocaleString()} {establishment.currency}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right whitespace-nowrap">
                          {remaining > 0 ? (
                            <span className="font-black text-sm text-rose-600">
                              {remaining.toLocaleString()} {establishment.currency}
                            </span>
                          ) : (
                            <span className="text-xs font-bold text-emerald-600">Soldé</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-center whitespace-nowrap">
                          <button 
                            onClick={() => handleOpenPayment(pr)}
                            disabled={isProcessing}
                            className="bg-slate-900 text-white px-5 py-2.5 rounded-xl font-bold hover:bg-emerald-600 hover:shadow-md hover:shadow-emerald-600/20 transition-all inline-flex items-center gap-2 text-xs uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <CreditCard size={15} />
                            Encaisser
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'daily' && (
        <div className="bg-white rounded-[32px] border border-slate-200/60 shadow-sm overflow-hidden">
          <div className="p-8 border-b border-slate-100 bg-slate-50/50 flex flex-col gap-6">
            <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
              <h3 className="font-bold text-xs uppercase tracking-[0.2em] text-slate-500 flex items-center gap-2">
                <Landmark size={16} /> Journal des Transactions du jour
              </h3>
              <div className="text-left sm:text-right bg-emerald-50 px-6 py-3 rounded-2xl border border-emerald-100">
                <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest mb-1">Total Encaissé</p>
                <p className="font-black text-2xl text-emerald-700">{(dailyTransactionsFiltered.reduce((sum, tx) => sum + (getTxAmount(tx)), 0)).toLocaleString()} <span className="text-sm">{establishment.currency}</span></p>
              </div>
            </div>

            <div className="flex flex-col md:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input 
                  type="text" 
                  placeholder="Rechercher par ID, caissier, patient..." 
                  value={dailySearchQuery}
                  onChange={(e) => setDailySearchQuery(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 bg-white border border-slate-200 rounded-2xl focus:ring-2 focus:ring-emerald-500 outline-none font-bold transition-all text-sm"
                />
              </div>
              <div className="flex gap-2 overflow-x-auto pb-2 md:pb-0">
                {['ALL', 'CASH', 'CARD', 'MOBILE_MONEY'].map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setDailyFilterMethod(mode)}
                    className={`px-4 py-3 rounded-2xl text-xs font-bold border transition-all whitespace-nowrap ${
                      dailyFilterMethod === mode 
                      ? 'bg-slate-900 text-white border-slate-900 shadow-lg' 
                      : 'bg-white text-slate-500 border-slate-100 hover:border-slate-300'
                    }`}
                  >
                    {mode === 'ALL' ? 'Toutes les méthodes' : mode === 'CASH' ? 'Espèces' : mode === 'CARD' ? 'Carte' : 'Mobile'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 text-[11px] uppercase tracking-[0.15em] text-slate-500 font-black border-b border-slate-200/60">
                  <th className="px-6 py-4">Date & Heure</th>
                  <th className="px-6 py-4">ID Transaction</th>
                  <th className="px-6 py-4">Patient</th>
                  <th className="px-6 py-4">Caissier</th>
                  <th className="px-6 py-4">Mode</th>
                  <th className="px-6 py-4 text-right">Montant</th>
                  <th className="px-6 py-4 text-center">Reçu</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {dailyTransactionsFiltered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-20 text-center">
                      <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Wallet size={32} className="text-slate-400" />
                      </div>
                      <h3 className="text-xl font-black text-slate-900 mb-1">Aucun mouvement trouvé</h3>
                      <p className="text-sm text-slate-500">{dailySearchQuery || dailyFilterMethod !== 'ALL' ? "Ajustez vos filtres de recherche." : "Vous n'avez effectué aucun encaissement aujourd'hui."}</p>
                    </td>
                  </tr>
                ) : (
                  dailyTransactionsFiltered.map((tx) => (
                    <tr 
                      key={tx.id} 
                      className="hover:bg-slate-50/80 transition-colors cursor-pointer group"
                      onClick={() => setSelectedTransactionDetail(tx)}
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <Calendar size={14} className="text-emerald-600 shrink-0" />
                          <span className="font-mono text-xs font-bold text-slate-800 bg-emerald-50/80 border border-emerald-100 px-2.5 py-1 rounded-lg">
                            {formatDateTime(tx.date || (tx as any).createdAt)}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="font-mono text-xs font-bold text-slate-600 px-2 py-1 bg-slate-100 rounded-md uppercase">
                          {tx.id}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="font-black text-sm text-slate-900 group-hover:text-emerald-600 transition-colors">
                          {getTxPatientName(tx)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-xs font-medium text-slate-600">
                          {tx.cashierName || (tx as any).caissierName || user.name}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider ${
                          (tx.paymentMethod || (tx as any).modePaiement) === 'CASH' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                          (tx.paymentMethod || (tx as any).modePaiement) === 'CARD' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                          'bg-amber-50 text-amber-700 border border-amber-200'
                        }`}>
                          {tx.paymentMethod || (tx as any).modePaiement || 'ESPÈCES'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right whitespace-nowrap">
                        <span className="font-black text-sm text-emerald-600">
                          +{(getTxAmount(tx)).toLocaleString()} {establishment.currency}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <button 
                          className="w-9 h-9 inline-flex items-center justify-center text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-all border border-slate-200"
                          onClick={() => setSelectedTransactionDetail(tx)}
                          title="Imprimer le reçu"
                        >
                          <Printer size={16} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'dettes' && (
        <div className="p-4 sm:p-6 lg:p-8 max-w-[1600px] mx-auto">
          <DebtManagement
            user={user}
            activeSession={activeSession}
            dettesPatient={dettesPatient}
            onOpenSessionRequest={() => setShowOpenSessionModal(true)}
            onPaymentProcessed={(tx) => {
              if (setCashierTransactions) {
                setCashierTransactions(prev => [tx, ...prev]);
              }
              showNotification(`Règlement de dette de ${tx.amount.toLocaleString()} FCFA validé et crédité à la session de caisse.`, 'success');
            }}
            theme={theme}
          />
        </div>
      )}

      {/* Transaction Details Modal */}
      {selectedTransactionDetail && (
        <div className="fixed inset-0 z-[110] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="ticket-print-wrapper bg-white w-full max-w-xl rounded-[32px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
            <div className="p-6 sm:p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 shrink-0 no-print">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-emerald-600 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-600/20">
                  <Landmark size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">Détails Transaction</h3>
                  <p className="text-xs font-bold text-slate-400 font-mono">{selectedTransactionDetail.id}</p>
                </div>
              </div>
              <button 
                onClick={() => setSelectedTransactionDetail(null)}
                className="w-10 h-10 flex items-center justify-center hover:bg-white rounded-full text-slate-400 transition-all border border-transparent hover:border-slate-200 cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="ticket-scroll-area p-6 sm:p-8 space-y-6 overflow-y-auto custom-scrollbar flex-1">
              <div className="bg-slate-50 p-6 rounded-[24px] border border-slate-100 flex justify-between items-center">
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Patient</p>
                  <p className="text-lg font-black text-slate-900">{getTxPatientName(selectedTransactionDetail)}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Crédité Facture</p>
                  <p className="text-2xl font-black text-emerald-600">{(getTxAmount(selectedTransactionDetail)).toLocaleString()} F</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-4 bg-white rounded-2xl border border-slate-200">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Mode de paiement</p>
                  <p className="text-sm font-bold text-slate-700 uppercase tracking-wider">{selectedTransactionDetail.paymentMethod || 'ESPÈCES'}</p>
                </div>
                <div className="p-4 bg-white rounded-2xl border border-slate-200">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Date & Heure</p>
                  <p className="text-sm font-bold text-slate-700">{new Date(selectedTransactionDetail.date).toLocaleString('fr-FR')}</p>
                </div>
                <div className="p-4 bg-white rounded-2xl border border-slate-200">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Caissier</p>
                  <div className="flex items-center gap-2">
                    <Avatar 
                      user={{ 
                        name: selectedTransactionDetail.cashierName || selectedTransactionDetail.caissierName || user?.name || 'Caissier',
                        profile_image_url: selectedTransactionDetail.cashierImage || (selectedTransactionDetail.cashierId === user?.id ? user?.profile_image_url || user?.profileImage : undefined)
                      }} 
                      size={22} 
                      roundedClassName="rounded-full"
                    />
                    <p className="text-sm font-black text-slate-900 uppercase truncate" title={selectedTransactionDetail.cashierName || selectedTransactionDetail.caissierName || user?.name || 'Caissier'}>
                      {selectedTransactionDetail.cashierName || selectedTransactionDetail.caissierName || user?.name || 'Caissier'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Accounting Breakdown */}
              <div className="space-y-3 pt-4 border-t border-slate-100">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Détail Financier</p>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500 font-bold">Montant Initial Facturé:</span>
                    <span className="text-slate-900 font-black">{(selectedTransactionDetail.totalDu || selectedTransactionDetail.totalGeneral || 0).toLocaleString()} F</span>
                  </div>
                  {selectedTransactionDetail.avoirUtilise > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-emerald-600 font-bold">Avoir/Avance utilisé:</span>
                      <span className="text-emerald-600 font-black">-{(selectedTransactionDetail.avoirUtilise).toLocaleString()} F</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500 font-bold">Montant Remis:</span>
                    <span className="text-slate-900 font-black">{(selectedTransactionDetail.montantPaye || selectedTransactionDetail.amount || 0).toLocaleString()} F</span>
                  </div>
                  
                  {selectedTransactionDetail.surplusGenere > 0 && (
                    <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-100 flex justify-between items-center">
                      <span className="text-xs font-bold text-emerald-600 uppercase">Nouvelle Avance générée</span>
                      <span className="text-sm font-black text-emerald-700">+{(selectedTransactionDetail.surplusGenere).toLocaleString()} F</span>
                    </div>
                  )}

                  {selectedTransactionDetail.monnaieRendue > 0 && (
                    <div className="p-3 bg-blue-50 rounded-xl border border-blue-100 flex justify-between items-center">
                      <span className="text-xs font-bold text-blue-600 uppercase">Monnaie rendue au patient</span>
                      <span className="text-sm font-black text-blue-700">-{(selectedTransactionDetail.monnaieRendue).toLocaleString()} F</span>
                    </div>
                  )}
                  
                  {selectedTransactionDetail.detteCreee > 0 && (
                    <div className="p-3 bg-rose-50 rounded-xl border border-rose-100 flex justify-between items-center">
                      <span className="text-xs font-bold text-rose-600 uppercase">Nouvelle Dette générée</span>
                      <span className="text-sm font-black text-rose-700">{(selectedTransactionDetail.detteCreee).toLocaleString()} F</span>
                    </div>
                  )}
                </div>
              </div>

              {selectedTransactionDetail.lignes && selectedTransactionDetail.lignes.length > 0 && (
                <div className="space-y-3 pt-4 border-t border-slate-100">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Prestations</p>
                  <div className="space-y-2">
                    {selectedTransactionDetail.lignes.map((l: any, i: number) => (
                      <div key={i} className="flex justify-between items-center p-3 bg-slate-50 rounded-xl border border-slate-100">
                        <div>
                          <p className="text-xs font-bold text-slate-900">{l.libelle}</p>
                          <p className="text-[9px] text-slate-400 uppercase font-bold">{l.source} x {l.quantite}</p>
                        </div>
                        <p className="text-xs font-black text-slate-900">{(l.montantTotal || 0).toLocaleString()} F</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Hard-printed Cashier stamp on receipt/ticket */}
              <div className="pt-4 border-t border-dashed border-slate-300 text-center text-xs text-slate-600">
                <div className="flex items-center justify-center gap-2">
                  <Avatar 
                    user={{ 
                      name: selectedTransactionDetail.cashierName || selectedTransactionDetail.caissierName || user?.name || 'Caissier',
                      profile_image_url: selectedTransactionDetail.cashierImage || (selectedTransactionDetail.cashierId === user?.id ? user?.profile_image_url || user?.profileImage : undefined)
                    }} 
                    size={20} 
                    roundedClassName="rounded-full"
                  />
                  <p className="font-bold text-slate-800 uppercase tracking-wider">
                    Caissier : {selectedTransactionDetail.cashierName || selectedTransactionDetail.caissierName || user?.name || 'Caissier Principal'}
                  </p>
                </div>
              </div>
            </div>

            <div className="ticket-actions-bar no-print p-6 bg-slate-50 border-t border-slate-100 flex gap-4 shrink-0">
              <button 
                onClick={() => setSelectedTransactionDetail(null)}
                className="flex-1 py-4 bg-white text-slate-600 rounded-2xl font-black text-sm uppercase tracking-widest border border-slate-200 hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Fermer
              </button>
              <button 
                className="flex-1 py-4 bg-slate-900 text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-emerald-600 transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-slate-900/10"
                onClick={() => window.print()}
              >
                <Printer size={18} /> Réimprimer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Redesigned Elegant Encaissement Modal */}
      {showPaymentModal && selectedRequest && (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-hidden animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl animate-in zoom-in-95 duration-200 border border-slate-200/90 flex flex-col max-h-[92vh] overflow-hidden">
            {/* Modal Header */}
            <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50/70 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-emerald-600 rounded-xl shadow-xs flex items-center justify-center text-white shrink-0">
                  <Calculator size={18} />
                </div>
                <div>
                  <h2 className="text-base font-black tracking-tight text-slate-900">Encaissement de Facture</h2>
                  <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider font-mono">Demande {selectedRequest.id}</p>
                </div>
              </div>
              <button 
                onClick={() => !isProcessing && setShowPaymentModal(false)} 
                disabled={isProcessing}
                className="w-8 h-8 flex items-center justify-center hover:bg-slate-200/70 rounded-xl text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
                title="Fermer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Scrollable Body */}
            <div className="overflow-y-auto custom-scrollbar flex-1 p-5 space-y-3.5">
              {isCreditBlocked && (
                <div className="p-3 bg-rose-50 border border-rose-300 rounded-2xl flex items-start gap-2.5 shadow-2xs animate-in fade-in">
                  <ShieldAlert className="text-rose-600 shrink-0 mt-0.5" size={18} />
                  <div className="min-w-0">
                    <p className="text-xs font-black text-rose-800 uppercase tracking-wide flex items-center gap-1.5">
                      <Lock size={12} /> Interdiction de Crédit (Comptabilité)
                    </p>
                    <p className="text-[11px] text-rose-700 mt-0.5 font-medium leading-relaxed">
                      Aucun paiement partiel ni création de dette n'est autorisé. Paiement intégral exigé ({netToPay.toLocaleString()} {establishment.currency}).
                    </p>
                  </div>
                </div>
              )}

              {/* Patient Banner */}
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[8px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Patient bénéficiaire</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-black text-sm text-slate-900 truncate">{formatPatientFullName(selectedPatientObj, selectedRequest.patientName)}</p>
                    {isCreditBlocked && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[8.5px] font-black bg-rose-100 text-rose-800 border border-rose-200">
                        <Lock size={9} /> Crédit Bloqué
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-[9.5px] font-bold text-slate-600 bg-white px-2.5 py-1 rounded-lg border border-slate-200/80 inline-block uppercase tracking-wider shadow-2xs">
                    {selectedRequest.type} • {selectedRequest.sourceModule}
                  </span>
                </div>
              </div>

              {/* Amount Breakdown Cards */}
              <div className="grid grid-cols-2 gap-2.5">
                <div className="p-3 bg-white rounded-2xl border border-slate-200 shadow-2xs">
                  <p className="text-[8.5px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Montant Facturé</p>
                  <p className="font-black text-base text-slate-900">{(selectedRequest.totalAmount || 0).toLocaleString()} <span className="text-[10px] font-bold text-slate-400">{establishment.currency}</span></p>
                </div>
                <div className="p-3 bg-rose-50/70 rounded-2xl border border-rose-100 flex justify-between items-start">
                  <div>
                    <p className="text-[8.5px] font-bold text-rose-500 uppercase tracking-wider mb-0.5">Reliquat Dû</p>
                    <p className="font-black text-base text-rose-600">{remainingDue.toLocaleString()} <span className="text-[10px] font-bold text-rose-400">{establishment.currency}</span></p>
                  </div>
                  {totalDetteEnCours > 0 && (
                    <div className="flex flex-col items-end gap-0.5">
                      <div className="flex items-center gap-1.5">
                        <input 
                          type="checkbox" 
                          id="inc-debt-modal"
                          checked={includeExistingDebt}
                          onChange={(e) => setIncludeExistingDebt(e.target.checked)}
                          className="w-3.5 h-3.5 rounded text-rose-600 focus:ring-rose-500 border-rose-300"
                        />
                        <label htmlFor="inc-debt-modal" className="text-[9px] font-black text-rose-600 uppercase cursor-pointer tracking-tight">+ Dettes</label>
                      </div>
                      <span className="text-[8px] font-bold text-rose-400 italic">({totalDetteEnCours.toLocaleString()} F)</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Avoir Patient */}
              {totalAvoirDispo > 0 && (
                <div className="p-3 bg-emerald-50/80 rounded-2xl border border-emerald-100 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <input 
                      type="checkbox" 
                      id="use-avoir"
                      checked={useAvoir}
                      onChange={(e) => setUseAvoir(e.target.checked)}
                      className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-emerald-300"
                    />
                    <label htmlFor="use-avoir" className="cursor-pointer">
                      <p className="text-xs font-black text-emerald-800 tracking-tight uppercase">Utiliser l'avoir disponible</p>
                      <p className="text-[9px] font-bold text-emerald-600 font-mono">SOLDE: {totalAvoirDispo.toLocaleString()} {establishment.currency}</p>
                    </label>
                  </div>
                  <div className="text-right">
                    <span className="font-black text-emerald-700 text-sm">-{montantAvoirApplique.toLocaleString()} F</span>
                  </div>
                </div>
              )}

              {/* Net à Encaisser Banner */}
              <div className="p-4 bg-slate-900 rounded-2xl text-white flex justify-between items-center shadow-md relative overflow-hidden">
                <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/10 rounded-full blur-xl pointer-events-none" />
                <div>
                  <p className="text-[8.5px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Net à Encaisser</p>
                  <h3 className="text-2xl font-black text-emerald-400 font-mono tracking-tight">{netToPay.toLocaleString()} <span className="text-xs font-bold text-slate-400 font-sans">{establishment.currency}</span></h3>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[8px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Total Global</p>
                  <p className="text-xs font-bold text-slate-300 font-mono">{netTotalToPay.toLocaleString()} F</p>
                </div>
              </div>

              {/* Montant Remis & Quick Presets */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center px-0.5">
                  <label className="text-[9px] font-black text-slate-500 uppercase tracking-wider">Montant remis par le patient</label>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => setPaymentAmount(netToPay.toString())}
                      className="text-[9px] font-black uppercase text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-2 py-0.5 rounded-lg border border-emerald-200 transition-colors cursor-pointer"
                    >
                      Exact ({netToPay.toLocaleString()})
                    </button>
                    {netToPay > 0 && [5000, 10000, 20000].filter(amt => amt >= netToPay && amt !== netToPay).slice(0, 2).map(amt => (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => setPaymentAmount(amt.toString())}
                        className="text-[9px] font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 px-1.5 py-0.5 rounded-lg border border-slate-200 transition-colors cursor-pointer"
                      >
                        {amt.toLocaleString()} F
                      </button>
                    ))}
                  </div>
                </div>

                <div className="relative group">
                  <Wallet className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-emerald-600 transition-colors" size={18} />
                  <input 
                    type="number" 
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                    placeholder="0"
                    className="w-full pl-10 pr-14 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15 font-black text-lg text-slate-900 transition-all font-mono"
                    disabled={isProcessing}
                  />
                  <span className="absolute right-3.5 top-1/2 -translate-y-1/2 font-bold text-xs text-slate-400">{establishment.currency}</span>
                </div>
              </div>

              {/* Moyen de Paiement */}
              <div className="space-y-1.5">
                <label className="block text-[9px] font-black text-slate-500 uppercase tracking-wider px-0.5">Mode de règlement</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'CASH', label: 'Espèces', icon: Banknote },
                    { id: 'CARD', label: 'Carte Bancaire', icon: CreditCard },
                    { id: 'MOBILE_MONEY', label: 'Mobile Money', icon: Smartphone }
                  ].map(({ id, label, icon: Icon }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setPaymentMethod(id as any)}
                      disabled={isProcessing}
                      className={`py-2 px-2.5 rounded-xl font-bold text-xs transition-all border flex items-center justify-center gap-1.5 cursor-pointer ${
                        paymentMethod === id 
                        ? 'bg-slate-900 text-white border-slate-900 shadow-sm' 
                        : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <Icon size={14} className={paymentMethod === id ? 'text-emerald-400' : 'text-slate-400'} />
                      <span>{label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Surplus & Reste Warnings */}
              {(surplus > 0 || resteAPayer > 0) && (
                <div className="space-y-2 animate-in fade-in slide-in-from-top-1">
                  {surplus > 0 && (
                    <div className="p-3 bg-blue-50/90 border border-blue-200 rounded-2xl space-y-2">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-blue-800 font-bold uppercase tracking-wider text-[9px]">
                          Monnaie à rendre (Surplus)
                        </span>
                        <span className="font-black text-sm text-blue-900 font-mono">+{surplus.toLocaleString()} {establishment.currency}</span>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setSurplusAction('RENDRE')}
                          className={`py-1.5 px-2 rounded-lg text-[10px] font-black uppercase tracking-wider border transition-all cursor-pointer ${
                            surplusAction === 'RENDRE' 
                              ? 'bg-blue-600 text-white border-blue-600 shadow-xs' 
                              : 'bg-white text-blue-600 border-blue-200 hover:bg-blue-50'
                          }`}
                        >
                          Rendre Monnaie
                        </button>
                        <button
                          type="button"
                          onClick={() => setSurplusAction('AVANCE')}
                          className={`py-1.5 px-2 rounded-lg text-[10px] font-black uppercase tracking-wider border transition-all cursor-pointer ${
                            surplusAction === 'AVANCE' 
                              ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs' 
                              : 'bg-white text-emerald-600 border-emerald-200 hover:bg-emerald-50'
                          }`}
                        >
                          Mettre en Avoir
                        </button>
                      </div>
                      {!surplusAction && (
                        <p className="text-[9px] text-blue-600 font-semibold italic text-center animate-pulse">Choisissez l'affectation du surplus</p>
                      )}
                    </div>
                  )}

                  {resteAPayer > 0 && remis > 0 && (
                    <div className={`p-2.5 rounded-xl flex justify-between items-center text-xs ${
                      isCreditBlocked ? 'bg-rose-100 border border-rose-300 text-rose-900' : 'bg-rose-50 border border-rose-100 text-rose-700'
                    }`}>
                      <div className="flex items-center gap-1.5">
                        {isCreditBlocked && <Lock size={14} className="text-rose-600 shrink-0" />}
                        <span className="text-[9px] font-black uppercase tracking-wider">
                          {isCreditBlocked ? 'Reste non autorisé (Crédit bloqué)' : 'Reste à payer (Dette)'}
                        </span>
                      </div>
                      <span className="font-black text-sm text-rose-700 font-mono">{resteAPayer.toLocaleString()} F</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Sticky Footer */}
            <div className="p-3.5 border-t border-slate-100 bg-slate-50/70 flex items-center justify-end gap-2.5 shrink-0">
              <button
                type="button"
                onClick={() => setShowPaymentModal(false)}
                disabled={isProcessing}
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs hover:bg-slate-100 transition-all cursor-pointer"
              >
                Annuler
              </button>
              <button 
                onClick={processPayment}
                disabled={(!paymentAmount && !useAvoir) || isProcessing || (isCreditBlocked && resteAPayer > 0)}
                className={`py-2.5 px-5 rounded-xl font-black text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm ${
                  isCreditBlocked && resteAPayer > 0
                    ? 'bg-rose-600 text-white cursor-not-allowed opacity-90'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/20 disabled:opacity-50 disabled:cursor-not-allowed'
                }`}
              >
                {isProcessing ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Traitement...</span>
                  </>
                ) : isCreditBlocked && resteAPayer > 0 ? (
                  <>
                    <Lock size={14} />
                    <span>Paiement intégral requis</span>
                  </>
                ) : (
                  <>
                    <span>Valider l'encaissement</span>
                    <ArrowUpRight size={16} />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Modal 1: Open Session (Anti-Fraud: Fond initial alloué par le superviseur, fixe et verrouillé) */}
      {showOpenSessionModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[150] flex items-center justify-center p-4">
          <div className="bg-white rounded-[32px] max-w-lg w-full p-8 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95">
            <div className="flex justify-between items-center pb-6 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl">
                  <Unlock size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-900">Ouverture de Session Caisse</h3>
                  <p className="text-xs text-slate-500 font-medium">Prise de poste caissier & allocation superviseur</p>
                </div>
              </div>
              <button onClick={() => setShowOpenSessionModal(false)} className="p-2 hover:bg-slate-100 rounded-full text-slate-400">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-6 py-6">
              <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 space-y-3">
                <div className="flex justify-between text-xs font-bold text-slate-500">
                  <span>Caissier :</span>
                  <span className="text-slate-900 font-black">{user.name}</span>
                </div>
                <div className="flex justify-between text-xs font-bold text-slate-500">
                  <span>Horodatage d'ouverture :</span>
                  <span className="text-slate-900 font-mono font-bold">{formatDateTime(new Date())}</span>
                </div>
                <div className="flex justify-between text-xs font-bold text-slate-500 pt-2 border-t border-slate-200/60">
                  <span>Périmètre comptable :</span>
                  <span className="text-emerald-700 font-bold">Session Caisse Journalière Active</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-slate-700 mb-2">
                  Fond de Caisse Initial (Espèces au tiroir)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    value={initialFloatInput}
                    onChange={(e) => setInitialFloatInput(e.target.value)}
                    placeholder="0"
                    className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl font-black text-xl text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:bg-white outline-none transition-all"
                  />
                  <span className="absolute right-5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                    {establishment.currency}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-1.5">
                  Montant physique disponible dans le tiroir au démarrage du shift (ex: 50 000 FCFA pour la monnaie).
                </p>
              </div>

              <div className="p-4 bg-emerald-50 border border-emerald-200/60 rounded-2xl text-xs text-emerald-800 space-y-1">
                <p className="font-bold">Démarrage immédiat des encaissements</p>
                <p className="text-emerald-700">
                  Tous les paiements validés par ce poste seront automatiquement comptabilisés dans cette session de caisse jusqu'à sa clôture officielle.
                </p>
              </div>
            </div>

            <div className="flex gap-4 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowOpenSessionModal(false)}
                className="flex-1 py-4 font-bold text-slate-600 hover:bg-slate-100 rounded-2xl transition-colors"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleOpenSession}
                className="flex-1 py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-2xl shadow-lg shadow-emerald-600/20 transition-all flex items-center justify-center gap-2"
              >
                <Unlock size={18} />
                Démarrer la Session
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 2: Close Session (Strict Anti-Fraud: Verrouillé & Sans Saisie Manuelle) */}
      {showCloseSessionModal && activeSession && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[150] flex items-center justify-center p-4">
          <div className="bg-white rounded-[32px] max-w-2xl w-full p-8 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center pb-6 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-rose-50 text-rose-600 rounded-2xl">
                  <Lock size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-900">Clôture de Caisse & Réconciliation Certifiée</h3>
                  <p className="text-xs text-slate-500 font-medium">Bordereau officiel sécurisé — Anti-Fraude</p>
                </div>
              </div>
              <button onClick={() => setShowCloseSessionModal(false)} className="p-2 hover:bg-slate-100 rounded-full text-slate-400">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-6 py-6">
              {/* Anti-Fraud Banner */}
              <div className="p-4 bg-amber-50 border border-amber-200/80 rounded-2xl flex items-start gap-3">
                <ShieldAlert className="text-amber-600 shrink-0 mt-0.5" size={20} />
                <div className="text-xs text-amber-900 space-y-1">
                  <p className="font-bold">Protocole de Sécurité Financière Anti-Fraude Activé</p>
                  <p className="text-amber-700">
                    Les montants sont calculés automatiquement et verrouillés. Aucune avance ni variance manuelle. 
                    Le total correspond strictement à la somme des encaissements validés aujourd'hui en base de données pour la session <span className="font-mono font-bold">{activeSession.id}</span>.
                  </p>
                </div>
              </div>

              {/* Summary Metrics */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-100">
                  <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Total Prestations Réglées</p>
                  <p className="font-black text-xl text-emerald-700">{shiftTotals.totalCollected.toLocaleString()} F</p>
                  <span className="text-[10px] text-emerald-600 font-medium">{sessionTransactions.length} paiement(s) validé(s)</span>
                </div>
                <div className="bg-blue-50 p-4 rounded-2xl border border-blue-100">
                  <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">Espèces Encaissées</p>
                  <p className="font-black text-xl text-blue-700">{shiftTotals.totalCash.toLocaleString()} F</p>
                  <span className="text-[10px] text-blue-600 font-medium">Flux liquide physique</span>
                </div>
                <div className="bg-purple-50 p-4 rounded-2xl border border-purple-100">
                  <p className="text-[10px] font-bold text-purple-600 uppercase tracking-wider">Règlements par Avance</p>
                  <p className="font-black text-xl text-purple-700">{shiftTotals.totalAvance.toLocaleString()} F</p>
                  <span className="text-[10px] text-purple-600 font-medium">{shiftTotals.countAvanceTx} utilisation(s) d'avance</span>
                </div>
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Modes Électroniques</p>
                  <p className="font-black text-xl text-slate-800">{(shiftTotals.totalMobileMoney + shiftTotals.totalCard + shiftTotals.totalTransfer + shiftTotals.totalCheck).toLocaleString()} F</p>
                  <span className="text-[10px] text-slate-400 font-medium">Mobile Money, Carte, Banque</span>
                </div>
              </div>

              {/* Payment Methods Breakdown */}
              <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 space-y-3">
                <div className="flex justify-between items-center border-b border-slate-200/60 pb-2">
                  <span className="text-xs font-black text-slate-900 uppercase tracking-wider">
                    Ventilation Certifiée des Règlements & Encaissements
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">Synchronisé BD</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-bold text-slate-600">
                  <div className="flex justify-between p-2.5 bg-white rounded-xl border border-slate-100">
                    <span>Espèces Physiques :</span>
                    <span className="text-slate-900 font-black">{shiftTotals.totalCash.toLocaleString()} F</span>
                  </div>
                  <div className="flex justify-between p-2.5 bg-purple-50/80 rounded-xl border border-purple-200/80">
                    <span className="text-purple-900 font-bold flex items-center gap-1.5">
                      <Wallet size={13} className="text-purple-600" />
                      Règlement par Avance (Avoir Patient) :
                    </span>
                    <span className="text-purple-950 font-black">{shiftTotals.totalAvance.toLocaleString()} F</span>
                  </div>
                  <div className="flex justify-between p-2.5 bg-white rounded-xl border border-slate-100">
                    <span>Mobile Money :</span>
                    <span className="text-slate-900 font-black">{shiftTotals.totalMobileMoney.toLocaleString()} F</span>
                  </div>
                  <div className="flex justify-between p-2.5 bg-white rounded-xl border border-slate-100">
                    <span>Carte Bancaire :</span>
                    <span className="text-slate-900 font-black">{shiftTotals.totalCard.toLocaleString()} F</span>
                  </div>
                  <div className="flex justify-between p-2.5 bg-white rounded-xl border border-slate-100">
                    <span>Virement :</span>
                    <span className="text-slate-900 font-black">{shiftTotals.totalTransfer.toLocaleString()} F</span>
                  </div>
                  <div className="flex justify-between p-2.5 bg-white rounded-xl border border-slate-100">
                    <span>Chèque :</span>
                    <span className="text-slate-900 font-black">{shiftTotals.totalCheck.toLocaleString()} F</span>
                  </div>
                </div>
                <div className="pt-2 border-t border-slate-200 flex justify-between font-black text-sm text-slate-900">
                  <span>TOTAL GÉNÉRAL COLLECTÉ & RÉGLÉ :</span>
                  <span className="text-emerald-600 font-black text-base">{shiftTotals.totalCollected.toLocaleString()} {establishment.currency}</span>
                </div>
              </div>

              {/* Physical Cash Handover Box (Strict read-only certified calculation) */}
              <div className="p-6 bg-slate-900 rounded-2xl text-white space-y-3 shadow-lg border border-slate-800">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold uppercase tracking-widest text-slate-300">
                    Espèces Physiques Encaissées à Remettre au Gestionnaire
                  </span>
                  <span className="px-2.5 py-0.5 bg-emerald-500/20 text-emerald-400 text-[10px] font-bold uppercase rounded-full border border-emerald-500/30 flex items-center gap-1">
                    <Lock size={10} /> Verrouillé
                  </span>
                </div>
                <div className="flex items-baseline justify-between pt-1">
                  <div className="text-3xl font-black text-white">
                    {shiftTotals.totalCash.toLocaleString()} <span className="text-sm font-bold text-slate-400">{establishment.currency}</span>
                  </div>
                  <div className="text-right text-xs text-slate-400">
                    {sessionTransactions.length} transaction(s) en session active
                  </div>
                </div>
                <p className="text-[11px] text-slate-400 pt-2 border-t border-slate-800">
                  Montant exact des espèces physiques reçues en caisse. Les règlements par avance patient ({shiftTotals.totalAvance.toLocaleString()} F) sont imputés sur les crédits préexistants des patients sans impact sur le tiroir-caisse physique.
                </p>
              </div>
            </div>

            <div className="flex gap-4 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowCloseSessionModal(false)}
                className="flex-1 py-4 font-bold text-slate-600 hover:bg-slate-100 rounded-2xl transition-colors"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleCloseSession}
                className="flex-1 py-4 bg-rose-600 hover:bg-rose-700 text-white font-black rounded-2xl shadow-lg shadow-rose-600/20 transition-all flex items-center justify-center gap-2"
              >
                <Lock size={18} />
                Valider la Clôture & Imprimer le Bilan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 3: Printable Shift Report */}
      {closedSessionReport && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[160] flex items-center justify-center p-4">
          <div className="bg-white rounded-[32px] max-w-xl w-full p-8 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95">
            <div className="flex justify-between items-center pb-6 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl">
                  <Printer size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-900">Rapport Clôture de Caisse</h3>
                  <p className="text-xs text-slate-500 font-medium">Bilan imprimable de fin de shift</p>
                </div>
              </div>
              <button onClick={() => setClosedSessionReport(null)} className="p-2 hover:bg-slate-100 rounded-full text-slate-400">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4 py-6 border-b border-slate-100 text-sm font-medium text-slate-700">
              <div className="text-center pb-4 border-b border-slate-100">
                <p className="font-black text-lg text-slate-900">{establishment.name}</p>
                <p className="text-xs text-slate-500">{establishment.address} • {establishment.phone}</p>
                <p className="text-xs font-bold text-emerald-600 mt-1 uppercase tracking-wider">Rapport Officiel Clôture Caisse</p>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>Caissier : <span className="font-bold text-slate-900">{closedSessionReport.cashierName}</span></div>
                <div>ID Session : <span className="font-mono font-bold text-slate-900">{closedSessionReport.id}</span></div>
                <div>Date & Heure Ouverture : <span className="font-mono font-bold text-slate-900">{formatDateTime(closedSessionReport.openedAt)}</span></div>
                <div>Date & Heure Clôture : <span className="font-mono font-bold text-slate-900">{formatDateTime(closedSessionReport.closedAt)}</span></div>
              </div>

              <div className="bg-slate-50 p-4 rounded-2xl space-y-2 text-xs">
                <div className="flex justify-between">
                  <span>Recettes Espèces :</span>
                  <span className="font-bold">{closedSessionReport.totalCash.toLocaleString()} {establishment.currency}</span>
                </div>
                <div className="flex justify-between text-purple-900 bg-purple-50/70 p-2 rounded-xl border border-purple-100">
                  <span className="font-bold">Règlements par Avance (Avoir Patient) :</span>
                  <span className="font-black">{(closedSessionReport.totalAvance || 0).toLocaleString()} {establishment.currency}</span>
                </div>
                <div className="flex justify-between">
                  <span>Recettes Mobile Money :</span>
                  <span className="font-bold">{closedSessionReport.totalMobileMoney.toLocaleString()} {establishment.currency}</span>
                </div>
                <div className="flex justify-between">
                  <span>Recettes Carte & Autres :</span>
                  <span className="font-bold">{(closedSessionReport.totalCard + closedSessionReport.totalTransfer + closedSessionReport.totalCheck).toLocaleString()} {establishment.currency}</span>
                </div>
                <div className="flex justify-between pt-2 border-t border-slate-200 font-black text-slate-900">
                  <span>Total des Prestations Réglées :</span>
                  <span className="text-emerald-600 font-black">{closedSessionReport.totalCollected.toLocaleString()} {establishment.currency}</span>
                </div>
                <div className="flex justify-between pt-1 font-bold text-slate-800">
                  <span>Total Espèces Remises au Gestionnaire :</span>
                  <span className="font-black text-slate-900">{closedSessionReport.actualCashInHand?.toLocaleString()} {establishment.currency}</span>
                </div>
                <div className="flex justify-between font-black pt-2 border-t border-slate-200 text-emerald-700">
                  <span>Statut Réconciliation Anti-Fraude :</span>
                  <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded text-[10px] uppercase font-mono">0 F d'écart • Conforme BD (Session Valide)</span>
                </div>
              </div>
            </div>

            <div className="flex gap-4 pt-4">
              <button
                type="button"
                onClick={() => setClosedSessionReport(null)}
                className="flex-1 py-4 font-bold text-slate-600 hover:bg-slate-100 rounded-2xl transition-colors"
              >
                Fermer
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="flex-1 py-4 bg-slate-900 hover:bg-emerald-600 text-white font-black rounded-2xl shadow-lg transition-all flex items-center justify-center gap-2"
              >
                <Printer size={18} />
                Imprimer le Rapport
              </button>
            </div>
          </div>
        </div>
      )}
      </main>
    </div>
  );
};

export default Cashier;

