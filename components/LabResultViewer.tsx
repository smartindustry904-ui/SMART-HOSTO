import React from 'react';
import { FileText, AlertTriangle, User, Clock, CheckCircle, XCircle, Printer } from 'lucide-react';
import { ResultatLaboratoire } from '../types';
import { useSettings } from '../hooks/useSettings';

interface LabResultViewerProps {
  result: ResultatLaboratoire;
  onClose: () => void;
  patientName?: string;
}

const LabResultViewer: React.FC<LabResultViewerProps> = ({ result, onClose, patientName }) => {
  const { establishment } = useSettings();

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Official Printable Header */}
      <div className="p-6 border-b border-slate-200 bg-white">
        <div className="flex justify-between items-start pb-4 border-b border-slate-100">
          <div>
            <h1 className="text-xl font-black text-slate-900 uppercase tracking-tight">{establishment?.name || 'SmartHosto SIH'}</h1>
            <p className="text-xs text-slate-500 font-medium">{establishment?.address || ''}</p>
            <p className="text-xs text-slate-500">Tél: {establishment?.phone || ''} {establishment?.email ? `• ${establishment.email}` : ''}</p>
          </div>
          <div className="flex gap-2 print:hidden">
            <button 
              onClick={() => window.print()} 
              className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all flex items-center gap-2 text-xs font-bold"
              title="Imprimer"
            >
              <Printer size={18} /> Imprimer
            </button>
            <button 
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
            >
              <XCircle size={22} />
            </button>
          </div>
        </div>

        <div className="mt-4 flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-black text-slate-900">Rapport de Laboratoire</h2>
            <div className="flex items-center gap-3 mt-1 text-sm text-slate-500 font-medium">
              {patientName && <span className="flex items-center gap-1 font-bold text-slate-700">{patientName}</span>}
              <span className="text-slate-300">|</span>
              <span className="flex items-center gap-1"><FileText size={14} /> ID: {result.id}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
        {/* Infos de validation */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1">
              <Clock size={10} /> Date & Heure
            </p>
            <p className="text-sm font-bold text-slate-700">
              {(result.dateValidation || result.dateSaisie) ? new Date(result.dateValidation || result.dateSaisie).toLocaleString() : 'N/A'}
            </p>
          </div>
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1">
              <User size={10} /> Validé par
            </p>
            <p className="text-sm font-bold text-slate-700">
              {result.validePar || result.saisiPar}
            </p>
          </div>
        </div>

        {/* Lignes de résultats */}
        {result.lignes.map((ligne, idx) => (
          <div key={idx} className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
              <h3 className="font-bold text-slate-900">{ligne.examName}</h3>
              {ligne.conclusion && (
                <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md uppercase">
                  Interprété
                </span>
              )}
            </div>
            
            <div className="p-4">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs text-slate-500 uppercase tracking-wider">
                      <th className="pb-2 font-bold">Paramètre</th>
                      <th className="pb-2 font-bold">Résultat</th>
                      <th className="pb-2 font-bold">Unité</th>
                      <th className="pb-2 font-bold">Valeurs de réf.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ligne.parametres.map((param, pIdx) => (
                      <tr key={pIdx} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50 transition-colors">
                        <td className="py-3 text-sm font-medium text-slate-700">{param.nom}</td>
                        <td className="py-3 pr-4">
                          <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-lg text-sm font-bold ${
                            param.isAnormal ? 'bg-rose-100 text-rose-700 border border-rose-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                          }`}>
                            {param.valeur || '-'}
                            {param.isAnormal && <AlertTriangle size={14} className="shrink-0" />}
                          </span>
                        </td>
                        <td className="py-3 text-sm text-slate-500">{param.unite}</td>
                        <td className="py-3 text-xs text-slate-400 font-mono italic">{param.valeurReference}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {ligne.conclusion && (
                <div className="mt-4 p-4 bg-blue-50 rounded-xl border border-blue-100/50">
                  <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-1">Conclusion de l'examen</p>
                  <p className="text-sm text-blue-900 font-medium leading-relaxed">{ligne.conclusion}</p>
                </div>
              )}
            </div>
          </div>
        ))}

        {result.commentaireGlobal && (
          <div className="p-6 bg-amber-50 rounded-2xl border border-amber-100">
            <p className="text-[10px] font-black text-amber-500 uppercase tracking-widest mb-2">Commentaire Global du Biologiste</p>
            <p className="text-sm text-amber-900 font-medium leading-relaxed italic">"{result.commentaireGlobal}"</p>
          </div>
        )}

        {result.remarquesValidation && (
          <div className="p-6 bg-slate-50 rounded-2xl border border-slate-200 border-dashed">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Remarques de validation</p>
            <p className="text-sm text-slate-600">{result.remarquesValidation}</p>
          </div>
        )}
      </div>

      <div className="p-6 border-t border-slate-100 shrink-0 bg-slate-50 flex justify-end">
        <button 
          onClick={onClose}
          className="px-8 py-3 bg-slate-900 text-white font-bold rounded-2xl hover:bg-slate-800 transition-colors shadow-lg shadow-slate-900/10"
        >
          Fermer le rapport
        </button>
      </div>
    </div>
  );
};

export default LabResultViewer;
