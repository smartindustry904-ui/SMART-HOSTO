
import React, { useState, useEffect } from 'react';
import { Pill, RefreshCw, Edit3, Trash2, Plus, FileText, CheckCircle2, AlertTriangle, Clock } from 'lucide-react';
import DigitalPrescription from '../tools/DigitalPrescription';
import { Patient, User, Medication, Ordonnance, Prescription } from '../../types';
import { db } from '../../src/firebase';
import { collection, doc, setDoc, onSnapshot, query, orderBy, deleteDoc } from 'firebase/firestore';

interface OrdonnanceTabProps {
  patient: Patient;
  user: User;
}

const OrdonnanceTab: React.FC<OrdonnanceTabProps> = ({ patient, user }) => {
  const [showNewPrescription, setShowNewPrescription] = useState(false);
  const [prescriptions, setPrescriptions] = useState<Ordonnance[]>([]);
  const [medications, setMedications] = useState<Medication[]>([]);
  const [loading, setLoading] = useState(true);

  // Fallback medications catalog if none in Firestore
  const staticMedications: Medication[] = [
    { id: 'm1', name: 'Paracétamol', dosage: '500mg', price: 500, stock: 100, forms: ['Comprimé'] },
    { id: 'm2', name: 'Amoxicilline', dosage: '1g', price: 2500, stock: 50, forms: ['Gélule'] },
    { id: 'm3', name: 'Artéméther/Luméfantrine', dosage: '20/120mg', price: 3500, stock: 30, forms: ['Comprimé'] },
    { id: 'm4', name: 'Spasfon', dosage: '80mg', price: 1500, stock: 80, forms: ['Comprimé'] },
    { id: 'm5', name: 'Gaviscon', dosage: 'Sachet', price: 3000, stock: 40, forms: ['Suspension Buvable'] }
  ];

  // 1. Listen to real pending_prescriptions for this specific patient
  useEffect(() => {
    try {
      const q = query(collection(db, 'pending_prescriptions'), orderBy('createdAt', 'desc'));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const prescrMap = new Map<string, Ordonnance>();
        snapshot.docs.forEach((docSnap) => {
          const data = docSnap.data();
          // Filter by patient ID safely (case-insensitive string match or numeric match)
          if (data.patientId === patient.id || String(data.patientId) === String(patient.id)) {
            const key = data.id || docSnap.id;
            if (!prescrMap.has(key)) {
              // Map Firestore model to the Ordonnance type
              prescrMap.set(key, {
                id: key,
                patientId: data.patientId,
                prescripteurId: data.doctorEmail || 'DOC-001',
                prescripteurName: data.doctor || 'Dr. Sarr',
                date: data.createdAt || new Date().toISOString(),
                status: data.status === 'pending' ? 'TRANSMITTED' : 'VALIDATED',
                traitements: (data.items || []).map((it: any, index: number) => ({
                  id: `p-${docSnap.id}-${index}`,
                  patientId: data.patientId,
                  medicationName: it.name,
                  dosageScheme: it.posology || '1 tab x3/jour',
                  duration: it.duration || 5,
                  totalBoxes: it.quantity || 1,
                  price: it.price || 1500
                }))
              });
            }
          }
        });

        setPrescriptions(Array.from(prescrMap.values()));
        setLoading(false);
      }, (error) => {
        console.warn("Real-time prescription download warn: ", error);
        setLoading(false);
      });

      return () => unsubscribe();
    } catch (e) {
      console.error(e);
      setLoading(false);
    }
  }, [patient.id]);

  // 2. Fetch medication catalog from pharmacy_inventory (Settings)
  useEffect(() => {
    try {
      const q = query(collection(db, 'pharmacy_inventory'));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        if (!snapshot.empty) {
          const list = snapshot.docs.map(ds => {
            const d = ds.data();
            return {
              id: ds.id,
              name: d.name || d.nomCommercial || d.nom,
              dosage: d.dosage || (d.dosageValeur ? `${d.dosageValeur} ${d.dosageUnite || ''}`.trim() : ''),
              price: parseFloat(d.price) || parseFloat(d.prixVente) || 0,
              stock: parseInt(d.stock) || parseInt(d.quantite) || parseInt(d.unitesParConditionnement) || 0,
              forms: d.forms || (d.formeGalenique ? [d.formeGalenique] : ['Comprimé'])
            } as Medication;
          });
          setMedications(list);
        } else {
          setMedications(staticMedications);
        }
      });
      return () => unsubscribe();
    } catch (e) {
      console.warn("Medication collection error, using fallbacks: ", e);
      setMedications(staticMedications);
    }
  }, []);

  const handleRenew = async (ord: Ordonnance) => {
    try {
      const today = new Date();
      const dateStr = today.toLocaleDateString('fr-FR');
      // Set new prescription reference in Firestore
      const newOrdId = `ORD-${Math.floor(Math.random() * 1000000)}`;
      const docRef = doc(collection(db, 'pending_prescriptions'));
      
      const doctorName = user?.name || user?.username || 'Dr. Sarr';
      const doctorId = user?.id || '';

      const payload = {
        id: newOrdId,
        firebaseId: docRef.id,
        patientId: patient.id,
        patient: `${patient.lastName} ${patient.firstName}`,
        doctor: doctorName,
        doctorName: doctorName,
        doctorId: doctorId,
        prescriberId: doctorId,
        prescriberName: doctorName,
        practitionerId: doctorId,
        practitionerName: doctorName,
        practitionerRole: user?.role || 'MEDECIN',
        date: dateStr,
        items: ord.traitements.map((t: any) => ({
          name: t.medicationName,
          posology: t.dosageScheme,
          duration: t.duration,
          quantity: t.totalBoxes || 1,
          price: t.price || 1500,
          practitionerId: doctorId,
          practitionerName: doctorName
        })),
        createdAt: today.toISOString(),
        status: 'pending'
      };

      await setDoc(docRef, payload);

      // Audit log the renewal
      await setDoc(doc(collection(db, 'audit_logs')), {
        user: user?.name || 'Docteur',
        role: 'DOCTOR',
        date: dateStr,
        time: today.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
        timestamp: today.toISOString(),
        action: `Renouvellement d'ordonnance - Patient: ${patient.lastName} ${patient.firstName}`,
        details: { oldOrdId: ord.id, newOrdId },
        module: 'Consultation'
      });

      alert(`✓ Ordonnance ${newOrdId} renouvelée et transmise à la pharmacie.`);
    } catch (err) {
      console.error(err);
      alert("✗ Échec du renouvellement");
    }
  };

  const handleCreatePrescription = async (newOrd: Ordonnance) => {
    try {
      const today = new Date();
      const dateStr = today.toLocaleDateString('fr-FR');
      const timeStr = today.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
      
      const docRef = doc(collection(db, 'pending_prescriptions'));
      const doctorName = user?.name || user?.username || 'Dr. Sarr';
      const doctorId = user?.id || '';

      await setDoc(docRef, {
        id: newOrd.id,
        firebaseId: docRef.id,
        patientId: patient.id,
        patient: `${patient.lastName} ${patient.firstName}`,
        doctor: doctorName,
        doctorName: doctorName,
        doctorId: doctorId,
        prescriberId: doctorId,
        prescriberName: doctorName,
        practitionerId: doctorId,
        practitionerName: doctorName,
        practitionerRole: user?.role || 'MEDECIN',
        date: dateStr,
        items: newOrd.traitements.map((t: any) => ({
          name: t.medicationName,
          posology: t.dosageScheme,
          duration: t.duration,
          quantity: t.totalBoxes || 1,
          price: t.price || 1500,
          practitionerId: doctorId,
          practitionerName: doctorName
        })),
        createdAt: today.toISOString(),
        status: 'pending'
      });

      // Audit log
      await setDoc(doc(collection(db, 'audit_logs')), {
        user: user?.name || 'Docteur',
        role: 'DOCTOR',
        date: dateStr,
        time: timeStr,
        timestamp: today.toISOString(),
        action: `Création d'ordonnance - Patient: ${patient.lastName} ${patient.firstName}`,
        details: { ordId: newOrd.id, itemsCount: newOrd.traitements.length },
        module: 'Consultation'
      });

      alert("✓ Ordonnance transmise à la pharmacie");
      setShowNewPrescription(false);
    } catch (err) {
      console.error(err);
      alert("✗ Échec de transmission");
    }
  };

  if (showNewPrescription) {
    return (
      <DigitalPrescription 
        patient={patient} 
        prescripteur={user} 
        medications={medications}
        onValidate={handleCreatePrescription}
        onCancel={() => setShowNewPrescription(false)}
      />
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-2xl font-black text-slate-900">Ordonnances & Traitements</h3>
          <p className="text-slate-500 font-medium">Gérez les prescriptions actives et l'historique thérapeutique</p>
        </div>
        <button 
          onClick={() => setShowNewPrescription(true)}
          className="flex items-center gap-3 px-8 py-4 bg-emerald-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-xl shadow-emerald-600/20 cursor-pointer"
        >
          <Plus size={18} /> Nouvelle Ordonnance
        </button>
      </div>

      {/* Active Treatments Summary */}
      <div className="bg-emerald-50 border border-emerald-100 rounded-[32px] p-8">
        <h4 className="text-sm font-black text-emerald-900 uppercase tracking-widest mb-6 flex items-center gap-2">
          <CheckCircle2 size={18} className="text-emerald-600" /> Traitements Actifs
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {prescriptions.filter(o => o.status === 'VALIDATED' || o.status === 'TRANSMITTED').flatMap(o => o.traitements).map(t => (
            <div key={t.id} className="bg-white p-6 rounded-2xl border border-emerald-100 shadow-sm flex justify-between items-start group">
              <div>
                <p className="font-black text-slate-900">{t.medicationName}</p>
                <p className="text-xs text-slate-500 font-medium mb-3">{t.dosageScheme}</p>
                <div className="flex items-center gap-2 text-[10px] font-black text-emerald-600 uppercase tracking-widest">
                  <Clock size={12} /> Reste {t.duration} jours
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Prescription History */}
      <div className="space-y-4">
        <h4 className="text-sm font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
          <FileText size={18} /> Historique des ordonnances
        </h4>
        <div className="bg-white rounded-[32px] border border-slate-200 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-8 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Date</th>
                <th className="px-8 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">ID Ordonnance</th>
                <th className="px-8 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Prescripteur</th>
                <th className="px-8 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Médicaments</th>
                <th className="px-8 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Statut</th>
                <th className="px-8 py-4 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {prescriptions.map(ord => (
                <tr key={ord.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-8 py-6 text-sm font-bold text-slate-700">{new Date(ord.date).toLocaleDateString()}</td>
                  <td className="px-8 py-6 text-sm font-mono font-black text-blue-600">{ord.id}</td>
                  <td className="px-8 py-6 text-sm font-bold text-slate-900">{ord.prescripteurName}</td>
                  <td className="px-8 py-6">
                    <div className="flex flex-wrap gap-2">
                      {ord.traitements.map(t => (
                        <span key={t.id} className="px-2 py-1 bg-slate-100 text-slate-600 rounded-md text-[10px] font-bold">
                          {t.medicationName}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-8 py-6">
                    <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${
                      ord.status === 'VALIDATED' ? 'bg-emerald-100 text-emerald-600' : 
                      ord.status === 'TRANSMITTED' ? 'bg-blue-100 text-blue-600' : 'bg-amber-100 text-amber-600'
                    }`}>
                      {ord.status}
                    </span>
                  </td>
                  <td className="px-8 py-6 text-right">
                    <div className="flex justify-end gap-2">
                      <button 
                        onClick={() => handleRenew(ord)}
                        className="p-2 bg-emerald-50 text-emerald-600 rounded-xl hover:bg-emerald-100 transition-colors cursor-pointer" 
                        title="Renouveler"
                      >
                        <RefreshCw size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default OrdonnanceTab;
