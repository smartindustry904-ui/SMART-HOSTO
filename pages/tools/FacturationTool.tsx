import React, { useState, useMemo, useEffect } from 'react';
import { Search, Plus, Trash2, Printer, CreditCard, DollarSign, User, FileText, AlertTriangle, CheckCircle, ShoppingCart, X, Loader2, Lock, AlertCircle } from 'lucide-react';
import { db, sanitizeData } from '../../src/firebase';
import { doc, updateDoc, collection, setDoc, query, where, getDocs, writeBatch, onSnapshot } from 'firebase/firestore';
import { PaymentRequest, LigneFacturation, TransactionFacturation, AvoirPatient, DettePatient, HistoriqueFinancierPatient, ParametresCaisse, Patient } from '../../types';
import { useSettings } from '../../hooks/useSettings';
import { formatPatientFullName } from '../../src/patientUtils';

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

interface FacturationToolProps {
  user: any;
  paymentRequests: PaymentRequest[];
  setPaymentRequests: React.Dispatch<React.SetStateAction<PaymentRequest[]>>;
  transactions: TransactionFacturation[];
  setTransactions: React.Dispatch<React.SetStateAction<TransactionFacturation[]>>;
  avoirs: AvoirPatient[];
  setAvoirs: React.Dispatch<React.SetStateAction<AvoirPatient[]>>;
  dettes: DettePatient[];
  setDettes: React.Dispatch<React.SetStateAction<DettePatient[]>>;
  parametres: ParametresCaisse;
  activeSession?: any;
}

export const FacturationTool: React.FC<FacturationToolProps> = ({
  user,
  paymentRequests,
  setPaymentRequests,
  transactions,
  setTransactions,
  avoirs,
  setAvoirs,
  dettes,
  setDettes,
  parametres,
  activeSession
}) => {
  const { establishment } = useSettings();
  const [selectedPatientId, setSelectedPatientId] = useState<string>('');
  const [lignes, setLignes] = useState<LigneFacturation[]>([]);
  const [montantRemis, setMontantRemis] = useState<string>('');
  const [modePaiement, setModePaiement] = useState<'CASH' | 'CARD' | 'MOBILE_MONEY' | 'TRANSFER' | 'CHECK' | 'OTHER'>('CASH');
  const [useAvoir, setUseAvoir] = useState<boolean>(parametres.applicationAutoAvoir);
  const [includeExistingDebt, setIncludeExistingDebt] = useState<boolean>(false);
  const [surplusAction, setSurplusAction] = useState<'AVANCE' | 'RENDRE'>('RENDRE');
  const [patientSearchQuery, setPatientSearchQuery] = useState('');
  const [showPatientResults, setShowPatientResults] = useState(false);


  // Pour l'ajout direct
  const [newItemLibelle, setNewItemLibelle] = useState('');
  const [newItemPrix, setNewItemPrix] = useState('');
  const [newItemQte, setNewItemQte] = useState('1');

  // Reçu
  const [showReceipt, setShowReceipt] = useState(false);
  const [lastTransaction, setLastTransaction] = useState<TransactionFacturation | null>(null);

  // Historique patient
  const [patientsList, setPatientsList] = useState<Patient[]>([]);
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'patients'), snapshot => {
      setPatientsList(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Patient)));
    });
    return () => unsub();
  }, []);

  const selectedPatientObj = useMemo(() => {
    if (!selectedPatientId) return null;
    return patientsList.find(p => p.id === selectedPatientId || (p as any).patientId === selectedPatientId || (p as any).ipd === selectedPatientId) || null;
  }, [patientsList, selectedPatientId]);

  const isCreditBlocked = selectedPatientObj ? (selectedPatientObj.creditBlocked === true || selectedPatientObj.allowCredit === false) : false;

  const patientAvoirs = useMemo(() => avoirs.filter(a => a.patientId === selectedPatientId && a.status === 'AVAILABLE'), [avoirs, selectedPatientId]);
  const patientDettes = useMemo(() => dettes.filter(d => d.patientId === selectedPatientId && (d.status === 'PENDING' || d.status === 'PARTIAL')), [dettes, selectedPatientId]);
  
  const totalAvoirDispo = patientAvoirs.reduce((sum, a) => sum + a.montant, 0);
  const totalDetteEnCours = patientDettes.reduce((sum, d) => sum + d.montantRestant, 0);

  // Calculs - incorporate real patients with formatted names and credit status
  const uniquePatients = useMemo(() => {
    const patientsMap = new Map();
    // 1. Primary directory from patients collection
    patientsList.forEach(p => {
      const formatted = formatPatientFullName(p);
      const isBlocked = p.creditBlocked === true || p.allowCredit === false;
      if (p.id) {
        patientsMap.set(p.id, { id: p.id, name: formatted, isBlocked, phone: p.phone, ipd: (p as any).ipd });
      }
      if ((p as any).patientId && (p as any).patientId !== p.id) {
        patientsMap.set((p as any).patientId, { id: (p as any).patientId, name: formatted, isBlocked, phone: p.phone, ipd: (p as any).ipd });
      }
    });

    // 2. Incorporate payment requests
    paymentRequests.forEach(pr => {
      if (pr.patientId) {
        if (!patientsMap.has(pr.patientId)) {
          patientsMap.set(pr.patientId, { id: pr.patientId, name: pr.patientName || pr.patientId, isBlocked: false });
        }
      }
    });

    // 3. Transactions
    transactions.forEach(tx => {
      if (tx.patientId && !patientsMap.has(tx.patientId)) {
        patientsMap.set(tx.patientId, { id: tx.patientId, name: tx.patientName || tx.patientId, isBlocked: false });
      }
    });

    // 4. Avoirs & Dettes
    avoirs.forEach(av => {
      if (av.patientId && !patientsMap.has(av.patientId)) {
        patientsMap.set(av.patientId, { id: av.patientId, name: av.patientId, isBlocked: false });
      }
    });
    dettes.forEach(dt => {
      if (dt.patientId && !patientsMap.has(dt.patientId)) {
        patientsMap.set(dt.patientId, { id: dt.patientId, name: dt.patientName || dt.patientId, isBlocked: false });
      }
    });

    return Array.from(patientsMap.values());
  }, [patientsList, paymentRequests, transactions, avoirs, dettes]);

  const filteredPatients = useMemo(() => {
    if (!patientSearchQuery) return [];
    const lowerQ = patientSearchQuery.toLowerCase();
    return uniquePatients.filter(p => p.name.toLowerCase().includes(lowerQ) || p.id.toLowerCase().includes(lowerQ));
  }, [patientSearchQuery, uniquePatients]);

  // Calculs précis - strict zero-sum for already paid items
  const sousTotalPrestations = lignes
    .filter(l => !l.isPaid)
    .reduce((sum, l) => sum + (Number(l.montantTotal) || 0), 0);
  const detteAInclure = includeExistingDebt ? totalDetteEnCours : 0;
  const totalFactureGlobal = sousTotalPrestations + detteAInclure;
  
  const montantAvoirApplique = useAvoir ? Math.min(totalFactureGlobal, totalAvoirDispo) : 0;
  const netAPayer = Math.max(0, totalFactureGlobal - montantAvoirApplique);
  
  const remis = Number(montantRemis) || 0;
  const resteAPayer = Math.max(0, netAPayer - remis);
  const surplus = Math.max(0, remis - netAPayer);

  const monnaieRendue = surplusAction === 'RENDRE' ? surplus : 0;
  const avanceGeneree = surplusAction === 'AVANCE' ? surplus : 0;

  // Validation
  const canValidate = useMemo(() => {
    if (!activeSession) return false;
    const unpaidLignes = lignes.filter(l => !l.isPaid);
    if (unpaidLignes.length === 0 && !includeExistingDebt) return false;
    // Enforce explicit overpayment choice: if surplus > 0, surplusAction MUST be selected
    if (surplus > 0 && !surplusAction) return false;

    if (remis >= netAPayer) return true;
    
    // Credit lock enforcement: If debt is blocked, no partial payment/debt is permitted!
    if (isCreditBlocked) return false;

    // Paiement partiel
    if (!parametres.paiementPartielAutorise) return false;
    if (!parametres.detteAutorisee) return false;
    
    // Vérification seuil dette (si on n'inclut pas la dette déjà existante, elle compte quand même dans le total)
    const nouvelleDetteTotale = (includeExistingDebt ? 0 : totalDetteEnCours) + resteAPayer;
    if (nouvelleDetteTotale > parametres.seuilDetteMax) {
      // Seuls certains rôles peuvent autoriser le dépassement
      const hasPermission = parametres.permissions.autoriserDette.includes(user.role);
      if (!hasPermission) return false;
    }
    
    return true;
  }, [activeSession, lignes, remis, netAPayer, parametres, totalDetteEnCours, resteAPayer, user.role, includeExistingDebt, surplus, surplusAction, isCreditBlocked]);

  // Chargement des demandes pour le patient sélectionné avec Déduplication Profonde et Strict Filtering des Items Déjà Payés
  useEffect(() => {
    if (!selectedPatientId) {
      setLignes(prev => prev.filter(l => l.source === 'Achat Direct'));
      return;
    }
    
    // STRICT FILTER: Strictly exclude any request that is PAID / SOLDE / COMPLETED / CANCELLED / DELIVERED
    const patientRequests = paymentRequests.filter(pr => {
      if (pr.patientId !== selectedPatientId) return false;
      if (isPharmacyOrMedication(pr)) return false;
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
      ) return false;
      if (
        paymentStatusUpper === 'PAID' || 
        paymentStatusUpper === 'SOLDE' || 
        paymentStatusUpper === 'PAYE' ||
        paymentStatusUpper === 'COMPLETED'
      ) return false;
      if ((pr as any).isPaid === true || (pr as any).paid === true) return false;
      if (pr.amountPaid && pr.amountPaid >= pr.totalAmount) return false;
      if ((pr as any).resteAPayer !== undefined && Number((pr as any).resteAPayer) <= 0) return false;
      return true;
    });
    
    const pendingMap = new Map<string, LigneFacturation>();

    patientRequests.forEach(pr => {
      (pr.items || []).forEach((item, idx) => {
        const itemStatus = ((item as any).status || '').toUpperCase();
        const itemPaymentStatus = ((item as any).payment_status || '').toUpperCase();
        const isItemPaid = 
          itemStatus === 'PAID' || itemStatus === 'SOLDE' || itemStatus === 'PAYE' ||
          itemPaymentStatus === 'PAID' || itemPaymentStatus === 'SOLDE' || itemPaymentStatus === 'PAYE' ||
          (item as any).isPaid === true;

        // STRICT FILTER: Paid items must absolutely not appear in the active Lignes de facturation grid!
        if (isItemPaid) return;

        const cleanLibelle = (item.name || '').trim();
        if (!cleanLibelle) return;
        
        const source = pr.sourceModule || pr.requestingService || 'Consultation';
        const itemQty = item.quantity || 1;
        const unitPrice = item.unitPrice || (itemQty > 0 ? Math.round((item.totalPrice || 0) / itemQty) : item.totalPrice) || 0;

        // Key for consolidating legitimate duplicate items into a single row with incremented quantity
        const pendingKey = `${cleanLibelle.toLowerCase()}__${source.toLowerCase()}`;
        if (pendingMap.has(pendingKey)) {
          const existing = pendingMap.get(pendingKey)!;
          existing.quantite += itemQty;
          existing.montantTotal = existing.prixUnitaire * existing.quantite;
          existing.originalPrice = existing.montantTotal;
          if (pr.id && existing.paymentRequestIds && !existing.paymentRequestIds.includes(pr.id)) {
            existing.paymentRequestIds.push(pr.id);
          }
        } else {
          pendingMap.set(pendingKey, {
            id: `PENDING-${pr.id}-${item.id || idx}`,
            libelle: cleanLibelle,
            source: source,
            quantite: itemQty,
            prixUnitaire: unitPrice,
            montantTotal: unitPrice * itemQty,
            originalPrice: unitPrice * itemQty,
            paymentRequestId: pr.id,
            paymentRequestIds: [pr.id],
            isPaid: false,
            date: pr.createdAt || new Date().toISOString(),
            createdAt: pr.createdAt || new Date().toISOString()
          });
        }
      });
    });
    
    setLignes(prev => {
      // Preserve manually added direct items
      const directItems = prev.filter(l => l.source === 'Achat Direct');
      const pendingItems = Array.from(pendingMap.values());
      // ONLY pending and direct unpaid items enter active Lignes de facturation
      return [...directItems, ...pendingItems];
    });
  }, [selectedPatientId, paymentRequests]);

  const handleAddDirectItem = () => {
    if (!newItemLibelle || !newItemPrix || !newItemQte) return;
    
    const prix = parseFloat(newItemPrix);
    const qte = parseInt(newItemQte);
    
    const nowIso = new Date().toISOString();
    const newLigne: LigneFacturation = {
      id: `DIRECT-${Date.now()}`,
      libelle: newItemLibelle,
      source: 'Achat Direct',
      quantite: qte,
      prixUnitaire: prix,
      montantTotal: prix * qte,
      isPaid: false,
      originalPrice: prix * qte,
      date: nowIso,
      createdAt: nowIso
    };
    
    setLignes([...lignes, newLigne]);
    setNewItemLibelle('');
    setNewItemPrix('');
    setNewItemQte('1');
  };

  const handleRemoveLigne = (id: string) => {
    // Only allow removing unpaid lines
    setLignes(lignes.filter(l => l.id !== id || l.isPaid));
  };

  const [isProcessing, setIsProcessing] = useState(false);
  const handleValidate = async () => {
    if (!canValidate || !selectedPatientId || isProcessing) return;
    if (!activeSession) {
      alert("⚠️ Caisse Fermée ! Veuillez ouvrir une session de caisse avant de valider un encaissement.");
      return;
    }
    setIsProcessing(true);
    try {

    const transactionId = parametres.technique.formatTransaction.replace('YYYYMMDD', new Date().toISOString().split('T')[0].replace(/-/g, '')).replace('XXXX', Math.floor(Math.random() * 10000).toString().padStart(4, '0'));

    const resolvedPatientName = formatPatientFullName(selectedPatientObj, patientSearchQuery || selectedPatientId);

    const nouvelleTransaction: any = {
      id: transactionId,
      patientId: selectedPatientId,
      patientName: resolvedPatientName,
      date: new Date().toISOString(),
      lignes: [...lignes],
      sousTotal: sousTotalPrestations,
      detteIncluse: detteAInclure,
      totalFacture: totalFactureGlobal,
      totalGeneral: netAPayer,
      amount: remis - monnaieRendue, // Net cash entering the caisse applied to this transaction
      montantPaye: remis,
      avoirUtilise: montantAvoirApplique,
      surplusConserve: avanceGeneree,
      monnaieRendue: monnaieRendue,
      detteCreee: resteAPayer,
      modePaiement,
      caissierId: user?.id || 'agent',
      caissierName: user?.name || 'Caissier Principal',
      cashierId: user?.id || 'agent',
      cashierName: user?.name || 'Caissier Principal',
      sessionId: activeSession?.id || null,
      caisseSessionId: activeSession?.id || null,
      status: 'VALIDATED'
    };

    const batch = writeBatch(db);

    // 1. Transaction record
    const txRef = doc(db, 'cashier_transactions', transactionId);
    batch.set(txRef, sanitizeData(nouvelleTransaction));

    // 2. Used Avoir
    if (montantAvoirApplique > 0) {
      let restantAUtiliser = montantAvoirApplique;
      const pAvoirs = avoirs
        .filter(a => a.patientId === selectedPatientId && a.status === 'AVAILABLE')
        .sort((a, b) => new Date(a.dateCreation).getTime() - new Date(b.dateCreation).getTime());

      for (const av of pAvoirs) {
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

    // 3. New Avoir (surplus)
    if (avanceGeneree > 0 && parametres.avoirPatientAutorise) {
      const newAvoir: AvoirPatient = {
        id: `AV-${Date.now()}`,
        patientId: selectedPatientId,
        montant: avanceGeneree,
        dateCreation: new Date().toISOString(),
        transactionSourceId: transactionId,
        status: 'AVAILABLE'
      };
      const avRef = doc(db, 'avoirs_patient', newAvoir.id);
      batch.set(avRef, sanitizeData(newAvoir));
    }

    // 4. Settled Dettes or New Dette
    if (includeExistingDebt) {
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
        patientId: selectedPatientId,
        patientName: resolvedPatientName,
        montantInitial: resteAPayer,
        montantRestant: resteAPayer,
        dateCreation: new Date().toISOString(),
        transactionSourceId: transactionId,
        status: 'PENDING'
      };
      const detteRef = doc(db, 'dettes_patient', newDette.id);
      batch.set(detteRef, sanitizeData(newDette));
    }

    // 5. PaymentRequests - only process unpaid items/requests
    const unpaidLignes = lignes.filter(l => !l.isPaid);
    const prIds = [...new Set(unpaidLignes.flatMap(l => l.paymentRequestIds || [l.paymentRequestId]).filter(Boolean))] as string[];
    for (const pr of prIds) {
      const prData = paymentRequests.find(p => p.id === pr);
      if (prData) {
        const prRef = doc(db, 'payment_requests', pr);
        batch.update(prRef, {
          status: 'PAID',
          amountPaid: prData.totalAmount,
          updatedAt: new Date().toISOString()
        });
      }
    }

    // 6. Discharge clearance update if applicable
    try {
      const dischargeSnap = await getDocs(query(collection(db, 'discharges_waiting'), where('id', '==', selectedPatientId)));
      if (!dischargeSnap.empty) {
        const dischargeRef = doc(db, 'discharges_waiting', selectedPatientId);
        batch.update(dischargeRef, {
          financialClearance: true,
          financialClearedAt: new Date().toISOString(),
          clearedBy: user.name
        });
      }
    } catch (err) {
      console.warn("Could not check discharge clearance:", err);
    }

    // 7. Update active service_queues to SOLDE so consultation firewall unlocks instantly
    try {
      const currentPatientRequests = paymentRequests.filter(pr => pr.patientId === selectedPatientId || (pr as any).dmeId === selectedPatientId);
      const targetPatientIds = [
        selectedPatientId,
        ...currentPatientRequests.map(pr => pr.patientId),
        ...currentPatientRequests.map(pr => (pr as any).dmeId)
      ].filter(Boolean);
      const uniqueTargetIds = [...new Set(targetPatientIds)];

      for (const pid of uniqueTargetIds) {
        const qSq = query(collection(db, 'service_queues'), where('patientId', '==', pid));
        const sqSnaps = await getDocs(qSq);
        for (const sqDoc of sqSnaps.docs) {
          const sqRef = doc(db, 'service_queues', sqDoc.id);
          batch.update(sqRef, { paymentStatus: 'SOLDE', ticketStatut: 'PAYE', updatedAt: new Date().toISOString() });
        }

        const qSqDme = query(collection(db, 'service_queues'), where('dmeId', '==', pid));
        const sqDmeSnaps = await getDocs(qSqDme);
        for (const sqDoc of sqDmeSnaps.docs) {
          const sqRef = doc(db, 'service_queues', sqDoc.id);
          batch.update(sqRef, { paymentStatus: 'SOLDE', ticketStatut: 'PAYE', updatedAt: new Date().toISOString() });
        }
      }
    } catch (sqErr) {
      console.warn("Could not batch update service_queues:", sqErr);
    }

    // Commit all writes atomically!
    await batch.commit();

    // Reset UI
    setLignes([]);
    setMontantRemis('');
    setLastTransaction(nouvelleTransaction);
    setShowReceipt(true);
    window.dispatchEvent(new CustomEvent('app-notification', { 
      detail: { message: 'Facturation validée avec succès !', type: 'success' }
    }));
    } catch (e) {
       console.error("Facturation error", e);
       window.dispatchEvent(new CustomEvent('app-notification', { 
         detail: { message: "Échec de la transaction : l'opération a été annulée et aucun paiement n'a été enregistré.", type: 'error' }
       }));
    } finally {
       setIsProcessing(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 p-6 flex-1 overflow-hidden">
        
        {/* Colonne Gauche: Lignes de facturation */}
        <div className="lg:col-span-2 flex flex-col gap-6 overflow-hidden">
          
          {/* Zone 1: Identification Patient */}
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 shrink-0">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center">
                <User size={24} />
              </div>
              <div className="flex-1">
                <h2 className="text-lg font-black text-slate-900">Identification Patient</h2>
                <p className="text-sm text-slate-500">Sélectionnez un patient pour consolider ses factures</p>
              </div>
              <div className="w-1/2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input 
                    type="text" 
                    placeholder="Rechercher un patient (Nom ou ID)..." 
                    value={patientSearchQuery}
                    onChange={(e) => {
                      setPatientSearchQuery(e.target.value);
                      setShowPatientResults(true);
                      if (!e.target.value) {
                         setSelectedPatientId('');
                         setLignes([]);
                      }
                    }}
                    onFocus={() => setShowPatientResults(true)}
                    className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold transition-all text-sm"
                  />
                  {selectedPatientId && !showPatientResults && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 bg-emerald-100 text-emerald-700 px-2 py-1 rounded text-xs font-bold flex items-center gap-1">
                      <CheckCircle size={12} /> {selectedPatientId}
                    </div>
                  )}
                  {showPatientResults && filteredPatients.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-xl border border-slate-200 max-h-60 overflow-y-auto z-50">
                      {filteredPatients.map(p => (
                        <div 
                          key={p.id}
                          className="px-4 py-3 hover:bg-slate-50 cursor-pointer border-b border-slate-100 last:border-0 flex justify-between items-center"
                          onClick={() => {
                            setSelectedPatientId(p.id);
                            setPatientSearchQuery(p.name);
                            setShowPatientResults(false);
                          }}
                        >
                          <span className="font-bold text-slate-900">{p.name}</span>
                          <span className="text-xs font-mono text-slate-400">{p.id}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {showPatientResults && patientSearchQuery && filteredPatients.length === 0 && (
                    <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-xl border border-slate-200 p-4 text-center z-50 text-sm text-slate-500">
                      Aucun patient trouvé.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Zone 2: Lignes de facturation */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col flex-1 overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h3 className="font-bold text-slate-900 flex items-center gap-2">
                <FileText size={18} className="text-blue-600" />
                Lignes de facturation
              </h3>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
              {lignes.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-400 p-6">
                  <ShoppingCart size={48} className="mb-4 opacity-20" />
                  <p className="mb-6 font-bold">Aucune ligne de facturation en cours</p>
                  
                  {/* Recent Factures */}
                  <div className="w-full max-w-lg bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                    <div className="p-3 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
                       <h4 className="text-xs font-black uppercase tracking-widest text-slate-500">Factures Récentes</h4>
                       <span className="bg-blue-100 text-blue-700 text-[10px] px-2 py-0.5 rounded-full font-bold">{transactions.length}</span>
                    </div>
                    <div className="max-h-48 overflow-y-auto">
                      {transactions.slice().sort((a,b) => new Date(b.createdAt || b.date).getTime() - new Date(a.createdAt || a.date).getTime()).slice(0, 5).map(tx => (
                        <div key={tx.id} className="p-3 border-b border-slate-50 last:border-0 hover:bg-slate-50 flex justify-between items-center cursor-pointer transition-colors" onClick={() => {
                           setLastTransaction(tx);
                           setShowReceipt(true);
                        }}>
                          <div>
                            <p className="text-sm font-bold text-slate-900">{tx.patientId || 'Client'}</p>
                            <p className="text-[10px] text-slate-500 font-mono">{(tx.createdAt || tx.date) ? formatDateTime(tx.createdAt || tx.date) : 'N/A'}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-black text-emerald-600">{(tx.montantTotal || 0).toLocaleString()} CFA</p>
                            <span className="text-[9px] uppercase font-bold text-slate-400 border border-slate-200 px-1.5 py-0.5 rounded">{tx.modePaiement}</span>
                          </div>
                        </div>
                      ))}
                      {transactions.length === 0 && (
                        <p className="text-xs text-center text-slate-400 py-4">Aucune facture récente</p>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-widest text-slate-400 border-b border-slate-100">
                      <th className="pb-3 font-black">Date & Heure</th>
                      <th className="pb-3 font-black">Libellé</th>
                      <th className="pb-3 font-black">Source</th>
                      <th className="pb-3 font-black text-right">Qte</th>
                      <th className="pb-3 font-black text-right">P.U</th>
                      <th className="pb-3 font-black text-right">Total</th>
                      <th className="pb-3 font-black text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {lignes.map(ligne => (
                      <tr 
                        key={ligne.id} 
                        className={ligne.isPaid ? "bg-slate-50/80 hover:bg-slate-100/60 transition-colors border-l-2 border-emerald-400" : "hover:bg-slate-50/70 transition-colors"}
                      >
                        <td className="py-3 px-2 text-xs font-mono text-slate-500 whitespace-nowrap">
                          {formatDateTime(ligne.date || ligne.createdAt)}
                        </td>
                        <td className="py-3 px-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`text-sm ${ligne.isPaid ? 'font-semibold text-slate-600' : 'font-bold text-slate-900'}`}>
                              {ligne.libelle}
                            </span>
                            {ligne.isPaid && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-200">
                                <CheckCircle size={10} className="text-emerald-600" /> Déjà Payé
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 text-xs text-slate-500">
                          <span className={`px-2 py-1 rounded-md font-medium ${ligne.isPaid ? 'bg-slate-200/70 text-slate-600' : 'bg-blue-50 text-blue-700 font-semibold'}`}>
                            {ligne.source}
                          </span>
                        </td>
                        <td className={`py-3 text-sm text-right ${ligne.isPaid ? 'text-slate-500 font-medium' : 'text-slate-800 font-bold'}`}>
                          {ligne.quantite}
                        </td>
                        <td className={`py-3 text-sm text-right ${ligne.isPaid ? 'text-slate-400 line-through' : 'text-slate-600 font-medium'}`}>
                          {(ligne.prixUnitaire || 0).toLocaleString()} F
                        </td>
                        <td className="py-3 text-right">
                          {ligne.isPaid ? (
                            <div>
                              <span className="font-black text-emerald-700 text-sm">0 CFA</span>
                              <span className="block text-[9px] text-slate-400 font-mono italic">
                                Réglé ({(ligne.originalPrice || (ligne.prixUnitaire * ligne.quantite) || 0).toLocaleString()} F)
                              </span>
                            </div>
                          ) : (
                            <span className="py-3 font-black text-blue-600 text-sm">
                              {(ligne.montantTotal || 0).toLocaleString()} CFA
                            </span>
                          )}
                        </td>
                        <td className="py-3 text-center">
                          {ligne.isPaid ? (
                            <div className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded-md cursor-default" title="Prestation déjà réglée au préalable">
                              <CheckCircle size={12} className="text-emerald-500" /> Réglé
                            </div>
                          ) : (
                            <button 
                              onClick={() => handleRemoveLigne(ligne.id)} 
                              className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                              title="Retirer cette ligne"
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Ajout direct */}
            <div className="p-4 border-t border-slate-100 bg-slate-50">
              <div className="flex gap-2">
                <input 
                  type="text" 
                  placeholder="Libellé (Achat direct)" 
                  value={newItemLibelle}
                  onChange={e => setNewItemLibelle(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-lg border border-slate-200 text-sm"
                />
                <input 
                  type="number" 
                  placeholder="Prix U." 
                  value={newItemPrix}
                  onChange={e => setNewItemPrix(e.target.value)}
                  className="w-24 px-3 py-2 rounded-lg border border-slate-200 text-sm"
                />
                <input 
                  type="number" 
                  placeholder="Qte" 
                  value={newItemQte}
                  onChange={e => setNewItemQte(e.target.value)}
                  className="w-16 px-3 py-2 rounded-lg border border-slate-200 text-sm"
                />
                <button 
                  onClick={handleAddDirectItem}
                  className="px-4 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-700 transition-colors flex items-center gap-2 text-sm font-bold"
                >
                  <Plus size={16} /> Ajouter
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Colonne Droite: Historique & Encaissement */}
        <div className="flex flex-col gap-6 overflow-hidden">
          
          {/* Zone 3: Historique Financier */}
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 shrink-0">
            <h3 className="font-bold text-slate-900 flex items-center gap-2 mb-4">
              <CreditCard size={18} className="text-emerald-600" />
              Historique Financier
            </h3>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-100 flex flex-col justify-between">
                <div>
                  <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-1">Avoir Disponible</p>
                  <p className="text-2xl font-black text-emerald-700">{(totalAvoirDispo || 0).toLocaleString()} <span className="text-xs">FCFA</span></p>
                </div>
                {patientAvoirs.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-emerald-100 space-y-1">
                    {patientAvoirs.slice(0, 2).map((a, idx) => (
                      <div key={`${a.id}-${idx}`} className="flex justify-between text-[9px] font-bold text-emerald-500">
                        <span>{a.id}</span>
                        <span>{a.montant.toLocaleString()}</span>
                      </div>
                    ))}
                    {patientAvoirs.length > 2 && <p className="text-[8px] text-emerald-400">+{patientAvoirs.length - 2} autres</p>}
                  </div>
                )}
              </div>
              <div className="p-4 bg-rose-50 rounded-xl border border-rose-100 flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-start mb-1">
                    <p className="text-[10px] font-black text-rose-600 uppercase tracking-widest">Dette en cours</p>
                    {totalDetteEnCours > 0 && (
                      <div className="flex items-center gap-1">
                        <input 
                          type="checkbox" 
                          id="include-debt"
                          checked={includeExistingDebt}
                          onChange={(e) => setIncludeExistingDebt(e.target.checked)}
                          className="w-3 h-3 rounded border-rose-300 text-rose-600 focus:ring-rose-500"
                        />
                        <label htmlFor="include-debt" className="text-[9px] font-bold text-rose-600 cursor-pointer">Inclure</label>
                      </div>
                    )}
                  </div>
                  <p className="text-2xl font-black text-rose-700">{(totalDetteEnCours || 0).toLocaleString()} <span className="text-xs">FCFA</span></p>
                </div>
                {patientDettes.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-rose-100 space-y-1">
                    {patientDettes.slice(0, 2).map((d, idx) => (
                      <div key={`${d.id}-${idx}`} className="flex justify-between text-[9px] font-bold text-rose-500">
                        <span>{d.id}</span>
                        <span>{d.montantRestant.toLocaleString()}</span>
                      </div>
                    ))}
                    {patientDettes.length > 2 && <p className="text-[8px] text-rose-400">+{patientDettes.length - 2} autres</p>}
                  </div>
                )}
              </div>
            </div>
            
            {totalDetteEnCours > parametres.seuilDetteMax && (
              <div className="mt-4 p-3 bg-rose-100 text-rose-700 rounded-lg text-xs font-bold flex items-start gap-2">
                <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                <p>Attention: Le seuil de dette autorisé ({parametres.seuilDetteMax} FCFA) est dépassé.</p>
              </div>
            )}
          </div>

          {/* Zone 4: Encaissement */}
          <div className="bg-slate-900 rounded-2xl p-6 shadow-xl text-white flex flex-col flex-1">
            <h3 className="font-bold flex items-center gap-2 mb-6 text-slate-300">
              <DollarSign size={18} />
              Encaissement & Validation
            </h3>

            <div className="space-y-3 mb-6 flex-1 overflow-y-auto custom-scrollbar pr-1">
              <div className="flex justify-between items-center text-xs text-slate-400">
                <span>Sous-total Prestations</span>
                <span className="font-bold">{(sousTotalPrestations || 0).toLocaleString()} FCFA</span>
              </div>
              
              {includeExistingDebt && (
                <div className="flex justify-between items-center text-xs text-rose-400">
                  <span>Dette Précédente Incluse</span>
                  <span className="font-bold">+{(totalDetteEnCours || 0).toLocaleString()} FCFA</span>
                </div>
              )}

              <div className="flex justify-between items-center pb-3 border-b border-slate-800 text-sm">
                <span className="text-slate-300 font-bold">Total Brut</span>
                <span className="font-black text-slate-100">{(totalFactureGlobal || 0).toLocaleString()} FCFA</span>
              </div>
              
              {totalAvoirDispo > 0 && (
                <div className="flex justify-between items-center py-2 text-xs">
                  <div className="flex items-center gap-2">
                    <input 
                      type="checkbox" 
                      id="use-avoir-box"
                      checked={useAvoir} 
                      onChange={(e) => setUseAvoir(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-700 bg-slate-800 text-emerald-500 focus:ring-emerald-500"
                    />
                    <label htmlFor="use-avoir-box" className="text-emerald-400 cursor-pointer">Utiliser l'avoir disponible</label>
                  </div>
                  <span className="font-bold text-emerald-400">-{(montantAvoirApplique || 0).toLocaleString()} FCFA</span>
                </div>
              )}

              <div className="flex justify-between items-center py-4 border-y border-slate-800/50">
                <span className="text-lg font-black text-white">Net à payer</span>
                <span className="text-2xl font-black text-blue-400">{(netAPayer || 0).toLocaleString()} FCFA</span>
              </div>

              <div className="space-y-2 pt-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Montant remis par le patient</label>
                <div className="relative">
                  <input 
                    type="number" 
                    value={montantRemis}
                    onChange={(e) => setMontantRemis(e.target.value)}
                    className="w-full pl-4 pr-16 py-3 rounded-xl bg-slate-800 border border-slate-700 text-white font-black text-xl focus:border-blue-500 outline-none"
                    placeholder="0"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 font-black text-slate-500">FCFA</span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 pt-2">
                {['CASH', 'MOBILE_MONEY', 'CARD'].map((mode) => (
                  <button 
                    key={mode}
                    onClick={() => setModePaiement(mode as any)}
                    className={`py-2 rounded-lg text-[10px] font-black border transition-all ${modePaiement === mode ? 'bg-blue-600 border-blue-600 text-white' : 'bg-slate-800 border-slate-700 text-slate-500 hover:bg-slate-700'}`}
                  >
                    {mode === 'CASH' ? 'Espèces' : mode === 'CARD' ? 'Carte' : 'Mobile'}
                  </button>
                ))}
              </div>

              {surplus > 0 && (
                <div className="mt-4 p-4 bg-emerald-950/40 border border-emerald-800/50 rounded-xl space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-emerald-400 font-bold uppercase tracking-wider">Surplus constaté</span>
                    <span className="font-black text-emerald-400">{(surplus || 0).toLocaleString()} FCFA</span>
                  </div>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => setSurplusAction('RENDRE')}
                      className={`flex-1 py-2 rounded-lg text-[10px] font-bold border transition-all ${surplusAction === 'RENDRE' ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-slate-800 border-slate-700 text-slate-500'}`}
                    >
                      Rendre Monnaie
                    </button>
                    <button 
                      onClick={() => setSurplusAction('AVANCE')}
                      className={`flex-1 py-2 rounded-lg text-[10px] font-bold border transition-all ${surplusAction === 'AVANCE' ? 'bg-blue-600 border-blue-600 text-white' : 'bg-slate-800 border-slate-700 text-slate-500'}`}
                    >
                      Mettre en Avance
                    </button>
                  </div>
                </div>
              )}

              {resteAPayer > 0 && remis > 0 && (
                <div className="p-3 bg-rose-900/30 border border-rose-800/50 rounded-lg flex justify-between items-center">
                  <span className="text-xs text-rose-400 font-medium">Reste à payer (Nouvelle Dette)</span>
                  <span className="font-bold text-rose-400">{(resteAPayer || 0).toLocaleString()} FCFA</span>
                </div>
              )}

              {isCreditBlocked && resteAPayer > 0 && (
                <div className="p-3 bg-rose-950/90 border border-rose-500 rounded-xl flex items-center gap-2.5 text-rose-200 text-xs font-bold animate-in fade-in">
                  <Lock size={16} className="text-rose-400 shrink-0" />
                  <span>🔒 Crédit Bloqué (Comptabilité) : Ce patient n'est pas autorisé à différer son paiement. Le montant net doit être encaissé en totalité.</span>
                </div>
              )}
            </div>

            {!activeSession && (
              <div className="p-3 bg-amber-950/80 border border-amber-600/50 rounded-xl flex items-center gap-2 text-amber-200 text-xs font-bold mb-2">
                <AlertCircle size={16} className="text-amber-400 shrink-0" />
                <span>⚠️ Session de caisse fermée : Ouvrez une session de caisse pour pouvoir enregistrer un paiement.</span>
              </div>
            )}

            <button 
              onClick={handleValidate}
              disabled={!canValidate || isProcessing || !activeSession}
              className="w-full py-4 bg-blue-600 text-white rounded-xl font-black uppercase tracking-widest hover:bg-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isProcessing ? "Traitement..." : !activeSession ? "Session Fermée (Caisse Requise)" : <><CheckCircle size={20} /> Valider & Imprimer</>}
            </button>
          </div>
        </div>
      </div>

      {/* Modal Reçu */}
      {showReceipt && lastTransaction && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="ticket-print-wrapper bg-white rounded-2xl shadow-xl w-full max-w-md flex flex-col max-h-[90vh] overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center no-print">
              <h3 className="font-bold text-slate-900 flex items-center gap-2">
                <Printer size={18} className="text-blue-600" />
                Aperçu du reçu
              </h3>
              <button onClick={() => setShowReceipt(false)} className="p-2 text-slate-400 hover:bg-slate-100 rounded-lg cursor-pointer">
                <X size={18} />
              </button>
            </div>
            
            <div className="ticket-scroll-area p-4 sm:p-6 overflow-y-auto custom-scrollbar bg-slate-50" id="receipt-content">
              <div className="bg-white p-6 shadow-sm border border-slate-200" style={{ width: '80mm', maxWidth: '100%', margin: '0 auto', fontFamily: 'monospace' }}>
                <div className="text-center mb-4">
                  <h2 className="font-bold text-lg uppercase tracking-wide">{establishment?.name || parametres.impression.nomStructure || 'SmartHosto SIH'}</h2>
                  <p className="text-xs">{establishment?.address || parametres.impression.adresse}</p>
                  <p className="text-xs">Tél: {establishment?.phone || parametres.impression.telephone} {establishment?.email ? `• ${establishment.email}` : ''}</p>
                  {establishment?.taxId && <p className="text-[10px] text-slate-500 mt-0.5">{establishment.taxId}</p>}
                  {establishment?.slogan && <p className="text-xs italic mt-1 font-sans text-slate-600">{establishment.slogan}</p>}
                </div>
                
                <div className="border-t border-b border-dashed border-slate-300 py-2 mb-4 text-xs space-y-0.5">
                  <p className="flex justify-between"><span>Reçu N° :</span> <span className="font-bold">{lastTransaction.id}</span></p>
                  <p className="flex justify-between"><span>Date & Heure :</span> <span>{formatDateTime(lastTransaction.date)}</span></p>
                  <p className="flex justify-between"><span>Patient :</span> <span className="font-bold">{lastTransaction.patientName}</span></p>
                  <p className="flex justify-between font-bold border-t border-dotted border-slate-200 pt-1 mt-1">
                    <span>Caissier :</span> 
                    <span className="font-extrabold uppercase">{lastTransaction.caissierName || (lastTransaction as any).cashierName || user?.name || 'Caissier Principal'}</span>
                  </p>
                </div>

                <div className="mb-4">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-200">
                        <th className="text-left pb-1">Désignation</th>
                        <th className="text-right pb-1">Qte</th>
                        <th className="text-right pb-1">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lastTransaction.lignes.map((ligne, idx) => (
                        <tr key={idx}>
                          <td className="py-1">{ligne.libelle}</td>
                          <td className="text-right py-1">{ligne.quantite}</td>
                          <td className="text-right py-1">{(ligne.montantTotal || 0).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="border-t border-slate-300 pt-2 text-xs space-y-1">
                  <div className="flex justify-between">
                    <span>Prestations:</span>
                    <span>{(lastTransaction.sousTotal || 0).toLocaleString()} CFA</span>
                  </div>
                  {lastTransaction.detteIncluse > 0 && (
                    <div className="flex justify-between text-rose-600">
                      <span>Dettes précédentes:</span>
                      <span>+{(lastTransaction.detteIncluse || 0).toLocaleString()} CFA</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold border-t border-slate-100 pt-1">
                    <span>Total Facturé:</span>
                    <span>{(lastTransaction.totalFacture || 0).toLocaleString()} CFA</span>
                  </div>
                  {lastTransaction.avoirUtilise > 0 && (
                    <div className="flex justify-between text-emerald-600">
                      <span>Avoir utilisé:</span>
                      <span>-{(lastTransaction.avoirUtilise || 0).toLocaleString()} CFA</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold text-sm mt-1 border-t border-slate-200 pt-1">
                    <span>Net à payer:</span>
                    <span>{(lastTransaction.totalGeneral || 0).toLocaleString()} CFA</span>
                  </div>
                  <div className="flex justify-between mt-2">
                    <span>Montant remis:</span>
                    <span>{(lastTransaction.montantPaye || 0).toLocaleString()} CFA</span>
                  </div>
                  {lastTransaction.monnaieRendue > 0 && (
                    <div className="flex justify-between">
                      <span>Monnaie rendue:</span>
                      <span>{(lastTransaction.monnaieRendue || 0).toLocaleString()} CFA</span>
                    </div>
                  )}
                  {lastTransaction.surplusConserve > 0 && (
                    <div className="flex justify-between text-blue-600">
                      <span>Mise en avance:</span>
                      <span>{(lastTransaction.surplusConserve || 0).toLocaleString()} CFA</span>
                    </div>
                  )}
                  {lastTransaction.detteCreee > 0 && (
                    <div className="flex justify-between text-rose-600">
                      <span>Nouvelle Dette:</span>
                      <span>{(lastTransaction.detteCreee || 0).toLocaleString()} CFA</span>
                    </div>
                  )}
                  <div className="flex justify-between mt-1 text-[10px] text-slate-500">
                    <span>Mode:</span>
                    <span>{lastTransaction.modePaiement}</span>
                  </div>
                </div>

                <div className="mt-6 text-center text-[10px] text-slate-500 border-t border-dashed border-slate-300 pt-3 space-y-1">
                  <p className="font-bold text-slate-800 uppercase tracking-wider">
                    Caissier : {lastTransaction.caissierName || (lastTransaction as any).cashierName || user?.name || 'Caissier Principal'}
                  </p>
                  <p>{parametres.impression.piedDePage || establishment?.invoiceFooter || 'Merci pour votre confiance.'}</p>
                </div>
              </div>
            </div>

            <div className="ticket-actions-bar no-print p-4 border-t border-slate-100 flex gap-2 bg-white">
              <button 
                onClick={() => setShowReceipt(false)}
                className="flex-1 py-2.5 bg-slate-100 text-slate-700 rounded-xl font-bold hover:bg-slate-200 transition-colors cursor-pointer"
              >
                Fermer
              </button>
              <button 
                onClick={() => {
                  window.print();
                }}
                className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-500 transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-blue-600/20"
              >
                <Printer size={18} /> Imprimer Reçu
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
