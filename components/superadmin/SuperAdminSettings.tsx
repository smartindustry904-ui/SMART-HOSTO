import React, { useState } from 'react';
import { 
  Settings, 
  Shield, 
  Database, 
  Globe, 
  Activity, 
  RefreshCw, 
  Search, 
  CheckCircle2, 
  AlertTriangle, 
  Building2, 
  Lock, 
  Unlock, 
  Layers, 
  Download,
  Loader2
} from 'lucide-react';
import { ClinicTenant, SaaSLog } from '../../pages/ControlCenter';
import { db, sanitizeData } from '../../src/firebase';
import { doc, updateDoc, setDoc, addDoc, collection } from 'firebase/firestore';

interface SuperAdminSettingsProps {
  clinics: ClinicTenant[];
  logs: SaaSLog[];
  globalConfig: any;
  currentUser?: any;
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  onSwitchTenantContext?: (clinic: ClinicTenant) => void;
}

export const SuperAdminSettings: React.FC<SuperAdminSettingsProps> = ({
  clinics,
  logs,
  globalConfig,
  currentUser,
  showToast,
  onSwitchTenantContext
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'CONFIG' | 'LOGS' | 'TENANT_SWITCHER'>('CONFIG');
  const [logSearch, setLogSearch] = useState('');
  const [logCategoryFilter, setLogCategoryFilter] = useState('ALL');

  // Form State
  const [defaultCurrency, setDefaultCurrency] = useState('FCFA');
  const [defaultLanguage, setDefaultLanguage] = useState('Français');
  const [platformName, setPlatformName] = useState('SmartHosto Cloud SaaS');
  const [supportEmail, setSupportEmail] = useState('contact@smarthosto.com');
  const [isSaving, setIsSaving] = useState(false);

  // Filtered Logs
  const filteredLogs = logs.filter(log => {
    if (logCategoryFilter !== 'ALL' && log.category !== logCategoryFilter) return false;
    if (logSearch.trim()) {
      const q = logSearch.toLowerCase().trim();
      const matches = 
        (log.action || '').toLowerCase().includes(q) ||
        (log.details || '').toLowerCase().includes(q) ||
        (log.user || '').toLowerCase().includes(q) ||
        (log.clinicName || '').toLowerCase().includes(q);
      if (!matches) return false;
    }
    return true;
  });

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await setDoc(doc(db, 'saas_global_config', 'platform_settings'), sanitizeData({
        defaultCurrency,
        defaultLanguage,
        platformName,
        supportEmail,
        updatedAt: new Date().toISOString(),
        updatedBy: currentUser?.username || 'superadmin'
      }), { merge: true });

      showToast('Paramètres de la plateforme enregistrés avec succès', 'success');
    } catch (err) {
      console.error('Error saving global config:', err);
      showToast('Erreur lors de l\'enregistrement des paramètres', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      
      {/* HEADER BAR */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/60 border border-white/10 p-5 rounded-3xl backdrop-blur-xl">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest bg-slate-500/20 text-slate-300 border border-slate-500/30">
              Système & Sécurité
            </span>
            <span className="text-xs text-slate-400 font-bold">• Réglages Généraux & Traçabilité</span>
          </div>
          <h2 className="text-2xl font-black text-white mt-1">Paramètres de la Plateforme</h2>
        </div>

        {/* Sub-tabs */}
        <div className="flex items-center gap-1 bg-slate-950/60 p-1.5 rounded-2xl border border-white/5">
          <button
            onClick={() => setActiveSubTab('CONFIG')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              activeSubTab === 'CONFIG' ? 'bg-rose-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
            }`}
          >
            Réglages Généraux
          </button>
          <button
            onClick={() => setActiveSubTab('TENANT_SWITCHER')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              activeSubTab === 'TENANT_SWITCHER' ? 'bg-rose-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
            }`}
          >
            Environnements Clients
          </button>
          <button
            onClick={() => setActiveSubTab('LOGS')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              activeSubTab === 'LOGS' ? 'bg-rose-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
            }`}
          >
            Journal d'Audit ({logs.length})
          </button>
        </div>
      </div>

      {/* SUB-TAB 1: GENERAL CONFIG */}
      {activeSubTab === 'CONFIG' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-slate-900/50 border border-white/10 rounded-3xl p-6 backdrop-blur-xl">
            <h3 className="text-base font-black text-white mb-1">Configuration Régionale & Financière</h3>
            <p className="text-xs text-slate-400 mb-6">Paramètres appliqués par défaut aux nouvelles structures clientes</p>

            <form onSubmit={handleSaveConfig} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-400">Nom de la Plateforme</label>
                <input 
                  type="text"
                  value={platformName}
                  onChange={(e) => setPlatformName(e.target.value)}
                  className="w-full mt-1.5 px-4 py-2.5 bg-slate-950 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-rose-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-400">Devise Principale</label>
                  <select
                    value={defaultCurrency}
                    onChange={(e) => setDefaultCurrency(e.target.value)}
                    className="w-full mt-1.5 px-4 py-2.5 bg-slate-950 border border-white/10 rounded-xl text-xs text-slate-300 focus:outline-none focus:border-rose-500"
                  >
                    <option value="FCFA">FCFA (Franc CFA - XAF/XOF)</option>
                    <option value="USD">USD ($)</option>
                    <option value="EUR">EUR (€)</option>
                    <option value="MAD">MAD (Dirham)</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-400">Langue du Système</label>
                  <select
                    value={defaultLanguage}
                    onChange={(e) => setDefaultLanguage(e.target.value)}
                    className="w-full mt-1.5 px-4 py-2.5 bg-slate-950 border border-white/10 rounded-xl text-xs text-slate-300 focus:outline-none focus:border-rose-500"
                  >
                    <option value="Français">Français</option>
                    <option value="Anglais">English</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-400">Email Support / Facturation</label>
                <input 
                  type="email"
                  value={supportEmail}
                  onChange={(e) => setSupportEmail(e.target.value)}
                  className="w-full mt-1.5 px-4 py-2.5 bg-slate-950 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-rose-500"
                />
              </div>

              <div className="pt-4 border-t border-white/5 flex justify-end">
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-6 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-rose-900/30 transition-all disabled:opacity-50"
                >
                  {isSaving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                  Enregistrer les Réglages
                </button>
              </div>
            </form>
          </div>

          <div className="bg-slate-900/50 border border-white/10 rounded-3xl p-6 backdrop-blur-xl flex flex-col justify-between">
            <div>
              <h3 className="text-base font-black text-white mb-1">Architecture & Sécurité Multi-Tenant</h3>
              <p className="text-xs text-slate-400 mb-6">Contrôles de cloisonnement logique des données hospitalières</p>

              <div className="space-y-3 text-xs">
                <div className="p-4 bg-slate-950/60 border border-white/5 rounded-2xl flex items-start gap-3">
                  <Shield size={20} className="text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-white">Isolation Stricte des Dossiers Patients</p>
                    <p className="text-slate-400 mt-0.5">
                      Les consultations, admissions, ordonnances et paiements de chaque établissement sont partitionnés par tenant unique.
                    </p>
                  </div>
                </div>

                <div className="p-4 bg-slate-950/60 border border-white/5 rounded-2xl flex items-start gap-3">
                  <Database size={20} className="text-blue-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-white">Chiffrement & Règles Firestore Zero-Trust</p>
                    <p className="text-slate-400 mt-0.5">
                      Règles de sécurité Firestore garantissant que les administrateurs locaux ne peuvent modifier ni leurs licences ni les modules autorisés.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-[11px] text-rose-300">
              <span className="font-bold">Espace Réservé :</span> Seule l'équipe Super Administrateur de SmartHosto dispose de l'accès à ce portail.
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 2: TENANT SWITCHER (IMPERSONATION / INSPECTION) */}
      {activeSubTab === 'TENANT_SWITCHER' && (
        <div className="bg-slate-900/50 border border-white/10 rounded-3xl p-6 backdrop-blur-xl">
          <div className="max-w-2xl mb-6">
            <h3 className="text-base font-black text-white">Inspection d'un Établissement Client</h3>
            <p className="text-xs text-slate-400 mt-1">
              Permet au Super Administrateur d'ouvrir temporairement le contexte isolé d'une clinique spécifique pour tester la visibilité exacte de ses modules à l'accueil.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {clinics.map(clinic => (
              <div 
                key={clinic.id}
                className="bg-slate-950/60 border border-white/5 hover:border-rose-500/40 p-4 rounded-2xl flex flex-col justify-between transition-all"
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase bg-slate-800 text-slate-300">
                      {clinic.licenseType}
                    </span>
                    <span className={`text-[10px] font-black ${clinic.status === 'ACTIVE' ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {clinic.status}
                    </span>
                  </div>
                  <h4 className="font-extrabold text-sm text-white">{clinic.name}</h4>
                  <p className="text-xs text-slate-400">{clinic.city}, {clinic.country}</p>
                </div>

                <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between">
                  <span className="text-[10px] text-slate-500 font-mono">ID: {clinic.id.substring(0, 14)}...</span>
                  {onSwitchTenantContext && (
                    <button
                      onClick={() => onSwitchTenantContext(clinic)}
                      className="px-3 py-1.5 bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                    >
                      Inspecter Accueil →
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SUB-TAB 3: AUDIT LOGS */}
      {activeSubTab === 'LOGS' && (
        <div className="bg-slate-900/50 border border-white/10 rounded-3xl p-6 backdrop-blur-xl space-y-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-black text-white">Journal d'Audit des Opérations Super Admin</h3>
              <p className="text-xs text-slate-400">Traçabilité complète des créations, modifications de droits et licences</p>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                <input 
                  type="text"
                  placeholder="Filtrer les actions..."
                  value={logSearch}
                  onChange={(e) => setLogSearch(e.target.value)}
                  className="pl-8 pr-3 py-1.5 bg-slate-950 border border-white/10 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none"
                />
              </div>

              <select
                value={logCategoryFilter}
                onChange={(e) => setLogCategoryFilter(e.target.value)}
                className="px-3 py-1.5 bg-slate-950 border border-white/10 rounded-xl text-xs text-slate-300 focus:outline-none"
              >
                <option value="ALL">Toutes catégories</option>
                <option value="SECURITY">Sécurité</option>
                <option value="LICENSE">Licences</option>
                <option value="MODULE">Modules</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-white/5 text-[10px] font-black text-slate-400 uppercase tracking-wider">
                  <th className="pb-3">Horodatage</th>
                  <th className="pb-3">Opérateur</th>
                  <th className="pb-3">Action</th>
                  <th className="pb-3">Établissement</th>
                  <th className="pb-3">Détails</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredLogs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-500 font-bold">
                      Aucune entrée d'audit enregistrée.
                    </td>
                  </tr>
                ) : (
                  filteredLogs.map(log => (
                    <tr key={log.id || `${log.timestamp}-${Math.random()}`} className="hover:bg-white/[0.02]">
                      <td className="py-3 text-slate-400 font-mono text-[11px] whitespace-nowrap">
                        {log.timestamp}
                      </td>
                      <td className="py-3 font-bold text-purple-300">
                        {log.user}
                      </td>
                      <td className="py-3">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-white/5 text-slate-200">
                          {log.action}
                        </span>
                      </td>
                      <td className="py-3 text-slate-300 font-bold">
                        {log.clinicName || 'Plateforme'}
                      </td>
                      <td className="py-3 text-slate-400 max-w-md truncate">
                        {log.details}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  );
};
