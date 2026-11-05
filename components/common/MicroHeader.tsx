import React from 'react';
import { Home, ArrowLeft, LucideIcon } from 'lucide-react';
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

  return (
    <header 
      className={`h-[72px] min-h-[72px] sm:h-20 sm:min-h-[80px] flex items-center justify-between px-5 sm:px-6 rounded-2xl sm:rounded-3xl border mb-4 shrink-0 transition-all duration-200 z-20 gap-4 ${
        isDark 
          ? 'bg-[#0a0a0a]/95 border-zinc-800 text-zinc-100 shadow-none' 
          : 'bg-white/95 border-slate-200/90 text-slate-900 backdrop-blur-md shadow-xs'
      } ${className}`}
    >
      {/* Left side: Navigation & Clean Context */}
      <div className="flex items-center gap-3.5 min-w-0">
        {onHomeClick && (
          <button
            onClick={onHomeClick}
            className={`w-10 h-10 rounded-xl sm:rounded-2xl transition-all flex items-center justify-center shrink-0 cursor-pointer ${
              isDark 
                ? 'bg-zinc-900 text-zinc-200 hover:bg-blue-600 hover:text-white border border-zinc-800 hover:border-blue-500 shadow-none hover:shadow-[0_0_15px_rgba(59,130,246,0.3)]' 
                : 'bg-slate-900 text-white hover:bg-blue-600 shadow-xs'
            }`}
            title="Tableau de Bord Principal"
          >
            <Home size={18} />
          </button>
        )}

        {onBackClick && (
          <button
            onClick={onBackClick}
            className={`w-10 h-10 rounded-xl sm:rounded-2xl transition-all flex items-center justify-center shrink-0 cursor-pointer ${
              isDark 
                ? 'bg-zinc-900 text-zinc-300 hover:text-white hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 hover:shadow-[0_0_12px_rgba(255,255,255,0.05)]' 
                : 'bg-blue-50 text-blue-600 hover:bg-blue-100 shadow-2xs'
            }`}
            title="Retour"
          >
            <ArrowLeft size={18} />
          </button>
        )}

        {Icon && (
          <span className={`w-10 h-10 rounded-xl sm:rounded-2xl shrink-0 hidden sm:flex items-center justify-center ${
            isDark 
              ? 'bg-zinc-900 text-blue-400 border border-zinc-800' 
              : 'bg-blue-50 text-blue-600 shadow-2xs'
          }`}>
            <Icon size={20} />
          </span>
        )}

        {/* Clean Context Title or Breadcrumb (No redundant clutter) */}
        <div className="min-w-0">
          {breadcrumbs && breadcrumbs.length > 1 ? (
            <Breadcrumbs items={breadcrumbs} className="!py-0 !px-0 text-sm font-semibold" />
          ) : (
            <h1 className="text-base sm:text-lg font-black tracking-tight truncate text-slate-900 dark:text-zinc-100">
              {title || (breadcrumbs && breadcrumbs[0]?.label) || ''}
            </h1>
          )}
        </div>
      </div>

      {/* Right side: Essential Actions & User Identity */}
      <div className="flex items-center gap-3 shrink-0">
        {/* Custom Actions (Navigation tabs, Action triggers) */}
        {actions && (
          <div className="flex items-center gap-2">
            {actions}
          </div>
        )}

        {/* Quick Filter Badges (if provided and actions not overflowing) */}
        {quickStats.length > 0 && !actions && (
          <div className={`hidden lg:flex items-center gap-1.5 p-1 rounded-xl border text-xs ${
            isDark 
              ? 'bg-zinc-900 border-zinc-800 text-zinc-300' 
              : 'bg-slate-100/90 border-slate-200/60 text-slate-600'
          }`}>
            {quickStats.map((stat, idx) => (
              <button
                key={idx}
                onClick={stat.onClick}
                disabled={!stat.onClick}
                className={`px-2.5 py-1 rounded-lg font-bold text-xs transition-all flex items-center gap-1.5 ${
                  stat.onClick ? 'cursor-pointer' : 'cursor-default'
                } ${
                  stat.active 
                    ? isDark 
                      ? 'bg-blue-600 text-white ring-1 ring-blue-400/50 shadow-[0_0_12px_rgba(59,130,246,0.35)]' 
                      : 'bg-white text-blue-600 shadow-2xs ring-1 ring-blue-500/20' 
                    : stat.onClick 
                    ? isDark 
                      ? 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800' 
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/60' 
                    : isDark ? 'text-zinc-400' : 'text-slate-600'
                }`}
              >
                <span>{stat.label}</span>
                <span className={`px-1.5 py-0.5 rounded-md text-[11px] font-black ${
                  stat.color || (isDark ? 'bg-zinc-800 text-zinc-300' : 'bg-slate-200 text-slate-700')
                }`}>
                  {stat.value}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Minimalist User Tag */}
        {user?.name && (
          <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-all ${
            isDark 
              ? 'bg-zinc-900 border-zinc-800 text-zinc-200 hover:border-zinc-700' 
              : 'bg-slate-50 border-slate-200/80 text-slate-800'
          }`}>
            <Avatar user={user} size={24} iconSize={13} roundedClassName="rounded-lg" />
            <span className="text-xs font-bold hidden md:inline truncate max-w-[130px]">{user.name}</span>
          </div>
        )}
      </div>
    </header>
  );
};

export default MicroHeader;

