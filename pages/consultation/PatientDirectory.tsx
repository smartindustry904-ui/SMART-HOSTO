import React, { useState, useEffect } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../src/firebase';
import { Search, Users, ClipboardList, Phone, MapPin, Calendar, ArrowRight, Eye, RefreshCw, UserCheck } from 'lucide-react';

interface Patient {
  id: string;
  firstName: string;
  lastName: string;
  birthDate: string;
  gender: 'M' | 'F';
  phone: string;
  residence: string;
  maritalStatus?: string;
  emergencyContact?: string;
  emergencyPhone?: string;
}

interface PatientDirectoryProps {
  onSelectPatient: (patient: any) => void;
}

export default function PatientDirectory({ onSelectPatient }: PatientDirectoryProps) {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'patients'), (snapshot) => {
      const list: Patient[] = [];
      snapshot.docs.forEach((docSnap) => {
        const data = docSnap.data();
        list.push({
          id: data.id || docSnap.id,
          firstName: data.firstName || '',
          lastName: data.lastName || '',
          birthDate: data.birthDate || '',
          gender: data.gender || 'M',
          phone: data.phone || '',
          residence: data.residence || '',
          maritalStatus: data.maritalStatus,
          emergencyContact: data.emergencyContact,
          emergencyPhone: data.emergencyPhone,
        });
      });
      setPatients(list);
      setLoading(false);
    }, (error) => {
      console.error("Error listening to patients: ", error);
      setLoading(false);
    });

    return () => unsub();
  }, []);

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
      {/* Header section */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-10">
        <div>
          <h1 className="text-4xl font-black tracking-tight text-slate-900">Annuaire des Patients</h1>
          <p className="text-slate-500 font-medium italic">Accédez aux dossiers cliniques de tous les patients enregistrés.</p>
        </div>
        <div className="bg-blue-600 text-white px-6 py-3 rounded-2xl text-xs font-black uppercase tracking-widest shadow-xl shadow-blue-600/20 flex items-center gap-2">
          <Users size={16} />
          {patients.length} Patients au total
        </div>
      </div>

      {/* Search Bar and Controls */}
      <div className="bg-white rounded-[32px] p-6 border border-slate-200 shadow-sm mb-8">
        <div className="relative">
          <span className="absolute inset-y-0 left-0 flex items-center pl-4 text-slate-400">
            <Search size={20} />
          </span>
          <input
            type="text"
            placeholder="Rechercher par nom, prénom, ID patient (DME), téléphone, résidence..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-slate-800 placeholder-slate-400 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
          />
        </div>
      </div>

      {/* Patients list */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <RefreshCw size={40} className="text-blue-600 animate-spin" />
          <p className="text-slate-500 font-bold">Chargement des dossiers patients...</p>
        </div>
      ) : filteredPatients.length === 0 ? (
        <div className="bg-white rounded-[40px] border border-slate-200 p-20 text-center shadow-sm">
          <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-400 mx-auto mb-6">
            <Search size={32} />
          </div>
          <h3 className="text-xl font-black text-slate-800 mb-2">Aucun patient trouvé</h3>
          <p className="text-slate-500 max-w-md mx-auto">Nous n'avons trouvé aucun dossier correspondant à votre recherche. Veuillez vérifier l'orthographe ou essayer d'autres critères.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredPatients.map((p) => {
            const ageVal = calculateAge(p.birthDate);
            return (
              <div
                key={p.id}
                className="bg-white rounded-[32px] border border-slate-200 p-8 hover:border-blue-500 hover:shadow-2xl transition-all group relative overflow-hidden flex flex-col justify-between"
              >
                <div>
                  <div className="flex justify-between items-start mb-6">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600 font-black text-lg">
                        {p.lastName.charAt(0)}{p.firstName.charAt(0)}
                      </div>
                      <div>
                        <span className="text-[10px] font-black text-slate-400 font-mono tracking-widest uppercase">{p.id}</span>
                        <h3 className="text-xl font-black text-slate-900 leading-tight">{p.lastName} {p.firstName}</h3>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3.5 mb-8">
                    <div className="flex items-center gap-3 text-slate-600">
                      <Calendar size={16} className="text-slate-400" />
                      <span className="text-xs font-bold">
                        {p.birthDate ? `${new Date(p.birthDate).toLocaleDateString('fr-FR')} (${ageVal} ans)` : 'Né(e) - non renseigné'}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-slate-600">
                      <Phone size={16} className="text-slate-400" />
                      <span className="text-xs font-mono font-bold">
                        {p.phone || 'Aucun numéro enregistré'}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-slate-600">
                      <MapPin size={16} className="text-slate-400" />
                      <span className="text-xs font-bold truncate">
                        {p.residence || 'Résidence non renseignée'}
                      </span>
                    </div>

                    {p.maritalStatus && (
                      <div className="bg-slate-50 border border-slate-100/80 rounded-xl px-3.5 py-2 text-[10px] text-slate-500 font-bold flex justify-between items-center">
                        <span>Statut matrimonial:</span>
                        <span className="bg-white px-2 py-0.5 rounded border border-slate-200 uppercase">{p.maritalStatus}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="pt-6 border-t border-slate-100 mt-auto flex gap-2">
                  <button
                    onClick={() => onSelectPatient({
                      ...p,
                      age: ageVal,
                      name: `${p.lastName} ${p.firstName}`
                    })}
                    className="flex-1 flex items-center justify-center gap-2 bg-blue-600 text-white font-black text-xs uppercase tracking-wider py-3.5 px-4 rounded-xl shadow-lg shadow-blue-600/10 hover:bg-blue-700 transition-all cursor-pointer"
                  >
                    <ClipboardList size={14} />
                    Consulter / Dossier
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
