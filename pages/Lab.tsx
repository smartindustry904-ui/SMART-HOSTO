
import React, { useState, useEffect, useMemo } from 'react';
import { Beaker, Search, FlaskConical, AlertTriangle, CheckCircle, CheckCircle2, Clock, FileText, ClipboardList, Activity, ShieldCheck, Printer, Home, ArrowLeft, Zap } from 'lucide-react';
import { LabExamRequest, ResultatLaboratoire, RapportLaboratoirePDF, PaymentRequest } from '../types';
import DemandesTab from './lab/DemandesTab';
import EnCoursTab from './lab/EnCoursTab';
import ResultatsTab from './lab/ResultatsTab';
import ValidationsTab from './lab/ValidationsTab';
import RapportsTab from './lab/RapportsTab';
import { db, handleFirestoreError, OperationType, auth, sanitizeData } from '../src/firebase';
import { collection, onSnapshot, doc, setDoc } from 'firebase/firestore';
import { useSettings } from '../hooks/useSettings';
import ModuleDashboard from '../components/ModuleDashboard';
import { Breadcrumbs } from '../components/common/Breadcrumbs';
import { MicroHeader } from '../components/common/MicroHeader';
import { isStatusEnAttente, isStatusPrelevementFait, isStatusTermine } from '../src/utils/labStatus';
import { getActiveTenantId, belongsToTenant, stampTenantData } from '../src/utils/tenant';

interface LabProps {
  paymentRequests: PaymentRequest[];
  setPaymentRequests: React.Dispatch<React.SetStateAction<PaymentRequest[]>>;
  user?: any;
  activeTab: 'dashboard' | 'demandes' | 'encours' | 'resultats' | 'validations' | 'rapports';
  setActiveTab: (tab: 'dashboard' | 'demandes' | 'encours' | 'resultats' | 'validations' | 'rapports') => void;
  onBackToDashboard: () => void;
  theme?: 'light' | 'dark';
}

const Lab: React.FC<LabProps> = ({ 
  paymentRequests, 
  setPaymentRequests, 
  user,
  activeTab,
  setActiveTab,
  onBackToDashboard,
  theme = 'light'
}) => {
  const { establishment, updateEstablishment } = useSettings();
  const activeTenantId = useMemo(() => getActiveTenantId(user, establishment), [user, establishment]);
  const [labRequests, setLabRequests] = useState<LabExamRequest[]>([]);
  const [resultats, setResultats] = useState<ResultatLaboratoire[]>([]);
  const [rapports, setRapports] = useState<RapportLaboratoirePDF[]>([]);

  useEffect(() => {
    let unsubs: (() => void)[] = [];

    const setupListeners = () => {
      const unsubRequests = onSnapshot(collection(db, 'lab_requests'), (snapshot) => {
        const rawRequests = snapshot.docs.map(doc => {
          const data = doc.data() as LabExamRequest;
          return {
            ...data,
            id: data.id || doc.id,
            docId: doc.id
          };
        });

        const uniqueReqMap = new Map<string, LabExamRequest>();
        rawRequests.filter(r => belongsToTenant(r, activeTenantId)).forEach(r => {
          const key = r.id || (r as any).docId;
          if (key && !uniqueReqMap.has(key)) {
            uniqueReqMap.set(key, r);
          }
        });
        const requests = Array.from(uniqueReqMap.values());

        requests.sort((a, b) => {
          const tA = new Date(a.createdAt || a.date || 0).getTime();
          const tB = new Date(b.createdAt || b.date || 0).getTime();
          return tB - tA;
        });
        setLabRequests(requests);
      }, (error) => {
        // Only handle error if we are still authenticated
        if (auth.currentUser) {
          handleFirestoreError(error, OperationType.LIST, 'lab_requests');
        }
      });

      const unsubResults = onSnapshot(collection(db, 'lab_results'), (snapshot) => {
        const rawResults = snapshot.docs.map(doc => {
          const data = doc.data() as ResultatLaboratoire;
          return {
            ...data,
            id: data.id || doc.id
          };
        });

        const uniqueResMap = new Map<string, ResultatLaboratoire>();
        rawResults.filter(r => belongsToTenant(r, activeTenantId)).forEach(r => {
          const key = r.id;
          if (key && !uniqueResMap.has(key)) {
            uniqueResMap.set(key, r);
          }
        });
        const results = Array.from(uniqueResMap.values());

        results.sort((a, b) => {
          const tA = new Date(a.dateValidation || a.dateSaisie || 0).getTime();
          const tB = new Date(b.dateValidation || b.dateSaisie || 0).getTime();
          return tB - tA;
        });
        setResultats(results);
      }, (error) => {
        if (auth.currentUser) {
          handleFirestoreError(error, OperationType.LIST, 'lab_results');
        }
      });

      const unsubReports = onSnapshot(collection(db, 'lab_reports'), (snapshot) => {
        const rawReports = snapshot.docs.map(doc => {
          const data = doc.data() as RapportLaboratoirePDF;
          return {
            ...data,
            id: data.id || doc.id
          };
        });

        const uniqueReportsMap = new Map<string, RapportLaboratoirePDF>();
        rawReports.filter(r => belongsToTenant(r, activeTenantId)).forEach(r => {
          const key = r.id;
          if (key && !uniqueReportsMap.has(key)) {
            uniqueReportsMap.set(key, r);
          }
        });
        const reports = Array.from(uniqueReportsMap.values());

        reports.sort((a, b) => {
          const tA = new Date(a.dateGeneration || 0).getTime();
          const tB = new Date(b.dateGeneration || 0).getTime();
          return tB - tA;
        });
        setRapports(reports);
      }, (error) => {
        if (auth.currentUser) {
          handleFirestoreError(error, OperationType.LIST, 'lab_reports');
        }
      });

      unsubs = [unsubRequests, unsubResults, unsubReports];
    };

    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
      if (user) {
        setupListeners();
      } else {
        // Clear listeners if user logs out
        unsubs.forEach(unsub => unsub());
        unsubs = [];
      }
    });

    return () => {
      unsubscribeAuth();
      unsubs.forEach(unsub => unsub());
    };
  }, [activeTenantId]);

  const saveRequests = async (newRequests: LabExamRequest[]) => {
    try {
      for (const req of newRequests) {
        const docRef = doc(db, 'lab_requests', req.id);
        await setDoc(docRef, sanitizeData(stampTenantData(req, user, establishment)), { merge: true });
      }
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, 'lab_requests');
    }
  };

  const saveResultats = async (newResultats: ResultatLaboratoire[]) => {
    try {
      const techName = user?.name || user?.username || 'Technicien Labo';
      const techId = user?.id || '';
      for (const res of newResultats) {
        const enriched = {
          ...res,
          validatedBy: (res as any).validatedBy || techName,
          validatedById: (res as any).validatedById || techId,
          technicianName: (res as any).technicianName || techName,
          technicianId: (res as any).technicianId || techId,
          practitionerId: techId,
          practitionerName: techName,
          practitionerRole: user?.role || 'LABORANTIN'
        };
        const docRef = doc(db, 'lab_results', res.id);
        await setDoc(docRef, sanitizeData(stampTenantData(enriched, user, establishment)), { merge: true });
      }
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, 'lab_results');
    }
  };

  const saveRapports = async (newRapports: RapportLaboratoirePDF[]) => {
    try {
      const techName = user?.name || user?.username || 'Biologiste';
      const techId = user?.id || '';
      for (const rep of newRapports) {
        const enriched = {
          ...rep,
          validatedBy: (rep as any).validatedBy || techName,
          validatedById: (rep as any).validatedById || techId,
          practitionerId: techId,
          practitionerName: techName,
          practitionerRole: user?.role || 'LABORANTIN'
        };
        const docRef = doc(db, 'lab_reports', rep.id);
        await setDoc(docRef, sanitizeData(stampTenantData(enriched, user, establishment)), { merge: true });
      }
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, 'lab_reports');
    }
  };

  // Accurate Stage Counters matching isolated lifecycle statuses
  const stage1Count = useMemo(() => {
    return labRequests.filter(r => isStatusEnAttente(r.status, (r as any).statut)).length;
  }, [labRequests]);

  const stage2Count = useMemo(() => {
    return labRequests.filter(r => isStatusPrelevementFait(r.status, (r as any).statut)).length;
  }, [labRequests]);

  const stage3Count = useMemo(() => {
    return resultats.filter(r => isStatusTermine(r.statut, (r as any).status)).length;
  }, [resultats]);

  return (
    <div className={`p-3 sm:p-5 h-screen flex flex-col overflow-hidden font-sans ${theme === 'dark' ? 'bg-[#090d16] text-slate-100' : 'bg-[#F8FAFC] text-slate-900'}`}>
      <MicroHeader
        icon={Beaker}
        breadcrumbs={[
          { label: 'Laboratoire', onClick: () => setActiveTab('dashboard') },
          { 
            label: activeTab === 'dashboard' ? 'Tableau de Bord' :
                   activeTab === 'demandes' ? 'Stage 1 — Prélèvements' : 
                   activeTab === 'resultats' ? 'Stage 2 — Saisie & Analyse' : 
                   activeTab === 'encours' ? 'En Cours' : 
                   activeTab === 'validations' ? 'Validations' : 'Stage 3 — Résultats Publiés',
            active: true
          }
        ]}
        onHomeClick={onBackToDashboard}
        onBackClick={activeTab !== 'dashboard' ? () => setActiveTab('dashboard') : undefined}
        user={{ name: user?.name || 'Laborantin' }}
        theme={theme}
        actions={
          <div className="flex items-center gap-1.5 overflow-x-auto">
            {[
              { id: 'dashboard', label: 'Dashboard' },
              { id: 'demandes', label: `Prélèvements (${stage1Count})` },
              { id: 'resultats', label: `Saisie & Analyse (${stage2Count})` },
              { id: 'rapports', label: `Résultats Publiés (${stage3Count})` }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-3 py-1.5 rounded-xl font-semibold text-xs transition-all cursor-pointer ${
                  activeTab === tab.id
                    ? 'bg-blue-600 text-white shadow-xs'
                    : theme === 'dark'
                    ? 'bg-slate-800/80 border border-slate-700/80 text-slate-300 hover:bg-slate-800'
                    : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        }
      />

      <div className="flex-1 min-h-0 h-full overflow-hidden flex flex-col">
        {activeTab === 'dashboard' && (
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            <ModuleDashboard 
              theme={theme}
              moduleName="Laboratoire"
              moduleIcon={Beaker}
              accentColor="text-blue-600"
              stats={[
                {
                  title: "Stage 1 — Prélèvements",
                  value: stage1Count.toString().padStart(2, '0'),
                  icon: Clock,
                  color: "bg-blue-600",
                  subtext: "En attente de prélèvement",
                  onClick: () => setActiveTab('demandes')
                },
                {
                  title: "Stage 2 — Saisie & Analyse",
                  value: stage2Count.toString().padStart(2, '0'),
                  icon: Activity,
                  color: "bg-amber-500",
                  subtext: "Échantillons prêts à analyser",
                  onClick: () => setActiveTab('resultats')
                },
                {
                  title: "Stage 3 — Résultats Publiés",
                  value: stage3Count.toString().padStart(2, '0'),
                  icon: CheckCircle2,
                  color: "bg-emerald-600",
                  subtext: "Analyses validées & archivées",
                  onClick: () => setActiveTab('rapports')
                },
                {
                  title: "Volume Total Analyses",
                  value: labRequests.length.toString().padStart(2, '0'),
                  icon: FlaskConical,
                  color: "bg-slate-900",
                  subtext: "Historique global",
                  onClick: () => setActiveTab('demandes')
                }
              ]}
            >
              {/* Recent Lab Requests Table */}
              <div className="bg-white rounded-[40px] border border-slate-200 shadow-sm overflow-hidden mt-8">
                <div className="p-8 border-b bg-slate-50/50 flex justify-between items-center">
                  <h3 className="font-black text-[10px] uppercase tracking-widest italic flex items-center gap-2">
                    <ClipboardList size={16} /> Dernières Demandes (Temps Réel)
                  </h3>
                  <button onClick={() => setActiveTab('demandes')} className="text-[10px] font-black text-blue-600 uppercase hover:underline">Voir Tout</button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-8 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">Patient</th>
                        <th className="px-8 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">Examens</th>
                        <th className="px-8 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">Priorité</th>
                        <th className="px-8 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">Statut</th>
                        <th className="px-8 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {labRequests.sort((a,b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()).slice(0, 5).map((r, i) => (
                        <tr 
                          key={`${r.id || 'lab-req'}-${i}`} 
                          onClick={() => setActiveTab('demandes')}
                          className="hover:bg-slate-50 transition-colors group cursor-pointer"
                        >
                          <td className="px-8 py-6">
                            <p className="font-black text-slate-900 text-sm">{r.patientName}</p>
                            <p className="text-[10px] text-slate-400 font-black font-mono tracking-tighter uppercase">{r.patientId}</p>
                          </td>
                          <td className="px-8 py-6">
                            <div className="flex flex-wrap gap-1">
                              {(r.exams || []).slice(0, 2).map((e, ei) => (
                                <span key={ei} className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded text-[10px] font-bold">{e.name}</span>
                              ))}
                              {(r.exams || []).length > 2 && <span className="text-[10px] text-slate-400 font-bold">+{(r.exams || []).length - 2}</span>}
                            </div>
                          </td>
                          <td className="px-8 py-6">
                            <span className={`text-[9px] font-black px-2 py-1 rounded uppercase ${r.priority === 'urgent' ? 'bg-rose-50 text-rose-600' : 'bg-slate-50 text-slate-600'}`}>
                              {r.priority}
                            </span>
                          </td>
                          <td className="px-8 py-6">
                            <span className={`text-[9px] font-black px-2 py-1 rounded uppercase ${r.status === 'en attente' ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'}`}>
                              {r.status}
                            </span>
                          </td>
                          <td className="px-8 py-6">
                            <button 
                              onClick={() => setActiveTab('demandes')}
                              className="text-blue-600 hover:text-blue-800 font-black text-[10px] uppercase tracking-widest"
                            >
                              Gérer
                            </button>
                          </td>
                        </tr>
                      ))}
                      {labRequests.length === 0 && (
                        <tr>
                          <td colSpan={5} className="px-8 py-20 text-center text-slate-400 text-xs font-bold uppercase tracking-widest italic opacity-50">
                            Aucune demande récente
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </ModuleDashboard>
          </div>
        )}

        {activeTab === 'demandes' && <DemandesTab requests={labRequests} updateRequests={saveRequests} paymentRequests={paymentRequests} />}
        {activeTab === 'encours' && <EnCoursTab requests={labRequests} updateRequests={saveRequests} user={user} />}
        {activeTab === 'resultats' && <ResultatsTab requests={labRequests} updateRequests={saveRequests} resultats={resultats} updateResultats={saveResultats} user={user} />}
        {activeTab === 'validations' && <ValidationsTab requests={labRequests} updateRequests={saveRequests} resultats={resultats} updateResultats={saveResultats} user={user} />}
        {activeTab === 'rapports' && <RapportsTab requests={labRequests} resultats={resultats} rapports={rapports} updateRapports={saveRapports} user={user} />}
      </div>
    </div>
  );
};

export default Lab;
