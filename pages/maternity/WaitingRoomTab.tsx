import React, { useState } from 'react';
import { 
  Users, 
  Search, 
  PhoneCall, 
  Play, 
  FileText, 
  Clock, 
  Activity, 
  Stethoscope, 
  Baby, 
  AlertTriangle, 
  CheckCircle2, 
  ChevronRight,
  Filter,
  Loader2
} from 'lucide-react';
import { doc, updateDoc } from 'firebase/firestore';
import { db, sanitizeData } from '../../src/firebase';
import { User } from '../../types';

interface WaitingRoomTabProps {
  user?: User;
  queue?: any[];
  waitingQueue?: any[];
  onStartCpn?: (patient: any) => void;
  onSelectPatientForCpn?: (patient: any) => void;
  onStartAdmission?: (patient: any) => void;
  onSelectPatientForDelivery?: (patient: any) => void;
  onOpenDossier?: (patient: any) => void;
  theme?: 'light' | 'dark';
}

export const WaitingRoomTab: React.FC<WaitingRoomTabProps> = ({
  user,
  queue = [],
  waitingQueue = [],
  onStartCpn,
  onSelectPatientForCpn,
  onStartAdmission,
  onSelectPatientForDelivery,
  onOpenDossier,
  theme = 'light'
}) => {
  const safeQueue = (queue && queue.length > 0) ? queue : (waitingQueue || []);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'ALL' | 'CPN' | 'SUIVI' | 'ACCOUCHEMENT' | 'AUTRE'>('ALL');
  const [callingPatientId, setCallingPatientId] = useState<string | null>(null);
  const [startingCareKey, setStartingCareKey] = useState<string | null>(null);

  // Classify care type
  const getCareType = (p: any): { type: 'CPN' | 'SUIVI' | 'ACCOUCHEMENT' | 'AUTRE', label: string, color: string } => {
    const text = `${p.motif || ''} ${p.motifLabel || ''} ${p.speciality || ''}`.toLowerCase();
    if (text.includes('cpn') || text.includes('prénatal') || text.includes('prenatal')) {
      return { type: 'CPN', label: 'Consultation Prénatale (CPN)', color: 'bg-pink-100 text-pink-700 border-pink-200' };
    }
    if (text.includes('accouchement') || text.includes('travail') || text.includes('admission') || text.includes('maternite') || text.includes('maternité')) {
      return { type: 'ACCOUCHEMENT', label: 'Accouchement / Admission', color: 'bg-purple-100 text-purple-700 border-purple-200' };
    }
    if (text.includes('suivi') || text.includes('grossesse')) {
      return { type: 'SUIVI', label: 'Suivi de Grossesse', color: 'bg-blue-100 text-blue-700 border-blue-200' };
    }
    return { type: 'AUTRE', label: p.motifLabel || p.motif || 'Maternité', color: 'bg-slate-100 text-slate-700 border-slate-200' };
  };

  const handleCallPatient = async (patient: any) => {
    if (!patient.queueDocId) return;
    setCallingPatientId(patient.id);

    try {
      await updateDoc(doc(db, 'service_queues', patient.queueDocId), sanitizeData({
        status: 'called',
        calledAt: new Date().toISOString(),
        calledBy: user?.name || 'Maternité',
        lastUpdated: new Date().toISOString()
      }));

      // Audio notification if speech synthesis is available
      if ('speechSynthesis' in window) {
        const text = `Patiente ${patient.lastName} ${patient.firstName}, veuillez vous présenter en salle de maternité.`;
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'fr-FR';
        window.speechSynthesis.speak(utterance);
      }

      window.dispatchEvent(new CustomEvent('app-notification', {
        detail: `Patiente ${patient.lastName} ${patient.firstName} appelée.`
      }));
    } catch (err) {
      console.error('Erreur lors de l’appel:', err);
    } finally {
      setTimeout(() => setCallingPatientId(null), 1500);
    }
  };

  const handleStartCare = async (patient: any, target: 'cpn' | 'admission') => {
    const careKey = `${patient.id || patient.dmeId || 'pat'}-${target}`;
    if (startingCareKey === careKey) return;
    setStartingCareKey(careKey);

    try {
      if (patient.queueDocId) {
        try {
          await updateDoc(doc(db, 'service_queues', patient.queueDocId), sanitizeData({
            status: 'in_consultation',
            startedAt: new Date().toISOString(),
            startedBy: user?.name || 'Sage-femme',
            lastUpdated: new Date().toISOString()
          }));
        } catch (err) {
          console.warn('Erreur mise à jour statut file:', err);
        }
      }

      if (target === 'cpn') {
        if (onStartCpn) onStartCpn(patient);
        else if (onSelectPatientForCpn) onSelectPatientForCpn(patient);
      } else {
        if (onStartAdmission) onStartAdmission(patient);
        else if (onSelectPatientForDelivery) onSelectPatientForDelivery(patient);
      }
    } finally {
      setTimeout(() => setStartingCareKey(null), 1000);
    }
  };

  // Filter queue
  const filteredQueue = (safeQueue || []).filter(p => {
    const fullName = `${p.lastName || ''} ${p.firstName || ''}`.toLowerCase();
    const dme = `${p.dmeId || p.id || ''}`.toLowerCase();
    const matchSearch = fullName.includes(searchQuery.toLowerCase()) || dme.includes(searchQuery.toLowerCase());
    
    if (!matchSearch) return false;
    if (filterType === 'ALL') return true;
    const care = getCareType(p);
    return care.type === filterType;
  });

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-pink-100 text-pink-600 flex items-center justify-center font-bold">
              <Users size={22} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900">Salle d'Attente Maternité</h2>
              <p className="text-xs text-slate-500">Patientes orientées vers la maternité pour CPN, suivi ou accouchement</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text"
              placeholder="Rechercher patiente, N° dossier..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:border-pink-500 focus:bg-white transition-all"
            />
          </div>

          <span className="px-3 py-2 bg-pink-50 text-pink-700 rounded-xl text-xs font-bold whitespace-nowrap">
            {filteredQueue.length} patiente{filteredQueue.length > 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2">
        <button
          onClick={() => setFilterType('ALL')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors whitespace-nowrap ${
            filterType === 'ALL' ? 'bg-pink-600 text-white shadow-sm' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          Toutes ({safeQueue.length})
        </button>
        <button
          onClick={() => setFilterType('CPN')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors whitespace-nowrap ${
            filterType === 'CPN' ? 'bg-pink-600 text-white shadow-sm' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          CPN ({safeQueue.filter(p => getCareType(p).type === 'CPN').length})
        </button>
        <button
          onClick={() => setFilterType('SUIVI')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors whitespace-nowrap ${
            filterType === 'SUIVI' ? 'bg-pink-600 text-white shadow-sm' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          Suivi Grossesse ({safeQueue.filter(p => getCareType(p).type === 'SUIVI').length})
        </button>
        <button
          onClick={() => setFilterType('ACCOUCHEMENT')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors whitespace-nowrap ${
            filterType === 'ACCOUCHEMENT' ? 'bg-pink-600 text-white shadow-sm' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          Accouchement / Admission ({safeQueue.filter(p => getCareType(p).type === 'ACCOUCHEMENT').length})
        </button>
      </div>

      {/* Patients List */}
      {filteredQueue.length === 0 ? (
        <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center">
          <div className="w-16 h-16 rounded-full bg-slate-50 text-slate-300 flex items-center justify-center mx-auto mb-3">
            <Users size={32} />
          </div>
          <h3 className="text-base font-bold text-slate-700">Aucune patiente dans la salle d'attente</h3>
          <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
            Les patientes enregistrées à l'accueil avec orientation Maternité, CPN ou Accouchement apparaîtront automatiquement ici.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredQueue.map((patient, index) => {
            const care = getCareType(patient);
            const isCalled = patient.status === 'called';

            return (
              <div 
                key={patient.queueDocId || patient.id || index}
                className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm hover:border-pink-300 hover:shadow-md transition-all flex flex-col justify-between"
              >
                <div>
                  {/* Top line with care type & priority badge */}
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border ${care.color}`}>
                      {care.label}
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${
                      patient.priority === 'critique' ? 'bg-red-100 text-red-600' :
                      patient.priority === 'urgent' ? 'bg-amber-100 text-amber-600' :
                      'bg-slate-100 text-slate-600'
                    }`}>
                      {patient.priority || 'Normal'}
                    </span>
                  </div>

                  {/* Patient Info */}
                  <div className="flex items-start gap-3 mb-3">
                    <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-pink-500 to-rose-600 text-white flex items-center justify-center font-black text-sm shrink-0 shadow-sm">
                      {(patient.lastName?.[0] || 'P')}{(patient.firstName?.[0] || '')}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-bold text-slate-900 text-base truncate">
                        {patient.lastName} {patient.firstName}
                      </h3>
                      <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                        <span>{patient.age ? `${patient.age} ans` : 'Âge non renseigné'}</span>
                        <span>•</span>
                        <span className="font-mono text-[11px] text-slate-400">N° {patient.dmeId || patient.id}</span>
                      </div>
                    </div>
                  </div>

                  {/* Vitals / Arrival time / Motif */}
                  <div className="bg-slate-50 rounded-2xl p-3 space-y-1.5 text-xs text-slate-600 mb-4">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 flex items-center gap-1.5">
                        <Clock size={12} /> Heure d'arrivée
                      </span>
                      <span className="font-semibold text-slate-700">{patient.time || 'Aujourd\'hui'}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Motif</span>
                      <span className="font-semibold text-slate-700 truncate max-w-[170px]">
                        {patient.motifLabel || patient.motif || 'Orientation Maternité'}
                      </span>
                    </div>

                    {patient.vitals && (
                      <div className="flex items-center gap-3 pt-1 border-t border-slate-200/60 text-[11px] text-slate-500">
                        {patient.vitals.temp && <span>T°: <strong className="text-slate-700">{patient.vitals.temp}°C</strong></span>}
                        {patient.vitals.bpSys && <span>TA: <strong className="text-slate-700">{patient.vitals.bpSys}/{patient.vitals.bpDia}</strong></span>}
                        {patient.vitals.pulse && <span>Pouls: <strong className="text-slate-700">{patient.vitals.pulse} bpm</strong></span>}
                      </div>
                    )}

                    {isCalled && (
                      <div className="pt-1 text-[11px] font-bold text-amber-600 flex items-center gap-1">
                        <PhoneCall size={11} className="animate-pulse" />
                        Patiente appelée à {patient.calledAt ? new Date(patient.calledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'récemment'}
                      </div>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="space-y-2 pt-2 border-t border-slate-100">
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => handleCallPatient(patient)}
                      disabled={callingPatientId === patient.id}
                      className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                        isCalled 
                          ? 'bg-amber-100 text-amber-800 hover:bg-amber-200' 
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                      title="Appeler la patiente en salle"
                    >
                      <PhoneCall size={13} className={callingPatientId === patient.id ? 'animate-bounce' : ''} />
                      {isCalled ? 'Rappeler' : 'Appeler'}
                    </button>

                    <button
                      onClick={() => onOpenDossier ? onOpenDossier(patient) : (onStartCpn || onSelectPatientForCpn)?.(patient)}
                      className="px-3 py-2 rounded-xl text-xs font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                      title="Consulter le dossier médical"
                    >
                      <FileText size={13} />
                      Dossier
                    </button>
                  </div>

                  {/* Main Action : Start Care */}
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={startingCareKey === `${patient.id || patient.dmeId || 'pat'}-cpn`}
                      onClick={() => handleStartCare(patient, 'cpn')}
                      className="w-full py-2.5 bg-pink-600 text-white rounded-xl text-xs font-bold hover:bg-pink-700 transition-colors flex items-center justify-center gap-1.5 shadow-sm shadow-pink-600/20 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {startingCareKey === `${patient.id || patient.dmeId || 'pat'}-cpn` ? (
                        <>
                          <Loader2 size={13} className="animate-spin" />
                          Prise en charge...
                        </>
                      ) : (
                        <>
                          <Stethoscope size={13} />
                          Prise en charge CPN
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      disabled={startingCareKey === `${patient.id || patient.dmeId || 'pat'}-admission`}
                      onClick={() => handleStartCare(patient, 'admission')}
                      className="w-full py-2.5 bg-purple-600 text-white rounded-xl text-xs font-bold hover:bg-purple-700 transition-colors flex items-center justify-center gap-1.5 shadow-sm shadow-purple-600/20 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {startingCareKey === `${patient.id || patient.dmeId || 'pat'}-admission` ? (
                        <>
                          <Loader2 size={13} className="animate-spin" />
                          Admission...
                        </>
                      ) : (
                        <>
                          <Baby size={13} />
                          Admission Accouch.
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
