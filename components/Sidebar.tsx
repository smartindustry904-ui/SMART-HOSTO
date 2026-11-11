
import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Avatar } from './common/Avatar';
import { 
  Users, 
  Stethoscope, 
  Beaker, 
  BedDouble, 
  Baby, 
  Pill, 
  CreditCard, 
  LayoutDashboard,
  LogOut,
  UserCheck,
  TrendingUp,
  ChevronLeft,
  Settings,
  ShieldAlert,
  Shield,
  Hospital,
  Building2,
  Wrench,
  ArrowLeft,
  Activity,
  HeartPulse,
  Database,
  Calendar,
  History,
  AlertCircle,
  Bell,
  Eye,
  Clock,
  Navigation,
  Calculator,
  Landmark,
  Search,
  ClipboardList,
  ShieldCheck,
  Printer,
  Package,
  DollarSign,
  Percent,
  Truck,
  FileText,
  Zap,
  Grid,
  Lock,
  Unlock,
  CheckSquare,
  Heart,
  Syringe,
  Home,
  MessageSquare,
  Palette
} from 'lucide-react';
import { Role, User, EmergencySubMenu, NurseSubMenu, ReceptionSubMenu, CashierSubMenu, LabSubMenu, InpatientSubMenu, PharmacySubMenu, AccountingSubMenu, MaternitySubMenu, ConsultationSubMenu } from '../types';
import { useSystemAlerts } from '../hooks/useSystemAlerts';
import { useHospitalServices } from '../hooks/useSettings';
import { isModuleActiveAndAvailable, isUserAuthorizedForModule } from '../src/config/modules';

interface SidebarProps {
  user: User;
  currentRole: Role | 'DASHBOARD' | 'SETTING' | 'IMAGERIE'; 
  setRole: (role: any) => void;
  onLogout: () => void;
  isOpen: boolean;
  onClose: () => void;
  isExpanded: boolean;
  onToggleExpand: (expanded: boolean) => void;
  isLocked: boolean;
  onToggleLock: () => void;
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  activeSettingsTab?: 'users' | 'roles' | 'establishment' | 'appearance' | 'referentials' | 'cashier_settings' | 'services' | 'protocols' | 'hospitalization' | 'whatsapp_agent';
  setActiveSettingsTab?: (tab: 'users' | 'roles' | 'establishment' | 'appearance' | 'referentials' | 'cashier_settings' | 'services' | 'protocols' | 'hospitalization' | 'whatsapp_agent') => void;
  activeMaternityTab?: MaternitySubMenu;
  setActiveMaternityTab?: (tab: MaternitySubMenu) => void;
  activeConsultationTab?: ConsultationSubMenu;
  setActiveConsultationTab?: (tab: ConsultationSubMenu) => void;
  activeEmergencyTab?: EmergencySubMenu;
  setActiveEmergencyTab?: (tab: EmergencySubMenu) => void;
  activeReceptionTab?: ReceptionSubMenu;
  setActiveReceptionTab?: (tab: ReceptionSubMenu) => void;
  activeNurseTab?: NurseSubMenu;
  setActiveNurseTab?: (tab: NurseSubMenu) => void;
  activeCashierTab?: CashierSubMenu;
  setActiveCashierTab?: (tab: CashierSubMenu) => void;
  activeLabTab?: LabSubMenu;
  setActiveLabTab?: (tab: LabSubMenu) => void;
  activeInpatientTab?: InpatientSubMenu;
  setActiveInpatientTab?: (tab: InpatientSubMenu) => void;
  activePharmacyTab?: PharmacySubMenu;
  setActivePharmacyTab?: (tab: PharmacySubMenu) => void;
  activeAccountingTab?: AccountingSubMenu;
  setActiveAccountingTab?: (tab: AccountingSubMenu) => void;
  onOpenProfile?: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ 
  user, 
  currentRole, 
  setRole, 
  onLogout,
  onOpenProfile, 
  isOpen, 
  onClose,
  theme,
  toggleTheme,
  activeSettingsTab,
  setActiveSettingsTab,
  activeMaternityTab,
  setActiveMaternityTab,
  activeConsultationTab,
  setActiveConsultationTab,
  activeEmergencyTab,
  setActiveEmergencyTab,
  activeReceptionTab,
  setActiveReceptionTab,
  activeNurseTab,
  setActiveNurseTab,
  activeCashierTab,
  setActiveCashierTab,
  activeLabTab,
  setActiveLabTab,
  activeInpatientTab,
  setActiveInpatientTab,
  activePharmacyTab,
  setActivePharmacyTab,
  activeAccountingTab,
  setActiveAccountingTab,
  isExpanded,
  onToggleExpand,
  isLocked,
  onToggleLock
}) => {
  // Définition des accès par rôle (RBAC)
  const menuConfig = [
    { id: Role.RECEPTION, icon: Users, label: 'Accueil Patients', access: [Role.ADMIN, Role.SUPER_ADMIN, Role.RECEPTION, Role.DOCTOR, Role.NURSE] },
    { id: Role.NURSE, icon: Heart, label: 'Soins Infirmiers', access: [Role.ADMIN, Role.SUPER_ADMIN, Role.NURSE, Role.DOCTOR] },
    { id: Role.INPATIENT, icon: BedDouble, label: 'Hospitalisation', access: [Role.ADMIN, Role.SUPER_ADMIN, Role.DOCTOR, Role.NURSE, Role.INPATIENT] },
    { id: Role.URGENCE, icon: ShieldAlert, label: 'Urgences', access: [Role.ADMIN, Role.SUPER_ADMIN, Role.DOCTOR, Role.NURSE] },
    { id: Role.DOCTOR, icon: Stethoscope, label: 'Consultations', access: [Role.ADMIN, Role.SUPER_ADMIN, Role.DOCTOR] },
    { id: Role.LAB, icon: Beaker, label: 'Laboratoire', access: [Role.ADMIN, Role.SUPER_ADMIN, Role.LAB] },
    { id: Role.MATERNITY, icon: Baby, label: 'Maternité', access: [Role.ADMIN, Role.SUPER_ADMIN, Role.MATERNITY, Role.DOCTOR] },
    { id: Role.PHARMACY, icon: Pill, label: 'Pharmacie', access: [Role.ADMIN, Role.SUPER_ADMIN, Role.PHARMACY] },
    { id: Role.CASHIER, icon: CreditCard, label: 'Caisse & Facturation', access: [Role.ADMIN, Role.SUPER_ADMIN, Role.CASHIER, Role.ACCOUNTANT] },
    { id: Role.ACCOUNTANT, icon: TrendingUp, label: 'Gestion & Compta', access: [Role.ADMIN, Role.SUPER_ADMIN, Role.ACCOUNTANT] },
    { id: 'SETTING', icon: Settings, label: 'Paramétrage', access: [Role.ADMIN, Role.SUPER_ADMIN], special: true },
  ];

  const nurseMenu = [
    { id: 'triage', label: 'Triage & Constantes', icon: Stethoscope },
    { id: 'soins', label: 'Soins & Actes Prescrits', icon: Syringe },
    { id: 'historique', label: 'Historique Triages', icon: FileText },
    { id: 'dashboard', label: 'Vue d\'ensemble', icon: LayoutDashboard },
  ];

  const settingsMenu = [
    { id: 'users', label: 'Utilisateurs', icon: Users },
    { id: 'roles', label: 'Rôles & Permissions', icon: Shield },
    { id: 'establishment', label: 'Établissement', icon: Hospital },
    { id: 'appearance', label: 'Thèmes & Couleurs', icon: Palette },
    { id: 'referentials', label: 'Référentiels', icon: Database },
    { id: 'protocols', label: 'Catalogue Protocoles', icon: FileText },
    { id: 'cashier_settings', label: 'Paramètres de la caisse', icon: CreditCard },
    { id: 'whatsapp_agent', label: 'Agent WhatsApp IA', icon: MessageSquare },
  ];

  const maternityMenu = [
    { id: 'dashboard', label: 'Tableau de Bord', icon: LayoutDashboard },
    { id: 'waiting_room', label: 'Salle d\'Attente', icon: Users },
    { id: 'cpn', label: 'Espace CPN', icon: Stethoscope },
    { id: 'delivery_room', label: 'Salle d\'Accouchement', icon: Baby },
    { id: 'history', label: 'Historique Obstétrical', icon: History },
  ];

  const consultationMenu = [
    { id: 'dashboard', label: 'Tableau de Bord', icon: LayoutDashboard },
    { id: 'WAITING_ROOM', label: 'Salle d\'attente', icon: Users },
    { id: 'PATIENT_DIRECTORY', label: 'Annuaire Patients', icon: Search },
    { id: 'CONSULTATION', label: 'Consultation', icon: Stethoscope },
    { id: 'HISTORY', label: 'Historique', icon: History },
    { id: 'APPOINTMENTS', label: 'Rendez-vous', icon: Calendar },
  ];
  
  const emergencyMenu = [
    { id: 'patients', label: 'Patients aux urgences', icon: Users },
    { id: 'prise_en_charge', label: 'Prise en charge', icon: Stethoscope },
    { id: 'historique', label: 'Historique des passages', icon: History },
  ];

  const receptionMenu = [
    { id: 'dashboard', label: 'Tableau de Bord', icon: LayoutDashboard },
    { id: 'triage', label: 'Admissions', icon: Users },
    { id: 'historique', label: 'Historique Patient', icon: History },
    { id: 'sorties', label: 'Sorties Admin', icon: LogOut },
    { id: 'profil', label: 'Mon Profil', icon: UserCheck },
  ];

  const cashierMenu = [
    { id: 'dashboard', label: 'Tableau de Bord', icon: LayoutDashboard },
    { id: 'facturation', label: 'Facturation', icon: Calculator },
    { id: 'pending', label: 'Demandes en attente', icon: Clock },
    { id: 'dettes', label: 'Gestion des Dettes', icon: AlertCircle },
    { id: 'daily', label: 'Transactions du jour', icon: Landmark },
  ];

  const labMenu = [
    { id: 'dashboard', label: 'Tableau de Bord', icon: LayoutDashboard },
    { id: 'demandes', label: 'Demandes & Prélèvements', icon: ClipboardList },
    { id: 'resultats', label: 'Saisie & Publication', icon: Activity },
    { id: 'rapports', label: 'Rapports & Archives', icon: Printer },
  ];

  const inpatientMenu = [
    { id: 'beds', label: 'Lits d\'hospitalisation', icon: BedDouble },
    { id: 'patient_bed', label: 'Lits de patient', icon: Activity },
    { id: 'requests', label: 'Demandes admission', icon: Bell },
    { id: 'history', label: 'Historique des séjours', icon: History },
  ];

  const pharmacyMenu = [
    { id: 'dashboard', label: 'Tableau de Bord', icon: LayoutDashboard },
    { id: 'prescriptions', label: 'Ordonnances', icon: ClipboardList },
    { id: 'sales', label: 'Vente Directe / Stock', icon: Package },
    { id: 'history', label: 'Historique & KPIs', icon: FileText },
  ];

  const accountingMenu = [
    { id: 'dashboard', label: 'Tableau de Bord', icon: LayoutDashboard },
    { id: 'tresorerie', label: 'Trésorerie & Caisses', icon: Landmark },
    { id: 'creances', label: 'Comptes Clients', icon: AlertCircle },
    { id: 'fournisseurs', label: 'Fournisseurs & Achats', icon: Truck },
  ];

  const { services } = useHospitalServices();

  // Filtrer les menus selon le statut d'activation du service et le rôle de l'utilisateur
  const filteredItems = menuConfig.filter(item => {
    // 1. Strict service activation check: a module linked to a service must be active in Firestore
    if (!isModuleActiveAndAvailable(item.id, services)) {
      return false;
    }

    // 2. Strict RBAC Access check
    return isUserAuthorizedForModule(user, item.id);
  });

  const { alerts } = useSystemAlerts(user);

  const getModuleAlertInfo = (modId: any) => {
    let modAlerts: any[] = [];
    if (modId === Role.PHARMACY) {
      modAlerts = alerts.filter(a => a.source === 'PHARMACY');
    } else if (modId === Role.LAB) {
      modAlerts = alerts.filter(a => a.source === 'LAB');
    } else if (modId === Role.URGENCE) {
      modAlerts = alerts.filter(a => a.source === 'EMERGENCY' || a.source === 'TRIAGE');
    } else if (modId === Role.NURSE) {
      modAlerts = alerts.filter(a => a.source === 'BEDS');
    }

    if (modAlerts.length === 0) return { count: 0, type: 'info' as const };
    const hasCritical = modAlerts.some(a => a.severity === 'critical');
    return {
      count: modAlerts.length,
      type: hasCritical ? ('critical' as const) : ('warning' as const)
    };
  };

  return (
    <>
      {/* Mobile Overlay */}
      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden"
            onClick={onClose}
          />
        )}
      </AnimatePresence>

      <motion.div 
        initial={false}
        onMouseEnter={() => !isLocked && onToggleExpand(true)}
        onMouseLeave={() => !isLocked && onToggleExpand(false)}
        animate={{ 
          x: isOpen || window.innerWidth >= 768 ? 0 : -120,
          opacity: isOpen || window.innerWidth >= 768 ? 1 : 0,
          width: isExpanded ? 284 : 88,
          height: 'calc(100vh - 32px)',
          top: '16px',
          left: '16px'
        }}
        className={`fixed z-50 transition-all duration-300 rounded-[28px] ${
          theme === 'dark' 
            ? 'bg-gradient-to-b from-[#171a26] to-[#0d0f17] border-white/15 shadow-[0_24px_50px_-12px_rgba(0,0,0,0.9),0_0_30px_-5px_rgba(59,130,246,0.12),inset_0_1px_0_0_rgba(255,255,255,0.22)]' 
            : 'bg-gradient-to-b from-white to-slate-50/95 border-slate-200/90 shadow-[0_20px_45px_-10px_rgba(15,23,42,0.09),inset_0_1px_0_0_#ffffff]'
        } backdrop-blur-2xl border overflow-hidden flex flex-col`}
      >
        {/* Top Specular Shiny Rim Highlight */}
        <div className={`absolute top-0 left-6 right-6 h-px pointer-events-none z-20 ${
          theme === 'dark' 
            ? 'bg-gradient-to-r from-transparent via-blue-400/50 to-transparent' 
            : 'bg-gradient-to-r from-transparent via-blue-500/30 to-transparent'
        }`} />

        {/* Subtle Ambient Glow */}
        <div className={`absolute top-0 left-0 w-full h-40 pointer-events-none opacity-35 ${theme === 'dark' ? 'bg-gradient-to-b from-blue-500/15 to-transparent' : 'bg-gradient-to-b from-blue-100/60 to-transparent'}`}></div>

        {/* Logo Section */}
        <div className={`pt-5 pb-4 flex flex-col ${isExpanded ? 'items-start px-5' : 'items-center px-0'} gap-3.5 relative z-10 transition-all`}>
          <div className={`flex items-center ${isExpanded ? 'justify-between w-full' : 'justify-center w-full'}`}>
            <div className="flex items-center gap-3">
              <button 
                onClick={() => setRole('DASHBOARD')}
                className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-300 group cursor-pointer ${
                  theme === 'dark' 
                    ? 'bg-gradient-to-br from-blue-500 to-blue-700 text-white border border-blue-400/50 shadow-[0_8px_20px_rgba(37,99,235,0.4),inset_0_1px_0_rgba(255,255,255,0.3)]' 
                    : 'bg-gradient-to-br from-blue-600 to-blue-700 text-white shadow-lg shadow-blue-600/25'
                }`}
                title="Accueil / Tableau de bord"
              >
                <Home size={22} className="group-hover:scale-110 transition-transform" />
              </button>
              {isExpanded && (
                <div className="flex flex-col">
                  <h1 className={`text-base font-black tracking-tight uppercase leading-none ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>
                    SmartHosto
                  </h1>
                  <span className="text-xs font-bold text-blue-500 dark:text-blue-400 uppercase tracking-wider mt-1">
                    SIH Clinique
                  </span>
                </div>
              )}
            </div>

            {isExpanded && (
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleLock();
                }}
                className={`p-2 rounded-xl transition-all cursor-pointer border ${
                  isLocked 
                    ? 'bg-blue-600 text-white border-blue-400/50 shadow-[0_0_15px_rgba(59,130,246,0.4)]'
                    : (theme === 'dark' ? 'bg-zinc-800/90 text-zinc-300 border-white/15 hover:text-white hover:border-white/30' : 'bg-slate-100 text-slate-600 border-slate-200 hover:text-blue-600')
                }`}
                title={isLocked ? "Déverrouiller le menu" : "Épingler le menu"}
              >
                {isLocked ? <Lock size={16} /> : <Unlock size={16} />}
              </button>
            )}
          </div>
          <div className={`h-px ${isExpanded ? 'w-full' : 'w-10 mx-auto'} ${theme === 'dark' ? 'bg-white/12' : 'bg-slate-200/80'} transition-all`}></div>
        </div>
        
        {/* Navigation Items */}
        <nav className={`flex-1 ${isExpanded ? 'px-4 items-stretch' : 'px-0 items-center w-full'} space-y-1.5 overflow-y-auto no-scrollbar py-2 relative z-10 flex flex-col transition-all`}>
          {currentRole === 'DASHBOARD' ? (
            filteredItems.map((item) => {
              const alertInfo = getModuleAlertInfo(item.id);
              return (
                <NavIcon 
                  key={item.id} 
                  icon={item.icon} 
                  label={item.label} 
                  active={currentRole === item.id}
                  onClick={() => setRole(item.id)}
                  theme={theme}
                  isExpanded={isExpanded}
                  badgeCount={alertInfo.count}
                  badgeType={alertInfo.type}
                />
              );
            })
          ) : (
            <>
              {/* Home Navigation Item */}
              <NavIcon 
                icon={Home} 
                label="Accueil Principal" 
                active={currentRole === 'DASHBOARD'}
                onClick={() => setRole('DASHBOARD')}
                theme={theme}
                isExpanded={isExpanded}
              />
              <div className={`h-[1px] my-1 transition-all ${isExpanded ? 'w-full' : 'w-8 mx-auto'} ${theme === 'dark' ? 'bg-white/10' : 'bg-slate-100'}`} />
              {/* Module Sub-Menu Icons */}
              {currentRole === Role.URGENCE && emergencyMenu.map(item => (
                <NavIcon 
                  key={item.id} 
                  icon={item.icon} 
                  label={item.label} 
                  active={activeEmergencyTab === item.id}
                  onClick={() => setActiveEmergencyTab?.(item.id as any)}
                  theme={theme}
                  isExpanded={isExpanded}
                />
              ))}
              {currentRole === Role.NURSE && nurseMenu.map(item => (
                <NavIcon 
                  key={item.id} 
                  icon={item.icon} 
                  label={item.label} 
                  active={activeNurseTab === item.id}
                  onClick={() => setActiveNurseTab?.(item.id as any)}
                  theme={theme}
                  isExpanded={isExpanded}
                />
              ))}
              {(currentRole === Role.INPATIENT || (currentRole as any) === 'HOSPITALISATION') && inpatientMenu.map(item => (
                <NavIcon 
                  key={item.id} 
                  icon={item.icon} 
                  label={item.label} 
                  active={activeInpatientTab === item.id}
                  onClick={() => setActiveInpatientTab?.(item.id as any)}
                  theme={theme}
                  isExpanded={isExpanded}
                />
              ))}
              {currentRole === Role.DOCTOR && consultationMenu.map(item => (
                <NavIcon 
                  key={item.id} 
                  icon={item.icon} 
                  label={item.label} 
                  active={activeConsultationTab === item.id}
                  onClick={() => setActiveConsultationTab?.(item.id as any)}
                  theme={theme}
                  isExpanded={isExpanded}
                />
              ))}
              {currentRole === Role.MATERNITY && maternityMenu.map(item => (
                <NavIcon 
                  key={item.id} 
                  icon={item.icon} 
                  label={item.label} 
                  active={activeMaternityTab === item.id}
                  onClick={() => setActiveMaternityTab?.(item.id as any)}
                  theme={theme}
                  isExpanded={isExpanded}
                />
              ))}
              {currentRole === Role.PHARMACY && pharmacyMenu.map(item => (
                <NavIcon 
                  key={item.id} 
                  icon={item.icon} 
                  label={item.label} 
                  active={activePharmacyTab === item.id}
                  onClick={() => setActivePharmacyTab?.(item.id as any)}
                  theme={theme}
                  isExpanded={isExpanded}
                />
              ))}
              {currentRole === Role.LAB && labMenu.map(item => (
                <NavIcon 
                  key={item.id} 
                  icon={item.icon} 
                  label={item.label} 
                  active={activeLabTab === item.id}
                  onClick={() => setActiveLabTab?.(item.id as any)}
                  theme={theme}
                  isExpanded={isExpanded}
                />
              ))}
              {currentRole === Role.CASHIER && cashierMenu.map(item => (
                <NavIcon 
                  key={item.id} 
                  icon={item.icon} 
                  label={item.label} 
                  active={activeCashierTab === item.id}
                  onClick={() => setActiveCashierTab?.(item.id as any)}
                  theme={theme}
                  isExpanded={isExpanded}
                />
              ))}
              {currentRole === Role.RECEPTION && receptionMenu.map(item => (
                <NavIcon 
                  key={item.id} 
                  icon={item.icon} 
                  label={item.label} 
                  active={activeReceptionTab === item.id}
                  onClick={() => setActiveReceptionTab?.(item.id as any)}
                  theme={theme}
                  isExpanded={isExpanded}
                />
              ))}
              {currentRole === Role.ACCOUNTANT && accountingMenu.map(item => (
                <NavIcon 
                  key={item.id} 
                  icon={item.icon} 
                  label={item.label} 
                  active={activeAccountingTab === item.id}
                  onClick={() => setActiveAccountingTab?.(item.id as any)}
                  theme={theme}
                  isExpanded={isExpanded}
                />
              ))}
              {currentRole === 'SETTING' && settingsMenu.map(item => (
                <NavIcon 
                  key={item.id} 
                  icon={item.icon} 
                  label={item.label} 
                  active={activeSettingsTab === item.id}
                  onClick={() => setActiveSettingsTab?.(item.id as any)}
                  theme={theme}
                  isExpanded={isExpanded}
                />
              ))}
            </>
          )}
        </nav>

        {/* Bottom Actions */}
        <div className={`pb-5 flex flex-col ${isExpanded ? 'items-start px-4' : 'items-center px-0'} gap-2.5 relative z-10 transition-all`}>
          <div className={`h-px ${isExpanded ? 'w-full' : 'w-10 mx-auto'} ${theme === 'dark' ? 'bg-white/12' : 'bg-slate-200/80'} transition-all`}></div>
          
          <button 
            onClick={toggleTheme}
            className={`flex items-center transition-all duration-200 border cursor-pointer ${
              isExpanded 
                ? 'w-full px-4 justify-start gap-3 h-11 rounded-2xl' 
                : 'w-11 h-11 px-0 justify-center mx-auto rounded-2xl'
            } ${
              theme === 'dark' 
                ? 'bg-gradient-to-b from-zinc-800 to-zinc-900 text-amber-400 hover:border-amber-400/50 border-white/15 shadow-[0_4px_15px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.12)] hover:shadow-[0_0_18px_rgba(251,191,36,0.25)]' 
                : 'bg-white text-slate-700 hover:bg-slate-50 border-slate-200/90 shadow-xs'
            }`}
            title={!isExpanded ? "Changer de thème" : undefined}
          >
            <div className="shrink-0 flex items-center justify-center">
              {theme === 'dark' ? <Zap size={19} /> : <Activity size={19} />}
            </div>
            {isExpanded && <span className="text-sm font-bold tracking-tight">Mode {theme === 'dark' ? 'Sombre' : 'Clair'}</span>}
          </button>

          <button 
            onClick={onLogout}
            className={`flex items-center transition-all duration-200 border cursor-pointer ${
              isExpanded 
                ? 'w-full px-4 justify-start gap-3 h-11 rounded-2xl' 
                : 'w-11 h-11 px-0 justify-center mx-auto rounded-2xl'
            } ${
              theme === 'dark' 
                ? 'bg-rose-500/15 text-rose-400 hover:bg-rose-500/25 border-rose-500/30 hover:border-rose-400/50 shadow-[0_4px_12px_rgba(0,0,0,0.4)]' 
                : 'bg-rose-50 text-rose-600 hover:bg-rose-100 border-rose-200/80 shadow-2xs'
            }`}
            title={!isExpanded ? "Déconnexion" : undefined}
          >
            <div className="shrink-0 flex items-center justify-center">
              <LogOut size={19} />
            </div>
            {isExpanded && <span className="text-sm font-bold tracking-tight">Déconnexion</span>}
          </button>

          {/* Mini Profile (Clickable: Opens Mon Profil & Finances) */}
          <div 
            onClick={() => onOpenProfile ? onOpenProfile() : window.dispatchEvent(new CustomEvent('open-user-profile'))}
            className={`relative group mt-1 flex items-center cursor-pointer transition-all ${
              isExpanded 
                ? `w-full px-3 gap-3 py-2 rounded-2xl border ${
                    theme === 'dark' 
                      ? 'bg-gradient-to-b from-zinc-800/80 to-zinc-900/80 border-white/12 hover:border-blue-400/50 shadow-[0_4px_12px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.1)]' 
                      : 'bg-slate-50/80 border-slate-200/80 hover:border-blue-300 hover:bg-blue-50/30'
                  }` 
                : 'justify-center w-full px-0'
            }`}
            title="Mon Profil & Mes Finances"
          >
            <Avatar 
              user={user} 
              size={40} 
              roundedClassName="rounded-xl" 
              className={`border-2 ${theme === 'dark' ? 'border-white/20' : 'border-white'} shadow-md group-hover:border-blue-500 transition-colors mx-auto ${isExpanded ? 'mx-0' : ''}`} 
            />
            {isExpanded && (
              <div className="flex flex-col overflow-hidden text-left min-w-0">
                <p className={`text-sm font-extrabold truncate group-hover:text-blue-400 transition-colors ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>{user.name}</p>
                <p className="text-xs font-bold text-blue-500 dark:text-blue-400 uppercase tracking-wider truncate">{user.role}</p>
              </div>
            )}
            {!isExpanded && (
              <div className={`absolute left-full ml-4 top-1/2 -translate-y-1/2 px-4 py-2.5 rounded-2xl whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-all duration-200 z-50 ${
                theme === 'dark' ? 'bg-[#151824] text-white border border-white/20 shadow-[0_15px_35px_rgba(0,0,0,0.9),inset_0_1px_0_rgba(255,255,255,0.2)]' : 'bg-white text-slate-900 shadow-xl border border-slate-200'
              }`}>
                <p className="text-sm font-extrabold">{user.name}</p>
                <p className="text-xs font-bold text-blue-500 uppercase tracking-wider">{user.role} • Mon Profil</p>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </>
  );
};

// Sub-component for navigation icons with tooltips
interface NavIconProps {
  icon: any;
  label: string;
  active?: boolean;
  onClick: () => void;
  theme: 'light' | 'dark';
  isExpanded: boolean;
  badgeCount?: number;
  badgeType?: 'critical' | 'warning' | 'info';
}

const NavIcon: React.FC<NavIconProps> = ({ icon: Icon, label, active, onClick, theme, isExpanded, badgeCount, badgeType }) => {
  return (
    <div className={`relative group/nav ${isExpanded ? 'w-full' : 'w-full flex justify-center'}`}>
      <button
        onClick={onClick}
        title={!isExpanded ? label : undefined}
        className={`h-11 rounded-2xl flex items-center transition-all duration-200 relative overflow-hidden group cursor-pointer ${
          isExpanded 
            ? 'w-full px-4 justify-start gap-3.5' 
            : 'w-11 px-0 justify-center mx-auto'
        } ${
          active
            ? (theme === 'dark' 
                ? 'bg-gradient-to-r from-blue-600 to-blue-500 text-white border border-blue-400/60 shadow-[0_8px_20px_-4px_rgba(37,99,235,0.6),inset_0_1px_0_rgba(255,255,255,0.35)]' 
                : 'bg-gradient-to-r from-slate-900 to-slate-800 text-white shadow-lg shadow-slate-900/20')
            : theme === 'dark'
            ? 'text-zinc-300 hover:text-white hover:bg-white/[0.07] border border-transparent hover:border-white/15'
            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/90 border border-transparent hover:border-slate-200/80'
        }`}
      >
        <div className="relative shrink-0 flex items-center justify-center">
          <Icon size={20} className={`transition-transform duration-200 ${active ? 'scale-110' : 'group-hover/nav:scale-110'}`} />
          {badgeCount && badgeCount > 0 && !isExpanded && (
            <span className={`absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full ${badgeType === 'critical' ? 'bg-rose-500 animate-pulse ring-2 ring-white dark:ring-slate-900' : 'bg-amber-500'}`} />
          )}
        </div>
        
        {isExpanded && (
          <div className="flex items-center justify-between flex-1 min-w-0 pr-1">
            <span className="text-[13.5px] font-bold tracking-tight whitespace-nowrap overflow-hidden text-ellipsis leading-none">
              {label}
            </span>
            {badgeCount && badgeCount > 0 && (
              <span className={`px-2 py-0.5 rounded-full text-xs font-extrabold text-white ${badgeType === 'critical' ? 'bg-rose-500 animate-pulse' : 'bg-amber-500'}`}>
                {badgeCount}
              </span>
            )}
          </div>
        )}
        
        {/* Active Indicator Dot */}
        {active && isExpanded && !badgeCount && (
          <div className="absolute right-3 w-2 h-2 rounded-full bg-white shadow-[0_0_10px_rgba(255,255,255,0.9)]" />
        )}
      </button>

      {!isExpanded && (
        <div className={`absolute left-full ml-4 top-1/2 -translate-y-1/2 px-4 py-2 rounded-2xl whitespace-nowrap opacity-0 pointer-events-none group-hover/nav:opacity-100 transition-all duration-200 z-50 translate-x-1 group-hover/nav:translate-x-0 flex items-center gap-2 ${
          theme === 'dark' ? 'bg-[#151824] text-white border border-white/20 shadow-[0_15px_35px_rgba(0,0,0,0.9),inset_0_1px_0_rgba(255,255,255,0.2)]' : 'bg-slate-900 text-white shadow-xl'
        }`}>
          <span className="text-sm font-bold">{label}</span>
          {badgeCount && badgeCount > 0 && (
            <span className={`px-2 py-0.5 rounded-full text-xs font-extrabold text-white ${badgeType === 'critical' ? 'bg-rose-500' : 'bg-amber-500'}`}>
              {badgeCount}
            </span>
          )}
        </div>
      )}
    </div>
  );
};

export default Sidebar;
