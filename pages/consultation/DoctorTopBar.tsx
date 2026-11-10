
import React from 'react';
import { Bell, Search, AlertTriangle, Thermometer, Activity, Heart, User, Clock } from 'lucide-react';
import { AvatarPlaceholder } from '../../components/common/AvatarPlaceholder';

interface DoctorTopBarProps {
  activePatient: any | null;
  doctorName: string;
}

const DoctorTopBar: React.FC<DoctorTopBarProps> = ({ activePatient, doctorName }) => {
  return (
    <div className="h-18 bg-white border-b border-slate-200 flex items-center px-6 lg:px-8 sticky top-0 z-50 backdrop-blur-xl bg-white/80">
      <div className="flex-1 flex items-center gap-6">
        {activePatient ? (
          <div className="flex items-center gap-4 animate-in slide-in-from-left-4 duration-500">
            <div className="relative">
              <AvatarPlaceholder 
                size={44} 
                iconSize={22} 
                className="rounded-xl border-2 border-slate-200 dark:border-zinc-800 shadow-sm" 
                alt={`${activePatient.lastName} ${activePatient.firstName}`} 
              />
              <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-emerald-500 border-2 border-white rounded-full animate-pulse"></div>
            </div>
            
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black tracking-tight text-slate-900">{activePatient.lastName} {activePatient.firstName}</h2>
                <span className="bg-blue-600 text-white px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider shadow-xs">
                  En consultation
                </span>
              </div>
              <div className="flex items-center gap-2.5 text-slate-500 font-medium text-xs">
                <span className="flex items-center gap-1"><User size={12} className="text-slate-400" /> {activePatient.age} ans • {activePatient.gender === 'M' ? 'M' : 'F'}</span>
                <span className="w-1 h-1 bg-slate-200 rounded-full"></span>
                <span className="font-mono text-[9px] font-black text-blue-600 uppercase tracking-wider bg-blue-50 px-1.5 py-0.5 rounded">ID: {activePatient.id || 'N/A'}</span>
                <span className="w-1 h-1 bg-slate-200 rounded-full"></span>
                <span className="flex items-center gap-1 text-[11px]"><Clock size={12} className="text-slate-400" /> {activePatient.time}</span>
              </div>
            </div>

            <div className="h-8 w-px bg-slate-200 mx-2 hidden sm:block"></div>

            <div className="hidden md:flex items-center gap-4">
              <div className="flex flex-col items-center">
                <div className="flex items-center gap-1 text-rose-600">
                  <Thermometer size={12} />
                  <span className="text-xs font-black">{activePatient.vitals?.temp || '--'}°C</span>
                </div>
                <span className="text-[7.5px] font-black text-slate-400 uppercase tracking-wider">T°</span>
              </div>
              <div className="flex flex-col items-center">
                <div className="flex items-center gap-1 text-slate-900">
                  <Activity size={12} className="text-blue-600" />
                  <span className="text-xs font-black">{activePatient.vitals?.bp || '--'}</span>
                </div>
                <span className="text-[7.5px] font-black text-slate-400 uppercase tracking-wider">TA</span>
              </div>
              <div className="flex flex-col items-center">
                <div className="flex items-center gap-1 text-emerald-600">
                  <Heart size={12} />
                  <span className="text-xs font-black">{activePatient.vitals?.pulse || '--'}</span>
                </div>
                <span className="text-[7.5px] font-black text-slate-400 uppercase tracking-wider">Pouls</span>
              </div>
            </div>

            {activePatient.allergies && activePatient.allergies.length > 0 && (
              <div className="ml-2 bg-rose-50 border border-rose-100 px-2.5 py-1 rounded-xl flex items-center gap-1.5">
                <AlertTriangle size={14} className="text-rose-600" />
                <div>
                  <p className="text-[7.5px] font-black text-rose-400 uppercase tracking-wider">Allergies</p>
                  <p className="text-[11px] font-black text-rose-600">{activePatient.allergies.join(', ')}</p>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-3 text-slate-400 font-medium italic text-xs animate-in fade-in duration-500">
            <Search size={16} />
            Sélectionnez un patient dans la salle d'attente pour démarrer la consultation.
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <div className="relative group">
          <button className="w-9 h-9 bg-slate-50 rounded-xl flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-900 transition-all border border-slate-100 cursor-pointer shadow-xs">
            <Bell size={16} />
            <span className="absolute top-2 right-2 w-2 h-2 bg-rose-500 border-2 border-white rounded-full"></span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default DoctorTopBar;
