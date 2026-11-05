import React, { useState, useMemo, useEffect } from 'react';
import { X, Search, Filter, AlertCircle, FileText, CheckCircle2, Clock, Activity, Send, Beaker, Star, Loader2 } from 'lucide-react';
import { MedicalAct, LabExamRequest } from '../types';
import { useSettings } from '../hooks/useSettings';
import { db } from '../src/firebase';
import { collection, onSnapshot, query, where } from 'firebase/firestore';

interface LabExamRequestFormProps {
  patientId: string;
  patientName: string;
  patientAge: string;
  patientSex: string;
  patientDossier: string;
  prescriberId: string;
  prescriberName: string;
  requestingService: string;
  onClose: () => void;
  onSave: (request: Omit<LabExamRequest, 'id' | 'date' | 'status' | 'billingStatus'>) => void;
}

const EXAM_CATEGORIES = [
  'Hématologie',
  'Biochimie',
  'Sérologie',
  'Parasitologie',
  'Bactériologie',
  'Immunologie',
  'Urines',
  'Autres'
];

const EXAM_PACKS = [
  { name: 'Bilan prénatal', keywords: ['NFS', 'Groupe sanguin', 'Rhésus', 'Glycémie', 'Toxoplasmose', 'Rubéole', 'Syphilis', 'VIH', 'Ag HBs', 'ECBU'] },
  { name: 'Bilan pré-opératoire', keywords: ['NFS', 'Plaquettes', 'TP', 'TCA', 'Groupe sanguin', 'Rhésus', 'Glycémie', 'Urée', 'Créatinine'] },
  { name: 'Bilan anémie', keywords: ['NFS', 'Réticulocytes', 'Fer sérique', 'Ferritine', 'Transferrine'] },
  { name: 'Bilan paludisme', keywords: ['Goutte épaisse', 'Frottis sanguin', 'TDR Paludisme', 'NFS'] },
  { name: 'Bilan diabète', keywords: ['Glycémie à jeun', 'HbA1c', 'Créatinine', 'Microalbuminurie', 'EAL'] }
];

const LabExamRequestForm: React.FC<LabExamRequestFormProps> = ({
  patientId,
  patientName,
  patientAge,
  patientSex,
  patientDossier,
  prescriberId,
  prescriberName,
  requestingService,
  onClose,
  onSave
}) => {
  const { establishment } = useSettings();
  const currency = establishment?.currency || 'FCFA';

  const [motif, setMotif] = useState('');
  const [diagnostic, setDiagnostic] = useState('');
  const [note, setNote] = useState('');
  const [isUrgent, setIsUrgent] = useState(false);
  const [comments, setComments] = useState('');
  const [localSubmitting, setLocalSubmitting] = useState(false);
  const [acts, setActs] = useState<MedicalAct[]>([]);
  const [isLoadingActs, setIsLoadingActs] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const q = collection(db, 'medical_acts');
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MedicalAct));
      const labActs = list.filter(act => 
        !act.servicePrincipal || 
        act.servicePrincipal === 'laboratoire' || 
        act.type === 'examen' || 
        act.category === 'Laboratoire' ||
        EXAM_CATEGORIES.includes(act.category || '')
      );
      setActs(labActs.length > 0 ? labActs : list);
      setIsLoadingActs(false);
    });
    return () => unsubscribe();
  }, []);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedExams, setSelectedExams] = useState<Set<string>>(new Set());
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(EXAM_CATEGORIES));

  const normalizeText = (text: string) => {
    if (!text) return '';
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  };

  const filteredActs = useMemo(() => {
    const normalizedQuery = normalizeText(searchQuery);
    return acts.filter(act => {
      const matchesSearch = normalizeText(act.name).includes(normalizedQuery) || 
                            normalizeText(act.codeInterne || '').includes(normalizedQuery);
      const matchesCategory = selectedCategory ? act.category === selectedCategory : true;
      return matchesSearch && matchesCategory;
    });
  }, [acts, searchQuery, selectedCategory]);

  const actsByCategory = useMemo(() => {
    const grouped: Record<string, MedicalAct[]> = {};
    EXAM_CATEGORIES.forEach(cat => grouped[cat] = []);
    
    filteredActs.forEach(act => {
      const cat = act.category || 'Autres';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(act);
    });
    return grouped;
  }, [filteredActs]);

  const toggleExam = (examId: string) => {
    const newSelected = new Set(selectedExams);
    if (newSelected.has(examId)) {
      newSelected.delete(examId);
    } else {
      newSelected.add(examId);
    }
    setSelectedExams(newSelected);
  };

  const toggleCategory = (category: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(category)) {
      newExpanded.delete(category);
    } else {
      newExpanded.add(category);
    }
    setExpandedCategories(newExpanded);
  };

  const applyPack = (pack: typeof EXAM_PACKS[0]) => {
    const newSelected = new Set(selectedExams);
    const newExpanded = new Set(expandedCategories);
    acts.forEach(act => {
      const normalizedActName = normalizeText(act.name);
      const isMatch = pack.keywords.some(kw => {
        const normalizedKw = normalizeText(kw);
        return normalizedActName.includes(normalizedKw) || normalizedKw.includes(normalizedActName);
      });
      if (isMatch) {
        newSelected.add(act.id);
        if (act.category) {
          newExpanded.add(act.category);
        } else {
          newExpanded.add('Autres');
        }
      }
    });
    setSelectedExams(newSelected);
    setExpandedCategories(newExpanded);
  };

  const totalAmount = useMemo(() => {
    return Array.from(selectedExams).reduce((total: number, examId: string) => {
      const exam = acts.find(a => a.id === examId);
      return total + (exam?.price || 0);
    }, 0);
  }, [selectedExams, acts]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedExams.size === 0) {
      alert("Veuillez sélectionner au moins un examen.");
      return;
    }
    if (localSubmitting) return;
    setLocalSubmitting(true);
    
    try {
      const selectedExamDetails = Array.from(selectedExams).map(id => {
        const act = acts.find(a => a.id === id)!;
        return {
          actId: act.id,
          name: act.name,
          price: act.price,
          category: act.category
        };
      });

      await onSave({
        patientId,
        patientName,
        patientAge: parseInt(patientAge) || 0,
        patientGender: patientSex,
        prescriberId,
        prescriberName,
        department: requestingService,
        priority: isUrgent ? 'urgent' : 'normal',
        clinicalContext: {
          motif,
          diagnostic,
          note
        },
        exams: selectedExamDetails,
        totalAmount,
        comments
      });
    } catch (error) {
      console.error('Error submitting lab request:', error);
    } finally {
      setLocalSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-6xl max-h-[95vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className={`p-6 border-b flex items-center justify-between shrink-0 transition-colors ${isUrgent ? 'bg-rose-50 border-rose-100' : 'bg-slate-50 border-slate-100'}`}>
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-inner ${isUrgent ? 'bg-rose-100 text-rose-600' : 'bg-blue-100 text-blue-600'}`}>
              <Beaker size={24} />
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-900">Bulletin d'examens numériques</h2>
              <p className={`text-sm font-medium ${isUrgent ? 'text-rose-600' : 'text-slate-500'}`}>
                {isUrgent ? 'Prescription URGENTE' : 'Nouvelle prescription de laboratoire'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button onClick={onClose} className="p-2 text-slate-400 hover:bg-slate-200 hover:text-slate-600 rounded-xl transition-colors">
              <X size={24} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
          {/* Left Column: Context & Patient */}
          <div className="w-full md:w-1/3 border-r border-slate-100 bg-slate-50/50 overflow-y-auto p-6 space-y-6">
            
            {/* BLOC 1 - PATIENT */}
            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                <FileText size={14} /> Informations Patient
              </h3>
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-slate-500 font-medium">Patient</p>
                  <p className="font-bold text-slate-900">{patientName}</p>
                  <p className="text-xs text-slate-600">{patientAge} • {patientSex} • Dossier: {patientDossier}</p>
                </div>
                <div className="pt-3 border-t border-slate-100">
                  <p className="text-xs text-slate-500 font-medium">Prescripteur</p>
                  <p className="font-bold text-slate-900 text-sm">{prescriberName}</p>
                  <p className="text-xs text-slate-600">Service: {requestingService}</p>
                </div>
              </div>
            </div>

            {/* BLOC 2 - CONTEXTE CLINIQUE */}
            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  <Activity size={14} /> Contexte Clinique
                </h3>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={isUrgent}
                    onChange={(e) => setIsUrgent(e.target.checked)}
                    className="w-4 h-4 text-rose-600 rounded border-slate-300 focus:ring-rose-500"
                  />
                  <span className={`text-xs font-bold ${isUrgent ? 'text-rose-600' : 'text-slate-600'}`}>URGENT</span>
                </label>
              </div>
              
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Motif / Indication</label>
                <input 
                  type="text" 
                  value={motif}
                  onChange={(e) => setMotif(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                  placeholder="Ex: Fièvre persistante..."
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Diagnostic suspecté</label>
                <input 
                  type="text" 
                  value={diagnostic}
                  onChange={(e) => setDiagnostic(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                  placeholder="Ex: Paludisme grave..."
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Note clinique</label>
                <textarea 
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm min-h-[80px]"
                  placeholder="Informations utiles pour le biologiste..."
                />
              </div>
            </div>

            {/* BLOC 4 - PARAMÈTRES DE DEMANDE */}
            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4">
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <Clock size={14} /> Paramètres
              </h3>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Commentaire pour le laboratoire</label>
                <textarea 
                  value={comments}
                  onChange={(e) => setComments(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm min-h-[60px]"
                  placeholder="Ex: Prélèvement difficile..."
                />
              </div>
            </div>

          </div>

          {/* Right Column: Exam Selection */}
          <div className="w-full md:w-2/3 flex flex-col bg-white">
            {/* Search & Filters */}
            <div className="p-6 border-b border-slate-100 space-y-4">
              <div className="flex gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input 
                    type="text" 
                    placeholder="Rechercher un examen..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                  />
                </div>
                <select 
                  value={selectedCategory || ''}
                  onChange={(e) => setSelectedCategory(e.target.value || null)}
                  className="px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm font-medium text-slate-700"
                >
                  <option value="">Toutes les catégories</option>
                  {EXAM_CATEGORIES.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              {/* Packs */}
              <div className="flex gap-2 overflow-x-auto pb-2 hide-scrollbar">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest py-2 shrink-0">Packs :</span>
                {EXAM_PACKS.map(pack => (
                  <button
                    key={pack.name}
                    type="button"
                    onClick={() => applyPack(pack)}
                    className="px-3 py-1.5 bg-indigo-50 text-indigo-700 border border-indigo-100 rounded-lg text-xs font-bold hover:bg-indigo-100 transition-colors shrink-0 flex items-center gap-1"
                  >
                    <Star size={12} /> {pack.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Exam List */}
            <div className="flex-1 overflow-y-auto p-6">
              {Object.entries(actsByCategory).map(([category, categoryActs]: [string, MedicalAct[]]) => {
                if (categoryActs.length === 0) return null;
                const isExpanded = expandedCategories.has(category);
                
                return (
                  <div key={category} className="mb-4 bg-slate-50 rounded-2xl border border-slate-200 overflow-hidden">
                    <button 
                      type="button"
                      onClick={() => toggleCategory(category)}
                      className="w-full px-5 py-3 flex items-center justify-between bg-white hover:bg-slate-50 transition-colors"
                    >
                      <h4 className="font-bold text-slate-800">{category} <span className="text-slate-400 text-xs font-normal ml-2">({categoryActs.length})</span></h4>
                      <div className={`transform transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </div>
                    </button>
                    
                    {isExpanded && (
                      <div className="p-2 border-t border-slate-100">
                        {categoryActs.map(act => (
                          <label 
                            key={act.id} 
                            className={`flex items-center justify-between p-3 rounded-xl cursor-pointer transition-colors ${
                              selectedExams.has(act.id) ? 'bg-blue-50 border border-blue-200' : 'hover:bg-slate-100 border border-transparent'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <input 
                                type="checkbox"
                                checked={selectedExams.has(act.id)}
                                onChange={() => toggleExam(act.id)}
                                className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                              />
                              <div>
                                <p className={`text-sm font-bold ${selectedExams.has(act.id) ? 'text-blue-900' : 'text-slate-700'}`}>{act.name}</p>
                                {act.codeInterne && <p className="text-xs text-slate-500">{act.codeInterne}</p>}
                              </div>
                            </div>
                            <span className="text-sm font-black text-slate-600">{(act.price || 0).toLocaleString()} {currency}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              
              {filteredActs.length === 0 && (
                <div className="text-center py-12 text-slate-500">
                  <Search size={32} className="mx-auto mb-3 opacity-20" />
                  <p className="font-medium">Aucun examen trouvé</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-100 bg-white shrink-0 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="bg-slate-100 px-4 py-2 rounded-xl flex items-center gap-3">
              <span className="text-sm text-slate-500 font-medium">Sélectionnés : </span>
              <span className="text-lg font-black text-slate-900">{selectedExams.size}</span>
              {selectedExams.size > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedExams(new Set())}
                  className="px-2 py-1 text-[10px] font-black uppercase tracking-widest bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg transition-colors border border-rose-100"
                >
                  Effacer
                </button>
              )}
            </div>
            <div className="bg-blue-50 px-4 py-2 rounded-xl border border-blue-100">
              <span className="text-sm text-blue-600 font-medium">Total estimé : </span>
              <span className="text-lg font-black text-blue-700">{(totalAmount || 0).toLocaleString()} {currency}</span>
            </div>
          </div>
          <div className="flex gap-3">
            <button 
              type="button"
              onClick={onClose}
              disabled={localSubmitting}
              className="px-6 py-3 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Annuler
            </button>
            <button 
              onClick={handleSubmit}
              disabled={selectedExams.size === 0 || localSubmitting}
              className={`px-6 py-3 rounded-xl font-bold text-white transition-colors flex items-center gap-2 shadow-lg ${
                selectedExams.size === 0 || localSubmitting
                  ? 'bg-slate-300 cursor-not-allowed shadow-none' 
                  : isUrgent 
                    ? 'bg-rose-600 hover:bg-rose-700 shadow-rose-600/20' 
                    : 'bg-blue-600 hover:bg-blue-700 shadow-blue-600/20'
              }`}
            >
              {localSubmitting ? (
                <>
                  <Loader2 size={18} className="animate-spin" /> Envoi en cours...
                </>
              ) : (
                <>
                  <Send size={18} /> {isUrgent ? 'Prescrire (URGENT)' : 'Prescrire les examens'}
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

export default LabExamRequestForm;
