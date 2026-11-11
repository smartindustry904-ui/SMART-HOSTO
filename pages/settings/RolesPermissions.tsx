import React, { useState, useEffect, useMemo } from 'react';
import { CustomRole } from '../../types';
import { DEFAULT_ROLES, PERMISSION_MODULES, MODULE_ACTIONS, GLOBAL_PERMISSIONS } from '../../constants/rbac';
import { Shield, Plus, Edit2, Trash2, Copy, Check, X, ChevronDown, ChevronUp, Lock } from 'lucide-react';
import { db, sanitizeData } from '../../src/firebase';
import { doc, setDoc, deleteDoc } from 'firebase/firestore';
import { getActiveTenantId, stampTenantData } from '../../src/utils/tenant';
import { useHospitalLicense } from '../../hooks/useHospitalLicense';
import { useHospitalServices } from '../../hooks/useSettings';

interface RolesPermissionsProps {
  roles: CustomRole[];
  setRoles: (roles: CustomRole[]) => void;
  users: any[];
  setUsers: (users: any[]) => void;
  showMessage: (type: 'success' | 'error', text: string) => void;
  currentUser?: any;
}

const RolesPermissions: React.FC<RolesPermissionsProps> = ({ roles, setRoles, users, setUsers, showMessage, currentUser }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<CustomRole | null>(null);
  const [expandedModules, setExpandedModules] = useState<Record<string, boolean>>({});

  const activeTenantId = getActiveTenantId(currentUser);
  const licenseInfo = useHospitalLicense(currentUser);
  const { services } = useHospitalServices();

  // Strict license-based filtering: only modules included in the hospital's active license are visible in Roles
  const visiblePermissionModules = useMemo(() => {
    return PERMISSION_MODULES.filter(module => {
      if (!module.serviceId) return true;

      const licensedServices = licenseInfo.licensedServiceIds || [];
      if (licensedServices.length > 0) {
        const isLicensed = licensedServices.some(sId => sId.toUpperCase() === module.serviceId?.toUpperCase());
        if (!isLicensed) return false;
      }

      if (services && services.length > 0) {
        const matchingService = services.find(s => s.id.toUpperCase() === module.serviceId?.toUpperCase());
        if (matchingService && matchingService.status === 'inactive' && matchingService.is_active === false) {
          return false;
        }
      }

      return true;
    });
  }, [licenseInfo.licensedServiceIds, services]);

  // Initialize default roles if empty
  useEffect(() => {
    if (roles.length === 0) {
      setRoles(DEFAULT_ROLES);
    }
  }, []);

  const handleOpenModal = (role?: CustomRole) => {
    if (role) {
      setEditingRole({ ...role });
    } else {
      setEditingRole({
        id: Math.random().toString(36).substr(2, 9),
        name: '',
        description: '',
        permissions: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isSystem: false
      });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingRole(null);
  };

  const handleSaveRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRole || !editingRole.name.trim()) return;

    const isDuplicateName = roles.some(r => r.name.toLowerCase() === editingRole.name.toLowerCase() && r.id !== editingRole.id);
    if (isDuplicateName) {
      showMessage('error', 'Un rôle avec ce nom existe déjà');
      return;
    }

    const updatedRole: CustomRole = { 
      ...editingRole, 
      tenantId: activeTenantId,
      clinicId: activeTenantId,
      hospital_id: activeTenantId,
      updatedAt: new Date().toISOString() 
    } as any;
    
    // Save to Firestore so changes persist and apply live to all users!
    try {
      await setDoc(doc(db, 'hospital_roles', updatedRole.id), sanitizeData(stampTenantData(updatedRole, currentUser)), { merge: true });
    } catch (err) {
      console.warn("Notice: Error saving role to Firestore, will update locally:", err);
    }

    if (roles.some(r => r.id === updatedRole.id)) {
      setRoles(roles.map(r => r.id === updatedRole.id ? updatedRole : r));
      showMessage('success', 'Rôle et habilitations modifiés avec succès. Les accès des utilisateurs associés sont immédiatement actualisés.');
    } else {
      setRoles([...roles, updatedRole]);
      showMessage('success', 'Nouveau rôle créé et enregistré avec succès');
    }
    
    handleCloseModal();
  };

  const handleDeleteRole = async (id: string) => {
    if (id === 'role_admin') {
      showMessage('error', 'Impossible de supprimer le rôle Administrateur principal (protection système)');
      return;
    }

    try {
      await deleteDoc(doc(db, 'hospital_roles', id));
    } catch (err) {
      console.warn("Notice: Error deleting role from Firestore:", err);
    }

    // Remove the role from any users that might have it assigned
    const updatedUsers = users.map(u => {
      if (u.roles?.includes(id)) {
        return { ...u, roles: u.roles.filter((rId: string) => rId !== id) };
      }
      return u;
    });
    
    setUsers(updatedUsers);
    setRoles(roles.filter(r => r.id !== id));
    showMessage('success', 'Rôle supprimé avec succès');
  };

  const handleDuplicateRole = async (role: CustomRole) => {
    const newRole: CustomRole = {
      ...role,
      id: Math.random().toString(36).substr(2, 9),
      name: `${role.name} (Copie)`,
      isSystem: false,
      tenantId: activeTenantId,
      clinicId: activeTenantId,
      hospital_id: activeTenantId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    } as any;

    try {
      await setDoc(doc(db, 'hospital_roles', newRole.id), sanitizeData(stampTenantData(newRole, currentUser)));
    } catch (err) {
      console.warn("Notice: Error saving duplicated role:", err);
    }

    setRoles([...roles, newRole]);
    showMessage('success', 'Rôle dupliqué avec succès');
  };

  const togglePermission = (module: string, action: string) => {
    if (!editingRole) return;
    
    const currentModulePerms = editingRole.permissions[module] || [];
    const newModulePerms = currentModulePerms.includes(action)
      ? currentModulePerms.filter(a => a !== action)
      : [...currentModulePerms, action];
      
    setEditingRole({
      ...editingRole,
      permissions: {
        ...editingRole.permissions,
        [module]: newModulePerms
      }
    });
  };

  const toggleModuleAccordion = (moduleId: string) => {
    setExpandedModules(prev => ({ ...prev, [moduleId]: !prev[moduleId] }));
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Rôles & Permissions</h2>
          <p className="text-slate-500 text-sm font-medium mt-1">Gérez les accès et habilitations (RBAC)</p>
        </div>
        <button 
          onClick={() => handleOpenModal()}
          className="bg-blue-600 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-blue-700 transition-colors shadow-lg shadow-blue-600/20"
        >
          <Plus size={18} /> Ajouter un rôle
        </button>
      </div>

      <div className="bg-white rounded-3xl border border-slate-100 overflow-hidden shadow-sm">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100">
              <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Nom du rôle</th>
              <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Description</th>
              <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Utilisateurs</th>
              <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Dernière modif.</th>
              <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {roles.map(role => {
              const assignedCount = users.filter(u => u.roles?.includes(role.id) || (u.role && u.role === role.name.toUpperCase())).length;
              
              return (
                <tr key={role.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <Shield size={16} className={role.isSystem ? 'text-rose-500' : 'text-blue-500'} />
                      <span className="font-bold text-slate-900">{role.name}</span>
                      {role.isSystem && <span className="px-2 py-0.5 bg-rose-50 text-rose-600 text-[9px] font-black uppercase rounded-full">Système</span>}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-500 font-medium max-w-xs truncate" title={role.description}>
                    {role.description}
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-slate-100 text-slate-700 font-bold text-xs">
                      {assignedCount}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-xs text-slate-500 font-medium">
                    {new Date(role.updatedAt).toLocaleDateString('fr-FR')}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => handleOpenModal(role)} className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Éditer">
                        <Edit2 size={14} /> Éditer
                      </button>
                      <button onClick={() => handleDuplicateRole(role)} className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors" title="Dupliquer">
                        <Copy size={14} /> Dupliquer
                      </button>
                      <button 
                        onClick={() => handleDeleteRole(role.id)} 
                        className={`flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${role.id === 'role_admin' ? 'text-slate-300 cursor-not-allowed' : 'text-slate-500 hover:text-rose-600 hover:bg-rose-50'}`}
                        disabled={role.id === 'role_admin'}
                        title={role.id === 'role_admin' ? "Rôle Admin protégé" : "Supprimer"}
                      >
                        <Trash2 size={14} /> Supprimer
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Modal d'édition/création */}
      {isModalOpen && editingRole && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-3xl my-8 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50 sticky top-0 z-10">
              <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
                <Shield className="text-blue-600" />
                {editingRole.id.includes('role_') && editingRole.isSystem ? 'Éditer le rôle système' : 'Configurer le rôle'}
              </h3>
              <button onClick={handleCloseModal} className="p-2 text-slate-400 hover:bg-slate-200 rounded-xl transition-colors">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-8 overflow-y-auto flex-1">
              <form id="role-form" onSubmit={handleSaveRole} className="space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Nom du rôle *</label>
                    <input 
                      type="text" 
                      value={editingRole.name}
                      onChange={e => setEditingRole({...editingRole, name: e.target.value})}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 ring-blue-600/20 outline-none font-bold text-slate-900"
                      required
                      placeholder="Ex: Médecin Chef"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Description</label>
                    <textarea 
                      value={editingRole.description}
                      onChange={e => setEditingRole({...editingRole, description: e.target.value})}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 ring-blue-600/20 outline-none text-sm font-medium text-slate-700 resize-none h-[50px]"
                      placeholder="Décrivez les responsabilités..."
                    />
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-4 flex items-center gap-2">
                    <div className="w-2 h-2 bg-blue-600 rounded-full"></div>
                    Permissions Globales
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    {GLOBAL_PERMISSIONS.map(perm => (
                      <label key={perm.id} className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${editingRole.permissions['global']?.includes(perm.id) ? 'bg-blue-50 border-blue-200' : 'bg-white border-slate-200 hover:bg-slate-50'}`}>
                        <div className={`w-5 h-5 rounded flex items-center justify-center mt-0.5 flex-shrink-0 ${editingRole.permissions['global']?.includes(perm.id) ? 'bg-blue-600 text-white' : 'bg-slate-100 border border-slate-300'}`}>
                          {editingRole.permissions['global']?.includes(perm.id) && <Check size={14} />}
                        </div>
                        <input 
                          type="checkbox" 
                          className="hidden"
                          checked={editingRole.permissions['global']?.includes(perm.id) || false}
                          onChange={() => togglePermission('global', perm.id)}
                        />
                        <span className="text-xs font-bold text-slate-700 leading-tight">{perm.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                      <div className="w-2 h-2 bg-emerald-600 rounded-full"></div>
                      Permissions par Module
                    </h4>
                    {licenseInfo.planName && (
                      <span className="text-[10px] font-black uppercase px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                        Formule {licenseInfo.planName} • {visiblePermissionModules.length} module{visiblePermissionModules.length > 1 ? 's' : ''} inclus
                      </span>
                    )}
                  </div>
                  <div className="space-y-3">
                    {visiblePermissionModules.map(module => (
                      <div key={module.id} className="border border-slate-200 rounded-2xl overflow-hidden">
                        <button 
                          type="button"
                          onClick={() => toggleModuleAccordion(module.id)}
                          className="w-full flex items-center justify-between p-4 bg-slate-50 hover:bg-slate-100 transition-colors"
                        >
                          <span className="font-bold text-slate-700">{module.label}</span>
                          <div className="flex items-center gap-3">
                            {editingRole.permissions[module.id]?.length > 0 && (
                              <span className="px-2 py-1 bg-emerald-100 text-emerald-700 text-[10px] font-black rounded-lg">
                                {editingRole.permissions[module.id].length} / {MODULE_ACTIONS.length}
                              </span>
                            )}
                            {expandedModules[module.id] ? <ChevronUp size={18} className="text-slate-400" /> : <ChevronDown size={18} className="text-slate-400" />}
                          </div>
                        </button>
                        
                        {expandedModules[module.id] && (
                          <div className="p-4 bg-white border-t border-slate-100 grid grid-cols-2 sm:grid-cols-4 gap-4">
                            {MODULE_ACTIONS.map(action => (
                              <label key={action.id} className="flex items-center gap-2 cursor-pointer group">
                                <div className={`w-4 h-4 rounded flex items-center justify-center transition-colors ${editingRole.permissions[module.id]?.includes(action.id) ? 'bg-emerald-500 text-white' : 'bg-slate-100 border border-slate-300 group-hover:border-emerald-400'}`}>
                                  {editingRole.permissions[module.id]?.includes(action.id) && <Check size={12} />}
                                </div>
                                <input 
                                  type="checkbox" 
                                  className="hidden"
                                  checked={editingRole.permissions[module.id]?.includes(action.id) || false}
                                  onChange={() => togglePermission(module.id, action.id)}
                                />
                                <span className="text-xs font-medium text-slate-600">{action.label}</span>
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </form>
            </div>
            
            <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-3 sticky bottom-0">
              <button 
                type="button" 
                onClick={handleCloseModal}
                className="px-6 py-3 rounded-xl font-bold text-slate-500 hover:bg-slate-200 transition-colors"
              >
                Annuler
              </button>
              <button 
                type="submit" 
                form="role-form"
                className="px-8 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-colors shadow-lg shadow-blue-600/20"
              >
                Sauvegarder le rôle
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RolesPermissions;
