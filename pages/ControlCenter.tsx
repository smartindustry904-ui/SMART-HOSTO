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

// Subcomponents for the 6 core menus
import { SuperAdminDashboard } from '../components/superadmin/SuperAdminDashboard';
import { SuperAdminUsers } from '../components/superadmin/SuperAdminUsers';
import { SuperAdminLicenses } from '../components/superadmin/SuperAdminLicenses';
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
  clinicId: string;
  clinicName: string;
  plan: string;
  amount: number;
  currency: string;
  dueDate: string;
  paidDate?: string;
  status: 'PAID' | 'PENDING' | 'OVERDUE' | 'CANCELLED';
  paymentMethod?: string;
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
}

export const ControlCenter: React.FC<ControlCenterProps> = ({ onBackToDashboard, currentUser }) => {
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
  const [clinics, setClinics] = useState<ClinicTenant[]>([]);
  const [invoices, setInvoices] = useState<SubscriptionInvoice[]>([]);
  const [logs, setLogs] = useState<SaaSLog[]>([]);
  const [hospitalUsers, setHospitalUsers] = useState<UserType[]>([]);
  const [globalConfig, setGlobalConfig] = useState<any>({
    defaultCurrency: 'FCFA',
    defaultLanguage: 'Français',
    platformName: 'SmartHosto Cloud SaaS'
  });

  // Listeners
  useEffect(() => {
    const unsubClinics = onSnapshot(collection(db, 'saas_clinics'), (snap) => {
      setClinics(snap.docs.map(d => ({ id: d.id, ...d.data() } as ClinicTenant)));
    }, (err) => console.warn('Error reading clinics:', err));

    const unsubInvoices = onSnapshot(query(collection(db, 'saas_invoices'), orderBy('dueDate', 'desc')), (snap) => {
      setInvoices(snap.docs.map(d => ({ id: d.id, ...d.data() } as SubscriptionInvoice)));
    }, (err) => console.warn('Error reading invoices:', err));

    const unsubLogs = onSnapshot(query(collection(db, 'saas_logs'), orderBy('timestamp', 'desc'), limit(150)), (snap) => {
      setLogs(snap.docs.map(d => ({ id: d.id, ...d.data() } as SaaSLog)));
    }, (err) => console.warn('Error reading logs:', err));

    const unsubUsers = onSnapshot(collection(db, 'hospital_users'), (snap) => {
      setHospitalUsers(snap.docs.map(d => ({ id: d.id, ...d.data() } as UserType)));
    }, (err) => console.warn('Error reading users:', err));

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
      unsubConfig();
    };
  }, []);

  // Compute counts for Super Admin badges
  const superAdminsCount = hospitalUsers.filter(
    u => u.role === Role.SUPER_ADMIN || u.roles?.includes('role_super_admin') || u.username === 'superadmin'
  ).length || 1;

  const totalHospitalUsersCount = hospitalUsers.filter(
    u => u.role !== Role.SUPER_ADMIN && !u.roles?.includes('role_super_admin') && u.username !== 'superadmin'
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
    showToast(`Contexte basculé vers: ${clinic.name}. Vous pouvez observer son espace hospitalier.`, 'info');
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
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-rose-500/30">
      
      {/* TOAST NOTIFICATION CONTAINER */}
      {toast && (
        <div className="fixed top-6 right-6 z-50 animate-in fade-in slide-in-from-top-4">
          <div className={`px-5 py-3.5 rounded-2xl shadow-2xl flex items-center gap-3 border text-xs font-bold ${
            toast.type === 'success' 
              ? 'bg-slate-900 border-emerald-500/40 text-emerald-300 shadow-emerald-950/40' 
              : toast.type === 'error'
              ? 'bg-slate-900 border-rose-500/40 text-rose-300 shadow-rose-950/40'
              : 'bg-slate-900 border-blue-500/40 text-blue-300 shadow-blue-950/40'
          }`}>
            {toast.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
            <span>{toast.message}</span>
          </div>
        </div>
      )}

      {/* TOP HEADER */}
      <header className="h-16 border-b border-white/10 bg-slate-900/80 backdrop-blur-xl px-4 md:px-8 flex items-center justify-between sticky top-0 z-40">
        
        {/* Left: Branding & Cockpit Title */}
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 text-slate-400 hover:text-white"
          >
            {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>

          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-rose-600 to-purple-600 flex items-center justify-center shadow-lg shadow-rose-600/30">
            <ShieldCheck size={22} className="text-white" />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-white text-base tracking-tight">SmartHosto</span>
              <span className="px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-rose-500/20 text-rose-400 border border-rose-500/30">
                Super Administrateur
              </span>
            </div>
            <p className="text-[10px] text-slate-400 hidden sm:block">Centre de Gouvernance Commerciale & Multi-Tenant</p>
          </div>
        </div>

        {/* Right: User Profile & Actions */}
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2.5 px-3 py-1.5 bg-white/5 border border-white/5 rounded-2xl">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
            <span className="text-xs font-bold text-slate-300">{currentUser?.name || 'Éditeur SmartHosto'}</span>
            <span className="text-[10px] font-mono text-purple-400 font-bold">(@{currentUser?.username || 'superadmin'})</span>
          </div>

          <button
            onClick={onBackToDashboard}
            className="px-4 py-2 bg-white/5 hover:bg-rose-600/20 text-slate-300 hover:text-rose-300 border border-white/10 hover:border-rose-500/30 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer"
            title="Quitter la session d'administration"
          >
            <LogOut size={14} /> Déconnexion
          </button>
        </div>

      </header>

      {/* MAIN LAYOUT: SIDEBAR + CONTENT AREA */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* LATERAL SIDEBAR NAVIGATION */}
        <aside className={`w-64 border-r border-white/10 bg-slate-900/60 backdrop-blur-xl flex flex-col justify-between shrink-0 transition-all ${
          mobileMenuOpen ? 'fixed inset-y-16 left-0 z-40 bg-slate-950 w-72' : 'hidden md:flex'
        }`}>
          
          {/* Menu Items */}
          <div className="p-4 space-y-1.5 overflow-y-auto">
            <div className="px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
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
                  className={`w-full px-3.5 py-3 rounded-2xl text-xs font-bold transition-all flex items-center justify-between text-left cursor-pointer group ${
                    isActive 
                      ? 'bg-rose-600 text-white shadow-lg shadow-rose-900/30 border border-rose-500/40' 
                      : 'text-slate-400 hover:text-white hover:bg-white/5 border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon size={17} className={isActive ? 'text-white' : 'text-slate-400 group-hover:text-rose-400'} />
                    <span>{item.label}</span>
                  </div>

                  {item.badge && (
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                      isActive ? 'bg-white/20 text-white' : 'bg-white/5 text-slate-400'
                    }`}>
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Bottom Card in Sidebar */}
          <div className="p-4 border-t border-white/5">
            <div className="p-3.5 bg-slate-950/80 border border-white/5 rounded-2xl text-[11px] text-slate-400">
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold text-slate-200">Portefeuille Clients</span>
                <span className="font-black text-rose-400">{clinics.length}</span>
              </div>
              <p className="text-[10px] text-slate-500">Toutes les cliniques clientes sont isolées par tenant.</p>
            </div>
          </div>

        </aside>

        {/* CONTENT WORKSPACE */}
        <main className="flex-1 overflow-y-auto p-4 md:p-8 bg-slate-950">
          <div className="max-w-7xl mx-auto">
            
            {/* 1. Tableau de bord */}
            {activeMenu === 'DASHBOARD' && (
              <SuperAdminDashboard 
                clinics={clinics}
                invoices={invoices}
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
                currentUser={currentUser}
                showToast={showToast}
                onNavigateToServices={handleNavigateToServicesForClinic}
              />
            )}

            {/* 3. Licences */}
            {activeMenu === 'LICENSES' && (
              <SuperAdminLicenses 
                clinics={clinics}
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
                currentUser={currentUser}
                showToast={showToast}
              />
            )}

            {/* 5. Services et départements (gestion par structure) */}
            {activeMenu === 'SERVICES' && (
              <StructureServicesManager 
                clinics={clinics}
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
