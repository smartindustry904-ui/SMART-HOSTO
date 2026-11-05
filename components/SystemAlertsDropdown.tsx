import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ShieldAlert, 
  AlertCircle, 
  AlertTriangle, 
  Info, 
  ArrowRight, 
  CheckCheck, 
  Pill, 
  Microscope, 
  BedDouble, 
  Stethoscope, 
  ShieldCheck, 
  ExternalLink,
  Clock,
  X
} from 'lucide-react';
import { useSystemAlerts, SystemAlert } from '../hooks/useSystemAlerts';
import { User, Role } from '../types';

interface SystemAlertsDropdownProps {
  user: User;
  theme: 'light' | 'dark';
  onNavigate?: (module: any, tab?: string) => void;
  onSelectAlert?: (alert: SystemAlert) => void;
  isOpen?: boolean;
  onClose?: () => void;
  alerts?: SystemAlert[];
  className?: string;
}

export const SystemAlertsDropdown: React.FC<SystemAlertsDropdownProps> = ({
  user,
  theme,
  onNavigate,
  onSelectAlert,
  isOpen: externalIsOpen,
  onClose: externalOnClose,
  alerts: externalAlerts,
  className = ''
}) => {
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const [filter, setFilter] = useState<'all' | 'critical' | 'unread'>('all');

  const {
    alerts: hookAlerts,
    unreadAlerts,
    unreadCount,
    criticalCount,
    warningCount,
    infoCount,
    markAsRead,
    markAllAsRead,
    navigateToAlert
  } = useSystemAlerts(user);

  const activeAlerts = externalAlerts || hookAlerts;
  const isControlled = externalIsOpen !== undefined;
  const openState = isControlled ? externalIsOpen : internalIsOpen;

  const closeDropdown = () => {
    if (isControlled && externalOnClose) {
      externalOnClose();
    } else {
      setInternalIsOpen(false);
    }
  };

  const filteredAlerts = React.useMemo(() => {
    if (filter === 'critical') return activeAlerts.filter(a => a.severity === 'critical');
    if (filter === 'unread') return unreadAlerts;
    return activeAlerts;
  }, [activeAlerts, unreadAlerts, filter]);

  const handleAlertClick = (alert: SystemAlert) => {
    markAsRead(alert.id);
    closeDropdown();
    if (onSelectAlert) {
      onSelectAlert(alert);
    } else if (onNavigate) {
      onNavigate(alert.targetModule, alert.targetTab);
    } else {
      navigateToAlert(alert);
    }
  };

  const getSourceIcon = (source: SystemAlert['source']) => {
    switch (source) {
      case 'PHARMACY':
        return <Pill size={14} className="text-teal-500" />;
      case 'LAB':
        return <Microscope size={14} className="text-amber-500" />;
      case 'EMERGENCY':
      case 'TRIAGE':
        return <ShieldAlert size={14} className="text-rose-500" />;
      case 'BEDS':
        return <BedDouble size={14} className="text-indigo-500" />;
      default:
        return <AlertCircle size={14} className="text-blue-500" />;
    }
  };

  const getRoleLabel = () => {
    if (user.role === Role.ADMIN || user.role === Role.SUPER_ADMIN) return 'Vue Administrateur • Tous Services';
    if (user.role === Role.PHARMACY) return 'Vue Pharmacie';
    if (user.role === Role.DOCTOR) return 'Vue Médicale & Clinique';
    if (user.role === Role.LAB) return 'Vue Laboratoire & Analyses';
    if (user.role === Role.NURSE) return 'Vue Soins & Hospitalisation';
    if (user.role === Role.RECEPTION) return 'Vue Accueil & Triage';
    return 'Vue Opérationnelle';
  };

  return (
    <div className={`relative ${className}`}>
      {/* Trigger Button when uncontrolled */}
      {!isControlled && (
        <button 
          onClick={() => setInternalIsOpen(!internalIsOpen)}
          aria-label="Alertes Système"
          title="Alertes Système en temps réel"
          className={`p-2.5 rounded-2xl transition-all relative flex items-center justify-center cursor-pointer ${
            internalIsOpen
              ? (theme === 'dark' ? 'bg-white/15 text-white' : 'bg-blue-100 text-blue-700')
              : (theme === 'dark' 
                  ? 'bg-white/5 text-white/70 hover:text-white hover:bg-white/10' 
                  : 'bg-slate-100 text-slate-600 hover:text-blue-600 hover:bg-slate-200/70')
          }`}
        >
          <ShieldAlert size={20} className={criticalCount > 0 ? 'text-rose-500 animate-bounce' : ''} />
          
          {unreadCount > 0 && (
            <span className={`absolute -top-1 -right-1 flex h-5 min-w-5 px-1 items-center justify-center rounded-full text-[10px] font-black text-white shadow-md transition-all ${
              criticalCount > 0 ? 'bg-rose-600 animate-pulse' : 'bg-blue-600'
            }`}>
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>
      )}

      {/* Popover Menu */}
      <AnimatePresence>
        {openState && (
          <>
            {/* Backdrop */}
            <div 
              className="fixed inset-0 z-40" 
              onClick={closeDropdown} 
            />
            
            <motion.div 
              initial={{ opacity: 0, y: 12, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.96 }}
              transition={{ duration: 0.18 }}
              className={`absolute right-0 mt-3 w-96 max-w-[92vw] rounded-[28px] border z-50 overflow-hidden flex flex-col ${
                theme === 'dark' 
                  ? 'bg-[#111111] border-zinc-800 text-zinc-100 shadow-[0_0_50px_rgba(0,0,0,0.9)]' 
                  : 'bg-white border-slate-200/90 text-slate-900 shadow-xl'
              }`}
            >
              {/* Header */}
              <div className={`p-5 border-b flex items-center justify-between ${
                theme === 'dark' ? 'border-zinc-800 bg-black/50' : 'border-slate-100 bg-slate-50/70'
              }`}>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-xs font-black uppercase tracking-wider font-heading flex items-center gap-2">
                      <ShieldAlert size={16} className={criticalCount > 0 ? 'text-rose-500' : 'text-blue-500'} />
                      Alertes Système
                    </h3>
                    {criticalCount > 0 && (
                      <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-rose-500/10 text-rose-400 border border-rose-500/20 uppercase tracking-widest animate-pulse">
                        {criticalCount} critique{criticalCount > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  <p className={`text-[10px] font-bold mt-1 ${theme === 'dark' ? 'text-zinc-400' : 'text-slate-500'}`}>
                    {getRoleLabel()}
                  </p>
                </div>

                <div className="flex items-center gap-1">
                  {unreadCount > 0 && (
                    <button
                      onClick={markAllAsRead}
                      className={`px-2.5 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1 ${
                        theme === 'dark' ? 'hover:bg-zinc-800 text-blue-400' : 'hover:bg-blue-50 text-blue-600'
                      }`}
                      title="Tout marquer comme lu"
                    >
                      <CheckCheck size={13} />
                      Tout lu
                    </button>
                  )}
                  <button
                    onClick={closeDropdown}
                    className={`p-1.5 rounded-xl transition-colors ${
                      theme === 'dark' ? 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    <X size={15} />
                  </button>
                </div>
              </div>

              {/* Filter Tabs */}
              <div className={`px-4 py-2 border-b flex gap-1.5 ${
                theme === 'dark' ? 'border-zinc-800 bg-black/60' : 'border-slate-100 bg-slate-50/40'
              }`}>
                <button
                  onClick={() => setFilter('all')}
                  className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${
                    filter === 'all'
                      ? (theme === 'dark' ? 'bg-zinc-800 text-zinc-100 shadow-sm' : 'bg-slate-900 text-white shadow-sm')
                      : (theme === 'dark' ? 'text-zinc-400 hover:text-zinc-200' : 'text-slate-500 hover:text-slate-900')
                  }`}
                >
                  Toutes ({activeAlerts.length})
                </button>
                <button
                  onClick={() => setFilter('critical')}
                  className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1 ${
                    filter === 'critical'
                      ? 'bg-rose-600 text-white shadow-sm'
                      : (theme === 'dark' ? 'text-rose-400 hover:text-rose-300 hover:bg-rose-500/10' : 'text-rose-600 hover:bg-rose-50')
                  }`}
                >
                  Critiques ({criticalCount})
                </button>
                {unreadCount > 0 && (
                  <button
                    onClick={() => setFilter('unread')}
                    className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${
                      filter === 'unread'
                        ? 'bg-blue-600 text-white'
                        : (theme === 'dark' ? 'text-blue-400 hover:text-blue-300 hover:bg-blue-500/10' : 'text-blue-600 hover:bg-blue-50')
                    }`}
                  >
                    Non lues ({unreadCount})
                  </button>
                )}
              </div>

              {/* Alerts List */}
              <div className="max-h-[380px] overflow-y-auto p-4 space-y-3 scrollbar-thin">
                {filteredAlerts.length === 0 ? (
                  <div className="py-12 px-4 text-center">
                    <div className="w-12 h-12 mx-auto rounded-2xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center mb-3">
                      <ShieldCheck size={24} />
                    </div>
                    <p className={`text-xs font-black uppercase tracking-wider ${theme === 'dark' ? 'text-zinc-200' : 'text-slate-800'}`}>
                      Aucune Alerte Opérationnelle
                    </p>
                    <p className={`text-[11px] font-medium mt-1 ${theme === 'dark' ? 'text-zinc-400' : 'text-slate-500'}`}>
                      Tous les paramètres et stocks pour votre service sont optimaux.
                    </p>
                  </div>
                ) : (
                  filteredAlerts.map((alert) => {
                    const isCritical = alert.severity === 'critical';
                    const isWarning = alert.severity === 'warning';

                    return (
                      <div
                        key={alert.id}
                        onClick={() => handleAlertClick(alert)}
                        className={`p-4 rounded-2xl border transition-all cursor-pointer group relative text-left ${
                          isCritical
                            ? (theme === 'dark' 
                                ? 'bg-rose-950/20 border-rose-500/30 hover:border-rose-500/60 hover:bg-rose-950/30' 
                                : 'bg-rose-50/80 border-rose-200 hover:border-rose-300 hover:bg-rose-100/70')
                            : isWarning
                            ? (theme === 'dark'
                                ? 'bg-amber-950/20 border-amber-500/30 hover:border-amber-500/60 hover:bg-amber-950/30'
                                : 'bg-amber-50/80 border-amber-200 hover:border-amber-300 hover:bg-amber-100/70')
                            : (theme === 'dark'
                                ? 'bg-black/60 border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900'
                                : 'bg-slate-50 border-slate-200/80 hover:border-blue-300 hover:bg-blue-50/50')
                        }`}
                      >
                        {/* Top Line: Source & Severity & Timestamp */}
                        <div className="flex justify-between items-center mb-2">
                          <div className="flex items-center gap-1.5">
                            {getSourceIcon(alert.source)}
                            <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 dark:text-zinc-500">
                              {alert.sourceLabel}
                            </span>
                            <span className={`text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-md ${
                              isCritical 
                                ? 'bg-rose-500 text-white' 
                                : isWarning 
                                ? 'bg-amber-500 text-slate-950' 
                                : 'bg-blue-500 text-white'
                            }`}>
                              {isCritical ? 'Critique' : isWarning ? 'Attention' : 'Info'}
                            </span>
                          </div>
                          
                          <div className="flex items-center gap-1 text-[9px] font-bold text-slate-400 dark:text-zinc-500">
                            <Clock size={11} />
                            <span>{alert.relativeTime}</span>
                          </div>
                        </div>

                        {/* Title */}
                        <h4 className={`text-xs font-black leading-tight mb-1 group-hover:text-blue-500 transition-colors ${
                          theme === 'dark' ? 'text-zinc-100' : 'text-slate-900'
                        }`}>
                          {alert.title}
                        </h4>

                        {/* Message */}
                        <p className={`text-[11px] font-medium leading-relaxed mb-3 ${
                          theme === 'dark' ? 'text-zinc-400' : 'text-slate-600'
                        }`}>
                          {alert.message}
                        </p>

                        {/* Action Link Button */}
                        <div className="flex items-center justify-between pt-2 border-t border-black/5 dark:border-zinc-800">
                          <span className="text-[9px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-wider flex items-center gap-1">
                            Accéder au service
                          </span>
                          <div className={`p-1.5 rounded-lg transition-transform group-hover:translate-x-1 ${
                            isCritical ? 'bg-rose-500 text-white' : 'bg-blue-600 text-white'
                          }`}>
                            <ArrowRight size={12} />
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Footer */}
              {activeAlerts.length > 0 && (
                <div className={`p-3 text-center border-t text-[10px] font-bold ${
                  theme === 'dark' ? 'border-zinc-800 bg-black/60 text-zinc-500' : 'border-slate-100 bg-slate-50 text-slate-500'
                }`}>
                  Flux en direct de l'infrastructure hospitalière
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

export default SystemAlertsDropdown;
