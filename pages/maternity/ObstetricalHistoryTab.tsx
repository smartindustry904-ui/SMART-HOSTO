import React, { useState, useEffect } from 'react';
import { 
  FileText, 
  Search, 
  Baby, 
  Calendar, 
  Heart, 
  Clock, 
  Printer, 
  ChevronRight, 
  User as UserIcon, 
  Activity, 
  Pill, 
  Beaker, 
  CheckCircle2, 
  X,
  Stethoscope,
  Scale,
  Thermometer,
  AlertTriangle,
  ShieldAlert,
  Sparkles,
  MapPin,
  Info
} from 'lucide-react';
import { 
  collection, 
  query, 
  onSnapshot, 
  orderBy 
} from 'firebase/firestore';
import { db } from '../../src/firebase';
import { 
  PregnancyDossier, 
  CPNVisit, 
  MaternityDelivery, 
  NewbornRecord, 
  User 
} from '../../types';
import { useSettings } from '../../hooks/useSettings';

interface ObstetricalHistoryTabProps {
  user: User;
  theme?: 'light' | 'dark';
}

export const ObstetricalHistoryTab: React.FC<ObstetricalHistoryTabProps> = ({
  user,
  theme = 'light'
}) => {
  const { establishment } = useSettings();

  // Data sets
  const [pregnancies, setPregnancies] = useState<PregnancyDossier[]>([]);
  const [cpnVisits, setCpnVisits] = useState<CPNVisit[]>([]);
  const [deliveries, setDeliveries] = useState<MaternityDelivery[]>([]);
  const [newborns, setNewborns] = useState<NewbornRecord[]>([]);

  // Search & Selection
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [selectedPatientName, setSelectedPatientName] = useState<string>('');
  const [selectedPatientDossier, setSelectedPatientDossier] = useState<string>('');

  // Modals
  const [viewDetailModal, setViewDetailModal] = useState<{
    type: 'PREGNANCY' | 'CPN' | 'DELIVERY' | 'NEWBORN';
    data: any;
  } | null>(null);

  // Load all collections
  useEffect(() => {
    const unsubPreg = onSnapshot(query(collection(db, 'pregnancy_dossiers'), orderBy('createdAt', 'desc')), (snap) => {
      setPregnancies(snap.docs.map(d => ({ id: d.id, ...d.data() } as PregnancyDossier)));
    });
    const unsubCpn = onSnapshot(query(collection(db, 'cpn_visits'), orderBy('date', 'desc')), (snap) => {
      setCpnVisits(snap.docs.map(d => ({ id: d.id, ...d.data() } as CPNVisit)));
    });
    const unsubDeliv = onSnapshot(query(collection(db, 'maternity_deliveries'), orderBy('createdAt', 'desc')), (snap) => {
      setDeliveries(snap.docs.map(d => ({ id: d.id, ...d.data() } as MaternityDelivery)));
    });
    const unsubNewborns = onSnapshot(query(collection(db, 'newborns'), orderBy('createdAt', 'desc')), (snap) => {
      setNewborns(snap.docs.map(d => ({ id: d.id, ...d.data() } as NewbornRecord)));
    });

    return () => {
      unsubPreg();
      unsubCpn();
      unsubDeliv();
      unsubNewborns();
    };
  }, []);

  // Compute unique patients list who have any obstetrical event
  const patientDirectory = React.useMemo(() => {
    const map = new Map<string, { id: string, name: string, dossier: string, pregCount: number, cpnCount: number, delivCount: number }>();

    pregnancies.forEach(p => {
      const pid = p.patientId;
      if (!map.has(pid)) {
        map.set(pid, { id: pid, name: p.patientName || 'Patiente', dossier: p.patientDossierNum || pid, pregCount: 0, cpnCount: 0, delivCount: 0 });
      }
      map.get(pid)!.pregCount += 1;
    });

    cpnVisits.forEach(c => {
      const pid = c.patientId;
      if (!map.has(pid)) {
        map.set(pid, { id: pid, name: c.patientName || 'Patiente', dossier: c.patientDossierNum || pid, pregCount: 0, cpnCount: 0, delivCount: 0 });
      }
      map.get(pid)!.cpnCount += 1;
    });

    deliveries.forEach(d => {
      const pid = d.motherPatientId;
      if (!map.has(pid)) {
        map.set(pid, { id: pid, name: d.motherName || 'Patiente', dossier: d.motherDossierNum || pid, pregCount: 0, cpnCount: 0, delivCount: 0 });
      }
      map.get(pid)!.delivCount += 1;
    });

    return Array.from(map.values());
  }, [pregnancies, cpnVisits, deliveries]);

  // Filter patients
  const filteredPatients = (patientDirectory || []).filter(p => {
    const text = `${p.name} ${p.dossier} ${p.id}`.toLowerCase();
    return text.includes(searchQuery.toLowerCase());
  });

  // Data for selected patient
  const patientPregnancies = selectedPatientId ? (pregnancies || []).filter(p => p.patientId === selectedPatientId) : [];
  const patientCpns = selectedPatientId ? (cpnVisits || []).filter(c => c.patientId === selectedPatientId) : [];
  const patientDeliveries = selectedPatientId ? (deliveries || []).filter(d => d.motherPatientId === selectedPatientId) : [];
  const patientNewborns = selectedPatientId ? (newborns || []).filter(n => n.motherId === selectedPatientId) : [];

  // Print function
  const handlePrintDossier = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-pink-100 text-pink-600 flex items-center justify-center font-bold">
              <FileText size={22} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900">Historique Obstétrical Global</h2>
              <p className="text-xs text-slate-500">
                Consultation du carnet obstétrical : grossesses, CPN, accouchements et nouveau-nés
              </p>
            </div>
          </div>
        </div>

        <div className="relative w-full md:w-80">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Rechercher patiente par nom, N° dossier..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:border-pink-500"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Patient Selection Directory (Left column) */}
        <div className="lg:col-span-4 bg-white rounded-3xl border border-slate-200 p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">
              Répertoire Patientes ({filteredPatients.length})
            </h3>
            {selectedPatientId && (
              <button
                onClick={() => setSelectedPatientId(null)}
                className="text-[11px] font-bold text-pink-600 hover:underline"
              >
                Tout voir
              </button>
            )}
          </div>

          {filteredPatients.length === 0 ? (
            <div className="py-8 text-center text-slate-400 text-xs">
              Aucune patiente avec historique obstétrical
            </div>
          ) : (
            <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
              {filteredPatients.map(p => {
                const isSelected = selectedPatientId === p.id;
                return (
                  <div
                    key={p.id}
                    onClick={() => {
                      setSelectedPatientId(p.id);
                      setSelectedPatientName(p.name);
                      setSelectedPatientDossier(p.dossier);
                    }}
                    className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
                      isSelected
                        ? 'bg-pink-50 border-pink-500 shadow-sm'
                        : 'bg-slate-50/70 border-slate-200 hover:bg-white hover:border-pink-300'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-black text-xs ${
                        isSelected ? 'bg-pink-600 text-white' : 'bg-pink-100 text-pink-700'
                      }`}>
                        {p.name[0]}
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-900 text-xs">{p.name}</h4>
                        <p className="text-[10px] text-slate-400 font-mono">Dossier N° {p.dossier}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 text-[10px] font-bold">
                      <span className="px-1.5 py-0.5 rounded bg-pink-100 text-pink-700" title="CPN">
                        {p.cpnCount} CPN
                      </span>
                      {p.delivCount > 0 && (
                        <span className="px-1.5 py-0.5 rounded bg-purple-100 text-purple-700" title="Accouchements">
                          {p.delivCount} Acc.
                        </span>
                      )}
                      <ChevronRight size={14} className="text-slate-300" />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Detailed Timeline & Dossier (Right column) */}
        <div className="lg:col-span-8 space-y-6">
          {!selectedPatientId ? (
            <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center text-slate-400 shadow-sm">
              <FileText size={36} className="mx-auto mb-2 opacity-30" />
              <h3 className="text-base font-bold text-slate-700">Sélectionnez une patiente</h3>
              <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                Cliquez sur une patiente dans le répertoire de gauche pour consulter sa chronologie obstétricale complète.
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-6">
              {/* Dossier Header */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-pink-600 text-white flex items-center justify-center font-black text-base shadow-sm">
                    {selectedPatientName[0]}
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">{selectedPatientName}</h3>
                    <p className="text-xs text-slate-400 font-mono">Dossier N° {selectedPatientDossier || selectedPatientId}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handlePrintDossier}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Printer size={14} /> Imprimer Dossier
                  </button>
                </div>
              </div>

              {/* Summary KPIs */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-pink-50/50 p-3.5 rounded-2xl border border-pink-100">
                  <span className="text-[10px] font-bold text-pink-600 uppercase">Grossesses enregistrées</span>
                  <p className="text-xl font-black text-pink-950 mt-0.5">{patientPregnancies.length}</p>
                </div>
                <div className="bg-blue-50/50 p-3.5 rounded-2xl border border-blue-100">
                  <span className="text-[10px] font-bold text-blue-600 uppercase">CPN Réalisées</span>
                  <p className="text-xl font-black text-blue-950 mt-0.5">{patientCpns.length}</p>
                </div>
                <div className="bg-purple-50/50 p-3.5 rounded-2xl border border-purple-100">
                  <span className="text-[10px] font-bold text-purple-600 uppercase">Accouchements</span>
                  <p className="text-xl font-black text-purple-950 mt-0.5">{patientDeliveries.length}</p>
                </div>
                <div className="bg-emerald-50/50 p-3.5 rounded-2xl border border-emerald-100">
                  <span className="text-[10px] font-bold text-emerald-600 uppercase">Enfants nés</span>
                  <p className="text-xl font-black text-emerald-950 mt-0.5">{patientNewborns.length}</p>
                </div>
              </div>

              {/* 1. Grossesses & CPN */}
              <div className="space-y-3">
                <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                  <Calendar size={14} className="text-pink-600" />
                  Consultations Prénatales (CPN)
                </h4>

                {patientCpns.length === 0 ? (
                  <p className="text-xs text-slate-400 italic bg-slate-50 p-4 rounded-2xl">
                    Aucune CPN enregistrée pour cette patiente.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-2xl overflow-hidden">
                    {patientCpns.map((cpn, idx) => (
                      <div
                        key={cpn.id}
                        className="p-4 bg-white hover:bg-slate-50 flex items-center justify-between transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-xl bg-pink-100 text-pink-700 flex items-center justify-center font-black text-xs">
                            C{cpn.visitNumber || idx + 1}
                          </div>
                          <div>
                            <p className="text-xs font-bold text-slate-900">
                              CPN {cpn.visitNumber || idx + 1} — {new Date(cpn.date).toLocaleDateString('fr-FR')} à {cpn.time || ''}
                            </p>
                            <p className="text-[11px] text-slate-500">
                              Terme: <strong className="text-pink-600">{cpn.week} SA</strong> • Poids: {cpn.weight} kg • TA: {cpn.bpSys}/{cpn.bpDia} • HU: {cpn.fundalHeight} cm • BCF: {cpn.bcf} bpm
                            </p>
                            {cpn.conclusion && (
                              <p className="text-[10px] text-slate-600 italic mt-0.5">
                                Conclusion : {cpn.conclusion}
                              </p>
                            )}
                          </div>
                        </div>

                        <button
                          onClick={() => setViewDetailModal({ type: 'CPN', data: cpn })}
                          className="px-3 py-1.5 bg-slate-100 hover:bg-pink-100 hover:text-pink-700 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                        >
                          Détails
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 2. Accouchements & Nouveau-nés */}
              <div className="space-y-3 pt-2">
                <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                  <Baby size={14} className="text-purple-600" />
                  Accouchements & Nouveau-nés
                </h4>

                {patientDeliveries.length === 0 ? (
                  <p className="text-xs text-slate-400 italic bg-slate-50 p-4 rounded-2xl">
                    Aucun accouchement enregistré dans l’établissement.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {patientDeliveries.map((deliv) => {
                      const matchingNewborn = patientNewborns.find(n => n.deliveryId === deliv.id || n.motherId === deliv.motherPatientId);

                      return (
                        <div
                          key={deliv.id}
                          className="p-4 rounded-2xl border border-purple-200 bg-purple-50/30 space-y-3"
                        >
                          <div className="flex items-start justify-between">
                            <div>
                              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800 uppercase">
                                {deliv.deliveryMode}
                              </span>
                              <h5 className="font-bold text-slate-900 text-xs mt-1">
                                Accouchement le {new Date(deliv.deliveryDate).toLocaleDateString('fr-FR')} à {deliv.deliveryTime}
                              </h5>
                              <p className="text-[11px] text-slate-500">
                                Réalisé par : <strong>{deliv.attendedBy}</strong> • Lieu : {deliv.location}
                              </p>
                            </div>

                            <button
                              onClick={() => setViewDetailModal({ type: 'DELIVERY', data: deliv })}
                              className="px-3 py-1.5 bg-white border border-purple-200 text-purple-700 rounded-xl text-xs font-bold hover:bg-purple-100 transition-colors"
                            >
                              Fiche Accouchement
                            </button>
                          </div>

                          {matchingNewborn && (
                            <div className="bg-white p-3 rounded-xl border border-purple-100 flex items-center justify-between text-xs">
                              <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-lg bg-pink-100 text-pink-600 flex items-center justify-center font-black">
                                  <Baby size={16} />
                                </div>
                                <div>
                                  <p className="font-bold text-slate-900">
                                    Nouveau-né ({matchingNewborn.gender === 'M' ? 'Garçon' : 'Fille'})
                                  </p>
                                  <p className="text-[10px] text-slate-400 font-mono">
                                    N° Dossier : {matchingNewborn.dossierNumber} • Poids : {matchingNewborn.weight}g • Apgar : {matchingNewborn.apgar1}/{matchingNewborn.apgar5}
                                  </p>
                                </div>
                              </div>

                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700">
                                {matchingNewborn.status}
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* MODAL: DETAIL MODAL */}
      {viewDetailModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-3xl max-w-3xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden border border-slate-100">
            {/* Modal Header / Micro-Header */}
            <div className="p-4 sm:p-5 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${
                  viewDetailModal.type === 'CPN' ? 'bg-pink-100 text-pink-600' : 'bg-purple-100 text-purple-600'
                }`}>
                  {viewDetailModal.type === 'CPN' ? <Stethoscope size={20} /> : <Baby size={20} />}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-extrabold text-sm sm:text-base text-slate-900 truncate">
                      {viewDetailModal.type === 'CPN' 
                        ? `Consultation Prénatale — CPN ${viewDetailModal.data?.visitNumber || 1}`
                        : 'Fiche d’Accouchement & Déclaration de Naissance'}
                    </h3>
                    {viewDetailModal.type === 'CPN' && viewDetailModal.data?.week && (
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-black bg-pink-100 text-pink-700">
                        {viewDetailModal.data.week} SA
                      </span>
                    )}
                    {viewDetailModal.type === 'CPN' && viewDetailModal.data?.isRiskPregnancy && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-100 text-rose-700 flex items-center gap-1">
                        <AlertTriangle size={11} /> Grossesse à Risque
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 truncate mt-0.5">
                    {viewDetailModal.type === 'CPN' 
                      ? `${viewDetailModal.data?.patientName || selectedPatientName || 'Patiente'} • Dossier N° ${viewDetailModal.data?.patientDossierNum || viewDetailModal.data?.patientId || selectedPatientDossier || '-'}`
                      : `Mère : ${viewDetailModal.data?.motherName || 'Parturiente'} • Dossier N° ${viewDetailModal.data?.motherDossierNum || viewDetailModal.data?.motherPatientId || '-'}`}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                  title="Imprimer cette fiche"
                >
                  <Printer size={17} />
                </button>
                <button 
                  type="button"
                  onClick={() => setViewDetailModal(null)} 
                  className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                  title="Fermer"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 text-xs">
              {viewDetailModal.type === 'CPN' ? (
                <>
                  {/* Meta Strip */}
                  <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-pink-50/50 rounded-2xl border border-pink-100 text-pink-900 text-[11px] font-medium">
                    <div className="flex items-center gap-1.5">
                      <Calendar size={13} className="text-pink-600" />
                      <span>Date : <strong>{viewDetailModal.data?.date ? new Date(viewDetailModal.data.date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '-'}</strong></span>
                    </div>
                    {viewDetailModal.data?.time && (
                      <div className="flex items-center gap-1.5">
                        <Clock size={13} className="text-pink-600" />
                        <span>Heure : <strong>{viewDetailModal.data.time}</strong></span>
                      </div>
                    )}
                    <div className="flex items-center gap-1.5">
                      <UserIcon size={13} className="text-pink-600" />
                      <span>Praticien : <strong>{viewDetailModal.data?.userName || viewDetailModal.data?.midwife || user.name || 'Sage-femme'}</strong></span>
                    </div>
                    {viewDetailModal.data?.nextVisitDate && (
                      <div className="flex items-center gap-1.5 bg-white/80 px-2 py-0.5 rounded-lg border border-pink-200">
                        <Calendar size={12} className="text-pink-600" />
                        <span>Prochain RDV : <strong>{new Date(viewDetailModal.data.nextVisitDate).toLocaleDateString('fr-FR')}</strong></span>
                      </div>
                    )}
                  </div>

                  {/* Vitals & Obstetrical Measurements Grid */}
                  <div>
                    <h4 className="text-[11px] font-black uppercase tracking-wider text-slate-400 mb-2.5 flex items-center gap-1.5">
                      <Activity size={14} className="text-pink-600" />
                      Constantes Vitales & Mesures Obstétricales
                    </h4>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                      {/* Tension */}
                      <div className="p-3 bg-slate-50 border border-slate-100 rounded-2xl">
                        <span className="text-slate-400 text-[10px] uppercase font-bold block mb-0.5">Tension Artérielle</span>
                        <div className="flex items-baseline gap-1.5">
                          <p className="font-extrabold text-sm text-slate-900">
                            {viewDetailModal.data?.bpSys ? `${viewDetailModal.data.bpSys}/${viewDetailModal.data.bpDia}` : '120/80'} <span className="text-[10px] font-normal text-slate-500">mmHg</span>
                          </p>
                        </div>
                        <span className={`text-[9px] font-extrabold px-1.5 py-0.2 rounded-sm inline-block mt-1 ${
                          (viewDetailModal.data?.bpSys || 0) >= 140 || (viewDetailModal.data?.bpDia || 0) >= 90
                            ? 'bg-rose-100 text-rose-700'
                            : 'bg-emerald-100 text-emerald-700'
                        }`}>
                          {(viewDetailModal.data?.bpSys || 0) >= 140 || (viewDetailModal.data?.bpDia || 0) >= 90 ? 'Élevée' : 'Normale'}
                        </span>
                      </div>

                      {/* Poids */}
                      <div className="p-3 bg-slate-50 border border-slate-100 rounded-2xl">
                        <span className="text-slate-400 text-[10px] uppercase font-bold block mb-0.5">Poids Maternel</span>
                        <p className="font-extrabold text-sm text-slate-900">
                          {viewDetailModal.data?.weight || '-'} <span className="text-[10px] font-normal text-slate-500">kg</span>
                        </p>
                        <span className="text-[10px] text-slate-400 mt-1 block">Pesée clinique</span>
                      </div>

                      {/* Hauteur Utérine */}
                      <div className="p-3 bg-slate-50 border border-slate-100 rounded-2xl">
                        <span className="text-slate-400 text-[10px] uppercase font-bold block mb-0.5">Hauteur Utérine</span>
                        <p className="font-extrabold text-sm text-slate-900">
                          {viewDetailModal.data?.fundalHeight || '-'} <span className="text-[10px] font-normal text-slate-500">cm</span>
                        </p>
                        <span className="text-[10px] text-slate-400 mt-1 block">Croissance utérine</span>
                      </div>

                      {/* BCF */}
                      <div className="p-3 bg-slate-50 border border-slate-100 rounded-2xl">
                        <span className="text-slate-400 text-[10px] uppercase font-bold block mb-0.5">Bruits Cœur Fœtal</span>
                        <p className="font-extrabold text-sm text-emerald-600">
                          {viewDetailModal.data?.bcf || '-'} <span className="text-[10px] font-normal text-slate-500">bpm</span>
                        </p>
                        <span className="text-[9px] font-extrabold px-1.5 py-0.2 rounded-sm inline-block mt-1 bg-emerald-100 text-emerald-700">
                          Actif & Régulier
                        </span>
                      </div>

                      {/* Mouvements Fœtaux */}
                      <div className="p-3 bg-slate-50 border border-slate-100 rounded-2xl">
                        <span className="text-slate-400 text-[10px] uppercase font-bold block mb-0.5">Mouvements Fœtaux</span>
                        <p className="font-bold text-slate-800">
                          {viewDetailModal.data?.fetalMovements === false ? 'Absents' : viewDetailModal.data?.fetalMovements || 'Actifs / Présents'}
                        </p>
                      </div>

                      {/* Présentation */}
                      <div className="p-3 bg-slate-50 border border-slate-100 rounded-2xl">
                        <span className="text-slate-400 text-[10px] uppercase font-bold block mb-0.5">Présentation</span>
                        <p className="font-bold text-slate-800">
                          {viewDetailModal.data?.presentation || 'Céphalique'}
                        </p>
                      </div>

                      {/* Œdèmes */}
                      <div className="p-3 bg-slate-50 border border-slate-100 rounded-2xl">
                        <span className="text-slate-400 text-[10px] uppercase font-bold block mb-0.5">Œdèmes</span>
                        <p className="font-bold text-slate-800">
                          {viewDetailModal.data?.edema === true ? 'Présents (+)' : viewDetailModal.data?.edema || 'Absents'}
                        </p>
                      </div>

                      {/* Albumine / Protéinurie */}
                      <div className="p-3 bg-slate-50 border border-slate-100 rounded-2xl">
                        <span className="text-slate-400 text-[10px] uppercase font-bold block mb-0.5">Bandelette Urinaire</span>
                        <p className="font-bold text-slate-800">
                          Alb : {viewDetailModal.data?.proteinuria || viewDetailModal.data?.albumin || 'Nég'} • Sucre : {viewDetailModal.data?.sugar || 'Nég'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Anamnèse & Motif */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-100">
                      <span className="text-slate-400 text-[10px] uppercase font-bold block mb-1">Motif de Consultation</span>
                      <p className="font-semibold text-slate-800">
                        {viewDetailModal.data?.motif || 'Suivi prénatal systématique'}
                      </p>
                    </div>

                    <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-100">
                      <span className="text-slate-400 text-[10px] uppercase font-bold block mb-1">Plaintes & Symptômes rapportés</span>
                      <p className="font-semibold text-slate-800">
                        {Array.isArray(viewDetailModal.data?.complaints) && viewDetailModal.data.complaints.length > 0
                          ? viewDetailModal.data.complaints.join(', ')
                          : viewDetailModal.data?.symptoms || 'Aucune plainte spontanée'}
                      </p>
                    </div>
                  </div>

                  {/* Diagnostic & Conduite à tenir */}
                  <div className="p-4 bg-purple-50/50 border border-purple-100 rounded-2xl space-y-2">
                    <div>
                      <span className="text-purple-800 text-[10px] uppercase font-black tracking-wider block mb-0.5">Conclusion Médicale & Diagnostic</span>
                      <p className="font-bold text-purple-950 text-sm">
                        {viewDetailModal.data?.conclusion || viewDetailModal.data?.diagnosis || 'Grossesse évolutive physiologique'}
                      </p>
                    </div>
                    {viewDetailModal.data?.actionPlan && (
                      <div className="pt-2 border-t border-purple-100">
                        <span className="text-purple-700 text-[10px] uppercase font-bold block mb-0.5">Conduite à Tenir / Plan d'Action</span>
                        <p className="text-slate-700">
                          {viewDetailModal.data.actionPlan}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Prescribed Exams Table */}
                  {viewDetailModal.data?.prescribedExams && viewDetailModal.data.prescribedExams.length > 0 && (
                    <div>
                      <h4 className="text-[11px] font-black uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5">
                        <Beaker size={14} className="text-blue-600" />
                        Bilans & Examens Biologiques Demandés
                      </h4>
                      <div className="border border-slate-200 rounded-2xl overflow-hidden">
                        <table className="w-full text-left">
                          <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-black text-slate-500 uppercase">
                            <tr>
                              <th className="py-2.5 px-4">Examen</th>
                              <th className="py-2.5 px-4">Catégorie</th>
                              <th className="py-2.5 px-4 text-right">Statut</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 text-xs">
                            {viewDetailModal.data.prescribedExams.map((exam: any, idx: number) => (
                              <tr key={idx} className="hover:bg-slate-50/50">
                                <td className="py-2 px-4 font-bold text-slate-800">{exam.name || exam.id}</td>
                                <td className="py-2 px-4 text-slate-500">{exam.category || 'Biologie'}</td>
                                <td className="py-2 px-4 text-right">
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-100 text-blue-700">
                                    Prescrit
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Prescriptions Table */}
                  {viewDetailModal.data?.prescriptions && viewDetailModal.data.prescriptions.length > 0 && (
                    <div>
                      <h4 className="text-[11px] font-black uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5">
                        <Pill size={14} className="text-emerald-600" />
                        Prescriptions Médicamenteuses
                      </h4>
                      <div className="border border-slate-200 rounded-2xl overflow-hidden">
                        <table className="w-full text-left">
                          <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-black text-slate-500 uppercase">
                            <tr>
                              <th className="py-2.5 px-4">Médicament</th>
                              <th className="py-2.5 px-4">Dosage</th>
                              <th className="py-2.5 px-4">Fréquence</th>
                              <th className="py-2.5 px-4 text-right">Durée</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 text-xs">
                            {viewDetailModal.data.prescriptions.map((med: any, idx: number) => (
                              <tr key={idx} className="hover:bg-slate-50/50">
                                <td className="py-2 px-4 font-bold text-slate-800">{med.name}</td>
                                <td className="py-2 px-4 text-slate-600">{med.dosage || '-'}</td>
                                <td className="py-2 px-4 text-slate-600">{med.frequency || '-'}</td>
                                <td className="py-2 px-4 text-right font-medium text-slate-700">{med.duration || '-'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* General Advice & Supplementation */}
                  {(viewDetailModal.data?.dietaryAdvice || viewDetailModal.data?.supplementation || viewDetailModal.data?.generalAdvice) && (
                    <div className="p-3.5 bg-amber-50/60 border border-amber-100 rounded-2xl text-[11px] text-amber-900 space-y-1">
                      <span className="font-extrabold uppercase text-[10px] tracking-wider text-amber-800 block">
                        Conseils Hygiéno-Diététiques & Supplémentation
                      </span>
                      <p>{viewDetailModal.data.dietaryAdvice || viewDetailModal.data.supplementation || viewDetailModal.data.generalAdvice}</p>
                    </div>
                  )}
                </>
              ) : (
                /* ACCUCHEMENT / DELIVERY VIEW */
                <>
                  {/* Delivery Parameters Grid */}
                  <div>
                    <h4 className="text-[11px] font-black uppercase tracking-wider text-slate-400 mb-2.5 flex items-center gap-1.5">
                      <Baby size={14} className="text-purple-600" />
                      Données de l'Accouchement
                    </h4>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                      <div className="p-3 bg-slate-50 border border-slate-100 rounded-2xl">
                        <span className="text-slate-400 text-[10px] uppercase font-bold block mb-0.5">Mode d'accouchement</span>
                        <p className="font-bold text-slate-900">{viewDetailModal.data?.deliveryMode || 'Voie basse'}</p>
                      </div>

                      <div className="p-3 bg-slate-50 border border-slate-100 rounded-2xl">
                        <span className="text-slate-400 text-[10px] uppercase font-bold block mb-0.5">Date & Heure</span>
                        <p className="font-bold text-slate-900">
                          {viewDetailModal.data?.deliveryDate ? new Date(viewDetailModal.data.deliveryDate).toLocaleDateString('fr-FR') : '-'} à {viewDetailModal.data?.deliveryTime || '-'}
                        </p>
                      </div>

                      <div className="p-3 bg-slate-50 border border-slate-100 rounded-2xl">
                        <span className="text-slate-400 text-[10px] uppercase font-bold block mb-0.5">Présentation</span>
                        <p className="font-bold text-slate-900">{viewDetailModal.data?.fetalPresentation || 'Céphalique'}</p>
                      </div>

                      <div className="p-3 bg-slate-50 border border-slate-100 rounded-2xl">
                        <span className="text-slate-400 text-[10px] uppercase font-bold block mb-0.5">Lieu / Salle</span>
                        <p className="font-bold text-slate-900">{viewDetailModal.data?.location || 'Salle d’accouchement'}</p>
                      </div>
                    </div>
                  </div>

                  {/* Newborn Identity Card */}
                  <div className="p-4 bg-purple-50/60 border border-purple-100 rounded-2xl space-y-3">
                    <h4 className="text-[11px] font-black uppercase tracking-wider text-purple-900 flex items-center gap-1.5">
                      <Heart size={14} className="text-purple-600" />
                      Fiche du Nouveau-né
                    </h4>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                      <div>
                        <span className="text-slate-400 block text-[10px]">Sexe :</span>
                        <p className="font-extrabold text-slate-900">
                          {viewDetailModal.data?.newbornGender === 'M' ? 'Masculin (Garçon)' : viewDetailModal.data?.newbornGender === 'F' ? 'Féminin (Fille)' : 'Indéterminé'}
                        </p>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px]">Poids à la naissance :</span>
                        <p className="font-extrabold text-slate-900">{viewDetailModal.data?.newbornWeight || '-'} g</p>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px]">Taille :</span>
                        <p className="font-extrabold text-slate-900">{viewDetailModal.data?.newbornHeight || '-'} cm</p>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px]">Périmètre Crânien :</span>
                        <p className="font-extrabold text-slate-900">{viewDetailModal.data?.newbornHeadCircumference ? `${viewDetailModal.data.newbornHeadCircumference} cm` : '-'}</p>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-purple-100 flex items-center gap-4 flex-wrap">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] uppercase font-black text-purple-800">Score Apgar 1 min :</span>
                        <span className="px-2 py-0.5 bg-white text-purple-700 font-extrabold rounded-lg border border-purple-200">
                          {viewDetailModal.data?.apgar1Min ?? '-'} / 10
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] uppercase font-black text-purple-800">Score Apgar 5 min :</span>
                        <span className="px-2 py-0.5 bg-white text-emerald-700 font-extrabold rounded-lg border border-emerald-200">
                          {viewDetailModal.data?.apgar5Min ?? '-'} / 10
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Observations */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-100">
                      <span className="text-slate-400 text-[10px] uppercase font-bold block mb-1">Observations Maternelles</span>
                      <p className="font-medium text-slate-800">
                        {viewDetailModal.data?.maternalObservations || 'Délivrance complète sans complication.'}
                      </p>
                    </div>

                    <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-100">
                      <span className="text-slate-400 text-[10px] uppercase font-bold block mb-1">Observations Néonatales</span>
                      <p className="font-medium text-slate-800">
                        {viewDetailModal.data?.newbornObservations || 'Nouveau-né bien portant et réactif.'}
                      </p>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex justify-end shrink-0">
              <button
                type="button"
                onClick={() => setViewDetailModal(null)}
                className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold text-xs shadow-sm transition-all cursor-pointer"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
