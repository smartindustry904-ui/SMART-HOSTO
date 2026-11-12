import React, { useState, useEffect } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../src/firebase';
import { 
  Search, 
  Users, 
  ClipboardList, 
  Phone, 
  MapPin, 
  Calendar, 
  ArrowRight, 
  Eye, 
  RefreshCw, 
  UserCheck,
  Building2,
  Droplet,
  ShieldAlert,
  ChevronRight,
  FolderOpen,
  AlertTriangle
} from 'lucide-react';
import { getActiveTenantId, belongsToTenant } from '../../src/utils/tenant';

interface Patient {
  id: string;
  docId?: string;
  patientId?: string;
  dmeId?: string;
  firstName: string;
  lastName: string;
  birthDate: string;
  gender: 'M' | 'F';
  phone: string;
  residence: string;
  maritalStatus?: string;
  emergencyContact?: string;
  emergencyPhone?: string;
  bloodGroup?: string;
  allergies?: string[];
  antecedents?: any[];
  vitals?: any;
  motif?: string;
  lastVisit?: string;
  createdAt?: string;
  status?: string;
  structureName?: string;
  clinicId?: string;
  isLambda?: boolean;
  isAnonymous?: boolean;
  admissionMode?: string;
  [key: string]: any;
}

interface PatientDirectoryProps {
  onSelectPatient: (patient: any) => void;
  user?: any;
}

export default function PatientDirectory({ onSelectPatient, user }: PatientDirectoryProps) {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  // Active hospital tenant resolution
  const activeTenantId = getActiveTenantId(user);
  const activeHospitalName = (user as any)?.structureName || (user as any)?.hospitalName || 'Établissement Actif';

  useEffect(() => {
    setLoading(true);
    const unsub = onSnapshot(collection(db, 'patients'), (snapshot) => {
      const list: Patient[] = [];
      snapshot.docs.forEach((docSnap) => {
        const data = docSnap.data();
        // Strict tenant isolation: only patients belonging to the active hospital!
        if (!belongsToTenant(data, activeTenantId)) {
          return;
        }
        list.push({
          ...data,
          id: data.id || docSnap.id,
          docId: docSnap.id,
          patientId: data.patientId || data.id || docSnap.id,
          dmeId: data.dmeId || data.id || docSnap.id,
          firstName: data.firstName || '',
          lastName: data.lastName || '',
          birthDate: data.birthDate || '',
          gender: data.gender || 'M',
          phone: data.phone || '',
          residence: data.residence || '',
          maritalStatus: data.maritalStatus,
          emergencyContact: data.emergencyContact,
          emergencyPhone: data.emergencyPhone,
          bloodGroup: data.bloodGroup,
          allergies: Array.isArray(data.allergies) ? data.allergies : (data.allergies ? [data.allergies] : []),
          antecedents: Array.isArray(data.antecedents) ? data.antecedents : (data.antecedents ? [data.antecedents] : []),
          vitals: data.vitals || {},
          motif: data.motif || data.currentMotif || '',
          lastVisit: data.lastVisit || data.updatedAt || data.createdAt,
          createdAt: data.createdAt,
          status: data.status,
          structureName: data.structureName || activeHospitalName,
          clinicId: data.clinicId || data.hospital_id || activeTenantId,
          isLambda: !!data.isLambda,
          isAnonymous: !!data.isAnonymous,
          admissionMode: data.admissionMode || '',
        });
      });

      // Sort by recent creation or update
      list.sort((a, b) => {
        const timeA = new Date(a.createdAt || 0).getTime();
        const timeB = new Date(b.createdAt || 0).getTime();
        return timeB - timeA;
      });

      setPatients(list);
      setLoading(false);
    }, (error) => {
      console.error("Error listening to patients: ", error);
      setLoading(false);
    });

    return () => unsub();
  }, [activeTenantId, activeHospitalName]);

  const calculateAge = (birthDateString: string) => {
    if (!birthDateString) return '--';
    const birthDate = new Date(birthDateString);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };

  const filteredPatients = patients.filter((p) => {
    const fullName = `${p.lastName || ''} ${p.firstName || ''}`.toLowerCase();
    const reversedName = `${p.firstName || ''} ${p.lastName || ''}`.toLowerCase();
    const query = (searchQuery || '').toLowerCase().trim();
    if (!query) return true;
    return (
      fullName.includes(query) ||
      reversedName.includes(query) ||
      (p.id || '').toLowerCase().includes(query) ||
      (p.phone || '').includes(query) ||
      (p.residence || '').toLowerCase().includes(query)
    );
  });

  return (
    <div className="animate-in fade-in slide-in-from-bottom-6 duration-700">
      {/* Header section with active hospital indicator */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-8">
        <div>
          <div className="flex items-center gap-2 text-xs font-black uppercase text-blue-600 tracking-wider mb-1.5">
            <Building2 size={16} />
            <span>{activeHospitalName}</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-slate-900">Annuaire des Patients</h1>
          <p className="text-slate-500 font-medium text-sm mt-1">Accédez aux dossiers cliniques et DME de votre établissement hospitalier.</p>
        </div>
        <div className="bg-blue-600 text-white px-5 py-3 rounded-2xl text-xs font-black uppercase tracking-widest shadow-xl shadow-blue-600/20 flex items-center gap-2.5">
          <Users size={16} />
          <span>{filteredPatients.length} {filteredPatients.length > 1 ? 'Patients enregistrés' : 'Patient enregistré'}</span>
        </div>
      </div>

      {/* Search Bar and Controls */}
      <div className="bg-white rounded-[28px] p-4 sm:p-5 border border-slate-200 shadow-sm mb-8">
        <div className="relative">
          <span className="absolute inset-y-0 left-0 flex items-center pl-4 text-slate-400">
            <Search size={20} />
          </span>
          <input
            type="text"
            placeholder="Rechercher par nom, prénom, ID patient (DME), téléphone, résidence..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-slate-800 placeholder-slate-400 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
          />
        </div>
      </div>

      {/* Patients list */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <RefreshCw size={40} className="text-blue-600 animate-spin" />
          <p className="text-slate-500 font-bold">Chargement des dossiers patients de l'établissement...</p>
        </div>
      ) : filteredPatients.length === 0 ? (
        <div className="bg-white rounded-[32px] border border-slate-200 p-16 text-center shadow-sm">
          <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-400 mx-auto mb-5">
            <Search size={32} />
          </div>
          <h3 className="text-xl font-black text-slate-800 mb-2">Aucun dossier patient trouvé</h3>
          <p className="text-slate-500 max-w-md mx-auto text-sm">
            {searchQuery 
              ? `Aucun patient ne correspond à la recherche « ${searchQuery} » pour cette structure.` 
              : `Aucun patient n'est encore enregistré pour ${activeHospitalName}. Les dossiers créés à l'Accueil apparaîtront ici.`}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredPatients.map((p) => {
            const ageVal = calculateAge(p.birthDate);
            return (
              <div
                key={p.id}
                className="bg-white rounded-[28px] border border-slate-200/90 p-6 sm:p-7 hover:border-blue-500 hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 group relative flex flex-col justify-between shadow-sm bg-gradient-to-b from-white via-white to-slate-50/40"
              >
                <div>
                  {/* Card Top Row: Avatar + Names + Blood Group */}
                  <div className="flex items-start justify-between gap-3 mb-5">
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div className={`w-14 h-14 rounded-2xl flex items-center justify-center font-black text-base shrink-0 shadow-md ${
                        p.gender === 'F' 
                          ? 'bg-gradient-to-br from-pink-500 to-rose-600 text-white shadow-rose-500/20' 
                          : 'bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-blue-600/20'
                      }`}>
                        {(p.lastName || 'P').charAt(0).toUpperCase()}{(p.firstName || 'A').charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-mono text-[10px] font-black px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 tracking-wider">
                            #{p.id}
                          </span>
                          <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md ${
                            p.gender === 'F' ? 'bg-pink-50 text-pink-700' : 'bg-blue-50 text-blue-700'
                          }`}>
                            {p.gender === 'F' ? 'Femme' : 'Homme'}
                          </span>
                          {(p.isLambda || p.isAnonymous) && (
                            <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 border border-amber-300">
                              ⚡ Soin Express (Lambda)
                            </span>
                          )}
                        </div>
                        <h3 className="text-base font-black text-slate-900 group-hover:text-blue-600 transition-colors leading-snug truncate" title={`${p.lastName} ${p.firstName}`}>
                          {p.lastName.toUpperCase()} {p.firstName}
                        </h3>
                      </div>
                    </div>

                    {p.bloodGroup && (
                      <span className="px-2.5 py-1 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-black shrink-0 flex items-center gap-1 shadow-xs" title="Groupe Sanguin">
                        <Droplet size={12} className="fill-rose-500 text-rose-500" />
                        {p.bloodGroup}
                      </span>
                    )}
                  </div>

                  {/* Information Details List with generous padding */}
                  <div className="space-y-2.5 bg-slate-50/70 p-4 rounded-2xl border border-slate-100 mb-5">
                    <div className="flex items-center gap-2.5 text-slate-700 text-xs">
                      <Calendar size={14} className="text-blue-500 shrink-0" />
                      <span className="font-bold">
                        {p.birthDate ? `${new Date(p.birthDate).toLocaleDateString('fr-FR')} (${ageVal} ans)` : 'Date de naissance non renseignée'}
                      </span>
                    </div>

                    <div className="flex items-center gap-2.5 text-slate-700 text-xs">
                      <Phone size={14} className="text-emerald-500 shrink-0" />
                      <span className="font-mono font-bold tracking-tight">
                        {p.phone || 'Aucun contact téléphonique'}
                      </span>
                    </div>

                    <div className="flex items-center gap-2.5 text-slate-700 text-xs">
                      <MapPin size={14} className="text-amber-500 shrink-0" />
                      <span className="font-medium text-slate-600 truncate" title={p.residence}>
                        {p.residence || 'Résidence non renseignée'}
                      </span>
                    </div>

                    {(p.emergencyContact || p.emergencyPhone) && (
                      <div className="flex items-center gap-2.5 text-slate-700 text-xs pt-1.5 border-t border-slate-200/60">
                        <ShieldAlert size={14} className="text-rose-500 shrink-0" />
                        <span className="text-[11px] text-slate-600 truncate font-medium">
                          Urgence : <strong className="text-slate-800">{p.emergencyContact || 'Proche'}</strong> {p.emergencyPhone ? `(${p.emergencyPhone})` : ''}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Badges footer: Status + Matrimonial + Allergies */}
                  <div className="flex flex-wrap items-center gap-1.5 mb-5 min-h-[24px]">
                    {p.maritalStatus && (
                      <span className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-[10px] font-bold text-slate-600 uppercase tracking-wider">
                        {p.maritalStatus}
                      </span>
                    )}
                    {p.allergies && p.allergies.length > 0 && (
                      <span className="px-2.5 py-1 bg-amber-50 border border-amber-200 rounded-lg text-[10px] font-black text-amber-800 flex items-center gap-1">
                        <AlertTriangle size={11} className="text-amber-600" />
                        {p.allergies.length} allergie(s)
                      </span>
                    )}
                    <span className="ml-auto text-[10px] font-bold text-slate-400">
                      Dossier DME Actif
                    </span>
                  </div>
                </div>

                {/* Card Action Button */}
                <div className="pt-4 border-t border-slate-100 mt-auto">
                  <button
                    onClick={() => onSelectPatient({
                      ...p,
                      id: p.id || p.patientId || p.docId,
                      patientId: p.patientId || p.id,
                      docId: p.docId || p.id,
                      dmeId: p.dmeId || p.id,
                      vitals: p.vitals || {},
                      antecedents: p.antecedents || [],
                      allergies: p.allergies || [],
                      age: ageVal,
                      name: `${p.lastName} ${p.firstName}`.trim()
                    })}
                    className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-black text-xs uppercase tracking-wider py-3.5 px-4 rounded-2xl shadow-md shadow-blue-600/20 hover:shadow-lg hover:shadow-blue-600/30 transition-all cursor-pointer group-hover:scale-[1.01]"
                  >
                    <FolderOpen size={16} />
                    <span>Consulter / Ouvrir Dossier</span>
                    <ChevronRight size={15} className="ml-0.5 opacity-70 group-hover:translate-x-0.5 transition-transform" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
