import React, { useState, useEffect, useMemo } from 'react';
import { Patient, Medication, Prescription, User, Ordonnance } from '../../types';
import { 
  FileText, Pill, ShieldAlert, Send, Printer, 
  Plus, Trash2, CheckCircle2, AlertTriangle, 
  Info, ArrowRight, Save, User as UserIcon, X, Loader2
} from 'lucide-react';
import DosageAssistant from './DosageAssistant';
import { jsPDF } from 'jspdf';
import { useSettings } from '../../hooks/useSettings';

interface DigitalPrescriptionProps {
  patient: Patient;
  prescripteur: User;
  medications: Medication[];
  onValidate: (ordonnance: Ordonnance) => void;
  onCancel: () => void;
}

const DigitalPrescription: React.FC<DigitalPrescriptionProps> = ({ 
  patient, prescripteur, medications, onValidate, onCancel 
}) => {
  if (!patient) return null;
  const { establishment } = useSettings();
  const [activeTab, setActiveTab] = useState<'PRESCRIPTION' | 'POSOLOGIE' | 'SECURITE' | 'TRANSMISSION' | 'IMPRESSION'>('PRESCRIPTION');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Ordonnance State
  const [diagnostic, setDiagnostic] = useState('');
  const [indication, setIndication] = useState('');
  const [notes, setNotes] = useState('');
  
  const [prescriptions, setPrescriptions] = useState<Partial<Prescription>[]>([]);
  
  // Posology Assistant State
  const [editingPrescriptionIndex, setEditingPrescriptionIndex] = useState<number | null>(null);
  
  // Security State
  const [securityAlerts, setSecurityAlerts] = useState<{type: 'danger' | 'warning' | 'info', message: string}[]>([]);
  const [securityValidated, setSecurityValidated] = useState(false);
  const [securityJustification, setSecurityJustification] = useState('');

  // Transmission State
  const [transmitToPharmacy, setTransmitToPharmacy] = useState(true);
  const [transmitToPlanner, setTransmitToPlanner] = useState(false);

  // Custom Inline Prescription State
  const [customName, setCustomName] = useState('');
  const [customPosology, setCustomPosology] = useState('');
  const [customDuration, setCustomDuration] = useState('5');
  const [customPrice, setCustomPrice] = useState('');
  const [customBoxes, setCustomBoxes] = useState('1');

  const handleAddInlineCustom = () => {
    const clean = customName.trim();
    if (!clean) return;
    setPrescriptions(prev => [...prev, {
      id: `presc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      medicationId: `custom_${Date.now()}`,
      medicationName: clean,
      dosageScheme: customPosology.trim() || '1 comp x 3 / jour',
      dosePerIntake: 1,
      intakeUnit: 'comprimé(s)',
      frequency: '3 fois par jour',
      duration: parseInt(customDuration, 10) || 5,
      totalBoxes: parseInt(customBoxes, 10) || 1,
      price: parseFloat(customPrice) || 0,
      status: 'VALIDATED',
      createdAt: new Date().toISOString()
    }]);
    setCustomName('');
    setCustomPosology('');
    setCustomDuration('5');
    setCustomPrice('');
    setCustomBoxes('1');
  };

  const handlePrint = () => {
    try {
      const doc = new jsPDF();
      const today = new Date().toLocaleDateString('fr-FR');

      // 1. Clinic Brand Header
      doc.setFillColor(37, 99, 235); // Blue background banner
      doc.rect(0, 0, 220, 25, 'F');
      
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.text(establishment?.name || "SMARTHOSTO SIH", 15, 17);

      // 2. Headings & Contact details
      doc.setTextColor(230, 242, 255);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.text("Ordonnance Médicale Officielle", 130, 11);
      doc.text(`Tél: ${establishment?.phone || '+237 222 33 44 55'}`, 130, 16);
      doc.text(establishment?.address || "Avenue de l'Indépendance", 130, 21);

      // Divider line
      doc.setDrawColor(17, 24, 39);
      doc.setLineWidth(0.5);
      doc.line(15, 30, 195, 30);

      // Document Title
      doc.setFontSize(20);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(17, 24, 39);
      doc.text("ORDONNANCE MEDICALE", 60, 42);

      // 3. User & Patient Sections
      doc.setFillColor(243, 244, 246);
      doc.rect(15, 50, 180, 28, 'F');

      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text("PRESCRIPTEUR :", 20, 56);
      doc.setFont('helvetica', 'normal');
      doc.text(`${prescripteur.name || 'Docteur Referent'} (${prescripteur.profession || "Medecin d'Orientation"})`, 55, 56);

      doc.setFont('helvetica', 'bold');
      doc.text("PATIENT :", 20, 62);
      doc.setFont('helvetica', 'normal');
      doc.text(`${patient?.lastName || ''} ${patient?.firstName || ''}`, 55, 62);

      doc.setFont('helvetica', 'bold');
      doc.text("DETAILS :", 20, 68);
      doc.setFont('helvetica', 'normal');
      doc.text(`Age : ${patient.age || '--'} ans   |   Sexe : ${patient.gender === 'F' ? 'Feminin' : 'Masculin'}   |   Date : ${today}`, 55, 68);

      // 4. Treatments Listing
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(37, 99, 235);
      doc.text("TRAITEMENTS & POSOLOGIES", 15, 88);
      
      let yPosition = 98;
      prescriptions.forEach((p, idx) => {
        // Drug name
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(17, 24, 39);
        doc.text(`${idx + 1}. ${p.medicationName}`, 15, yPosition);
        
        yPosition += 5;
        // Posology details
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.setTextColor(55, 65, 81);
        doc.text(`Posologie : ${p.dosageScheme || 'Selon prescription'}`, 22, yPosition);

        yPosition += 5;
        // Duration and box count
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(9);
        doc.setTextColor(107, 114, 128);
        doc.text(`Pendant ${p.duration || '--'} jours  •  Quantite : ${p.totalBoxes || 1} boite(s)`, 22, yPosition);

        yPosition += 12; // Extra space
      });

      // 5. Signature Section
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(55, 65, 81);
      doc.text("Signature numerique clinique :", 120, yPosition + 15);
      
      doc.setDrawColor(209, 213, 219);
      doc.setLineWidth(0.5);
      doc.line(120, yPosition + 35, 180, yPosition + 35);

      // Save PDF
      doc.save(`Ordonnance_${patient.lastName || 'patient'}_${today}.pdf`);
      alert("✓ Ordonnance PDF generee et telechargee avec succes.");
    } catch (error) {
      console.error("PDF generation failed, falling back to printer window:", error);
      // Fallback to standard window open print
      const today = new Date().toLocaleDateString('fr-FR');
      const medListHtml = prescriptions.map((p, idx) => `
        <div style="margin-bottom: 20px; font-family: sans-serif;">
          <p style="font-size: 16px; margin: 0; font-weight: bold;">${idx + 1}. ${p.medicationName}</p>
          <p style="font-size: 14px; margin: 4px 0 0 20px; color: #374151;"><b>Posologie :</b> ${p.dosageScheme || 'Selon prescription'}</p>
          <p style="font-size: 13px; margin: 4px 0 0 20px; color: #6b7280; font-style: italic;">Pendant ${p.duration || '--'} jours • Quantité : ${p.totalBoxes || 1} boîte(s)</p>
        </div>
      `).join('');

      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(`
          <html>
            <head><title>Ordonnance - ${patient?.firstName || ''} ${patient?.lastName || ''}</title></head>
            <body>
              <div style="font-family: sans-serif; padding: 40px;">
                <h2>🏥 ${establishment?.name || 'SMARTHOSTO SIH'}</h2>
                <p style="font-size: 13px; color: #64748b; margin-top: -8px;">${establishment?.address || ''} • Tél: ${establishment?.phone || ''}</p>
                <h3>Ordonnance Médicale</h3>
                <p><b>Patient:</b> ${patient?.firstName || ''} ${patient?.lastName || ''}</p>
                <p><b>Médecin:</b> ${prescripteur.name}</p>
                <hr/>
                <div>${medListHtml}</div>
              </div>
            </body>
          </html>
        `);
        printWindow.document.close();
        printWindow.print();
      } else {
        window.print();
      }
    }
  };

  // 1. PRESCRIPTION TAB
  const handleAddMedication = (medId: string) => {
    const med = medications.find(m => m.id === medId);
    if (!med) return;
    
    setPrescriptions([...prescriptions, {
      id: `presc_${Date.now()}`,
      medicationId: med.id,
      medicationName: med.name,
      dosageScheme: '1 comp x 3 / jour',
      dosePerIntake: 1,
      intakeUnit: 'comprimé(s)',
      frequency: '3 fois par jour',
      duration: 5,
      totalBoxes: 1,
      price: med.price || 1500,
      status: 'VALIDATED',
      createdAt: new Date().toISOString()
    }]);
  };

  const handleAddCustomMedication = (customName: string) => {
    const clean = customName.trim();
    if (!clean) return;
    setPrescriptions([...prescriptions, {
      id: `presc_${Date.now()}`,
      medicationId: `custom_${Date.now()}`,
      medicationName: clean,
      dosageScheme: '1 comp x 3 / jour',
      dosePerIntake: 1,
      intakeUnit: 'comprimé(s)',
      frequency: '3 fois par jour',
      duration: 5,
      totalBoxes: 1,
      price: 1500,
      status: 'VALIDATED',
      createdAt: new Date().toISOString()
    }]);
  };

  const handleRemoveMedication = (index: number) => {
    const newPrescriptions = [...prescriptions];
    newPrescriptions.splice(index, 1);
    setPrescriptions(newPrescriptions);
    if (editingPrescriptionIndex === index) {
      setEditingPrescriptionIndex(null);
    }
  };

  const handleAddProtocol = (protocolType: string) => {
    // Mock protocols
    let protocolMeds: Partial<Prescription>[] = [];
    if (protocolType === 'PALUDISME') {
      const artemether = medications.find(m => m.name.toLowerCase().includes('artemether') || m.name.toLowerCase().includes('coartem'));
      const paracetamol = medications.find(m => m.name.toLowerCase().includes('paracetamol'));
      
      if (artemether) protocolMeds.push({ 
        id: `presc_${Date.now()}_1`, 
        medicationId: artemether.id, 
        medicationName: artemether.name, 
        dosageScheme: '4 comprimés à H0, H8, H24, H36, H48, H60',
        duration: 3,
        totalBoxes: 1,
        price: artemether.price || 3500,
        status: 'VALIDATED' 
      });
      if (paracetamol) protocolMeds.push({ 
        id: `presc_${Date.now()}_2`, 
        medicationId: paracetamol.id, 
        medicationName: paracetamol.name, 
        dosageScheme: '1g toutes les 8h si douleur ou fièvre',
        duration: 3,
        totalBoxes: 1,
        price: paracetamol.price || 500,
        status: 'VALIDATED' 
      });
    }
    
    setPrescriptions([...prescriptions, ...protocolMeds]);
  };

  // 2. POSOLOGIE TAB
  const handlePosologyUpdate = (updatedPrescription: Partial<Prescription>) => {
    if (editingPrescriptionIndex === null) return;
    
    const newPrescriptions = [...prescriptions];
    newPrescriptions[editingPrescriptionIndex] = {
      ...newPrescriptions[editingPrescriptionIndex],
      ...updatedPrescription,
      status: 'VALIDATED'
    };
    setPrescriptions(newPrescriptions);
    setEditingPrescriptionIndex(null);
  };

  // 3. SECURITE TAB
  useEffect(() => {
    const alerts: {type: 'danger' | 'warning' | 'info', message: string}[] = [];
    
    prescriptions.forEach(presc => {
      const med = medications.find(m => m.id === presc.medicationId);
      if (!med) return;

      // Check allergies
      if (patient.allergies && patient.allergies.some(a => med.name.toLowerCase().includes(a.toLowerCase()))) {
        alerts.push({ type: 'danger', message: `Allergie connue à ${med.name} ou apparenté.` });
      }
      
      // Check max dose
      if (presc.dosePerIntake && presc.dosePerIntake > 1000) {
        alerts.push({ type: 'warning', message: `Dose par prise élevée pour ${med.name} (> 1000mg). Vérifiez la posologie.` });
      }
      
      // Check stock
      if (presc.totalBoxes && med.stock < presc.totalBoxes) {
        alerts.push({ type: 'info', message: `Stock insuffisant en pharmacie pour ${med.name} (${med.stock} disponibles, ${presc.totalBoxes} nécessaires).` });
      }
    });

    setSecurityAlerts(alerts);
    if (alerts.length === 0) {
      setSecurityValidated(true);
    } else {
      setSecurityValidated(false);
    }
  }, [prescriptions, patient, medications]);

  // 4. TRANSMISSION & VALIDATION
  const handleFinalValidate = async () => {
    setIsSubmitting(true);
    try {
      const ordonnance: Ordonnance = {
        id: `ORD-${Date.now()}`,
        patientId: patient.id,
        prescripteurId: prescripteur.id,
        prescripteurName: prescripteur.name,
        prescripteurRole: prescripteur.profession || prescripteur.role,
        date: new Date().toISOString(),
        status: transmitToPharmacy ? 'TRANSMITTED' : 'VALIDATED',
        diagnostic,
        indication,
        notes,
        traitements: prescriptions as Prescription[],
        pharmacyStatus: transmitToPharmacy ? 'PENDING' : undefined
      };
      
      window.dispatchEvent(new CustomEvent('app-notification', { 
        detail: { message: `Ordonnance validée et transmise${transmitToPharmacy ? ' à la pharmacie' : ''} avec succès !`, type: 'success' }
      }));
      
      onValidate(ordonnance);
    } catch (err) {
      window.dispatchEvent(new CustomEvent('app-notification', { 
        detail: { message: "Erreur lors de la validation de l'ordonnance.", type: 'error' }
      }));
    } finally {
      setIsSubmitting(false);
    }
  };

  const isFormValid = prescriptions.length > 0 && 
                      prescriptions.every(p => p.status === 'VALIDATED') && 
                      (securityAlerts.length === 0 || securityValidated);

  return (
    <div className="bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col h-[90vh] max-h-[800px]">
      {/* HEADER */}
      <div className="bg-indigo-600 p-6 text-white shrink-0 flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-black flex items-center gap-3">
            <FileText size={28} />
            Ordonnance Médicale Numérique
          </h2>
          <p className="text-indigo-100 mt-1 font-medium">Prescription, calcul de posologie et transmission sécurisée</p>
        </div>
        <button onClick={onCancel} className="p-2 hover:bg-indigo-500 rounded-xl transition-colors">
          <X size={24} />
        </button>
      </div>

      {/* TABS */}
      <div className="flex border-b border-slate-200 bg-slate-50 shrink-0 overflow-x-auto">
        {[
          { id: 'PRESCRIPTION', label: '1. Prescription', icon: FileText },
          { id: 'POSOLOGIE', label: '2. Posologie', icon: Pill },
          { id: 'SECURITE', label: '3. Sécurité', icon: ShieldAlert },
          { id: 'TRANSMISSION', label: '4. Transmission', icon: Send },
          { id: 'IMPRESSION', label: '5. Impression / PDF', icon: Printer }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex-1 min-w-[150px] py-4 px-4 font-bold text-sm transition-colors border-b-2 flex items-center justify-center gap-2 ${
              activeTab === tab.id 
                ? 'border-indigo-600 text-indigo-600 bg-white' 
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-100'
            }`}
          >
            <tab.icon size={16} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* CONTENT */}
      <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
        
        {/* TAB 1: PRESCRIPTION */}
        {activeTab === 'PRESCRIPTION' && (
          <div className="space-y-6 max-w-4xl mx-auto animate-in fade-in duration-300">
            {/* Patient Info */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-start gap-4">
              <div className="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center shrink-0">
                <UserIcon size={24} />
              </div>
              <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-xs text-slate-500 font-bold uppercase">Patient</p>
                  <p className="font-black text-slate-900">{patient?.firstName || ''} {patient?.lastName || ''}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 font-bold uppercase">Âge / Sexe</p>
                  <p className="font-bold text-slate-700">{patient.age || 'N/A'} ans / {patient.gender}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 font-bold uppercase">Poids</p>
                  <p className="font-bold text-slate-700">{patient.vitals?.weight ? `${patient.vitals.weight} kg` : 'Non renseigné'}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 font-bold uppercase">Allergies</p>
                  <p className="font-bold text-rose-600">{patient.allergies?.join(', ') || 'Aucune'}</p>
                </div>
              </div>
            </div>

            {/* Clinical Context */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
              <h3 className="font-black text-slate-800 flex items-center gap-2">
                <Info size={18} className="text-indigo-500" /> Contexte Clinique
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-2">Diagnostic</label>
                  <input 
                    type="text" 
                    value={diagnostic}
                    onChange={e => setDiagnostic(e.target.value)}
                    placeholder="Ex: Paludisme simple"
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-2">Indication thérapeutique</label>
                  <input 
                    type="text" 
                    value={indication}
                    onChange={e => setIndication(e.target.value)}
                    placeholder="Ex: Traitement curatif"
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Treatments Selection */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
              <div className="flex flex-wrap justify-between items-center gap-2">
                <h3 className="font-black text-slate-800 flex items-center gap-2">
                  <Pill size={18} className="text-indigo-500" /> Traitements & Prescriptions
                </h3>
                <div className="flex items-center gap-2">
                  <select 
                    onChange={(e) => {
                      if (e.target.value) {
                        handleAddProtocol(e.target.value);
                        e.target.value = '';
                      }
                    }}
                    className="p-2 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-bold outline-none cursor-pointer"
                  >
                    <option value="">+ Protocole...</option>
                    <option value="PALUDISME">Protocole Paludisme</option>
                  </select>
                  {medications.length > 0 && (
                    <select 
                      onChange={(e) => {
                        if (e.target.value) {
                          handleAddMedication(e.target.value);
                          e.target.value = '';
                        }
                      }}
                      className="p-2 bg-indigo-600 text-white rounded-xl text-xs font-bold outline-none cursor-pointer"
                    >
                      <option value="">+ Catalogue ({medications.length})...</option>
                      {medications.map(m => (
                        <option key={m.id} value={m.id}>{m.name} ({m.dosage || m.forms?.[0] || 'Std'})</option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              {/* Saisie Rapide Médicament (Tolérance Zéro Catalogue Vide / Saisie Libre) */}
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
                <span className="text-[10px] font-black uppercase text-slate-500 tracking-wider block">
                  Ajout Rapide de Traitement Médicamenteux
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                  <input
                    type="text"
                    placeholder="Nom du médicament (ex: Paracétamol 500mg)..."
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleAddInlineCustom(); }}
                    className="sm:col-span-4 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <input
                    type="text"
                    placeholder="Posologie (ex: 1 cp x 3/jour)..."
                    value={customPosology}
                    onChange={(e) => setCustomPosology(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleAddInlineCustom(); }}
                    className="sm:col-span-3 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <input
                    type="number"
                    placeholder="Jours"
                    value={customDuration}
                    onChange={(e) => setCustomDuration(e.target.value)}
                    className="sm:col-span-1 px-2 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-800 text-center focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    title="Durée en jours"
                  />
                  <input
                    type="number"
                    placeholder="Boîtes"
                    value={customBoxes}
                    onChange={(e) => setCustomBoxes(e.target.value)}
                    className="sm:col-span-1 px-2 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-800 text-center focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    title="Nombre de boîtes"
                  />
                  <input
                    type="number"
                    placeholder="Prix (FCFA)"
                    value={customPrice}
                    onChange={(e) => setCustomPrice(e.target.value)}
                    className="sm:col-span-2 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-800 text-right focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    title="Prix unitaire estimé"
                  />
                  <button
                    type="button"
                    onClick={handleAddInlineCustom}
                    disabled={!customName.trim()}
                    className="sm:col-span-1 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-black uppercase transition-all shadow-sm flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <Plus size={16} />
                  </button>
                </div>
              </div>

              {prescriptions.length === 0 ? (
                <div className="text-center py-8 text-slate-400 border-2 border-dashed border-slate-200 rounded-xl">
                  Aucun traitement sélectionné. Ajoutez un médicament ou un protocole.
                </div>
              ) : (
                <div className="space-y-3">
                  {prescriptions.map((presc, idx) => (
                    <div key={presc.id} className="flex items-center justify-between p-4 bg-slate-50 border border-slate-200 rounded-xl">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${presc.status === 'VALIDATED' ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'}`}>
                          {presc.status === 'VALIDATED' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
                        </div>
                        <div>
                          <p className="font-bold text-slate-900">{presc.medicationName}</p>
                          {presc.status === 'VALIDATED' ? (
                            <p className="text-xs text-slate-500">{presc.dosageScheme} pendant {presc.duration} jours</p>
                          ) : (
                            <p className="text-xs text-amber-600 font-medium">Posologie à définir</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => {
                            setEditingPrescriptionIndex(idx);
                            setActiveTab('POSOLOGIE');
                          }}
                          className="px-3 py-1.5 bg-white border border-slate-200 text-slate-700 rounded-lg text-xs font-bold hover:bg-slate-100"
                        >
                          {presc.status === 'VALIDATED' ? 'Modifier' : 'Calculer Posologie'}
                        </button>
                        <button 
                          onClick={() => handleRemoveMedication(idx)}
                          className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            <div className="flex justify-end">
              <button 
                onClick={() => setActiveTab('POSOLOGIE')}
                className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-colors flex items-center gap-2"
              >
                Suivant : Posologie <ArrowRight size={18} />
              </button>
            </div>
          </div>
        )}

        {/* TAB 2: POSOLOGIE */}
        {activeTab === 'POSOLOGIE' && (
          <div className="max-w-5xl mx-auto animate-in fade-in duration-300">
            {prescriptions.length === 0 ? (
              <div className="text-center py-12 text-slate-500">
                <Pill size={48} className="mx-auto mb-4 text-slate-300" />
                <p className="text-lg font-bold">Aucun médicament sélectionné</p>
                <button onClick={() => setActiveTab('PRESCRIPTION')} className="mt-4 text-indigo-600 font-bold hover:underline">
                  Retourner à la prescription
                </button>
              </div>
            ) : editingPrescriptionIndex !== null ? (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="bg-slate-50 p-4 border-b border-slate-200 flex justify-between items-center">
                  <h3 className="font-black text-slate-800">
                    Assistant Posologique : {prescriptions[editingPrescriptionIndex].medicationName}
                  </h3>
                  <button onClick={() => setEditingPrescriptionIndex(null)} className="text-slate-500 hover:text-slate-700">
                    <X size={20} />
                  </button>
                </div>
                {/* Reusing the DosageAssistant logic internally */}
                <DosageAssistant 
                  patient={patient}
                  medications={medications.filter(m => m.id === prescriptions[editingPrescriptionIndex].medicationId)}
                  onValidate={handlePosologyUpdate}
                  onCancel={() => setEditingPrescriptionIndex(null)}
                  embedded={true}
                />
              </div>
            ) : (
              <div className="space-y-4">
                <h3 className="font-black text-slate-800 mb-4">Sélectionnez un médicament pour calculer sa posologie :</h3>
                {prescriptions.map((presc, idx) => (
                  <div 
                    key={presc.id} 
                    onClick={() => setEditingPrescriptionIndex(idx)}
                    className={`p-4 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
                      presc.status === 'VALIDATED' 
                        ? 'bg-emerald-50 border-emerald-200 hover:border-emerald-400' 
                        : 'bg-white border-slate-200 hover:border-indigo-300 hover:shadow-md'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${presc.status === 'VALIDATED' ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>
                        {presc.status === 'VALIDATED' ? <CheckCircle2 size={20} /> : <Pill size={20} />}
                      </div>
                      <div>
                        <p className="font-bold text-slate-900 text-lg">{presc.medicationName}</p>
                        {presc.status === 'VALIDATED' ? (
                          <p className="text-sm text-emerald-700 font-medium">{presc.dosageScheme} pendant {presc.duration} jours</p>
                        ) : (
                          <p className="text-sm text-slate-500">Cliquez pour configurer la posologie</p>
                        )}
                      </div>
                    </div>
                    <ArrowRight size={20} className="text-slate-400" />
                  </div>
                ))}
                
                <div className="flex justify-end mt-8">
                  <button 
                    onClick={() => setActiveTab('SECURITE')}
                    disabled={!prescriptions.every(p => p.status === 'VALIDATED')}
                    className="px-6 py-3 bg-indigo-600 disabled:bg-slate-300 text-white rounded-xl font-bold hover:bg-indigo-700 transition-colors flex items-center gap-2"
                  >
                    Suivant : Sécurité <ArrowRight size={18} />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: SECURITE */}
        {activeTab === 'SECURITE' && (
          <div className="max-w-4xl mx-auto animate-in fade-in duration-300 space-y-6">
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <h3 className="font-black text-slate-800 flex items-center gap-2 mb-6">
                <ShieldAlert size={20} className="text-indigo-500" /> Analyse de Sécurité
              </h3>
              
              {securityAlerts.length === 0 ? (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-6 text-center">
                  <CheckCircle2 size={48} className="mx-auto text-emerald-500 mb-4" />
                  <h4 className="text-lg font-black text-emerald-800 mb-2">Aucune alerte détectée</h4>
                  <p className="text-emerald-600 font-medium">La prescription ne présente pas de contre-indications majeures connues.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {securityAlerts.map((alert, idx) => (
                    <div key={idx} className={`p-4 rounded-xl border flex gap-3 ${
                      alert.type === 'danger' ? 'bg-rose-50 border-rose-200 text-rose-800' :
                      alert.type === 'warning' ? 'bg-amber-50 border-amber-200 text-amber-800' :
                      'bg-blue-50 border-blue-200 text-blue-800'
                    }`}>
                      <AlertTriangle size={20} className="shrink-0 mt-0.5" />
                      <p className="font-medium">{alert.message}</p>
                    </div>
                  ))}
                  
                  {!securityValidated && (
                    <div className="mt-6 p-5 bg-slate-50 border border-slate-200 rounded-xl">
                      <label className="block text-sm font-bold text-slate-700 mb-2">
                        Justification du forçage (Obligatoire)
                      </label>
                      <textarea 
                        value={securityJustification}
                        onChange={e => setSecurityJustification(e.target.value)}
                        placeholder="Veuillez justifier la prescription malgré les alertes..."
                        className="w-full p-3 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none min-h-[100px]"
                      />
                      <div className="flex justify-end mt-3">
                        <button 
                          onClick={() => setSecurityValidated(true)}
                          disabled={securityJustification.length < 10}
                          className="px-4 py-2 bg-indigo-600 disabled:bg-slate-300 text-white rounded-lg font-bold hover:bg-indigo-700 transition-colors"
                        >
                          Valider en forçant
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            
            <div className="flex justify-end">
              <button 
                onClick={() => setActiveTab('TRANSMISSION')}
                disabled={!securityValidated}
                className="px-6 py-3 bg-indigo-600 disabled:bg-slate-300 text-white rounded-xl font-bold hover:bg-indigo-700 transition-colors flex items-center gap-2"
              >
                Suivant : Transmission <ArrowRight size={18} />
              </button>
            </div>
          </div>
        )}

        {/* TAB 4: TRANSMISSION */}
        {activeTab === 'TRANSMISSION' && (
          <div className="max-w-4xl mx-auto animate-in fade-in duration-300 space-y-6">
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <h3 className="font-black text-slate-800 flex items-center gap-2 mb-6">
                <Send size={20} className="text-indigo-500" /> Options de Transmission
              </h3>
              
              <div className="space-y-4">
                <label className={`flex items-start gap-4 p-4 rounded-xl border cursor-pointer transition-colors ${transmitToPharmacy ? 'bg-indigo-50 border-indigo-200' : 'bg-white border-slate-200 hover:bg-slate-50'}`}>
                  <input 
                    type="checkbox" 
                    checked={transmitToPharmacy}
                    onChange={e => setTransmitToPharmacy(e.target.checked)}
                    className="mt-1 w-5 h-5 rounded text-indigo-600 focus:ring-indigo-500"
                  />
                  <div>
                    <p className="font-bold text-slate-900">Transmettre à la Pharmacie</p>
                    <p className="text-sm text-slate-500">Envoie l'ordonnance dans la file d'attente de la pharmacie pour préparation.</p>
                  </div>
                </label>
                
                <label className={`flex items-start gap-4 p-4 rounded-xl border cursor-pointer transition-colors ${transmitToPlanner ? 'bg-indigo-50 border-indigo-200' : 'bg-white border-slate-200 hover:bg-slate-50'}`}>
                  <input 
                    type="checkbox" 
                    checked={transmitToPlanner}
                    onChange={e => setTransmitToPlanner(e.target.checked)}
                    className="mt-1 w-5 h-5 rounded text-indigo-600 focus:ring-indigo-500"
                  />
                  <div>
                    <p className="font-bold text-slate-900">Générer le Planning de Soins</p>
                    <p className="text-sm text-slate-500">Crée automatiquement les tâches d'administration pour les infirmiers (Hospitalisation).</p>
                  </div>
                </label>
                
                <div className="flex items-start gap-4 p-4 rounded-xl border bg-slate-50 border-slate-200 opacity-75">
                  <input type="checkbox" checked disabled className="mt-1 w-5 h-5 rounded text-indigo-600" />
                  <div>
                    <p className="font-bold text-slate-900">Enregistrer dans le Dossier Patient</p>
                    <p className="text-sm text-slate-500">Action obligatoire. L'ordonnance sera archivée dans l'historique du patient.</p>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="flex justify-end">
              <button 
                onClick={() => setActiveTab('IMPRESSION')}
                className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-colors flex items-center gap-2"
              >
                Suivant : Impression <ArrowRight size={18} />
              </button>
            </div>
          </div>
        )}

        {/* TAB 5: IMPRESSION */}
        {activeTab === 'IMPRESSION' && (
          <div className="max-w-4xl mx-auto animate-in fade-in duration-300 space-y-6">
            <div className="bg-white p-4 md:p-8 rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
              {/* PDF Preview */}
              <div className="border-2 border-slate-100 p-6 md:p-8 rounded-xl bg-white shadow-inner min-h-[500px] font-sans w-full max-w-[800px] mx-auto overflow-hidden scale-90 md:scale-100 origin-top">
                <div className="flex justify-between items-start border-b-2 border-slate-800 pb-6 mb-6">
                  <div>
                    <h1 className="text-2xl font-black text-slate-900 uppercase tracking-widest">ORDONNANCE</h1>
                    <p className="text-sm text-slate-500 mt-1">Date: {new Date().toLocaleDateString()}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-black text-slate-900">{prescripteur.name}</p>
                    <p className="text-sm text-slate-600">{prescripteur.profession || prescripteur.role}</p>
                    <p className="text-xs text-slate-400 mt-1">ID: {prescripteur.id}</p>
                  </div>
                </div>
                
                <div className="mb-8">
                  <p className="text-sm text-slate-500 uppercase font-bold mb-1">Patient</p>
                  <p className="font-black text-lg text-slate-900">{patient?.firstName || ''} {patient?.lastName || ''}</p>
                  <p className="text-sm text-slate-600">{patient.age} ans, {patient.vitals?.weight ? `${patient.vitals.weight} kg` : ''}</p>
                </div>
                
                <div className="space-y-6">
                  {prescriptions.map((presc, idx) => (
                    <div key={idx} className="flex gap-4">
                      <span className="font-black text-slate-300 text-xl">{idx + 1}.</span>
                      <div>
                        <p className="font-black text-slate-900 text-lg">{presc.medicationName}</p>
                        <p className="text-slate-700 font-medium">{presc.dosageScheme}</p>
                        <p className="text-sm text-slate-500 italic">Pendant {presc.duration} jours. Quantité: {presc.totalBoxes} boîte(s)</p>
                      </div>
                    </div>
                  ))}
                </div>
                
                <div className="mt-16 pt-8 border-t border-slate-200 flex justify-end">
                  <div className="text-center">
                    <p className="text-sm text-slate-500 mb-8">Signature</p>
                    <div className="w-32 h-12 border-b border-slate-300"></div>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="flex justify-between items-center bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
              <button 
                onClick={handlePrint}
                className="px-6 py-3 bg-slate-100 text-slate-700 rounded-xl font-bold hover:bg-slate-200 transition-colors flex items-center gap-2"
              >
                <Printer size={18} /> Imprimer le PDF
              </button>
              
              <button 
                onClick={handleFinalValidate}
                disabled={!isFormValid || isSubmitting}
                className="px-8 py-4 bg-emerald-600 disabled:bg-slate-300 text-white rounded-xl font-black hover:bg-emerald-700 transition-colors flex items-center gap-2 shadow-lg shadow-emerald-600/20 cursor-pointer disabled:cursor-not-allowed"
              >
                {isSubmitting ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
                {isSubmitting ? 'Validation...' : "Valider l'Ordonnance"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DigitalPrescription;
