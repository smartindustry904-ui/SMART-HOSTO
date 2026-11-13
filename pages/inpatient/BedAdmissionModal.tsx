import React, { useState, useEffect } from 'react';
import { 
  X, Search, UserPlus, CheckCircle2, AlertCircle, 
  BedDouble, Calendar, Clock, Stethoscope, Building2, AlertTriangle
} from 'lucide-react';
import { db, sanitizeData } from '../../src/firebase';
import { 
  collection, query, where, getDocs, doc, getDoc, 
  writeBatch, orderBy, limit 
} from 'firebase/firestore';
import { Bed, Room, Patient, User as UserType } from '../../types';
import { stampTenantData } from '../../src/utils/tenant';
import { isBedOccupe, isBedEnNettoyage } from '../../src/utils/hospitalisation';

interface BedAdmissionModalProps {
  isOpen: boolean;
  onClose: () => void;
  availableBeds: Bed[];
  rooms: Room[];
  doctors: UserType[];
  preselectedBedId?: string | null;
  preselectedPatient?: {
    id: string;
    name: string;
    dossier?: string;
    age?: number;
    gender?: string;
    reason?: string;
    service?: string;
    priority?: 'Normal' | 'Urgent' | 'Critique';
    origin?: string;
    requestId?: string;
  } | null;
  currentUser?: UserType;
  onSuccess?: () => void;
}

export const BedAdmissionModal: React.FC<BedAdmissionModalProps> = ({
  isOpen,
  onClose,
  availableBeds,
  rooms,
  doctors,
  preselectedBedId,
  preselectedPatient,
  currentUser,
  onSuccess
}) => {
  const [patientSearch, setPatientSearch] = useState('');
  const [searchResults, setSearchResults] = useState<Patient[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);

  const [bedId, setBedId] = useState(preselectedBedId || '');
  const [service, setService] = useState('Médecine Générale');
  const [origin, setOrigin] = useState<'Consultation' | 'Urgences' | 'Maternité' | 'Autre'>('Consultation');
  const [doctorId, setDoctorId] = useState(currentUser?.id || '');
  const [doctorName, setDoctorName] = useState(currentUser?.name || '');
  const [admissionDate, setAdmissionDate] = useState(new Date().toISOString().split('T')[0]);
  const [admissionTime, setAdmissionTime] = useState(
    new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  );
  const [priority, setPriority] = useState<'Normal' | 'Urgent' | 'Critique'>('Normal');
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Sync preselected values
  useEffect(() => {
    if (preselectedBedId) {
      setBedId(preselectedBedId);
    }
  }, [preselectedBedId]);

  useEffect(() => {
    if (preselectedPatient) {
      setSelectedPatient({
        id: preselectedPatient.id,
        patientId: preselectedPatient.dossier || preselectedPatient.id,
        firstName: preselectedPatient.name.split(' ')[0] || '',
        lastName: preselectedPatient.name.split(' ').slice(1).join(' ') || '',
        age: preselectedPatient.age || 35,
        gender: (preselectedPatient.gender as any) || 'M',
        birthDate: '',
        phone: '',
        residence: '',
        emergencyContact: '',
        emergencyPhone: '',
        maritalStatus: 'CELIBATAIRE'
      });
      if (preselectedPatient.reason) setReason(preselectedPatient.reason);
      if (preselectedPatient.service) setService(preselectedPatient.service);
      if (preselectedPatient.priority) setPriority(preselectedPatient.priority);
      if (preselectedPatient.origin) setOrigin(preselectedPatient.origin as any);
    }
  }, [preselectedPatient]);

  // Search existing patients in Firestore
  useEffect(() => {
    if (patientSearch.trim().length < 2) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      setErrorMsg(null);
      try {
        const q = query(
          collection(db, 'patients'),
          orderBy('lastName'),
          limit(15)
        );
        const snap = await getDocs(q);
        const term = patientSearch.toLowerCase().trim();
        const results = snap.docs
          .map(d => ({ id: d.id, ...d.data() } as Patient))
          .filter(p => {
            const full = `${p.lastName || ''} ${p.firstName || ''}`.toLowerCase();
            const rev = `${p.firstName || ''} ${p.lastName || ''}`.toLowerCase();
            const id = (p.id || '').toLowerCase();
            const dme = (p.patientId || '').toLowerCase();
            const tel = (p.phone || '').toLowerCase();
            return full.includes(term) || rev.includes(term) || id.includes(term) || dme.includes(term) || tel.includes(term);
          });
        setSearchResults(results);
      } catch (e) {
        console.error("Error searching patients:", e);
      } finally {
        setIsSearching(false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [patientSearch]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatient) {
      setErrorMsg("Veuillez sélectionner un patient existant.");
      return;
    }
    if (!bedId) {
      setErrorMsg("Veuillez choisir un lit disponible.");
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      // 1. Verify bed is currently AVAILABLE
      const bedRef = doc(db, 'beds', bedId);
      const bedSnap = await getDoc(bedRef);
      if (!bedSnap.exists()) {
        throw new Error("Lit introuvable dans la base de données.");
      }
      const bedData = bedSnap.data();
      if (isBedOccupe(bedData.status) && bedData.patientId !== selectedPatient.id) {
        throw new Error(`Le lit ${bedData.name} est déjà occupé par un autre patient (${bedData.patientName || 'Inconnu'}).`);
      }
      if (isBedEnNettoyage(bedData.status)) {
        throw new Error(`Le lit ${bedData.name} est actuellement EN NETTOYAGE.`);
      }

      // 2. Check if patient is already admitted
      const patientRef = doc(db, 'patients', selectedPatient.id);
      const patientSnap = await getDoc(patientRef);
      if (patientSnap.exists()) {
        const pData = patientSnap.data();
        if (pData.hospitalizationStatus === 'en_cours' && pData.admittedBedId && pData.admittedBedId !== bedId) {
          throw new Error(`${selectedPatient.lastName} ${selectedPatient.firstName} est déjà hospitalisé(e) dans un autre lit.`);
        }
      }

      const patientFullName = `${selectedPatient.lastName || ''} ${selectedPatient.firstName || ''}`.trim() || 'Patient';
      const patientDossier = selectedPatient.patientId || selectedPatient.id;
      const roomObj = rooms.find(r => r.id === bedData.roomId);

      const batch = writeBatch(db);

      // 3. Update Bed to OCCUPÉ
      const nowIso = new Date().toISOString();
      batch.update(bedRef, sanitizeData({
        status: 'OCCUPÉ',
        patientId: selectedPatient.id,
        patientName: patientFullName,
        patientAge: selectedPatient.age || 35,
        patientGender: selectedPatient.gender || 'M',
        patientDossier,
        admissionDate,
        admissionTime,
        admissionDoctor: doctorName || 'Personnel Soignant',
        admissionDoctorId: doctorId || currentUser?.id || '',
        admissionReason: reason.trim() || 'Admission hospitalière',
        admissionOrigin: origin,
        service,
        priority,
        lastUpdated: nowIso
      }));

      // 4. Update Patient status
      batch.update(patientRef, sanitizeData({
        hospitalizationStatus: 'en_cours',
        status: 'hospitalise',
        admittedBedId: bedId,
        admittedBedName: bedData.name,
        admittedRoomName: roomObj?.name || 'Chambre',
        lastHospitalizationDate: admissionDate,
        lastUpdated: nowIso
      }));

      // 5. Create Inpatient Record
      const inpatientRecordId = `INP-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const inpRef = doc(db, 'inpatient_records', inpatientRecordId);
      batch.set(inpRef, sanitizeData(stampTenantData({
        id: inpatientRecordId,
        patientId: selectedPatient.id,
        patientName: patientFullName,
        patientAge: selectedPatient.age || 35,
        patientGender: selectedPatient.gender || 'M',
        patientDossier,
        bedId,
        bedName: bedData.name,
        roomId: bedData.roomId,
        roomName: roomObj?.name || 'Chambre',
        service,
        origin,
        admissionDate,
        admissionTime,
        admittedBy: currentUser?.name || doctorName || 'Personnel Hospitalisation',
        admittedById: currentUser?.id || '',
        doctorName: doctorName || currentUser?.name || 'Médecin Référent',
        doctorId: doctorId || currentUser?.id || '',
        reason: reason.trim() || 'Hospitalisation',
        priority,
        status: 'admitted',
        createdAt: nowIso,
        vitals: [],
        cares: [],
        observations: []
      }, currentUser)));

      // 6. If from an admission request, update it
      if (preselectedPatient?.requestId) {
        const reqRef = doc(db, 'hospitalisation_requests', preselectedPatient.requestId);
        batch.update(reqRef, sanitizeData({
          status: 'admitted',
          bedId,
          admittedAt: nowIso,
          admittedBy: currentUser?.name || 'Personnel Hospitalisation'
        }));
      }

      await batch.commit();

      window.dispatchEvent(new CustomEvent('app-notification', {
        detail: {
          message: `Lit ${bedData.name} attribué avec succès à ${patientFullName}.`,
          type: 'success'
        }
      }));

      if (onSuccess) onSuccess();
      onClose();
    } catch (err: any) {
      console.error("Admission error:", err);
      setErrorMsg(err.message || "Erreur lors de l'admission du patient.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-3xl rounded-[32px] shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-200">
        
        {/* Modal Header */}
        <div className="p-6 sm:p-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-600 text-white rounded-2xl flex items-center justify-center shadow-md shadow-blue-500/20">
              <BedDouble size={24} />
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-900 tracking-tight">Occuper un Lit / Admission</h2>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-0.5">
                Hospitalisation • Attribution d'un lit disponible
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-2xl transition-colors cursor-pointer"
          >
            <X size={22} />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="p-6 sm:p-8 overflow-y-auto space-y-6 flex-1 custom-scrollbar">
          {errorMsg && (
            <div className="p-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-2xl flex items-center gap-3 text-sm font-bold animate-in fade-in">
              <AlertCircle size={20} className="shrink-0 text-rose-500" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Section 1: Patient Selection */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                <UserPlus size={14} className="text-blue-600" />
                Patient à admettre <span className="text-rose-500">*</span>
              </label>
              {selectedPatient && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedPatient(null);
                    setPatientSearch('');
                  }}
                  className="text-xs font-bold text-blue-600 hover:underline cursor-pointer"
                >
                  Changer de patient
                </button>
              )}
            </div>

            {!selectedPatient ? (
              <div className="space-y-2">
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input
                    type="text"
                    placeholder="Rechercher par Nom, Prénom ou N° Dossier..."
                    value={patientSearch}
                    onChange={(e) => setPatientSearch(e.target.value)}
                    className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-bold text-slate-900 transition-all text-sm"
                  />
                  {isSearching && (
                    <div className="absolute right-4 top-1/2 -translate-y-1/2">
                      <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                    </div>
                  )}
                </div>

                {searchResults.length > 0 && (
                  <div className="bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden max-h-56 overflow-y-auto divide-y divide-slate-100 animate-in slide-in-from-top-2">
                    {searchResults.map(p => {
                      const isAlreadyHosp = p.hospitalizationStatus === 'en_cours' || p.status === 'hospitalise';
                      return (
                        <button
                          key={p.id}
                          type="button"
                          disabled={isAlreadyHosp}
                          onClick={() => {
                            setSelectedPatient(p);
                            setSearchResults([]);
                            setPatientSearch('');
                          }}
                          className={`w-full px-5 py-3.5 text-left flex items-center justify-between transition-colors ${
                            isAlreadyHosp 
                              ? 'bg-rose-50/50 cursor-not-allowed opacity-75' 
                              : 'hover:bg-blue-50/60 cursor-pointer'
                          }`}
                        >
                          <div>
                            <p className="font-black text-slate-900 text-sm">
                              {p.lastName} {p.firstName}
                            </p>
                            <p className="text-[10px] font-bold text-slate-400 font-mono tracking-tight uppercase">
                              N° {p.patientId || p.id} • {p.age ? `${p.age} ans` : ''} • Sexe {p.gender || 'M'}
                            </p>
                          </div>
                          {isAlreadyHosp ? (
                            <span className="text-[10px] font-black text-rose-600 uppercase bg-rose-100 px-2.5 py-1 rounded-lg">
                              Déjà hospitalisé
                            </span>
                          ) : (
                            <span className="text-xs font-black text-blue-600 uppercase bg-blue-50 px-3 py-1 rounded-xl">
                              Sélectionner
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
                <p className="text-[11px] text-slate-400 font-medium">
                  Le patient doit être sélectionné depuis les dossiers existants (aucun doublon créé).
                </p>
              </div>
            ) : (
              <div className="p-4 bg-blue-50/70 border border-blue-200 rounded-2xl flex items-center justify-between">
                <div className="flex items-center gap-3.5">
                  <div className="w-10 h-10 bg-blue-600 text-white rounded-xl flex items-center justify-center font-black shadow-xs">
                    {selectedPatient.lastName?.charAt(0) || 'P'}
                  </div>
                  <div>
                    <h4 className="font-black text-slate-900 text-base">
                      {selectedPatient.lastName} {selectedPatient.firstName}
                    </h4>
                    <p className="text-xs text-slate-500 font-bold font-mono">
                      Dossier: {selectedPatient.patientId || selectedPatient.id} • Âge: {selectedPatient.age || 35} ans • Sexe: {selectedPatient.gender || 'M'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-3 py-1 bg-emerald-100 text-emerald-700 text-xs font-black rounded-lg uppercase">
                    Prêt pour admission
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Section 2: Lit & Service */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest block">
                Lit disponible <span className="text-rose-500">*</span>
              </label>
              <select
                value={bedId}
                onChange={(e) => setBedId(e.target.value)}
                required
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-bold text-slate-900 text-sm"
              >
                <option value="">-- Choisir un lit libre --</option>
                {availableBeds.map(b => {
                  const room = rooms.find(r => r.id === b.roomId);
                  return (
                    <option key={b.id} value={b.id}>
                      {b.name} ({room?.name || 'Chambre'}) — Libre
                    </option>
                  );
                })}
              </select>
              {availableBeds.length === 0 && (
                <p className="text-xs text-rose-500 font-bold">Aucun lit libre actuellement.</p>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest block">
                Service / Unité
              </label>
              <select
                value={service}
                onChange={(e) => setService(e.target.value)}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-bold text-slate-900 text-sm"
              >
                <option value="Médecine Générale">Médecine Générale</option>
                <option value="Chirurgie">Chirurgie</option>
                <option value="Pédiatrie">Pédiatrie</option>
                <option value="Maternité">Maternité</option>
                <option value="Soins Intensifs">Soins Intensifs</option>
                <option value="Cardiologie">Cardiologie</option>
              </select>
            </div>
          </div>

          {/* Section 3: Origine & Médecin */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest block">
                Origine de l'hospitalisation
              </label>
              <select
                value={origin}
                onChange={(e) => setOrigin(e.target.value as any)}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-bold text-slate-900 text-sm"
              >
                <option value="Consultation">Consultation</option>
                <option value="Urgences">Urgences</option>
                <option value="Maternité">Maternité</option>
                <option value="Autre">Autre / Transfert externe</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest block">
                Médecin / Responsable
              </label>
              <select
                value={doctorId}
                onChange={(e) => {
                  const docObj = doctors.find(d => d.id === e.target.value);
                  setDoctorId(e.target.value);
                  setDoctorName(docObj?.name || '');
                }}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-bold text-slate-900 text-sm"
              >
                <option value="">Sélectionner un médecin...</option>
                {doctors.map(d => (
                  <option key={d.id} value={d.id}>{d.name} ({d.role || 'Médecin'})</option>
                ))}
                {currentUser && !doctors.some(d => d.id === currentUser.id) && (
                  <option value={currentUser.id}>{currentUser.name} (Vous)</option>
                )}
              </select>
            </div>
          </div>

          {/* Section 4: Date, Heure & Priorité */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest block">
                Date d'admission
              </label>
              <input
                type="date"
                value={admissionDate}
                onChange={(e) => setAdmissionDate(e.target.value)}
                required
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-bold text-slate-900 text-sm"
              />
            </div>

            <div className="space-y-2">
              <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest block">
                Heure d'admission
              </label>
              <input
                type="time"
                value={admissionTime}
                onChange={(e) => setAdmissionTime(e.target.value)}
                required
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-bold text-slate-900 text-sm"
              />
            </div>

            <div className="space-y-2">
              <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest block">
                Priorité
              </label>
              <div className="grid grid-cols-3 gap-1.5 pt-1">
                {(['Normal', 'Urgent', 'Critique'] as const).map(p => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPriority(p)}
                    className={`py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all border ${
                      priority === p
                        ? (p === 'Critique' ? 'bg-rose-600 text-white border-rose-600 shadow-sm' :
                           p === 'Urgent' ? 'bg-amber-500 text-white border-amber-500 shadow-sm' :
                           'bg-blue-600 text-white border-blue-600 shadow-sm')
                        : 'bg-slate-50 text-slate-500 border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Section 5: Motif d'admission */}
          <div className="space-y-2">
            <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest block">
              Motif d'admission / Diagnostic initial
            </label>
            <textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex: Pneumonie communautaire sous antibiothérapie IV, surveillance continue..."
              className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-bold text-slate-900 text-sm resize-none"
            />
          </div>

          {/* Actions */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-6 py-3 rounded-2xl border border-slate-200 text-slate-600 font-bold text-xs uppercase tracking-wider hover:bg-slate-50 transition-colors cursor-pointer"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !selectedPatient || !bedId}
              className="px-8 py-3.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-black text-xs uppercase tracking-widest rounded-2xl transition-all shadow-md shadow-blue-500/20 flex items-center gap-2 cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  <span>Attribution en cours...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 size={16} />
                  <span>Confirmer l'Admission</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
