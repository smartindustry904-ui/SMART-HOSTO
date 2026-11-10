
import React, { useState, useEffect, useMemo } from 'react';
import { Bed, Room, BedStatus, BedCategory, User, EstablishmentConfig } from '../../types';
import { db, sanitizeData } from '../../src/firebase';
import { collection, onSnapshot, doc, setDoc, deleteDoc, updateDoc } from 'firebase/firestore';
import { Plus, Trash2, Edit2, Save, X, Bed as BedIcon, Building2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { getActiveTenantId, belongsToTenant, stampTenantData } from '../../src/utils/tenant';

interface HospitalizationSetupProps {
  showMessage: (type: 'success' | 'error', text: string) => void;
  user?: User | null;
  establishment?: EstablishmentConfig;
}

export default function HospitalizationSetup({ showMessage, user, establishment }: HospitalizationSetupProps) {
  const activeTenantId = useMemo(() => getActiveTenantId(user, establishment), [user, establishment]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [beds, setBeds] = useState<Bed[]>([]);
  const [showRoomForm, setShowRoomForm] = useState(false);
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);
  const [roomForm, setRoomForm] = useState({ name: '', description: '', capacity: 0 });

  const [showBedForm, setShowBedForm] = useState(false);
  const [editingBed, setEditingBed] = useState<Bed | null>(null);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [bedForm, setBedForm] = useState<{ name: string; status: BedStatus; category: BedCategory }>({
    name: '',
    status: 'AVAILABLE',
    category: 'hospitalisation'
  });

  const [isSavingRoom, setIsSavingRoom] = useState(false);
  const [isSavingBed, setIsSavingBed] = useState(false);
  const [deletingRoomId, setDeletingRoomId] = useState<string | null>(null);
  const [deletingBedId, setDeletingBedId] = useState<string | null>(null);

  useEffect(() => {
    const unsubRooms = onSnapshot(collection(db, 'rooms'), (snap) => {
      const allRooms = snap.docs.map(d => ({ id: d.id, ...d.data() } as Room));
      setRooms(allRooms.filter(r => belongsToTenant(r, activeTenantId)));
    });
    const unsubBeds = onSnapshot(collection(db, 'beds'), (snap) => {
      const allBeds = snap.docs.map(d => ({ id: d.id, ...d.data() } as Bed));
      setBeds(allBeds.filter(b => belongsToTenant(b, activeTenantId)));
    });
    return () => {
      unsubRooms();
      unsubBeds();
    };
  }, [activeTenantId]);

  const handleSaveRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSavingRoom) return;
    setIsSavingRoom(true);
    try {
      const id = editingRoom?.id || Math.random().toString(36).substr(2, 9);
      await setDoc(doc(db, 'rooms', id), sanitizeData(stampTenantData({
        ...roomForm,
        id
      }, user, establishment)), { merge: true });
      showMessage('success', editingRoom ? 'Chambre modifiée' : 'Chambre créée');
      setShowRoomForm(false);
      setEditingRoom(null);
      setRoomForm({ name: '', description: '', capacity: 0 });
    } catch (error) {
      console.error("Error saving room:", error);
      showMessage('error', "Erreur lors de l'enregistrement");
    } finally {
      setIsSavingRoom(false);
    }
  };

  const handleDeleteRoom = async (id: string) => {
    if (confirm("Supprimer cette chambre et tous ses lits associés ?")) {
      setDeletingRoomId(id);
      try {
        await deleteDoc(doc(db, 'rooms', id));
        const associatedBeds = beds.filter(b => b.roomId === id);
        for (const bed of associatedBeds) {
          await deleteDoc(doc(db, 'beds', bed.id));
        }
        showMessage('success', 'Chambre supprimée');
      } catch (error) {
        showMessage('error', 'Erreur lors de la suppression');
      } finally {
        setDeletingRoomId(null);
      }
    }
  };

  const handleSaveBed = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRoomId || isSavingBed) return;
    setIsSavingBed(true);
    try {
      const id = editingBed?.id || Math.random().toString(36).substr(2, 9);
      await setDoc(doc(db, 'beds', id), sanitizeData(stampTenantData({
        ...bedForm,
        id,
        roomId: selectedRoomId,
        lastUpdated: new Date().toISOString()
      }, user, establishment)), { merge: true });
      showMessage('success', editingBed ? 'Lit modifié avec succès' : 'Lit ajouté avec succès');
      setShowBedForm(false);
      setEditingBed(null);
      setBedForm({ name: '', status: 'AVAILABLE', category: 'hospitalisation' });
    } catch (error) {
      console.error("Error saving bed:", error);
      showMessage('error', "Erreur lors de l'enregistrement du lit");
    } finally {
      setIsSavingBed(false);
    }
  };

  const handleDeleteBed = async (id: string) => {
    if (confirm("Supprimer ce lit ?")) {
      setDeletingBedId(id);
      try {
        await deleteDoc(doc(db, 'beds', id));
        showMessage('success', 'Lit supprimé');
      } catch (error) {
        showMessage('error', 'Erreur lors de la suppression');
      } finally {
        setDeletingBedId(null);
      }
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Configuration des Chambres & Lits</h2>
          <p className="text-sm text-slate-500 font-medium mt-1">Gérez l'infrastructure physique de l'hospitalisation</p>
        </div>
        <button
          onClick={() => {
            setEditingRoom(null);
            setRoomForm({ name: '', description: '', capacity: 0 });
            setShowRoomForm(true);
          }}
          className="bg-blue-600 text-white font-bold px-4 py-2 rounded-xl flex items-center gap-2 hover:bg-blue-700 transition-colors shadow-lg shadow-blue-600/20 text-sm"
        >
          <Plus size={16} />
          Nouvelle Chambre
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {rooms.map(room => (
          <div key={room.id} className="bg-white border border-slate-100 rounded-[32px] p-6 shadow-sm hover:border-blue-500/30 transition-all">
            <div className="flex items-start justify-between mb-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center">
                  <Building2 size={24} />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900 uppercase">{room.name}</h3>
                  <p className="text-xs text-slate-500 font-bold">{room.description || 'Pas de description'}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  disabled={deletingRoomId === room.id}
                  onClick={() => {
                    setEditingRoom(room);
                    setRoomForm({ name: room.name, description: room.description || '', capacity: room.capacity });
                    setShowRoomForm(true);
                  }}
                  className="p-2 text-slate-400 hover:text-blue-600 transition-colors disabled:opacity-50"
                >
                  <Edit2 size={16} />
                </button>
                <button 
                  disabled={deletingRoomId === room.id}
                  onClick={() => handleDeleteRoom(room.id)}
                  className="p-2 text-slate-400 hover:text-rose-600 transition-colors disabled:opacity-50"
                >
                  {deletingRoomId === room.id ? (
                    <div className="w-4 h-4 border-2 border-slate-300 border-t-rose-600 rounded-full animate-spin" />
                  ) : (
                    <Trash2 size={16} />
                  )}
                </button>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-slate-50 pb-2">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Liste des Lits</h4>
                <button
                  onClick={() => {
                    setEditingBed(null);
                    setBedForm({ name: '', status: 'AVAILABLE', category: 'hospitalisation' });
                    setSelectedRoomId(room.id);
                    setShowBedForm(true);
                  }}
                  className="text-blue-600 text-[10px] font-black uppercase hover:underline flex items-center gap-1"
                >
                  <Plus size={12} /> Ajouter un lit
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {beds.filter(b => b.roomId === room.id).map(bed => (
                  <div key={bed.id} className="group flex items-center justify-between p-3 bg-slate-50 rounded-2xl hover:bg-white border border-transparent hover:border-slate-100 transition-all">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                        bed.status === 'AVAILABLE' ? 'bg-emerald-50 text-emerald-600' : 
                        bed.status === 'OCCUPIED' ? 'bg-rose-50 text-rose-600' : 
                        'bg-amber-50 text-amber-600'
                      }`}>
                        <BedIcon size={16} />
                      </div>
                      <div>
                        <p className="text-xs font-black text-slate-900">{bed.name}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className={`text-[8px] font-black uppercase tracking-tighter ${
                            bed.status === 'AVAILABLE' ? 'text-emerald-500' : 
                            bed.status === 'OCCUPIED' ? 'text-rose-500' : 
                            'text-amber-500'
                          }`}>{bed.status}</span>
                          <span className="text-slate-300 text-[8px]">•</span>
                          <span className={`text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-tighter ${
                            bed.category === 'materniter' ? 'bg-pink-100 text-pink-700' :
                            bed.category === 'all' ? 'bg-indigo-100 text-indigo-700' :
                            bed.category === 'other' ? 'bg-slate-200 text-slate-700' :
                            'bg-blue-100 text-blue-700'
                          }`}>
                            {bed.category === 'materniter' ? 'Maternité' :
                             bed.category === 'all' ? 'Tous Services' :
                             bed.category === 'other' ? 'Autre' : 'Hospitalisation'}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                      <button 
                        disabled={deletingBedId === bed.id}
                        onClick={() => {
                          setEditingBed(bed);
                          setBedForm({ name: bed.name, status: bed.status, category: bed.category || 'hospitalisation' });
                          setSelectedRoomId(bed.roomId);
                          setShowBedForm(true);
                        }}
                        className="p-1 text-slate-400 hover:text-blue-600 transition-all disabled:opacity-50"
                        title="Modifier"
                      >
                        <Edit2 size={12} />
                      </button>
                      <button 
                        disabled={deletingBedId === bed.id}
                        onClick={() => handleDeleteBed(bed.id)}
                        className="p-1 text-slate-300 hover:text-rose-500 transition-all disabled:opacity-50"
                        title="Supprimer"
                      >
                        {deletingBedId === bed.id ? (
                          <div className="w-3 h-3 border border-slate-300 border-t-rose-500 rounded-full animate-spin" />
                        ) : (
                          <Trash2 size={12} />
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Room Modal */}
      {showRoomForm && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-md p-8">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">
                {editingRoom ? 'Modifier la Chambre' : 'Nouvelle Chambre'}
              </h3>
              <button onClick={() => setShowRoomForm(false)} className="text-slate-400 hover:text-slate-600">
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handleSaveRoom} className="space-y-4">
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Nom de la chambre</label>
                <input 
                  type="text" 
                  required
                  placeholder="Ex: Ward A, VIP 1..."
                  className="w-full px-4 py-3 rounded-2xl border border-slate-200 focus:ring-2 ring-blue-500/20 outline-none"
                  value={roomForm.name}
                  onChange={e => setRoomForm({...roomForm, name: e.target.value})}
                />
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Description</label>
                <textarea 
                  placeholder="Ex: Service Médecine, 3ème étage..."
                  className="w-full px-4 py-3 rounded-2xl border border-slate-200 focus:ring-2 ring-blue-500/20 outline-none min-h-[100px]"
                  value={roomForm.description}
                  onChange={e => setRoomForm({...roomForm, description: e.target.value})}
                />
              </div>
              <button 
                type="submit"
                disabled={isSavingRoom}
                className="w-full py-4 bg-blue-600 text-white font-black uppercase tracking-widest rounded-2xl shadow-lg shadow-blue-600/20 hover:bg-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isSavingRoom ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Enregistrement...</span>
                  </>
                ) : (
                  editingRoom ? 'Enregistrer les modifications' : 'Créer la chambre'
                )}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Bed Modal */}
      {showBedForm && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-md p-8">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">
                {editingBed ? 'Modifier le Lit' : 'Ajouter un Lit'}
              </h3>
              <button 
                onClick={() => !isSavingBed && setShowBedForm(false)} 
                disabled={isSavingBed}
                className="text-slate-400 hover:text-slate-600 disabled:opacity-50"
              >
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handleSaveBed} className="space-y-4">
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Nom / Numéro du lit</label>
                <input 
                  type="text" 
                  required
                  placeholder="Ex: Lit 01, Lit B..."
                  className="w-full px-4 py-3 rounded-2xl border border-slate-200 focus:ring-2 ring-blue-500/20 outline-none font-bold text-slate-900"
                  value={bedForm.name}
                  onChange={e => setBedForm({...bedForm, name: e.target.value})}
                />
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">
                  Catégorie du Lit <span className="text-rose-500">*</span>
                </label>
                <select 
                  required
                  className="w-full px-4 py-3 rounded-2xl border border-slate-200 focus:ring-2 ring-blue-500/20 outline-none font-bold text-slate-900"
                  value={bedForm.category}
                  onChange={e => setBedForm({...bedForm, category: e.target.value as BedCategory})}
                >
                  <option value="hospitalisation">Hospitalisation Général</option>
                  <option value="materniter">Maternité (Salle de Travail / Postpartum)</option>
                  <option value="all">Tous Services (Universel / Partagé)</option>
                  <option value="other">Autre Service</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Statut initial</label>
                <select 
                  className="w-full px-4 py-3 rounded-2xl border border-slate-200 focus:ring-2 ring-blue-500/20 outline-none font-bold text-slate-900"
                  value={bedForm.status}
                  onChange={e => setBedForm({...bedForm, status: e.target.value as BedStatus})}
                >
                  <option value="AVAILABLE">Disponible</option>
                  <option value="OCCUPIED">Occupé</option>
                  <option value="MAINTENANCE">Maintenance</option>
                </select>
              </div>
              <button 
                type="submit"
                disabled={isSavingBed}
                className="w-full py-4 bg-blue-600 text-white font-black uppercase tracking-widest rounded-2xl shadow-lg shadow-blue-600/20 hover:bg-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isSavingBed ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Enregistrement...</span>
                  </>
                ) : (
                  editingBed ? 'Enregistrer les modifications' : 'Générer le lit'
                )}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
