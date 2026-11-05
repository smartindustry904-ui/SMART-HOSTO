import React, { useState } from 'react';
import { 
  History, Search, Calendar, FileText, ArrowRight, X, Clock, 
  User, CheckCircle2, Bed, ExternalLink, Activity, Stethoscope, 
  Mic, Volume2, Printer
} from 'lucide-react';
import { EmergencyEncounter } from '../../types';

interface HistoriqueTabProps {
  encounters: EmergencyEncounter[];
  theme?: 'light' | 'dark';
}

export const HistoriqueTab: React.FC<HistoriqueTabProps> = ({
  encounters,
  theme = 'light'
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [orientationFilter, setOrientationFilter] = useState('ALL');
  const [selectedEncounter, setSelectedEncounter] = useState<EmergencyEncounter | null>(null);

  // Past / discharged encounters
  const historyList = encounters.filter(e => e.status === 'Sortie' || !!e.discharge);

  const filtered = historyList.filter(e => {
    const fullName = `${e.lastName || ''} ${e.firstName || ''}`.toLowerCase();
    const query = searchQuery.toLowerCase().trim();
    const matchesSearch = !query || 
      fullName.includes(query) || 
      (e.patientId || '').toLowerCase().includes(query) || 
      (e.patientDme || '').toLowerCase().includes(query) ||
      (e.arrivalMotif || '').toLowerCase().includes(query);

    const matchesOrientation = orientationFilter === 'ALL' || e.discharge?.orientation === orientationFilter;
    return matchesSearch && matchesOrientation;
  });

  return (
    <div className="space-y-6">
      {/* Search and Filters */}
      <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Rechercher dans l'historique par patient, dossier, motif..."
            className="w-full pl-11 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-medium outline-none focus:border-rose-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {['ALL', 'Retour à domicile', 'Hospitalisation', 'Consultation', 'Transfert'].map((ori) => {
            const isSelected = orientationFilter === ori;
            return (
              <button
                key={ori}
                onClick={() => setOrientationFilter(ori)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-rose-600 text-white shadow-xs'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                {ori === 'ALL' ? 'Toutes les sorties' : ori}
              </button>
            );
          })}
        </div>
      </div>

      {/* History Table */}
      {filtered.length === 0 ? (
        <div className="bg-white p-16 rounded-3xl border border-slate-200 text-center flex flex-col items-center justify-center">
          <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-400 mb-3">
            <History size={32} />
          </div>
          <h3 className="text-base font-black text-slate-800">Aucun passage archivé</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm">
            {searchQuery || orientationFilter !== 'ALL'
              ? 'Aucun résultat ne correspond à vos filtres.'
              : 'Les passages aux Urgences clôturés avec rapport de sortie apparaîtront dans cette liste.'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-black uppercase tracking-wider text-slate-400">
                  <th className="py-4 px-6">Patient</th>
                  <th className="py-4 px-4">Arrivée & Sortie</th>
                  <th className="py-4 px-6">Motif de Recours</th>
                  <th className="py-4 px-4">Orientation</th>
                  <th className="py-4 px-4">Praticien Sortie</th>
                  <th className="py-4 px-4 text-center">Bilan Soins</th>
                  <th className="py-4 px-6 text-right">Dossier</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filtered.map((e) => (
                  <tr
                    key={e.id}
                    onClick={() => setSelectedEncounter(e)}
                    className="hover:bg-slate-50/80 transition-colors group cursor-pointer"
                  >
                    <td className="py-4 px-6 font-black text-slate-900">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center font-black text-xs shrink-0 group-hover:bg-rose-50 group-hover:text-rose-600 transition-colors">
                          {e.lastName ? e.lastName.charAt(0) : 'P'}
                        </div>
                        <div>
                          <div className="font-extrabold text-slate-900 group-hover:text-blue-600 transition-colors">
                            {e.lastName} {e.firstName}
                          </div>
                          <div className="text-[10px] font-mono text-slate-400">
                            {e.patientDme || e.patientId}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="py-4 px-4 text-slate-600">
                      <div className="font-bold text-slate-800">
                        {e.arrivalDate} ({e.arrivalTime})
                      </div>
                      <div className="text-[11px] text-emerald-600 font-semibold">
                        Sortie : {e.discharge?.time || '--'} ({e.discharge?.date || '--'})
                      </div>
                    </td>

                    <td className="py-4 px-6 font-medium text-slate-800 max-w-xs truncate">
                      <span className="font-bold text-slate-900 block truncate">
                        {e.arrivalMotif}
                      </span>
                    </td>

                    <td className="py-4 px-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border ${
                        e.discharge?.orientation === 'Hospitalisation' 
                          ? 'bg-purple-50 text-purple-700 border-purple-200' :
                        e.discharge?.orientation === 'Consultation'
                          ? 'bg-blue-50 text-blue-700 border-blue-200' :
                        'bg-emerald-50 text-emerald-700 border-emerald-200'
                      }`}>
                        {e.discharge?.orientation || 'Sortie'}
                      </span>
                    </td>

                    <td className="py-4 px-4 text-slate-600 font-medium">
                      {e.discharge?.professional || 'Praticien Urgences'}
                    </td>

                    <td className="py-4 px-4 text-center">
                      <span className="font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md text-[11px]">
                        {e.cares?.length || 0} soin(s)
                      </span>
                    </td>

                    <td className="py-4 px-6 text-right">
                      <button
                        type="button"
                        onClick={(ev) => { ev.stopPropagation(); setSelectedEncounter(e); }}
                        className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ml-auto cursor-pointer"
                      >
                        <FileText size={13} />
                        <span>Rapport</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Selected Encounter Detail Modal */}
      {selectedEncounter && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-rose-50 text-rose-600 border border-rose-100 flex items-center justify-center font-black">
                  <FileText size={20} />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    Rapport de Passage aux Urgences
                  </h3>
                  <p className="text-xs text-slate-500">
                    Patient : <strong>{selectedEncounter.lastName} {selectedEncounter.firstName}</strong> • Dossier : {selectedEncounter.patientDme || selectedEncounter.patientId}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="p-2 bg-white hover:bg-slate-100 text-slate-600 rounded-xl border border-slate-200 transition-colors"
                  title="Imprimer le rapport"
                >
                  <Printer size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedEncounter(null)}
                  className="p-2 bg-white hover:bg-slate-100 text-slate-600 rounded-xl border border-slate-200 transition-colors cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6 text-xs">
              {/* Timing & Motifs */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Arrivée</span>
                  <p className="font-bold text-slate-800 mt-0.5">{selectedEncounter.arrivalDate} à {selectedEncounter.arrivalTime}</p>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Sortie</span>
                  <p className="font-bold text-slate-800 mt-0.5">{selectedEncounter.discharge?.date} à {selectedEncounter.discharge?.time}</p>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Orientation</span>
                  <p className="font-bold text-emerald-700 mt-0.5">{selectedEncounter.discharge?.orientation || 'Sortie'}</p>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Praticien Sortie</span>
                  <p className="font-bold text-slate-800 mt-0.5">{selectedEncounter.discharge?.professional || 'N/A'}</p>
                </div>
              </div>

              <div>
                <span className="text-[10px] font-black uppercase text-slate-400">Motif de Recours Initial :</span>
                <p className="font-bold text-slate-800 mt-0.5 text-xs bg-slate-50 p-3 rounded-xl border border-slate-100">
                  {selectedEncounter.arrivalMotif}
                </p>
              </div>

              {/* Vitals Summary */}
              {selectedEncounter.vitals && selectedEncounter.vitals.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-black uppercase text-slate-800 flex items-center gap-1.5">
                    <Activity size={14} className="text-rose-600" />
                    Paramètres & Constantes Mesurées ({selectedEncounter.vitals.length})
                  </h4>
                  <div className="overflow-x-auto border border-slate-200 rounded-xl">
                    <table className="w-full text-left text-[11px]">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-400 font-bold uppercase text-[9px]">
                        <tr>
                          <th className="py-2 px-3">Heure</th>
                          <th className="py-2 px-2">TA</th>
                          <th className="py-2 px-2">Pouls</th>
                          <th className="py-2 px-2">Temp</th>
                          <th className="py-2 px-2">SpO₂</th>
                          <th className="py-2 px-3">Mesuré par</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {selectedEncounter.vitals.map(v => (
                          <tr key={v.id}>
                            <td className="py-2 px-3 font-bold">{v.time}</td>
                            <td className="py-2 px-2 font-mono">{v.bpSys ? `${v.bpSys}/${v.bpDia}` : '--'}</td>
                            <td className="py-2 px-2 font-mono">{v.heartRate || '--'}</td>
                            <td className="py-2 px-2 font-mono">{v.temp ? `${v.temp}°C` : '--'}</td>
                            <td className="py-2 px-2 font-mono">{v.spo2 ? `${v.spo2}%` : '--'}</td>
                            <td className="py-2 px-3 text-slate-600">{v.measuredBy}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Cares performed */}
              {selectedEncounter.cares && selectedEncounter.cares.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-black uppercase text-slate-800 flex items-center gap-1.5">
                    <Stethoscope size={14} className="text-blue-600" />
                    Soins Réalisés ({selectedEncounter.cares.length})
                  </h4>
                  <div className="space-y-1.5">
                    {selectedEncounter.cares.map(c => (
                      <div key={c.id} className="p-2.5 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between text-[11px]">
                        <div>
                          <span className="font-bold text-slate-800">{c.type}</span> : {c.description}
                          {c.product && <span className="text-slate-500"> ({c.product})</span>}
                        </div>
                        <span className="text-slate-400 font-mono text-[10px]">{c.time}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Medical notes & follow-ups */}
              {selectedEncounter.followUps && selectedEncounter.followUps.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-black uppercase text-slate-800 flex items-center gap-1.5">
                    <FileText size={14} className="text-indigo-600" />
                    Suivis Médicaux ({selectedEncounter.followUps.length})
                  </h4>
                  <div className="space-y-2">
                    {selectedEncounter.followUps.map(fu => (
                      <div key={fu.id} className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-1.5">
                        <div className="flex items-center justify-between text-[10px] text-slate-500 font-bold">
                          <span>{fu.author} ({fu.authorRole || 'Médecin'})</span>
                          <span>{fu.date} à {fu.time}</span>
                        </div>
                        {fu.clinicalExam && <p className="text-slate-800">{fu.clinicalExam}</p>}
                        {fu.conclusion && <p className="font-bold text-indigo-900">Conclusion : {fu.conclusion}</p>}
                        {fu.voiceNoteAudioUrl && (
                          <div className="pt-1">
                            <audio src={fu.voiceNoteAudioUrl} controls className="w-full h-8 rounded-lg" />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Discharge conclusions */}
              {selectedEncounter.discharge && (
                <div className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-2xl space-y-2">
                  <h4 className="text-xs font-black uppercase text-emerald-900">
                    Conclusion Médicale de Fin de Prise en Charge
                  </h4>
                  <p className="text-slate-800 font-medium">{selectedEncounter.discharge.conclusion}</p>
                  {selectedEncounter.discharge.instructions && (
                    <div className="pt-1">
                      <span className="text-[10px] font-black uppercase text-emerald-800">Consignes :</span>
                      <p className="text-slate-700">{selectedEncounter.discharge.instructions}</p>
                    </div>
                  )}
                  {selectedEncounter.discharge.treatment && (
                    <div className="pt-1">
                      <span className="text-[10px] font-black uppercase text-emerald-800">Traitement de sortie :</span>
                      <p className="text-slate-700">{selectedEncounter.discharge.treatment}</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-200 flex justify-end bg-slate-50">
              <button
                type="button"
                onClick={() => setSelectedEncounter(null)}
                className="px-5 py-2 bg-slate-900 hover:bg-black text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
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
