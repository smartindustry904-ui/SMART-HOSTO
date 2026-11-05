import React, { useState, useEffect } from 'react';
import { Tool, Role } from '../../types';
import { Settings, AlertTriangle, CheckCircle2, XCircle, Eye, EyeOff, ShieldAlert } from 'lucide-react';

interface ToolsManagementProps {
  showMessage: (type: 'success' | 'error', text: string) => void;
}

export const DEFAULT_TOOLS: Tool[] = [
  {
    id: 'tool_1',
    name: 'Assistant de calcul posologique',
    code: 'CALC_POSO',
    description: 'Aide le médecin à calculer correctement les doses médicamenteuses en fonction du patient et des présentations disponibles. Cet outil est un assistant de calcul thérapeutique et non un prescripteur autonome.',
    moduleParent: 'Consultation',
    status: 'ACTIVE',
    criticality: 'HIGH',
    visibility: 'HIDDEN',
    authorizedRoles: [Role.ADMIN, Role.DOCTOR],
    dependencies: ['Dossier Patient', 'Pharmacie'],
    impacts: ['Planificateur de soins'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'tool_5',
    name: 'Ordonnance médicale numérique (avec Calculateur de posologie)',
    code: 'ORD_NUM',
    description: 'Outil de prescription thérapeutique permettant de sélectionner des médicaments ou protocoles, calculer automatiquement les posologies, vérifier la sécurité, transmettre à la pharmacie et générer une ordonnance PDF.',
    moduleParent: 'Consultation',
    status: 'ACTIVE',
    criticality: 'CRITICAL',
    visibility: 'VISIBLE',
    authorizedRoles: [Role.ADMIN, Role.DOCTOR, Role.MATERNITY],
    dependencies: ['Dossier Patient', 'Pharmacie', 'Assistant de calcul posologique'],
    impacts: ['Pharmacie', 'Planificateur de soins', 'Dossier Patient'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'tool_2',
    name: 'Planificateur de soins',
    code: 'PLAN_SOINS',
    description: 'Transforme une prescription thérapeutique validée en un plan concret d\'administration et de surveillance dans le temps, destiné au module hospitalisation et à l\'équipe infirmière.',
    moduleParent: 'Hospitalisation',
    status: 'ACTIVE',
    criticality: 'CRITICAL',
    visibility: 'VISIBLE',
    authorizedRoles: [Role.ADMIN, Role.DOCTOR, Role.NURSE],
    dependencies: ['Hospitalisation', 'Dossier Patient', 'Assistant de calcul posologique', 'Pharmacie'],
    impacts: ['Tableau des lits', 'Dossier Patient'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'tool_3',
    name: 'Partogramme intelligent',
    code: 'PARTOGRAMME',
    description: 'Outil numérique permettant de surveiller l\'évolution du travail obstétrical en temps réel, de tracer automatiquement les courbes du partogramme à partir des observations cliniques saisies, de générer des alertes obstétricales et de produire un document PDF final archivable dans le dossier patient.',
    moduleParent: 'Maternité',
    status: 'ACTIVE',
    criticality: 'CRITICAL',
    visibility: 'VISIBLE',
    authorizedRoles: [Role.ADMIN, Role.MATERNITY, Role.DOCTOR],
    dependencies: ['Maternité'],
    impacts: ['Dossier Patient', 'Post-partum'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'tool_4',
    name: 'CPN intelligent (Suivi prénatal OMS-Afrique)',
    code: 'CPN_OMS',
    description: 'Outil permettant d\'assurer le suivi prénatal structuré selon les recommandations OMS avec un calendrier de consultations, une checklist clinique dynamique, le suivi des examens biologiques, des vaccinations et des traitements préventifs adaptés au contexte africain.',
    moduleParent: 'Maternité',
    status: 'ACTIVE',
    criticality: 'HIGH',
    visibility: 'VISIBLE',
    authorizedRoles: [Role.ADMIN, Role.MATERNITY, Role.DOCTOR],
    dependencies: ['Maternité', 'Laboratoire', 'Pharmacie'],
    impacts: ['Dossier Patient', 'Planificateur de soins'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    mode: 'SIMPLE' // Using mode for OMS standard vs OMS + protocole local
  },
  {
    id: 'tool_7',
    name: 'Bulletin d’examens numériques',
    code: 'BULLETIN_EXAMENS',
    description: 'Outil permettant de prescrire des examens de laboratoire en sélectionnant dynamiquement les prestations disponibles, avec génération automatique du bulletin, intégration au dossier patient, à la caisse et à la file d’attente du laboratoire.',
    moduleParent: 'Laboratoire',
    status: 'ACTIVE',
    criticality: 'HIGH',
    visibility: 'VISIBLE',
    authorizedRoles: [Role.ADMIN, Role.DOCTOR, Role.MATERNITY, Role.NURSE],
    dependencies: ['Actes & prestations', 'Dossier Patient', 'Caisse'],
    impacts: ['Laboratoire', 'Caisse'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
];

const ToolsManagement: React.FC<ToolsManagementProps> = ({ showMessage }) => {
  const [tools, setTools] = useState<Tool[]>(() => {
    const saved = localStorage.getItem('hospital_tools');
    if (saved) {
      let parsedTools = JSON.parse(saved);
      
      // Fix duplicate IDs and update names
      const seenIds = new Set();
      parsedTools = parsedTools.map((t: Tool) => {
        let updatedTool = { ...t };
        if (seenIds.has(updatedTool.id)) {
          updatedTool.id = `tool_${Math.random().toString(36).substr(2, 9)}`;
        }
        seenIds.add(updatedTool.id);
        
        // Update names to match DEFAULT_TOOLS
        const defaultTool = DEFAULT_TOOLS.find(dt => dt.code === updatedTool.code);
        if (defaultTool && updatedTool.name !== defaultTool.name) {
          updatedTool.name = defaultTool.name;
        }
        
        return updatedTool;
      });

      // Ensure the new tools are added if they're missing
      if (!parsedTools.find((t: Tool) => t.code === 'PARTOGRAMME')) {
        const newTool = DEFAULT_TOOLS.find(t => t.code === 'PARTOGRAMME');
        if (newTool) parsedTools = [...parsedTools, newTool];
      }
      if (!parsedTools.find((t: Tool) => t.code === 'CPN_OMS')) {
        const newTool = DEFAULT_TOOLS.find(t => t.code === 'CPN_OMS');
        if (newTool) parsedTools = [...parsedTools, newTool];
      }
      if (!parsedTools.find((t: Tool) => t.code === 'BULLETIN_EXAMENS')) {
        const newTool = DEFAULT_TOOLS.find(t => t.code === 'BULLETIN_EXAMENS');
        if (newTool) parsedTools = [...parsedTools, newTool];
      }
      if (!parsedTools.find((t: Tool) => t.code === 'ORD_NUM')) {
        const newTool = DEFAULT_TOOLS.find(t => t.code === 'ORD_NUM');
        if (newTool) parsedTools = [...parsedTools, newTool];
      }
      if (!parsedTools.find((t: Tool) => t.code === 'CALC_POSO')) {
        const newTool = DEFAULT_TOOLS.find(t => t.code === 'CALC_POSO');
        if (newTool) parsedTools = [...parsedTools, newTool];
      }
      if (!parsedTools.find((t: Tool) => t.code === 'PLAN_SOINS')) {
        const newTool = DEFAULT_TOOLS.find(t => t.code === 'PLAN_SOINS');
        if (newTool) parsedTools = [...parsedTools, newTool];
      }
      return parsedTools;
    }
    return DEFAULT_TOOLS;
  });

  const [selectedTool, setSelectedTool] = useState<Tool | null>(null);
  const [showWarning, setShowWarning] = useState<Tool | null>(null);

  useEffect(() => {
    localStorage.setItem('hospital_tools', JSON.stringify(tools));
  }, [tools]);

  const handleToggleStatus = (tool: Tool) => {
    if (tool.status === 'ACTIVE' && (tool.criticality === 'CRITICAL' || tool.criticality === 'HIGH')) {
      setShowWarning(tool);
    } else {
      updateToolStatus(tool.id, tool.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE');
    }
  };

  const updateToolStatus = (id: string, newStatus: 'ACTIVE' | 'INACTIVE') => {
    setTools(tools.map(t => t.id === id ? { ...t, status: newStatus, updatedAt: new Date().toISOString() } : t));
    showMessage('success', `Outil ${newStatus === 'ACTIVE' ? 'activé' : 'désactivé'} avec succès`);
    setShowWarning(null);
    if (selectedTool?.id === id) {
      setSelectedTool(prev => prev ? { ...prev, status: newStatus } : null);
    }
  };

  const handleToggleVisibility = (id: string) => {
    setTools(tools.map(t => {
      if (t.id === id) {
        const newVisibility = t.visibility === 'VISIBLE' ? 'HIDDEN' : 'VISIBLE';
        if (selectedTool?.id === id) setSelectedTool({ ...t, visibility: newVisibility });
        return { ...t, visibility: newVisibility, updatedAt: new Date().toISOString() };
      }
      return t;
    }));
    showMessage('success', 'Visibilité mise à jour');
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Gestion des Outils</h2>
          <p className="text-slate-500 mt-1">Configurez les outils métiers et leurs dépendances</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Tools List */}
        {tools.map(tool => (
          <div 
            key={tool.id}
            onClick={() => setSelectedTool(tool)}
            className={`group p-5 rounded-2xl border-2 cursor-pointer transition-all hover:-translate-y-1 hover:shadow-lg flex flex-col min-h-[140px] ${selectedTool?.id === tool.id ? 'border-indigo-600 bg-indigo-50/50' : 'border-slate-100 bg-white hover:border-indigo-200'}`}
          >
            <div className="flex items-start justify-between mb-4">
              <h3 className="font-bold text-slate-900 text-lg">{tool.name}</h3>
              <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${tool.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                {tool.status}
              </span>
            </div>
            <div className="flex items-center justify-between mt-auto pt-4 border-t border-slate-100">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium px-2 py-1 bg-slate-100 text-slate-600 rounded-lg">
                  {tool.moduleParent}
                </span>
                {tool.criticality === 'CRITICAL' && (
                  <span className="text-xs font-bold px-2 py-1 bg-rose-100 text-rose-700 rounded-lg flex items-center gap-1">
                    <ShieldAlert size={12} /> Critique
                  </span>
                )}
              </div>
              <div className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors">
                <Settings size={16} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Tool Details Modal */}
      {selectedTool && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
            <div className="p-6 bg-slate-50 border-b border-slate-100 flex items-start justify-between shrink-0">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <h2 className="text-2xl font-black text-slate-900">{selectedTool.name}</h2>
                  <span className="px-3 py-1 bg-slate-200 text-slate-700 rounded-lg text-xs font-bold font-mono">
                    {selectedTool.code}
                  </span>
                </div>
                <p className="text-slate-600 leading-relaxed">{selectedTool.description}</p>
              </div>
              <button onClick={() => setSelectedTool(null)} className="p-2 hover:bg-slate-200 rounded-xl transition-colors">
                <XCircle size={24} className="text-slate-500" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1">
              <div className="flex items-center gap-2 mb-8">
                <button
                  onClick={() => handleToggleVisibility(selectedTool.id)}
                  className={`p-3 rounded-xl transition-colors ${selectedTool.visibility === 'VISIBLE' ? 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200' : 'bg-slate-200 text-slate-600 hover:bg-slate-300'}`}
                  title={selectedTool.visibility === 'VISIBLE' ? 'Masquer l\'outil' : 'Rendre visible'}
                >
                  {selectedTool.visibility === 'VISIBLE' ? <Eye size={20} /> : <EyeOff size={20} />}
                </button>
                <button
                  onClick={() => handleToggleStatus(selectedTool)}
                  className={`px-6 py-3 rounded-xl font-bold transition-colors flex items-center gap-2 ${selectedTool.status === 'ACTIVE' ? 'bg-rose-100 text-rose-700 hover:bg-rose-200' : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'}`}
                >
                  {selectedTool.status === 'ACTIVE' ? <XCircle size={20} /> : <CheckCircle2 size={20} />}
                  {selectedTool.status === 'ACTIVE' ? 'Désactiver' : 'Activer'}
                </button>
                {selectedTool.code === 'PARTOGRAMME' && (
                  <div className="ml-auto flex items-center bg-slate-100 p-1 rounded-xl">
                    <button
                      onClick={() => {
                        const newMode = 'SIMPLE';
                        setTools(tools.map(t => t.id === selectedTool.id ? { ...t, mode: newMode, updatedAt: new Date().toISOString() } : t));
                        setSelectedTool({ ...selectedTool, mode: newMode });
                        showMessage('success', 'Mode simple activé');
                      }}
                      className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${selectedTool.mode === 'SIMPLE' || !selectedTool.mode ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                      Mode Simple
                    </button>
                    <button
                      onClick={() => {
                        const newMode = 'ADVANCED';
                        setTools(tools.map(t => t.id === selectedTool.id ? { ...t, mode: newMode, updatedAt: new Date().toISOString() } : t));
                        setSelectedTool({ ...selectedTool, mode: newMode });
                        showMessage('success', 'Mode avancé activé');
                      }}
                      className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${selectedTool.mode === 'ADVANCED' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                      Mode Avancé
                    </button>
                  </div>
                )}
                {selectedTool.code === 'CPN_OMS' && (
                  <div className="ml-auto flex items-center bg-slate-100 p-1 rounded-xl">
                    <button
                      onClick={() => {
                        const newMode = 'SIMPLE';
                        setTools(tools.map(t => t.id === selectedTool.id ? { ...t, mode: newMode, updatedAt: new Date().toISOString() } : t));
                        setSelectedTool({ ...selectedTool, mode: newMode });
                        showMessage('success', 'Mode OMS Standard activé');
                      }}
                      className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${selectedTool.mode === 'SIMPLE' || !selectedTool.mode ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                      OMS Standard
                    </button>
                    <button
                      onClick={() => {
                        const newMode = 'ADVANCED';
                        setTools(tools.map(t => t.id === selectedTool.id ? { ...t, mode: newMode, updatedAt: new Date().toISOString() } : t));
                        setSelectedTool({ ...selectedTool, mode: newMode });
                        showMessage('success', 'Mode OMS + Protocole local activé');
                      }}
                      className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${selectedTool.mode === 'ADVANCED' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                      OMS + Protocole local
                    </button>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-6">
                  <div>
                    <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3">Informations Générales</h4>
                    <div className="bg-white p-4 rounded-2xl border border-slate-100 space-y-3">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Module Parent</span>
                        <span className="font-medium text-slate-900">{selectedTool.moduleParent}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Niveau de criticité</span>
                        <span className={`font-bold ${selectedTool.criticality === 'CRITICAL' ? 'text-rose-600' : selectedTool.criticality === 'HIGH' ? 'text-orange-500' : 'text-slate-700'}`}>
                          {selectedTool.criticality}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Mode d'affichage</span>
                        <span className="font-medium text-slate-900">{selectedTool.visibility}</span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3">Rôles Autorisés</h4>
                    <div className="flex flex-wrap gap-2">
                      {selectedTool.authorizedRoles.map(role => (
                        <span key={role} className="px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-lg text-sm font-medium border border-indigo-100">
                          {role}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="space-y-6">
                  <div>
                    <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3">Dépendances & Impacts</h4>
                    <div className="bg-white p-4 rounded-2xl border border-slate-100 space-y-4">
                      <div>
                        <span className="text-xs font-bold text-slate-500 uppercase mb-2 block">Dépend de :</span>
                        <div className="flex flex-wrap gap-2">
                          {selectedTool.dependencies.map(dep => (
                            <span key={dep} className="px-2 py-1 bg-slate-100 text-slate-700 rounded text-xs font-medium">
                              {dep}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="pt-3 border-t border-slate-100">
                        <span className="text-xs font-bold text-slate-500 uppercase mb-2 block">Impacte :</span>
                        <div className="flex flex-wrap gap-2">
                          {selectedTool.impacts.map(imp => (
                            <span key={imp} className="px-2 py-1 bg-amber-50 text-amber-700 border border-amber-100 rounded text-xs font-medium">
                              {imp}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  {selectedTool.code === 'CPN_OMS' && (
                    <div>
                      <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3">Configuration Spécifique</h4>
                      <div className="bg-white p-4 rounded-2xl border border-slate-100 space-y-4">
                        <div>
                          <span className="text-xs font-bold text-slate-500 uppercase mb-2 block">Examens Disponibles</span>
                          <div className="flex flex-wrap gap-2">
                            {['Hémoglobine', 'Test VIH', 'Test Syphilis', 'HBsAg', 'Glycémie', 'Analyse d\'urine', 'Groupe Sanguin / Rh', 'Échographie'].map(exam => (
                              <span key={exam} className="px-2 py-1 bg-blue-50 text-blue-700 rounded text-xs font-bold border border-blue-100">
                                {exam}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div>
                          <span className="text-xs font-bold text-slate-500 uppercase mb-2 block">Vaccins & Traitements</span>
                          <div className="flex flex-wrap gap-2">
                            {['Tétanos / TTCV', 'Fer', 'Acide folique', 'Moustiquaire imprégnée', 'IPTp-SP'].map(item => (
                              <span key={item} className="px-2 py-1 bg-emerald-50 text-emerald-700 rounded text-xs font-bold border border-emerald-100">
                                {item}
                              </span>
                            ))}
                          </div>
                        </div>
                        <p className="text-xs text-slate-400 italic">Configuration avancée disponible dans les paramètres du module Maternité.</p>
                      </div>
                    </div>
                  )}
                  
                  <div className="text-xs text-slate-400 space-y-1">
                    <p>Créé le : {selectedTool.createdAt ? new Date(selectedTool.createdAt).toLocaleString('fr-FR') : 'N/A'}</p>
                    <p>Dernière mise à jour : {selectedTool.updatedAt ? new Date(selectedTool.updatedAt).toLocaleString('fr-FR') : 'N/A'}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Warning Modal for Deactivation */}
      {showWarning && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 bg-rose-50 border-b border-rose-100 flex items-center gap-4">
              <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-sm text-rose-600">
                <AlertTriangle size={24} />
              </div>
              <div>
                <h3 className="text-xl font-black text-rose-900">Avertissement de sécurité</h3>
                <p className="text-rose-700 text-sm font-medium">Désactivation d'un outil critique</p>
              </div>
            </div>
            <div className="p-6">
              <p className="text-slate-600 mb-4">
                Vous êtes sur le point de désactiver <strong>{showWarning.name}</strong>. Cet outil a un niveau de criticité <span className="font-bold text-rose-600">{showWarning.criticality}</span>.
              </p>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
                <p className="text-sm text-amber-800 font-medium mb-2">Impacts potentiels :</p>
                <ul className="list-disc list-inside text-sm text-amber-700 space-y-1">
                  {showWarning.impacts.map(imp => <li key={imp}>{imp}</li>)}
                  <li>Peut affecter les dossiers patients actifs utilisant cet outil.</li>
                </ul>
              </div>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setShowWarning(null)}
                  className="px-5 py-2.5 rounded-xl font-bold text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  Annuler
                </button>
                <button
                  onClick={() => updateToolStatus(showWarning.id, 'INACTIVE')}
                  className="px-5 py-2.5 rounded-xl font-bold bg-rose-600 text-white hover:bg-rose-700 transition-colors shadow-lg shadow-rose-600/20"
                >
                  Désactiver quand même
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ToolsManagement;
