import React, { useState, useMemo } from 'react';
import { 
  DollarSign, 
  ShoppingCart, 
  TrendingUp, 
  Package, 
  Search, 
  Printer, 
  FileText, 
  ArrowDownRight, 
  Wallet, 
  AlertTriangle,
  RotateCcw,
  CheckCircle,
  Clock,
  UserCheck
} from 'lucide-react';
import { PaymentRequest } from '../../types';
import { PharmacyFilterToolbar, PharmacyFilters } from './PharmacyFilterToolbar';
import { EmptyFilterState } from '../common/EmptyFilterState';

interface PharmacyHistoryTableProps {
  sales: PaymentRequest[];
  currency?: string;
  onSelectReceipt: (receipt: PaymentRequest) => void;
}

export const PharmacyHistoryTable: React.FC<PharmacyHistoryTableProps> = ({
  sales,
  currency = 'FCFA',
  onSelectReceipt
}) => {
  // Advanced Filter State
  const [filters, setFilters] = useState<PharmacyFilters>({
    search: '',
    status: 'ALL',
    dateRange: 'ALL',
    startDate: '',
    endDate: ''
  });

  const [activeKpiKey, setActiveKpiKey] = useState<string | null>(null);

  // 1. Strict Chronological Descending Sort (Most Recent First)
  const sortedSales = useMemo(() => {
    return [...sales].sort((a, b) => {
      const tA = new Date(a.createdAt || (a as any).date || 0).getTime();
      const tB = new Date(b.createdAt || (b as any).date || 0).getTime();
      return tB - tA;
    });
  }, [sales]);

  // 2. Date Filtering Helper
  const isWithinDateRange = (dateStr: string | undefined) => {
    if (!dateStr || filters.dateRange === 'ALL') return true;
    const saleDate = new Date(dateStr);
    if (isNaN(saleDate.getTime())) return true;
    const now = new Date();

    if (filters.dateRange === 'TODAY') {
      return saleDate.toDateString() === now.toDateString();
    }
    if (filters.dateRange === 'WEEK') {
      const diffTime = Math.abs(now.getTime() - saleDate.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return diffDays <= 7;
    }
    if (filters.dateRange === 'CUSTOM') {
      if (filters.startDate) {
        const start = new Date(filters.startDate);
        start.setHours(0, 0, 0, 0);
        if (saleDate < start) return false;
      }
      if (filters.endDate) {
        const end = new Date(filters.endDate);
        end.setHours(23, 59, 59, 999);
        if (saleDate > end) return false;
      }
      return true;
    }
    return true;
  };

  // Sales in Date Period (used for dynamic KPIs)
  const salesInPeriod = useMemo(() => {
    return sortedSales.filter(s => isWithinDateRange(s.createdAt));
  }, [sortedSales, filters.dateRange, filters.startDate, filters.endDate]);

  // KPI Calculations
  const deliveredOrPaidSales = useMemo(() => {
    return salesInPeriod.filter(s => s.status === 'DELIVERED' || s.status === 'PAID');
  }, [salesInPeriod]);

  const totalRevenue = useMemo(() => {
    return deliveredOrPaidSales.reduce((sum, s) => sum + (s.totalAmount || 0), 0);
  }, [deliveredOrPaidSales]);

  const totalMedicinesCount = useMemo(() => {
    return deliveredOrPaidSales.reduce((sum, s) => {
      const qty = s.items?.reduce((itemSum: number, it: any) => itemSum + (it.quantity || 1), 0) || 0;
      return sum + qty;
    }, 0);
  }, [deliveredOrPaidSales]);

  const pendingOrdersCount = useMemo(() => {
    return salesInPeriod.filter(s => s.status === 'PENDING').length;
  }, [salesInPeriod]);

  const debtOrAvoirSalesCount = useMemo(() => {
    return salesInPeriod.filter(s => 
      (s.detteCreee && s.detteCreee > 0) || 
      (s.avoirUtilise && s.avoirUtilise > 0) || 
      s.paymentMethod === 'AVOIR' || 
      s.paymentMethod === 'DETTE'
    ).length;
  }, [salesInPeriod]);

  // Filter handlers for Clickable KPI Cards
  const handleKpiClick = (kpiType: string) => {
    if (activeKpiKey === kpiType) {
      setActiveKpiKey(null);
      setFilters(prev => ({ ...prev, status: 'ALL' }));
      return;
    }

    setActiveKpiKey(kpiType);
    if (kpiType === 'TOTAL_REVENUE' || kpiType === 'DELIVERED') {
      setFilters(prev => ({ ...prev, status: 'DELIVERED' }));
    } else if (kpiType === 'ALL_SALES') {
      setFilters(prev => ({ ...prev, status: 'ALL' }));
    } else if (kpiType === 'PENDING_ORDERS') {
      setFilters(prev => ({ ...prev, status: 'PENDING' }));
    } else if (kpiType === 'FINANCIAL') {
      setFilters(prev => ({ ...prev, status: 'DEBT' }));
    }
  };

  const handleResetFilters = () => {
    setFilters({
      search: '',
      status: 'ALL',
      dateRange: 'ALL',
      startDate: '',
      endDate: ''
    });
    setActiveKpiKey(null);
  };

  // 3. Final Multi-criteria Filtered List
  const filteredSales = useMemo(() => {
    return sortedSales.filter(sale => {
      // Date Range
      if (!isWithinDateRange(sale.createdAt)) return false;

      // Text Search: ID, Patient Name, DME ID, Medicines
      if (filters.search) {
        const q = filters.search.toLowerCase().trim();
        const matchesId = (sale.id || '').toLowerCase().includes(q);
        const matchesPatient = (sale.patientName || '').toLowerCase().includes(q);
        const matchesDme = (sale.patientId || '').toLowerCase().includes(q);
        const matchesItems = sale.items?.some((it: any) => (it.name || '').toLowerCase().includes(q));
        if (!matchesId && !matchesPatient && !matchesDme && !matchesItems) {
          return false;
        }
      }

      // Status Filter
      if (filters.status !== 'ALL') {
        if (filters.status === 'DELIVERED' && sale.status !== 'DELIVERED' && sale.status !== 'PAID') return false;
        if (filters.status === 'PENDING' && sale.status !== 'PENDING') return false;
        if (filters.status === 'CANCELLED' && sale.status !== 'CANCELLED' && (sale as any).status !== 'ANNULE') return false;
        if (filters.status === 'DEBT') {
          const hasDebt = (sale.detteCreee && sale.detteCreee > 0) || sale.paymentMethod === 'DETTE';
          const hasAvoir = (sale.avoirUtilise && sale.avoirUtilise > 0) || sale.paymentMethod === 'AVOIR';
          if (!hasDebt && !hasAvoir) return false;
        }
      }

      return true;
    });
  }, [sortedSales, filters]);

  return (
    <div className="space-y-4">
      {/* 1. CLICKABLE KPI CARDS DASHBOARD */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* KPI 1: Recettes Totales */}
        <button
          type="button"
          onClick={() => handleKpiClick('TOTAL_REVENUE')}
          className={`p-4 rounded-2xl border text-left transition-all duration-150 cursor-pointer flex flex-col justify-between relative overflow-hidden group ${
            activeKpiKey === 'TOTAL_REVENUE'
              ? 'bg-emerald-50/90 border-emerald-400 ring-2 ring-emerald-500/20 shadow-xs'
              : 'bg-white border-slate-200/80 hover:border-emerald-300 hover:shadow-2xs'
          }`}
        >
          <div className="flex items-center justify-between w-full mb-2">
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
              <DollarSign size={17} />
            </div>
            <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${
              activeKpiKey === 'TOTAL_REVENUE' ? 'bg-emerald-200 text-emerald-800' : 'bg-slate-100 text-slate-500 group-hover:bg-emerald-100 group-hover:text-emerald-700'
            }`}>
              {activeKpiKey === 'TOTAL_REVENUE' ? '✓ Actif' : 'Filtrer'}
            </span>
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Recettes Délivrées</p>
            <p className="text-xl font-black text-slate-900 mt-0.5 font-mono tracking-tight">
              {totalRevenue.toLocaleString()} <span className="text-xs font-bold text-slate-400">{currency}</span>
            </p>
          </div>
        </button>

        {/* KPI 2: Ventes Totales */}
        <button
          type="button"
          onClick={() => handleKpiClick('ALL_SALES')}
          className={`p-4 rounded-2xl border text-left transition-all duration-150 cursor-pointer flex flex-col justify-between relative overflow-hidden group ${
            activeKpiKey === 'ALL_SALES'
              ? 'bg-blue-50/90 border-blue-400 ring-2 ring-blue-500/20 shadow-xs'
              : 'bg-white border-slate-200/80 hover:border-blue-300 hover:shadow-2xs'
          }`}
        >
          <div className="flex items-center justify-between w-full mb-2">
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
              <ShoppingCart size={17} />
            </div>
            <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${
              activeKpiKey === 'ALL_SALES' ? 'bg-blue-200 text-blue-800' : 'bg-slate-100 text-slate-500 group-hover:bg-blue-100 group-hover:text-blue-700'
            }`}>
              {activeKpiKey === 'ALL_SALES' ? '✓ Actif' : 'Tous'}
            </span>
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Ventes & Servies</p>
            <p className="text-xl font-black text-slate-900 mt-0.5 font-mono tracking-tight">
              {deliveredOrPaidSales.length} <span className="text-xs font-bold text-slate-400">({totalMedicinesCount} art.)</span>
            </p>
          </div>
        </button>

        {/* KPI 3: Commandes En Attente */}
        <button
          type="button"
          onClick={() => handleKpiClick('PENDING_ORDERS')}
          className={`p-4 rounded-2xl border text-left transition-all duration-150 cursor-pointer flex flex-col justify-between relative overflow-hidden group ${
            activeKpiKey === 'PENDING_ORDERS'
              ? 'bg-amber-50/90 border-amber-400 ring-2 ring-amber-500/20 shadow-xs'
              : 'bg-white border-slate-200/80 hover:border-amber-300 hover:shadow-2xs'
          }`}
        >
          <div className="flex items-center justify-between w-full mb-2">
            <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
              <Clock size={17} />
            </div>
            <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${
              activeKpiKey === 'PENDING_ORDERS' ? 'bg-amber-200 text-amber-800' : 'bg-slate-100 text-slate-500 group-hover:bg-amber-100 group-hover:text-amber-700'
            }`}>
              {activeKpiKey === 'PENDING_ORDERS' ? '✓ Actif' : 'Filtrer'}
            </span>
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Commandes En Attente</p>
            <p className="text-xl font-black text-amber-600 mt-0.5 font-mono tracking-tight">
              {pendingOrdersCount}
            </p>
          </div>
        </button>

        {/* KPI 4: Avoirs & Dettes Patients */}
        <button
          type="button"
          onClick={() => handleKpiClick('FINANCIAL')}
          className={`p-4 rounded-2xl border text-left transition-all duration-150 cursor-pointer flex flex-col justify-between relative overflow-hidden group ${
            activeKpiKey === 'FINANCIAL'
              ? 'bg-purple-50/90 border-purple-400 ring-2 ring-purple-500/20 shadow-xs'
              : 'bg-white border-slate-200/80 hover:border-purple-300 hover:shadow-2xs'
          }`}
        >
          <div className="flex items-center justify-between w-full mb-2">
            <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold">
              <Wallet size={17} />
            </div>
            <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${
              activeKpiKey === 'FINANCIAL' ? 'bg-purple-200 text-purple-800' : 'bg-slate-100 text-slate-500 group-hover:bg-purple-100 group-hover:text-purple-700'
            }`}>
              {activeKpiKey === 'FINANCIAL' ? '✓ Actif' : 'Filtrer'}
            </span>
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Avec Avoir / Dette</p>
            <p className="text-xl font-black text-purple-700 mt-0.5 font-mono tracking-tight">
              {debtOrAvoirSalesCount}
            </p>
          </div>
        </button>
      </div>

      {/* 2. COMPACT ULTRA-MICRO FILTER TOOLBAR */}
      <PharmacyFilterToolbar 
        filters={filters}
        onFiltersChange={setFilters}
        totalCount={sales.length}
        filteredCount={filteredSales.length}
        onReset={handleResetFilters}
      />

      {/* 3. HIGH-DENSITY STANDARDIZED SALES TABLE (MOST RECENT FIRST) */}
      <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="max-h-[620px] overflow-y-auto custom-scrollbar">
          <table className="w-full text-left border-collapse text-xs">
            {/* Sticky Header with backdrop blur */}
            <thead className="sticky top-0 bg-slate-100/95 backdrop-blur-md z-10 border-b border-slate-200">
              <tr className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                <th className="py-3 px-4 font-mono">ID Vente</th>
                <th className="py-3 px-4">Date & Heure</th>
                <th className="py-3 px-4">Patient / Bénéficiaire</th>
                <th className="py-3 px-4">Articles Médicaux</th>
                <th className="py-3 px-4">Règlement</th>
                <th className="py-3 px-4 text-right">Total Net</th>
                <th className="py-3 px-4 text-center">Statut</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {filteredSales.map((sale, i) => {
                const isOrdonnance = sale.patientId !== 'PATIENT-COMPTANT';
                const hasAvoir = sale.avoirUtilise && sale.avoirUtilise > 0;
                const hasDette = sale.detteCreee && sale.detteCreee > 0;
                
                return (
                  <tr 
                    key={sale.id || i} 
                    className="odd:bg-white even:bg-slate-50/50 hover:bg-blue-50/40 transition-colors group"
                  >
                    {/* ID Vente */}
                    <td className="py-3 px-4 font-mono font-bold text-slate-500 group-hover:text-blue-600 transition-colors">
                      {sale.id}
                    </td>

                    {/* Date & Heure */}
                    <td className="py-3 px-4 text-slate-600">
                      <div className="font-bold text-slate-800">
                        {sale.createdAt ? new Date(sale.createdAt).toLocaleDateString('fr-FR') : 'N/A'}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono">
                        {sale.createdAt ? new Date(sale.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                      </div>
                    </td>

                    {/* Patient / Beneficiary */}
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <div className={`w-7 h-7 rounded-xl flex items-center justify-center text-[10px] font-black shrink-0 ${
                          isOrdonnance ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-600'
                        }`}>
                          {isOrdonnance ? <UserCheck size={14} /> : 'C'}
                        </div>
                        <div className="min-w-0">
                          <div className="font-black text-slate-900 truncate">
                            {sale.patientName || 'Client Comptant'}
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded ${
                              isOrdonnance ? 'bg-purple-50 text-purple-700 border border-purple-200' : 'bg-slate-100 text-slate-500'
                            }`}>
                              {isOrdonnance ? `DME: ${sale.patientId}` : 'Vente Comptant'}
                            </span>
                            {hasAvoir && (
                              <span className="text-[9px] font-black bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded">
                                Avoir {sale.avoirUtilise?.toLocaleString()} {currency}
                              </span>
                            )}
                            {hasDette && (
                              <span className="text-[9px] font-black bg-rose-100 text-rose-800 px-1.5 py-0.5 rounded">
                                Dette {sale.detteCreee?.toLocaleString()} {currency}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Articles */}
                    <td className="py-3 px-4">
                      <div className="max-w-[220px]">
                        <span className="font-bold text-slate-700 truncate block">
                          {sale.items?.map((it: any) => `${it.quantity || 1}x ${it.name}`).join(', ') || 'Articles'}
                        </span>
                        <span className="text-[10px] text-slate-400 font-semibold">
                          {sale.items?.length || 0} produit(s)
                        </span>
                      </div>
                    </td>

                    {/* Mode de Règlement */}
                    <td className="py-3 px-4">
                      <span className="font-mono font-bold text-[10px] bg-slate-100 text-slate-700 px-2 py-1 rounded-lg border border-slate-200">
                        {sale.paymentMethod || 'CASH'}
                      </span>
                    </td>

                    {/* Total Net (Right-aligned) */}
                    <td className="py-3 px-4 text-right">
                      <div className="font-black text-slate-900 font-mono text-sm">
                        {(sale.totalAmount || 0).toLocaleString()} <span className="text-[10px] text-slate-400">{currency}</span>
                      </div>
                      {sale.amountPaid !== undefined && sale.amountPaid !== sale.totalAmount && (
                        <div className="text-[10px] text-slate-400 font-mono font-bold">
                          Encaissé: {sale.amountPaid.toLocaleString()} {currency}
                        </div>
                      )}
                    </td>

                    {/* Statut */}
                    <td className="py-3 px-4 text-center">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider ${
                        sale.status === 'DELIVERED' || sale.status === 'PAID' 
                          ? 'bg-emerald-100 text-emerald-700' 
                          : sale.status === 'CANCELLED' || (sale as any).status === 'ANNULE'
                          ? 'bg-rose-100 text-rose-700'
                          : 'bg-amber-100 text-amber-700'
                      }`}>
                        {sale.status === 'DELIVERED' || sale.status === 'PAID' ? '✓ Délivré' : sale.status === 'CANCELLED' ? '❌ Annulé' : '⏳ En attente'}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="py-3 px-4 text-right">
                      <button 
                        onClick={() => onSelectReceipt(sale)}
                        className="p-2 bg-slate-100 hover:bg-blue-600 hover:text-white text-slate-600 rounded-xl transition-all cursor-pointer shadow-sm border border-slate-200 inline-flex items-center justify-center"
                        title="Voir le reçu officiel & Imprimer"
                      >
                        <Printer size={15} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Empty state handling */}
        {filteredSales.length === 0 && (
          <EmptyFilterState 
            message="Aucune transaction trouvée pour ces critères"
            submessage="Aucune vente ou ordonnance enregistrée ne correspond aux filtres actifs."
            onReset={handleResetFilters}
            className="py-16"
          />
        )}
      </div>
    </div>
  );
};

