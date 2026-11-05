import React, { useState } from 'react';
import { Search, ShieldCheck, CheckCircle, XCircle, Loader2, FileText, AlertTriangle, User, Zap, Sparkles, ChevronDown, ChevronUp, Info } from 'lucide-react';
import { LabExamRequest, ResultatLaboratoire } from '../../types';
import { useSettings } from '../../hooks/useSettings';

interface ValidationsTabProps {
  requests: LabExamRequest[];
  updateRequests: (requests: LabExamRequest[]) => void;
  resultats: ResultatLaboratoire[];
  updateResultats: (resultats: ResultatLaboratoire[]) => void;
  user?: any;
}

const ValidationsTab: React.FC<ValidationsTabProps> = ({ requests, updateRequests, resultats, updateResultats, user }) => {
  const { establishment } = useSettings();
  const isBiologistValidationRequired = establishment?.requireBiologistValidation !== false && establishment?.require_biologist_validation !== false;

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedResult, setSelectedResult] = useState<ResultatLaboratoire | null>(null);
  const [remarques, setRemarques] = useState('');
  const [showDetails, setShowDetails] = useState(false);

  const pendingValidations = resultats.filter(r => r.statut === 'prêt pour validation');
  
  const filteredValidations = pendingValidations.filter(r => {
    const q = (searchTerm || '').toLowerCase().trim();
    if (!q) return true;
    const req = requests.find(req => req.id === r.demandeId);
    return (
      (req?.patientName || '').toLowerCase().includes(q) || 
      (r.demandeId || '').toLowerCase().includes(q) ||
      (r.patientId || '').toLowerCase().includes(q) ||
      (req?.patientId || '').toLowerCase().includes(q)
    );
  });

  const [isSaving, setIsSaving] = useState(false);

  const [showRejectionModal, setShowRejectionModal] = useState(false);
  const [rejectionType, setRejectionType] = useState<'TYPO' | 'SAMPLE_REJECTION'>('TYPO');

  const handleValidate = async (status: 'validé' | 'rejeté', explicitType?: 'TYPO' | 'SAMPLE_REJECTION') => {
    if (!selectedResult || isSaving) return;
    setIsSaving(true);

    try {
      if (status === 'validé') {
        const updatedResult = {
          ...selectedResult,
          statut: 'validé' as const,
          validePar: user?.name || 'Biologiste',
          dateValidation: new Date().toISOString(),
          remarquesValidation: remarques
        };

        const updatedResultats = resultats.map(r => r.id === selectedResult.id ? updatedResult : r);
        await updateResultats(updatedResultats);

        const updatedRequests = requests.map(r => r.id === selectedResult.demandeId ? { ...r, status: 'validé' as const } : r);
        await updateRequests(updatedRequests);
        
        const req = getRequest(selectedResult.demandeId);
        if (req) {
          window.dispatchEvent(new CustomEvent('app-notification', { 
            detail: { message: `Résultat de laboratoire validé pour ${req.patientName}`, type: 'success' }
          }));
        }
        window.dispatchEvent(new CustomEvent('change-lab-tab', { detail: 'rapports' }));
      } else {
        const choice = explicitType || rejectionType;
        if (choice === 'TYPO') {
          // Erreur de saisie : simple renvoi pour correction (pas d'impact sur le stock)
          const rejectedResult = { 
            ...selectedResult, 
            statut: 'brouillon' as const,
            validePar: user?.name || 'Biologiste',
            dateValidation: new Date().toISOString(),
            remarquesValidation: remarques,
            rejectionType: 'TYPO' as const
          };
          const finalResultats = resultats.map(r => r.id === selectedResult.id ? rejectedResult : r);
          await updateResultats(finalResultats);

          const updatedRequests = requests.map(r => r.id === selectedResult.demandeId ? { ...r, status: 'en cours' as const } : r);
          await updateRequests(updatedRequests);

          window.dispatchEvent(new CustomEvent('app-notification', { 
            detail: { message: `Rejet pour erreur de saisie : Renvoyé au technicien pour correction. Aucun stock déduit.`, type: 'info' }
          }));
          window.dispatchEvent(new CustomEvent('change-lab-tab', { detail: 'resultats' }));
        } else {
          // Non-conformité échantillon : renvoi au prélèvement (un nouveau prélèvement déduira de nouveaux consommables)
          const rejectedResult = { 
            ...selectedResult, 
            statut: 'rejeté' as const,
            validePar: user?.name || 'Biologiste',
            dateValidation: new Date().toISOString(),
            remarquesValidation: remarques,
            rejectionType: 'SAMPLE_REJECTION' as const
          };
          const finalResultats = resultats.map(r => r.id === selectedResult.id ? rejectedResult : r);
          await updateResultats(finalResultats);

          const updatedRequests = requests.map(r => r.id === selectedResult.demandeId ? { 
            ...r, 
            status: 'en attente' as const,
            sampleRemarks: remarques || 'Échantillon non conforme',
            sampleStatus: 'à refaire' as const
          } : r);
          await updateRequests(updatedRequests);

          window.dispatchEvent(new CustomEvent('app-notification', { 
            detail: { message: `Échantillon rejeté pour non-conformité. Patient renvoyé en attente d'un nouveau prélèvement.`, type: 'warning' }
          }));
          window.dispatchEvent(new CustomEvent('change-lab-tab', { detail: 'demandes' }));
        }
      }

      setSelectedResult(null);
      setRemarques('');
      setShowRejectionModal(false);
    } catch (e) {
      console.error("Validation error:", e);
      window.dispatchEvent(new CustomEvent('app-notification', { 
        detail: { message: `Erreur lors de la validation`, type: 'error' }
      }));
    } finally {
      setIsSaving(false);
    }
  };

  const getRequest = (demandeId: string) => requests.find(r => r.id === demandeId);

  return (
    <div className="flex flex-col h-full space-y-4">
      {!isBiologistValidationRequired && (
        <div className="bg-amber-50 border border-amber-200 p-3.5 rounded-2xl flex items-center justify-between gap-4 text-xs shrink-0 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="p-1.5 bg-amber-500 text-white rounded-lg shadow-sm">
              <Zap size={16} />
            </span>
            <div>
              <span className="font-black text-amber-900 uppercase tracking-wide">Validation Biologiste Non Obligatoire (Mode Accéléré) :</span>
              <span className="text-amber-800 font-medium ml-1.5">
                Le paramètre global autorise les techniciens à valider et publier directement les analyses depuis l'onglet Saisie des Résultats.
              </span>
            </div>
          </div>
          <span className="hidden md:inline-flex items-center gap-1 px-2.5 py-1 bg-white font-black text-[10px] text-amber-700 uppercase tracking-wider rounded-lg border border-amber-200 shrink-0">
            <Sparkles size={12} className="text-amber-500" /> Mode Accéléré
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-0">
        {/* Liste des validations en attente */}
        <div className="lg:col-span-1 bg-white rounded-3xl border border-slate-200 shadow-sm flex flex-col h-full overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50 shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input 
              type="text" 
              placeholder="Rechercher un patient..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 outline-none"
            />
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-2 space-y-2 custom-scrollbar">
          {filteredValidations.length > 0 ? filteredValidations.map((res, idx) => {
            const req = getRequest(res.demandeId);
            if (!req) return null;
            
            return (
              <div 
                key={`${res.id || 'val'}-${idx}`} 
                onClick={() => setSelectedResult(res)}
                className={`p-4 rounded-2xl cursor-pointer transition-all border ${selectedResult?.id === res.id ? 'bg-emerald-50 border-emerald-200 shadow-sm' : 'bg-white border-slate-100 hover:border-emerald-100 hover:bg-slate-50'}`}
              >
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm">{req.patientName}</h3>
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider">{req.id}</p>
                  </div>
                  <span className="bg-emerald-100 text-emerald-700 text-[10px] font-bold px-2 py-1 rounded-lg">
                    À VALIDER
                  </span>
                </div>
                
                <div className="flex items-center gap-2 mt-3 text-xs">
                  <span className="text-slate-500 font-medium bg-slate-100 px-2 py-0.5 rounded-md">
                    Saisi par: {res.saisiPar}
                  </span>
                </div>
              </div>
            );
          }) : (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 p-6 text-center">
              <ShieldCheck size={48} className="mb-4 opacity-20" />
              <p className="font-bold">Aucune validation en attente</p>
            </div>
          )}
        </div>
      </div>

      {/* Détails de la validation */}
      <div className="lg:col-span-2 bg-white rounded-3xl border border-slate-200 shadow-sm flex flex-col h-full overflow-hidden">
        {selectedResult ? (
          <>
            {/* Ultra-compact single-line flexbox Mini-Header */}
            {(() => {
              const req = getRequest(selectedResult.demandeId);
              return (
                <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/70 shrink-0">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    {/* Left: Primary Patient info in one line */}
                    <div className="flex items-center gap-2.5 flex-wrap min-w-0">
                      <h2 className="text-base font-black text-slate-900 truncate">
                        {req?.patientName || 'Patient Inconnu'}
                      </h2>
                      <span className="px-2 py-0.5 bg-white border border-slate-200 text-slate-600 rounded-md font-mono text-[11px] font-bold">
                        {req?.patientId || selectedResult.demandeId}
                      </span>
                      {(req?.patientAge || (req as any)?.age) && (
                        <span className="text-xs font-semibold text-slate-500">
                          • {req?.patientAge || (req as any)?.age} ans
                        </span>
                      )}
                      <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${
                        req?.priority === 'Critique' || (req as any)?.priorite === 'Critique'
                          ? 'bg-rose-100 text-rose-700 border border-rose-200'
                          : req?.priority === 'Urgent' || (req as any)?.priorite === 'Urgent'
                          ? 'bg-amber-100 text-amber-800 border border-amber-200'
                          : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                      }`}>
                        {req?.priority || (req as any)?.priorite || 'Normal'}
                      </span>
                      <span className="bg-purple-100 text-purple-700 text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider">
                        À VALIDER
                      </span>
                    </div>

                    {/* Right: Toggle details */}
                    <button 
                      type="button"
                      onClick={() => setShowDetails(!showDetails)}
                      className="flex items-center gap-1 text-xs font-bold text-slate-600 hover:text-blue-600 px-2.5 py-1 rounded-lg bg-white border border-slate-200 hover:border-blue-300 transition-colors shadow-2xs shrink-0 cursor-pointer"
                    >
                      <Info size={13} className="text-slate-400" />
                      <span>{showDetails ? 'Masquer détails' : 'Afficher détails'}</span>
                      {showDetails ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                  </div>

                  {/* Collapsible Secondary Details Drawer */}
                  {showDetails && (
                    <div className="mt-3 pt-3 border-t border-slate-200/80 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs animate-in fade-in slide-in-from-top-1 duration-200">
                      <div className="bg-white p-2.5 rounded-xl border border-slate-100">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Demande N°</p>
                        <p className="font-mono font-bold text-slate-800 mt-0.5">{selectedResult.demandeId}</p>
                      </div>
                      <div className="bg-white p-2.5 rounded-xl border border-slate-100">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Saisi par</p>
                        <p className="font-bold text-slate-800 mt-0.5 truncate">{selectedResult.saisiPar}</p>
                      </div>
                      <div className="bg-white p-2.5 rounded-xl border border-slate-100">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Prescripteur</p>
                        <p className="font-bold text-slate-800 mt-0.5 truncate">{req?.prescripteur || req?.doctorName || 'Médecin'}</p>
                      </div>
                      <div className="bg-white p-2.5 rounded-xl border border-slate-100">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Échantillon</p>
                        <p className="font-semibold text-purple-700 mt-0.5 truncate">{req?.sampleType || 'Standard'}</p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            <div className="flex-1 overflow-y-auto p-4 sm:p-5 custom-scrollbar space-y-5">
              {selectedResult.lignes.map((ligne, idx) => (
                <div key={idx} className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                  <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                    <h3 className="font-bold text-slate-900">{ligne.examName}</h3>
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
                            <tr key={pIdx} className="border-b border-slate-100 last:border-0">
                              <td className="py-3 text-sm font-medium text-slate-700">{param.nom}</td>
                              <td className="py-3 pr-4">
                                <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-lg text-sm font-bold ${
                                  param.isAnormal ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-700'
                                }`}>
                                  {param.valeur || '-'}
                                  {param.isAnormal && <AlertTriangle size={14} />}
                                </span>
                              </td>
                              <td className="py-3 text-sm text-slate-500">{param.unite}</td>
                              <td className="py-3 text-xs text-slate-400">{param.valeurReference}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {ligne.conclusion && (
                      <div className="mt-4 p-4 bg-slate-50 rounded-xl border border-slate-100">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Conclusion</p>
                        <p className="text-sm text-slate-700 font-medium">{ligne.conclusion}</p>
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {selectedResult.commentaireGlobal && (
                <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100">
                  <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-1">Commentaire Global</p>
                  <p className="text-sm text-blue-900 font-medium">{selectedResult.commentaireGlobal}</p>
                </div>
              )}

              <div className="pt-4 border-t border-slate-200">
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Remarques de validation (Optionnel)</label>
                <textarea 
                  value={remarques}
                  onChange={(e) => setRemarques(e.target.value)}
                  className="w-full p-3 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500/20 outline-none min-h-[80px]"
                  placeholder="Ajouter une remarque en cas de rejet ou de validation sous condition..."
                />
              </div>
            </div>

            <div className="p-6 border-t border-slate-100 bg-slate-50 shrink-0 flex justify-between items-center">
              <div className="flex items-center gap-2 text-sm text-slate-500 font-medium">
                <User size={16} /> Validateur: <span className="text-slate-900 font-bold">{user?.name || 'Biologiste'}</span>
              </div>
              <div className="flex gap-3">
                <button 
                  onClick={() => setShowRejectionModal(true)}
                  disabled={isSaving}
                  className="px-6 py-3 bg-white border border-rose-200 text-rose-700 font-bold rounded-xl hover:bg-rose-50 transition-colors flex items-center gap-2 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSaving ? <Loader2 size={18} className="animate-spin" /> : <XCircle size={18} />}
                  Rejeter
                </button>
                <button 
                  onClick={() => handleValidate('validé')}
                  disabled={isSaving}
                  className="px-6 py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-500 transition-colors flex items-center gap-2 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSaving ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle size={18} />}
                  Valider les résultats
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-slate-400 p-8 text-center">
            <ShieldCheck size={64} className="mb-6 opacity-20" />
            <h2 className="text-xl font-bold text-slate-600 mb-2">Sélectionnez un résultat</h2>
            <p className="text-sm max-w-md">Choisissez un résultat en attente pour le vérifier et le valider.</p>
          </div>
        )}
      </div>
    </div>

      {/* Modal de motif de rejet */}
      {showRejectionModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full p-6 space-y-6 border border-slate-100 animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-rose-100 text-rose-600 rounded-xl flex items-center justify-center font-bold">
                  <XCircle size={22} />
                </div>
                <div>
                  <h3 className="font-black text-slate-900 text-lg">Motif du Rejet</h3>
                  <p className="text-xs text-slate-500">Veuillez préciser la nature de l'anomalie</p>
                </div>
              </div>
              <button onClick={() => setShowRejectionModal(false)} className="text-slate-400 hover:text-slate-600">
                <XCircle size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div 
                onClick={() => setRejectionType('TYPO')}
                className={`p-4 rounded-2xl border-2 cursor-pointer transition-all flex items-start gap-3 ${
                  rejectionType === 'TYPO' ? 'border-amber-500 bg-amber-50/50' : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <input 
                  type="radio" 
                  name="rejectionType" 
                  checked={rejectionType === 'TYPO'}
                  onChange={() => setRejectionType('TYPO')}
                  className="mt-1 text-amber-600 focus:ring-amber-500" 
                />
                <div>
                  <h4 className="font-extrabold text-slate-900 text-sm">1. Erreur de Saisie / Typo (Correction technique)</h4>
                  <p className="text-xs text-slate-500 mt-1">Coquille, erreur de valeur ou omission. Le résultat est renvoyé en saisie. <strong className="text-amber-700">Aucun nouveau stock de consommables n'est déduit.</strong></p>
                </div>
              </div>

              <div 
                onClick={() => setRejectionType('SAMPLE_REJECTION')}
                className={`p-4 rounded-2xl border-2 cursor-pointer transition-all flex items-start gap-3 ${
                  rejectionType === 'SAMPLE_REJECTION' ? 'border-rose-500 bg-rose-50/50' : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <input 
                  type="radio" 
                  name="rejectionType" 
                  checked={rejectionType === 'SAMPLE_REJECTION'}
                  onChange={() => setRejectionType('SAMPLE_REJECTION')}
                  className="mt-1 text-rose-600 focus:ring-rose-500" 
                />
                <div>
                  <h4 className="font-extrabold text-slate-900 text-sm">2. Échantillon Non Conforme (Problème physique)</h4>
                  <p className="text-xs text-slate-500 mt-1">Sang hémolysé, tube cassé, volume insuffisant. Le patient est renvoyé en attente de prélèvement. <strong className="text-rose-700">Un nouveau prélèvement déduira de nouveaux consommables.</strong></p>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Commentaires / Remarques de rejet</label>
                <textarea 
                  value={remarques}
                  onChange={(e) => setRemarques(e.target.value)}
                  placeholder="Détaillez la raison du rejet..."
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-rose-500/20 outline-none min-h-[80px]"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
              <button 
                onClick={() => setShowRejectionModal(false)}
                className="px-5 py-2.5 text-slate-600 font-bold hover:bg-slate-100 rounded-xl transition-colors text-sm"
              >
                Annuler
              </button>
              <button 
                onClick={() => handleValidate('rejeté', rejectionType)}
                disabled={isSaving}
                className="px-6 py-2.5 bg-rose-600 text-white font-bold hover:bg-rose-500 rounded-xl transition-colors text-sm flex items-center gap-2 shadow-sm"
              >
                {isSaving ? <Loader2 size={16} className="animate-spin" /> : <XCircle size={16} />}
                Confirmer le Rejet
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ValidationsTab;
