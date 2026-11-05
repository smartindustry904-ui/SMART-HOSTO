import React, { useEffect, useState } from 'react';
import { X, History, ArrowDownRight, Search, Calendar, User, Package, RefreshCw } from 'lucide-react';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../src/firebase';
import { StockMovement } from '../../types';

interface StockMovementsModalProps {
  onClose: () => void;
  currency?: string;
}

const StockMovementsModal: React.FC<StockMovementsModalProps> = ({ onClose, currency = 'FCFA' }) => {
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const q = query(
      collection(db, 'stock_movements'),
      orderBy('createdAt', 'desc'),
      limit(100)
    );

    const unsub = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data()
      } as StockMovement));
      setMovements(items);
      setLoading(false);
    }, (err) => {
      console.error("Error fetching stock movements:", err);
      setLoading(false);
      handleFirestoreError(err, OperationType.GET, 'stock_movements');
    });

    return () => unsub();
  }, []);

  const filtered = movements.filter(m => {
    const term = searchTerm.toLowerCase();
    return (
      (m.medicationName || '').toLowerCase().includes(term) ||
      (m.batchNumber || '').toLowerCase().includes(term) ||
      (m.adminName || '').toLowerCase().includes(term) ||
      (m.supplier || '').toLowerCase().includes(term)
    );
  });

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-100">
        
        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-slate-900 text-white rounded-xl flex items-center justify-center shadow-md">
              <History size={22} />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-900">Historique des Mouvements de Stock</h2>
              <p className="text-xs text-slate-500 font-medium">Journal d'audit des réapprovisionnements & arrivages</p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-2 text-slate-400 hover:bg-slate-200 hover:text-slate-600 rounded-xl transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Search Bar */}
        <div className="p-4 border-b border-slate-100 bg-white flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text"
              placeholder="Filtrer par médicament, N° de lot, fournisseur, admin..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
          <span className="text-xs font-bold text-slate-500 bg-slate-100 px-3 py-2 rounded-xl">
            {filtered.length} mouvement(s)
          </span>
        </div>

        {/* Table Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="p-12 text-center text-slate-400 font-bold text-sm flex items-center justify-center gap-2">
              <RefreshCw className="animate-spin" size={18} /> Chargement des mouvements...
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-slate-400 font-medium text-sm">
              Aucun mouvement de stock enregistré pour le moment.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-400 font-extrabold uppercase tracking-wider text-[10px]">
                    <th className="pb-3 px-3">Date & Heure</th>
                    <th className="pb-3 px-3">Médicament</th>
                    <th className="pb-3 px-3">Action / Qté</th>
                    <th className="pb-3 px-3">Stock (Ancien ➔ Nouveau)</th>
                    <th className="pb-3 px-3">N° Lot & Péremption</th>
                    <th className="pb-3 px-3">Auteur</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                  {filtered.map(m => {
                    const dt = m.createdAt ? new Date(m.createdAt).toLocaleString('fr-FR', {
                      dateStyle: 'short',
                      timeStyle: 'short'
                    }) : '-';

                    return (
                      <tr key={m.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-3 text-slate-500 font-mono text-[11px] whitespace-nowrap">
                          {dt}
                        </td>
                        <td className="py-3 px-3">
                          <p className="font-extrabold text-slate-900">{m.medicationName}</p>
                          {m.supplier && (
                            <p className="text-[10px] text-slate-400">Fournisseur: {m.supplier}</p>
                          )}
                        </td>
                        <td className="py-3 px-3">
                          <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-800 font-extrabold px-2.5 py-1 rounded-lg text-xs">
                            <ArrowDownRight size={14} /> +{m.quantity}
                          </span>
                        </td>
                        <td className="py-3 px-3 font-bold text-slate-700">
                          {m.previousStock ?? '?'} ➔ <span className="font-extrabold text-emerald-700">{m.newStock ?? '?'}</span>
                        </td>
                        <td className="py-3 px-3 font-mono text-[11px]">
                          <div><span className="font-bold text-slate-700">Lot:</span> {m.batchNumber || 'N/A'}</div>
                          {m.expiryDate && (
                            <div className="text-[10px] text-slate-500">Exp: {m.expiryDate}</div>
                          )}
                        </td>
                        <td className="py-3 px-3 font-bold text-slate-600">
                          {m.adminName || 'Admin'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-end">
          <button 
            onClick={onClose}
            className="px-5 py-2 rounded-xl font-bold text-xs text-slate-600 bg-white border border-slate-200 hover:bg-slate-100 transition-colors"
          >
            Fermer
          </button>
        </div>

      </div>
    </div>
  );
};

export default StockMovementsModal;
