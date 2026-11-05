import React, { useState, useEffect } from 'react';
import { Patient, Medication, Prescription } from '../../types';
import { Calculator, AlertTriangle, CheckCircle2, XCircle, Info, Pill, Save, ArrowRight } from 'lucide-react';

interface DosageAssistantProps {
  patient: Patient;
  medications: Medication[];
  onValidate: (prescription: Partial<Prescription>) => void;
  onCancel: () => void;
  embedded?: boolean;
}

const DosageAssistant: React.FC<DosageAssistantProps> = ({ patient, medications, onValidate, onCancel, embedded = false }) => {
  const [selectedMed, setSelectedMed] = useState<Medication | null>(null);
  const [calcType, setCalcType] = useState<'FIXED' | 'MG_KG_PRISE' | 'MG_KG_JOUR'>('MG_KG_PRISE');
  const [targetDose, setTargetDose] = useState<number>(15); // e.g., 15 mg/kg
  const [intervalHours, setIntervalHours] = useState<number>(6); // every 6 hours
  const [duration, setDuration] = useState<number>(5); // days
  const [route, setRoute] = useState<string>('Per os');
  const [indication, setIndication] = useState<string>('');
  
  const [results, setResults] = useState<any>(null);
  const [alerts, setAlerts] = useState<any[]>([]);

  // Calculate whenever inputs change
  useEffect(() => {
    if (!selectedMed || !patient.vitals?.weight) {
      setResults(null);
      return;
    }

    const weight = patient.vitals.weight;
    let dosePerIntake = 0;
    let dosePer24h = 0;
    const frequency = 24 / intervalHours;

    if (calcType === 'FIXED') {
      dosePerIntake = targetDose;
      dosePer24h = targetDose * frequency;
    } else if (calcType === 'MG_KG_PRISE') {
      dosePerIntake = targetDose * weight;
      dosePer24h = dosePerIntake * frequency;
    } else if (calcType === 'MG_KG_JOUR') {
      dosePer24h = targetDose * weight;
      dosePerIntake = dosePer24h / frequency;
    }

    const totalDose = dosePer24h * duration;
    
    // Parse concentration if available (e.g., "500mg/5ml")
    let volumePerIntake = 0;
    let unitsPerIntake = 0;
    
    // Simple parsing for demo purposes
    const dosageMatch = (selectedMed.dosage || selectedMed.dosageValeur || '').match(/(\d+)\s*(mg|g|mcg)/i);
    if (dosageMatch) {
      const medDose = parseFloat(dosageMatch[1]);
      const medUnit = dosageMatch[2].toLowerCase();
      
      let doseInMg = dosePerIntake;
      // Convert to mg if needed
      if (medUnit === 'g') doseInMg = dosePerIntake / 1000;
      
      unitsPerIntake = doseInMg / medDose;
    } else {
      unitsPerIntake = 1; // Default fallback
    }

    const totalUnits = unitsPerIntake * frequency * duration;
    const totalBoxes = selectedMed.quantityPerBox ? Math.ceil(totalUnits / selectedMed.quantityPerBox) : Math.ceil(totalUnits / 30); // Assume 30 per box if not specified

    setResults({
      dosePerIntake,
      dosePer24h,
      totalDose,
      volumePerIntake,
      unitsPerIntake,
      totalUnits,
      totalBoxes
    });

    // Generate Alerts
    const newAlerts = [];
    if (patient.allergies && patient.allergies.some(a => selectedMed.name.toLowerCase().includes(a.toLowerCase()))) {
      newAlerts.push({ type: 'danger', message: `Allergie connue à ${selectedMed.name} ou apparenté.` });
    }
    if (dosePerIntake > 1000) { // Example threshold
      newAlerts.push({ type: 'warning', message: `Dose par prise élevée (> 1000mg). Vérifiez la posologie.` });
    }
    if (selectedMed.stock < totalBoxes) {
      newAlerts.push({ type: 'info', message: `Stock insuffisant en pharmacie (${selectedMed.stock} disponibles, ${totalBoxes} nécessaires).` });
    }
    setAlerts(newAlerts);

  }, [selectedMed, calcType, targetDose, intervalHours, duration, patient.vitals?.weight, patient.allergies]);

  const handleValidate = () => {
    if (!selectedMed || !results) return;
    
    onValidate({
      medicationId: selectedMed.id,
      medicationName: selectedMed.name,
      indication,
      route,
      dosageScheme: `${targetDose} ${calcType === 'FIXED' ? 'mg' : calcType === 'MG_KG_PRISE' ? 'mg/kg/prise' : 'mg/kg/jour'} (/ ${intervalHours}h)`,
      frequency: 24 / intervalHours,
      duration,
      calculationType: calcType,
      dosePerIntake: results.dosePerIntake,
      dosePer24h: results.dosePer24h,
      totalDose: results.totalDose,
      volumePerIntake: results.volumePerIntake,
      unitsPerIntake: results.unitsPerIntake,
      totalUnits: results.totalUnits,
      totalBoxes: results.totalBoxes,
      status: 'VALIDATED'
    });
  };

  return (
    <div className={`bg-white ${embedded ? '' : 'rounded-3xl shadow-xl border border-slate-200'} overflow-hidden flex flex-col ${embedded ? '' : 'max-h-[90vh]'}`}>
      {!embedded && (
        <div className="p-6 bg-indigo-600 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-sm">
              <Calculator size={24} />
            </div>
            <div>
              <h2 className="text-xl font-black tracking-tight">Assistant de Calcul Posologique</h2>
              <p className="text-indigo-100 text-sm font-medium">Sécurisation de la prescription thérapeutique</p>
            </div>
          </div>
          <button onClick={onCancel} className="p-2 hover:bg-white/20 rounded-xl transition-colors">
            <XCircle size={24} />
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-6 space-y-8">
        {/* Bloc 1: Données Patient */}
        <section className="bg-slate-50 rounded-2xl p-5 border border-slate-100">
          <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
            <Info size={16} /> Données Patient
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <span className="block text-xs text-slate-500 mb-1">Identité</span>
              <span className="font-bold text-slate-900">{patient.firstName} {patient.lastName}</span>
            </div>
            <div>
              <span className="block text-xs text-slate-500 mb-1">Âge / Sexe</span>
              <span className="font-bold text-slate-900">
                {new Date().getFullYear() - new Date(patient.birthDate).getFullYear()} ans / {patient.gender}
              </span>
            </div>
            <div>
              <span className="block text-xs text-slate-500 mb-1">Poids</span>
              {patient.vitals?.weight ? (
                <span className="font-bold text-slate-900">{patient.vitals.weight} kg</span>
              ) : (
                <span className="font-bold text-rose-600 flex items-center gap-1"><AlertTriangle size={14} /> Manquant</span>
              )}
            </div>
            <div>
              <span className="block text-xs text-slate-500 mb-1">Allergies</span>
              <span className="font-bold text-rose-600">{patient.allergies?.join(', ') || 'Aucune'}</span>
            </div>
          </div>
          {!patient.vitals?.weight && (
            <div className="mt-4 p-3 bg-rose-50 text-rose-700 rounded-xl text-sm font-medium flex items-center gap-2 border border-rose-100">
              <AlertTriangle size={16} /> Le poids du patient est requis pour les calculs basés sur le poids.
            </div>
          )}
        </section>

        {/* Bloc 2 & 3: Prescription & Présentation */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <section>
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
              <Pill size={16} /> Prescription
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Médicament</label>
                <select 
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500"
                  onChange={(e) => setSelectedMed(medications.find(m => m.id === e.target.value) || null)}
                  value={selectedMed?.id || ''}
                >
                  <option value="">Sélectionner un médicament...</option>
                  {medications.map(m => (
                    <option key={m.id} value={m.id}>{m.name} ({m.dosage})</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Type de calcul</label>
                  <select 
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl"
                    value={calcType}
                    onChange={(e) => setCalcType(e.target.value as any)}
                  >
                    <option value="MG_KG_PRISE">mg/kg/prise</option>
                    <option value="MG_KG_JOUR">mg/kg/jour</option>
                    <option value="FIXED">Dose fixe (mg)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Dose cible</label>
                  <input 
                    type="number" 
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl"
                    value={targetDose}
                    onChange={(e) => setTargetDose(Number(e.target.value))}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Intervalle (heures)</label>
                  <input 
                    type="number" 
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl"
                    value={intervalHours}
                    onChange={(e) => setIntervalHours(Number(e.target.value))}
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Durée (jours)</label>
                  <input 
                    type="number" 
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl"
                    value={duration}
                    onChange={(e) => setDuration(Number(e.target.value))}
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Voie d'administration</label>
                <select 
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl"
                  value={route}
                  onChange={(e) => setRoute(e.target.value)}
                >
                  <option value="Per os">Per os (Oral)</option>
                  <option value="IV">Intraveineuse (IV)</option>
                  <option value="IM">Intramusculaire (IM)</option>
                  <option value="SC">Sous-cutanée (SC)</option>
                  <option value="Locale">Locale</option>
                </select>
              </div>
            </div>
          </section>

          <section>
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
              <CheckCircle2 size={16} /> Résultats & Alertes
            </h3>
            
            {results ? (
              <div className="space-y-6">
                <div className="bg-indigo-50 rounded-2xl p-5 border border-indigo-100">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span className="block text-xs text-indigo-500 mb-1 uppercase font-bold">Dose par prise</span>
                      <span className="text-2xl font-black text-indigo-700">{results.dosePerIntake.toFixed(1)} mg</span>
                    </div>
                    <div>
                      <span className="block text-xs text-indigo-500 mb-1 uppercase font-bold">Dose par 24h</span>
                      <span className="text-2xl font-black text-indigo-700">{results.dosePer24h.toFixed(1)} mg</span>
                    </div>
                    <div>
                      <span className="block text-xs text-indigo-500 mb-1 uppercase font-bold">Unités par prise</span>
                      <span className="text-xl font-bold text-indigo-600">{results.unitsPerIntake.toFixed(2)} unité(s)</span>
                      <span className="block text-[10px] text-indigo-400 font-bold mt-1">TOUTES LES {intervalHours}H</span>
                    </div>
                    <div>
                      <span className="block text-xs text-indigo-500 mb-1 uppercase font-bold">Total cure</span>
                      <span className="text-xl font-bold text-indigo-600">{results.totalBoxes} boîte(s)</span>
                    </div>
                  </div>
                </div>

                {alerts.length > 0 && (
                  <div className="space-y-2">
                    {alerts.map((alert, idx) => (
                      <div key={idx} className={`p-3 rounded-xl flex items-start gap-3 border ${
                        alert.type === 'danger' ? 'bg-rose-50 text-rose-700 border-rose-200' :
                        alert.type === 'warning' ? 'bg-orange-50 text-orange-700 border-orange-200' :
                        'bg-blue-50 text-blue-700 border-blue-200'
                      }`}>
                        <AlertTriangle size={18} className="shrink-0 mt-0.5" />
                        <span className="text-sm font-medium">{alert.message}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 bg-slate-50 rounded-2xl border border-slate-100 border-dashed p-8 text-center">
                <Calculator size={48} className="mb-4 opacity-20" />
                <p className="font-medium">Sélectionnez un médicament et renseignez le poids du patient pour voir les calculs.</p>
              </div>
            )}
          </section>
        </div>
      </div>

      <div className="p-6 bg-slate-50 border-t border-slate-200 flex justify-end gap-4 shrink-0">
        <button 
          onClick={onCancel}
          className="px-6 py-3 rounded-xl font-bold text-slate-600 hover:bg-slate-200 transition-colors"
        >
          Annuler
        </button>
        <button 
          onClick={handleValidate}
          disabled={!results || alerts.some(a => a.type === 'danger')}
          className="px-8 py-3 rounded-xl font-bold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-600/20 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Save size={20} /> {embedded ? 'Enregistrer la posologie' : 'Valider la prescription'}
        </button>
      </div>
    </div>
  );
};

export default DosageAssistant;
