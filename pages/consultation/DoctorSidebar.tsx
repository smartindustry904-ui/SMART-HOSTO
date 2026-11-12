
import React from 'react';
import { Users, ClipboardList, Activity, History, Calendar, LogOut, Settings, ChevronRight, FolderOpen } from 'lucide-react';
import { Avatar } from '../../components/common/Avatar';

interface DoctorSidebarProps {
  activeMenu: 'WAITING_ROOM' | 'CONSULTATION' | 'HISTORY' | 'APPOINTMENTS' | 'PATIENT_DIRECTORY' | 'dashboard';
  setActiveMenu: (menu: 'WAITING_ROOM' | 'CONSULTATION' | 'HISTORY' | 'APPOINTMENTS' | 'PATIENT_DIRECTORY' | 'dashboard') => void;
  waitingCount: number;
  doctorName: string;
}

const DoctorSidebar: React.FC<DoctorSidebarProps> = ({ activeMenu, setActiveMenu, waitingCount, doctorName }) => {
  const menuItems = [
    { id: 'WAITING_ROOM', label: 'Salle d\'attente', icon: Users, color: 'emerald', badge: waitingCount },
    { id: 'PATIENT_DIRECTORY', label: 'Annuaire Patients', icon: FolderOpen, color: 'indigo' },
    { id: 'CONSULTATION', label: 'Consultation', icon: ClipboardList, color: 'blue' },
    { id: 'HISTORY', label: 'Archives & Historique', icon: History, color: 'purple' },
    { id: 'APPOINTMENTS', label: 'Rendez-vous', icon: Calendar, color: 'orange' },
  ];

  const getColorClasses = (color: string, isActive: boolean) => {
    if (isActive) {
      switch (color) {
        case 'emerald': return 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20';
        case 'blue': return 'bg-blue-600 text-white shadow-lg shadow-blue-600/20';
        case 'indigo': return 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20';
        case 'amber': return 'bg-amber-500 text-white shadow-lg shadow-amber-500/20';
        case 'purple': return 'bg-purple-600 text-white shadow-lg shadow-purple-600/20';
        case 'orange': return 'bg-orange-500 text-white shadow-lg shadow-orange-500/20';
        default: return 'bg-slate-900 text-white';
      }
    }
    return 'text-slate-500 hover:bg-slate-100';
  };

  return (
    <div className="w-80 h-screen bg-white border-r border-slate-200 flex flex-col p-8 sticky top-0">
      <div className="mb-12">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 bg-blue-600 rounded-2xl flex items-center justify-center text-white font-black text-xl shadow-xl shadow-blue-600/20">S</div>
          <h2 className="text-2xl font-black tracking-tighter text-slate-900">SmartHosto</h2>
        </div>
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] pl-1">Doctor Workstation</p>
      </div>

      <div className="flex-1 space-y-3">
        {menuItems.map((item) => {
          const isActive = activeMenu === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveMenu(item.id as any)}
              className={`w-full flex items-center justify-between p-4 rounded-3xl transition-all group ${getColorClasses(item.color, isActive)}`}
            >
              <div className="flex items-center gap-4">
                <item.icon size={20} className={isActive ? 'text-white' : 'text-slate-400 group-hover:text-slate-900 transition-colors'} />
                <span className={`text-sm font-black uppercase tracking-widest ${isActive ? 'text-white' : 'text-slate-500 group-hover:text-slate-900'}`}>
                  {item.label}
                </span>
              </div>
              {item.badge !== undefined && item.badge > 0 && !isActive && (
                <span className="bg-rose-500 text-white text-[10px] font-black px-2 py-1 rounded-lg min-w-[20px] text-center">
                  {item.badge}
                </span>
              )}
              {isActive && <ChevronRight size={16} className="text-white/50" />}
            </button>
          );
        })}
      </div>

      <div className="mt-auto pt-8 border-t border-slate-100">
        <div className="bg-slate-50 rounded-[32px] p-6 mb-6 border border-slate-100">
          <div className="flex items-center gap-4 mb-4">
            <Avatar user={{ name: doctorName }} size={48} roundedClassName="rounded-2xl" alt={doctorName} />
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Connecté en tant que</p>
              <p className="text-sm font-black text-slate-900 truncate w-32">{doctorName}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button className="flex-1 bg-white border border-slate-200 p-3 rounded-xl text-slate-500 hover:text-slate-900 hover:border-slate-300 transition-all">
              <Settings size={18} className="mx-auto" />
            </button>
            <button className="flex-1 bg-rose-50 border border-rose-100 p-3 rounded-xl text-rose-600 hover:bg-rose-100 transition-all">
              <LogOut size={18} className="mx-auto" />
            </button>
          </div>
        </div>
        <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest text-center">v2.4.0 • Hospital OS</p>
      </div>
    </div>
  );
};

export default DoctorSidebar;
