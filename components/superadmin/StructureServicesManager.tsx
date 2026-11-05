import React, { useState, useMemo } from 'react';
import { 
  Building2, 
  Layers, 
  Search, 
  Filter, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  Lock, 
  Unlock, 
  Sliders, 
  ChevronRight, 
  ArrowLeft, 
  RefreshCw, 
  Plus, 
  ShieldCheck, 
  ShieldAlert, 
  Eye, 
  EyeOff, 
  Check, 
  X, 
  HelpCircle,
  Activity,
  Award,
  Zap,
  Loader2,
  DollarSign
} from 'lucide-react';
import { SAAS_PLANS, SaaSPlanId, StructureServiceEntitlement, computeStructureEntitlements } from '../../src/config/plans';
import { CANONICAL_MODULES, hasImplementedModule, getModuleForService } from '../../src/config/modules';
import { db, sanitizeData } from '../../src/firebase';
import { doc, updateDoc, setDoc, addDoc, collection } from 'firebase/firestore';

export interface StructureServicesManagerProps {
  clinics: any[];
  currentUser?: any;
  onSwitchTenantContext?: (clinic: any) => void;
  showToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
  initialSelectedClinicId?: string | null;
}

export const StructureServicesManager: React.FC<StructureServicesManagerProps> = ({
  clinics,
  currentUser,
  onSwitchTenantContext,
  showToast = (msg: string, _type?: 'success' | 'error' | 'info') => console.log(msg),
  initialSelectedClinicId = null
}) => {
  // Navigation & selection
  const [selectedClinicId, setSelectedClinicId] = useState<string | null>(initialSelectedClinicId);

  // Filters for structure general list
  const [structureSearch, setStructureSearch] = useState('');
  const [filterPlan, setFilterPlan] = useState<string>('ALL');
  const [filterStructureType, setFilterStructureType] = useState<string>('ALL');

  // Filters for detailed service view
  const [serviceSearch, setServiceSearch] = useState('');
  const [serviceEntitlementFilter, setServiceEntitlementFilter] = useState<'ALL' | 'IN_PLAN' | 'CUSTOM_GRANTED' | 'NOT_IN_PLAN'>('ALL');
  const [serviceStatusFilter, setServiceStatusFilter] = useState<'ALL' | 'active' | 'inactive'>('ALL');

  // Confirmation Modals State
  const [confirmAction, setConfirmAction] = useState<{
    type: 'REVOKE_RIGHT' | 'DEACTIVATE' | 'CHANGE_PLAN';
    service?: StructureServiceEntitlement;
    newPlan?: SaaSPlanId;
  } | null>(null);

  // Action in progress indicator
  const [isProcessing, setIsProcessing] = useState<string | null>(null);

  // Find currently selected clinic
  const selectedClinic = useMemo(() => {
    return clinics.find(c => c.id === selectedClinicId) || null;
  }, [clinics, selectedClinicId]);

  // Compute entitlements for the selected clinic
  const detailedServices = useMemo(() => {
    if (!selectedClinic) return [];
    return computeStructureEntitlements(
      selectedClinic.licenseType as SaaSPlanId,
      selectedClinic.servicesConfig || {}
    );
  }, [selectedClinic]);

  // Global KPIs across all clinics
  const globalKPIs = useMemo(() => {
    let totalAuthorized = 0;
    let totalActivated = 0;
    clinics.forEach(c => {
      const entitlements = computeStructureEntitlements(c.licenseType, c.servicesConfig || {});
      totalAuthorized += entitlements.filter(e => e.isAuthorized).length;
      totalActivated += entitlements.filter(e => e.is_active).length;
    });
    return {
      totalClinics: clinics.length,
      avgAuthorized: clinics.length > 0 ? Math.round(totalAuthorized / clinics.length) : 0,
      totalActivated
    };
  }, [clinics]);

  // Filtered general list of clinics
  const filteredClinics = useMemo(() => {
    return clinics.filter(c => {
      const q = structureSearch.toLowerCase().trim();
      const matchesSearch = !q || 
        (c.name || '').toLowerCase().includes(q) || 
        (c.id || '').toLowerCase().includes(q) ||
        (c.city || '').toLowerCase().includes(q);
      const matchesPlan = filterPlan === 'ALL' || c.licenseType === filterPlan;
      const matchesType = filterStructureType === 'ALL' || c.structureType === filterStructureType;
      return matchesSearch && matchesPlan && matchesType;
    });
  }, [clinics, structureSearch, filterPlan, filterStructureType]);

  // Filtered detailed services for selected clinic
  const filteredDetailedServices = useMemo(() => {
    return detailedServices.filter(s => {
      const q = serviceSearch.toLowerCase().trim();
      const matchesSearch = !q || 
        s.serviceName.toLowerCase().includes(q) || 
        s.serviceId.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q);
      
      let matchesEntitlement = true;
      if (serviceEntitlementFilter === 'IN_PLAN') matchesEntitlement = s.isInPlan && !s.isRevoked;
      else if (serviceEntitlementFilter === 'CUSTOM_GRANTED') matchesEntitlement = s.isCustomGranted;
      else if (serviceEntitlementFilter === 'NOT_IN_PLAN') matchesEntitlement = !s.isAuthorized;

      let matchesStatus = true;
      if (serviceStatusFilter === 'active') matchesStatus = s.is_active;
      else if (serviceStatusFilter === 'inactive') matchesStatus = !s.is_active;

      return matchesSearch && matchesEntitlement && matchesStatus;
    });
  }, [detailedServices, serviceSearch, serviceEntitlementFilter, serviceStatusFilter]);

  // Log action to SaaS Audit
  const logAudit = async (action: string, details: string, clinicId: string, clinicName: string) => {
    try {
      await addDoc(collection(db, 'saas_logs'), sanitizeData({
        timestamp: new Date().toISOString(),
        user: currentUser?.name || 'Super Administrateur',
        clinicId,
        clinicName,
        action,
        details,
        category: 'MODULE'
      }));
    } catch (e) {
      console.warn("Audit logging failed:", e);
    }
  };

  // Helper: Persist updated servicesConfig for the current clinic
  const saveClinicServicesConfig = async (
    clinicId: string, 
    updatedServicesConfig: Record<string, any>,
    successMessage: string,
    auditAction: string,
    auditDetails: string
  ) => {
    setIsProcessing(clinicId);
    try {
      const clinicRef = doc(db, 'saas_clinics', clinicId);
      await updateDoc(clinicRef, {
        servicesConfig: sanitizeData(updatedServicesConfig),
        updatedAt: new Date().toISOString()
      });
      await logAudit(auditAction, auditDetails, clinicId, selectedClinic?.name || clinicId);
      showToast(successMessage, 'success');
    } catch (error: any) {
      console.error("Error updating structure services in Firestore:", error);
      showToast(`Erreur lors de la mise à jour : ${error.message || error}`, 'error');
    } finally {
      setIsProcessing(null);
      setConfirmAction(null);
    }
  };

  // Action 1: Toggle Service Activation for this structure
  const handleToggleService = async (service: StructureServiceEntitlement) => {
    if (!selectedClinic) return;
    if (!service.isImplemented) {
      showToast(`Impossible d'activer le service "${service.serviceName}" : aucun module fonctionnel n'est implémenté dans le code.`, 'error');
      return;
    }
    if (!service.isAuthorized) {
      showToast(`Impossible d'activer le service "${service.serviceName}" : il n'est pas autorisé dans le contrat de cette structure. Accordez d'abord le droit.`, 'error');
      return;
    }

    const nextActive = !service.is_active;

    // If deactivating, confirm if needed
    if (!nextActive) {
      setConfirmAction({
        type: 'DEACTIVATE',
        service
      });
      return;
    }

    const currentConfig = { ...(selectedClinic.servicesConfig || {}) };
    const currentItem = currentConfig[service.serviceId] || {};

    const updatedConfig = {
      ...currentConfig,
      [service.serviceId]: {
        ...currentItem,
        isAuthorized: true,
        status: 'active' as const,
        is_active: true,
        updatedAt: new Date().toISOString(),
        updatedBy: currentUser?.name || 'Super Admin'
      }
    };

    await saveClinicServicesConfig(
      selectedClinic.id,
      updatedConfig,
      `Service "${service.serviceName}" activé avec succès pour ${selectedClinic.name}. Visible immédiatement à l'accueil.`,
      'Activation Service',
      `Activation du service ${service.serviceName} (${service.serviceId}) pour ${selectedClinic.name}`
    );
  };

  // Action 2: Grant Contractual Option (Custom Right)
  const handleGrantOption = async (service: StructureServiceEntitlement) => {
    if (!selectedClinic) return;

    const currentConfig = { ...(selectedClinic.servicesConfig || {}) };
    const currentItem = currentConfig[service.serviceId] || {};

    // Grant custom option and activate it if implemented
    const isActivable = service.isImplemented;
    const updatedConfig = {
      ...currentConfig,
      [service.serviceId]: {
        ...currentItem,
        isAuthorized: true,
        isCustomGranted: true,
        isRevoked: false,
        status: isActivable ? 'active' : 'inactive',
        is_active: isActivable,
        updatedAt: new Date().toISOString(),
        updatedBy: currentUser?.name || 'Super Admin'
      }
    };

    await saveClinicServicesConfig(
      selectedClinic.id,
      updatedConfig,
      `Droit d'accès accordé en option pour "${service.serviceName}" à la structure ${selectedClinic.name}.`,
      'Attribution Droit Optionnel',
      `Attribution de l'option ${service.serviceName} (${service.serviceId}) pour ${selectedClinic.name}`
    );
  };

  // Action 3: Revoke Contractual Right
  const handleConfirmRevoke = async () => {
    if (!selectedClinic || !confirmAction?.service) return;
    const service = confirmAction.service;

    const currentConfig = { ...(selectedClinic.servicesConfig || {}) };
    const currentItem = currentConfig[service.serviceId] || {};

    const updatedConfig = {
      ...currentConfig,
      [service.serviceId]: {
        ...currentItem,
        isAuthorized: false,
        isCustomGranted: false,
        isRevoked: true,
        status: 'inactive' as const,
        is_active: false,
        updatedAt: new Date().toISOString(),
        updatedBy: currentUser?.name || 'Super Admin'
      }
    };

    await saveClinicServicesConfig(
      selectedClinic.id,
      updatedConfig,
      `Droit révoqué : Le service "${service.serviceName}" a été retiré des autorisations de ${selectedClinic.name}.`,
      'Révocation Droit Service',
      `Révocation du service ${service.serviceName} (${service.serviceId}) pour ${selectedClinic.name}`
    );
  };

  // Action 4: Confirm Deactivation
  const handleConfirmDeactivate = async () => {
    if (!selectedClinic || !confirmAction?.service) return;
    const service = confirmAction.service;

    const currentConfig = { ...(selectedClinic.servicesConfig || {}) };
    const currentItem = currentConfig[service.serviceId] || {};

    const updatedConfig = {
      ...currentConfig,
      [service.serviceId]: {
        ...currentItem,
        status: 'inactive' as const,
        is_active: false,
        updatedAt: new Date().toISOString(),
        updatedBy: currentUser?.name || 'Super Admin'
      }
    };

    await saveClinicServicesConfig(
      selectedClinic.id,
      updatedConfig,
      `Service "${service.serviceName}" désactivé pour ${selectedClinic.name}. Masqué immédiatement de l'accueil.`,
      'Désactivation Service',
      `Désactivation du service ${service.serviceName} (${service.serviceId}) pour ${selectedClinic.name}`
    );
  };

  // Action 5: Change Subscribed Plan
  const handleChangePlan = async (newPlanId: SaaSPlanId) => {
    if (!selectedClinic) return;
    setIsProcessing(selectedClinic.id);

    try {
      const plan = SAAS_PLANS[newPlanId];
      const nextPrice = plan.monthlyPriceFCFA;
      
      // Recompute entitlements with the new plan baseline while preserving custom overrides
      const newEntitlements = computeStructureEntitlements(newPlanId, selectedClinic.servicesConfig || {});
      const newServicesConfig: Record<string, any> = {};
      
      newEntitlements.forEach(e => {
        newServicesConfig[e.serviceId] = {
          isAuthorized: e.isAuthorized,
          isCustomGranted: e.isCustomGranted,
          isRevoked: e.isRevoked,
          status: e.status,
          is_active: e.is_active,
          specificSettings: e.specificSettings || {}
        };
      });

      const clinicRef = doc(db, 'saas_clinics', selectedClinic.id);
      await updateDoc(clinicRef, {
        licenseType: newPlanId,
        licensePrice: nextPrice,
        servicesConfig: sanitizeData(newServicesConfig),
        updatedAt: new Date().toISOString()
      });

      await logAudit(
        'Changement de Forfait',
        `Migration au forfait ${plan.label} (${newPlanId}) pour ${selectedClinic.name}. Services inclus réalignés.`,
        selectedClinic.id,
        selectedClinic.name
      );

      showToast(`Forfait de ${selectedClinic.name} mis à jour : ${plan.label}.`, 'success');
    } catch (e: any) {
      console.error("Failed to update plan:", e);
      showToast(`Échec du changement de forfait : ${e.message || e}`, 'error');
    } finally {
      setIsProcessing(null);
      setConfirmAction(null);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      
      {/* ============================================================== */}
      {/* VUE 1 : VUE GÉNÉRALE DES STRUCTURES (Aucune structure choisie) */}
      {/* ============================================================== */}
      {!selectedClinic && (
        <div className="space-y-6">
          {/* Header */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-white/10 pb-6">
            <div>
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 bg-rose-600/20 text-rose-400 border border-rose-500/30 rounded-2xl flex items-center justify-center shadow-lg shadow-rose-900/20">
                  <Building2 size={22} />
                </div>
                <div>
                  <h2 className="text-xl font-extrabold text-white flex items-center gap-2">
                    Services & Départements par Structure
                    <span className="text-[10px] bg-rose-500/20 text-rose-300 border border-rose-500/30 px-2.5 py-0.5 rounded-full font-black uppercase">
                      Gouvernance Super Admin
                    </span>
                  </h2>
                  <p className="text-xs text-slate-400 font-medium">
                    Gestion commerciale et contractuelle stricte des services autorisés et activés pour chaque centre médical client.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 bg-slate-950/60 border border-white/5 px-4 py-2 rounded-2xl text-xs font-bold text-slate-400">
              <span>{globalKPIs.totalClinics} structures enregistrées</span>
              <span className="text-slate-600">•</span>
              <span className="text-emerald-400 font-extrabold">{globalKPIs.totalActivated} services actifs</span>
            </div>
          </div>

          {/* KPI Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-slate-900/60 border border-white/5 p-5 rounded-3xl relative overflow-hidden">
              <p className="text-[10px] uppercase font-black text-slate-400 tracking-wider">Structures Clientes</p>
              <h3 className="text-3xl font-extrabold text-white mt-1.5">{globalKPIs.totalClinics}</h3>
              <p className="text-[10px] text-slate-500 font-bold mt-1">Établissements avec isolation multi-tenant</p>
            </div>
            <div className="bg-slate-900/60 border border-white/5 p-5 rounded-3xl relative overflow-hidden">
              <p className="text-[10px] uppercase font-black text-slate-400 tracking-wider">Moyenne Services Autorisés</p>
              <h3 className="text-3xl font-extrabold text-indigo-400 mt-1.5">{globalKPIs.avgAuthorized} <span className="text-sm font-bold text-slate-400">/ structure</span></h3>
              <p className="text-[10px] text-slate-500 font-bold mt-1">Dépend du forfait souscrit (Demo, Basic, Standard, etc.)</p>
            </div>
            <div className="bg-slate-900/60 border border-white/5 p-5 rounded-3xl relative overflow-hidden">
              <p className="text-[10px] uppercase font-black text-slate-400 tracking-wider">Services Déployés & Actifs</p>
              <h3 className="text-3xl font-extrabold text-emerald-400 mt-1.5">{globalKPIs.totalActivated}</h3>
              <p className="text-[10px] text-slate-500 font-bold mt-1">Actuellement visibles sur les accueils clients</p>
            </div>
          </div>

          {/* Search & Filters */}
          <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-4 flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                placeholder="Rechercher une structure par nom, ID ou ville..."
                value={structureSearch}
                onChange={e => setStructureSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-white/10 rounded-xl text-xs text-white outline-none focus:border-rose-500 font-medium"
              />
            </div>

            <div className="flex gap-2">
              <select
                value={filterPlan}
                onChange={e => setFilterPlan(e.target.value)}
                className="px-3 py-2 bg-slate-950 border border-white/10 rounded-xl text-xs text-slate-300 font-bold outline-none focus:border-rose-500"
              >
                <option value="ALL">Tous les forfaits</option>
                <option value="DEMO">DEMO</option>
                <option value="BASIC">BASIC</option>
                <option value="STANDARD">STANDARD</option>
                <option value="PREMIUM">PREMIUM</option>
                <option value="ENTERPRISE">ENTERPRISE</option>
              </select>

              <select
                value={filterStructureType}
                onChange={e => setFilterStructureType(e.target.value)}
                className="px-3 py-2 bg-slate-950 border border-white/10 rounded-xl text-xs text-slate-300 font-bold outline-none focus:border-rose-500"
              >
                <option value="ALL">Tous les types</option>
                <option value="Clinique">Clinique</option>
                <option value="Centre médical">Centre médical</option>
                <option value="Cabinet médical">Cabinet médical</option>
                <option value="Hôpital">Hôpital</option>
              </select>
            </div>
          </div>

          {/* General Structures List */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredClinics.map(clinic => {
              const plan = SAAS_PLANS[clinic.licenseType as SaaSPlanId] || SAAS_PLANS.STANDARD;
              const entitlements = computeStructureEntitlements(clinic.licenseType as SaaSPlanId, clinic.servicesConfig || {});
              const authorizedCount = entitlements.filter(e => e.isAuthorized).length;
              const activeCount = entitlements.filter(e => e.is_active).length;
              const inactiveCount = entitlements.filter(e => e.isAuthorized && !e.is_active).length;

              return (
                <div
                  key={clinic.id}
                  className="bg-slate-900/80 border border-white/10 rounded-3xl p-6 hover:border-rose-500/40 transition-all flex flex-col justify-between group shadow-lg"
                >
                  <div className="space-y-4">
                    {/* Header Card */}
                    <div className="flex justify-between items-start gap-2">
                      <div>
                        <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase border ${plan.badgeColor}`}>
                          Plan {plan.label}
                        </span>
                        <h3 className="text-base font-extrabold text-white mt-1.5 group-hover:text-rose-400 transition-colors">
                          {clinic.name}
                        </h3>
                        <p className="text-[10px] text-slate-500 font-mono">ID: {clinic.id}</p>
                      </div>

                      <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${
                        clinic.status === 'ACTIVE' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-slate-800 text-slate-400'
                      }`}>
                        {clinic.status}
                      </span>
                    </div>

                    <p className="text-xs text-slate-400">
                      {clinic.address ? `${clinic.address}, ` : ''}{clinic.city || 'Ville non spécifiée'}
                    </p>

                    {/* Stats Metrics for this Clinic */}
                    <div className="grid grid-cols-3 gap-2 bg-slate-950/70 border border-white/5 p-3 rounded-2xl text-center">
                      <div>
                        <p className="text-[9px] font-black text-slate-500 uppercase">Autorisés</p>
                        <p className="text-base font-extrabold text-indigo-400 mt-0.5">{authorizedCount}</p>
                      </div>
                      <div className="border-x border-white/5">
                        <p className="text-[9px] font-black text-slate-500 uppercase">Activés</p>
                        <p className="text-base font-extrabold text-emerald-400 mt-0.5">{activeCount}</p>
                      </div>
                      <div>
                        <p className="text-[9px] font-black text-slate-500 uppercase">Désactivés</p>
                        <p className="text-base font-extrabold text-slate-400 mt-0.5">{inactiveCount}</p>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="pt-5 mt-5 border-t border-white/5 flex gap-2">
                    <button
                      onClick={() => setSelectedClinicId(clinic.id)}
                      className="flex-1 py-3 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 shadow-md shadow-rose-900/20 cursor-pointer"
                    >
                      <Sliders size={13} /> Gérer les Services
                    </button>
                    {onSwitchTenantContext && (
                      <button
                        onClick={() => onSwitchTenantContext(clinic)}
                        className="p-3 bg-white/5 hover:bg-white/10 text-slate-300 rounded-xl transition-colors cursor-pointer"
                        title="Tester l'accueil de cette clinique en session isolée"
                      >
                        <Eye size={15} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* VUE 2 : VUE DÉTAILLÉE D'UNE STRUCTURE SÉLECTIONNÉE            */}
      {/* ============================================================== */}
      {selectedClinic && (
        <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
          
          {/* Top Bar with Return Button & Structure Switcher */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-900 border border-white/10 p-5 rounded-3xl">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSelectedClinicId(null)}
                className="p-2.5 bg-white/5 hover:bg-white/10 text-slate-300 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 text-xs font-bold"
              >
                <ArrowLeft size={16} /> Toutes les structures
              </button>

              <div className="h-6 w-px bg-white/10 hidden sm:block" />

              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-extrabold text-white">{selectedClinic.name}</h2>
                  <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase border ${
                    (SAAS_PLANS[selectedClinic.licenseType as SaaSPlanId] || SAAS_PLANS.STANDARD).badgeColor
                  }`}>
                    Forfait {selectedClinic.licenseType}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 font-mono">
                  Identifiant Tenant : {selectedClinic.id} • {selectedClinic.structureType || 'Structure Médicale'}
                </p>
              </div>
            </div>

            {/* Structure Quick Dropdown Switcher */}
            <div className="flex items-center gap-3 w-full md:w-auto">
              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-400 font-bold text-[11px] whitespace-nowrap">Changer de structure :</span>
                <select
                  value={selectedClinic.id}
                  onChange={e => setSelectedClinicId(e.target.value)}
                  className="bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-xs text-white font-bold outline-none focus:border-rose-500"
                >
                  {clinics.map(c => (
                    <option key={c.id} value={c.id}>{c.name} ({c.licenseType})</option>
                  ))}
                </select>
              </div>

              {onSwitchTenantContext && (
                <button
                  onClick={() => onSwitchTenantContext(selectedClinic)}
                  className="px-3.5 py-2 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                  title="Simuler et ouvrir l'Accueil de cette clinique"
                >
                  <Eye size={13} /> Tester l'Accueil
                </button>
              )}
            </div>
          </div>

          {/* Plan & Entitlements Governance Banner */}
          <div className="bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border border-white/10 p-6 rounded-3xl space-y-4">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-white/10 pb-4">
              <div>
                <h3 className="text-sm font-black uppercase text-indigo-400 tracking-wider flex items-center gap-2">
                  <Award size={16} /> Contrat Commercial & Forfait Souscrit
                </h3>
                <p className="text-xs text-slate-300 mt-1">
                  Les modules autorisés sont automatiquement calculés à partir du forfait. Le Super Admin peut accorder des options supplémentaires ou révoquer des droits.
                </p>
              </div>

              {/* Change Plan Selector */}
              <div className="flex items-center gap-2 bg-slate-950/80 border border-white/10 p-2 rounded-2xl">
                <span className="text-[11px] font-bold text-slate-400 pl-2">Modifier le forfait :</span>
                <select
                  value={selectedClinic.licenseType}
                  onChange={e => handleChangePlan(e.target.value as SaaSPlanId)}
                  disabled={isProcessing === selectedClinic.id}
                  className="bg-indigo-900/40 border border-indigo-500/40 rounded-xl px-3 py-1.5 text-xs text-indigo-200 font-extrabold outline-none focus:border-rose-500 cursor-pointer"
                >
                  <option value="DEMO">DEMO (3 modules inclus)</option>
                  <option value="BASIC">BASIC (5 modules inclus)</option>
                  <option value="STANDARD">STANDARD (6 modules inclus)</option>
                  <option value="PREMIUM">PREMIUM (9 modules inclus)</option>
                  <option value="ENTERPRISE">ENTERPRISE (Tous les modules)</option>
                </select>
              </div>
            </div>

            {/* Quick Status Count of this Structure */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-slate-950/60 p-3 rounded-2xl border border-white/5">
                <span className="text-[10px] font-bold text-slate-500 uppercase">Services Autorisés</span>
                <p className="text-lg font-black text-indigo-400">
                  {detailedServices.filter(s => s.isAuthorized).length} / {detailedServices.length}
                </p>
              </div>
              <div className="bg-slate-950/60 p-3 rounded-2xl border border-white/5">
                <span className="text-[10px] font-bold text-slate-500 uppercase">Activés à l'Accueil</span>
                <p className="text-lg font-black text-emerald-400">
                  {detailedServices.filter(s => s.is_active).length} actifs
                </p>
              </div>
              <div className="bg-slate-950/60 p-3 rounded-2xl border border-white/5">
                <span className="text-[10px] font-bold text-slate-500 uppercase">Désactivés / En attente</span>
                <p className="text-lg font-black text-slate-400">
                  {detailedServices.filter(s => s.isAuthorized && !s.is_active).length}
                </p>
              </div>
              <div className="bg-slate-950/60 p-3 rounded-2xl border border-white/5">
                <span className="text-[10px] font-bold text-slate-500 uppercase">Non implémentés</span>
                <p className="text-lg font-black text-amber-400">
                  {detailedServices.filter(s => !s.isImplemented).length} bloqués
                </p>
              </div>
            </div>
          </div>

          {/* Search & Filtering Controls for Services */}
          <div className="bg-slate-900 border border-white/10 rounded-2xl p-4 flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                placeholder="Filtrer les services de cette structure..."
                value={serviceSearch}
                onChange={e => setServiceSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-slate-950 border border-white/10 rounded-xl text-xs text-white outline-none focus:border-rose-500 font-medium"
              />
            </div>

            <div className="flex gap-2">
              <select
                value={serviceEntitlementFilter}
                onChange={e => setServiceEntitlementFilter(e.target.value as any)}
                className="px-3 py-2 bg-slate-950 border border-white/10 rounded-xl text-xs text-slate-300 font-bold outline-none focus:border-rose-500"
              >
                <option value="ALL">Tous les droits</option>
                <option value="IN_PLAN">Inclus dans le forfait</option>
                <option value="CUSTOM_GRANTED">Options accordées (+)</option>
                <option value="NOT_IN_PLAN">Non inclus (-)</option>
              </select>

              <select
                value={serviceStatusFilter}
                onChange={e => setServiceStatusFilter(e.target.value as any)}
                className="px-3 py-2 bg-slate-950 border border-white/10 rounded-xl text-xs text-slate-300 font-bold outline-none focus:border-rose-500"
              >
                <option value="ALL">Tous les statuts</option>
                <option value="active">Activés à l'accueil</option>
                <option value="inactive">Désactivés</option>
              </select>
            </div>
          </div>

          {/* ============================================================== */}
          {/* TABLEAU OBLIGATOIRE DES SERVICES (Section 5 du prompt)        */}
          {/* ============================================================== */}
          <div className="bg-slate-900 border border-white/10 rounded-3xl overflow-hidden shadow-2xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-white/10 bg-slate-950/80 text-[10px] font-black uppercase text-slate-400 tracking-wider">
                    <th className="py-4 px-6">Nom du Service</th>
                    <th className="py-4 px-4 text-center">Module Implémenté</th>
                    <th className="py-4 px-4 text-center">Inclus dans le Forfait</th>
                    <th className="py-4 px-4 text-center">Statut d'Activation</th>
                    <th className="py-4 px-4 text-center">Disponibilité à l'Accueil</th>
                    <th className="py-4 px-6 text-right">Action Super Admin</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-xs">
                  {filteredDetailedServices.map(service => {
                    const isBusy = isProcessing === selectedClinic.id;

                    return (
                      <tr 
                        key={service.serviceId} 
                        className={`hover:bg-white/[0.02] transition-colors ${
                          !service.isAuthorized ? 'opacity-60 bg-slate-950/40' : ''
                        }`}
                      >
                        {/* 1. Nom du service */}
                        <td className="py-4 px-6">
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${
                              service.is_active ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-slate-800 text-slate-400 border border-white/5'
                            }`}>
                              {service.serviceName.charAt(0)}
                            </div>
                            <div>
                              <p className="font-extrabold text-white text-sm">{service.serviceName}</p>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <span className="font-mono text-[10px] text-slate-500">{service.serviceId}</span>
                                <span className="text-slate-600">•</span>
                                <span className="text-[10px] text-slate-400 capitalize">{service.type}</span>
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* 2. Module implémenté */}
                        <td className="py-4 px-4 text-center">
                          {service.isImplemented ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                              <CheckCircle2 size={11} /> Oui
                            </span>
                          ) : (
                            <span 
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20"
                              title="Aucun module autonome développé pour ce service dans SmartHosto"
                            >
                              <Lock size={10} /> Non
                            </span>
                          )}
                        </td>

                        {/* 3. Inclus dans le forfait */}
                        <td className="py-4 px-4 text-center">
                          {service.isInPlan && !service.isRevoked ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                              Forfait {selectedClinic.licenseType}
                            </span>
                          ) : service.isCustomGranted ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-blue-500/10 text-blue-300 border border-blue-500/20">
                              <Award size={10} /> Option Accordée
                            </span>
                          ) : service.isRevoked ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                              Droit Révoqué
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-slate-800 text-slate-400 border border-white/5">
                              Non inclus
                            </span>
                          )}
                        </td>

                        {/* 4. Statut d'activation */}
                        <td className="py-4 px-4 text-center">
                          {service.is_active ? (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Activé
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold bg-slate-800 text-slate-400 border border-white/5">
                              Désactivé
                            </span>
                          )}
                        </td>

                        {/* 5. Disponibilité à l'accueil */}
                        <td className="py-4 px-4 text-center">
                          {service.isAvailableAtAccueil ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-emerald-600 text-white shadow-sm shadow-emerald-900/30">
                              <Eye size={11} /> Visible
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-slate-800 text-slate-500">
                              <EyeOff size={11} /> Masqué
                            </span>
                          )}
                        </td>

                        {/* 6. Actions */}
                        <td className="py-4 px-6 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {/* Cas A : Module non implémenté */}
                            {!service.isImplemented ? (
                              <span 
                                className="px-3 py-1.5 rounded-xl text-[10px] font-bold text-slate-500 bg-slate-950 border border-white/5 flex items-center gap-1 cursor-not-allowed select-none"
                                title="Ce service n'a pas de module autonome implémenté dans le code. Impossible à activer."
                              >
                                <Lock size={11} /> Non disponible
                              </span>
                            ) : !service.isAuthorized ? (
                              /* Cas B : Non inclus dans le forfait -> Possibilité d'accorder le droit */
                              <button
                                onClick={() => handleGrantOption(service)}
                                disabled={isBusy}
                                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-[10px] font-black uppercase flex items-center gap-1 shadow-md shadow-indigo-900/20 transition-all cursor-pointer disabled:opacity-50"
                                title="Accorder ce service en option supplémentaire pour cette structure"
                              >
                                <Plus size={12} /> Accorder le Droit
                              </button>
                            ) : (
                              /* Cas C : Autorisé -> Bascule Activer/Désactiver & Révocation */
                              <>
                                <button
                                  onClick={() => handleToggleService(service)}
                                  disabled={isBusy}
                                  className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50 ${
                                    service.is_active
                                      ? 'bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30'
                                      : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-900/20'
                                  }`}
                                  title={service.is_active ? "Désactiver pour cette structure" : "Activer pour cette structure"}
                                >
                                  {service.is_active ? (
                                    <>Désactiver</>
                                  ) : (
                                    <>Activer</>
                                  )}
                                </button>

                                <button
                                  onClick={() => setConfirmAction({ type: 'REVOKE_RIGHT', service })}
                                  disabled={isBusy}
                                  className="p-1.5 bg-slate-800 hover:bg-rose-950/40 text-slate-400 hover:text-rose-400 rounded-xl border border-white/5 transition-colors cursor-pointer"
                                  title="Révoquer le droit de ce service pour cette structure"
                                >
                                  <X size={13} />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODALE DE CONFIRMATION AVANT ACTION DESTRUCTIVE OU RÉVOCATION  */}
      {/* ============================================================== */}
      {confirmAction && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-white/10 rounded-3xl max-w-md w-full p-6 space-y-5 animate-in zoom-in-95 duration-200 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center justify-center shrink-0">
                <AlertTriangle size={24} />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-white">
                  {confirmAction.type === 'REVOKE_RIGHT' ? 'Confirmation de révocation du droit' : 'Confirmation de désactivation'}
                </h3>
                <p className="text-xs text-slate-400 font-mono mt-0.5">
                  Structure : {selectedClinic?.name}
                </p>
              </div>
            </div>

            <div className="p-4 bg-slate-950/80 rounded-2xl border border-white/5 text-xs text-slate-300 space-y-2">
              <p>
                Vous êtes sur le point de {confirmAction.type === 'REVOKE_RIGHT' ? 'révoquer le droit contractuel du' : 'désactiver le'} service :
              </p>
              <p className="font-extrabold text-rose-300 text-sm">
                "{confirmAction.service?.serviceName}" ({confirmAction.service?.serviceId})
              </p>
              <div className="pt-2 border-t border-white/10 text-[11px] text-slate-400 space-y-1">
                <p>• Le module disparaîtra immédiatement de l'accueil de cette structure.</p>
                <p>• Les nouveaux accès par les soignants seront bloqués.</p>
                <p className="text-emerald-400 font-semibold">• Les données médicales et l'historique des patients restent intacts.</p>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setConfirmAction(null)}
                className="px-4 py-2.5 bg-white/5 hover:bg-white/10 rounded-xl text-xs font-bold text-slate-300 transition-colors cursor-pointer"
              >
                Annuler
              </button>
              <button
                onClick={confirmAction.type === 'REVOKE_RIGHT' ? handleConfirmRevoke : handleConfirmDeactivate}
                className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black uppercase shadow-lg shadow-rose-900/30 transition-all cursor-pointer"
              >
                Confirmer l'opération
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
