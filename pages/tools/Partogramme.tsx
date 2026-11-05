import React, { useState, useEffect, useRef } from 'react';
import { Baby, Activity, Heart, Clock, Clipboard, Save, TrendingUp, AlertTriangle, CheckCircle2, FileText, Printer, Lock, Plus, Thermometer, Droplets, Syringe, Stethoscope, List, ChevronDown, ChevronUp, BrainCircuit } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Legend } from 'recharts';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { User, PatientStatus } from '../../types';
import { doc, setDoc, updateDoc, collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../../src/firebase';

interface PartogrammeProps {
  user: User;
  patientName: string;
  dossierId: string;
  onFinish?: () => void;
}

interface Observation {
  id: string;
  time: string;
  timestamp: number;
  userId: string;
  userName: string;
  type: 'fetal' | 'labor' | 'maternal' | 'intervention' | 'event';
  // Fetal
  bcf?: number;
  movements?: string;
  molding?: string;
  amnioticFluid?: string;
  // Labor
  dilation?: number;
  descent?: number;
  contractionsCount?: number;
  contractionsDuration?: number;
  contractionsIntensity?: string;
  // Maternal
  bpSys?: number;
  bpDia?: number;
  pulse?: number;
  temp?: number;
  generalState?: string;
  pain?: number;
  bleeding?: string;
  // Interventions
  rom?: boolean;
  oxytocin?: string;
  meds?: string;
  iv?: string;
  analgesia?: string;
  otherInterventions?: string;
  notes?: string;
}

interface Alert {
  id: string;
  time: string;
  type: 'info' | 'vigilance' | 'critical';
  category: 'obstetrical' | 'maternal' | 'fetal';
  message: string;
}

export const Partogramme: React.FC<PartogrammeProps> = ({ user, patientName, dossierId, onFinish }) => {
  const [activeTab, setActiveTab] = useState<'summary' | 'observations' | 'chart' | 'analysis' | 'closure'>('summary');
  const [isClosed, setIsClosed] = useState(false);
  const [closureData, setClosureData] = useState<any>(null);
  
  const [laborInfo, setLaborInfo] = useState({
    gestation: '39 SA',
    parity: 'G2 P1',
    admissionTime: new Date().toISOString().slice(0, 16),
    laborStartTime: '',
    membranes: 'Intactes',
    amnioticFluidInitial: 'Clair',
    initialDilation: 3,
    fetalPresentation: 'Céphalique'
  });

  const [observations, setObservations] = useState<Observation[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  
  const [currentObs, setCurrentObs] = useState<Partial<Observation>>({});
  const [openCard, setOpenCard] = useState<string | null>('labor');

  const partogramRef = useRef<HTMLDivElement>(null);

  const [outcomeInput, setOutcomeInput] = useState('');
  const [maternalOutcome, setMaternalOutcome] = useState('');
  const [neonatalOutcome, setNeonatalOutcome] = useState('');

  const [mode, setMode] = useState<'SIMPLE' | 'ADVANCED'>('SIMPLE');

  useEffect(() => {
    const savedTools = localStorage.getItem('hospital_tools');
    if (savedTools) {
      const parsedTools = JSON.parse(savedTools);
      const partogramTool = parsedTools.find((t: any) => t.code === 'PARTOGRAMME');
      if (partogramTool && partogramTool.mode) {
        setMode(partogramTool.mode);
      }
    }
  }, []);

  useEffect(() => {
    if (observations.length === 0) {
      const initialObs: Observation = {
        id: Date.now().toString(),
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        timestamp: Date.now(),
        userId: user.id,
        userName: user.name,
        type: 'labor',
        dilation: laborInfo.initialDilation,
        amnioticFluid: laborInfo.amnioticFluidInitial,
      };
      setObservations([initialObs]);
    }
  }, []);

  useEffect(() => {
    if (observations.length < 2) return;
    
    const newAlerts: Alert[] = [];
    const latest = observations[observations.length - 1];
    const previous = observations[observations.length - 2];
    
    if (latest.bcf) {
      if (latest.bcf < 110 || latest.bcf > 160) {
        newAlerts.push({
          id: Date.now().toString() + 'f1',
          time: latest.time,
          type: 'critical',
          category: 'fetal',
          message: `Rythme cardiaque fœtal anormal (${latest.bcf} bpm)`
        });
      }
    }

    if (latest.temp && latest.temp > 38) {
      newAlerts.push({
        id: Date.now().toString() + 'm1',
        time: latest.time,
        type: 'vigilance',
        category: 'maternal',
        message: `Température maternelle élevée (${latest.temp}°C)`
      });
    }
    if (latest.bpSys && latest.bpDia) {
      if (latest.bpSys > 140 || latest.bpDia > 90) {
        newAlerts.push({
          id: Date.now().toString() + 'm2',
          time: latest.time,
          type: 'vigilance',
          category: 'maternal',
          message: `Tension artérielle élevée (${latest.bpSys}/${latest.bpDia})`
        });
      }
    }

    if (latest.dilation && previous.dilation) {
      const timeDiffHours = (latest.timestamp - previous.timestamp) / (1000 * 60 * 60);
      if (timeDiffHours > 0) {
        const dilationRate = (latest.dilation - previous.dilation) / timeDiffHours;
        if (latest.dilation >= 4 && dilationRate < 1) {
          newAlerts.push({
            id: Date.now().toString() + 'o1',
            time: latest.time,
            type: 'vigilance',
            category: 'obstetrical',
            message: `Progression lente de la dilatation (${dilationRate.toFixed(1)} cm/h)`
          });
        }
      }
    }

    if (newAlerts.length > 0) {
      setAlerts(prev => [...newAlerts, ...prev]);
    }
  }, [observations]);

  const handleAddObservation = (type: Observation['type']) => {
    if (isClosed) return;
    
    const newObs: Observation = {
      ...currentObs,
      id: Date.now().toString(),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      timestamp: Date.now(),
      userId: user.id,
      userName: user.name,
      type,
    } as Observation;

    setObservations([...observations, newObs]);
    setCurrentObs({});
    setOpenCard(null);
    setActiveTab('summary');
  };

  const confirmClosePartogram = async () => {
    if (outcomeInput.trim()) {
      const data = {
        outcome: outcomeInput,
        maternalOutcome,
        neonatalOutcome,
        closedAt: new Date().toISOString(),
        closedBy: user.name,
        patientName,
        dossierId,
        observations
      };
      
      try {
        // 1. Save partogram to Firestore
        await setDoc(doc(db, 'partograms', dossierId), data);
        
        // 2. Update maternity admission stage
        await updateDoc(doc(db, 'maternity_admissions', dossierId), {
          stage: 'DELIVERY',
          updatedAt: new Date().toISOString()
        });

        // 3. Update patient status to READY_TO_DISCHARGE or INPATIENT depending on outcome
        // For simplicity, we set it to READY_TO_DISCHARGE if it's a simple delivery
        await updateDoc(doc(db, 'patients', dossierId), {
          status: PatientStatus.READY_TO_DISCHARGE
        });

        // 3. Update waiting queue if still there
        const q = query(collection(db, 'service_queues'), where('dmeId', '==', dossierId));
        const snapshot = await onSnapshot(q, (snaps) => {
          snaps.docs.forEach(async (d) => {
            await updateDoc(doc(db, 'service_queues', d.id), {
              status: 'ready_for_discharge'
            });
          });
        });

        setClosureData(data);
        setIsClosed(true);
        if (onFinish) onFinish();
      } catch (error) {
        console.error("Error closing partogram:", error);
        alert("Erreur lors de la clôture du partogramme.");
      }
    }
  };

  const generatePDF = async () => {
    if (!partogramRef.current) return;
    try {
      const canvas = await html2canvas(partogramRef.current, { scale: 2 });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`Partogramme_${patientName.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0,10)}.pdf`);
    } catch (error) {
      console.error("Error generating PDF", error);
    }
  };

  const chartData = observations.filter(o => o.dilation !== undefined || o.descent !== undefined || o.bcf !== undefined).map((obs) => {
    const firstActive = observations.find(o => (o.dilation || 0) >= 4);
    let alertLine = null;
    let actionLine = null;
    
    if (firstActive && obs.timestamp >= firstActive.timestamp) {
      const hoursSinceActive = (obs.timestamp - firstActive.timestamp) / (1000 * 60 * 60);
      alertLine = Math.min(10, (firstActive.dilation || 4) + hoursSinceActive);
      actionLine = Math.min(10, (firstActive.dilation || 4) + (hoursSinceActive - 4));
      if (actionLine < 4) actionLine = null;
    }

    return {
      time: obs.time,
      dilation: obs.dilation,
      descent: obs.descent,
      alert: alertLine,
      action: actionLine,
      bcf: obs.bcf
    };
  });

  const latestObs = observations[observations.length - 1] || {};
  const latestDilation = [...observations].reverse().find(o => o.dilation !== undefined)?.dilation;
  const latestBcf = [...observations].reverse().find(o => o.bcf !== undefined)?.bcf;
  const latestContractions = [...observations].reverse().find(o => o.contractionsCount !== undefined)?.contractionsCount;

  return (
    <div className="space-y-6" ref={partogramRef}>
      {/* Top Banner */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex justify-between items-start">
        <div>
          <h2 className="text-2xl font-black text-slate-900 flex items-center gap-3">
            Partogramme Médical (Papier)
            {isClosed && <span className="bg-slate-100 text-slate-600 text-xs px-3 py-1 rounded-full flex items-center gap-1"><Lock size={14}/> Clôturé</span>}
          </h2>
          <div className="flex items-center gap-4 mt-2 text-sm text-slate-600">
            <p><span className="font-bold text-slate-900">{patientName}</span></p>
            <p>Âge gestationnel: <span className="font-bold">{laborInfo.gestation}</span></p>
            <p>Stade: <span className="font-bold text-pink-600">{latestDilation && latestDilation >= 10 ? 'Expulsion' : latestDilation && latestDilation >= 4 ? 'Phase Active' : 'Phase Latente'}</span></p>
            <p>Entrée: <span className="font-bold">{new Date(laborInfo.admissionTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span></p>
          </div>
        </div>
        <div className="flex gap-3">
          {isClosed && (
            <button onClick={generatePDF} className="bg-blue-600 text-white px-4 py-2 rounded-xl font-bold flex items-center gap-2 hover:bg-blue-700">
              <Printer size={18} /> Exporter PDF
            </button>
          )}
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex gap-2 bg-white p-2 rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
        {[
          { id: 'summary', label: 'Résumé', icon: Clipboard },
          { id: 'observations', label: 'Observations', icon: Plus },
          { id: 'chart', label: 'Graphique', icon: TrendingUp },
          ...(mode === 'ADVANCED' ? [{ id: 'analysis', label: 'Analyse', icon: Activity }] : []),
          { id: 'closure', label: 'Clôture / Rapport', icon: FileText },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm transition-all whitespace-nowrap ${
              activeTab === tab.id 
              ? 'bg-slate-900 text-white shadow-md' 
              : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <tab.icon size={16} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Main Content Area */}
        <div className="lg:col-span-8 space-y-6">
          
          {/* TAB: SUMMARY */}
          {activeTab === 'summary' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                  <p className="text-xs font-bold text-slate-400 uppercase mb-1">Dilatation</p>
                  <p className="text-3xl font-black text-pink-600">{latestDilation !== undefined ? `${latestDilation} cm` : '--'}</p>
                </div>
                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                  <p className="text-xs font-bold text-slate-400 uppercase mb-1">BCF</p>
                  <p className="text-3xl font-black text-emerald-600">{latestBcf !== undefined ? `${latestBcf} bpm` : '--'}</p>
                </div>
                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                  <p className="text-xs font-bold text-slate-400 uppercase mb-1">Contractions</p>
                  <p className="text-3xl font-black text-blue-600">{latestContractions !== undefined ? `${latestContractions}/10m` : '--'}</p>
                </div>
                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                  <p className="text-xs font-bold text-slate-400 uppercase mb-1">État Maternel</p>
                  <p className="text-xl font-bold text-slate-700 mt-1">{latestObs.bpSys ? `${latestObs.bpSys}/${latestObs.bpDia}` : 'Stable'}</p>
                </div>
              </div>

              <div className="bg-pink-50 border border-pink-200 rounded-3xl p-8 text-center">
                <button 
                  onClick={() => setActiveTab('observations')}
                  className="bg-pink-600 text-white px-8 py-4 rounded-2xl font-black text-lg shadow-lg shadow-pink-600/30 hover:bg-pink-500 hover:scale-105 transition-all flex items-center gap-3 mx-auto"
                >
                  <Plus size={24} />
                  Ajouter une observation
                </button>
                <p className="text-pink-600/70 text-sm font-medium mt-4">Saisissez un nouvel événement clinique pour mettre à jour le partogramme.</p>
              </div>

              {mode === 'ADVANCED' && (
                <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                  <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                    <Clock size={16} className="text-blue-500" />
                    Prochaines surveillances attendues
                  </h3>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                      <div className="flex items-center gap-3">
                        <Heart size={18} className="text-emerald-500" />
                        <span className="font-bold text-slate-700">BCF attendu</span>
                      </div>
                      <span className="text-sm font-black text-slate-900">Dans 15 min</span>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                      <div className="flex items-center gap-3">
                        <Activity size={18} className="text-pink-500" />
                        <span className="font-bold text-slate-700">Contractions à réévaluer</span>
                      </div>
                      <span className="text-sm font-black text-slate-900">Dans 15 min</span>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                      <div className="flex items-center gap-3">
                        <Thermometer size={18} className="text-amber-500" />
                        <span className="font-bold text-slate-700">Constantes (TA/Temp)</span>
                      </div>
                      <span className="text-sm font-black text-slate-900">Dans 45 min</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB: OBSERVATIONS */}
          {activeTab === 'observations' && (
            <div className="space-y-4">
              {/* Card: Évolution du travail */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <button 
                  onClick={() => setOpenCard(openCard === 'labor' ? null : 'labor')}
                  className="w-full p-4 flex justify-between items-center bg-slate-50 hover:bg-slate-100 transition-colors"
                >
                  <span className="font-bold text-slate-900 flex items-center gap-2"><Activity size={18} className="text-pink-500"/> Évolution du travail</span>
                  {openCard === 'labor' ? <ChevronUp size={20} className="text-slate-400"/> : <ChevronDown size={20} className="text-slate-400"/>}
                </button>
                {openCard === 'labor' && (
                  <div className="p-6 border-t border-slate-100 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Dilatation (cm)</label>
                        <input type="number" min="0" max="10" value={currentObs.dilation || ''} onChange={e => setCurrentObs({...currentObs, dilation: Number(e.target.value)})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-pink-500" />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Descente (0-5)</label>
                        <input type="number" min="0" max="5" value={currentObs.descent || ''} onChange={e => setCurrentObs({...currentObs, descent: Number(e.target.value)})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-pink-500" />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Contractions / 10m</label>
                        <input type="number" value={currentObs.contractionsCount || ''} onChange={e => setCurrentObs({...currentObs, contractionsCount: Number(e.target.value)})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-pink-500" />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Poche des eaux</label>
                        <select value={currentObs.amnioticFluid || ''} onChange={e => setCurrentObs({...currentObs, amnioticFluid: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-pink-500">
                          <option value="">Sélectionner</option>
                          <option value="Intacte">Intacte</option>
                          <option value="Clair">Rompue - Clair</option>
                          <option value="Teinté">Rompue - Teinté</option>
                          <option value="Méconial">Rompue - Méconial</option>
                        </select>
                      </div>
                    </div>
                    <button onClick={() => handleAddObservation('labor')} className="w-full bg-slate-900 text-white py-3 rounded-xl font-bold hover:bg-slate-800">Enregistrer l'évolution</button>
                  </div>
                )}
              </div>

              {/* Card: Surveillance fœtale */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <button 
                  onClick={() => setOpenCard(openCard === 'fetal' ? null : 'fetal')}
                  className="w-full p-4 flex justify-between items-center bg-slate-50 hover:bg-slate-100 transition-colors"
                >
                  <span className="font-bold text-slate-900 flex items-center gap-2"><Heart size={18} className="text-emerald-500"/> Surveillance fœtale</span>
                  {openCard === 'fetal' ? <ChevronUp size={20} className="text-slate-400"/> : <ChevronDown size={20} className="text-slate-400"/>}
                </button>
                {openCard === 'fetal' && (
                  <div className="p-6 border-t border-slate-100 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">BCF (bpm)</label>
                        <input type="number" value={currentObs.bcf || ''} onChange={e => setCurrentObs({...currentObs, bcf: Number(e.target.value)})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-pink-500" />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Mouvements fœtaux</label>
                        <select value={currentObs.movements || ''} onChange={e => setCurrentObs({...currentObs, movements: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-pink-500">
                          <option value="">Sélectionner</option>
                          <option value="Présents">Présents</option>
                          <option value="Diminués">Diminués</option>
                          <option value="Absents">Absents</option>
                        </select>
                      </div>
                    </div>
                    <button onClick={() => handleAddObservation('fetal')} className="w-full bg-slate-900 text-white py-3 rounded-xl font-bold hover:bg-slate-800">Enregistrer BCF</button>
                  </div>
                )}
              </div>

              {/* Card: Constantes maternelles */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <button 
                  onClick={() => setOpenCard(openCard === 'maternal' ? null : 'maternal')}
                  className="w-full p-4 flex justify-between items-center bg-slate-50 hover:bg-slate-100 transition-colors"
                >
                  <span className="font-bold text-slate-900 flex items-center gap-2"><Thermometer size={18} className="text-amber-500"/> Constantes maternelles</span>
                  {openCard === 'maternal' ? <ChevronUp size={20} className="text-slate-400"/> : <ChevronDown size={20} className="text-slate-400"/>}
                </button>
                {openCard === 'maternal' && (
                  <div className="p-6 border-t border-slate-100 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">TA Systolique</label>
                        <input type="number" value={currentObs.bpSys || ''} onChange={e => setCurrentObs({...currentObs, bpSys: Number(e.target.value)})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-pink-500" />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">TA Diastolique</label>
                        <input type="number" value={currentObs.bpDia || ''} onChange={e => setCurrentObs({...currentObs, bpDia: Number(e.target.value)})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-pink-500" />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Pouls</label>
                        <input type="number" value={currentObs.pulse || ''} onChange={e => setCurrentObs({...currentObs, pulse: Number(e.target.value)})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-pink-500" />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Température (°C)</label>
                        <input type="number" step="0.1" value={currentObs.temp || ''} onChange={e => setCurrentObs({...currentObs, temp: Number(e.target.value)})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-pink-500" />
                      </div>
                    </div>
                    <button onClick={() => handleAddObservation('maternal')} className="w-full bg-slate-900 text-white py-3 rounded-xl font-bold hover:bg-slate-800">Enregistrer Constantes</button>
                  </div>
                )}
              </div>

              {/* Card: Interventions obstétricales */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <button 
                  onClick={() => setOpenCard(openCard === 'intervention' ? null : 'intervention')}
                  className="w-full p-4 flex justify-between items-center bg-slate-50 hover:bg-slate-100 transition-colors"
                >
                  <span className="font-bold text-slate-900 flex items-center gap-2"><Syringe size={18} className="text-blue-500"/> Interventions obstétricales</span>
                  {openCard === 'intervention' ? <ChevronUp size={20} className="text-slate-400"/> : <ChevronDown size={20} className="text-slate-400"/>}
                </button>
                {openCard === 'intervention' && (
                  <div className="p-6 border-t border-slate-100 space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Type d'intervention</label>
                      <input type="text" placeholder="Ex: Pose VVP, Ocytocine, Péridurale..." value={currentObs.otherInterventions || ''} onChange={e => setCurrentObs({...currentObs, otherInterventions: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-pink-500" />
                    </div>
                    <button onClick={() => handleAddObservation('intervention')} className="w-full bg-slate-900 text-white py-3 rounded-xl font-bold hover:bg-slate-800">Enregistrer Intervention</button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB: CHART */}
          {activeTab === 'chart' && (
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
              <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                <TrendingUp size={16} className="text-pink-500" />
                Partogramme Complet
              </h3>
              <div className="h-[500px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 20, right: 30, bottom: 20, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={true} horizontal={true} />
                    <XAxis dataKey="time" />
                    <YAxis yAxisId="left" domain={[0, 10]} ticks={[0,2,4,6,8,10]} label={{ value: 'Dilatation (cm) / Descente', angle: -90, position: 'insideLeft' }} />
                    <YAxis yAxisId="right" orientation="right" domain={[80, 200]} label={{ value: 'BCF (bpm)', angle: 90, position: 'insideRight' }} />
                    <Tooltip />
                    <Legend />
                    <ReferenceLine yAxisId="left" y={10} stroke="green" strokeDasharray="3 3" label="Pleine Dilatation" />
                    <Line yAxisId="left" type="monotone" dataKey="dilation" name="Dilatation" stroke="#db2777" strokeWidth={3} dot={{ r: 5 }} activeDot={{ r: 8 }} connectNulls />
                    <Line yAxisId="left" type="monotone" dataKey="descent" name="Descente" stroke="#3b82f6" strokeWidth={2} dot={{ r: 4, shape: 'triangle' }} connectNulls />
                    <Line yAxisId="left" type="linear" dataKey="alert" name="Ligne d'alerte" stroke="#f59e0b" strokeDasharray="5 5" dot={false} connectNulls />
                    <Line yAxisId="left" type="linear" dataKey="action" name="Ligne d'action" stroke="#ef4444" strokeDasharray="5 5" dot={false} connectNulls />
                    <Line yAxisId="right" type="monotone" dataKey="bcf" name="BCF" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} opacity={0.5} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* TAB: ANALYSIS */}
          {activeTab === 'analysis' && (
            <div className="space-y-6">
              <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                  <Activity size={16} className="text-blue-500" />
                  Analyse de Progression
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                    <p className="text-xs font-bold text-slate-500 uppercase mb-2">Progression du travail</p>
                    <p className="text-lg font-bold text-slate-900">Normale</p>
                    <p className="text-sm text-slate-600 mt-1">La dilatation suit la courbe attendue. Aucune déviation majeure détectée.</p>
                  </div>
                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                    <p className="text-xs font-bold text-slate-500 uppercase mb-2">État Fœtal</p>
                    <p className="text-lg font-bold text-emerald-600">Rassurant</p>
                    <p className="text-sm text-slate-600 mt-1">BCF stable dans les normes (110-160 bpm). Variabilité présente.</p>
                  </div>
                </div>
              </div>

              <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                  <TrendingUp size={16} className="text-purple-500" />
                  Projections Prudentes
                </h3>
                <div className="p-4 bg-purple-50 rounded-2xl border border-purple-100">
                  <p className="text-sm font-bold text-purple-900">Accouchement estimé</p>
                  <p className="text-2xl font-black text-purple-700 mt-1">Dans ~3 heures</p>
                  <p className="text-xs text-purple-600 mt-2">Basé sur une progression moyenne de 1cm/h en phase active.</p>
                </div>
              </div>
            </div>
          )}

          {/* TAB: CLOSURE */}
          {activeTab === 'closure' && (
            <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
              <h3 className="text-xl font-black text-slate-900 mb-6 flex items-center gap-2">
                <CheckCircle2 size={24} className="text-emerald-500" />
                Clôture du Partogramme
              </h3>
              
              {isClosed ? (
                <div className="text-center py-8">
                  <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
                    <CheckCircle2 size={40} />
                  </div>
                  <h4 className="text-2xl font-bold text-slate-900 mb-2">Partogramme Clôturé</h4>
                  <p className="text-slate-500 mb-6">Ce partogramme a été clôturé par {closureData?.closedBy} le {new Date(closureData?.closedAt).toLocaleString()}.</p>
                  <button onClick={generatePDF} className="bg-blue-600 text-white px-6 py-3 rounded-xl font-bold inline-flex items-center gap-2 hover:bg-blue-700">
                    <Printer size={20} /> Générer le rapport PDF
                  </button>
                </div>
              ) : (
                <div className="space-y-6 max-w-2xl">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">Issue de l'accouchement</label>
                    <select 
                      value={outcomeInput}
                      onChange={(e) => setOutcomeInput(e.target.value)}
                      className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:border-pink-500"
                    >
                      <option value="">Sélectionner...</option>
                      <option value="Voie basse spontanée">Voie basse spontanée</option>
                      <option value="Voie basse instrumentale (Forceps)">Voie basse instrumentale (Forceps)</option>
                      <option value="Voie basse instrumentale (Ventouse)">Voie basse instrumentale (Ventouse)</option>
                      <option value="Césarienne d'urgence">Césarienne d'urgence</option>
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">Issue Maternelle</label>
                    <input 
                      type="text" 
                      value={maternalOutcome}
                      onChange={(e) => setMaternalOutcome(e.target.value)}
                      placeholder="Ex: Bonne, Hémorragie de la délivrance..." 
                      className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:border-pink-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">Issue Néonatale</label>
                    <input 
                      type="text" 
                      value={neonatalOutcome}
                      onChange={(e) => setNeonatalOutcome(e.target.value)}
                      placeholder="Ex: Vivant, Apgar 9/10, Poids 3200g..." 
                      className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:border-pink-500"
                    />
                  </div>
                  
                  <button 
                    onClick={confirmClosePartogram}
                    disabled={!outcomeInput.trim()}
                    className="w-full py-4 rounded-2xl font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors mt-4"
                  >
                    Clôturer définitivement
                  </button>
                  <p className="text-xs text-slate-500 text-center">Attention : La clôture est définitive et verrouille toute nouvelle saisie.</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Column: Alerts & History */}
        <div className="lg:col-span-4 space-y-6">
            {/* Alerts Panel */}
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
              <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                <AlertTriangle size={16} className="text-amber-500" />
                Alertes & Vigilance
              </h3>
              {alerts.filter(a => mode === 'ADVANCED' || a.type === 'critical').length > 0 ? (
                <div className="space-y-3 max-h-60 overflow-y-auto pr-2">
                  {alerts.filter(a => mode === 'ADVANCED' || a.type === 'critical').map((alert) => (
                    <div key={alert.id} className={`p-3 rounded-xl border flex items-start gap-3 ${
                      alert.type === 'critical' ? 'bg-rose-50 border-rose-200 text-rose-800' :
                      alert.type === 'vigilance' ? 'bg-amber-50 border-amber-200 text-amber-800' :
                      'bg-blue-50 border-blue-200 text-blue-800'
                    }`}>
                      <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs">{alert.time}</span>
                        </div>
                        <p className="text-xs mt-1 font-medium">{alert.message}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6 bg-slate-50 rounded-2xl border border-slate-100">
                  <CheckCircle2 size={24} className="text-emerald-400 mx-auto mb-2" />
                  <p className="text-sm font-bold text-slate-600">Aucune alerte active</p>
                </div>
              )}
            </div>

            {/* History Panel */}
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex-1">
              <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                <List size={16} className="text-slate-500" />
                Historique Chronologique
              </h3>
              <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
                {observations.slice().reverse().map((obs) => (
                  <div key={obs.id} className="border-l-2 border-slate-200 pl-4 pb-4 relative">
                    <div className={`absolute w-2 h-2 rounded-full -left-[5px] top-1 ${
                      obs.type === 'fetal' ? 'bg-emerald-500' :
                      obs.type === 'labor' ? 'bg-pink-500' :
                      obs.type === 'maternal' ? 'bg-amber-500' :
                      'bg-blue-500'
                    }`}></div>
                    <div className="flex justify-between items-start">
                      <span className="font-bold text-sm text-slate-900">{obs.time}</span>
                      <span className="text-[10px] text-slate-400 font-medium">{obs.userName}</span>
                    </div>
                    <div className="mt-2 space-y-1 text-xs text-slate-600">
                      {obs.dilation !== undefined && <p>Dilatation: <span className="font-bold text-pink-600">{obs.dilation} cm</span></p>}
                      {obs.descent !== undefined && <p>Descente: <span className="font-bold text-blue-600">{obs.descent}</span></p>}
                      {obs.bcf !== undefined && <p>BCF: <span className="font-bold text-emerald-600">{obs.bcf} bpm</span></p>}
                      {obs.contractionsCount !== undefined && <p>Contractions: <span className="font-bold">{obs.contractionsCount}/10m</span></p>}
                      {obs.bpSys !== undefined && obs.bpDia !== undefined && <p>TA: <span className="font-bold">{obs.bpSys}/{obs.bpDia}</span></p>}
                      {obs.temp !== undefined && <p>Température: <span className="font-bold">{obs.temp}°C</span></p>}
                      {obs.otherInterventions && <p className="text-slate-800 bg-slate-50 p-1 rounded mt-1 border border-slate-100">{obs.otherInterventions}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
  );
};
