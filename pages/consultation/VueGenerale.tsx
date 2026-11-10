import React, { useState, useEffect } from 'react';
import { 
  Activity, Thermometer, Heart, Wind, Droplets, 
  Pill, Beaker, FileText, RefreshCw, Edit3, Trash2, Eye,
  Stethoscope, Send, History, Hospital, Calendar, X, Save, Syringe
} from 'lucide-react';
import { collection, doc, setDoc, query, onSnapshot, updateDoc } from 'firebase/firestore';
import { db } from '../../src/firebase';

interface VueGeneraleProps {
  patient: any;
  onAction: (action: string) => void;
}

const VueGenerale: React.FC<VueGeneraleProps> = ({ patient, onAction }) => {
  // Real-time states
  const [realTreatments, setRealTreatments] = useState<any[]>([]);
  const [realExams, setRealExams] = useState<any[]>([]);
  const [lastDiagnosis, setLastDiagnosis] = useState<any | null>(null);

  // Vitals edit modal state
  const [showVitalsModal, setShowVitalsModal] = useState(false);
  const [temp, setTemp] = useState('37.0');
  const [bp, setBp] = useState('120/80');
  const [pulse, setPulse] = useState('72');
  const [spo2, setSpo2] = useState('98');
  const [respRate, setRespRate] = useState('16');
  const [weight, setWeight] = useState('70');
  const [height, setHeight] = useState('170');
  const [isSavingVitals, setIsSavingVitals] = useState(false);

  // Sync vitals from prop when modal opens or patient changes
  useEffect(() => {
    if (patient?.vitals) {
      setTemp(patient.vitals.temp || '37.0');
      setBp(patient.vitals.bp || '120/80');
      setPulse(patient.vitals.pulse || '72');
      setSpo2(patient.vitals.spo2 || '98');
      setRespRate(patient.vitals.respRate || '16');
      setWeight(patient.vitals.weight || '70');
      setHeight(patient.vitals.height || '170');
    }
  }, [patient]);

  // Subscribe to actual active treatments from pending_prescriptions
  useEffect(() => {
    if (!patient?.id) return;
    try {
      const q = query(collection(db, 'pending_prescriptions'));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const treatMap = new Map<string, any>();
        snapshot.docs.forEach((docSnap) => {
          const data = docSnap.data();
          if (data.patientId === patient.id || String(data.patientId) === String(patient.id)) {
            (data.items || []).forEach((it: any, idx: number) => {
              const uniqueKey = `${docSnap.id}-${it.name?.toLowerCase().trim()}`;
              if (!treatMap.has(uniqueKey)) {
                treatMap.set(uniqueKey, {
                  id: `${docSnap.id}-${idx}`,
                  name: it.name,
                  posology: it.posology || '1 comp x3/jour',
                  status: data.status || 'pending'
                });
              }
            });
          }
        });
        setRealTreatments(Array.from(treatMap.values()));
      });
      return () => unsubscribe();
    } catch (err) {
      console.error("Error listening to pending prescriptions:", err);
    }
  }, [patient?.id]);

  // Subscribe to actual requested exams from lab_requests
  useEffect(() => {
    if (!patient?.id) return;
    try {
      const q = query(collection(db, 'lab_requests'));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const examMap = new Map<string, any>();
        snapshot.docs.forEach((docSnap) => {
          const data = docSnap.data();
          if (data.patientId === patient.id || String(data.patientId) === String(patient.id)) {
            (data.exams || []).forEach((ex: any, idx: number) => {
              const uniqueKey = `${docSnap.id}-${ex.name?.toLowerCase().trim()}`;
              if (!examMap.has(uniqueKey)) {
                examMap.set(uniqueKey, {
                  id: `${docSnap.id}-${idx}`,
                  name: ex.name,
                  status: data.status || 'en attente'
                });
              }
            });
          }
        });
        setRealExams(Array.from(examMap.values()));
      });
      return () => unsubscribe();
    } catch (err) {
      console.error("Error listening to lab requests:", err);
    }
  }, [patient?.id]);

  // Subscribe to actual diagnostics from consultations
  useEffect(() => {
    if (!patient?.id) return;
    try {
      const q = query(collection(db, 'consultations'));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const diagMap = new Map<string, any>();
        snapshot.docs.forEach((docSnap) => {
          const data = docSnap.data();
          if (data.patientId === patient.id || String(data.patientId) === String(patient.id)) {
            if (!diagMap.has(docSnap.id)) {
              diagMap.set(docSnap.id, {
                id: docSnap.id,
                name: data.diagnosis || 'Diagnostic non précisé',
                date: data.date || 'Récemment',
                createdAt: data.createdAt || ''
              });
            }
          }
        });
        
        const list = Array.from(diagMap.values());
        // Sort descending by createdAt ISO string
        list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
        
        if (list.length > 0) {
          setLastDiagnosis(list[0]);
        } else {
          setLastDiagnosis(null);
        }
      });
      return () => unsubscribe();
    } catch (err) {
      console.error("Error listening to consultations:", err);
    }
  }, [patient?.id]);

  // Handle vitals save to Firestore
  const handleSaveVitals = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patient?.id) return;
    setIsSavingVitals(true);
    try {
      const patientRef = doc(db, 'patients', patient.id);
      const updatedVitals = {
        temp: String(temp),
        bp: String(bp),
        pulse: String(pulse),
        spo2: String(spo2),
        respRate: String(respRate),
        weight: Number(weight) || 70,
        height: Number(height) || 170
      };

      await updateDoc(patientRef, {
        vitals: updatedVitals
      });

      // Write an audit log
      const logRef = doc(collection(db, 'audit_logs'));
      await setDoc(logRef, {
        user: 'Docteur',
        role: 'DOCTOR',
        date: new Date().toLocaleDateString('fr-FR'),
        time: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
        timestamp: new Date().toISOString(),
        action: `Mise à jour paramètres vitaux`,
        details: { patientId: patient.id, vitals: updatedVitals },
        module: 'Consultation'
      });

      setShowVitalsModal(false);
    } catch (err) {
      console.error("Error updating patient vitals:", err);
    } finally {
      setIsSavingVitals(false);
    }
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-500">
      {/* Quick Actions */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5 animate-in fade-in duration-500">
        <button 
          onClick={() => onAction('MEDICAL')}
          className="flex flex-col items-center justify-center p-3 bg-blue-50 text-blue-700 border border-blue-200 rounded-2xl hover:bg-blue-600 hover:text-white hover:border-blue-600 transition-all shadow-xs hover:shadow-md hover:shadow-blue-600/10 group cursor-pointer"
        >
          <Stethoscope size={18} className="mb-1.5 text-blue-600 group-hover:text-white group-hover:scale-110 transition-all" />
          <span className="text-[9px] font-black uppercase tracking-wider text-center">Consultation</span>
        </button>
        <button 
          onClick={() => onAction('SOINS')}
          className="flex flex-col items-center justify-center p-3 bg-teal-50 text-teal-700 border border-teal-200 rounded-2xl hover:bg-teal-600 hover:text-white hover:border-teal-600 transition-all shadow-xs hover:shadow-md hover:shadow-teal-600/10 group cursor-pointer"
        >
          <Syringe size={18} className="mb-1.5 text-teal-600 group-hover:text-white group-hover:scale-110 transition-all" />
          <span className="text-[9px] font-black uppercase tracking-wider text-center">Prescrire Soin</span>
        </button>
        <button 
          onClick={() => onAction('PRESCRIPTION')}
          className="flex flex-col items-center justify-center p-3 bg-slate-50 text-slate-700 border border-slate-200 rounded-2xl hover:bg-slate-100 hover:text-slate-900 hover:border-slate-300 transition-all shadow-xs group cursor-pointer"
        >
          <Pill size={18} className="mb-1.5 text-slate-500 group-hover:text-slate-800 group-hover:scale-110 transition-all" />
          <span className="text-[9px] font-black uppercase tracking-wider text-center">Ordonnance</span>
        </button>
        <button 
          onClick={() => onAction('EXAMS')}
          className="flex flex-col items-center justify-center p-3 bg-slate-50 text-slate-700 border border-slate-200 rounded-2xl hover:bg-slate-100 hover:text-slate-900 hover:border-slate-300 transition-all shadow-xs group cursor-pointer"
        >
          <Beaker size={18} className="mb-1.5 text-slate-500 group-hover:text-slate-800 group-hover:scale-110 transition-all" />
          <span className="text-[9px] font-black uppercase tracking-wider text-center">Résultats Lab</span>
        </button>
        <button 
          onClick={() => onAction('HISTORY')}
          className="flex flex-col items-center justify-center p-3 bg-slate-50 text-slate-700 border border-slate-200 rounded-2xl hover:bg-slate-100 hover:text-slate-900 hover:border-slate-300 transition-all shadow-xs group cursor-pointer"
        >
          <History size={18} className="mb-1.5 text-slate-500 group-hover:text-slate-800 group-hover:scale-110 transition-all" />
          <span className="text-[9px] font-black uppercase tracking-wider text-center">Historique</span>
        </button>
        <button 
          onClick={() => onAction('HOSPITALIZE')}
          className="flex flex-col items-center justify-center p-3 bg-amber-50 text-amber-700 border border-amber-200 rounded-2xl hover:bg-amber-500 hover:text-white hover:border-amber-500 transition-all shadow-xs hover:shadow-md hover:shadow-amber-500/10 group cursor-pointer"
        >
          <Hospital size={18} className="mb-1.5 text-amber-600 group-hover:text-white group-hover:scale-110 transition-all" />
          <span className="text-[9px] font-black uppercase tracking-wider text-center">Hospitaliser</span>
        </button>
        <button 
          onClick={() => onAction('APPOINTMENT')}
          className="flex flex-col items-center justify-center p-3 bg-slate-50 text-slate-700 border border-slate-200 rounded-2xl hover:bg-slate-100 hover:text-slate-900 hover:border-slate-300 transition-all shadow-xs group cursor-pointer"
        >
          <Calendar size={18} className="mb-1.5 text-slate-500 group-hover:text-slate-800 group-hover:scale-110 transition-all" />
          <span className="text-[9px] font-black uppercase tracking-wider text-center">Planifier RDV</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Vitals Section */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
              <Activity className="text-blue-600" size={18} /> Paramètres vitaux du jour
            </h3>
            <button 
              onClick={() => setShowVitalsModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 text-slate-600 rounded-xl text-[9px] font-black uppercase tracking-wider hover:bg-blue-600 hover:text-white transition-all cursor-pointer"
            >
              <RefreshCw size={12} /> Mettre à jour
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100 text-center hover:border-blue-200 transition-colors">
              <Activity size={16} className="mx-auto mb-1.5 text-blue-600" />
              <p className="text-[8.5px] font-black text-slate-400 uppercase mb-0.5">TA</p>
              <p className="text-sm font-black text-slate-900">{patient.vitals?.bp || '--'}</p>
            </div>
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100 text-center hover:border-rose-200 transition-colors">
              <Heart size={16} className="mx-auto mb-1.5 text-rose-600" />
              <p className="text-[8.5px] font-black text-slate-400 uppercase mb-0.5">FC</p>
              <p className="text-sm font-black text-slate-900">{patient.vitals?.pulse || '--'}</p>
            </div>
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100 text-center hover:border-emerald-200 transition-colors">
              <Wind size={16} className="mx-auto mb-1.5 text-emerald-600" />
              <p className="text-[8.5px] font-black text-slate-400 uppercase mb-0.5">FR</p>
              <p className="text-sm font-black text-slate-900">{patient.vitals?.respRate || '--'}</p>
            </div>
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100 text-center hover:border-amber-200 transition-colors">
              <Thermometer size={16} className="mx-auto mb-1.5 text-amber-600" />
              <p className="text-[8.5px] font-black text-slate-400 uppercase mb-0.5">Temp</p>
              <p className="text-sm font-black text-slate-900">{patient.vitals?.temp || '--'}°C</p>
            </div>
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100 text-center hover:border-sky-200 transition-colors">
              <Droplets size={16} className="mx-auto mb-1.5 text-sky-400" />
              <p className="text-[8.5px] font-black text-slate-400 uppercase mb-0.5">SpO2</p>
              <p className="text-sm font-black text-slate-900">{patient.vitals?.spo2 || '--'}%</p>
            </div>
          </div>
        </div>

        {/* Last Diagnosis */}
        <div className="bg-slate-900 rounded-2xl p-5 text-white shadow-md flex flex-col justify-between">
          <div>
            <h3 className="text-base font-black mb-3 flex items-center gap-2">
              <FileText className="text-blue-400" size={18} /> Dernier diagnostic
            </h3>
            {lastDiagnosis ? (
              <div className="bg-white/10 rounded-xl p-3.5 border border-white/10 animate-in fade-in duration-300">
                <p className="text-[8.5px] font-black text-blue-300 uppercase tracking-wider mb-1">Diagnostic Principal</p>
                <p className="text-base font-black mb-1">{lastDiagnosis.name}</p>
                <p className="text-xs text-slate-400 font-medium italic">Posé le {lastDiagnosis.date}</p>
              </div>
            ) : (
              <div className="bg-white/5 rounded-xl p-4 border border-white/5 text-center">
                <p className="text-xs text-slate-400 italic">Aucun diagnostic enregistré pour ce patient.</p>
              </div>
            )}
          </div>
          <button 
            onClick={() => onAction('HISTORY')}
            className="w-full mt-3 py-2.5 bg-blue-600 hover:bg-blue-700 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer"
          >
            Voir détails complets
          </button>
        </div>

        {/* Treatments Section */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
              <Pill className="text-emerald-600" size={18} /> Traitements actifs
            </h3>
          </div>
          <div className="space-y-2.5 max-h-[220px] overflow-y-auto pr-1">
            {realTreatments.length > 0 ? (
              realTreatments.map(t => (
                <div key={t.id} className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-100 group hover:border-emerald-200 transition-all">
                  <div>
                    <p className="text-xs font-black text-slate-900">{t.name}</p>
                    <p className="text-[11px] text-slate-500 font-medium">{t.posology}</p>
                  </div>
                  <span className="text-[8px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">
                    Actif
                  </span>
                </div>
              ))
            ) : (
              <p className="text-xs text-slate-400 italic text-center py-4">Aucun traitement de fond actif.</p>
            )}
          </div>
        </div>

        {/* Exams Section */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
              <Beaker className="text-purple-600" size={18} /> Examens en attente
            </h3>
          </div>
          <div className="space-y-2.5 max-h-[220px] overflow-y-auto pr-1">
            {realExams.length > 0 ? (
              realExams.map(e => (
                <div key={e.id} className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-100">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-purple-50 text-purple-600">
                      <Beaker size={14} />
                    </div>
                    <div>
                      <p className="text-xs font-black text-slate-900">{e.name}</p>
                      <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">{e.status}</p>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-xs text-slate-400 italic text-center py-4">Aucun examen de laboratoire en attente.</p>
            )}
          </div>
        </div>
      </div>

      {/* Vitals Update Modal */}
      {showVitalsModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-300">
          <div className="bg-white rounded-[32px] border border-slate-200 shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 bg-slate-900 text-white flex justify-between items-center">
              <div>
                <h3 className="text-lg font-black flex items-center gap-2">
                  <Activity className="text-blue-400" /> Mettre à jour les paramètres vitaux
                </h3>
                <p className="text-xs text-slate-400 mt-1">Saisie des constantes pour {patient.lastName} {patient.firstName}</p>
              </div>
              <button 
                onClick={() => setShowVitalsModal(false)}
                className="p-2 hover:bg-white/10 rounded-xl transition-colors cursor-pointer text-slate-400 hover:text-white"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveVitals} className="p-8 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Tension Artérielle (TA)</label>
                  <input 
                    type="text" 
                    value={bp} 
                    onChange={e => setBp(e.target.value)}
                    placeholder="ex: 120/80" 
                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-900 focus:outline-none focus:border-blue-600 transition-all"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Fréquence Cardiaque (FC)</label>
                  <input 
                    type="text" 
                    value={pulse} 
                    onChange={e => setPulse(e.target.value)}
                    placeholder="ex: 72 bpm" 
                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-900 focus:outline-none focus:border-blue-600 transition-all"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Fréquence Respiratoire (FR)</label>
                  <input 
                    type="text" 
                    value={respRate} 
                    onChange={e => setRespRate(e.target.value)}
                    placeholder="ex: 16 cpm" 
                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-900 focus:outline-none focus:border-blue-600 transition-all"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Température (°C)</label>
                  <input 
                    type="text" 
                    value={temp} 
                    onChange={e => setTemp(e.target.value)}
                    placeholder="ex: 37.2" 
                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-900 focus:outline-none focus:border-blue-600 transition-all"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Saturation (SpO2 %)</label>
                  <input 
                    type="text" 
                    value={spo2} 
                    onChange={e => setSpo2(e.target.value)}
                    placeholder="ex: 98" 
                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-900 focus:outline-none focus:border-blue-600 transition-all"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Poids (kg)</label>
                  <input 
                    type="number" 
                    value={weight} 
                    onChange={e => setWeight(e.target.value)}
                    placeholder="ex: 75" 
                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-900 focus:outline-none focus:border-blue-600 transition-all"
                    required
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Taille (cm)</label>
                  <input 
                    type="number" 
                    value={height} 
                    onChange={e => setHeight(e.target.value)}
                    placeholder="ex: 178" 
                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-900 focus:outline-none focus:border-blue-600 transition-all"
                    required
                  />
                </div>
              </div>

              <div className="flex gap-4 pt-4 border-t border-slate-100">
                <button 
                  type="button"
                  onClick={() => setShowVitalsModal(false)}
                  className="flex-1 py-4 border border-slate-200 hover:bg-slate-50 text-slate-600 font-bold rounded-2xl transition-all cursor-pointer text-center"
                >
                  Annuler
                </button>
                <button 
                  type="submit"
                  disabled={isSavingVitals}
                  className="flex-1 py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-2xl transition-all cursor-pointer flex items-center justify-center gap-2"
                >
                  {isSavingVitals ? (
                    <RefreshCw className="animate-spin" size={18} />
                  ) : (
                    <>
                      <Save size={18} />
                      Enregistrer
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default VueGenerale;
