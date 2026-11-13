import React, { useState, useEffect, useMemo } from 'react';
import { 
  X, 
  Save, 
  AlertCircle, 
  Stethoscope, 
  FolderTree, 
  Clock, 
  CreditCard, 
  Package, 
  Plus, 
  Trash2, 
  Beaker, 
  Search, 
  Pill, 
  Box, 
  ShieldCheck, 
  Check, 
  Layers,
  Wrench,
  CheckCircle2,
  Info
} from 'lucide-react';
import { db } from '../../src/firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import { getActiveTenantId, belongsToTenant } from '../../src/utils/tenant';

export interface AttachedItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  code?: string;
  stock?: number;
  category?: string;
  details?: string;
  price?: number;
}

interface AddMedicalActFormProps {
  onClose: () => void;
  onSave: (act: any) => void;
  initialData?: any;
  user?: any;
  establishment?: any;
}

const STANDARD_EQUIPMENTS = [
  'Bloc opératoire / Salle d\'intervention chirurgicale',
  'Échographe Doppler multimodal',
  'Moniteur multiparamétrique (Scope surveillance)',
  'Bistouri électrique monopolaire / bipolaire',
  'Table d\'accouchement obstétricale ergonomique',
  'Aspirateur chirurgical haute puissance',
  'Lampe scialytique chirurgicale LED',
  'Électrocardiographe (ECG 12 dérivations)',
  'Cardiotocographe (monitoring foetal)',
  'Défibrillateur semi-automatique (DSA)',
  'Nébuliseur hospitalier ultrasonique',
  'Appareil de radiologie mobile',
  'Chariot d\'urgence et réanimation équipé',
  'Pousse-seringue électrique (PSE)',
  'Table d\'examen gynécologique',
  'Stérilisateur / Autoclave hospitalier'
];

const AddMedicalActForm: React.FC<AddMedicalActFormProps> = ({ onClose, onSave, initialData, user, establishment }) => {
  const activeTenantId = React.useMemo(() => getActiveTenantId(user, establishment), [user, establishment]);
  const [activeTab, setActiveTab] = useState<'general' | 'classification' | 'execution' | 'facturation' | 'ressources' | 'laboratoire'>('general');

  // Initialize form data with initialData if editing
  const [formData, setFormData] = useState({
    nom: initialData?.name || initialData?.nom || '',
    codeInterne: initialData?.codeInterne || '',
    description: initialData?.description || '',
    type: initialData?.type || 'acte médical',

    // Classification
    servicePrincipal: initialData?.servicePrincipal || '',
    sousService: initialData?.sousService || '',
    categorie: initialData?.category || initialData?.categorie || '',
    priorite: initialData?.priorite || 'normal',

    // Exécution
    professionsAutorisees: (initialData?.professionsAutorisees || []) as string[],
    dureeEstimee: initialData?.dureeEstimee || '',
    necessiteRdv: initialData?.necessiteRdv || false,
    peutEtreUrgent: initialData?.peutEtreUrgent || false,
    genereHospitalisation: initialData?.genereHospitalisation || false,
    necessiteSurveillance: initialData?.necessiteSurveillance || false,
    necessiteConsentement: initialData?.necessiteConsentement || false,
    requiresPrescription: Boolean(initialData?.requiresPrescription || initialData?.soumisOrdonnance),
    soumisOrdonnance: Boolean(initialData?.requiresPrescription || initialData?.soumisOrdonnance),

    // Facturation
    prixBase: initialData?.price?.toString() || initialData?.prixBase?.toString() || '',
    modeTarification: initialData?.modeTarification || 'fixe',
    factureA: initialData?.factureA || 'accueil',
    remboursable: initialData?.remboursable || false,
    partageRevenu: initialData?.partageRevenu || false,
    pourcentageMedecin: initialData?.pourcentageMedecin || '',
    pourcentageStructure: initialData?.pourcentageStructure || '',

    // Attached structured items & compatibility arrays
    medicamentsUtilises: (initialData?.medicamentsUtilises || []) as string[],
    consommables: (initialData?.consommables || []) as string[],
    equipements: (initialData?.equipements || []) as string[],
    attachedMeds: (initialData?.attachedMeds || []) as AttachedItem[],
    attachedConsumables: (initialData?.attachedConsumables || []) as AttachedItem[],
    attachedEquipments: (initialData?.attachedEquipments || []) as AttachedItem[],

    // Laboratoire
    isSensitive: initialData?.isSensitive || false,
    labParameters: (initialData?.labParameters || []) as { nom: string; unite: string; valeurReferenceMin?: number; valeurReferenceMax?: number; valeurReferenceTexte?: string }[]
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  // --- Real-time Inventory Sources ---
  const [inventoryMeds, setInventoryMeds] = useState<any[]>([]);
  const [inventoryConsumables, setInventoryConsumables] = useState<any[]>([]);
  const [loadingInventory, setLoadingInventory] = useState(true);

  // Selector states for Médicaments
  const [medSearch, setMedSearch] = useState('');
  const [selectedMedId, setSelectedMedId] = useState('');
  const [selectedMedQty, setSelectedMedQty] = useState(1);
  const [selectedMedUnit, setSelectedMedUnit] = useState('ampoule');

  // Selector states for Consommables
  const [consSearch, setConsSearch] = useState('');
  const [selectedConsId, setSelectedConsId] = useState('');
  const [selectedConsQty, setSelectedConsQty] = useState(1);
  const [selectedConsUnit, setSelectedConsUnit] = useState('unité');

  // Selector states for Equipements
  const [selectedEquipName, setSelectedEquipName] = useState('');
  const [selectedEquipQty, setSelectedEquipQty] = useState(1);

  useEffect(() => {
    // 1. Subscribe to pharmacy_inventory
    const unsubMeds = onSnapshot(collection(db, 'pharmacy_inventory'), (snap) => {
      const allMeds = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setInventoryMeds(allMeds.filter(m => belongsToTenant(m, activeTenantId)));
      setLoadingInventory(false);
    }, (err) => {
      console.warn("Error fetching pharmacy_inventory in AddMedicalActForm:", err);
      setLoadingInventory(false);
    });

    // 2. Subscribe to hospital_consumables
    const unsubCons = onSnapshot(collection(db, 'hospital_consumables'), (snap) => {
      const allCons = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setInventoryConsumables(allCons.filter(c => belongsToTenant(c, activeTenantId)));
    }, (err) => {
      console.warn("Error fetching hospital_consumables in AddMedicalActForm:", err);
    });

    return () => {
      unsubMeds();
      unsubCons();
    };
  }, [activeTenantId]);

  // Filtered dropdown lists
  const filteredMeds = useMemo(() => {
    const q = medSearch.toLowerCase().trim();
    if (!q) return inventoryMeds.slice(0, 30);
    return inventoryMeds.filter(m => 
      (m.name || m.nom || '').toLowerCase().includes(q) ||
      (m.dci || '').toLowerCase().includes(q) ||
      (m.codeInterne || m.code || '').toLowerCase().includes(q) ||
      (m.dosage || '').toLowerCase().includes(q) ||
      (m.formeGalenique || '').toLowerCase().includes(q)
    ).slice(0, 30);
  }, [inventoryMeds, medSearch]);

  const filteredConsumables = useMemo(() => {
    const q = consSearch.toLowerCase().trim();
    if (!q) return inventoryConsumables.slice(0, 30);
    return inventoryConsumables.filter(c => 
      (c.nom || c.name || '').toLowerCase().includes(q) ||
      (c.codeInterne || c.code || '').toLowerCase().includes(q) ||
      (c.categorie || '').toLowerCase().includes(q) ||
      (c.sousCategorie || '').toLowerCase().includes(q)
    ).slice(0, 30);
  }, [inventoryConsumables, consSearch]);

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  const toggleMultiSelect = (field: string, value: string) => {
    setFormData(prev => {
      const current = prev[field as keyof typeof prev] as string[];
      if (current.includes(value)) {
        return { ...prev, [field]: current.filter(v => v !== value) };
      } else {
        return { ...prev, [field]: [...current, value] };
      }
    });
  };

  // --- Add/Remove Attached Medications ---
  const handleAddMedication = () => {
    if (!selectedMedId) return;
    const med = inventoryMeds.find(m => m.id === selectedMedId);
    if (!med) return;

    const existingIndex = formData.attachedMeds.findIndex(m => m.id === med.id);
    let nextMeds: AttachedItem[];
    if (existingIndex >= 0) {
      nextMeds = formData.attachedMeds.map((m, idx) => 
        idx === existingIndex ? { ...m, quantity: m.quantity + selectedMedQty } : m
      );
    } else {
      nextMeds = [
        ...formData.attachedMeds,
        {
          id: med.id,
          name: med.name || med.nom || 'Médicament',
          details: `${med.dosage || ''} ${med.formeGalenique || ''}`.trim(),
          code: med.codeInterne || med.code || '',
          stock: med.stock ?? med.stockActuel ?? 0,
          quantity: selectedMedQty,
          unit: selectedMedUnit,
          price: med.price || 0
        }
      ];
    }

    setFormData(prev => ({
      ...prev,
      attachedMeds: nextMeds,
      medicamentsUtilises: nextMeds.map(m => `${m.name} ${m.details || ''} (x${m.quantity} ${m.unit})`.trim())
    }));
    setSelectedMedId('');
    setSelectedMedQty(1);
    setMedSearch('');
  };

  const handleRemoveMedication = (id: string) => {
    const nextMeds = formData.attachedMeds.filter(m => m.id !== id);
    setFormData(prev => ({
      ...prev,
      attachedMeds: nextMeds,
      medicamentsUtilises: nextMeds.map(m => `${m.name} ${m.details || ''} (x${m.quantity} ${m.unit})`.trim())
    }));
  };

  const handleUpdateMedQty = (id: string, delta: number) => {
    const nextMeds = formData.attachedMeds.map(m => {
      if (m.id === id) {
        const newQty = Math.max(1, m.quantity + delta);
        return { ...m, quantity: newQty };
      }
      return m;
    });
    setFormData(prev => ({
      ...prev,
      attachedMeds: nextMeds,
      medicamentsUtilises: nextMeds.map(m => `${m.name} ${m.details || ''} (x${m.quantity} ${m.unit})`.trim())
    }));
  };

  // --- Add/Remove Attached Consumables ---
  const handleAddConsumable = () => {
    if (!selectedConsId) return;
    const cons = inventoryConsumables.find(c => c.id === selectedConsId);
    if (!cons) return;

    const existingIndex = formData.attachedConsumables.findIndex(c => c.id === cons.id);
    let nextCons: AttachedItem[];
    const unit = selectedConsUnit || cons.uniteGestion || 'unité';
    if (existingIndex >= 0) {
      nextCons = formData.attachedConsumables.map((c, idx) => 
        idx === existingIndex ? { ...c, quantity: c.quantity + selectedConsQty } : c
      );
    } else {
      nextCons = [
        ...formData.attachedConsumables,
        {
          id: cons.id,
          name: cons.nom || cons.name || 'Consommable',
          category: cons.categorie || '',
          code: cons.codeInterne || '',
          stock: cons.stockInitial ?? cons.stockActuel ?? 0,
          quantity: selectedConsQty,
          unit: unit,
          price: cons.prixVente || 0
        }
      ];
    }

    setFormData(prev => ({
      ...prev,
      attachedConsumables: nextCons,
      consommables: nextCons.map(c => `${c.name} (x${c.quantity} ${c.unit})`.trim())
    }));
    setSelectedConsId('');
    setSelectedConsQty(1);
    setConsSearch('');
  };

  const handleRemoveConsumable = (id: string) => {
    const nextCons = formData.attachedConsumables.filter(c => c.id !== id);
    setFormData(prev => ({
      ...prev,
      attachedConsumables: nextCons,
      consommables: nextCons.map(c => `${c.name} (x${c.quantity} ${c.unit})`.trim())
    }));
  };

  const handleUpdateConsQty = (id: string, delta: number) => {
    const nextCons = formData.attachedConsumables.map(c => {
      if (c.id === id) {
        const newQty = Math.max(1, c.quantity + delta);
        return { ...c, quantity: newQty };
      }
      return c;
    });
    setFormData(prev => ({
      ...prev,
      attachedConsumables: nextCons,
      consommables: nextCons.map(c => `${c.name} (x${c.quantity} ${c.unit})`.trim())
    }));
  };

  // --- Add/Remove Attached Equipments ---
  const handleAddEquipment = () => {
    if (!selectedEquipName) return;
    const existingIndex = formData.attachedEquipments.findIndex(e => e.name === selectedEquipName);
    let nextEquip: AttachedItem[];
    if (existingIndex >= 0) {
      nextEquip = formData.attachedEquipments.map((e, idx) => 
        idx === existingIndex ? { ...e, quantity: e.quantity + selectedEquipQty } : e
      );
    } else {
      nextEquip = [
        ...formData.attachedEquipments,
        {
          id: `EQ-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          name: selectedEquipName,
          quantity: selectedEquipQty,
          unit: 'appareil'
        }
      ];
    }

    setFormData(prev => ({
      ...prev,
      attachedEquipments: nextEquip,
      equipements: nextEquip.map(e => `${e.name} (x${e.quantity})`.trim())
    }));
    setSelectedEquipName('');
    setSelectedEquipQty(1);
  };

  const handleRemoveEquipment = (name: string) => {
    const nextEquip = formData.attachedEquipments.filter(e => e.name !== name);
    setFormData(prev => ({
      ...prev,
      attachedEquipments: nextEquip,
      equipements: nextEquip.map(e => `${e.name} (x${e.quantity})`.trim())
    }));
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.nom) newErrors.nom = 'Le nom de l\'acte est obligatoire';
    if (!formData.servicePrincipal) newErrors.servicePrincipal = 'Le service principal est obligatoire';
    if (formData.professionsAutorisees.length === 0) newErrors.professionsAutorisees = 'Au moins une profession doit être autorisée';
    if (!formData.prixBase && formData.prixBase !== '0') newErrors.prixBase = 'Le tarif de base est obligatoire';

    if (formData.partageRevenu) {
      const med = parseFloat(formData.pourcentageMedecin) || 0;
      const struct = parseFloat(formData.pourcentageStructure) || 0;
      if (med + struct !== 100) {
        newErrors.partageRevenu = 'La somme des pourcentages doit être égale à 100%';
      }
    }

    if (formData.servicePrincipal === 'laboratoire' || formData.type === 'examen') {
      if (formData.labParameters.length === 0) {
        newErrors.labParameters = 'Au moins un paramètre de laboratoire est requis';
      } else {
        for (const p of formData.labParameters) {
          if (!p.nom) {
            newErrors.labParameters = 'Tous les paramètres doivent avoir un nom';
            break;
          }
        }
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validateForm()) {
      onSave(formData);
    } else {
      if (errors.nom) setActiveTab('general');
      else if (errors.servicePrincipal) setActiveTab('classification');
      else if (errors.professionsAutorisees) setActiveTab('execution');
      else if (errors.prixBase || errors.partageRevenu) setActiveTab('facturation');
      else if (errors.labParameters) setActiveTab('laboratoire');
    }
  };

  const tabs = [
    { id: 'general', label: 'Général', icon: Stethoscope },
    { id: 'classification', label: 'Classification', icon: FolderTree },
    { id: 'execution', label: 'Exécution', icon: Clock },
    { id: 'facturation', label: 'Facturation', icon: CreditCard },
    { id: 'ressources', label: 'Ressources & Stocks', icon: Package },
    ...(formData.servicePrincipal === 'laboratoire' || formData.type === 'examen' ? [{ id: 'laboratoire', label: 'Laboratoire', icon: Beaker }] : [])
  ] as const;

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex items-center justify-between shrink-0 bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center">
              <Stethoscope size={20} />
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-900">
                {initialData ? 'Modifier la prestation médicale' : 'Ajouter un acte ou prestation'}
              </h2>
              <p className="text-sm text-slate-500 font-medium">
                {initialData ? `Configuration de "${initialData.name || initialData.nom}"` : 'Référentiel centralisé des actes & synchronisation stock'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:bg-slate-200 hover:text-slate-600 rounded-xl transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-100 bg-white px-6 shrink-0 overflow-x-auto hide-scrollbar">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const hasError = (tab.id === 'general' && errors.nom) ||
                             (tab.id === 'classification' && errors.servicePrincipal) ||
                             (tab.id === 'execution' && errors.professionsAutorisees) ||
                             (tab.id === 'facturation' && (errors.prixBase || errors.partageRevenu)) ||
                             (tab.id === 'laboratoire' && errors.labParameters);

            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as any)}
                className={`py-4 px-4 flex items-center gap-2 font-bold text-sm border-b-2 transition-all whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-slate-400 hover:text-slate-600'
                } ${hasError ? 'text-rose-500' : ''}`}
              >
                <Icon size={16} />
                {tab.label}
                {tab.id === 'ressources' && (formData.attachedMeds.length + formData.attachedConsumables.length > 0) && (
                  <span className="ml-1 px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-black">
                    {formData.attachedMeds.length + formData.attachedConsumables.length}
                  </span>
                )}
                {hasError && <span className="w-2 h-2 rounded-full bg-rose-500" />}
              </button>
            );
          })}
        </div>

        {/* Form Body */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50">
          <form id="medical-act-form" onSubmit={handleSubmit} className="max-w-4xl mx-auto">
            
            {/* ONGLET 1 - GÉNÉRAL */}
            {activeTab === 'general' && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-2">
                      Nom de l'acte / Prestation <span className="text-rose-500">*</span>
                    </label>
                    <input 
                      type="text" 
                      value={formData.nom}
                      onChange={(e) => handleInputChange('nom', e.target.value)}
                      className={`w-full p-3 bg-slate-50 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-medium ${errors.nom ? 'border-rose-300 bg-rose-50' : 'border-slate-200'}`}
                      placeholder="Ex: Consultation Médecine Générale, Césarienne, Pansement simple..."
                    />
                    {errors.nom && <p className="text-xs text-rose-500 mt-1 font-medium">{errors.nom}</p>}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase mb-2">Code Interne / Raccourci</label>
                      <input 
                        type="text" 
                        value={formData.codeInterne}
                        onChange={(e) => handleInputChange('codeInterne', e.target.value)}
                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                        placeholder="Ex: C-GEN-01"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase mb-2">Type d'élément</label>
                      <select 
                        value={formData.type}
                        onChange={(e) => handleInputChange('type', e.target.value)}
                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                      >
                        <option value="acte médical">Acte médical</option>
                        <option value="chirurgie">Chirurgie</option>
                        <option value="examen">Examen / Analyse</option>
                        <option value="soin infirmier">Soin infirmier</option>
                        <option value="forfait">Forfait / Package</option>
                        <option value="sejour">Séjour / Hébergement</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-2">Description clinique</label>
                    <textarea 
                      value={formData.description}
                      onChange={(e) => handleInputChange('description', e.target.value)}
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none min-h-[100px]"
                      placeholder="Description détaillée de la prestation, indications et contre-indications..."
                    />
                  </div>

                  {/* Conformité Médicale : Soumis à ordonnance */}
                  <label className={`flex items-start gap-3 p-4 rounded-2xl border-2 cursor-pointer transition-all ${
                    formData.requiresPrescription
                      ? 'bg-rose-50/70 border-rose-300'
                      : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                  }`}>
                    <input
                      type="checkbox"
                      checked={Boolean(formData.requiresPrescription)}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setFormData(prev => ({
                          ...prev,
                          requiresPrescription: checked,
                          soumisOrdonnance: checked
                        }));
                      }}
                      className="mt-0.5 w-4 h-4 rounded border-slate-300 text-rose-600 focus:ring-rose-500 cursor-pointer"
                    />
                    <div>
                      <span className="text-xs font-black uppercase tracking-wider text-slate-900 block">
                        Soumis à ordonnance (Prescription médicale obligatoire)
                      </span>
                      <span className="text-[11px] font-medium text-slate-500 block mt-0.5">
                        Oblige l'Accueil à saisir le Nom du Prescripteur ou Numéro d'Ordre avant d'orienter le patient vers cet acte / soin.
                      </span>
                    </div>
                  </label>
                </div>
              </div>
            )}

            {/* ONGLET 2 - CLASSIFICATION */}
            {activeTab === 'classification' && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase mb-2">
                        Service Principal <span className="text-rose-500">*</span>
                      </label>
                      <select 
                        value={formData.servicePrincipal}
                        onChange={(e) => handleInputChange('servicePrincipal', e.target.value)}
                        className={`w-full p-3 bg-slate-50 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none ${errors.servicePrincipal ? 'border-rose-300 bg-rose-50' : 'border-slate-200'}`}
                      >
                        <option value="">Sélectionner un service</option>
                        <option value="consultation">Consultation Externe</option>
                        <option value="urgences">Urgences</option>
                        <option value="hospitalisation">Hospitalisation</option>
                        <option value="maternite">Maternité / Gynéco-Obstétrique</option>
                        <option value="bloc">Bloc Opératoire</option>
                        <option value="soins_infirmiers">Soins Infirmiers</option>
                        <option value="laboratoire">Laboratoire</option>
                        <option value="imagerie">Imagerie Médicale</option>
                        <option value="pharmacie">Pharmacie</option>
                      </select>
                      {errors.servicePrincipal && <p className="text-xs text-rose-500 mt-1 font-medium">{errors.servicePrincipal}</p>}
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase mb-2">Sous-service / Spécialité</label>
                      <input 
                        type="text" 
                        value={formData.sousService}
                        onChange={(e) => handleInputChange('sousService', e.target.value)}
                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                        placeholder="Ex: Pédiatrie, Cardiologie, CPN..."
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase mb-2">Catégorie</label>
                      <select 
                        value={formData.categorie}
                        onChange={(e) => handleInputChange('categorie', e.target.value)}
                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                      >
                        <option value="">Sélectionner une catégorie</option>
                        <option value="consultation">Consultation</option>
                        <option value="chirurgie">Chirurgie</option>
                        <option value="accouchement">Accouchement</option>
                        <option value="analyse">Analyse biologique</option>
                        <option value="imagerie">Imagerie</option>
                        <option value="pansement">Pansement / Injection</option>
                        <option value="perfusion">Perfusion</option>
                        <option value="sejour">Séjour / Nuitée</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase mb-2">Niveau de Priorité par Défaut</label>
                      <select 
                        value={formData.priorite}
                        onChange={(e) => handleInputChange('priorite', e.target.value)}
                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                      >
                        <option value="normal">Normal</option>
                        <option value="urgent">Urgent</option>
                        <option value="critique">Critique</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ONGLET 3 - EXÉCUTION */}
            {activeTab === 'execution' && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-3">
                      Professions Autorisées à exécuter cet acte <span className="text-rose-500">*</span>
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {[
                        { id: 'Médecin', label: 'Médecin' },
                        { id: 'Infirmier', label: 'Infirmier(ère)' },
                        { id: 'Sage-femme', label: 'Sage-femme' },
                        { id: 'Chirurgien', label: 'Chirurgien' },
                        { id: 'Biologiste', label: 'Biologiste' },
                        { id: 'Technicien Labo', label: 'Technicien Labo' },
                        { id: 'Radiologue', label: 'Radiologue' },
                        { id: 'Aide-soignant', label: 'Aide-soignant' }
                      ].map((prof) => (
                        <button
                          key={prof.id}
                          type="button"
                          onClick={() => toggleMultiSelect('professionsAutorisees', prof.id)}
                          className={`p-3 rounded-xl border text-xs font-bold flex items-center justify-between transition-all ${
                            formData.professionsAutorisees.includes(prof.id)
                              ? 'bg-blue-50 border-blue-500 text-blue-700'
                              : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                          }`}
                        >
                          <span>{prof.label}</span>
                          {formData.professionsAutorisees.includes(prof.id) && <Check size={14} />}
                        </button>
                      ))}
                    </div>
                    {errors.professionsAutorisees && <p className="text-xs text-rose-500 mt-2 font-medium">{errors.professionsAutorisees}</p>}
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-2">Durée estimée (minutes)</label>
                    <input 
                      type="number" 
                      value={formData.dureeEstimee}
                      onChange={(e) => handleInputChange('dureeEstimee', e.target.value)}
                      className="w-full md:w-1/2 p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                      placeholder="Ex: 30"
                    />
                  </div>

                  <div className="border-t border-slate-100 pt-6 space-y-4">
                    {[
                      { key: 'necessiteRdv', label: 'Nécessite une prise de rendez-vous préalable' },
                      { key: 'peutEtreUrgent', label: 'Peut être requalifié en acte urgent' },
                      { key: 'genereHospitalisation', label: 'Déclenche automatiquement une admission en hospitalisation' },
                      { key: 'necessiteSurveillance', label: 'Exige une surveillance post-acte (salle de réveil / observation)' },
                      { key: 'necessiteConsentement', label: 'Exige la signature d\'un consentement éclairé écrit' }
                    ].map((item) => (
                      <label key={item.key} className="flex items-center gap-3 cursor-pointer">
                        <input 
                          type="checkbox" 
                          checked={formData[item.key as keyof typeof formData] as boolean}
                          onChange={(e) => handleInputChange(item.key, e.target.checked)}
                          className="w-5 h-5 rounded text-blue-600 focus:ring-blue-500 border-slate-300"
                        />
                        <span className="text-sm font-medium text-slate-700">{item.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ONGLET 4 - FACTURATION */}
            {activeTab === 'facturation' && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase mb-2">
                        Tarif de base (FCFA) <span className="text-rose-500">*</span>
                      </label>
                      <input 
                        type="number" 
                        value={formData.prixBase}
                        onChange={(e) => handleInputChange('prixBase', e.target.value)}
                        className={`w-full p-3 bg-slate-50 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold text-lg text-blue-600 ${errors.prixBase ? 'border-rose-300 bg-rose-50' : 'border-slate-200'}`}
                        placeholder="Ex: 10000"
                      />
                      {errors.prixBase && <p className="text-xs text-rose-500 mt-1 font-medium">{errors.prixBase}</p>}
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase mb-2">Mode de tarification</label>
                      <select 
                        value={formData.modeTarification}
                        onChange={(e) => handleInputChange('modeTarification', e.target.value)}
                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                      >
                        <option value="fixe">Montant fixe</option>
                        <option value="forfait">Forfaitaire global</option>
                        <option value="horaire">Taux horaire</option>
                        <option value="devis">Sur devis</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase mb-2">Point d'encaissement</label>
                      <select 
                        value={formData.factureA}
                        onChange={(e) => handleInputChange('factureA', e.target.value)}
                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                      >
                        <option value="accueil">Caisse Accueil / Admission</option>
                        <option value="service">Caisse Service dédiée</option>
                        <option value="sortie">Facturation différée à la sortie</option>
                      </select>
                    </div>
                  </div>

                  <div className="border-t border-slate-100 pt-6 space-y-4">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={formData.remboursable}
                        onChange={(e) => handleInputChange('remboursable', e.target.checked)}
                        className="w-5 h-5 rounded text-blue-600 focus:ring-blue-500 border-slate-300"
                      />
                      <span className="text-sm font-medium text-slate-700">Prise en charge par assurances / mutuelles (remboursable)</span>
                    </label>

                    <label className="flex items-center gap-3 cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={formData.partageRevenu}
                        onChange={(e) => handleInputChange('partageRevenu', e.target.checked)}
                        className="w-5 h-5 rounded text-blue-600 focus:ring-blue-500 border-slate-300"
                      />
                      <span className="text-sm font-medium text-slate-700">Partage d'honoraires médecin / clinique</span>
                    </label>
                  </div>

                  {formData.partageRevenu && (
                    <div className="grid grid-cols-2 gap-4 bg-blue-50/50 p-4 rounded-xl border border-blue-100">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 uppercase mb-2">Part Praticien (%)</label>
                        <input 
                          type="number" 
                          value={formData.pourcentageMedecin}
                          onChange={(e) => handleInputChange('pourcentageMedecin', e.target.value)}
                          className="w-full p-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                          placeholder="Ex: 60"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 uppercase mb-2">Part Structure (%)</label>
                        <input 
                          type="number" 
                          value={formData.pourcentageStructure}
                          onChange={(e) => handleInputChange('pourcentageStructure', e.target.value)}
                          className="w-full p-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                          placeholder="Ex: 40"
                        />
                      </div>
                      {errors.partageRevenu && <p className="text-xs text-rose-500 col-span-2 font-medium">{errors.partageRevenu}</p>}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ONGLET 5 - RESSOURCES (DROPDOWNS SYNCHRONISÉS AVEC PHARMACIE / STOCK) */}
            {activeTab === 'ressources' && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
                
                {/* Security and Integrity Banner */}
                <div className="bg-blue-50/80 border border-blue-200 rounded-2xl p-4 flex items-start gap-3">
                  <div className="p-2 bg-blue-100 text-blue-700 rounded-xl shrink-0 mt-0.5">
                    <ShieldCheck size={20} />
                  </div>
                  <div>
                    <h4 className="text-xs font-black uppercase text-blue-950 tracking-wider">
                      Liaison Directe avec les Stocks Pharmacie & Consommables
                    </h4>
                    <p className="text-xs text-blue-800 font-medium mt-1 leading-relaxed">
                      La saisie libre est verrouillée pour garantir la traçabilité des stocks. Les médicaments et consommables attachés à cette prestation doivent obligatoirement provenir du référentiel enregistré en base.
                    </p>
                  </div>
                </div>

                {/* 1. SECTION MÉDICAMENTS UTILISÉS (PHARMACIE_INVENTORY) */}
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 bg-purple-100 text-purple-700 rounded-xl">
                        <Pill size={18} />
                      </div>
                      <div>
                        <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">
                          Médicaments Associés ({formData.attachedMeds.length})
                        </h3>
                        <p className="text-xs text-slate-400 font-medium">
                          Table: <span className="font-mono text-purple-600 font-bold">pharmacy_inventory</span>
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Dropdown Selector */}
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
                    <div className="flex flex-col sm:flex-row gap-3">
                      {/* Search & Select */}
                      <div className="flex-1 space-y-1.5">
                        <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider">
                          Sélectionner un Médicament Référencé
                        </label>
                        <div className="relative">
                          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                          <input 
                            type="text"
                            placeholder="Rechercher par nom, dosage, DCI..."
                            value={medSearch}
                            onChange={(e) => setMedSearch(e.target.value)}
                            className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs outline-none focus:border-blue-500"
                          />
                        </div>
                        <select
                          value={selectedMedId}
                          onChange={(e) => {
                            setSelectedMedId(e.target.value);
                            const m = inventoryMeds.find(x => x.id === e.target.value);
                            if (m?.units || m?.formeGalenique) {
                              setSelectedMedUnit(m.units || m.formeGalenique || 'unité');
                            }
                          }}
                          className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="">-- Choisir un médicament enregistré --</option>
                          {filteredMeds.map((med) => {
                            const stock = med.stock ?? med.stockActuel ?? 0;
                            return (
                              <option key={med.id} value={med.id}>
                                {med.name || med.nom} {med.dosage ? `(${med.dosage})` : ''} — Stock: {stock} {med.units || 'unités'}
                              </option>
                            );
                          })}
                        </select>
                      </div>

                      {/* Quantity */}
                      <div className="w-24 space-y-1.5 shrink-0">
                        <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider">
                          Quantité
                        </label>
                        <input 
                          type="number"
                          min="1"
                          value={selectedMedQty}
                          onChange={(e) => setSelectedMedQty(Math.max(1, parseInt(e.target.value) || 1))}
                          className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-extrabold text-center text-slate-800 outline-none focus:border-blue-500"
                        />
                      </div>

                      {/* Unit */}
                      <div className="w-32 space-y-1.5 shrink-0">
                        <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider">
                          Unité
                        </label>
                        <select
                          value={selectedMedUnit}
                          onChange={(e) => setSelectedMedUnit(e.target.value)}
                          className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:border-blue-500"
                        >
                          <option value="ampoule">Ampoule(s)</option>
                          <option value="comprimé">Comprimé(s)</option>
                          <option value="flacon">Flacon(s)</option>
                          <option value="gélule">Gélule(s)</option>
                          <option value="sachet">Sachet(s)</option>
                          <option value="ml">ml</option>
                          <option value="dose">Dose(s)</option>
                          <option value="unité">Unité(s)</option>
                        </select>
                      </div>

                      {/* Add Button */}
                      <div className="flex items-end shrink-0">
                        <button
                          type="button"
                          onClick={handleAddMedication}
                          disabled={!selectedMedId}
                          className="w-full sm:w-auto px-4 py-2.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-40 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all shadow-md shadow-purple-600/10"
                        >
                          <Plus size={16} /> Attacher
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Attached Medications List */}
                  {formData.attachedMeds.length === 0 ? (
                    <div className="text-center py-6 bg-slate-50 rounded-xl border border-dashed border-slate-200 text-slate-400 text-xs font-medium">
                      Aucun médicament de la pharmacie associé pour le moment.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {formData.attachedMeds.map((med) => (
                        <div 
                          key={med.id}
                          className="flex items-center justify-between p-3 bg-purple-50/50 border border-purple-200/80 rounded-xl"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center font-bold">
                              <Pill size={16} />
                            </div>
                            <div>
                              <p className="font-extrabold text-xs text-slate-900">{med.name}</p>
                              <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-500 font-medium">
                                {med.details && <span>{med.details}</span>}
                                {med.code && <span className="font-mono bg-purple-100/70 text-purple-800 px-1.5 rounded">{med.code}</span>}
                                <span className={`font-bold ${med.stock && med.stock > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                  En stock: {med.stock ?? 0}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-3">
                            {/* Stepper */}
                            <div className="flex items-center border border-slate-200 bg-white rounded-lg overflow-hidden">
                              <button
                                type="button"
                                onClick={() => handleUpdateMedQty(med.id, -1)}
                                className="px-2.5 py-1 text-slate-600 hover:bg-slate-100 font-black text-xs"
                              >
                                -
                              </button>
                              <span className="px-2.5 py-1 text-xs font-black text-slate-900">
                                {med.quantity} {med.unit}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleUpdateMedQty(med.id, 1)}
                                className="px-2.5 py-1 text-slate-600 hover:bg-slate-100 font-black text-xs"
                              >
                                +
                              </button>
                            </div>

                            <button
                              type="button"
                              onClick={() => handleRemoveMedication(med.id)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                              title="Détacher le produit"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 2. SECTION CONSOMMABLES MÉDICAUX (HOSPITAL_CONSUMABLES) */}
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 bg-emerald-100 text-emerald-700 rounded-xl">
                        <Box size={18} />
                      </div>
                      <div>
                        <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">
                          Consommables Associés ({formData.attachedConsumables.length})
                        </h3>
                        <p className="text-xs text-slate-400 font-medium">
                          Table: <span className="font-mono text-emerald-600 font-bold">hospital_consumables</span>
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Dropdown Selector */}
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
                    <div className="flex flex-col sm:flex-row gap-3">
                      {/* Search & Select */}
                      <div className="flex-1 space-y-1.5">
                        <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider">
                          Sélectionner un Consommable Référencé
                        </label>
                        <div className="relative">
                          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                          <input 
                            type="text"
                            placeholder="Rechercher par nom, catégorie, code..."
                            value={consSearch}
                            onChange={(e) => setConsSearch(e.target.value)}
                            className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs outline-none focus:border-blue-500"
                          />
                        </div>
                        <select
                          value={selectedConsId}
                          onChange={(e) => {
                            setSelectedConsId(e.target.value);
                            const c = inventoryConsumables.find(x => x.id === e.target.value);
                            if (c?.uniteGestion) {
                              setSelectedConsUnit(c.uniteGestion);
                            }
                          }}
                          className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500"
                        >
                          <option value="">-- Choisir un consommable enregistré --</option>
                          {filteredConsumables.map((cons) => {
                            const stock = cons.stockInitial ?? cons.stockActuel ?? 0;
                            return (
                              <option key={cons.id} value={cons.id}>
                                {cons.nom || cons.name} ({cons.categorie || 'médical'}) — Stock: {stock} {cons.uniteGestion || 'unités'}
                              </option>
                            );
                          })}
                        </select>
                      </div>

                      {/* Quantity */}
                      <div className="w-24 space-y-1.5 shrink-0">
                        <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider">
                          Quantité
                        </label>
                        <input 
                          type="number"
                          min="1"
                          value={selectedConsQty}
                          onChange={(e) => setSelectedConsQty(Math.max(1, parseInt(e.target.value) || 1))}
                          className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-extrabold text-center text-slate-800 outline-none focus:border-blue-500"
                        />
                      </div>

                      {/* Unit */}
                      <div className="w-32 space-y-1.5 shrink-0">
                        <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider">
                          Unité
                        </label>
                        <select
                          value={selectedConsUnit}
                          onChange={(e) => setSelectedConsUnit(e.target.value)}
                          className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:border-blue-500"
                        >
                          <option value="unité">Unité(s)</option>
                          <option value="paire">Paire(s)</option>
                          <option value="boîte">Boîte(s)</option>
                          <option value="rouleau">Rouleau(x)</option>
                          <option value="flacon">Flacon(s)</option>
                          <option value="tube">Tube(s)</option>
                          <option value="kit">Kit</option>
                        </select>
                      </div>

                      {/* Add Button */}
                      <div className="flex items-end shrink-0">
                        <button
                          type="button"
                          onClick={handleAddConsumable}
                          disabled={!selectedConsId}
                          className="w-full sm:w-auto px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all shadow-md shadow-emerald-600/10"
                        >
                          <Plus size={16} /> Attacher
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Attached Consumables List */}
                  {formData.attachedConsumables.length === 0 ? (
                    <div className="text-center py-6 bg-slate-50 rounded-xl border border-dashed border-slate-200 text-slate-400 text-xs font-medium">
                      Aucun consommable du stock associé pour le moment.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {formData.attachedConsumables.map((cons) => (
                        <div 
                          key={cons.id}
                          className="flex items-center justify-between p-3 bg-emerald-50/50 border border-emerald-200/80 rounded-xl"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                              <Box size={16} />
                            </div>
                            <div>
                              <p className="font-extrabold text-xs text-slate-900">{cons.name}</p>
                              <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-500 font-medium">
                                {cons.category && <span className="capitalize">{cons.category}</span>}
                                {cons.code && <span className="font-mono bg-emerald-100/70 text-emerald-800 px-1.5 rounded">{cons.code}</span>}
                                <span className={`font-bold ${cons.stock && cons.stock > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                  En stock: {cons.stock ?? 0}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-3">
                            {/* Stepper */}
                            <div className="flex items-center border border-slate-200 bg-white rounded-lg overflow-hidden">
                              <button
                                type="button"
                                onClick={() => handleUpdateConsQty(cons.id, -1)}
                                className="px-2.5 py-1 text-slate-600 hover:bg-slate-100 font-black text-xs"
                              >
                                -
                              </button>
                              <span className="px-2.5 py-1 text-xs font-black text-slate-900">
                                {cons.quantity} {cons.unit}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleUpdateConsQty(cons.id, 1)}
                                className="px-2.5 py-1 text-slate-600 hover:bg-slate-100 font-black text-xs"
                              >
                                +
                              </button>
                            </div>

                            <button
                              type="button"
                              onClick={() => handleRemoveConsumable(cons.id)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                              title="Détacher le produit"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 3. SECTION ÉQUIPEMENTS & PLATEAU TECHNIQUE */}
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 bg-blue-100 text-blue-700 rounded-xl">
                        <Wrench size={18} />
                      </div>
                      <div>
                        <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">
                          Plateau Technique & Équipements Requis ({formData.attachedEquipments.length})
                        </h3>
                        <p className="text-xs text-slate-400 font-medium">
                          Ressources matérielles nécessaires à la réalisation de l'acte
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 flex flex-col sm:flex-row gap-3">
                    <div className="flex-1 space-y-1.5">
                      <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider">
                        Sélectionner l'Équipement Hospitalier
                      </label>
                      <select
                        value={selectedEquipName}
                        onChange={(e) => setSelectedEquipName(e.target.value)}
                        className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">-- Choisir un équipement standard --</option>
                        {STANDARD_EQUIPMENTS.map((eq) => (
                          <option key={eq} value={eq}>{eq}</option>
                        ))}
                      </select>
                    </div>

                    <div className="w-24 space-y-1.5 shrink-0">
                      <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider">
                        Nombre
                      </label>
                      <input 
                        type="number"
                        min="1"
                        value={selectedEquipQty}
                        onChange={(e) => setSelectedEquipQty(Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-extrabold text-center text-slate-800 outline-none focus:border-blue-500"
                      />
                    </div>

                    <div className="flex items-end shrink-0">
                      <button
                        type="button"
                        onClick={handleAddEquipment}
                        disabled={!selectedEquipName}
                        className="w-full sm:w-auto px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all shadow-md shadow-blue-600/10"
                      >
                        <Plus size={16} /> Attacher
                      </button>
                    </div>
                  </div>

                  {formData.attachedEquipments.length === 0 ? (
                    <div className="text-center py-6 bg-slate-50 rounded-xl border border-dashed border-slate-200 text-slate-400 text-xs font-medium">
                      Aucun équipement lourd requis spécifié.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {formData.attachedEquipments.map((eq) => (
                        <div 
                          key={eq.name}
                          className="flex items-center justify-between p-3 bg-blue-50/40 border border-blue-200/70 rounded-xl"
                        >
                          <div className="flex items-center gap-2.5">
                            <CheckCircle2 size={16} className="text-blue-600 shrink-0" />
                            <span className="font-extrabold text-xs text-slate-900">{eq.name}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-xs font-bold text-blue-700 bg-blue-100/70 px-2.5 py-0.5 rounded-md">
                              {eq.quantity} unité(s)
                            </span>
                            <button
                              type="button"
                              onClick={() => handleRemoveEquipment(eq.name)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

              </div>
            )}

            {/* ONGLET 6 / 7 - LABORATOIRE */}
            {activeTab === 'laboratoire' && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
                <div className="bg-purple-50 p-6 rounded-2xl border border-purple-100">
                  <h3 className="text-sm font-black text-purple-800 uppercase tracking-widest mb-2 flex items-center gap-2">
                    <Beaker size={16} /> Paramètres de l'examen biologique
                  </h3>
                  <p className="text-sm text-purple-600 mb-6">Définissez les paramètres mesurés par cet examen, leurs unités et leurs valeurs de référence.</p>

                  <div className="mb-6 p-4 bg-purple-100/60 rounded-2xl border border-purple-200 flex items-center justify-between">
                    <div>
                      <h4 className="font-extrabold text-xs uppercase tracking-wider text-purple-900 flex items-center gap-2">
                        🔒 Examen Confidentiel / Sensible (ex: VIH, Sérologie, Génétique)
                      </h4>
                      <p className="text-xs text-purple-700 mt-1">
                        Les résultats seront masqués et uniquement accessibles au médecin prescripteur et aux biologistes dans le dossier patient.
                      </p>
                    </div>
                    <input 
                      type="checkbox" 
                      checked={formData.isSensitive}
                      onChange={(e) => handleInputChange('isSensitive', e.target.checked)}
                      className="w-5 h-5 rounded border-purple-300 text-purple-600 focus:ring-purple-500 cursor-pointer"
                    />
                  </div>
                  
                  {errors.labParameters && (
                    <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-600 rounded-xl text-sm font-medium flex items-center gap-2">
                      <AlertCircle size={16} />
                      {errors.labParameters}
                    </div>
                  )}

                  <div className="space-y-4">
                    {formData.labParameters.map((param, index) => (
                      <div key={index} className="flex gap-3 items-start bg-white p-4 rounded-xl border border-purple-100 shadow-sm">
                        <div className="flex-1 space-y-4">
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className="block text-xs font-bold text-slate-500 mb-1">Nom du paramètre</label>
                              <input 
                                type="text" 
                                value={param.nom}
                                onChange={(e) => {
                                  const newParams = [...formData.labParameters];
                                  newParams[index].nom = e.target.value;
                                  handleInputChange('labParameters', newParams);
                                }}
                                className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none text-sm"
                                placeholder="Ex: Hémoglobine"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-bold text-slate-500 mb-1">Unité</label>
                              <input 
                                type="text" 
                                value={param.unite}
                                onChange={(e) => {
                                  const newParams = [...formData.labParameters];
                                  newParams[index].unite = e.target.value;
                                  handleInputChange('labParameters', newParams);
                                }}
                                className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none text-sm"
                                placeholder="Ex: g/dL"
                              />
                            </div>
                          </div>
                          
                          <div className="grid grid-cols-3 gap-4">
                            <div>
                              <label className="block text-xs font-bold text-slate-500 mb-1">Val. Réf. Min (Numérique)</label>
                              <input 
                                type="number" 
                                step="any"
                                value={param.valeurReferenceMin ?? ''}
                                onChange={(e) => {
                                  const newParams = [...formData.labParameters];
                                  newParams[index].valeurReferenceMin = e.target.value ? parseFloat(e.target.value) : undefined;
                                  handleInputChange('labParameters', newParams);
                                }}
                                className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none text-sm"
                                placeholder="Ex: 12.0"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-bold text-slate-500 mb-1">Val. Réf. Max (Numérique)</label>
                              <input 
                                type="number" 
                                step="any"
                                value={param.valeurReferenceMax ?? ''}
                                onChange={(e) => {
                                  const newParams = [...formData.labParameters];
                                  newParams[index].valeurReferenceMax = e.target.value ? parseFloat(e.target.value) : undefined;
                                  handleInputChange('labParameters', newParams);
                                }}
                                className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none text-sm"
                                placeholder="Ex: 16.0"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-bold text-slate-500 mb-1">Val. Réf. (Texte)</label>
                              <input 
                                type="text" 
                                value={param.valeurReferenceTexte || ''}
                                onChange={(e) => {
                                  const newParams = [...formData.labParameters];
                                  newParams[index].valeurReferenceTexte = e.target.value;
                                  handleInputChange('labParameters', newParams);
                                }}
                                className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none text-sm"
                                placeholder="Ex: Négatif"
                              />
                            </div>
                          </div>
                        </div>
                        <button 
                          type="button"
                          onClick={() => {
                            const newParams = [...formData.labParameters];
                            newParams.splice(index, 1);
                            handleInputChange('labParameters', newParams);
                          }}
                          className="p-2 text-rose-400 hover:bg-rose-50 hover:text-rose-600 rounded-lg transition-colors mt-6"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    ))}
                    
                    <button 
                      type="button"
                      onClick={() => {
                        handleInputChange('labParameters', [...formData.labParameters, { nom: '', unite: '' }]);
                      }}
                      className="flex items-center gap-2 text-purple-600 font-bold text-sm hover:text-purple-700 transition-colors px-4 py-2 bg-purple-100 rounded-xl hover:bg-purple-200"
                    >
                      <Plus size={16} /> Ajouter un paramètre
                    </button>
                  </div>
                </div>
              </div>
            )}

          </form>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-100 bg-white shrink-0 flex items-center justify-between">
          <div className="text-sm text-slate-500 font-medium">
            {Object.keys(errors).length > 0 && (
              <span className="text-rose-500 flex items-center gap-1 font-bold">
                <AlertCircle size={16} /> Veuillez renseigner tous les champs obligatoires avant d'enregistrer.
              </span>
            )}
          </div>
          <div className="flex gap-3">
            <button 
              type="button"
              onClick={onClose}
              className="px-6 py-3 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
            >
              Annuler
            </button>
            <button 
              type="submit"
              form="medical-act-form"
              className="px-6 py-3 rounded-xl font-bold text-white bg-blue-600 hover:bg-blue-700 transition-colors flex items-center gap-2 shadow-lg shadow-blue-600/20"
            >
              <Save size={18} /> {initialData ? 'Mettre à jour la prestation' : 'Enregistrer la prestation'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

export default AddMedicalActForm;
