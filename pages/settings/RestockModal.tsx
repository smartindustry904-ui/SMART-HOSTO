import React, { useState, useEffect, useMemo } from 'react';
import { X, PlusCircle, Package, Calendar, Tag, ShieldCheck, DollarSign, Building, Search, Pill, Box } from 'lucide-react';
import { Medication, Supplier } from '../../types';
import { db } from '../../src/firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import { getActiveTenantId, belongsToTenant } from '../../src/utils/tenant';

export type RestockItemType = 'MEDICATION' | 'CONSUMABLE';

interface RestockModalProps {
  medication?: Medication | null;
  consumable?: any | null;
  initialType?: RestockItemType;
  currency?: string;
  user?: any;
  establishment?: any;
  onClose: () => void;
  onSubmit: (data: {
    itemType: RestockItemType;
    itemId: string;
    itemName: string;
    quantity: number;
    batchNumber: string;
    expiryDate: string;
    purchaseCost?: number;
    supplier?: string;
    supplierId?: string;
    notes?: string;
  }) => Promise<void>;
}

const RestockModal: React.FC<RestockModalProps> = ({
  medication,
  consumable,
  initialType,
  currency = 'FCFA',
  user,
  establishment,
  onClose,
  onSubmit
}) => {
  const activeTenantId = useMemo(() => getActiveTenantId(user, establishment), [user, establishment]);
  // Determine initial item type
  const [itemType, setItemType] = useState<RestockItemType>(() => {
    if (consumable && !medication) return 'CONSUMABLE';
    if (initialType) return initialType;
    return 'MEDICATION';
  });

  // Inventories from Firestore
  const [medicationsList, setMedicationsList] = useState<Medication[]>([]);
  const [consumablesList, setConsumablesList] = useState<any[]>([]);
  const [suppliersList, setSuppliersList] = useState<Supplier[]>([]);

  // Selected item
  const [selectedMedId, setSelectedMedId] = useState<string>(medication?.id || '');
  const [selectedConsumableId, setSelectedConsumableId] = useState<string>(consumable?.id || '');
  const [itemSearchQuery, setItemSearchQuery] = useState<string>('');

  // Form inputs
  const [quantity, setQuantity] = useState<string>('');
  const [batchNumber, setBatchNumber] = useState<string>('');
  const [expiryDate, setExpiryDate] = useState<string>('');
  const [purchaseCost, setPurchaseCost] = useState<string>('');
  const [supplier, setSupplier] = useState<string>('');
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Real-time subscriptions
  useEffect(() => {
    const unsubSupp = onSnapshot(collection(db, 'suppliers'), snapshot => {
      const allSupp = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Supplier));
      setSuppliersList(allSupp.filter(s => belongsToTenant(s, activeTenantId)));
    });
    const unsubMeds = onSnapshot(collection(db, 'pharmacy_inventory'), snapshot => {
      const allMeds = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Medication));
      setMedicationsList(allMeds.filter(m => belongsToTenant(m, activeTenantId)));
    });
    const unsubCons = onSnapshot(collection(db, 'hospital_consumables'), snapshot => {
      const allCons = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setConsumablesList(allCons.filter(c => belongsToTenant(c, activeTenantId)));
    });

    return () => {
      unsubSupp();
      unsubMeds();
      unsubCons();
    };
  }, [activeTenantId]);

  // Update selected IDs if props change
  useEffect(() => {
    if (medication) {
      setSelectedMedId(medication.id);
      setItemType('MEDICATION');
    }
  }, [medication]);

  useEffect(() => {
    if (consumable) {
      setSelectedConsumableId(consumable.id);
      setItemType('CONSUMABLE');
    }
  }, [consumable]);

  // Resolve current active item
  const currentItem = useMemo(() => {
    if (itemType === 'MEDICATION') {
      const found = medicationsList.find(m => m.id === selectedMedId) || (medication?.id === selectedMedId ? medication : null);
      if (found) {
        return {
          id: found.id,
          name: found.name,
          category: found.family || found.classeTherapeutique || 'Pharmacie',
          unit: found.unit || found.typeConditionnement || 'Boîte',
          stock: Number(found.stock) || 0,
          type: 'MEDICATION' as const,
          code: found.codeInterne || ''
        };
      }
      return null;
    } else {
      const found = consumablesList.find(c => c.id === selectedConsumableId) || (consumable?.id === selectedConsumableId ? consumable : null);
      if (found) {
        return {
          id: found.id,
          name: found.nom || found.name,
          category: found.categorie || 'Consommable',
          unit: found.uniteGestion || found.unit || 'Unité',
          stock: Number(found.stock !== undefined ? found.stock : (found.stockInitial || 0)),
          type: 'CONSUMABLE' as const,
          code: found.codeInterne || ''
        };
      }
      return null;
    }
  }, [itemType, selectedMedId, selectedConsumableId, medicationsList, consumablesList, medication, consumable]);

  const currentStock = currentItem?.stock || 0;
  const addedQty = parseInt(quantity, 10) || 0;
  const projectedStock = currentStock + addedQty;

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!currentItem) {
      errs.item = 'Veuillez sélectionner un article à réapprovisionner';
    }
    if (!addedQty || addedQty <= 0) {
      errs.quantity = 'Veuillez saisir une quantité valide (> 0)';
    }

    if (itemType === 'MEDICATION') {
      if (!batchNumber.trim()) {
        errs.batchNumber = 'Le numéro de lot est requis pour les médicaments';
      }
      if (!expiryDate) {
        errs.expiryDate = 'La date de péremption est requise pour les médicaments';
      } else {
        const exp = new Date(expiryDate);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (exp < today) {
          errs.expiryDate = 'La date de péremption est déjà dépassée !';
        }
      }
    }

    if (!supplier.trim() && !selectedSupplierId) {
      errs.supplier = 'Veuillez renseigner un fournisseur pour la comptabilité';
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate() || !currentItem) return;

    setLoading(true);
    try {
      const matchedSupp = suppliersList.find(s => s.id === selectedSupplierId || (s.name && s.name.toLowerCase() === supplier.trim().toLowerCase()));
      const supplierName = supplier.trim() || matchedSupp?.name || (itemType === 'CONSUMABLE' ? 'Fournisseur Consommables' : 'Fournisseur Médicaments');
      const supplierId = matchedSupp?.id || (selectedSupplierId && selectedSupplierId !== 'NEW' ? selectedSupplierId : undefined);

      await onSubmit({
        itemType,
        itemId: currentItem.id,
        itemName: currentItem.name,
        quantity: addedQty,
        batchNumber: batchNumber.trim().toUpperCase() || (itemType === 'CONSUMABLE' ? `LOT-${Date.now().toString().slice(-6)}` : ''),
        expiryDate: expiryDate || '',
        purchaseCost: purchaseCost ? parseFloat(purchaseCost) : 0,
        supplier: supplierName,
        supplierId: supplierId,
        notes: notes.trim() || undefined
      });
      onClose();
    } catch (err) {
      console.error("Error submitting restock:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-100 max-h-[92vh]">
        
        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-emerald-50/70 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-600 text-white rounded-xl flex items-center justify-center shadow-md shadow-emerald-500/20">
              <PlusCircle size={22} />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-900">Entrée de Stock & Réapprovisionnement</h2>
              <p className="text-xs text-slate-500 font-medium">Alimentation des stocks & Synchronisation Comptable</p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-2 text-slate-400 hover:bg-slate-200 hover:text-slate-600 rounded-xl transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Item Type Switcher Tabs */}
        <div className="px-6 pt-3 pb-2 bg-slate-100/70 border-b border-slate-200 flex items-center gap-2 shrink-0">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mr-2">Type d'article :</span>
          <button
            type="button"
            onClick={() => {
              setItemType('CONSUMABLE');
              setItemSearchQuery('');
            }}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition-all ${
              itemType === 'CONSUMABLE'
                ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-600/30'
                : 'bg-white text-slate-600 hover:bg-slate-200/80 border border-slate-200'
            }`}
          >
            <Box size={14} /> Consommable Médical
          </button>
          <button
            type="button"
            onClick={() => {
              setItemType('MEDICATION');
              setItemSearchQuery('');
            }}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition-all ${
              itemType === 'MEDICATION'
                ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/30'
                : 'bg-white text-slate-600 hover:bg-slate-200/80 border border-slate-200'
            }`}
          >
            <Pill size={14} /> Médicament Pharmacie
          </button>
        </div>

        {/* Selected Item Summary or Item Selector */}
        <div className="px-6 py-3.5 bg-slate-900 text-white flex items-center justify-between shrink-0">
          {currentItem ? (
            <div className="overflow-hidden pr-3 flex-1">
              <div className="flex items-center gap-2 mb-0.5">
                <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${
                  itemType === 'CONSUMABLE' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-blue-500/20 text-blue-300'
                }`}>
                  {itemType === 'CONSUMABLE' ? 'Consommable' : 'Médicament'}
                </span>
                {currentItem.code && <span className="text-[11px] text-slate-400 font-mono">{currentItem.code}</span>}
              </div>
              <h3 className="font-extrabold text-sm truncate text-white">{currentItem.name}</h3>
              <p className="text-[11px] text-slate-300 font-medium truncate">
                Catégorie: {currentItem.category} • Unité: {currentItem.unit}
              </p>
            </div>
          ) : (
            <div className="flex-1 py-1">
              <span className="text-amber-400 text-xs font-bold block mb-1">Aucun article sélectionné</span>
              <p className="text-[11px] text-slate-300">Veuillez choisir un article dans la liste ci-dessous</p>
            </div>
          )}

          {currentItem && (
            <div className="text-right shrink-0 bg-white/10 px-3.5 py-2 rounded-xl border border-white/10">
              <span className="text-[10px] text-slate-300 uppercase block font-bold">Stock Actuel</span>
              <span className="text-lg font-black text-white">{currentStock}</span>
              <span className="text-[10px] text-slate-300 block font-medium">{currentItem.unit}</span>
            </div>
          )}
        </div>

        {/* Form Content */}
        <form id="restock-form" onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
          
          {/* Article Selector Dropdown when not locked to a specific prop */}
          <div>
            <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-700 mb-1.5 flex items-center justify-between">
              <span>Sélectionner {itemType === 'CONSUMABLE' ? 'le consommable' : 'le médicament'} <span className="text-rose-500">*</span></span>
              <span className="text-[10px] text-slate-400 font-normal">
                ({itemType === 'CONSUMABLE' ? consumablesList.length : medicationsList.length} articles disponibles)
              </span>
            </label>

            <div className="space-y-2">
              <div className="relative">
                <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder={`Rechercher un ${itemType === 'CONSUMABLE' ? 'consommable' : 'médicament'}...`}
                  value={itemSearchQuery}
                  onChange={(e) => setItemSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>

              <select
                value={itemType === 'CONSUMABLE' ? selectedConsumableId : selectedMedId}
                onChange={(e) => {
                  if (itemType === 'CONSUMABLE') {
                    setSelectedConsumableId(e.target.value);
                  } else {
                    setSelectedMedId(e.target.value);
                  }
                  if (errors.item) setErrors(prev => ({ ...prev, item: '' }));
                }}
                className={`w-full p-3 bg-white border rounded-2xl focus:ring-2 focus:ring-emerald-500 outline-none font-bold text-slate-900 text-xs cursor-pointer ${
                  errors.item ? 'border-rose-300 ring-1 ring-rose-200' : 'border-slate-200'
                }`}
              >
                <option value="">-- Choisir dans le catalogue --</option>
                {itemType === 'CONSUMABLE'
                  ? consumablesList
                      .filter(c => !itemSearchQuery || (c.nom || c.name || '').toLowerCase().includes(itemSearchQuery.toLowerCase()) || (c.codeInterne || '').toLowerCase().includes(itemSearchQuery.toLowerCase()))
                      .map(c => (
                        <option key={c.id} value={c.id}>
                          {c.nom || c.name} (Stock: {c.stock !== undefined ? c.stock : (c.stockInitial || 0)} {c.uniteGestion || 'unités'}) • {c.categorie || 'Général'}
                        </option>
                      ))
                  : medicationsList
                      .filter(m => !itemSearchQuery || (m.name || '').toLowerCase().includes(itemSearchQuery.toLowerCase()) || (m.dci || '').toLowerCase().includes(itemSearchQuery.toLowerCase()))
                      .map(m => (
                        <option key={m.id} value={m.id}>
                          {m.name} (Stock: {m.stock || 0} {m.unit || 'unités'}) • {m.family || m.classeTherapeutique || 'Pharmacie'}
                        </option>
                      ))
                }
              </select>
            </div>
            {errors.item && <p className="text-xs text-rose-500 font-bold mt-1">{errors.item}</p>}
          </div>

          {/* Quantity Received */}
          <div>
            <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-700 mb-1.5 flex items-center gap-1.5">
              <Package size={15} className="text-emerald-600" /> Quantité Reçue (Ajoutée) <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <input 
                type="number"
                min="1"
                value={quantity}
                onChange={(e) => {
                  setQuantity(e.target.value);
                  if (errors.quantity) setErrors(prev => ({ ...prev, quantity: '' }));
                }}
                placeholder="Ex: 50"
                className={`w-full p-3.5 bg-slate-50 border rounded-2xl focus:bg-white focus:ring-2 focus:ring-emerald-500 outline-none font-bold text-slate-900 text-base pr-20 ${
                  errors.quantity ? 'border-rose-300 ring-1 ring-rose-300' : 'border-slate-200'
                }`}
              />
              <span className="absolute right-3.5 top-1/2 -translate-y-1/2 font-black text-xs text-slate-400 uppercase">
                {currentItem?.unit || 'Unités'}
              </span>
            </div>
            {errors.quantity && <p className="text-xs text-rose-500 font-bold mt-1">{errors.quantity}</p>}
          </div>

          {/* Unit Purchase Cost & Supplier (Critical for Comptabilité > Dépenses) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-700 mb-1.5 flex items-center gap-1.5">
                <DollarSign size={15} className="text-slate-500" /> Coût d'Achat Unitaire <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <input 
                  type="number"
                  min="0"
                  step="1"
                  value={purchaseCost}
                  onChange={(e) => setPurchaseCost(e.target.value)}
                  placeholder="Ex: 1500"
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl focus:bg-white focus:ring-2 focus:ring-emerald-500 outline-none font-bold text-slate-900 text-xs pr-14"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 font-bold text-[10px] text-slate-400">{currency}</span>
              </div>
              <p className="text-[10px] text-slate-400 mt-1">
                Génère automatiquement la facture d'achat en comptabilité.
              </p>
            </div>

            <div>
              <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-700 mb-1.5 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Building size={15} className="text-slate-500" /> Fournisseur <span className="text-rose-500">*</span>
                </span>
                {suppliersList.length > 0 && (
                  <span className="text-[10px] text-emerald-600 font-bold lowercase">
                    ({suppliersList.length} référencé{suppliersList.length > 1 ? 's' : ''})
                  </span>
                )}
              </label>

              {suppliersList.length > 0 ? (
                <div className="space-y-1.5">
                  <select
                    value={selectedSupplierId}
                    onChange={(e) => {
                      const sId = e.target.value;
                      setSelectedSupplierId(sId);
                      const found = suppliersList.find(s => s.id === sId);
                      if (found) {
                        setSupplier(found.name);
                      } else {
                        setSupplier('');
                      }
                      if (errors.supplier) setErrors(prev => ({ ...prev, supplier: '' }));
                    }}
                    className={`w-full p-3 bg-slate-50 border rounded-2xl focus:bg-white focus:ring-2 focus:ring-emerald-500 outline-none font-bold text-slate-900 text-xs cursor-pointer ${
                      errors.supplier ? 'border-rose-300 ring-1 ring-rose-200' : 'border-slate-200'
                    }`}
                  >
                    <option value="">-- Sélectionner un fournisseur --</option>
                    {suppliersList.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.category || 'Général'})
                      </option>
                    ))}
                    <option value="NEW">+ Autre / Nouveau Fournisseur</option>
                  </select>

                  {(selectedSupplierId === 'NEW' || !selectedSupplierId) && (
                    <input 
                      type="text"
                      value={supplier}
                      onChange={(e) => {
                        setSupplier(e.target.value);
                        if (errors.supplier) setErrors(prev => ({ ...prev, supplier: '' }));
                      }}
                      placeholder="Nom du fournisseur (ex: Laborex, Ubipharm, Promedis...)"
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-500 outline-none font-bold text-slate-900 text-xs"
                    />
                  )}
                </div>
              ) : (
                <input 
                  type="text"
                  value={supplier}
                  onChange={(e) => {
                    setSupplier(e.target.value);
                    if (errors.supplier) setErrors(prev => ({ ...prev, supplier: '' }));
                  }}
                  placeholder="Nom du fournisseur (ex: Laborex, Ubipharm, Promedis...)"
                  className={`w-full p-3 bg-slate-50 border rounded-2xl focus:bg-white focus:ring-2 focus:ring-emerald-500 outline-none font-bold text-slate-900 text-xs ${
                    errors.supplier ? 'border-rose-300 ring-1 ring-rose-200' : 'border-slate-200'
                  }`}
                />
              )}
              {errors.supplier && <p className="text-xs text-rose-500 font-bold mt-1">{errors.supplier}</p>}
            </div>
          </div>

          {/* Batch Number & Expiration Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-700 mb-1.5 flex items-center gap-1.5">
                <Tag size={15} className="text-emerald-600" /> Numéro de Lot {itemType === 'MEDICATION' && <span className="text-rose-500">*</span>}
              </label>
              <input 
                type="text"
                value={batchNumber}
                onChange={(e) => {
                  setBatchNumber(e.target.value);
                  if (errors.batchNumber) setErrors(prev => ({ ...prev, batchNumber: '' }));
                }}
                placeholder={itemType === 'MEDICATION' ? "Ex: LOT-2026-08A" : "Optionnel (ex: LOT-CSM-01)"}
                className={`w-full p-3 bg-slate-50 border rounded-2xl focus:bg-white focus:ring-2 focus:ring-emerald-500 outline-none font-mono font-bold text-slate-900 text-xs uppercase ${
                  errors.batchNumber ? 'border-rose-300 ring-1 ring-rose-300' : 'border-slate-200'
                }`}
              />
              {errors.batchNumber && <p className="text-xs text-rose-500 font-bold mt-1">{errors.batchNumber}</p>}
            </div>

            <div>
              <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-700 mb-1.5 flex items-center gap-1.5">
                <Calendar size={15} className="text-emerald-600" /> Date Péremption {itemType === 'MEDICATION' && <span className="text-rose-500">*</span>}
              </label>
              <input 
                type="date"
                value={expiryDate}
                onChange={(e) => {
                  setExpiryDate(e.target.value);
                  if (errors.expiryDate) setErrors(prev => ({ ...prev, expiryDate: '' }));
                }}
                className={`w-full p-3 bg-slate-50 border rounded-2xl focus:bg-white focus:ring-2 focus:ring-emerald-500 outline-none font-bold text-slate-900 text-xs ${
                  errors.expiryDate ? 'border-rose-300 ring-1 ring-rose-300' : 'border-slate-200'
                }`}
              />
              {errors.expiryDate && <p className="text-xs text-rose-500 font-bold mt-1">{errors.expiryDate}</p>}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
              Observations / Référence BL
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex: Bon de livraison N° BL-2026-904, Réceptionné conforme..."
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-500 outline-none text-xs font-medium text-slate-700"
            />
          </div>

          {/* Stock Projection & Accounting Notice Box */}
          <div className="space-y-2">
            <div className="p-3.5 bg-emerald-50/80 border border-emerald-200/80 rounded-2xl flex items-center justify-between text-xs font-bold text-emerald-950">
              <div className="flex items-center gap-2">
                <ShieldCheck className="text-emerald-600 shrink-0" size={18} />
                <span>Nouveau stock après validation :</span>
              </div>
              <div className="flex items-center gap-1.5 bg-emerald-600 text-white px-3 py-1 rounded-xl shadow-sm">
                <span className="line-through opacity-70 text-[10px]">{currentStock}</span>
                <span>➔</span>
                <span className="font-black text-sm">{projectedStock}</span>
                <span className="text-[10px] opacity-80 uppercase">{currentItem?.unit || ''}</span>
              </div>
            </div>

            {purchaseCost && addedQty > 0 && (
              <div className="p-2.5 bg-slate-100 rounded-xl flex items-center justify-between text-[11px] text-slate-700 font-bold border border-slate-200">
                <span>Montant total facture d'achat :</span>
                <span className="font-black text-slate-900 text-xs">
                  {(Number(purchaseCost) * addedQty).toLocaleString()} {currency}
                </span>
              </div>
            )}
          </div>

        </form>

        {/* Footer */}
        <div className="p-5 border-t border-slate-100 bg-slate-50/50 flex items-center justify-end gap-3 shrink-0">
          <button 
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-5 py-2.5 rounded-xl font-bold text-xs text-slate-600 bg-white border border-slate-200 hover:bg-slate-100 transition-colors"
          >
            Annuler
          </button>
          <button 
            type="submit"
            form="restock-form"
            disabled={loading || !currentItem}
            className="px-6 py-2.5 rounded-xl font-bold text-xs text-white bg-emerald-600 hover:bg-emerald-700 transition-colors flex items-center gap-2 shadow-lg shadow-emerald-600/20 disabled:opacity-50"
          >
            {loading ? (
              <span>Enregistrement en cours...</span>
            ) : (
              <>
                <PlusCircle size={16} /> Valider Réapprovisionnement (+{addedQty})
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );
};

export default RestockModal;
