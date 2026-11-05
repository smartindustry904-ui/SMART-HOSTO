
import React from 'react';
import { TrendingUp, Check } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string;
  change?: string;
  icon: React.ElementType;
  color: string;
  subtext?: string;
  theme: 'light' | 'dark';
  onClick?: () => void;
  active?: boolean;
}

const StatCard: React.FC<StatCardProps> = ({ 
  title, 
  value, 
  change, 
  icon: Icon, 
  color, 
  subtext, 
  theme, 
  onClick,
  active = false
}) => {
  const isDark = theme === 'dark';

  return (
    <div 
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={(e) => {
        if (onClick && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onClick();
        }
      }}
      className={`p-5 rounded-3xl border transition-all duration-300 relative overflow-hidden group select-none ${
        onClick ? 'cursor-pointer hover:-translate-y-0.5 active:scale-[0.98]' : ''
      } ${
        active 
          ? isDark 
            ? 'bg-[#111111] border-blue-500 ring-1 ring-blue-400/50 shadow-[0_0_15px_rgba(59,130,246,0.3)]' 
            : 'bg-blue-50/70 border-blue-500 ring-2 ring-blue-500/30 shadow-md'
          : isDark 
            ? 'bg-[#111111] border-zinc-800 hover:border-zinc-700 hover:shadow-[0_0_15px_rgba(59,130,246,0.15)]' 
            : 'bg-white border-slate-200/80 hover:border-blue-200 shadow-2xs hover:bg-slate-50/50'
      }`}
    >
      {/* Dynamic Background Glow */}
      <div className={`absolute top-0 right-0 w-32 h-32 -mr-16 -mt-16 bg-gradient-to-br ${color.replace('bg-', 'from-')}/15 to-transparent rounded-full opacity-0 group-hover:opacity-100 blur-2xl transition-opacity duration-500 pointer-events-none`}></div>

      <div className="flex justify-between items-start mb-3.5 relative z-10">
        <div className={`p-3 rounded-2xl ${color} bg-opacity-10 text-white shadow-xs ring-1 ring-white/10 group-hover:scale-105 transition-transform flex items-center justify-center`}>
          <Icon size={20} className={active ? 'text-blue-600 dark:text-blue-400' : ''} />
        </div>

        <div className="flex items-center gap-1.5">
          {active && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-blue-600 text-white flex items-center gap-1 shadow-2xs animate-in fade-in">
              <Check size={10} /> Filtre Actif
            </span>
          )}
          {change && (
            <div className={`px-2.5 py-0.5 rounded-full text-[10px] font-black flex items-center gap-1 ${
              parseFloat(change) >= 0 
                ? (isDark ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-emerald-50 text-emerald-600') 
                : (isDark ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' : 'bg-rose-50 text-rose-600')
            }`}>
              <TrendingUp size={11} className={parseFloat(change) < 0 ? 'rotate-180' : ''} />
              {change}
            </div>
          )}
        </div>
      </div>

      <div className="relative z-10">
        <h3 className={`${isDark ? 'text-zinc-400' : 'text-slate-500'} text-[11px] font-black uppercase tracking-wider mb-1 truncate`}>
          {title}
        </h3>
        <div className="flex items-baseline gap-2">
          <p className={`text-2xl sm:text-3xl font-extrabold ${isDark ? 'text-zinc-100' : 'text-slate-900'} leading-none tracking-tight`}>
            {value}
          </p>
          {subtext && (
            <span className={`${isDark ? 'text-zinc-500' : 'text-slate-400'} text-[10px] font-semibold truncate`}>
              {subtext}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default StatCard;
