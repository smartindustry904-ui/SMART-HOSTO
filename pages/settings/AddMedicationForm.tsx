import React, { useState } from 'react';
import { Pill, CreditCard, ShieldCheck, FileCheck2 } from 'lucide-react';
import { MultiStepForm, WizardStep } from '../../components/common/MultiStepForm';

interface AddMedicationFormProps {
  initialData?: any;
  onClose: () => void;
  onSave: (medication: {
    name: string;
    family: string;
    unit: string;
    price: number;
    seuilAlerte: number;
    requiresPrescription: boolean;
  }) => void;
}

const CATEGORY_OPTIONS = [
  'Antalgiques & Anti-pyrétiques',
  'Antibiotiques & Anti-infectieux',
  'Anti-inflammatoires',
  'Antihypertenseurs & Cardiovasculaire',
  'Antidiabétiques',
  'Gastro-entérologie',
  'Pédiatrie',
  'Anesthésie & Réanimation',
  'Solutés & Perfusions',
  'Vitamines & Suppléments',
  'Autre',
];

const UNIT_OPTIONS = [
  'Boîte',
  'Flacon',
  'Ampoule',
  'Comprimé',
  'Gélule',
  'Tube',
  'Poche',
  'Flacon Sirop',
  'Unité',
];

const DARK_INPUT =
  'w-full px-4 py-3 bg-[#0D1425] border border-slate-700/80 rounded-xl text-sm font-semibold text-white placeholder-slate-500 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/25 transition-all';
const DARK_LABEL = 'block text-[11px] font-black uppercase tracking-wider text-slate-400 mb-2';

const AddMedicationForm: React.FC<AddMedicationFormProps> = ({ initialData, onClose, onSave }) => {
  const initialFam =
    initialData?.family || initialData?.classeTherapeutique || 'Antalgiques & Anti-pyrétiques';
  const isCustomFam = initialFam && !CATEGORY_OPTIONS.includes(initialFam);
  const initialUnitVal = initialData?.unit || initialData?.typeConditionnement || 'Boîte';
  const isCustomUnitVal = initialUnitVal && !UNIT_OPTIONS.includes(initialUnitVal);

  const [currentStep, setCurrentStep] = useState(0);
  const [maxUnlockedStep, setMaxUnlockedStep] = useState(initialData ? 2 : 0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    name: initialData?.name || initialData?.nomCommercial || initialData?.nom || '',
    family: isCustomFam ? 'Autre' : initialFam || 'Antalgiques & Anti-pyrétiques',
    customFamily: isCustomFam ? initialFam : '',
    unit: isCustomUnitVal ? 'Autre' : initialUnitVal || 'Boîte',
    customUnit: isCustomUnitVal ? initialUnitVal : '',
    price: (initialData?.price ?? initialData?.prixVente ?? '').toString(),
    seuilAlerte: (initialData?.seuilAlerte ?? '10').toString(),
    requiresPrescription: Boolean(
      initialData?.requiresPrescription || initialData?.soumisOrdonnance
    ),
  });

  const selectedFamily = formData.family === 'Autre' ? formData.customFamily : formData.family;
  const selectedUnit = formData.unit === 'Autre' ? formData.customUnit : formData.unit;

  const isStep1Valid =
    formData.name.trim().length > 0 &&
    selectedFamily.trim().length > 0 &&
    selectedUnit.trim().length > 0;

  const priceNum = parseFloat(formData.price);
  const thresholdNum = parseInt(formData.seuilAlerte, 10);
  const isStep2Valid =
    formData.price !== '' &&
    !isNaN(priceNum) &&
    priceNum >= 0 &&
    !isNaN(thresholdNum) &&
    thresholdNum >= 1;

  const isStep3Valid = isStep1Valid && isStep2Valid;

  const steps: WizardStep[] = [
    {
      id: 'infos',
      label: 'Informations Générales',
      shortLabel: 'Infos',
      isValid: isStep1Valid,
      validationHint: 'Renseignez la désignation, la famille thérapeutique et le conditionnement.',
    },
    {
      id: 'tarification',
      label: 'Tarification & Alerte Stock',
      shortLabel: 'Tarifs & Stock',
      isValid: isStep2Valid,
      validationHint: 'Saisissez un prix de vente (≥ 0) et un seuil d’alerte (≥ 1).',
    },
    {
      id: 'validation',
      label: 'Résumé & Validation',
      shortLabel: 'Validation',
      isValid: isStep3Valid,
    },
  ];

  const handleNext = () => {
    if (!steps[currentStep]?.isValid) return;
    const nextIdx = Math.min(steps.length - 1, currentStep + 1);
    setCurrentStep(nextIdx);
    setMaxUnlockedStep((prev) => Math.max(prev, nextIdx));
  };

  const handleFinalSubmit = async () => {
    if (isSubmitting || !isStep3Valid) return;
    setIsSubmitting(true);
    try {
      await onSave({
        name: formData.name.trim(),
        family: selectedFamily.trim(),
        unit: selectedUnit.trim(),
        price: priceNum,
        seuilAlerte: thresholdNum,
        requiresPrescription: formData.requiresPrescription,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <MultiStepForm
      title={initialData ? 'Modifier le médicament' : 'Nouveau Médicament / Produit'}
      subtitle="Référentiel Pharmacie & règles de dispensation"
      icon={<Pill size={22} />}
      steps={steps}
      currentStep={currentStep}
      maxUnlockedStep={maxUnlockedStep}
      onStepChange={setCurrentStep}
      onNext={handleNext}
      onPrev={() => setCurrentStep((p) => Math.max(0, p - 1))}
      onClose={onClose}
      onSubmit={handleFinalSubmit}
      isSubmitting={isSubmitting}
      submitLabel={initialData ? 'Mettre à jour' : 'Enregistrer'}
      maxWidthClass="max-w-3xl"
    >
      {currentStep === 0 && (
        <div className="space-y-5 animate-in fade-in duration-200">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="md:col-span-2">
              <label className={DARK_LABEL}>
                Désignation / Nom commercial &amp; Dosage <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Ex: Amoxicilline 500mg, Paracétamol 1g..."
                className={DARK_INPUT}
              />
            </div>

            <div>
              <label className={DARK_LABEL}>
                Famille thérapeutique <span className="text-rose-400">*</span>
              </label>
              <select
                value={formData.family}
                onChange={(e) => setFormData({ ...formData, family: e.target.value })}
                className={DARK_INPUT}
              >
                {CATEGORY_OPTIONS.map((c) => (
                  <option key={c} value={c} className="bg-[#0D1425]">
                    {c}
                  </option>
                ))}
              </select>
              {formData.family === 'Autre' && (
                <input
                  type="text"
                  value={formData.customFamily}
                  onChange={(e) => setFormData({ ...formData, customFamily: e.target.value })}
                  placeholder="Préciser la famille..."
                  className={`${DARK_INPUT} mt-2`}
                />
              )}
            </div>

            <div>
              <label className={DARK_LABEL}>
                Conditionnement / Unité <span className="text-rose-400">*</span>
              </label>
              <select
                value={formData.unit}
                onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                className={DARK_INPUT}
              >
                {UNIT_OPTIONS.map((u) => (
                  <option key={u} value={u} className="bg-[#0D1425]">
                    {u}
                  </option>
                ))}
                <option value="Autre" className="bg-[#0D1425]">Autre</option>
              </select>
              {formData.unit === 'Autre' && (
                <input
                  type="text"
                  value={formData.customUnit}
                  onChange={(e) => setFormData({ ...formData, customUnit: e.target.value })}
                  placeholder="Préciser l'unité..."
                  className={`${DARK_INPUT} mt-2`}
                />
              )}
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-[#0B1222] border border-slate-800">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.requiresPrescription}
                onChange={(e) =>
                  setFormData({ ...formData, requiresPrescription: e.target.checked })
                }
                className="mt-0.5 w-5 h-5 rounded-md border-slate-600 bg-slate-900 text-amber-500 cursor-pointer"
              />
              <div>
                <span className="text-sm font-black text-amber-400 flex items-center gap-1.5">
                  <ShieldCheck size={16} />
                  Soumis à ordonnance obligatoire
                </span>
                <p className="text-xs text-slate-400 mt-0.5">
                  Bloque la vente libre au comptoir Pharmacie sans Nom du Prescripteur ou Numéro d&apos;Ordre.
                </p>
              </div>
            </label>
          </div>
        </div>
      )}

      {currentStep === 1 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 animate-in fade-in duration-200">
          <div className="p-5 rounded-2xl bg-[#0B1222] border border-slate-800 space-y-2">
            <label className={DARK_LABEL}>
              Prix de vente unitaire (FCFA) <span className="text-rose-400">*</span>
            </label>
            <div className="relative">
              <CreditCard size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-emerald-400" />
              <input
                type="number"
                min={0}
                value={formData.price}
                onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                placeholder="Ex: 1500"
                className={`${DARK_INPUT} pl-10 text-base font-black text-emerald-400`}
              />
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-[#0B1222] border border-slate-800 space-y-2">
            <label className={DARK_LABEL}>
              Seuil d&apos;alerte stock minimum <span className="text-rose-400">*</span>
            </label>
            <input
              type="number"
              min={1}
              value={formData.seuilAlerte}
              onChange={(e) => setFormData({ ...formData, seuilAlerte: e.target.value })}
              placeholder="Ex: 10"
              className={DARK_INPUT}
            />
          </div>
        </div>
      )}

      {currentStep === 2 && (
        <div className="space-y-4 animate-in fade-in duration-200">
          <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-3 text-emerald-300 text-xs font-bold">
            <FileCheck2 size={18} className="shrink-0" />
            Vérifiez les paramètres du produit avant d&apos;enregistrer.
          </div>
          <div className="p-5 rounded-2xl bg-[#0B1222] border border-slate-800 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <span className="text-slate-400 block">Désignation</span>
              <span className="font-black text-white text-sm">{formData.name}</span>
            </div>
            <div>
              <span className="text-slate-400 block">Famille &amp; Unité</span>
              <span className="font-bold text-slate-200">{selectedFamily} ({selectedUnit})</span>
            </div>
            <div>
              <span className="text-slate-400 block">Prix de vente</span>
              <span className="font-black text-emerald-400 text-sm">{priceNum.toLocaleString()} FCFA</span>
            </div>
            <div>
              <span className="text-slate-400 block">Seuil d&apos;alerte &amp; Ordonnance</span>
              <span className="font-bold text-slate-200">
                Seuil: {thresholdNum} • {formData.requiresPrescription ? 'Ordonnance requise' : 'Vente libre'}
              </span>
            </div>
          </div>
        </div>
      )}
    </MultiStepForm>
  );
};

export default AddMedicationForm;
