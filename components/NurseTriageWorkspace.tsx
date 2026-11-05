import React, { useState, useMemo } from 'react';
import { 
  Heart, Activity, Thermometer, Scale, Stethoscope, 
  AlertCircle, CheckCircle, Clock, Search, ArrowRight, 
  User, CheckCircle2, AlertTriangle, ChevronRight, Zap, RefreshCw, X
} from 'lucide-react';
import { db, sanitizeData } from '../src/firebase';
import { collection, doc, setDoc, updateDoc, getDoc, getDocs, query, where } from 'firebase/firestore';

interface NurseTriageWorkspaceProps {
  theme?: 'light' | 'dark';
  globalWaitingQueue?: any[];
  user?: any;
  currency?: string;
  onTriageComplete?: () => void;
}

export const NurseTriageWorkspace: React.FC<NurseTriageWorkspaceProps> = ({
  theme = 'light',
  globalWaitingQueue = [],
  user,
  currency = 'CFA',
  onTriageComplete
}) => {
  const [searchFilter, setSearchFilter] = useState('');
  const [activePatient, setActivePatient] = useState<any | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Vitals form state for active patient
  const [vitals, setVitals] = useState({
    bpSys: 120,
    bpDia: 80,
    heartRate: 75,
    pulse: 75,
    respRate: 18,
    spo2: 98,
    temp: 37.0,
    height: 170,
    weight: 70,
    waistCirc: 85,
    bloodGlucose: 1.0,
    painScore: 0,
    glasgowScore: 15,
    clinicalNotes: ''
  });

  // Filter only patients waiting for triage
  const waitingTriageList = useMemo(() => {
    return (globalWaitingQueue || []).filter(q => q.status === 'waiting_triage');
  }, [globalWaitingQueue]);

  const filteredQueue = useMemo(() => {
    if (!searchFilter.trim()) return waitingTriageList;
    const term = searchFilter.toLowerCase();
    return waitingTriageList.filter(p => 
      (p.lastName && p.lastName.toLowerCase().includes(term)) ||
      (p.firstName && p.firstName.toLowerCase().includes(term)) ||
      (p.patientId && p.patientId.toLowerCase().includes(term)) ||
      (p.dmeId && p.dmeId.toLowerCase().includes(term)) ||
      (p.motifLabel && p.motifLabel.toLowerCase().includes(term)) ||
      (p.speciality && p.speciality.toLowerCase().includes(term))
    );
  }, [waitingTriageList, searchFilter]);

  // Dynamic calculated BMI
  const computedBMI = useMemo(() => {
    if (vitals.height > 0 && vitals.weight > 0) {
      const hM = vitals.height / 100;
      return parseFloat((vitals.weight / (hM * hM)).toFixed(1));
    }
    return 0;
  }, [vitals.height, vitals.weight]);

  // Algorithmic Triage Engine
  const assessPriority = useMemo(() => {
    const alerts: string[] = [];
    let priority: 'normal' | 'urgent' | 'critique' = 'normal';

    // 1. Critical Red Flags (Priority: CRITIQUE - Rouge)
    if (vitals.spo2 && vitals.spo2 < 90) {
      priority = 'critique';
      alerts.push('SpO2 critique (< 90%)');
    }
    if (vitals.bpSys && vitals.bpSys < 85) {
      priority = 'critique';
      alerts.push('Hypotension sévère (PAS < 85 mmHg)');
    }
    if (vitals.bpSys && vitals.bpSys >= 200) {
      priority = 'critique';
      alerts.push('Crise hypertensive sévère (PAS >= 200 mmHg)');
    }
    if (vitals.heartRate && (vitals.heartRate < 40 || vitals.heartRate > 140)) {
      priority = 'critique';
      alerts.push('Trouble du rythme critique (FC < 40 ou > 140 bpm)');
    }
    if (vitals.respRate && (vitals.respRate < 8 || vitals.respRate > 32)) {
      priority = 'critique';
      alerts.push('Détresse respiratoire (FR < 8 ou > 32/min)');
    }
    if (vitals.temp && (vitals.temp > 40.0 || vitals.temp < 35.0)) {
      priority = 'critique';
      alerts.push('Température extrême (< 35°C ou > 40°C)');
    }
    if (vitals.glasgowScore && vitals.glasgowScore < 12) {
      priority = 'critique';
      alerts.push('Trouble sévère de la conscience (Glasgow < 12)');
    }

    // 2. Urgent Yellow Flags (Priority: URGENT - Orange if not already critique)
    if (priority !== 'critique') {
      if (vitals.spo2 && vitals.spo2 >= 90 && vitals.spo2 <= 94) {
        priority = 'urgent';
        alerts.push('Hypoxie modérée (SpO2 90-94%)');
      }
      if (vitals.bpSys && ((vitals.bpSys >= 160 && vitals.bpSys < 200) || (vitals.bpSys >= 85 && vitals.bpSys < 95))) {
        priority = 'urgent';
        alerts.push('Tension instable (PAS 160-199 ou 85-94)');
      }
      if (vitals.heartRate && ((vitals.heartRate >= 110 && vitals.heartRate <= 140) || (vitals.heartRate >= 45 && vitals.heartRate < 55))) {
        priority = 'urgent';
        alerts.push('Tachycardie / Bradycardie (FC 110-140 ou 45-54 bpm)');
      }
      if (vitals.temp && (vitals.temp >= 38.8 && vitals.temp <= 40.0)) {
        priority = 'urgent';
        alerts.push('Hyperthermie marquée (38.8°C - 40°C)');
      }
      if (vitals.painScore && vitals.painScore >= 7) {
        priority = 'urgent';
        alerts.push(`Douleur intense (EVA: ${vitals.painScore}/10)`);
      }
      if (vitals.bloodGlucose && (vitals.bloodGlucose < 0.6 || vitals.bloodGlucose > 3.0)) {
        priority = 'urgent';
        alerts.push(`Déséquilibre glycémique majeur (${vitals.bloodGlucose} g/L)`);
      }
    }

    return { priority, alerts };
  }, [vitals]);

  const handleSelectPatientForTriage = (patient: any) => {
    setActivePatient(patient);
    // Preset vitals if existing
    if (patient.vitals) {
      setVitals(prev => ({
        ...prev,
        ...patient.vitals,
        bpSys: patient.vitals.bpSys || (patient.vitals.bp ? parseInt(patient.vitals.bp.split('/')[0]) : 120),
        bpDia: patient.vitals.bpDia || (patient.vitals.bp ? parseInt(patient.vitals.bp.split('/')[1]) : 80),
        temp: patient.vitals.temp || 37.0,
        height: patient.vitals.height || 170,
        weight: patient.vitals.weight || 70,
        spo2: patient.vitals.spo2 || 98,
        pulse: patient.vitals.pulse || 75,
        heartRate: patient.vitals.heartRate || patient.vitals.pulse || 75
      }));
    } else {
      setVitals({
        bpSys: 120,
        bpDia: 80,
        heartRate: 75,
        pulse: 75,
        respRate: 18,
        spo2: 98,
        temp: 37.0,
        height: 170,
        weight: 70,
        waistCirc: 85,
        bloodGlucose: 1.0,
        painScore: 0,
        glasgowScore: 15,
        clinicalNotes: ''
      });
    }
  };

  const handleValidateTriage = async () => {
    if (!activePatient) return;
    setIsSubmitting(true);
    try {
      const today = new Date();
      const nurseName = user?.name || user?.email || 'Infirmier(ère) de Triage';

      const finalVitalsData = {
        bpSys: vitals.bpSys,
        bpDia: vitals.bpDia,
        bp: `${vitals.bpSys}/${vitals.bpDia}`,
        heartRate: vitals.heartRate,
        pulse: vitals.pulse,
        respRate: vitals.respRate,
        spo2: vitals.spo2,
        temp: vitals.temp,
        height: vitals.height,
        weight: vitals.weight,
        waistCirc: vitals.waistCirc,
        bmi: computedBMI,
        bloodGlucose: vitals.bloodGlucose,
        painScore: vitals.painScore,
        glasgowScore: vitals.glasgowScore,
        clinicalNotes: vitals.clinicalNotes
      };

      // 1. Update queue entry in service_queues: change status to 'waiting' for doctor
      const directQueueDocId = activePatient.queueDocId || activePatient.docId;
      let targetDocId = directQueueDocId;
      const queuePayload = {
        status: 'waiting',
        priority: assessPriority.priority,
        priorityAlerts: assessPriority.alerts,
        vitals: finalVitalsData,
        triagedAt: today.toISOString(),
        triagedBy: nurseName
      };

      let updated = false;

      // Try updating directly if valid queueDocId
      if (directQueueDocId) {
        try {
          const directDocRef = doc(db, 'service_queues', directQueueDocId);
          const directSnap = await getDoc(directDocRef);
          if (directSnap.exists()) {
            await updateDoc(directDocRef, queuePayload);
            updated = true;
          }
        } catch (e) {
          console.warn("Direct queue doc lookup failed, fallback to query:", e);
        }
      }

      // If not updated directly, try query by patientId
      if (!updated) {
        const pId = activePatient.patientId || activePatient.dmeId || activePatient.id;
        if (pId) {
          const q = query(collection(db, 'service_queues'), where('patientId', '==', pId));
          const snap = await getDocs(q);
          if (!snap.empty) {
            targetDocId = snap.docs[0].id;
            for (const d of snap.docs) {
              await updateDoc(doc(db, 'service_queues', d.id), queuePayload);
            }
            updated = true;
          } else {
            // Also try dmeId query
            const qDme = query(collection(db, 'service_queues'), where('dmeId', '==', pId));
            const snapDme = await getDocs(qDme);
            if (!snapDme.empty) {
              targetDocId = snapDme.docs[0].id;
              for (const d of snapDme.docs) {
                await updateDoc(doc(db, 'service_queues', d.id), queuePayload);
              }
              updated = true;
            }
          }
        }
      }

      // Fallback: If still not found, create or upsert with setDoc merge
      if (!updated) {
        const fallbackDocId = targetDocId || (activePatient.id ? activePatient.id : doc(collection(db, 'service_queues')).id);
        targetDocId = fallbackDocId;
        await setDoc(doc(db, 'service_queues', fallbackDocId), sanitizeData({
          ...activePatient,
          patientId: activePatient.patientId || activePatient.dmeId || activePatient.id,
          dmeId: activePatient.dmeId || activePatient.patientId || activePatient.id,
          firstName: activePatient.firstName || '',
          lastName: activePatient.lastName || '',
          age: activePatient.age || 0,
          gender: activePatient.gender || 'M',
          motif: activePatient.motif || 'CONSULTATION',
          service: activePatient.service || 'Médecine Générale',
          ...queuePayload,
          createdAt: activePatient.createdAt || today.toISOString()
        }), { merge: true });
      }

      // 2. Write record in triage_records
      const triageDocRef = doc(collection(db, 'triage_records'));
      await setDoc(triageDocRef, sanitizeData({
        id: triageDocRef.id,
        patientId: activePatient.patientId || activePatient.dmeId || activePatient.id,
        patientName: `${activePatient.lastName} ${activePatient.firstName}`,
        queueId: targetDocId || '',
        vitals: finalVitalsData,
        priority: assessPriority.priority,
        priorityAlerts: assessPriority.alerts,
        nurseName: nurseName,
        createdAt: today.toISOString()
      }));

      // 3. Write trace to audit_logs
      await setDoc(doc(collection(db, 'audit_logs')), {
        user: nurseName,
        role: 'NURSE_TRIAGE',
        date: today.toLocaleDateString('fr-FR'),
        time: today.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
        timestamp: today.toISOString(),
        action: `Triage infirmier validé (${assessPriority.priority.toUpperCase()}) -> Transféré vers la file médecin`,
        details: {
          patientId: activePatient.patientId || activePatient.dmeId,
          patientName: `${activePatient.lastName} ${activePatient.firstName}`,
          priority: assessPriority.priority,
          alerts: assessPriority.alerts
        },
        module: 'Triage'
      });

      // 4. Trigger system notification
      window.dispatchEvent(new CustomEvent('app-notification', {
        detail: `🩺 Triage validé pour ${activePatient.lastName} ${activePatient.firstName} [Priorité: ${assessPriority.priority.toUpperCase()}] -> Transféré au Médecin.`
      }));

      setActivePatient(null);
      if (onTriageComplete) onTriageComplete();
    } catch (err: any) {
      console.error("Error finalizing nurse triage:", err);
      alert(`Erreur lors de la validation du triage : ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      
      {/* Header Banner */}
      <div className="bg-slate-900 text-white p-8 rounded-[40px] shadow-xl relative overflow-hidden">
        <div className="absolute -right-16 -top-16 w-60 h-60 rounded-full bg-teal-500/10 blur-3xl"></div>
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative z-10">
          <div className="flex items-center gap-4">
            <div className="p-4 bg-teal-500/20 text-teal-400 rounded-3xl border border-teal-500/30">
              <Stethoscope size={32} />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <span className="text-[10px] font-black uppercase tracking-[0.25em] text-teal-400">Pôle Soins Infirmiers</span>
                <span className="bg-teal-500/20 text-teal-300 border border-teal-500/40 px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider animate-pulse">
                  Salle de Triage Active
                </span>
              </div>
              <h2 className="text-2xl md:text-3xl font-extrabold mt-1 tracking-tight">Espace Triage & Prise de Constantes</h2>
            </div>
          </div>

          <div className="flex items-center gap-4 bg-white/5 border border-white/10 p-4 rounded-3xl backdrop-blur-md">
            <div className="text-right">
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">En attente de Triage</p>
              <p className="text-3xl font-black text-amber-400">{waitingTriageList.length}</p>
            </div>
            <div className="h-10 w-px bg-white/10"></div>
            <div className="text-right">
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Poste Infirmier</p>
              <p className="text-sm font-extrabold text-slate-200 truncate max-w-[140px]">{user?.name || 'Infirmier de garde'}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Workspace Grid */}
      {!activePatient ? (
        <div className="bg-white rounded-[40px] border border-slate-200 shadow-sm p-8 space-y-6">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-100 pb-6">
            <div>
              <h3 className="text-xl font-extrabold text-slate-900 flex items-center gap-2.5">
                <Clock className="text-teal-600" size={22} />
                File des Patients en Attente de Triage
              </h3>
              <p className="text-xs text-slate-500 font-medium mt-1">
                Patients enregistrés à l'accueil dont les constantes cliniques doivent être prélevées avant consultation médicale.
              </p>
            </div>

            {/* Search Input */}
            <div className="relative w-full md:w-80">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input 
                type="text"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                placeholder="Rechercher par nom, DME..."
                className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200/80 rounded-2xl text-xs font-semibold outline-none focus:border-teal-500 focus:bg-white transition-all"
              />
            </div>
          </div>

          {/* Queue List */}
          {filteredQueue.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredQueue.map((patient, idx) => (
                <div 
                  key={patient.id || idx}
                  className="p-6 rounded-3xl border border-slate-200/80 bg-slate-50/50 hover:bg-teal-50/30 hover:border-teal-300 transition-all flex flex-col justify-between group shadow-sm hover:shadow-md"
                >
                  <div className="space-y-4">
                    <div className="flex items-start justify-between">
                      <div className="w-12 h-12 rounded-2xl bg-white border border-slate-200 flex items-center justify-center font-black text-teal-600 shadow-sm text-sm">
                        {idx + 1}
                      </div>
                      <div className="text-right">
                        <span className="px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-200">
                          Attente Triage
                        </span>
                        <p className="text-[10px] text-slate-400 font-semibold mt-1">Arrivé(e) à {patient.time || '--:--'}</p>
                      </div>
                    </div>

                    <div>
                      <h4 className="font-extrabold text-slate-900 text-base group-hover:text-teal-900 transition-colors">
                        {patient.lastName} {patient.firstName}
                      </h4>
                      <p className="text-xs font-mono font-bold text-slate-400 mt-0.5">
                        {patient.dmeId || patient.patientId || 'DME-N/A'} • {patient.age || '—'} ans • {patient.gender === 'F' ? 'Femme' : 'Homme'}
                      </p>
                    </div>

                    <div className="p-3 bg-white rounded-2xl border border-slate-150 text-xs">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Motif d'Admission</p>
                      <p className="font-bold text-slate-800 mt-0.5">{patient.motifLabel || patient.motif || 'Consultation'}</p>
                      <p className="text-[10px] text-teal-700 font-semibold mt-0.5">{patient.speciality || patient.queueName || 'Médecine générale'}</p>
                    </div>
                  </div>

                  <button
                    onClick={() => handleSelectPatientForTriage(patient)}
                    className="mt-6 w-full py-4 bg-teal-600 hover:bg-teal-700 text-white rounded-2xl font-extrabold text-xs uppercase tracking-wider transition-all shadow-md flex items-center justify-center gap-2 group-hover:scale-[1.02]"
                  >
                    <Stethoscope size={16} />
                    Prendre en charge le Triage
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-16 text-center bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200">
              <CheckCircle className="mx-auto text-teal-500 mb-3" size={40} />
              <h4 className="text-base font-extrabold text-slate-800">File de Triage Vide</h4>
              <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                Tous les patients enregistrés ont été triés ou sont directement en salle d'attente de consultation.
              </p>
            </div>
          )}
        </div>
      ) : (
        /* Active Clinical Triage Form */
        <div className="bg-white rounded-[40px] border border-slate-200 shadow-sm p-8 md:p-10 space-y-10 animate-in zoom-in-95 duration-200">
          
          {/* Header of Active Patient */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 border-b border-slate-100 pb-8">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <button
                  onClick={() => setActivePatient(null)}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-bold text-xs uppercase tracking-wider transition-all"
                >
                  ← Retour à la File
                </button>
                <span className="text-[10px] font-black uppercase tracking-wider bg-teal-50 text-teal-700 border border-teal-200 px-2.5 py-1 rounded-xl">
                  Prise de constantes en cours
                </span>
              </div>
              <h3 className="text-2xl font-black text-slate-900">
                {activePatient.lastName} {activePatient.firstName}
              </h3>
              <p className="text-xs text-slate-500 font-medium mt-1">
                ID DME : <strong className="font-mono text-slate-700">{activePatient.dmeId || activePatient.patientId}</strong> • {activePatient.age} ans • {activePatient.gender === 'F' ? 'Féminin' : 'Masculin'} • Arrivé(e) à {activePatient.time}
              </p>
            </div>

            {/* Dynamic Algorithmic Triage Score Card */}
            <div className="flex gap-4 items-center bg-slate-50 border border-slate-200 p-5 rounded-3xl shadow-sm">
              <div className="text-right">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">IMC Dynamique</p>
                <p className={`text-2xl font-black ${computedBMI > 25 ? 'text-rose-600' : 'text-teal-600'}`}>
                  {computedBMI} <span className="text-xs font-normal opacity-50">kg/m²</span>
                </p>
              </div>
              <div className="h-10 w-px bg-slate-200"></div>
              <div className="text-right flex flex-col items-end">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Priorité Calculée</p>
                <span className={`px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-widest border transition-all ${
                  assessPriority.priority === 'critique' ? 'bg-rose-500 text-white border-transparent animate-pulse shadow-md shadow-rose-500/20' :
                  assessPriority.priority === 'urgent' ? 'bg-amber-500 text-white border-transparent shadow-md shadow-amber-500/20' :
                  'bg-emerald-100 text-emerald-800 border-emerald-300'
                }`}>
                  {assessPriority.priority}
                </span>
                {assessPriority.alerts.length > 0 && (
                  <span className="text-[8px] font-bold text-rose-600 mt-1 max-w-[180px] truncate" title={assessPriority.alerts.join(", ")}>
                    ⚠️ {assessPriority.alerts.join(", ")}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Vitals Form Sections */}
          <div className="space-y-10">
            
            {/* 1. Hemodynamic & Respiratory Vitals */}
            <div>
              <h4 className="text-xs font-black text-teal-700 uppercase tracking-[0.2em] mb-4 flex items-center gap-2 border-b border-teal-50 pb-2">
                <Heart size={16} /> 1. Constantes Hémodynamiques & Oxygénation
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 group focus-within:border-teal-500 focus-within:bg-white transition-all">
                  <p className="text-[9px] font-black text-slate-400 uppercase mb-1">TA Systolique</p>
                  <div className="flex items-baseline justify-between">
                    <input 
                      type="number" 
                      className="w-full bg-transparent font-black text-2xl outline-none text-slate-900" 
                      value={vitals.bpSys} 
                      onChange={e => setVitals({...vitals, bpSys: parseInt(e.target.value) || 0})}
                    />
                    <span className="text-[10px] font-bold text-slate-400">mmHg</span>
                  </div>
                </div>

                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 group focus-within:border-teal-500 focus-within:bg-white transition-all">
                  <p className="text-[9px] font-black text-slate-400 uppercase mb-1">TA Diastolique</p>
                  <div className="flex items-baseline justify-between">
                    <input 
                      type="number" 
                      className="w-full bg-transparent font-black text-2xl outline-none text-slate-900" 
                      value={vitals.bpDia} 
                      onChange={e => setVitals({...vitals, bpDia: parseInt(e.target.value) || 0})}
                    />
                    <span className="text-[10px] font-bold text-slate-400">mmHg</span>
                  </div>
                </div>

                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 group focus-within:border-teal-500 focus-within:bg-white transition-all">
                  <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Fréq. Cardiaque</p>
                  <div className="flex items-baseline justify-between">
                    <input 
                      type="number" 
                      className="w-full bg-transparent font-black text-2xl outline-none text-slate-900" 
                      value={vitals.heartRate} 
                      onChange={e => setVitals({...vitals, heartRate: parseInt(e.target.value) || 0, pulse: parseInt(e.target.value) || 0})}
                    />
                    <span className="text-[10px] font-bold text-slate-400">bpm</span>
                  </div>
                </div>

                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 group focus-within:border-teal-500 focus-within:bg-white transition-all">
                  <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Fréq. Resp.</p>
                  <div className="flex items-baseline justify-between">
                    <input 
                      type="number" 
                      className="w-full bg-transparent font-black text-2xl outline-none text-slate-900" 
                      value={vitals.respRate} 
                      onChange={e => setVitals({...vitals, respRate: parseInt(e.target.value) || 0})}
                    />
                    <span className="text-[10px] font-bold text-slate-400">/min</span>
                  </div>
                </div>

                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 group focus-within:border-teal-500 focus-within:bg-white transition-all">
                  <p className="text-[9px] font-black text-slate-400 uppercase mb-1">SpO2 (Sat. O2)</p>
                  <div className="flex items-baseline justify-between">
                    <input 
                      type="number" 
                      className="w-full bg-transparent font-black text-2xl outline-none text-slate-900" 
                      value={vitals.spo2} 
                      onChange={e => setVitals({...vitals, spo2: parseInt(e.target.value) || 0})}
                    />
                    <span className="text-[10px] font-bold text-slate-400">%</span>
                  </div>
                </div>

                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 group focus-within:border-teal-500 focus-within:bg-white transition-all">
                  <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Température</p>
                  <div className="flex items-baseline justify-between">
                    <input 
                      type="number" 
                      step="0.1" 
                      className="w-full bg-transparent font-black text-2xl outline-none text-slate-900" 
                      value={vitals.temp} 
                      onChange={e => setVitals({...vitals, temp: parseFloat(e.target.value) || 0})}
                    />
                    <span className="text-[10px] font-bold text-slate-400">°C</span>
                  </div>
                </div>
              </div>
            </div>

            {/* 2. Anthropometry & Metabolism */}
            <div>
              <h4 className="text-xs font-black text-amber-700 uppercase tracking-[0.2em] mb-4 flex items-center gap-2 border-b border-amber-50 pb-2">
                <Scale size={16} /> 2. Anthropométrie & Métabolisme
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200/80 group focus-within:border-amber-500 focus-within:bg-white transition-all">
                  <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Taille (cm)</p>
                  <input 
                    type="number" 
                    className="w-full bg-transparent font-black text-3xl outline-none text-slate-900" 
                    value={vitals.height} 
                    onChange={e => setVitals({...vitals, height: parseInt(e.target.value) || 0})}
                  />
                </div>

                <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200/80 group focus-within:border-amber-500 focus-within:bg-white transition-all">
                  <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Poids (kg)</p>
                  <input 
                    type="number" 
                    className="w-full bg-transparent font-black text-3xl outline-none text-slate-900" 
                    value={vitals.weight} 
                    onChange={e => setVitals({...vitals, weight: parseInt(e.target.value) || 0})}
                  />
                </div>

                <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200/80 group focus-within:border-amber-500 focus-within:bg-white transition-all">
                  <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Circ. Abdominale (cm)</p>
                  <input 
                    type="number" 
                    className="w-full bg-transparent font-black text-3xl outline-none text-slate-900" 
                    value={vitals.waistCirc} 
                    onChange={e => setVitals({...vitals, waistCirc: parseInt(e.target.value) || 0})}
                  />
                </div>

                <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200/80 group focus-within:border-amber-500 focus-within:bg-white transition-all">
                  <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Glycémie (g/L)</p>
                  <input 
                    type="number" 
                    step="0.01" 
                    className="w-full bg-transparent font-black text-3xl outline-none text-slate-900" 
                    value={vitals.bloodGlucose} 
                    onChange={e => setVitals({...vitals, bloodGlucose: parseFloat(e.target.value) || 0})}
                  />
                </div>
              </div>
            </div>

            {/* 3. Pain & Consciousness */}
            <div>
              <h4 className="text-xs font-black text-indigo-700 uppercase tracking-[0.2em] mb-4 flex items-center gap-2 border-b border-indigo-50 pb-2">
                <Activity size={16} /> 3. Évaluation de la Douleur & État Clinique
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                
                {/* Pain Scale Slider */}
                <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200/80">
                  <div className="flex justify-between items-center mb-2">
                    <p className="text-[9px] font-black text-slate-400 uppercase">Échelle Douleur EVA (0-10)</p>
                    <span className={`text-sm font-black px-2 py-0.5 rounded-full ${
                      vitals.painScore >= 7 ? 'bg-rose-100 text-rose-700' :
                      vitals.painScore >= 4 ? 'bg-amber-100 text-amber-700' :
                      'bg-slate-200 text-slate-700'
                    }`}>
                      {vitals.painScore} / 10
                    </span>
                  </div>
                  <input 
                    type="range" 
                    min="0" 
                    max="10" 
                    step="1"
                    className="w-full accent-teal-600 cursor-pointer"
                    value={vitals.painScore}
                    onChange={e => setVitals({...vitals, painScore: parseInt(e.target.value) || 0})}
                  />
                  <p className="text-[10px] text-slate-400 mt-2 italic">
                    {vitals.painScore === 0 ? 'Aucune douleur' :
                     vitals.painScore <= 3 ? 'Douleur légère' :
                     vitals.painScore <= 6 ? 'Douleur modérée' : 'Douleur sévère à intolérable'}
                  </p>
                </div>

                {/* Glasgow Score */}
                <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200/80">
                  <div className="flex justify-between items-center mb-2">
                    <p className="text-[9px] font-black text-slate-400 uppercase">Score de Glasgow (Conscience)</p>
                    <span className="text-sm font-black px-2 py-0.5 rounded-full bg-slate-200 text-slate-800">
                      {vitals.glasgowScore} / 15
                    </span>
                  </div>
                  <select 
                    className="w-full p-2 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-teal-500"
                    value={vitals.glasgowScore}
                    onChange={e => setVitals({...vitals, glasgowScore: parseInt(e.target.value) || 15})}
                  >
                    <option value="15">15 - Conscience Normale (Alerte, Orienté)</option>
                    <option value="14">14 - Somnolence légère</option>
                    <option value="13">13 - Confusion modérée</option>
                    <option value="11">11-12 - Obnubilation / Réponse lente</option>
                    <option value="8">8-10 - Coma modéré / Stupeur</option>
                    <option value="3">3-7 - Coma profond</option>
                  </select>
                </div>

                {/* Observations */}
                <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200/80">
                  <p className="text-[9px] font-black text-slate-400 uppercase mb-2">Observations de Triage</p>
                  <textarea
                    rows={2}
                    placeholder="Symptômes notables, plaintes principales..."
                    className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium outline-none focus:border-teal-500 resize-none"
                    value={vitals.clinicalNotes}
                    onChange={e => setVitals({...vitals, clinicalNotes: e.target.value})}
                  />
                </div>

              </div>
            </div>

          </div>

          {/* Form Actions */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-slate-100 pt-8">
            <button
              disabled={isSubmitting}
              onClick={() => setActivePatient(null)}
              className="w-full sm:w-auto px-6 py-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl font-bold text-xs uppercase tracking-wider transition-all disabled:opacity-50"
            >
              Annuler
            </button>

            <button
              disabled={isSubmitting}
              onClick={handleValidateTriage}
              className={`w-full sm:w-auto px-10 py-5 rounded-3xl font-extrabold text-xs uppercase tracking-wider text-white shadow-xl transition-all flex items-center justify-center gap-3 ${
                assessPriority.priority === 'critique' ? 'bg-rose-600 hover:bg-rose-700 animate-pulse' :
                assessPriority.priority === 'urgent' ? 'bg-amber-600 hover:bg-amber-700' :
                'bg-teal-600 hover:bg-teal-700'
              }`}
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="animate-spin" size={16} /> Validation en cours...
                </>
              ) : (
                <>
                  <CheckCircle2 size={18} />
                  Valider le Triage & Transférer au Médecin ({assessPriority.priority.toUpperCase()})
                </>
              )}
            </button>
          </div>

        </div>
      )}

    </div>
  );
};

export default NurseTriageWorkspace;
