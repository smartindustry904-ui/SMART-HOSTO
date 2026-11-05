
import React from 'react';
import { Bell, Search, AlertTriangle, Thermometer, Activity, Heart, User, Clock } from 'lucide-react';
import { AvatarPlaceholder } from '../../components/common/AvatarPlaceholder';

interface DoctorTopBarProps {
  activePatient: any | null;
  doctorName: string;
}

const DoctorTopBar: React.FC<DoctorTopBarProps> = ({ activePatient, doctorName }) => {
  return (
    <div className="h-28 bg-white border-b border-slate-200 flex items-center px-12 sticky top-0 z-50 backdrop-blur-xl bg-white/80">
      <div className="flex-1 flex items-center gap-8">
        {activePatient ? (
          <div className="flex items-center gap-6 animate-in slide-in-from-left-6 duration-700">
            <div className="relative">
              <AvatarPlaceholder 
                size={64} 
                iconSize={32} 
                className="rounded-[28px] border-2 border-slate-200 dark:border-zinc-800 shadow-xl shadow-blue-600/10" 
                alt={`${activePatient.lastName} ${activePatient.firstName}`} 
              />
              <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-emerald-500 border-4 border-white rounded-full animate-pulse"></div>
            </div>
            
            <div className="flex flex-col">
              <div className="flex items-center gap-3 mb-1">
                <h2 className="text-2xl font-black tracking-tight text-slate-900">{activePatient.lastName} {activePatient.firstName}</h2>
                <span className="bg-blue-600 text-white px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest shadow-lg shadow-blue-600/20">
                  Consultation en cours
                </span>
              </div>
              <div className="flex items-center gap-4 text-slate-500 font-medium text-sm">
                <span className="flex items-center gap-1.5"><User size={14} className="text-slate-400" /> {activePatient.age} ans • {activePatient.gender === 'M' ? 'Masculin' : 'Féminin'}</span>
                <span className="w-1 h-1 bg-slate-200 rounded-full"></span>
                <span className="flex items-center gap-1.5 font-mono text-[10px] font-black text-blue-600 uppercase tracking-widest bg-blue-50 px-2 py-0.5 rounded-lg">ID: {activePatient.id || 'N/A'}</span>
                <span className="w-1 h-1 bg-slate-200 rounded-full"></span>
                <span className="flex items-center gap-1.5"><Clock size={14} className="text-slate-400" /> Arrivé à {activePatient.time}</span>
              </div>
            </div>

            <div className="h-12 w-px bg-slate-100 mx-4"></div>

            <div className="flex items-center gap-6">
              <div className="flex flex-col items-center">
                <div className="flex items-center gap-1.5 mb-1 text-rose-600">
                  <Thermometer size={14} />
                  <span className="text-sm font-black">{activePatient.vitals?.temp || '--'}°C</span>
                </div>
                <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Température</span>
              </div>
              <div className="flex flex-col items-center">
                <div className="flex items-center gap-1.5 mb-1 text-slate-900">
                  <Activity size={14} className="text-blue-600" />
                  <span className="text-sm font-black">{activePatient.vitals?.bp || '--'}</span>
                </div>
                <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Tension Art.</span>
              </div>
              <div className="flex flex-col items-center">
                <div className="flex items-center gap-1.5 mb-1 text-emerald-600">
                  <Heart size={14} />
                  <span className="text-sm font-black">{activePatient.vitals?.pulse || '--'}</span>
                </div>
                <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Pouls</span>
              </div>
            </div>

            {activePatient.allergies && activePatient.allergies.length > 0 && (
              <div className="ml-6 bg-rose-50 border border-rose-100 px-4 py-2 rounded-2xl flex items-center gap-3 animate-bounce">
                <AlertTriangle size={18} className="text-rose-600" />
                <div>
                  <p className="text-[9px] font-black text-rose-400 uppercase tracking-widest mb-0.5">Alerte Allergies</p>
                  <p className="text-xs font-black text-rose-600">{activePatient.allergies.join(', ')}</p>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-4 text-slate-400 font-medium italic animate-in fade-in duration-1000">
            <Search size={20} />
            Sélectionnez un patient dans la salle d'attente pour démarrer.
          </div>
        )}
      </div>

      <div className="flex items-center gap-4">
        <div className="relative group">
          <button className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-900 transition-all border border-slate-100 cursor-pointer shadow-sm">
            <Bell size={18} />
            <span className="absolute top-3 right-3 w-2 h-2 bg-rose-500 border-2 border-white rounded-full"></span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default DoctorTopBar;
