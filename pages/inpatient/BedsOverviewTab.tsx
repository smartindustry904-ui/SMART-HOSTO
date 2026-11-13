import React, { useState, useMemo } from 'react';
import { 
  BedDouble, Search, Filter, Plus, User, 
  CheckCircle2, AlertCircle, Clock, Calendar, 
  ExternalLink, LogOut, Building2, Sparkles, RefreshCw
} from 'lucide-react';
import { Bed, Room } from '../../types';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../src/firebase';
import { isBedLibre, isBedOccupe, isBedEnNettoyage } from '../../src/utils/hospitalisation';

interface BedsOverviewTabProps {
  beds: Bed[];
  rooms: Room[];
  onOpenAdmissionModal: (bedId?: string) => void;
  onOpenPatientBed: (bed: Bed) => void;
  onOpenDischargeModal: (bed: Bed) => void;
  onSeedDefaultBeds?: () => void;
  theme?: 'light' | 'dark';
}

export const BedsOverviewTab: React.FC<BedsOverviewTabProps> = ({
  beds,
  rooms,
  onOpenAdmissionModal,
  onOpenPatientBed,
  onOpenDischargeModal,
  onSeedDefaultBeds,
  theme = 'light'
}) => {
  const [filterView, setFilterView] = useState<'all' | 'available' | 'occupied' | 'cleaning'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRoomId, setSelectedRoomId] = useState<string>('all');

  // Filter hospital beds
  const hospitalBeds = useMemo(() => {
    return beds.filter(b => !b.category || b.category === 'hospitalisation' || b.category === 'all');
  }, [beds]);

  // Available, Occupied & Cleaning beds
  const availableBeds = useMemo(() => {
    return hospitalBeds.filter(b => isBedLibre(b.status));
  }, [hospitalBeds]);

  const occupiedBeds = useMemo(() => {
    return hospitalBeds.filter(b => isBedOccupe(b.status));
  }, [hospitalBeds]);

  const cleaningBeds = useMemo(() => {
    return hospitalBeds.filter(b => isBedEnNettoyage(b.status));
  }, [hospitalBeds]);

  const handleMarkBedLibre = async (bed: Bed) => {
    try {
      await updateDoc(doc(db, 'beds', bed.id), {
        status: 'LIBRE',
        lastUpdated: new Date().toISOString()
      });
    } catch (e) {
      console.error('Error marking bed libre:', e);
    }
  };

  // Filtered by search & room
  const filteredAvailable = useMemo(() => {
    return availableBeds.filter(b => {
      const room = rooms.find(r => r.id === b.roomId);
      const matchesRoom = selectedRoomId === 'all' || b.roomId === selectedRoomId;
      const term = searchQuery.toLowerCase().trim();
      const matchesSearch = !term || 
        b.name.toLowerCase().includes(term) || 
        (room?.name || '').toLowerCase().includes(term);
      return matchesRoom && matchesSearch;
    });
  }, [availableBeds, rooms, selectedRoomId, searchQuery]);

  const filteredOccupied = useMemo(() => {
    return occupiedBeds.filter(b => {
      const room = rooms.find(r => r.id === b.roomId);
      const matchesRoom = selectedRoomId === 'all' || b.roomId === selectedRoomId;
      const term = searchQuery.toLowerCase().trim();
      const matchesSearch = !term || 
        b.name.toLowerCase().includes(term) || 
        (b.patientName || '').toLowerCase().includes(term) || 
        (b.patientDossier || '').toLowerCase().includes(term) || 
        (room?.name || '').toLowerCase().includes(term);
      return matchesRoom && matchesSearch;
    });
  }, [occupiedBeds, rooms, selectedRoomId, searchQuery]);

  // Overall occupancy rate
  const occupancyRate = hospitalBeds.length > 0
    ? Math.round((occupiedBeds.length / hospitalBeds.length) * 100)
    : 0;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-3 duration-300">
      
      {/* KPI & Controls Header */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-6">
        
        {/* Statistics row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1">Capacité Totale</span>
            <p className="text-2xl font-black text-slate-900">{hospitalBeds.length} <span className="text-xs font-bold text-slate-400">lits</span></p>
          </div>

          <div 
            onClick={() => setFilterView('available')}
            className={`p-4 rounded-2xl border transition-all cursor-pointer ${
              filterView === 'available' ? 'bg-emerald-50 border-emerald-300 shadow-xs' : 'bg-slate-50 border-slate-100 hover:bg-emerald-50/50'
            }`}
          >
            <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600 block mb-1">Lits Libres</span>
            <p className="text-2xl font-black text-emerald-700">{availableBeds.length} <span className="text-xs font-bold text-emerald-600">disponibles</span></p>
          </div>

          <div 
            onClick={() => setFilterView('occupied')}
            className={`p-4 rounded-2xl border transition-all cursor-pointer ${
              filterView === 'occupied' ? 'bg-blue-50 border-blue-300 shadow-xs' : 'bg-slate-50 border-slate-100 hover:bg-blue-50/50'
            }`}
          >
            <span className="text-[10px] font-black uppercase tracking-widest text-blue-600 block mb-1">Lits Occupés</span>
            <p className="text-2xl font-black text-blue-700">{occupiedBeds.length} <span className="text-xs font-bold text-blue-600">patients</span></p>
          </div>

          <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1">Taux d'Occupation</span>
            <div className="flex items-center gap-2">
              <p className="text-2xl font-black text-slate-900">{occupancyRate}%</p>
              <div className="flex-1 bg-slate-200 h-2 rounded-full overflow-hidden">
                <div 
                  className={`h-full rounded-full ${occupancyRate > 85 ? 'bg-rose-500' : occupancyRate > 60 ? 'bg-amber-500' : 'bg-emerald-500'}`} 
                  style={{ width: `${occupancyRate}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Filter & Action bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2 border-t border-slate-100">
          
          {/* Search and Room Filter */}
          <div className="flex items-center gap-3 flex-1 max-w-lg">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Rechercher lit, chambre, patient..."
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-xs text-slate-800 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
            </div>

            {rooms.length > 0 && (
              <select
                value={selectedRoomId}
                onChange={(e) => setSelectedRoomId(e.target.value)}
                className="px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-xs text-slate-700 outline-none"
              >
                <option value="all">Toutes les chambres</option>
                {rooms.map(r => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            )}
          </div>

          {/* Segmented View Switch & Main Action */}
          <div className="flex items-center gap-3">
            <div className="flex bg-slate-100 p-1 rounded-2xl border border-slate-200 text-xs">
              <button
                onClick={() => setFilterView('all')}
                className={`px-3.5 py-1.5 rounded-xl font-black uppercase tracking-wider transition-all cursor-pointer ${
                  filterView === 'all' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Tous ({hospitalBeds.length})
              </button>
              <button
                onClick={() => setFilterView('available')}
                className={`px-3.5 py-1.5 rounded-xl font-black uppercase tracking-wider transition-all cursor-pointer ${
                  filterView === 'available' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Libres ({availableBeds.length})
              </button>
              <button
                onClick={() => setFilterView('occupied')}
                className={`px-3.5 py-1.5 rounded-xl font-black uppercase tracking-wider transition-all cursor-pointer ${
                  filterView === 'occupied' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Occupés ({occupiedBeds.length})
              </button>
              <button
                onClick={() => setFilterView('cleaning')}
                className={`px-3.5 py-1.5 rounded-xl font-black uppercase tracking-wider transition-all cursor-pointer ${
                  filterView === 'cleaning' ? 'bg-amber-500 text-white shadow-xs' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Nettoyage ({cleaningBeds.length})
              </button>
            </div>

            <button
              onClick={() => onOpenAdmissionModal()}
              disabled={availableBeds.length === 0}
              className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-black text-xs uppercase tracking-wider rounded-2xl transition-all shadow-md shadow-blue-500/20 cursor-pointer shrink-0"
            >
              <Plus size={16} />
              <span>Occuper un Lit</span>
            </button>
          </div>
        </div>
      </div>

      {/* Empty State / Bed Seeding Option */}
      {hospitalBeds.length === 0 && (
        <div className="bg-white rounded-3xl border border-dashed border-slate-300 p-12 text-center space-y-4">
          <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-3xl flex items-center justify-center mx-auto">
            <BedDouble size={32} />
          </div>
          <h3 className="text-lg font-black text-slate-900">Aucun lit configuré dans l'établissement</h3>
          <p className="text-sm text-slate-500 max-w-md mx-auto">
            Pour commencer à utiliser la gestion des lits et l'outil lit patient, initialisez les chambres et lits standards.
          </p>
          {onSeedDefaultBeds && (
            <button
              onClick={onSeedDefaultBeds}
              className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-black text-xs uppercase tracking-wider rounded-2xl shadow-md shadow-blue-500/20 cursor-pointer"
            >
              <Sparkles size={16} />
              <span>Initialiser les lits par défaut</span>
            </button>
          )}
        </div>
      )}

      {/* CATEGORY 1: LITS DISPONIBLES (LIBRES) */}
      {(filterView === 'all' || filterView === 'available') && hospitalBeds.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-black text-slate-900 uppercase tracking-wider flex items-center gap-2.5">
              <span className="w-3 h-3 rounded-full bg-emerald-500 inline-block shadow-xs shadow-emerald-500/50"></span>
              <span>Lits Disponibles ({filteredAvailable.length})</span>
            </h2>
            <span className="text-xs font-bold text-slate-400">Prêts pour admission</span>
          </div>

          {filteredAvailable.length === 0 ? (
            <div className="bg-white rounded-3xl border border-slate-200 p-8 text-center text-slate-400 text-xs font-bold">
              Aucun lit libre correspondant aux filtres.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {filteredAvailable.map(bed => {
                const room = rooms.find(r => r.id === bed.roomId);
                return (
                  <div
                    key={bed.id}
                    className="bg-white rounded-3xl border border-slate-200 p-5 space-y-4 hover:border-emerald-300 hover:shadow-md transition-all group flex flex-col justify-between"
                  >
                    <div className="space-y-3">
                      <div className="flex items-start justify-between">
                        <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 text-[10px] font-black uppercase rounded-xl">
                          Libre
                        </span>
                        <span className="text-xs font-mono font-black text-slate-400">
                          {bed.name}
                        </span>
                      </div>

                      <div className="space-y-1">
                        <h3 className="font-black text-slate-900 text-base">{bed.name}</h3>
                        <p className="text-xs text-slate-500 font-bold flex items-center gap-1.5">
                          <Building2 size={13} className="text-slate-400" />
                          {room?.name || 'Chambre'} {room?.description ? `• ${room.description}` : ''}
                        </p>
                        <p className="text-[11px] text-slate-400 font-medium">
                          {bed.service || 'Médecine Générale'}
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={() => onOpenAdmissionModal(bed.id)}
                      className="w-full py-2.5 bg-slate-900 hover:bg-blue-600 text-white rounded-2xl font-black text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer shadow-xs"
                    >
                      <Plus size={14} />
                      <span>Occuper ce Lit</span>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* CATEGORY 2: LITS OCCUPÉS */}
      {(filterView === 'all' || filterView === 'occupied') && hospitalBeds.length > 0 && (
        <div className="space-y-4 pt-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-black text-slate-900 uppercase tracking-wider flex items-center gap-2.5">
              <span className="w-3 h-3 rounded-full bg-blue-600 inline-block shadow-xs shadow-blue-500/50"></span>
              <span>Lits Occupés ({filteredOccupied.length})</span>
            </h2>
            <span className="text-xs font-bold text-slate-400">Patients en cours de prise en charge</span>
          </div>

          {filteredOccupied.length === 0 ? (
            <div className="bg-white rounded-3xl border border-slate-200 p-8 text-center text-slate-400 text-xs font-bold">
              Aucun lit occupé actuellement.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredOccupied.map(bed => {
                const room = rooms.find(r => r.id === bed.roomId);
                return (
                  <div
                    key={bed.id}
                    className="bg-white rounded-3xl border-2 border-blue-100 p-6 space-y-5 hover:border-blue-400 hover:shadow-lg transition-all flex flex-col justify-between"
                  >
                    {/* Top status & Bed info */}
                    <div className="space-y-4">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <span className="px-2.5 py-1 bg-blue-100 text-blue-800 text-[10px] font-black uppercase rounded-xl">
                            Occupé
                          </span>
                          {bed.priority && (
                            <span className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase ${
                              bed.priority === 'Critique' ? 'bg-rose-100 text-rose-700' :
                              bed.priority === 'Urgent' ? 'bg-amber-100 text-amber-700' :
                              'bg-slate-100 text-slate-700'
                            }`}>
                              {bed.priority}
                            </span>
                          )}
                        </div>
                        <span className="text-xs font-black text-blue-600 bg-blue-50 px-2.5 py-1 rounded-xl">
                          {bed.name} • {room?.name || 'Chambre'}
                        </span>
                      </div>

                      {/* Patient permanent info */}
                      <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl space-y-1">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Patient</span>
                        <h3 className="font-black text-slate-900 text-base tracking-tight truncate">
                          {bed.patientName || 'Patient'}
                        </h3>
                        <p className="text-xs text-slate-500 font-bold font-mono">
                          N° {bed.patientDossier || bed.patientId} • {bed.patientAge ? `${bed.patientAge} ans` : ''} • Sexe {bed.patientGender || 'M'}
                        </p>
                      </div>

                      {/* Admission date, time, origin */}
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Admission</span>
                          <span className="font-bold text-slate-700 flex items-center gap-1 mt-0.5">
                            <Calendar size={12} className="text-slate-400" />
                            {bed.admissionDate || 'Aujourd\'hui'} {bed.admissionTime ? `à ${bed.admissionTime}` : ''}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Origine / Service</span>
                          <span className="font-bold text-slate-700 block truncate mt-0.5">
                            {bed.admissionOrigin || 'Consultation'} ({bed.service || 'Général'})
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Action buttons: Ouvrir le lit patient & Libérer le lit */}
                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100">
                      <button
                        onClick={() => onOpenDischargeModal(bed)}
                        className="py-2.5 px-3 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-xl font-black text-[11px] uppercase tracking-wider transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <LogOut size={14} />
                        <span>Libérer</span>
                      </button>

                      <button
                        onClick={() => onOpenPatientBed(bed)}
                        className="py-2.5 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black text-[11px] uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 shadow-xs shadow-blue-500/20 cursor-pointer"
                      >
                        <ExternalLink size={14} />
                        <span>Lit Patient</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* CATEGORY 3: LITS EN NETTOYAGE */}
      {(filterView === 'all' || filterView === 'cleaning') && cleaningBeds.length > 0 && (
        <div className="space-y-4 pt-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-black text-slate-900 uppercase tracking-wider flex items-center gap-2.5">
              <span className="w-3 h-3 rounded-full bg-amber-500 inline-block shadow-xs shadow-amber-500/50"></span>
              <span>Lits en Nettoyage ({cleaningBeds.length})</span>
            </h2>
            <span className="text-xs font-bold text-slate-400">Désinfection post-sortie</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {cleaningBeds.map(bed => {
              const room = rooms.find(r => r.id === bed.roomId);
              return (
                <div
                  key={bed.id}
                  className="bg-amber-50/40 rounded-3xl border-2 border-amber-200 p-5 flex items-center justify-between gap-4"
                >
                  <div>
                    <span className="px-2.5 py-0.5 bg-amber-100 text-amber-800 text-[10px] font-black uppercase rounded-lg">
                      EN NETTOYAGE
                    </span>
                    <h3 className="font-black text-slate-900 text-base mt-2">{bed.name}</h3>
                    <p className="text-xs font-bold text-slate-500">{room?.name || bed.roomName || 'Chambre'}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleMarkBedLibre(bed)}
                    className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-[11px] uppercase tracking-wider transition-all cursor-pointer shrink-0 flex items-center gap-1.5"
                  >
                    <CheckCircle2 size={14} />
                    <span>Marquer Libre</span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

    </div>
  );
};
