import React, { useState } from 'react';
import { Search, FlaskConical, AlertTriangle, CheckCircle, Clock, User, FileText, Activity, ChevronDown, ChevronUp, Info } from 'lucide-react';
import { LabExamRequest } from '../../types';

interface EnCoursTabProps {
  requests: LabExamRequest[];
  updateRequests: (requests: LabExamRequest[]) => void;
  user?: any;
}

const EnCoursTab: React.FC<EnCoursTabProps> = ({ requests, updateRequests, user }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRequest, setSelectedRequest] = useState<LabExamRequest | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  const inProgressRequests = requests.filter(r => 
    r.status === 'patient appelé' || 
    r.status === 'prélèvement fait' || 
    r.status === 'en cours'
  );
  
  const filteredRequests = inProgressRequests.filter(r => {
    const q = (searchTerm || '').toLowerCase().trim();
    if (!q) return true;
    return (
      (r.patientName || '').toLowerCase().includes(q) || 
      (r.id || '').toLowerCase().includes(q) ||
      (r.patientId || '').toLowerCase().includes(q) ||
      (r.prescriberName || '').toLowerCase().includes(q)
    );
  });

  const [isSaving, setIsSaving] = useState(false);

  const handleUpdateStatus = async (id: string, newStatus: LabExamRequest['status']) => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      const updated = requests.map(r => r.id === id ? { ...r, status: newStatus } : r);
      await updateRequests(updated);
      if (selectedRequest?.id === id) {
        setSelectedRequest({ ...selectedRequest, status: newStatus });
      }
      window.dispatchEvent(new CustomEvent('app-notification', { 
        detail: `Statut mis à jour : ${newStatus}` 
      }));

      if (newStatus === 'terminé') {
        window.dispatchEvent(new CustomEvent('change-lab-tab', { detail: 'resultats' }));
      }
    } catch(e) {
      console.error(e);
      window.dispatchEvent(new CustomEvent('app-notification', { 
        detail: `Erreur lors de la mise à jour` 
      }));
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateSampleInfo = (id: string, field: string, value: string) => {
    const updated = requests.map(r => r.id === id ? { ...r, [field]: value } : r);
    updateRequests(updated);
    if (selectedRequest?.id === id) {
      setSelectedRequest({ ...selectedRequest, [field]: value });
    }
  };

  const handleUpdateExamSampleInfo = (examId: string, field: string, value: string) => {
    if (!selectedRequest) return;
    const updatedExams = selectedRequest.exams.map(exam => {
      if (exam.actId === examId) {
        return { ...exam, [field]: value };
      }
      return exam;
    });
    const updatedRequest = { ...selectedRequest, exams: updatedExams };
    const updatedAllRequests = requests.map(r => r.id === selectedRequest.id ? updatedRequest : r);
    updateRequests(updatedAllRequests);
    setSelectedRequest(updatedRequest);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full">
      {/* Liste des prélèvements en cours */}
      <div className="lg:col-span-1 bg-white rounded-3xl border border-slate-200 shadow-sm flex flex-col h-full overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50 shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input 
              type="text" 
              placeholder="Rechercher un échantillon..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 outline-none"
            />
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-2 space-y-2 custom-scrollbar">
          {filteredRequests.length > 0 ? filteredRequests.map((req, idx) => (
            <div 
              key={`${req.id || 'encours'}-${idx}`} 
              onClick={() => setSelectedRequest(req)}
              className={`p-4 rounded-2xl cursor-pointer transition-all border ${selectedRequest?.id === req.id ? 'bg-amber-50 border-amber-200 shadow-sm' : 'bg-white border-slate-100 hover:border-amber-100 hover:bg-slate-50'}`}
            >
              <div className="flex justify-between items-start mb-2">
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">{req.patientName}</h3>
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider">{req.id}</p>
                </div>
                <span className={`text-[10px] font-bold px-2 py-1 rounded-lg ${
                  req.status === 'patient appelé' ? 'bg-blue-100 text-blue-700' :
                  req.status === 'prélèvement fait' ? 'bg-purple-100 text-purple-700' :
                  'bg-amber-100 text-amber-700'
                }`}>
                  {req.status.toUpperCase()}
                </span>
              </div>
              
              <div className="flex items-center gap-2 mt-3 text-xs">
                <span className="text-slate-400 flex items-center gap-1">
                  <Clock size={12} /> {new Date(req.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                </span>
                {req.exams.length === 1 && req.sampleType && (
                  <span className="text-slate-500 font-medium bg-slate-100 px-2 py-0.5 rounded-md">
                    {req.sampleType}
                  </span>
                )}
                {req.exams.length > 1 && (
                  <span className="text-purple-700 font-bold bg-purple-50 px-2 py-0.5 rounded-md text-[10px]">
                    Multi-prélèvements
                  </span>
                )}
              </div>
            </div>
          )) : (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 p-6 text-center">
              <FlaskConical size={48} className="mb-4 opacity-20" />
              <p className="font-bold">Aucun échantillon en cours</p>
            </div>
          )}
        </div>
      </div>

      {/* Détails et actions sur l'échantillon */}
      <div className="lg:col-span-2 bg-white rounded-3xl border border-slate-200 shadow-sm flex flex-col h-full overflow-hidden">
        {selectedRequest ? (
          <>
            {/* Ultra-compact single-line flexbox Mini-Header */}
            <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/70 shrink-0">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                {/* Left: Primary Patient info in one line */}
                <div className="flex items-center gap-2.5 flex-wrap min-w-0">
                  <h2 className="text-base font-black text-slate-900 truncate">
                    {selectedRequest.patientName}
                  </h2>
                  <span className="px-2 py-0.5 bg-white border border-slate-200 text-slate-600 rounded-md font-mono text-[11px] font-bold">
                    {selectedRequest.patientId || selectedRequest.id}
                  </span>
                  {(selectedRequest.patientAge || (selectedRequest as any).age) && (
                    <span className="text-xs font-semibold text-slate-500">
                      • {selectedRequest.patientAge || (selectedRequest as any).age} ans
                    </span>
                  )}
                  <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${
                    selectedRequest.priority === 'Critique' || (selectedRequest as any).priorite === 'Critique'
                      ? 'bg-rose-100 text-rose-700 border border-rose-200'
                      : selectedRequest.priority === 'Urgent' || (selectedRequest as any).priorite === 'Urgent'
                      ? 'bg-amber-100 text-amber-800 border border-amber-200'
                      : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                  }`}>
                    {selectedRequest.priority || (selectedRequest as any).priorite || 'Normal'}
                  </span>
                  <span className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider ${
                    selectedRequest.status === 'patient appelé' ? 'bg-blue-100 text-blue-700' :
                    selectedRequest.status === 'prélèvement fait' ? 'bg-purple-100 text-purple-700' :
                    'bg-amber-100 text-amber-700'
                  }`}>
                    {selectedRequest.status}
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
                    <p className="font-mono font-bold text-slate-800 mt-0.5">{selectedRequest.id}</p>
                  </div>
                  <div className="bg-white p-2.5 rounded-xl border border-slate-100">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Prescripteur</p>
                    <p className="font-bold text-slate-800 mt-0.5 truncate">{selectedRequest.prescripteur || selectedRequest.doctorName || 'Médecin'}</p>
                  </div>
                  <div className="bg-white p-2.5 rounded-xl border border-slate-100">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Date Demande</p>
                    <p className="font-medium text-slate-700 mt-0.5">{selectedRequest.date ? new Date(selectedRequest.date).toLocaleString('fr-FR') : '-'}</p>
                  </div>
                  <div className="bg-white p-2.5 rounded-xl border border-slate-100">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Échantillon</p>
                    <p className="font-semibold text-purple-700 mt-0.5 truncate">{selectedRequest.sampleType || 'Prélèvement standard'}</p>
                  </div>
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-4 sm:p-5 custom-scrollbar space-y-5">
              {/* Informations de prélèvement */}
              {selectedRequest.exams.length <= 1 && (
                <div>
                  <h3 className="font-black text-slate-900 uppercase tracking-tight mb-4 flex items-center gap-2">
                    <FlaskConical size={18} className="text-purple-500" /> Informations de Prélèvement
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Type d'échantillon</label>
                      <select 
                        value={selectedRequest.sampleType || ''}
                        onChange={(e) => handleUpdateSampleInfo(selectedRequest.id, 'sampleType', e.target.value)}
                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-purple-500/20 outline-none font-medium text-slate-700"
                      >
                        <option value="">Sélectionner...</option>
                        <option value="Sang total (EDTA)">Sang total (EDTA)</option>
                        <option value="Sérum (Tube sec)">Sérum (Tube sec)</option>
                        <option value="Plasma (Citrate)">Plasma (Citrate)</option>
                        <option value="Urine">Urine</option>
                        <option value="Selles">Selles</option>
                        <option value="LCR">LCR</option>
                        <option value="Ecouvillon">Ecouvillon</option>
                        <option value="Autre">Autre</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Heure de prélèvement</label>
                      <input 
                        type="time" 
                        value={selectedRequest.sampleTime || ''}
                        onChange={(e) => handleUpdateSampleInfo(selectedRequest.id, 'sampleTime', e.target.value)}
                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-purple-500/20 outline-none font-medium text-slate-700"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Remarques sur l'échantillon</label>
                      <select 
                        value={selectedRequest.sampleRemarks || ''}
                        onChange={(e) => handleUpdateSampleInfo(selectedRequest.id, 'sampleRemarks', e.target.value)}
                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-purple-500/20 outline-none font-medium text-slate-700"
                      >
                        <option value="">Aucune remarque (Conforme)</option>
                        <option value="échantillon insuffisant">Échantillon insuffisant</option>
                        <option value="hémolysé">Hémolysé</option>
                        <option value="à refaire">À refaire</option>
                        <option value="autre">Autre</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* Examens à réaliser */}
              <div>
                <h3 className="font-black text-slate-900 uppercase tracking-tight mb-4 flex items-center gap-2">
                  <Activity size={18} className="text-amber-500" /> Gestion par Examen (Prélèvements & Techniques)
                </h3>
                <p className="text-xs text-slate-500 mb-4 italic">
                  Chaque analyse peut nécessiter un type de prélèvement (tube/contenant) et une technique analytique spécifiques.
                </p>
                <div className="space-y-4">
                  {selectedRequest.exams.map((exam, idx) => (
                    <div key={idx} className="p-4 border border-slate-200 rounded-2xl bg-slate-50/50 hover:bg-slate-50 transition-all space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="font-bold text-slate-800 text-sm">{exam.name}</span>
                          <span className="ml-2 px-2 py-0.5 bg-blue-100 text-blue-700 text-[9px] font-bold uppercase rounded-md">
                            {exam.category}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold text-slate-400">Statut :</span>
                          <select
                            value={exam.sampleStatus || 'en attente'}
                            onChange={(e) => handleUpdateExamSampleInfo(exam.actId, 'sampleStatus', e.target.value)}
                            className={`p-1.5 rounded-lg text-xs font-bold border ${
                              exam.sampleStatus === 'conforme' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                              exam.sampleStatus === 'prélevé' ? 'bg-purple-50 text-purple-700 border-purple-200' :
                              exam.sampleStatus === 'à refaire' ? 'bg-rose-50 text-rose-700 border-rose-200' :
                              'bg-slate-100 text-slate-600 border-slate-200'
                            } outline-none`}
                          >
                            <option value="en attente">En attente</option>
                            <option value="prélevé">Prélevé</option>
                            <option value="conforme">Conforme</option>
                            <option value="à refaire">À refaire</option>
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-slate-100">
                        <div>
                          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Prélèvement / Tube</label>
                          <select
                            value={exam.sampleType || ''}
                            onChange={(e) => handleUpdateExamSampleInfo(exam.actId, 'sampleType', e.target.value)}
                            className="w-full p-2 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-700 outline-none focus:ring-2 focus:ring-purple-500/10"
                          >
                            <option value="">Sélectionner un tube / contenant...</option>
                            <option value="EDTA (Violet) - NFS/Hb">EDTA (Violet) - NFS/Hb</option>
                            <option value="Tube Sec (Rouge) - Sérologie/Bioch">Tube Sec (Rouge) - Sérologie/Bioch</option>
                            <option value="Citrate (Bleu) - Hémostase">Citrate (Bleu) - Hémostase</option>
                            <option value="Fluorure (Gris) - Glycémie">Fluorure (Gris) - Glycémie</option>
                            <option value="Héparine (Vert) - Ionogramme">Héparine (Vert) - Ionogramme</option>
                            <option value="Flacon stérile - Urines">Flacon stérile - Urines</option>
                            <option value="Pot classique - Selles">Pot classique - Selles</option>
                            <option value="Ecouvillon stérile">Ecouvillon stérile</option>
                            <option value="Tube LCR stérile">Tube LCR stérile</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Technique analytique</label>
                          <select
                            value={exam.technique || ''}
                            onChange={(e) => handleUpdateExamSampleInfo(exam.actId, 'technique', e.target.value)}
                            className="w-full p-2 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-700 outline-none focus:ring-2 focus:ring-purple-500/10"
                          >
                            <option value="">Sélectionner une technique...</option>
                            <option value="Automate d'Hématologie (Cytométrie)">Automate d'Hématologie (Cytométrie)</option>
                            <option value="Spectrophotométrie (Biochimie)">Spectrophotométrie (Biochimie)</option>
                            <option value="Centrifugation & Lecture Microscopique">Centrifugation & Lecture Microscopique</option>
                            <option value="Coloration de Gram & Culture">Coloration de Gram & Culture</option>
                            <option value="Séro-agglutination / Elisa">Séro-agglutination / Elisa</option>
                            <option value="TDR (Test de Diagnostic Rapide)">TDR (Test de Diagnostic Rapide)</option>
                            <option value="Examen direct à l'état frais">Examen direct à l'état frais</option>
                          </select>
                        </div>
                      </div>
                      
                      <div className="flex gap-2 items-center">
                        <span className="text-[10px] font-bold text-slate-400 shrink-0">Note/Remarque :</span>
                        <input
                          type="text"
                          value={exam.sampleRemarks || ''}
                          placeholder="Ex: Hémolysé, échantillon insuffisant, etc."
                          onChange={(e) => handleUpdateExamSampleInfo(exam.actId, 'sampleRemarks', e.target.value)}
                          className="flex-1 px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs outline-none focus:ring-1 focus:ring-purple-500/20"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-slate-100 bg-slate-50 shrink-0 flex justify-between items-center">
              <div className="flex items-center gap-2 text-sm text-slate-500 font-medium">
                <User size={16} /> Technicien: <span className="text-slate-900 font-bold">{user?.name || 'Non assigné'}</span>
              </div>
              <div className="flex gap-3">
                {selectedRequest.status === 'patient appelé' && (
                  <button 
                    onClick={() => handleUpdateStatus(selectedRequest.id, 'prélèvement fait')}
                    disabled={isSaving}
                    className="px-6 py-3 bg-purple-100 text-purple-700 font-bold rounded-xl hover:bg-purple-200 transition-colors flex items-center gap-2 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Confirmer prélèvement
                  </button>
                )}
                {(selectedRequest.status === 'prélèvement fait' || selectedRequest.status === 'patient appelé') && (
                  <button 
                    onClick={() => handleUpdateStatus(selectedRequest.id, 'en cours')}
                    disabled={isSaving}
                    className="px-6 py-3 bg-amber-100 text-amber-700 font-bold rounded-xl hover:bg-amber-200 transition-colors flex items-center gap-2 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Démarrer l'analyse
                  </button>
                )}
                {selectedRequest.status === 'en cours' && (
                  <button 
                    onClick={() => handleUpdateStatus(selectedRequest.id, 'terminé')}
                    disabled={isSaving}
                    className="px-6 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-500 transition-colors flex items-center gap-2 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <CheckCircle size={18} /> Analyses terminées
                  </button>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-slate-400 p-8 text-center">
            <FlaskConical size={64} className="mb-6 opacity-20" />
            <h2 className="text-xl font-bold text-slate-600 mb-2">Sélectionnez un échantillon</h2>
            <p className="text-sm max-w-md">Choisissez un prélèvement en cours pour mettre à jour son statut ou ajouter des remarques.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default EnCoursTab;
