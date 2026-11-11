import React from 'react';
import { User, Activity, Clock, ChevronRight, FolderOpen, History } from 'lucide-react';
import { Patient, PatientStatus } from '../types';

interface PatientCardProps {
  patient: Patient;
  status: PatientStatus;
  onClick?: () => void;
}

const PatientCard: React.FC<PatientCardProps> = ({ patient, status, onClick }) => {
  const getStatusColor = (s: PatientStatus) => {
    switch(s) {
      case PatientStatus.WAITING_ADMISSION: return 'bg-amber-50 text-amber-800 border-amber-200';
      case PatientStatus.IN_CONSULTATION: return 'bg-blue-50 text-blue-800 border-blue-200';
      case PatientStatus.WAITING_LAB: return 'bg-purple-50 text-purple-800 border-purple-200';
      case PatientStatus.INPATIENT: return 'bg-orange-50 text-orange-800 border-orange-200';
      case PatientStatus.DISCHARGED: return 'bg-emerald-50 text-emerald-800 border-emerald-200';
      default: return 'bg-slate-50 text-slate-800 border-slate-200';
    }
  };

  const calculateAge = (birthDateString?: string) => {
    if (!birthDateString) return '--';
    const birthDate = new Date(birthDateString);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };

  return (
    <div 
      onClick={onClick}
      className="bg-white rounded-[28px] border border-slate-200/90 p-6 sm:p-7 hover:shadow-2xl hover:border-blue-400 hover:-translate-y-1 transition-all duration-300 cursor-pointer group flex flex-col justify-between shadow-sm bg-gradient-to-b from-white via-white to-slate-50/40"
    >
      <div>
        <div className="flex justify-between items-start gap-3 mb-5">
          <div className="flex gap-3.5 items-center min-w-0">
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center font-black text-base shrink-0 shadow-md ${
              patient.gender === 'F'
                ? 'bg-gradient-to-br from-pink-500 to-rose-600 text-white shadow-rose-500/20'
                : 'bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-blue-600/20'
            }`}>
              {(patient.lastName || 'P').charAt(0).toUpperCase()}{(patient.firstName || 'A').charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <span className="font-mono text-[10px] font-black px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 tracking-wider">
                #{patient.id}
              </span>
              <h3 className="font-black text-base sm:text-lg text-slate-900 group-hover:text-blue-600 transition-colors truncate mt-1 leading-snug">
                {patient.lastName?.toUpperCase()} {patient.firstName}
              </h3>
              <p className="text-xs text-slate-500 font-semibold mt-0.5">
                {calculateAge(patient.birthDate)} ans • {patient.gender === 'F' ? 'Femme' : 'Homme'}
              </p>
            </div>
          </div>
          <span className={`px-3 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider border shrink-0 ${getStatusColor(status)}`}>
            {status}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-5 p-3.5 bg-slate-50 rounded-2xl border border-slate-100">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
            <Activity size={15} className="text-blue-500 shrink-0" />
            <span>TA: 120/80</span>
          </div>
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
            <Clock size={15} className="text-slate-400 shrink-0" />
            <span>Dernier passage: 12/05</span>
          </div>
        </div>
      </div>

      <div className="flex gap-2.5 pt-4 border-t border-slate-100 mt-auto">
        <button 
          type="button"
          onClick={(e) => { e.stopPropagation(); onClick?.(); }}
          className="flex-1 text-xs py-3 bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 font-black tracking-wider uppercase transition-all flex items-center justify-center gap-1.5"
        >
          <History size={14} />
          <span>Historique</span>
        </button>
        <button 
          type="button"
          onClick={(e) => { e.stopPropagation(); onClick?.(); }}
          className="flex-1 text-xs py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-black tracking-wider uppercase shadow-md shadow-blue-600/20 hover:shadow-lg hover:shadow-blue-600/30 transition-all flex items-center justify-center gap-1.5"
        >
          <FolderOpen size={14} />
          <span>Ouvrir</span>
        </button>
      </div>
    </div>
  );
};

export default PatientCard;
