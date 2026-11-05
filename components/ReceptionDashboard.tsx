
import React, { useMemo } from 'react';
import { Users, Clock, CheckCircle, AlertCircle, TrendingUp } from 'lucide-react';
import StatCard from './StatCard';

interface ReceptionDashboardProps {
  theme: 'light' | 'dark';
  patients: any[];
  globalWaitingQueue: any[];
  patientsToDischarge: any[];
  paymentRequests?: any[];
  children?: React.ReactNode;
  onFilterClick?: (filterType: string) => void;
  activeFilter?: string;
}

const ReceptionDashboard: React.FC<ReceptionDashboardProps> = ({ 
  theme, 
  patients = [], 
  globalWaitingQueue = [], 
  patientsToDischarge = [],
  paymentRequests = [],
  children,
  onFilterClick,
  activeFilter
}) => {
  const stats = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const admissionCount = paymentRequests.filter(pr => 
      (pr.sourceModule === 'Reception' || pr.sourceModule === 'RECEPTION') && 
      pr.createdAt?.startsWith(today)
    ).length;
    
    const todayPatients = patients.filter(p => p.createdAt?.startsWith(today)).length;
    const waitingCount = globalWaitingQueue.filter(q => q.status === 'waiting' || q.status === 'waiting_triage').length;
    const dischargeCount = patientsToDischarge.length;
    const emergencyCount = globalWaitingQueue.filter(q => (q.priority === 'critique' || q.priority === 'urgent') && (q.status === 'waiting' || q.status === 'waiting_triage')).length;

    return [
      {
        id: 'admissions',
        title: "Admissions Aujourd'hui",
        value: admissionCount.toString().padStart(2, '0'),
        change: todayPatients > 0 ? `+${todayPatients} Nouveaux` : undefined,
        icon: Users,
        color: "bg-blue-600",
        subtext: "Flux total du jour",
        onClick: onFilterClick ? () => onFilterClick('admissions') : undefined,
        active: activeFilter === 'admissions'
      },
      {
        id: 'waiting',
        title: "En Attente (Global)",
        value: waitingCount.toString().padStart(2, '0'),
        change: undefined,
        icon: Clock,
        color: "bg-amber-500",
        subtext: "En salle d'attente",
        onClick: onFilterClick ? () => onFilterClick('waiting') : undefined,
        active: activeFilter === 'waiting'
      },
      {
        id: 'discharges',
        title: "Sorties à Valider",
        value: dischargeCount.toString().padStart(2, '0'),
        change: undefined,
        icon: CheckCircle,
        color: "bg-emerald-600",
        subtext: "Administratif",
        onClick: onFilterClick ? () => onFilterClick('discharges') : undefined,
        active: activeFilter === 'discharges'
      },
      {
        id: 'emergencies',
        title: "Urgences Signalées",
        value: emergencyCount.toString().padStart(2, '0'),
        change: undefined,
        icon: AlertCircle,
        color: "bg-rose-600",
        subtext: "Prioritaire",
        onClick: onFilterClick ? () => onFilterClick('emergencies') : undefined,
        active: activeFilter === 'emergencies'
      }
    ];
  }, [patients, globalWaitingQueue, patientsToDischarge, paymentRequests, onFilterClick, activeFilter]);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, i) => (
          <StatCard key={stat.title || `stat-${i}`} {...stat} theme={theme} />
        ))}
      </div>

      {children && (
        <div className="mt-6">
          {children}
        </div>
      )}
    </div>
  );
};

export default ReceptionDashboard;
