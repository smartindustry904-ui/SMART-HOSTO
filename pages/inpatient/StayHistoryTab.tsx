import React, { useState, useEffect } from 'react';
import { 
  ClipboardList, Search, Calendar, Clock, User, 
  BedDouble, CheckCircle2, Eye, X, Printer, Activity, Heart, FileText 
} from 'lucide-react';
import { db } from '../../src/firebase';
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import { InpatientRecord } from '../../types';

export const StayHistoryTab: React.FC = () => {
  const [records, setRecords] = useState<InpatientRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRecord, setSelectedRecord] = useState<InpatientRecord | null>(null);

  useEffect(() => {
    setIsLoading(true);
    const q = query(
      collection(db, 'inpatient_records'),
      where('status', 'in', ['discharged', 'pending_discharge'])
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as InpatientRecord));
      list.sort((a, b) => new Date(b.admissionDate || 0).getTime() - new Date(a.admissionDate || 0).getTime());
      setRecords(list);
      setIsLoading(false);
    }, (err) => {
      console.error("Error loading inpatient history:", err);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const filteredRecords = records.filter(r => {
    const term = searchTerm.toLowerCase().trim();
    if (!term) return true;
    const name = (r.patientName || '').toLowerCase();
    const id = (r.patientDossier || r.patientId || '').toLowerCase();
    const bed = (r.bedName || r.bedId || '').toLowerCase();
    return name.includes(term) || id.includes(term) || bed.includes(term);
  });

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-3 duration-300">
      
      {/* Header Card */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-500/20">
            <ClipboardList size={20} />
          </div>
          <div>
            <h2 className="text-xl font-black text-slate-900 tracking-tight">
              Historique des Séjours & Sorties
            </h2>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-0.5">
              Dossiers des hospitalisations clôturées et traçabilité des soins
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="px-4 py-2 bg-slate-100 text-slate-700 rounded-2xl text-xs font-black uppercase tracking-wider">
            {records.length} Séjour{records.length > 1 ? 's' : ''} archivé{records.length > 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Search Input */}
      <div className="relative max-w-md">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Rechercher par patient, lit, dossier..."
          className="w-full pl-11 pr-4 py-2.5 bg-white border border-slate-200 rounded-2xl font-bold text-xs text-slate-800 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
        />
      </div>

      {/* Records Table */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        {filteredRecords.length === 0 ? (
          <div className="py-20 text-center text-slate-400">
            <ClipboardList size={40} className="mx-auto text-slate-300 mb-3" />
            <p className="font-bold text-slate-600">Aucun historique de séjour disponible</p>
            <p className="text-xs text-slate-400 mt-1">
              Les séjours libérés et archivés apparaîtront automatiquement dans ce registre.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-100 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                <tr>
                  <th className="py-4 px-6">Patient</th>
                  <th className="py-4 px-6">Lit / Chambre</th>
                  <th className="py-4 px-6">Date d'admission</th>
                  <th className="py-4 px-6">Date de sortie</th>
                  <th className="py-4 px-6">Durée</th>
                  <th className="py-4 px-6">Motif de sortie</th>
                  <th className="py-4 px-6 text-right">Dossier</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-bold">
                {filteredRecords.map(rec => (
                  <tr key={rec.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-4 px-6">
                      <p className="font-black text-slate-900 text-sm">{rec.patientName}</p>
                      <p className="text-[10px] text-slate-400 font-mono tracking-tight uppercase">
                        N° {rec.patientDossier || rec.patientId}
                      </p>
                    </td>

                    <td className="py-4 px-6 text-slate-800">
                      <span className="px-2.5 py-1 bg-blue-50 text-blue-700 rounded-lg font-black text-[11px]">
                        {rec.bedName || rec.bedId} {rec.roomName ? `• ${rec.roomName}` : ''}
                      </span>
                    </td>

                    <td className="py-4 px-6 text-slate-700 font-mono">
                      {rec.admissionDate} {rec.admissionTime ? `(${rec.admissionTime})` : ''}
                    </td>

                    <td className="py-4 px-6 text-slate-700 font-mono">
                      {rec.dischargeDate || '-'} {rec.dischargeTime ? `(${rec.dischargeTime})` : ''}
                    </td>

                    <td className="py-4 px-6 text-blue-600 font-bold">
                      {rec.duration || 'N/A'}
                    </td>

                    <td className="py-4 px-6 text-slate-600">
                      <span className="px-2 py-0.5 bg-slate-100 rounded text-slate-700 text-[11px]">
                        {rec.dischargeReason || 'Retour à domicile'}
                      </span>
                    </td>

                    <td className="py-4 px-6 text-right">
                      <button
                        onClick={() => setSelectedRecord(rec)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-slate-100 hover:bg-blue-600 hover:text-white text-slate-700 rounded-xl font-black text-xs uppercase tracking-wider transition-all cursor-pointer"
                      >
                        <Eye size={14} />
                        <span>Consulter</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal: View Stay Details */}
      {selectedRecord && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-3xl rounded-[32px] shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">
            
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-600 text-white rounded-xl flex items-center justify-center font-black">
                  {selectedRecord.patientName?.charAt(0) || 'P'}
                </div>
                <div>
                  <h3 className="font-black text-slate-900 text-lg">{selectedRecord.patientName}</h3>
                  <p className="text-xs text-slate-500 font-mono font-bold">
                    Dossier: {selectedRecord.patientDossier || selectedRecord.patientId} • Lit: {selectedRecord.bedName}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedRecord(null)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1 custom-scrollbar text-xs">
              
              {/* Summary details */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 bg-slate-50 rounded-2xl">
                <div>
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Admission</span>
                  <span className="font-bold text-slate-800">{selectedRecord.admissionDate}</span>
                </div>
                <div>
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Sortie</span>
                  <span className="font-bold text-slate-800">{selectedRecord.dischargeDate || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Durée</span>
                  <span className="font-bold text-blue-600">{selectedRecord.duration || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Médecin</span>
                  <span className="font-bold text-slate-800">{selectedRecord.doctorName || selectedRecord.admittedBy || 'N/A'}</span>
                </div>
              </div>

              {selectedRecord.reason && (
                <div className="p-3 bg-blue-50/50 border border-blue-100 rounded-xl">
                  <span className="text-[10px] font-black text-blue-600 uppercase tracking-wider block mb-0.5">Motif d'hospitalisation :</span>
                  <p className="font-medium text-slate-700">{selectedRecord.reason}</p>
                </div>
              )}

              {/* Vitals Summary */}
              <div className="space-y-2">
                <h4 className="font-black text-slate-900 text-xs uppercase tracking-wider flex items-center gap-1.5">
                  <Activity size={14} className="text-blue-600" />
                  <span>Constantes relevées ({selectedRecord.vitals?.length || 0})</span>
                </h4>
                {(!selectedRecord.vitals || selectedRecord.vitals.length === 0) ? (
                  <p className="text-slate-400 italic">Aucune constante archivée.</p>
                ) : (
                  <div className="space-y-1.5">
                    {selectedRecord.vitals.map(v => (
                      <div key={v.id} className="p-2.5 bg-slate-50 rounded-xl flex items-center justify-between font-bold">
                        <span className="font-mono text-slate-500">{v.date} {v.time}</span>
                        <span>TA: {v.bpSys}/{v.bpDia || 80}</span>
                        <span>Pouls: {v.pulse || v.heartRate || '-'} bpm</span>
                        <span>T°: {v.temp || '-'}°C</span>
                        <span className="text-slate-400 font-normal">Par {v.measuredBy}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Cares Summary */}
              <div className="space-y-2">
                <h4 className="font-black text-slate-900 text-xs uppercase tracking-wider flex items-center gap-1.5">
                  <Heart size={14} className="text-rose-600" />
                  <span>Soins administrés ({selectedRecord.cares?.length || 0})</span>
                </h4>
                {(!selectedRecord.cares || selectedRecord.cares.length === 0) ? (
                  <p className="text-slate-400 italic">Aucun soin consigné.</p>
                ) : (
                  <div className="space-y-1.5">
                    {selectedRecord.cares.map(c => (
                      <div key={c.id} className="p-2.5 bg-slate-50 rounded-xl flex items-center justify-between font-bold">
                        <div>
                          <span className="text-slate-400 mr-2">{c.date} {c.time}</span>
                          <span className="text-slate-800">{c.type} : {c.description}</span>
                        </div>
                        <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded text-[10px]">
                          {c.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Observations Summary */}
              <div className="space-y-2">
                <h4 className="font-black text-slate-900 text-xs uppercase tracking-wider flex items-center gap-1.5">
                  <FileText size={14} className="text-indigo-600" />
                  <span>Observations cliniques ({selectedRecord.observations?.length || 0})</span>
                </h4>
                {(!selectedRecord.observations || selectedRecord.observations.length === 0) ? (
                  <p className="text-slate-400 italic">Aucune observation consignée.</p>
                ) : (
                  <div className="space-y-2">
                    {selectedRecord.observations.map(o => (
                      <div key={o.id} className="p-3 bg-slate-50 rounded-xl space-y-1">
                        <div className="flex items-center justify-between font-black text-slate-700">
                          <span>{o.title} • {o.author}</span>
                          <span className="font-mono text-slate-400">{o.date} {o.time}</span>
                        </div>
                        <p className="text-slate-600 whitespace-pre-line">{o.content}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-100 flex items-center justify-between bg-slate-50/70">
              <button
                onClick={() => window.print()}
                className="flex items-center gap-1.5 px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs uppercase tracking-wider rounded-xl transition-colors cursor-pointer"
              >
                <Printer size={15} />
                <span>Imprimer la Fiche</span>
              </button>
              <button
                onClick={() => setSelectedRecord(null)}
                className="px-5 py-2 bg-slate-900 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-colors cursor-pointer"
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
