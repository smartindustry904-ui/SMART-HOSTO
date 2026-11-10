import React, { useState, useEffect } from 'react';
import { Home, ArrowLeft, LucideIcon, Wifi, WifiOff } from 'lucide-react';
import { Breadcrumbs, BreadcrumbItem } from './Breadcrumbs';
import { Avatar } from './Avatar';

export interface QuickStatItem {
  label: string;
  value: string | number;
  color?: string;
  onClick?: () => void;
  active?: boolean;
}

interface MicroHeaderProps {
  icon?: LucideIcon | React.ElementType;
  title?: string;
  subtitle?: string;
  breadcrumbs?: BreadcrumbItem[];
  onHomeClick?: () => void;
  onBackClick?: () => void;
  actions?: React.ReactNode;
  quickStats?: QuickStatItem[];
  user?: { name?: string; role?: string; profile_image_url?: string; profileImage?: string } | null;
  theme?: 'light' | 'dark';
  className?: string;
}

export const MicroHeader: React.FC<MicroHeaderProps> = ({
  icon: Icon,
  title,
  subtitle,
  breadcrumbs,
  onHomeClick,
  onBackClick,
  actions,
  quickStats = [],
  user,
  theme = 'light',
  className = ''
}) => {
  const isDark = theme === 'dark';
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <header 
      className={`micro-header-compact relative h-[44px] min-h-[44px] sm:h-[48px] sm:min-h-[48px] flex items-center justify-between px-3 sm:px-4 rounded-xl border mb-2 shrink-0 transition-all duration-300 z-20 gap-2.5 overflow-hidden ${
        isDark 
          ? 'bg-gradient-to-b from-[#171a26] to-[#0f111a] border-white/15 text-zinc-100 shadow-[0_8px_20px_-6px_rgba(0,0,0,0.8),0_0_14px_-4px_rgba(59,130,246,0.12),inset_0_1px_0_0_rgba(255,255,255,0.2)]' 
          : 'bg-gradient-to-b from-white to-slate-50/90 border-slate-200/90 text-slate-900 backdrop-blur-xl shadow-[0_4px_14px_-4px_rgba(15,23,42,0.06),inset_0_1px_0_0_#ffffff]'
      } ${className}`}
    >
      {/* Top Specular Shiny Rim Highlight */}
      <div className={`absolute top-0 left-6 right-6 h-px pointer-events-none ${
        isDark 
          ? 'bg-gradient-to-r from-transparent via-blue-400/50 to-transparent' 
          : 'bg-gradient-to-r from-transparent via-blue-500/25 to-transparent'
      }`} />

      {/* Left side: Navigation & Clean Context */}
      <div className="flex items-center gap-2.5 min-w-0 relative z-10">
        {onHomeClick && (
          <button
            onClick={onHomeClick}
            className={`w-8 h-8 rounded-xl transition-all flex items-center justify-center shrink-0 cursor-pointer ${
              isDark 
                ? 'bg-gradient-to-b from-zinc-800 to-zinc-900 text-zinc-100 hover:from-blue-600 hover:to-blue-700 hover:text-white border border-white/15 hover:border-blue-400/60 shadow-[0_2px_8px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.15)]' 
                : 'bg-slate-900 text-white hover:bg-blue-600 shadow-xs'
            }`}
            title="Tableau de Bord Principal"
          >
            <Home size={15} />
          </button>
        )}

        {onBackClick && (
          <button
            onClick={onBackClick}
            className={`w-8 h-8 rounded-xl transition-all flex items-center justify-center shrink-0 cursor-pointer ${
              isDark 
                ? 'bg-gradient-to-b from-zinc-800 to-zinc-900 text-zinc-200 hover:text-white hover:from-zinc-700 hover:to-zinc-800 border border-white/15 shadow-[0_2px_8px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.12)]' 
                : 'bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200/80 shadow-2xs'
            }`}
            title="Retour"
          >
            <ArrowLeft size={15} />
          </button>
        )}

        {Icon && (
          <span className={`w-8 h-8 rounded-xl shrink-0 hidden sm:flex items-center justify-center ${
            isDark 
              ? 'bg-gradient-to-br from-blue-500/20 to-indigo-600/10 text-blue-400 border border-blue-400/30 shadow-[0_0_12px_rgba(59,130,246,0.2),inset_0_1px_0_rgba(255,255,255,0.15)]' 
              : 'bg-blue-50 text-blue-600 border border-blue-200/70 shadow-2xs'
          }`}>
            <Icon size={16} />
          </span>
        )}

        {/* Compact Context Title or Breadcrumb */}
        <div className="min-w-0 flex items-center gap-2">
          {breadcrumbs && breadcrumbs.length > 1 ? (
            <Breadcrumbs items={breadcrumbs} className="!py-0 !px-0 text-xs font-bold" />
          ) : (
            <div className="flex items-baseline gap-2 min-w-0">
              <h1 className="text-sm sm:text-[15px] font-extrabold tracking-tight truncate text-slate-900 dark:text-white leading-none">
                {title || (breadcrumbs && breadcrumbs[0]?.label) || ''}
              </h1>
              {subtitle && (
                <span className="hidden lg:inline-block text-[11px] text-slate-500 dark:text-zinc-400 font-medium truncate">
                  • {subtitle}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Right side: Essential Actions, Sync Badge & User Identity */}
      <div className="flex items-center gap-2 shrink-0 relative z-10 [&_button]:!text-xs [&_button]:!py-1 [&_button]:!px-2.5 [&_button]:!rounded-lg">
        {/* Custom Actions (Navigation tabs, Action triggers) */}
        {actions && (
          <div className="flex items-center gap-1.5">
            {actions}
          </div>
        )}

        {/* Quick Filter Badges (if provided and actions not overflowing) */}
        {quickStats.length > 0 && !actions && (
          <div className={`hidden lg:flex items-center gap-1 p-1 rounded-xl border text-[11px] ${
            isDark 
              ? 'bg-[#0b0d14] border-white/12 text-zinc-200 shadow-inner' 
              : 'bg-slate-100/90 border-slate-200/80 text-slate-700'
          }`}>
            {quickStats.map((stat, idx) => (
              <button
                key={idx}
                onClick={stat.onClick}
                disabled={!stat.onClick}
                className={`px-2 py-0.5 rounded-lg font-bold text-[11px] transition-all flex items-center gap-1.5 ${
                  stat.onClick ? 'cursor-pointer' : 'cursor-default'
                } ${
                  stat.active 
                    ? isDark 
                      ? 'bg-gradient-to-b from-blue-500 to-blue-600 text-white border border-blue-400/50 shadow-[0_0_10px_rgba(59,130,246,0.35)]' 
                      : 'bg-white text-blue-600 shadow-2xs ring-1 ring-slate-200' 
                    : stat.onClick 
                    ? isDark 
                      ? 'text-zinc-300 hover:text-white hover:bg-white/5' 
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/80' 
                    : isDark ? 'text-zinc-300' : 'text-slate-600'
                }`}
              >
                <span>{stat.label}</span>
                <span className={`px-1.5 py-0.2 rounded-md text-[10px] font-extrabold tabular-nums ${
                  stat.color || (isDark ? 'bg-zinc-800 text-zinc-200 border border-white/10' : 'bg-slate-200/80 text-slate-800')
                }`}>
                  {stat.value}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Live Offline-First Sync Status Pill */}
        <div
          title={
            isOnline
              ? 'Synchronisation temps réel active (Cache local + Cloud Firestore)'
              : 'Mode Hors-Ligne actif : vos actions sont enregistrées en 0ms dans le cache local et synchronisées dès le retour du réseau'
          }
          className={`hidden xl:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl border text-[11px] font-bold select-none ${
            isOnline
              ? isDark
                ? 'bg-emerald-500/15 border-emerald-400/30 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.12),inset_0_1px_0_rgba(255,255,255,0.1)]'
                : 'bg-emerald-50 border-emerald-200 text-emerald-700'
              : isDark
              ? 'bg-amber-500/15 border-amber-400/30 text-amber-300'
              : 'bg-amber-50 border-amber-200 text-amber-700'
          }`}
        >
          {isOnline ? (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <Wifi size={12} />
              <span>Sync 0ms</span>
            </>
          ) : (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              <WifiOff size={12} />
              <span>Hors-Ligne</span>
            </>
          )}
        </div>

        {/* User Profile Pill (Clickable -> Opens Mon Profil & Mes Finances) */}
        {user?.name && (
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent('open-user-profile'))}
            title="Ouvrir Mon Profil & Mes Activités"
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl border transition-all cursor-pointer ${
              isDark 
                ? 'bg-gradient-to-b from-zinc-800/90 to-zinc-900/90 border-white/15 text-zinc-100 hover:border-blue-400/50 shadow-[0_2px_8px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.15)]' 
                : 'bg-white border-slate-200/90 text-slate-800 hover:border-blue-300 hover:bg-blue-50/40 shadow-2xs'
            }`}
          >
            <Avatar user={user} size={22} iconSize={12} roundedClassName="rounded-lg" />
            <span className="text-xs font-bold hidden md:inline truncate max-w-[115px]">{user.name}</span>
          </button>
        )}
      </div>
    </header>
  );
};

export default MicroHeader;
