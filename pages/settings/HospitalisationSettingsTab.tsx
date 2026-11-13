import React, { useState, useEffect, useMemo } from 'react';
import { BedDouble, Building2, DoorOpen, Plus, Trash2, CheckCircle2, Edit3, Loader2 } from 'lucide-react';
import { collection, doc, setDoc, deleteDoc, onSnapshot } from 'firebase/firestore';
import { db, sanitizeData } from '../../src/firebase';
import { getActiveTenantId, belongsToTenant, stampTenantData } from '../../src/utils/tenant';
import { normalizeBedStatus } from '../../src/utils/hospitalisation';
import { Ward, Room, Bed } from '../../types';

interface HospitalisationSettingsTabProps {
  user?: any;
  establishment?: any;
  currency?: string;
  showMessage?: (type: 'success' | 'error', text: string) => void;
}

export const HospitalisationSettingsTab: React.FC<HospitalisationSettingsTabProps> = ({
  user,
  establishment,
  currency = 'FCFA',
  showMessage
}) => {
  const activeTenantId = useMemo(() => getActiveTenantId(user, establishment), [user, establishment]);
  const [wards, setWards] = useState<Ward[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [beds, setBeds] = useState<Bed[]>([]);

  const [wardName, setWardName] = useState('');
  const [wardService, setWardService] = useState('Médecine Générale');

  const [roomName, setRoomName] = useState('');
  const [roomWardId, setRoomWardId] = useState('');
  const [roomCapacity, setRoomCapacity] = useState('2');

  const [bedName, setBedName] = useState('');
  const [bedRoomId, setBedRoomId] = useState('');
  const [bedDailyRate, setBedDailyRate] = useState('15000');
  const [editingBedId, setEditingBedId] = useState<string | null>(null);
  const [isSavingWard, setIsSavingWard] = useState(false);
  const [isSavingRoom, setIsSavingRoom] = useState(false);
  const [isSavingBed, setIsSavingBed] = useState(false);

  useEffect(() => {
    const unsubWards = onSnapshot(collection(db, 'wards'), (snap) => {
      setWards(snap.docs.map(d => ({ id: d.id, ...d.data() } as Ward)).filter(w => belongsToTenant(w, activeTenantId)));
    });
    const unsubRooms = onSnapshot(collection(db, 'rooms'), (snap) => {
      setRooms(snap.docs.map(d => ({ id: d.id, ...d.data() } as Room)).filter(r => belongsToTenant(r, activeTenantId)));
    });
    const unsubBeds = onSnapshot(collection(db, 'beds'), (snap) => {
      setBeds(snap.docs.map(d => ({ id: d.id, ...d.data() } as Bed)).filter(b => belongsToTenant(b, activeTenantId)));
    });
    return () => { unsubWards(); unsubRooms(); unsubBeds(); };
  }, [activeTenantId]);

  const handleAddWard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wardName.trim() || isSavingWard) return;
    setIsSavingWard(true);
    try {
      const id = `${activeTenantId}_ward_${Date.now()}`;
      await setDoc(doc(db, 'wards', id), sanitizeData(stampTenantData({
        id,
        name: wardName.trim(),
        service: wardService.trim() || 'Médecine Générale',
        createdAt: new Date().toISOString()
      }, user, establishment)));
      setWardName('');
      showMessage?.('success', 'Pavillon ajouté avec succès');
    } finally {
      setIsSavingWard(false);
    }
  };

  const handleAddRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomName.trim() || isSavingRoom) return;
    setIsSavingRoom(true);
    try {
      const ward = wards.find(w => w.id === roomWardId);
      const id = `${activeTenantId}_room_${Date.now()}`;
      await setDoc(doc(db, 'rooms', id), sanitizeData(stampTenantData({
        id,
        name: roomName.trim(),
        wardId: ward?.id || '',
        wardName: ward?.name || 'Pavillon Général',
        description: ward?.name || 'Hospitalisation',
        capacity: Math.max(1, Number(roomCapacity) || 2),
        createdAt: new Date().toISOString()
      }, user, establishment)));
      setRoomName('');
      showMessage?.('success', 'Chambre ajoutée avec succès');
    } finally {
      setIsSavingRoom(false);
    }
  };

  const handleSaveBed = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bedName.trim() || !bedRoomId || isSavingBed) return;
    setIsSavingBed(true);
    try {
      const room = rooms.find(r => r.id === bedRoomId);
      const ward = wards.find(w => w.id === room?.wardId);
      const rate = Math.max(0, Number(bedDailyRate) || 0);
      const id = editingBedId || `${activeTenantId}_bed_${Date.now()}`;

      await setDoc(doc(db, 'beds', id), sanitizeData(stampTenantData({
        id,
        name: bedName.trim(),
        roomId: room?.id || bedRoomId,
        roomName: room?.name || '',
        wardId: ward?.id || room?.wardId || '',
        wardName: ward?.name || room?.wardName || '',
        service: ward?.service || 'Hospitalisation',
        dailyRate: rate,
        tarifJournalier: rate,
        category: 'hospitalisation',
        ...(editingBedId ? {} : { status: 'LIBRE', createdAt: new Date().toISOString() }),
        lastUpdated: new Date().toISOString()
      }, user, establishment)), { merge: true });

      setBedName('');
      setEditingBedId(null);
      showMessage?.('success', editingBedId ? 'Lit mis à jour' : 'Lit ajouté avec succès');
    } finally {
      setIsSavingBed(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center">
            <BedDouble size={20} />
          </div>
          <div>
            <h3 className="text-lg font-black text-slate-900">Paramétrage Hospitalisation — Pavillons, Chambres & Lits</h3>
            <p className="text-xs text-slate-500 font-medium">Configurez les pavillons, chambres et tarifs journaliers de chaque lit pour la facturation automatique.</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* 1. Pavillons */}
        <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-xs space-y-4">
          <h4 className="font-black text-sm text-slate-900 flex items-center gap-2">
            <Building2 size={16} className="text-blue-600" /> 1. Pavillons ({wards.length})
          </h4>
          <form onSubmit={handleAddWard} className="space-y-2.5">
            <input
              type="text"
              value={wardName}
              onChange={(e) => setWardName(e.target.value)}
              placeholder="Nom du pavillon (ex: Pavillon Pédiatrie)"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-blue-500"
              required
            />
            <input
              type="text"
              value={wardService}
              onChange={(e) => setWardService(e.target.value)}
              placeholder="Service associé (ex: Pédiatrie)"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold outline-none focus:border-blue-500"
            />
            <button type="submit" disabled={isSavingWard} className="w-full py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer">
              {isSavingWard ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} {isSavingWard ? 'Ajout...' : 'Ajouter Pavillon'}
            </button>
          </form>
          <div className="divide-y divide-slate-100 max-h-60 overflow-y-auto">
            {wards.map(w => (
              <div key={w.id} className="py-2 flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-extrabold text-slate-800">{w.name}</p>
                  <p className="text-[10px] text-slate-500">{w.service}</p>
                </div>
                <button onClick={() => deleteDoc(doc(db, 'wards', w.id))} className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg cursor-pointer">
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* 2. Chambres */}
        <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-xs space-y-4">
          <h4 className="font-black text-sm text-slate-900 flex items-center gap-2">
            <DoorOpen size={16} className="text-emerald-600" /> 2. Chambres ({rooms.length})
          </h4>
          <form onSubmit={handleAddRoom} className="space-y-2.5">
            <select
              value={roomWardId}
              onChange={(e) => setRoomWardId(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-emerald-500"
            >
              <option value="">-- Pavillon (Optionnel) --</option>
              {wards.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
            <div className="flex gap-2">
              <input
                type="text"
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                placeholder="Nom chambre (ex: Chambre 12)"
                className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-emerald-500"
                required
              />
              <input
                type="number"
                min={1}
                value={roomCapacity}
                onChange={(e) => setRoomCapacity(e.target.value)}
                title="Capacité"
                className="w-16 px-2 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-center outline-none"
              />
            </div>
            <button type="submit" disabled={isSavingRoom} className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer">
              {isSavingRoom ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} {isSavingRoom ? 'Ajout...' : 'Ajouter Chambre'}
            </button>
          </form>
          <div className="divide-y divide-slate-100 max-h-60 overflow-y-auto">
            {rooms.map(r => (
              <div key={r.id} className="py-2 flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-extrabold text-slate-800">{r.name}</p>
                  <p className="text-[10px] text-slate-500">{r.wardName || r.description || 'Général'} • {r.capacity} lits</p>
                </div>
                <button onClick={() => deleteDoc(doc(db, 'rooms', r.id))} className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg cursor-pointer">
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* 3. Lits & Tarif Journalier */}
        <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-xs space-y-4">
          <h4 className="font-black text-sm text-slate-900 flex items-center gap-2">
            <BedDouble size={16} className="text-indigo-600" /> 3. Lits & Tarifs ({beds.length})
          </h4>
          <form onSubmit={handleSaveBed} className="space-y-2.5">
            <select
              value={bedRoomId}
              onChange={(e) => setBedRoomId(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-indigo-500"
              required
            >
              <option value="">-- Sélectionner une Chambre * --</option>
              {rooms.map(r => <option key={r.id} value={r.id}>{r.name} {r.wardName ? `(${r.wardName})` : ''}</option>)}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                value={bedName}
                onChange={(e) => setBedName(e.target.value)}
                placeholder="Nom lit (ex: Lit B)"
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-indigo-500"
                required
              />
              <input
                type="number"
                min={0}
                value={bedDailyRate}
                onChange={(e) => setBedDailyRate(e.target.value)}
                placeholder="Tarif / jour"
                className="px-3 py-2 bg-slate-50 border border-indigo-200 rounded-xl text-xs font-black text-indigo-700 outline-none focus:border-indigo-500"
                required
              />
            </div>
            <button type="submit" disabled={isSavingBed} className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer">
              {isSavingBed ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} {isSavingBed ? 'Enregistrement...' : (editingBedId ? 'Mettre à jour le Lit' : 'Ajouter Lit & Tarif')}
            </button>
          </form>
          <div className="divide-y divide-slate-100 max-h-60 overflow-y-auto">
            {beds.map(b => {
              const room = rooms.find(r => r.id === b.roomId);
              const rate = Number(b.dailyRate ?? b.tarifJournalier ?? 0);
              return (
                <div key={b.id} className="py-2 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-extrabold text-slate-800 truncate">
                      {room?.name || b.roomName || 'Chambre'} — {b.name}
                    </p>
                    <p className="text-[10px] font-bold text-indigo-600">
                      {rate.toLocaleString()} {currency} / jour •{' '}
                      <span className={
                        normalizeBedStatus(b.status) === 'OCCUPÉ'
                          ? 'text-rose-600'
                          : normalizeBedStatus(b.status) === 'EN NETTOYAGE'
                            ? 'text-amber-600'
                            : 'text-emerald-600'
                      }>
                        {normalizeBedStatus(b.status)}
                      </span>
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingBedId(b.id);
                        setBedName(b.name);
                        setBedRoomId(b.roomId);
                        setBedDailyRate(String(rate));
                      }}
                      className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg cursor-pointer"
                    >
                      <Edit3 size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteDoc(doc(db, 'beds', b.id))}
                      className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg cursor-pointer"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
