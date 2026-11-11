import React, { useState, useEffect } from 'react';
import { History as HistoryIcon, Search, Eye, RefreshCw, FileText, Calendar, X, Printer, Pill, Beaker, Stethoscope, Syringe, CheckCircle2, Clock } from 'lucide-react';
import { db } from '../../src/firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import { useSettings } from '../../hooks/useSettings';
import { getActiveTenantId, belongsToTenant } from '../../src/utils/tenant';
import { Avatar } from '../../components/common/Avatar';
import { AvatarPlaceholder } from '../../components/common/AvatarPlaceholder';

interface HistoryProps {
  patientId?: string;
}

export interface TimelineItem {
  id: string;
  patientId: string;
  patientName: string;
  age?: number | string;
  gender?: string;
  date: string;
  time?: string;
  timestamp: number;
  itemType: 'CONSULTATION' | 'MEDICATION' | 'EXAM' | 'SOIN';
  category: 'GENERAL' | 'GYNECO' | 'CPN' | 'PRESCRIPTION' | 'LAB' | 'SOINS';
  title: string;
  doctor: string;
  diagnosis?: string;
  treatment?: string;
  exams?: string;
  observation?: string;
  itemsList?: any[];
  status?: string;
  executedBy?: string;
  executionDate?: string;
  executionTime?: string;
  executionNotes?: string;
  instructions?: string;
  priority?: string;
}

const HistoryComponent: React.FC<HistoryProps> = ({ patientId }) => {
  const { establishment } = useSettings();
  const activeTenantId = getActiveTenantId(null, establishment);
  const [timelineItems, setTimelineItems] = useState<TimelineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<'ALL' | 'CONSULTATION' | 'MEDICATION' | 'EXAM' | 'SOIN'>('ALL');
  const [viewDetailRecord, setViewDetailRecord] = useState<TimelineItem | null>(null);
  const [viewMode, setViewMode] = useState<'TIMELINE' | 'TABLE'>('TIMELINE');

  // Subscribe in real-time to consultations, prescriptions, lab requests, and nursing acts with tenant isolation
  useEffect(() => {
    let consultationsList: TimelineItem[] = [];
    let prescriptionsList: TimelineItem[] = [];
    let labList: TimelineItem[] = [];
    let nursingList: TimelineItem[] = [];

    const updateAllItems = () => {
      const merged = [...consultationsList, ...prescriptionsList, ...labList, ...nursingList];
      // Deduplicate by ID
      const map = new Map<string, TimelineItem>();
      merged.forEach(item => {
        if (!map.has(item.id)) {
          map.set(item.id, item);
        }
      });
      const sorted = Array.from(map.values()).sort((a, b) => b.timestamp - a.timestamp);
      setTimelineItems(sorted);
      setLoading(false);
    };

    // 1. Consultations Listener
    const unsubConsultations = onSnapshot(collection(db, 'consultations'), (snapshot) => {
      consultationsList = snapshot.docs
        .filter(docSnap => belongsToTenant(docSnap.data(), activeTenantId))
        .map(docSnap => {
          const d = docSnap.data();
          const dateStr = d.date || (d.createdAt ? d.createdAt.split('T')[0] : 'Récemment');
          const ts = d.createdAt ? new Date(d.createdAt).getTime() : Date.now();
          return {
            id: docSnap.id,
            patientId: d.patientId || d.patientIdRaw || '',
            patientName: d.patient || d.patientName || 'Patient Inconnu',
            age: d.age || 30,
            gender: d.gender || 'M',
            date: dateStr,
            time: d.time || '10:00',
            timestamp: isNaN(ts) ? Date.now() : ts,
            itemType: 'CONSULTATION',
            category: d.type === 'CPN / Maternité' ? 'CPN' : d.type === 'Consultation Gynécologique' ? 'GYNECO' : 'GENERAL',
            title: d.type || 'Consultation Médicale',
            doctor: d.doctor || d.doctorName || 'Dr. Référent',
            diagnosis: d.diagnosis || 'Diagnostic non spécifié',
            treatment: d.treatment || d.prescription || '',
            exams: d.exams || '',
            observation: d.observation || d.notes || ''
          };
        });
      updateAllItems();
    }, (err) => {
      console.error("Error fetching consultations:", err);
      updateAllItems();
    });

    // 2. Pending Prescriptions Listener
    const unsubPrescriptions = onSnapshot(collection(db, 'pending_prescriptions'), (snapshot) => {
      prescriptionsList = snapshot.docs
        .filter(docSnap => belongsToTenant(docSnap.data(), activeTenantId))
        .map(docSnap => {
          const d = docSnap.data();
          const dateStr = d.createdAt ? d.createdAt.split('T')[0] : 'Récemment';
          const ts = d.createdAt ? new Date(d.createdAt).getTime() : Date.now();
          const items = d.items || [];
          const treatmentSummary = items.map((i: any) => `${i.name} (${i.posology || ''})`).join(', ');

          return {
            id: docSnap.id,
            patientId: d.patientId || '',
            patientName: d.patientName || d.patient || 'Patient Inconnu',
            age: d.patientAge || 30,
            gender: d.patientGender || 'M',
            date: dateStr,
            time: d.createdAt ? new Date(d.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '10:00',
            timestamp: isNaN(ts) ? Date.now() : ts,
            itemType: 'MEDICATION',
            category: 'PRESCRIPTION',
            title: 'Prescription Médicamenteuse',
            doctor: d.doctorName || d.doctor || 'Dr. Référent',
            treatment: treatmentSummary,
            itemsList: items,
            status: d.status === 'served' ? 'Livré' : 'En attente'
          };
        });
      updateAllItems();
    }, (err) => {
      console.error("Error fetching prescriptions:", err);
      updateAllItems();
    });

    // 3. Lab Requests Listener
    const unsubLab = onSnapshot(collection(db, 'lab_requests'), (snapshot) => {
      labList = snapshot.docs
        .filter(docSnap => belongsToTenant(docSnap.data(), activeTenantId))
        .map(docSnap => {
          const d = docSnap.data();
          const dateStr = d.createdAt ? d.createdAt.split('T')[0] : 'Récemment';
          const ts = d.createdAt ? new Date(d.createdAt).getTime() : Date.now();
          const examsArr = d.exams || [];
          const examSummary = Array.isArray(examsArr) ? examsArr.map((e: any) => typeof e === 'string' ? e : e.name).join(', ') : 'Examen de laboratoire';

          return {
            id: docSnap.id,
            patientId: d.patientId || '',
            patientName: d.patientName || d.patient || 'Patient Inconnu',
            age: d.patientAge || 30,
            gender: d.patientGender || 'M',
            date: dateStr,
            time: d.createdAt ? new Date(d.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '10:00',
            timestamp: isNaN(ts) ? Date.now() : ts,
            itemType: 'EXAM',
            category: 'LAB',
            title: 'Demande / Examen de Laboratoire',
            doctor: d.doctorName || d.doctor || 'Dr. Référent',
            exams: examSummary,
            observation: d.clinicalInfo || d.notes || '',
            status: d.status || 'En cours'
          };
        });
      updateAllItems();
    }, (err) => {
      console.error("Error fetching lab requests:", err);
      updateAllItems();
    });

    // 4. Nursing Acts Listener (Soins Infirmiers)
    const unsubNursing = onSnapshot(collection(db, 'nursing_acts'), (snapshot) => {
      nursingList = snapshot.docs
        .filter(docSnap => belongsToTenant(docSnap.data(), activeTenantId))
        .map(docSnap => {
          const d = docSnap.data();
          const dateStr = d.date || (d.createdAt ? (typeof d.createdAt === 'string' ? d.createdAt.split('T')[0] : 'Récemment') : 'Récemment');
          const ts = d.createdAt ? (typeof d.createdAt === 'string' ? new Date(d.createdAt).getTime() : d.createdAt) : Date.now();
          const isFait = d.status === 'FAIT';

          return {
            id: docSnap.id,
            patientId: d.patientId ? String(d.patientId) : '',
            patientName: d.patientName || 'Patient Inconnu',
            age: d.patientAge || 30,
            gender: d.patientGender || 'M',
            date: dateStr,
            time: d.time || (d.createdAt ? new Date(d.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '10:00'),
            timestamp: isNaN(ts) ? Date.now() : ts,
            itemType: 'SOIN',
            category: 'SOINS',
            title: d.actType || 'Soin Infirmier Prescrit',
            doctor: d.prescribedBy || 'Médecin Prescripteur',
            treatment: d.instructions || d.actType || '',
            observation: d.executionNotes || d.instructions || '',
            instructions: d.instructions || '',
            executedBy: d.executedBy || '',
            executionDate: d.executionDate || '',
            executionTime: d.executionTime || '',
            executionNotes: d.executionNotes || '',
            priority: d.priority || 'NORMAL',
            status: isFait ? 'FAIT' : 'EN_ATTENTE'
          };
        });
      updateAllItems();
    }, (err) => {
      console.error("Error fetching nursing acts:", err);
      updateAllItems();
    });

    return () => {
      unsubConsultations();
      unsubPrescriptions();
      unsubLab();
      unsubNursing();
    };
  }, [activeTenantId]);

  // Filtering
  const filteredItems = timelineItems.filter(item => {
    // Patient filter
    if (patientId && String(item.patientId) !== String(patientId)) {
      return false;
    }

    // Search query
    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      const match = (item.patientName || '').toLowerCase().includes(q) ||
                    (item.diagnosis || '').toLowerCase().includes(q) ||
                    (item.treatment || '').toLowerCase().includes(q) ||
                    (item.exams || '').toLowerCase().includes(q) ||
                    (item.id || '').toLowerCase().includes(q);
      if (!match) return false;
    }

    // Category Filter
    if (selectedFilter !== 'ALL' && item.itemType !== selectedFilter) {
      return false;
    }

    return true;
  });

  const getItemBadge = (itemType: string) => {
    switch (itemType) {
      case 'CONSULTATION':
        return {
          icon: <Stethoscope size={14} className="text-blue-600" />,
          bg: 'bg-blue-50 text-blue-700 border-blue-200',
          label: 'Consultation'
        };
      case 'MEDICATION':
        return {
          icon: <Pill size={14} className="text-emerald-600" />,
          bg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
          label: 'Médicaments'
        };
      case 'EXAM':
        return {
          icon: <Beaker size={14} className="text-purple-600" />,
          bg: 'bg-purple-50 text-purple-700 border-purple-200',
          label: 'Laboratoire'
        };
      case 'SOIN':
        return {
          icon: <Syringe size={14} className="text-teal-600" />,
          bg: 'bg-teal-50 text-teal-700 border-teal-200',
          label: 'Soin Prescrit'
        };
      default:
        return {
          icon: <FileText size={14} className="text-slate-600" />,
          bg: 'bg-slate-50 text-slate-700 border-slate-200',
          label: 'Document'
        };
    }
  };

  const handlePrint = (item: TimelineItem) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write(`
      <html>
        <head>
          <title>${item.id} - HISTORIQUE CLINIQUE</title>
          <style>
            body { font-family: system-ui, -apple-system, sans-serif; padding: 40px; color: #0f172a; line-height: 1.6; }
            .header { border-bottom: 3px solid #2563eb; padding-bottom: 12px; margin-bottom: 24px; display: flex; justify-content: space-between; }
            .logo { font-size: 20px; font-weight: 900; color: #2563eb; }
            .card { background: #f8fafc; border: 1px solid #e2e8f0; padding: 20px; border-radius: 12px; margin-bottom: 20px; }
            .label { font-size: 11px; text-transform: uppercase; font-weight: 800; color: #64748b; }
            .value { font-size: 14px; font-weight: 700; color: #0f172a; margin-top: 2px; }
            .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
            .footer { margin-top: 40px; border-top: 1px solid #e2e8f0; padding-top: 12px; font-size: 11px; color: #94a3b8; text-align: right; }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="logo">${establishment?.name || 'SMARTHOSTO CLINICAL SYSTEM'}</div>
            <div style="font-size: 12px; font-weight: bold;">RÉF: ${item.id}</div>
          </div>

          <h2 style="margin-top:0">${item.title}</h2>

          <div class="card grid">
            <div>
              <div class="label">Patient</div>
              <div class="value">${item.patientName} (${item.age} ans, ${item.gender})</div>
            </div>
            <div>
              <div class="label">Date & Heure</div>
              <div class="value">${item.date} à ${item.time || '10:00'}</div>
            </div>
            <div>
              <div class="label">Praticien Responsable</div>
              <div class="value">${item.doctor}</div>
            </div>
            <div>
              <div class="label">Type d'Événement</div>
              <div class="value">${item.itemType}</div>
            </div>
          </div>

          ${item.diagnosis ? `
            <div class="card">
              <div class="label">Diagnostic retenu</div>
              <div class="value">${item.diagnosis}</div>
            </div>
          ` : ''}

          ${item.treatment ? `
            <div class="card">
              <div class="label">Prescription / Traitements</div>
              <div class="value">${item.treatment}</div>
            </div>
          ` : ''}

          ${item.exams ? `
            <div class="card">
              <div class="label">Examens Demandés / Résultats</div>
              <div class="value">${item.exams}</div>
            </div>
          ` : ''}

          ${item.observation ? `
            <div class="card">
              <div class="label">Notes Clinical / Observations</div>
              <div class="value" style="white-space: pre-wrap;">${item.observation}</div>
            </div>
          ` : ''}

          <div class="footer">
            Document clinique certifié par ${establishment?.name || 'SMARTHOSTO'} • Généré le ${new Date().toLocaleDateString('fr-FR')}
          </div>
          <script>window.print();</script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header & Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-6 rounded-[32px] border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-3">
            <HistoryIcon className="text-blue-600" size={24} />
            Historique Médical Chronologique
          </h2>
          <p className="text-xs font-semibold text-slate-500 mt-0.5 italic">
            Fil de santé unifié: consultations, ordonnances et examens de laboratoire
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Category Tabs */}
          <div className="flex bg-slate-100 p-1.5 rounded-2xl">
            {[
              { id: 'ALL', label: 'Tout' },
              { id: 'CONSULTATION', label: 'Consultations' },
              { id: 'MEDICATION', label: 'Médicaments' },
              { id: 'EXAM', label: 'Examens' },
              { id: 'SOIN', label: 'Soins Prescrits' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setSelectedFilter(tab.id as any)}
                className={`px-3.5 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                  selectedFilter === tab.id
                    ? 'bg-slate-900 text-white shadow'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search Box */}
          <div className="relative">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Rechercher diagnostic, traitement, exam..."
              className="pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/20 w-64"
            />
          </div>

          {/* View Mode Toggle */}
          <div className="flex bg-slate-100 p-1 rounded-xl">
            <button
              onClick={() => setViewMode('TIMELINE')}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                viewMode === 'TIMELINE' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
              }`}
            >
              Timeline
            </button>
            <button
              onClick={() => setViewMode('TABLE')}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                viewMode === 'TABLE' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
              }`}
            >
              Tableau
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      {loading ? (
        <div className="bg-white rounded-[32px] border border-slate-200 p-12 text-center">
          <RefreshCw size={24} className="animate-spin text-blue-600 mx-auto mb-3" />
          <p className="text-sm font-black text-slate-600 uppercase tracking-wider">Chargement du dossier médical...</p>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="bg-white rounded-[32px] border border-slate-200 p-12 text-center text-slate-400 font-medium">
          Aucun événement médical ne correspond aux critères de recherche.
        </div>
      ) : viewMode === 'TIMELINE' ? (
        /* Chronological Timeline Cards View */
        <div className="relative pl-6 md:pl-10 space-y-6 before:absolute before:left-3 md:before:left-5 before:top-4 before:bottom-4 before:w-0.5 before:bg-slate-200">
          {filteredItems.map((item) => {
            const badge = getItemBadge(item.itemType);
            return (
              <div key={item.id} className="relative group">
                {/* Timeline Node Point */}
                <div className="absolute -left-6 md:-left-10 top-5 w-6 h-6 rounded-full bg-white border-2 border-slate-300 group-hover:border-blue-600 flex items-center justify-center transition-all z-10 shadow-sm">
                  <div className="w-2 h-2 rounded-full bg-slate-400 group-hover:bg-blue-600 transition-all"></div>
                </div>

                {/* Event Card */}
                <div className="bg-white rounded-[28px] border border-slate-200 p-6 hover:border-blue-500 transition-all shadow-sm hover:shadow-xl hover:shadow-blue-600/5 max-w-full overflow-hidden">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-4 border-b border-slate-100">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border flex items-center gap-1.5 shrink-0 ${badge.bg}`}>
                        {badge.icon} {badge.label}
                      </span>
                      <h3 className="text-lg font-black text-slate-900 truncate tracking-tight">{item.title}</h3>
                      <span className="text-[10px] font-black font-mono text-slate-400 uppercase bg-slate-50 px-2 py-0.5 rounded border border-slate-100 shrink-0">
                        {item.id}
                      </span>
                    </div>

                    <div className="flex items-center gap-4 text-xs font-bold text-slate-500 shrink-0">
                      {item.itemType === 'SOIN' && (
                        <div className="flex items-center gap-2">
                          {item.priority && (
                            <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${
                              item.priority === 'CRITIQUE' ? 'bg-rose-100 text-rose-700 border border-rose-200' :
                              item.priority === 'URGENT' ? 'bg-amber-100 text-amber-700 border border-amber-200' :
                              'bg-slate-100 text-slate-700 border border-slate-200'
                            }`}>
                              {item.priority}
                            </span>
                          )}
                          <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border flex items-center gap-1.5 ${
                            item.status === 'FAIT'
                              ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                              : 'bg-amber-100 text-amber-800 border-amber-300'
                          }`}>
                            {item.status === 'FAIT' ? (
                              <>
                                <CheckCircle2 size={12} className="text-emerald-600" />
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
                      )}
                      <div className="flex items-center gap-1.5">
                        <Calendar size={14} className="text-slate-400" />
                        <span>{item.date}</span>
                        {item.time && <span className="text-slate-400">à {item.time}</span>}
                      </div>
                      <div className="flex items-center gap-1.5 text-blue-600 font-extrabold bg-blue-50 px-2.5 py-1 rounded-lg">
                        <Avatar user={{ name: item.doctor }} size={18} />
                        <span>{item.doctor}</span>
                      </div>
                    </div>
                  </div>

                  {/* Body Content */}
                  <div className="pt-4 grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-medium text-slate-700">
                    {/* Patient detail if global view */}
                    {!patientId && (
                      <div className="md:col-span-3 bg-slate-50 p-3 rounded-2xl border border-slate-100 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <AvatarPlaceholder size={36} iconSize={18} alt={item.patientName} />
                          <div>
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Patient Concerné</span>
                            <span className="font-black text-slate-900 text-sm">{item.patientName}</span>
                            <span className="text-slate-500 text-xs font-bold ml-2">({item.age} ans • {item.gender})</span>
                          </div>
                        </div>
                        {item.status && (
                          <span className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-md ${
                            item.status === 'FAIT' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                          }`}>
                            {item.status === 'FAIT' ? 'Exécuté / Fait' : item.status === 'EN_ATTENTE' ? 'En attente' : item.status}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Specific layout for Prescribed Nursing Care */}
                    {item.itemType === 'SOIN' ? (
                      <div className="md:col-span-3 space-y-2.5">
                        {item.instructions && (
                          <div className="bg-slate-50/90 p-3.5 rounded-2xl border border-slate-200/80">
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-0.5">Consignes du médecin</span>
                            <p className="text-xs font-bold text-slate-800">{item.instructions}</p>
                          </div>
                        )}

                        {item.status === 'FAIT' ? (
                          <div 
                            title={`Exécuté par ${item.executedBy || 'Infirmier(ère)'} le ${item.executionDate || item.date} à ${item.executionTime || item.time}`}
                            className="bg-emerald-50/90 p-4 rounded-2xl border border-emerald-200 text-emerald-950 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs hover:bg-emerald-100/70 transition-colors"
                          >
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                                <span className="text-xs font-black text-emerald-950">
                                  Exécuté par <span className="underline decoration-emerald-400 font-bold">{item.executedBy || 'Infirmier(ère) de garde'}</span> à {item.executionTime || item.time}
                                </span>
                              </div>
                              {item.executionNotes && (
                                <p className="text-xs text-emerald-800 mt-1.5 italic pl-6 font-medium">
                                  Note clinique infirmière : « {item.executionNotes} »
                                </p>
                              )}
                            </div>
                            <span className="text-[10px] font-mono text-emerald-700 bg-white/80 px-2.5 py-1 rounded-md border border-emerald-200 shrink-0 font-bold self-start sm:self-center">
                              {item.executionDate || item.date}
                            </span>
                          </div>
                        ) : (
                          <div className="bg-amber-50/80 p-3.5 rounded-2xl border border-amber-200/80 text-amber-900 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <Clock size={16} className="text-amber-600" />
                              <span className="text-xs font-bold">
                                En attente de réalisation par l'équipe des Soins Infirmiers
                              </span>
                            </div>
                            <span className="text-[10px] font-black uppercase text-amber-700 bg-amber-100 px-2 py-0.5 rounded-md">
                              File d'attente active
                            </span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <>
                        {/* Diagnostic */}
                        {item.diagnosis && (
                          <div className="bg-slate-50/80 p-3.5 rounded-2xl border border-slate-100 min-w-0">
                            <span className="text-[9px] font-black text-blue-600 uppercase tracking-widest block mb-1">Diagnostic</span>
                            <p className="font-extrabold text-slate-900 break-words leading-relaxed">{item.diagnosis}</p>
                          </div>
                        )}

                        {/* Treatment */}
                        {item.treatment && (
                          <div className="bg-slate-50/80 p-3.5 rounded-2xl border border-slate-100 min-w-0 md:col-span-2">
                            <span className="text-[9px] font-black text-emerald-600 uppercase tracking-widest block mb-1">Traitements / Traitement prescrit</span>
                            <p className="font-bold text-slate-800 break-words leading-relaxed">{item.treatment}</p>
                          </div>
                        )}

                        {/* Exams */}
                        {item.exams && (
                          <div className="bg-slate-50/80 p-3.5 rounded-2xl border border-slate-100 min-w-0 md:col-span-3">
                            <span className="text-[9px] font-black text-purple-600 uppercase tracking-widest block mb-1">Examens demandés / Résultat</span>
                            <p className="font-bold text-slate-800 break-words leading-relaxed">{item.exams}</p>
                          </div>
                        )}

                        {/* Observation snippet */}
                        {item.observation && (
                          <div className="bg-amber-50/50 p-3.5 rounded-2xl border border-amber-100/60 min-w-0 md:col-span-3">
                            <span className="text-[9px] font-black text-amber-700 uppercase tracking-widest block mb-1">Observation Clinique</span>
                            <p className="text-slate-700 italic break-words line-clamp-2">{item.observation}</p>
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  {/* Actions Footer */}
                  <div className="mt-4 pt-3 border-t border-slate-100 flex justify-end gap-2">
                    <button
                      onClick={() => setViewDetailRecord(item)}
                      className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Eye size={14} /> Voir Détails
                    </button>
                    <button
                      onClick={() => handlePrint(item)}
                      className="px-4 py-2 bg-indigo-50 hover:bg-indigo-600 hover:text-white text-indigo-600 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Printer size={14} /> Imprimer Fiche
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Synchronized Table View */
        <div className="bg-white rounded-[32px] border border-slate-200 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Date & Heure</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Type</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Patient</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Diagnostic / Titre</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Praticien</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredItems.map(item => {
                  const badge = getItemBadge(item.itemType);
                  return (
                    <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4 font-bold text-slate-900 whitespace-nowrap">
                        {item.date} <span className="text-slate-400 text-[10px] block">{item.time || '10:00'}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider border inline-flex items-center gap-1 ${badge.bg}`}>
                          {badge.icon} {badge.label}
                        </span>
                      </td>
                      <td className="px-6 py-4 font-black text-slate-900">
                        {item.patientName}
                        <span className="text-slate-400 font-normal block text-[10px]">{item.id}</span>
                      </td>
                      <td className="px-6 py-4 font-extrabold text-slate-800 max-w-xs">
                        {item.itemType === 'SOIN' ? (
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider inline-flex items-center gap-1 ${
                                item.status === 'FAIT' 
                                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' 
                                  : 'bg-amber-100 text-amber-800 border border-amber-300'
                              }`}>
                                {item.status === 'FAIT' ? (
                                  <>
                                    <CheckCircle2 size={10} className="text-emerald-600" />
                                    <span>Exécuté / Fait</span>
                                  </>
                                ) : (
                                  <>
                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                                    <span>En attente</span>
                                  </>
                                )}
                              </span>
                              {item.priority && (
                                <span className="text-[9px] font-black uppercase text-slate-400 font-mono">[{item.priority}]</span>
                              )}
                            </div>
                            <p className="truncate text-slate-900 font-bold">{item.title}</p>
                            {item.status === 'FAIT' ? (
                              <p className="text-[10px] text-emerald-700 font-medium truncate mt-0.5" title={`Exécuté par ${item.executedBy} à ${item.executionTime}`}>
                                Exécuté par {item.executedBy || 'Infirmier'} à {item.executionTime || item.time}
                                {item.executionNotes ? ` • « ${item.executionNotes} »` : ''}
                              </p>
                            ) : (
                              <p className="text-[10px] text-amber-600 font-medium truncate mt-0.5">
                                En attente au poste des soins infirmiers
                              </p>
                            )}
                          </div>
                        ) : (
                          <span className="truncate block">
                            {item.diagnosis || item.treatment || item.exams || item.title}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 font-bold text-blue-600 whitespace-nowrap">
                        {item.doctor}
                      </td>
                      <td className="px-6 py-4 text-right whitespace-nowrap">
                        <div className="flex justify-end gap-1.5">
                          <button
                            onClick={() => setViewDetailRecord(item)}
                            className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg"
                            title="Voir la fiche"
                          >
                            <FileText size={14} />
                          </button>
                          <button
                            onClick={() => handlePrint(item)}
                            className="p-2 bg-indigo-50 hover:bg-indigo-600 hover:text-white text-indigo-600 rounded-lg"
                            title="Imprimer"
                          >
                            <Printer size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* DETAIL RECORD MODAL */}
      {viewDetailRecord && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="bg-white rounded-[40px] border border-slate-200 w-full max-w-2xl p-8 shadow-2xl relative max-h-[85vh] overflow-y-auto">
            <button 
              onClick={() => setViewDetailRecord(null)} 
              className="absolute top-6 right-6 p-2.5 bg-slate-100 text-slate-500 rounded-2xl hover:bg-rose-50 hover:text-rose-600 transition-all cursor-pointer"
            >
              <X size={18} />
            </button>

            <div className="flex justify-between items-start mb-6 border-b pb-4 pr-12">
              <div>
                <span className="text-[9px] font-black tracking-widest text-blue-600 bg-blue-50 px-2.5 py-1 rounded-lg uppercase border border-blue-100 font-mono">
                  {viewDetailRecord.id}
                </span>
                <h3 className="text-2xl font-black text-slate-900 mt-2">{viewDetailRecord.title}</h3>
                <p className="text-xs text-slate-500 font-bold">{viewDetailRecord.patientName} • {viewDetailRecord.age} ans ({viewDetailRecord.gender})</p>
              </div>
              <button
                onClick={() => handlePrint(viewDetailRecord)}
                className="bg-indigo-600 text-white px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider hover:bg-indigo-700 transition-colors flex items-center gap-2 shadow-lg shadow-indigo-600/20 cursor-pointer shrink-0"
              >
                <Printer size={14} /> Imprimer
              </button>
            </div>

            <div className="space-y-4 text-xs font-medium text-slate-700">
              <div className="grid grid-cols-2 gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-100 font-bold">
                <div>
                  <span className="text-slate-400 uppercase text-[9px] block font-black">Date & Heure</span>
                  <span className="text-slate-900">{viewDetailRecord.date} à {viewDetailRecord.time || '10:00'}</span>
                </div>
                <div>
                  <span className="text-slate-400 uppercase text-[9px] block font-black">Médecin Praticien</span>
                  <div className="flex items-center gap-2 mt-1">
                    <Avatar user={{ name: viewDetailRecord.doctor }} size={20} />
                    <span className="text-blue-600 font-extrabold">{viewDetailRecord.doctor}</span>
                  </div>
                </div>
              </div>

              {viewDetailRecord.itemType === 'SOIN' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                    <div>
                      <span className="text-slate-400 uppercase text-[9px] block font-black">Statut de Réalisation Infirmière</span>
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1 mt-1 rounded-full text-xs font-black uppercase tracking-wider ${
                        viewDetailRecord.status === 'FAIT'
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                          : 'bg-amber-100 text-amber-800 border border-amber-300'
                      }`}>
                        {viewDetailRecord.status === 'FAIT' ? (
                          <>
                            <CheckCircle2 size={14} className="text-emerald-600" />
                            Exécuté / Fait
                          </>
                        ) : (
                          <>
                            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                            En attente
                          </>
                        )}
                      </span>
                    </div>
                    {viewDetailRecord.priority && (
                      <div className="text-right">
                        <span className="text-slate-400 uppercase text-[9px] block font-black">Niveau de Priorité</span>
                        <span className={`px-2.5 py-1 rounded text-xs font-black uppercase mt-1 inline-block ${
                          viewDetailRecord.priority === 'CRITIQUE' ? 'bg-rose-100 text-rose-700 border border-rose-200' :
                          viewDetailRecord.priority === 'URGENT' ? 'bg-amber-100 text-amber-700 border border-amber-200' :
                          'bg-slate-100 text-slate-700 border border-slate-200'
                        }`}>
                          {viewDetailRecord.priority}
                        </span>
                      </div>
                    )}
                  </div>

                  {viewDetailRecord.instructions && (
                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                      <span className="text-slate-500 uppercase text-[9px] block font-black mb-1">Consignes du Médecin Prescripteur</span>
                      <p className="font-bold text-slate-800 text-sm">{viewDetailRecord.instructions}</p>
                    </div>
                  )}

                  {viewDetailRecord.status === 'FAIT' ? (
                    <div className="bg-emerald-50/90 p-5 rounded-2xl border border-emerald-200 space-y-2">
                      <span className="text-emerald-700 uppercase text-[9px] block font-black tracking-widest">
                        Rapport d'Exécution du Soin Infirmier
                      </span>
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs text-emerald-950 font-bold gap-2">
                        <span>✓ Exécuté par : <strong className="underline decoration-emerald-400">{viewDetailRecord.executedBy || 'Infirmier(ère)'}</strong></span>
                        <span className="font-mono text-emerald-800 bg-white/70 px-2 py-0.5 rounded border border-emerald-200 self-start sm:self-auto">
                          {viewDetailRecord.executionDate || viewDetailRecord.date} à {viewDetailRecord.executionTime || viewDetailRecord.time}
                        </span>
                      </div>
                      {viewDetailRecord.executionNotes && (
                        <div className="mt-2 pt-2 border-t border-emerald-200/60 text-xs text-emerald-900 font-medium">
                          <strong>Note clinique : </strong>
                          <span className="italic">« {viewDetailRecord.executionNotes} »</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="p-4 bg-amber-50 rounded-2xl border border-amber-200 text-amber-900 text-xs font-medium flex items-center gap-2">
                      <Clock size={16} className="text-amber-600 shrink-0" />
                      <span>Ce soin est actuellement en attente d'administration par l'équipe infirmière.</span>
                    </div>
                  )}
                </div>
              )}

              {viewDetailRecord.diagnosis && (
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                  <span className="text-blue-600 uppercase text-[9px] block font-black mb-1">Diagnostic Retenu</span>
                  <p className="font-extrabold text-slate-900 text-sm leading-relaxed">{viewDetailRecord.diagnosis}</p>
                </div>
              )}

              {viewDetailRecord.treatment && (
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                  <span className="text-emerald-600 uppercase text-[9px] block font-black mb-1">Traitements & Prescriptions</span>
                  <p className="font-bold text-slate-800 leading-relaxed">{viewDetailRecord.treatment}</p>
                  {viewDetailRecord.itemsList && viewDetailRecord.itemsList.length > 0 && (
                    <ul className="mt-2 divide-y divide-slate-200 border-t pt-2">
                      {viewDetailRecord.itemsList.map((it, idx) => (
                        <li key={idx} className="py-1 flex justify-between font-bold text-slate-800">
                          <span>• {it.name}</span>
                          <span className="text-slate-500 font-normal italic">{it.posology}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {viewDetailRecord.exams && (
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                  <span className="text-purple-600 uppercase text-[9px] block font-black mb-1">Examens de Laboratoire / Bilan</span>
                  <p className="font-bold text-slate-800 leading-relaxed">{viewDetailRecord.exams}</p>
                </div>
              )}

              {viewDetailRecord.observation && (
                <div className="bg-amber-50 p-4 rounded-2xl border border-amber-100 text-slate-800">
                  <span className="text-amber-700 uppercase text-[9px] block font-black mb-1">Observation & Transcriptions Cliniques</span>
                  <p className="whitespace-pre-wrap leading-relaxed italic">{viewDetailRecord.observation}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HistoryComponent;
