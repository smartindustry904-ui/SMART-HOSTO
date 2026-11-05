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
  Users
} from 'lucide-react';
import { SAAS_PLANS, SaaSPlanId, SaaSPlan } from '../../src/config/plans';
import { CANONICAL_MODULES, hasImplementedModule } from '../../src/config/modules';
import { ClinicTenant } from '../../pages/ControlCenter';
import { db, sanitizeData } from '../../src/firebase';
import { doc, setDoc, updateDoc, collection, addDoc, onSnapshot } from 'firebase/firestore';
import { Licence } from '../../types';

interface SuperAdminLicensesProps {
  clinics: ClinicTenant[];
  currentUser?: any;
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  onNavigateToServices?: (clinicId: string) => void;
}

export interface CommercialPlanRecord extends SaaSPlan {
  status: 'ACTIVE' | 'ARCHIVED';
  durationLabel: string;
  nom_licence?: string;
  max_users?: number;
  createdAt?: string;
  updatedAt?: string;
}

export const SuperAdminLicenses: React.FC<SuperAdminLicensesProps> = ({
  clinics,
  currentUser,
  showToast,
  onNavigateToServices
}) => {
  // Plan Catalog state initialized with standard plans
  const [plans, setPlans] = useState<Record<string, CommercialPlanRecord>>(() => {
    const initial: Record<string, CommercialPlanRecord> = {};
    Object.keys(SAAS_PLANS).forEach((k) => {
      const p = SAAS_PLANS[k as SaaSPlanId];
      initial[k] = {
        ...p,
        status: 'ACTIVE',
        durationLabel: '1 Mois / 1 An renouvelable',
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01'
      };
    });
    return initial;
  });

  // Listen to both saas_plans and licences in Firestore to update formulas dynamically
  useEffect(() => {
    const unsubPlans = onSnapshot(collection(db, 'saas_plans'), (snapshot) => {
      const dbPlans: Record<string, CommercialPlanRecord> = {};
      snapshot.forEach((doc) => {
        const data = doc.data() as CommercialPlanRecord;
        if (data && data.id) {
          dbPlans[data.id] = {
            ...data,
            max_users: Number(data.max_users) || (data.id.includes('ENTERPRISE') ? 100 : data.id.includes('PREMIUM') ? 50 : data.id.includes('BASIC') ? 5 : 20)
          };
        }
      });
      if (Object.keys(dbPlans).length > 0) {
        setPlans(prev => ({
          ...prev,
          ...dbPlans
        }));
      }
    }, (err) => {
      console.warn('Note: saas_plans snapshot listener:', err);
    });

    const unsubLicences = onSnapshot(collection(db, 'licences'), (snapshot) => {
      const dbLicences: Record<string, CommercialPlanRecord> = {};
      snapshot.forEach((doc) => {
        const data = doc.data() as any;
        if (data && data.id) {
          const planKey = (data.nom_licence || data.id).toUpperCase().replace('LICENCE_', '');
          dbLicences[planKey] = {
            id: planKey,
            label: data.nom_licence || planKey,
            nom_licence: data.nom_licence || planKey,
            max_users: Number(data.max_users) || 5,
            description: data.description || '',
            monthlyPriceFCFA: Number(data.monthlyPriceFCFA) || 950000,
            badgeColor: planKey.includes('ENTERPRISE') ? 'bg-purple-500/20 text-purple-300 border-purple-500/30' : planKey.includes('PRO') ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30' : 'bg-blue-500/20 text-blue-300 border-blue-500/30',
            includedServiceIds: ['SRV-ACCUEIL', 'SRV-CONSULTATION', 'SRV-CAISSE', 'SRV-INFIRMIER'],
            status: data.status || 'ACTIVE',
            durationLabel: `${data.durationValue || 1} ${data.durationUnit || 'Années'}`,
            updatedAt: data.updatedAt || new Date().toISOString()
          };
        }
      });
      if (Object.keys(dbLicences).length > 0) {
        setPlans(prev => ({
          ...prev,
          ...dbLicences
        }));
      }
    }, (err) => {
      console.warn('Note: licences snapshot listener:', err);
    });

    return () => {
      unsubPlans();
      unsubLicences();
    };
  }, []);

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
    description: string;
    monthlyPriceFCFA: number;
    badgeColor: string;
    includedServiceIds: string[];
    durationValue: number;
    durationUnit: 'Mois' | 'Années';
    status: 'ACTIVE' | 'ARCHIVED';
  }>({
    id: '',
    label: '',
    nom_licence: '',
    max_users: 25,
    description: '',
    monthlyPriceFCFA: 1000000,
    badgeColor: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    includedServiceIds: ['SRV-ACCUEIL', 'SRV-CONSULTATION', 'SRV-CAISSE'],
    durationValue: 1,
    durationUnit: 'Années',
    status: 'ACTIVE'
  });

  // Count subscribers per plan
  const planSubscribersMap = useMemo(() => {
    const map: Record<string, ClinicTenant[]> = {};
    Object.keys(plans).forEach(k => { map[k] = []; });

    clinics.forEach(c => {
      const planKey = (c.nom_licence || c.licenseType || 'STANDARD').toUpperCase();
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
      max_users: 25,
      description: 'Définition des quotas utilisateurs et services inclus',
      monthlyPriceFCFA: 1200000,
      badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
      includedServiceIds: ['SRV-ACCUEIL', 'SRV-CONSULTATION', 'SRV-INFIRMIER', 'SRV-CAISSE'],
      durationValue: 1,
      durationUnit: 'Années',
      status: 'ACTIVE'
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

    const defaultUsers = p.max_users || (planId.includes('ENTERPRISE') ? 100 : planId.includes('PREMIUM') ? 50 : planId.includes('BASIC') ? 5 : 20);

    setPlanForm({
      id: p.id,
      label: p.label,
      nom_licence: p.nom_licence || p.label,
      max_users: defaultUsers,
      description: p.description,
      monthlyPriceFCFA: p.monthlyPriceFCFA,
      badgeColor: p.badgeColor,
      includedServiceIds: [...p.includedServiceIds],
      durationValue: parsedVal,
      durationUnit: parsedUnit,
      status: p.status || 'ACTIVE'
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

  // Save Plan & Synchronize Licence Quota schema
  const handleSavePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!planForm.label || !planForm.id) {
      showToast('Le nom de la licence et l\'identifiant sont requis', 'info');
      return;
    }

    setIsSubmitting(true);
    try {
      const formattedDuration = `${planForm.durationValue} ${planForm.durationUnit}`;
      const planPayload: CommercialPlanRecord = {
        ...planForm,
        nom_licence: planForm.label.trim(),
        max_users: Math.max(1, planForm.max_users || 1),
        durationLabel: formattedDuration,
        id: planForm.id.toUpperCase().trim(),
        updatedAt: new Date().toISOString()
      };

      // 1. Persist in saas_plans
      await setDoc(doc(db, 'saas_plans', planPayload.id), sanitizeData(planPayload));

      // 2. Persist in licences collection (The required Licences & Quotas database schema)
      const licenceId = `licence_${planPayload.id.toLowerCase()}`;
      const licenceRecord: Licence = {
        id: licenceId,
        nom_licence: planPayload.label.trim(),
        max_users: Math.max(1, planForm.max_users || 1),
        description: planPayload.description,
        monthlyPriceFCFA: planPayload.monthlyPriceFCFA,
        durationValue: planForm.durationValue,
        durationUnit: planForm.durationUnit,
        status: planPayload.status,
        updatedAt: new Date().toISOString()
      };
      await setDoc(doc(db, 'licences', licenceId), sanitizeData(licenceRecord));
      await setDoc(doc(db, 'subscription_plans', licenceId), sanitizeData(licenceRecord));

      // Also persist with the planKey as ID in licences for direct lookup
      await setDoc(doc(db, 'licences', planPayload.id.toLowerCase()), sanitizeData({
        ...licenceRecord,
        id: planPayload.id.toLowerCase()
      }));

      // Update local state
      setPlans(prev => ({
        ...prev,
        [planPayload.id]: planPayload
      }));

      // Audit Log
      await addDoc(collection(db, 'saas_logs'), sanitizeData({
        timestamp: new Date().toISOString(),
        user: currentUser?.username || 'superadmin',
        action: editingPlanId ? 'PLAN_UPDATE' : 'PLAN_CREATION',
        details: `Licence ${planPayload.id} (${planPayload.label}) enregistrée. Quota max_users : ${planPayload.max_users}. Prix : ${planPayload.monthlyPriceFCFA.toLocaleString()} FCFA`,
        category: 'LICENSE'
      }));

      showToast(`Licence "${planPayload.label}" enregistrée avec succès (Quota : ${planPayload.max_users} utilisateurs max).`, 'success');
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
    <div className="space-y-6 animate-in fade-in duration-300">
      
      {/* HEADER BAR */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/60 border border-white/10 p-5 rounded-3xl backdrop-blur-xl">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              Offre Commerciale
            </span>
            <span className="text-xs text-slate-400 font-bold">• Catalogue Central des Licences SaaS</span>
          </div>
          <h2 className="text-2xl font-black text-white mt-1">Formules & Abonnements SmartHosto</h2>
        </div>

        <button
          onClick={handleOpenCreateModal}
          className="px-5 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl font-black text-xs uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-emerald-900/30 transition-all cursor-pointer self-start sm:self-auto"
        >
          <Plus size={16} /> Nouvelle Formule Commerciale
        </button>
      </div>

      {/* NOTICE REGARDING CONTRACTUAL INTEGRITY */}
      <div className="p-4 bg-slate-900/40 border border-white/5 rounded-2xl flex items-start gap-3 text-xs text-slate-400">
        <Info size={18} className="text-blue-400 shrink-0 mt-0.5" />
        <div>
          <p className="font-bold text-slate-200">Garantie d'Intégrité Commerciale & Versionnement :</p>
          <p className="mt-0.5">
            Toute modification de prix ou de services dans le catalogue s'applique aux futurs contrats et renouvellements. 
            Les abonnements en cours et les factures déjà émises demeurent strictement intangibles.
          </p>
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {planKeys.map(planKey => {
          const plan = plans[planKey];
          const subscribers = planSubscribersMap[planKey] || [];
          const isArchived = plan.status === 'ARCHIVED';

          return (
            <div 
              key={planKey}
              className={`bg-slate-900/50 border rounded-3xl p-6 flex flex-col justify-between transition-all backdrop-blur-xl ${
                isArchived ? 'border-white/5 opacity-70' : 'border-white/10 hover:border-emerald-500/50'
              }`}
            >
              <div>
                {/* Header Tag & Status */}
                <div className="flex items-center justify-between mb-3">
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

                <h3 className="text-xl font-black text-white">{plan.label}</h3>
                <div className="flex items-center gap-2 mt-2">
                  <span className="px-2.5 py-1 rounded-lg text-[11px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1.5">
                    <Users size={12} /> Quota : {plan.max_users || (planKey.includes('ENTERPRISE') ? 100 : planKey.includes('PRO') || planKey.includes('PREMIUM') ? 25 : 5)} utilisateurs max
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-2 line-clamp-2">{plan.description}</p>

                {/* Price Display */}
                <div className="mt-5 p-4 bg-slate-950/60 border border-white/5 rounded-2xl">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-3xl font-black text-white">
                      {plan.monthlyPriceFCFA.toLocaleString('fr-FR')}
                    </span>
                    <span className="text-xs font-bold text-rose-400">FCFA</span>
                    <span className="text-[10px] text-slate-500">/ mois</span>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1 flex items-center gap-1 font-bold">
                    <Calendar size={12} /> {plan.durationLabel}
                  </p>
                </div>

                {/* Included Services Count & List */}
                <div className="mt-5">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-black uppercase tracking-wider text-slate-400">
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
                          {srvId} {isImpl ? '✓' : '⚠️ Non implémenté'}
                        </span>
                      );
                    })}
                  </div>
                </div>

                {/* Subscribed Clinics */}
                <div className="mt-5 pt-4 border-t border-white/5">
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
                      className="text-[11px] font-bold text-rose-400 hover:text-rose-300 mt-2 flex items-center gap-1 transition-colors"
                    >
                      {selectedPlanForSubscribers === planKey ? 'Masquer la liste' : 'Voir les cliniques abonnées'}
                      <ChevronDown size={12} className={`transition-transform ${selectedPlanForSubscribers === planKey ? 'rotate-180' : ''}`} />
                    </button>
                  )}

                  {/* Dropdown list of subscribed clinics */}
                  {selectedPlanForSubscribers === planKey && (
                    <div className="mt-2 p-2 bg-slate-950/80 border border-white/5 rounded-xl space-y-1.5 max-h-36 overflow-y-auto text-[11px]">
                      {subscribers.map(c => (
                        <div key={c.id} className="flex items-center justify-between py-1 px-2 hover:bg-white/5 rounded">
                          <span className="font-bold text-slate-200">{c.name}</span>
                          <span className="text-[10px] text-slate-500">{c.city}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

              </div>

              {/* Action Buttons */}
              <div className="mt-6 pt-4 border-t border-white/5 flex items-center justify-end gap-2">
                <button
                  onClick={() => handleTogglePlanStatus(planKey)}
                  className={`p-2 rounded-xl text-xs font-bold transition-all ${
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
                  className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all"
                >
                  <Edit size={14} /> Modifier
                </button>
              </div>

            </div>
          );
        })}
      </div>

      {/* MODAL: CREATE / EDIT FORMULA */}
      {showPlanModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
          <div className="bg-slate-900 border border-white/10 rounded-3xl max-w-2xl w-full p-6 md:p-8 relative max-h-[90vh] overflow-y-auto">
            
            <div className="flex justify-between items-center mb-6">
              <div>
                <span className="text-[10px] uppercase font-black tracking-widest text-emerald-500">Configuration Commerciale</span>
                <h3 className="text-xl font-black text-white mt-0.5">
                  {editingPlanId ? `Modifier la Formule ${editingPlanId}` : 'Créer une Formule Commerciale'}
                </h3>
              </div>
              <button onClick={() => setShowPlanModal(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            <form onSubmit={handleSavePlan} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-400">Code / ID Stable *</label>
                  <input 
                    type="text"
                    required
                    disabled={!!editingPlanId}
                    placeholder="Ex: BASIC, PRO, ENTERPRISE"
                    value={planForm.id}
                    onChange={(e) => setPlanForm({...planForm, id: e.target.value.toUpperCase()})}
                    className="w-full mt-1.5 px-3 py-2.5 bg-slate-950 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500 disabled:opacity-50"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-400">Nom de la Licence (nom_licence) *</label>
                  <input 
                    type="text"
                    required
                    placeholder="Ex: Basic, Pro, Enterprise"
                    value={planForm.label}
                    onChange={(e) => setPlanForm({...planForm, label: e.target.value, nom_licence: e.target.value})}
                    className="w-full mt-1.5 px-3 py-2.5 bg-slate-950 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-400 flex items-center justify-between">
                    <span>Limite Utilisateurs (max_users) *</span>
                    <span className="text-[10px] text-emerald-400 font-mono font-bold">Quota</span>
                  </label>
                  <input 
                    type="number"
                    required
                    min={1}
                    max={1000}
                    placeholder="Ex: 5, 25, 100"
                    value={planForm.max_users}
                    onChange={(e) => setPlanForm({...planForm, max_users: Math.max(1, parseInt(e.target.value) || 1)})}
                    className="w-full mt-1.5 px-3 py-2.5 bg-emerald-950/30 border border-emerald-500/40 rounded-xl text-xs font-mono font-bold text-emerald-300 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-400">Description Commerciale</label>
                <textarea 
                  rows={2}
                  value={planForm.description}
                  onChange={(e) => setPlanForm({...planForm, description: e.target.value})}
                  className="w-full mt-1.5 px-4 py-2 bg-slate-950 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-400">Tarif Mensuel (FCFA) *</label>
                  <input 
                    type="number"
                    required
                    min={0}
                    step={10000}
                    value={planForm.monthlyPriceFCFA}
                    onChange={(e) => setPlanForm({...planForm, monthlyPriceFCFA: Number(e.target.value)})}
                    className="w-full mt-1.5 px-4 py-2.5 bg-slate-950 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-400">Durée d'Abonnement *</label>
                  <div className="flex items-center gap-2 mt-1.5">
                    <input 
                      type="number"
                      required
                      min={1}
                      max={100}
                      value={planForm.durationValue}
                      onChange={(e) => setPlanForm({ ...planForm, durationValue: Math.max(1, parseInt(e.target.value) || 1) })}
                      className="w-1/2 px-4 py-2.5 bg-slate-950 border border-white/10 rounded-xl text-xs font-bold text-white focus:outline-none focus:border-emerald-500"
                    />
                    <select 
                      value={planForm.durationUnit}
                      onChange={(e) => setPlanForm({ ...planForm, durationUnit: e.target.value as 'Mois' | 'Années' })}
                      className="w-1/2 px-4 py-2.5 bg-slate-950 border border-white/10 rounded-xl text-xs text-slate-300 focus:outline-none focus:border-emerald-500"
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
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 bg-slate-950/60 p-3 rounded-2xl border border-white/5 max-h-48 overflow-y-auto">
                  {CANONICAL_MODULES.filter(m => m.serviceId).map(m => {
                    const isSelected = planForm.includedServiceIds.includes(m.serviceId!);
                    const isImplemented = m.status === 'IMPLEMENTED';

                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => toggleServiceInForm(m.serviceId!)}
                        className={`p-2.5 rounded-xl border text-left transition-all text-xs flex items-center justify-between ${
                          isSelected 
                            ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300' 
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

              <div className="flex justify-end gap-3 pt-4 border-t border-white/5">
                <button
                  type="button"
                  onClick={() => setShowPlanModal(false)}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold text-slate-400 hover:text-white transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-emerald-900/30 transition-all disabled:opacity-50"
                >
                  {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
                  Enregistrer la Formule
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

    </div>
  );
};
