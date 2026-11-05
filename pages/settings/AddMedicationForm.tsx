import React, { useState } from 'react';
import { X, Save, Pill, AlertCircle } from 'lucide-react';

interface AddMedicationFormProps {
  onClose: () => void;
  onSave: (medication: {
    name: string;
    family: string;
    unit: string;
    price: number;
    seuilAlerte: number;
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
  'Autre'
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
  'Unité'
];

const AddMedicationForm: React.FC<AddMedicationFormProps> = ({ onClose, onSave }) => {
  const [formData, setFormData] = useState({
    name: '',
    family: 'Antalgiques & Anti-pyrétiques',
    customFamily: '',
    unit: 'Boîte',
    customUnit: '',
    price: '',
    seuilAlerte: '10'
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.name.trim()) {
      newErrors.name = 'La désignation du médicament est obligatoire';
    }
    
    const selectedFamily = formData.family === 'Autre' ? formData.customFamily : formData.family;
    if (!selectedFamily.trim()) {
      newErrors.family = 'La catégorie / famille est requise';
    }

    const selectedUnit = formData.unit === 'Autre' ? formData.customUnit : formData.unit;
    if (!selectedUnit.trim()) {
      newErrors.unit = "L'unité de mesure est requise";
    }

    const priceNum = parseFloat(formData.price);
    if (isNaN(priceNum) || priceNum < 0) {
      newErrors.price = 'Veuillez saisir un prix de vente valide (≥ 0)';
    }

    const thresholdNum = parseInt(formData.seuilAlerte, 10);
    if (isNaN(thresholdNum) || thresholdNum < 1) {
      newErrors.seuilAlerte = "Veuillez saisir un seuil d'alerte valide (≥ 1)";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validate()) {
      const finalFamily = formData.family === 'Autre' ? formData.customFamily.trim() : formData.family;
      const finalUnit = formData.unit === 'Autre' ? formData.customUnit.trim() : formData.unit;

      onSave({
        name: formData.name.trim(),
        family: finalFamily,
        unit: finalUnit,
        price: parseFloat(formData.price),
        seuilAlerte: parseInt(formData.seuilAlerte, 10)
      });
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-100">
        
        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 text-white rounded-xl flex items-center justify-center shadow-md shadow-blue-500/20">
              <Pill size={22} />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-900">Nouveau Médicament</h2>
              <p className="text-xs text-slate-500 font-medium">Ajout d'une référence au catalogue</p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-2 text-slate-400 hover:bg-slate-200 hover:text-slate-600 rounded-xl transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Form Body */}
        <form id="med-form" onSubmit={handleSubmit} className="p-6 space-y-5">
          
          {/* 1. Name */}
          <div>
            <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-700 mb-1.5">
              Désignation / Nom Commercial <span className="text-rose-500">*</span>
            </label>
            <input 
              type="text"
              value={formData.name}
              onChange={(e) => {
                setFormData(prev => ({ ...prev, name: e.target.value }));
                if (errors.name) setErrors(prev => ({ ...prev, name: '' }));
              }}
              placeholder="Ex: Paracétamol 500mg"
              className={`w-full p-3.5 bg-slate-50 border rounded-2xl focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none transition-all font-bold text-slate-900 text-sm ${
                errors.name ? 'border-rose-300 ring-1 ring-rose-300' : 'border-slate-200'
              }`}
            />
            {errors.name && <p className="text-xs text-rose-500 font-bold mt-1">{errors.name}</p>}
          </div>

          {/* 2. Category / Family */}
          <div>
            <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-700 mb-1.5">
              Catégorie / Famille <span className="text-rose-500">*</span>
            </label>
            <select
              value={formData.family}
              onChange={(e) => setFormData(prev => ({ ...prev, family: e.target.value }))}
              className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-2xl focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none font-bold text-slate-900 text-sm"
            >
              {CATEGORY_OPTIONS.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
            {formData.family === 'Autre' && (
              <input
                type="text"
                placeholder="Préciser la catégorie..."
                value={formData.customFamily}
                onChange={(e) => setFormData(prev => ({ ...prev, customFamily: e.target.value }))}
                className="w-full mt-2 p-3 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500"
              />
            )}
            {errors.family && <p className="text-xs text-rose-500 font-bold mt-1">{errors.family}</p>}
          </div>

          {/* 3. Unit of Measurement */}
          <div>
            <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-700 mb-1.5">
              Unité de Mesure / Conditionnement <span className="text-rose-500">*</span>
            </label>
            <select
              value={formData.unit}
              onChange={(e) => setFormData(prev => ({ ...prev, unit: e.target.value }))}
              className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-2xl focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none font-bold text-slate-900 text-sm"
            >
              {UNIT_OPTIONS.map(u => (
                <option key={u} value={u}>{u}</option>
              ))}
              <option value="Autre">Autre...</option>
            </select>
            {formData.unit === 'Autre' && (
              <input
                type="text"
                placeholder="Ex: Flacon 100ml, Suppositoire..."
                value={formData.customUnit}
                onChange={(e) => setFormData(prev => ({ ...prev, customUnit: e.target.value }))}
                className="w-full mt-2 p-3 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500"
              />
            )}
            {errors.unit && <p className="text-xs text-rose-500 font-bold mt-1">{errors.unit}</p>}
          </div>

          {/* 4. Selling Price & 5. Alert Threshold */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-700 mb-1.5">
                Prix de Vente Unitaire <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <input 
                  type="number"
                  min="0"
                  step="1"
                  value={formData.price}
                  onChange={(e) => {
                    setFormData(prev => ({ ...prev, price: e.target.value }));
                    if (errors.price) setErrors(prev => ({ ...prev, price: '' }));
                  }}
                  placeholder="0"
                  className={`w-full p-3.5 bg-slate-50 border rounded-2xl focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none font-bold text-slate-900 text-sm pr-14 ${
                    errors.price ? 'border-rose-300 ring-1 ring-rose-300' : 'border-slate-200'
                  }`}
                />
                <span className="absolute right-3.5 top-1/2 -translate-y-1/2 font-black text-xs text-slate-400">FCFA</span>
              </div>
              {errors.price && <p className="text-xs text-rose-500 font-bold mt-1">{errors.price}</p>}
            </div>

            <div>
              <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-700 mb-1.5">
                Seuil d'Alerte Stock <span className="text-rose-500">*</span>
              </label>
              <input 
                type="number"
                min="1"
                value={formData.seuilAlerte}
                onChange={(e) => {
                  setFormData(prev => ({ ...prev, seuilAlerte: e.target.value }));
                  if (errors.seuilAlerte) setErrors(prev => ({ ...prev, seuilAlerte: '' }));
                }}
                placeholder="10"
                className={`w-full p-3.5 bg-orange-50/50 border rounded-2xl focus:bg-white focus:ring-2 focus:ring-orange-500 outline-none font-bold text-slate-900 text-sm ${
                  errors.seuilAlerte ? 'border-rose-300 ring-1 ring-rose-300' : 'border-orange-200'
                }`}
              />
              {errors.seuilAlerte && <p className="text-xs text-rose-500 font-bold mt-1">{errors.seuilAlerte}</p>}
            </div>
          </div>

          {/* Informational note */}
          <div className="p-3.5 bg-blue-50/60 border border-blue-100 rounded-2xl flex items-start gap-2.5">
            <AlertCircle size={18} className="text-blue-600 shrink-0 mt-0.5" />
            <p className="text-xs font-semibold text-blue-900 leading-relaxed">
              Le médicament sera créé avec un stock de <strong>0 unité</strong>. Vous pourrez réaliser un réapprovisionnement ultérieur pour spécifier le numéro de lot, la date de péremption et la quantité initiale.
            </p>
          </div>

        </form>

        {/* Footer */}
        <div className="p-5 border-t border-slate-100 bg-slate-50/50 flex items-center justify-end gap-3">
          <button 
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl font-bold text-xs text-slate-600 bg-white border border-slate-200 hover:bg-slate-100 transition-colors"
          >
            Annuler
          </button>
          <button 
            type="submit"
            form="med-form"
            className="px-6 py-2.5 rounded-xl font-bold text-xs text-white bg-blue-600 hover:bg-blue-700 transition-colors flex items-center gap-2 shadow-lg shadow-blue-600/20"
          >
            <Save size={16} /> Créer la référence
          </button>
        </div>

      </div>
    </div>
  );
};

export default AddMedicationForm;
