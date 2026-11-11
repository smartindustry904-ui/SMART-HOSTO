import React, { useState, useEffect, useMemo } from 'react';
import { 
  Bell, UserPlus, Clock, Calendar, CheckCircle2, 
  AlertCircle, Building2, User, Search 
} from 'lucide-react';
import { db } from '../../src/firebase';
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import { Bed, Room } from '../../types';
import { getActiveTenantId, belongsToTenant } from '../../src/utils/tenant';

interface AdmissionRequestsTabProps {
  onAssignBed: (request: any) => void;
  availableBedsCount: number;
  user?: any;
  establishment?: any;
}

export const AdmissionRequestsTab: React.FC<AdmissionRequestsTabProps> = ({
  onAssignBed,
  availableBedsCount,
  user,
  establishment
}) => {
  const activeTenantId = useMemo(() => getActiveTenantId(user, establishment), [user, establishment]);
  const [requests, setRequests] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    setIsLoading(true);
    const q = query(
      collection(db, 'hospitalisation_requests'),
      where('status', '==', 'pending')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs
        .filter(d => belongsToTenant(d.data(), activeTenantId))
        .map(d => ({ id: d.id, ...d.data() } as any));
      list.sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
      setRequests(list);
      setIsLoading(false);
    }, (err) => {
      console.error("Error listening to hospitalization requests:", err);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [activeTenantId]);

  const filteredRequests = requests.filter(r => {
    const term = searchTerm.toLowerCase().trim();
    if (!term) return true;
    const name = (r.patientName || '').toLowerCase();
    const id = (r.patientId || '').toLowerCase();
    const srv = (r.service || '').toLowerCase();
    return name.includes(term) || id.includes(term) || srv.includes(term);
  });

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-3 duration-300">
      
      {/* Top Banner */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500 text-white flex items-center justify-center shadow-md shadow-amber-500/20">
              <Bell size={20} />
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-900 tracking-tight">
                Demandes d'Hospitalisation en Attente
              </h2>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-0.5">
                Patients orientés vers l'hospitalisation depuis la Consultation, les Urgences ou la Maternité
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className={`px-4 py-2 rounded-2xl text-xs font-black uppercase tracking-wider ${
            availableBedsCount > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
          }`}>
            {availableBedsCount} Lit{availableBedsCount > 1 ? 's' : ''} libre{availableBedsCount > 1 ? 's' : ''} disponible{availableBedsCount > 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Search Input */}
      {requests.length > 0 && (
        <div className="relative max-w-md">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Filtrer par nom ou service..."
            className="w-full pl-11 pr-4 py-2.5 bg-white border border-slate-200 rounded-2xl font-bold text-xs text-slate-800 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          />
        </div>
      )}

      {/* Requests Table / Cards */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        {filteredRequests.length === 0 ? (
          <div className="py-20 text-center text-slate-400">
            <Bell size={40} className="mx-auto text-slate-300 mb-3" />
            <p className="font-bold text-slate-600">Aucune demande d'admission en attente</p>
            <p className="text-xs text-slate-400 mt-1">
              Les demandes créées depuis la Consultation ou les Urgences apparaîtront automatiquement ici.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-100 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                <tr>
                  <th className="py-4 px-6">Patient</th>
                  <th className="py-4 px-6">Service demandeur</th>
                  <th className="py-4 px-6">Motif / Diagnostic</th>
                  <th className="py-4 px-6 text-center">Priorité</th>
                  <th className="py-4 px-6">Date de la demande</th>
                  <th className="py-4 px-6 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-bold">
                {filteredRequests.map((req) => (
                  <tr key={req.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-5 px-6">
                      <p className="font-black text-slate-900 text-sm">{req.patientName || 'Patient'}</p>
                      <p className="text-[10px] text-slate-400 font-mono tracking-tight uppercase">
                        N° {req.patientId || req.id}
                      </p>
                    </td>

                    <td className="py-5 px-6 text-slate-700">
                      <span className="px-2.5 py-1 bg-slate-100 rounded-lg text-slate-800">
                        {req.service || req.sourceService || 'Consultation'}
                      </span>
                      {req.doctorName && (
                        <p className="text-[10px] text-slate-400 font-medium mt-1">Dr. {req.doctorName}</p>
                      )}
                    </td>

                    <td className="py-5 px-6 text-slate-600 max-w-xs">
                      <p className="line-clamp-2 italic">{req.motif || req.reason || 'Hospitalisation demandée'}</p>
                    </td>

                    <td className="py-5 px-6 text-center">
                      <span className={`px-2.5 py-1 rounded-xl text-[10px] font-black uppercase ${
                        req.priority === 'Critique' ? 'bg-rose-100 text-rose-700' :
                        req.priority === 'Urgent' ? 'bg-amber-100 text-amber-700' :
                        'bg-emerald-100 text-emerald-700'
                      }`}>
                        {req.priority || 'Normal'}
                      </span>
                    </td>

                    <td className="py-5 px-6 text-slate-500 font-mono">
                      {req.createdAt ? new Date(req.createdAt).toLocaleDateString('fr-FR', {
                        day: '2-digit', month: '2-digit', year: 'numeric',
                        hour: '2-digit', minute: '2-digit'
                      }) : 'N/A'}
                    </td>

                    <td className="py-5 px-6 text-right">
                      <button
                        onClick={() => onAssignBed(req)}
                        disabled={availableBedsCount === 0}
                        className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-black text-xs uppercase tracking-wider transition-all shadow-xs cursor-pointer"
                      >
                        <UserPlus size={14} />
                        <span>Assigner un Lit</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
};
