
import React, { useState, useEffect } from 'react';
import { Users, Shield, Award, Clock, TrendingUp, Settings, ChevronRight, Loader2, Home, Plus, X, Trash2, CheckCircle2, AlertCircle } from 'lucide-react';
import { collection, onSnapshot, query, orderBy, limit, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../src/firebase';
import { MicroHeader } from '../components/common/MicroHeader';
import { Avatar } from '../components/common/Avatar';
import { ImageUpload } from '../components/common/ImageUpload';
import { sanitizeData } from '../src/firebase';

interface PersonnelProps {
  onBackToDashboard?: () => void;
  user?: any;
}

const Personnel: React.FC<PersonnelProps> = ({ onBackToDashboard, user }) => {
  const [staff, setStaff] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingStaff, setEditingStaff] = useState<any | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    role: 'Médecin',
    specialty: 'Médecine Générale',
    rate: '15%',
    profile_image_url: '',
    phone: '',
    email: ''
  });

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  };

  useEffect(() => {
    const unsubStaff = onSnapshot(collection(db, 'staff'), (snapshot) => {
      const staffList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      if (staffList.length === 0) {
        // Fallback to defaults if DB is empty (first run)
        const defaults = [
          { id: 'staff_1', name: 'Dr. Sarr Ousmane', role: 'Médecin Chef', specialty: 'Gynécologie', actions: 124, fees: '185,000', rate: '20%', profile_image_url: '' },
          { id: 'staff_2', name: 'Dr. Keita Ibrahim', role: 'Médecin', specialty: 'Pédiatrie', actions: 89, fees: '95,000', rate: '15%', profile_image_url: '' },
          { id: 'staff_3', name: 'Inf. Marie Gomis', role: 'Infirmière', specialty: 'Maternité', actions: 245, fees: '25,000', rate: '2%', profile_image_url: '' },
          { id: 'staff_4', name: 'Mme Cissé Fatou', role: 'Caissière', specialty: 'Finances', actions: 567, fees: '0', rate: '0%', profile_image_url: '' },
        ];
        setStaff(defaults);
      } else {
        setStaff(staffList);
      }
      setIsLoading(false);
    });

    const unsubLogs = onSnapshot(query(collection(db, 'audit_logs'), orderBy('timestamp', 'desc'), limit(10)), (snapshot) => {
      setLogs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => {
      unsubStaff();
      unsubLogs();
    };
  }, []);

  const handleOpenAddModal = () => {
    setEditingStaff(null);
    setFormData({
      name: '',
      role: 'Médecin',
      specialty: 'Médecine Générale',
      rate: '15%',
      profile_image_url: '',
      phone: '',
      email: ''
    });
    setShowModal(true);
  };

  const handleOpenEditModal = (member: any) => {
    setEditingStaff(member);
    setFormData({
      name: member.name || '',
      role: member.role || 'Médecin',
      specialty: member.specialty || '',
      rate: member.rate || '15%',
      profile_image_url: member.profile_image_url || member.profileImage || '',
      phone: member.phone || '',
      email: member.email || ''
    });
    setShowModal(true);
  };

  const handleSaveStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      showToast("Le nom du personnel est obligatoire", "error");
      return;
    }

    setIsSaving(true);
    try {
      const staffId = editingStaff?.id || `staff_${Date.now()}`;
      const staffRef = doc(db, 'staff', staffId);
      
      const payload = {
        ...formData,
        id: staffId,
        updatedAt: new Date().toISOString(),
        ...(editingStaff ? {} : { createdAt: new Date().toISOString(), actions: 0, fees: '0' })
      };

      await setDoc(staffRef, sanitizeData(payload), { merge: true });
      setShowModal(false);
      showToast(editingStaff ? "Profil personnel mis à jour avec succès" : "Nouveau membre du personnel enregistré avec succès");
    } catch (err) {
      console.error("Error saving staff:", err);
      showToast("Erreur lors de l'enregistrement du personnel", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteStaff = async (staffId: string) => {
    if (!window.confirm("Êtes-vous sûr de vouloir supprimer ce membre du personnel ?")) return;
    try {
      await deleteDoc(doc(db, 'staff', staffId));
      setShowModal(false);
      showToast("Personnel supprimé de l'annuaire");
    } catch (err) {
      console.error("Error deleting staff:", err);
      showToast("Erreur lors de la suppression", "error");
    }
  };

  if (isLoading) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-20">
        <Loader2 size={48} className="text-blue-600 animate-spin mb-4" />
        <p className="text-slate-500 font-bold italic">Chargement du personnel...</p>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden p-3 sm:p-5 font-sans bg-slate-50 text-slate-900">
      {/* Toast Notification */}
      {notification && (
        <div className={`fixed top-5 right-5 z-[200] px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-5 transition-all ${
          notification.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'
        }`}>
          {notification.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
          <p className="font-bold text-xs">{notification.message}</p>
        </div>
      )}

      <MicroHeader
        icon={Users}
        breadcrumbs={[
          { label: 'Personnel', active: true }
        ]}
        onHomeClick={onBackToDashboard}
        user={{ name: user?.name || 'Administrateur' }}
        actions={
          <button 
            onClick={handleOpenAddModal}
            className="bg-blue-600 text-white px-3.5 py-1.5 rounded-xl font-bold text-xs shadow-xs flex items-center gap-1.5 hover:bg-blue-700 transition-all cursor-pointer"
          >
            <Plus size={14} />
            Nouveau Personnel
          </button>
        }
      />

      <main className="flex-1 min-h-0 overflow-y-auto custom-scrollbar mt-4">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8">
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
               <div className="p-6 border-b bg-slate-50/50 flex justify-between items-center">
                  <h2 className="font-bold flex items-center gap-2 text-slate-900"><Shield size={18} className="text-blue-500" /> Annuaire & Rôles</h2>
                  <span className="text-xs font-bold text-slate-400">{staff.length} Employés actifs</span>
               </div>
               <div className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto custom-scrollbar">
                  {staff.length === 0 ? (
                    <div className="p-12 text-center">
                      <p className="text-slate-400 italic">Aucun personnel enregistré</p>
                    </div>
                  ) : staff.map((s, i) => (
                    <div 
                      key={s.id || i} 
                      onClick={() => handleOpenEditModal(s)}
                      className="p-6 flex items-center justify-between hover:bg-slate-50 transition-all cursor-pointer group"
                    >
                      <div className="flex items-center gap-4">
                        <Avatar user={s} size={48} className="shadow-xs border-2 border-white dark:border-zinc-800" />
                        <div>
                          <h3 className="font-bold text-slate-900 group-hover:text-blue-600 transition-colors">{s.name}</h3>
                          <p className="text-xs text-slate-500">{s.role} • <span className="text-blue-500 font-medium">{s.specialty}</span></p>
                        </div>
                      </div>
                      <div className="flex items-center gap-8">
                        <div className="text-right">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">Actes</p>
                          <p className="font-bold text-slate-900">{s.actions || 0}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">Quote-part ({s.rate || '0%'})</p>
                          <p className="font-black text-emerald-600">{s.fees || 0} CFA</p>
                        </div>
                        <ChevronRight size={18} className="text-slate-300 group-hover:text-blue-500" />
                      </div>
                    </div>
                  ))}
               </div>
            </div>
          </div>

          <div className="lg:col-span-4 space-y-6">
            <div className="bg-blue-600 rounded-3xl p-6 text-white shadow-xl shadow-blue-200 relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-10"><Award size={80} /></div>
              <h3 className="font-bold mb-4 flex items-center gap-2 relative z-10">
                <Award size={20} />
                Règle de Commissioning
              </h3>
              <p className="text-sm text-blue-100 mb-6 leading-relaxed relative z-10 font-medium">
                Le système calcule automatiquement les quote-parts sur chaque acte encaissé. Les taux sont définis par profil métier.
              </p>
              <div className="space-y-3 relative z-10">
                {[
                  { label: 'Consultations', rate: '20%' },
                  { label: 'Chirurgies', rate: '35%' },
                  { label: 'Laboratoire', rate: '5%' },
                ].map((r, i) => (
                  <div key={i} className="flex justify-between items-center bg-white/10 p-3 rounded-xl border border-white/10 text-xs font-bold backdrop-blur-sm">
                    <span>{r.label}</span>
                    <span className="bg-white text-blue-700 px-2 py-0.5 rounded-lg">{r.rate}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm overflow-hidden">
              <h4 className="font-bold text-slate-900 mb-4 flex items-center gap-2 border-b pb-3">
                <Clock size={18} className="text-blue-500" />
                Activités Récentes
              </h4>
              <div className="space-y-4 max-h-[400px] overflow-y-auto custom-scrollbar pr-2">
                {logs.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">Aucune activité récente</p>
                ) : logs.map((log, i) => (
                  <div key={log.id || i} className="flex gap-3 text-xs group">
                    <div className="w-1.5 h-1.5 bg-blue-500 rounded-full mt-1 shrink-0"></div>
                    <div>
                      <p className="font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                        {typeof log.user === 'object' ? JSON.stringify(log.user) : String(log.user || 'Système')}
                      </p>
                      <p className="text-slate-500 line-clamp-2 leading-relaxed">
                        {typeof log.action === 'object' ? JSON.stringify(log.action) : String(log.action || '')}
                      </p>
                      <p className="text-[10px] text-slate-400 font-bold italic mt-1">
                        {typeof log.timestamp === 'string' ? log.timestamp.replace('T', ' ') : String(log.timestamp || '')}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Staff Create / Edit Modal with ImageUpload */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-[32px] w-full max-w-lg shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
                <Users className="text-blue-600" size={20} />
                {editingStaff ? "Modifier Membre du Personnel" : "Nouveau Membre du Personnel"}
              </h3>
              <button 
                onClick={() => setShowModal(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-200 text-slate-400 transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveStaff} className="p-6 space-y-4">
              {/* Profile Photo Upload with Fallback */}
              <ImageUpload
                label="Photo de profil professionnelle"
                currentImageUrl={formData.profile_image_url}
                userId={editingStaff?.id || 'new_staff'}
                onImageUploaded={(url) => setFormData(prev => ({ ...prev, profile_image_url: url }))}
                onImageRemoved={() => setFormData(prev => ({ ...prev, profile_image_url: '' }))}
              />

              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block mb-1">
                  Nom et Prénom *
                </label>
                <input
                  type="text"
                  required
                  placeholder="ex: Dr. Amadou Diallo"
                  value={formData.name}
                  onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block mb-1">
                    Fonction / Rôle
                  </label>
                  <select
                    value={formData.role}
                    onChange={e => setFormData(prev => ({ ...prev, role: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white"
                  >
                    <option value="Médecin Chef">Médecin Chef</option>
                    <option value="Médecin">Médecin</option>
                    <option value="Spécialiste">Spécialiste</option>
                    <option value="Chirurgien">Chirurgien</option>
                    <option value="Infirmier">Infirmier</option>
                    <option value="Sage-femme">Sage-femme</option>
                    <option value="Pharmacien">Pharmacien</option>
                    <option value="Caissier">Caissier</option>
                    <option value="Laborantin">Laborantin</option>
                    <option value="Administrateur">Administrateur</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block mb-1">
                    Spécialité
                  </label>
                  <input
                    type="text"
                    placeholder="ex: Cardiologie"
                    value={formData.specialty}
                    onChange={e => setFormData(prev => ({ ...prev, specialty: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block mb-1">
                    Quote-part (%)
                  </label>
                  <input
                    type="text"
                    placeholder="ex: 20%"
                    value={formData.rate}
                    onChange={e => setFormData(prev => ({ ...prev, rate: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block mb-1">
                    Téléphone
                  </label>
                  <input
                    type="tel"
                    placeholder="ex: +221 77 000 00 00"
                    value={formData.phone}
                    onChange={e => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
                {editingStaff ? (
                  <button
                    type="button"
                    onClick={() => handleDeleteStaff(editingStaff.id)}
                    className="px-4 py-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold text-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <Trash2 size={14} /> Supprimer
                  </button>
                ) : <div />}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="px-4 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 font-bold text-xs transition-colors cursor-pointer"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {isSaving && <Loader2 size={14} className="animate-spin" />}
                    Enregistrer
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Personnel;
