import React, { useState } from 'react';
import { 
  Users, Search, Clock, ArrowRight, ShieldAlert, 
  Activity, CheckCircle2, UserCheck, Stethoscope, Eye, Filter, RefreshCw
} from 'lucide-react';
import { EmergencyEncounter, EmergencyStatusV1, User as UserType } from '../../types';

interface PatientsListTabProps {
  patients: EmergencyEncounter[];
  onSelectPatient: (patient: EmergencyEncounter) => void;
  onUpdateStatus: (encounterId: string, newStatus: EmergencyStatusV1, assignedStaff?: string) => Promise<void>;
  currentUser?: UserType;
  theme?: 'light' | 'dark';
}

export const PatientsListTab: React.FC<PatientsListTabProps> = ({
  patients,
  onSelectPatient,
  onUpdateStatus,
  currentUser,
  theme = 'light'
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | EmergencyStatusV1>('ALL');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Filter only active patients (status !== 'Sortie')
  const activePatients = patients.filter(p => p.status !== 'Sortie');

  const filtered = activePatients.filter(p => {
    const fullName = `${p.lastName || ''} ${p.firstName || ''}`.toLowerCase();
    const query = searchQuery.toLowerCase().trim();
    const matchesSearch = !query || 
      fullName.includes(query) || 
      (p.patientId || '').toLowerCase().includes(query) || 
      (p.patientDme || '').toLowerCase().includes(query) ||
      (p.arrivalMotif || '').toLowerCase().includes(query);

    const matchesStatus = statusFilter === 'ALL' || p.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const getStatusBadge = (status: EmergencyStatusV1) => {
    switch (status) {
      case 'En attente':
        return {
          label: 'En attente',
          bg: 'bg-amber-50 text-amber-700 border-amber-200',
          dot: 'bg-amber-500'
        };
      case 'Pris en charge':
        return {
          label: 'Pris en charge',
          bg: 'bg-blue-50 text-blue-700 border-blue-200',
          dot: 'bg-blue-500'
        };
      case 'En cours de suivi':
        return {
          label: 'En cours de suivi',
          bg: 'bg-indigo-50 text-indigo-700 border-indigo-200',
          dot: 'bg-indigo-500'
        };
      case 'Sortie':
        return {
          label: 'Sortie',
          bg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
          dot: 'bg-emerald-500'
        };
      default:
        return {
          label: status,
          bg: 'bg-slate-50 text-slate-700 border-slate-200',
          dot: 'bg-slate-400'
        };
    }
  };

  const handleQuickStatusChange = async (e: React.MouseEvent, encounterId: string, newStatus: EmergencyStatusV1) => {
    e.stopPropagation();
    try {
      setUpdatingId(encounterId);
      await onUpdateStatus(encounterId, newStatus, currentUser?.name);
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Search and Filter Controls */}
      <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Rechercher par patient, N° dossier, motif..."
            className="w-full pl-11 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-medium outline-none focus:border-blue-500 transition-all"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {(['ALL', 'En attente', 'Pris en charge', 'En cours de suivi'] as const).map((st) => {
            const count = st === 'ALL' 
              ? activePatients.length 
              : activePatients.filter(p => p.status === st).length;
            const isSelected = statusFilter === st;

            return (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  isSelected
                    ? 'bg-rose-600 text-white shadow-xs'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                <span>{st === 'ALL' ? 'Tous les présents' : st}</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                  isSelected ? 'bg-white/20 text-white' : 'bg-white text-slate-600'
                }`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Patients Table / List */}
      {filtered.length === 0 ? (
        <div className="bg-white p-16 rounded-3xl border border-slate-200 text-center flex flex-col items-center justify-center">
          <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-400 mb-3">
            <Users size={32} />
          </div>
          <h3 className="text-base font-black text-slate-800">Aucun patient aux Urgences</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm">
            {searchQuery || statusFilter !== 'ALL'
              ? 'Aucun patient ne correspond à vos critères de recherche.'
              : "La file des Urgences est actuellement vide. Les patients envoyés depuis l'Accueil apparaîtront ici automatiquement."}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-black uppercase tracking-wider text-slate-400">
                  <th className="py-4 px-6">Patient</th>
                  <th className="py-4 px-4">Dossier / Âge</th>
                  <th className="py-4 px-4">Arrivée</th>
                  <th className="py-4 px-6">Motif de Recours</th>
                  <th className="py-4 px-4">Statut</th>
                  <th className="py-4 px-4">Praticien Responsable</th>
                  <th className="py-4 px-6 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filtered.map((p) => {
                  const badge = getStatusBadge(p.status);
                  const isUpdating = updatingId === p.id;
                  const latestVitals = p.vitals && p.vitals.length > 0 
                    ? p.vitals[p.vitals.length - 1] 
                    : null;

                  return (
                    <tr
                      key={p.id}
                      onClick={() => onSelectPatient(p)}
                      className="hover:bg-slate-50/80 transition-colors group cursor-pointer"
                    >
                      {/* Name */}
                      <td className="py-4 px-6 font-black text-slate-900">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-600 border border-rose-100 flex items-center justify-center font-black text-xs shrink-0 group-hover:scale-105 transition-transform">
                            {p.lastName ? p.lastName.charAt(0) : 'P'}
                          </div>
                          <div>
                            <div className="font-extrabold text-slate-900 group-hover:text-blue-600 transition-colors">
                              {p.lastName} {p.firstName}
                            </div>
                            <div className="text-[10px] text-slate-400 font-medium">
                              Sexe : {p.gender === 'F' ? 'Femme' : 'Homme'}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* File ID & Age */}
                      <td className="py-4 px-4 font-medium text-slate-600">
                        <span className="font-mono text-[11px] font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md">
                          {p.patientDme || p.patientId}
                        </span>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          {p.age !== undefined ? `${p.age} ans` : 'Âge non spécifié'}
                        </div>
                      </td>

                      {/* Arrival */}
                      <td className="py-4 px-4 text-slate-600 font-medium">
                        <div className="flex items-center gap-1.5 font-bold text-slate-800">
                          <Clock size={13} className="text-slate-400" />
                          <span>{p.arrivalTime || 'N/A'}</span>
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {p.arrivalDate || ''}
                        </div>
                      </td>

                      {/* Motif */}
                      <td className="py-4 px-6 font-medium text-slate-800 max-w-xs truncate">
                        <span className="font-bold text-slate-900 block truncate" title={p.arrivalMotif}>
                          {p.arrivalMotif || 'Urgence non spécifiée'}
                        </span>
                        {latestVitals && (
                          <div className="text-[10px] text-slate-500 font-mono mt-0.5 flex items-center gap-2">
                            <span>TA: {latestVitals.bpSys || '--'}/{latestVitals.bpDia || '--'}</span>
                            <span>Pouls: {latestVitals.heartRate || '--'}</span>
                            <span>SpO₂: {latestVitals.spo2 || '--'}%</span>
                          </div>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-4 px-4">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border ${badge.bg}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
                          {badge.label}
                        </span>
                      </td>

                      {/* Responsible */}
                      <td className="py-4 px-4 text-slate-600">
                        {p.responsibleStaff ? (
                          <div className="flex items-center gap-1.5 font-bold text-slate-700">
                            <UserCheck size={14} className="text-blue-600" />
                            <span>{p.responsibleStaff}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic text-[11px]">Non assigné</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-4 px-6 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {p.status === 'En attente' && (
                            <button
                              type="button"
                              disabled={isUpdating}
                              onClick={(e) => handleQuickStatusChange(e, p.id, 'Pris en charge')}
                              className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl text-[11px] font-bold border border-blue-200 transition-all cursor-pointer"
                              title="Passer en Pris en charge"
                            >
                              Prendre en charge
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => onSelectPatient(p)}
                            className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
                          >
                            <span>Ouvrir</span>
                            <ArrowRight size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
