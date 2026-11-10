import React, { useState, useEffect, useMemo } from 'react';
import { 
  Building2, Activity, Shield, Users, Wrench, Search, Filter, 
  CheckCircle2, XCircle, Settings, Plus, X, Save, Baby, Lock, 
  Loader2, Trash2, ArrowUpDown, DollarSign, Sparkles, AlertCircle
} from 'lucide-react';
import { Service, ServiceType, User, Tool } from '../../types';
import HospitalizationSetup from './HospitalizationSetup';
import { useHospitalServices } from '../../hooks/useSettings';
import { hasImplementedModule, getModuleForService } from '../../src/config/modules';

interface ServicesDepartmentsProps {
  users: User[];
  showMessage: (type: 'success' | 'error', text: string) => void;
  user?: User | null;
  establishment?: any;
}

const ServicesDepartments: React.FC<ServicesDepartmentsProps> = ({ users, showMessage, user, establishment }) => {
  const [tools, setTools] = useState<Tool[]>([]);
  const { services, updateService, toggleService, addService, deleteService } = useHospitalServices();
  const [isTogglingId, setIsTogglingId] = useState<string | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  useEffect(() => {
    const savedTools = localStorage.getItem('hospital_tools');
    if (savedTools) {
      setTools(JSON.parse(savedTools));
    }
  }, []);

  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<ServiceType | 'ALL'>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'active' | 'inactive'>('ALL');
  
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);

  const filteredServices = useMemo(() => {
    return services.filter(service => {
      const matchesSearch = service.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            service.description.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesType = typeFilter === 'ALL' || service.type === typeFilter;
      const matchesStatus = statusFilter === 'ALL' || service.status === statusFilter;
      
      return matchesSearch && matchesType && matchesStatus;
    });
  }, [services, searchQuery, typeFilter, statusFilter]);

  const handleToggle = async (service: Service) => {
    if (isTogglingId === service.id) return;
    setIsTogglingId(service.id);
    const targetStatus = service.status === 'active' ? 'inactive' : 'active';
    try {
      await toggleService(service.id);
      showMessage(
        'success',
        `Service "${service.name}" ${targetStatus === 'active' ? 'activé' : 'désactivé'} avec succès. Synchronisation immédiate avec l'Accueil effectuée.`
      );
    } catch (err) {
      console.error("Failed to toggle service:", err);
      showMessage('error', `Échec de mise à jour du service "${service.name}". Veuillez réessayer.`);
    } finally {
      setIsTogglingId(null);
    }
  };

  const openConfig = (service: Service) => {
    setSelectedService(service);
    setIsConfigModalOpen(true);
  };

  const saveConfig = async (updatedService: Service) => {
    try {
      await updateService(updatedService);
      setIsConfigModalOpen(false);
      setSelectedService(null);
      showMessage('success', `Configuration du service "${updatedService.name}" enregistrée et synchronisée.`);
    } catch (err) {
      console.error("Failed to save service config:", err);
      showMessage('error', `Erreur lors de l'enregistrement du service "${updatedService.name}".`);
    }
  };

  const handleDelete = async (serviceId: string, serviceName: string) => {
    if (!window.confirm(`Confirmez-vous la suppression du service "${serviceName}" ?`)) return;
    try {
      await deleteService(serviceId);
      setIsConfigModalOpen(false);
      setSelectedService(null);
      showMessage('success', `Service "${serviceName}" supprimé avec succès.`);
    } catch (err) {
      console.error("Failed to delete service:", err);
      showMessage('error', `Erreur lors de la suppression du service "${serviceName}".`);
    }
  };

  const getTypeColor = (type: ServiceType) => {
    switch (type) {
      case 'clinique': return 'bg-rose-100 text-rose-700 border-rose-200';
      case 'technique': return 'bg-orange-100 text-orange-700 border-orange-200';
      case 'soutien': return 'bg-amber-100 text-amber-700 border-amber-200';
      case 'administratif': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      case 'specialise': return 'bg-blue-100 text-blue-700 border-blue-200';
      default: return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  const getTypeName = (type: ServiceType) => {
    switch (type) {
      case 'clinique': return 'Clinique';
      case 'technique': return 'Médico-technique';
      case 'soutien': return 'Soutien';
      case 'administratif': return 'Administratif';
      case 'specialise': return 'Spécialisé';
      default: return type;
    }
  };

  const activeCount = services.filter(s => s.status === 'active').length;
  const inactiveCount = services.filter(s => s.status === 'inactive').length;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Services & Départements</h2>
          <p className="text-slate-500 mt-1">
            Architecture des services hospitaliers synchronisée en temps réel avec le module Accueil
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="px-5 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black text-xs uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-indigo-600/20 transition-all cursor-pointer"
          >
            <Plus size={16} /> Nouveau Service
          </button>
        </div>
      </div>

      {/* Synchronization Status Banner */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200/80 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="p-3 bg-blue-600 text-white rounded-2xl shadow-sm shrink-0">
            <Building2 size={20} />
          </div>
          <div>
            <h4 className="text-xs font-black uppercase text-slate-900 tracking-wider flex items-center gap-2">
              Source de Vérité Unique • Base de Données Firestore
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            </h4>
            <p className="text-xs text-slate-600 font-medium mt-0.5">
              L'activation ou la désactivation d'un service est immédiatement répercutée dans l'interface Accueil pour l'orientation des patients.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto font-mono text-xs">
          <span className="px-3 py-1.5 rounded-xl bg-emerald-100 text-emerald-800 border border-emerald-200 font-black">
            {activeCount} ACTIFS
          </span>
          <span className="px-3 py-1.5 rounded-xl bg-slate-100 text-slate-700 border border-slate-200 font-black">
            {inactiveCount} DÉSACTIVÉS
          </span>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
          <input 
            type="text" 
            placeholder="Rechercher un service..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-medium"
          />
        </div>
        <div className="flex gap-2">
          <select 
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as any)}
            className="px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-medium text-slate-700"
          >
            <option value="ALL">Tous les types</option>
            <option value="clinique">Clinique</option>
            <option value="technique">Médico-technique</option>
            <option value="soutien">Soutien</option>
            <option value="administratif">Administratif</option>
            <option value="specialise">Spécialisé</option>
          </select>
          <select 
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-medium text-slate-700"
          >
            <option value="ALL">Tous les statuts</option>
            <option value="active">Activés ({activeCount})</option>
            <option value="inactive">Désactivés ({inactiveCount})</option>
          </select>
        </div>
      </div>

      {/* Services Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredServices.map(service => {
          const isToggling = isTogglingId === service.id;
          const isActive = service.status === 'active';
          const hasModule = hasImplementedModule(service.id);
          const linkedModule = getModuleForService(service.id);
          const consultationFee = service.specificSettings?.consultationFee || service.specificSettings?.fee;

          return (
            <div 
              key={service.id} 
              className={`bg-white rounded-2xl border transition-all duration-200 overflow-hidden flex flex-col justify-between ${
                isActive 
                  ? 'border-indigo-100 shadow-md shadow-indigo-100/50' 
                  : 'border-slate-200 bg-slate-50/60 opacity-80'
              }`}
            >
              <div className="p-6">
                <div className="flex justify-between items-start mb-4 gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={`px-3 py-1 rounded-lg text-xs font-bold border ${getTypeColor(service.type)}`}>
                      {getTypeName(service.type)}
                    </span>
                    {hasModule ? (
                      <span className="px-2 py-0.5 rounded-lg text-[10px] font-black bg-blue-50 text-blue-700 border border-blue-200">
                        {linkedModule?.label}
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-lg text-[10px] font-black bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1">
                        <AlertCircle size={11} className="text-amber-600" /> Indisponible
                      </span>
                    )}
                  </div>

                  {/* Interactive Activation Toggle Switch vs Locked State */}
                  {hasModule ? (
                    <button
                      onClick={() => handleToggle(service)}
                      disabled={isToggling}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                        isActive 
                          ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 shadow-sm' 
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-600 border border-slate-300'
                      } disabled:opacity-50`}
                      title={isActive ? "Cliquer pour désactiver ce service (le masque de l'Accueil)" : "Cliquer pour activer ce service (l'affiche dans l'Accueil)"}
                    >
                      {isToggling ? (
                        <Loader2 size={13} className="animate-spin text-indigo-600" />
                      ) : isActive ? (
                        <CheckCircle2 size={14} className="text-emerald-600" />
                      ) : (
                        <XCircle size={14} className="text-slate-400" />
                      )}
                      <span>{isActive ? 'Activé' : 'Désactivé'}</span>
                    </button>
                  ) : (
                    <div 
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed select-none"
                      title="Ce service ne dispose pas d'un module autonome développé dans SmartHosto. Il ne peut pas être activé à l'accueil."
                    >
                      <Lock size={12} className="text-slate-400" />
                      <span>Non implémenté</span>
                    </div>
                  )}
                </div>
                
                <h3 className="text-xl font-black text-slate-900 mb-1">{service.name}</h3>
                <p className="text-xs text-slate-400 font-mono mb-2">ID: {service.id}</p>
                <p className="text-sm text-slate-500 mb-4 line-clamp-2 min-h-[40px]">{service.description || 'Aucune description'}</p>
                
                {!hasModule && (
                  <div className="mb-4 p-2.5 bg-amber-50/70 border border-amber-200/60 rounded-xl flex items-start gap-2 text-xs text-amber-800">
                    <AlertCircle size={14} className="text-amber-600 shrink-0 mt-0.5" />
                    <span className="leading-snug">
                      Service sans module fonctionnel développé dans SmartHosto : désactivé et masqué de l'accueil.
                    </span>
                  </div>
                )}

                {consultationFee !== undefined && (
                  <div className="mb-4 px-3 py-2 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between text-xs">
                    <span className="text-slate-500 font-medium">Tarif d'orientation Accueil :</span>
                    <span className="font-black text-slate-900">{Number(consultationFee).toLocaleString()} CFA</span>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <div className="flex items-center gap-2 text-slate-500 mb-1">
                      <Users size={14} />
                      <span className="text-xs font-bold uppercase">Utilisateurs</span>
                    </div>
                    <span className="text-lg font-black text-slate-800">{service.users.length}</span>
                  </div>
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <div className="flex items-center gap-2 text-slate-500 mb-1">
                      <Wrench size={14} />
                      <span className="text-xs font-bold uppercase">Outils</span>
                    </div>
                    <span className="text-lg font-black text-slate-800">{service.activeTools.length}</span>
                  </div>
                </div>
              </div>

              <div className="p-6 pt-0">
                <button 
                  onClick={() => openConfig(service)}
                  className="w-full py-3 bg-slate-50 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 rounded-xl font-bold transition-colors flex items-center justify-center gap-2 border border-slate-200 hover:border-indigo-200 cursor-pointer"
                >
                  <Settings size={18} />
                  Configurer
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {filteredServices.length === 0 && (
        <div className="py-16 text-center bg-white rounded-3xl border border-dashed border-slate-200">
          <Building2 size={36} className="mx-auto text-slate-300 mb-3" />
          <h3 className="font-bold text-slate-700">Aucun service trouvé</h3>
          <p className="text-xs text-slate-400 mt-1">Modifiez vos critères de recherche ou ajoutez un nouveau service.</p>
        </div>
      )}

      {/* Config Modal */}
      {isConfigModalOpen && selectedService && (
        <ServiceConfigModal 
          service={selectedService} 
          users={users}
          tools={tools}
          user={user}
          establishment={establishment}
          onClose={() => setIsConfigModalOpen(false)} 
          onSave={saveConfig} 
          onDelete={handleDelete}
          showMessage={showMessage}
        />
      )}

      {/* Add Service Modal */}
      {isAddModalOpen && (
        <AddServiceModal
          onClose={() => setIsAddModalOpen(false)}
          onAdd={async (newService) => {
            try {
              const created = await addService(newService);
              setIsAddModalOpen(false);
              showMessage('success', `Service "${created.name}" créé avec succès et synchronisé avec l'Accueil.`);
            } catch (err) {
              console.error(err);
              showMessage('error', `Erreur lors de la création du service.`);
            }
          }}
        />
      )}
    </div>
  );
};

// --- Sub-component for Configuration Modal ---
const ServiceConfigModal: React.FC<{ 
  service: Service, 
  users: User[], 
  tools: Tool[], 
  user?: User | null,
  establishment?: any,
  onClose: () => void, 
  onSave: (s: Service) => void,
  onDelete: (id: string, name: string) => void,
  showMessage: (type: 'success' | 'error', text: string) => void
}> = ({ service, users, tools, user, establishment, onClose, onSave, onDelete, showMessage }) => {
  const [editedService, setEditedService] = useState<Service>({ ...service });
  const [activeTab, setActiveTab] = useState<'info' | 'users' | 'tools' | 'settings'>('info');

  const handleUserToggle = (userId: string) => {
    setEditedService(prev => {
      const newUsers = prev.users.includes(userId) 
        ? prev.users.filter(id => id !== userId)
        : [...prev.users, userId];
      return { ...prev, users: newUsers };
    });
  };

  const handleToolToggle = (toolId: string) => {
    setEditedService(prev => {
      const newTools = prev.activeTools.includes(toolId)
        ? prev.activeTools.filter(id => id !== toolId)
        : [...prev.activeTools, toolId];
      return { ...prev, activeTools: newTools };
    });
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center">
              <Settings size={24} />
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-900">Configuration : {service.name}</h2>
              <p className="text-sm text-slate-500 font-medium">Gérez l'activation, les accès et les paramètres spécifiques pour l'Accueil</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:bg-slate-200 hover:text-slate-700 rounded-xl transition-colors cursor-pointer">
            <X size={24} />
          </button>
        </div>

        <div className="flex border-b border-slate-200 shrink-0">
          <button onClick={() => setActiveTab('info')} className={`flex-1 py-4 font-bold text-sm transition-colors border-b-2 cursor-pointer ${activeTab === 'info' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>Informations & Statut</button>
          <button onClick={() => setActiveTab('users')} className={`flex-1 py-4 font-bold text-sm transition-colors border-b-2 cursor-pointer ${activeTab === 'users' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>Utilisateurs ({editedService.users.length})</button>
          <button onClick={() => setActiveTab('tools')} className={`flex-1 py-4 font-bold text-sm transition-colors border-b-2 cursor-pointer ${activeTab === 'tools' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>Outils ({editedService.activeTools.length})</button>
          <button onClick={() => setActiveTab('settings')} className={`flex-1 py-4 font-bold text-sm transition-colors border-b-2 cursor-pointer ${activeTab === 'settings' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>Paramètres Avancés & Accueil</button>
        </div>

        <div className="p-6 overflow-y-auto flex-1 bg-slate-50/50">
          {activeTab === 'info' && (
            <div className="space-y-6 max-w-2xl">
              {/* Activation Switch / State */}
              {(() => {
                const hasModule = hasImplementedModule(editedService.id);
                return (
                  <div className={`p-4 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border ${
                    !hasModule 
                      ? 'bg-amber-50/70 border-amber-200' 
                      : 'bg-white border-slate-200'
                  }`}>
                    <div>
                      <h4 className="font-black text-slate-900 text-sm flex items-center gap-2">
                        Disponibilité à l'Accueil (Statut)
                        {!hasModule && (
                          <span className="text-[10px] uppercase font-black px-2 py-0.5 bg-amber-200 text-amber-900 rounded-md flex items-center gap-1">
                            <Lock size={10} /> Non implémenté
                          </span>
                        )}
                      </h4>
                      <p className="text-xs text-slate-500 mt-1">
                        {!hasModule ? (
                          <span className="text-amber-800 font-medium">
                            Ce service ne dispose pas d'un module autonome développé dans SmartHosto. Il est automatiquement maintenu désactivé et ne peut pas être activé à l'accueil.
                          </span>
                        ) : editedService.status === 'active' ? (
                          'Ce service est actif et apparaît dans les modules et choix de destination de l’Accueil.'
                        ) : (
                          'Ce service est désactivé et masqué de l’Accueil et de la navigation.'
                        )}
                      </p>
                    </div>

                    {!hasModule ? (
                      <div className="px-4 py-2.5 rounded-xl text-xs font-black bg-slate-200 text-slate-500 flex items-center gap-2 cursor-not-allowed select-none shrink-0">
                        <Lock size={14} /> DÉSACTIVÉ (VERROUILLÉ)
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setEditedService({
                          ...editedService,
                          status: editedService.status === 'active' ? 'inactive' : 'active',
                          is_active: editedService.status !== 'active'
                        })}
                        className={`px-4 py-2.5 rounded-xl text-xs font-black flex items-center gap-2 cursor-pointer transition-all shrink-0 ${
                          editedService.status === 'active'
                            ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
                            : 'bg-slate-200 text-slate-700'
                        }`}
                      >
                        {editedService.status === 'active' ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
                        {editedService.status === 'active' ? 'SERVICE ACTIF' : 'SERVICE DÉSACTIVÉ'}
                      </button>
                    )}
                  </div>
                );
              })()}

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-2">Nom du Service</label>
                <input 
                  type="text" 
                  value={editedService.name}
                  onChange={e => setEditedService({...editedService, name: e.target.value})}
                  className="w-full p-4 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-2">Description</label>
                <textarea 
                  value={editedService.description}
                  onChange={e => setEditedService({...editedService, description: e.target.value})}
                  className="w-full p-4 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-medium min-h-[100px]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-2">Type de Service</label>
                <select 
                  value={editedService.type}
                  onChange={e => setEditedService({...editedService, type: e.target.value as ServiceType})}
                  className="w-full p-4 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-medium"
                >
                  <option value="clinique">Clinique (Consultation générale ou ambulatoire)</option>
                  <option value="specialise">Spécialisé (Cardiologie, Ophtalmologie, etc.)</option>
                  <option value="technique">Médico-technique (Laboratoire, Imagerie, etc.)</option>
                  <option value="soutien">Soutien (Soins infirmiers, Vaccination, etc.)</option>
                  <option value="administratif">Administratif (Caisse, Administration, etc.)</option>
                </select>
              </div>
            </div>
          )}

          {activeTab === 'users' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {users.map(user => {
                  const isAssigned = editedService.users.includes(user.id);
                  return (
                    <div key={user.id} className={`p-4 rounded-xl border flex items-center justify-between transition-colors cursor-pointer ${isAssigned ? 'bg-indigo-50 border-indigo-200' : 'bg-white border-slate-200 hover:border-indigo-300'}`} onClick={() => handleUserToggle(user.id)}>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center font-bold text-slate-600">
                          {user.name.charAt(0)}
                        </div>
                        <div>
                          <p className="font-bold text-slate-900">{user.name}</p>
                          <p className="text-xs text-slate-500">{user.profession || user.role}</p>
                        </div>
                      </div>
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center border ${isAssigned ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-300'}`}>
                        {isAssigned && <CheckCircle2 size={14} />}
                      </div>
                    </div>
                  );
                })}
              </div>
              {users.length === 0 && (
                <p className="text-center text-slate-500 py-8">Aucun utilisateur trouvé dans le système.</p>
              )}
            </div>
          )}

          {activeTab === 'tools' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {tools.map(tool => {
                  const isAssigned = editedService.activeTools.includes(tool.id);
                  return (
                    <div key={tool.id} className={`p-4 rounded-xl border flex items-center justify-between transition-colors cursor-pointer ${isAssigned ? 'bg-indigo-50 border-indigo-200' : 'bg-white border-slate-200 hover:border-indigo-300'}`} onClick={() => handleToolToggle(tool.id)}>
                      <div>
                        <p className="font-bold text-slate-900">{tool.name}</p>
                        <p className="text-xs text-slate-500">{tool.description}</p>
                      </div>
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center border shrink-0 ${isAssigned ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-300'}`}>
                        {isAssigned && <CheckCircle2 size={14} />}
                      </div>
                    </div>
                  );
                })}
              </div>
              {tools.length === 0 && (
                <p className="text-center text-slate-500 py-8">Aucun outil trouvé dans le système.</p>
              )}
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="space-y-6 max-w-2xl">
              <div className="bg-white p-6 rounded-2xl border border-slate-200 space-y-6">
                <div>
                  <h3 className="font-bold text-slate-900 mb-1">Tarification & Prise en Charge</h3>
                  <p className="text-xs text-slate-500 mb-4">
                    Définissez les frais par défaut appliqués lors de l'enregistrement ou orientation d'un patient à l'Accueil.
                  </p>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-2">
                      Frais de Consultation / Prise en Charge (CFA / XAF)
                    </label>
                    <input 
                      type="number"
                      value={editedService.specificSettings?.consultationFee ?? editedService.specificSettings?.fee ?? 10000}
                      onChange={e => setEditedService({
                        ...editedService,
                        specificSettings: {
                          ...editedService.specificSettings,
                          consultationFee: Number(e.target.value) || 0,
                          fee: Number(e.target.value) || 0
                        }
                      })}
                      className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-bold text-slate-900"
                    />
                  </div>
                </div>

                {/* Hospitalization Setup */}
                {editedService.id === 'SRV-HOSPITALISATION' && (
                  <div className="pt-4 border-t border-slate-100">
                    <HospitalizationSetup showMessage={showMessage} user={user} establishment={establishment} />
                  </div>
                )}
                
                {editedService.id === 'SRV-MATERNITE' && (
                  <div className="pt-4 border-t border-slate-100 space-y-4">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={editedService.specificSettings?.autoPartogram || false}
                        onChange={e => setEditedService({
                          ...editedService, 
                          specificSettings: { ...editedService.specificSettings, autoPartogram: e.target.checked }
                        })}
                        className="w-5 h-5 rounded text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="font-medium text-slate-700">Activer le partogramme automatique</span>
                    </label>
                  </div>
                )}

                {/* --- Spécialités et Files d'attente paramétrables --- */}
                {(() => {
                  const getSpecialtiesForService = (id: string) => {
                    switch (id) {
                      case 'SRV-CONSULTATION':
                        return [
                          { id: 'medecine_generale', label: 'Médecine générale' },
                          { id: 'pediatrie', label: 'Pédiatrie' },
                          { id: 'gynecologie', label: 'Gynécologie' },
                          { id: 'obstetrique', label: 'Obstétrique' },
                          { id: 'cpn_consultation', label: 'Consultation prénatale (CPN)' },
                          { id: 'postnatale_consultation', label: 'Consultation postnatale' },
                          { id: 'chirurgie', label: 'Chirurgie' },
                          { id: 'traumatologie', label: 'Traumatologie' },
                          { id: 'medecine_interne', label: 'Médecine interne' },
                        ];
                      case 'SRV-MATERNITE':
                        return [
                          { id: 'travail_accouchement', label: 'Travail / Accouchement' },
                          { id: 'consultation_obstetricale', label: 'Consultation obstétricale' },
                          { id: 'consultation_gynecologique', label: 'Consultation gynécologique' },
                          { id: 'cpn_maternite', label: 'Consultation prénatale' },
                          { id: 'postnatale_maternite', label: 'Consultation postnatale' },
                        ];
                      case 'SRV-URGENCES':
                        return [
                          { id: 'urgence_adulte', label: 'Urgence adulte' },
                          { id: 'urgence_pediatrique', label: 'Urgence pédiatrique' },
                          { id: 'urgence_obstetricale', label: 'Urgence obstétricale' },
                          { id: 'traumatisme', label: 'Traumatisme' },
                        ];
                      case 'SRV-LABO':
                        return [{ id: 'laboratoire', label: 'Laboratoire' }];
                      case 'SRV-INFIRMIER':
                        return [{ id: 'soins_infirmiers', label: 'Soins infirmiers' }];
                      case 'SRV-VACCINATION':
                        return [{ id: 'vaccination', label: 'Vaccination' }];
                      case 'SRV-PHARMACIE':
                        return [{ id: 'pharmacie', label: 'Pharmacie' }];
                      default:
                        return [];
                    }
                  };

                  const specList = getSpecialtiesForService(editedService.id);
                  if (specList.length === 0) {
                    return null;
                  }

                  const activeSpecs = editedService.specificSettings?.activeSpecialties || specList.map(s => s.id);

                  const toggleSpecialty = (specId: string) => {
                    const newActive = activeSpecs.includes(specId)
                      ? activeSpecs.filter((sid: string) => sid !== specId)
                      : [...activeSpecs, specId];
                    
                    setEditedService({
                      ...editedService,
                      specificSettings: {
                        ...editedService.specificSettings,
                        activeSpecialties: newActive
                      }
                    });
                  };

                  return (
                    <div className="mt-6 pt-6 border-t border-slate-100">
                      <h4 className="text-xs font-black text-indigo-600 uppercase tracking-[0.2em] mb-4">
                        Spécialités de Prise en Charge Activées
                      </h4>
                      <p className="text-xs text-slate-500 mb-4 font-medium italic">
                        Désactivez une spécialité ou file d'attente pour la masquer complétement du module Accueil.
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {specList.map(spec => {
                          const isActive = activeSpecs.includes(spec.id);
                          return (
                            <label key={spec.id} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${isActive ? 'bg-indigo-50/50 border-indigo-100 hover:bg-indigo-50' : 'bg-white border-slate-200 opacity-60 hover:opacity-80'}`}>
                              <input 
                                type="checkbox"
                                checked={isActive}
                                onChange={() => toggleSpecialty(spec.id)}
                                className="w-5 h-5 rounded text-indigo-600 focus:ring-indigo-500"
                              />
                              <div>
                                <span className="font-bold text-slate-800 text-xs">{spec.label}</span>
                                <p className="text-[8px] text-slate-400 font-bold font-mono uppercase">DISPONIBLE À L'ACCUEIL</p>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                {/* Delete button if custom service */}
                <div className="pt-6 border-t border-rose-100">
                  <button
                    type="button"
                    onClick={() => onDelete(editedService.id, editedService.name)}
                    className="px-4 py-2.5 rounded-xl text-rose-600 hover:bg-rose-50 border border-rose-200 font-bold text-xs flex items-center gap-2 cursor-pointer transition-colors"
                  >
                    <Trash2 size={16} /> Supprimer ce service
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="p-6 border-t border-slate-100 bg-white flex justify-end gap-4 shrink-0">
          <button onClick={onClose} className="px-6 py-3 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer">
            Annuler
          </button>
          <button onClick={() => onSave(editedService)} className="px-6 py-3 rounded-xl font-bold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors flex items-center gap-2 shadow-lg shadow-indigo-600/20 cursor-pointer">
            <Save size={18} />
            Enregistrer les modifications
          </button>
        </div>
      </div>
    </div>
  );
};

// --- Modal for Adding a New Service ---
const AddServiceModal: React.FC<{
  onClose: () => void;
  onAdd: (newService: Partial<Service>) => Promise<void>;
}> = ({ onClose, onAdd }) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<ServiceType>('clinique');
  const [fee, setFee] = useState<number>(10000);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setIsSubmitting(true);
    try {
      await onAdd({
        name: name.trim(),
        description: description.trim(),
        type,
        status: 'inactive',
        specificSettings: {
          consultationFee: fee,
          fee: fee
        }
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center">
              <Plus size={20} />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-900">Nouveau Service Hospitalier</h2>
              <p className="text-xs text-slate-500">Sera immédiatement synchronisé avec l'Accueil</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:bg-slate-200 hover:text-slate-700 rounded-xl transition-colors cursor-pointer">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-2xl text-xs text-amber-900 flex items-start gap-2.5">
            <AlertCircle size={16} className="text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Règle de synchronisation SmartHosto :</p>
              <p className="mt-0.5 text-[11px] text-amber-800 leading-relaxed">
                Un service ne peut être activé à l'accueil que si un module autonome correspondant existe dans le code. Tout nouveau service personnalisé est créé avec le statut « Désactivé » afin de garantir la cohérence de l'accueil.
              </p>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-2">Nom du Service *</label>
            <input 
              type="text" 
              required
              placeholder="Ex: Cardiologie, Kinésithérapie, Stomatologie..."
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-medium text-slate-900"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-2">Type de Service</label>
            <select 
              value={type}
              onChange={e => setType(e.target.value as ServiceType)}
              className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-medium text-slate-900"
            >
              <option value="clinique">Clinique (Consultation générale)</option>
              <option value="specialise">Spécialisé (Consultation spécialisée)</option>
              <option value="technique">Médico-technique (Examens / Biologie)</option>
              <option value="soutien">Soutien (Soins / Vaccinations)</option>
              <option value="administratif">Administratif</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-2">Tarif de consultation / prise en charge (CFA)</label>
            <input 
              type="number" 
              value={fee}
              onChange={e => setFee(Number(e.target.value) || 0)}
              className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-bold text-slate-900"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-2">Description</label>
            <textarea 
              placeholder="Description des prestations prises en charge..."
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-medium text-slate-900 min-h-[80px]"
            />
          </div>

          <div className="pt-4 flex justify-end gap-3 border-t border-slate-100">
            <button 
              type="button" 
              onClick={onClose} 
              className="px-5 py-3 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
            >
              Annuler
            </button>
            <button 
              type="submit" 
              disabled={isSubmitting || !name.trim()}
              className="px-6 py-3 rounded-xl font-bold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors flex items-center gap-2 shadow-lg shadow-indigo-600/20 disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              Créer et Synchroniser
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ServicesDepartments;
