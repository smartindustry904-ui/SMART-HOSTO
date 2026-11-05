import React, { useState, useMemo } from 'react';
import { 
  Users, 
  AlertCircle, 
  Search, 
  Filter, 
  Lock, 
  Unlock, 
  DollarSign, 
  Wallet, 
  TrendingDown, 
  CheckCircle, 
  Eye, 
  FileText, 
  X,
  CreditCard,
  UserCheck,
  ShieldCheck,
  Loader2,
  Receipt,
  Building,
  Phone,
  Calendar,
  Layers,
  Clock,
  ArrowRight
} from 'lucide-react';
import { Patient, DettePatient, AvoirPatient, PaymentRequest } from '../../types';
import { doc, updateDoc, setDoc } from 'firebase/firestore';
import { db } from '../../src/firebase';
import { formatPatientFullName, getPatientInitials } from '../../src/patientUtils';

interface AccountingComptesClientsTabProps {
  patients: Patient[];
  dettes: DettePatient[];
  avoirs: AvoirPatient[];
  paymentRequests?: PaymentRequest[];
  currency?: string;
  onSettleDebt?: (dette: DettePatient, amount: number, paymentMethod: string) => Promise<void>;
}

export const AccountingComptesClientsTab: React.FC<AccountingComptesClientsTabProps> = ({
  patients,
  dettes,
  avoirs,
  paymentRequests = [],
  currency = 'FCFA',
  onSettleDebt
}) => {
  // Navigation sub-view: Client accounts overview vs Invoices registry
  const [subView, setSubView] = useState<'COMPTES' | 'FACTURES'>('COMPTES');

  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'ALL' | 'DEBTORS' | 'AVOIRS' | 'BLOCKED'>('ALL');
  const [invoiceStatusFilter, setInvoiceStatusFilter] = useState<'ALL' | 'PENDING' | 'PAID' | 'PARTIAL'>('ALL');
  
  const [selectedPatientForDetails, setSelectedPatientForDetails] = useState<Patient | null>(null);
  const [selectedDetteToSettle, setSelectedDetteToSettle] = useState<DettePatient | null>(null);
  const [settlementAmount, setSettlementAmount] = useState<string>('');
  const [settlementMethod, setSettlementMethod] = useState<string>('CASH');
  const [isSubmittingSettlement, setIsSubmittingSettlement] = useState(false);
  const [togglingPatientId, setTogglingPatientId] = useState<string | null>(null);

  // Fast map to join patientId with patient entity (resolves by id, patientId string, or ipd)
  const patientsMap = useMemo(() => {
    const map = new Map<string, Patient>();
    patients.forEach(p => {
      if (p.id) map.set(p.id, p);
      if ((p as any).patientId) map.set((p as any).patientId, p);
      if ((p as any).ipd) map.set((p as any).ipd, p);
    });
    return map;
  }, [patients]);

  // 1. Group dettes and avoirs by patientId
  const patientFinancials = useMemo(() => {
    const debtMap = new Map<string, { totalDebt: number; count: number; lines: DettePatient[] }>();
    const avoirMap = new Map<string, { totalAvoir: number; count: number; lines: AvoirPatient[] }>();
    const syntheticPatientsMap = new Map<string, Patient>();

    dettes.forEach(d => {
      if (d.status === 'PENDING' || d.status === 'PARTIAL') {
        const resolvedPatient = patientsMap.get(d.patientId);
        const canonicalId = resolvedPatient?.id || d.patientId;

        const current = debtMap.get(canonicalId) || { totalDebt: 0, count: 0, lines: [] };
        current.totalDebt += Number(d.montantRestant || 0);
        current.count += 1;
        current.lines.push(d);
        debtMap.set(canonicalId, current);

        // If debt has a patientId not found in the patients collection, generate a fallback entry so it is visible!
        if (!resolvedPatient && !syntheticPatientsMap.has(canonicalId)) {
          const fallbackName = d.patientName || `Patient ${canonicalId.slice(0, 10)}`;
          syntheticPatientsMap.set(canonicalId, {
            id: canonicalId,
            firstName: fallbackName,
            lastName: '',
            birthDate: '',
            gender: 'M',
            phone: '',
            residence: '',
            emergencyContact: '',
            emergencyPhone: '',
            maritalStatus: 'CELIBATAIRE',
            creditBlocked: false,
            allowCredit: true
          } as Patient);
        }
      }
    });

    avoirs.forEach(a => {
      if (a.status === 'AVAILABLE') {
        const resolvedPatient = patientsMap.get(a.patientId);
        const canonicalId = resolvedPatient?.id || a.patientId;

        const current = avoirMap.get(canonicalId) || { totalAvoir: 0, count: 0, lines: [] };
        current.totalAvoir += Number(a.montant || 0);
        current.count += 1;
        current.lines.push(a);
        avoirMap.set(canonicalId, current);

        if (!resolvedPatient && !syntheticPatientsMap.has(canonicalId)) {
          const fallbackName = (a as any).patientName || `Patient ${canonicalId.slice(0, 10)}`;
          syntheticPatientsMap.set(canonicalId, {
            id: canonicalId,
            firstName: fallbackName,
            lastName: '',
            birthDate: '',
            gender: 'M',
            phone: '',
            residence: '',
            emergencyContact: '',
            emergencyPhone: '',
            maritalStatus: 'CELIBATAIRE',
            creditBlocked: false,
            allowCredit: true
          } as Patient);
        }
      }
    });

    // Combine primary patients with any extra client accounts from debts/advances
    const allKnownPatients = [...patients];
    syntheticPatientsMap.forEach((synthPatient, key) => {
      if (!allKnownPatients.some(p => p.id === key || (p as any).patientId === key)) {
        allKnownPatients.push(synthPatient);
      }
    });

    // Build consolidated patient cards for those with debt, avoir, or blocked credit, or all patients if searched
    const relevantPatients = allKnownPatients.filter(p => {
      const hasDebt = (debtMap.get(p.id)?.totalDebt || 0) > 0;
      const hasAvoir = (avoirMap.get(p.id)?.totalAvoir || 0) > 0;
      const isBlocked = p.creditBlocked === true || p.allowCredit === false;

      // Always include if debtor, has advance, or credit is blocked
      if (hasDebt || hasAvoir || isBlocked) return true;
      // Also include if user is actively searching
      if (searchQuery.trim().length > 1) {
        const q = searchQuery.toLowerCase();
        const clientFullName = formatPatientFullName(p).toLowerCase();
        const matchesName = clientFullName.includes(q);
        const matchesIpd = (p.id || (p as any).ipd || (p as any).patientId || '').toLowerCase().includes(q);
        const matchesPhone = (p.phone || '').includes(q);
        const matchesCorp = ((p as any).corporateClient || (p as any).company || '').toLowerCase().includes(q);
        return matchesName || matchesIpd || matchesPhone || matchesCorp;
      }
      return false;
    });

    return {
      debtMap,
      avoirMap,
      relevantPatients
    };
  }, [patients, dettes, avoirs, searchQuery, patientsMap]);

  // 2. Filter relevant patients
  const filteredPatients = useMemo(() => {
    return patientFinancials.relevantPatients.filter(p => {
      const debt = patientFinancials.debtMap.get(p.id)?.totalDebt || 0;
      const avoir = patientFinancials.avoirMap.get(p.id)?.totalAvoir || 0;
      const isBlocked = p.creditBlocked === true || p.allowCredit === false;

      if (filterType === 'DEBTORS' && debt <= 0) return false;
      if (filterType === 'AVOIRS' && avoir <= 0) return false;
      if (filterType === 'BLOCKED' && !isBlocked) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const clientFullName = formatPatientFullName(p).toLowerCase();
        const matchesName = clientFullName.includes(q);
        const matchesIpd = (p.id || (p as any).ipd || (p as any).patientId || '').toLowerCase().includes(q);
        const matchesPhone = (p.phone || '').includes(q);
        const matchesCorp = ((p as any).corporateClient || (p as any).company || '').toLowerCase().includes(q);
        return matchesName || matchesIpd || matchesPhone || matchesCorp;
      }

      return true;
    });
  }, [patientFinancials, filterType, searchQuery]);

  // 3. Consolidated Invoices List with Full Client Name Populated (Joined from Patients Directory)
  const populatedInvoices = useMemo(() => {
    return paymentRequests.map(inv => {
      const resolvedPatient = patientsMap.get(inv.patientId);
      const clientName = formatPatientFullName(resolvedPatient, inv.patientName || 'Client Comptoir');
      const clientPhone = resolvedPatient?.phone;
      const clientCompany = (resolvedPatient as any)?.corporateClient || (resolvedPatient as any)?.company;

      const totalAmount = Number(inv.totalAmount || 0);
      const amountPaid = Number(inv.amountPaid || 0);
      const balanceDue = Math.max(0, totalAmount - amountPaid);

      return {
        ...inv,
        resolvedClientName: clientName,
        clientPhone,
        clientCompany,
        balanceDue
      };
    });
  }, [paymentRequests, patientsMap]);

  // Filtered invoices by status and search
  const filteredInvoices = useMemo(() => {
    return populatedInvoices.filter(inv => {
      if (invoiceStatusFilter === 'PENDING' && inv.status !== 'PENDING' && inv.balanceDue <= 0) return false;
      if (invoiceStatusFilter === 'PAID' && inv.status !== 'PAID') return false;
      if (invoiceStatusFilter === 'PARTIAL' && inv.status !== 'PARTIAL') return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesClient = inv.resolvedClientName.toLowerCase().includes(q);
        const matchesInvoiceId = (inv.id || '').toLowerCase().includes(q);
        const matchesService = (inv.requestingService || inv.sourceModule || '').toLowerCase().includes(q);
        const matchesPhone = (inv.clientPhone || '').includes(q);
        const matchesCompany = (inv.clientCompany || '').toLowerCase().includes(q);

        return matchesClient || matchesInvoiceId || matchesService || matchesPhone || matchesCompany;
      }

      return true;
    });
  }, [populatedInvoices, invoiceStatusFilter, searchQuery]);

  // Global KPIs calculated from live DB
  const totalDebtOverall = useMemo(() => {
    return dettes
      .filter(d => d.status === 'PENDING' || d.status === 'PARTIAL')
      .reduce((sum, d) => sum + Number(d.montantRestant || 0), 0);
  }, [dettes]);

  const totalAvoirOverall = useMemo(() => {
    return avoirs
      .filter(a => a.status === 'AVAILABLE')
      .reduce((sum, a) => sum + Number(a.montant || 0), 0);
  }, [avoirs]);

  const blockedPatientsCount = useMemo(() => {
    return patients.filter(p => p.creditBlocked === true || p.allowCredit === false).length;
  }, [patients]);

  const totalInvoicedOverall = useMemo(() => {
    return paymentRequests.reduce((sum, inv) => sum + Number(inv.totalAmount || 0), 0);
  }, [paymentRequests]);

  // Toggle credit permission in Firestore
  const handleToggleCredit = async (patient: Patient) => {
    const newBlockedState = !(patient.creditBlocked === true || patient.allowCredit === false);
    setTogglingPatientId(patient.id);

    try {
      const patientRef = doc(db, 'patients', patient.id);
      await setDoc(patientRef, {
        creditBlocked: newBlockedState,
        allowCredit: !newBlockedState,
        creditBlockReason: newBlockedState ? "Blocage administratif par la Comptabilité" : null,
        creditBlockedAt: newBlockedState ? new Date().toISOString() : null,
        creditBlockedBy: "Comptabilité"
      }, { merge: true });
    } catch (err) {
      console.error("Error toggling credit lock:", err);
    } finally {
      setTogglingPatientId(null);
    }
  };

  // Settle debt directly from Comptabilité
  const handleConfirmSettlement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDetteToSettle) return;

    const amount = Number(settlementAmount);
    if (isNaN(amount) || amount <= 0 || amount > selectedDetteToSettle.montantRestant) {
      return;
    }

    setIsSubmittingSettlement(true);
    try {
      if (onSettleDebt) {
        await onSettleDebt(selectedDetteToSettle, amount, settlementMethod);
      } else {
        const remaining = selectedDetteToSettle.montantRestant - amount;
        const isFullyPaid = remaining <= 0;

        const detteRef = doc(db, 'dettes_patient', selectedDetteToSettle.id);
        await updateDoc(detteRef, {
          montantRestant: Math.max(0, remaining),
          montantRegle: (selectedDetteToSettle.montantRegle || 0) + amount,
          status: isFullyPaid ? 'PAID' : 'PARTIAL',
          dateReglement: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      }
      setSelectedDetteToSettle(null);
      setSettlementAmount('');
    } catch (err) {
      console.error("Error settling debt:", err);
    } finally {
      setIsSubmittingSettlement(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      
      {/* Top Header Card */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-700 rounded-full text-xs font-bold border border-emerald-200 mb-2">
            <ShieldCheck size={14} /> Gestion des Créances, Factures & Risque Client
          </div>
          <h2 className="text-xl font-black text-slate-900">Comptes Clients & Factures Émises</h2>
          <p className="text-xs text-slate-500 max-w-2xl">
            Suivi des créances clients, registre certifié des factures de soins, identification nominative et verrouillage préventif du crédit.
          </p>
        </div>

        {/* Live Synchronized KPI Summary */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="bg-rose-50 border border-rose-200/80 p-3 rounded-2xl text-right">
            <span className="text-[10px] font-bold text-rose-600 uppercase tracking-wider block">Total Créances Clients</span>
            <span className="font-mono font-black text-rose-700 text-base">{totalDebtOverall.toLocaleString()} {currency}</span>
          </div>
          <div className="bg-indigo-50 border border-indigo-200/80 p-3 rounded-2xl text-right">
            <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider block">Avances & Avoirs Détenus</span>
            <span className="font-mono font-black text-indigo-700 text-base">{totalAvoirOverall.toLocaleString()} {currency}</span>
          </div>
          <div className="bg-slate-100 border border-slate-200 p-3 rounded-2xl text-right">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Crédits Verrouillés</span>
            <span className="font-mono font-black text-slate-900 text-base">{blockedPatientsCount} client(s)</span>
          </div>
        </div>
      </div>

      {/* Sub-view Navigation Switcher */}
      <div className="flex items-center gap-2 p-1.5 bg-slate-200/70 rounded-2xl w-fit">
        <button
          onClick={() => { setSubView('COMPTES'); setSearchQuery(''); }}
          className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer ${
            subView === 'COMPTES' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Users size={15} />
          <span>Comptes Clients & Soldes ({patientFinancials.relevantPatients.length})</span>
        </button>
        <button
          onClick={() => { setSubView('FACTURES'); setSearchQuery(''); }}
          className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer ${
            subView === 'FACTURES' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Receipt size={15} />
          <span>Registre des Factures Émises ({paymentRequests.length})</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-3xl border border-slate-200/80 shadow-sm flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        
        {subView === 'COMPTES' ? (
          <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-2xl overflow-x-auto">
            <button
              onClick={() => setFilterType('ALL')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                filterType === 'ALL' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Tous les comptes ({patientFinancials.relevantPatients.length})
            </button>
            <button
              onClick={() => setFilterType('DEBTORS')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                filterType === 'DEBTORS' ? 'bg-white text-rose-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Dettes actives ({patientFinancials.relevantPatients.filter(p => (patientFinancials.debtMap.get(p.id)?.totalDebt || 0) > 0).length})
            </button>
            <button
              onClick={() => setFilterType('AVOIRS')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                filterType === 'AVOIRS' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Avances disponibles ({patientFinancials.relevantPatients.filter(p => (patientFinancials.avoirMap.get(p.id)?.totalAvoir || 0) > 0).length})
            </button>
            <button
              onClick={() => setFilterType('BLOCKED')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                filterType === 'BLOCKED' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Crédit bloqué ({blockedPatientsCount})
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-2xl overflow-x-auto">
            <button
              onClick={() => setInvoiceStatusFilter('ALL')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                invoiceStatusFilter === 'ALL' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Toutes les factures ({populatedInvoices.length})
            </button>
            <button
              onClick={() => setInvoiceStatusFilter('PENDING')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                invoiceStatusFilter === 'PENDING' ? 'bg-white text-rose-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Impayées / En attente ({populatedInvoices.filter(i => i.status === 'PENDING' || i.balanceDue > 0).length})
            </button>
            <button
              onClick={() => setInvoiceStatusFilter('PARTIAL')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                invoiceStatusFilter === 'PARTIAL' ? 'bg-white text-amber-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Partielles ({populatedInvoices.filter(i => i.status === 'PARTIAL').length})
            </button>
            <button
              onClick={() => setInvoiceStatusFilter('PAID')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                invoiceStatusFilter === 'PAID' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Payées / Soldées ({populatedInvoices.filter(i => i.status === 'PAID').length})
            </button>
          </div>
        )}

        <div className="relative">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder={subView === 'COMPTES' ? "Rechercher par nom de client, N° dossier ou téléphone..." : "Rechercher par nom de client, N° facture..."}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full sm:w-80 pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-emerald-500 outline-none"
          />
        </div>
      </div>

      {/* VIEW 1: COMPTES CLIENTS TABLE */}
      {subView === 'COMPTES' && (
        <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden">
          {filteredPatients.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100/75 text-slate-600 font-extrabold uppercase text-[10px] tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="p-4">Nom du Client (Patient / Société)</th>
                    <th className="p-4">Contact & Téléphone</th>
                    <th className="p-4 text-right">Dette en cours</th>
                    <th className="p-4 text-right">Avance dispo</th>
                    <th className="p-4 text-right">Solde Net Client</th>
                    <th className="p-4 text-center">Verrou Crédit Caisse</th>
                    <th className="p-4 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                  {filteredPatients.map((patient) => {
                    const debt = patientFinancials.debtMap.get(patient.id)?.totalDebt || 0;
                    const avoir = patientFinancials.avoirMap.get(patient.id)?.totalAvoir || 0;
                    const netBalance = avoir - debt;
                    const isBlocked = patient.creditBlocked === true || patient.allowCredit === false;
                    const isToggling = togglingPatientId === patient.id;
                    const company = (patient as any).corporateClient || (patient as any).company;

                    return (
                      <tr key={patient.id} className="hover:bg-slate-50/80 transition-colors">
                        
                        {/* Prominent Client / Patient Name */}
                        <td className="p-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-2xl bg-emerald-100/70 text-emerald-900 flex items-center justify-center font-black text-sm shrink-0 border border-emerald-200">
                              {getPatientInitials(patient)}
                            </div>
                            <div>
                              <p className="font-extrabold text-slate-900 text-sm leading-tight">
                                {formatPatientFullName(patient)}
                              </p>
                              <div className="flex items-center gap-2 mt-1 flex-wrap">
                                <span className="text-[10px] text-slate-500 font-mono">
                                  Dossier: {(patient as any).patientId || patient.id?.slice(0, 14)}
                                </span>
                                {company && (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200">
                                    <Building size={11} /> {company}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Contact */}
                        <td className="p-4 text-slate-600 whitespace-nowrap">
                          {patient.phone ? (
                            <span className="inline-flex items-center gap-1.5 font-medium">
                              <Phone size={12} className="text-slate-400" />
                              {patient.phone}
                            </span>
                          ) : (
                            <span className="text-slate-400 italic">Non renseigné</span>
                          )}
                        </td>

                        {/* Debt */}
                        <td className="p-4 text-right font-mono font-bold whitespace-nowrap">
                          {debt > 0 ? (
                            <span className="text-rose-600 bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-100 font-black">
                              {debt.toLocaleString()} {currency}
                            </span>
                          ) : (
                            <span className="text-slate-400 font-normal">0 {currency}</span>
                          )}
                        </td>

                        {/* Advance */}
                        <td className="p-4 text-right font-mono font-bold whitespace-nowrap">
                          {avoir > 0 ? (
                            <span className="text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-100 font-black">
                              +{avoir.toLocaleString()} {currency}
                            </span>
                          ) : (
                            <span className="text-slate-400 font-normal">0 {currency}</span>
                          )}
                        </td>

                        {/* Net Balance */}
                        <td className="p-4 text-right font-mono font-black whitespace-nowrap">
                          {netBalance < 0 ? (
                            <span className="text-rose-600 font-black">
                              -{Math.abs(netBalance).toLocaleString()} {currency}
                            </span>
                          ) : netBalance > 0 ? (
                            <span className="text-emerald-600 font-black">
                              +{netBalance.toLocaleString()} {currency}
                            </span>
                          ) : (
                            <span className="text-slate-400 font-normal">0 {currency}</span>
                          )}
                        </td>

                        {/* CREDIT LOCK TOGGLE - DIRECT DB SYNC */}
                        <td className="p-4 text-center whitespace-nowrap">
                          <button
                            onClick={() => handleToggleCredit(patient)}
                            disabled={isToggling}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 transition-all shadow-xs cursor-pointer border ${
                              isBlocked 
                                ? 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100' 
                                : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                            }`}
                            title={isBlocked ? "Crédit verrouillé : ce patient ne peut pas prendre à crédit à la caisse. Cliquer pour débloquer." : "Crédit autorisé. Cliquer pour verrouiller."}
                          >
                            {isToggling ? (
                              <Loader2 size={13} className="animate-spin text-slate-500" />
                            ) : isBlocked ? (
                              <>
                                <Lock size={13} className="text-rose-600" />
                                <span>Bloqué</span>
                              </>
                            ) : (
                              <>
                                <Unlock size={13} className="text-emerald-600" />
                                <span>Autorisé</span>
                              </>
                            )}
                          </button>
                        </td>

                        {/* Actions */}
                        <td className="p-4 text-center whitespace-nowrap">
                          <button
                            onClick={() => setSelectedPatientForDetails(patient)}
                            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                          >
                            <Eye size={13} />
                            <span>Détails & Créances</span>
                          </button>
                        </td>

                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-16 text-center flex flex-col items-center justify-center text-slate-400">
              <Users size={40} className="text-slate-300 mb-3" />
              <p className="text-sm font-bold text-slate-700">Aucun compte client trouvé</p>
              <p className="text-xs text-slate-400 mt-1 max-w-sm">
                Les dossiers patients avec dettes, avances ou restrictions de crédit apparaîtront ici automatiquement.
              </p>
            </div>
          )}
        </div>
      )}

      {/* VIEW 2: REGISTRE DES FACTURES ÉMISES TABLE */}
      {subView === 'FACTURES' && (
        <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden">
          {filteredInvoices.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100/75 text-slate-600 font-extrabold uppercase text-[10px] tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="p-4">Nom du Client (Patient / Société)</th>
                    <th className="p-4">N° Facture / Ticket</th>
                    <th className="p-4">Date d'Émission</th>
                    <th className="p-4">Service Émetteur</th>
                    <th className="p-4 text-right">Total Facturé</th>
                    <th className="p-4 text-right">Montant Encaissé</th>
                    <th className="p-4 text-right">Reste Dû (Créance)</th>
                    <th className="p-4 text-center">Statut Facture</th>
                    <th className="p-4 text-center">Mode de Règlement</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                  {filteredInvoices.map((inv) => {
                    const total = Number(inv.totalAmount || 0);
                    const paid = Number(inv.amountPaid || 0);
                    const rest = inv.balanceDue;
                    const isFullyPaid = inv.status === 'PAID' || rest <= 0;
                    const isPartial = inv.status === 'PARTIAL' || (paid > 0 && rest > 0);

                    return (
                      <tr key={inv.id} className="hover:bg-slate-50/80 transition-colors">
                        
                        {/* Prominent Nom du Client (Patient / Société) */}
                        <td className="p-4">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-blue-100/70 text-blue-900 flex items-center justify-center font-black text-xs shrink-0 border border-blue-200">
                              {inv.resolvedClientName.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="font-extrabold text-slate-900 text-xs">
                                {inv.resolvedClientName}
                              </p>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-[10px] text-slate-400 font-mono">
                                  {inv.patientId ? `Dossier: ${inv.patientId.slice(0, 10)}` : 'Client direct'}
                                </span>
                                {inv.clientCompany && (
                                  <span className="text-[9px] font-bold text-blue-700 bg-blue-50 px-1.5 py-0.2 rounded border border-blue-200">
                                    {inv.clientCompany}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Invoice Number */}
                        <td className="p-4 font-mono font-bold text-slate-800 whitespace-nowrap">
                          <span className="bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200 text-xs">
                            {inv.id}
                          </span>
                        </td>

                        {/* Emission Date */}
                        <td className="p-4 whitespace-nowrap text-slate-600">
                          <span className="font-mono text-slate-800 block text-xs">
                            {inv.createdAt ? new Date(inv.createdAt).toLocaleDateString('fr-FR') : '-'}
                          </span>
                          <span className="text-[10px] text-slate-400 block">
                            {inv.createdAt ? new Date(inv.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : ''}
                          </span>
                        </td>

                        {/* Service / Module */}
                        <td className="p-4 whitespace-nowrap">
                          <span className="px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-700 border border-slate-200">
                            {inv.requestingService || inv.sourceModule || inv.type || 'Caisse'}
                          </span>
                        </td>

                        {/* Total Amount */}
                        <td className="p-4 text-right font-mono font-bold text-slate-900 whitespace-nowrap">
                          {total.toLocaleString()} {currency}
                        </td>

                        {/* Amount Paid */}
                        <td className="p-4 text-right font-mono font-bold text-emerald-600 whitespace-nowrap">
                          {paid.toLocaleString()} {currency}
                        </td>

                        {/* Balance Due (Créance) */}
                        <td className="p-4 text-right font-mono font-black whitespace-nowrap">
                          {rest > 0 ? (
                            <span className="text-rose-600 bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-100">
                              {rest.toLocaleString()} {currency}
                            </span>
                          ) : (
                            <span className="text-slate-400 font-normal">0 {currency}</span>
                          )}
                        </td>

                        {/* Status */}
                        <td className="p-4 text-center whitespace-nowrap">
                          {isFullyPaid ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <CheckCircle size={11} /> Soldée
                            </span>
                          ) : isPartial ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-200">
                              <Clock size={11} /> Partielle
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider bg-rose-50 text-rose-700 border border-rose-200">
                              <AlertCircle size={11} /> Impayée
                            </span>
                          )}
                        </td>

                        {/* Payment Method */}
                        <td className="p-4 text-center whitespace-nowrap">
                          <span className="text-[11px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                            {inv.paymentMethod || 'Espèces / Standard'}
                          </span>
                        </td>

                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-16 text-center flex flex-col items-center justify-center text-slate-400">
              <Receipt size={40} className="text-slate-300 mb-3" />
              <p className="text-sm font-bold text-slate-700">Aucune facture trouvée</p>
              <p className="text-xs text-slate-400 mt-1 max-w-sm">
                Toutes les factures de soins émises en temps réel par les services apparaîtront dans ce registre auditable.
              </p>
            </div>
          )}
        </div>
      )}

      {/* PATIENT DETAILS MODAL (Dettes & Avoirs individuels) */}
      {selectedPatientForDetails && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-xl w-full max-w-xl max-h-[90vh] border border-slate-200 flex flex-col overflow-hidden">
            
            <div className="bg-slate-900 text-white p-5 flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-base font-black flex items-center gap-2">
                  <UserCheck size={18} className="text-emerald-400" />
                  <span>Fiche Financière & Historique : {formatPatientFullName(selectedPatientForDetails)}</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  ID Dossier : {(selectedPatientForDetails as any).patientId || selectedPatientForDetails.id} • {selectedPatientForDetails.phone || 'Sans téléphone'}
                </p>
              </div>
              <button
                onClick={() => setSelectedPatientForDetails(null)}
                className="w-8 h-8 rounded-xl bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-6 space-y-6 overflow-y-auto">
              
              {/* Debt Lines */}
              <div>
                <h4 className="text-xs font-black uppercase tracking-wider text-rose-600 mb-3 flex items-center gap-1.5">
                  <TrendingDown size={15} /> Dettes Actives en Suspens
                </h4>
                {(() => {
                  const pDebts = patientFinancials.debtMap.get(selectedPatientForDetails.id)?.lines || [];
                  return pDebts.length > 0 ? (
                    <div className="space-y-2">
                      {pDebts.map(d => (
                        <div key={d.id} className="p-3 bg-rose-50/50 border border-rose-200/80 rounded-2xl flex justify-between items-center text-xs">
                          <div>
                            <p className="font-extrabold text-slate-900">{formatPatientFullName(selectedPatientForDetails, d.patientName)}</p>
                            <p className="font-bold text-rose-900 mt-0.5">{d.libelle || 'Dette de soins'}</p>
                            <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                              Réf: {d.transactionSourceId || d.id} • Date: {d.dateCreation ? new Date(d.dateCreation).toLocaleDateString('fr-FR') : '-'}
                            </p>
                          </div>
                          <div className="text-right">
                            <span className="font-mono font-black text-rose-700 text-sm block">
                              {Number(d.montantRestant || 0).toLocaleString()} {currency}
                            </span>
                            <button
                              onClick={() => {
                                setSelectedDetteToSettle(d);
                                setSettlementAmount(d.montantRestant.toString());
                              }}
                              className="mt-1.5 px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-[10px] font-bold cursor-pointer transition-colors shadow-xs"
                            >
                              Régler cette dette
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 italic">Aucune dette active pour ce patient.</p>
                  );
                })()}
              </div>

              {/* Advance Lines */}
              <div>
                <h4 className="text-xs font-black uppercase tracking-wider text-indigo-600 mb-3 flex items-center gap-1.5">
                  <Wallet size={15} /> Avances et Avoirs Détenus
                </h4>
                {(() => {
                  const pAvoirs = patientFinancials.avoirMap.get(selectedPatientForDetails.id)?.lines || [];
                  return pAvoirs.length > 0 ? (
                    <div className="space-y-2">
                      {pAvoirs.map(a => (
                        <div key={a.id} className="p-3 bg-indigo-50/50 border border-indigo-200/80 rounded-2xl flex justify-between items-center text-xs">
                          <div>
                            <p className="font-extrabold text-slate-900">{formatPatientFullName(selectedPatientForDetails, (a as any).patientName)}</p>
                            <p className="font-bold text-indigo-900 mt-0.5">{a.motif || 'Avance de paiement'}</p>
                            <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                              Réf: {a.id} • Émis le: {a.dateCreation ? new Date(a.dateCreation).toLocaleDateString('fr-FR') : '-'}
                            </p>
                          </div>
                          <span className="font-mono font-black text-indigo-700 text-sm">
                            +{Number(a.montant || 0).toLocaleString()} {currency}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 italic">Aucune avance disponible.</p>
                  );
                })()}
              </div>

            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end shrink-0">
              <button
                onClick={() => setSelectedPatientForDetails(null)}
                className="px-4 py-2 bg-slate-900 text-white font-bold rounded-xl text-xs hover:bg-slate-800 cursor-pointer"
              >
                Fermer
              </button>
            </div>

          </div>
        </div>
      )}

      {/* SETTLEMENT MODAL */}
      {selectedDetteToSettle && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-[60] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-xl w-full max-w-md border border-slate-200 overflow-hidden">
            <div className="bg-emerald-900 text-white p-5 flex items-center justify-between">
              <div>
                <h3 className="text-base font-black">Règlement de Créance Client</h3>
                <p className="text-xs text-emerald-200 mt-0.5">
                  Dossier : {formatPatientFullName(selectedPatientForDetails) || selectedDetteToSettle.patientId}
                </p>
              </div>
              <button
                onClick={() => setSelectedDetteToSettle(null)}
                className="w-8 h-8 rounded-xl bg-emerald-800 text-emerald-200 hover:text-white flex items-center justify-center cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleConfirmSettlement} className="p-6 space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1">Dette Sélectionnée</label>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                  <p className="font-bold text-slate-800">{selectedDetteToSettle.libelle || 'Dette de soins'}</p>
                  <p className="text-slate-500 font-mono mt-0.5">
                    Solde actuel : <strong className="text-rose-600">{selectedDetteToSettle.montantRestant.toLocaleString()} {currency}</strong>
                  </p>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1">Montant à Encaisser</label>
                <input
                  type="number"
                  max={selectedDetteToSettle.montantRestant}
                  min={1}
                  value={settlementAmount}
                  onChange={(e) => setSettlementAmount(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono font-bold text-slate-900 outline-none focus:bg-white focus:ring-2 focus:ring-emerald-500"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1">Mode d'Encaissement</label>
                <select
                  value={settlementMethod}
                  onChange={(e) => setSettlementMethod(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:bg-white focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="CASH">Espèces</option>
                  <option value="MOBILE">Mobile Money (Wave / Orange Money)</option>
                  <option value="CARD">Carte Bancaire</option>
                  <option value="TRANSFER">Virement Bancaire</option>
                </select>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedDetteToSettle(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingSettlement}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  {isSubmittingSettlement && <Loader2 size={13} className="animate-spin" />}
                  <span>Valider le Règlement</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
