import React, { useState, useEffect } from 'react';
import { Search, X, Calendar, RotateCcw } from 'lucide-react';
import { useDebounce } from '../../hooks/useDebounce';

export interface PharmacyFilters {
  search: string;
  status: 'ALL' | 'PENDING' | 'DELIVERED' | 'CANCELLED' | 'DEBT';
  dateRange: 'ALL' | 'TODAY' | 'WEEK' | 'CUSTOM';
  startDate: string;
  endDate: string;
}

interface PharmacyFilterToolbarProps {
  filters: PharmacyFilters;
  onFiltersChange: (newFilters: PharmacyFilters) => void;
  totalCount: number;
  filteredCount: number;
  onReset: () => void;
  className?: string;
}

export const PharmacyFilterToolbar: React.FC<PharmacyFilterToolbarProps> = ({
  filters,
  onFiltersChange,
  totalCount,
  filteredCount,
  onReset,
  className = ''
}) => {
  const [searchInput, setSearchInput] = useState(filters.search);
  const debouncedSearch = useDebounce(searchInput, 300);

  // Sync debounced search to parent filters
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
    filters.status !== 'ALL' || 
    filters.dateRange !== 'ALL' || 
    Boolean(filters.startDate) || 
    Boolean(filters.endDate);

  return (
    <div className={`bg-white px-3.5 py-2 rounded-2xl border border-slate-200/90 shadow-2xs flex flex-wrap items-center gap-2 text-xs transition-all ${className}`}>
      {/* 1. Debounced Search Input */}
      <div className="relative flex-1 min-w-[200px] max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={14} />
        <input 
          type="text" 
          placeholder="Rechercher patient, DME ID, n° reçu, médicament..."
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

      {/* 2. Status Dropdown Filter */}
      <div className="flex items-center gap-1">
        <select
          value={filters.status}
          onChange={(e) => onFiltersChange({ ...filters, status: e.target.value as any })}
          className={`px-2.5 py-1.5 rounded-xl border text-xs font-bold outline-none cursor-pointer transition-colors ${
            filters.status !== 'ALL'
              ? 'bg-blue-50 text-blue-700 border-blue-200 shadow-2xs'
              : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100/80'
          }`}
        >
          <option value="ALL">Tous les statuts</option>
          <option value="PENDING">⏳ En attente</option>
          <option value="DELIVERED">📦 Livré / Payé</option>
          <option value="CANCELLED">❌ Annulé</option>
          <option value="DEBT">💳 Avec dette</option>
        </select>
      </div>

      {/* 3. Date Quick-Filter Dropdown */}
      <div className="flex items-center gap-1">
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
