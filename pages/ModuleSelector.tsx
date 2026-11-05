import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Avatar } from '../components/common/Avatar';
import { 
  Users, 
  Stethoscope, 
  BedDouble, 
  Baby, 
  Pill, 
  CreditCard, 
  LayoutDashboard,
  Settings,
  Activity,
  ShieldAlert,
  Microscope,
  TrendingUp,
  ChevronRight,
  Zap,
  LogOut,
  Heart,
  Loader2
} from 'lucide-react';
import { Role, User } from '../types';
import { useSystemAlerts } from '../hooks/useSystemAlerts';
import { SystemAlertsDropdown } from '../components/SystemAlertsDropdown';
import { useHospitalServices } from '../hooks/useSettings';
import { CANONICAL_MODULES, isModuleActiveAndAvailable } from '../src/config/modules';

interface ModuleSelectorProps {
  user: User;
  onSelectModule: (role: Role) => void;
  onLogout: () => void;
  onOpenProfile?: () => void;
  theme: 'light' | 'dark';
  toggleTheme: () => void;
}

const ModuleSelector: React.FC<ModuleSelectorProps> = ({ user, onSelectModule, onLogout, onOpenProfile, theme, toggleTheme }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [showAlerts, setShowAlerts] = useState(false);
  
  // Real-time, role-based system alerts from Firestore
  const { 
    alerts, 
    criticalCount, 
    totalCount, 
    navigateToAlert 
  } = useSystemAlerts(user);
  
  // Real-time Firestore synchronization of hospital services
  const { services, loading: servicesLoading } = useHospitalServices();

  // Canonical icon and UI decoration map
  const moduleIcons: Record<string, any> = {
    [Role.RECEPTION]: Users,
    [Role.NURSE]: Heart,
    [Role.INPATIENT]: BedDouble,
    [Role.CASHIER]: CreditCard,
    [Role.DOCTOR]: Stethoscope,
    [Role.URGENCE]: ShieldAlert,
    [Role.MATERNITY]: Baby,
    [Role.LAB]: Microscope,
    [Role.PHARMACY]: Pill,
    [Role.ACCOUNTANT]: TrendingUp,
    [Role.SUPER_ADMIN]: ShieldAlert,
    ['SETTING']: Settings,
    [Role.ADMIN]: LayoutDashboard,
  };

  const isAdmin = user.role === Role.ADMIN || 
                  user.role === Role.SUPER_ADMIN || 
                  user.roles?.includes('role_admin') || 
                  user.roles?.includes('role_super_admin');

  // Filter modules strictly:
  // 1. Module must be genuinely implemented (status === 'IMPLEMENTED').
  // 2. Corresponding parametric service in Firestore must be actively enabled (status === 'active').
  //    If a service is deactivated in Parameters, it disappears for EVERYONE (including Admins).
  // 3. User must have appropriate RBAC permission.
  // 4. Must match search term if specified.
  const filteredModules = CANONICAL_MODULES.filter(m => {
    // 0. Super Admin cockpit is NEVER displayed on the hospital module dashboard
    if (m.role === Role.SUPER_ADMIN || m.id === 'super_admin') return false;

    // 1. Strict implementation check
    if (m.status !== 'IMPLEMENTED') return false;

    // 2. Strict service activation check (applies to all users, even admins)
    if (!isModuleActiveAndAvailable(m.role, services)) {
      return false;
    }

    // 3. Search query filter
    const q = (searchTerm || '').toLowerCase().trim();
    const matchesSearch = !q || 
                        (m.label || '').toLowerCase().includes(q) || 
                        (m.description || '').toLowerCase().includes(q);
    if (!matchesSearch) return false;

    // 4. RBAC Permission filter
    if (isAdmin) {
      // Super Admin module is only for Super Admin
      if (m.role === Role.SUPER_ADMIN && user.role !== Role.SUPER_ADMIN && !user.roles?.includes('role_super_admin')) {
        return false;
      }
      return true;
    }

    const hasLegacyAccess = m.defaultAccessRoles.includes(user.role);
    const hasRoleAccess = user.roles?.some(roleId => {
      if (roleId === 'role_admin' || roleId === 'role_super_admin') return true;
      if (roleId === 'role_medecin' && (m.role === Role.DOCTOR || m.role === Role.RECEPTION || m.role === Role.INPATIENT)) return true;
      if (roleId === 'role_infirmier' && (m.role === Role.NURSE || m.role === Role.RECEPTION || m.role === Role.INPATIENT)) return true;
      if (roleId === 'role_chef_service' && (m.role === Role.DOCTOR || m.role === Role.INPATIENT)) return true;
      if (roleId === 'role_caissier' && (m.role === Role.CASHIER || m.role === Role.RECEPTION)) return true;
      if ((roleId === 'role_secretaire' || roleId === 'role_accueil') && m.role === Role.RECEPTION) return true;
      if (roleId === 'role_pharmacien' && m.role === Role.PHARMACY) return true;
      if (roleId === 'role_laborantin' && m.role === Role.LAB) return true;
      return false;
    });

    return hasLegacyAccess || hasRoleAccess;
  });

  return (
    <div className={`h-screen max-h-screen ${theme === 'dark' ? 'bg-[#000000] text-zinc-200' : 'bg-[#F0F5F9] text-slate-900'} selection:bg-blue-100 overflow-hidden font-sans relative flex flex-col transition-colors duration-300`}>
      {/* Unified Top Navigation */}
      <header className={`h-20 ${theme === 'dark' ? 'bg-[#0a0a0a]/90 border-zinc-800 text-zinc-200' : 'bg-white border-slate-200 text-slate-900'} border-b backdrop-blur-md flex items-center justify-between px-10 shrink-0 z-50`}>
        <div className="flex items-center gap-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-xl shadow-lg shadow-blue-600/20 flex items-center justify-center rotate-3">
              <Activity className="text-white" size={22} />
            </div>
            <span className={`text-xl font-black tracking-tighter uppercase italic ${theme === 'dark' ? 'text-zinc-100' : 'text-slate-900'}`}>SmartHosto</span>
          </div>

          <div className={`h-8 w-px ${theme === 'dark' ? 'bg-zinc-800' : 'bg-slate-200'} hidden md:block`}></div>

          <div className="hidden md:flex flex-col">
            <h1 className={`text-lg font-black tracking-tight leading-none ${theme === 'dark' ? 'text-zinc-100' : 'text-slate-800'}`}>
              Bonjour, <span className="text-blue-500">{user.name}</span>
            </h1>
            <p className={`text-[9px] font-black uppercase tracking-widest mt-1 ${theme === 'dark' ? 'text-zinc-400' : 'text-slate-400'}`}>
              Cockpit Opérationnel • {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-6">
          <div className="hidden lg:flex items-center gap-4">
            <div className="relative">
              <input 
                type="text" 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Rechercher un module..." 
                className={`w-64 ${theme === 'dark' ? 'bg-zinc-900 border border-zinc-800 text-zinc-200 placeholder:text-zinc-500' : 'bg-slate-100 text-slate-900 border-transparent placeholder:text-slate-400'} rounded-2xl py-2 px-10 text-[11px] font-bold focus:ring-2 focus:ring-blue-500/40 transition-all`}
              />
              <LayoutDashboard size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-zinc-500" />
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Theme Toggle */}
            <button 
              onClick={toggleTheme}
              className={`p-2.5 rounded-xl transition-all border ${theme === 'dark' ? 'bg-zinc-900 text-amber-400 border-zinc-800 hover:border-zinc-700 hover:shadow-[0_0_12px_rgba(251,191,36,0.2)]' : 'bg-slate-100 text-slate-400 hover:text-blue-600 border-transparent'}`}
              title="Changer le thème"
            >
              {theme === 'dark' ? <Zap size={20} /> : <Activity size={20} />}
            </button>

            {/* Real-time Role-based Alerts Button & Popover */}
            <div className="relative">
              <button 
                onClick={() => setShowAlerts(!showAlerts)}
                className={`p-2.5 rounded-xl transition-all relative border ${
                  totalCount > 0 
                    ? criticalCount > 0 
                      ? 'bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 border-rose-500/30' 
                      : 'bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 border-amber-500/30'
                    : theme === 'dark' ? 'bg-zinc-900 text-zinc-400 hover:text-blue-400 border-zinc-800 hover:border-zinc-700' : 'bg-slate-100 text-slate-400 hover:text-blue-600 border-transparent'
                }`}
                title="Alertes système en temps réel"
              >
                <ShieldAlert size={20} className={criticalCount > 0 ? 'animate-bounce' : ''} />
                
                {totalCount > 0 && (
                  <span className={`absolute -top-1.5 -right-1.5 min-w-[1.25rem] h-5 px-1 rounded-full text-[10px] font-black flex items-center justify-center text-white shadow-md ${
                    criticalCount > 0 ? 'bg-rose-600 animate-pulse' : 'bg-amber-500'
                  }`}>
                    {totalCount}
                  </span>
                )}
              </button>

              <SystemAlertsDropdown 
                alerts={alerts}
                user={user}
                theme={theme}
                isOpen={showAlerts}
                onClose={() => setShowAlerts(false)}
                onSelectAlert={(alert) => {
                  setShowAlerts(false);
                  navigateToAlert(alert);
                }}
              />
            </div>

            <button 
              onClick={onLogout}
              className={`p-2.5 rounded-xl cursor-pointer transition-all flex items-center gap-2 px-3 border ${theme === 'dark' ? 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-rose-400 hover:border-rose-500/40 hover:bg-rose-500/10' : 'bg-slate-100 text-slate-400 hover:text-rose-600 hover:bg-rose-50 border-transparent'}`}
              title="Se déconnecter"
            >
              <LogOut size={20} />
              <span className="text-[10px] font-black uppercase hidden sm:block">Déconnexion</span>
            </button>

            <div 
              onClick={() => onOpenProfile ? onOpenProfile() : window.dispatchEvent(new CustomEvent('open-user-profile'))}
              className="flex items-center gap-3 pl-4 border-l border-slate-200 dark:border-zinc-800 group cursor-pointer hover:opacity-90 transition-opacity"
              title="Mon Profil & Mes Finances"
            >
              <div className="text-right hidden sm:block">
                <p className={`text-[11px] font-extrabold uppercase tracking-[0.1em] font-heading group-hover:text-blue-500 transition-colors ${theme === 'dark' ? 'text-zinc-200' : 'text-slate-900'}`}>{user.username}</p>
                <p className="text-[9px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-widest">{user.profession || 'Personnel'}</p>
              </div>
              <Avatar 
                user={user} 
                size={40} 
                roundedClassName="rounded-xl" 
                className={`border-2 shadow-md transition-all ${theme === 'dark' ? 'border-zinc-800 group-hover:border-blue-500' : 'border-white group-hover:border-blue-200'}`} 
              />
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Scrollable Grid */}
        <div className="flex-1 overflow-y-auto p-10 scrollbar-hide">
          <div className="max-w-[1600px] mx-auto">
            {/* Header info */}
            <div className="flex items-center justify-between mb-10 px-2">
              <h2 className={`text-[10px] font-black uppercase tracking-[0.4em] font-heading ${theme === 'dark' ? 'text-zinc-400' : 'text-slate-400'}`}>
                Modules Opérationnels ({filteredModules.length})
              </h2>
              <div className="flex items-center gap-3">
                 <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.4)]"></div>
                 <span className="text-[10px] font-black text-slate-400 dark:text-zinc-500 uppercase tracking-[0.2em] font-heading">
                   Synchronisation Firestore Active
                 </span>
              </div>
            </div>

            {/* Loading State */}
            {servicesLoading ? (
              <div className="py-24 flex flex-col items-center justify-center gap-4 text-center">
                <Loader2 size={36} className="animate-spin text-blue-600" />
                <p className="text-xs font-black uppercase tracking-wider text-slate-400">
                  Chargement des statuts des modules hospitaliers...
                </p>
              </div>
            ) : filteredModules.length === 0 ? (
              <div className="py-20 text-center bg-white/50 dark:bg-zinc-900/50 rounded-3xl border border-dashed border-slate-200 dark:border-zinc-800 p-8">
                <ShieldAlert size={36} className="mx-auto text-slate-400 mb-3" />
                <h3 className="font-bold text-slate-800 dark:text-zinc-200">Aucun module disponible</h3>
                <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1 max-w-md mx-auto">
                  {searchTerm 
                    ? `Aucun module ne correspond à la recherche "${searchTerm}".` 
                    : "Les modules correspondants sont actuellement désactivés dans Paramètres > Services & Départements ou votre profil n'a pas les autorisations nécessaires."}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-20">
                {filteredModules.map((module, idx) => {
                  const IconComponent = moduleIcons[module.role as string] || Activity;
                  const isSpecial = module.isSpecialAdmin;
                  
                  return (
                    <motion.button
                      key={module.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.04 }}
                      onClick={() => onSelectModule(module.role as Role)}
                      className={`group relative flex flex-col p-8 rounded-[32px] border transition-all duration-300 text-left h-full ${
                        theme === 'dark' 
                          ? 'bg-[#111111] border-zinc-800 hover:border-blue-500/80 shadow-none hover:shadow-[0_0_25px_rgba(59,130,246,0.3)] hover:bg-black' 
                          : 'bg-white border-slate-100 shadow-[0_8px_30px_rgb(0,0,0,0.02)] hover:shadow-[0_40px_80px_rgb(0,0,0,0.12)] hover:border-blue-200'
                      } ${isSpecial && theme === 'light' ? 'bg-slate-50/50' : ''} hover:-translate-y-2 cursor-pointer`}
                    >
                      {/* Shiny Glass Glint & Border Effect */}
                      <div className="absolute inset-0 rounded-[32px] overflow-hidden pointer-events-none">
                        <div className="absolute top-0 left-0 w-[200%] h-full bg-gradient-to-r from-transparent via-white/[0.05] to-transparent -translate-x-[150%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
                        <div className={`absolute inset-0 rounded-[32px] border transition-opacity duration-300 ${theme === 'dark' ? 'border-zinc-800 opacity-100 group-hover:border-blue-500/60' : 'opacity-0'}`}></div>
                      </div>

                      <div className="flex justify-between items-start mb-8 relative z-10">
                        <div className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-all duration-300 shadow-xl ring-1 ${
                          theme === 'dark' 
                            ? 'bg-zinc-900 text-zinc-200 ring-zinc-800 group-hover:bg-blue-600 group-hover:text-white group-hover:shadow-[0_0_20px_rgba(59,130,246,0.4)] group-hover:ring-blue-400/50' 
                            : 'bg-slate-50 text-blue-600 ring-slate-100 group-hover:bg-blue-600 group-hover:text-white group-hover:shadow-blue-500/20'
                        }`}>
                          <IconComponent size={32} className="transition-transform group-hover:scale-110 group-hover:rotate-3" />
                        </div>
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${
                          theme === 'dark'
                            ? 'bg-zinc-900 text-zinc-500 border border-zinc-800 group-hover:bg-blue-600 group-hover:text-white group-hover:border-blue-500'
                            : 'bg-slate-50 text-slate-400 border border-slate-100 group-hover:bg-blue-600 group-hover:text-white group-hover:border-blue-500'
                        }`}>
                          <ChevronRight size={16} className="transition-transform group-hover:translate-x-0.5" />
                        </div>
                      </div>
                      
                      <div className="relative z-10 mb-8">
                        <h3 className={`text-2xl font-extrabold tracking-tight uppercase transition-colors font-heading ${theme === 'dark' ? 'text-zinc-100' : 'text-slate-800'} group-hover:text-blue-500`}>
                          {module.label}
                        </h3>
                        <p className={`text-[12px] font-medium mt-2 leading-relaxed h-12 overflow-hidden ${theme === 'dark' ? 'text-zinc-400' : 'text-slate-500'}`}>
                          {module.description}
                        </p>
                      </div>

                      <div className={`mt-auto relative z-10 flex items-center justify-between pt-5 border-t ${theme === 'dark' ? 'border-zinc-800/80' : 'border-slate-100'}`}>
                        <span className={`text-[11px] font-bold uppercase tracking-wider transition-colors ${theme === 'dark' ? 'text-zinc-400 group-hover:text-blue-400' : 'text-slate-500 group-hover:text-blue-600'}`}>
                          Accéder au module
                        </span>
                        <span className={`text-[10px] font-black uppercase tracking-widest ${theme === 'dark' ? 'text-zinc-500 group-hover:text-blue-400' : 'text-slate-400 group-hover:text-blue-600'} flex items-center gap-1`}>
                          Ouvrir →
                        </span>
                      </div>
                    </motion.button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default ModuleSelector;
