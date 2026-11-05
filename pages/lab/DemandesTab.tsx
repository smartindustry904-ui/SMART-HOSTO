import React, { useState, useMemo } from 'react';
import { Search, FlaskConical, AlertTriangle, CheckCircle, Clock, FileText, UserPlus, Droplet, ClipboardList, ChevronDown, ChevronUp, Info } from 'lucide-react';
import { LabExamRequest, PaymentRequest } from '../../types';
import { db } from '../../src/firebase';
import { collection, getDocs, doc, updateDoc, writeBatch } from 'firebase/firestore';
import { LabFilterToolbar, LabFilters } from '../../components/lab/LabFilterToolbar';
import { EmptyFilterState } from '../../components/common/EmptyFilterState';
import { isStatusEnAttente } from '../../src/utils/labStatus';

interface DemandesTabProps {
  requests: LabExamRequest[];
  updateRequests: (requests: LabExamRequest[]) => void;
  paymentRequests: PaymentRequest[];
}

const DemandesTab: React.FC<DemandesTabProps> = ({ requests, updateRequests, paymentRequests }) => {
  const [selectedRequest, setSelectedRequest] = useState<LabExamRequest | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Filters State - Strictly Stage 1 (EN_ATTENTE) without conflicting status dropdowns
  const [filters, setFilters] = useState<LabFilters>({
    search: '',
    status: 'EN_ATTENTE',
    dateRange: 'ALL',
    startDate: '',
    endDate: ''
  });

  const handleResetFilters = () => {
    setFilters({
      search: '',
      status: 'EN_ATTENTE',
      dateRange: 'ALL',
      startDate: '',
      endDate: ''
    });
  };

  // Chronological Descending Sort & Strict Stage-to-Status Filtering
  const sortedAndFilteredRequests = useMemo(() => {
    // 1. Strict Most Recent First Sort (DESC)
    const sorted = [...requests].sort((a, b) => {
      const tA = new Date(a.createdAt || a.date || 0).getTime();
      const tB = new Date(b.createdAt || b.date || 0).getTime();
      return tB - tA;
    });

    // 2. Strict Stage 1 Isolation: ONLY analyses currently waiting for sample (statut === 'EN_ATTENTE')
    const now = new Date();
    return sorted.filter(req => {
      if (!isStatusEnAttente(req.status, (req as any).statut)) {
        return false;
      }

      // Text Search: Patient Name, DME ID, Prescribing Doctor, Request ID
      if (filters.search) {
        const q = filters.search.toLowerCase().trim();
        const matchesPatient = (req.patientName || '').toLowerCase().includes(q);
        const matchesId = (req.id || '').toLowerCase().includes(q);
        const matchesDme = (req.patientId || '').toLowerCase().includes(q);
        const matchesDoctor = (req.prescriberName || '').toLowerCase().includes(q);
        if (!matchesPatient && !matchesId && !matchesDme && !matchesDoctor) {
          return false;
        }
      }

      // Date Filter
      const reqDate = new Date(req.createdAt || req.date);
      if (!isNaN(reqDate.getTime())) {
        if (filters.dateRange === 'TODAY') {
          if (reqDate.toDateString() !== now.toDateString()) return false;
        } else if (filters.dateRange === 'WEEK') {
          const diffDays = Math.ceil(Math.abs(now.getTime() - reqDate.getTime()) / (1000 * 60 * 60 * 24));
          if (diffDays > 7) return false;
        } else if (filters.dateRange === 'CUSTOM') {
          if (filters.startDate) {
            const start = new Date(filters.startDate);
            start.setHours(0, 0, 0, 0);
            if (reqDate < start) return false;
          }
          if (filters.endDate) {
            const end = new Date(filters.endDate);
            end.setHours(23, 59, 59, 999);
            if (reqDate > end) return false;
          }
        }
      }

      return true;
    });
  }, [requests, filters]);

  const handleUpdateStatus = async (id: string, newStatus: LabExamRequest['status']) => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      const requestToUpdate = requests.find(r => r.id === id);
      const batch = writeBatch(db);

      if (newStatus === 'prélèvement fait' && requestToUpdate) {
        const actualBillingStatus = getActualBillingStatus(requestToUpdate);
        const isPaid = actualBillingStatus === 'paid' || actualBillingStatus === 'exonéré';

        // 1. EMERGENCY LOOPHOLE FIX: Route unpaid emergency requests to Patient Debt & Discharge Lock
        if (!isPaid) {
          const debtId = `DETTE-LAB-${Math.floor(100000 + Math.random() * 900000)}`;
          const debtRef = doc(db, 'dettes_patient', debtId);
          batch.set(debtRef, {
            id: debtId,
            patientId: requestToUpdate.patientId,
            patientName: requestToUpdate.patientName,
            montantInitial: requestToUpdate.totalAmount || 0,
            montantRestant: requestToUpdate.totalAmount || 0,
            dateCreation: new Date().toISOString(),
            transactionSourceId: requestToUpdate.id,
            status: 'PENDING',
            origin: 'LABORATOIRE_URGENCE',
            description: `Examens labo urgence non réglés (${requestToUpdate.exams.map(e => e.name).join(', ')})`,
            isEmergencyOverride: true
          });

          // Lock patient file for discharge until debt is settled
          const dwRef = doc(db, 'discharges_waiting', requestToUpdate.patientId);
          batch.set(dwRef, {
            patientId: requestToUpdate.patientId,
            patientName: requestToUpdate.patientName,
            hasOutstandingEmergencyDebt: true,
            isLockedForDischarge: true,
            financialClearance: false,
            emergencyDebtAmount: requestToUpdate.totalAmount || 0,
            lockedReason: `Dette d'urgence laboratoire non réglée (${debtId})`,
            updatedAt: new Date().toISOString()
          }, { merge: true });

          const patientRef = doc(db, 'patients', requestToUpdate.patientId);
          batch.set(patientRef, {
            hasOutstandingEmergencyDebt: true,
            isLockedForDischarge: true,
            financialClearance: false
          }, { merge: true });

          window.dispatchEvent(new CustomEvent('app-notification', { 
            detail: { message: `⚠️ URGENCE : Prélèvement validé. Dette de ${(requestToUpdate.totalAmount || 0).toLocaleString()} FCFA enregistrée. Dossier patient verrouillé pour la sortie.`, type: 'warning' }
          }));
        }

        // 2. SMART CONSUMABLE GROUPING (Prélèvement Groupé)
        try {
          const isGenericConsumable = (name: string) => {
            const n = (name || '').toLowerCase();
            return ['seringue', 'syringe', 'aiguille', 'needle', 'gant', 'glove', 'alcool', 'coton', 'tampon', 'pansement', 'épicrânienne', 'garrot', 'compresse'].some(k => n.includes(k));
          };

          const consumableQtyMap: Record<string, number> = {};

          for (const exam of requestToUpdate.exams) {
            const consNames = exam.consommables || [];
            for (const cName of consNames) {
              if (!cName) continue;
              const lower = cName.toLowerCase();
              if (isGenericConsumable(lower)) {
                // Deduct ONCE per grouped draw session for generic items
                consumableQtyMap[lower] = 1;
              } else {
                // Deduct PER TEST for specific reagents / specific tubes
                consumableQtyMap[lower] = (consumableQtyMap[lower] || 0) + 1;
              }
            }
          }

          // If no specific consumables listed on exam, apply default generic draw kit (1 syringe, 1 glove, 1 alcohol wipe)
          if (Object.keys(consumableQtyMap).length === 0) {
            consumableQtyMap['seringue'] = 1;
            consumableQtyMap['gant'] = 1;
            consumableQtyMap['alcool'] = 1;
          }

          const consSnap = await getDocs(collection(db, 'hospital_consumables'));
          const pharmSnap = await getDocs(collection(db, 'pharmacy_inventory'));

          consSnap.docs.forEach((docSnap) => {
            const data = docSnap.data();
            const name = (data.nom || data.name || '').toLowerCase();
            for (const [cName, qty] of Object.entries(consumableQtyMap)) {
              if (name.includes(cName) || cName.includes(name)) {
                const currentStock = parseInt(data.stockInitial || data.stock || 0);
                if (currentStock > 0) {
                  const cRef = doc(db, 'hospital_consumables', docSnap.id);
                  batch.update(cRef, {
                    stockInitial: Math.max(0, currentStock - qty),
                    stock: Math.max(0, currentStock - qty)
                  });
                }
              }
            }
          });

          pharmSnap.docs.forEach((docSnap) => {
            const data = docSnap.data();
            const name = (data.name || data.nomCommercial || data.nom || '').toLowerCase();
            for (const [cName, qty] of Object.entries(consumableQtyMap)) {
              if (name.includes(cName) || cName.includes(name)) {
                const currentStock = parseInt(data.stock || data.quantite || 0);
                if (currentStock > 0) {
                  const pRef = doc(db, 'pharmacy_inventory', docSnap.id);
                  batch.update(pRef, {
                    stock: Math.max(0, currentStock - qty),
                    quantite: Math.max(0, currentStock - qty)
                  });
                }
              }
            }
          });
        } catch (err) {
          console.error("Error performing smart consumable deductions:", err);
        }
      }

      const reqRef = doc(db, 'lab_requests', id);
      batch.set(reqRef, { 
        ...(requestToUpdate || {}),
        status: newStatus,
        sampleCount: newStatus === 'prélèvement fait' ? ((requestToUpdate?.sampleCount || 0) + 1) : (requestToUpdate?.sampleCount || 0)
      }, { merge: true });

      await batch.commit();

      const updated = requests.map(r => r.id === id ? { ...r, status: newStatus } : r);
      updateRequests(updated);
      if (selectedRequest?.id === id) {
        // The instant sample is marked as drawn, it leaves Stage 1 immediately
        setSelectedRequest(null);
        setShowDetails(false);
      }
      window.dispatchEvent(new CustomEvent('app-notification', { 
        detail: { message: `✓ Prélèvement enregistré pour ${requestToUpdate?.patientName || 'le patient'}. Passage automatique à la Saisie & Analyse.`, type: 'success' }
      }));

      if (newStatus === 'prélèvement fait') {
        window.dispatchEvent(new CustomEvent('change-lab-tab', { detail: 'resultats' }));
      }
    } catch(e) {
      console.error(e);
      window.dispatchEvent(new CustomEvent('app-notification', { 
        detail: { message: `Erreur lors de la mise à jour : transaction annulée.`, type: 'error' }
      }));
    } finally {
      setIsSaving(false);
    }
  };

  const getActualBillingStatus = (req: LabExamRequest) => {
    if (req.billingStatus === 'paid' || req.billingStatus === 'exonéré') {
      return req.billingStatus;
    }
    
    // Find a corresponding payment request
    // Match by patientId, type LABORATOIRE, and created within 5 minutes of the lab request
    const reqDate = new Date(req.date).getTime();
    const matchingPayment = paymentRequests.find(pr => {
      if (pr.patientId !== req.patientId || pr.type !== 'LABORATOIRE') return false;
      const prDate = new Date(pr.createdAt).getTime();
      const diffMinutes = Math.abs(prDate - reqDate) / (1000 * 60);
      return diffMinutes <= 5;
    });

    if (matchingPayment && matchingPayment.status === 'PAID') {
      return 'paid';
    }
    
    return req.billingStatus;
  };

  const stage1TotalCount = requests.filter(r => isStatusEnAttente(r.status, (r as any).statut)).length;

  return (
    <div className="flex flex-col h-full gap-3 overflow-hidden">
      {/* Ultra-Micro Compact Filter Toolbar strictly for Stage 1 (No status dropdown) */}
      <LabFilterToolbar 
        filters={filters}
        onFiltersChange={setFilters}
        totalCount={stage1TotalCount}
        filteredCount={sortedAndFilteredRequests.length}
        onReset={handleResetFilters}
        showStatusFilter={false}
        stageBadge={{ label: "Stage 1 — Prélèvements (En attente)", color: "bg-blue-50 text-blue-700 border border-blue-200" }}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 flex-1 min-h-0 overflow-hidden">
        {/* Liste des demandes */}
        <div className="lg:col-span-1 bg-white rounded-3xl border border-slate-200 shadow-sm flex flex-col h-full overflow-hidden">
          <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between shrink-0">
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
              <ClipboardList size={13} className="text-blue-600" /> Demandes ({sortedAndFilteredRequests.length})
            </span>
            <span className="text-[9px] font-bold text-slate-400">Plus récentes en premier</span>
          </div>
          
          <div className="flex-1 overflow-y-auto p-2.5 space-y-2 custom-scrollbar">
            {sortedAndFilteredRequests.length > 0 ? (
              sortedAndFilteredRequests.map((req, idx) => {
                const actualBillingStatus = getActualBillingStatus(req);
                const isSelected = selectedRequest?.id === req.id;
                return (
                  <div 
                    key={`${req.id || 'req'}-${idx}`} 
                    onClick={() => setSelectedRequest(req)}
                    className={`p-3.5 rounded-2xl cursor-pointer transition-all border ${
                      isSelected 
                        ? 'bg-blue-50/90 border-blue-300 ring-2 ring-blue-500/20 shadow-sm' 
                        : 'bg-white border-slate-100 hover:border-blue-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex justify-between items-start mb-1.5">
                      <div className="min-w-0 pr-2">
                        <h3 className="font-bold text-slate-900 text-xs truncate">{req.patientName}</h3>
                        <p className="text-[10px] text-slate-400 font-mono font-bold tracking-tight uppercase">
                          {req.patientId || req.id}
                        </p>
                      </div>
                      {req.priority === 'urgent' || req.priority === 'critique' ? (
                        <span className="bg-rose-100 text-rose-700 text-[9px] font-black px-1.5 py-0.5 rounded-md flex items-center gap-0.5 shrink-0">
                          <AlertTriangle size={10} /> {req.priority.toUpperCase()}
                        </span>
                      ) : (
                        <span className="bg-slate-100 text-slate-600 text-[9px] font-bold px-1.5 py-0.5 rounded-md shrink-0">
                          NORMAL
                        </span>
                      )}
                    </div>

                    <div className="flex items-center justify-between text-[10px] pt-2 border-t border-slate-100/80">
                      <div className="flex items-center gap-1.5">
                        <span className={`px-2 py-0.5 rounded-md font-bold text-[9px] uppercase ${
                          actualBillingStatus === 'paid' 
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60' 
                            : actualBillingStatus === 'exonéré' 
                            ? 'bg-blue-50 text-blue-700 border border-blue-200/60' 
                            : 'bg-amber-50 text-amber-700 border border-amber-200/60'
                        }`}>
                          {actualBillingStatus === 'paid' ? 'Payé' : actualBillingStatus === 'exonéré' ? 'Exonéré' : 'Non payé'}
                        </span>
                        <span className={`px-1.5 py-0.5 rounded-md font-bold text-[9px] uppercase ${
                          req.status === 'prélèvement fait' ? 'bg-indigo-50 text-indigo-700' :
                          req.status === 'terminé' || req.status === 'validé' ? 'bg-emerald-50 text-emerald-700' :
                          'bg-slate-100 text-slate-600'
                        }`}>
                          {req.status === 'prélèvement fait' ? 'Prélevé' : req.status === 'terminé' || req.status === 'validé' ? 'Terminé' : 'En attente'}
                        </span>
                      </div>

                      <span className="text-slate-400 font-mono text-[10px] flex items-center gap-1">
                        <Clock size={11} /> 
                        {new Date(req.createdAt || req.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                );
              })
            ) : (
              <EmptyFilterState 
                message="Aucune demande trouvée pour ces critères"
                submessage="Aucune prescription de laboratoire ne correspond aux filtres actifs."
                onReset={handleResetFilters}
                className="py-12"
              />
            )}
          </div>
        </div>

      {/* Détails de la demande */}
      <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col h-full overflow-hidden">
        {selectedRequest ? (
          <>
            {/* Ultra-Micro Header Ribbon (Height: strictly ~42px, single-line text ribbon) */}
            <div className="h-11 px-4 bg-slate-900 text-white flex items-center justify-between gap-3 shrink-0 rounded-t-2xl text-xs font-mono select-none overflow-x-auto whitespace-nowrap custom-scrollbar">
              <div className="flex items-center gap-2 text-slate-200 text-[11px] sm:text-xs">
                <span className="font-bold text-amber-400">[{selectedRequest.patientId || selectedRequest.id}]</span>
                <span className="text-slate-600">|</span>
                <span className="font-bold text-white font-sans">{selectedRequest.patientName}</span>
                <span className="text-slate-600">|</span>
                <span>{selectedRequest.patientAge || (selectedRequest as any).age ? `${selectedRequest.patientAge || (selectedRequest as any).age} ans` : 'Âge -'}</span>
                <span className="text-slate-600">|</span>
                <span>{selectedRequest.patientGender === 'M' ? 'H' : selectedRequest.patientGender === 'F' ? 'F' : selectedRequest.patientGender || '-'}</span>
                <span className="text-slate-600">|</span>
                <span className="text-slate-300 font-sans">Prescripteur: <strong className="text-white font-medium">{selectedRequest.prescriberName || 'Médecin'}</strong></span>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${
                  selectedRequest.priority === 'Critique' || selectedRequest.priority === 'critique'
                    ? 'bg-rose-500 text-white'
                    : selectedRequest.priority === 'Urgent' || selectedRequest.priority === 'urgent'
                    ? 'bg-amber-500 text-slate-950 font-black'
                    : 'bg-emerald-700 text-white'
                }`}>
                  {selectedRequest.priority || 'NORMAL'}
                </span>
                <span className="bg-amber-400/20 text-amber-300 border border-amber-400/30 text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider">
                  EN ATTENTE
                </span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 sm:p-5 custom-scrollbar bg-slate-50/30">
              <h3 className="font-black text-slate-900 uppercase tracking-tight mb-4 flex items-center gap-2">
                <FlaskConical size={18} className="text-blue-500" /> Examens prescrits ({selectedRequest.exams.length})
              </h3>
              <div className="space-y-2">
                {selectedRequest.exams.map((exam, idx) => (
                  <div key={idx} className="px-5 py-3.5 border border-slate-150 rounded-2xl flex items-center justify-between bg-white shadow-sm hover:border-blue-400 hover:bg-blue-50/10 transition-all group">
                    <div className="flex items-center gap-3">
                      <span className="w-2.5 h-2.5 rounded-full bg-blue-500 shrink-0 animate-pulse" />
                      <p className="font-extrabold text-slate-900 text-xs">{exam.name}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="px-2.5 py-1 bg-blue-50 text-blue-600 text-[9px] font-black uppercase tracking-wider rounded-lg">{exam.category}</span>
                      {exam.sampleType && (
                        <span className="text-[9px] text-slate-400 font-bold bg-slate-100 px-2 py-1 rounded-lg">Tube: {exam.sampleType.split(' ')[0]}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-6 border-t border-slate-100 bg-slate-50 shrink-0">
              {getActualBillingStatus(selectedRequest) !== 'paid' && getActualBillingStatus(selectedRequest) !== 'exonéré' ? (
                <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-3 text-amber-800">
                  <AlertTriangle size={20} className="shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-sm">Paiement en attente</p>
                    <p className="text-xs mt-1">Les examens n'ont pas encore été réglés à la caisse. Veuillez vérifier avec le patient ou la caisse avant de procéder au prélèvement, sauf urgence vitale.</p>
                  </div>
                </div>
              ) : null}

              <div className="flex justify-end gap-3">
                <button 
                  onClick={() => handleUpdateStatus(selectedRequest.id, 'patient appelé')}
                  disabled={isSaving}
                  className="px-6 py-3 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-50 transition-colors flex items-center gap-2 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <UserPlus size={18} /> Appeler le patient
                </button>
                <button 
                  onClick={() => handleUpdateStatus(selectedRequest.id, 'prélèvement fait')}
                  disabled={isSaving}
                  className="px-6 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-500 transition-colors flex items-center gap-2 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Droplet size={18} /> Prélèvement effectué
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-slate-400 p-8 text-center">
            <FlaskConical size={64} className="mb-6 opacity-20" />
            <h2 className="text-xl font-bold text-slate-600 mb-2">Sélectionnez une demande</h2>
            <p className="text-sm max-w-md">Choisissez une demande dans la liste pour voir les détails cliniques et procéder au prélèvement.</p>
          </div>
        )}
      </div>
    </div>
  </div>
  );
};

export default DemandesTab;
