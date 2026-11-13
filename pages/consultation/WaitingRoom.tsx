import React, { useState } from 'react';
import { Users, Clock, ChevronRight, Eye, RefreshCw, X, AlertCircle, ShieldAlert, Pill, TestTube, Activity, FileText, Check, BedDouble, Lock, Zap, Stethoscope, AlertTriangle, Info, Calendar } from 'lucide-react';
import { AvatarPlaceholder } from '../../components/common/AvatarPlaceholder';

interface WaitingRoomProps {
  waitingQueue: any[];
  inProgressQueue?: any[];
  hospitalizedQueue?: any[];
  paymentRequests?: any[];
  onStartConsultation: (patient: any) => void;
  onCancelPatient?: (patient: any, reason: string) => void;
  onReorientPatient?: (patient: any, targetService: string) => void;
  onResumeConsultation?: (patient: any) => void;
  onManageDischarge?: (patient: any) => void;
}

// Built-in clinical summary profiles mapping by ID or generic fallback
const PATIENT_SUMMARIES_DB: Record<string, any> = {};

const WaitingRoom: React.FC<WaitingRoomProps> = ({ 
  waitingQueue, 
  inProgressQueue = [],
  hospitalizedQueue = [],
  paymentRequests = [],
  onStartConsultation,
  onCancelPatient,
  onReorientPatient,
  onResumeConsultation,
  onManageDischarge
}) => {
  const [activeTab, setActiveTab] = useState<'WAITING' | 'IN_PROGRESS' | 'HOSPITALIZED'>('WAITING');
  // Modal states
  const [summaryPatient, setSummaryPatient] = useState<any | null>(null);
  const [reorientPatient, setReorientPatient] = useState<any | null>(null);
  const [cancelPatient, setCancelPatient] = useState<any | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelError, setCancelError] = useState('');
  const [selectedAppointmentTrace, setSelectedAppointmentTrace] = useState<any | null>(null);

  const checkPatientIsPaid = (patient: any): boolean => {
    if (!patient) return false;
    const pStatus = (patient.paymentStatus || '').toUpperCase();
    if (['SOLDE', 'PAID', 'PAYE', 'PAYÉ', 'VALIDE', 'EXONERE', 'ASSURANCE', 'PEC', 'ADVANCE', 'PARTIAL', 'TIERS_PAYANT', 'PRIS_EN_CHARGE'].includes(pStatus)) {
      return true;
    }
    const tStatus = (patient.ticketStatut || '').toUpperCase();
    if (['PAYE', 'PAYÉ', 'VALIDE', 'SOLDE', 'OK'].includes(tStatus)) {
      return true;
    }
    if (patient.hospitalizedOrigin || patient.isExempt || patient.fee === 0 || patient.emergencyBypass) {
      return true;
    }
    const pid = patient.id || patient.patientId || patient.dmeId;
    const pName = `${patient.lastName || ''} ${patient.firstName || ''}`.trim().toLowerCase();

    if (paymentRequests && paymentRequests.length > 0) {
      const hasPaid = paymentRequests.some(pr => {
        const matchesPatient = (pid && (pr.patientId === pid || (pr as any).dmeId === pid)) ||
          (pName.length > 3 && pr.patientName && pr.patientName.toLowerCase().includes(pName));
        const isHandled = pr.status === 'PAID' || pr.status === 'VALIDATED' || ((pr.amountPaid || 0) >= (pr.totalAmount || 0) && (pr.totalAmount || 0) > 0) || (pr.amountPaid || 0) > 0;
        return matchesPatient && isHandled;
      });
      if (hasPaid) return true;
    }
    return false;
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critique': return 'bg-rose-100 text-rose-600 border-rose-200';
      case 'urgent': return 'bg-amber-100 text-amber-600 border-amber-200';
      default: return 'bg-emerald-100 text-emerald-600 border-emerald-200';
    }
  };

  const getPriorityDot = (priority: string) => {
    switch (priority) {
      case 'critique': return 'bg-rose-500';
      case 'urgent': return 'bg-amber-500';
      default: return 'bg-emerald-500';
    }
  };

  // Get or generate rich clinical summary
  const getPatientSummary = (patient: any) => {
    const staticSummary = PATIENT_SUMMARIES_DB[patient.id];
    if (staticSummary) return staticSummary;

    // Minimal fallback
    return {
      allergies: patient.allergies || [],
      treatments: ['À préciser'],
      consultations: [],
      exams: [],
      hospitalisations: []
    };
  };

  const handleCancelSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancelReason.trim()) {
      setCancelError('Le motif d\'annulation est obligatoire.');
      return;
    }
    if (onCancelPatient && cancelPatient) {
      onCancelPatient(cancelPatient, cancelReason);
      setCancelPatient(null);
      setCancelReason('');
      setCancelError('');
    }
  };

  const handleReorientSelect = (serviceName: string) => {
    if (onReorientPatient && reorientPatient) {
      onReorientPatient(reorientPatient, serviceName);
      setReorientPatient(null);
    }
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-6 duration-700">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-6 mb-10">
        <div>
          <h1 className="text-4xl font-black tracking-tight text-slate-900">Salle d'Attente Médicale</h1>
          <p className="text-slate-500 font-medium italic">Gérez le flux des patients entrants, suivez les consultations actives, et libérez les dossiers.</p>
        </div>

        {/* Tab Switcher buttons */}
        <div className="flex bg-slate-100 p-1.5 rounded-[22px] border border-slate-200 shrink-0 w-full lg:w-auto">
          <button
            onClick={() => setActiveTab('WAITING')}
            className={`flex-1 lg:flex-none flex items-center justify-center gap-2 px-6 py-3 rounded-[16px] text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'WAITING'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Users size={14} /> File d'attente ({waitingQueue.length})
          </button>
          <button
            onClick={() => setActiveTab('IN_PROGRESS')}
            className={`flex-1 lg:flex-none flex items-center justify-center gap-2 px-6 py-3 rounded-[16px] text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'IN_PROGRESS'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Activity size={14} /> Patients en cours ({inProgressQueue.length})
          </button>
          <button
            onClick={() => setActiveTab('HOSPITALIZED')}
            className={`flex-1 lg:flex-none flex items-center justify-center gap-2 px-6 py-3 rounded-[16px] text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'HOSPITALIZED'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <BedDouble size={14} /> Hospitalisés ({hospitalizedQueue.length})
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
        {activeTab === 'WAITING' && (
          <>
            {waitingQueue.map((p, idx) => (
              <div 
                key={`${p.queueDocId || p.id || 'patient'}-waiting-${idx}`} 
                className="bg-white rounded-3xl border border-slate-200/80 shadow-md shadow-slate-200/60 hover:shadow-2xl hover:shadow-blue-500/15 hover:-translate-y-1 hover:border-blue-500 transition-all duration-300 group relative overflow-hidden flex flex-col justify-between p-6"
              >
                <div className="absolute top-2 right-2 p-3 opacity-5 group-hover:scale-110 transition-transform pointer-events-none">
                  <Clock size={56} />
                </div>
                
                <div>
                  <div className="flex justify-between items-start mb-3.5">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 bg-slate-100 rounded-xl flex items-center justify-center text-slate-400 group-hover:text-blue-600 transition-colors shadow-2xs">
                        <Users size={18} />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[10px] font-black text-slate-400 font-mono tracking-wider uppercase">{p.id}</span>
                        {p.hospitalizedOrigin && (
                          <span className="text-[8.5px] font-black text-blue-600 uppercase tracking-tight bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100 mt-0.5 flex items-center gap-1">
                            <Activity size={10} /> {p.hospitalizedOrigin}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider border shadow-2xs ${getPriorityColor(p.priority || 'normal')}`}>
                      {p.priority || 'NORMAL'}
                    </div>
                  </div>

                  <h3 className="text-lg font-black mb-1 text-slate-900 truncate tracking-tight">{p.lastName} {p.firstName}</h3>
                  <p className="text-xs text-slate-500 font-medium mb-3.5">{p.age} ans • {p.gender === 'M' ? 'Masculin' : 'Féminin'}</p>

                  <div className="bg-slate-50/90 rounded-2xl p-3 mb-3.5 border border-slate-100 shadow-2xs">
                    <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Motif & Aperçu</p>
                    <p className="text-xs font-bold text-slate-700 truncate mb-2">{p.motifLabel || p.motif}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {(p.isAppointment || p.appointmentId) && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedAppointmentTrace(p);
                          }}
                          className="bg-indigo-100 hover:bg-indigo-200 text-indigo-800 px-2.5 py-0.5 rounded-lg text-[9px] font-black uppercase border border-indigo-300 flex items-center gap-1 cursor-pointer transition-colors"
                          title="Voir les détails du rendez-vous d'origine"
                        >
                          <span>📅 Rendez-vous</span>
                          <Info size={10} />
                        </button>
                      )}
                      {p.allergies && p.allergies.length > 0 && (
                        <span className="bg-rose-50 text-rose-600 px-2 py-0.5 rounded-lg text-[9px] font-black uppercase border border-rose-100 flex items-center gap-1">
                          <AlertCircle size={10} /> Allergies
                        </span>
                      )}
                      <span className="bg-blue-50 text-blue-600 px-2 py-0.5 rounded-lg text-[9px] font-black uppercase border border-blue-100">
                        Passage: 12/03
                      </span>
                    </div>
                  </div>

                  {/* Financial & Triage status badges */}
                  {(() => {
                    const isPaid = checkPatientIsPaid(p);
                    const isEmergency = p.priority === 'critique' || p.priority === 'urgent';

                    return (
                      <>
                        <div className="flex flex-wrap gap-1.5 mb-3.5">
                          {isPaid ? (
                            <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-1 rounded-xl text-[9px] font-black uppercase tracking-wider flex items-center gap-1 shadow-2xs">
                              <Check size={11} className="text-emerald-600" />
                              <span>Ticket Réglé</span>
                            </span>
                          ) : isEmergency ? (
                            <span className="bg-rose-50 text-rose-700 border border-rose-200 px-2.5 py-1 rounded-xl text-[9px] font-black uppercase tracking-wider flex items-center gap-1 shadow-2xs animate-pulse">
                              <Zap size={11} className="text-rose-600" />
                              <span>Urgence Vitale</span>
                            </span>
                          ) : (
                            <span className="bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-1 rounded-xl text-[9px] font-black uppercase tracking-wider flex items-center gap-1 shadow-2xs">
                              <AlertTriangle size={11} className="text-amber-600" />
                              <span>Ticket Non Encaissé</span>
                            </span>
                          )}

                          {p.status === 'waiting_triage' && (
                            <span className="bg-indigo-50 text-indigo-700 border border-indigo-200 px-2.5 py-1 rounded-xl text-[9px] font-black uppercase tracking-wider flex items-center gap-1">
                              <Activity size={11} className="text-indigo-600" />
                              <span>Attente Triage</span>
                            </span>
                          )}
                        </div>

                        <div className="grid grid-cols-3 gap-2 mb-4">
                          <div className="bg-slate-50/90 p-2 rounded-xl text-center border border-slate-100 shadow-2xs">
                            <p className="text-[8px] font-black text-slate-400 uppercase">T°</p>
                            <p className="text-xs font-black text-rose-600">{p.vitals?.temp || '--'}°C</p>
                          </div>
                          <div className="bg-slate-50/90 p-2 rounded-xl text-center border border-slate-100 shadow-2xs">
                            <p className="text-[8px] font-black text-slate-400 uppercase">TA</p>
                            <p className="text-xs font-black text-slate-900">{p.vitals?.bp || (p.vitals?.bpSys && p.vitals?.bpDia ? `${p.vitals.bpSys}/${p.vitals.bpDia}` : '--')}</p>
                          </div>
                          <div className="bg-slate-50/90 p-2 rounded-xl text-center border border-slate-100 shadow-2xs">
                            <p className="text-[8px] font-black text-slate-400 uppercase">SPO2</p>
                            <p className="text-xs font-black text-emerald-600">{p.vitals?.spo2 || '--'}%</p>
                          </div>
                        </div>

                        <div className="flex flex-col gap-2.5 pt-3.5 border-t border-slate-100">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              <div className={`w-2 h-2 rounded-full ${getPriorityDot(p.priority || 'normal')} animate-pulse`}></div>
                              <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Arrivé à {p.time}</span>
                            </div>
                            <div className="flex gap-1.5">
                              <button 
                                onClick={() => setSummaryPatient(p)}
                                className="p-1.5 bg-slate-100 text-slate-600 rounded-xl hover:bg-blue-600 hover:text-white transition-all cursor-pointer shadow-2xs" 
                                title="Voir résumé"
                              >
                                <Eye size={14} />
                              </button>
                              <button 
                                onClick={() => setReorientPatient(p)}
                                className="p-1.5 bg-slate-100 text-slate-600 rounded-xl hover:bg-blue-600 hover:text-white transition-all cursor-pointer shadow-2xs" 
                                title="Réorienter"
                              >
                                <RefreshCw size={14} />
                              </button>
                              <button 
                                onClick={() => {
                                  setCancelPatient(p);
                                  setCancelReason('');
                                  setCancelError('');
                                }}
                                className="p-1.5 bg-rose-50 text-rose-600 rounded-xl hover:bg-rose-600 hover:text-white transition-all cursor-pointer shadow-2xs" 
                                title="Annuler"
                              >
                                <X size={14} />
                              </button>
                            </div>
                          </div>
                          
                          {/* Financial Gatekeeper: Disabled if unpaid, unless Emergency (Critique/Urgent) */}
                          {isPaid ? (
                            <button 
                              onClick={() => onStartConsultation(p)}
                              className="w-full bg-slate-900 text-white px-4 py-3 rounded-2xl font-black text-xs uppercase tracking-wider hover:bg-blue-600 transition-all flex items-center justify-center gap-2 shadow-md hover:shadow-blue-600/25 cursor-pointer"
                            >
                              <Stethoscope size={14} />
                              <span>Démarrer consultation</span>
                              <ChevronRight size={14} />
                            </button>
                          ) : isEmergency ? (
                            <button 
                              onClick={() => onStartConsultation(p)}
                              className="w-full bg-gradient-to-r from-rose-600 to-amber-600 text-white px-4 py-3 rounded-2xl font-black text-xs uppercase tracking-wider hover:brightness-110 transition-all flex items-center justify-center gap-2 shadow-md shadow-rose-600/25 cursor-pointer"
                            >
                              <Zap size={14} className="animate-pulse" />
                              <span>Prise en charge Immédiate</span>
                              <ChevronRight size={14} />
                            </button>
                          ) : (
                            <button 
                              onClick={() => onStartConsultation(p)}
                              className="w-full bg-slate-900 hover:bg-amber-600 text-white px-4 py-3 rounded-2xl font-black text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow-md hover:shadow-amber-600/25 cursor-pointer"
                              title="Ouvrir la consultation (ticket en attente d'encaissement à la Caisse)"
                            >
                              <AlertTriangle size={14} className="text-amber-400" />
                              <span>Démarrer (Non Encaissé)</span>
                              <ChevronRight size={14} />
                            </button>
                          )}
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>
            ))}

            {waitingQueue.length === 0 && (
              <div className="col-span-full py-24 text-center bg-slate-50/80 rounded-3xl border-2 border-dashed border-slate-200">
                <Users size={48} className="mx-auto text-slate-300 mb-4 opacity-30" />
                <h3 className="text-base font-black text-slate-400 uppercase tracking-wider">Aucun patient en attente</h3>
                <p className="text-xs text-slate-500 mt-1 font-medium italic">Reposez-vous docteur, la file est vide.</p>
              </div>
            )}
          </>
        )}

        {activeTab === 'IN_PROGRESS' && (
          <>
            {inProgressQueue.map((p, idx) => (
              <div 
                key={`${p.queueDocId || p.appointmentId || p.id || 'patient'}-inprog-${idx}`} 
                className="bg-white rounded-3xl border border-slate-200/80 shadow-md shadow-slate-200/60 hover:shadow-2xl hover:shadow-blue-500/15 hover:-translate-y-1 hover:border-blue-500 transition-all duration-300 group relative overflow-hidden flex flex-col justify-between p-6"
              >
                <div>
                  <div className="absolute top-2 right-2 p-3 opacity-5 group-hover:scale-110 transition-transform pointer-events-none">
                    <Activity size={56} />
                  </div>
                  
                  <div className="flex justify-between items-start mb-3.5">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 bg-slate-100 rounded-xl flex items-center justify-center text-slate-400 group-hover:text-blue-600 transition-colors shadow-2xs">
                        <Users size={18} />
                      </div>
                      <span className="text-[10px] font-black text-slate-400 font-mono tracking-wider uppercase">{p.id}</span>
                    </div>
                    <div className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider border shadow-2xs ${
                      p.status === 'ready_for_discharge' 
                        ? 'bg-emerald-100 text-emerald-600 border-emerald-200' 
                        : 'bg-blue-100 text-blue-600 border-blue-200'
                    }`}>
                      {p.status === 'ready_for_discharge' ? 'Prêt pour sortie' : 'En consultation'}
                    </div>
                  </div>

                  <h3 className="text-lg font-black mb-1 text-slate-900 truncate tracking-tight">{p.lastName} {p.firstName}</h3>
                  <p className="text-xs text-slate-500 font-medium mb-3.5">{p.age} ans • {p.gender === 'M' ? 'Masculin' : 'Féminin'}</p>

                  <div className="bg-slate-50/90 rounded-2xl p-3 mb-3.5 border border-slate-100 shadow-2xs">
                    <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Motif d'admission</p>
                    <p className="text-xs font-bold text-slate-700 truncate mb-2">{p.motifLabel || p.motif}</p>
                    <div className="flex flex-wrap gap-1.5">
                      <span className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase border ${
                        p.status === 'ready_for_discharge'
                          ? 'bg-emerald-50 border-emerald-100 text-emerald-600'
                          : 'bg-blue-50 border-blue-100 text-blue-600'
                      }`}>
                        {p.status === 'ready_for_discharge' ? '✓ Clôturé' : '● En cours de saisie'}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 mb-4">
                    <div className="bg-slate-50/90 p-2 rounded-xl text-center border border-slate-100 shadow-2xs">
                      <p className="text-[8px] font-black text-slate-400 uppercase">T°</p>
                      <p className="text-xs font-black text-rose-600">{p.vitals?.temp || '--'}°C</p>
                    </div>
                    <div className="bg-slate-50/90 p-2 rounded-xl text-center border border-slate-100 shadow-2xs">
                      <p className="text-[8px] font-black text-slate-400 uppercase">TA</p>
                      <p className="text-xs font-black text-slate-900">{p.vitals?.bp || '--'}</p>
                    </div>
                    <div className="bg-slate-50/90 p-2 rounded-xl text-center border border-slate-100 shadow-2xs">
                      <p className="text-[8px] font-black text-slate-400 uppercase">SPO2</p>
                      <p className="text-xs font-black text-emerald-600">{p.vitals?.spo2 || '--'}%</p>
                    </div>
                  </div>
                </div>

                <div className="pt-3.5 border-t border-slate-100">
                  {p.status === 'ready_for_discharge' ? (
                    <button 
                      onClick={() => onManageDischarge && onManageDischarge(p)}
                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-3 rounded-2xl font-black text-xs uppercase tracking-wider shadow-md hover:shadow-emerald-600/25 transition-all flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Check size={14} /> Gérer la sortie (Décharge) <ChevronRight size={14} />
                    </button>
                  ) : (
                    <button 
                      onClick={() => onResumeConsultation && onResumeConsultation(p)}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 rounded-2xl font-black text-xs uppercase tracking-wider shadow-md hover:shadow-blue-600/25 transition-all flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Activity size={14} /> Reprendre Consultation <ChevronRight size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))}

            {inProgressQueue.length === 0 && (
              <div className="col-span-full py-24 text-center bg-slate-50/80 rounded-3xl border-2 border-dashed border-slate-200">
                <Activity size={48} className="mx-auto text-slate-300 mb-4 opacity-30 animate-pulse" />
                <h3 className="text-base font-black text-slate-400 uppercase tracking-wider">Aucune consultation en cours</h3>
                <p className="text-xs text-slate-500 font-medium italic mt-1">Tous les patients appelés ont été libérés.</p>
              </div>
            )}
          </>
        )}

        {activeTab === 'HOSPITALIZED' && (
          <>
            {hospitalizedQueue.map((p, idx) => (
              <div 
                key={`${p.id || 'hosp'}-hosp-${idx}`} 
                className="bg-white rounded-3xl border border-slate-200/80 shadow-md shadow-slate-200/60 hover:shadow-2xl hover:shadow-blue-500/15 hover:-translate-y-1 hover:border-blue-500 transition-all duration-300 group relative overflow-hidden flex flex-col justify-between p-6"
              >
                <div>
                  <div className="absolute top-2 right-2 p-3 opacity-5 group-hover:scale-110 transition-transform pointer-events-none">
                    <BedDouble size={56} />
                  </div>
                  
                  <div className="flex justify-between items-start mb-3.5">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 bg-slate-100 rounded-xl flex items-center justify-center text-slate-400 group-hover:text-blue-600 transition-colors shadow-2xs">
                        <Users size={18} />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[10px] font-black text-slate-400 font-mono tracking-wider uppercase">{p.id}</span>
                        <span className="text-[8.5px] font-black text-blue-600 uppercase tracking-tight bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100 mt-0.5 flex items-center gap-1">
                          <Activity size={10} /> {p.hospitalizedOrigin}
                        </span>
                      </div>
                    </div>
                    <div className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider border shadow-2xs ${getPriorityColor(p.priority || 'normal')}`}>
                      {p.priority || 'NORMAL'}
                    </div>
                  </div>

                  <h3 className="text-lg font-black mb-1 text-slate-900 truncate tracking-tight">{p.lastName} {p.firstName}</h3>
                  <p className="text-xs text-slate-500 font-medium mb-3.5">{p.age} ans • {p.gender === 'M' ? 'Masculin' : 'Féminin'}</p>

                  <div className="bg-slate-50/90 rounded-2xl p-3 mb-3.5 border border-slate-100 shadow-2xs">
                    <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Motif d'hospitalisation</p>
                    <p className="text-xs font-bold text-slate-700 mb-2 truncate">{p.motif}</p>
                    <div className="flex flex-wrap gap-1.5">
                      <span className="bg-blue-50 text-blue-600 px-2 py-0.5 rounded-lg text-[9px] font-black uppercase border border-blue-100">
                        Admis: {p.time}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 mb-4">
                    <div className="bg-slate-50/90 p-2 rounded-xl text-center border border-slate-100 shadow-2xs">
                      <p className="text-[8px] font-black text-slate-400 uppercase">T°</p>
                      <p className="text-xs font-black text-rose-600">{p.vitals?.temp || '--'}°C</p>
                    </div>
                    <div className="bg-slate-50/90 p-2 rounded-xl text-center border border-slate-100 shadow-2xs">
                      <p className="text-[8px] font-black text-slate-400 uppercase">TA</p>
                      <p className="text-xs font-black text-slate-900">{p.vitals?.bp || '--'}</p>
                    </div>
                    <div className="bg-slate-50/90 p-2 rounded-xl text-center border border-slate-100 shadow-2xs">
                      <p className="text-[8px] font-black text-slate-400 uppercase">Pouls</p>
                      <p className="text-xs font-black text-emerald-600">{p.vitals?.pulse || '--'} bpm</p>
                    </div>
                  </div>
                </div>

                <div className="pt-3.5 border-t border-slate-100">
                  <button 
                    onClick={() => onStartConsultation(p)}
                    className="w-full bg-slate-900 text-white px-4 py-3 rounded-2xl font-black text-xs uppercase tracking-wider hover:bg-blue-600 transition-all flex items-center justify-center gap-2 shadow-md hover:shadow-blue-600/25 cursor-pointer"
                  >
                    Visite médicale <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            ))}

            {hospitalizedQueue.length === 0 && (
              <div className="col-span-full py-24 text-center bg-slate-50/80 rounded-3xl border-2 border-dashed border-slate-200">
                <BedDouble size={48} className="mx-auto text-slate-300 mb-4 opacity-30" />
                <h3 className="text-base font-black text-slate-400 uppercase tracking-wider">Aucun patient hospitalisé</h3>
                <p className="text-xs text-slate-500 font-medium italic mt-1">Le service est actuellement vide.</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* 1. VIEW CLINICAL SUMMARY DIALOG */}
      {summaryPatient && (() => {
        const pSummary = getPatientSummary(summaryPatient);
        return (
          <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-300">
            <div className="bg-white rounded-[40px] border border-slate-200 w-full max-w-2xl p-10 shadow-2xl relative max-h-[85vh] overflow-y-auto">
              <button 
                onClick={() => setSummaryPatient(null)} 
                className="absolute top-8 right-8 p-3 bg-slate-100 text-slate-500 rounded-2xl hover:bg-rose-50 hover:text-rose-600 transition-all"
              >
                <X size={20} />
              </button>

              <div className="flex gap-6 items-center mb-8 pb-6 border-b border-slate-100">
                <AvatarPlaceholder size={64} iconSize={32} className="rounded-[28px] border-2 border-slate-200 dark:border-zinc-800" alt={`${summaryPatient.lastName} ${summaryPatient.firstName}`} />
                <div>
                  <div className="flex items-center gap-3">
                    <h3 className="text-2xl font-black text-slate-900">{summaryPatient.lastName} {summaryPatient.firstName}</h3>
                    <span className="text-[10px] font-black text-indigo-600 tracking-widest uppercase bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100 font-mono">
                      {summaryPatient.id}
                    </span>
                  </div>
                  <p className="text-xs font-semibold text-slate-500">
                    {summaryPatient.age} ans • {summaryPatient.gender === 'M' ? 'Masculin' : 'Féminin'}
                  </p>
                </div>
              </div>

              <div className="space-y-6">
                {/* Vitals Ribbon */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-slate-50 border border-slate-100 p-4 rounded-2xl text-center">
                    <p className="text-[9px] font-black text-slate-400 uppercase">Température</p>
                    <p className="text-lg font-black text-rose-600">{summaryPatient.vitals?.temp || '--'} °C</p>
                  </div>
                  <div className="bg-slate-50 border border-slate-100 p-4 rounded-2xl text-center">
                    <p className="text-[9px] font-black text-slate-400 uppercase">Tension Art.</p>
                    <p className="text-lg font-black text-slate-900">{summaryPatient.vitals?.bp || '--'}</p>
                  </div>
                  <div className="bg-slate-50 border border-slate-100 p-4 rounded-2xl text-center">
                    <p className="text-[9px] font-black text-slate-400 uppercase">SPO2</p>
                    <p className="text-lg font-black text-emerald-600">{summaryPatient.vitals?.spo2 || '--'} %</p>
                  </div>
                </div>

                {/* Allergies and Treatments */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-rose-50/50 border border-rose-100 p-6 rounded-2xl">
                    <h4 className="flex items-center gap-2 text-xs font-black uppercase text-rose-800 tracking-wider mb-3">
                      <ShieldAlert size={14} className="text-rose-600" /> Allergies
                    </h4>
                    {pSummary.allergies.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {pSummary.allergies.map((all: string, i: number) => (
                          <span key={i} className="bg-rose-100 text-rose-800 font-bold text-xs px-2.5 py-1 rounded-lg">
                            {all}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-rose-600/70 font-medium italic">Aucune allergie connue</p>
                    )}
                  </div>

                  <div className="bg-emerald-50/30 border border-emerald-100 p-6 rounded-2xl">
                    <h4 className="flex items-center gap-2 text-xs font-black uppercase text-emerald-800 tracking-wider mb-3">
                      <Pill size={14} className="text-emerald-600" /> Traitements Actifs
                    </h4>
                    <ul className="text-xs text-emerald-900 font-bold space-y-1.5">
                      {pSummary.treatments.map((tr: string, i: number) => (
                        <li key={i} className="flex items-center gap-2">
                          <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span>
                          {tr}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* Last consultations */}
                <div>
                  <h4 className="flex items-center gap-2 text-xs font-black uppercase text-slate-800 tracking-wider mb-3">
                    <FileText size={14} className="text-blue-600" /> Dernières Consultations
                  </h4>
                  <div className="border border-slate-100 rounded-2xl divide-y divide-slate-100 overflow-hidden">
                    {pSummary.consultations.map((c: any, i: number) => (
                      <div key={i} className="p-4 bg-slate-50/40 hover:bg-slate-50 transition-colors flex justify-between items-start text-xs">
                        <div>
                          <p className="font-bold text-slate-800 mb-0.5">{c.diagnosis}</p>
                          <p className="text-[10px] text-slate-500 font-medium">Motif : {c.motif} • {c.doctor}</p>
                        </div>
                        <span className="text-[10px] font-black text-slate-400 font-mono bg-white border border-slate-100 px-2 py-0.5 rounded">
                          {c.date}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Last Exams */}
                <div>
                  <h4 className="flex items-center gap-2 text-xs font-black uppercase text-slate-800 tracking-wider mb-3">
                    <TestTube size={14} className="text-purple-600" /> Derniers Examens
                  </h4>
                  <div className="border border-slate-100 rounded-2xl divide-y divide-slate-100 overflow-hidden">
                    {pSummary.exams.map((e: any, i: number) => (
                      <div key={i} className="p-4 bg-slate-50/40 flex justify-between items-center text-xs">
                        <div>
                          <p className="font-bold text-slate-800 mb-0.5">{e.type}</p>
                          <p className="text-[10px] text-purple-600 font-semibold">{e.result}</p>
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono bg-white border border-slate-100 px-2 py-0.5 rounded">
                          {e.date}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Hospitalizations */}
                <div>
                  <h4 className="flex items-center gap-2 text-xs font-black uppercase text-slate-800 tracking-wider mb-3">
                    <Activity size={14} className="text-amber-600" /> Hospitalisations Récentes
                  </h4>
                  {pSummary.hospitalisations.length > 0 ? (
                    <div className="border border-slate-100 rounded-2xl divide-y divide-slate-100 overflow-hidden">
                      {pSummary.hospitalisations.map((h: any, i: number) => (
                        <div key={i} className="p-4 bg-slate-50/40 text-xs text-slate-800 font-medium">
                          <p className="font-bold text-slate-900 mb-0.5">{h.motif} ({h.duration})</p>
                          <p className="text-[10px] text-slate-500">Service : {h.service} • Date : {h.date}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="bg-slate-50 text-slate-400 text-xs italic p-4 rounded-2xl border border-slate-100">
                      Aucune hospitalisation enregistrée
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-8 pt-6 border-t border-slate-100 flex justify-end">
                <button 
                  onClick={() => setSummaryPatient(null)}
                  className="bg-slate-900 text-white px-6 py-3 rounded-xl font-bold text-xs"
                >
                  Fermer
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 2. REORIENT DIALOG */}
      {reorientPatient && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="bg-white rounded-[40px] border border-slate-200 w-full max-w-sm p-10 shadow-2xl relative">
            <button 
              onClick={() => setReorientPatient(null)} 
              className="absolute top-8 right-8 p-3 bg-slate-100 text-slate-500 rounded-2xl hover:bg-rose-50 hover:text-rose-600 transition-all"
            >
              <X size={18} />
            </button>

            <h3 className="text-2xl font-black text-slate-900 mb-2">Réorienter Patient</h3>
            <p className="text-slate-500 text-sm mb-6 font-medium italic">
              Choisissez le service de destination pour {reorientPatient.lastName} {reorientPatient.firstName}.
            </p>

            <div className="space-y-3">
              {[
                { name: 'Maternité', code: 'Maternity', description: 'CPN, Travail, Accouchement' },
                { name: 'Urgences', code: 'Emergency', description: 'Triage immédiat, Soins critiques' },
                { name: 'Laboratoire', code: 'Laboratoire', description: 'Prélèvements, NFS, Examens' },
                { name: 'Soins', code: 'Soins', description: 'Soins infirmiers, Hospitalisation de jour' }
              ].map((serv) => (
                <button
                  key={serv.code}
                  onClick={() => handleReorientSelect(serv.code)}
                  className="w-full text-left p-4 rounded-2xl border border-slate-200 hover:border-blue-600 hover:bg-blue-50/30 transition-all group flex justify-between items-center cursor-pointer"
                >
                  <div>
                    <p className="font-bold text-slate-800 text-sm group-hover:text-blue-600 transition-colors">{serv.name}</p>
                    <p className="text-[10px] text-slate-400 font-semibold">{serv.description}</p>
                  </div>
                  <ChevronRight size={16} className="text-slate-400 group-hover:text-blue-600 transition-colors" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 3. CANCEL DIALOG */}
      {cancelPatient && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-300">
          <form 
            onSubmit={handleCancelSubmit}
            className="bg-white rounded-[40px] border border-slate-200 w-full max-w-md p-10 shadow-2xl relative"
          >
            <button 
              type="button"
              onClick={() => setCancelPatient(null)} 
              className="absolute top-8 right-8 p-3 bg-slate-100 text-slate-500 rounded-2xl hover:bg-rose-50 hover:text-rose-600 transition-all cursor-pointer"
            >
              <X size={18} />
            </button>

            <h3 className="text-2xl font-black text-slate-900 mb-2">Retirer de la file</h3>
            <p className="text-slate-500 text-sm mb-6 font-medium italic">
              Vous allez retirer {cancelPatient.lastName} {cancelPatient.firstName} de la file d'attente médicale.
            </p>

            {cancelError && (
              <div className="mb-4 p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-bold leading-snug flex items-center gap-2">
                <AlertCircle size={16} /> {cancelError}
              </div>
            )}

            {/* Quick Reasons Grid */}
            <div className="mb-6">
              <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider block mb-2">Motifs de retrait rapides</label>
              <div className="grid grid-cols-2 gap-2 mb-4">
                {[
                  "Patient parti spontanément",
                  "Erreur d'aiguillage",
                  "Déjà consulté",
                  "Transfert de service"
                ].map((reason) => (
                  <button
                    key={reason}
                    type="button"
                    onClick={() => {
                      setCancelReason(reason);
                      setCancelError('');
                    }}
                    className={`p-3 rounded-xl text-left border text-xs font-bold transition-all ${
                      cancelReason === reason 
                        ? 'bg-rose-50 text-rose-600 border-rose-300 shadow-sm' 
                        : 'bg-slate-50 text-slate-600 border-slate-100 hover:border-slate-200 hover:bg-slate-100/50'
                    }`}
                  >
                    {reason}
                  </button>
                ))}
              </div>

              <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider block mb-2">Ou précisez le motif personnalisé</label>
              <textarea
                value={cancelReason}
                onChange={(e) => {
                  setCancelReason(e.target.value);
                  if (e.target.value.trim()) setCancelError('');
                }}
                placeholder="Ex. Dossier incomplet, consultation reportée..."
                className="w-full text-sm p-4 border border-slate-200 rounded-2xl outline-none focus:border-rose-500 h-24 resize-none text-slate-800 font-bold"
              />
            </div>

            <div className="flex gap-4">
              <button
                type="button"
                onClick={() => setCancelPatient(null)}
                className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-slate-200 transition-colors cursor-pointer"
              >
                Retour
              </button>
              <button
                type="submit"
                className="flex-1 py-4 bg-rose-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-rose-700 transition-colors shadow-lg shadow-rose-600/20 cursor-pointer"
              >
                Confirmer
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Rendez-vous Traceability Modal */}
      {selectedAppointmentTrace && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl w-full max-w-md p-6 shadow-2xl border border-slate-100 space-y-4 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-indigo-100 text-indigo-700 flex items-center justify-center">
                  <Calendar size={20} />
                </div>
                <div>
                  <h4 className="font-black text-slate-900 text-sm">Traçabilité Rendez-vous</h4>
                  <p className="text-[11px] font-bold text-slate-500">
                    {selectedAppointmentTrace.lastName} {selectedAppointmentTrace.firstName}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedAppointmentTrace(null)}
                className="p-2 text-slate-400 hover:text-slate-700 rounded-xl cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>
            <div className="space-y-2.5 text-xs bg-slate-50 p-4 rounded-2xl border border-slate-100">
              <p><span className="font-black text-slate-500 uppercase">Date / Heure prévue :</span> <span className="font-bold text-slate-900">{selectedAppointmentTrace.appointmentDate || selectedAppointmentTrace.date || '-'} {selectedAppointmentTrace.appointmentTime ? `à ${selectedAppointmentTrace.appointmentTime}` : ''}</span></p>
              <p><span className="font-black text-slate-500 uppercase">Médecin / Référent :</span> <span className="font-bold text-slate-900">{selectedAppointmentTrace.appointmentDoctor || 'Non spécifié'}</span></p>
              <p><span className="font-black text-slate-500 uppercase">Motif initial :</span> <span className="font-bold text-indigo-700">{selectedAppointmentTrace.appointmentReason || selectedAppointmentTrace.motifLabel || selectedAppointmentTrace.motif || '-'}</span></p>
              {selectedAppointmentTrace.appointmentNotes && (
                <p><span className="font-black text-slate-500 uppercase">Notes :</span> <span className="font-medium text-slate-700">{selectedAppointmentTrace.appointmentNotes}</span></p>
              )}
              {selectedAppointmentTrace.isFreeFollowUp && (
                <p className="text-emerald-700 font-black">✓ Contrôle / Suivi gratuit validé</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => setSelectedAppointmentTrace(null)}
              className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-black text-xs uppercase tracking-wider cursor-pointer"
            >
              Fermer
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default WaitingRoom;
