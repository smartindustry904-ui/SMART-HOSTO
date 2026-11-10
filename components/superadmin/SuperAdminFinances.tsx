import React, { useState, useMemo } from 'react';
import { 
  CreditCard, 
  DollarSign, 
  TrendingUp, 
  Building2, 
  Calendar, 
  Download, 
  Filter, 
  Search, 
  CheckCircle2, 
  Clock, 
  AlertTriangle, 
  Plus, 
  Layers, 
  FileSpreadsheet, 
  FileText, 
  ShieldCheck, 
  ArrowUpRight, 
  RefreshCw, 
  Loader2,
  HelpCircle
} from 'lucide-react';
import { ClinicTenant, SubscriptionInvoice } from '../../pages/ControlCenter';
import { SAAS_PLANS, SaaSPlanId, calculateLicensePriceForUsers, buildClinicEntitlementMaps } from '../../src/config/plans';
import { db, sanitizeData } from '../../src/firebase';
import { collection, addDoc, updateDoc, setDoc, doc } from 'firebase/firestore';

interface SuperAdminFinancesProps {
  clinics: ClinicTenant[];
  invoices: SubscriptionInvoice[];
  plans?: Record<string, any>;
  currentUser?: any;
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

export const SuperAdminFinances: React.FC<SuperAdminFinancesProps> = ({
  clinics,
  invoices,
  plans: externalPlans,
  currentUser,
  showToast
}) => {
  const availablePlans = useMemo<Record<string, any>>(() => {
    if (externalPlans && Object.keys(externalPlans).length > 0) return externalPlans;
    return SAAS_PLANS;
  }, [externalPlans]);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterClinicId, setFilterClinicId] = useState<string>('ALL');
  const [filterPlan, setFilterPlan] = useState<string>('ALL');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [filterPeriod, setFilterPeriod] = useState<'ALL' | 'THIS_MONTH' | 'LAST_MONTH' | 'THIS_YEAR'>('THIS_YEAR');

  // Modal State for Registering Payment / Issuing Invoice
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form State
  const [paymentForm, setPaymentForm] = useState({
    clinicId: '',
    plan: 'STANDARD',
    maxUsers: 15,
    amount: 150000,
    currency: 'FCFA',
    invoiceDate: new Date().toISOString().split('T')[0],
    paidDate: new Date().toISOString().split('T')[0],
    paymentMethod: 'Virement bancaire' as 'Virement bancaire' | 'Chèque' | 'Mobile Money' | 'Espèces' | 'Carte Bancaire',
    status: 'PAID' as 'PAID' | 'PENDING' | 'OVERDUE',
    extendLicenseMonths: 12,
    notes: 'Règlement de l\'abonnement annuel'
  });

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  // Period Boundaries
  const periodRange = useMemo(() => {
    let start: Date | null = null;
    let end: Date | null = null;

    if (filterPeriod === 'THIS_MONTH') {
      start = new Date(currentYear, currentMonth, 1);
      end = new Date(currentYear, currentMonth + 1, 0, 23, 59, 59);
    } else if (filterPeriod === 'LAST_MONTH') {
      start = new Date(currentYear, currentMonth - 1, 1);
      end = new Date(currentYear, currentMonth, 0, 23, 59, 59);
    } else if (filterPeriod === 'THIS_YEAR') {
      start = new Date(currentYear, 0, 1);
      end = new Date(currentYear, 11, 31, 23, 59, 59);
    }
    return { start, end };
  }, [filterPeriod, currentYear, currentMonth]);

  // Filtered Invoices
  const filteredInvoices = useMemo(() => {
    return invoices.filter(inv => {
      // Clinic filter
      if (filterClinicId !== 'ALL' && inv.clinicId !== filterClinicId) return false;
      // Plan filter
      if (filterPlan !== 'ALL' && inv.plan !== filterPlan) return false;
      // Status filter
      if (filterStatus !== 'ALL' && inv.status !== filterStatus) return false;

      // Period filter
      if (filterPeriod !== 'ALL') {
        const invDate = new Date(inv.paidDate || inv.dueDate || inv.createdAt || '');
        if (!isNaN(invDate.getTime())) {
          if (periodRange.start && invDate < periodRange.start) return false;
          if (periodRange.end && invDate > periodRange.end) return false;
        }
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matches = 
          (inv.id || '').toLowerCase().includes(q) ||
          (inv.clinicName || '').toLowerCase().includes(q) ||
          (inv.plan || '').toLowerCase().includes(q) ||
          (inv.paymentMethod || '').toLowerCase().includes(q);
        if (!matches) return false;
      }

      return true;
    });
  }, [invoices, filterClinicId, filterPlan, filterStatus, filterPeriod, periodRange, searchQuery]);

  // LIVE FINANCIAL INDICATORS (Platform SaaS Revenues strictly)
  const financialStats = useMemo(() => {
    let billedTotal = 0;
    let collectedCash = 0;
    let pendingUnpaid = 0;
    let overdueUnpaid = 0;

    filteredInvoices.forEach(inv => {
      const amt = Number(inv.amount) || 0;
      billedTotal += amt;
      if (inv.status === 'PAID') {
        collectedCash += amt;
      } else if (inv.status === 'PENDING') {
        pendingUnpaid += amt;
      } else if (inv.status === 'OVERDUE') {
        overdueUnpaid += amt;
      }
    });

    // Subscribed Structures metrics
    const totalSubscribedClinics = clinics.length;
    const activeSubscriptions = clinics.filter(c => c.status === 'ACTIVE').length;
    const expiredSubscriptions = clinics.filter(c => {
      if (c.status === 'EXPIRED') return true;
      if (!c.licenseEnd) return false;
      return new Date(c.licenseEnd).getTime() < now.getTime();
    }).length;

    // Upcoming license renewals (next 30 days)
    const upcomingRenewals = clinics.filter(c => {
      if (!c.licenseEnd) return false;
      const end = new Date(c.licenseEnd);
      const diffDays = (end.getTime() - now.getTime()) / (1000 * 3600 * 24);
      return diffDays > 0 && diffDays <= 30;
    }).length;

    // Revenue by Plan
    const revenueByPlan: Record<string, number> = {
      DEMO: 0,
      BASIC: 0,
      STANDARD: 0,
      PREMIUM: 0,
      ENTERPRISE: 0
    };

    filteredInvoices.filter(i => i.status === 'PAID').forEach(inv => {
      const p = (inv.plan || 'STANDARD').toUpperCase();
      revenueByPlan[p] = (revenueByPlan[p] || 0) + (Number(inv.amount) || 0);
    });

    return {
      billedTotal,
      collectedCash,
      pendingUnpaid,
      overdueUnpaid,
      totalSubscribedClinics,
      activeSubscriptions,
      expiredSubscriptions,
      upcomingRenewals,
      revenueByPlan,
      totalTransactionsCount: filteredInvoices.length,
      paidTransactionsCount: filteredInvoices.filter(i => i.status === 'PAID').length
    };
  }, [filteredInvoices, clinics, now]);

  // Export to CSV
  const handleExportCSV = () => {
    if (filteredInvoices.length === 0) {
      showToast('Aucune transaction à exporter', 'info');
      return;
    }

    const headers = ['REFERENCE', 'STRUCTURE', 'PLAN', 'MONTANT_FCFA', 'DEVISE', 'DATE_FACTURE', 'DATE_PAIEMENT', 'STATUT', 'MODE_PAIEMENT'];
    const rows = filteredInvoices.map(i => [
      i.id,
      `"${i.clinicName.replace(/"/g, '""')}"`,
      i.plan,
      i.amount,
      i.currency || 'FCFA',
      i.dueDate || '',
      i.paidDate || '',
      i.status,
      i.paymentMethod || 'Non spécifié'
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(';'), ...rows.map(e => e.join(';'))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `smarthosto_revenus_saas_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showToast('Exportation CSV des finances de la plateforme terminée', 'success');
  };

  // Export to JSON
  const handleExportJSON = () => {
    if (filteredInvoices.length === 0) {
      showToast('Aucune transaction à exporter', 'info');
      return;
    }

    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(filteredInvoices, null, 2));
    const dlAnchorElem = document.createElement('a');
    dlAnchorElem.setAttribute('href', dataStr);
    dlAnchorElem.setAttribute('download', `smarthosto_revenus_saas_${new Date().toISOString().split('T')[0]}.json`);
    dlAnchorElem.click();

    showToast('Exportation JSON des finances de la plateforme terminée', 'success');
  };

  // Mark an existing PENDING/OVERDUE invoice as PAID & Reactivate Clinic
  const handleMarkInvoicePaid = async (inv: SubscriptionInvoice) => {
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const docId = inv._docId || inv.id;
      await setDoc(doc(db, 'saas_invoices', docId), sanitizeData({
        status: 'PAID',
        paidDate: todayStr,
        updatedAt: new Date().toISOString()
      }), { merge: true });

      if (inv.clinicId) {
        await updateDoc(doc(db, 'saas_clinics', inv.clinicId), sanitizeData({
          status: 'ACTIVE',
          updatedAt: new Date().toISOString()
        })).catch(() => {});
        await setDoc(doc(db, 'hospitals', inv.clinicId), sanitizeData({
          id: inv.clinicId,
          status: 'ACTIVE',
          updatedAt: new Date().toISOString()
        }), { merge: true }).catch(() => {});
      }

      await addDoc(collection(db, 'saas_logs'), sanitizeData({
        timestamp: new Date().toISOString(),
        user: currentUser?.username || 'superadmin',
        action: 'INVOICE_MARKED_PAID',
        details: `Facture ${inv.id} (${inv.clinicName}) marquée comme PAYÉE (${(Number(inv.amount) || 0).toLocaleString()} FCFA) & structure réactivée`,
        category: 'LICENSE',
        clinicId: inv.clinicId,
        clinicName: inv.clinicName
      }));

      showToast(`Facture ${inv.id} marquée comme encaissée !`, 'success');
    } catch (err) {
      console.error('Error marking invoice paid:', err);
      showToast('Erreur lors de la validation du paiement', 'error');
    }
  };

  // Submit New Payment / Invoice & Synchronize Structure License/Quota
  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentForm.clinicId || !paymentForm.amount) {
      showToast('Veuillez sélectionner la structure et indiquer un montant', 'info');
      return;
    }

    const targetClinic = clinics.find(c => c.id === paymentForm.clinicId);
    if (!targetClinic) return;

    setIsSubmitting(true);
    try {
      const invoiceId = `FAC-${Date.now().toString().slice(-6)}`;
      const maxUsersNum = Math.max(1, Number(paymentForm.maxUsers) || targetClinic.quotas?.maxUsers || 15);
      const nextPlanId = (paymentForm.plan || targetClinic.licenseType || 'STANDARD').toUpperCase();
      const planDef = availablePlans[nextPlanId] || SAAS_PLANS[nextPlanId as SaaSPlanId] || SAAS_PLANS.STANDARD;
      const monthlyPriceCalc = calculateLicensePriceForUsers(planDef, maxUsersNum, 1).monthlyTotal;

      const invoicePayload: SubscriptionInvoice = {
        id: invoiceId,
        clinicId: targetClinic.id,
        clinicName: targetClinic.name,
        plan: nextPlanId,
        userCount: maxUsersNum,
        amount: Number(paymentForm.amount),
        currency: 'FCFA',
        dueDate: paymentForm.invoiceDate,
        paidDate: paymentForm.status === 'PAID' ? paymentForm.paidDate : undefined,
        status: paymentForm.status,
        paymentMethod: paymentForm.paymentMethod
      };

      await setDoc(doc(db, 'saas_invoices', invoiceId), sanitizeData({
        ...invoicePayload,
        createdAt: new Date().toISOString()
      }));

      // Auto-extend & sync clinic license + quota + modules if payment is PAID
      if (paymentForm.status === 'PAID') {
        const currentEnd = targetClinic.licenseEnd ? new Date(targetClinic.licenseEnd) : new Date();
        const baseDate = isNaN(currentEnd.getTime()) || currentEnd.getTime() < Date.now() ? new Date() : currentEnd;
        if (paymentForm.extendLicenseMonths > 0) {
          baseDate.setMonth(baseDate.getMonth() + Number(paymentForm.extendLicenseMonths));
        }
        const newEndStr = paymentForm.extendLicenseMonths > 0
          ? baseDate.toISOString().split('T')[0]
          : (targetClinic.licenseEnd || baseDate.toISOString().split('T')[0]);
        const licenceId = `licence_${nextPlanId.toLowerCase()}`;

        const { servicesConfig, activatedModules } = buildClinicEntitlementMaps(
          nextPlanId,
          targetClinic.servicesConfig || {},
          availablePlans
        );

        await updateDoc(doc(db, 'saas_clinics', targetClinic.id), sanitizeData({
          status: 'ACTIVE',
          licenseType: nextPlanId,
          nom_licence: planDef.nom_licence || planDef.label || nextPlanId,
          licence_id: licenceId,
          licenceId: licenceId,
          licensePrice: monthlyPriceCalc,
          licenseEnd: newEndStr,
          quotas: {
            ...(targetClinic.quotas || {}),
            maxUsers: maxUsersNum
          },
          servicesConfig,
          activatedModules,
          updatedAt: new Date().toISOString()
        }));

        await setDoc(doc(db, 'hospitals', targetClinic.id), sanitizeData({
          id: targetClinic.id,
          name: targetClinic.name,
          status: 'ACTIVE',
          licence_id: licenceId,
          licenceId: licenceId,
          nom_licence: planDef.nom_licence || planDef.label || nextPlanId,
          licenseType: nextPlanId,
          licensePrice: monthlyPriceCalc,
          max_users: maxUsersNum,
          updatedAt: new Date().toISOString()
        }), { merge: true });
      }

      // Audit Log
      await addDoc(collection(db, 'saas_logs'), sanitizeData({
        timestamp: new Date().toISOString(),
        user: currentUser?.username || 'superadmin',
        action: 'PAYMENT_RECORDED',
        details: `Facture/Paiement d'abonnement ${invoicePayload.id} enregistré pour ${targetClinic.name} (Formule: ${nextPlanId}, Quota: ${maxUsersNum} util., Montant : ${invoicePayload.amount.toLocaleString()} FCFA, Statut: ${paymentForm.status})`,
        category: 'LICENSE',
        clinicId: targetClinic.id,
        clinicName: targetClinic.name
      }));

      showToast(`Encaissement de ${invoicePayload.amount.toLocaleString()} FCFA synchronisé pour ${targetClinic.name} (${maxUsersNum} util.)`, 'success');
      setShowPaymentModal(false);
    } catch (err) {
      console.error('Error recording payment:', err);
      showToast('Erreur lors de l\'enregistrement de la transaction', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      
      {/* COMPACT HEADER BAR */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gradient-to-b from-[#161a29] to-[#0f121d] border border-white/15 px-4 py-3 rounded-2xl shadow-[0_10px_28px_rgba(0,0,0,0.5),inset_0_1px_0_0_rgba(255,255,255,0.16)]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-rose-500/20 border border-rose-400/30 flex items-center justify-center text-rose-300 shrink-0">
            <CreditCard size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-extrabold text-white tracking-tight">Paramètres Financiers & Abonnements</h2>
              <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest bg-rose-500/20 text-rose-300 border border-rose-500/30">
                Revenus SaaS
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-medium">Encaissements de licences, renouvellements & facturation SmartHosto</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCSV}
            className="px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer"
            title="Exporter en CSV"
          >
            <FileSpreadsheet size={14} /> CSV
          </button>
          <button
            onClick={handleExportJSON}
            className="px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer"
            title="Exporter en JSON"
          >
            <Download size={14} /> JSON
          </button>
          <button
            onClick={() => setShowPaymentModal(true)}
            className="px-4 py-2 bg-gradient-to-b from-rose-500 to-rose-700 hover:from-rose-400 hover:to-rose-600 text-white rounded-xl font-black text-xs uppercase tracking-wider flex items-center gap-1.5 border border-rose-400/40 shadow-[0_6px_16px_rgba(225,29,72,0.4),inset_0_1px_0_0_rgba(255,255,255,0.3)] transition-all cursor-pointer"
          >
            <Plus size={15} /> Enregistrer un Encaissement
          </button>
        </div>
      </div>

      {/* STRICT ISOLATION PRINCIPLE NOTICE */}
      <div className="p-4 bg-slate-900/40 border border-white/5 rounded-2xl flex items-start gap-3 text-xs text-slate-400">
        <ShieldCheck size={18} className="text-rose-400 shrink-0 mt-0.5" />
        <div>
          <p className="font-bold text-slate-200">Principe d'Intégrité Financière & Secret Médical :</p>
          <p className="mt-0.5">
            Ce tableau présente exclusivement les revenus générés par la vente de licences et d'abonnements de la plateforme SmartHosto.
            Les recettes internes, la comptabilité et les flux de caisse des cliniques clientes demeurent strictement confidentiels et isolés dans leurs espaces respectifs.
          </p>
        </div>
      </div>

      {/* FINANCIAL INDICATORS ROW */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* CA Encaissé Réel */}
        <div className="bg-slate-900/50 border border-white/10 p-5 rounded-3xl relative overflow-hidden">
          <div className="flex justify-between items-start">
            <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-2xl border border-emerald-500/20">
              <DollarSign size={24} />
            </div>
            <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400">
              Encaissé
            </span>
          </div>
          <p className="text-xs uppercase font-black text-slate-400 tracking-wider mt-4">Chiffre d'Affaires Encaissé</p>
          <div className="flex items-baseline gap-1 mt-1">
            <h3 className="text-2xl font-extrabold text-white">{financialStats.collectedCash.toLocaleString('fr-FR')}</h3>
            <span className="text-xs text-rose-400 font-black">FCFA</span>
          </div>
          <p className="text-[10px] text-slate-400 mt-2 font-bold">
            {financialStats.paidTransactionsCount} paiement(s) confirmé(s) sur la période
          </p>
        </div>

        {/* Facturé en Attente / Impayé */}
        <div className="bg-slate-900/50 border border-white/10 p-5 rounded-3xl relative overflow-hidden">
          <div className="flex justify-between items-start">
            <div className="p-3 bg-amber-500/10 text-amber-400 rounded-2xl border border-amber-500/20">
              <Clock size={24} />
            </div>
            <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-amber-500/20 text-amber-400">
              En Attente
            </span>
          </div>
          <p className="text-xs uppercase font-black text-slate-400 tracking-wider mt-4">Montants Facturés en Attente</p>
          <div className="flex items-baseline gap-1 mt-1">
            <h3 className="text-2xl font-extrabold text-amber-300">
              {(financialStats.pendingUnpaid + financialStats.overdueUnpaid).toLocaleString('fr-FR')}
            </h3>
            <span className="text-xs text-amber-400 font-black">FCFA</span>
          </div>
          <p className="text-[10px] text-slate-400 mt-2 font-bold">
            Impayés échus : {financialStats.overdueUnpaid.toLocaleString('fr-FR')} FCFA
          </p>
        </div>

        {/* Structures & Abonnements Actifs */}
        <div className="bg-slate-900/50 border border-white/10 p-5 rounded-3xl relative overflow-hidden">
          <div className="flex justify-between items-start">
            <div className="p-3 bg-blue-500/10 text-blue-400 rounded-2xl border border-blue-500/20">
              <Building2 size={24} />
            </div>
            <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-blue-500/20 text-blue-400">
              Portefeuille
            </span>
          </div>
          <p className="text-xs uppercase font-black text-slate-400 tracking-wider mt-4">Abonnements Souscrits</p>
          <div className="flex items-baseline gap-2 mt-1">
            <h3 className="text-3xl font-extrabold text-white">{financialStats.totalSubscribedClinics}</h3>
            <span className="text-xs text-emerald-400 font-bold">{financialStats.activeSubscriptions} actifs</span>
          </div>
          <p className="text-[10px] text-slate-400 mt-2 font-bold">
            {financialStats.expiredSubscriptions} contrat(s) expiré(s)
          </p>
        </div>

        {/* Renouvellements à venir sous 30 j */}
        <div className="bg-slate-900/50 border border-white/10 p-5 rounded-3xl relative overflow-hidden">
          <div className="flex justify-between items-start">
            <div className="p-3 bg-purple-500/10 text-purple-400 rounded-2xl border border-purple-500/20">
              <RefreshCw size={24} />
            </div>
            <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-purple-500/20 text-purple-400">
              Pipeline
            </span>
          </div>
          <p className="text-xs uppercase font-black text-slate-400 tracking-wider mt-4">Échéances sous 30 jours</p>
          <div className="flex items-baseline gap-2 mt-1">
            <h3 className="text-3xl font-extrabold text-purple-300">{financialStats.upcomingRenewals}</h3>
            <span className="text-xs text-slate-400 font-bold">à relancer</span>
          </div>
          <p className="text-[10px] text-slate-400 mt-2 font-bold">
            Potentiel de réengagement immédiat
          </p>
        </div>

      </div>

      {/* FILTER CONTROLS */}
      <div className="flex flex-wrap items-center gap-3 bg-slate-900/40 border border-white/5 p-4 rounded-2xl">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
          <input 
            type="text"
            placeholder="Rechercher facture, structure, moyen de paiement..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-950 border border-white/10 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500"
          />
        </div>

        {/* Period Filter */}
        <select
          value={filterPeriod}
          onChange={(e: any) => setFilterPeriod(e.target.value)}
          className="px-3 py-2 bg-slate-950 border border-white/10 rounded-xl text-xs text-slate-300 focus:outline-none focus:border-rose-500"
        >
          <option value="THIS_MONTH">Mois en cours</option>
          <option value="LAST_MONTH">Mois précédent</option>
          <option value="THIS_YEAR">Année en cours</option>
          <option value="ALL">Tout l'historique</option>
        </select>

        {/* Clinic Filter */}
        <select
          value={filterClinicId}
          onChange={(e) => setFilterClinicId(e.target.value)}
          className="px-3 py-2 bg-slate-950 border border-white/10 rounded-xl text-xs text-slate-300 focus:outline-none focus:border-rose-500 max-w-[180px]"
        >
          <option value="ALL">Toutes les structures</option>
          {clinics.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>

        {/* Status Filter */}
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="px-3 py-2 bg-slate-950 border border-white/10 rounded-xl text-xs text-slate-300 focus:outline-none focus:border-rose-500"
        >
          <option value="ALL">Tous les statuts</option>
          <option value="PAID">Payé / Encaissé</option>
          <option value="PENDING">En attente de paiement</option>
          <option value="OVERDUE">En retard</option>
        </select>
      </div>

      {/* TRANSACTIONS TABLE */}
      <div className="bg-slate-900/50 border border-white/10 rounded-3xl overflow-hidden backdrop-blur-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-white/5 bg-slate-950/40 text-[10px] font-black text-slate-400 uppercase tracking-wider">
                <th className="py-4 pl-6">Réf Facture</th>
                <th className="py-4">Structure Cliente</th>
                <th className="py-4">Formule Contractuelle</th>
                <th className="py-4">Date Émission / Échéance</th>
                <th className="py-4">Date Encaissement</th>
                <th className="py-4">Moyen de Règlement</th>
                <th className="py-4">Statut</th>
                <th className="py-4 text-right pr-6">Montant Encaissé</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-xs">
              {filteredInvoices.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500">
                    <CreditCard size={36} className="mx-auto mb-2 opacity-40" />
                    <p className="font-bold">Aucune transaction trouvée pour ces critères.</p>
                  </td>
                </tr>
              ) : (
                filteredInvoices.map(inv => {
                  const isPaid = inv.status === 'PAID';
                  return (
                    <tr key={inv.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="py-4 pl-6 font-mono font-bold text-slate-300">
                        {inv.id}
                      </td>
                      <td className="py-4 font-bold text-white">
                        {inv.clinicName}
                      </td>
                      <td className="py-4">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-300 border border-white/5">
                          {inv.plan}
                        </span>
                      </td>
                      <td className="py-4 text-slate-400">
                        {inv.dueDate || 'N/A'}
                      </td>
                      <td className="py-4 text-slate-300 font-bold">
                        {inv.paidDate || '—'}
                      </td>
                      <td className="py-4 text-slate-400">
                        {inv.paymentMethod || 'Non spécifié'}
                      </td>
                      <td className="py-4">
                        <div className="flex items-center gap-2">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black ${
                            isPaid 
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                              : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                          }`}>
                            {isPaid ? <CheckCircle2 size={10} /> : <Clock size={10} />}
                            {isPaid ? 'ENCAISSÉ' : 'EN ATTENTE'}
                          </span>
                          {!isPaid && (
                            <button
                              onClick={() => handleMarkInvoicePaid(inv)}
                              className="px-2 py-0.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-[10px] transition-all cursor-pointer"
                              title="Marquer cette facture comme encaissée"
                            >
                              Encaisser ✓
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="py-4 text-right pr-6 font-black text-white">
                        {(Number(inv.amount) || 0).toLocaleString('fr-FR')} FCFA
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL: RECORD PAYMENT / ISSUE INVOICE */}
      {showPaymentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
          <div className="bg-slate-900 border border-white/10 rounded-3xl max-w-lg w-full p-6 md:p-8 relative">
            
            <div className="flex justify-between items-center mb-6">
              <div>
                <span className="text-[10px] uppercase font-black tracking-widest text-rose-500">Comptabilité SaaS</span>
                <h3 className="text-xl font-black text-white mt-0.5">Enregistrer un Encaissement d'Abonnement</h3>
              </div>
              <button onClick={() => setShowPaymentModal(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            <form onSubmit={handleRecordPayment} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-400">Structure Concernée *</label>
                <select
                  required
                  value={paymentForm.clinicId}
                  onChange={(e) => {
                    const c = clinics.find(x => x.id === e.target.value);
                    const cPlan = c?.licenseType || 'STANDARD';
                    const planDef = availablePlans[cPlan] || SAAS_PLANS[cPlan as SaaSPlanId] || SAAS_PLANS.STANDARD;
                    const cUsers = c?.quotas?.maxUsers || planDef.max_users || 15;
                    const months = paymentForm.extendLicenseMonths > 0 ? paymentForm.extendLicenseMonths : 1;
                    const calcAmount = calculateLicensePriceForUsers(planDef, cUsers, months).periodTotal;
                    setPaymentForm({
                      ...paymentForm,
                      clinicId: e.target.value,
                      plan: cPlan,
                      maxUsers: cUsers,
                      amount: calcAmount
                    });
                  }}
                  className="w-full mt-1.5 px-4 py-2.5 bg-slate-950 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-rose-500"
                >
                  <option value="">Sélectionnez un établissement...</option>
                  {clinics.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.licenseType} • {c.quotas?.maxUsers || 15} util.)
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-400">Formule Associée</label>
                  <select
                    value={paymentForm.plan}
                    onChange={(e) => {
                      const nextPlan = e.target.value;
                      const planDef = availablePlans[nextPlan] || SAAS_PLANS[nextPlan as SaaSPlanId] || SAAS_PLANS.STANDARD;
                      const nextUsers = Math.max(paymentForm.maxUsers, planDef.max_users || 5);
                      const months = paymentForm.extendLicenseMonths > 0 ? paymentForm.extendLicenseMonths : 1;
                      const calcAmount = calculateLicensePriceForUsers(planDef, nextUsers, months).periodTotal;
                      setPaymentForm({
                        ...paymentForm,
                        plan: nextPlan,
                        maxUsers: nextUsers,
                        amount: calcAmount
                      });
                    }}
                    className="w-full mt-1.5 px-3 py-2 bg-slate-950 border border-white/10 rounded-xl text-xs font-bold text-slate-200 focus:outline-none focus:border-rose-500"
                  >
                    {Object.keys(availablePlans).map(k => (
                      <option key={k} value={k}>{k}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-emerald-400">Quota Utilisateurs</label>
                  <input
                    type="number"
                    min={1}
                    max={500}
                    value={paymentForm.maxUsers}
                    onChange={(e) => {
                      const nextUsers = Math.max(1, Number(e.target.value) || 1);
                      const planDef = availablePlans[paymentForm.plan] || SAAS_PLANS[paymentForm.plan as SaaSPlanId] || SAAS_PLANS.STANDARD;
                      const months = paymentForm.extendLicenseMonths > 0 ? paymentForm.extendLicenseMonths : 1;
                      const calcAmount = calculateLicensePriceForUsers(planDef, nextUsers, months).periodTotal;
                      setPaymentForm({
                        ...paymentForm,
                        maxUsers: nextUsers,
                        amount: calcAmount
                      });
                    }}
                    className="w-full mt-1.5 px-3 py-2 bg-slate-950 border border-emerald-500/30 rounded-xl text-xs font-mono font-bold text-emerald-300 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-400">Montant Total (FCFA) *</label>
                  <input 
                    type="number"
                    required
                    min={0}
                    step={5000}
                    value={paymentForm.amount}
                    onChange={(e) => setPaymentForm({...paymentForm, amount: Number(e.target.value)})}
                    className="w-full mt-1.5 px-3 py-2 bg-slate-950 border border-white/10 rounded-xl text-xs font-mono font-bold text-white focus:outline-none focus:border-rose-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-400">Date d'Émission</label>
                  <input 
                    type="date"
                    value={paymentForm.invoiceDate}
                    onChange={(e) => setPaymentForm({...paymentForm, invoiceDate: e.target.value})}
                    className="w-full mt-1.5 px-4 py-2 bg-slate-950 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-rose-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-400">Date d'Encaissement Réel</label>
                  <input 
                    type="date"
                    value={paymentForm.paidDate}
                    onChange={(e) => setPaymentForm({...paymentForm, paidDate: e.target.value})}
                    className="w-full mt-1.5 px-4 py-2 bg-slate-950 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-rose-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-400">Moyen de Règlement</label>
                  <select
                    value={paymentForm.paymentMethod}
                    onChange={(e: any) => setPaymentForm({...paymentForm, paymentMethod: e.target.value})}
                    className="w-full mt-1.5 px-4 py-2 bg-slate-950 border border-white/10 rounded-xl text-xs text-slate-300 focus:outline-none focus:border-rose-500"
                  >
                    <option value="Virement bancaire">Virement bancaire</option>
                    <option value="Chèque">Chèque certifié</option>
                    <option value="Mobile Money">Mobile Money (Wave / Orange)</option>
                    <option value="Espèces">Espèces / Dépôt guichet</option>
                    <option value="Carte Bancaire">Carte Bancaire en ligne</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-400">Statut du Paiement</label>
                  <select
                    value={paymentForm.status}
                    onChange={(e: any) => setPaymentForm({...paymentForm, status: e.target.value})}
                    className="w-full mt-1.5 px-4 py-2 bg-slate-950 border border-white/10 rounded-xl text-xs text-slate-300 focus:outline-none focus:border-rose-500"
                  >
                    <option value="PAID">Encaissé / Confirmé</option>
                    <option value="PENDING">Facturé en Attente</option>
                    <option value="OVERDUE">En Retard / Impayé</option>
                  </select>
                </div>
              </div>

              {paymentForm.status === 'PAID' && (
                <div className="p-3 bg-emerald-950/20 border border-emerald-500/30 rounded-xl">
                  <label className="text-xs font-bold text-emerald-300 block mb-1">
                    Renouvellement Automatique de la Licence de la Structure
                  </label>
                  <select
                    value={paymentForm.extendLicenseMonths}
                    onChange={(e) => {
                      const nextMonths = Number(e.target.value);
                      const planDef = availablePlans[paymentForm.plan] || SAAS_PLANS[paymentForm.plan as SaaSPlanId] || SAAS_PLANS.STANDARD;
                      const calcAmount = calculateLicensePriceForUsers(planDef, paymentForm.maxUsers, nextMonths > 0 ? nextMonths : 1).periodTotal;
                      setPaymentForm({
                        ...paymentForm,
                        extendLicenseMonths: nextMonths,
                        amount: calcAmount
                      });
                    }}
                    className="w-full px-3 py-2 bg-slate-950 border border-emerald-500/30 rounded-xl text-xs text-white font-bold focus:outline-none"
                  >
                    <option value={12}>Prolonger la licence de +1 An (12 mois) & Réactiver</option>
                    <option value={6}>Prolonger la licence de +6 Mois & Réactiver</option>
                    <option value={1}>Prolonger la licence de +1 Mois & Réactiver</option>
                    <option value={0}>Ne pas modifier la date d'expiration actuelle</option>
                  </select>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-4 border-t border-white/5">
                <button
                  type="button"
                  onClick={() => setShowPaymentModal(false)}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold text-slate-400 hover:text-white transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-6 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-rose-900/30 transition-all disabled:opacity-50"
                >
                  {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <DollarSign size={16} />}
                  Enregistrer l'Encaissement
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

    </div>
  );
};
