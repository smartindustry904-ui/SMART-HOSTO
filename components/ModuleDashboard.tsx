
import React, { useMemo } from 'react';
import { 
  CreditCard, 
  TestTube, 
  BedDouble, 
  Pill, 
  Baby,
  Users,
  TrendingUp,
  Clock,
  CheckCircle,
  AlertCircle
} from 'lucide-react';
import StatCard from './StatCard';

interface ModuleDashboardProps {
  theme: 'light' | 'dark';
  moduleName: string;
  moduleIcon: any;
  accentColor: string;
  stats: {
    title: string;
    value: string;
    change?: string;
    icon: any;
    color: string;
    subtext: string;
    onClick?: () => void;
    active?: boolean;
  }[];
  recentActivity?: {
    title: string;
    subtitle: string;
    time: string;
    status: string;
    statusColor: string;
  }[];
  children?: React.ReactNode;
}

const ModuleDashboard: React.FC<ModuleDashboardProps> = ({ 
  theme, 
  moduleName, 
  moduleIcon: ModuleIcon, 
  accentColor, 
  stats,
  recentActivity = [],
  children
}) => {
  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div>
        <h2 className={`text-3xl font-extrabold ${theme === 'dark' ? 'text-zinc-100' : 'text-slate-900'} tracking-tight mb-2 font-heading italic uppercase`}>
          Tableau de Bord <span className={accentColor}>{moduleName}</span>
        </h2>
        <p className={`${theme === 'dark' ? 'text-zinc-400' : 'text-slate-500'} text-sm font-medium`}>
          Vue d'ensemble de l'activité du service et indicateurs clés.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, i) => (
          <StatCard key={i} {...stat} theme={theme} />
        ))}
      </div>

      {children && (
        <div className="mt-8">
          {children}
        </div>
      )}
    </div>
  );
};

export default ModuleDashboard;
