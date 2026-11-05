import React, { useState, useMemo } from 'react';
import { 
  Truck, 
  Building, 
  Plus, 
  Search, 
  Filter, 
  DollarSign, 
  FileText, 
  CreditCard, 
  CheckCircle, 
  X, 
  Trash2, 
  Edit2, 
  Pill, 
  ShieldCheck, 
  Calendar, 
  AlertCircle,
  Loader2,
  Clock
} from 'lucide-react';
import { Supplier, SupplierInvoice, SupplierPayment } from '../../types';
import { collection, doc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db, sanitizeData } from '../../src/firebase';

interface AccountingFournisseursTabProps {
  suppliers: Supplier[];
  supplierInvoices: SupplierInvoice[];
  currency?: string;
  user?: any;
}

export const AccountingFournisseursTab: React.FC<AccountingFournisseursTabProps> = ({
  suppliers,
  supplierInvoices,
  currency = 'FCFA',
  user
}) => {
  const [subTab, setSubTab] = useState<'INVOICES' | 'SUPPLIERS'>('INVOICES');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'PENDING' | 'PAID'>('ALL');

  // Supplier CRUD Modal State
  const [isSupplierModalOpen, setIsSupplierModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [supplierFormData, setSupplierFormData] = useState({
    name: '',
    contact: '',
    phone: '',
    email: '',
    address: '',
    taxId: '',
    category: 'Médicaments & Pharmacie'
  });
  const [isSavingSupplier, setIsSavingSupplier] = useState(false);

  // Invoice Payment Modal State
  const [selectedInvoiceForPayment, setSelectedInvoiceForPayment] = useState<SupplierInvoice | null>(null);
  const [paymentAmount, setPaymentAmount] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<'TRANSFER' | 'CHECK' | 'CASH' | 'MOBILE_MONEY'>('TRANSFER');
  const [paymentRef, setPaymentRef] = useState<string>('');
  const [isSavingPayment, setIsSavingPayment] = useState(false);

  // 1. Overall KPIs
  const totalDebtOverall = useMemo(() => {
    return suppliers.reduce((sum, s) => sum + Number(s.outstandingDebt || s.balance || 0), 0);
  }, [suppliers]);

  const pendingInvoices = useMemo(() => {
    return supplierInvoices.filter(i => i.status === 'PENDING' || i.status === 'PARTIAL');
  }, [supplierInvoices]);

  const totalInvoicesAmountPending = useMemo(() => {
    return pendingInvoices.reduce((sum, i) => sum + (Number(i.totalAmount || 0) - Number(i.amountPaid || 0)), 0);
  }, [pendingInvoices]);

  const totalPurchasesOverall = useMemo(() => {
    return supplierInvoices.reduce((sum, i) => sum + Number(i.totalAmount || 0), 0);
  }, [supplierInvoices]);

  // 2. Filtered Invoices
  const filteredInvoices = useMemo(() => {
    return supplierInvoices.filter(inv => {
      if (filterStatus === 'PENDING' && inv.status === 'PAID') return false;
      if (filterStatus === 'PAID' && inv.status !== 'PAID') return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesSupplier = (inv.supplierName || '').toLowerCase().includes(q);
        const matchesNum = (inv.invoiceNumber || inv.id || '').toLowerCase().includes(q);
        const matchesNotes = (inv.notes || '').toLowerCase().includes(q);
        if (!matchesSupplier && !matchesNum && !matchesNotes) return false;
      }

      return true;
    });
  }, [supplierInvoices, filterStatus, searchQuery]);

  // 3. Filtered Suppliers
  const filteredSuppliers = useMemo(() => {
    return suppliers.filter(s => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = (s.name || '').toLowerCase().includes(q);
        const matchesContact = (s.contact || '').toLowerCase().includes(q);
        const matchesCat = (s.category || '').toLowerCase().includes(q);
        if (!matchesName && !matchesContact && !matchesCat) return false;
      }
      return true;
    });
  }, [suppliers, searchQuery]);

  // 4. Save/Create Supplier Handler
  const handleSaveSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierFormData.name.trim()) return;

    setIsSavingSupplier(true);
    try {
      if (editingSupplier) {
        // Update existing
        const suppRef = doc(db, 'suppliers', editingSupplier.id);
        await updateDoc(suppRef, {
          ...supplierFormData,
          updatedAt: new Date().toISOString()
        });
      } else {
        // Create new
        const newId = `SUPP-${Date.now()}`;
        const newSupplier: Supplier = {
          id: newId,
          ...supplierFormData,
          outstandingDebt: 0,
          balance: 0,
          totalBought: 0,
          historyCount: 0,
          createdAt: new Date().toISOString()
        };
        await setDoc(doc(db, 'suppliers', newId), sanitizeData(newSupplier));
      }

      setIsSupplierModalOpen(false);
      setEditingSupplier(null);
      setSupplierFormData({
        name: '',
        contact: '',
        phone: '',
        email: '',
        address: '',
        taxId: '',
        category: 'Médicaments & Pharmacie'
      });
    } catch (err) {
      console.error("Error saving supplier:", err);
    } finally {
      setIsSavingSupplier(false);
    }
  };

  // 5. Delete Supplier Handler
  const handleDeleteSupplier = async (supplierId: string) => {
    if (!window.confirm("Êtes-vous sûr de vouloir supprimer ce fournisseur ?")) return;
    try {
      await deleteDoc(doc(db, 'suppliers', supplierId));
    } catch (err) {
      console.error("Error deleting supplier:", err);
    }
  };

  // 6. Execute Invoice Payment
  const handleExecutePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInvoiceForPayment) return;

    const amt = parseFloat(paymentAmount);
    if (isNaN(amt) || amt <= 0) return;

    setIsSavingPayment(true);
    try {
      const invoiceRef = doc(db, 'supplier_invoices', selectedInvoiceForPayment.id);
      const prevPaid = Number(selectedInvoiceForPayment.amountPaid || 0);
      const total = Number(selectedInvoiceForPayment.totalAmount || 0);
      const newPaid = prevPaid + amt;
      const isFullyPaid = newPaid >= total;

      // 1. Record Supplier Payment Document
      const paymentId = `PAY-SUPP-${Date.now()}`;
      const paymentDoc: SupplierPayment = {
        id: paymentId,
        supplierId: selectedInvoiceForPayment.supplierId,
        supplierName: selectedInvoiceForPayment.supplierName,
        invoiceId: selectedInvoiceForPayment.id,
        invoiceNumber: selectedInvoiceForPayment.invoiceNumber,
        amount: amt,
        paymentMethod: paymentMethod,
        reference: paymentRef || `REG-${Date.now().toString().slice(-6)}`,
        date: new Date().toISOString(),
        paidBy: user?.name || 'Comptable',
        createdAt: new Date().toISOString()
      };
      await setDoc(doc(db, 'supplier_payments', paymentId), sanitizeData(paymentDoc));

      // 2. Update Invoice Document
      await updateDoc(invoiceRef, {
        amountPaid: newPaid,
        status: isFullyPaid ? 'PAID' : 'PARTIAL',
        updatedAt: new Date().toISOString()
      });

      // 3. Update Supplier Outstanding Debt in Firestore
      if (selectedInvoiceForPayment.supplierId) {
        const suppRef = doc(db, 'suppliers', selectedInvoiceForPayment.supplierId);
        const suppObj = suppliers.find(s => s.id === selectedInvoiceForPayment.supplierId);
        if (suppObj) {
          const currentDebt = Number(suppObj.outstandingDebt || suppObj.balance || 0);
          const newDebt = Math.max(0, currentDebt - amt);
          await updateDoc(suppRef, {
            outstandingDebt: newDebt,
            balance: newDebt,
            updatedAt: new Date().toISOString()
          });
        }
      }

      setSelectedInvoiceForPayment(null);
      setPaymentAmount('');
      setPaymentRef('');
    } catch (err) {
      console.error("Error executing supplier payment:", err);
    } finally {
      setIsSavingPayment(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      
      {/* Top Header Card */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-50 text-amber-700 rounded-full text-xs font-bold border border-amber-200 mb-2">
            <Truck size={14} /> Gestion des Fournisseurs & Approvisionnements
          </div>
          <h2 className="text-xl font-black text-slate-900">Fournisseurs & Factures d'Achats</h2>
          <p className="text-xs text-slate-500 max-w-2xl">
            Toutes les livraisons de la Pharmacie et du Laboratoire génèrent automatiquement des factures d'achats à régler.
          </p>
        </div>

        {/* Action Button & KPIs */}
        <div className="flex items-center gap-3">
          <div className="bg-amber-50 border border-amber-200/80 p-3 rounded-2xl text-right">
            <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider block">Dettes Fournisseurs</span>
            <span className="font-mono font-black text-amber-800 text-base">{totalInvoicesAmountPending.toLocaleString()} {currency}</span>
          </div>
          <button
            onClick={() => {
              setEditingSupplier(null);
              setSupplierFormData({
                name: '',
                contact: '',
                phone: '',
                email: '',
                address: '',
                taxId: '',
                category: 'Médicaments & Pharmacie'
              });
              setIsSupplierModalOpen(true);
            }}
            className="px-4 py-3 bg-amber-600 hover:bg-amber-500 text-white rounded-2xl text-xs font-bold flex items-center gap-2 transition-colors shadow-sm"
          >
            <Plus size={16} /> Nouveau Fournisseur
          </button>
        </div>
      </div>

      {/* Sub-tab Navigation */}
      <div className="flex justify-between items-center bg-white p-2 rounded-2xl border border-slate-200/80 shadow-sm">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSubTab('INVOICES')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              subTab === 'INVOICES' ? 'bg-amber-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <FileText size={15} /> Factures d'Achats ({supplierInvoices.length})
          </button>
          <button
            onClick={() => setSubTab('SUPPLIERS')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              subTab === 'SUPPLIERS' ? 'bg-amber-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Building size={15} /> Répertoire Fournisseurs ({suppliers.length})
          </button>
        </div>

        {/* Filter controls */}
        <div className="flex items-center gap-3 pr-2">
          {subTab === 'INVOICES' && (
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs">
              <button
                onClick={() => setFilterStatus('ALL')}
                className={`px-2.5 py-1 rounded-lg font-bold ${filterStatus === 'ALL' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500'}`}
              >
                Toutes
              </button>
              <button
                onClick={() => setFilterStatus('PENDING')}
                className={`px-2.5 py-1 rounded-lg font-bold ${filterStatus === 'PENDING' ? 'bg-white shadow-sm text-amber-700' : 'text-slate-500'}`}
              >
                À payer
              </button>
              <button
                onClick={() => setFilterStatus('PAID')}
                className={`px-2.5 py-1 rounded-lg font-bold ${filterStatus === 'PAID' ? 'bg-white shadow-sm text-emerald-700' : 'text-slate-500'}`}
              >
                Réglées
              </button>
            </div>
          )}

          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder={subTab === 'INVOICES' ? "Rechercher une facture..." : "Rechercher un fournisseur..."}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-amber-500 outline-none w-56"
            />
          </div>
        </div>
      </div>

      {/* VIEW 1: FACTURES D'ACHATS (Automated from Pharmacy Restocks) */}
      {subTab === 'INVOICES' && (
        <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden">
          {filteredInvoices.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100/75 text-slate-600 font-extrabold uppercase text-[10px] tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="p-4">N° Facture & Date</th>
                    <th className="p-4">Fournisseur</th>
                    <th className="p-4">Source & Articles Réceptionnés</th>
                    <th className="p-4 text-right">Montant Total</th>
                    <th className="p-4 text-right">Montant Réglé</th>
                    <th className="p-4 text-right">Solde Dû</th>
                    <th className="p-4 text-center">Statut</th>
                    <th className="p-4 text-center">Règlement</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                  {filteredInvoices.map((inv) => {
                    const total = Number(inv.totalAmount || 0);
                    const paid = Number(inv.amountPaid || 0);
                    const remaining = Math.max(0, total - paid);
                    const isPaid = inv.status === 'PAID' || remaining <= 0;

                    return (
                      <tr key={inv.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="p-4">
                          <p className="font-bold text-slate-900 font-mono">{inv.invoiceNumber}</p>
                          <p className="text-[10px] text-slate-400">
                            {inv.date ? new Date(inv.date).toLocaleDateString('fr-FR') : '-'}
                          </p>
                        </td>

                        <td className="p-4 font-bold text-slate-900">
                          {inv.supplierName}
                        </td>

                        <td className="p-4 max-w-xs">
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className="bg-emerald-100 text-emerald-800 text-[9px] font-black uppercase px-2 py-0.5 rounded">
                              {inv.moduleSource || 'Pharmacie'}
                            </span>
                            <span className="text-[10px] text-slate-400">Automatique</span>
                          </div>
                          <p className="text-[11px] text-slate-600 font-semibold truncate" title={inv.notes}>
                            {inv.notes || (inv.items && inv.items[0]?.name ? `${inv.items[0].name} (x${inv.items[0].quantity})` : 'Réapprovisionnement')}
                          </p>
                        </td>

                        <td className="p-4 text-right font-mono font-bold text-slate-900">
                          {total.toLocaleString()} {currency}
                        </td>

                        <td className="p-4 text-right font-mono font-bold text-emerald-600">
                          {paid.toLocaleString()} {currency}
                        </td>

                        <td className="p-4 text-right font-mono font-black text-amber-700">
                          {remaining.toLocaleString()} {currency}
                        </td>

                        <td className="p-4 text-center">
                          <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase border ${
                            isPaid 
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                              : inv.status === 'PARTIAL' 
                              ? 'bg-blue-50 text-blue-700 border-blue-200' 
                              : 'bg-amber-50 text-amber-700 border-amber-200'
                          }`}>
                            {isPaid ? 'Réglé' : inv.status === 'PARTIAL' ? 'Partiel' : 'Non Réglé'}
                          </span>
                        </td>

                        <td className="p-4 text-center">
                          {!isPaid ? (
                            <button
                              onClick={() => {
                                setSelectedInvoiceForPayment(inv);
                                setPaymentAmount(remaining.toString());
                              }}
                              className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-[11px] font-bold transition-colors shadow-sm flex items-center gap-1 mx-auto"
                            >
                              <DollarSign size={13} /> Régler
                            </button>
                          ) : (
                            <span className="text-emerald-600 font-bold text-[11px] flex items-center justify-center gap-1">
                              <CheckCircle size={14} /> Clôturé
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-12 text-center flex flex-col items-center justify-center">
              <FileText size={40} className="text-slate-300 mb-3" />
              <p className="text-sm font-bold text-slate-700">Aucune facture d'achat fournisseur</p>
              <p className="text-xs text-slate-400 mt-1 max-w-sm">
                Lors de chaque réapprovisionnement de médicaments ou de consommables, une facture est automatiquement émise ici.
              </p>
            </div>
          )}
        </div>
      )}

      {/* VIEW 2: RÉPERTOIRE FOURNISSEURS (CRUD) */}
      {subTab === 'SUPPLIERS' && (
        <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden">
          {filteredSuppliers.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100/75 text-slate-600 font-extrabold uppercase text-[10px] tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="p-4">Fournisseur</th>
                    <th className="p-4">Catégorie</th>
                    <th className="p-4">Contact</th>
                    <th className="p-4">Téléphone / Email</th>
                    <th className="p-4 text-right">Achats Cumulés</th>
                    <th className="p-4 text-right">Dette en Cours</th>
                    <th className="p-4 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                  {filteredSuppliers.map((supp) => {
                    const debt = Number(supp.outstandingDebt || supp.balance || 0);
                    const bought = Number(supp.totalBought || 0);

                    return (
                      <tr key={supp.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="p-4">
                          <p className="font-bold text-slate-900">{supp.name}</p>
                          <p className="text-[10px] text-slate-400 font-mono">
                            {supp.taxId ? `NIF/RC: ${supp.taxId}` : supp.id}
                          </p>
                        </td>

                        <td className="p-4">
                          <span className="bg-slate-100 text-slate-700 px-2.5 py-0.5 rounded-md font-bold text-[10px]">
                            {supp.category || 'Général'}
                          </span>
                        </td>

                        <td className="p-4 text-slate-700">
                          {supp.contact || '-'}
                        </td>

                        <td className="p-4 text-slate-600">
                          <p>{supp.phone || '-'}</p>
                          <p className="text-[10px] text-slate-400">{supp.email}</p>
                        </td>

                        <td className="p-4 text-right font-mono font-bold text-slate-900">
                          {bought.toLocaleString()} {currency}
                        </td>

                        <td className="p-4 text-right font-mono font-black">
                          {debt > 0 ? (
                            <span className="text-amber-700 bg-amber-50 px-2.5 py-0.5 rounded-lg border border-amber-200">
                              {debt.toLocaleString()} {currency}
                            </span>
                          ) : (
                            <span className="text-slate-400">0 F</span>
                          )}
                        </td>

                        <td className="p-4 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => {
                                setEditingSupplier(supp);
                                setSupplierFormData({
                                  name: supp.name || '',
                                  contact: supp.contact || '',
                                  phone: supp.phone || '',
                                  email: supp.email || '',
                                  address: supp.address || '',
                                  taxId: supp.taxId || '',
                                  category: supp.category || 'Médicaments & Pharmacie'
                                });
                                setIsSupplierModalOpen(true);
                              }}
                              className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors"
                              title="Modifier"
                            >
                              <Edit2 size={14} />
                            </button>
                            <button
                              onClick={() => handleDeleteSupplier(supp.id)}
                              className="p-1.5 bg-slate-100 hover:bg-rose-100 text-slate-500 hover:text-rose-600 rounded-lg transition-colors"
                              title="Supprimer"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-12 text-center flex flex-col items-center justify-center">
              <Building size={40} className="text-slate-300 mb-3" />
              <p className="text-sm font-bold text-slate-700">Aucun fournisseur enregistré</p>
              <p className="text-xs text-slate-400 mt-1 max-w-sm">
                Ajoutez un premier fournisseur pour référencer vos achats de pharmacie ou de matériel médical.
              </p>
            </div>
          )}
        </div>
      )}

      {/* MODAL: ADD / EDIT SUPPLIER */}
      {isSupplierModalOpen && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md border border-slate-200 overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            
            <div className="bg-slate-900 text-white p-5 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Building size={18} className="text-amber-400" />
                <h3 className="text-sm font-bold">
                  {editingSupplier ? "Modifier le Fournisseur" : "Nouveau Fournisseur"}
                </h3>
              </div>
              <button
                onClick={() => setIsSupplierModalOpen(false)}
                className="w-8 h-8 rounded-xl bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveSupplier} className="p-6 space-y-4 text-xs">
              <div>
                <label className="block text-slate-700 font-bold mb-1">Raison Sociale / Nom <span className="text-rose-500">*</span></label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Laborex, Ubipharm, Cophapharm..."
                  value={supplierFormData.name}
                  onChange={(e) => setSupplierFormData({ ...supplierFormData, name: e.target.value })}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none focus:bg-white focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Catégorie</label>
                  <select
                    value={supplierFormData.category}
                    onChange={(e) => setSupplierFormData({ ...supplierFormData, category: e.target.value })}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none focus:bg-white focus:ring-2 focus:ring-amber-500"
                  >
                    <option value="Médicaments & Pharmacie">Médicaments & Pharmacie</option>
                    <option value="Réactifs & Laboratoire">Réactifs & Laboratoire</option>
                    <option value="Consommables Médicaux">Consommables Médicaux</option>
                    <option value="Équipements & Matériel">Équipements & Matériel</option>
                    <option value="Services & Maintenance">Services & Maintenance</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">NIF / RC (Optionnel)</label>
                  <input
                    type="text"
                    placeholder="Numéro Fiscal"
                    value={supplierFormData.taxId}
                    onChange={(e) => setSupplierFormData({ ...supplierFormData, taxId: e.target.value })}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none focus:bg-white focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Contact Commercial</label>
                  <input
                    type="text"
                    placeholder="Nom du responsable"
                    value={supplierFormData.contact}
                    onChange={(e) => setSupplierFormData({ ...supplierFormData, contact: e.target.value })}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none focus:bg-white focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">Téléphone</label>
                  <input
                    type="text"
                    placeholder="+221 ..."
                    value={supplierFormData.phone}
                    onChange={(e) => setSupplierFormData({ ...supplierFormData, phone: e.target.value })}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none focus:bg-white focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Email</label>
                <input
                  type="email"
                  placeholder="contact@fournisseur.com"
                  value={supplierFormData.email}
                  onChange={(e) => setSupplierFormData({ ...supplierFormData, email: e.target.value })}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none focus:bg-white focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Adresse / Dépôt</label>
                <input
                  type="text"
                  placeholder="Zone Industrielle, Dakar..."
                  value={supplierFormData.address}
                  onChange={(e) => setSupplierFormData({ ...supplierFormData, address: e.target.value })}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none focus:bg-white focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="pt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsSupplierModalOpen(false)}
                  className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-2xl transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isSavingSupplier}
                  className="flex-1 py-3 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-2xl transition-colors shadow-sm disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {isSavingSupplier ? <Loader2 size={14} className="animate-spin" /> : "Enregistrer"}
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

      {/* MODAL: PAY SUPPLIER INVOICE */}
      {selectedInvoiceForPayment && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md border border-slate-200 overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            
            <div className="bg-slate-900 text-white p-5 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <DollarSign size={20} className="text-amber-400" />
                <div>
                  <h3 className="text-sm font-bold">Règlement Facture Fournisseur</h3>
                  <p className="text-[10px] text-slate-400 font-mono">{selectedInvoiceForPayment.invoiceNumber}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedInvoiceForPayment(null)}
                className="w-8 h-8 rounded-xl bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleExecutePayment} className="p-6 space-y-4 text-xs">
              <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-2xl space-y-1">
                <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider block">Fournisseur</span>
                <p className="font-bold text-slate-900 text-sm">{selectedInvoiceForPayment.supplierName}</p>
                <div className="flex justify-between items-center pt-1 border-t border-amber-200/60 font-mono text-[11px]">
                  <span className="text-slate-500">Total facture : {Number(selectedInvoiceForPayment.totalAmount || 0).toLocaleString()} F</span>
                  <span className="font-bold text-amber-800">
                    Reste : {(Number(selectedInvoiceForPayment.totalAmount || 0) - Number(selectedInvoiceForPayment.amountPaid || 0)).toLocaleString()} F
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Montant à Régler ({currency}) <span className="text-rose-500">*</span></label>
                <input
                  type="number"
                  min="1"
                  max={Number(selectedInvoiceForPayment.totalAmount || 0) - Number(selectedInvoiceForPayment.amountPaid || 0)}
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl font-bold font-mono text-sm outline-none focus:bg-white focus:ring-2 focus:ring-amber-500"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Mode de Paiement</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as any)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none focus:bg-white focus:ring-2 focus:ring-amber-500 cursor-pointer"
                >
                  <option value="TRANSFER">Virement Bancaire</option>
                  <option value="CHECK">Chèque Bancaire</option>
                  <option value="CASH">Espèces physiques</option>
                  <option value="MOBILE_MONEY">Mobile Money</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Référence Transaction / Chèque (Optionnel)</label>
                <input
                  type="text"
                  placeholder="Ex: VIR-BNI-98421 ou CHQ-00129"
                  value={paymentRef}
                  onChange={(e) => setPaymentRef(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none focus:bg-white focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="pt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedInvoiceForPayment(null)}
                  className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-2xl transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isSavingPayment}
                  className="flex-1 py-3 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-2xl transition-colors shadow-sm disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {isSavingPayment ? <Loader2 size={14} className="animate-spin" /> : "Valider le Règlement"}
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

    </div>
  );
};
