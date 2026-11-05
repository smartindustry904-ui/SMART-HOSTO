
import React, { useMemo } from 'react';
import { ShieldAlert, Activity, Eye, Clock, TrendingUp, AlertTriangle, CheckCircle, Users } from 'lucide-react';
import StatCard from './StatCard';
import { EmergencyPatient, TriageLevel } from '../types';

interface EmergencyDashboardProps {
  theme: 'light' | 'dark';
  patients: EmergencyPatient[];
  onNavigateMenu?: (menu: string) => void;
  onSelectPatient?: (patient: EmergencyPatient) => void;
}

const EmergencyDashboard: React.FC<EmergencyDashboardProps> = ({ theme, patients = [], onNavigateMenu, onSelectPatient }) => {
  const stats = useMemo(() => {
    const total = patients.length;
    const triageNeeded = patients.filter(p => !p.triage).length;
    const critical = patients.filter(p => p.triage?.level === TriageLevel.RED || p.triage?.level === TriageLevel.ORANGE).length;
    const orientedToday = patients.filter(p => p.status === 'ORIENTED').length;

    return [
      {
        title: "Total Patients ER",
        value: total.toString().padStart(2, '0'),
        change: total > 0 ? "+12%" : undefined,
        icon: Users,
        color: "bg-slate-900",
        subtext: "Actuellement en service",
        onClick: () => onNavigateMenu?.('ROOMS')
      },
      {
        title: "Cas Critiques",
        value: critical.toString().padStart(2, '0'),
        change: undefined,
        icon: AlertTriangle,
        color: "bg-rose-600",
        subtext: "Priorité absolue",
        onClick: () => onNavigateMenu?.('ROOMS')
      },
      {
        title: "Attente Triage",
        value: triageNeeded.toString().padStart(2, '0'),
        change: undefined,
        icon: Clock,
        color: "bg-amber-500",
        subtext: "À qualifier",
        onClick: () => onNavigateMenu?.('TRIAGE')
      },
      {
        title: "Orientés / Sorties",
        value: orientedToday.toString().padStart(2, '0'),
        change: undefined,
        icon: CheckCircle,
        color: "bg-emerald-600",
        subtext: "Dernière 24h",
        onClick: () => onNavigateMenu?.('ARCHIVES')
      }
    ];
  }, [patients, onNavigateMenu]);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div>
        <h2 className={`text-3xl font-extrabold ${theme === 'dark' ? 'text-white' : 'text-slate-900'} tracking-tight mb-2 font-heading italic uppercase`}>
          Tableau de Bord <span className="text-rose-600">Urgences</span>
        </h2>
        <p className={`${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'} text-sm font-medium`}>
          Moniteur de flux critique et gestion de la file active.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, i) => (
          <StatCard key={i} {...stat} theme={theme} />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className={`lg:col-span-2 p-8 rounded-[40px] border ${theme === 'dark' ? 'bg-[#0f172a] border-white/10 shadow-sm' : 'bg-white border-slate-100 shadow-sm'} overflow-hidden`}>
            <div className="flex justify-between items-center mb-6">
              <h3 className={`text-xl font-black ${theme === 'dark' ? 'text-white' : 'text-slate-950'} uppercase tracking-tight flex items-center gap-3`}>
                  <Activity className="text-rose-600" /> Flux d'Arrivée (Temps Réel)
              </h3>
            </div>
            <div className="overflow-x-auto -mx-8">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-50/50">
                  <tr>
                    <th className="px-8 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">Patient</th>
                    <th className="px-8 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">Arrivée</th>
                    <th className="px-8 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">Triage</th>
                    <th className="px-8 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">Statut</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {patients.slice(0, 5).map((p, i) => (
                    <tr 
                      key={i} 
                      onClick={() => onSelectPatient ? onSelectPatient(p) : onNavigateMenu?.('TRIAGE')}
                      className="hover:bg-slate-50 transition-colors group cursor-pointer"
                    >
                      <td className="px-8 py-6">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold ${
                              p.triage?.level === TriageLevel.RED ? 'bg-rose-500 text-white' :
                              p.triage?.level === TriageLevel.ORANGE ? 'bg-orange-500 text-white' :
                              'bg-slate-100 text-slate-500 font-black'
                          }`}>
                              {p.lastName[0]}
                          </div>
                          <div>
                            <p className={`font-black text-sm ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>{p.lastName} {p.firstName}</p>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{p.id}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-8 py-6 text-[10px] text-slate-500 font-bold italic">
                        {p.arrivalTimestamp.split('T')[1].split('.')[0]}
                      </td>
                      <td className="px-8 py-6">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest ${
                            p.triage?.level === TriageLevel.RED ? 'bg-rose-50 text-rose-600' :
                            p.triage?.level === TriageLevel.ORANGE ? 'bg-orange-50 text-orange-600' :
                            p.triage?.level === TriageLevel.YELLOW ? 'bg-amber-50 text-amber-600' :
                            'bg-emerald-50 text-emerald-600'
                        }`}>
                            {p.triage?.level || 'À TRIER'}
                        </span>
                      </td>
                      <td className="px-8 py-6">
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest ${
                            p.status === 'ER_ROOM' ? 'bg-rose-100 text-rose-600' :
                            p.status === 'TRIAGE' ? 'bg-amber-100 text-amber-600' :
                            'bg-slate-100 text-slate-500'
                        }`}>
                            {p.status.replace('_', ' ')}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {patients.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-8 py-20 text-center text-slate-400 font-bold uppercase text-xs italic opacity-50">
                        Aucun patient aux urgences
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
        </div>

    <div className={`p-8 rounded-[40px] border ${theme === 'dark' ? 'bg-[#0f172a] border-white/10' : 'bg-white border-slate-100 shadow-sm'}`}>
      <h3 className={`text-xl font-black ${theme === 'dark' ? 'text-white' : 'text-slate-950'} mb-6 uppercase tracking-tight`}>Distribution Triage</h3>
      <div className="space-y-4">
        {[TriageLevel.RED, TriageLevel.ORANGE, TriageLevel.YELLOW, TriageLevel.GREEN].map((lvl) => {
          const count = patients.filter(p => p.triage?.level === lvl).length;
          const total = patients.length;
          const percentage = total > 0 ? (count / total) * 100 : 0;
          return (
                        <div key={lvl} className="space-y-1.5">
                            <div className="flex justify-between text-[10px] font-black uppercase tracking-widest">
                                <span className={
                                    lvl === TriageLevel.RED ? 'text-rose-600' :
                                    lvl === TriageLevel.ORANGE ? 'text-orange-500' :
                                    lvl === TriageLevel.YELLOW ? 'text-amber-500' : 'text-emerald-500'
                                }>{lvl}</span>
                                <span className="text-slate-400">{count} Patients</span>
                            </div>
                            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                                <div 
                                    className={`h-full ${
                                        lvl === TriageLevel.RED ? 'bg-rose-600' :
                                        lvl === TriageLevel.ORANGE ? 'bg-orange-500' :
                                        lvl === TriageLevel.YELLOW ? 'bg-amber-500' : 'bg-emerald-500'
                                    }`} 
                                    style={{ width: `${percentage}%` }}
                                />
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
      </div>
    </div>
  );
};

export default EmergencyDashboard;
