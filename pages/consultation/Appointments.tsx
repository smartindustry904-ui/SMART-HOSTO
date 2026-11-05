import React, { useState, useEffect } from 'react';
import { Calendar as CalendarIcon, Clock, User, Plus, Search, Edit2, X, Trash2, Calendar, Activity, RefreshCw, AlertTriangle, ShieldAlert, Zap } from 'lucide-react';
import { db } from '../../src/firebase';
import { collection, doc, setDoc, deleteDoc, onSnapshot, query, orderBy, getDocs, limit } from 'firebase/firestore';
import { AvatarPlaceholder } from '../../components/common/AvatarPlaceholder';

interface AppointmentsProps {
  user?: {
    id?: string;
    name?: string;
    role?: string;
    email?: string;
  };
  initialPatient?: any;
  onStartConsultation?: (appointment: any) => void;
}

const Appointments: React.FC<AppointmentsProps> = ({ user, initialPatient, onStartConsultation }) => {
  const [appointments, setAppointments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<any | null>(null);

  // Patient Search State
  const [patientSearch, setPatientSearch] = useState('');
  const [patientResults, setPatientResults] = useState<any[]>([]);
  const [isSearchingPatient, setIsSearchingPatient] = useState(false);

  // Form Fields State
  const [formData, setFormData] = useState({
    patientId: '',
    patient: '',
    age: '',
    gender: 'M',
    reason: '',
    doctor: user?.name || 'Dr. Sarr',
    date: new Date().toISOString().split('T')[0],
    time: '10:00',
    status: 'PENDING'
  });

  useEffect(() => {
    if (initialPatient) {
      setFormData({
        patientId: initialPatient.id || '',
        patient: `${initialPatient.lastName || ''} ${initialPatient.firstName || ''}`.trim(),
        age: initialPatient.age ? String(initialPatient.age) : '',
        gender: initialPatient.gender || 'M',
        reason: 'Consultation de suivi',
        doctor: user?.name || 'Dr. Sarr',
        date: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString().split('T')[0],
        time: '10:00',
        status: 'PENDING'
      });
      setShowAddModal(true);
    }
  }, [initialPatient, user]);

  // Handle patient search for standalone mode
  useEffect(() => {
    const searchPatients = async () => {
      if (!patientSearch || patientSearch.trim().length < 2) {
        setPatientResults([]);
        return;
      }
      setIsSearchingPatient(true);
      try {
        const q = query(
          collection(db, 'patients'),
          limit(40)
        );
        const snapshot = await getDocs(q);
        const term = patientSearch.trim().toLowerCase();
        const results = snapshot.docs
          .map(doc => ({ id: doc.id, ...doc.data() }))
          .filter((p: any) => 
            (p.lastName && p.lastName.toLowerCase().includes(term)) ||
            (p.firstName && p.firstName.toLowerCase().includes(term)) ||
            (p.id && p.id.toLowerCase().includes(term))
          );
        setPatientResults(results);
      } catch (err) {
        console.error("Error searching patients:", err);
      } finally {
        setIsSearchingPatient(false);
      }
    };

    const timer = setTimeout(searchPatients, 300);
    return () => clearTimeout(timer);
  }, [patientSearch]);

  const selectPatient = (p: any) => {
    setFormData({
      ...formData,
      patientId: p.id,
      patient: `${p.lastName} ${p.firstName}`,
      age: p.age ? String(p.age) : '',
      gender: p.gender || 'M'
    });
    setPatientResults([]);
    setPatientSearch('');
  };

  // Helper to check if an appointment date/time has passed
  const isAppointmentPast = (dateStr?: string, timeStr?: string): boolean => {
    if (!dateStr) return false;
    try {
      const timeVal = timeStr || '23:59';
      const apptDate = new Date(`${dateStr}T${timeVal}:00`);
      return apptDate.getTime() < Date.now();
    } catch {
      return false;
    }
  };

  // Helper to check if user is authorized to edit a specific appointment
  const canUserEdit = (rdv: any): boolean => {
    if (!user) return true; // fallback
    const roleNorm = (user.role || '').toLowerCase();
    if (roleNorm.includes('admin')) return true; // Admins can edit

    const userNameNorm = (user.name || '').trim().toLowerCase();
    const rdvDoctorNorm = (rdv.doctor || '').trim().toLowerCase();
    const rdvIssuedByNorm = (rdv.issuedBy || '').trim().toLowerCase();
    const userId = user.id;

    if (userId && rdv.doctorId === userId) return true;
    if (userNameNorm && rdvDoctorNorm && (rdvDoctorNorm.includes(userNameNorm) || userNameNorm.includes(rdvDoctorNorm))) return true;
    if (userNameNorm && rdvIssuedByNorm && (rdvIssuedByNorm.includes(userNameNorm) || userNameNorm.includes(rdvIssuedByNorm))) return true;

    return false;
  };

  // Subscribe to real-time appointments collection in Firestore
  useEffect(() => {
    const q = query(collection(db, 'appointments'), orderBy('date', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: any[] = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      // Sort unified list by date and time
      list.sort((a: any, b: any) => {
        const dateCompare = (a.date || '').localeCompare(b.date || '');
        if (dateCompare !== 0) return dateCompare;
        return (a.time || '').localeCompare(b.time || '');
      });
      
      setAppointments(list);
      setLoading(false);
    }, (error) => {
      console.error("Firestore collection subscriptions failed: ", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const getStatusBadge = (rdv: any) => {
    const isPast = isAppointmentPast(rdv.date, rdv.time);
    const status = rdv.status;

    if (status === 'PENDING' && isPast) {
      return 'bg-amber-100 text-amber-800 border-amber-300';
    }
    if (status === 'PENDING' && !isPast) {
      return 'bg-blue-100 text-blue-800 border-blue-300';
    }

    switch (status) {
      case 'PENDING': return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'IN_PROGRESS': return 'bg-indigo-50 text-indigo-600 border-indigo-100';
      case 'COMPLETED': return 'bg-emerald-50 text-emerald-600 border-emerald-100';
      case 'ABSENT': return 'bg-rose-50 text-rose-600 border-rose-100';
      case 'POSTPONED': return 'bg-purple-50 text-purple-600 border-purple-100';
      case 'CANCELLED': return 'bg-red-50 text-red-600 border-red-100';
      default: return 'bg-slate-50 text-slate-400 border-slate-100';
    }
  };

  const handleConsultNow = async (rdv: any) => {
    const now = new Date();
    const nowDateStr = now.toISOString().split('T')[0];
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const nowTimeStr = `${hours}:${minutes}`;

    try {
      const rdvRef = doc(db, 'appointments', rdv.id);
      await setDoc(rdvRef, { 
        date: nowDateStr, 
        time: nowTimeStr,
        status: 'IN_PROGRESS'
      }, { merge: true });

      await setDoc(doc(collection(db, 'audit_logs')), {
        user: user?.name || 'Docteur Orientation',
        role: 'DOCTOR',
        date: now.toLocaleDateString('fr-FR'),
        time: nowTimeStr,
        timestamp: now.toISOString(),
        action: `Rendez-vous avancé à maintenant - ID: ${rdv.id}`,
        details: { rdvId: rdv.id, newDate: nowDateStr, newTime: nowTimeStr },
        module: 'Consultation'
      });

      window.dispatchEvent(new CustomEvent('app-notification', { 
        detail: `Le rendez-vous pour ${rdv.patient} a été réorganisé à aujourd'hui (${nowTimeStr}).` 
      }));

      if (onStartConsultation) {
        onStartConsultation({
          ...rdv,
          date: nowDateStr,
          time: nowTimeStr,
          status: 'IN_PROGRESS'
        });
      }
    } catch (err) {
      console.error("Failed to advance appointment date to now:", err);
      if (onStartConsultation) {
        onStartConsultation({
          ...rdv,
          date: nowDateStr,
          time: nowTimeStr,
          status: 'IN_PROGRESS'
        });
      }
    }
  };

  const handleStatusUpdate = async (rdvId: string, newStatus: string) => {
    try {
      const today = new Date();
      const rdvRef = doc(db, 'appointments', rdvId);
      
      await setDoc(rdvRef, { status: newStatus }, { merge: true });

      await setDoc(doc(collection(db, 'audit_logs')), {
        user: user?.name || 'Docteur Orientation',
        role: 'DOCTOR',
        date: today.toLocaleDateString('fr-FR'),
        time: today.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
        timestamp: today.toISOString(),
        action: `Rendez-vous mis à jour - ID: ${rdvId}`,
        details: { rdvId, status: newStatus },
        module: 'Consultation'
      });

      window.dispatchEvent(new CustomEvent('app-notification', { 
        detail: `Le statut du rendez-vous ${rdvId} a été mis à jour: ${newStatus}.` 
      }));
    } catch (e) {
      console.error("Failed to update status in Firestore: ", e);
      setAppointments(prev => prev.map(item => item.id === rdvId ? { ...item, status: newStatus } : item));
    }
  };

  const handleDelete = async (rdvId: string) => {
    if (!window.confirm("Voulez-vous vraiment annuler/supprimer ce rendez-vous ?")) return;
    try {
      const today = new Date();
      await deleteDoc(doc(db, 'appointments', rdvId));

      await setDoc(doc(collection(db, 'audit_logs')), {
        user: user?.name || 'Docteur Orientation',
        role: 'DOCTOR',
        date: today.toLocaleDateString('fr-FR'),
        time: today.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
        timestamp: today.toISOString(),
        action: `Rendez-vous supprimé - ID: ${rdvId}`,
        details: { rdvId },
        module: 'Consultation'
      });

      window.dispatchEvent(new CustomEvent('app-notification', { 
        detail: `Le rendez-vous ${rdvId} a été correctement archivé/supprimé.` 
      }));
    } catch (e) {
      console.error("Failed to delete in Firestore: ", e);
      setAppointments(prev => prev.filter(item => item.id !== rdvId));
    }
  };

  const handleCreateAppointment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.patient || !formData.reason) {
      alert("Le nom du patient et le motif sont obligatoires.");
      return;
    }

    setIsSubmitting(true);
    try {
      const today = new Date();
      const rdvId = `RDV-${Math.floor(Math.random() * 89999 + 10000)}`;
      const payload = {
        id: rdvId,
        patientId: formData.patientId || '',
        patient: formData.patient,
        age: parseInt(formData.age) || 30,
        gender: formData.gender,
        reason: formData.reason,
        doctor: formData.doctor,
        doctorId: user?.id || '',
        issuedBy: user?.name || formData.doctor,
        date: formData.date,
        time: formData.time,
        status: 'PENDING',
        createdAt: today.toISOString()
      };

      await setDoc(doc(db, 'appointments', rdvId), payload);

      await setDoc(doc(collection(db, 'audit_logs')), {
        user: user?.name || 'Docteur Orientation',
        role: 'DOCTOR',
        date: today.toLocaleDateString('fr-FR'),
        time: today.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
        timestamp: today.toISOString(),
        action: `Plannification RDV - Patient: ${formData.patient}`,
        details: { rdvId, date: formData.date, time: formData.time },
        module: 'Consultation'
      });

      // Auto-dismiss form upon success
      setShowAddModal(false);
      setFormData({
        patientId: '',
        patient: '',
        age: '',
        gender: 'M',
        reason: '',
        doctor: user?.name || 'Dr. Sarr',
        date: new Date().toISOString().split('T')[0],
        time: '10:00',
        status: 'PENDING'
      });

      window.dispatchEvent(new CustomEvent('app-notification', { 
        detail: `Nouveau rendez-vous planifié avec succès pour ${formData.patient}.` 
      }));
    } catch (e) {
      console.error("Error creating appointment in Firestore: ", e);
      alert("Erreur lors de la création du rendez-vous.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditClick = (rdv: any) => {
    // Enforce authorization check
    if (!canUserEdit(rdv)) {
      alert(`Modification refusée: Seul le docteur référent (${rdv.doctor || 'ayant émis le RDV'}) ou un administrateur est autorisé à modifier ce rendez-vous.`);
      window.dispatchEvent(new CustomEvent('app-notification', { 
        detail: `Accès refusé: Seul ${rdv.doctor || 'le médecin émetteur'} est autorisé à modifier ce rendez-vous.` 
      }));
      return;
    }

    setSelectedAppointment(rdv);
    setFormData({
      patientId: rdv.patientId || '',
      patient: rdv.patient,
      age: rdv.age ? rdv.age.toString() : '',
      gender: rdv.gender || 'M',
      reason: rdv.reason || '',
      doctor: rdv.doctor || 'Dr. Sarr',
      date: rdv.date || new Date().toISOString().split('T')[0],
      time: rdv.time || '10:00',
      status: rdv.status || 'PENDING'
    });
    setShowEditModal(true);
  };

  const handleUpdateAppointment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAppointment) return;

    setIsSubmitting(true);
    try {
      const today = new Date();
      const payload = {
        patient: formData.patient,
        age: parseInt(formData.age) || 30,
        gender: formData.gender,
        reason: formData.reason,
        doctor: formData.doctor,
        date: formData.date,
        time: formData.time,
        status: formData.status
      };

      await setDoc(doc(db, 'appointments', selectedAppointment.id), payload, { merge: true });

      await setDoc(doc(collection(db, 'audit_logs')), {
        user: user?.name || 'Docteur Orientation',
        role: 'DOCTOR',
        date: today.toLocaleDateString('fr-FR'),
        time: today.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
        timestamp: today.toISOString(),
        action: `Rendez-vous modifié - ID: ${selectedAppointment.id}`,
        details: { id: selectedAppointment.id, patient: formData.patient },
        module: 'Consultation'
      });

      setShowEditModal(false);
      setSelectedAppointment(null);
      window.dispatchEvent(new CustomEvent('app-notification', { 
        detail: `Le rendez-vous pour ${formData.patient} a été mis à jour.` 
      }));
    } catch (e) {
      console.error("Error updating appointment in Firestore: ", e);
      alert("Erreur lors de la mise à jour du rendez-vous.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filter & Search appointments
  const filteredAppointments = appointments.filter(rdv => {
    const matchesSearch = (rdv.patient || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
                          (rdv.reason || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                          (rdv.id || '').toLowerCase().includes(searchQuery.toLowerCase());
    
    const isPast = isAppointmentPast(rdv.date, rdv.time);

    let matchesStatus = false;
    if (filterStatus === 'ALL') {
      matchesStatus = rdv.status !== 'CANCELLED' && rdv.status !== 'ABSENT';
    } else if (filterStatus === 'PENDING') {
      matchesStatus = rdv.status === 'PENDING' && !isPast;
    } else if (filterStatus === 'MISSED' || filterStatus === 'PAST') {
      matchesStatus = rdv.status === 'PENDING' && isPast;
    } else if (filterStatus === 'COMPLETED') {
      matchesStatus = rdv.status === 'COMPLETED';
    } else if (filterStatus === 'HISTORY') {
      matchesStatus = rdv.status === 'COMPLETED' || rdv.status === 'CANCELLED' || rdv.status === 'ABSENT' || (rdv.status === 'PENDING' && isPast);
    } else {
      matchesStatus = rdv.status === filterStatus;
    }
    
    return matchesSearch && matchesStatus;
  });

  // Calculate live statistics
  const totalCount = appointments.length;
  const upcomingCount = appointments.filter(a => a.status === 'PENDING' && !isAppointmentPast(a.date, a.time)).length;
  const missedCount = appointments.filter(a => a.status === 'PENDING' && isAppointmentPast(a.date, a.time)).length;
  const completedCount = appointments.filter(a => a.status === 'COMPLETED').length;

  return (
    <div className="animate-in fade-in slide-in-from-bottom-6 duration-700">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-10">
        <div>
          <h1 className="text-4xl font-black tracking-tight text-slate-900 mb-2">Gestion des Rendez-vous</h1>
          <p className="text-slate-500 font-medium italic">Planifiez, modifiez et validez vos consultations d'orientation futures.</p>
        </div>
        <div className="flex flex-wrap gap-4 w-full md:w-auto">
          <div className="relative group flex-1 md:flex-initial">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-600 transition-colors" size={18} />
            <input 
              type="text" 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Rechercher un rendez-vous..." 
              className="pl-12 pr-6 py-4 bg-white border border-slate-200 rounded-2xl text-sm font-bold text-slate-900 focus:outline-none focus:ring-4 focus:ring-blue-600/10 focus:border-blue-600 transition-all w-full md:w-80 shadow-sm"
            />
          </div>
          <button 
            onClick={() => setShowAddModal(true)}
            className="bg-slate-900 text-white px-6 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-blue-600 transition-all flex items-center justify-center gap-2 shadow-lg hover:shadow-blue-600/20 cursor-pointer"
          >
            <Plus size={18} /> Nouveau RDV
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
        {/* Calendar Preview and Live Quick Stats */}
        <div className="lg:col-span-1 space-y-8">
          <div className="bg-white rounded-[40px] border border-slate-200 p-8 shadow-sm">
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-md font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                <CalendarIcon size={18} className="text-blue-600" /> Calendrier de Suivi
              </h3>
              <span className="text-xs font-black text-slate-400 uppercase">Aujourd'hui</span>
            </div>
            <div className="grid grid-cols-7 gap-2 text-center mb-4">
              {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, i) => (
                <span key={`${d}-${i}`} className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{d}</span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-2">
              {Array.from({ length: 30 }).map((_, i) => (
                <button 
                  key={i} 
                  className={`aspect-square rounded-xl flex items-center justify-center text-xs font-black transition-all ${i + 1 === new Date().getDate() ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-slate-600 hover:bg-slate-50'}`}
                >
                  {i + 1}
                </button>
              ))}
            </div>
          </div>

          {/* Real-time Quick Stats */}
          <div className="bg-slate-900 rounded-[40px] p-8 text-white shadow-xl">
            <h3 className="text-lg font-black uppercase tracking-widest mb-6 text-blue-400">Statistiques en direct</h3>
            <div className="space-y-3">
              <div 
                onClick={() => setFilterStatus('ALL')}
                className={`flex justify-between items-center p-4 rounded-2xl border cursor-pointer transition-colors ${filterStatus === 'ALL' ? 'bg-blue-600 border-blue-500' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}
              >
                <span className="text-xs font-bold text-slate-300">Tous les RDV</span>
                <span className="text-sm font-black">{totalCount}</span>
              </div>
              <div 
                onClick={() => setFilterStatus('PENDING')}
                className={`flex justify-between items-center p-4 rounded-2xl border cursor-pointer transition-colors ${filterStatus === 'PENDING' ? 'bg-amber-600 border-amber-500' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}
              >
                <span className="text-xs font-bold text-slate-300">En attente (À venir)</span>
                <span className="text-sm font-black text-amber-400">{upcomingCount}</span>
              </div>
              <div 
                onClick={() => setFilterStatus('MISSED')}
                className={`flex justify-between items-center p-4 rounded-2xl border cursor-pointer transition-colors ${filterStatus === 'MISSED' || filterStatus === 'PAST' ? 'bg-rose-600 border-rose-500' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}
              >
                <span className="text-xs font-bold text-slate-300">RDV Échus / Manqués</span>
                <span className="text-sm font-black text-rose-300">{missedCount}</span>
              </div>
              <div 
                onClick={() => setFilterStatus('COMPLETED')}
                className={`flex justify-between items-center p-4 rounded-2xl border cursor-pointer transition-colors ${filterStatus === 'COMPLETED' ? 'bg-emerald-600 border-emerald-500' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}
              >
                <span className="text-xs font-bold text-slate-300">Terminés</span>
                <span className="text-sm font-black text-emerald-400">{completedCount}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Appointments List */}
        <div className="lg:col-span-2 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-2">
            <h2 className="text-xl font-black text-slate-900 uppercase tracking-widest flex items-center gap-3">
              <div className="w-8 h-8 bg-orange-100 rounded-xl flex items-center justify-center text-orange-600"><Clock size={18} /></div>
              Rendez-vous ({filteredAppointments.length})
            </h2>
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
              {[
                { id: 'ALL', label: 'Tous' },
                { id: 'PENDING', label: 'À venir' },
                { id: 'MISSED', label: 'Échus / Manqués' },
                { id: 'COMPLETED', label: 'Terminés' },
                { id: 'HISTORY', label: 'Historique' }
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setFilterStatus(tab.id)}
                  className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all whitespace-nowrap cursor-pointer ${filterStatus === tab.id ? 'bg-slate-900 text-white shadow-lg' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="bg-white rounded-[32px] border border-slate-200 p-12 text-center">
              <RefreshCw size={24} className="animate-spin text-blue-600 mx-auto mb-3" />
              <p className="text-xs font-black text-slate-500 uppercase tracking-wider">Chargement des rendez-vous...</p>
            </div>
          ) : filteredAppointments.length === 0 ? (
            <div className="bg-white rounded-[32px] border border-slate-200 p-12 text-center text-slate-400 font-medium">
              Aucun rendez-vous trouvé correspondant aux filtres sélectionné.
            </div>
          ) : (
            filteredAppointments.map((rdv) => {
              const isPast = isAppointmentPast(rdv.date, rdv.time);
              const isEditable = canUserEdit(rdv);

              return (
                <div key={rdv.id} className="bg-white rounded-[32px] border border-slate-200 p-6 hover:border-blue-500 transition-all group shadow-sm hover:shadow-xl hover:shadow-blue-600/5">
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div className="flex items-center gap-6 w-full md:w-auto">
                      <div className="text-center w-20 shrink-0">
                        <p className="text-2xl font-black text-slate-900">{rdv.time || '10:00'}</p>
                        <p className="text-[9px] font-black text-slate-400 font-mono tracking-widest uppercase">{rdv.date || 'JJ/MM/AAAA'}</p>
                      </div>
                      <div className="h-12 w-px bg-slate-100 hidden md:block"></div>
                      <div className="flex items-center gap-4 min-w-0">
                        <AvatarPlaceholder size={48} iconSize={24} className="rounded-2xl shrink-0" alt={rdv.patient} />
                        <div className="min-w-0">
                          <h3 className="text-lg font-black text-slate-900 truncate">{rdv.patient}</h3>
                          <p className="text-xs text-slate-500 font-medium truncate">
                            {rdv.age} ans • {rdv.gender} • {rdv.reason} <span className="text-slate-400 font-bold ml-1">({rdv.id})</span>
                          </p>
                          <p className="text-[10px] text-blue-600 font-bold mt-1">Médecin affecté: {rdv.doctor || 'Dr. Sarr'}</p>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between lg:justify-end w-full lg:w-auto gap-3 pt-3 lg:pt-0 border-t lg:border-t-0 border-slate-100">
                      {/* Status & Past/Upcoming Badge */}
                      <div className="flex items-center gap-2">
                        {rdv.status === 'PENDING' && isPast ? (
                          <span className="px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest bg-rose-100 text-rose-800 border border-rose-300 flex items-center gap-1 shadow-sm">
                            <AlertTriangle size={12} className="text-rose-600" /> Échu / Manqué
                          </span>
                        ) : rdv.status === 'PENDING' && !isPast ? (
                          <span className="px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest bg-blue-100 text-blue-800 border border-blue-300 flex items-center gap-1 shadow-sm">
                            <Clock size={12} /> À venir
                          </span>
                        ) : (
                          <div className={`px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest border shrink-0 ${getStatusBadge(rdv)}`}>
                            {rdv.status === 'PENDING' ? (isPast ? 'Échu / Manqué' : 'À venir') : rdv.status === 'IN_PROGRESS' ? 'En cours' : rdv.status === 'COMPLETED' ? 'Terminé' : rdv.status === 'ABSENT' ? 'Absent' : rdv.status === 'CANCELLED' ? 'Annulé' : rdv.status === 'POSTPONED' ? 'Reporté' : rdv.status}
                          </div>
                        )}
                      </div>

                      {/* Action Buttons */}
                      <div className="flex flex-wrap items-center gap-2">
                        {onStartConsultation && (rdv.status === 'PENDING' || rdv.status === 'IN_PROGRESS') && (
                          <>
                            {!isPast ? (
                              <>
                                <button 
                                  disabled
                                  title="Rendez-vous futur: consultation désactivée avant la date/heure prévue"
                                  className="px-3 py-2 bg-slate-100 text-slate-400 border border-slate-200 rounded-xl font-black text-[9px] uppercase tracking-widest cursor-not-allowed flex items-center gap-1 opacity-70 whitespace-nowrap"
                                >
                                  <Activity size={13} /> Consulter
                                </button>

                                <button 
                                  onClick={() => handleConsultNow(rdv)}
                                  title="Avancer la date du rendez-vous à maintenant et démarrer la consultation"
                                  className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-[9px] uppercase tracking-widest shadow-md shadow-emerald-600/20 transition-all flex items-center gap-1.5 cursor-pointer hover:scale-105 active:scale-95 whitespace-nowrap"
                                >
                                  <Zap size={13} /> Consulter Maintenant
                                </button>
                              </>
                            ) : (
                              <button 
                                onClick={() => onStartConsultation(rdv)}
                                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black text-[9px] uppercase tracking-widest shadow-md shadow-blue-600/20 transition-all flex items-center gap-1.5 cursor-pointer hover:scale-105 active:scale-95 whitespace-nowrap"
                              >
                                <Activity size={13} /> Consulter
                              </button>
                            )}
                          </>
                        )}

                        <button 
                          onClick={() => handleEditClick(rdv)}
                          className={`p-2.5 rounded-xl transition-all shrink-0 cursor-pointer ${
                            isEditable 
                              ? 'bg-slate-50 text-slate-600 hover:bg-blue-50 hover:text-blue-600 border border-slate-200' 
                              : 'bg-slate-100 text-slate-300 cursor-not-allowed border border-slate-200'
                          }`} 
                          title={isEditable ? "Modifier" : `Créé par ${rdv.doctor} - Seul cet utilisateur peut modifier`}
                        >
                          {isEditable ? <Edit2 size={16} /> : <ShieldAlert size={16} />}
                        </button>

                        <button 
                          onClick={() => handleDelete(rdv.id)}
                          className="p-2.5 bg-slate-50 text-slate-400 rounded-xl hover:bg-rose-50 hover:text-rose-600 border border-slate-200 transition-all shrink-0 cursor-pointer" 
                          title="Annuler/Supprimer"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* MODAL: ADD APPOINTMENT */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[40px] border border-slate-200 shadow-2xl w-full max-w-xl p-8 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-black text-slate-900">Nouveau Rendez-vous</h3>
              <button 
                onClick={() => setShowAddModal(false)} 
                disabled={isSubmitting}
                className="p-3 bg-slate-50 text-slate-400 rounded-full hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>
            
            <form onSubmit={handleCreateAppointment} className="space-y-6">
              {/* Patient Section */}
              <div className={`p-6 rounded-[24px] border ${initialPatient ? 'bg-blue-50 border-blue-100' : 'bg-slate-50 border-slate-200'}`}>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">Patient Concerné</label>
                <div className="relative">
                  {initialPatient ? (
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-blue-600 text-white rounded-2xl flex items-center justify-center font-black text-lg">
                        {formData.patient[0]}
                      </div>
                      <div>
                        <p className="text-lg font-black text-slate-900">{formData.patient}</p>
                        <p className="text-xs font-bold text-blue-600 uppercase tracking-tight">{formData.patientId || 'Patient Sélectionné'}</p>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="relative group">
                        <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-600 transition-colors" size={18} />
                        <input 
                          type="text" 
                          value={patientSearch || formData.patient}
                          onChange={e => {
                            setPatientSearch(e.target.value);
                            if (formData.patient) setFormData({ ...formData, patient: e.target.value, patientId: '' });
                          }}
                          placeholder="Rechercher un patient par nom..."
                          className="w-full pl-12 pr-5 py-4 bg-white border border-slate-200 rounded-2xl text-sm font-bold focus:outline-none focus:ring-4 focus:ring-blue-600/10 focus:border-blue-600 transition-all shadow-sm"
                        />
                        {isSearchingPatient && (
                          <div className="absolute right-4 top-1/2 -translate-y-1/2">
                            <RefreshCw size={16} className="animate-spin text-blue-600" />
                          </div>
                        )}
                      </div>
                      
                      {patientResults.length > 0 && (
                        <div className="absolute left-0 right-0 top-full mt-2 bg-white border border-slate-200 rounded-[24px] shadow-2xl z-50 max-h-60 overflow-y-auto divide-y divide-slate-50 p-2">
                          {patientResults.map(p => (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => selectPatient(p)}
                              className="w-full p-4 flex items-center gap-4 hover:bg-blue-50 transition-all rounded-2xl text-left"
                            >
                              <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400 font-black">
                                {p.lastName[0]}{p.firstName[0]}
                              </div>
                              <div>
                                <p className="text-sm font-black text-slate-900">{p.lastName} {p.firstName}</p>
                                <p className="text-[10px] text-slate-500 font-bold tracking-tight uppercase">{p.id} • {p.age} ans</p>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Date & Time Selectors */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 p-4 rounded-[24px] border border-slate-200">
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-2">
                    <Calendar size={12} className="text-blue-600" /> Date du RDV
                  </label>
                  <input 
                    type="date" 
                    value={formData.date}
                    onChange={e => setFormData({ ...formData, date: e.target.value })}
                    className="w-full bg-transparent border-none p-0 text-sm font-black text-slate-900 focus:ring-0 cursor-pointer"
                  />
                </div>
                <div className="bg-slate-50 p-4 rounded-[24px] border border-slate-200">
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-2">
                    <Clock size={12} className="text-blue-600" /> Heure
                  </label>
                  <input 
                    type="time" 
                    value={formData.time}
                    onChange={e => setFormData({ ...formData, time: e.target.value })}
                    className="w-full bg-transparent border-none p-0 text-sm font-black text-slate-900 focus:ring-0 cursor-pointer"
                  />
                </div>
              </div>

              {/* Reason & Doctor Section */}
              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1">Motif de consultation / Spécialité</label>
                  <div className="relative group">
                    <Activity className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-600 transition-colors" size={18} />
                    <input 
                      type="text" 
                      required
                      value={formData.reason}
                      onChange={e => setFormData({ ...formData, reason: e.target.value })}
                      placeholder="Ex: Suivi post-opératoire, Hypertension..."
                      className="w-full pl-12 pr-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold focus:outline-none focus:ring-4 focus:ring-blue-600/10 focus:border-blue-600 transition-all"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1">Médecin Consultant</label>
                  <div className="relative group">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-600 transition-colors" size={18} />
                    <input 
                      type="text" 
                      value={formData.doctor}
                      onChange={e => setFormData({ ...formData, doctor: e.target.value })}
                      placeholder="Nom du médecin..."
                      className="w-full pl-12 pr-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold focus:outline-none focus:ring-4 focus:ring-blue-600/10 focus:border-blue-600 transition-all"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-4 flex gap-4">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  disabled={isSubmitting}
                  className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-200 transition-all cursor-pointer"
                >
                  Annuler
                </button>
                <button 
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-[2] py-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl shadow-blue-600/20 transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw size={14} className="animate-spin" />
                      Enregistrement en cours...
                    </>
                  ) : (
                    'Enregistrer le Rendez-vous'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: EDIT APPOINTMENT */}
      {showEditModal && selectedAppointment && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[40px] border border-slate-200 shadow-2xl w-full max-w-xl p-8 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-black text-slate-900">Modifier Rendez-vous</h3>
              <button 
                onClick={() => {
                  setShowEditModal(false);
                  setSelectedAppointment(null);
                }} 
                disabled={isSubmitting}
                className="p-3 bg-slate-50 text-slate-400 rounded-full hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>
            
            <form onSubmit={handleUpdateAppointment} className="space-y-5">
              <div>
                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Patient</label>
                <input 
                  type="text" 
                  required
                  value={formData.patient}
                  onChange={e => setFormData({ ...formData, patient: e.target.value })}
                  className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold focus:outline-none focus:border-blue-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Âge</label>
                  <input 
                    type="number" 
                    value={formData.age}
                    onChange={e => setFormData({ ...formData, age: e.target.value })}
                    className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold focus:outline-none focus:border-blue-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Sexe</label>
                  <select 
                    value={formData.gender}
                    onChange={e => setFormData({ ...formData, gender: e.target.value })}
                    className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold focus:outline-none focus:border-blue-600"
                  >
                    <option value="M">Masculin</option>
                    <option value="F">Féminin</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Motif</label>
                <input 
                  type="text" 
                  required
                  value={formData.reason}
                  onChange={e => setFormData({ ...formData, reason: e.target.value })}
                  className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold focus:outline-none focus:border-blue-600"
                />
              </div>

              <div>
                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Médecin</label>
                <input 
                  type="text" 
                  value={formData.doctor}
                  onChange={e => setFormData({ ...formData, doctor: e.target.value })}
                  className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold focus:outline-none focus:border-blue-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Date</label>
                  <input 
                    type="date" 
                    value={formData.date}
                    onChange={e => setFormData({ ...formData, date: e.target.value })}
                    className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold focus:outline-none focus:border-blue-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Heure</label>
                  <input 
                    type="time" 
                    value={formData.time}
                    onChange={e => setFormData({ ...formData, time: e.target.value })}
                    className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold focus:outline-none focus:border-blue-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Statut</label>
                <select 
                  value={formData.status}
                  onChange={e => setFormData({ ...formData, status: e.target.value })}
                  className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold focus:outline-none focus:border-blue-600"
                >
                  <option value="PENDING">En attente (PENDING)</option>
                  <option value="IN_PROGRESS">En cours (IN_PROGRESS)</option>
                  <option value="COMPLETED">Terminé (COMPLETED)</option>
                  <option value="ABSENT">Absent (ABSENT)</option>
                  <option value="POSTPONED">Reporter (POSTPONED)</option>
                  <option value="CANCELLED">Annuler (CANCELLED)</option>
                </select>
              </div>

              <button 
                type="submit"
                disabled={isSubmitting}
                className="w-full mt-6 py-4 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white rounded-2xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw size={14} className="animate-spin" />
                    Mise à jour en cours...
                  </>
                ) : (
                  'Mettre à jour le Rendez-vous'
                )}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Appointments;
