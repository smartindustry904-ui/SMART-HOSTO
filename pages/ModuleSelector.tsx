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
import { CANONICAL_MODULES, isModuleActiveAndAvailable, isUserAuthorizedForModule } from '../src/config/modules';
import { useCustomRoles } from '../hooks/useCustomRoles';

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
  const { roles: customRoles } = useCustomRoles(user);

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

    // 4. Strict RBAC Permission filter (each user only sees their authorized modules)
    return isUserAuthorizedForModule(user, m.role, customRoles);
  });

  return (
    <div className={`h-screen max-h-screen ${theme === 'dark' ? 'bg-[#050508] text-zinc-100' : 'bg-[#f1f5f9] text-slate-900'} selection:bg-blue-500/20 overflow-hidden font-sans relative flex flex-col transition-colors duration-300`}>
      {/* Ambient Background Glows */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className={`absolute -top-40 -left-40 w-[550px] h-[550px] rounded-full blur-[150px] ${theme === 'dark' ? 'bg-blue-600/10' : 'bg-blue-400/15'}`} />
        <div className={`absolute -bottom-40 -right-40 w-[550px] h-[550px] rounded-full blur-[150px] ${theme === 'dark' ? 'bg-emerald-600/10' : 'bg-emerald-400/15'}`} />
      </div>

      {/* Unified Top Navigation with 3D Elevation & Specular Rim */}
      <header className={`relative h-20 sm:h-22 border-b backdrop-blur-xl flex items-center justify-between px-6 sm:px-10 shrink-0 z-50 transition-all ${
        theme === 'dark' 
          ? 'bg-gradient-to-b from-[#171a26] to-[#0f111a] border-white/15 text-white shadow-[0_12px_36px_-6px_rgba(0,0,0,0.8),inset_0_1px_0_0_rgba(255,255,255,0.18)]' 
          : 'bg-gradient-to-b from-white to-slate-50/95 border-slate-200/90 text-slate-900 shadow-[0_8px_24px_-4px_rgba(15,23,42,0.06),inset_0_1px_0_0_rgba(255,255,255,1)]'
      }`}>
        <div className="flex items-center gap-6 sm:gap-8">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-700 rounded-2xl border border-blue-400/40 shadow-[0_8px_20px_-4px_rgba(37,99,235,0.6),inset_0_1px_0_0_rgba(255,255,255,0.35)] flex items-center justify-center">
              <Activity className="text-white" size={24} />
            </div>
            <div>
              <span className={`text-xl font-black tracking-tight block leading-none ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>
                Smart<span className="text-blue-500">Hosto</span>
              </span>
              <span className="text-xs font-extrabold text-blue-500 uppercase tracking-widest mt-1 block">Portail Clinique</span>
            </div>
          </div>

          <div className={`h-8 w-px ${theme === 'dark' ? 'bg-white/15' : 'bg-slate-200'} hidden md:block`}></div>

          <div className="hidden md:flex flex-col">
            <h1 className={`text-lg font-black tracking-tight leading-none ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>
              Bonjour, <span className="text-blue-500">{user.name}</span>
            </h1>
            <p className={`text-xs font-bold mt-1.5 capitalize ${theme === 'dark' ? 'text-zinc-400' : 'text-slate-500'}`}>
              Cockpit Opérationnel • {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-4 sm:gap-5">
          <div className="hidden lg:flex items-center gap-3">
            <div className="relative">
              <input 
                type="text" 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Rechercher un service ou module..." 
                className={`w-72 ${
                  theme === 'dark' 
                    ? 'bg-[#0b0d14] border border-white/15 text-white placeholder:text-zinc-500 shadow-[inset_0_2px_4px_rgba(0,0,0,0.6)] focus:border-blue-400' 
                    : 'bg-slate-100/90 text-slate-900 border border-slate-300/80 placeholder:text-slate-400 shadow-inner focus:bg-white'
                } rounded-2xl py-2.5 pl-10 pr-4 text-sm font-semibold focus:ring-2 focus:ring-blue-500/30 transition-all`}
              />
              <LayoutDashboard size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-zinc-400" />
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Theme Toggle */}
            <button 
              onClick={toggleTheme}
              className={`w-11 h-11 rounded-2xl flex items-center justify-center transition-all border cursor-pointer ${
                theme === 'dark' 
                  ? 'bg-gradient-to-b from-zinc-800 to-zinc-900 text-amber-400 border-white/15 shadow-[0_4px_12px_rgba(0,0,0,0.5),inset_0_1px_0_0_rgba(255,255,255,0.15)] hover:border-amber-400/50' 
                  : 'bg-white text-slate-700 hover:text-blue-600 border-slate-200/90 shadow-sm hover:shadow-md'
              }`}
              title="Changer le thème"
            >
              {theme === 'dark' ? <Zap size={20} /> : <Activity size={20} />}
            </button>

            {/* Real-time Role-based Alerts Button & Popover */}
            <div className="relative">
              <button 
                onClick={() => setShowAlerts(!showAlerts)}
                className={`w-11 h-11 rounded-2xl flex items-center justify-center transition-all relative border cursor-pointer ${
                  totalCount > 0 
                    ? criticalCount > 0 
                      ? 'bg-rose-500/15 text-rose-400 hover:bg-rose-500/25 border-rose-500/40 shadow-[0_0_15px_rgba(244,63,94,0.25)]' 
                      : 'bg-amber-500/15 text-amber-400 hover:bg-amber-500/25 border-amber-500/40'
                    : theme === 'dark' 
                      ? 'bg-gradient-to-b from-zinc-800 to-zinc-900 text-zinc-300 hover:text-blue-400 border-white/15 shadow-[0_4px_12px_rgba(0,0,0,0.5),inset_0_1px_0_0_rgba(255,255,255,0.15)]' 
                      : 'bg-white text-slate-700 hover:text-blue-600 border-slate-200/90 shadow-sm'
                }`}
                title="Alertes système en temps réel"
              >
                <ShieldAlert size={20} className={criticalCount > 0 ? 'animate-bounce' : ''} />
                
                {totalCount > 0 && (
                  <span className={`absolute -top-1.5 -right-1.5 min-w-[1.35rem] h-5 px-1.5 rounded-full text-xs font-black flex items-center justify-center text-white border border-white/30 shadow-md ${
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
              className={`h-11 px-4 rounded-2xl cursor-pointer transition-all flex items-center gap-2.5 border ${
                theme === 'dark' 
                  ? 'bg-gradient-to-b from-zinc-800 to-zinc-900 text-zinc-200 border-white/15 shadow-[0_4px_12px_rgba(0,0,0,0.5),inset_0_1px_0_0_rgba(255,255,255,0.15)] hover:text-rose-400 hover:border-rose-500/50 hover:bg-rose-500/15' 
                  : 'bg-white text-slate-700 hover:text-rose-600 hover:bg-rose-50 border-slate-200/90 shadow-sm'
              }`}
              title="Se déconnecter"
            >
              <LogOut size={18} />
              <span className="text-sm font-bold hidden sm:block">Déconnexion</span>
            </button>

            <div 
              onClick={() => onOpenProfile ? onOpenProfile() : window.dispatchEvent(new CustomEvent('open-user-profile'))}
              className={`flex items-center gap-3 pl-4 border-l ${theme === 'dark' ? 'border-white/15' : 'border-slate-200'} group cursor-pointer hover:opacity-95 transition-opacity`}
              title="Mon Profil & Mes Finances"
            >
              <div className="text-right hidden sm:block">
                <p className={`text-sm font-extrabold group-hover:text-blue-500 transition-colors ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>{user.name || user.username}</p>
                <p className="text-xs font-bold text-blue-500">{user.profession || user.role}</p>
              </div>
              <Avatar 
                user={user} 
                size={44} 
                roundedClassName="rounded-2xl" 
                className={`border-2 transition-all shadow-md ${theme === 'dark' ? 'border-white/20 group-hover:border-blue-400' : 'border-slate-200 group-hover:border-blue-500'}`} 
              />
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="relative z-10 flex-1 flex flex-col overflow-hidden">
        {/* Scrollable Grid */}
        <div className="flex-1 overflow-y-auto p-6 sm:p-10 custom-scrollbar">
          <div className="max-w-[1560px] mx-auto">
            {/* Header info */}
            <div className="flex flex-wrap items-center justify-between gap-4 mb-8 px-1">
              <div>
                <h2 className={`text-lg sm:text-xl font-black uppercase tracking-wider ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>
                  Départements & Services Actifs ({filteredModules.length})
                </h2>
                <p className={`text-sm font-semibold mt-1 ${theme === 'dark' ? 'text-zinc-400' : 'text-slate-600'}`}>
                  Sélectionnez votre espace de travail clinique ou administratif
                </p>
              </div>
              <div className={`inline-flex items-center gap-2.5 px-4 py-2 rounded-2xl border text-xs sm:text-sm font-bold ${
                theme === 'dark'
                  ? 'bg-emerald-500/15 border-emerald-400/30 text-emerald-300 shadow-[0_0_20px_rgba(16,185,129,0.15),inset_0_1px_0_0_rgba(255,255,255,0.15)]'
                  : 'bg-emerald-50 border-emerald-200 text-emerald-700 shadow-sm'
              }`}>
                 <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_8px_#10b981]" />
                 <span>Synchronisation Temps Réel & Cache Offline-First Actifs</span>
              </div>
            </div>

            {/* Loading State */}
            {servicesLoading ? (
              <div className="py-24 flex flex-col items-center justify-center gap-3 text-center">
                <Loader2 size={36} className="animate-spin text-blue-500" />
                <p className="text-sm font-bold text-slate-500 dark:text-zinc-400">
                  Chargement des départements hospitaliers...
                </p>
              </div>
            ) : filteredModules.length === 0 ? (
              <div className={`py-16 text-center rounded-[28px] border border-dashed p-8 ${
                theme === 'dark' ? 'bg-[#11131a] border-white/15' : 'bg-white border-slate-300'
              }`}>
                <ShieldAlert size={36} className="mx-auto text-slate-400 mb-3" />
                <h3 className="text-lg font-extrabold text-slate-800 dark:text-white">Aucun module disponible</h3>
                <p className="text-sm text-slate-500 dark:text-zinc-400 mt-1 max-w-md mx-auto">
                  {searchTerm 
                    ? `Aucun module ne correspond à la recherche "${searchTerm}".` 
                    : "Les modules correspondants sont actuellement désactivés dans Paramètres > Services & Départements ou votre profil n'a pas les autorisations nécessaires."}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-16">
                {filteredModules.map((module, idx) => {
                  const IconComponent = moduleIcons[module.role as string] || Activity;
                  const isSpecial = module.isSpecialAdmin;
                  
                  return (
                    <motion.button
                      key={module.id}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.025 }}
                      onClick={() => onSelectModule(module.role as Role)}
                      className={`group relative flex flex-col p-7 rounded-[28px] border transition-all duration-300 text-left h-full overflow-hidden ${
                        theme === 'dark' 
                          ? 'bg-gradient-to-b from-[#181b28] to-[#0e1018] border-white/15 hover:border-blue-400/60 shadow-[0_14px_34px_-6px_rgba(0,0,0,0.75),inset_0_1px_0_0_rgba(255,255,255,0.16)] hover:shadow-[0_20px_44px_-8px_rgba(37,99,235,0.35),inset_0_1px_0_0_rgba(255,255,255,0.3)]' 
                          : 'bg-gradient-to-b from-white to-slate-50/90 border-slate-200/90 shadow-[0_10px_28px_-6px_rgba(15,23,42,0.07),inset_0_1px_0_0_rgba(255,255,255,1)] hover:shadow-[0_20px_40px_-8px_rgba(37,99,235,0.18)] hover:border-blue-400/80'
                      } ${isSpecial && theme === 'light' ? 'from-slate-50 to-slate-100/80' : ''} hover:-translate-y-1.5 cursor-pointer`}
                    >
                      {/* Top Specular Shiny Rim Highlight */}
                      <div className="absolute inset-x-8 top-0 h-[1.5px] bg-gradient-to-r from-transparent via-white/30 dark:via-blue-400/40 to-transparent opacity-70 group-hover:opacity-100 pointer-events-none transition-opacity" />

                      <div className="flex justify-between items-start mb-6 relative z-10">
                        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-300 border ${
                          theme === 'dark' 
                            ? 'bg-gradient-to-b from-zinc-800 to-zinc-900 text-blue-400 border-white/15 shadow-[0_6px_16px_rgba(0,0,0,0.5),inset_0_1px_0_0_rgba(255,255,255,0.15)] group-hover:from-blue-500 group-hover:to-blue-700 group-hover:text-white group-hover:border-blue-300/50 group-hover:shadow-[0_8px_22px_rgba(37,99,235,0.55)]' 
                            : 'bg-blue-50 text-blue-600 border-blue-200/80 shadow-sm group-hover:bg-blue-600 group-hover:text-white group-hover:border-blue-600 group-hover:shadow-md'
                        }`}>
                          <IconComponent size={28} className="transition-transform group-hover:scale-110" />
                        </div>
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                          theme === 'dark'
                            ? 'bg-zinc-800/90 text-zinc-300 border border-white/15 shadow-inner group-hover:bg-blue-600 group-hover:text-white group-hover:border-blue-400'
                            : 'bg-slate-100 text-slate-600 border border-slate-200/80 group-hover:bg-blue-600 group-hover:text-white group-hover:border-blue-600'
                        }`}>
                          <ChevronRight size={18} className="transition-transform group-hover:translate-x-0.5" />
                        </div>
                      </div>
                      
                      <div className="relative z-10 mb-6">
                        <h3 className={`text-xl font-black tracking-tight transition-colors ${theme === 'dark' ? 'text-white' : 'text-slate-900'} group-hover:text-blue-500`}>
                          {module.label}
                        </h3>
                        <p className={`text-sm font-semibold mt-2 leading-relaxed line-clamp-2 ${theme === 'dark' ? 'text-zinc-300' : 'text-slate-600'}`}>
                          {module.description}
                        </p>
                      </div>

                      <div className={`mt-auto relative z-10 flex items-center justify-between pt-4 border-t ${theme === 'dark' ? 'border-white/12' : 'border-slate-200/80'}`}>
                        <span className={`text-xs sm:text-sm font-bold transition-colors ${theme === 'dark' ? 'text-zinc-400 group-hover:text-blue-400' : 'text-slate-500 group-hover:text-blue-600'}`}>
                          Ouvrir l'espace
                        </span>
                        <span className={`text-xs sm:text-sm font-black ${theme === 'dark' ? 'text-blue-400' : 'text-blue-600'} opacity-80 group-hover:opacity-100 transition-opacity`}>
                          Accéder →
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
