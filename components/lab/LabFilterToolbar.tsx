import React, { useState, useEffect } from 'react';
import { Search, X, Calendar, RotateCcw } from 'lucide-react';
import { useDebounce } from '../../hooks/useDebounce';

export interface LabFilters {
  search: string;
  status?: string;
  dateRange: 'ALL' | 'TODAY' | 'WEEK' | 'CUSTOM';
  startDate: string;
  endDate: string;
}

interface LabFilterToolbarProps {
  filters: LabFilters;
  onFiltersChange: (newFilters: LabFilters) => void;
  totalCount: number;
  filteredCount: number;
  onReset: () => void;
  className?: string;
  showStatusFilter?: boolean; // Defaults to false to prevent mixing statuses across dedicated stage workspaces
  stageBadge?: { label: string; color?: string };
}

export const LabFilterToolbar: React.FC<LabFilterToolbarProps> = ({
  filters,
  onFiltersChange,
  totalCount,
  filteredCount,
  onReset,
  className = '',
  showStatusFilter = false,
  stageBadge
}) => {
  const [searchInput, setSearchInput] = useState(filters.search);
  const debouncedSearch = useDebounce(searchInput, 300);

  // Sync debounced search with parent filters
  useEffect(() => {
    if (debouncedSearch !== filters.search) {
      onFiltersChange({ ...filters, search: debouncedSearch });
    }
  }, [debouncedSearch]);

  // Keep local input in sync if parent resets
  useEffect(() => {
    setSearchInput(filters.search);
  }, [filters.search]);

  const hasActiveFilters = 
    Boolean(filters.search) || 
    (showStatusFilter && filters.status && filters.status !== 'ALL') || 
    filters.dateRange !== 'ALL' || 
    Boolean(filters.startDate) || 
    Boolean(filters.endDate);

  return (
    <div className={`bg-white px-3.5 py-2.5 rounded-2xl border border-slate-200/90 shadow-2xs flex flex-wrap items-center gap-2.5 text-xs transition-all ${className}`}>
      
      {/* Optional Stage Badge indicator */}
      {stageBadge && (
        <span className={`px-2.5 py-1 rounded-xl text-[11px] font-black uppercase tracking-wider shrink-0 ${stageBadge.color || 'bg-blue-50 text-blue-700 border border-blue-200'}`}>
          {stageBadge.label}
        </span>
      )}

      {/* 1. Debounced Search Input (Patient Name, DME ID, Prescribing Doctor) */}
      <div className="relative flex-1 min-w-[220px] max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={14} />
        <input 
          type="text" 
          placeholder="Rechercher patient, DME ID, médecin prescripteur..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="w-full pl-8 pr-7 py-1.5 bg-slate-50 hover:bg-slate-100/70 focus:bg-white border border-slate-200 focus:border-blue-500 rounded-xl text-xs font-semibold text-slate-800 outline-none transition-all placeholder:text-slate-400 placeholder:font-normal"
        />
        {searchInput && (
          <button 
            type="button"
            onClick={() => {
              setSearchInput('');
              onFiltersChange({ ...filters, search: '' });
            }}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
            title="Effacer la recherche"
          >
            <X size={12} />
          </button>
        )}
      </div>

      {/* 2. Optional Status Dropdown Filter - STRICTLY DISABLED by default on dedicated stage pages */}
      {showStatusFilter && (
        <div className="flex items-center gap-1">
          <select
            value={filters.status || 'ALL'}
            onChange={(e) => onFiltersChange({ ...filters, status: e.target.value })}
            className={`px-2.5 py-1.5 rounded-xl border text-xs font-bold outline-none cursor-pointer transition-colors ${
              filters.status && filters.status !== 'ALL'
                ? 'bg-blue-50 text-blue-700 border-blue-200 shadow-2xs'
                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100/80'
            }`}
          >
            <option value="ALL">Tous les statuts</option>
            <option value="en attente">⏳ En attente</option>
            <option value="prélèvement fait">🩸 Prélèvement fait</option>
            <option value="terminé">✅ Terminé</option>
          </select>
        </div>
      )}

      {/* 3. Date Quick-Filter Dropdown */}
      <div className="flex items-center gap-1">
        <div className="relative">
          <select
            value={filters.dateRange}
            onChange={(e) => onFiltersChange({ ...filters, dateRange: e.target.value as any })}
            className={`px-2.5 py-1.5 rounded-xl border text-xs font-bold outline-none cursor-pointer transition-colors ${
              filters.dateRange !== 'ALL'
                ? 'bg-blue-50 text-blue-700 border-blue-200 shadow-2xs'
                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100/80'
            }`}
          >
            <option value="ALL">Toutes les dates</option>
            <option value="TODAY">Aujourd'hui</option>
            <option value="WEEK">Cette semaine</option>
            <option value="CUSTOM">📅 Période personnalisée</option>
          </select>
        </div>
      </div>

      {/* 4. Custom Date Range Inputs (when CUSTOM is selected) */}
      {filters.dateRange === 'CUSTOM' && (
        <div className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1 rounded-xl border border-slate-200 animate-in fade-in duration-150">
          <Calendar size={13} className="text-slate-400 shrink-0" />
          <input 
            type="date"
            value={filters.startDate}
            onChange={(e) => onFiltersChange({ ...filters, startDate: e.target.value })}
            className="bg-transparent text-[11px] font-semibold text-slate-700 outline-none border-b border-transparent focus:border-blue-500"
            title="Date de début"
          />
          <span className="text-slate-400 text-[10px] font-bold">à</span>
          <input 
            type="date"
            value={filters.endDate}
            onChange={(e) => onFiltersChange({ ...filters, endDate: e.target.value })}
            className="bg-transparent text-[11px] font-semibold text-slate-700 outline-none border-b border-transparent focus:border-blue-500"
            title="Date de fin"
          />
        </div>
      )}

      {/* 5. Match Counter & Reset Button */}
      <div className="flex items-center gap-2 ml-auto shrink-0">
        <span className="text-[10px] font-bold text-slate-400 font-mono">
          {filteredCount} / {totalCount}
        </span>

        {hasActiveFilters && (
          <button
            type="button"
            onClick={onReset}
            className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer"
            title="Réinitialiser tous les filtres"
          >
            <RotateCcw size={12} />
            Effacer
          </button>
        )}
      </div>
    </div>
  );
};
