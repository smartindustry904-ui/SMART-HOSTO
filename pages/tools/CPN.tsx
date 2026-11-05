import React, { useState, useEffect } from 'react';
import { User, PregnancyDossier, CPNVisit, CPNExam, CPNPrevention, LabExamRequest, ResultatLaboratoire } from '../../types';
import { Baby, Activity, Heart, Clock, Clipboard, Save, TrendingUp, AlertTriangle, CheckCircle2, FileText, Printer, Plus, Thermometer, Droplets, Syringe, Stethoscope, List, ChevronDown, ChevronUp, Calendar, Beaker, BedDouble, X } from 'lucide-react';
import LabExamRequestForm from '../../components/LabExamRequestForm';
import LabResultViewer from '../../components/LabResultViewer';
import { collection, query, where, onSnapshot, doc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../../src/firebase';

interface CPNProps {
  user: User;
  patientId?: string;
  patientName?: string;
  dossierId?: string;
  onFinish?: () => void;
}

export const CPN: React.FC<CPNProps> = ({ user, patientId, patientName, dossierId, onFinish }) => {
  const [activeTab, setActiveTab] = useState<'summary' | 'consultation' | 'exams' | 'prevention' | 'plan'>('summary');
  const [mode, setMode] = useState<'SIMPLE' | 'ADVANCED'>('SIMPLE');
  const [viewMode, setViewMode] = useState<'list' | 'dossier'>('list');
  const [selectedPregnancy, setSelectedPregnancy] = useState<PregnancyDossier | null>(null);
  const [showLabExamForm, setShowLabExamForm] = useState(false);
  const [isLabExamEnabled, setIsLabExamEnabled] = useState(false);
  const [pregnancies, setPregnancies] = useState<PregnancyDossier[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [exams, setExams] = useState<CPNExam[]>([]);
  const [labExams, setLabExams] = useState<CPNExam[]>([]);
  const [labResults, setLabResults] = useState<ResultatLaboratoire[]>([]);
  const [selectedLabResult, setSelectedLabResult] = useState<ResultatLaboratoire | null>(null);
  const [preventions, setPreventions] = useState<CPNPrevention[]>([]);
  const [followUpPlans, setFollowUpPlans] = useState<any[]>([]);
  const [showNewDossierForm, setShowNewDossierForm] = useState(false);
  const [newDossierData, setNewDossierData] = useState({
    ddr: new Date().toISOString().split('T')[0],
    gestity: 1,
    parity: 0
  });

  // Utilities
  const calculateGestationalAge = (ddr: string): number => {
    if (!ddr) return 0;
    const ddrDate = new Date(ddr);
    const today = new Date();
    const diffTime = today.getTime() - ddrDate.getTime();
    if (diffTime < 0) return 0;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return Math.floor(diffDays / 7);
  };

  const calculateDPA = (ddr: string): string => {
    if (!ddr) return '';
    const ddrDate = new Date(ddr);
    const dpaDate = new Date(ddrDate);
    dpaDate.setDate(dpaDate.getDate() + 280); // 40 weeks
    return dpaDate.toISOString().split('T')[0];
  };

  const getOMSCalendar = (ddr: string) => {
    if (!ddr) return [];
    const ddrDate = new Date(ddr);
    const schedule = [
      { weeks: 12 },
      { weeks: 20 },
      { weeks: 26 },
      { weeks: 30 },
      { weeks: 34 },
      { weeks: 36 },
      { weeks: 38 },
      { weeks: 40 },
    ];

    return schedule.map((item, i) => {
      const date = new Date(ddrDate);
      date.setDate(date.getDate() + (item.weeks * 7));
      return {
        name: `CPN ${i + 1}`,
        weeks: item.weeks,
        date: date.toISOString().split('T')[0]
      };
    });
  };

  useEffect(() => {
    if (patientId) {
      setIsLoading(true);
      const q = query(collection(db, 'pregnancy_dossiers'), where('patientId', '==', patientId));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const list = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as PregnancyDossier));
        setPregnancies(list);
        if (list.length === 1) {
          setSelectedPregnancy(list[0]);
          setViewMode('dossier');
        } else if (list.length === 0) {
          setViewMode('list');
        }
        setIsLoading(false);
      }, (error) => {
        console.error("Error fetching pregnancies:", error);
        setIsLoading(false);
      });
      return () => unsubscribe();
    } else {
      // If no patientId, maybe show all (for a global view) or nothing
      setViewMode('list');
    }
  }, [patientId]);

  useEffect(() => {
    if (selectedPregnancy) {
      // Listen to CPN specific clinical exams
      const examsQ = query(collection(db, 'cpn_exams'), where('pregnancyId', '==', selectedPregnancy.id));
      const unsubscribeExams = onSnapshot(examsQ, (snapshot) => {
        setExams(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as CPNExam)));
      });

      // Listen to ALL laboratory requests for this patient to show results
      const labQ = query(collection(db, 'lab_requests'), where('patientId', '==', selectedPregnancy.patientId));
      const unsubscribeLab = onSnapshot(labQ, (snapshot) => {
        const requests = snapshot.docs.map(doc => doc.data() as LabExamRequest);
        
        // Fetch results separately
        const resultsQ = query(collection(db, 'lab_results'), where('patientId', '==', selectedPregnancy.patientId));
        const unsubscribeResults = onSnapshot(resultsQ, (resSnapshot) => {
          const results = resSnapshot.docs.map(doc => doc.data() as ResultatLaboratoire);
          setLabResults(results);

          // Merge results into labExams
          const extractedLabExams = requests.flatMap((req: any) => 
            req.exams.map((ex: any) => {
              const res = results.find(r => r.demandeId === req.id);
              const ligne = res?.lignes.find(l => l.examId === ex.actId);
              
              // Formatting results summary
              let resultStr = 'En attente...';
              let isAbnormal = false;
              
              if (res) {
                if (res.statut === 'validé') {
                  if (ligne && ligne.parametres.length > 0) {
                    resultStr = ligne.parametres.map(p => `${p.nom}: ${p.valeur} ${p.unite}`).join(' | ');
                    isAbnormal = ligne.parametres.some(p => p.isAnormal);
                  } else if (ligne?.conclusion) {
                    resultStr = ligne.conclusion;
                  } else {
                    resultStr = 'Résultat validé (voir rapport)';
                  }
                } else {
                  resultStr = `Saisie en cours (${res.statut})`;
                }
              }

              return {
                id: `${req.id}-${ex.actId}`,
                pregnancyId: selectedPregnancy.id,
                name: ex.name,
                type: 'LABORATOIRE',
                status: (req.status === 'validé' || req.status === 'terminé' || (res && res.statut === 'validé')) ? 'FAIT' : (req.status === 'rejeté' ? 'RECOMMANDE' : 'EN_ATTENTE'),
                date: req.date,
                result: resultStr,
                anomalyDetected: isAbnormal || (ex.isAbnormal || false)
              };
            })
          );
          setLabExams(extractedLabExams);
        });

        return () => unsubscribeResults();
      });

      const prevQ = query(collection(db, 'cpn_preventions'), where('pregnancyId', '==', selectedPregnancy.id));
      const unsubscribePrev = onSnapshot(prevQ, (snapshot) => {
        setPreventions(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as CPNPrevention)));
      });

      const planQ = query(collection(db, 'cpn_plans'), where('pregnancyId', '==', selectedPregnancy.id));
      const unsubscribePlan = onSnapshot(planQ, (snapshot) => {
        setFollowUpPlans(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })));
      });

      return () => {
        unsubscribeExams();
        unsubscribeLab();
        unsubscribePrev();
        unsubscribePlan();
      };
    }
  }, [selectedPregnancy]);

  const addExamRecord = async (exam: Partial<CPNExam>) => {
    if (!selectedPregnancy) return;
    const examId = `EXAM-${Date.now()}`;
    await setDoc(doc(db, 'cpn_exams', examId), {
      ...exam,
      id: examId,
      pregnancyId: selectedPregnancy.id,
      date: new Date().toISOString()
    });
  };

  const addPreventionRecord = async (prev: Partial<CPNPrevention>) => {
    if (!selectedPregnancy) return;
    const prevId = `PREV-${Date.now()}`;
    await setDoc(doc(db, 'cpn_preventions', prevId), {
      ...prev,
      id: prevId,
      pregnancyId: selectedPregnancy.id,
      date: new Date().toISOString()
    });
  };

  const addPlanRecord = async (task: string, dueDate: string) => {
    if (!selectedPregnancy) return;
    const planId = `PLAN-${Date.now()}`;
    await setDoc(doc(db, 'cpn_plans', planId), {
      id: planId,
      pregnancyId: selectedPregnancy.id,
      task,
      dueDate,
      status: 'A_VENIR',
      createdAt: new Date().toISOString()
    });
  };

  useEffect(() => {
    const savedTools = localStorage.getItem('hospital_tools');
    if (savedTools) {
      const parsedTools = JSON.parse(savedTools);
      const cpnTool = parsedTools.find((t: any) => t.code === 'CPN_OMS');
      if (cpnTool && cpnTool.mode) {
        setMode(cpnTool.mode);
      }
      const labTool = parsedTools.find((t: any) => t.code === 'BULLETIN_EXAMENS');
      if (labTool && labTool.status === 'ACTIVE' && labTool.authorizedRoles.includes(user.role)) {
        setIsLabExamEnabled(true);
      }
    }
  }, [user.role]);

  const [currentVisit, setCurrentVisit] = useState<Partial<CPNVisit>>({
    date: new Date().toISOString().split('T')[0],
    motif: 'Consultation Prénatale de Routine',
    complaints: [],
    week: 0,
    bpSys: 120,
    bpDia: 80,
    weight: 60,
    temp: 37,
    pulse: 75,
    fundalHeight: 0,
    bcf: 140,
    fetalMovements: true,
    presentation: 'Céphalique',
    conclusion: '',
    isRiskPregnancy: false
  });

  const handleSaveCPN = async () => {
    if (!selectedPregnancy || !patientId) return;

    try {
      const visitId = `CPN-${Date.now()}`;
      const finalVisit: CPNVisit = {
        ...currentVisit,
        id: visitId,
        pregnancyId: selectedPregnancy.id,
        patientId: patientId,
        userId: user.id
      } as CPNVisit;

      // 1. Save visit to Firestore
      await setDoc(doc(db, 'cpn_visits', visitId), finalVisit);

      // 2. Update pregnancy dossier
      await updateDoc(doc(db, 'pregnancy_dossiers', selectedPregnancy.id), {
        cpnCount: (selectedPregnancy.cpnCount || 0) + 1,
        updatedAt: new Date().toISOString()
      });

      // 3. Update patient status and remove from queue
      const q = query(collection(db, 'service_queues'), where('dmeId', '==', patientId));
      const snapshot = await onSnapshot(q, (snaps) => {
        snaps.docs.forEach(async (d) => {
          await updateDoc(doc(db, 'service_queues', d.id), {
            status: 'ready_for_discharge'
          });
        });
      });

      alert("Consultation enregistrée avec succès.");
      if (onFinish) onFinish();
      setActiveTab('summary');
    } catch (error) {
      console.error("Error saving CPN visit:", error);
      alert("Erreur lors de l'enregistrement de la consultation.");
    }
  };

  const handleCreatePregnancy = async () => {
    if (!patientId) return;
    
    try {
      const pregId = `PREG-${Date.now()}`;
      const ddr = newDossierData.ddr;
      const sa = calculateGestationalAge(ddr);
      const dpa = calculateDPA(ddr);

      const newPregnancy: PregnancyDossier = {
        id: pregId,
        patientId: patientId,
        gestity: newDossierData.gestity,
        parity: newDossierData.parity,
        obstetricalHistory: 'Dossier créé',
        ddr: ddr,
        dpa: dpa,
        gestationalAgeWeeks: sa,
        riskFactors: [],
        status: 'A_JOUR',
        cpnCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      await setDoc(doc(db, 'pregnancy_dossiers', pregId), newPregnancy);
      setSelectedPregnancy(newPregnancy);
      setViewMode('dossier');
      setShowNewDossierForm(false);
    } catch (error) {
      console.error("Error creating pregnancy dossier:", error);
    }
  };

  const renderPregnancyList = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-black text-slate-900 flex items-center gap-3">
          <Baby size={28} className="text-pink-600" />
          Suivi des Grossesses (CPN)
          {patientName && <span className="ml-2 text-slate-400 font-normal"> - {patientName}</span>}
        </h2>
        {patientId && !showNewDossierForm && (
          <button 
            onClick={() => setShowNewDossierForm(true)}
            className="bg-pink-600 text-white px-4 py-2 rounded-xl font-bold flex items-center gap-2 hover:bg-pink-700"
          >
            <Plus size={18} /> Nouveau Dossier Grossesse
          </button>
        )}
      </div>

      {showNewDossierForm && (
        <div className="bg-white p-8 rounded-3xl border-2 border-pink-100 shadow-xl animate-in slide-in-from-top-4 duration-300">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-bold text-slate-900">Initialisation du Dossier Grossesse</h3>
            <button onClick={() => setShowNewDossierForm(false)} className="text-slate-400 hover:text-slate-600">
              <X size={20} />
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div>
              <label className="block text-xs font-black text-slate-500 uppercase mb-2">Date Dernières Règles (DDR)</label>
              <input 
                type="date" 
                value={newDossierData.ddr}
                onChange={(e) => setNewDossierData({...newDossierData, ddr: e.target.value})}
                className="w-full p-4 bg-slate-50 border rounded-2xl outline-none focus:border-pink-500 transition-colors" 
              />
            </div>
            <div>
              <label className="block text-xs font-black text-slate-500 uppercase mb-2">Gestité (G)</label>
              <input 
                type="number" 
                min="1"
                value={newDossierData.gestity}
                onChange={(e) => setNewDossierData({...newDossierData, gestity: parseInt(e.target.value)})}
                className="w-full p-4 bg-slate-50 border rounded-2xl outline-none focus:border-pink-500 transition-colors" 
              />
            </div>
            <div>
              <label className="block text-xs font-black text-slate-500 uppercase mb-2">Parité (P)</label>
              <input 
                type="number" 
                min="0"
                value={newDossierData.parity}
                onChange={(e) => setNewDossierData({...newDossierData, parity: parseInt(e.target.value)})}
                className="w-full p-4 bg-slate-50 border rounded-2xl outline-none focus:border-pink-500 transition-colors" 
              />
            </div>
          </div>
          
          <div className="bg-pink-50 p-4 rounded-2xl mb-8 flex justify-between items-center border border-pink-100">
            <div>
              <p className="text-xs font-bold text-pink-600 uppercase">Estimations</p>
              <div className="flex gap-6 mt-1">
                <p className="text-sm font-bold text-slate-900">Âge Gest.: <span className="text-pink-600">{calculateGestationalAge(newDossierData.ddr)} SA</span></p>
                <p className="text-sm font-bold text-slate-900">DPA: <span className="text-pink-600">{calculateDPA(newDossierData.ddr)}</span></p>
              </div>
            </div>
            <div className="flex gap-3">
              <button 
                onClick={() => setShowNewDossierForm(false)}
                className="px-6 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 transition-colors"
              >
                Annuler
              </button>
              <button 
                onClick={handleCreatePregnancy}
                className="px-8 py-3 bg-pink-600 text-white rounded-xl font-bold shadow-lg shadow-pink-600/20 hover:bg-pink-700 transition-all"
              >
                Créer le Dossier
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        {pregnancies.length === 0 ? (
          <div className="p-12 text-center">
            <Baby size={48} className="mx-auto mb-4 text-pink-200" />
            <h3 className="text-lg font-bold text-slate-900 mb-2">Aucun dossier trouvé</h3>
            <p className="text-slate-500 mb-6 max-w-md mx-auto">Cette patiente n'a pas encore de dossier de grossesse enregistré. Veuillez en créer un pour commencer le suivi CPN.</p>
            {!showNewDossierForm && (
              <button 
                onClick={() => setShowNewDossierForm(true)}
                className="bg-pink-600 text-white px-6 py-3 rounded-xl font-bold inline-flex items-center gap-2 hover:bg-pink-700 shadow-lg shadow-pink-600/20"
              >
                <Plus size={18} /> Initialiser le Dossier
              </button>
            )}
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-widest">Patiente</th>
              <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-widest">Âge Gest.</th>
              <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-widest">CPN Réalisées</th>
              <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-widest">Prochaine CPN</th>
              <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-widest">Statut</th>
              <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-widest">Risque</th>
            </tr>
          </thead>
          <tbody>
            {pregnancies.map((preg) => (
              <tr 
                key={preg.id} 
                className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer transition-colors"
                onClick={() => {
                  setSelectedPregnancy(preg);
                  setViewMode('dossier');
                  setActiveTab('summary');
                }}
              >
                <td className="p-4 font-bold text-slate-900">{patientName || `Patiente ${preg.patientId}`}</td>
                <td className="p-4 text-sm text-slate-600">{preg.gestationalAgeWeeks} SA</td>
                <td className="p-4 text-sm text-slate-600">{preg.cpnCount}</td>
                <td className="p-4 text-sm text-slate-600">Dans 2 semaines</td>
                <td className="p-4">
                  <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                    preg.status === 'A_JOUR' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                  }`}>
                    {preg.status.replace('_', ' ')}
                  </span>
                </td>
                <td className="p-4">
                  {preg.riskFactors.length > 0 ? (
                    <span className="flex items-center gap-1 text-amber-600 text-xs font-bold">
                      <AlertTriangle size={14} /> Oui
                    </span>
                  ) : (
                    <span className="text-slate-400 text-xs">Non</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      </div>
    </div>
  );

  const renderDossier = () => {
    if (!selectedPregnancy) return null;

    return (
      <div className="space-y-6">
        {/* Top Banner */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex justify-between items-start">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <button 
                onClick={() => setViewMode('list')}
                className="p-2 hover:bg-slate-100 rounded-xl transition-colors text-slate-500"
              >
                <ChevronDown className="rotate-90" size={20} />
              </button>
              <h2 className="text-2xl font-black text-slate-900 flex items-center gap-3">
                Dossier Grossesse
              </h2>
              <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                selectedPregnancy.status === 'A_JOUR' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
              }`}>
                {selectedPregnancy.status.replace('_', ' ')}
              </span>
            </div>
            <div className="flex items-center gap-4 mt-2 text-sm text-slate-600 ml-12">
              <p><span className="font-bold text-slate-900">{patientName || `Patiente ${selectedPregnancy.patientId}`}</span></p>
              <p>Âge gestationnel: <span className="font-bold">{selectedPregnancy.gestationalAgeWeeks} SA</span></p>
              <p>DPA: <span className="font-bold text-pink-600">{selectedPregnancy.dpa}</span></p>
              <p>Gestité/Parité: <span className="font-bold">G{selectedPregnancy.gestity} P{selectedPregnancy.parity}</span></p>
            </div>
          </div>
          <div className="flex gap-3">
            <button className="bg-blue-600 text-white px-4 py-2 rounded-xl font-bold flex items-center gap-2 hover:bg-blue-700">
              <Printer size={18} /> Rapport CPN
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex gap-2 bg-white p-2 rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
          {[
            { id: 'summary', label: 'Résumé grossesse', icon: Clipboard },
            { id: 'consultation', label: 'Consultation CPN', icon: Stethoscope },
            { id: 'exams', label: 'Examens & Dépistages', icon: Activity },
            { id: 'prevention', label: 'Prévention', icon: Syringe },
            { id: 'plan', label: 'Plan de suivi', icon: Calendar },
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
          <div className="lg:col-span-8 space-y-6">
            
            {/* TAB: SUMMARY */}
            {activeTab === 'summary' && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                    <p className="text-xs font-bold text-slate-400 uppercase mb-1">Âge Gestationnel</p>
                    <p className="text-3xl font-black text-pink-600">{selectedPregnancy.gestationalAgeWeeks} SA</p>
                  </div>
                  <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                    <p className="text-xs font-bold text-slate-400 uppercase mb-1">DPA Estimée</p>
                    <p className="text-xl font-black text-slate-700 mt-2">{selectedPregnancy.dpa}</p>
                  </div>
                  <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                    <p className="text-xs font-bold text-slate-400 uppercase mb-1">CPN Réalisées</p>
                    <p className="text-3xl font-black text-blue-600">{selectedPregnancy.cpnCount}</p>
                  </div>
                  <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                    <p className="text-xs font-bold text-slate-400 uppercase mb-1">Prochaine CPN</p>
                    <p className="text-lg font-bold text-emerald-600 mt-2">Semaine 30</p>
                  </div>
                </div>

                {selectedPregnancy.riskFactors.length > 0 && (
                  <div className="bg-amber-50 border border-amber-200 p-6 rounded-3xl">
                    <h3 className="text-sm font-black text-amber-800 uppercase tracking-widest mb-4 flex items-center gap-2">
                      <AlertTriangle size={18} />
                      Facteurs de Risque
                    </h3>
                    <ul className="list-disc list-inside space-y-2 text-amber-900 font-medium">
                      {selectedPregnancy.riskFactors.map((risk, i) => (
                        <li key={i}>{risk}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                  <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                    <Calendar size={16} className="text-blue-500" />
                    Calendrier OMS des Consultations
                  </h3>
                  <div className="space-y-3">
                    {getOMSCalendar(selectedPregnancy.ddr).map((cpn, i) => {
                      const sa = calculateGestationalAge(selectedPregnancy.ddr);
                      const isPast = sa > cpn.weeks;
                      const isCurrent = sa >= cpn.weeks && sa < cpn.weeks + 4;
                      
                      const status = i < selectedPregnancy.cpnCount ? 'FAIT' : (isCurrent ? 'ATTENDU' : (isPast ? 'RETARD' : 'A_VENIR'));

                      return (
                        <div key={i} className={`flex items-center justify-between p-3 rounded-xl border ${
                          status === 'FAIT' ? 'bg-emerald-50 border-emerald-100' :
                          status === 'ATTENDU' ? 'bg-amber-50 border-amber-200 shadow-sm' :
                          status === 'RETARD' ? 'bg-rose-50 border-rose-200' :
                          'bg-slate-50 border-slate-100'
                        }`}>
                          <div className="flex items-center gap-3">
                            {status === 'FAIT' ? <CheckCircle2 size={18} className="text-emerald-500" /> :
                             status === 'ATTENDU' ? <Clock size={18} className="text-amber-500" /> :
                             status === 'RETARD' ? <AlertTriangle size={18} className="text-rose-500" /> :
                             <div className="w-4 h-4 rounded-full border-2 border-slate-300 ml-0.5"></div>}
                            <span className={`font-bold ${
                              status === 'FAIT' ? 'text-emerald-700' : 
                              status === 'ATTENDU' ? 'text-amber-700' : 
                              status === 'RETARD' ? 'text-rose-700' :
                              'text-slate-500'
                            }`}>
                              {cpn.name} ({cpn.weeks} SA)
                            </span>
                          </div>
                          <span className={`text-sm font-bold ${
                            status === 'FAIT' ? 'text-emerald-600' : 
                            status === 'ATTENDU' ? 'text-amber-600' : 
                            status === 'RETARD' ? 'text-rose-600' :
                            'text-slate-400'
                          }`}>
                            {cpn.date}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* TAB: CONSULTATION */}
            {activeTab === 'consultation' && (
              <div className="space-y-6">
                <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                  <h3 className="text-lg font-black text-slate-900 mb-6 flex items-center gap-2">
                    <Stethoscope size={20} className="text-pink-500" />
                    Nouvelle Consultation CPN
                  </h3>
                  
                  <div className="space-y-8">
                    {/* Motif & Interrogatoire */}
                    <section>
                      <h4 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-4 border-b pb-2">Interrogatoire</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="col-span-2">
                          <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Motif de consultation</label>
                          <input type="text" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-pink-500" placeholder="Ex: CPN de routine, Douleurs..." />
                        </div>
                        <div className="col-span-2">
                          <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Symptômes d'alerte</label>
                          <div className="flex flex-wrap gap-3">
                            {['Mouvements fœtaux diminués', 'Céphalées', 'Douleurs abdominales', 'Saignements', 'Fièvre'].map(symp => (
                              <label key={symp} className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-100">
                                <input type="checkbox" className="rounded text-pink-600 focus:ring-pink-500" />
                                <span className="text-sm font-medium text-slate-700">{symp}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      </div>
                    </section>

                    {/* Constantes Materneles */}
                    <section>
                      <h4 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-4 border-b pb-2">Constantes Maternelles</h4>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase mb-1">TA Systolique</label>
                          <input type="number" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-pink-500" placeholder="mmHg" />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase mb-1">TA Diastolique</label>
                          <input type="number" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-pink-500" placeholder="mmHg" />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Poids</label>
                          <input type="number" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-pink-500" placeholder="kg" />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Température</label>
                          <input type="number" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-pink-500" placeholder="°C" />
                        </div>
                        <div className="col-span-2">
                          <label className="flex items-center gap-2 mt-4 cursor-pointer">
                            <input type="checkbox" className="rounded text-pink-600 focus:ring-pink-500 w-5 h-5" />
                            <span className="text-sm font-bold text-slate-700">Présence d'œdèmes</span>
                          </label>
                        </div>
                      </div>
                    </section>

                    {/* Examen Obstétrical */}
                    <section>
                      <h4 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-4 border-b pb-2">Examen Obstétrical</h4>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Hauteur Utérine</label>
                          <input type="number" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-pink-500" placeholder="cm" />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase mb-1">BCF</label>
                          <input type="number" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-pink-500" placeholder="bpm" />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Présentation</label>
                          <select className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-pink-500">
                            <option>Non déterminée</option>
                            <option>Céphalique</option>
                            <option>Siège</option>
                            <option>Transverse</option>
                          </select>
                        </div>
                      </div>
                    </section>

                    {/* Conclusion */}
                    <section>
                      <h4 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-4 border-b pb-2">Conclusion</h4>
                      <div className="space-y-4">
                        <textarea className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:border-pink-500 h-24" placeholder="Notes cliniques, évolution, recommandations..."></textarea>
                        <div className="flex items-center gap-4">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" className="rounded text-rose-600 focus:ring-rose-500 w-5 h-5" />
                            <span className="text-sm font-bold text-rose-700">Marquer comme grossesse à risque</span>
                          </label>
                        </div>
                      </div>
                    </section>
                  </div>

                  <div className="mt-8 flex justify-end gap-4">
                    <button 
                      onClick={async () => {
                        if (!selectedPregnancy) return;
                        const admissionId = dossierId || patientId;
                        if (!admissionId) return;

                        try {
                          await updateDoc(doc(db, 'maternity_admissions', admissionId), {
                            stage: 'LABOR',
                            updatedAt: new Date().toISOString()
                          });
                          alert("Patiente admise en Salle de Travail.");
                          if (onFinish) onFinish();
                        } catch (error) {
                          console.error("Error admitting to labor:", error);
                        }
                      }}
                      className="bg-indigo-600 text-white px-8 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-indigo-700 shadow-lg shadow-indigo-600/20"
                    >
                      <BedDouble size={20} /> Admettre en Salle de Travail
                    </button>
                    <button 
                      onClick={handleSaveCPN}
                      className="bg-pink-600 text-white px-8 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-pink-700 shadow-lg shadow-pink-600/20"
                    >
                      <Save size={20} /> Enregistrer la CPN
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* TAB: EXAMS */}
            {activeTab === 'exams' && (
              <div className="space-y-6">
                <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                  <div className="flex justify-between items-center mb-6">
                    <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                      <Activity size={20} className="text-blue-500" />
                      Examens & Dépistages
                    </h3>
                    <button 
                      onClick={() => setShowLabExamForm(true)}
                      className="text-blue-600 font-bold text-sm flex items-center gap-1 hover:text-blue-700 bg-blue-50 px-3 py-2 rounded-xl transition-colors"
                    >
                      <Plus size={16} /> Prescrire un examen
                    </button>
                  </div>
                  
                  {exams.length === 0 && labExams.length === 0 ? (
                    <div className="p-8 text-center bg-slate-50 rounded-3xl border border-dashed border-slate-200 text-slate-400">
                      <p className="text-sm">Aucun examen enregistré pour cette grossesse.</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {[...exams, ...labExams].sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime()).map((exam) => {
                        const isLab = exam.type === 'LABORATOIRE';
                        const [demandeId] = isLab ? exam.id.split('-') : [];
                        const hasResult = isLab && labResults.some(r => r.demandeId === demandeId && r.statut === 'validé');

                        return (
                          <div 
                            key={exam.id} 
                            onClick={() => {
                              if (hasResult) {
                                const res = labResults.find(r => r.demandeId === demandeId);
                                if (res) setSelectedLabResult(res);
                              }
                            }}
                            className={`flex items-center justify-between p-4 rounded-2xl border transition-all ${
                              hasResult ? 'bg-emerald-50/30 border-emerald-100 cursor-pointer hover:bg-emerald-50 hover:shadow-md' : 'bg-slate-50 border-slate-100'
                            }`}
                          >
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="font-bold text-slate-900">{exam.name}</p>
                                {hasResult && <div className="bg-emerald-500 w-1.5 h-1.5 rounded-full animate-pulse" />}
                              </div>
                              <p className="text-xs text-slate-500 mt-1 flex items-center gap-2">
                                <span>Date: {new Date(exam.date).toLocaleDateString()}</span>
                                <span>•</span>
                                <span>Type: {exam.type}</span>
                                {hasResult && <span className="text-emerald-600 font-bold ml-1">Cliquez pour voir le rapport</span>}
                              </p>
                            </div>
                            <div className="text-right">
                              <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                exam.status === 'TERMINE' || exam.status === 'FAIT' ? 'bg-emerald-100 text-emerald-700' :
                                exam.status === 'EN_ATTENTE' ? 'bg-amber-100 text-amber-700' :
                                'bg-blue-100 text-blue-700'
                              }`}>
                                {exam.status.replace('_', ' ')}
                              </span>
                              {exam.result && (
                                <div className={`mt-2 p-2 rounded-xl text-sm font-bold flex items-center gap-2 ${
                                  exam.anomalyDetected 
                                    ? 'bg-red-50 text-red-700 border border-red-100' 
                                    : (exam.result !== 'En attente...' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'text-slate-500 font-medium italic')
                                }`}>
                                  {exam.anomalyDetected && <AlertTriangle size={14} className="shrink-0" />}
                                  {exam.result}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB: PREVENTION */}
            {activeTab === 'prevention' && (
              <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                <h3 className="text-lg font-black text-slate-900 mb-6 flex items-center gap-2">
                  <Syringe size={20} className="text-emerald-500" />
                  Prévention & Traitements
                </h3>
                
                <div className="space-y-8">
                  {[
                    { name: 'VAT (Vaccin Anti-Tétanique)', field: 'vat' },
                    { name: 'MILDA (Moustiquaire)', field: 'milda' },
                    { name: 'TPI (Sulfadoxine-Pyriméthamine)', field: 'tpi' },
                    { name: 'Fer + Acide Folique', field: 'fer' }
                  ].map((measure) => {
                    const existing = preventions.filter(p => p.type.toLowerCase().includes(measure.field));
                    return (
                      <div key={measure.field}>
                        <div className="flex justify-between items-center mb-4 border-b pb-2">
                          <h4 className="text-sm font-bold text-slate-400 uppercase tracking-widest">{measure.name}</h4>
                          <button 
                            onClick={() => addPreventionRecord({ 
                              type: measure.name, 
                              category: measure.field === 'vat' ? 'VACCINATION' : (measure.field === 'milda' || measure.field === 'tpi' ? 'PALUDISME' : 'SUPPLEMENTATION'),
                              status: 'FAIT', 
                              name: `Dose ${existing.length + 1}` 
                            })}
                            className="text-pink-600 font-bold text-xs flex items-center gap-1 hover:text-pink-700 bg-pink-50 px-2 py-1 rounded-lg transition-colors"
                          >
                            <Plus size={14} /> Enregistrer dose
                          </button>
                        </div>
                        <div className="space-y-3">
                          {existing.length === 0 ? (
                            <p className="text-[10px] text-slate-400 italic p-2">Aucune donnée enregistrée</p>
                          ) : (
                            existing.map((p, idx) => (
                              <div key={idx} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                <div>
                                  <p className="font-bold text-slate-900">{p.name}</p>
                                  <p className="text-xs text-slate-500 mt-1">Date: {new Date(p.date).toLocaleDateString()}</p>
                                </div>
                                <span className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-xs font-bold">Fait</span>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* TAB: PLAN */}
            {activeTab === 'plan' && (
              <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                <h3 className="text-lg font-black text-slate-900 mb-6 flex items-center gap-2">
                  <Calendar size={20} className="text-purple-500" />
                  Plan de Suivi
                </h3>
                
                <div className="space-y-8">
                  <div className="p-6 bg-purple-50 rounded-2xl border border-purple-100">
                    <h4 className="font-bold text-purple-900 mb-2">Ajouter une échéance</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <input 
                        type="text" 
                        id="plan-task-input"
                        placeholder="Ex: Échographie morphologique" 
                        className="p-3 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:border-purple-500"
                      />
                      <div className="flex gap-2">
                        <input 
                          type="date" 
                          id="plan-date-input"
                          className="flex-1 p-3 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:border-purple-500"
                        />
                        <button 
                          onClick={() => {
                            const task = (document.getElementById('plan-task-input') as HTMLInputElement).value;
                            const date = (document.getElementById('plan-date-input') as HTMLInputElement).value;
                            if (task && date) {
                              addPlanRecord(task, date);
                              (document.getElementById('plan-task-input') as HTMLInputElement).value = '';
                              (document.getElementById('plan-date-input') as HTMLInputElement).value = '';
                            }
                          }}
                          className="px-4 py-2 bg-purple-600 text-white rounded-xl font-bold text-sm hover:bg-purple-700"
                        >
                          Ajouter
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest px-2">Échéances à venir</h4>
                    {followUpPlans.length === 0 ? (
                      <p className="text-sm text-slate-400 italic px-2">Aucune échéance planifiée.</p>
                    ) : (
                      followUpPlans.sort((a, b) => a.dueDate.localeCompare(b.dueDate)).map((item) => (
                        <div key={item.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center">
                              <Calendar size={16} />
                            </div>
                            <div>
                              <p className="font-bold text-slate-900">{item.task}</p>
                              <p className="text-xs text-slate-500">Prévu le: {item.dueDate}</p>
                            </div>
                          </div>
                          <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-[10px] font-black uppercase">
                            {item.status}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Intelligence & Alerts */}
          <div className="lg:col-span-4 space-y-6">
              <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                  <AlertTriangle size={16} className="text-amber-500" />
                  Intelligence Clinique
                </h3>
                
                <div className="space-y-3">
                  <div className="p-3 rounded-xl border bg-amber-50 border-amber-200 text-amber-800 flex items-start gap-3">
                    <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-xs font-bold">Vigilance</p>
                      <p className="text-xs mt-1 font-medium">Bandelette urinaire non réalisée à la dernière CPN. À prévoir aujourd'hui.</p>
                    </div>
                  </div>
                  
                  <div className="p-3 rounded-xl border bg-blue-50 border-blue-200 text-blue-800 flex items-start gap-3">
                    <Activity size={16} className="mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-xs font-bold">Information</p>
                      <p className="text-xs mt-1 font-medium">La patiente est éligible pour la 3ème dose de TPI (SP) selon le protocole OMS.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
        </div>
      </div>
    );
  };

  return (
    <div className="animate-in fade-in duration-500">
      {viewMode === 'list' ? renderPregnancyList() : renderDossier()}

      {showLabExamForm && selectedPregnancy && (
        <LabExamRequestForm
          patientId={selectedPregnancy.patientId}
          patientName={patientName || `Patiente ${selectedPregnancy.patientId}`}
          patientAge="28 ans"
          patientSex="F"
          patientDossier={selectedPregnancy.id}
          prescriberId={user?.id || 'unknown'}
          prescriberName={user?.name || 'Dr. Inconnu'}
          requestingService="Maternité (CPN)"
          onClose={() => setShowLabExamForm(false)}
          onSave={async (request) => {
            try {
              const reqId = `REQ-${Date.now()}`;
              const newRequest: LabExamRequest = {
                ...request,
                id: reqId,
                date: new Date().toISOString(),
                status: 'en attente',
                billingStatus: 'pending'
              };
              
              await setDoc(doc(db, 'lab_requests', reqId), newRequest);

              // Also link to CPN Exams for real-time tracking in dossier
              for (const exam of newRequest.exams) {
                await addExamRecord({
                  name: exam.name,
                  type: 'LABORATOIRE',
                  status: 'EN_ATTENTE',
                  anomalyDetected: false
                });
              }

              // Also create a payment request if needed
              if (newRequest.totalAmount > 0) {
                const payId = `PAY-${Date.now()}`;
                await setDoc(doc(db, 'payment_requests', payId), {
                  id: payId,
                  patientId: newRequest.patientId,
                  patientName: newRequest.patientName,
                  requestingService: 'Maternité',
                  sourceModule: 'Labo',
                  type: 'LABORATOIRE',
                  items: newRequest.exams.map(e => ({
                    id: e.actId,
                    name: e.name,
                    quantity: 1,
                    unitPrice: e.price,
                    totalPrice: e.price
                  })),
                  totalAmount: newRequest.totalAmount,
                  amountPaid: 0,
                  status: 'PENDING',
                  createdAt: new Date().toISOString(),
                  createdBy: user.name
                });
              }

              setShowLabExamForm(false);
            } catch (error) {
              console.error("Error saving lab request:", error);
              alert("Erreur lors de l'enregistrement de la demande d'examen.");
            }
          }}
        />
      )}

      {selectedLabResult && selectedPregnancy && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[40px] w-full max-w-5xl max-h-[90vh] overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300">
            <LabResultViewer
              result={selectedLabResult}
              patientName={selectedPregnancy.patientName}
              onClose={() => setSelectedLabResult(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
};
