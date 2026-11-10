import React, { useState, useEffect } from 'react';
import { 
  Building2, 
  ShieldCheck, 
  CreditCard, 
  LayoutDashboard, 
  Settings, 
  Activity, 
  Users, 
  Key, 
  Sliders, 
  Layers, 
  Bell, 
  DollarSign, 
  LogOut, 
  ShieldAlert, 
  CheckCircle2, 
  AlertCircle, 
  ChevronRight, 
  Menu, 
  X,
  RefreshCw,
  Sparkles
} from 'lucide-react';
import { Role, User as UserType, Service } from '../types';
import { db, sanitizeData } from '../src/firebase';
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { SAAS_PLANS, SaaSPlanId } from '../src/config/plans';

// Subcomponents for the 6 core menus
import { SuperAdminDashboard } from '../components/superadmin/SuperAdminDashboard';
import { SuperAdminUsers } from '../components/superadmin/SuperAdminUsers';
import { SuperAdminLicenses, CommercialPlanRecord } from '../components/superadmin/SuperAdminLicenses';
import { SuperAdminFinances } from '../components/superadmin/SuperAdminFinances';
import { StructureServicesManager } from '../components/superadmin/StructureServicesManager';
import { SuperAdminSettings } from '../components/superadmin/SuperAdminSettings';

// Exported interfaces for SaaS multi-tenant model
export interface ClinicTenant {
  id: string; // Tenant unique ID
  name: string;
  logoUrl?: string;
  address: string;
  city: string;
  country: string;
  phone: string;
  email: string;
  responsibleUser: string;
  createdAt: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'EXPIRED' | 'DEMO' | 'MAINTENANCE';
  licence_id?: string; // Foreign key referencing Licence(id)
  licenceId?: string;
  nom_licence?: string;
  licenseType: 'DEMO' | 'BASIC' | 'STANDARD' | 'PREMIUM' | 'ENTERPRISE';
  licenseStart: string;
  licenseEnd: string;
  licensePrice: number;
  autoRenew: boolean;
  structureType?: 'Cabinet médical' | 'Centre médical' | 'Clinique' | 'Hôpital' | 'Maternité' | 'Laboratoire' | 'Centre spécialisé';
  websiteUrl?: string;

  // Technical monitoring fields
  dbReadsToday?: number;
  dbReadsThisMonth?: number;
  dbReadsCumulative?: number;
  dbWritesToday?: number;
  dbWritesThisMonth?: number;
  dbWritesCumulative?: number;
  bandwidthUsedMB?: number;
  dataTransferredGB?: number;
  lastConnection?: string;

  // Quotas Configuration
  quotas: {
    maxUsers: number;
    maxPatients: number;
    maxStorageGB: number;
    maxSites: number;
    maxMonthlyConsultations: number;
    maxMonthlyHospitalizations: number;
  };
  
  // Current Usage Values
  usage: {
    activeUsers: number;
    totalPatients: number;
    storageUsedGB: number;
    sitesUsed: number;
    monthlyConsultations: number;
    monthlyHospitalizations: number;
    monthlyPrescriptions: number;
    totalExams: number;
    dailyConnections: number;
  };

  // Licensed modules and tools
  activatedModules: Record<string, boolean>;
  activatedTools: Record<string, boolean>;
  servicesConfig?: Record<string, any>;
}

export interface SupportTicket {
  id: string;
  clinicId: string;
  clinicName: string;
  category: 'TECH' | 'BILLING' | 'CLINICAL' | 'ONBOARDING' | 'BUG';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
  title: string;
  description: string;
  createdAt: string;
  assignedTechnician?: string;
  messages: {
    sender: string;
    message: string;
    timestamp: string;
    isAdmin: boolean;
  }[];
}

export interface SubscriptionInvoice {
  id: string;
  _docId?: string;
  clinicId: string;
  clinicName: string;
  plan: string;
  amount: number;
  currency: string;
  dueDate: string;
  paidDate?: string;
  status: 'PAID' | 'PENDING' | 'OVERDUE' | 'CANCELLED';
  paymentMethod?: string;
  userCount?: number;
  createdAt?: string;
}

export interface SaaSLog {
  id: string;
  timestamp: string;
  user: string;
  clinicId?: string;
  clinicName?: string;
  action: string;
  details: string;
  category: 'LOGIN' | 'LICENSE' | 'QUOTA' | 'MODULE' | 'TOOL' | 'SECURITY';
}

interface ControlCenterProps {
  onBackToDashboard: () => void;
  currentUser: UserType | null;
  onInspectTenant?: (clinic: ClinicTenant) => void;
}

export const ControlCenter: React.FC<ControlCenterProps> = ({ onBackToDashboard, currentUser, onInspectTenant }) => {
  // Navigation State: the 6 core menus of Super Admin
  const [activeMenu, setActiveMenu] = useState<'DASHBOARD' | 'USERS' | 'LICENSES' | 'FINANCES' | 'SERVICES' | 'SETTINGS'>('DASHBOARD');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Shortcut for opening a specific clinic in Services manager
  const [targetClinicForServices, setTargetClinicForServices] = useState<string | null>(null);

  // Toast Notification State
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // --- FIRESTORE PERSISTED DATA ---
  const [rawClinics, setRawClinics] = useState<ClinicTenant[]>([]);
  const [invoices, setInvoices] = useState<SubscriptionInvoice[]>([]);
  const [logs, setLogs] = useState<SaaSLog[]>([]);
  const [hospitalUsers, setHospitalUsers] = useState<UserType[]>([]);
  const [plans, setPlans] = useState<Record<string, CommercialPlanRecord>>(() => {
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
  const [globalConfig, setGlobalConfig] = useState<any>({
    defaultCurrency: 'FCFA',
    defaultLanguage: 'Français',
    platformName: 'SmartHosto Cloud SaaS'
  });

  // Listeners
  useEffect(() => {
    const unsubClinics = onSnapshot(collection(db, 'saas_clinics'), (snap) => {
      setRawClinics(snap.docs.map(d => ({ ...(d.data() as any), id: d.id } as ClinicTenant)));
    }, (err) => console.warn('Error reading clinics:', err));

    const unsubInvoices = onSnapshot(query(collection(db, 'saas_invoices'), orderBy('dueDate', 'desc')), (snap) => {
      setInvoices(snap.docs.map(d => {
        const data = d.data() as any;
        return {
          ...data,
          id: data.id || d.id,
          _docId: d.id
        } as SubscriptionInvoice;
      }));
    }, (err) => console.warn('Error reading invoices:', err));

    const unsubLogs = onSnapshot(query(collection(db, 'saas_logs'), orderBy('timestamp', 'desc'), limit(150)), (snap) => {
      setLogs(snap.docs.map(d => ({ ...(d.data() as any), id: d.id } as SaaSLog)));
    }, (err) => console.warn('Error reading logs:', err));

    const unsubUsers = onSnapshot(collection(db, 'hospital_users'), (snap) => {
      setHospitalUsers(snap.docs.map(d => ({ ...(d.data() as any), id: d.id } as UserType)));
    }, (err) => console.warn('Error reading users:', err));

    const unsubPlans = onSnapshot(collection(db, 'saas_plans'), (snap) => {
      if (!snap.empty) {
        const dbPlans: Record<string, CommercialPlanRecord> = {};
        snap.forEach((docSnap) => {
          const data = docSnap.data() as any;
          const id = (data.id || docSnap.id).toUpperCase();
          const fallback = SAAS_PLANS[id as SaaSPlanId] || SAAS_PLANS.STANDARD;
          dbPlans[id] = {
            ...fallback,
            ...data,
            id,
            max_users: Number(data.max_users) || fallback.max_users,
            pricePerExtraUserFCFA: data.pricePerExtraUserFCFA !== undefined ? Number(data.pricePerExtraUserFCFA) : fallback.pricePerExtraUserFCFA,
            monthlyPriceFCFA: data.monthlyPriceFCFA !== undefined ? Number(data.monthlyPriceFCFA) : fallback.monthlyPriceFCFA,
            includedServiceIds: Array.isArray(data.includedServiceIds) && data.includedServiceIds.length > 0 ? data.includedServiceIds : fallback.includedServiceIds,
            status: data.status || 'ACTIVE',
            durationLabel: data.durationLabel || `${data.durationValue || 1} ${data.durationUnit || 'Années'}`
          };
        });
        setPlans(prev => ({ ...prev, ...dbPlans }));
      }
    }, (err) => console.warn('Error reading saas_plans:', err));

    const unsubConfig = onSnapshot(collection(db, 'saas_global_config'), (snap) => {
      if (!snap.empty) {
        setGlobalConfig(snap.docs[0].data());
      }
    }, (err) => console.warn('Error reading config:', err));

    return () => {
      unsubClinics();
      unsubInvoices();
      unsubLogs();
      unsubUsers();
      unsubPlans();
      unsubConfig();
    };
  }, []);

  // Synchronize live active user counts per structure from hospitalUsers
  const clinics = React.useMemo<ClinicTenant[]>(() => {
    return rawClinics.map(c => {
      const clinicStaffCount = hospitalUsers.filter(u => {
        const isSuper =
          u.role === Role.SUPER_ADMIN ||
          String(u.role || '').toUpperCase() === 'SUPER_ADMIN' ||
          u.roles?.includes('role_super_admin') ||
          (u.username || '').toLowerCase() === 'superadmin' ||
          (u.username || '').toLowerCase() === 'sa1' ||
          (u.id || '').toLowerCase() === 'super_admin_id' ||
          (u.id || '').toLowerCase() === 'sa1_superadmin';
        if (isSuper) return false;
        const userHosp = (u as any).clinicId || (u as any).hospital_id || (u as any).structureId;
        if (userHosp && userHosp === c.id) return true;
        if (u.id === `usr_${c.id}_admin`) return true;
        return false;
      }).length;

      const planDef = plans[(c.licenseType || 'STANDARD').toUpperCase()] || SAAS_PLANS[c.licenseType as SaaSPlanId] || SAAS_PLANS.STANDARD;
      const effectiveMaxUsers = Number(c.quotas?.maxUsers) || Number(planDef.max_users) || 15;

      return {
        ...c,
        quotas: {
          ...(c.quotas || {
            maxPatients: 5000,
            maxStorageGB: 50,
            maxSites: 1,
            maxMonthlyConsultations: 1000,
            maxMonthlyHospitalizations: 100
          }),
          maxUsers: effectiveMaxUsers
        },
        usage: {
          ...(c.usage || {
            totalPatients: 0,
            storageUsedGB: 0.1,
            sitesUsed: 1,
            monthlyConsultations: 0,
            monthlyHospitalizations: 0,
            monthlyPrescriptions: 0,
            totalExams: 0,
            dailyConnections: 1
          }),
          activeUsers: Math.max(clinicStaffCount, c.usage?.activeUsers || 1)
        }
      };
    });
  }, [rawClinics, hospitalUsers, plans]);

  // Compute counts for Super Admin badges
  const superAdminsCount = hospitalUsers.filter(
    u =>
      u.role === Role.SUPER_ADMIN ||
      String(u.role || '').toUpperCase() === 'SUPER_ADMIN' ||
      u.roles?.includes('role_super_admin') ||
      (u.username || '').toLowerCase() === 'superadmin' ||
      (u.username || '').toLowerCase() === 'sa1' ||
      (u.id || '').toLowerCase() === 'super_admin_id' ||
      (u.id || '').toLowerCase() === 'sa1_superadmin'
  ).length || 1;

  const totalHospitalUsersCount = hospitalUsers.filter(
    u =>
      u.role !== Role.SUPER_ADMIN &&
      String(u.role || '').toUpperCase() !== 'SUPER_ADMIN' &&
      !u.roles?.includes('role_super_admin') &&
      (u.username || '').toLowerCase() !== 'superadmin' &&
      (u.username || '').toLowerCase() !== 'sa1'
  ).length;

  // Handle Switch to Services tab with a specific clinic selected
  const handleNavigateToServicesForClinic = (clinicId: string) => {
    setTargetClinicForServices(clinicId);
    setActiveMenu('SERVICES');
  };

  // Handle Tenant Context Switch (impersonation/inspection)
  const handleSwitchTenantContext = (clinic: ClinicTenant) => {
    const tenantConfig = {
      name: clinic.name,
      address: clinic.address,
      phone: clinic.phone,
      logo: '',
      language: 'FR',
      currency: clinic.licenseType === 'DEMO' ? 'XAF' : 'FCFA',
      theme: 'rose',
      tenantId: clinic.id
    };
    localStorage.setItem('hospital_config', JSON.stringify(tenantConfig));
    showToast(`Contexte basculé vers: ${clinic.name}. Ouverture de l'accueil hospitalier...`, 'info');
    if (onInspectTenant) {
      onInspectTenant(clinic);
    }
  };

  // Nav items definition (The requested 6 menus)
  const navMenuItems = [
    {
      id: 'DASHBOARD' as const,
      label: 'Tableau de bord',
      icon: LayoutDashboard,
      badge: null
    },
    {
      id: 'USERS' as const,
      label: 'Utilisateurs & Structures',
      icon: Users,
      badge: `${clinics.length}`
    },
    {
      id: 'LICENSES' as const,
      label: 'Gestion des Licences',
      icon: Key,
      badge: 'Quotas'
    },
    {
      id: 'FINANCES' as const,
      label: 'Paramètres financiers',
      icon: CreditCard,
      badge: null
    },
    {
      id: 'SERVICES' as const,
      label: 'Services et départements',
      icon: Layers,
      badge: 'Par structure'
    },
    {
      id: 'SETTINGS' as const,
      label: 'Paramètres de la plateforme',
      icon: Settings,
      badge: null
    }
  ];

  return (
    <div className="min-h-screen bg-[#070910] text-slate-100 flex flex-col font-sans selection:bg-rose-500/30">
      
      {/* TOAST NOTIFICATION CONTAINER */}
      {toast && (
        <div className="fixed top-5 right-5 z-50 animate-in fade-in slide-in-from-top-4">
          <div className={`px-4 py-3 rounded-xl shadow-2xl flex items-center gap-2.5 border text-xs font-bold ${
            toast.type === 'success' 
              ? 'bg-[#111522] border-emerald-500/40 text-emerald-300 shadow-emerald-950/50' 
              : toast.type === 'error'
              ? 'bg-[#111522] border-rose-500/40 text-rose-300 shadow-rose-950/50'
              : 'bg-[#111522] border-blue-500/40 text-blue-300 shadow-blue-950/50'
          }`}>
            {toast.type === 'success' ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
            <span>{toast.message}</span>
          </div>
        </div>
      )}

      {/* COMPACT 3D TOP HEADER */}
      <header className="h-14 border-b border-white/15 bg-gradient-to-b from-[#151928]/95 to-[#0c0f19]/95 shadow-[0_8px_28px_rgba(0,0,0,0.65),inset_0_1px_0_0_rgba(255,255,255,0.16)] backdrop-blur-xl px-4 md:px-6 flex items-center justify-between sticky top-0 z-40">
        
        {/* Left: Branding & Cockpit Title */}
        <div className="flex items-center gap-2.5">
          <button 
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-1.5 text-slate-400 hover:text-white"
          >
            {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>

          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-rose-600 to-purple-600 border border-rose-400/40 flex items-center justify-center shadow-[0_4px_12px_rgba(225,29,72,0.4),inset_0_1px_0_0_rgba(255,255,255,0.35)]">
            <ShieldCheck size={17} className="text-white" />
          </div>

          <div className="flex items-center gap-2.5">
            <span className="font-extrabold text-white text-sm tracking-tight">SmartHosto</span>
            <span className="px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-rose-500/20 text-rose-300 border border-rose-500/35">
              Super Admin
            </span>
            <span className="text-[11px] text-slate-400 font-semibold hidden lg:inline border-l border-white/10 pl-2.5">
              Gouvernance Commerciale & Multi-Tenant
            </span>
          </div>
        </div>

        {/* Right: User Profile & Actions */}
        <div className="flex items-center gap-2.5">
          <div className="hidden sm:flex items-center gap-2 px-3 py-1 bg-[#161a29] border border-white/12 rounded-xl shadow-[inset_0_1px_0_0_rgba(255,255,255,0.12)]">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></div>
            <span className="text-xs font-bold text-slate-200">{currentUser?.name || 'Éditeur SmartHosto'}</span>
            <span className="text-[10px] font-mono text-purple-300 font-bold">(@{currentUser?.username || 'superadmin'})</span>
          </div>

          <button
            onClick={onBackToDashboard}
            className="px-3 py-1.5 bg-[#181c2c] hover:bg-rose-600/25 text-slate-200 hover:text-rose-200 border border-white/15 hover:border-rose-500/40 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-[0_4px_12px_rgba(0,0,0,0.4),inset_0_1px_0_0_rgba(255,255,255,0.14)]"
            title="Quitter la session d'administration"
          >
            <LogOut size={13} /> Déconnexion
          </button>
        </div>

      </header>

      {/* MAIN LAYOUT: SIDEBAR + CONTENT AREA */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* LATERAL SIDEBAR NAVIGATION */}
        <aside className={`w-60 border-r border-white/12 bg-gradient-to-b from-[#111522] to-[#0a0d16] shadow-[6px_0_24px_rgba(0,0,0,0.5)] flex flex-col justify-between shrink-0 transition-all ${
          mobileMenuOpen ? 'fixed inset-y-14 left-0 z-40 bg-[#0b0e18] w-64' : 'hidden md:flex'
        }`}>
          
          {/* Menu Items */}
          <div className="p-3 space-y-1 overflow-y-auto">
            <div className="px-2.5 py-1.5 text-[10px] font-black uppercase tracking-widest text-slate-400">
              Navigation Plateforme
            </div>

            {navMenuItems.map((item) => {
              const isActive = activeMenu === item.id;
              const Icon = item.icon;

              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveMenu(item.id);
                    setMobileMenuOpen(false);
                    if (item.id !== 'SERVICES') {
                      setTargetClinicForServices(null);
                    }
                  }}
                  className={`w-full px-3 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-between text-left cursor-pointer group ${
                    isActive 
                      ? 'bg-gradient-to-b from-rose-500 to-rose-700 text-white shadow-[0_6px_16px_rgba(225,29,72,0.4),inset_0_1px_0_0_rgba(255,255,255,0.3)] border border-rose-400/40' 
                      : 'text-slate-300 hover:text-white hover:bg-white/[0.06] border border-transparent hover:border-white/10'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon size={16} className={isActive ? 'text-white' : 'text-slate-400 group-hover:text-rose-400'} />
                    <span>{item.label}</span>
                  </div>

                  {item.badge && (
                    <span className={`px-1.5 py-0.5 rounded-md text-[9px] font-black ${
                      isActive ? 'bg-white/20 text-white' : 'bg-white/10 text-slate-300'
                    }`}>
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Bottom Card in Sidebar */}
          <div className="p-3 border-t border-white/10">
            <div className="p-3 bg-[#141826] border border-white/12 rounded-xl text-[11px] text-slate-300 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1)]">
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold text-white">Portefeuille Clients</span>
                <span className="px-1.5 py-0.5 rounded bg-rose-500/20 border border-rose-500/30 font-black text-rose-300 text-[10px]">{clinics.length}</span>
              </div>
              <p className="text-[10px] text-slate-400">Isolation multi-tenant active ({superAdminsCount} Super Admins).</p>
            </div>
          </div>

        </aside>

        {/* CONTENT WORKSPACE */}
        <main className="flex-1 overflow-y-auto p-4 md:p-5 bg-[#070910]">
          <div className="max-w-7xl mx-auto">
            
            {/* 1. Tableau de bord */}
            {activeMenu === 'DASHBOARD' && (
              <SuperAdminDashboard 
                clinics={clinics}
                invoices={invoices}
                plans={plans}
                superAdminsCount={superAdminsCount}
                totalHospitalUsersCount={totalHospitalUsersCount}
                onNavigateToTab={(tab) => {
                  if (tab === 'USERS') setActiveMenu('USERS');
                  else if (tab === 'LICENSES') setActiveMenu('LICENSES');
                  else if (tab === 'FINANCES') setActiveMenu('FINANCES');
                  else if (tab === 'SERVICES') setActiveMenu('SERVICES');
                  else if (tab === 'SETTINGS') setActiveMenu('SETTINGS');
                }}
              />
            )}

            {/* 2. Utilisateurs */}
            {activeMenu === 'USERS' && (
              <SuperAdminUsers 
                clinics={clinics}
                hospitalUsers={hospitalUsers}
                plans={plans}
                currentUser={currentUser}
                showToast={showToast}
                onNavigateToServices={handleNavigateToServicesForClinic}
              />
            )}

            {/* 3. Licences */}
            {activeMenu === 'LICENSES' && (
              <SuperAdminLicenses 
                clinics={clinics}
                plans={plans}
                setPlans={setPlans}
                currentUser={currentUser}
                showToast={showToast}
                onNavigateToServices={handleNavigateToServicesForClinic}
              />
            )}

            {/* 4. Paramètres financiers */}
            {activeMenu === 'FINANCES' && (
              <SuperAdminFinances 
                clinics={clinics}
                invoices={invoices}
                plans={plans}
                currentUser={currentUser}
                showToast={showToast}
              />
            )}

            {/* 5. Services et départements (gestion par structure) */}
            {activeMenu === 'SERVICES' && (
              <StructureServicesManager 
                clinics={clinics}
                plans={plans}
                currentUser={currentUser}
                onSwitchTenantContext={handleSwitchTenantContext}
                showToast={showToast}
                initialSelectedClinicId={targetClinicForServices}
              />
            )}

            {/* 6. Paramètres de la plateforme */}
            {activeMenu === 'SETTINGS' && (
              <SuperAdminSettings 
                clinics={clinics}
                logs={logs}
                globalConfig={globalConfig}
                currentUser={currentUser}
                showToast={showToast}
                onSwitchTenantContext={handleSwitchTenantContext}
              />
            )}

          </div>
        </main>

      </div>

    </div>
  );
};
