import React, { useState, useEffect, useMemo } from 'react';
import {
  Stethoscope,
  CreditCard,
  Package,
  Plus,
  Trash2,
  Beaker,
  Search,
  Pill,
  Box,
  ShieldCheck,
  Wrench,
  CheckCircle2,
  Clock,
  FileCheck2,
  Sparkles,
} from 'lucide-react';
import { db } from '../../src/firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import { getActiveTenantId, belongsToTenant } from '../../src/utils/tenant';
import { MultiStepForm, WizardStep } from '../../components/common/MultiStepForm';

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
  'Stérilisateur / Autoclave hospitalier',
];

const CATEGORY_OPTIONS = [
  'Consultation',
  'Soins Infirmiers',
  'Chirurgie',
  'Imagerie',
  'Laboratoire',
  'Maternité',
  'Urgences',
  'Hospitalisation',
  'Autre',
];

const SERVICE_OPTIONS = [
  { id: 'consultation', label: 'Consultation' },
  { id: 'soins_infirmiers', label: 'Soins Infirmiers' },
  { id: 'urgences', label: 'Urgences' },
  { id: 'laboratoire', label: 'Laboratoire' },
  { id: 'imagerie', label: 'Imagerie Médicale' },
  { id: 'maternite', label: 'Maternité' },
  { id: 'chirurgie', label: 'Chirurgie / Bloc' },
  { id: 'hospitalisation', label: 'Hospitalisation' },
];

const PROFESSIONS_LIST = ['Médecin', 'Infirmier(ère)', 'Sage-femme', 'Laborantin', 'Pharmacien'];

const DARK_INPUT =
  'w-full px-4 py-3 bg-[#0D1425] border border-slate-700/80 rounded-xl text-sm font-semibold text-white placeholder-slate-500 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/25 transition-all';
const DARK_LABEL = 'block text-[11px] font-black uppercase tracking-wider text-slate-400 mb-2';

const AddMedicalActForm: React.FC<AddMedicalActFormProps> = ({
  onClose,
  onSave,
  initialData,
  user,
  establishment,
}) => {
  const activeTenantId = useMemo(
    () => getActiveTenantId(user, establishment),
    [user, establishment]
  );

  const [currentStep, setCurrentStep] = useState(0);
  const [maxUnlockedStep, setMaxUnlockedStep] = useState(initialData ? 3 : 0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    nom: initialData?.name || initialData?.nom || '',
    codeInterne: initialData?.codeInterne || '',
    description: initialData?.description || '',
    type: initialData?.type || 'acte médical',

    // Classification
    servicePrincipal: initialData?.servicePrincipal || 'consultation',
    sousService: initialData?.sousService || '',
    categorie: initialData?.category || initialData?.categorie || 'Consultation',
    priorite: initialData?.priorite || 'normal',

    // Exécution & Règles
    professionsAutorisees: (
      initialData?.professionsAutorisees?.length
        ? initialData.professionsAutorisees
        : ['Médecin']
    ) as string[],
    dureeEstimee: initialData?.dureeEstimee || '',
    necessiteRdv: initialData?.necessiteRdv || false,
    peutEtreUrgent: initialData?.peutEtreUrgent || false,
    genereHospitalisation: initialData?.genereHospitalisation || false,
    necessiteSurveillance: initialData?.necessiteSurveillance || false,
    necessiteConsentement: initialData?.necessiteConsentement || false,
    requiresPrescription: Boolean(
      initialData?.requiresPrescription || initialData?.soumisOrdonnance
    ),
    soumisOrdonnance: Boolean(
      initialData?.requiresPrescription || initialData?.soumisOrdonnance
    ),
    validite_jours: Math.max(
      0,
      Math.floor(Number(initialData?.validite_jours ?? initialData?.validityDays ?? 0) || 0)
    ),

    // Tarification
    prixBase:
      initialData?.price?.toString() || initialData?.prixBase?.toString() || '',
    modeTarification: initialData?.modeTarification || 'fixe',
    factureA: initialData?.factureA || 'accueil',
    remboursable: initialData?.remboursable || false,
    partageRevenu: initialData?.partageRevenu || false,
    pourcentageMedecin: initialData?.pourcentageMedecin || '',
    pourcentageStructure: initialData?.pourcentageStructure || '',

    // Ressources & Stocks
    medicamentsUtilises: (initialData?.medicamentsUtilises || []) as string[],
    consommables: (initialData?.consommables || []) as string[],
    equipements: (initialData?.equipements || []) as string[],
    attachedMeds: (initialData?.attachedMeds || []) as AttachedItem[],
    attachedConsumables: (initialData?.attachedConsumables || []) as AttachedItem[],
    attachedEquipments: (initialData?.attachedEquipments || []) as AttachedItem[],

    // Laboratoire
    isSensitive: initialData?.isSensitive || false,
    labParameters: (initialData?.labParameters || []) as {
      nom: string;
      unite: string;
      valeurReferenceMin?: number;
      valeurReferenceMax?: number;
      valeurReferenceTexte?: string;
    }[],
  });

  // Real-time Inventory Sources
  const [inventoryMeds, setInventoryMeds] = useState<any[]>([]);
  const [inventoryConsumables, setInventoryConsumables] = useState<any[]>([]);
  const [loadingInventory, setLoadingInventory] = useState(true);

  const [medSearch, setMedSearch] = useState('');
  const [selectedMedId, setSelectedMedId] = useState('');
  const [selectedMedQty, setSelectedMedQty] = useState(1);
  const [selectedMedUnit, setSelectedMedUnit] = useState('ampoule');

  const [consSearch, setConsSearch] = useState('');
  const [selectedConsId, setSelectedConsId] = useState('');
  const [selectedConsQty, setSelectedConsQty] = useState(1);
  const [selectedConsUnit, setSelectedConsUnit] = useState('unité');

  const [selectedEquipName, setSelectedEquipName] = useState('');
  const [selectedEquipQty, setSelectedEquipQty] = useState(1);

  useEffect(() => {
    const unsubMeds = onSnapshot(
      collection(db, 'pharmacy_inventory'),
      (snap) => {
        const allMeds = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setInventoryMeds(allMeds.filter((m) => belongsToTenant(m, activeTenantId)));
        setLoadingInventory(false);
      },
      () => setLoadingInventory(false)
    );

    const unsubCons = onSnapshot(collection(db, 'hospital_consumables'), (snap) => {
      const allCons = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setInventoryConsumables(allCons.filter((c) => belongsToTenant(c, activeTenantId)));
    });

    return () => {
      unsubMeds();
      unsubCons();
    };
  }, [activeTenantId]);

  const filteredMeds = useMemo(() => {
    const q = medSearch.toLowerCase().trim();
    if (!q) return inventoryMeds.slice(0, 30);
    return inventoryMeds
      .filter(
        (m) =>
          (m.name || m.nom || '').toLowerCase().includes(q) ||
          (m.dci || '').toLowerCase().includes(q) ||
          (m.codeInterne || m.code || '').toLowerCase().includes(q) ||
          (m.dosage || '').toLowerCase().includes(q)
      )
      .slice(0, 30);
  }, [inventoryMeds, medSearch]);

  const filteredConsumables = useMemo(() => {
    const q = consSearch.toLowerCase().trim();
    if (!q) return inventoryConsumables.slice(0, 30);
    return inventoryConsumables
      .filter(
        (c) =>
          (c.nom || c.name || '').toLowerCase().includes(q) ||
          (c.codeInterne || c.code || '').toLowerCase().includes(q) ||
          (c.categorie || '').toLowerCase().includes(q)
      )
      .slice(0, 30);
  }, [inventoryConsumables, consSearch]);

  const handleInputChange = (field: string, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const toggleProfession = (prof: string) => {
    setFormData((prev) => {
      const exists = prev.professionsAutorisees.includes(prof);
      return {
        ...prev,
        professionsAutorisees: exists
          ? prev.professionsAutorisees.filter((p) => p !== prof)
          : [...prev.professionsAutorisees, prof],
      };
    });
  };

  const handleAddMedication = () => {
    if (!selectedMedId) return;
    const med = inventoryMeds.find((m) => m.id === selectedMedId);
    if (!med) return;
    const idx = formData.attachedMeds.findIndex((m) => m.id === med.id);
    const nextMeds =
      idx >= 0
        ? formData.attachedMeds.map((m, i) =>
            i === idx ? { ...m, quantity: m.quantity + selectedMedQty } : m
          )
        : [
            ...formData.attachedMeds,
            {
              id: med.id,
              name: med.name || med.nom || 'Médicament',
              details: `${med.dosage || ''} ${med.formeGalenique || ''}`.trim(),
              code: med.codeInterne || med.code || '',
              stock: med.stock ?? med.stockActuel ?? 0,
              quantity: selectedMedQty,
              unit: selectedMedUnit,
              price: med.price || 0,
            },
          ];
    setFormData((prev) => ({
      ...prev,
      attachedMeds: nextMeds,
      medicamentsUtilises: nextMeds.map((m) =>
        `${m.name} ${m.details || ''} (x${m.quantity} ${m.unit})`.trim()
      ),
    }));
    setSelectedMedId('');
    setSelectedMedQty(1);
    setMedSearch('');
  };

  const handleRemoveMedication = (id: string) => {
    const nextMeds = formData.attachedMeds.filter((m) => m.id !== id);
    setFormData((prev) => ({
      ...prev,
      attachedMeds: nextMeds,
      medicamentsUtilises: nextMeds.map((m) =>
        `${m.name} ${m.details || ''} (x${m.quantity} ${m.unit})`.trim()
      ),
    }));
  };

  const handleAddConsumable = () => {
    if (!selectedConsId) return;
    const cons = inventoryConsumables.find((c) => c.id === selectedConsId);
    if (!cons) return;
    const unit = selectedConsUnit || cons.uniteGestion || 'unité';
    const idx = formData.attachedConsumables.findIndex((c) => c.id === cons.id);
    const nextCons =
      idx >= 0
        ? formData.attachedConsumables.map((c, i) =>
            i === idx ? { ...c, quantity: c.quantity + selectedConsQty } : c
          )
        : [
            ...formData.attachedConsumables,
            {
              id: cons.id,
              name: cons.nom || cons.name || 'Consommable',
              category: cons.categorie || '',
              code: cons.codeInterne || '',
              stock: cons.stockInitial ?? cons.stockActuel ?? 0,
              quantity: selectedConsQty,
              unit,
              price: cons.prixVente || 0,
            },
          ];
    setFormData((prev) => ({
      ...prev,
      attachedConsumables: nextCons,
      consommables: nextCons.map((c) => `${c.name} (x${c.quantity} ${c.unit})`.trim()),
    }));
    setSelectedConsId('');
    setSelectedConsQty(1);
    setConsSearch('');
  };

  const handleRemoveConsumable = (id: string) => {
    const nextCons = formData.attachedConsumables.filter((c) => c.id !== id);
    setFormData((prev) => ({
      ...prev,
      attachedConsumables: nextCons,
      consommables: nextCons.map((c) => `${c.name} (x${c.quantity} ${c.unit})`.trim()),
    }));
  };

  const handleAddEquipment = () => {
    if (!selectedEquipName) return;
    const idx = formData.attachedEquipments.findIndex((e) => e.name === selectedEquipName);
    const nextEquip =
      idx >= 0
        ? formData.attachedEquipments.map((e, i) =>
            i === idx ? { ...e, quantity: e.quantity + selectedEquipQty } : e
          )
        : [
            ...formData.attachedEquipments,
            {
              id: `EQ-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              name: selectedEquipName,
              quantity: selectedEquipQty,
              unit: 'appareil',
            },
          ];
    setFormData((prev) => ({
      ...prev,
      attachedEquipments: nextEquip,
      equipements: nextEquip.map((e) => `${e.name} (x${e.quantity})`.trim()),
    }));
    setSelectedEquipName('');
    setSelectedEquipQty(1);
  };

  const handleRemoveEquipment = (name: string) => {
    const nextEquip = formData.attachedEquipments.filter((e) => e.name !== name);
    setFormData((prev) => ({
      ...prev,
      attachedEquipments: nextEquip,
      equipements: nextEquip.map((e) => `${e.name} (x${e.quantity})`.trim()),
    }));
  };

  // Step-by-Step Guardrail Validation
  const isStep1Valid =
    formData.nom.trim().length > 0 &&
    formData.categorie.trim().length > 0 &&
    formData.servicePrincipal.trim().length > 0 &&
    formData.professionsAutorisees.length > 0;

  const prixNum = parseFloat(formData.prixBase);
  const splitValid =
    !formData.partageRevenu ||
    (parseFloat(formData.pourcentageMedecin || '0') || 0) +
      (parseFloat(formData.pourcentageStructure || '0') || 0) ===
      100;
  const isStep2Valid =
    formData.prixBase !== '' && !isNaN(prixNum) && prixNum >= 0 && splitValid;

  const isStep3Valid = true;
  const isStep4Valid = isStep1Valid && isStep2Valid;

  const steps: WizardStep[] = [
    {
      id: 'infos',
      label: 'Informations Générales',
      shortLabel: 'Infos',
      isValid: isStep1Valid,
      validationHint: 'Renseignez le nom, la catégorie, le service et au moins une profession.',
    },
    {
      id: 'tarification',
      label: 'Tarification & Validité',
      shortLabel: 'Tarification',
      isValid: isStep2Valid,
      validationHint: !splitValid
        ? 'La somme des pourcentages de partage doit égaler 100%.'
        : 'Saisissez un prix de base valide (≥ 0 FCFA).',
    },
    {
      id: 'ressources',
      label: 'Ressources & Consommables',
      shortLabel: 'Ressources',
      isValid: isStep3Valid,
    },
    {
      id: 'validation',
      label: 'Résumé & Validation',
      shortLabel: 'Validation',
      isValid: isStep4Valid,
    },
  ];

  const handleNext = () => {
    if (!steps[currentStep]?.isValid) return;
    const nextIdx = Math.min(steps.length - 1, currentStep + 1);
    setCurrentStep(nextIdx);
    setMaxUnlockedStep((prev) => Math.max(prev, nextIdx));
  };

  const handlePrev = () => {
    setCurrentStep((prev) => Math.max(0, prev - 1));
  };

  const handleFinalSubmit = async () => {
    if (isSubmitting || !isStep4Valid) return;
    setIsSubmitting(true);
    try {
      await onSave(formData);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <MultiStepForm
      title={initialData ? 'Modifier la prestation médicale' : 'Nouvel Acte Médical / Prestation'}
      subtitle={
        initialData
          ? `Configuration de « ${initialData.name || initialData.nom} »`
          : 'Assistant de paramétrage du référentiel des actes et stocks'
      }
      icon={<Stethoscope size={22} />}
      steps={steps}
      currentStep={currentStep}
      maxUnlockedStep={maxUnlockedStep}
      onStepChange={setCurrentStep}
      onNext={handleNext}
      onPrev={handlePrev}
      onClose={onClose}
      onSubmit={handleFinalSubmit}
      isSubmitting={isSubmitting}
      submitLabel={initialData ? 'Mettre à jour' : 'Enregistrer'}
    >
      {/* ÉTAPE 1 : INFORMATIONS GÉNÉRALES */}
      {currentStep === 0 && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className={DARK_LABEL}>
                Nom de l&apos;acte / prestation <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                value={formData.nom}
                onChange={(e) => handleInputChange('nom', e.target.value)}
                placeholder="Ex: Consultation Pédiatrique, Pansement Simple..."
                className={DARK_INPUT}
              />
            </div>

            <div>
              <label className={DARK_LABEL}>
                Catégorie <span className="text-rose-400">*</span>
              </label>
              <select
                value={formData.categorie}
                onChange={(e) => handleInputChange('categorie', e.target.value)}
                className={DARK_INPUT}
              >
                {CATEGORY_OPTIONS.map((cat) => (
                  <option key={cat} value={cat} className="bg-[#0D1425] text-white">
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={DARK_LABEL}>
                Service principal <span className="text-rose-400">*</span>
              </label>
              <select
                value={formData.servicePrincipal}
                onChange={(e) => handleInputChange('servicePrincipal', e.target.value)}
                className={DARK_INPUT}
              >
                {SERVICE_OPTIONS.map((svc) => (
                  <option key={svc.id} value={svc.id} className="bg-[#0D1425] text-white">
                    {svc.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={DARK_LABEL}>Type d&apos;acte &amp; Code interne</label>
              <div className="grid grid-cols-2 gap-3">
                <select
                  value={formData.type}
                  onChange={(e) => handleInputChange('type', e.target.value)}
                  className={DARK_INPUT}
                >
                  <option value="acte médical" className="bg-[#0D1425]">Acte médical</option>
                  <option value="soin infirmier" className="bg-[#0D1425]">Soin infirmier</option>
                  <option value="examen" className="bg-[#0D1425]">Examen labo</option>
                  <option value="intervention" className="bg-[#0D1425]">Intervention</option>
                </select>
                <input
                  type="text"
                  value={formData.codeInterne}
                  onChange={(e) => handleInputChange('codeInterne', e.target.value)}
                  placeholder="Code (ex: CONS-01)"
                  className={DARK_INPUT}
                />
              </div>
            </div>
          </div>

          {/* Soumis à ordonnance & Options */}
          <div className="p-5 rounded-2xl bg-[#0B1222] border border-slate-800 space-y-4">
            <label className="flex items-start gap-3.5 cursor-pointer group">
              <input
                type="checkbox"
                checked={formData.requiresPrescription}
                onChange={(e) => {
                  handleInputChange('requiresPrescription', e.target.checked);
                  handleInputChange('soumisOrdonnance', e.target.checked);
                }}
                className="mt-0.5 w-5 h-5 rounded-md border-slate-600 bg-slate-900 text-amber-500 focus:ring-amber-500/40 cursor-pointer"
              />
              <div>
                <span className="text-sm font-black text-amber-400 flex items-center gap-2">
                  <ShieldCheck size={16} />
                  Soumis à ordonnance médicale obligatoire
                </span>
                <p className="text-xs text-slate-400 mt-0.5">
                  Si coché, l&apos;Accueil et les Soins exigeront le nom du prescripteur ou numéro d&apos;ordre avant d&apos;autoriser l&apos;exécution.
                </p>
              </div>
            </label>

            <div>
              <span className={DARK_LABEL}>
                Professions autorisées à exécuter <span className="text-rose-400">*</span>
              </span>
              <div className="flex flex-wrap gap-2">
                {PROFESSIONS_LIST.map((prof) => {
                  const active = formData.professionsAutorisees.includes(prof);
                  return (
                    <button
                      key={prof}
                      type="button"
                      onClick={() => toggleProfession(prof)}
                      className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                        active
                          ? 'bg-blue-600/20 border-blue-400 text-blue-300 shadow-[0_0_12px_rgba(59,130,246,0.2)]'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-600'
                      }`}
                    >
                      {prof}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div>
            <label className={DARK_LABEL}>Description clinique / Consignes</label>
            <textarea
              rows={2}
              value={formData.description}
              onChange={(e) => handleInputChange('description', e.target.value)}
              placeholder="Précisions sur l'acte, préparation du patient..."
              className={DARK_INPUT}
            />
          </div>
        </div>
      )}

      {/* ÉTAPE 2 : TARIFICATION & VALIDITÉ */}
      {currentStep === 1 && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="p-5 rounded-2xl bg-[#0B1222] border border-slate-800 space-y-2">
              <label className={DARK_LABEL}>
                Prix de base (FCFA) <span className="text-rose-400">*</span>
              </label>
              <div className="relative">
                <CreditCard
                  size={16}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-blue-400"
                />
                <input
                  type="number"
                  min={0}
                  value={formData.prixBase}
                  onChange={(e) => handleInputChange('prixBase', e.target.value)}
                  placeholder="Ex: 10000"
                  className={`${DARK_INPUT} pl-10 text-base font-black text-emerald-400`}
                />
              </div>
              <p className="text-[11px] text-slate-400">
                Tarif facturé à la Caisse lors de l&apos;admission ou de la prescription.
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-[#0B1222] border border-slate-800 space-y-2">
              <label className={DARK_LABEL}>
                Période de gratuité / Validité (jours)
              </label>
              <div className="relative">
                <Clock
                  size={16}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-indigo-400"
                />
                <input
                  type="number"
                  min={0}
                  value={formData.validite_jours}
                  onChange={(e) =>
                    handleInputChange(
                      'validite_jours',
                      Math.max(0, Math.floor(Number(e.target.value) || 0))
                    )
                  }
                  placeholder="0 = aucun suivi gratuit"
                  className={`${DARK_INPUT} pl-10`}
                />
              </div>
              <p className="text-[11px] text-slate-400">
                Ex: 12 jours pour une consultation pédiatrique avec contrôle gratuit.
              </p>
            </div>

            <div>
              <label className={DARK_LABEL}>Mode de tarification</label>
              <select
                value={formData.modeTarification}
                onChange={(e) => handleInputChange('modeTarification', e.target.value)}
                className={DARK_INPUT}
              >
                <option value="fixe" className="bg-[#0D1425]">Tarif Fixe</option>
                <option value="forfait" className="bg-[#0D1425]">Forfait</option>
                <option value="variable" className="bg-[#0D1425]">Variable / Sur devis</option>
              </select>
            </div>

            <div>
              <label className={DARK_LABEL}>Lieu de facturation par défaut</label>
              <select
                value={formData.factureA}
                onChange={(e) => handleInputChange('factureA', e.target.value)}
                className={DARK_INPUT}
              >
                <option value="accueil" className="bg-[#0D1425]">Accueil / Caisse</option>
                <option value="caisse" className="bg-[#0D1425]">Caisse Directe</option>
                <option value="hospitalisation" className="bg-[#0D1425]">Note d&apos;Hospitalisation</option>
              </select>
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-[#0B1222] border border-slate-800 space-y-4">
            <div className="flex flex-wrap gap-6">
              <label className="flex items-center gap-2.5 cursor-pointer text-xs font-bold text-slate-200">
                <input
                  type="checkbox"
                  checked={formData.remboursable}
                  onChange={(e) => handleInputChange('remboursable', e.target.checked)}
                  className="w-4 h-4 rounded border-slate-600 bg-slate-900 text-blue-500"
                />
                Remboursable / Éligible Assurance (PEC)
              </label>

              <label className="flex items-center gap-2.5 cursor-pointer text-xs font-bold text-slate-200">
                <input
                  type="checkbox"
                  checked={formData.partageRevenu}
                  onChange={(e) => handleInputChange('partageRevenu', e.target.checked)}
                  className="w-4 h-4 rounded border-slate-600 bg-slate-900 text-blue-500"
                />
                Activer le partage d&apos;honoraires (Médecin / Structure)
              </label>
            </div>

            {formData.partageRevenu && (
              <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-800">
                <div>
                  <label className={DARK_LABEL}>Part Praticien (%)</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={formData.pourcentageMedecin}
                    onChange={(e) => handleInputChange('pourcentageMedecin', e.target.value)}
                    placeholder="Ex: 60"
                    className={DARK_INPUT}
                  />
                </div>
                <div>
                  <label className={DARK_LABEL}>Part Structure (%)</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={formData.pourcentageStructure}
                    onChange={(e) => handleInputChange('pourcentageStructure', e.target.value)}
                    placeholder="Ex: 40"
                    className={DARK_INPUT}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ÉTAPE 3 : RESSOURCES & CONSOMMABLES */}
      {currentStep === 2 && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div className="p-4 rounded-2xl bg-blue-500/10 border border-blue-500/30 text-xs text-blue-200 flex items-center gap-3">
            <Sparkles size={18} className="text-blue-400 shrink-0" />
            <span>
              Les médicaments et consommables liés ici seront automatiquement déstockés de la Pharmacie / Stock dès que l&apos;acte est marqué comme <strong>Fait</strong>.
            </span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Consommables / Stock */}
            <div className="p-5 rounded-2xl bg-[#0B1222] border border-slate-800 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-black text-white flex items-center gap-2">
                  <Box size={16} className="text-amber-400" />
                  Consommables Médicaux (Stock)
                </h4>
                <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">
                  {formData.attachedConsumables.length} lié(s)
                </span>
              </div>

              <div className="relative">
                <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={consSearch}
                  onChange={(e) => setConsSearch(e.target.value)}
                  placeholder="Rechercher gants, seringues, bétadine..."
                  className={`${DARK_INPUT} pl-9`}
                />
              </div>

              <div className="flex gap-2">
                <select
                  value={selectedConsId}
                  onChange={(e) => setSelectedConsId(e.target.value)}
                  className={`${DARK_INPUT} flex-1`}
                >
                  <option value="" className="bg-[#0D1425]">
                    -- Sélectionner un consommable --
                  </option>
                  {filteredConsumables.map((c) => (
                    <option key={c.id} value={c.id} className="bg-[#0D1425]">
                      {c.nom || c.name} (Stock: {c.stockInitial ?? c.stockActuel ?? 0})
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min={1}
                  value={selectedConsQty}
                  onChange={(e) => setSelectedConsQty(Math.max(1, Number(e.target.value) || 1))}
                  className="w-20 px-3 py-2.5 bg-[#0D1425] border border-slate-700/80 rounded-xl text-sm font-bold text-white text-center"
                />
                <button
                  type="button"
                  onClick={handleAddConsumable}
                  disabled={!selectedConsId}
                  className="px-4 py-2.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white rounded-xl font-black text-xs flex items-center gap-1 cursor-pointer"
                >
                  <Plus size={15} />
                </button>
              </div>

              <div className="space-y-2 max-h-48 overflow-y-auto">
                {formData.attachedConsumables.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-slate-900/90 border border-slate-800 text-xs"
                  >
                    <div>
                      <span className="font-bold text-white">{c.name}</span>
                      <span className="ml-2 text-amber-400 font-black">
                        x{c.quantity} {c.unit}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveConsumable(c.id)}
                      className="text-rose-400 hover:text-rose-300 p-1 cursor-pointer"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
                {formData.attachedConsumables.length === 0 && (
                  <p className="text-xs text-slate-500 italic">Aucun consommable lié.</p>
                )}
              </div>
            </div>

            {/* Médicaments Pharmacie */}
            <div className="p-5 rounded-2xl bg-[#0B1222] border border-slate-800 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-black text-white flex items-center gap-2">
                  <Pill size={16} className="text-emerald-400" />
                  Médicaments / Solutés (Pharmacie)
                </h4>
                <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                  {formData.attachedMeds.length} lié(s)
                </span>
              </div>

              <div className="relative">
                <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={medSearch}
                  onChange={(e) => setMedSearch(e.target.value)}
                  placeholder="Rechercher médicament, soluté..."
                  className={`${DARK_INPUT} pl-9`}
                />
              </div>

              <div className="flex gap-2">
                <select
                  value={selectedMedId}
                  onChange={(e) => setSelectedMedId(e.target.value)}
                  className={`${DARK_INPUT} flex-1`}
                  disabled={loadingInventory}
                >
                  <option value="" className="bg-[#0D1425]">
                    -- Sélectionner un médicament --
                  </option>
                  {filteredMeds.map((m) => (
                    <option key={m.id} value={m.id} className="bg-[#0D1425]">
                      {m.name || m.nom} (Stock: {m.stock ?? m.stockActuel ?? 0})
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min={1}
                  value={selectedMedQty}
                  onChange={(e) => setSelectedMedQty(Math.max(1, Number(e.target.value) || 1))}
                  className="w-20 px-3 py-2.5 bg-[#0D1425] border border-slate-700/80 rounded-xl text-sm font-bold text-white text-center"
                />
                <button
                  type="button"
                  onClick={handleAddMedication}
                  disabled={!selectedMedId}
                  className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-xl font-black text-xs flex items-center gap-1 cursor-pointer"
                >
                  <Plus size={15} />
                </button>
              </div>

              <div className="space-y-2 max-h-48 overflow-y-auto">
                {formData.attachedMeds.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-slate-900/90 border border-slate-800 text-xs"
                  >
                    <div>
                      <span className="font-bold text-white">{m.name}</span>
                      <span className="ml-2 text-emerald-400 font-black">
                        x{m.quantity} {m.unit}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveMedication(m.id)}
                      className="text-rose-400 hover:text-rose-300 p-1 cursor-pointer"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
                {formData.attachedMeds.length === 0 && (
                  <p className="text-xs text-slate-500 italic">Aucun médicament lié.</p>
                )}
              </div>
            </div>
          </div>

          {/* Équipements */}
          <div className="p-5 rounded-2xl bg-[#0B1222] border border-slate-800 space-y-3">
            <h4 className="text-sm font-black text-white flex items-center gap-2">
              <Wrench size={16} className="text-blue-400" />
              Plateau Technique / Équipements requis
            </h4>
            <div className="flex gap-2">
              <select
                value={selectedEquipName}
                onChange={(e) => setSelectedEquipName(e.target.value)}
                className={`${DARK_INPUT} flex-1`}
              >
                <option value="" className="bg-[#0D1425]">
                  -- Sélectionner un équipement --
                </option>
                {STANDARD_EQUIPMENTS.map((eq) => (
                  <option key={eq} value={eq} className="bg-[#0D1425]">
                    {eq}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleAddEquipment}
                disabled={!selectedEquipName}
                className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-xl font-black text-xs flex items-center gap-1 cursor-pointer"
              >
                <Plus size={15} /> Ajouter
              </button>
            </div>
            {formData.attachedEquipments.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {formData.attachedEquipments.map((eq) => (
                  <span
                    key={eq.id}
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-xs font-bold text-slate-200"
                  >
                    {eq.name}
                    <button
                      type="button"
                      onClick={() => handleRemoveEquipment(eq.name)}
                      className="text-rose-400 hover:text-rose-300 cursor-pointer"
                    >
                      <Trash2 size={12} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ÉTAPE 4 : RÉSUMÉ & VALIDATION */}
      {currentStep === 3 && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-3 text-emerald-300 text-xs font-bold">
            <FileCheck2 size={18} className="shrink-0" />
            Vérifiez les informations ci-dessous avant d&apos;enregistrer cet acte dans le référentiel.
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Summary Block 1: General Info */}
            <div className="p-5 rounded-2xl bg-[#0B1222] border border-slate-800 space-y-3">
              <h4 className="text-xs font-black uppercase tracking-wider text-blue-400 flex items-center gap-2">
                <Stethoscope size={14} /> Informations Générales
              </h4>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between py-1.5 border-b border-slate-800/80">
                  <span className="text-slate-400">Nom de l&apos;acte</span>
                  <span className="font-black text-white">{formData.nom}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-800/80">
                  <span className="text-slate-400">Catégorie</span>
                  <span className="font-bold text-slate-200">{formData.categorie}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-800/80">
                  <span className="text-slate-400">Service principal</span>
                  <span className="font-bold text-slate-200 uppercase">{formData.servicePrincipal}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-800/80">
                  <span className="text-slate-400">Soumis à ordonnance</span>
                  <span
                    className={`font-black px-2 py-0.5 rounded-md text-[10px] ${
                      formData.requiresPrescription
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {formData.requiresPrescription ? 'OUI (OBLIGATOIRE)' : 'NON'}
                  </span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="text-slate-400">Professions</span>
                  <span className="font-bold text-slate-200 text-right">
                    {formData.professionsAutorisees.join(', ')}
                  </span>
                </div>
              </div>
            </div>

            {/* Summary Block 2: Pricing & Rules */}
            <div className="p-5 rounded-2xl bg-[#0B1222] border border-slate-800 space-y-3">
              <h4 className="text-xs font-black uppercase tracking-wider text-emerald-400 flex items-center gap-2">
                <CreditCard size={14} /> Tarification &amp; Validité
              </h4>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between py-1.5 border-b border-slate-800/80">
                  <span className="text-slate-400">Prix de base</span>
                  <span className="font-black text-emerald-400 text-sm">
                    {Number(formData.prixBase || 0).toLocaleString()} FCFA
                  </span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-800/80">
                  <span className="text-slate-400">Période de gratuité / Validité</span>
                  <span className="font-black text-indigo-300">
                    {formData.validite_jours > 0
                      ? `${formData.validite_jours} jour(s) (Suivi gratuit)`
                      : '0 jour (Pas de suivi gratuit)'}
                  </span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-800/80">
                  <span className="text-slate-400">Mode &amp; Facturation</span>
                  <span className="font-bold text-slate-200 uppercase">
                    {formData.modeTarification} • {formData.factureA}
                  </span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="text-slate-400">Remboursable PEC</span>
                  <span className="font-bold text-slate-200">
                    {formData.remboursable ? 'Oui' : 'Non'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Summary Block 3: Resources */}
          <div className="p-5 rounded-2xl bg-[#0B1222] border border-slate-800 space-y-3">
            <h4 className="text-xs font-black uppercase tracking-wider text-amber-400 flex items-center gap-2">
              <Package size={14} /> Ressources &amp; Consommables (Déstockage auto)
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div>
                <span className="block text-[10px] font-black uppercase text-slate-500 mb-1.5">
                  Consommables ({formData.attachedConsumables.length})
                </span>
                {formData.attachedConsumables.length > 0 ? (
                  <ul className="space-y-1 text-slate-200 font-semibold">
                    {formData.attachedConsumables.map((c) => (
                      <li key={c.id} className="flex items-center gap-1.5">
                        <CheckCircle2 size={12} className="text-amber-400 shrink-0" />
                        {c.name} (x{c.quantity})
                      </li>
                    ))}
                  </ul>
                ) : (
                  <span className="text-slate-500 italic">Aucun</span>
                )}
              </div>

              <div>
                <span className="block text-[10px] font-black uppercase text-slate-500 mb-1.5">
                  Médicaments ({formData.attachedMeds.length})
                </span>
                {formData.attachedMeds.length > 0 ? (
                  <ul className="space-y-1 text-slate-200 font-semibold">
                    {formData.attachedMeds.map((m) => (
                      <li key={m.id} className="flex items-center gap-1.5">
                        <CheckCircle2 size={12} className="text-emerald-400 shrink-0" />
                        {m.name} (x{m.quantity})
                      </li>
                    ))}
                  </ul>
                ) : (
                  <span className="text-slate-500 italic">Aucun</span>
                )}
              </div>

              <div>
                <span className="block text-[10px] font-black uppercase text-slate-500 mb-1.5">
                  Équipements ({formData.attachedEquipments.length})
                </span>
                {formData.attachedEquipments.length > 0 ? (
                  <ul className="space-y-1 text-slate-200 font-semibold">
                    {formData.attachedEquipments.map((eq) => (
                      <li key={eq.id} className="flex items-center gap-1.5">
                        <Beaker size={12} className="text-blue-400 shrink-0" />
                        {eq.name}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <span className="text-slate-500 italic">Aucun</span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </MultiStepForm>
  );
};

export default AddMedicalActForm;
