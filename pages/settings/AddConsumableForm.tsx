import React, { useState } from 'react';
import { X, Save, AlertCircle, Package, ShieldCheck } from 'lucide-react';

interface AddConsumableFormProps {
  onClose: () => void;
  onSave: (consumable: any) => void;
}

const AddConsumableForm: React.FC<AddConsumableFormProps> = ({ onClose, onSave }) => {
  const [formData, setFormData] = useState({
    nom: '',
    codeInterne: '',
    description: '',
    categorie: 'médical',
    sousCategorie: '',
    servicePrincipal: 'consultation',
    uniteGestion: 'unité',
    seuilAlerte: '10'
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

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

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.nom.trim()) newErrors.nom = 'Le nom du consommable est obligatoire';
    if (!formData.categorie) newErrors.categorie = 'La catégorie est obligatoire';
    if (!formData.uniteGestion) newErrors.uniteGestion = 'L\'unité de mesure est obligatoire';

    if (formData.seuilAlerte && (isNaN(Number(formData.seuilAlerte)) || Number(formData.seuilAlerte) < 0)) {
      newErrors.seuilAlerte = 'Le seuil d\'alerte doit être un nombre positif ou nul';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validateForm()) {
      // Strict inventory rule: newly created consumables strictly start with 0 stock
      // until replenished via a verified Réapprovisionnement (Restocking) cycle.
      onSave({
        nom: formData.nom.trim(),
        name: formData.nom.trim(),
        codeInterne: formData.codeInterne.trim() || `CSM-${Date.now().toString().slice(-6)}`,
        description: formData.description.trim(),
        categorie: formData.categorie,
        sousCategorie: formData.sousCategorie.trim(),
        servicePrincipal: formData.servicePrincipal,
        uniteGestion: formData.uniteGestion,
        unit: formData.uniteGestion,
        seuilAlerte: Number(formData.seuilAlerte) || 10,
        stock: 0,
        stockInitial: 0
      });
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-100">
        
        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center shadow-xs">
              <Package size={22} />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-900">Ajouter un consommable</h2>
              <p className="text-xs text-slate-500 font-medium">Référentiel des consommables médicaux & hospitaliers</p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-2 text-slate-400 hover:bg-slate-200 hover:text-slate-600 rounded-xl transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Form Body - Ultra-lean form without stock input, utilisation, integrations or cost notices */}
        <div className="p-6 overflow-y-auto max-h-[75vh]">
          <form id="consumable-form" onSubmit={handleSubmit} className="space-y-5">
            
            {/* Strict Inventory Accounting Rule Banner */}
            <div className="p-3.5 bg-emerald-50/80 border border-emerald-200/80 rounded-2xl flex items-start gap-3">
              <ShieldCheck className="text-emerald-600 shrink-0 mt-0.5" size={18} />
              <div className="text-xs text-emerald-950">
                <span className="font-extrabold block mb-0.5">Règle comptable stricte d'inventaire</span>
                <span className="text-emerald-800">
                  Le stock initial est automatiquement fixé à <strong>0</strong>. L'entrée de stock s'effectue exclusivement via le cycle officiel de <strong>Réapprovisionnement</strong> avec traçabilité fournisseur et pièce justificative.
                </span>
              </div>
            </div>

            {/* 1. Name & Internal Code */}
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                  Nom du consommable <span className="text-rose-500">*</span>
                </label>
                <input 
                  type="text" 
                  value={formData.nom}
                  onChange={(e) => handleInputChange('nom', e.target.value)}
                  className={`w-full p-3 bg-white border rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all text-sm font-semibold text-slate-900 ${errors.nom ? 'border-rose-300 ring-1 ring-rose-200' : 'border-slate-200'}`}
                  placeholder="Ex: Gants stériles taille M, Seringues 5ml, Compresses stériles..."
                  autoFocus
                />
                {errors.nom && <p className="text-xs text-rose-500 mt-1 font-bold">{errors.nom}</p>}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    Catégorie <span className="text-rose-500">*</span>
                  </label>
                  <select 
                    value={formData.categorie}
                    onChange={(e) => handleInputChange('categorie', e.target.value)}
                    className="w-full p-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none text-sm font-semibold text-slate-800"
                  >
                    <option value="médical">Médical / Soins</option>
                    <option value="laboratoire">Laboratoire / Réactifs</option>
                    <option value="chirurgical">Chirurgical / Bloc</option>
                    <option value="administratif">Administratif</option>
                    <option value="technique">Technique / Hygiène</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    Sous-catégorie <span className="text-slate-400 font-normal">(Optionnel)</span>
                  </label>
                  <input 
                    type="text" 
                    value={formData.sousCategorie}
                    onChange={(e) => handleInputChange('sousCategorie', e.target.value)}
                    className="w-full p-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none text-sm font-medium text-slate-800"
                    placeholder="Ex: Protection, Pansement, Injection..."
                  />
                </div>
              </div>

              {/* 2. Unit of Measure & Alert Threshold */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    Unité de mesure (Gestion) <span className="text-rose-500">*</span>
                  </label>
                  <select 
                    value={formData.uniteGestion}
                    onChange={(e) => handleInputChange('uniteGestion', e.target.value)}
                    className="w-full p-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none text-sm font-semibold text-slate-800"
                  >
                    <option value="unité">Unité</option>
                    <option value="boîte">Boîte</option>
                    <option value="paquet">Paquet</option>
                    <option value="lot">Lot</option>
                    <option value="flacon">Flacon</option>
                    <option value="rouleau">Rouleau</option>
                    <option value="seringue">Seringue</option>
                    <option value="tube">Tube</option>
                    <option value="autre">Autre</option>
                  </select>
                  {errors.uniteGestion && <p className="text-xs text-rose-500 mt-1 font-bold">{errors.uniteGestion}</p>}
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    Seuil d'alerte stock <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <input 
                      type="number" 
                      min="0"
                      value={formData.seuilAlerte}
                      onChange={(e) => handleInputChange('seuilAlerte', e.target.value)}
                      className={`w-full p-3 bg-white border rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none text-sm font-bold text-slate-900 pr-16 ${errors.seuilAlerte ? 'border-rose-300 ring-1 ring-rose-200' : 'border-slate-200'}`}
                      placeholder="10"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 capitalize">
                      {formData.uniteGestion || 'unités'}
                    </span>
                  </div>
                  {errors.seuilAlerte && <p className="text-xs text-rose-500 mt-1 font-bold">{errors.seuilAlerte}</p>}
                </div>
              </div>

              {/* 3. Code interne & Service principal */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    Code interne <span className="text-slate-400 font-normal">(Généré auto si vide)</span>
                  </label>
                  <input 
                    type="text" 
                    value={formData.codeInterne}
                    onChange={(e) => handleInputChange('codeInterne', e.target.value)}
                    className="w-full p-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none text-sm font-mono font-medium text-slate-700"
                    placeholder="Ex: CSM-0042"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    Service principal
                  </label>
                  <select 
                    value={formData.servicePrincipal}
                    onChange={(e) => handleInputChange('servicePrincipal', e.target.value)}
                    className="w-full p-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none text-sm font-semibold text-slate-800"
                  >
                    <option value="consultation">Consultation</option>
                    <option value="hospitalisation">Hospitalisation</option>
                    <option value="maternite">Maternité</option>
                    <option value="bloc_operatoire">Bloc opératoire</option>
                    <option value="laboratoire">Laboratoire</option>
                    <option value="accueil">Accueil & Urgences</option>
                    <option value="pharmacie">Pharmacie centrale</option>
                    <option value="administration">Administration</option>
                  </select>
                </div>
              </div>

              {/* 4. Description (facultatif) */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                  Description / Spécifications <span className="text-slate-400 font-normal">(Optionnel)</span>
                </label>
                <textarea 
                  value={formData.description}
                  onChange={(e) => handleInputChange('description', e.target.value)}
                  className="w-full p-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none text-sm font-medium text-slate-700 min-h-[70px]"
                  placeholder="Indications de conservation, conditionnement, etc."
                />
              </div>

            </div>

          </form>
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-slate-100 bg-slate-50/70 flex items-center justify-between">
          <div className="text-xs text-slate-500 font-medium">
            {Object.keys(errors).length > 0 && (
              <span className="text-rose-500 flex items-center gap-1 font-bold">
                <AlertCircle size={14} /> Veuillez remplir les champs obligatoires.
              </span>
            )}
          </div>
          <div className="flex gap-2.5">
            <button 
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl font-bold text-xs text-slate-600 bg-white border border-slate-200 hover:bg-slate-100 transition-colors"
            >
              Annuler
            </button>
            <button 
              type="submit"
              form="consumable-form"
              className="px-6 py-2.5 rounded-xl font-bold text-xs text-white bg-emerald-600 hover:bg-emerald-700 transition-colors flex items-center gap-2 shadow-lg shadow-emerald-600/20"
            >
              <Save size={16} /> Enregistrer le consommable
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

export default AddConsumableForm;
