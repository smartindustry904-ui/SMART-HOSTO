
import React, { useState, useEffect } from 'react';
import { Beaker, TestTube, FileText, CheckCircle2, AlertTriangle, Clock, Eye, Plus, Search, TrendingUp, X, Printer } from 'lucide-react';
import LabExamRequestForm from '../../components/LabExamRequestForm';
import { Patient, User, LabExamRequest, ResultatLaboratoire } from '../../types';
import { db } from '../../src/firebase';
import { collection, query, onSnapshot, doc, setDoc, getDoc, orderBy } from 'firebase/firestore';
import { stampTenantData } from '../../src/utils/tenant';

interface ExamensTabProps {
  patient: Patient;
  user: User;
}

const ExamensTab: React.FC<ExamensTabProps> = ({ patient, user }) => {
  const [showNewRequest, setShowNewRequest] = useState(false);
  const [examRequests, setExamRequests] = useState<LabExamRequest[]>([]);
  const [results, setResults] = useState<ResultatLaboratoire[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedReportForModal, setSelectedReportForModal] = useState<ResultatLaboratoire | null>(null);

  // Synchronize Lab Requests from Firestore in real-time
  useEffect(() => {
    try {
      const q = query(collection(db, 'lab_requests'), orderBy('date', 'desc'));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const reqMap = new Map<string, LabExamRequest>();
        snapshot.docs.forEach((docSnap) => {
          const data = docSnap.data() as LabExamRequest;
          if (data.patientId === patient.id || String(data.patientId) === String(patient.id)) {
            const key = data.id || docSnap.id;
            if (!reqMap.has(key)) {
              // Deduplicate exams within request
              const seenExamNames = new Set<string>();
              const dedupedExams = (data.exams || []).filter((e: any) => {
                const k = (typeof e === 'string' ? e : e?.name || '').trim().toLowerCase();
                if (!k || seenExamNames.has(k)) return false;
                seenExamNames.add(k);
                return true;
              });

              reqMap.set(key, {
                ...data,
                id: key,
                exams: dedupedExams
              });
            }
          }
        });

        setExamRequests(Array.from(reqMap.values()));
      }, (err) => {
        console.warn("Error listening to lab_requests:", err);
      });
      return () => unsubscribe();
    } catch (e) {
      console.error(e);
    }
  }, [patient.id]);

  // Synchronize Lab Results from Firestore in real-time
  useEffect(() => {
    try {
      const unsubscribe = onSnapshot(collection(db, 'lab_results'), (snapshot) => {
        const resMap = new Map<string, ResultatLaboratoire>();
        snapshot.docs.forEach((docSnap) => {
          const data = docSnap.data() as ResultatLaboratoire;
          if (data.patientId === patient.id || String(data.patientId) === String(patient.id)) {
            const key = data.id || docSnap.id;
            if (!resMap.has(key)) {
              resMap.set(key, {
                ...data,
                id: key
              });
            }
          }
        });

        setResults(Array.from(resMap.values()));
      }, (err) => {
        console.warn("Error listening to lab_results:", err);
      });
      return () => unsubscribe();
    } catch (e) {
      console.error(e);
    }
  }, [patient.id]);

  const calculateAge = (dateString?: string) => {
    if (!dateString) return '0';
    const today = new Date();
    const birthDate = new Date(dateString);
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
    return `${age}`;
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    try {
      const d = new Date(dateString);
      if (isNaN(d.getTime())) return 'N/A';
      return d.toLocaleDateString('fr-FR');
    } catch (e) {
      return 'N/A';
    }
  };

  const handleSaveLabRequest = async (request: Omit<LabExamRequest, 'id' | 'date' | 'status' | 'billingStatus'>) => {
    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      // Avoid duplicates using short-term deterministic ID base on timestamp + exams count
      const cleanId = `LAB-${Date.now()}-${request.exams.length}`;
      const docRef = doc(db, 'lab_requests', cleanId);
      
      // Perform pre-insertion verify check
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        alert("⚠️ Cette demande d'examens a déjà été enregistrée.");
        setIsSubmitting(false);
        return;
      }

      const today = new Date();
      const doctorName = user?.name || user?.username || 'Docteur';
      const doctorId = user?.id || '';
      const newRequest: any = {
        ...request,
        id: cleanId,
        date: today.toISOString(),
        status: 'en attente',
        billingStatus: 'pending',
        doctor: doctorName,
        doctorName: doctorName,
        doctorId: doctorId,
        prescriberId: doctorId,
        prescriberName: doctorName,
        practitionerId: doctorId,
        practitionerName: doctorName,
        practitionerRole: user?.role || 'MEDECIN',
        exams: (request.exams || []).map((e: any) => ({
          ...e,
          practitionerId: doctorId,
          practitionerName: doctorName
        }))
      };

      // Write to Firestore 'lab_requests' with strict multi-tenant isolation
      await setDoc(docRef, stampTenantData(newRequest, user));

      // Generate payment request for Caisse
      const invoiceItems = (request.exams || []).map((e: any, idx: number) => {
        const itemPrice = e.price || 2500;
        return {
          id: `item-exam-${cleanId}-${idx}`,
          name: `Examen Lab : ${e.name}`,
          quantity: 1,
          unitPrice: itemPrice,
          totalPrice: itemPrice,
          practitionerId: doctorId,
          practitionerName: doctorName,
          practitionerRole: user?.role || 'MEDECIN'
        };
      });
      const totalAmount = invoiceItems.reduce((sum, item) => sum + item.totalPrice, 0);
      const invoiceId = `PR-${Math.floor(Math.random() * 1000000)}`;
      await setDoc(doc(db, 'payment_requests', invoiceId), stampTenantData({
        id: invoiceId,
        patientId: patient.id,
        patientName: `${patient.lastName || ''} ${patient.firstName || ''}`.trim(),
        requestingService: 'Consultation',
        sourceModule: 'Consultation',
        type: 'LABORATOIRE',
        items: invoiceItems,
        totalAmount: totalAmount,
        amountPaid: 0,
        status: 'PENDING',
        createdAt: today.toISOString(),
        createdBy: doctorName,
        createdById: doctorId,
        practitionerId: doctorId,
        practitionerName: doctorName,
        practitionerRole: user?.role || 'MEDECIN',
        requestedBy: doctorName,
        requestedById: doctorId
      }, user));

      // Save to local storage for local fallbacks
      const savedRequests = localStorage.getItem('hospital_lab_requests');
      const parsedRequests = savedRequests ? JSON.parse(savedRequests) : [];
      localStorage.setItem('hospital_lab_requests', JSON.stringify([newRequest, ...parsedRequests]));

      // Write real-time audit log
      await setDoc(doc(collection(db, 'audit_logs')), {
        user: user?.name || 'Docteur',
        role: 'DOCTOR',
        date: today.toLocaleDateString('fr-FR'),
        time: today.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
        timestamp: today.toISOString(),
        action: `Transmission Laboratoire - Patient: ${patient.lastName} ${patient.firstName}`,
        details: { requestId: cleanId, examsCount: request.exams.length, totalAmount },
        module: 'Consultation'
      });

      alert("✓ Examens transmis au Laboratoire et à la Caisse");
      setShowNewRequest(false);
    } catch (error) {
      console.error('Error saving to Firestore:', error);
      alert("✗ Échec de transmission");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (showNewRequest) {
    return (
      <div className="bg-white rounded-[40px] border border-slate-200 p-10 shadow-sm animate-in fade-in">
        <LabExamRequestForm 
          patientId={patient.id}
          patientName={`${patient.firstName} ${patient.lastName}`}
          patientAge={calculateAge(patient.birthDate)}
          patientSex={patient.gender}
          patientDossier={patient.id}
          prescriberId={user?.id || 'unknown'}
          prescriberName={user?.name || 'Inconnu'}
          requestingService="Consultation"
          onClose={() => setShowNewRequest(false)}
          onSave={handleSaveLabRequest}
        />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-2xl font-black text-slate-900">Examens & Laboratoire</h3>
          <p className="text-slate-500 font-medium">Suivi des demandes d'analyses et consultation des résultats</p>
        </div>
        <button 
          onClick={() => setShowNewRequest(true)}
          className="flex items-center gap-3 px-8 py-4 bg-purple-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-purple-700 transition-all shadow-xl shadow-purple-600/20"
        >
          <Plus size={18} /> Demander Examens
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Pending Requests */}
        <div className="lg:col-span-1 space-y-6">
          <h4 className="text-sm font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
            <Clock size={18} /> Demandes en cours
          </h4>
          <div className="space-y-4">
            {examRequests.filter(r => r.status !== 'terminé' && r.status !== 'validé').map(req => (
              <div key={req.id} className="bg-white p-6 rounded-[32px] border border-slate-200 shadow-sm hover:border-purple-200 transition-all group">
                <div className="flex justify-between items-start mb-4">
                  <div className={`px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest ${
                    req.priority === 'urgent' ? 'bg-rose-100 text-rose-600' : 'bg-blue-100 text-blue-600'
                  }`}>
                    {req.priority}
                  </div>
                  <span className="text-[10px] font-mono font-black text-slate-400">{req.id}</span>
                </div>
                <h5 className="font-black text-slate-900 mb-2">{req.exams.map(e => e.name).join(', ')}</h5>
                <p className="text-xs text-slate-500 font-medium mb-4 italic">"{req.clinicalContext?.motif || 'Aucun motif'}"</p>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black text-purple-600 uppercase tracking-widest flex items-center gap-2">
                    <TestTube size={12} /> {req.status}
                  </span>
                  <span className="text-[10px] font-bold text-slate-400">{formatDate(req.date)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Results Section */}
        <div className="lg:col-span-2 space-y-6">
          <h4 className="text-sm font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
            <CheckCircle2 size={18} /> Résultats disponibles
          </h4>
          <div className="space-y-6">
            {results.filter(r => r.statut === 'validé').length > 0 ? (
              results.filter(r => r.statut === 'validé').map(res => (
                <div key={res.id} className="bg-white rounded-[40px] border border-slate-200 overflow-hidden shadow-sm">
                  <div className="bg-slate-50 p-6 border-b border-slate-200 flex justify-between items-center">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-purple-100 text-purple-600 rounded-2xl flex items-center justify-center">
                        <Beaker size={24} />
                      </div>
                      <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Rapport d'examen</p>
                        <p className="font-black text-slate-900">Demande {res.demandeId}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Validé le</p>
                      <p className="font-bold text-slate-700">{formatDate(res.dateValidation)}</p>
                    </div>
                  </div>
                  <div className="p-8">
                    <div className="space-y-8">
                      {res.lignes.map((ligne, idx) => {
                        const isSensitive = ligne.isSensitive || ['vih', 'hiv', 'séro', 'génétique', 'spermogramme', 'syphilis', 'hcg'].some(k => (ligne.examName || '').toLowerCase().includes(k));
                        const userRole = (user?.role || '').toLowerCase();
                        const canViewSensitive = userRole.includes('medecin') || userRole.includes('doctor') || userRole.includes('biolog') || userRole.includes('admin') || user?.id === res.saisiPar;

                        return (
                        <div key={idx} className="space-y-4">
                          <div className="flex items-center justify-between">
                            <h6 className="font-black text-slate-900 flex items-center gap-2">
                              <ChevronRight size={16} className="text-purple-600" /> {ligne.examName}
                              {isSensitive && (
                                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-800 border border-amber-200 flex items-center gap-1">
                                  🔒 Confidentiel
                                </span>
                              )}
                            </h6>
                            <button className="text-[10px] font-black text-blue-600 uppercase tracking-widest flex items-center gap-2 hover:underline">
                              <TrendingUp size={14} /> Analyser tendance
                            </button>
                          </div>
                          <div className="bg-slate-50 rounded-3xl border border-slate-100 overflow-hidden">
                            <table className="w-full">
                              <thead>
                                <tr className="text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-200">
                                  <th className="px-6 py-3 text-left">Paramètre</th>
                                  <th className="px-6 py-3 text-center">Valeur</th>
                                  <th className="px-6 py-3 text-center">Unité</th>
                                  <th className="px-6 py-3 text-right">Référence</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {isSensitive && !canViewSensitive ? (
                                  <tr>
                                    <td colSpan={4} className="px-6 py-6 text-center text-amber-800 font-bold bg-amber-50/70 italic text-xs">
                                      🔒 Résultat Confidentiel : Accès restreint au médecin prescripteur et au biologiste.
                                    </td>
                                  </tr>
                                ) : (
                                  ligne.parametres.map((p, pIdx) => (
                                    <tr key={pIdx} className="text-sm">
                                      <td className="px-6 py-4 font-bold text-slate-700">{p.nom}</td>
                                      <td className={`px-6 py-4 text-center font-black ${p.isAnormal ? 'text-rose-600' : 'text-slate-900'}`}>
                                        {p.valeur} {p.isAnormal && <AlertTriangle size={12} className="inline ml-1" />}
                                      </td>
                                      <td className="px-6 py-4 text-center text-slate-500 font-medium">{p.unite}</td>
                                      <td className="px-6 py-4 text-right text-slate-400 font-mono text-xs">{p.valeurReference}</td>
                                    </tr>
                                  ))
                                )}
                              </tbody>
                            </table>
                          </div>
                          {ligne.conclusion && (
                            <div className="p-4 bg-purple-50 rounded-2xl border border-purple-100">
                              <p className="text-[10px] font-black text-purple-400 uppercase tracking-widest mb-1">Conclusion</p>
                              <p className="text-sm font-bold text-purple-900 italic">
                                {isSensitive && !canViewSensitive ? "🔒 [Masqué pour des raisons de confidentialité]" : `"${ligne.conclusion}"`}
                              </p>
                            </div>
                          )}
                        </div>
                      );
                    })}
                    </div>
                    <div className="mt-8 flex justify-between items-center pt-8 border-t border-slate-100">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center text-slate-400">
                          <FileText size={16} />
                        </div>
                        <p className="text-xs font-medium text-slate-500">Signé par {res.validePar}</p>
                      </div>
                      <button 
                        onClick={() => setSelectedReportForModal(res)}
                        className="flex items-center gap-2 px-6 py-3 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-800 transition-all"
                      >
                        <Eye size={14} /> Voir rapport complet
                      </button>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="bg-white rounded-[40px] border border-slate-200 p-10 text-center text-slate-405 flex flex-col items-center justify-center">
                <FileText size={48} className="mb-4 text-slate-300 opacity-60" />
                <p className="font-bold text-slate-700">Aucun rapport validé disponible</p>
                <p className="text-xs text-slate-400 mt-1">Les résultats validés par le laboratoire s'afficheront ici en temps réel.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {selectedReportForModal && (() => {
        const correspondingReq = examRequests.find(r => r.id === selectedReportForModal.demandeId);
        return (
          <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-white w-full max-w-4xl rounded-3xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden max-h-[95vh] animate-in zoom-in-95 duration-200">
              {/* Toolbar */}
              <div className="bg-slate-50 border-b border-slate-200 px-6 py-4 flex justify-between items-center shrink-0">
                <div className="flex items-center gap-2">
                  <Beaker className="text-blue-600" size={20} />
                  <span className="font-bold text-slate-800 text-sm">Visualisation du Rapport Biologique</span>
                </div>
                <div className="flex items-center gap-3">
                  <button 
                    onClick={() => {
                      window.print();
                    }}
                    className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-slate-800 transition-all shadow-md"
                  >
                    <Printer size={14} /> Imprimer
                  </button>
                  <button 
                    onClick={() => setSelectedReportForModal(null)}
                    className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all"
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>

              {/* Printable Medical Document */}
              <div id="printable-report" className="flex-1 overflow-y-auto p-10 custom-scrollbar bg-slate-50/50">
                <div className="bg-white p-8 border border-slate-200 rounded-2xl shadow-sm max-w-3xl mx-auto space-y-8">
                  
                  {/* Header */}
                  <div className="flex justify-between items-start border-b-2 border-slate-900 pb-6">
                    <div>
                      <div className="flex items-center gap-2 text-blue-600 font-black tracking-tight text-xl">
                        <Beaker size={24} />
                        <span>CLINIQUE DU LAC</span>
                      </div>
                      <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-1">Département de Biologie Médicale</p>
                      <p className="text-[9px] text-slate-400 mt-0.5">Tél: +243 890 000 000 • central-lab@cliniquedulac.com</p>
                    </div>
                    <div className="text-right">
                      <h2 className="text-sm font-black text-slate-900">RAPPORT D'ANALYSES</h2>
                      <p className="text-xs font-mono font-bold text-blue-600 mt-1">Ref: {selectedReportForModal.id}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">Date: {formatDate(selectedReportForModal.dateValidation || selectedReportForModal.dateSaisie)}</p>
                    </div>
                  </div>

                  {/* Patient & Request Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-50 p-6 rounded-2xl border border-slate-100">
                    <div>
                      <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2">Informations Patient</h4>
                      <div className="space-y-1.5 text-xs text-slate-800">
                        <p><span className="font-medium text-slate-400">Nom Complet :</span> <span className="font-bold text-slate-950 uppercase">{patient.lastName} {patient.firstName}</span></p>
                        <p><span className="font-medium text-slate-400">Âge / Sexe :</span> <span className="font-bold text-slate-950">{calculateAge(patient.birthDate)} ans / {patient.gender === 'M' ? 'Masculin' : 'Féminin'}</span></p>
                        <p><span className="font-medium text-slate-400">N° Dossier :</span> <span className="font-mono font-bold text-slate-950">{patient.id}</span></p>
                      </div>
                    </div>
                    <div>
                      <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2">Prescription & Prélèvement</h4>
                      <div className="space-y-1.5 text-xs text-slate-800">
                        <p><span className="font-medium text-slate-400">Médecin Prescripteur :</span> <span className="font-bold text-slate-950">{correspondingReq?.prescriberName || 'Inconnu'}</span></p>
                        <p><span className="font-medium text-slate-400">Service demandeur :</span> <span className="font-bold text-slate-950">{correspondingReq?.requestingService || 'Consultation'}</span></p>
                        <p><span className="font-medium text-slate-400">Motif Clinique :</span> <span className="font-bold text-slate-950 italic">"{correspondingReq?.clinicalContext?.motif || 'N/A'}"</span></p>
                      </div>
                    </div>
                  </div>

                  {/* Table of Results */}
                  <div className="space-y-6">
                    {selectedReportForModal.lignes.map((ligne, idx) => {
                      const requestExam = correspondingReq?.exams.find(e => e.name === ligne.examName || e.actId === ligne.examName);
                      return (
                        <div key={idx} className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                          <div className="bg-slate-100 px-4 py-3 flex flex-wrap justify-between items-center border-b border-slate-200">
                            <h5 className="font-bold text-slate-900 text-sm">{ligne.examName}</h5>
                            <div className="flex gap-2 text-[9px] font-bold text-slate-500">
                              {requestExam?.sampleType && (
                                <span className="bg-white px-2 py-0.5 border rounded border-slate-200">
                                  Prélèvement: {requestExam.sampleType}
                                </span>
                              )}
                              {requestExam?.technique && (
                                <span className="bg-white px-2 py-0.5 border rounded border-slate-200">
                                  Technique: {requestExam.technique}
                                </span>
                              )}
                            </div>
                          </div>

                          <table className="w-full text-left border-collapse">
                            <thead>
                              <tr className="bg-slate-50/50 border-b border-slate-200 text-[10px] text-slate-400 uppercase tracking-wider font-black">
                                <th className="px-4 py-2">Paramètre d'Analyse</th>
                                <th className="px-4 py-2 text-center">Valeur Trouvée</th>
                                <th className="px-4 py-2 text-center">Unité</th>
                                <th className="px-4 py-2 text-right">Valeurs de Référence</th>
                              </tr>
                            </thead>
                            <tbody>
                              {ligne.parametres.map((p, pIdx) => (
                                <tr key={pIdx} className="border-b border-slate-100 last:border-0 text-xs">
                                  <td className="px-4 py-3 font-semibold text-slate-700">{p.nom}</td>
                                  <td className="px-4 py-3 text-center">
                                    <span className={`inline-block px-2.5 py-0.5 rounded font-black ${
                                      p.isAnormal 
                                        ? 'bg-rose-50 text-rose-700 border border-rose-200' 
                                        : 'text-slate-900'
                                    }`}>
                                      {p.valeur} {p.isAnormal && ' *'}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3 text-center text-slate-500">{p.unite}</td>
                                  <td className="px-4 py-3 text-right font-mono text-[11px] text-slate-400">{p.valeurReference}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>

                          {ligne.conclusion && (
                            <div className="p-3 bg-purple-50/50 border-t border-slate-100 text-xs">
                              <span className="font-black text-purple-600 uppercase tracking-widest text-[9px] block mb-0.5">Conclusion de l'analyse :</span>
                              <p className="text-slate-800 font-medium italic">"{ligne.conclusion}"</p>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Commentaire global */}
                  {selectedReportForModal.commentaireGlobal && (
                    <div className="p-4 bg-blue-50/50 border border-blue-100 rounded-xl">
                      <span className="font-black text-blue-500 uppercase tracking-widest text-[9px] block mb-1">Commentaire Global du Laboratoire</span>
                      <p className="text-xs text-blue-900 font-medium italic">"{selectedReportForModal.commentaireGlobal}"</p>
                    </div>
                  )}

                  {/* Footer signature */}
                  <div className="pt-8 border-t border-slate-200 grid grid-cols-2 gap-4">
                    <div className="text-xs text-slate-400">
                      <p>* Indique une valeur en dehors des limites de référence.</p>
                      <p className="mt-1">Rapport généré électroniquement par le SIH Intelligent.</p>
                    </div>
                    <div className="text-right space-y-1">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Validé biologiquement par</p>
                      <p className="text-xs font-black text-slate-900">{selectedReportForModal.validePar || 'Biologiste de Garde'}</p>
                      <div className="inline-block mt-2 border border-emerald-200 bg-emerald-50 text-emerald-700 font-black text-[9px] tracking-wider uppercase px-2 py-0.5 rounded">
                        Signature Électronique Certifiée
                      </div>
                    </div>
                  </div>

                </div>
              </div>

            </div>
          </div>
        );
      })()}
    </div>
  );
};

const ChevronRight = ({ size, className }: { size: number, className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="m9 18 6-6-6-6" />
  </svg>
);

export default ExamensTab;
