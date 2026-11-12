import React, { useState, useEffect, useMemo } from 'react';
import { Search, FlaskConical, CheckCircle, Clock, FileText, Save, Activity, AlertTriangle, Loader2, Send, CheckCheck, User, Info, Sparkles } from 'lucide-react';
import { LabExamRequest, ResultatLaboratoire, LigneResultat, ParametreResultat, MedicalAct } from '../../types';
import { LabFilterToolbar, LabFilters } from '../../components/lab/LabFilterToolbar';
import { EmptyFilterState } from '../../components/common/EmptyFilterState';
import { isStatusPrelevementFait } from '../../src/utils/labStatus';

import { db, sanitizeData } from '../../src/firebase';
import { collection, onSnapshot, addDoc } from 'firebase/firestore';

interface ResultatsTabProps {
  requests: LabExamRequest[];
  updateRequests: (requests: LabExamRequest[]) => void;
  resultats: ResultatLaboratoire[];
  updateResultats: (resultats: ResultatLaboratoire[]) => void;
  user?: any;
}

const ResultatsTab: React.FC<ResultatsTabProps> = ({ requests, updateRequests, resultats, updateResultats, user }) => {
  const [selectedRequest, setSelectedRequest] = useState<LabExamRequest | null>(null);
  const [medicalActs, setMedicalActs] = useState<MedicalAct[]>([]);
  
  // Form state for results
  const [currentResultat, setCurrentResultat] = useState<ResultatLaboratoire | null>(null);

  // Filters State - Strictly Stage 2 (PRELEVEMENT_FAIT) without conflicting status dropdowns
  const [filters, setFilters] = useState<LabFilters>({
    search: '',
    status: 'PRELEVEMENT_FAIT',
    dateRange: 'ALL',
    startDate: '',
    endDate: ''
  });

  const handleResetFilters = () => {
    setFilters({
      search: '',
      status: 'PRELEVEMENT_FAIT',
      dateRange: 'ALL',
      startDate: '',
      endDate: ''
    });
  };

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'medical_acts'), (snap) => {
      if (!snap.empty) {
        setMedicalActs(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as MedicalAct)));
      } else {
        const savedActs = localStorage.getItem('hospital_medical_acts');
        if (savedActs) {
          setMedicalActs(JSON.parse(savedActs));
        }
      }
    });
    return () => unsub();
  }, []);

  // Strict Stage 2 status isolation: ONLY analyses where sample has been drawn (statut === 'PRELEVEMENT_FAIT')
  // Strictly ordered by most recent date first (DESC)
  const readyRequests = useMemo(() => {
    return requests
      .filter(r => isStatusPrelevementFait(r.status, (r as any).statut))
      .sort((a, b) => {
        const tA = new Date(a.createdAt || a.date || 0).getTime();
        const tB = new Date(b.createdAt || b.date || 0).getTime();
        return tB - tA;
      });
  }, [requests]);
  
  // Search bar (Patient Name, DME ID, Prescribing Doctor, Request ID) & Date filters
  const filteredRequests = useMemo(() => {
    const now = new Date();
    return readyRequests.filter(r => {
      // Text search
      if (filters.search) {
        const q = filters.search.toLowerCase().trim();
        const matchesPatient = (r.patientName || '').toLowerCase().includes(q);
        const matchesId = (r.id || '').toLowerCase().includes(q);
        const matchesDme = (r.patientId || '').toLowerCase().includes(q);
        const matchesDoctor = (r.prescriberName || '').toLowerCase().includes(q);
        if (!matchesPatient && !matchesId && !matchesDme && !matchesDoctor) {
          return false;
        }
      }

      // Date filter
      const reqDate = new Date(r.createdAt || r.date);
      if (!isNaN(reqDate.getTime())) {
        if (filters.dateRange === 'TODAY') {
          if (reqDate.toDateString() !== now.toDateString()) return false;
        } else if (filters.dateRange === 'WEEK') {
          const diffDays = Math.ceil(Math.abs(now.getTime() - reqDate.getTime()) / (1000 * 60 * 60 * 24));
          if (diffDays > 7) return false;
        } else if (filters.dateRange === 'CUSTOM') {
          if (filters.startDate) {
            const start = new Date(filters.startDate);
            start.setHours(0, 0, 0, 0);
            if (reqDate < start) return false;
          }
          if (filters.endDate) {
            const end = new Date(filters.endDate);
            end.setHours(23, 59, 59, 999);
            if (reqDate > end) return false;
          }
        }
      }

      return true;
    });
  }, [readyRequests, filters]);

  // Initialize or load result form when a request is selected
  useEffect(() => {
    if (selectedRequest) {
      const existingResult = resultats.find(r => r.demandeId === selectedRequest.id);
      if (existingResult) {
        setCurrentResultat(existingResult);
      } else {
        // Initialize new result directly with ready-to-type parameters
        const newLignes: LigneResultat[] = (selectedRequest.exams || []).map((exam: any, idx: number) => {
          const examActId = typeof exam === 'string' ? `ACT-${idx}` : (exam.actId || `ACT-${idx}`);
          const examName = typeof exam === 'string' ? exam : (exam.name || 'Examen');
          const act = medicalActs.find(a => 
            a.id === examActId || 
            a.code === examActId || 
            (a.nom && examName && a.nom.toLowerCase() === examName.toLowerCase())
          );
          const params: ParametreResultat[] = act?.labParameters?.map((p: any) => ({
            nom: p.nom,
            unite: p.unite,
            valeurReference: p.valeurReferenceTexte || (p.valeurReferenceMin !== undefined && p.valeurReferenceMax !== undefined ? `${p.valeurReferenceMin} - ${p.valeurReferenceMax}` : ''),
            valeur: '',
            isAnormal: false
          })) || [{
            nom: 'Résultat',
            unite: '',
            valeurReference: '',
            valeur: '',
            isAnormal: false
          }];

          return {
            examId: examActId,
            examName: examName,
            parametres: params,
            conclusion: ''
          };
        });

        setCurrentResultat({
          id: `RES-${Date.now().toString().slice(-6)}`,
          demandeId: selectedRequest.id,
          patientId: selectedRequest.patientId,
          lignes: newLignes,
          statut: 'brouillon',
          saisiPar: user?.name || 'Technicien',
          dateSaisie: new Date().toISOString()
        });
      }
    } else {
      setCurrentResultat(null);
    }
  }, [selectedRequest, resultats, medicalActs, user]);

  const handleParamChange = (examId: string, paramIndex: number, value: string) => {
    if (!currentResultat) return;
    
    const updatedLignes = currentResultat.lignes.map(ligne => {
      if (ligne.examId === examId) {
        const updatedParams = [...ligne.parametres];
        updatedParams[paramIndex] = { ...updatedParams[paramIndex], valeur: value };
        
        // Check if abnormal based on reference values
        const act = medicalActs.find(a => a.id === examId);
        const refParam = act?.labParameters?.[paramIndex];
        if (refParam && refParam.valeurReferenceMin !== undefined && refParam.valeurReferenceMax !== undefined) {
          const numVal = parseFloat(value.replace(',', '.'));
          if (!isNaN(numVal)) {
            updatedParams[paramIndex].isAnormal = numVal < refParam.valeurReferenceMin || numVal > refParam.valeurReferenceMax;
          }
        }

        return { ...ligne, parametres: updatedParams };
      }
      return ligne;
    });

    setCurrentResultat({ ...currentResultat, lignes: updatedLignes });
  };

  const handleConclusionChange = (examId: string, value: string) => {
    if (!currentResultat) return;
    const updatedLignes = currentResultat.lignes.map(ligne => 
      ligne.examId === examId ? { ...ligne, conclusion: value } : ligne
    );
    setCurrentResultat({ ...currentResultat, lignes: updatedLignes });
  };

  const [isSaving, setIsSaving] = useState(false);

  // Single-step definitive action: Enregistrer & Publier (or Brouillon)
  const handleSave = async (statut: 'brouillon' | 'validé') => {
    if (!currentResultat || !selectedRequest || isSaving) return;
    setIsSaving(true);
    
    try {
      const now = new Date().toISOString();
      const technicianName = user?.name || currentResultat.saisiPar || 'Technicien Laboratoire';
      const technicianId = user?.id || '';

      const updatedResultat: ResultatLaboratoire = { 
        ...currentResultat, 
        statut, 
        saisiPar: technicianName,
        saisiParId: technicianId,
        dateSaisie: currentResultat.dateSaisie || now,
        ...(statut === 'validé' ? {
          validePar: technicianName,
          valideParId: technicianId,
          dateValidation: now,
          remarquesValidation: 'Publication directe laboratoire (Circuit instantané)',
          isDirectPublication: true
        } : {})
      };
      
      const existingIndex = resultats.findIndex(r => r.id === updatedResultat.id);
      let newResultats;
      if (existingIndex >= 0) {
        newResultats = [...resultats];
        newResultats[existingIndex] = updatedResultat;
      } else {
        newResultats = [...resultats, updatedResultat];
      }
      
      await updateResultats(newResultats);

      // In atomic publish, instantly mark exam request as completed and published
      if (statut === 'validé') {
        const updatedRequests = requests.map(r => r.id === selectedRequest.id ? { ...r, status: 'terminé' as const } : r);
        await updateRequests(updatedRequests);

        // Audit Trail entry for direct accelerated publication
        try {
          await addDoc(collection(db, 'audit_logs'), sanitizeData({
            user: technicianName,
            userId: technicianId,
            role: user?.role || 'LAB_TECHNICIAN',
            date: new Date().toLocaleDateString('fr-FR'),
            time: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
            timestamp: now,
            action: `Enregistrement et publication d'analyses de laboratoire - Demande: ${selectedRequest.id} - Patient: ${selectedRequest.patientName}`,
            details: {
              demandeId: selectedRequest.id,
              patientId: selectedRequest.patientId,
              patientName: selectedRequest.patientName,
              technicien: technicianName,
              examsCount: selectedRequest.exams?.length || 0,
              mode: 'SINGLE_STEP_DIRECT_PUBLISH'
            },
            module: 'Laboratoire'
          }));
        } catch (auditErr) {
          console.warn("Audit log creation error:", auditErr);
        }

        setSelectedRequest(null);
        setCurrentResultat(null);
        window.dispatchEvent(new CustomEvent('app-notification', { 
          detail: { 
            message: `✓ Analyses de ${selectedRequest.patientName} enregistrées et publiées au dossier patient avec succès`, 
            type: 'success' 
          } 
        }));
        window.dispatchEvent(new CustomEvent('change-lab-tab', { detail: 'rapports' }));
      } else {
        window.dispatchEvent(new CustomEvent('app-notification', { 
          detail: `Brouillon de résultat enregistré pour ${selectedRequest.patientName}` 
        }));
      }
    } catch (e) {
      console.error("Save error:", e);
      window.dispatchEvent(new CustomEvent('app-notification', { 
        detail: { message: `Erreur lors de l'enregistrement du résultat`, type: 'error' } 
      }));
    } finally {
      setIsSaving(false);
    }
  };

  const stage2TotalCount = requests.filter(r => isStatusPrelevementFait(r.status, (r as any).statut)).length;

  return (
    <div className="flex-1 min-h-0 h-full flex flex-col gap-3 overflow-hidden">
      {/* Ultra-Micro Compact Filter Toolbar strictly for Stage 2 (No status dropdown) */}
      <LabFilterToolbar 
        filters={filters}
        onFiltersChange={setFilters}
        totalCount={stage2TotalCount}
        filteredCount={filteredRequests.length}
        onReset={handleResetFilters}
        showStatusFilter={false}
        stageBadge={{ label: "Stage 2 — Saisie & Analyse (Prélèvement fait)", color: "bg-amber-50 text-amber-800 border border-amber-200" }}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 flex-1 min-h-0 h-full overflow-hidden">
        {/* Liste des demandes prêtes pour la saisie */}
        <div className="lg:col-span-1 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col h-full overflow-hidden">
          <div className="px-3.5 py-2.5 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between shrink-0">
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
              <FlaskConical size={13} className="text-amber-600" /> Échantillons ({filteredRequests.length})
            </span>
            <span className="text-[9px] font-bold text-slate-400">Plus récentes en premier</span>
          </div>
          
          <div className="flex-1 overflow-y-auto p-2 space-y-1.5 custom-scrollbar min-h-0">
            {filteredRequests.length > 0 ? filteredRequests.map((req, idx) => {
              const res = resultats.find(r => r.demandeId === req.id);
              const isPublished = res?.statut === 'validé' || req.status === 'terminé' || req.status === 'validé';
              const isSelected = selectedRequest?.id === req.id;
              
              return (
                <div 
                  key={`${req.id || 'res-req'}-${idx}`} 
                  onClick={() => setSelectedRequest(req)}
                  className={`p-3 rounded-xl cursor-pointer transition-all border text-xs ${
                    isSelected 
                      ? 'bg-blue-50 border-blue-300 shadow-xs' 
                      : 'bg-white border-slate-100 hover:border-blue-200 hover:bg-slate-50/80'
                  }`}
                >
                  <div className="flex justify-between items-start mb-1.5">
                    <div className="min-w-0 pr-2">
                      <h3 className="font-black text-slate-900 text-xs truncate">{req.patientName}</h3>
                      <p className="text-[10px] text-slate-400 font-mono font-bold tracking-tight uppercase truncate">
                        {req.patientId || req.id}
                      </p>
                    </div>
                    {isPublished ? (
                      <span className="bg-emerald-100 text-emerald-800 text-[9px] font-black px-1.5 py-0.5 rounded flex items-center gap-0.5 shrink-0">
                        <CheckCheck size={10} /> PUBLIÉ
                      </span>
                    ) : res?.statut === 'brouillon' ? (
                      <span className="bg-slate-100 text-slate-700 text-[9px] font-black px-1.5 py-0.5 rounded shrink-0">
                        BROUILLON
                      </span>
                    ) : (
                      <span className="bg-amber-100 text-amber-900 text-[9px] font-black px-1.5 py-0.5 rounded shrink-0">
                        À SAISIR
                      </span>
                    )}
                  </div>
                  
                  <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1 border-t border-slate-100/60">
                    <span className="flex items-center gap-1">
                      <Clock size={11} className="text-slate-400" /> 
                      {req.date ? new Date(req.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '-'}
                    </span>
                    <span className="font-semibold bg-slate-100 px-1.5 py-0.2 rounded text-slate-600">
                      {req.exams?.length || 0} examen(s)
                    </span>
                  </div>
                </div>
              );
            }) : (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 p-6 text-center">
                <Activity size={36} className="mb-2 opacity-20" />
                <p className="font-bold text-xs">Aucune analyse à saisir</p>
              </div>
            )}
          </div>
        </div>

        {/* Zone de saisie des résultats avec Maximisation de l'espace vertical */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col h-full overflow-hidden">
          {selectedRequest && currentResultat ? (
            <>
              {/* Ultra-Micro Header Ribbon (Height: strictly ~42px, single-line text ribbon) */}
              <div className="h-11 px-4 bg-slate-900 text-white flex items-center justify-between gap-3 shrink-0 rounded-t-2xl text-xs font-mono select-none overflow-x-auto whitespace-nowrap custom-scrollbar">
                <div className="flex items-center gap-2 text-slate-200 text-[11px] sm:text-xs">
                  <span className="font-bold text-amber-400">[{selectedRequest.patientId || selectedRequest.id}]</span>
                  <span className="text-slate-600">|</span>
                  <span className="font-bold text-white font-sans">{selectedRequest.patientName}</span>
                  <span className="text-slate-600">|</span>
                  <span>{selectedRequest.patientAge || (selectedRequest as any).age ? `${selectedRequest.patientAge || (selectedRequest as any).age} ans` : 'Âge -'}</span>
                  <span className="text-slate-600">|</span>
                  <span>{selectedRequest.patientGender === 'M' ? 'H' : selectedRequest.patientGender === 'F' ? 'F' : selectedRequest.patientGender || '-'}</span>
                  <span className="text-slate-600">|</span>
                  <span className="text-slate-300 font-sans">Prescripteur: <strong className="text-white font-medium">{selectedRequest.prescriberName || selectedRequest.prescripteur || selectedRequest.doctorName || 'Dr. Médecin'}</strong></span>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${
                    selectedRequest.priority === 'critique' || selectedRequest.priority === 'Critique' || (selectedRequest as any).priorite === 'Critique'
                      ? 'bg-rose-500 text-white'
                      : selectedRequest.priority === 'urgent' || selectedRequest.priority === 'Urgent' || (selectedRequest as any).priorite === 'Urgent'
                      ? 'bg-amber-500 text-slate-950 font-black'
                      : 'bg-emerald-700 text-white'
                  }`}>
                    {selectedRequest.priority || (selectedRequest as any).priorite || 'NORMAL'}
                  </span>
                </div>
              </div>

              {/* Parameter Entry Workspace - Full Height Expanded (flex: 1) */}
              <div className="flex-1 overflow-y-auto p-4 custom-scrollbar space-y-4 min-h-0 bg-slate-50/40">
                {currentResultat.lignes.map((ligne, idx) => (
                  <div key={idx} className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
                    <div className="px-4 py-2 bg-slate-100/90 border-b border-slate-200 flex justify-between items-center">
                      <h3 className="font-extrabold text-slate-900 text-xs tracking-tight uppercase flex items-center gap-1.5">
                        <FlaskConical size={14} className="text-blue-600" />
                        {ligne.examName}
                      </h3>
                      <span className="text-[10px] text-slate-500 font-bold">
                        {ligne.parametres.length} paramètre(s)
                      </span>
                    </div>
                    
                    <div className="p-3">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-slate-200/80 text-[10px] text-slate-400 uppercase tracking-widest font-black">
                            <th className="pb-1.5 font-bold">Paramètre</th>
                            <th className="pb-1.5 font-bold w-1/3">Résultat</th>
                            <th className="pb-1.5 font-bold">Unité</th>
                            <th className="pb-1.5 font-bold">Valeurs de réf.</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {ligne.parametres.map((param, pIdx) => (
                            <tr key={pIdx} className="hover:bg-slate-50/60 transition-colors">
                              <td className="py-2 text-xs font-semibold text-slate-800">{param.nom}</td>
                              <td className="py-2 pr-3">
                                <div className="relative">
                                  <input 
                                    type="text" 
                                    value={param.valeur}
                                    onChange={(e) => handleParamChange(ligne.examId, pIdx, e.target.value)}
                                    className={`w-full px-3 py-1.5 border rounded-lg text-xs font-bold outline-none transition-all ${
                                      param.isAnormal 
                                        ? 'border-rose-400 bg-rose-50/80 text-rose-800 focus:ring-2 focus:ring-rose-500/20' 
                                        : 'border-slate-200 bg-white text-slate-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20'
                                    }`}
                                    placeholder="Saisir résultat..."
                                    autoFocus={idx === 0 && pIdx === 0}
                                  />
                                  {param.isAnormal && (
                                    <AlertTriangle size={13} className="absolute right-2 top-1/2 -translate-y-1/2 text-rose-500 pointer-events-none" />
                                  )}
                                </div>
                              </td>
                              <td className="py-2 text-xs text-slate-500 font-medium">{param.unite || '-'}</td>
                              <td className="py-2 text-xs text-slate-400 font-mono">{param.valeurReference || 'N/A'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>

                      <div className="mt-2.5 pt-2.5 border-t border-slate-100">
                        <input 
                          type="text"
                          value={ligne.conclusion || ''}
                          onChange={(e) => handleConclusionChange(ligne.examId, e.target.value)}
                          className="w-full px-3 py-1.5 bg-slate-50/80 border border-slate-200 rounded-lg text-xs outline-none focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                          placeholder="Conclusion ou remarque pour cet examen (optionnel)..."
                        />
                      </div>
                    </div>
                  </div>
                ))}

                <div className="bg-white p-3 rounded-xl border border-slate-200">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Commentaire général du biologiste / laborantin</label>
                  <textarea 
                    value={currentResultat.commentaireGlobal || ''}
                    onChange={(e) => setCurrentResultat({...currentResultat, commentaireGlobal: e.target.value})}
                    rows={2}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none resize-none"
                    placeholder="Commentaire de synthèse ou remarques médicales éventuelles..."
                  />
                </div>
              </div>

              {/* Bottom Action Footer - Single Step Definitive Save & Publish */}
              <div className="p-3 px-4 border-t border-slate-200 bg-white shrink-0 flex flex-col sm:flex-row justify-between items-center gap-3">
                <div className="text-xs text-slate-500 font-medium">
                  Opérateur: <strong className="text-slate-800">{user?.name || currentResultat.saisiPar || 'Technicien'}</strong>
                </div>
                <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
                  <button 
                    onClick={() => handleSave('brouillon')}
                    disabled={isSaving}
                    className="px-4 py-2 bg-white border border-slate-200 text-slate-700 text-xs font-bold rounded-xl hover:bg-slate-50 transition-colors flex items-center gap-1.5 shadow-2xs disabled:opacity-50 cursor-pointer"
                  >
                    {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                    Brouillon
                  </button>

                  <button 
                    onClick={() => handleSave('validé')}
                    disabled={isSaving}
                    className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black rounded-xl transition-all flex items-center gap-1.5 shadow-sm shadow-emerald-600/30 disabled:opacity-50 cursor-pointer"
                    title="Enregistrer et publier directement le résultat au dossier du patient"
                  >
                    {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                    Enregistrer & Publier
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 p-8 text-center">
              <Activity size={48} className="mb-3 opacity-20" />
              <h2 className="text-base font-bold text-slate-700 mb-1">Sélectionnez une demande</h2>
              <p className="text-xs max-w-sm">Choisissez un patient dans la liste de gauche pour saisir immédiatement les résultats des analyses.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ResultatsTab;
