import React, { useState, useEffect, useMemo } from 'react';
import { X, BedDouble, CheckCircle2, AlertCircle, Building2, Loader2 } from 'lucide-react';
import { db, sanitizeData } from '../../src/firebase';
import { collection, onSnapshot, doc, getDoc, writeBatch } from 'firebase/firestore';
import { Bed, Room, User as UserType, EstablishmentConfig } from '../../types';
import { getActiveTenantId, belongsToTenant, stampTenantData } from '../../src/utils/tenant';
import { isBedLibre, isBedOccupe, isBedEnNettoyage, findActiveInpatientLocationFromLists } from '../../src/utils/hospitalisation';

export interface UniversalHospitalisationPatient {
  id: string;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  age?: number | string;
  gender?: string;
  dossier?: string;
  motif?: string;
}

interface UniversalHospitalisationModalProps {
  isOpen: boolean;
  onClose: () => void;
  patient: UniversalHospitalisationPatient | null;
  sourceModule: 'Consultation' | 'Urgences' | 'Soins Infirmiers' | 'Maternité';
  user?: UserType | null;
  establishment?: EstablishmentConfig | null;
  bedCategoryFilter?: 'all' | 'hospitalisation' | 'materniter';
  defaultReason?: string;
  onSuccess?: (bed: Bed, recordId: string) => void | Promise<void>;
}

export const UniversalHospitalisationModal: React.FC<UniversalHospitalisationModalProps> = ({
  isOpen,
  onClose,
  patient,
  sourceModule,
  user,
  establishment,
  bedCategoryFilter = 'all',
  defaultReason = '',
  onSuccess
}) => {
  const activeTenantId = getActiveTenantId(user, establishment);
  const [beds, setBeds] = useState<Bed[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [wards, setWards] = useState<any[]>([]);
  const [selectedBedId, setSelectedBedId] = useState('');
  const [reason, setReason] = useState(defaultReason);
  const [priority, setPriority] = useState<'Normal' | 'Urgent' | 'Critique'>('Normal');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setSelectedBedId('');
    setReason(defaultReason || patient?.motif || `Hospitalisation depuis ${sourceModule}`);
    setPriority(sourceModule === 'Urgences' ? 'Urgent' : 'Normal');
    setErrorMsg(null);
  }, [isOpen, patient?.id, defaultReason, sourceModule]);

  useEffect(() => {
    if (!isOpen) return;
    const unsubBeds = onSnapshot(collection(db, 'beds'), (snap) => {
      const list = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as Bed))
        .filter(b => belongsToTenant(b, activeTenantId));
      setBeds(list);
    });
    const unsubRooms = onSnapshot(collection(db, 'rooms'), (snap) => {
      const list = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as Room))
        .filter(r => belongsToTenant(r, activeTenantId));
      setRooms(list);
    });
    const unsubWards = onSnapshot(collection(db, 'wards'), (snap) => {
      const list = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(w => belongsToTenant(w, activeTenantId));
      setWards(list);
    });
    return () => {
      unsubBeds();
      unsubRooms();
      unsubWards();
    };
  }, [isOpen, activeTenantId]);

  const libreBeds = useMemo(() => {
    return beds.filter(b => {
      if (!isBedLibre(b.status)) return false;
      if (bedCategoryFilter === 'materniter') {
        return !b.category || b.category === 'materniter' || b.category === 'all' || b.category === 'hospitalisation';
      }
      if (bedCategoryFilter === 'hospitalisation') {
        return !b.category || b.category === 'hospitalisation' || b.category === 'all';
      }
      return true;
    });
  }, [beds, bedCategoryFilter]);

  const activeCollision = useMemo(() => {
    if (!patient) return null;
    return findActiveInpatientLocationFromLists({
      patientIds: [patient.id, patient.dossier].filter(Boolean) as string[],
      beds,
      rooms,
    });
  }, [patient, beds, rooms]);

  if (!isOpen || !patient) return null;

  const patientFullName =
    patient.fullName ||
    `${patient.lastName || ''} ${patient.firstName || ''}`.trim() ||
    'Patient';

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (activeCollision) {
      const msg = `❌ Ce patient est déjà hospitalisé (${activeCollision.locationLabel}).`;
      setErrorMsg(msg);
      alert(msg);
      return;
    }
    if (!selectedBedId) {
      setErrorMsg('Veuillez sélectionner un lit libre.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      const bedRef = doc(db, 'beds', selectedBedId);
      const bedSnap = await getDoc(bedRef);
      if (!bedSnap.exists()) {
        throw new Error('Lit introuvable dans la base de données.');
      }
      const bedData = { id: bedSnap.id, ...bedSnap.data() } as Bed;
      if (isBedOccupe(bedData.status) && bedData.patientId !== patient.id) {
        throw new Error(`Le lit ${bedData.name} est déjà occupé par ${bedData.patientName || 'un autre patient'}.`);
      }
      if (isBedEnNettoyage(bedData.status)) {
        throw new Error(`Le lit ${bedData.name} est actuellement EN NETTOYAGE.`);
      }

      const roomObj = rooms.find(r => r.id === bedData.roomId);
      const wardObj = wards.find(w => w.id === (bedData.wardId || (roomObj as any)?.wardId));
      const roomName = roomObj?.name || bedData.roomName || 'Chambre';
      const wardName = wardObj?.name || bedData.wardName || (roomObj as any)?.wardName || '';
      const dailyRate = Number(bedData.dailyRate ?? bedData.tarifJournalier ?? 15000);

      const now = new Date();
      const nowIso = now.toISOString();
      const admDate = nowIso.split('T')[0];
      const admTime = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
      const recordId = `INP-${Date.now()}`;

      const batch = writeBatch(db);

      // 1. Update Bed to OCCUPÉ with admission timestamp
      batch.update(bedRef, sanitizeData({
        status: 'OCCUPÉ',
        patientId: patient.id,
        patientName: patientFullName,
        patientAge: Number(patient.age) || 35,
        patientGender: patient.gender || 'M',
        patientDossier: patient.dossier || patient.id,
        admissionDate: admDate,
        admissionTime: admTime,
        admittedAt: nowIso,
        admissionDoctor: user?.name || sourceModule,
        admissionDoctorId: user?.id || '',
        admissionReason: reason.trim() || `Hospitalisation (${sourceModule})`,
        admissionOrigin: sourceModule,
        priority,
        dailyRate,
        tarifJournalier: dailyRate,
        roomName,
        wardName,
        lastUpdated: nowIso
      }));

      // 2. Create active Inpatient Record
      batch.set(doc(db, 'inpatient_records', recordId), sanitizeData(stampTenantData({
        id: recordId,
        patientId: patient.id,
        patientName: patientFullName,
        patientAge: Number(patient.age) || 35,
        patientGender: patient.gender || 'M',
        patientDossier: patient.dossier || patient.id,
        bedId: bedData.id,
        bedName: bedData.name,
        roomId: bedData.roomId || '',
        roomName,
        wardId: bedData.wardId || wardObj?.id || '',
        wardName,
        dailyRate,
        tarifJournalier: dailyRate,
        admissionDate: admDate,
        admissionTime: admTime,
        admittedAt: nowIso,
        doctorId: user?.id || '',
        doctorName: user?.name || sourceModule,
        reason: reason.trim() || `Hospitalisation (${sourceModule})`,
        origin: sourceModule,
        priority,
        status: 'admitted',
        careCharges: 0,
        createdAt: nowIso,
        lastUpdated: nowIso
      }, user, establishment)));

      // 3. Update patient profile if document exists
      const pRef = doc(db, 'patients', patient.id);
      const pSnap = await getDoc(pRef);
      if (pSnap.exists()) {
        batch.update(pRef, sanitizeData({
          hospitalizationStatus: 'en_cours',
          status: 'hospitalized',
          attente_module: 'Hospitalisation',
          admittedBedId: bedData.id,
          admittedBedName: bedData.name,
          admittedRoomName: roomName,
          admittedWardName: wardName,
          admittedAt: nowIso,
          lastUpdated: nowIso
        }));
      }

      // 4. Audit log
      batch.set(doc(collection(db, 'audit_logs')), sanitizeData(stampTenantData({
        user: user?.name || sourceModule,
        role: user?.role || sourceModule,
        date: now.toLocaleDateString('fr-FR'),
        time: admTime,
        timestamp: nowIso,
        action: `Hospitalisation depuis ${sourceModule} — ${patientFullName} -> ${roomName} / ${bedData.name}`,
        details: { patientId: patient.id, bedId: bedData.id, dailyRate, sourceModule },
        module: sourceModule
      }, user, establishment)));

      await batch.commit();

      if (onSuccess) {
        await onSuccess(bedData, recordId);
      }

      window.dispatchEvent(new CustomEvent('app-notification', {
        detail: {
          message: `${patientFullName} hospitalisé(e) : ${wardName ? `${wardName} • ` : ''}${roomName} — ${bedData.name}.`,
          type: 'success'
        }
      }));
      onClose();
    } catch (err: any) {
      console.error('UniversalHospitalisationModal error:', err);
      setErrorMsg(err?.message || "Erreur lors de l'hospitalisation du patient.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-slate-900/65 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-blue-50 to-indigo-50">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-lg shadow-blue-500/20">
              <BedDouble size={22} />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-900 tracking-tight">Hospitaliser le patient</h3>
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                {patientFullName} • Origine : {sourceModule}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-white rounded-xl transition-colors cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleConfirm} className="p-6 space-y-4">
          {activeCollision && (
            <div className="p-4 bg-rose-50 border-2 border-rose-300 rounded-2xl flex items-start gap-3 text-rose-800 text-xs font-black">
              <AlertCircle size={18} className="shrink-0 text-rose-600 mt-0.5" />
              <div>
                <div>❌ Ce patient est déjà hospitalisé ({activeCollision.locationLabel}).</div>
                <div className="text-[11px] font-semibold text-rose-600 mt-0.5">
                  Impossible d&apos;assigner un deuxième lit. Utilisez un « Transfert de Lit » dans le module Hospitalisation.
                </div>
              </div>
            </div>
          )}

          {errorMsg && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl flex items-center gap-2.5 text-rose-700 text-xs font-bold">
              <AlertCircle size={16} className="shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div>
            <label className="block text-[11px] font-black uppercase tracking-wider text-slate-600 mb-1.5 flex items-center gap-1.5">
              <Building2 size={13} className="text-blue-600" />
              <span>Lit Disponible (LIBRE uniquement — {libreBeds.length})</span>
            </label>
            <select
              required
              value={selectedBedId}
              onChange={(e) => setSelectedBedId(e.target.value)}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">-- Sélectionner un lit libre --</option>
              {libreBeds.map(b => {
                const room = rooms.find(r => r.id === b.roomId);
                const ward = wards.find(w => w.id === (b.wardId || (room as any)?.wardId));
                const rate = Number(b.dailyRate ?? b.tarifJournalier ?? 15000);
                const wLabel = ward?.name || b.wardName ? `${ward?.name || b.wardName} • ` : '';
                const rLabel = room?.name || b.roomName || 'Chambre';
                return (
                  <option key={b.id} value={b.id}>
                    {wLabel}{rLabel} — {b.name} ({rate.toLocaleString()} FCFA/jour)
                  </option>
                );
              })}
            </select>
            {libreBeds.length === 0 && (
              <p className="text-[11px] text-rose-600 font-bold mt-1.5">
                Aucun lit LIBRE disponible dans les paramètres. Configurez des lits dans Paramètres &gt; Hospitalisation ou libérez un lit en nettoyage.
              </p>
            )}
          </div>

          <div className="grid grid-cols-3 gap-2">
            {(['Normal', 'Urgent', 'Critique'] as const).map(p => (
              <button
                key={p}
                type="button"
                onClick={() => setPriority(p)}
                className={`py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider border transition-all cursor-pointer ${
                  priority === p
                    ? p === 'Critique'
                      ? 'bg-rose-600 text-white border-rose-600'
                      : p === 'Urgent'
                        ? 'bg-amber-500 text-white border-amber-500'
                        : 'bg-blue-600 text-white border-blue-600'
                    : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'
                }`}
              >
                {p}
              </button>
            ))}
          </div>

          <div>
            <label className="block text-[11px] font-black uppercase tracking-wider text-slate-600 mb-1.5">
              Motif d'hospitalisation
            </label>
            <textarea
              rows={2}
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Diagnostic d'entrée, surveillance post-opératoire..."
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs cursor-pointer"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={Boolean(activeCollision) || isSubmitting || libreBeds.length === 0 || !selectedBedId}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl font-black text-xs uppercase tracking-wider shadow-lg shadow-blue-500/20 flex items-center gap-2 cursor-pointer"
            >
              {isSubmitting ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
              <span>{isSubmitting ? 'Admission...' : 'Confirmer Hospitalisation'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
