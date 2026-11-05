import React, { useState, useEffect, useMemo } from 'react';
import { CareTask, Prescription, Patient, CarePlanItem, User } from '../../types';
import { Calendar, Clock, CheckCircle2, XCircle, AlertTriangle, Activity, Pill, User as UserIcon, Plus, Send } from 'lucide-react';
import { db } from '../../src/firebase';
import { collection, query, where, onSnapshot, addDoc, updateDoc, doc, setDoc, getDocs } from 'firebase/firestore';

interface CarePlannerProps {
  patient: any; // Can be Bed or Patient
  prescriptions: Prescription[];
  user?: User;
  onUpdateTask: (taskId: string, status: CareTask['status'], comment?: string) => void;
  onPrescribe?: () => void;
}

const CarePlanner: React.FC<CarePlannerProps> = ({ patient, prescriptions, user, onUpdateTask, onPrescribe }) => {
  const [tasks, setTasks] = useState<CareTask[]>([]);
  const [activeTab, setActiveTab] = useState<'planner'>('planner');
  const [filter, setFilter] = useState<'ALL' | 'TODO' | 'DONE' | 'LATE'>('ALL');
  const [showAddInstruction, setShowAddInstruction] = useState(false);
  const [newInstruction, setNewInstruction] = useState({
    title: '',
    category: 'NURSING' as any,
    frequency: 3,
    duration: 3,
    instructions: ''
  });
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const [toolsConfig, setToolsConfig] = useState<any[]>(() => {
    const saved = localStorage.getItem('hospital_tools');
    return saved ? JSON.parse(saved) : [];
  });
  
  const patientId = patient?.patientId || patient?.id;
  const bedId = patient?.bedId || patient?.id;
  const patientName = patient?.patient || (patient?.firstName ? `${patient?.lastName} ${patient?.firstName}` : patient?.name);

  // Stats calculation
  const stats = useMemo(() => {
    return {
      done: tasks.filter(t => t.status === 'DONE').length,
      todo: tasks.filter(t => t.status === 'TODO' && t.scheduledAt && new Date(t.scheduledAt) >= currentTime).length,
      late: tasks.filter(t => t.status === 'LATE' || t.status === 'MISSED' || (t.status === 'TODO' && t.scheduledAt && new Date(t.scheduledAt) < currentTime)).length,
      total: tasks.length
    };
  }, [tasks, currentTime]);

  // Listen to tasks for this patient from Firestore
  useEffect(() => {
    if (!patientId) return;
    const q = query(collection(db, 'care_tasks'), where('patientId', '==', patientId));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedTasks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CareTask));
      setTasks(fetchedTasks.sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()));
    });
    return () => unsubscribe();
  }, [patientId]);

  // Sync prescriptions to tasks (one-time or daily check)
  useEffect(() => {
    const syncPrescriptionsToTasks = async () => {
      if (!patientId) return;
      
      const existingTasksSnapshot = await getDocs(query(collection(db, 'care_tasks'), where('patientId', '==', patientId)));
      const existingPrescriptionTaskIds = new Set(existingTasksSnapshot.docs.map(d => d.data().prescriptionId).filter(Boolean));

      for (const rx of prescriptions) {
        if (rx.status !== 'VALIDATED') continue;
        if (existingPrescriptionTaskIds.has(rx.id)) continue; // Already generated for this rx

        // Generate tasks
        const startDate = new Date(rx.createdAt);
        const intervalHours = 24 / rx.frequency;

        for (let day = 0; day < rx.duration; day++) {
          for (let dose = 0; dose < rx.frequency; dose++) {
            const scheduledTime = new Date(startDate);
            scheduledTime.setDate(startDate.getDate() + day);
            scheduledTime.setHours(startDate.getHours() + (dose * intervalHours));

            const taskId = `task_${rx.id}_${day}_${dose}`;
            await setDoc(doc(db, 'care_tasks', taskId), {
              id: taskId,
              patientId: patientId,
              patientName: patient?.patient || (patient?.firstName ? patient?.firstName + ' ' + patient?.lastName : ''),
              bedId: bedId,
              prescriptionId: rx.id,
              medicationName: rx.medicationName,
              category: 'MEDICATION',
              scheduledAt: scheduledTime.toISOString(),
              status: 'TODO',
              dose: rx.dosePerIntake,
              units: rx.unitsPerIntake,
              route: rx.route,
              instructions: rx.instructions,
              monitoringParams: rx.monitoringParams
            });
          }
        }
      }
    };

    if (prescriptions.length > 0) {
      syncPrescriptionsToTasks();
    }
  }, [prescriptions, patientId]);

  const handleAddInstruction = async () => {
    if (!newInstruction.title) return;
    
    try {
      const startDate = new Date();
      const intervalHours = 24 / newInstruction.frequency;

      for (let day = 0; day < newInstruction.duration; day++) {
        for (let dose = 0; dose < newInstruction.frequency; dose++) {
          const scheduledTime = new Date(startDate);
          scheduledTime.setDate(startDate.getDate() + day);
          scheduledTime.setHours(startDate.getHours() + (dose * intervalHours));

          const taskId = `manual_${Date.now()}_${day}_${dose}`;
          await setDoc(doc(db, 'care_tasks', taskId), {
            id: taskId,
            patientId: patientId,
            patientName: patient?.patient || (patient?.firstName ? patient?.firstName + ' ' + patient?.lastName : ''),
            bedId: bedId,
            title: newInstruction.title,
            category: newInstruction.category,
            scheduledAt: scheduledTime.toISOString(),
            status: 'TODO',
            instructions: newInstruction.instructions
          });
        }
      }

      setShowAddInstruction(false);
      setNewInstruction({
        title: '',
        category: 'NURSING',
        frequency: 3,
        duration: 3,
        instructions: ''
      });
    } catch (e) {
      console.error("Error adding instruction:", e);
    }
  };

  const handleStatusChange = async (taskId: string, newStatus: CareTask['status']) => {
    try {
      await updateDoc(doc(db, 'care_tasks', taskId), {
        status: newStatus,
        executedAt: new Date().toISOString(),
        executedBy: user?.name || 'Personnel'
      });
      onUpdateTask(taskId, newStatus);
    } catch (e) {
      console.error("Error updating task status:", e);
    }
  };

  return (
    <div className="bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden flex flex-col h-full max-h-[800px]">
      <div className="p-6 bg-emerald-600 text-white flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-sm">
            <Calendar size={24} />
          </div>
          <div>
            <h2 className="text-xl font-black tracking-tight">{patientName}</h2>
            <div className="flex gap-4 text-[10px] font-black uppercase tracking-widest text-emerald-100">
              <span className="flex items-center gap-1"><CheckCircle2 size={12} className="text-white" /> {stats.done} Faits</span>
              <span className="flex items-center gap-1"><Clock size={12} className="text-white" /> {stats.todo} À faire</span>
              <span className="flex items-center gap-1 text-rose-200"><AlertTriangle size={12} className="text-rose-200" /> {stats.late} En retard</span>
            </div>
          </div>
        </div>
      </div>

      {activeTab === 'planner' && (
        <>
          <div className="px-6 py-4 bg-white border-b border-slate-100 flex justify-between items-center">
            <div className="flex gap-2">
              {onPrescribe && (
                <button 
                  onClick={onPrescribe}
                  className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200"
                >
                  <Pill size={18} />
                  Prescrire Traitement
                </button>
              )}
              <button 
                onClick={() => setShowAddInstruction(!showAddInstruction)}
                className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-blue-700 transition-colors shadow-lg shadow-blue-200"
              >
                {showAddInstruction ? <XCircle size={18} /> : <Plus size={18} />}
                {showAddInstruction ? 'Annuler' : 'Plan de Soins'}
              </button>
            </div>

            <div className="flex bg-slate-100 rounded-xl p-1">
              {['ALL', 'TODO', 'DONE', 'LATE'].map((f) => (
                <button 
                  key={f}
                  onClick={() => setFilter(f as any)}
                  className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${filter === f ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  {f === 'ALL' ? 'Tout' : f === 'TODO' ? 'À faire' : f === 'DONE' ? 'Fait' : 'En retard'}
                </button>
              ))}
            </div>
          </div>

          {showAddInstruction && (
            <div className="p-6 bg-slate-50 border-b border-slate-200 animate-in slide-in-from-top-4 duration-300">
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <h3 className="font-black text-slate-900 mb-4 flex items-center gap-2">
                  <Activity size={18} className="text-blue-600" />
                  Nouvelle Instruction de Soins
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Titre de l'acte / Soin</label>
                    <input 
                      type="text" 
                      placeholder="Ex: Pansement, Surveillance glycémique..."
                      value={newInstruction.title}
                      onChange={(e) => setNewInstruction({...newInstruction, title: e.target.value})}
                      className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 outline-none font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Catégorie</label>
                    <select 
                      value={newInstruction.category}
                      onChange={(e) => setNewInstruction({...newInstruction, category: e.target.value as any})}
                      className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 outline-none font-bold"
                    >
                      <option value="NURSING">Soins Infirmiers</option>
                      <option value="VITAL_SIGNS">Constantes / Paramètres</option>
                      <option value="EXAM">Examen de surveillance</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Fréquence (fois / 24h)</label>
                    <input 
                      type="number" 
                      value={isNaN(newInstruction.frequency) ? '' : newInstruction.frequency}
                      onChange={(e) => setNewInstruction({...newInstruction, frequency: parseInt(e.target.value)})}
                      className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 outline-none font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Durée (jours)</label>
                    <input 
                      type="number" 
                      value={isNaN(newInstruction.duration) ? '' : newInstruction.duration}
                      onChange={(e) => setNewInstruction({...newInstruction, duration: parseInt(e.target.value)})}
                      className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 outline-none font-bold"
                    />
                  </div>
                </div>
                <div className="mb-4">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Instructions précises</label>
                  <textarea 
                    placeholder="Détails du soin à réaliser..."
                    value={newInstruction.instructions}
                    onChange={(e) => setNewInstruction({...newInstruction, instructions: e.target.value})}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 outline-none font-bold h-20 resize-none"
                  ></textarea>
                </div>
                <button 
                  onClick={handleAddInstruction}
                  className="w-full bg-slate-900 text-white py-3 rounded-xl font-black uppercase tracking-widest hover:bg-blue-600 transition-all flex items-center justify-center gap-2"
                >
                  <Send size={18} />
                  Enregistrer dans le plan de soins
                </button>
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
            <div className="space-y-4">
          {tasks.filter(t => {
            const isActuallyLate = t.status === 'TODO' && t.scheduledAt && new Date(t.scheduledAt) < currentTime;
            const effectiveStatus = isActuallyLate ? 'LATE' : t.status;

            if (filter === 'ALL') return true;
            if (filter === 'LATE') return effectiveStatus === 'LATE' || effectiveStatus === 'MISSED';
            return effectiveStatus === filter;
          }).length === 0 ? (
            <div className="text-center p-12 text-slate-400">
              <CheckCircle2 size={48} className="mx-auto mb-4 opacity-20" />
              <p className="font-medium">Aucune tâche planifiée pour ce filtre.</p>
            </div>
          ) : (
            tasks.filter(t => {
              const isActuallyLate = t.status === 'TODO' && t.scheduledAt && new Date(t.scheduledAt) < currentTime;
              const effectiveStatus = isActuallyLate ? 'LATE' : t.status;

              if (filter === 'ALL') return true;
              if (filter === 'LATE') return effectiveStatus === 'LATE' || effectiveStatus === 'MISSED';
              return effectiveStatus === filter;
            }).map(task => {
              const scheduledDate = new Date(task.scheduledAt);
              const isActuallyLate = task.status === 'TODO' && task.scheduledAt && scheduledDate < currentTime;
              const isLate = task.status === 'LATE' || isActuallyLate;
              const isDone = task.status === 'DONE';

              return (
                <div key={task.id} className={`bg-white p-5 rounded-2xl border-l-4 shadow-sm flex flex-col md:flex-row gap-6 items-start md:items-center justify-between transition-all hover:shadow-md ${
                  isDone ? 'border-emerald-500 opacity-75' : 
                  isLate ? 'border-rose-500 bg-rose-50/30' : 
                  task.category === 'MEDICATION' ? 'border-blue-500' : 'border-amber-500'
                }`}>
                  <div className="flex items-start gap-4 flex-1">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${
                      isDone ? 'bg-emerald-100 text-emerald-600' : 
                      isLate ? 'bg-rose-100 text-rose-600' : 
                      task.category === 'MEDICATION' ? 'bg-blue-100 text-blue-600' : 'bg-amber-100 text-amber-600'
                    }`}>
                      {task.category === 'MEDICATION' ? <Pill size={24} /> : <Activity size={24} />}
                    </div>
                    
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-black text-slate-900 text-lg">
                          {task.medicationName || task.title}
                        </h3>
                        <span className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest ${
                          task.category === 'MEDICATION' ? 'bg-blue-100 text-blue-600' : 'bg-amber-100 text-amber-600'
                        }`}>
                          {task.category === 'MEDICATION' ? task.route : task.category}
                        </span>
                        {isLate && (
                          <span className="px-2 py-1 bg-rose-100 text-rose-700 rounded-lg text-[9px] font-black uppercase tracking-widest flex items-center gap-1">
                            <AlertTriangle size={10} /> Retard
                          </span>
                        )}
                      </div>
                      
                      <div className="text-sm text-slate-600 font-medium flex flex-wrap items-center gap-4">
                        {task.category === 'MEDICATION' && (
                          <span className="flex items-center gap-1"><Pill size={14} className="text-slate-400"/> {task.dose} mg ({task.units ? task.units.toFixed(1) : '0'} unité(s))</span>
                        )}
                        <span className="flex items-center gap-1 text-blue-600 font-bold"><Clock size={14} /> {scheduledDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
                        <span className="text-slate-400 text-[10px] font-bold">{scheduledDate.toLocaleDateString('fr-FR')}</span>
                      </div>

                      {task.instructions && (
                        <div className="mt-2 text-xs text-slate-500 italic bg-slate-50 p-2 rounded-lg border border-slate-100">
                          {task.instructions}
                        </div>
                      )}

                      {task.monitoringParams && task.monitoringParams.length > 0 && (
                        <div className="mt-3 flex items-center gap-2">
                          <Activity size={14} className="text-amber-500" />
                          <span className="text-xs font-bold text-amber-700 uppercase tracking-wider">Surveillance :</span>
                          <div className="flex gap-2 flex-wrap">
                            {task.monitoringParams.map((param, idx) => (
                              <span key={idx} className="px-2 py-1 bg-amber-50 text-amber-700 border border-amber-100 rounded text-[10px] font-black uppercase tracking-widest">
                                {param}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 w-full md:w-auto justify-end border-t md:border-t-0 pt-4 md:pt-0 border-slate-100">
                    {!isDone && (
                      <>
                        <button 
                          onClick={() => handleStatusChange(task.id, 'REFUSED')}
                          className="px-4 py-2 rounded-xl text-sm font-bold text-slate-500 hover:bg-slate-100 transition-colors"
                        >
                          Refusé
                        </button>
                        <button 
                          onClick={() => handleStatusChange(task.id, 'DONE')}
                          className="px-6 py-2 rounded-xl text-sm font-bold bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition-colors flex items-center gap-2"
                        >
                          <CheckCircle2 size={16} /> Administré
                        </button>
                      </>
                    )}
                    {isDone && (
                      <div className="text-sm font-bold text-emerald-600 flex items-center gap-2 bg-emerald-50 px-4 py-2 rounded-xl">
                        <CheckCircle2 size={16} /> Fait à {new Date(task.executedAt || '').toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
      </>
      )}
    </div>
  );
};

export default CarePlanner;
