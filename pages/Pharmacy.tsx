import React, { useState, useEffect } from 'react';
import { 
  Pill, 
  Search, 
  ShoppingCart, 
  Clock, 
  CheckCircle, 
  FileText, 
  Package, 
  Home, 
  Loader2, 
  X, 
  DollarSign, 
  AlertCircle, 
  Printer, 
  Check, 
  User, 
  FileSpreadsheet,
  Eye,
  TrendingUp,
  ArrowLeft,
  Lock,
  Unlock,
  ShieldCheck,
  CheckSquare,
  CreditCard,
  Smartphone,
  Receipt,
  History,
  Truck,
  Box,
  Layers
} from 'lucide-react';
import { PaymentRequest, User as UserType, CashierSession, Patient, AvoirPatient, DettePatient } from '../types';
import { db, sanitizeData } from '../src/firebase';
import ModuleDashboard from '../components/ModuleDashboard';
import { collection, doc, deleteDoc, onSnapshot, query, orderBy, setDoc, addDoc, writeBatch, updateDoc } from 'firebase/firestore';
import { useSettings } from '../hooks/useSettings';
import { MicroHeader } from '../components/common/MicroHeader';
import { Breadcrumbs } from '../components/common/Breadcrumbs';
import { MedicalStatusBadge } from '../components/common/MedicalStatusBadge';
import { PharmacyHistoryTable } from '../components/pharmacy/PharmacyHistoryTable';
import { PharmacyCatalog } from '../components/pharmacy/PharmacyCatalog';
import { PharmacyCheckoutPanel } from '../components/pharmacy/PharmacyCheckoutPanel';
import { PrescriptionCheckoutModal } from '../components/pharmacy/PrescriptionCheckoutModal';

interface PharmacyProps {
  paymentRequests?: PaymentRequest[];
  setPaymentRequests?: React.Dispatch<React.SetStateAction<PaymentRequest[]>>;
  user?: UserType;
  activeTab: 'dashboard' | 'prescriptions' | 'sales' | 'history';
  setActiveTab: (tab: 'dashboard' | 'prescriptions' | 'sales' | 'history') => void;
  onBackToDashboard: () => void;
  theme?: 'light' | 'dark';
}

const Pharmacy: React.FC<PharmacyProps> = ({ 
  paymentRequests = [], 
  setPaymentRequests, 
  user,
  activeTab,
  setActiveTab,
  onBackToDashboard,
  theme = 'light'
}) => {
  const { establishment } = useSettings();
  const [pendingPrescriptions, setPendingPrescriptions] = useState<any[]>([]);
  const [isProcessing, setIsProcessing] = useState<string | null>(null);
  const [patientSearch, setPatientSearch] = useState('');
  const [selectedPresc, setSelectedPresc] = useState<any | null>(null);
  
  // Dedicated Pharmacy Caisse Session State
  const [pharmacySessions, setPharmacySessions] = useState<CashierSession[]>([]);
  const [activeSession, setActiveSession] = useState<CashierSession | null>(null);
  const [showOpenSessionModal, setShowOpenSessionModal] = useState(false);
  const [showCloseSessionModal, setShowCloseSessionModal] = useState(false);
  const [closedSessionReport, setClosedSessionReport] = useState<CashierSession | null>(null);
  const [initialFloatInput, setInitialFloatInput] = useState('50000');
  const [actualCashInput, setActualCashInput] = useState('');

  // Payment Method Selection
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'MOBILE_MONEY' | 'CARD' | 'TRANSFER' | 'CHECK'>('CASH');
  const [amountReceived, setAmountReceived] = useState<string>('');
  const [inventorySearch, setInventorySearch] = useState('');

  // Local inventory state from Firestore
  const [inventory, setInventory] = useState<any[]>([]);
  const [isLoadingInventory, setIsLoadingInventory] = useState(true);

  // Central Database: Patients & Financial Wallets (Avoirs / Dettes)
  const [patients, setPatients] = useState<Patient[]>([]);
  const [avoirsPatient, setAvoirsPatient] = useState<AvoirPatient[]>([]);
  const [dettesPatient, setDettesPatient] = useState<DettePatient[]>([]);
  const [linkedPatient, setLinkedPatient] = useState<Patient | null>(null);

  // Cart for direct sales & stock reservations
  const [cart, setCart] = useState<any[]>([]);
  const [directAmountReceived, setDirectAmountReceived] = useState<string>('');

  // Receipt Modal State
  const [selectedReceipt, setSelectedReceipt] = useState<PaymentRequest | null>(null);
  const [showReceiptModal, setShowReceiptModal] = useState<boolean>(false);
  const [lastDirectReceived, setLastDirectReceived] = useState<number>(0);
  const [lastDirectChange, setLastDirectChange] = useState<number>(0);

  // Sales History & KPIs Filters State
  const [historySearch, setHistorySearch] = useState('');
  const [historyStatusFilter, setHistoryStatusFilter] = useState<'ALL' | 'PAID' | 'PENDING' | 'DELIVERED'>('ALL');
  const [historyDateFilter, setHistoryDateFilter] = useState<'ALL' | 'TODAY' | 'WEEK'>('ALL');
  const [historyTypeFilter, setHistoryTypeFilter] = useState<'ALL' | 'ordonace' | 'ventedirec'>('ALL');

  useEffect(() => {
    // 1. Listen to Pharmacy Caisse Sessions
    const unsubSessions = onSnapshot(collection(db, 'pharmacy_sessions'), (snapshot) => {
      const sessions = snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as CashierSession[];
      setPharmacySessions(sessions);
      const currentOpen = sessions.find(s => s.status === 'OPEN');
      setActiveSession(currentOpen || null);
    });

    // 2. Listen to Inventory
    const unsubInventory = onSnapshot(collection(db, 'pharmacy_inventory'), (snapshot) => {
      const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setInventory(items);
      setIsLoadingInventory(false);
    });

    // 3. Listen to Patients
    const unsubPatients = onSnapshot(collection(db, 'patients'), (snapshot) => {
      const pts = snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as Patient[];
      setPatients(pts);
    });

    // 4. Listen to Avoirs Patient
    const unsubAvoirs = onSnapshot(collection(db, 'avoirs_patient'), (snapshot) => {
      const avs = snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as AvoirPatient[];
      setAvoirsPatient(avs);
    });

    // 5. Listen to Dettes Patient
    const unsubDettes = onSnapshot(collection(db, 'dettes_patient'), (snapshot) => {
      const dts = snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as DettePatient[];
      setDettesPatient(dts);
    });

    // 6. Listen to Pending Prescriptions
    let unsubPresc = () => {};
    try {
      const q = query(collection(db, 'pending_prescriptions'), orderBy('createdAt', 'desc'));
      unsubPresc = onSnapshot(q, (snapshot) => {
        const list = snapshot.docs.map(docSnap => ({
          firebaseId: docSnap.id,
          ...docSnap.data()
        }));

        const mapped = list.map((item: any) => ({
          id: item.id || item.firebaseId,
          firebaseId: item.firebaseId,
          patient: item.patient || 'Patient',
          patientId: item.patientId || 'DME-9999',
          doctor: item.doctor || 'Dr. Sarr',
          date: item.date || 'Aujourd\'hui',
          items: item.items || []
        }));

        setPendingPrescriptions(mapped);
      }, (error) => {
        console.warn("Firestore subscription warn: ", error);
        setPendingPrescriptions([]);
      });
    } catch (e) {
      console.error(e);
      setPendingPrescriptions([]);
    }

    return () => {
      unsubPresc();
      unsubInventory();
      unsubSessions();
      unsubPatients();
      unsubAvoirs();
      unsubDettes();
    };
  }, []);

  // ----------------------------------------------------
  // DEDICATED PHARMACY CAISSE SHIFT MANAGEMENT
  // ----------------------------------------------------
  const handleOpenSession = async () => {
    const floatVal = parseFloat(initialFloatInput) || 0;
    const newSession: CashierSession = {
      id: `PHARM-SESS-${Date.now()}`,
      cashierId: user?.id || 'PHARM-01',
      cashierName: user?.name || 'Pharmacien',
      openedAt: new Date().toISOString(),
      initialFloat: floatVal,
      status: 'OPEN',
      totalCash: 0,
      totalMobileMoney: 0,
      totalCard: 0,
      totalTransfer: 0,
      totalCheck: 0,
      totalCollected: 0
    };

    try {
      await Promise.all([
        setDoc(doc(db, 'pharmacy_sessions', newSession.id), sanitizeData(newSession)),
        setDoc(doc(db, 'caisse_sessions', newSession.id), sanitizeData({
          ...newSession,
          sourceModule: 'Pharmacie'
        }))
      ]);
      setShowOpenSessionModal(false);
      setInitialFloatInput('50000');
      alert(`✅ Caisse Pharmacie Ouverte !\n\nShift démarré avec un fond de caisse initial de ${floatVal.toLocaleString()} FCFA.`);
    } catch (err) {
      console.error("Error opening pharmacy session:", err);
      alert("❌ Erreur lors de l'ouverture de la session de caisse.");
    }
  };

  const getShiftTotals = () => {
    if (!activeSession) return { totalCash: 0, totalMobileMoney: 0, totalCard: 0, totalTransfer: 0, totalCheck: 0, totalCollected: 0, expectedCashInHand: 0, sessionTxList: [] };

    const sessionTxList = (paymentRequests || []).filter(pr => {
      const isPharm = pr.sourceModule === 'Pharmacie' || pr.requestingService === 'Pharmacie' || pr.type === 'PHARMACIE' || pr.type === 'VENTE_DIRECTE';
      const isPaid = pr.status === 'PAID' || pr.status === 'PAID_PENDING_PICKUP' || pr.status === 'DELIVERED';
      const matchesSess = pr.pharmacySessionId === activeSession.id || (pr as any).sessionId === activeSession.id;
      return isPharm && isPaid && matchesSess;
    });

    let totalCash = 0, totalMobileMoney = 0, totalCard = 0, totalTransfer = 0, totalCheck = 0;

    sessionTxList.forEach(tx => {
      const amt = tx.totalAmount || tx.amountPaid || 0;
      const pm = tx.paymentMethod || 'CASH';
      if (pm === 'CASH') totalCash += amt;
      else if (pm === 'MOBILE_MONEY') totalMobileMoney += amt;
      else if (pm === 'CARD') totalCard += amt;
      else if (pm === 'TRANSFER') totalTransfer += amt;
      else if (pm === 'CHECK') totalCheck += amt;
      else totalCash += amt;
    });

    const totalCollected = totalCash + totalMobileMoney + totalCard + totalTransfer + totalCheck;
    const expectedCashInHand = activeSession.initialFloat + totalCash;

    return { sessionTxList, totalCash, totalMobileMoney, totalCard, totalTransfer, totalCheck, totalCollected, expectedCashInHand };
  };

  const handleCloseSession = async () => {
    if (!activeSession) return;
    const { totalCash, totalMobileMoney, totalCard, totalTransfer, totalCheck, totalCollected, expectedCashInHand } = getShiftTotals();
    const actualCash = parseFloat(actualCashInput) || 0;
    const diff = actualCash - expectedCashInHand;

    const closedSession: CashierSession = {
      ...activeSession,
      closedAt: new Date().toISOString(),
      status: 'CLOSED',
      totalCash,
      totalMobileMoney,
      totalCard,
      totalTransfer,
      totalCheck,
      totalCollected,
      expectedFinalFloat: expectedCashInHand,
      actualCashInHand: actualCash,
      difference: diff
    };

    try {
      await Promise.all([
        setDoc(doc(db, 'pharmacy_sessions', activeSession.id), sanitizeData(closedSession)),
        setDoc(doc(db, 'caisse_sessions', activeSession.id), sanitizeData({
          ...closedSession,
          sourceModule: 'Pharmacie'
        }))
      ]);
      setShowCloseSessionModal(false);
      setClosedSessionReport(closedSession);
      setActualCashInput('');
    } catch (err) {
      console.error("Error closing pharmacy session:", err);
      alert("❌ Erreur lors de la clôture de la caisse pharmacie.");
    }
  };

  // ----------------------------------------------------
  // ATOMIC PAYMENT & STOCK DEDUCTION (LOCAL PHARMACY CAISSE)
  // ----------------------------------------------------
  const handleProcessPayment = async (
    presc: any | null,
    items: any[],
    totalAmount: number,
    patientName: string,
    patientId: string,
    saleType: 'ORDONNANCE' | 'VENTE_DIRECTE',
    receivedAmt: number,
    financialOptions?: {
      useAvoir?: boolean;
      sendToDebt?: boolean;
      convertChangeToAvance?: boolean;
      avoirAmount?: number;
      debtAmount?: number;
      cashRemis?: number;
      changeToAvanceAmount?: number;
    }
  ) => {
    if (!activeSession) {
      alert("⚠️ CAISSE PHARMACIE FERMÉE !\n\nVeuillez ouvrir une session de caisse pharmacie avant de procéder au paiement.");
      setShowOpenSessionModal(true);
      return;
    }

    const avoirDeducted = financialOptions?.avoirAmount || 0;
    const debtGenerated = financialOptions?.debtAmount || 0;
    const changeToAvance = financialOptions?.changeToAvanceAmount || 0;
    const netCashToPay = Math.max(0, totalAmount - avoirDeducted - debtGenerated);

    if (paymentMethod === 'CASH' && !financialOptions?.sendToDebt && receivedAmt < (totalAmount - avoirDeducted)) {
      alert("❌ Le montant espèces encaissé est insuffisant pour régler cet achat.");
      return;
    }

    const processKey = presc ? presc.id : 'direct-sale';
    if (isProcessing === processKey) return;
    setIsProcessing(processKey);

    const reqId = saleType === 'ORDONNANCE' ? `PR-${Math.floor(Math.random() * 1000000)}` : `VENTE-${Math.floor(Math.random() * 1000000)}`;
    const effectiveMethod = avoirDeducted >= totalAmount ? 'AVOIR' : debtGenerated >= (totalAmount - avoirDeducted) ? 'DETTE' : paymentMethod;
    const physicalChange = changeToAvance > 0 ? 0 : (receivedAmt >= netCashToPay ? receivedAmt - netCashToPay : 0);

    const paymentRecord: PaymentRequest = {
      id: reqId,
      patientId: patientId || 'PATIENT-COMPTANT',
      patientName: patientName || 'Client Comptant (Pharmacie)',
      requestingService: 'Pharmacie',
      sourceModule: 'Pharmacie',
      type: saleType === 'ORDONNANCE' ? 'PHARMACIE' : 'VENTE_DIRECTE',
      items: items.map((it, idx) => ({
        id: `item-${idx}`,
        name: it.name,
        quantity: it.quantity || 1,
        unitPrice: it.price || it.unitPrice || 1500,
        totalPrice: (it.price || it.unitPrice || 1500) * (it.quantity || 1)
      })),
      totalAmount,
      amountPaid: (financialOptions?.cashRemis !== undefined) ? financialOptions.cashRemis : (receivedAmt || totalAmount),
      paymentMethod: effectiveMethod,
      avoirUtilise: avoirDeducted > 0 ? avoirDeducted : undefined,
      detteCreee: debtGenerated > 0 ? debtGenerated : undefined,
      avoirGenere: changeToAvance > 0 ? changeToAvance : undefined,
      status: 'DELIVERED', // Atomic Payment & Physical Dispensation
      deliveryStatus: 'DELIVERED',
      deliveredAt: new Date().toISOString(),
      deliveredBy: user?.name || 'Pharmacien',
      deliveredById: user?.id || '',
      pharmacySessionId: activeSession.id,
      createdAt: new Date().toISOString(),
      createdBy: user?.name || 'Pharmacien'
    };

    try {
      const batch = writeBatch(db);

      // 1. Record Payment Request / Sale
      batch.set(doc(db, 'payment_requests', reqId), sanitizeData(paymentRecord));

      // 2. Record Cashier Transaction Tagged to Pharmacy Session
      const txId = `TX-PHARM-${Math.floor(Math.random() * 1000000)}`;
      batch.set(doc(db, 'cashier_transactions', txId), sanitizeData({
        id: txId,
        paymentRequestId: reqId,
        patientId: paymentRecord.patientId,
        patientName: paymentRecord.patientName,
        amountPaid: (financialOptions?.cashRemis !== undefined) ? financialOptions.cashRemis : (receivedAmt || totalAmount),
        totalAmount,
        paymentMethod: effectiveMethod,
        sourceModule: 'Pharmacie',
        sessionId: activeSession.id,
        cashierId: user?.id || 'PHARM-01',
        cashierName: user?.name || 'Pharmacien',
        status: 'VALIDATED',
        createdAt: new Date().toISOString()
      }));

      // 3. Deduct from Patient's Avoirs if applicable
      if (avoirDeducted > 0 && patientId && patientId !== 'PATIENT-COMPTANT') {
        let remainingToDeduct = avoirDeducted;
        const availableAvoirs = avoirsPatient.filter(a => a.patientId === patientId && a.status === 'AVAILABLE');
        for (const av of availableAvoirs) {
          if (remainingToDeduct <= 0) break;
          const avAmount = av.montant || 0;
          if (avAmount <= remainingToDeduct) {
            batch.update(doc(db, 'avoirs_patient', av.id), {
              status: 'USED',
              montant: 0,
              dateUtilisation: new Date().toISOString(),
              transactionDestinationId: reqId
            });
            remainingToDeduct -= avAmount;
          } else {
            batch.update(doc(db, 'avoirs_patient', av.id), {
              montant: avAmount - remainingToDeduct
            });
            remainingToDeduct = 0;
          }
        }
      }

      // 4. Create Dette Record if debt generated
      if (debtGenerated > 0 && patientId && patientId !== 'PATIENT-COMPTANT') {
        const detteId = `DT-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        const newDette: DettePatient = {
          id: detteId,
          patientId: patientId,
          patientName: patientName,
          montantInitial: debtGenerated,
          montantRestant: debtGenerated,
          dateCreation: new Date().toISOString(),
          transactionSourceId: reqId,
          status: 'PENDING',
          origin: 'Pharmacie',
          description: `Achat Pharmacie (${items.length} produit(s)) - Réf ${reqId}`
        };
        batch.set(doc(db, 'dettes_patient', detteId), sanitizeData(newDette));
      }

      // 4b. Create Avoir Record if change was converted to patient credit
      if (changeToAvance > 0 && patientId && patientId !== 'PATIENT-COMPTANT') {
        const avoirId = `AV-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        const newAvoir: AvoirPatient = {
          id: avoirId,
          patientId: patientId,
          montant: changeToAvance,
          dateCreation: new Date().toISOString(),
          transactionSourceId: reqId,
          status: 'AVAILABLE'
        };
        batch.set(doc(db, 'avoirs_patient', avoirId), sanitizeData(newAvoir));
      }

      // 5. Atomically Deduct Inventory Stock & Clear Soft Lock
      items.forEach(it => {
        const medId = it.id || it.medicationId;
        const qty = it.quantity || 1;
        const invItem = inventory.find(i => i.id === medId);
        if (invItem && invItem.id) {
          const newStock = Math.max(0, (invItem.stock || 0) - qty);
          const newReserved = Math.max(0, (invItem.reservedStock || 0) - qty);
          batch.update(doc(db, 'pharmacy_inventory', invItem.id), {
            stock: newStock,
            reservedStock: newReserved
          });
        }
      });

      // 6. Remove from pending prescriptions queue if applicable
      if (presc && presc.firebaseId) {
        batch.delete(doc(db, 'pending_prescriptions', presc.firebaseId));
      }

      // Commit atomic batch
      await batch.commit();

      // Create Audit Log
      await addDoc(collection(db, 'audit_logs'), sanitizeData({
        user: user?.name || 'Pharmacien',
        role: 'PHARMACIST',
        date: new Date().toLocaleDateString('fr-FR'),
        time: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
        timestamp: new Date().toISOString(),
        action: `Paiement & Délivrance Pharmacie (${saleType}) - Total: ${totalAmount} F - Avoir Déduit: ${avoirDeducted} F - Dette: ${debtGenerated} F - Avance Créée: ${changeToAvance} F - Patient: ${patientName}`,
        details: { reqId, totalAmount, avoirDeducted, debtGenerated, changeToAvance, paymentMethod: effectiveMethod, sessionId: activeSession.id, status: 'DELIVERED' },
        module: 'Pharmacie'
      }));

      // Trigger Receipt Modal
      setSelectedReceipt(paymentRecord);
      setLastDirectReceived(receivedAmt || totalAmount);
      setLastDirectChange(physicalChange);
      setShowReceiptModal(true);

      // Clean up local state
      if (saleType === 'VENTE_DIRECTE') {
        setCart([]);
        setDirectAmountReceived('');
        setLinkedPatient(null);
      } else {
        setSelectedPresc(null);
        setAmountReceived('');
        setPendingPrescriptions(prev => prev.filter(p => p.id !== presc.id));
      }

      const summaryDetails = [
        `Montant Total : ${(totalAmount || 0).toLocaleString()} ${establishment.currency}`,
        avoirDeducted > 0 ? `Avance Déduite : ${avoirDeducted.toLocaleString()} FCFA` : null,
        debtGenerated > 0 ? `Dette Enregistrée : ${debtGenerated.toLocaleString()} FCFA` : null,
        changeToAvance > 0 ? `Monnaie Créditée en Avance : +${changeToAvance.toLocaleString()} FCFA` : null,
        physicalChange > 0 ? `Monnaie Rendue : ${physicalChange.toLocaleString()} FCFA` : null,
        'Les médicaments ont été délivrés et le stock a été mis à jour.'
      ].filter(Boolean).join('\n');

      alert(`✅ PAIEMENT ET DÉLIVRANCE RÉUSSIS !\n\n${summaryDetails}`);
    } catch (err) {
      console.error("Error processing atomic pharmacy transaction:", err);
      alert("❌ Erreur lors du traitement de la transaction.");
    } finally {
      setIsProcessing(null);
    }
  };

  // ----------------------------------------------------
  // STOCK RESERVATION (SOFT LOCK) IN CART & PRESCRIPTION
  // ----------------------------------------------------
  const handleAddToCart = (med: any) => {
    const availableStock = (med.stock || 0) - (med.reservedStock || 0);
    const existingInCart = cart.find(c => c.id === med.id);
    const currentQtyInCart = existingInCart ? existingInCart.quantity : 0;

    if (currentQtyInCart + 1 > availableStock) {
      alert(`⚠️ STOCK INSUFFISANT OU RÉSERVÉ !\n\nLe médicament "${med.name}" dispose de ${availableStock} unité(s) disponible(s) (stock physique: ${med.stock}).`);
      return;
    }

    if (existingInCart) {
      setCart(cart.map(c => c.id === med.id ? { ...c, quantity: c.quantity + 1 } : c));
    } else {
      setCart([...cart, { ...med, quantity: 1 }]);
    }
  };

  const handleRemoveFromCart = (id: string) => {
    setCart(cart.filter(c => c.id !== id));
  };

  // Filters
  const filteredPrescriptions = pendingPrescriptions.filter(p => {
    const q = (patientSearch || '').toLowerCase().trim();
    if (!q) return true;
    return (
      (p.patient || '').toLowerCase().includes(q) ||
      (p.id || '').toLowerCase().includes(q) ||
      (p.patientId || '').toLowerCase().includes(q) ||
      (p.doctor || '').toLowerCase().includes(q)
    );
  });

  const filteredInventory = inventory.filter(item => {
    const q = (inventorySearch || '').toLowerCase().trim();
    if (!q) return true;
    return (
      (item.name || '').toLowerCase().includes(q) ||
      (item.family && item.family.toLowerCase().includes(q)) ||
      (item.id && item.id.toLowerCase().includes(q))
    );
  });

  const directTotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const directReceivedNum = parseFloat(directAmountReceived) || 0;
  const directChange = directReceivedNum >= directTotal ? directReceivedNum - directTotal : 0;
  const isDirectAmountSufficient = paymentMethod !== 'CASH' || !directAmountReceived || (directReceivedNum >= directTotal);

  // Pharmacy Sales & Orders (Strictly sorted Most Recent First)
  const pharmacySales = (paymentRequests || [])
    .filter(pr => 
      pr.sourceModule === 'Pharmacie' || 
      pr.requestingService === 'Pharmacie' || 
      pr.type === 'PHARMACIE' ||
      pr.type === 'VENTE_DIRECTE'
    )
    .sort((a, b) => {
      const tA = new Date(a.createdAt || (a as any).date || 0).getTime();
      const tB = new Date(b.createdAt || (b as any).date || 0).getTime();
      return tB - tA;
    });

  // KPIs calculation
  const getFilteredSalesByDate = (sales: any[], filter: 'ALL' | 'TODAY' | 'WEEK') => {
    const now = new Date();
    return sales.filter(s => {
      if (filter === 'ALL') return true;
      const saleDate = new Date(s.createdAt);
      if (isNaN(saleDate.getTime())) return true;
      
      const diffTime = Math.abs(now.getTime() - saleDate.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      if (filter === 'TODAY') {
        return saleDate.toDateString() === now.toDateString();
      }
      if (filter === 'WEEK') {
        return diffDays <= 7;
      }
      return true;
    });
  };

  const salesForKPIs = getFilteredSalesByDate(pharmacySales, historyDateFilter);
  const paidSalesForKPIs = salesForKPIs.filter(s => s.status === 'PAID' || s.status === 'PAID_PENDING_PICKUP' || s.status === 'DELIVERED');

  const kpiTotalRevenue = paidSalesForKPIs.reduce((sum, s) => sum + (s.totalAmount || 0), 0);
  const kpiSalesCount = paidSalesForKPIs.length;
  const kpiAverageCart = kpiSalesCount > 0 ? Math.round(kpiTotalRevenue / kpiSalesCount) : 0;
  
  const kpiTotalMedicinesSold = paidSalesForKPIs.reduce((sum, s) => {
    const itemQty = s.items?.reduce((itemSum: number, item: any) => itemSum + (item.quantity || 1), 0) || 0;
    return sum + itemQty;
  }, 0);

  const filteredHistorySales = getFilteredSalesByDate(pharmacySales, historyDateFilter).filter(sale => {
    const q = (historySearch || '').toLowerCase().trim();
    const matchesSearch = 
      !q ||
      (sale.id || '').toLowerCase().includes(q) ||
      (sale.patientName || '').toLowerCase().includes(q) ||
      sale.items?.some((item: any) => (item.name || '').toLowerCase().includes(q)) ||
      (sale.patientId && (sale.patientId || '').toLowerCase().includes(q));

    const matchesStatus = 
      historyStatusFilter === 'ALL' ||
      (historyStatusFilter === 'PAID' && (sale.status === 'PAID' || sale.status === 'PAID_PENDING_PICKUP')) ||
      (historyStatusFilter === 'DELIVERED' && sale.status === 'DELIVERED') ||
      (historyStatusFilter === 'PENDING' && sale.status === 'PENDING');

    const matchesType = 
      historyTypeFilter === 'ALL' ||
      (historyTypeFilter === 'ordonace' && sale.patientId !== 'PATIENT-COMPTANT') ||
      (historyTypeFilter === 'ventedirec' && sale.patientId === 'PATIENT-COMPTANT');

    return matchesSearch && matchesStatus && matchesType;
  });

  const shiftTotals = getShiftTotals();

  return (
    <div className={`h-screen flex flex-col overflow-hidden p-3 sm:p-5 font-sans ${theme === 'dark' ? 'bg-[#090d16] text-slate-100' : 'bg-[#F8FAFC] text-slate-900'}`}>
      <MicroHeader
        icon={Pill}
        title={
          activeTab === 'dashboard' ? 'Tableau de Bord Pharmacie' :
          activeTab === 'prescriptions' ? 'Ordonnances à Encaisser' : 
          activeTab === 'sales' ? 'Vente Directe & Stock' : 'Historique & Ventes'
        }
        subtitle="Officine & Caisse Dediée • Gestion des Stocks et Dispensations"
        breadcrumbs={[
          { label: 'Pharmacie', onClick: () => setActiveTab('dashboard') },
          { 
            label: activeTab === 'dashboard' ? 'Tableau de Bord' :
                   activeTab === 'prescriptions' ? 'Ordonnances' : 
                   activeTab === 'sales' ? 'Vente Directe' : 'Historique',
            active: true 
          }
        ]}
        onHomeClick={onBackToDashboard}
        onBackClick={activeTab !== 'dashboard' ? () => setActiveTab('dashboard') : undefined}
        user={{ name: user?.name || 'Pharmacien', role: 'Officine' }}
        theme={theme}
        quickStats={[
          { label: 'En attente', value: pendingPrescriptions.length, onClick: () => setActiveTab('prescriptions'), active: activeTab === 'prescriptions' },
          { label: 'Vente Directe', value: inventory.length, onClick: () => setActiveTab('sales'), active: activeTab === 'sales' },
          { label: 'Recettes', value: `${(kpiTotalRevenue || 0).toLocaleString()} F`, onClick: () => setActiveTab('history'), active: activeTab === 'history' },
          { label: 'Alertes', value: inventory.filter(i => i.alert || i.stock < 20).length, onClick: () => setActiveTab('sales') }
        ]}
        actions={
          <div className="flex items-center gap-2">
            {/* Session indicator */}
            {activeSession ? (
              <div className={`flex items-center gap-2 px-2.5 py-1 rounded-xl border ${
                theme === 'dark' ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-emerald-50 border-emerald-200'
              }`}>
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className={`text-xs font-bold hidden sm:inline ${theme === 'dark' ? 'text-emerald-400' : 'text-emerald-800'}`}>Caisse Ouverte</span>
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
                <span className={`text-xs font-bold hidden sm:inline ${theme === 'dark' ? 'text-amber-400' : 'text-amber-800'}`}>Caisse Fermée</span>
                <button
                  onClick={() => setShowOpenSessionModal(true)}
                  className="px-2 py-0.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-[11px] rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                >
                  <Unlock size={11} /> Ouvrir
                </button>
              </div>
            )}

            {/* Quick tab switcher */}
            <div className="hidden md:flex items-center gap-1.5">
              {[
                { id: 'dashboard', label: 'Dashboard' },
                { id: 'prescriptions', label: `Ordonnances (${pendingPrescriptions.length})` },
                { id: 'sales', label: 'Vente Directe' },
                { id: 'history', label: 'Historique' }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`px-3 py-1.5 rounded-xl font-semibold text-xs transition-colors cursor-pointer ${
                    activeTab === tab.id
                      ? 'bg-blue-600 text-white shadow-xs'
                      : theme === 'dark'
                      ? 'bg-slate-800/80 border border-slate-700/80 text-slate-300 hover:bg-slate-800'
                      : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        }
      />

      <main className="flex-1 min-h-0 overflow-y-auto custom-scrollbar mt-3">
      {activeTab === 'dashboard' && (
        <ModuleDashboard 
          theme={theme}
          moduleName="Pharmacie"
          moduleIcon={Pill}
          accentColor="text-blue-600"
          stats={[
            {
              title: "Ordonnances Attente",
              value: pendingPrescriptions.length.toString().padStart(2, '0'),
              icon: Clock,
              color: "bg-blue-600",
              subtext: "À encaisser",
              onClick: () => setActiveTab('prescriptions')
            },
            {
              title: "Délivrances Aujourd'hui",
              value: pharmacySales.filter(s => (s.status === 'DELIVERED' || s.status === 'PAID') && new Date(s.createdAt).toDateString() === new Date().toDateString()).length.toString().padStart(2, '0'),
              icon: CheckCircle,
              color: "bg-emerald-600",
              subtext: "Servies à la caisse",
              onClick: () => setActiveTab('history')
            },
            {
              title: "Alerte Stock",
              value: inventory.filter(i => i.alert || i.stock < 20).length.toString().padStart(2, '0'),
              icon: AlertCircle,
              color: "bg-rose-600",
              subtext: "Rupture imminente",
              onClick: () => setActiveTab('sales')
            },
            {
              title: "Recettes Pharmacie",
              value: (kpiTotalRevenue || 0).toLocaleString() + ' F',
              icon: DollarSign,
              color: "bg-slate-900",
              subtext: establishment.currency,
              onClick: () => setActiveTab('history')
            }
          ]}
        >
          {/* Recent Pharmacy Sales Table */}
          <div className="bg-white rounded-[40px] border border-slate-200 shadow-sm overflow-hidden mt-8">
            <div className="p-8 border-b bg-slate-50/50 flex justify-between items-center">
              <h3 className="font-black text-[10px] uppercase tracking-widest italic flex items-center gap-2">
                <ShoppingCart size={16} /> Dernières Ventes Caisse Pharmacie (Temps Réel)
              </h3>
              <button onClick={() => setActiveTab('history')} className="text-[10px] font-black text-blue-600 uppercase hover:underline cursor-pointer">Voir Historique</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-8 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">Client / Patient</th>
                    <th className="px-8 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">Type</th>
                    <th className="px-8 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">Mode</th>
                    <th className="px-8 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">Montant</th>
                    <th className="px-8 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">Statut</th>
                    <th className="px-8 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">Heure</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pharmacySales.sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 5).map((s, i) => (
                    <tr 
                      key={i} 
                      onClick={() => setActiveTab('history')}
                      className="hover:bg-slate-50 transition-colors group cursor-pointer"
                    >
                      <td className="px-8 py-6">
                        <p className="font-black text-slate-900 text-sm">{s.patientName}</p>
                        <p className="text-[10px] text-slate-400 font-black font-mono tracking-tighter uppercase">{s.id}</p>
                      </td>
                      <td className="px-8 py-6">
                        <span className="text-[10px] font-bold text-slate-500 uppercase bg-slate-100 px-2 py-1 rounded">
                          {s.type === 'PHARMACIE' ? 'Ordonnance' : 'Vente Directe'}
                        </span>
                      </td>
                      <td className="px-8 py-6">
                        <span className="text-[10px] font-bold text-blue-600 uppercase bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-100 font-mono">
                          {s.paymentMethod || 'CASH'}
                        </span>
                      </td>
                      <td className="px-8 py-6 font-black text-sm text-slate-700 font-mono">
                        {(s.totalAmount || 0).toLocaleString()} <span className="text-[10px] opacity-50">F</span>
                      </td>
                      <td className="px-8 py-6">
                        <span className={`text-[9px] font-black px-2.5 py-1 rounded-full ${
                          s.status === 'DELIVERED' || s.status === 'PAID' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'
                        }`}>
                          {s.status === 'DELIVERED' || s.status === 'PAID' ? 'PAYÉ & DÉLIVRÉ' : 'EN ATTENTE'}
                        </span>
                      </td>
                      <td className="px-8 py-6 text-[10px] text-slate-400 font-bold italic">
                        {new Date(s.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                      </td>
                    </tr>
                  ))}
                  {pharmacySales.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-8 py-20 text-center text-slate-400 text-xs font-bold uppercase tracking-widest italic opacity-50">
                        Aucune vente enregistrée aujourd'hui
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </ModuleDashboard>
      )}

      {/* CORE INTERFACE */}
      {activeTab !== 'dashboard' && (
        <>
          {activeTab === 'prescriptions' && (
            <div className="space-y-6">
              {/* SEARCH & FILTERS CONTAINER */}
              <div className="bg-white p-6 rounded-[32px] border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
                <div className="relative w-full md:max-w-md">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input 
                    type="text" 
                    placeholder="🔍 Rechercher un patient, DME, médecin ou ordonnance..." 
                    value={patientSearch}
                    onChange={e => setPatientSearch(e.target.value)}
                    className="w-full pl-11 pr-5 py-3.5 bg-slate-50 hover:bg-slate-100/50 border border-slate-200 focus:border-blue-500 focus:bg-white rounded-2xl text-xs font-bold outline-none transition-all placeholder:text-slate-400"
                  />
                  {patientSearch && (
                    <button onClick={() => setPatientSearch('')} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                      <X size={16} />
                    </button>
                  )}
                </div>
                <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  <Clock size={14} className="text-amber-500" /> {filteredPrescriptions.length} dossier(s) en attente d'encaissement
                </div>
              </div>

              {/* LIST OF PENDING PRESCRIPTIONS */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredPrescriptions.map(presc => {
                  const totalCost = presc.items.reduce((sum: number, item: any) => sum + (item.price || 0), 0);
                  return (
                    <div 
                      key={presc.id} 
                      className="bg-white rounded-[32px] border border-slate-200 p-6 shadow-sm hover:border-blue-500 hover:shadow-md transition-all flex flex-col justify-between group"
                    >
                      <div>
                        {/* CARD HEADER */}
                        <div className="flex justify-between items-start mb-4 pb-4 border-b border-slate-100">
                          <div>
                            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 font-mono">ID: {presc.id}</span>
                            <h3 className="font-black text-slate-800 text-sm mt-0.5 group-hover:text-blue-600 transition-colors">{presc.patient}</h3>
                            <p className="text-[10px] text-slate-400 font-bold mt-0.5">DME: {presc.patientId}</p>
                          </div>
                          <span className="text-[9px] font-black text-slate-500 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-100">
                            {presc.date}
                          </span>
                        </div>

                        {/* PRESCRIBED MEDICINES LIST */}
                        <div className="space-y-2.5 mb-6">
                          <p className="text-[9px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1">
                            <FileText size={12} /> Traitement Prescrit ({presc.items.length})
                          </p>
                          <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1 custom-scrollbar">
                            {presc.items.map((item: any, i: number) => (
                              <div key={i} className="flex justify-between items-center text-[11px] font-bold text-slate-700 bg-slate-50/50 px-3 py-2 rounded-xl border border-slate-150">
                                <span className="truncate max-w-[150px]">{item.name}</span>
                                <span className="text-slate-500 shrink-0 font-mono">{item.price || 1500} F</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* CARD ACTIONS */}
                      <div>
                        <div className="flex justify-between items-center bg-blue-50/50 rounded-2xl p-3 border border-blue-100/50 mb-4">
                          <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Total Ordonnance</span>
                          <span className="text-xs font-black text-blue-600 font-mono">{(totalCost || 0).toLocaleString()} FCFA</span>
                        </div>
                        
                        <button 
                          onClick={() => {
                            setSelectedPresc(presc);
                            setAmountReceived('');
                            setPaymentMethod('CASH');
                          }}
                          className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black text-[10px] uppercase tracking-widest transition-all shadow-sm flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          💳 Payer & Délivrer à la Caisse
                        </button>
                      </div>
                    </div>
                  );
                })}

                {filteredPrescriptions.length === 0 && (
                  <div className="col-span-full py-24 bg-white rounded-[40px] border border-slate-200 shadow-sm text-center flex flex-col items-center justify-center">
                    <div className="w-16 h-16 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mb-4">
                      <Search size={28} />
                    </div>
                    <h3 className="font-black text-slate-800 text-base">Aucune ordonnance en attente</h3>
                    <p className="text-xs text-slate-400 font-semibold mt-1">Toutes les ordonnances transmises ont été traitées ou encaissées.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'sales' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              {/* LEFT: PRODUCT CATALOG WITH GRID/TABLE TOGGLE */}
              <div className="lg:col-span-8">
                <PharmacyCatalog 
                  inventory={inventory}
                  cart={cart}
                  currency={establishment.currency}
                  onAddToCart={handleAddToCart}
                />
              </div>

              {/* RIGHT: CHECKOUT PANEL WITH PATIENT LINKING & AVOIRS / DETTES */}
              <div className="lg:col-span-4">
                <PharmacyCheckoutPanel 
                  cart={cart}
                  patients={patients}
                  avoirs={avoirsPatient}
                  dettes={dettesPatient}
                  linkedPatient={linkedPatient}
                  paymentMethod={paymentMethod}
                  directAmountReceived={directAmountReceived}
                  isProcessing={isProcessing === 'direct-sale'}
                  currency={establishment.currency}
                  onRemoveFromCart={handleRemoveFromCart}
                  onSelectPatient={setLinkedPatient}
                  onSetPaymentMethod={setPaymentMethod}
                  onSetAmountReceived={setDirectAmountReceived}
                  onSubmitPayment={(options) => {
                    handleProcessPayment(
                      null,
                      cart,
                      directTotal,
                      linkedPatient ? `${linkedPatient.firstName} ${linkedPatient.lastName}` : 'Client Comptant (Pharmacie)',
                      linkedPatient ? linkedPatient.id : 'PATIENT-COMPTANT',
                      'VENTE_DIRECTE',
                      options.cashRemis,
                      options
                    );
                  }}
                />
              </div>
            </div>
          )}

          {activeTab === 'history' && (
            <PharmacyHistoryTable 
              sales={pharmacySales}
              currency={establishment.currency}
              onSelectReceipt={(receipt) => {
                setSelectedReceipt(receipt);
                setShowReceiptModal(true);
              }}
            />
          )}
        </>
      )}

      {/* VIEW & ENCAISSER PRESCRIPTION MODAL WITH WALLET & AVOIRS / DETTES */}
      {selectedPresc && (
        <PrescriptionCheckoutModal 
          prescription={selectedPresc}
          patients={patients}
          avoirs={avoirsPatient}
          dettes={dettesPatient}
          isProcessing={isProcessing !== null}
          currency={establishment.currency}
          onClose={() => setSelectedPresc(null)}
          onConfirmPayment={(options) => {
            const total = selectedPresc.items.reduce((sum: number, item: any) => sum + (item.price || 0), 0);
            handleProcessPayment(
              selectedPresc,
              selectedPresc.items,
              total,
              selectedPresc.patient,
              selectedPresc.patientId,
              'ORDONNANCE',
              options.cashRemis,
              options
            );
          }}
        />
      )}
      </main>

      {/* MODAL 1: OPEN PHARMACY SHIFT */}
      {showOpenSessionModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[150] flex items-center justify-center p-4">
          <div className="bg-white rounded-[32px] max-w-lg w-full p-8 shadow-2xl border border-slate-100">
            <div className="flex justify-between items-center pb-6 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl">
                  <Unlock size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-900">Ouverture Caisse Pharmacie</h3>
                  <p className="text-xs text-slate-500 font-medium">Prise de poste & Fond de caisse initial officine</p>
                </div>
              </div>
              <button onClick={() => setShowOpenSessionModal(false)} className="p-2 hover:bg-slate-100 rounded-full text-slate-400">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-6 py-6">
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-2 text-xs">
                <div className="flex justify-between font-bold text-slate-500">
                  <span>Caissier Pharmacie:</span>
                  <span className="text-slate-900">{user?.name || 'Pharmacien'}</span>
                </div>
                <div className="flex justify-between font-bold text-slate-500">
                  <span>Heure d'ouverture:</span>
                  <span className="text-slate-900">{new Date().toLocaleString('fr-FR')}</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                  Fond de Caisse Initial (Espèces)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    value={initialFloatInput}
                    onChange={(e) => setInitialFloatInput(e.target.value)}
                    placeholder="50000"
                    className="w-full px-5 py-4 bg-white border border-slate-200 rounded-2xl font-black text-2xl text-slate-900 focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                  <span className="absolute right-5 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">
                    FCFA
                  </span>
                </div>
              </div>
            </div>

            <div className="flex gap-4 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowOpenSessionModal(false)}
                className="flex-1 py-4 font-bold text-slate-600 hover:bg-slate-100 rounded-2xl transition-colors cursor-pointer"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleOpenSession}
                className="flex-1 py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-2xl shadow-lg shadow-emerald-600/20 transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <Unlock size={18} />
                Démarrer le Shift Pharmacie
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: CLOSE PHARMACY SHIFT */}
      {showCloseSessionModal && activeSession && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[150] flex items-center justify-center p-4">
          <div className="bg-white rounded-[32px] max-w-2xl w-full p-8 shadow-2xl border border-slate-100 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center pb-6 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-rose-50 text-rose-600 rounded-2xl">
                  <Lock size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-900">Clôture Caisse Pharmacie</h3>
                  <p className="text-xs text-slate-500 font-medium">Réconciliation & Contrôle physique du tiroir caisse officine</p>
                </div>
              </div>
              <button onClick={() => setShowCloseSessionModal(false)} className="p-2 hover:bg-slate-100 rounded-full text-slate-400">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-6 py-6">
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Fond Initial</p>
                  <p className="font-black text-lg text-slate-900">{activeSession.initialFloat.toLocaleString()} F</p>
                </div>
                <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-100">
                  <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Espèces Encaissements</p>
                  <p className="font-black text-lg text-emerald-700">{shiftTotals.totalCash.toLocaleString()} F</p>
                </div>
                <div className="bg-blue-50 p-4 rounded-2xl border border-blue-100">
                  <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">Attendu Espèces</p>
                  <p className="font-black text-lg text-blue-700">{shiftTotals.expectedCashInHand.toLocaleString()} F</p>
                </div>
              </div>

              <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 space-y-2 text-xs font-bold text-slate-600">
                <p className="text-xs font-black text-slate-900 uppercase tracking-wider border-b pb-2">Ventilation des Recettes Shift</p>
                <div className="grid grid-cols-2 gap-2">
                  <div>Espèces: <span className="text-slate-900">{shiftTotals.totalCash.toLocaleString()} F</span></div>
                  <div>Mobile Money: <span className="text-slate-900">{shiftTotals.totalMobileMoney.toLocaleString()} F</span></div>
                  <div>Carte Bancaire: <span className="text-slate-900">{shiftTotals.totalCard.toLocaleString()} F</span></div>
                  <div>Virement: <span className="text-slate-900">{shiftTotals.totalTransfer.toLocaleString()} F</span></div>
                </div>
                <div className="pt-2 border-t flex justify-between font-black text-sm text-slate-900">
                  <span>TOTAL GÉNÉRAL RECETTES:</span>
                  <span className="text-emerald-600">{shiftTotals.totalCollected.toLocaleString()} F</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
                  Espèces Physique Comptées en Caisse *
                </label>
                <div className="relative">
                  <input
                    type="number"
                    value={actualCashInput}
                    onChange={(e) => setActualCashInput(e.target.value)}
                    placeholder={shiftTotals.expectedCashInHand.toString()}
                    className="w-full px-5 py-4 bg-white border border-slate-200 rounded-2xl font-black text-2xl text-slate-900 focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                  <span className="absolute right-5 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">
                    FCFA
                  </span>
                </div>

                {actualCashInput !== '' && !isNaN(parseFloat(actualCashInput)) && (
                  <div className={`mt-3 p-4 rounded-2xl border flex items-center justify-between ${
                    parseFloat(actualCashInput) === shiftTotals.expectedCashInHand
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : parseFloat(actualCashInput) < shiftTotals.expectedCashInHand
                      ? 'bg-rose-50 border-rose-200 text-rose-800'
                      : 'bg-blue-50 border-blue-200 text-blue-800'
                  }`}>
                    <span className="text-xs font-bold">
                      {parseFloat(actualCashInput) === shiftTotals.expectedCashInHand
                        ? "✓ Caisse Exacte (Aucun écart)"
                        : parseFloat(actualCashInput) < shiftTotals.expectedCashInHand
                        ? "⚠️ Manquant en caisse"
                        : "ℹ️ Excédent en caisse"}
                    </span>
                    <span className="font-black text-base">
                      {Math.abs(parseFloat(actualCashInput) - shiftTotals.expectedCashInHand).toLocaleString()} F
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-4 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowCloseSessionModal(false)}
                className="flex-1 py-4 font-bold text-slate-600 hover:bg-slate-100 rounded-2xl transition-colors cursor-pointer"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleCloseSession}
                className="flex-1 py-4 bg-rose-600 hover:bg-rose-700 text-white font-black rounded-2xl shadow-lg shadow-rose-600/20 transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <Lock size={18} />
                Valider la Clôture Pharmacie
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: PRINTABLE PHARMACY SHIFT REPORT */}
      {closedSessionReport && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[160] flex items-center justify-center p-4">
          <div className="bg-white rounded-[32px] max-w-xl w-full p-8 shadow-2xl border border-slate-100">
            <div className="flex justify-between items-center pb-6 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl">
                  <Printer size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-900">Rapport Clôture Caisse Pharmacie</h3>
                  <p className="text-xs text-slate-500 font-medium">Bilan officiel imprimable fin de shift officine</p>
                </div>
              </div>
              <button onClick={() => setClosedSessionReport(null)} className="p-2 hover:bg-slate-100 rounded-full text-slate-400">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4 py-6 border-b border-slate-100 text-sm font-medium text-slate-700">
              <div className="text-center pb-4 border-b border-slate-100">
                <p className="font-black text-lg text-slate-900">{establishment.name}</p>
                <p className="text-xs text-slate-500">{establishment.address} • Tel: {establishment.phone}</p>
                <p className="text-xs font-bold text-blue-600 mt-1 uppercase tracking-wider">Rapport Officiel Clôture Caisse Pharmacie</p>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>Caissier: <span className="font-bold text-slate-900">{closedSessionReport.cashierName}</span></div>
                <div>ID Session: <span className="font-mono font-bold text-slate-900">{closedSessionReport.id}</span></div>
                <div>Ouverture: <span className="font-bold text-slate-900">{new Date(closedSessionReport.openedAt).toLocaleString('fr-FR')}</span></div>
                <div>Fermeture: <span className="font-bold text-slate-900">{closedSessionReport.closedAt ? new Date(closedSessionReport.closedAt).toLocaleString('fr-FR') : '-'}</span></div>
              </div>

              <div className="bg-slate-50 p-4 rounded-2xl space-y-2 text-xs">
                <div className="flex justify-between">
                  <span>Fond de Caisse Initial:</span>
                  <span className="font-bold">{closedSessionReport.initialFloat.toLocaleString()} F</span>
                </div>
                <div className="flex justify-between">
                  <span>Recettes Espèces:</span>
                  <span className="font-bold">{closedSessionReport.totalCash.toLocaleString()} F</span>
                </div>
                <div className="flex justify-between">
                  <span>Recettes Mobile Money:</span>
                  <span className="font-bold">{closedSessionReport.totalMobileMoney.toLocaleString()} F</span>
                </div>
                <div className="flex justify-between">
                  <span>Recettes Carte / Autres:</span>
                  <span className="font-bold">{(closedSessionReport.totalCard + closedSessionReport.totalTransfer + closedSessionReport.totalCheck).toLocaleString()} F</span>
                </div>
                <div className="flex justify-between pt-2 border-t font-black text-slate-900">
                  <span>Total Encaissé Shift:</span>
                  <span className="text-emerald-600">{closedSessionReport.totalCollected.toLocaleString()} F</span>
                </div>
                <div className="flex justify-between pt-1 font-bold text-slate-800">
                  <span>Attendu Théorique (Espèces):</span>
                  <span>{closedSessionReport.expectedFinalFloat?.toLocaleString()} F</span>
                </div>
                <div className="flex justify-between font-bold text-slate-800">
                  <span>Compté Réel Physiquement:</span>
                  <span>{closedSessionReport.actualCashInHand?.toLocaleString()} F</span>
                </div>
                <div className={`flex justify-between font-black pt-2 border-t ${
                  (closedSessionReport.difference || 0) === 0 ? 'text-emerald-700' : (closedSessionReport.difference || 0) < 0 ? 'text-rose-700' : 'text-blue-700'
                }`}>
                  <span>Écart de Caisse:</span>
                  <span>{(closedSessionReport.difference || 0) > 0 ? `+${closedSessionReport.difference?.toLocaleString()}` : closedSessionReport.difference?.toLocaleString()} F</span>
                </div>
              </div>
            </div>

            <div className="flex gap-4 pt-4">
              <button
                type="button"
                onClick={() => setClosedSessionReport(null)}
                className="flex-1 py-4 font-bold text-slate-600 hover:bg-slate-100 rounded-2xl transition-colors cursor-pointer"
              >
                Fermer
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="flex-1 py-4 bg-slate-900 hover:bg-blue-600 text-white font-black rounded-2xl shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <Printer size={18} />
                Imprimer le Rapport
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RECEIPT MODAL (FOR VIEW & PRINT) */}
      {showReceiptModal && selectedReceipt && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-md z-[100] flex items-center justify-center p-4 print:p-0 print:bg-white print:block">
          <div className="bg-white rounded-[40px] w-full max-w-xl max-h-[90vh] shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-250 print:max-h-full print:shadow-none print:rounded-none">
            
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50 print:hidden">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center">
                  <Printer size={18} />
                </div>
                <h2 className="font-black text-slate-800 text-sm uppercase tracking-tight">Reçu Officine Caisse Pharmacie</h2>
              </div>
              <button 
                onClick={() => {
                  setShowReceiptModal(false);
                  setSelectedReceipt(null);
                }}
                className="p-2 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer text-slate-500"
              >
                <X size={18} />
              </button>
            </div>

            <div id="pharmacy-receipt" className="p-8 lg:p-10 flex-1 overflow-y-auto bg-white print:p-0 print:overflow-visible">
              <div className="text-center mb-6 border-b-2 border-dashed border-slate-200 pb-6 print:border-slate-300">
                <h1 className="text-lg lg:text-xl font-black text-slate-900 uppercase tracking-widest">{establishment?.name || 'SmartHosto SIH'}</h1>
                <p className="text-[9px] font-bold text-slate-500 mt-1 uppercase">{establishment?.address || ''} {establishment?.phone ? `• Tel: ${establishment.phone}` : ''}</p>
                <div className="mt-4 flex flex-col items-center">
                  <div className="px-3 py-1 bg-slate-900 text-white rounded-full text-[8px] font-black uppercase tracking-widest print:bg-white print:text-black print:border print:border-black">
                    Reçu Caisse Officine : {selectedReceipt.id}
                  </div>
                  <p className="text-[9px] font-mono font-bold text-slate-400 mt-2">
                    Date : {selectedReceipt?.createdAt ? new Date(selectedReceipt.createdAt).toLocaleString() : 'N/A'}
                  </p>
                </div>
              </div>

              <div className="mb-6 space-y-1">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Client / Patient</p>
                <p className="text-sm font-black text-slate-900">{selectedReceipt.patientName || 'VENTE COMPTANT DIRECT'}</p>
                {selectedReceipt.patientId && <p className="text-[10px] font-bold text-slate-500">DME: {selectedReceipt.patientId}</p>}
              </div>

              <div className="mb-6">
                <table className="w-full text-[10px] lg:text-[11px]">
                  <thead>
                    <tr className="border-b-2 border-slate-900 text-slate-900 font-black uppercase tracking-widest print:border-slate-300">
                      <th className="py-2 text-left">Produit</th>
                      <th className="py-2 text-center">Qté</th>
                      <th className="py-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="font-bold text-slate-700 divide-y divide-slate-100">
                    {selectedReceipt.items.map((item: any, i: number) => (
                      <tr key={i}>
                        <td className="py-2.5">{item.name}</td>
                        <td className="py-2.5 text-center">{item.quantity || 1}</td>
                        <td className="py-2.5 text-right font-mono">{((item.price || item.unitPrice || 0) * (item.quantity || 1)).toLocaleString()} F</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="space-y-2 bg-slate-50 p-5 rounded-3xl border border-slate-100 print:bg-white print:border-slate-200">
                <div className="flex justify-between items-center text-slate-500 font-bold uppercase tracking-wider text-[9px]">
                  <span>Total Brut</span>
                  <span className="font-mono text-[11px]">{(selectedReceipt.totalAmount || 0).toLocaleString()} F</span>
                </div>
                {selectedReceipt.avoirUtilise ? (
                  <div className="flex justify-between items-center text-emerald-600 font-bold uppercase tracking-wider text-[9px]">
                    <span>Avance Déduite (Avoir)</span>
                    <span className="font-mono text-[11px] font-bold">-{selectedReceipt.avoirUtilise.toLocaleString()} F</span>
                  </div>
                ) : null}
                {selectedReceipt.detteCreee ? (
                  <div className="flex justify-between items-center text-rose-600 font-bold uppercase tracking-wider text-[9px]">
                    <span>Porté en Dette Patient</span>
                    <span className="font-mono text-[11px] font-bold">+{selectedReceipt.detteCreee.toLocaleString()} F</span>
                  </div>
                ) : null}
                {selectedReceipt.avoirGenere ? (
                  <div className="flex justify-between items-center text-emerald-600 font-bold uppercase tracking-wider text-[9px]">
                    <span>Monnaie Créditée en Avance</span>
                    <span className="font-mono text-[11px] font-bold">+{selectedReceipt.avoirGenere.toLocaleString()} F</span>
                  </div>
                ) : null}
                <div className="flex justify-between items-center text-slate-500 font-bold uppercase tracking-wider text-[9px]">
                  <span>Mode de Règlement</span>
                  <span className="font-mono text-[11px] font-bold text-slate-900">{selectedReceipt.paymentMethod || 'CASH'}</span>
                </div>
                {lastDirectReceived > 0 && selectedReceipt.paymentMethod === 'CASH' ? (
                  <div className="flex justify-between items-center text-slate-500 font-bold uppercase tracking-wider text-[9px]">
                    <span>Montant Versé (Espèces)</span>
                    <span className="font-mono text-[11px] font-bold text-slate-900">{lastDirectReceived.toLocaleString()} F</span>
                  </div>
                ) : null}
                {lastDirectChange > 0 ? (
                  <div className="flex justify-between items-center text-blue-600 font-bold uppercase tracking-wider text-[9px]">
                    <span>Monnaie Rendue</span>
                    <span className="font-mono text-[11px] font-bold text-blue-600">{lastDirectChange.toLocaleString()} F</span>
                  </div>
                ) : null}
                <div className="flex justify-between items-center border-t border-slate-900 pt-2 print:border-slate-300">
                  <span className="text-[9px] font-black uppercase tracking-widest text-slate-900">Total Encaissé Réel</span>
                  <span className="text-lg lg:text-xl font-black text-slate-900 font-mono italic">
                    {((selectedReceipt.amountPaid !== undefined ? selectedReceipt.amountPaid : selectedReceipt.totalAmount) || 0).toLocaleString()} FCFA
                  </span>
                </div>
              </div>

              <div className="mt-8 text-center space-y-3">
                <div className="inline-block border-2 border-slate-900 px-4 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest print:border-slate-300">
                  ENCAISSÉ À LA CAISSE PHARMACIE
                </div>
                <p className="text-[8px] lg:text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-relaxed">
                  Les médicaments ne sont ni repris ni échangés.<br />Merci de votre confiance.
                </p>
              </div>
            </div>

            <div className="p-6 bg-slate-50 border-t border-slate-100 flex gap-3 print:hidden">
              <button 
                onClick={() => window.print()}
                className="flex-1 py-3.5 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all shadow-lg flex items-center justify-center gap-2 cursor-pointer"
              >
                <Printer size={16} /> Imprimer Reçu
              </button>
              <button 
                onClick={() => {
                  setShowReceiptModal(false);
                  setSelectedReceipt(null);
                }}
                className="px-6 py-3.5 bg-white hover:bg-slate-100 text-slate-500 border border-slate-200 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all cursor-pointer"
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

export default Pharmacy;
