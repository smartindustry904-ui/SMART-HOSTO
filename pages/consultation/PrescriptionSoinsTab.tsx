import React, { useState, useEffect } from 'react';
import { 
  Syringe, Clock, CheckCircle2, AlertTriangle, ShieldAlert, 
  Send, User, FileText, Check, Activity, Droplets, HeartPulse, 
  Sparkles, RefreshCw, X, AlertCircle, ChevronDown, Loader2
} from 'lucide-react';
import { db, sanitizeData } from '../../src/firebase';
import { collection, doc, setDoc, query, where, onSnapshot, orderBy, limit } from 'firebase/firestore';
import { User as UserType } from '../../types';
import { stampTenantData, getActiveTenantId, belongsToTenant } from '../../src/utils/tenant';

interface PrescriptionSoinsTabProps {
  patient: any;
  user: UserType;
  source?: 'CONSULTATION' | 'URGENCES';
  defaultPriority?: 'NORMAL' | 'URGENT' | 'CRITIQUE';
  onSuccess?: () => void;
  onCareRecorded?: (care: any) => void;
}

const CARE_PROTOCOLS = [
  {
    category: 'Injections & Voies Veineuses',
    icon: Syringe,
    items: [
      { name: 'Injection Intramusculaire (IM)', defaultNotes: 'Administrer selon prescription, quadrant supéro-externe fessier ou deltoïde.', priority: 'NORMAL' },
      { name: 'Injection Intraveineuse Directe (IVD)', defaultNotes: 'Injection lente sur 3 à 5 minutes.', priority: 'URGENT' },
      { name: 'Pose de Voie Veineuse Périphérique (VVP) & Perfusion', defaultNotes: 'Pose cathéter 18G/20G, branchement soluté selon prescription, surveillance débit et point de ponction.', priority: 'URGENT' },
      { name: 'Injection Sous-Cutanée (SC)', defaultNotes: 'Plis ombilical ou cuisse, surveillance hématome.', priority: 'NORMAL' }
    ]
  },
  {
    category: 'Pansements & Plaies',
    icon: HeartPulse,
    items: [
      { name: 'Pansement simple & Asepsie', defaultNotes: 'Nettoyage au sérum physiologique, antiseptique dermique, compresse stérile.', priority: 'NORMAL' },
      { name: 'Pansement complexe / Brûlure / Escarre', defaultNotes: 'Détersion douce, tulle gras, compresse absorbante, bande de maintien.', priority: 'NORMAL' },
      { name: 'Ablation de points de suture / Agrafes', defaultNotes: 'Désinfection préalable, ablation stérile d\'un point sur deux, pansement de protection.', priority: 'NORMAL' }
    ]
  },
  {
    category: 'Sondages & Évacuation',
    icon: Droplets,
    items: [
      { name: 'Sondage vésical à demeure (SVD)', defaultNotes: 'Asepsie stricte, sonde Foley CH 14 ou 16, gonflage ballonnet 10ml eau PPI, raccordement poche à urine.', priority: 'URGENT' },
      { name: 'Pose de Sonde Naso-Gastrique (SNG)', defaultNotes: 'Vérification de position par test à la seringue / stéthoscope, fixation adhésive.', priority: 'URGENT' }
    ]
  },
  {
    category: 'Urgences & Surveillance',
    icon: Activity,
    items: [
      { name: 'Nébulisation / Aérosolthérapie', defaultNotes: 'Nébulisation sous oxygène 6-8 L/min pendant 15 minutes. Surveillance rythme cardiaque.', priority: 'URGENT' },
      { name: 'Surveillance rapprochée des Constantes', defaultNotes: 'Prise de TA, FC, SpO2, FR toutes les 30 minutes pendant 2 heures.', priority: 'CRITIQUE' },
      { name: 'Glycémie capillaire (Dextro)', defaultNotes: 'Contrôle immédiat de la glycémie au bout du doigt.', priority: 'NORMAL' }
    ]
  }
];

export const PrescriptionSoinsTab: React.FC<PrescriptionSoinsTabProps> = ({
  patient,
  user,
  source = 'CONSULTATION',
  defaultPriority = 'NORMAL',
  onSuccess,
  onCareRecorded
}) => {
  const [selectedProtocol, setSelectedProtocol] = useState(CARE_PROTOCOLS[0].items[0].name);
  const [instructions, setInstructions] = useState(CARE_PROTOCOLS[0].items[0].defaultNotes);
  const [priority, setPriority] = useState<'NORMAL' | 'URGENT' | 'CRITIQUE'>(
    source === 'URGENCES' ? (defaultPriority === 'NORMAL' ? 'URGENT' : defaultPriority) : defaultPriority
  );
  const [timing, setTiming] = useState('Immédiat (STAT)');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Dynamic protocols and medical acts loaded from hospital settings in Paramètres
  const [settingsCareProtocols, setSettingsCareProtocols] = useState<any[]>([]);
  const [settingsMedicalActs, setSettingsMedicalActs] = useState<any[]>([]);

  // Listen to configured hospital care protocols and medical acts in Paramètres
  useEffect(() => {
    let unsubProtocols: () => void = () => {};
    let unsubActs: () => void = () => {};

    try {
      const activeTenantId = getActiveTenantId(user);
      unsubProtocols = onSnapshot(collection(db, 'hospital_protocols'), (snapshot) => {
        const list = snapshot.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(p => belongsToTenant(p, activeTenantId));
        if (list.length > 0 || (activeTenantId && activeTenantId !== 'default_hospital' && activeTenantId !== 'ALL')) {
          const careList = list.filter((p: any) => 
            p.category === 'CARE' || 
            p.category === 'THERAPEUTIC' || 
            (p.name && /pansement|injection|perfusion|soin|sondage/i.test(p.name))
          );
          setSettingsCareProtocols(careList);
        } else {
          const saved = localStorage.getItem('hospital_protocols');
          if (saved) {
            try {
              const parsed = JSON.parse(saved);
              setSettingsCareProtocols(parsed.filter((p: any) => 
                p.category === 'CARE' || 
                p.category === 'THERAPEUTIC' || 
                (p.name && /pansement|injection|perfusion|soin|sondage/i.test(p.name))
              ));
            } catch (e) {}
          }
        }
      }, (err) => {
        console.warn("Could not listen to hospital_protocols:", err);
      });

      unsubActs = onSnapshot(collection(db, 'medical_acts'), (snapshot) => {
        const list = snapshot.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(a => belongsToTenant(a, activeTenantId));
        if (list.length > 0 || (activeTenantId && activeTenantId !== 'default_hospital' && activeTenantId !== 'ALL')) {
          const actsList = list.filter((a: any) => 
            a.category === 'soin' || 
            a.category === 'soins' || 
            a.servicePrincipal === 'soins_infirmiers' || 
            (a.type && String(a.type).toLowerCase().includes('soin'))
          );
          setSettingsMedicalActs(actsList);
        } else {
          const saved = localStorage.getItem('hospital_medical_acts');
          if (saved) {
            try {
              const parsed = JSON.parse(saved);
              setSettingsMedicalActs(parsed.filter((a: any) => 
                a.category === 'soin' || 
                a.category === 'soins' || 
                a.servicePrincipal === 'soins_infirmiers' || 
                (a.type && String(a.type).toLowerCase().includes('soin'))
              ));
            } catch (e) {}
          }
        }
      }, (err) => {
        console.warn("Could not listen to medical_acts:", err);
      });
    } catch (e) {
      console.warn("Error subscribing to settings referentials:", e);
    }

    return () => {
      unsubProtocols();
      unsubActs();
    };
  }, []);

  // History of prescribed care acts for this patient
  const [patientPrescriptions, setPatientPrescriptions] = useState<any[]>([]);

  // Listen to nursing_acts for this patient
  useEffect(() => {
    if (!patient?.id) return;
    const patientId = String(patient.id);
    try {
      const q = query(
        collection(db, 'nursing_acts'),
        orderBy('createdAt', 'desc'),
        limit(50)
      );
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const list = snapshot.docs
          .map(doc => ({ id: doc.id, ...doc.data() }))
          .filter((a: any) => a.patientId === patientId || String(a.patientId) === patientId);
        setPatientPrescriptions(list);
      }, (err) => {
        console.warn("Error listening to patient nursing_acts:", err);
      });
      return () => unsubscribe();
    } catch (e) {
      console.error("Error setting up nursing_acts listener:", e);
    }
  }, [patient?.id]);

  const handleSelectProtocol = (item: { name: string; defaultNotes: string; priority: string }) => {
    setSelectedProtocol(item.name);
    setInstructions(item.defaultNotes);
    setPriority(item.priority as any);
  };

  const handleSelectCareByName = (careName: string) => {
    setSelectedProtocol(careName);

    // 1. Search in clinical CARE_PROTOCOLS
    for (const group of CARE_PROTOCOLS) {
      const match = group.items.find(i => i.name === careName);
      if (match) {
        setInstructions(match.defaultNotes);
        setPriority(match.priority as any);
        return;
      }
    }

    // 2. Search in settingsCareProtocols
    const protoMatch = settingsCareProtocols.find(p => p.name === careName);
    if (protoMatch) {
      const guidance = protoMatch.clinicalGuidance || protoMatch.description || (protoMatch.elements ? protoMatch.elements.map((e: any) => e.name).join(', ') : '');
      if (guidance) setInstructions(guidance);
      if (protoMatch.priority) {
        const p = String(protoMatch.priority).toUpperCase();
        if (p === 'HIGH' || p === 'CRITICAL' || p === 'CRITIQUE') setPriority('CRITIQUE');
        else if (p === 'MEDIUM' || p === 'URGENT') setPriority('URGENT');
        else setPriority('NORMAL');
      }
      return;
    }

    // 3. Search in settingsMedicalActs
    const actMatch = settingsMedicalActs.find(a => a.name === careName);
    if (actMatch) {
      if (actMatch.description) setInstructions(actMatch.description);
      if (actMatch.priorite) {
        const p = String(actMatch.priorite).toUpperCase();
        if (p === 'URGENT') setPriority('URGENT');
        else if (p === 'CRITIQUE') setPriority('CRITIQUE');
        else setPriority('NORMAL');
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patient?.id) return;
    if (!selectedProtocol.trim()) {
      alert("Veuillez sélectionner un protocole de soin dans la liste.");
      return;
    }

    setIsSubmitting(true);
    setSuccessMessage(null);

    try {
      const today = new Date();
      const doctorName = user?.name || user?.email || (source === 'URGENCES' ? 'Dr. Urgentiste' : 'Dr. Traitant');
      const actDocRef = doc(collection(db, 'nursing_acts'));
      const isUrgence = source === 'URGENCES';

      const payload = {
        id: actDocRef.id,
        patientId: String(patient.patientId || patient.id),
        patientName: `${patient.lastName || ''} ${patient.firstName || ''}`.trim(),
        age: patient.age || null,
        gender: patient.gender || null,
        actType: selectedProtocol,
        instructions: instructions || '',
        priority: isUrgence ? 'HIGH' : priority,
        timing: timing,
        source: source, // 'URGENCES' | 'CONSULTATION'
        prescribedBy: doctorName,
        prescribedByRole: isUrgence ? 'Médecin Urgentiste' : 'Médecin',
        prescriberId: user?.id || '',
        prescriberName: doctorName,
        practitionerId: user?.id || '',
        practitionerName: doctorName,
        practitionerRole: isUrgence ? 'Médecin Urgentiste' : 'Médecin',
        prescribedAt: today.toISOString(),
        status: 'EN ATTENTE', // Strict pending status for Receive-Only Nurse Queue
        createdAt: today.toISOString(),
        date: today.toLocaleDateString('fr-FR'),
        time: today.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
      };

      await setDoc(actDocRef, sanitizeData(stampTenantData(payload, user)));

      // Generate payment request for Caisse
      const carePrice = 2000;
      const invoiceId = `PR-${Math.floor(Math.random() * 1000000)}`;
      const invoiceItems = [{
        id: `item-care-${actDocRef.id}`,
        name: `Soin infirmier : ${selectedProtocol}`,
        quantity: 1,
        unitPrice: carePrice,
        totalPrice: carePrice,
        practitionerId: user?.id || '',
        practitionerName: doctorName,
        practitionerRole: isUrgence ? 'Médecin Urgentiste' : 'Médecin'
      }];

      await setDoc(doc(db, 'payment_requests', invoiceId), sanitizeData(stampTenantData({
        id: invoiceId,
        patientId: String(patient.patientId || patient.id),
        patientName: `${patient.lastName || ''} ${patient.firstName || ''}`.trim(),
        requestingService: isUrgence ? 'Urgences' : 'Soins Infirmiers',
        sourceModule: isUrgence ? 'Emergency' : 'Consultation',
        type: 'SOINS_INFIRMIERS',
        items: invoiceItems,
        totalAmount: carePrice,
        amountPaid: 0,
        status: 'PENDING',
        createdAt: today.toISOString(),
        createdBy: doctorName,
        createdById: user?.id || '',
        practitionerId: user?.id || '',
        practitionerName: doctorName,
        practitionerRole: isUrgence ? 'Médecin Urgentiste' : 'Médecin',
        requestedBy: doctorName,
        requestedById: user?.id || ''
      }, user)));

      // Write audit log
      await setDoc(doc(collection(db, 'audit_logs')), {
        user: doctorName,
        role: isUrgence ? 'DOCTOR_URG' : 'DOCTOR',
        date: today.toLocaleDateString('fr-FR'),
        time: today.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
        timestamp: today.toISOString(),
        action: `Prescription de Soin Infirmier - Patient: ${patient.lastName} ${patient.firstName}`,
        details: { actId: actDocRef.id, protocol: selectedProtocol, priority: isUrgence ? 'HIGH' : priority, totalAmount: carePrice },
        module: 'Consultation'
      });

      window.dispatchEvent(new CustomEvent('app-notification', {
        detail: isUrgence
          ? `🚨 Soin d'urgence « ${selectedProtocol} » transmis en priorité HAUTE aux Soins Infirmiers et à la Caisse.`
          : `💉 Soin infirmier « ${selectedProtocol} » transmis aux Soins Infirmiers et à la Caisse.`
      }));

      setSuccessMessage(
        isUrgence
          ? `✓ Soin d'urgence « ${selectedProtocol} » transmis immédiatement à l'équipe infirmière et à la Caisse.`
          : `✓ Prescription de « ${selectedProtocol} » transmise avec succès aux Soins Infirmiers et à la Caisse.`
      );
      setTimeout(() => setSuccessMessage(null), 5000);

      if (onCareRecorded) {
        onCareRecorded({
          id: actDocRef.id,
          type: selectedProtocol,
          description: instructions || selectedProtocol,
          timestamp: today.toISOString(),
          date: today.toISOString().split('T')[0],
          time: today.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
          professional: doctorName,
          status: 'Prévu',
          priority: isUrgence ? 'HIGH' : priority,
          source: source
        });
      }

      if (onSuccess) onSuccess();
    } catch (err: any) {
      console.error("Error prescribing nursing care:", err);
      alert(`Erreur lors de la prescription : ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Header Banner */}
      <div className="bg-white p-6 md:p-8 rounded-[32px] border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center shrink-0">
            <Syringe size={24} />
          </div>
          <div>
            <h2 className="text-xl font-black text-slate-900">Prescription de Soins Infirmiers</h2>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Ordonnance transmise en temps réel à la file d'exécution des infirmiers(ères)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 bg-slate-50 px-4 py-2 rounded-2xl border border-slate-200/80">
          <User size={16} className="text-slate-400" />
          <div className="text-xs">
            <span className="font-bold text-slate-800">{patient?.lastName} {patient?.firstName}</span>
            <span className="text-slate-400 ml-2">#{patient?.id}</span>
          </div>
        </div>
      </div>

      {successMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-800 text-xs font-bold flex items-center gap-2.5 animate-in slide-in-from-top duration-200">
          <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Main Grid: Form on Left, Protocol Catalog on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left: Active Prescription Form */}
        <div className="lg:col-span-7 bg-white p-6 md:p-8 rounded-[32px] border border-slate-200 shadow-xs space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
              <FileText size={18} className="text-teal-600" />
              <span>Protocole à Prescrire</span>
            </h3>
            <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-teal-50 text-teal-700 border border-teal-200">
              Statut initial: EN ATTENTE
            </span>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Strict Care Protocol Dropdown (No Free-Text Typing) */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="care-protocol-select" className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  Type de Soin Infirmier <span className="text-rose-500">*</span>
                </label>
                <span className="text-[10px] font-bold text-teal-600 bg-teal-50 px-2 py-0.5 rounded-full border border-teal-200">
                  Référentiel Paramètres & Protocoles
                </span>
              </div>
              <div className="relative">
                <select
                  id="care-protocol-select"
                  value={selectedProtocol}
                  onChange={(e) => handleSelectCareByName(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all cursor-pointer appearance-none pr-10"
                  required
                >
                  <option value="" disabled>-- Sélectionner le protocole de soin infirmier --</option>
                  {CARE_PROTOCOLS.map((group) => (
                    <optgroup key={group.category} label={`━━ ${group.category} ━━`}>
                      {group.items.map((item) => (
                        <option key={item.name} value={item.name}>
                          {item.name} ({item.priority})
                        </option>
                      ))}
                    </optgroup>
                  ))}
                  {settingsCareProtocols.length > 0 && (
                    <optgroup label="━━ Protocoles Cliniques Paramétrés (Paramètres) ━━">
                      {settingsCareProtocols.map((p) => (
                        <option key={p.id || p.name} value={p.name}>
                          {p.name} {p.code ? `[${p.code}]` : ''}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {settingsMedicalActs.length > 0 && (
                    <optgroup label="━━ Actes Hospitaliers & Soins (Paramètres) ━━">
                      {settingsMedicalActs.map((act) => (
                        <option key={act.id || act.name} value={act.name}>
                          {act.name} {act.price ? `• ${Number(act.price).toLocaleString()} F` : ''}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3.5 text-slate-400">
                  <ChevronDown size={16} />
                </div>
              </div>
              <p className="text-[10px] text-slate-400 mt-1.5 flex items-center gap-1 font-medium">
                <CheckCircle2 size={11} className="text-teal-500" />
                Sélection stricte depuis le catalogue médical pour garantir la conformité infirmière.
              </p>
            </div>

            {/* Priority & Timing */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
                  Degré d'Urgence / Priorité
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {[
                    { id: 'NORMAL', label: 'Normal', color: 'bg-emerald-500' },
                    { id: 'URGENT', label: 'Urgent', color: 'bg-amber-500' },
                    { id: 'CRITIQUE', label: 'Critique', color: 'bg-rose-500' }
                  ].map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setPriority(p.id as any)}
                      className={`py-2 px-2 rounded-xl text-[11px] font-black uppercase tracking-wider border transition-all cursor-pointer ${
                        priority === p.id
                          ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <span className={`inline-block w-1.5 h-1.5 rounded-full ${p.color} mr-1.5`} />
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
                  Échéance / Moment d'Exécution
                </label>
                <select
                  value={timing}
                  onChange={(e) => setTiming(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:outline-hidden"
                >
                  <option value="Immédiat (STAT)">⚡ Immédiat (STAT - En salle de soins)</option>
                  <option value="Avant départ">Avant départ du patient</option>
                  <option value="1 fois par jour">1 fois par jour (Quotidien)</option>
                  <option value="Toutes les 8 heures">Toutes les 8 heures</option>
                  <option value="Toutes les 12 heures">Toutes les 12 heures</option>
                  <option value="À la demande (si douleur / fièvre)">Si besoin (douleur / fièvre)</option>
                </select>
              </div>
            </div>

            {/* Clinical Instructions */}
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
                Consignes Cliniques & Posologie pour l'Infirmier(ère)
              </label>
              <textarea
                rows={4}
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="Préciser le produit, le dosage, la voie exacte, la vitesse de perfusion, la surveillance requise..."
                className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all leading-relaxed"
                required
              />
            </div>

            {/* Submit Action */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3.5 bg-teal-600 hover:bg-teal-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-md hover:shadow-teal-600/20 flex items-center justify-center gap-2 cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Transmission au poste infirmier...</span>
                  </>
                ) : (
                  <>
                    <Send size={15} />
                    <span>Valider & Transmettre aux Soins Infirmiers</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Right: Quick Protocols Catalog */}
        <div className="lg:col-span-5 space-y-5">
          <div className="bg-slate-900 text-white p-6 md:p-8 rounded-[32px] shadow-xl space-y-4">
            <div className="flex items-center gap-2.5">
              <Sparkles size={18} className="text-teal-400" />
              <h3 className="text-base font-black tracking-tight">Protocoles Fréquents</h3>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Cliquez sur un protocole type pour pré-remplir instantanément la prescription.
            </p>

            <div className="space-y-4 mt-4 max-h-[440px] overflow-y-auto custom-scrollbar pr-1">
              {CARE_PROTOCOLS.map((group, gIdx) => {
                const GroupIcon = group.icon;
                return (
                  <div key={gIdx} className="space-y-2">
                    <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-teal-400">
                      <GroupIcon size={12} />
                      <span>{group.category}</span>
                    </div>

                    <div className="space-y-1.5">
                      {group.items.map((item, iIdx) => (
                        <div
                          key={iIdx}
                          onClick={() => handleSelectProtocol(item)}
                          className={`p-2.5 rounded-xl border text-left cursor-pointer transition-all ${
                            selectedProtocol === item.name
                              ? 'bg-teal-500/20 border-teal-400/80 text-white'
                              : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold">{item.name}</span>
                            <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-sm uppercase ${
                              item.priority === 'CRITIQUE' ? 'bg-rose-500/30 text-rose-300' :
                              item.priority === 'URGENT' ? 'bg-amber-500/30 text-amber-300' :
                              'bg-emerald-500/30 text-emerald-300'
                            }`}>
                              {item.priority}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-400 mt-1 line-clamp-1">{item.defaultNotes}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

      </div>

      {/* Live List of Nursing Acts Prescribed for this Patient */}
      <div className="bg-white p-6 md:p-8 rounded-[32px] border border-slate-200 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-black text-slate-900">
              Suivi des Soins Prescrits pour ce Patient ({patientPrescriptions.length})
            </h3>
            <p className="text-xs text-slate-400 font-medium">
              Statut en temps réel de l'exécution par l'équipe infirmière
            </p>
          </div>
        </div>

        {patientPrescriptions.length === 0 ? (
          <div className="py-12 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
            <Syringe size={32} className="mx-auto text-slate-300 mb-2" />
            <p className="text-xs font-black text-slate-500 uppercase tracking-wider">Aucun soin infirmier prescrit</p>
            <p className="text-[11px] text-slate-400 mt-1">Utilisez le formulaire ci-dessus pour prescrire une injection, un pansement ou une perfusion.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {patientPrescriptions.map((act, idx) => {
              const isDone = act.status === 'FAIT';
              return (
                <div
                  key={idx}
                  className={`p-4 rounded-2xl border transition-all ${
                    isDone 
                      ? 'bg-emerald-50/40 border-emerald-200/80' 
                      : 'bg-amber-50/30 border-amber-200/80'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider border ${
                        act.priority === 'CRITIQUE' ? 'bg-rose-100 text-rose-700 border-rose-200' :
                        act.priority === 'URGENT' ? 'bg-amber-100 text-amber-700 border-amber-200' :
                        'bg-teal-100 text-teal-700 border-teal-200'
                      }`}>
                        {act.priority || 'NORMAL'}
                      </span>
                      <span className="text-sm font-black text-slate-900">{act.actType}</span>
                      <span className="text-xs text-slate-400 font-medium">• {act.timing || 'Immédiat'}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 ${
                        isDone
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                          : 'bg-amber-100 text-amber-800 border border-amber-300'
                      }`}>
                        {isDone ? (
                          <>
                            <CheckCircle2 size={13} className="text-emerald-600" />
                            <span>Exécuté / Fait</span>
                          </>
                        ) : (
                          <>
                            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                            <span>En attente</span>
                          </>
                        )}
                      </span>
                    </div>
                  </div>

                  {/* Consignes du Médecin */}
                  {act.instructions && (
                    <div className="mt-2 text-xs text-slate-700 bg-white/80 p-2.5 rounded-xl border border-slate-200/50">
                      <strong className="text-slate-900">Consignes médecin : </strong>
                      <span>{act.instructions}</span>
                    </div>
                  )}

                  {/* Rapport de Réalisation de l'Infirmier */}
                  {isDone && (
                    <div 
                      title={`Exécuté par ${act.executedBy || 'Infirmier(ère)'} à ${act.executionTime || act.time || '10:00'}`}
                      className="mt-2 text-xs text-emerald-900 bg-emerald-100/60 p-2.5 rounded-xl border border-emerald-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                    >
                      <div>
                        <strong>✓ Exécuté par : </strong> {act.executedBy || 'Infirmier(ère)'} à {act.executionTime || act.time}
                        {act.executionNotes && (
                          <p className="mt-0.5 italic">Note clinique : « {act.executionNotes} »</p>
                        )}
                      </div>
                      <span className="text-[10px] text-emerald-700 font-mono shrink-0 font-bold">
                        {act.executionDate || act.date} à {act.executionTime || act.time}
                      </span>
                    </div>
                  )}

                  <div className="mt-2 flex items-center justify-between text-[10px] text-slate-400 font-medium">
                    <span>Prescrit par <strong>{act.prescribedBy || 'Médecin'}</strong> le {act.date} à {act.time}</span>
                    <span className="font-mono">Réf: {act.id}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default PrescriptionSoinsTab;
