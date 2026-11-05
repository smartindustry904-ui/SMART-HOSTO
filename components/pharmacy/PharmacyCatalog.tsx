import React, { useState } from 'react';
import { 
  Package, 
  Search, 
  LayoutGrid, 
  List, 
  Plus, 
  Check, 
  AlertTriangle, 
  Clock, 
  ShieldCheck, 
  Layers 
} from 'lucide-react';

interface PharmacyCatalogProps {
  inventory: any[];
  cart: any[];
  currency?: string;
  onAddToCart: (item: any) => void;
}

export const PharmacyCatalog: React.FC<PharmacyCatalogProps> = ({
  inventory,
  cart,
  currency = 'FCFA',
  onAddToCart
}) => {
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [selectedFamily, setSelectedFamily] = useState<string>('ALL');

  // Families
  const families = ['ALL', ...Array.from(new Set(inventory.map(i => i.family || 'Général')))];

  const filteredInventory = inventory.filter(item => {
    const q = (search || '').toLowerCase().trim();
    const matchesSearch = 
      !q ||
      (item.name || '').toLowerCase().includes(q) ||
      (item.family && (item.family || '').toLowerCase().includes(q)) ||
      (item.id && (item.id || '').toLowerCase().includes(q));

    const matchesFamily = selectedFamily === 'ALL' || (item.family || 'Général') === selectedFamily;

    return matchesSearch && matchesFamily;
  });

  return (
    <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden flex flex-col">
      {/* 1. CATALOG HEADER WITH SEARCH & VIEW TOGGLE */}
      <div className="p-5 border-b border-slate-150 bg-slate-50/60 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="font-black text-slate-800 text-sm flex items-center gap-2">
            <Package size={18} className="text-blue-600" /> Catalogue & Stock Officine
          </h2>
          <p className="text-[11px] text-slate-400 font-bold mt-0.5">
            Sélectionnez les médicaments pour les ajouter avec réservation anti-doublon.
          </p>
        </div>

        {/* CONTROLS: SEARCH + FAMILY + VIEW TOGGLE */}
        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
          <div className="relative flex-1 md:w-56">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
            <input 
              type="text" 
              placeholder="Chercher médicament..." 
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 focus:border-blue-500 rounded-xl text-xs font-bold outline-none shadow-xs" 
            />
          </div>

          <select 
            value={selectedFamily}
            onChange={e => setSelectedFamily(e.target.value)}
            className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none cursor-pointer hover:bg-slate-50"
          >
            {families.map((f, idx) => (
              <option key={idx} value={f}>{f === 'ALL' ? 'Toutes familles' : f}</option>
            ))}
          </select>

          {/* VIEW TOGGLE: GRID VS TABLE */}
          <div className="flex items-center bg-slate-200/70 p-1 rounded-xl border border-slate-300/60">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`p-1.5 px-2.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                viewMode === 'grid' 
                  ? 'bg-white text-blue-600 shadow-sm font-black' 
                  : 'text-slate-500 hover:text-slate-800'
              }`}
              title="Vue Grille (Cartes rapides)"
            >
              <LayoutGrid size={15} />
              <span className="hidden sm:inline">Grille</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`p-1.5 px-2.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                viewMode === 'table' 
                  ? 'bg-white text-blue-600 shadow-sm font-black' 
                  : 'text-slate-500 hover:text-slate-800'
              }`}
              title="Vue Tableau (Haute densité)"
            >
              <List size={15} />
              <span className="hidden sm:inline">Tableau</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. CATALOG BODY: GRID OR TABLE */}
      {viewMode === 'grid' ? (
        /* GRID VIEW (TACTILE PRODUCT CARDS) */
        <div className="p-5 sm:p-6 max-h-[640px] overflow-y-auto custom-scrollbar bg-slate-50/30">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-5">
            {filteredInventory.map((item, idx) => {
              const stock = item.stock || 0;
              const reserved = item.reservedStock || 0;
              const available = Math.max(0, stock - reserved);
              const inCart = cart.find(c => c.id === item.id);
              const isLowStock = available > 0 && available <= 10;
              const isOutOfStock = available === 0;

              return (
                <div 
                  key={item.id || idx}
                  className={`bg-white rounded-2xl border p-5 flex flex-col justify-between transition-all duration-200 relative group ${
                    inCart 
                      ? 'border-blue-500 ring-2 ring-blue-500/15 shadow-md' 
                      : 'border-slate-200/90 hover:border-blue-300 hover:shadow-md'
                  }`}
                >
                  <div>
                    {/* Header: Family & Stock Badge */}
                    <div className="flex justify-between items-start gap-2 mb-2.5">
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 bg-slate-100 px-2.5 py-1 rounded-lg truncate max-w-[130px] border border-slate-200/60">
                        {item.family || item.category || 'Général'}
                      </span>
                      <span className={`text-[10px] font-black px-2.5 py-1 rounded-full flex items-center gap-1.5 border shadow-2xs shrink-0 ${
                        isOutOfStock 
                          ? 'bg-rose-50 border-rose-200 text-rose-700' 
                          : isLowStock 
                          ? 'bg-amber-50 border-amber-200 text-amber-800' 
                          : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                          isOutOfStock ? 'bg-rose-500' : isLowStock ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'
                        }`} />
                        {isOutOfStock ? 'Rupture' : `${available} dispo`}
                      </span>
                    </div>

                    {/* Title: Product Name */}
                    <h3 className="font-bold text-slate-900 text-sm leading-snug line-clamp-2 min-h-[38px] group-hover:text-blue-900 transition-colors">
                      {item.name}
                    </h3>

                    {/* Metadata: Code & Expiry */}
                    <div className="flex items-center justify-between text-[10px] font-mono font-bold text-slate-400 mt-2 pt-1 border-t border-slate-100">
                      <span>Réf: {item.id}</span>
                      {item.expiryDate || item.expiry ? (
                        <span className={`font-sans font-semibold ${item.alert ? 'text-rose-600 font-bold' : 'text-slate-400'}`}>
                          Exp: {item.expiryDate || item.expiry}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  {/* Footer: Price & Action */}
                  <div className="mt-4 pt-3.5 border-t border-slate-150 flex items-center justify-between gap-2">
                    <div>
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">Prix Unitaire</span>
                      <span className="text-base font-black text-blue-600 font-mono tracking-tight">
                        {(item.price || 0).toLocaleString()} <span className="text-xs font-bold text-slate-400">F</span>
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => onAddToCart(item)}
                      disabled={isOutOfStock}
                      className={`px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-95 ${
                        isOutOfStock 
                          ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed' 
                          : inCart
                          ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-blue-600/20 shadow-sm'
                          : 'bg-blue-50 text-blue-700 hover:bg-blue-600 hover:text-white border border-blue-200 hover:border-blue-600'
                      }`}
                    >
                      <Plus size={14} className={inCart ? 'stroke-[3]' : ''} />
                      {inCart ? `Ajouté (${inCart.quantity})` : 'Ajouter'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {filteredInventory.length === 0 && (
            <div className="py-20 text-center flex flex-col items-center justify-center bg-white rounded-2xl border border-slate-200/80 m-2">
              <div className="w-12 h-12 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mb-3">
                <Search size={22} />
              </div>
              <p className="text-xs font-black text-slate-500 uppercase tracking-wider">Aucun médicament trouvé</p>
              <p className="text-[11px] text-slate-400 mt-1">Essayez un autre mot-clé ou filtre de famille.</p>
            </div>
          )}
        </div>
      ) : (
        /* TABLE VIEW (HIGH DENSITY) */
        <div className="max-h-[640px] overflow-y-auto custom-scrollbar">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="sticky top-0 bg-slate-100/95 backdrop-blur-md z-10 border-b border-slate-200">
              <tr className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                <th className="py-3 px-4">Médicament</th>
                <th className="py-3 px-4">Famille</th>
                <th className="py-3 px-4 text-right">Prix Unitaire</th>
                <th className="py-3 px-4 text-center">Stock Physique</th>
                <th className="py-3 px-4 text-center">Disponible</th>
                <th className="py-3 px-4">Expiration</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {filteredInventory.map((item, idx) => {
                const stock = item.stock || 0;
                const reserved = item.reservedStock || 0;
                const available = Math.max(0, stock - reserved);
                const inCart = cart.find(c => c.id === item.id);
                const isOutOfStock = available === 0;

                return (
                  <tr 
                    key={item.id || idx}
                    className="odd:bg-white even:bg-slate-50/50 hover:bg-blue-50/40 transition-colors"
                  >
                    <td className="py-3 px-4">
                      <div className="font-black text-slate-800 text-xs">{item.name}</div>
                      <span className="text-[9px] font-mono text-slate-400 font-bold">Réf: {item.id}</span>
                    </td>
                    <td className="py-3 px-4 text-slate-600 font-semibold">{item.family || 'Général'}</td>
                    <td className="py-3 px-4 text-right font-black text-slate-900 font-mono">
                      {(item.price || 0).toLocaleString()} F
                    </td>
                    <td className="py-3 px-4 text-center font-bold text-slate-700 font-mono">
                      {stock}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        isOutOfStock ? 'bg-rose-100 text-rose-700' : available <= 10 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          isOutOfStock ? 'bg-rose-500' : available <= 10 ? 'bg-amber-500' : 'bg-emerald-500'
                        }`} />
                        {available} libre(s)
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                        item.alert ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-500'
                      }`}>
                        {item.expiry || 'N/A'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => onAddToCart(item)}
                        disabled={isOutOfStock}
                        className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                          isOutOfStock
                            ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                            : inCart
                            ? 'bg-blue-600 text-white hover:bg-blue-700'
                            : 'bg-blue-50 text-blue-700 hover:bg-blue-600 hover:text-white border border-blue-200'
                        }`}
                      >
                        {inCart ? `+ Réserver (${inCart.quantity})` : '+ Réserver'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {filteredInventory.length === 0 && (
            <div className="py-20 text-center flex flex-col items-center justify-center">
              <div className="w-12 h-12 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mb-3">
                <Search size={22} />
              </div>
              <p className="text-xs font-black text-slate-400 uppercase tracking-wider">Aucun médicament trouvé</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
