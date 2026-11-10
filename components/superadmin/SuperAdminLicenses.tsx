import React, { useState, useMemo, useEffect } from 'react';
import { 
  Key, 
  Layers, 
  Plus, 
  Edit, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  Building2, 
  DollarSign, 
  Calendar, 
  ShieldCheck, 
  Search, 
  Filter, 
  Check, 
  X, 
  ChevronRight, 
  ChevronDown, 
  Eye, 
  Archive, 
  Loader2,
  Info,
  Users,
  Calculator,
  Sparkles,
  RefreshCw
} from 'lucide-react';
import { SAAS_PLANS, SaaSPlanId, SaaSPlan, calculateLicensePriceForUsers, recommendPlanForUserCount, buildClinicEntitlementMaps } from '../../src/config/plans';
import { CANONICAL_MODULES, hasImplementedModule } from '../../src/config/modules';
import { ClinicTenant } from '../../pages/ControlCenter';
import { db, sanitizeData } from '../../src/firebase';
import { doc, setDoc, updateDoc, collection, addDoc } from 'firebase/firestore';
import { Licence } from '../../types';

interface SuperAdminLicensesProps {
  clinics: ClinicTenant[];
  plans?: Record<string, CommercialPlanRecord>;
  setPlans?: React.Dispatch<React.SetStateAction<Record<string, CommercialPlanRecord>>>;
  currentUser?: any;
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  onNavigateToServices?: (clinicId: string) => void;
}

export interface CommercialPlanRecord extends SaaSPlan {
  status: 'ACTIVE' | 'ARCHIVED';
  durationLabel: string;
  nom_licence?: string;
  max_users: number;
  pricePerExtraUserFCFA: number;
  createdAt?: string;
  updatedAt?: string;
}

export const SuperAdminLicenses: React.FC<SuperAdminLicensesProps> = ({
  clinics,
  plans: externalPlans,
  setPlans: setExternalPlans,
  currentUser,
  showToast,
  onNavigateToServices
}) => {
  // Local fallback if not controlled by ControlCenter
  const [localPlans, setLocalPlans] = useState<Record<string, CommercialPlanRecord>>(() => {
    const initial: Record<string, CommercialPlanRecord> = {};
    Object.keys(SAAS_PLANS).forEach((k) => {
      const p = SAAS_PLANS[k as SaaSPlanId];
      initial[k] = {
        ...p,
        nom_licence: p.label,
        status: 'ACTIVE',
        durationLabel: '1 Mois / 1 An renouvelable',
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01'
      };
    });
    return initial;
  });

  const plans = externalPlans || localPlans;
  const setPlans = setExternalPlans || setLocalPlans;

  // --- Interactive User-Seat License Calculator & Direct Assignment State ---
  const [simUsers, setSimUsers] = useState<number>(15);
  const [simDurationMonths, setSimDurationMonths] = useState<number>(12);
  const [simSelectedPlanId, setSimSelectedPlanId] = useState<string>('STANDARD');
  const [simTargetClinicId, setSimTargetClinicId] = useState<string>('');
  const [isApplyingSim, setIsApplyingSim] = useState(false);

  const recommendedPlanId = useMemo(() => {
    return recommendPlanForUserCount(simUsers, plans);
  }, [simUsers, plans]);

  const simPricing = useMemo(() => {
    const activePlan = plans[simSelectedPlanId] || plans[recommendedPlanId] || SAAS_PLANS.STANDARD;
    return calculateLicensePriceForUsers(activePlan, simUsers, simDurationMonths);
  }, [plans, simSelectedPlanId, recommendedPlanId, simUsers, simDurationMonths]);

  // Apply simulated user-based license directly to a clinic
  const handleApplySimToClinic = async () => {
    if (!simTargetClinicId) {
      showToast('Veuillez sélectionner une structure hospitalière à mettre à jour', 'info');
      return;
    }
    const targetClinic = clinics.find(c => c.id === simTargetClinicId);
    if (!targetClinic) return;

    const chosenPlan = plans[simSelectedPlanId] || SAAS_PLANS.STANDARD;
    setIsApplyingSim(true);
    try {
      const { servicesConfig, activatedModules } = buildClinicEntitlementMaps(
        chosenPlan.id,
        targetClinic.servicesConfig || {},
        plans
      );

      const newEndDate = new Date();
      newEndDate.setMonth(newEndDate.getMonth() + simDurationMonths);
      const newEndStr = newEndDate.toISOString().split('T')[0];
      const licenceId = `licence_${chosenPlan.id.toLowerCase()}`;

      await updateDoc(doc(db, 'saas_clinics', targetClinic.id), sanitizeData({
        licenseType: chosenPlan.id,
        nom_licence: chosenPlan.nom_licence || chosenPlan.label,
        licence_id: licenceId,
        licenceId: licenceId,
        licensePrice: simPricing.monthlyTotal,
        licenseEnd: newEndStr,
        status: 'ACTIVE',
        quotas: {
          ...(targetClinic.quotas || {}),
          maxUsers: simUsers
        },
        servicesConfig,
        activatedModules,
        updatedAt: new Date().toISOString()
      }));

      await setDoc(doc(db, 'hospitals', targetClinic.id), sanitizeData({
        id: targetClinic.id,
        name: targetClinic.name,
        licence_id: licenceId,
        licenceId: licenceId,
        nom_licence: chosenPlan.nom_licence || chosenPlan.label,
        max_users: simUsers,
        licenseType: chosenPlan.id,
        licensePrice: simPricing.monthlyTotal,
        status: 'ACTIVE',
        updatedAt: new Date().toISOString()
      }), { merge: true });

      await addDoc(collection(db, 'saas_logs'), sanitizeData({
        timestamp: new Date().toISOString(),
        user: currentUser?.username || 'superadmin',
        clinicId: targetClinic.id,
        clinicName: targetClinic.name,
        action: 'USER_LICENSE_ASSIGNED',
        details: `Licence par nombre d'utilisateurs appliquée à "${targetClinic.name}" : Formule ${chosenPlan.id} pour ${simUsers} utilisateurs (${simPricing.monthlyTotal.toLocaleString('fr-FR')} FCFA/mois, validité +${simDurationMonths} mois)`,
        category: 'LICENSE'
      }));

      showToast(
        `Licence ${chosenPlan.id} (${simUsers} utilisateurs • ${simPricing.monthlyTotal.toLocaleString('fr-FR')} FCFA/mois) appliquée à ${targetClinic.name} !`,
        'success'
      );
    } catch (err) {
      console.error('Error applying user license to clinic:', err);
      showToast('Erreur lors de l\'application de la licence à la structure', 'error');
    } finally {
      setIsApplyingSim(false);
    }
  };

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPlanForSubscribers, setSelectedPlanForSubscribers] = useState<string | null>(null);

  // Modal State for Create / Edit Formula
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form State
  const [planForm, setPlanForm] = useState<{
    id: string;
    label: string;
    nom_licence: string;
    max_users: number;
    pricePerExtraUserFCFA: number;
    description: string;
    monthlyPriceFCFA: number;
    badgeColor: string;
    includedServiceIds: string[];
    durationValue: number;
    durationUnit: 'Mois' | 'Années';
    status: 'ACTIVE' | 'ARCHIVED';
    syncSubscribedClinics: boolean;
  }>({
    id: '',
    label: '',
    nom_licence: '',
    max_users: 15,
    pricePerExtraUserFCFA: 8500,
    description: '',
    monthlyPriceFCFA: 150000,
    badgeColor: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    includedServiceIds: ['SRV-ACCUEIL', 'SRV-CONSULTATION', 'SRV-CAISSE'],
    durationValue: 1,
    durationUnit: 'Années',
    status: 'ACTIVE',
    syncSubscribedClinics: true
  });

  // Count subscribers per plan
  const planSubscribersMap = useMemo(() => {
    const map: Record<string, ClinicTenant[]> = {};
    Object.keys(plans).forEach(k => { map[k] = []; });

    clinics.forEach(c => {
      const planKey = (c.licenseType || 'STANDARD').toUpperCase();
      if (!map[planKey]) map[planKey] = [];
      map[planKey].push(c);
    });
    return map;
  }, [plans, clinics]);

  // Open Create Modal
  const handleOpenCreateModal = () => {
    setEditingPlanId(null);
    setPlanForm({
      id: `PLAN_${Date.now().toString().slice(-4)}`,
      label: 'Nouvelle Licence Hospitalière',
      nom_licence: 'Licence Personnalisée',
      max_users: 20,
      pricePerExtraUserFCFA: 8000,
      description: 'Définition du socle d\'utilisateurs inclus, tarif par siège supplémentaire et services',
      monthlyPriceFCFA: 200000,
      badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
      includedServiceIds: ['SRV-ACCUEIL', 'SRV-CONSULTATION', 'SRV-INFIRMIER', 'SRV-CAISSE'],
      durationValue: 1,
      durationUnit: 'Années',
      status: 'ACTIVE',
      syncSubscribedClinics: true
    });
    setShowPlanModal(true);
  };

  // Open Edit Modal
  const handleOpenEditModal = (planId: string) => {
    const p = plans[planId];
    if (!p) return;
    setEditingPlanId(planId);

    let parsedVal = 1;
    let parsedUnit: 'Mois' | 'Années' = 'Années';
    if (p.durationLabel) {
      const match = p.durationLabel.match(/\d+/);
      if (match) parsedVal = parseInt(match[0]) || 1;
      if (p.durationLabel.toLowerCase().includes('mois')) {
        parsedUnit = 'Mois';
      } else {
        parsedUnit = 'Années';
      }
    }

    const defaultUsers = p.max_users || (planId.includes('ENTERPRISE') ? 100 : planId.includes('PREMIUM') ? 35 : planId.includes('BASIC') ? 5 : 15);
    const defaultExtraRate = p.pricePerExtraUserFCFA !== undefined
      ? p.pricePerExtraUserFCFA
      : (planId.includes('ENTERPRISE') ? 5000 : planId.includes('PREMIUM') ? 7000 : planId.includes('BASIC') ? 10000 : 8500);

    setPlanForm({
      id: p.id,
      label: p.label,
      nom_licence: p.nom_licence || p.label,
      max_users: defaultUsers,
      pricePerExtraUserFCFA: defaultExtraRate,
      description: p.description,
      monthlyPriceFCFA: p.monthlyPriceFCFA,
      badgeColor: p.badgeColor,
      includedServiceIds: [...p.includedServiceIds],
      durationValue: parsedVal,
      durationUnit: parsedUnit,
      status: p.status || 'ACTIVE',
      syncSubscribedClinics: true
    });
    setShowPlanModal(true);
  };

  // Toggle Service Selection in Modal Form
  const toggleServiceInForm = (srvId: string) => {
    setPlanForm(prev => {
      const current = prev.includedServiceIds;
      if (current.includes(srvId)) {
        return { ...prev, includedServiceIds: current.filter(id => id !== srvId) };
      } else {
        return { ...prev, includedServiceIds: [...current, srvId] };
      }
    });
  };

  // Save Plan & Synchronize Licence Quota schema + Subscribed Clinics
  const handleSavePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!planForm.label || !planForm.id) {
      showToast('Le nom de la licence et l\'identifiant sont requis', 'info');
      return;
    }

    setIsSubmitting(true);
    try {
      const formattedDuration = `${planForm.durationValue} ${planForm.durationUnit}`;
      const planIdUpper = planForm.id.toUpperCase().trim();
      const maxUsersVal = Math.max(1, Number(planForm.max_users) || 1);
      const extraUserRateVal = Math.max(0, Number(planForm.pricePerExtraUserFCFA) || 0);

      const planPayload: CommercialPlanRecord = {
        id: planIdUpper,
        label: planForm.label.trim(),
        nom_licence: planForm.label.trim(),
        max_users: maxUsersVal,
        pricePerExtraUserFCFA: extraUserRateVal,
        description: planForm.description,
        monthlyPriceFCFA: Number(planForm.monthlyPriceFCFA) || 0,
        badgeColor: planForm.badgeColor,
        includedServiceIds: planForm.includedServiceIds,
        durationLabel: formattedDuration,
        status: planForm.status,
        updatedAt: new Date().toISOString()
      };

      // 1. Persist in saas_plans
      await setDoc(doc(db, 'saas_plans', planPayload.id), sanitizeData(planPayload));

      // 2. Persist in licences & subscription_plans collections
      const licenceId = `licence_${planPayload.id.toLowerCase()}`;
      const licenceRecord: Licence = {
        id: licenceId,
        nom_licence: planPayload.label.trim(),
        max_users: maxUsersVal,
        pricePerExtraUserFCFA: extraUserRateVal,
        description: planPayload.description,
        monthlyPriceFCFA: planPayload.monthlyPriceFCFA,
        includedServiceIds: planPayload.includedServiceIds,
        badgeColor: planPayload.badgeColor,
        durationValue: planForm.durationValue,
        durationUnit: planForm.durationUnit,
        status: planPayload.status,
        updatedAt: new Date().toISOString()
      };
      await setDoc(doc(db, 'licences', licenceId), sanitizeData(licenceRecord));
      await setDoc(doc(db, 'subscription_plans', licenceId), sanitizeData(licenceRecord));
      await setDoc(doc(db, 'licences', planPayload.id.toLowerCase()), sanitizeData({
        ...licenceRecord,
        id: planPayload.id.toLowerCase()
      }));

      // Update local/parent state
      const updatedPlansCatalog = {
        ...plans,
        [planPayload.id]: planPayload
      };
      setPlans(updatedPlansCatalog);

      // 3. Synchronize subscribed structures if requested
      if (planForm.syncSubscribedClinics) {
        const subscribed = clinics.filter(
          c => (c.licenseType || '').toUpperCase() === planPayload.id
        );
        for (const c of subscribed) {
          const { servicesConfig, activatedModules } = buildClinicEntitlementMaps(
            planPayload.id,
            c.servicesConfig || {},
            updatedPlansCatalog
          );
          const nextMaxUsers = Math.max(Number(c.quotas?.maxUsers) || 0, maxUsersVal);
          const nextPrice = calculateLicensePriceForUsers(planPayload, nextMaxUsers, 1).monthlyTotal;

          await updateDoc(doc(db, 'saas_clinics', c.id), sanitizeData({
            nom_licence: planPayload.label,
            licence_id: licenceId,
            licenceId: licenceId,
            licensePrice: nextPrice,
            quotas: {
              ...(c.quotas || {}),
              maxUsers: nextMaxUsers
            },
            servicesConfig,
            activatedModules,
            updatedAt: new Date().toISOString()
          }));

          await setDoc(doc(db, 'hospitals', c.id), sanitizeData({
            id: c.id,
            name: c.name,
            licence_id: licenceId,
            licenceId: licenceId,
            nom_licence: planPayload.label,
            max_users: nextMaxUsers,
            licenseType: planPayload.id,
            licensePrice: nextPrice,
            updatedAt: new Date().toISOString()
          }), { merge: true });
        }
      }

      // Audit Log
      await addDoc(collection(db, 'saas_logs'), sanitizeData({
        timestamp: new Date().toISOString(),
        user: currentUser?.username || 'superadmin',
        action: editingPlanId ? 'PLAN_UPDATE' : 'PLAN_CREATION',
        details: `Licence ${planPayload.id} (${planPayload.label}) enregistrée. Socle : ${planPayload.max_users} util. (+${extraUserRateVal.toLocaleString()} FCFA/util. supp.). Base : ${planPayload.monthlyPriceFCFA.toLocaleString()} FCFA/mois`,
        category: 'LICENSE'
      }));

      showToast(
        `Licence "${planPayload.label}" synchronisée (Socle: ${planPayload.max_users} util. • +${extraUserRateVal.toLocaleString()} FCFA/util. supp.)`,
        'success'
      );
      setShowPlanModal(false);
    } catch (err) {
      console.error('Error saving plan:', err);
      showToast('Erreur lors de l\'enregistrement de la licence', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Toggle Marketing Status (Active / Archived)
  const handleTogglePlanStatus = async (planId: string) => {
    const current = plans[planId];
    if (!current) return;
    const newStatus = current.status === 'ACTIVE' ? 'ARCHIVED' : 'ACTIVE';

    try {
      await updateDoc(doc(db, 'saas_plans', planId), sanitizeData({
        status: newStatus,
        updatedAt: new Date().toISOString()
      }));

      setPlans(prev => ({
        ...prev,
        [planId]: { ...prev[planId], status: newStatus }
      }));

      showToast(`Commercialisation de la formule ${planId} ${newStatus === 'ACTIVE' ? 'activée' : 'archivée'}. Les clients existants conservent leur forfait.`, 'success');
    } catch (err) {
      console.error('Error updating plan status:', err);
      showToast('Erreur lors du changement de statut commercial', 'error');
    }
  };

  // Filtered Plan Keys
  const planKeys = useMemo(() => {
    return Object.keys(plans).filter(k => {
      const p = plans[k];
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      return p.label.toLowerCase().includes(q) || p.description.toLowerCase().includes(q) || p.id.toLowerCase().includes(q);
    });
  }, [plans, searchQuery]);

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      
      {/* COMPACT HEADER BAR */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gradient-to-b from-[#161a29] to-[#0f121d] border border-white/15 px-4 py-3 rounded-2xl shadow-[0_10px_28px_rgba(0,0,0,0.5),inset_0_1px_0_0_rgba(255,255,255,0.16)]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center text-emerald-300 shrink-0">
            <Key size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-extrabold text-white tracking-tight">Formules & Abonnements SmartHosto</h2>
              <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                Catalogue SaaS
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-medium">Quotas utilisateurs, tarification et modules inclus par formule</p>
          </div>
        </div>

        <button
          onClick={handleOpenCreateModal}
          className="px-4 py-2 bg-gradient-to-b from-emerald-500 to-emerald-700 hover:from-emerald-400 hover:to-emerald-600 text-white rounded-xl font-black text-xs uppercase tracking-wider flex items-center gap-1.5 border border-emerald-400/40 shadow-[0_6px_16px_rgba(16,185,129,0.35),inset_0_1px_0_0_rgba(255,255,255,0.3)] transition-all cursor-pointer self-start sm:self-auto"
        >
          <Plus size={15} /> Nouvelle Formule Commerciale
        </button>
      </div>

      {/* SIMULATEUR & ATTRIBUTION DE LICENCE PAR NOMBRE D'UTILISATEURS */}
      <div className="bg-gradient-to-b from-[#141827] to-[#0d101b] border border-emerald-500/30 rounded-2xl p-4 sm:p-5 shadow-[0_12px_32px_rgba(0,0,0,0.45),inset_0_1px_0_0_rgba(255,255,255,0.14)]">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex-1 space-y-3">
            <div className="flex items-center gap-2">
              <Calculator size={16} className="text-emerald-400" />
              <span className="text-xs font-extrabold uppercase tracking-wider text-emerald-300">
                Simulateur & Attribution de Licence par Nombre d'Utilisateurs
              </span>
              <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-[10px] font-bold text-emerald-300">
                Recommandé : Formule {recommendedPlanId}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* 1. Number of Users */}
              <div className="bg-slate-950/70 border border-white/10 rounded-xl p-3">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[11px] font-bold text-slate-300">Nombre d'Utilisateurs</label>
                  <span className="text-sm font-black font-mono text-emerald-400">{simUsers} util.</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={200}
                  value={simUsers}
                  onChange={(e) => {
                    const val = Math.max(1, Number(e.target.value));
                    setSimUsers(val);
                    setSimSelectedPlanId(recommendPlanForUserCount(val, plans));
                  }}
                  className="w-full accent-emerald-500 cursor-pointer"
                />
                <div className="flex flex-wrap items-center gap-1 mt-2">
                  {[3, 5, 10, 15, 25, 35, 50, 100, 150].map(preset => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => {
                        setSimUsers(preset);
                        setSimSelectedPlanId(recommendPlanForUserCount(preset, plans));
                      }}
                      className={`px-2 py-0.5 rounded text-[10px] font-extrabold transition-all cursor-pointer ${
                        simUsers === preset
                          ? 'bg-emerald-600 text-white'
                          : 'bg-white/5 text-slate-400 hover:text-white'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              {/* 2. Formula & Duration */}
              <div className="bg-slate-950/70 border border-white/10 rounded-xl p-3 space-y-2">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Formule Choisie</label>
                  <select
                    value={simSelectedPlanId}
                    onChange={(e) => setSimSelectedPlanId(e.target.value)}
                    className="w-full mt-1 px-2.5 py-1.5 bg-slate-900 border border-white/15 rounded-lg text-xs font-bold text-white focus:outline-none focus:border-emerald-500"
                  >
                    {Object.keys(plans).map(k => (
                      <option key={k} value={k}>
                        {k} — {plans[k].max_users} util. inclus ({plans[k].monthlyPriceFCFA.toLocaleString('fr-FR')} FCFA/m)
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Durée d'Engagement</label>
                  <select
                    value={simDurationMonths}
                    onChange={(e) => setSimDurationMonths(Number(e.target.value))}
                    className="w-full mt-1 px-2.5 py-1.5 bg-slate-900 border border-white/15 rounded-lg text-xs font-bold text-slate-200 focus:outline-none focus:border-emerald-500"
                  >
                    <option value={1}>1 Mois</option>
                    <option value={3}>3 Mois (Trimestriel)</option>
                    <option value={6}>6 Mois (Semestriel)</option>
                    <option value={12}>12 Mois (Annuel)</option>
                    <option value={24}>24 Mois (2 Ans)</option>
                  </select>
                </div>
              </div>

              {/* 3. Calculated Breakdown & Direct Apply to Structure */}
              <div className="bg-emerald-950/25 border border-emerald-500/30 rounded-xl p-3 flex flex-col justify-between">
                <div>
                  <div className="flex items-baseline justify-between">
                    <span className="text-[10px] uppercase font-black text-emerald-300">Tarif Mensuel Calculé</span>
                    <span className="text-[10px] font-mono text-slate-400">~{simPricing.costPerUserMonthly.toLocaleString('fr-FR')} FCFA/util.</span>
                  </div>
                  <div className="flex items-baseline gap-1 mt-0.5">
                    <span className="text-xl font-black text-white">{simPricing.monthlyTotal.toLocaleString('fr-FR')}</span>
                    <span className="text-[11px] font-bold text-emerald-400">FCFA / mois</span>
                  </div>
                  <p className="text-[10px] text-slate-300 mt-0.5">
                    Socle ({simPricing.includedUsers} util.): {simPricing.basePrice.toLocaleString('fr-FR')} + {simPricing.extraUsers} supp. × {simPricing.extraUserRate.toLocaleString('fr-FR')} FCFA
                  </p>
                  <p className="text-[10px] font-bold text-emerald-300 mt-0.5">
                    Total ({simDurationMonths} mois) : {simPricing.periodTotal.toLocaleString('fr-FR')} FCFA
                  </p>
                </div>

                <div className="mt-2.5 pt-2 border-t border-white/10 flex items-center gap-1.5">
                  <select
                    value={simTargetClinicId}
                    onChange={(e) => setSimTargetClinicId(e.target.value)}
                    className="flex-1 px-2 py-1.5 bg-slate-950 border border-white/15 rounded-lg text-[11px] text-white focus:outline-none"
                  >
                    <option value="">-- Appliquer à une structure --</option>
                    {clinics.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name} (Actuel: {c.quotas?.maxUsers || 5} util.)
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={!simTargetClinicId || isApplyingSim}
                    onClick={handleApplySimToClinic}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-lg text-[11px] font-extrabold whitespace-nowrap cursor-pointer transition-all"
                  >
                    {isApplyingSim ? '...' : 'Appliquer'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* SEARCH BAR */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
          <input 
            type="text"
            placeholder="Rechercher une formule par nom, code..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-900/50 border border-white/10 rounded-2xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
          />
        </div>
      </div>

      {/* PLAN CARDS GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {planKeys.map(planKey => {
          const plan = plans[planKey];
          const subscribers = planSubscribersMap[planKey] || [];
          const isArchived = plan.status === 'ARCHIVED';
          const baseUsers = plan.max_users || (planKey.includes('ENTERPRISE') ? 100 : planKey.includes('PREMIUM') ? 35 : planKey.includes('BASIC') ? 5 : 15);
          const extraRate = plan.pricePerExtraUserFCFA !== undefined
            ? plan.pricePerExtraUserFCFA
            : (planKey.includes('ENTERPRISE') ? 5000 : planKey.includes('PREMIUM') ? 7000 : planKey.includes('BASIC') ? 10000 : 8500);
          const avgPerUser = baseUsers > 0 ? Math.round((plan.monthlyPriceFCFA || 0) / baseUsers) : 0;

          return (
            <div 
              key={planKey}
              className={`bg-gradient-to-b from-[#151928] to-[#0e111b] border rounded-2xl p-5 flex flex-col justify-between transition-all shadow-[0_10px_28px_rgba(0,0,0,0.45),inset_0_1px_0_0_rgba(255,255,255,0.12)] ${
                isArchived ? 'border-white/5 opacity-70' : 'border-white/15 hover:border-emerald-500/50'
              }`}
            >
              <div>
                {/* Header Tag & Status */}
                <div className="flex items-center justify-between mb-2.5">
                  <span className={`px-2.5 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider border ${plan.badgeColor}`}>
                    {plan.id}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${
                      plan.status === 'ACTIVE' 
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                        : 'bg-slate-700/50 text-slate-400'
                    }`}>
                      {plan.status === 'ACTIVE' ? 'Commercialisée' : 'Archivée'}
                    </span>
                  </div>
                </div>

                <h3 className="text-lg font-extrabold text-white">{plan.label}</h3>
                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  <span className="px-2.5 py-1 rounded-lg text-[11px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1.5">
                    <Users size={12} /> {baseUsers} util. inclus
                  </span>
                  <span className="px-2 py-1 rounded-lg text-[10px] font-bold bg-blue-500/15 text-blue-300 border border-blue-500/25">
                    +{extraRate.toLocaleString('fr-FR')} FCFA / util. supp.
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-2 line-clamp-2">{plan.description}</p>

                {/* Price Display */}
                <div className="mt-4 p-3.5 bg-slate-950/70 border border-white/10 rounded-xl">
                  <div className="flex items-baseline justify-between">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-2xl font-black text-white">
                        {plan.monthlyPriceFCFA.toLocaleString('fr-FR')}
                      </span>
                      <span className="text-xs font-bold text-rose-400">FCFA</span>
                      <span className="text-[10px] text-slate-500">/ mois</span>
                    </div>
                    <span className="text-[10px] font-mono font-bold text-emerald-400">
                      ~{avgPerUser.toLocaleString('fr-FR')} FCFA/siège
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1 flex items-center gap-1 font-bold">
                    <Calendar size={11} /> {plan.durationLabel}
                  </p>
                </div>

                {/* Included Services Count & List */}
                <div className="mt-4">
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="text-[11px] font-black uppercase tracking-wider text-slate-400">
                      Modules Inclus ({plan.includedServiceIds.length})
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                    {plan.includedServiceIds.map(srvId => {
                      const isImpl = hasImplementedModule(srvId);
                      return (
                        <span 
                          key={srvId} 
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            isImpl ? 'bg-slate-800 text-slate-300' : 'bg-rose-500/20 text-rose-300'
                          }`}
                        >
                          {srvId} {isImpl ? '✓' : '⚠️'}
                        </span>
                      );
                    })}
                  </div>
                </div>

                {/* Subscribed Clinics */}
                <div className="mt-4 pt-3 border-t border-white/10">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400 flex items-center gap-1.5 font-bold">
                      <Building2 size={14} className="text-rose-400" /> Structures souscrites :
                    </span>
                    <span className="font-black text-white px-2 py-0.5 bg-white/5 rounded-lg">
                      {subscribers.length} client{subscribers.length > 1 ? 's' : ''}
                    </span>
                  </div>

                  {subscribers.length > 0 && (
                    <button
                      onClick={() => setSelectedPlanForSubscribers(selectedPlanForSubscribers === planKey ? null : planKey)}
                      className="text-[11px] font-bold text-rose-400 hover:text-rose-300 mt-2 flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      {selectedPlanForSubscribers === planKey ? 'Masquer la liste' : 'Voir les cliniques abonnées & quotas'}
                      <ChevronDown size={12} className={`transition-transform ${selectedPlanForSubscribers === planKey ? 'rotate-180' : ''}`} />
                    </button>
                  )}

                  {/* Dropdown list of subscribed clinics */}
                  {selectedPlanForSubscribers === planKey && (
                    <div className="mt-2 p-2 bg-slate-950/80 border border-white/10 rounded-xl space-y-1.5 max-h-36 overflow-y-auto text-[11px]">
                      {subscribers.map(c => (
                        <div key={c.id} className="flex items-center justify-between py-1 px-2 hover:bg-white/5 rounded">
                          <span className="font-bold text-slate-200 truncate">{c.name}</span>
                          <span className="text-[10px] font-mono text-emerald-300 shrink-0 ml-2">
                            {c.usage?.activeUsers || 1}/{c.quotas?.maxUsers || baseUsers} util.
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

              </div>

              {/* Action Buttons */}
              <div className="mt-5 pt-3 border-t border-white/10 flex items-center justify-end gap-2">
                <button
                  onClick={() => handleTogglePlanStatus(planKey)}
                  className={`p-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    isArchived 
                      ? 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20' 
                      : 'bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white'
                  }`}
                  title={isArchived ? 'Réactiver la commercialisation' : 'Désactiver la commercialisation'}
                >
                  <Archive size={14} />
                </button>
                <button
                  onClick={() => handleOpenEditModal(planKey)}
                  className="px-4 py-2 bg-white/5 hover:bg-white/15 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <Edit size={14} /> Modifier Formule & Quotas
                </button>
              </div>

            </div>
          );
        })}
      </div>

      {/* MODAL: CREATE / EDIT FORMULA */}
      {showPlanModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
          <div className="bg-slate-900 border border-white/15 rounded-3xl max-w-2xl w-full p-6 md:p-7 relative max-h-[90vh] overflow-y-auto shadow-2xl">
            
            <div className="flex justify-between items-center mb-5">
              <div>
                <span className="text-[10px] uppercase font-black tracking-widest text-emerald-500">Configuration Commerciale & Quotas Utilisateurs</span>
                <h3 className="text-lg font-black text-white mt-0.5">
                  {editingPlanId ? `Modifier la Formule ${editingPlanId}` : 'Créer une Formule Commerciale'}
                </h3>
              </div>
              <button onClick={() => setShowPlanModal(false)} className="text-slate-400 hover:text-white cursor-pointer">✕</button>
            </div>

            <form onSubmit={handleSavePlan} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-400">Code / ID Stable *</label>
                  <input 
                    type="text"
                    required
                    disabled={!!editingPlanId}
                    placeholder="Ex: BASIC, STANDARD, PREMIUM"
                    value={planForm.id}
                    onChange={(e) => setPlanForm({...planForm, id: e.target.value.toUpperCase()})}
                    className="w-full mt-1 px-3 py-2 bg-slate-950 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500 disabled:opacity-50"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-400">Nom de la Licence (nom_licence) *</label>
                  <input 
                    type="text"
                    required
                    placeholder="Ex: Formule Standard (Centre Médical)"
                    value={planForm.label}
                    onChange={(e) => setPlanForm({...planForm, label: e.target.value, nom_licence: e.target.value})}
                    className="w-full mt-1 px-3 py-2 bg-slate-950 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              {/* User Quotas & Per-User Pricing Row */}
              <div className="p-3.5 bg-emerald-950/20 border border-emerald-500/30 rounded-2xl grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-bold text-emerald-300">Socle Utilisateurs Inclus *</label>
                  <input 
                    type="number"
                    required
                    min={1}
                    max={1000}
                    value={planForm.max_users}
                    onChange={(e) => setPlanForm({...planForm, max_users: Math.max(1, parseInt(e.target.value) || 1)})}
                    className="w-full mt-1 px-3 py-2 bg-slate-950 border border-emerald-500/40 rounded-xl text-xs font-mono font-bold text-emerald-300 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-emerald-300">Tarif Mensuel Socle (FCFA) *</label>
                  <input 
                    type="number"
                    required
                    min={0}
                    step={5000}
                    value={planForm.monthlyPriceFCFA}
                    onChange={(e) => setPlanForm({...planForm, monthlyPriceFCFA: Number(e.target.value)})}
                    className="w-full mt-1 px-3 py-2 bg-slate-950 border border-white/15 rounded-xl text-xs font-mono font-bold text-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-blue-300">Prix / Utilisateur Supp. (FCFA)</label>
                  <input 
                    type="number"
                    required
                    min={0}
                    step={500}
                    value={planForm.pricePerExtraUserFCFA}
                    onChange={(e) => setPlanForm({...planForm, pricePerExtraUserFCFA: Math.max(0, Number(e.target.value))})}
                    className="w-full mt-1 px-3 py-2 bg-slate-950 border border-blue-500/40 rounded-xl text-xs font-mono font-bold text-blue-300 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-400">Description Commerciale</label>
                  <input 
                    type="text"
                    value={planForm.description}
                    onChange={(e) => setPlanForm({...planForm, description: e.target.value})}
                    className="w-full mt-1 px-3 py-2 bg-slate-950 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-400">Durée d'Abonnement par défaut *</label>
                  <div className="flex items-center gap-2 mt-1">
                    <input 
                      type="number"
                      required
                      min={1}
                      max={100}
                      value={planForm.durationValue}
                      onChange={(e) => setPlanForm({ ...planForm, durationValue: Math.max(1, parseInt(e.target.value) || 1) })}
                      className="w-1/2 px-3 py-2 bg-slate-950 border border-white/10 rounded-xl text-xs font-bold text-white focus:outline-none"
                    />
                    <select 
                      value={planForm.durationUnit}
                      onChange={(e) => setPlanForm({ ...planForm, durationUnit: e.target.value as 'Mois' | 'Années' })}
                      className="w-1/2 px-3 py-2 bg-slate-950 border border-white/10 rounded-xl text-xs text-slate-300 focus:outline-none"
                    >
                      <option value="Mois">Mois</option>
                      <option value="Années">Années</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Module selection */}
              <div>
                <label className="text-xs font-bold text-slate-400 mb-2 block">
                  Sélection des Modules Inclus dans cette Formule :
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 bg-slate-950/60 p-3 rounded-2xl border border-white/5 max-h-44 overflow-y-auto">
                  {CANONICAL_MODULES.filter(m => m.serviceId).map(m => {
                    const isSelected = planForm.includedServiceIds.includes(m.serviceId!);

                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => toggleServiceInForm(m.serviceId!)}
                        className={`p-2 rounded-xl border text-left transition-all text-xs flex items-center justify-between cursor-pointer ${
                          isSelected 
                            ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300' 
                            : 'bg-slate-900 border-white/5 text-slate-400 hover:text-white'
                        }`}
                      >
                        <span className="font-bold line-clamp-1">{m.label}</span>
                        {isSelected && <Check size={14} className="text-emerald-400 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={planForm.syncSubscribedClinics}
                  onChange={(e) => setPlanForm({ ...planForm, syncSubscribedClinics: e.target.checked })}
                  className="rounded border-white/20 accent-emerald-500"
                />
                <span>Synchroniser immédiatement les structures clientes abonnées à cette formule dans la base de données</span>
              </label>

              <div className="flex justify-end gap-3 pt-3 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setShowPlanModal(false)}
                  className="px-5 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white transition-colors cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-emerald-900/30 transition-all disabled:opacity-50 cursor-pointer"
                >
                  {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
                  Enregistrer & Synchroniser
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

    </div>
  );
};
