import React, { useState, useEffect } from 'react';
import { 
  BookOpen, 
  Plus, 
  Search, 
  Filter, 
  Edit2, 
  Trash2, 
  Copy, 
  FileText, 
  Check, 
  Activity, 
  X, 
  Archive, 
  RefreshCw, 
  Sliders, 
  Calendar, 
  TrendingUp, 
  Clock, 
  ArrowRight, 
  ChevronRight, 
  Award, 
  Eye, 
  Settings, 
  Info,
  Layers,
  HeartPulse,
  Heart,
  Droplet,
  Flame,
  Stethoscope,
  ChevronDown,
  UserCheck,
  AlertTriangle,
  RotateCcw
} from 'lucide-react';
import { Protocol, ProtocolCategory, ProtocolElement, ProtocolVersion, ProtocolLog, User } from '../../types';
import { DEFAULT_PROTOCOLS } from '../../constants/defaultProtocols';
import { db } from '../../src/firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import { getActiveTenantId, belongsToTenant } from '../../src/utils/tenant';

interface ProtocolsManagementProps {
  user: User | null;
  establishment?: any;
  showMessage: (type: 'success' | 'error', text: string) => void;
}

const CATEGORY_LABELS: Record<ProtocolCategory, string> = {
  EXAM_PACK: 'Pack d\'examens',
  THERAPEUTIC: 'Thérapeutique',
  CARE: 'Soin',
  HOSPITALIZATION: 'Hospitalisation',
  OBSTETRICAL: 'Obstétrical (CPN)',
  EMERGENCY: 'Urgence',
  CARE_PATHWAY: 'Parcours de soins'
};

const CATEGORY_COLORS: Record<ProtocolCategory, string> = {
  EXAM_PACK: 'bg-indigo-50 text-indigo-700 border-indigo-100',
  THERAPEUTIC: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  CARE: 'bg-cyan-50 text-cyan-700 border-cyan-100',
  HOSPITALIZATION: 'bg-blue-50 text-blue-700 border-blue-100',
  OBSTETRICAL: 'bg-pink-50 text-pink-700 border-pink-100',
  EMERGENCY: 'bg-rose-50 text-rose-700 border-rose-100',
  CARE_PATHWAY: 'bg-purple-50 text-purple-700 border-purple-100'
};

const STATUS_LABELS = {
  DRAFT: 'Brouillon',
  PENDING: 'En validation',
  ACTIVE: 'Actif',
  ARCHIVED: 'Archivé'
};

const STATUS_COLORS = {
  DRAFT: 'bg-amber-50 text-amber-700 border-amber-200',
  PENDING: 'bg-blue-50 text-blue-700 border-blue-200',
  ACTIVE: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  ARCHIVED: 'bg-slate-100 text-slate-550 border-slate-300'
};

export const ProtocolsManagement: React.FC<ProtocolsManagementProps> = ({ user, establishment, showMessage }) => {
  const activeTenantId = React.useMemo(() => getActiveTenantId(user, establishment), [user, establishment]);
  const storageKey = activeTenantId && activeTenantId !== 'default_hospital' ? `hospital_protocols_${activeTenantId}` : 'hospital_protocols';

  // Load protocols from localStorage or seeds
  const [protocols, setProtocols] = useState<Protocol[]>(() => {
    const saved = localStorage.getItem(storageKey) || localStorage.getItem('hospital_protocols');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return DEFAULT_PROTOCOLS;
      }
    }
    return DEFAULT_PROTOCOLS;
  });

  // Save protocols to localStorage on change
  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(protocols));
  }, [protocols, storageKey]);

  // UI state
  const [activeSubTab, setActiveSubTab] = useState<'catalog' | 'stats'>('catalog');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [selectedAuthor, setSelectedAuthor] = useState<string>('ALL');
  
  // Selected protocol to inspect or edit/create
  const [viewingProtocol, setViewingProtocol] = useState<Protocol | null>(null);
  const [editingProtocol, setEditingProtocol] = useState<Partial<Protocol> | null>(null);
  const [showLogs, setShowLogs] = useState<boolean>(false);
  
  // Referentials for selection in form
  const [actsReferential, setActsReferential] = useState<any[]>([]);
  const [medsReferential, setMedsReferential] = useState<any[]>([]);
  const [consumablesReferential, setConsumablesReferential] = useState<any[]>([]);

  useEffect(() => {
    const unsubActs = onSnapshot(collection(db, 'medical_acts'), (snap) => {
      const allActs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setActsReferential(allActs.filter(a => belongsToTenant(a, activeTenantId)));
    });

    const unsubMeds = onSnapshot(collection(db, 'pharmacy_inventory'), (snap) => {
      const allMeds = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setMedsReferential(allMeds.filter(m => belongsToTenant(m, activeTenantId)));
    });

    const unsubConsumables = onSnapshot(collection(db, 'hospital_consumables'), (snap) => {
      const allCons = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setConsumablesReferential(allCons.filter(c => belongsToTenant(c, activeTenantId)));
    });

    return () => {
      unsubActs();
      unsubMeds();
      unsubConsumables();
    };
  }, [activeTenantId]);

  // Element builders state inside compilation
  const [newElementName, setNewElementName] = useState('');
  const [newElementType, setNewElementType] = useState<'EXAM' | 'MEDICATION' | 'CONSUMABLE' | 'ACT' | 'VITAL'>('EXAM');
  const [newElementQty, setNewElementQty] = useState('');
  const [newElementFreq, setNewElementFreq] = useState('');
  const [newElementDur, setNewElementDur] = useState('');
  const [newElementPrio, setNewElementPrio] = useState<'HIGH' | 'MEDIUM' | 'LOW'>('MEDIUM');
  const [newElementReq, setNewElementReq] = useState(true);

  // Selected referential item ID for fast filling
  const [selectedRefId, setSelectedRefId] = useState('');

  // Pathway steps compiler
  const [stepName, setStepName] = useState('');
  const [stepProtocolId, setStepProtocolId] = useState('');

  // Get current username or static
  const currentUserName = user?.name || user?.username || 'Administrateur';

  // Metrics calculating
  const totalCount = protocols.length;
  const activeCount = protocols.filter(p => p.status === 'ACTIVE').length;
  const archivedCount = protocols.filter(p => p.status === 'ARCHIVED').length;
  const countByCategory = protocols.reduce((acc, p) => {
    acc[p.category] = (acc[p.category] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const filteredProtocols = protocols.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          p.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          p.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          p.author.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesCategory = selectedCategory === 'ALL' || p.category === selectedCategory;
    const matchesStatus = selectedStatus === 'ALL' || p.status === selectedStatus;
    const matchesAuthor = selectedAuthor === 'ALL' || p.author === selectedAuthor;

    return matchesSearch && matchesCategory && matchesStatus && matchesAuthor;
  });

  const authors = Array.from(new Set(protocols.map(p => p.author)));

  // Write trace log function
  const createLog = (action: 'creation' | 'modification' | 'activation' | 'deactivation' | 'archiving', details?: string): ProtocolLog => {
    const now = new Date();
    return {
      user: currentUserName,
      date: now.toISOString().split('T')[0],
      time: now.toTimeString().split(' ')[0].substring(0, 5),
      action,
      details
    };
  };

  // Archive / Restore
  const handleArchive = (id: string) => {
    const updated = protocols.map(p => {
      if (p.id === id) {
        const nextStatus = p.status === 'ARCHIVED' ? 'ACTIVE' : 'ARCHIVED';
        const log = createLog(nextStatus === 'ARCHIVED' ? 'archiving' : 'activation', `Mise au statut ${nextStatus}`);
        return {
          ...p,
          status: nextStatus as any,
          lastUpdated: new Date().toISOString(),
          logs: [log, ...p.logs]
        };
      }
      return p;
    });
    setProtocols(updated);
    showMessage('success', 'Statut du protocole mis à jour');
  };

  // Toggle activation (Active vs Draft)
  const handleToggleState = (id: string) => {
    const updated = protocols.map(p => {
      if (p.id === id) {
        const nextStatus = p.status === 'ACTIVE' ? 'DRAFT' : 'ACTIVE';
        const log = createLog(nextStatus === 'ACTIVE' ? 'activation' : 'deactivation', `Modifié en ${nextStatus}`);
        return {
          ...p,
          status: nextStatus as any,
          lastUpdated: new Date().toISOString(),
          logs: [log, ...p.logs]
        };
      }
      return p;
    });
    setProtocols(updated);
    showMessage('success', 'Changement de statut enregistré');
  };

  // Duplicate / Version creation
  const handleDuplicate = (protocol: Protocol, asNewVersion: boolean) => {
    const nowStr = new Date().toISOString();
    const newVersionNum = asNewVersion 
      ? (parseFloat(protocol.version) + 0.1).toFixed(1)
      : '1.0';

    const duplicated: Protocol = {
      ...protocol,
      id: `p_${Date.now()}`,
      code: asNewVersion ? protocol.code : `${protocol.code}-COPY`,
      name: asNewVersion ? protocol.name : `${protocol.name} (Copie)`,
      version: newVersionNum,
      createdAt: nowStr,
      lastUpdated: nowStr,
      status: 'DRAFT',
      useCount: 0,
      userServices: [],
      lastUsedAt: undefined,
      versionHistory: asNewVersion ? [
        {
          version: protocol.version,
          date: protocol.lastUpdated.split('T')[0],
          author: protocol.author,
          changes: `Version archivée d'origine.`
        },
        ...protocol.versionHistory
      ] : [],
      logs: [
        createLog('creation', asNewVersion ? `Génération d'une nouvelle version ${newVersionNum}` : `Créé par duplication de ${protocol.code}`)
      ]
    };

    setProtocols([duplicated, ...protocols]);
    setViewingProtocol(null);
    setEditingProtocol(duplicated);
    showMessage('success', asNewVersion ? `Nouvelle version v${newVersionNum} éditée en Brouillon` : 'Protocole dupliqué avec succès');
  };

  // Start Creation
  const handleStartCreate = () => {
    const nowStr = new Date().toISOString().split('T')[0];
    const newProto: Partial<Protocol> = {
      id: `p_${Date.now()}`,
      code: `PRT-${Math.floor(100 + Math.random() * 900)}`,
      name: '',
      category: 'THERAPEUTIC',
      description: '',
      objective: '',
      scientificReference: '',
      author: currentUserName,
      version: '1.0',
      status: 'DRAFT',
      elements: [],
      versionHistory: [],
      logs: [],
      therapeuticSettings: { standardDosages: '', treatmentDuration: '', contraindications: '', precautions: '' },
      hospitalizationSettings: { treatments: '', administrationSchedule: '', monitoringParams: [], monitoringFrequency: '', dischargeCriteria: '' },
      pathwaySteps: []
    };
    setEditingProtocol(newProto);
  };

  // Start Edit
  const handleStartEdit = (proto: Protocol) => {
    setEditingProtocol({ ...proto });
    setViewingProtocol(null);
  };

  // Delete Protocol
  const handleDeleteProtocol = (id: string) => {
    if (confirm('Voulez-vous vraiment supprimer définitivement ce protocole ?')) {
      const updated = protocols.filter(p => p.id !== id);
      setProtocols(updated);
      setViewingProtocol(null);
      showMessage('success', 'Protocole supprimé définitivement');
    }
  };

  // Add subelement to composition list
  const handleAddSubElement = () => {
    if (!newElementName.trim()) return;

    const newEl: ProtocolElement = {
      id: selectedRefId || `custom_${Date.now()}`,
      type: newElementType,
      name: newElementName.trim(),
      quantity: newElementQty ? parseFloat(newElementQty) : undefined,
      frequency: newElementFreq || undefined,
      duration: newElementDur || undefined,
      priority: newElementPrio,
      isRequired: newElementReq
    };

    const currentElements = editingProtocol?.elements ? [...editingProtocol.elements] : [];
    
    setEditingProtocol({
      ...editingProtocol,
      elements: [...currentElements, newEl]
    });

    // Reset element states
    setNewElementName('');
    setSelectedRefId('');
    setNewElementQty('');
    setNewElementFreq('');
    setNewElementDur('');
    setNewElementPrio('MEDIUM');
    setNewElementReq(true);
  };

  // Remove element from composition
  const handleRemoveSubElement = (idx: number) => {
    if (!editingProtocol?.elements) return;
    const updated = editingProtocol.elements.filter((_, i) => i !== idx);
    setEditingProtocol({
      ...editingProtocol,
      elements: updated
    });
  };

  // Save full protocol
  const handleSaveProtocol = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProtocol?.name || !editingProtocol.code) {
      showMessage('error', 'Le nom et le code du protocole sont obligatoires.');
      return;
    }

    const isExisting = protocols.some(p => p.id === editingProtocol.id);
    const nowStr = new Date().toISOString();

    let finalProtocolToSave = { ...editingProtocol } as Protocol;
    
    if (isExisting) {
      // Add Modification log
      const log = createLog('modification', 'Modifications cliniques et organisationnelles');
      finalProtocolToSave.lastUpdated = nowStr;
      finalProtocolToSave.logs = [log, ...(finalProtocolToSave.logs || [])];

      const updated = protocols.map(p => p.id === editingProtocol.id ? finalProtocolToSave : p);
      setProtocols(updated);
      showMessage('success', 'Protocole mis à jour avec succès');
    } else {
      // Add Creation log
      const log = createLog('creation', 'Protocole standardisé initialisé');
      finalProtocolToSave.createdAt = nowStr;
      finalProtocolToSave.lastUpdated = nowStr;
      finalProtocolToSave.useCount = 0;
      finalProtocolToSave.logs = [log];
      finalProtocolToSave.userServices = [];

      setProtocols([finalProtocolToSave, ...protocols]);
      showMessage('success', 'Nouveau protocole ajouté au catalogue');
    }

    setEditingProtocol(null);
  };

  // Fast Fill fields from selecting referentials
  const handleRefSelectionChange = (refId: string) => {
    setSelectedRefId(refId);
    if (!refId) return;

    if (newElementType === 'MEDICATION') {
      const med = medsReferential.find(m => m.id === refId);
      if (med) {
        setNewElementName(`${med.name} ${med.dosage || ''}`);
        setNewElementDur('5 jours');
        setNewElementFreq('3 fois par jour');
      }
    } else if (newElementType === 'CONSUMABLE') {
      const cons = consumablesReferential.find(c => c.id === refId);
      if (cons) {
        setNewElementName(cons.nom || cons.name);
        setNewElementQty('1');
      }
    } else if (newElementType === 'ACT' || newElementType === 'EXAM') {
      const act = actsReferential.find(a => a.id === refId);
      if (act) {
        setNewElementName(act.name);
      }
    }
  };

  // Add step to pathway
  const handleAddPathwayStep = () => {
    if (!stepName.trim()) return;

    const currentSteps = editingProtocol?.pathwaySteps ? [...editingProtocol.pathwaySteps] : [];
    const nextStepNum = currentSteps.length + 1;

    const newStep = {
      id: `step_${Date.now()}`,
      stepNumber: nextStepNum,
      name: stepName.trim(),
      linkedProtocolId: stepProtocolId || undefined
    };

    setEditingProtocol({
      ...editingProtocol,
      pathwaySteps: [...currentSteps, newStep]
    });

    setStepName('');
    setStepProtocolId('');
  };

  // Remove pathway step
  const handleRemovePathwayStep = (idx: number) => {
    if (!editingProtocol?.pathwaySteps) return;
    const updated = editingProtocol.pathwaySteps
      .filter((_, i) => i !== idx)
      .map((step, i) => ({ ...step, stepNumber: i + 1 })); // recalculate step numbers

    setEditingProtocol({
      ...editingProtocol,
      pathwaySteps: updated
    });
  };

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      {/* Header and Sub tabs */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-100 pb-6">
        <div>
          <h2 className="text-3xl font-black text-slate-800 tracking-tight flex items-center gap-3 italic">
            <BookOpen className="text-rose-600 scale-110" /> Catalogue des Protocoles & Packs
          </h2>
          <p className="text-xs text-slate-500 font-bold mt-1">
            Uniformisation clinique, bilans préopératoires, d'urgence, CPN standards et parcours d'accompagnement.
          </p>
        </div>

        <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-2xl">
          <button
            onClick={() => { setActiveSubTab('catalog'); setEditingProtocol(null); setViewingProtocol(null); }}
            className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
              activeSubTab === 'catalog' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Le Catalogue
          </button>
          <button
            onClick={() => { setActiveSubTab('stats'); setEditingProtocol(null); setViewingProtocol(null); }}
            className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
              activeSubTab === 'stats' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Statistiques & Utilisations
          </button>
          <button
            onClick={handleStartCreate}
            className="px-4 py-2 bg-rose-600 text-white rounded-xl text-xs font-black uppercase tracking-wider hover:bg-rose-700 transition-all flex items-center gap-2 shadow-lg shadow-rose-900/10"
          >
            <Plus size={14} /> Nouveau Protocole
          </button>
        </div>
      </div>

      {activeSubTab === 'catalog' && !editingProtocol && !viewingProtocol && (
        <div className="space-y-8 animate-in fade-in duration-300">
          
          {/* Statistical Dashboard KPIs row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-slate-50 border border-slate-100 p-5 rounded-3xl relative overflow-hidden group">
              <div className="absolute right-0 bottom-0 pr-6 pb-2 text-slate-200/50 group-hover:scale-110 transition-transform"><BookOpen size={70} /></div>
              <p className="text-[10px] uppercase font-black text-slate-400 tracking-wider">Protocoles Totaux</p>
              <h3 className="text-3xl font-black text-slate-900 mt-2">{totalCount}</h3>
              <p className="text-[10px] text-slate-500 font-bold mt-1">Configurés et prêts</p>
            </div>
            
            <div className="bg-emerald-55/10 border border-emerald-100 p-5 rounded-3xl relative overflow-hidden group">
              <div className="absolute right-0 bottom-0 pr-6 pb-2 text-emerald-250/20 group-hover:scale-110 transition-transform"><Check size={70} className="text-emerald-300 opacity-20" /></div>
              <p className="text-[10px] uppercase font-black text-emerald-600 tracking-wider">Actifs / Réutilisables</p>
              <h3 className="text-3xl font-black text-emerald-700 mt-2">{activeCount}</h3>
              <p className="text-[10px] text-emerald-500 font-bold mt-1">Disponibles en consultation</p>
            </div>

            <div className="bg-amber-55/10 border border-amber-100 p-5 rounded-3xl relative overflow-hidden group">
              <div className="absolute right-0 bottom-0 pr-6 pb-2 text-amber-250/20 group-hover:scale-110 transition-transform"><Sliders size={70} className="text-amber-300 opacity-20" /></div>
              <p className="text-[10px] uppercase font-black text-amber-600 tracking-wider">Brouillons / Validation</p>
              <h3 className="text-3xl font-black text-amber-700 mt-2">{protocols.filter(p => p.status === 'DRAFT' || p.status === 'PEND').length + protocols.filter(p => p.status === 'PENDING').length}</h3>
              <p className="text-[10px] text-amber-500 font-bold mt-1">En cours de rédaction</p>
            </div>

            <div className="bg-rose-55/10 border border-rose-100 p-5 rounded-3xl relative overflow-hidden group">
              <div className="absolute right-0 bottom-0 pr-6 pb-2 text-rose-250/20 group-hover:scale-110 transition-transform"><TrendingUp size={70} className="text-rose-300 opacity-20" /></div>
              <p className="text-[10px] uppercase font-black text-rose-600 tracking-wider">Total Utilisations</p>
              <h3 className="text-3xl font-black text-rose-700 mt-2">{protocols.reduce((sum, p) => sum + p.useCount, 0)}</h3>
              <p className="text-[10px] text-rose-500 font-bold mt-1">Prescriptions accélérées</p>
            </div>
          </div>

          {/* Search filters toolbar */}
          <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-4">
            <div className="flex flex-col md:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  type="text"
                  placeholder="Rechercher par nom, code, mot-clés ou niveau d'évidence scientifique..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 rounded-2xl border border-slate-200 outline-none text-sm font-medium focus:ring-2 focus:ring-rose-200"
                />
              </div>
              
              <div className="grid grid-cols-2 md:flex gap-2">
                <div className="relative">
                  <select
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    className="w-full md:w-48 pl-3 pr-8 py-3 rounded-2xl border border-slate-200 outline-none text-xs font-black uppercase text-slate-600 appearance-none bg-slate-50 hover:bg-white transition-colors"
                  >
                    <option value="ALL">Toutes Catégories</option>
                    {Object.keys(CATEGORY_LABELS).map(cat => (
                      <option key={cat} value={cat}>{CATEGORY_LABELS[cat as ProtocolCategory]}</option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400" />
                </div>

                <div className="relative">
                  <select
                    value={selectedStatus}
                    onChange={(e) => setSelectedStatus(e.target.value)}
                    className="w-full md:w-36 pl-3 pr-8 py-3 rounded-2xl border border-slate-200 outline-none text-xs font-black uppercase text-slate-600 appearance-none bg-slate-50 hover:bg-white transition-colors"
                  >
                    <option value="ALL">Tou(te)s Statuts</option>
                    <option value="DRAFT">Brouillon</option>
                    <option value="PENDING">En Validation</option>
                    <option value="ACTIVE">Actif</option>
                    <option value="ARCHIVED">Archivé</option>
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400" />
                </div>

                <div className="relative col-span-2">
                  <select
                    value={selectedAuthor}
                    onChange={(e) => setSelectedAuthor(e.target.value)}
                    className="w-full md:w-40 pl-3 pr-8 py-3 rounded-2xl border border-slate-200 outline-none text-xs font-black uppercase text-slate-600 appearance-none bg-slate-50 hover:bg-white transition-colors"
                  >
                    <option value="ALL">Tous les Auteurs</option>
                    {authors.map(aut => (
                      <option key={aut} value={aut}>{aut}</option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400" />
                </div>
              </div>
            </div>
          </div>

          {/* Catalog grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredProtocols.length === 0 ? (
              <div className="col-span-full bg-slate-50 border border-dashed border-slate-200 py-16 text-center rounded-[32px]">
                <p className="text-sm font-semibold text-slate-400 italic">Aucun protocole médical ne correspond à vos filtres de recherche.</p>
                <button
                  onClick={() => { setSearchQuery(''); setSelectedCategory('ALL'); setSelectedStatus('ALL'); setSelectedAuthor('ALL'); }}
                  className="mt-4 px-4 py-2 bg-slate-200 text-slate-700 text-xs font-black rounded-xl uppercase tracking-wider"
                >
                  Réinitialiser les filtres
                </button>
              </div>
            ) : (
              filteredProtocols.map(p => (
                <div 
                  key={p.id}
                  className="bg-white rounded-[32px] border border-slate-100 shadow-sm hover:shadow-md transition-all duration-300 p-6 flex flex-col justify-between group relative overflow-hidden"
                >
                  <div>
                    {/* Badge row */}
                    <div className="flex justify-between items-start mb-4">
                      <span className={`px-3 py-1 rounded-xl text-[9px] font-black uppercase border ${CATEGORY_COLORS[p.category]}`}>
                        {CATEGORY_LABELS[p.category]}
                      </span>
                      <span className={`px-2.5 py-0.5 rounded-lg text-[9px] font-black uppercase border ${STATUS_COLORS[p.status]}`}>
                        {STATUS_LABELS[p.status]}
                      </span>
                    </div>

                    <h3 className="text-base font-black text-slate-800 tracking-tight leading-snug group-hover:text-rose-600 transition-colors">
                      {p.name}
                    </h3>
                    <p className="text-[10px] text-slate-400 font-mono mt-1 flex items-center gap-2">
                      <span>Code: <strong className="text-slate-600 font-bold">{p.code}</strong></span>
                      <span>•</span>
                      <span>v{p.version}</span>
                    </p>

                    <p className="text-xs text-slate-500 font-medium line-clamp-3 mt-3">
                      {p.description}
                    </p>

                    {/* Quick stats banner */}
                    <div className="grid grid-cols-3 gap-2 bg-slate-50 p-3 rounded-2xl border border-slate-100 mt-5">
                      <div className="text-center">
                        <span className="text-[8px] font-bold text-slate-400 uppercase block">Éléments</span>
                        <strong className="text-xs text-slate-800 font-black">{p.elements?.length || 0}</strong>
                      </div>
                      <div className="text-center border-x border-slate-200">
                        <span className="text-[8px] font-bold text-slate-400 uppercase block">Utilisations</span>
                        <strong className="text-xs font-black text-rose-600">{p.useCount}</strong>
                      </div>
                      <div className="text-center">
                        <span className="text-[8px] font-bold text-slate-400 uppercase block">Étapes</span>
                        <strong className="text-xs text-slate-800 font-black">
                          {p.category === 'CARE_PATHWAY' ? p.pathwaySteps?.length || 0 : '-'}
                        </strong>
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-slate-50 mt-6 pt-4 flex gap-2 justify-end items-center">
                    <button
                      onClick={() => setViewingProtocol(p)}
                      className="p-2 bg-slate-50 hover:bg-slate-100 rounded-xl text-slate-500 hover:text-slate-900 transition-colors"
                      title="Inspecter en détail"
                    >
                      <Eye size={15} />
                    </button>
                    <button
                      onClick={() => handleStartEdit(p)}
                      className="p-2 bg-slate-50 hover:bg-slate-100 rounded-xl text-slate-500 hover:text-blue-600 transition-colors"
                      title="Modifier clinicien"
                    >
                      <Edit2 size={15} />
                    </button>
                    <button
                      onClick={() => handleDuplicate(p, false)}
                      className="p-2 bg-slate-50 hover:bg-slate-100 rounded-xl text-slate-500 hover:text-purple-600 transition-colors"
                      title="Dupliquer"
                    >
                      <Copy size={15} />
                    </button>
                    <button
                      onClick={() => handleArchive(p.id)}
                      className={`p-2 rounded-xl border transition-colors ${
                        p.status === 'ARCHIVED' 
                          ? 'bg-rose-50 border-rose-100 text-rose-600 hover:bg-rose-100' 
                          : 'bg-slate-50 border-slate-100 text-slate-500 hover:text-rose-600'
                      }`}
                      title={p.status === 'ARCHIVED' ? 'Restaurer' : 'Archiver'}
                    >
                      <Archive size={15} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* VIEWING PROTOCOL SCREEN */}
      {viewingProtocol && (
        <div className="bg-white rounded-[40px] border border-slate-200 p-8 md:p-10 shadow-sm space-y-8 animate-in zoom-in-95 duration-200">
          <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 border-b border-slate-100 pb-6">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-rose-50 text-rose-600 rounded-2xl">
                <BookOpen size={28} />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`px-2.5 py-0.5 rounded-lg text-[9px] font-black uppercase border ${CATEGORY_COLORS[viewingProtocol.category]}`}>
                    {CATEGORY_LABELS[viewingProtocol.category]}
                  </span>
                  <span className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase border ${STATUS_COLORS[viewingProtocol.status]}`}>
                    {STATUS_LABELS[viewingProtocol.status]}
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">v{viewingProtocol.version}</span>
                </div>
                <h3 className="text-2xl font-black text-slate-900 mt-1 italic">{viewingProtocol.name}</h3>
                <p className="text-[11px] text-slate-400 font-mono mt-0.5">Code unique d'ordonnancement: {viewingProtocol.code}</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => { setViewingProtocol(null); }}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 rounded-xl text-xs font-black uppercase tracking-wider text-slate-600 transition-all"
              >
                Retour au catalogue
              </button>
              <button
                onClick={() => handleStartEdit(viewingProtocol)}
                className="px-4 py-2.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5"
              >
                <Edit2 size={13} /> Éditer
              </button>
              <button
                onClick={() => handleDuplicate(viewingProtocol, true)}
                className="px-4 py-2.5 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5"
                title="Génère une nouvelle version incrémentale vX.X"
              >
                <RefreshCw size={13} /> Nouvelle Version
              </button>
              <button
                onClick={() => handleDeleteProtocol(viewingProtocol.id)}
                className="px-4 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5"
              >
                <Trash2 size={13} /> Supprimer
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Main Info */}
            <div className="lg:col-span-8 space-y-6">
              <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100 space-y-4">
                <h4 className="text-sm font-black text-slate-800 uppercase tracking-wider flex items-center gap-2"><Info size={16} className="text-indigo-500" /> Description & Intention Clinique</h4>
                <div className="space-y-3">
                  <div>
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Présentation générale</label>
                    <p className="text-sm font-medium text-slate-700 mt-1">{viewingProtocol.description}</p>
                  </div>
                  <div className="border-t border-slate-200 pt-3">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Objectif principal</label>
                    <p className="text-sm font-medium text-slate-700 mt-1">{viewingProtocol.objective}</p>
                  </div>
                  {viewingProtocol.scientificReference && (
                    <div className="border-t border-slate-200 pt-3">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Référence scientifique scientifique / Normes cliniques d'appui</label>
                      <p className="text-xs font-mono text-indigo-700 italic mt-1">{viewingProtocol.scientificReference}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* HOSPITALIZATION SPECIFICS */}
              {viewingProtocol.category === 'HOSPITALIZATION' && viewingProtocol.hospitalizationSettings && (
                <div className="p-6 bg-blue-50/50 border border-blue-100 rounded-3xl space-y-4">
                  <h4 className="text-sm font-black text-blue-900 uppercase tracking-wider flex items-center gap-2"><Sliders size={16} /> Spécificités d'Hospitalisation</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-medium text-slate-700">
                    <div className="p-4 bg-white rounded-2xl border border-blue-55/40">
                      <strong className="text-[10px] uppercase font-black text-blue-400 block mb-1">Traitements standards administrés</strong>
                      <p className="whitespace-pre-line">{viewingProtocol.hospitalizationSettings.treatments}</p>
                    </div>
                    <div className="p-4 bg-white rounded-2xl border border-blue-55/40">
                      <strong className="text-[10px] uppercase font-black text-blue-400 block mb-1">Horaires fixes d'administration conseillés</strong>
                      <p>{viewingProtocol.hospitalizationSettings.administrationSchedule}</p>
                    </div>
                    <div className="p-4 bg-white rounded-2xl border border-blue-55/40">
                      <strong className="text-[10px] uppercase font-black text-blue-400 block mb-1">Paramètres vitaux à surveiller obligatoirement</strong>
                      <div className="flex flex-wrap gap-2 mt-1">
                        {viewingProtocol.hospitalizationSettings.monitoringParams?.map((p, idx) => (
                          <span key={idx} className="px-2 py-0.5 bg-rose-50 text-rose-700 font-bold rounded-lg text-[9px] uppercase border border-rose-100">{p}</span>
                        )) || <span className="text-slate-400">Aucun spécifié</span>}
                      </div>
                    </div>
                    <div className="p-4 bg-white rounded-2xl border border-blue-55/40">
                      <strong className="text-[10px] uppercase font-black text-blue-400 block mb-1">Fréquence de surveillance requise</strong>
                      <p>{viewingProtocol.hospitalizationSettings.monitoringFrequency}</p>
                    </div>
                    <div className="col-span-full p-4 bg-emerald-55/5 rounded-2xl border border-emerald-100">
                      <strong className="text-[10px] uppercase font-black text-emerald-600 block mb-1">Critères cliniques obligatoires pour autoriser la sortie</strong>
                      <p className="text-emerald-900 font-semibold">{viewingProtocol.hospitalizationSettings.dischargeCriteria}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* THERAPEUTIC SPECIFICS */}
              {viewingProtocol.category === 'THERAPEUTIC' && viewingProtocol.therapeuticSettings && (
                <div className="p-6 bg-emerald-55/10 border border-emerald-100 rounded-3xl space-y-4">
                  <h4 className="text-sm font-black text-emerald-800 uppercase tracking-wider flex items-center gap-2"><Activity size={16} className="text-emerald-600" /> Posologies et Précautions Pharmaceutiques</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-medium text-slate-700">
                    <div className="p-4 bg-white rounded-2xl border border-emerald-50">
                      <strong className="text-[10px] uppercase font-black text-emerald-600 block mb-1">Posologies standards recommandées</strong>
                      <p>{viewingProtocol.therapeuticSettings.standardDosages}</p>
                    </div>
                    <div className="p-4 bg-white rounded-2xl border border-emerald-50">
                      <strong className="text-[10px] uppercase font-black text-emerald-600 block mb-1">Durée standard du traitement</strong>
                      <p>{viewingProtocol.therapeuticSettings.treatmentDuration}</p>
                    </div>
                    <div className="p-4 bg-rose-55/30 rounded-2xl border border-rose-105-30">
                      <strong className="text-[10px] uppercase font-black text-rose-600 block mb-1">Contre-indications absolues</strong>
                      <p className="text-rose-950 font-black">{viewingProtocol.therapeuticSettings.contraindications}</p>
                    </div>
                    <div className="p-4 bg-amber-55/30 rounded-2xl border border-amber-105-30">
                      <strong className="text-[10px] uppercase font-black text-amber-600 block mb-1">Précautions d'usage importantes</strong>
                      <p className="text-amber-950 font-bold">{viewingProtocol.therapeuticSettings.precautions}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* CARE PATHWAY STEPS */}
              {viewingProtocol.category === 'CARE_PATHWAY' && viewingProtocol.pathwaySteps && (
                <div className="p-6 bg-purple-50 border border-purple-150 rounded-3xl space-y-4">
                  <h4 className="text-sm font-black text-purple-900 uppercase tracking-wider flex items-center gap-2"><Layers size={16} /> Étapes séquentielles du Parcours</h4>
                  
                  <div className="space-y-3 relative before:absolute before:left-6 before:top-4 before:bottom-4 before:w-0.5 before:bg-purple-200">
                    {viewingProtocol.pathwaySteps.map((step) => {
                      const linked = protocols.find(p => p.id === step.linkedProtocolId);
                      return (
                        <div key={step.id} className="flex gap-4 relative z-10 bg-white p-4 rounded-2xl border border-slate-100 shadow-sm items-center hover:-translate-y-0.5 transition-all">
                          <div className="w-12 h-12 rounded-full bg-purple-600 text-white flex items-center justify-center font-black italic scale-90">
                            {step.stepNumber}
                          </div>
                          <div className="flex-1">
                            <h5 className="font-black text-slate-800 text-sm">{step.name}</h5>
                            {linked ? (
                              <p className="text-[10px] text-emerald-600 font-bold uppercase mt-0.5 flex items-center gap-1.5">
                                <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                Protocole lié: {linked.name} ({linked.code})
                              </p>
                            ) : (
                              <p className="text-[10px] text-slate-400 font-mono italic mt-0.5">Aucune prescription automatisée liée</p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Composition lists (Exams, meds, consumables) */}
              <div className="space-y-4">
                <h4 className="text-sm font-black text-slate-800 uppercase tracking-wider flex items-center gap-2"><Layers size={16} className="text-indigo-500" /> Éléments constitutifs du protocole</h4>
                
                {viewingProtocol.elements && viewingProtocol.elements.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {viewingProtocol.elements.map((el, idx) => (
                      <div key={idx} className="p-4 bg-white rounded-2xl border border-slate-100 shadow-sm flex items-start gap-3 relative group">
                        <div className={`p-2.5 rounded-xl text-white font-black text-xs ${
                          el.type === 'EXAM' ? 'bg-indigo-600' :
                          el.type === 'MEDICATION' ? 'bg-emerald-600' :
                          el.type === 'CONSUMABLE' ? 'bg-cyan-600' :
                          el.type === 'ACT' ? 'bg-blue-600' : 'bg-rose-600'
                        }`}>
                          {el.type.substring(0, 3)}
                        </div>

                        <div className="flex-1 space-y-1">
                          <div className="flex justify-between">
                            <span className="font-black text-slate-800 text-xs">{el.name}</span>
                            <span className={`px-1.5 py-0.5 text-[8px] font-black rounded-md ${
                              el.isRequired ? 'bg-rose-50 text-rose-600 border border-rose-100' : 'bg-slate-50 text-slate-500 border border-slate-100'
                            }`}>
                              {el.isRequired ? 'MAND' : 'OPT'}
                            </span>
                          </div>

                          <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[10px] text-slate-500 font-bold">
                            {el.quantity && <div>Qté: <strong className="text-slate-700 font-black">{el.quantity}</strong></div>}
                            {el.frequency && <div>Fréq: <strong className="text-slate-700 font-black">{el.frequency}</strong></div>}
                            {el.duration && <div>Durée: <strong className="text-slate-700 font-black">{el.duration}</strong></div>}
                            <div>Priorité: <span className={`font-black ${
                              el.priority === 'HIGH' ? 'text-rose-600' : el.priority === 'MEDIUM' ? 'text-amber-600' : 'text-slate-400'
                            }`}>{el.priority}</span></div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-6 bg-slate-55/10 rounded-2xl border border-slate-200 text-center text-sm font-semibold italic text-slate-400">
                    Aucun produit, acte, consommable ou examen formel n'est rattaché à ce protocole.
                  </div>
                )}
              </div>

              {viewingProtocol.clinicalGuidance && (
                <div className="p-6 bg-slate-900 text-white rounded-[32px] space-y-2 relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-4 opacity-5"><Sliders size={120} /></div>
                  <h4 className="text-xs font-black uppercase tracking-widest text-slate-300 flex items-center gap-2"><Award size={14} className="text-rose-500" /> Conseils et Recommandations cliniques aux Soignants</h4>
                  <p className="text-xs font-medium text-slate-200 leading-relaxed font-sans whitespace-pre-line relative z-10">
                    {viewingProtocol.clinicalGuidance}
                  </p>
                </div>
              )}
            </div>

            {/* Sidebar Meta Info and Traceability */}
            <div className="lg:col-span-4 space-y-6">
              
              <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100 space-y-4 text-xs">
                <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5"><Calendar size={14} className="text-rose-600" /> Propriétés du Protocole</h4>
                
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-slate-400 font-bold">Auteur scientifique</span>
                    <strong className="text-slate-800 font-black">{viewingProtocol.author}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400 font-bold">Niveau versioning</span>
                    <strong className="text-slate-800 font-bold">v{viewingProtocol.version}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400 font-bold">Créé le</span>
                    <strong className="text-slate-800 font-mono">{viewingProtocol.createdAt.split('T')[0]}</strong>
                  </div>
                  <div className="flex justify-between border-b border-slate-200 pb-3">
                    <span className="text-slate-400 font-bold">Dernière relecture</span>
                    <strong className="text-slate-800 font-mono">{viewingProtocol.lastUpdated.split('T')[0]}</strong>
                  </div>

                  <h5 className="font-black text-[10px] text-slate-400 uppercase tracking-widest pt-2">Historique des versions préservées</h5>
                  {viewingProtocol.versionHistory && viewingProtocol.versionHistory.length > 0 ? (
                    <div className="space-y-2 max-h-36 overflow-y-auto">
                      {viewingProtocol.versionHistory.map((hist, i) => (
                        <div key={i} className="bg-white p-2.5 rounded-xl border border-slate-100 block">
                          <div className="flex justify-between font-black text-[9px] text-slate-800 mb-0.5">
                            <span>v{hist.version}</span>
                            <span className="text-slate-450 text-[8px] font-mono">{hist.date}</span>
                          </div>
                          <p className="text-[10px] text-slate-500 font-medium leading-tight">{hist.changes}</p>
                          <span className="text-[8px] text-indigo-600 block mt-1 font-bold">Signataire: {hist.author}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[10px] text-slate-400 italic font-medium">Aucun historique de versioning archivé.</p>
                  )}
                </div>
              </div>

              {/* Statistics usage overview */}
              <div className="bg-slate-900 p-6 rounded-3xl text-white space-y-4 text-xs relative overflow-hidden shadow-xl">
                <div className="absolute right-0 bottom-0 p-4 text-white/5"><TrendingUp size={100} /></div>
                <h4 className="text-xs font-black uppercase tracking-wider flex items-center gap-1.5"><TrendingUp size={14} className="text-emerald-400" /> Statistiques de diffusion</h4>
                
                <div className="space-y-4">
                  <div>
                    <span className="text-slate-400 block font-bold">Nombre total d'utilisations</span>
                    <strong className="text-3xl font-black text-emerald-400 tracking-tight block mt-1">{viewingProtocol.useCount} fois</strong>
                  </div>

                  <div>
                    <span className="text-slate-400 block font-bold mb-2">Services utilisateurs pivots</span>
                    <div className="flex flex-wrap gap-1.5">
                      {viewingProtocol.userServices && viewingProtocol.userServices.length > 0 ? (
                        viewingProtocol.userServices.map((srv, idx) => (
                          <span key={idx} className="px-2 py-1 bg-white/10 rounded-lg text-[9px] font-black uppercase">{srv}</span>
                        ))
                      ) : (
                        <span className="text-slate-500 italic block">Aucune journalisation de service disponible</span>
                      )}
                    </div>
                  </div>

                  {viewingProtocol.lastUsedAt && (
                    <div className="border-t border-white/10 pt-3">
                      <span className="text-slate-400 block font-bold">Dernière sollicitation en soin</span>
                      <strong className="text-white block font-mono mt-0.5 font-bold">{viewingProtocol.lastUsedAt ? new Date(viewingProtocol.lastUsedAt).toLocaleString() : 'Jamais'}</strong>
                    </div>
                  )}
                </div>
              </div>

              {/* Audit trail / logs */}
              <div className="border border-slate-200 p-6 rounded-3xl space-y-3">
                <div className="flex justify-between items-center text-xs">
                  <h4 className="font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5"><UserCheck size={14} className="text-slate-500" /> Traçabilité & Logs</h4>
                  <button onClick={() => setShowLogs(!showLogs)} className="text-[10px] text-indigo-600 hover:underline font-bold uppercase">
                    {showLogs ? 'Masquer' : 'Afficher'}
                  </button>
                </div>

                {showLogs && (
                  <div className="space-y-2 max-h-48 overflow-y-auto text-[10px] font-medium text-slate-600">
                    {viewingProtocol.logs && viewingProtocol.logs.length > 0 ? (
                      viewingProtocol.logs.map((log, i) => (
                        <div key={i} className="p-2 bg-slate-50 rounded-xl border border-slate-100 flex flex-col gap-0.5">
                          <div className="flex justify-between font-bold text-slate-800 text-[10px]">
                            <span className="capitalize text-indigo-600">{log.action === 'creation'?'Création':log.action === 'modification'?'Modif.':log.action === 'activation'?'Activ.':'Archiv.'}</span>
                            <span className="text-slate-450 font-mono text-[9px]">{log.date} {log.time}</span>
                          </div>
                          {log.details && (
                            <p className="leading-tight text-slate-500 font-medium">
                              {typeof log.details === 'object' ? JSON.stringify(log.details) : String(log.details)}
                            </p>
                          )}
                          <span className="text-[8px] text-slate-400 font-bold block mt-0.5">Agent: {log.user}</span>
                        </div>
                      ))
                    ) : (
                      <p className="text-slate-400 italic">Aucun log enregistré dans la base de données.</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* FORMULAIRE DE CRÉATION ET MODIFICATION DE PROTOCOLE */}
      {editingProtocol && (
        <form onSubmit={handleSaveProtocol} className="bg-white rounded-[40px] border border-slate-200 p-8 md:p-10 shadow-sm space-y-8 animate-in slide-in-from-bottom-8 duration-300">
          <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 border-b border-slate-100 pb-6">
            <div>
              <h3 className="text-2xl font-black text-slate-900 tracking-tight italic flex items-center gap-2">
                <Settings size={24} className="text-rose-600" />
                {editingProtocol.id && protocols.some(p => p.id === editingProtocol.id) 
                  ? `Modifier l'algorithme : ${editingProtocol.name}` 
                  : 'Créer un nouveau Protocole Clinique / Pack'}
              </h3>
              <p className="text-xs text-slate-500 font-bold mt-0.5">Veuillez renseigner les métadonnées et la composition prescriptive.</p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setEditingProtocol(null)}
                className="px-6 py-3 bg-slate-100 hover:bg-slate-200 rounded-xl text-xs font-black uppercase text-slate-650 tracking-wider transition-all"
              >
                Annuler
              </button>
              <button
                type="submit"
                className="px-6 py-3 bg-rose-600 hover:bg-rose-700 text-white font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-lg"
              >
                Enregistrer le Protocole
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-8 text-xs font-medium">
            
            {/* Colonne gauche : Informations Générales & Versions */}
            <div className="md:col-span-4 space-y-6">
              
              <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100 space-y-4">
                <h4 className="font-black text-slate-800 uppercase tracking-wider block">Informations Générales</h4>
                
                <div className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block">Nom du protocole *</label>
                    <input
                      required
                      type="text"
                      value={editingProtocol.name || ''}
                      onChange={e => setEditingProtocol({...editingProtocol, name: e.target.value})}
                      placeholder="Ex: Paludisme simple de l'adulte"
                      className="w-full px-4 py-3 rounded-2xl border border-slate-200 font-bold outline-none ring-offset-2 focus:ring-2 focus:ring-rose-200"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block">Code d'appel *</label>
                      <input
                        required
                        type="text"
                        value={editingProtocol.code || ''}
                        onChange={e => setEditingProtocol({...editingProtocol, code: e.target.value})}
                        placeholder="Ex: TX-PALUD-S"
                        className="w-full px-4 py-3 rounded-2xl border border-slate-200 font-semibold outline-none focus:ring-2 focus:ring-rose-200"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block">Numéro de version *</label>
                      <input
                        required
                        type="text"
                        value={editingProtocol.version || '1.0'}
                        onChange={e => setEditingProtocol({...editingProtocol, version: e.target.value})}
                        placeholder="Ex: 1.0"
                        className="w-full px-4 py-3 rounded-2xl border border-slate-200 font-semibold outline-none focus:ring-2 focus:ring-rose-200"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block">Catégorie du protocole *</label>
                    <select
                      value={editingProtocol.category}
                      onChange={e => setEditingProtocol({...editingProtocol, category: e.target.value as ProtocolCategory})}
                      className="w-full px-4 py-3 rounded-2xl border border-slate-200 font-bold text-slate-700 outline-none focus:ring-2 focus:ring-rose-200"
                    >
                      {Object.keys(CATEGORY_LABELS).map(cat => (
                        <option key={cat} value={cat}>{CATEGORY_LABELS[cat as ProtocolCategory]}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block">Statut d'édition *</label>
                    <select
                      value={editingProtocol.status}
                      onChange={e => setEditingProtocol({...editingProtocol, status: e.target.value as any})}
                      className="w-full px-4 py-3 rounded-2xl border border-slate-200 font-bold text-slate-700 outline-none focus:ring-2 focus:ring-rose-200"
                    >
                      <option value="DRAFT">Brouillon (Draft)</option>
                      <option value="PENDING">En cours de validation scientifique (Pending)</option>
                      <option value="ACTIVE">Actif & Validé (Active)</option>
                      <option value="ARCHIVED">Archivé (Archived)</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block">Auteur / Signataire scientifique *</label>
                    <input
                      required
                      type="text"
                      value={editingProtocol.author || currentUserName}
                      onChange={e => setEditingProtocol({...editingProtocol, author: e.target.value})}
                      placeholder="Ex: Collège des Gynécologues"
                      className="w-full px-4 py-3 rounded-2xl border border-slate-200 outline-none focus:ring-2 focus:ring-rose-200"
                    />
                  </div>
                </div>
              </div>

              <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100 space-y-4">
                <h4 className="font-black text-slate-800 uppercase tracking-wider block">Intention Clinique</h4>
                
                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block">Description / Indication clinique</label>
                    <textarea
                      value={editingProtocol.description || ''}
                      onChange={e => setEditingProtocol({...editingProtocol, description: e.target.value})}
                      placeholder="Décrire brièvement pour quelles indications types ce protocole doit être appliqué."
                      className="w-full px-4 py-3 rounded-2xl border border-slate-200 min-h-[90px] outline-none focus:ring-2 focus:ring-rose-200"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block">Objectif thérapeutique visé</label>
                    <textarea
                      value={editingProtocol.objective || ''}
                      onChange={e => setEditingProtocol({...editingProtocol, objective: e.target.value})}
                      placeholder="Ex: Éliminer la parasitémie fœtale, éviter l'OAP..."
                      className="w-full px-4 py-3 rounded-2xl border border-slate-200 min-h-[70px] outline-none focus:ring-2 focus:ring-rose-200"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block">Référence scientifique scientifique / Normes</label>
                    <input
                      type="text"
                      value={editingProtocol.scientificReference || ''}
                      onChange={e => setEditingProtocol({...editingProtocol, scientificReference: e.target.value})}
                      placeholder="Ex: Directives OMS 2024"
                      className="w-full px-4 py-3 rounded-2xl border border-slate-200 outline-none focus:ring-2 focus:ring-rose-200"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Colonne droite : Composition dynamique + Traitements Spécifiques */}
            <div className="md:col-span-8 space-y-6">
              
              {/* IF THERAPEUTIC */}
              {editingProtocol.category === 'THERAPEUTIC' && editingProtocol.therapeuticSettings && (
                <div className="p-6 bg-emerald-55/10 border border-emerald-150 rounded-[32px] space-y-4">
                  <h4 className="font-black text-emerald-800 uppercase tracking-wider flex items-center gap-1.5"><Activity size={16} /> Bloc Thérapeutique Spécifique</h4>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block">Posologies standards</label>
                      <textarea
                        value={editingProtocol.therapeuticSettings.standardDosages}
                        onChange={e => setEditingProtocol({
                          ...editingProtocol,
                          therapeuticSettings: { ...editingProtocol.therapeuticSettings!, standardDosages: e.target.value }
                        })}
                        placeholder="Ex: 4 comprimés à H0, H8..."
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white min-h-[60px] outline-none focus:ring-2 focus:ring-rose-200"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block">Durée standard du traitement</label>
                      <input
                        type="text"
                        value={editingProtocol.therapeuticSettings.treatmentDuration}
                        onChange={e => setEditingProtocol({
                          ...editingProtocol,
                          therapeuticSettings: { ...editingProtocol.therapeuticSettings!, treatmentDuration: e.target.value }
                        })}
                        placeholder="Ex: 3 jours d'accès"
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white outline-none focus:ring-2 focus:ring-rose-200"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block text-rose-600">Contre-indications importantes</label>
                      <textarea
                        value={editingProtocol.therapeuticSettings.contraindications}
                        onChange={e => setEditingProtocol({
                          ...editingProtocol,
                          therapeuticSettings: { ...editingProtocol.therapeuticSettings!, contraindications: e.target.value }
                        })}
                        placeholder="Ex: Grossesse T1, insuffisance rénale..."
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white min-h-[60px] outline-none focus:ring-2 focus:ring-rose-200 font-bold"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block">Précautions d'usage</label>
                      <textarea
                        value={editingProtocol.therapeuticSettings.precautions}
                        onChange={e => setEditingProtocol({
                          ...editingProtocol,
                          therapeuticSettings: { ...editingProtocol.therapeuticSettings!, precautions: e.target.value }
                        })}
                        placeholder="Ex: Prendre après un repas gras..."
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white min-h-[60px] outline-none focus:ring-2 focus:ring-rose-200"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* IF HOSPITALIZATION */}
              {editingProtocol.category === 'HOSPITALIZATION' && editingProtocol.hospitalizationSettings && (
                <div className="p-6 bg-blue-50 border border-blue-150 rounded-[32px] space-y-4">
                  <h4 className="font-black text-blue-900 uppercase tracking-wider flex items-center gap-1.5"><Sliders size={16} /> Configuration de l'Hospitalisation</h4>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1 md:col-span-2">
                      <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block">Traitements cliniques & perfusions</label>
                      <textarea
                        value={editingProtocol.hospitalizationSettings.treatments}
                        onChange={e => setEditingProtocol({
                          ...editingProtocol,
                          hospitalizationSettings: { ...editingProtocol.hospitalizationSettings!, treatments: e.target.value }
                        })}
                        placeholder="Ex: Artésunate IV 2.4 mg/kg..."
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white min-h-[60px]"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block">Horaires d'administration fixes recommandés</label>
                      <input
                        type="text"
                        value={editingProtocol.hospitalizationSettings.administrationSchedule}
                        onChange={e => setEditingProtocol({
                          ...editingProtocol,
                          hospitalizationSettings: { ...editingProtocol.hospitalizationSettings!, administrationSchedule: e.target.value }
                        })}
                        placeholder="Ex: 08:00 et 20:00"
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block">Fréquence de surveillance clinique</label>
                      <input
                        type="text"
                        value={editingProtocol.hospitalizationSettings.monitoringFrequency}
                        onChange={e => setEditingProtocol({
                          ...editingProtocol,
                          hospitalizationSettings: { ...editingProtocol.hospitalizationSettings!, monitoringFrequency: e.target.value }
                        })}
                        placeholder="Ex: Toutes les 2 heures premières 24h"
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white outline-none"
                      />
                    </div>
                    
                    <div className="md:col-span-2 space-y-1">
                      <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-1">Constantes indispensables à tracer</label>
                      <div className="grid grid-cols-3 gap-2">
                        {['Température', 'TA', 'FC', 'FR', 'Saturation', 'Douleur', 'Diurèse', 'Glycémie'].map((constante) => {
                          const isChecked = editingProtocol.hospitalizationSettings?.monitoringParams?.includes(constante) || false;
                          return (
                            <label key={constante} className="flex items-center gap-2 p-2 bg-white rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={(e) => {
                                  const list = editingProtocol.hospitalizationSettings?.monitoringParams || [];
                                  const nextList = e.target.checked 
                                    ? [...list, constante]
                                    : list.filter(item => item !== constante);
                                  setEditingProtocol({
                                    ...editingProtocol,
                                    hospitalizationSettings: { ...editingProtocol.hospitalizationSettings!, monitoringParams: nextList }
                                  });
                                }}
                                className="rounded text-rose-600 focus:ring-rose-500"
                              />
                              <span className="font-bold text-slate-700 text-[11px]">{constante}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>

                    <div className="space-y-1 md:col-span-2">
                      <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block text-emerald-600">Critères incontournables de sortie médicale</label>
                      <textarea
                        value={editingProtocol.hospitalizationSettings.dischargeCriteria}
                        onChange={e => setEditingProtocol({
                          ...editingProtocol,
                          hospitalizationSettings: { ...editingProtocol.hospitalizationSettings!, dischargeCriteria: e.target.value }
                        })}
                        placeholder="Ex: Apyrexie durable, parasitémie de contrôleGG négative, relais par bouche toléré..."
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white font-semibold outline-none focus:ring-2 focus:ring-emerald-250"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* IF CARE PATHWAY STEPS BUILDER */}
              {editingProtocol.category === 'CARE_PATHWAY' && (
                <div className="p-6 bg-purple-55/10 border border-purple-150 rounded-[32px] space-y-4 animate-in fade-in">
                  <h4 className="font-black text-purple-900 uppercase tracking-wider flex items-center gap-1.5"><Layers size={16} /> Séquenceur d'Étapes intégrées au Parcours</h4>
                  
                  {/* Current Steps lists */}
                  {editingProtocol.pathwaySteps && editingProtocol.pathwaySteps.length > 0 ? (
                    <div className="space-y-2 max-h-52 overflow-y-auto pr-2">
                      {editingProtocol.pathwaySteps.map((step, idx) => {
                        const lProto = protocols.find(p => p.id === step.linkedProtocolId);
                        return (
                          <div key={idx} className="flex justify-between items-center bg-white p-3 border border-slate-150 rounded-xl">
                            <div className="flex items-center gap-3">
                              <span className="w-6 h-6 rounded-full bg-purple-600 text-white flex items-center justify-center font-black text-[10px]">{step.stepNumber}</span>
                              <div>
                                <strong className="text-slate-800 font-bold block">{step.name}</strong>
                                {lProto && <span className="text-[9px] text-emerald-600 font-semibold">Génère automatiquement : {lProto.name}</span>}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRemovePathwayStep(idx)}
                              className="p-1 text-slate-400 hover:text-rose-600 transition-colors"
                            >
                              <X size={16} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-[11px] text-slate-400 italic">Aucune étape insérée. Construisez le parcours étape par étape.</p>
                  )}

                  {/* Add Step sub-form */}
                  <div className="bg-white p-4 rounded-2xl border border-slate-150 flex flex-col md:flex-row gap-3 items-end">
                    <div className="flex-1 space-y-1">
                      <label className="text-[9px] font-black uppercase text-slate-400 block">Intitulé de l'étape *</label>
                      <input
                        type="text"
                        value={stepName}
                        onChange={e => setStepName(e.target.value)}
                        placeholder="Ex: Étape 1 : Séance CPN 1"
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 outline-none text-[11px]"
                      />
                    </div>
                    <div className="flex-1 space-y-1">
                      <label className="text-[9px] font-black uppercase text-slate-400 block">Associer une prescription automatisée</label>
                      <select
                        value={stepProtocolId}
                        onChange={e => setStepProtocolId(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 outline-none text-[11px] font-bold text-slate-700 bg-white"
                      >
                        <option value="">(Facultatif - aucun protocole lié)</option>
                        {protocols.filter(p => p.id !== editingProtocol.id).map(p => (
                          <option key={p.id} value={p.id}>{p.name} [{p.code}]</option>
                        ))}
                      </select>
                    </div>
                    <button
                      type="button"
                      onClick={handleAddPathwayStep}
                      className="px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-[10px] font-black uppercase tracking-wider transition-all"
                    >
                      Ajouter l'étape
                    </button>
                  </div>
                </div>
              )}

              {/* Composition section : Add Clinical acts, meds, consumables, exams inside catalog */}
              <div className="p-6 border border-slate-200 rounded-[32px] space-y-6">
                <h4 className="font-black text-slate-800 uppercase tracking-wider block">Composition de l'Ordonnance ou du Pack</h4>
                
                {/* List elements currently added */}
                {editingProtocol.elements && editingProtocol.elements.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-60 overflow-y-auto pr-3">
                    {editingProtocol.elements.map((el, idx) => (
                      <div key={idx} className="bg-slate-50 p-3.5 rounded-2xl border border-slate-150 flex items-start justify-between">
                        <div className="flex gap-2.5 items-start">
                          <span className={`px-2 py-0.5 rounded-lg text-white text-[8px] font-black ${
                            el.type === 'EXAM' ? 'bg-indigo-600' :
                            el.type === 'MEDICATION' ? 'bg-emerald-600' :
                            el.type === 'CONSUMABLE' ? 'bg-cyan-600' : 'bg-blue-600'
                          }`}>
                            {el.type}
                          </span>
                          <div>
                            <span className="font-bold text-slate-800 text-xs block">{el.name}</span>
                            <div className="flex flex-wrap gap-[6px] text-[9px] text-slate-400 font-bold mt-1">
                              {el.quantity && <span>Qté: {el.quantity}</span>}
                              {el.frequency && <span>Fréq: {el.frequency}</span>}
                              {el.duration && <span>Durée: {el.duration}</span>}
                              <span className="text-rose-500 font-black">{el.priority}</span>
                              <span className={el.isRequired ? 'text-red-600' : 'text-slate-400'}>
                                {el.isRequired ? 'Requis' : 'Optionnel'}
                              </span>
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveSubElement(idx)}
                          className="p-1 hover:bg-slate-200 text-slate-400 hover:text-rose-600 rounded-lg transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-400 italic">Aucun élément prescrit dans ce protocole pour le moment.</p>
                )}

                {/* Sub Element Form Builder */}
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <label className="text-[9px] font-black uppercase text-slate-400 block">Type de ressource</label>
                      <select
                        value={newElementType}
                        onChange={e => {
                          setNewElementType(e.target.value as any);
                          setNewElementName('');
                          setSelectedRefId('');
                        }}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white scale-95"
                      >
                        <option value="EXAM">Examen Biologique / Radiologie</option>
                        <option value="MEDICATION">Médicament (Ref Pharmacie)</option>
                        <option value="CONSUMABLE">Consommable de soin</option>
                        <option value="ACT">Acte médical, infirmier ou chirurgical</option>
                        <option value="VITAL">Paramètre de surveillance clinique</option>
                      </select>
                    </div>

                    <div className="space-y-1 md:col-span-2">
                      <label className="text-[9px] font-black uppercase text-slate-400 block">Recherche Referentiel ou Saisie manuelle</label>
                      
                      {newElementType === 'MEDICATION' && medsReferential.length > 0 ? (
                        <select
                          value={selectedRefId}
                          onChange={e => handleRefSelectionChange(e.target.value)}
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-bold"
                        >
                          <option value="">-- Sélectionner Médicament --</option>
                          {medsReferential.map(m => (
                            <option key={m.id} value={m.id}>{m.name} • {m.dosage} ({m.stock} en stock)</option>
                          ))}
                        </select>
                      ) : newElementType === 'CONSUMABLE' && consumablesReferential.length > 0 ? (
                        <select
                          value={selectedRefId}
                          onChange={e => handleRefSelectionChange(e.target.value)}
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-bold"
                        >
                          <option value="">-- Sélectionner un Consommable --</option>
                          {consumablesReferential.map(c => (
                            <option key={c.id} value={c.id}>{c.nom || c.name} ({c.categorie})</option>
                          ))}
                        </select>
                      ) : (newElementType === 'ACT' || newElementType === 'EXAM') && actsReferential.length > 0 ? (
                        <select
                          value={selectedRefId}
                          onChange={e => handleRefSelectionChange(e.target.value)}
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-bold"
                        >
                          <option value="">-- Sélectionner un Acte Référentiel --</option>
                          {actsReferential.map(a => (
                            <option key={a.id} value={a.id}>{a.name} [{a.category}] ({a.price} CFA)</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="text"
                          value={newElementName}
                          onChange={e => setNewElementName(e.target.value)}
                          placeholder="Nom personnalisé de l'élément clinicien..."
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-bold outline-none"
                        />
                      )}
                    </div>
                  </div>

                  {/* Custom Saisie manuelle if referential dropdown was used but we want to customize details */}
                  {selectedRefId && (
                    <div className="space-y-1">
                      <label className="text-[9px] font-black uppercase text-slate-400 block">Vérification / Libellé de prescription personnalisé</label>
                      <input
                        type="text"
                        value={newElementName}
                        onChange={e => setNewElementName(e.target.value)}
                        placeholder="Libellé à insérer dans l'ordonnance"
                        className="w-full px-3 py-1.5 rounded-xl border border-slate-250 bg-white font-black text-slate-800"
                      />
                    </div>
                  )}

                  {/* Quantity, Frequency, Duration inside configurations */}
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3 pt-2">
                    <div className="space-y-1">
                      <label className="text-[9px] font-black uppercase text-slate-400 block">Quantité</label>
                      <input
                        type="number"
                        min="0.1"
                        step="0.1"
                        value={newElementQty}
                        onChange={e => setNewElementQty(e.target.value)}
                        placeholder="Ex: 1"
                        className="w-full px-3 py-1.5 rounded-xl border border-slate-200 bg-white"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] font-black uppercase text-slate-400 block">Fréquence</label>
                      <input
                        type="text"
                        value={newElementFreq}
                        onChange={e => setNewElementFreq(e.target.value)}
                        placeholder="Ex: 3 fois/jour"
                        className="w-full px-3 py-1.5 rounded-xl border border-slate-200 bg-white"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] font-black uppercase text-slate-400 block">Durée</label>
                      <input
                        type="text"
                        value={newElementDur}
                        onChange={e => setNewElementDur(e.target.value)}
                        placeholder="Ex: 5 jours"
                        className="w-full px-3 py-1.5 rounded-xl border border-slate-200 bg-white"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] font-black uppercase text-slate-400 block">Priorité</label>
                      <select
                        value={newElementPrio}
                        onChange={e => setNewElementPrio(e.target.value as any)}
                        className="w-full px-3 py-1.5 rounded-xl border border-slate-200 bg-white font-bold"
                      >
                        <option value="LOW">Basse</option>
                        <option value="MEDIUM">Moyenne</option>
                        <option value="HIGH">Élevée</option>
                      </select>
                    </div>
                    <div className="space-y-1 flex items-center gap-2 pt-4 col-span-2 md:col-span-1">
                      <input
                        type="checkbox"
                        id="mandToggle"
                        checked={newElementReq}
                        onChange={e => setNewElementReq(e.target.checked)}
                        className="rounded text-rose-600 focus:ring-rose-500 cursor-pointer"
                      />
                      <label htmlFor="mandToggle" className="text-[9px] font-black uppercase text-slate-500 cursor-pointer">Obligatoire</label>
                    </div>
                  </div>

                  <div className="flex justify-end pt-2">
                    <button
                      type="button"
                      onClick={handleAddSubElement}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-black hover:scale-105 active:scale-95 text-[10px] uppercase rounded-xl transition-all"
                    >
                      Ajouter l'élément
                    </button>
                  </div>
                </div>
              </div>

              {/* Clinical advice area */}
              <div className="p-6 border border-slate-200 rounded-[32px] space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block">Conseils structurés, posologies d'accompagnement & Recommandations</label>
                <textarea
                  value={editingProtocol.clinicalGuidance || ''}
                  onChange={e => setEditingProtocol({...editingProtocol, clinicalGuidance: e.target.value})}
                  placeholder="Inscrivez les étapes de soins, conseils diététiques, signaux d'alertes à donner aux patients..."
                  className="w-full px-4 py-3 rounded-2xl border border-slate-200 min-h-[120px] outline-none"
                />
              </div>
            </div>
          </div>
        </form>
      )}

      {/* SUB TAB STATS DISPLAY */}
      {activeSubTab === 'stats' && (
        <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm space-y-8 animate-in fade-in duration-300">
          <div className="flex justify-between items-center border-b border-slate-100 pb-4">
            <div>
              <h3 className="text-xl font-black text-slate-850 italic">Analyses de diffusion et taux de réutilisation médicale</h3>
              <p className="text-[10px] text-slate-400 font-bold">Quels départements font le plus appel à nos protocoles centralisés.</p>
            </div>
            <button
              onClick={() => {
                const updated = protocols.map(p => ({ ...p, useCount: Math.floor(Math.random() * 50) + 5 }));
                setProtocols(updated);
                showMessage('success', 'Statistiques de simulation régénérées');
              }}
              className="text-[10px] border border-slate-200 px-3 py-1.5 rounded-xl font-bold uppercase text-slate-600 hover:bg-slate-50 transition-colors flex items-center gap-1.5"
            >
              <RotateCcw size={12} /> Actualiser
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Top Protocols used list */}
            <div className="space-y-4">
              <h4 className="text-xs font-black text-slate-700 uppercase tracking-widest flex items-center gap-2"><Award size={14} className="text-amber-500 animate-pulse" /> Palmarès des protocoles les plus sollicités</h4>
              
              <div className="space-y-3">
                {[...protocols].sort((a, b) => b.useCount - a.useCount).slice(0, 6).map((p, idx) => (
                  <div key={p.id} className="p-4 bg-slate-50 border border-slate-100 rounded-2xl flex justify-between items-center hover:bg-slate-100/50 transition-all">
                    <div className="flex items-center gap-3">
                      <span className="w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center font-black text-xs italic">{idx+1}</span>
                      <div>
                        <strong className="text-xs font-black text-slate-800 block">{p.name}</strong>
                        <span className="text-[9px] font-mono text-slate-400">Code: {p.code} • {CATEGORY_LABELS[p.category]}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <strong className="text-xs font-black text-rose-600">{p.useCount} utilisations</strong>
                      <span className="text-[9px] block text-slate-450 font-semibold">{p.userServices?.join(', ') || 'Consultation'}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Service usage pie simulation or block layout */}
            <div className="space-y-6">
              <div className="p-6 bg-slate-900 text-white rounded-[32px] space-y-4 relative overflow-hidden">
                <div className="absolute right-0 top-0 p-4 opacity-5"><TrendingUp size={120} /></div>
                <h4 className="text-xs font-black uppercase tracking-widest text-slate-300">Répartition par département Pivot</h4>
                
                <div className="space-y-3 font-semibold text-xs text-white">
                  {[
                    { service: "Consultations Externes", rate: 45, color: "bg-emerald-500", count: 184 },
                    { service: "Maternité / Accouchements & CPN", rate: 30, color: "bg-pink-500", count: 122 },
                    { service: "Urgences & Déchocage", rate: 15, color: "bg-rose-500", count: 61 },
                    { service: "Hospitalisation & Bloc opératoire", rate: 10, color: "bg-blue-500", count: 40 }
                  ].map((srv, idx) => (
                    <div key={idx} className="space-y-1">
                      <div className="flex justify-between font-bold text-[11px]">
                        <span>{srv.service}</span>
                        <span>{srv.count} prescriptions ({srv.rate}%)</span>
                      </div>
                      <div className="w-full bg-white/10 h-2 rounded-full overflow-hidden">
                        <div className={`${srv.color} h-full rounded-full`} style={{ width: `${srv.rate}%` }}></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Categorization matrix layout */}
              <div className="p-6 border border-slate-200 rounded-[32px] space-y-4">
                <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest">Référentiel par sous-catégories cliniques</h4>
                
                <div className="grid grid-cols-2 gap-3 text-xs">
                  {Object.keys(CATEGORY_LABELS).map(cat => {
                    const count = countByCategory[cat] || 0;
                    return (
                      <div key={cat} className="p-3 bg-slate-50 border border-slate-100 rounded-xl flex justify-between items-center">
                        <span className="font-bold text-slate-600">{CATEGORY_LABELS[cat as ProtocolCategory]}</span>
                        <strong className="px-2 py-0.5 bg-slate-900 text-white text-[10px] font-black rounded-lg">{count}</strong>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProtocolsManagement;
