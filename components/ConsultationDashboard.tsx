
import React, { useMemo } from 'react';
import { Users, Clock, Calendar, Activity, TrendingUp, AlertCircle, CheckCircle, Lock, Zap } from 'lucide-react';
import StatCard from './StatCard';

interface ConsultationDashboardProps {
  theme: 'light' | 'dark';
  waitingQueue: any[];
  appointments: any[];
  hospitalizedCount?: number;
  paymentRequests?: any[];
  onNavigateMenu?: (menu: string) => void;
  onStartConsultation?: (patient: any) => void;
}

const ConsultationDashboard: React.FC<ConsultationDashboardProps> = ({ 
  theme, 
  waitingQueue = [], 
  appointments = [],
  hospitalizedCount = 0,
  paymentRequests = [],
  onNavigateMenu,
  onStartConsultation
}) => {
  const checkPatientIsPaid = (patient: any): boolean => {
    if (!patient) return false;
    const pStatus = (patient.paymentStatus || '').toUpperCase();
    if (['SOLDE', 'PAID', 'PAYE', 'PAYÉ', 'VALIDE', 'EXONERE', 'ASSURANCE', 'PEC', 'ADVANCE', 'PARTIAL', 'TIERS_PAYANT', 'PRIS_EN_CHARGE'].includes(pStatus)) {
      return true;
    }
    const tStatus = (patient.ticketStatut || '').toUpperCase();
    if (['PAYE', 'PAYÉ', 'VALIDE', 'SOLDE', 'OK'].includes(tStatus)) {
      return true;
    }
    if (patient.hospitalizedOrigin || patient.isExempt || patient.fee === 0 || patient.emergencyBypass) {
      return true;
    }
    const pid = patient.id || patient.patientId || patient.dmeId;
    const pName = `${patient.lastName || ''} ${patient.firstName || ''}`.trim().toLowerCase();

    if (paymentRequests && paymentRequests.length > 0) {
      const hasPaid = paymentRequests.some(pr => {
        const matchesPatient = (pid && (pr.patientId === pid || (pr as any).dmeId === pid)) ||
          (pName.length > 3 && pr.patientName && pr.patientName.toLowerCase().includes(pName));
        const isHandled = pr.status === 'PAID' || pr.status === 'VALIDATED' || ((pr.amountPaid || 0) >= (pr.totalAmount || 0) && (pr.totalAmount || 0) > 0) || (pr.amountPaid || 0) > 0;
        return matchesPatient && isHandled;
      });
      if (hasPaid) return true;
    }
    return false;
  };
  const validatedAppointments = useMemo(
    () => (appointments || []).filter(a => a.status === 'CHECKED_IN' || a.status === 'IN_PROGRESS' || a.status === 'COMPLETED' || Boolean(a.checkedInAt)),
    [appointments]
  );

  const stats = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const queueCount = waitingQueue.length;
    const todayApps = validatedAppointments.filter(a => a.date === today).length;
    const inProgressCount = waitingQueue.filter(q => q.status === 'in_consultation').length;

    return [
      {
        title: "Patients en Attente",
        value: queueCount.toString().padStart(2, '0'),
        change: queueCount > 5 ? "+2" : undefined,
        icon: Users,
        color: "bg-amber-500",
        subtext: "Salle d'attente",
        onClick: () => onNavigateMenu?.('WAITING_ROOM')
      },
      {
        title: "Hospitalisés",
        value: hospitalizedCount.toString().padStart(2, '0'),
        icon: Activity,
        color: "bg-blue-600",
        subtext: "Patients admis",
        onClick: () => onNavigateMenu?.('WAITING_ROOM')
      },
      {
        title: "Rendez-vous Jour",
        value: todayApps.toString().padStart(2, '0'),
        icon: Calendar,
        color: "bg-indigo-600",
        subtext: "Confirmés",
        onClick: () => onNavigateMenu?.('APPOINTMENTS')
      },
      {
        title: "En Consultation",
        value: inProgressCount.toString().padStart(2, '0'),
        icon: CheckCircle,
        color: "bg-emerald-600",
        subtext: "Aujourd'hui",
        onClick: () => onNavigateMenu?.('WAITING_ROOM')
      }
    ];
  }, [waitingQueue, appointments, hospitalizedCount, onNavigateMenu]);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div>
        <h2 className={`text-3xl font-extrabold ${theme === 'dark' ? 'text-white' : 'text-slate-900'} tracking-tight mb-2 font-heading italic uppercase`}>
          Tableau de Bord <span className="text-indigo-600">Consultation</span>
        </h2>
        <p className={`${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'} text-sm font-medium`}>
          Gestion de l'activité clinique et suivi des files d'attente.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, i) => (
          <StatCard key={i} {...stat} theme={theme} />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className={`p-8 rounded-[40px] border ${theme === 'dark' ? 'bg-[#0f172a] border-white/10' : 'bg-white border-slate-100 shadow-sm'}`}>
            <div className="flex justify-between items-center mb-6">
              <h3 className={`text-xl font-black ${theme === 'dark' ? 'text-white' : 'text-slate-950'} uppercase tracking-tight flex items-center gap-3`}>
                  <Clock className="text-amber-500" /> Prochains en attente
              </h3>
              <button onClick={() => onNavigateMenu?.('WAITING_ROOM')} className="text-[10px] font-black text-amber-500 uppercase hover:underline cursor-pointer">
                Voir tout
              </button>
            </div>
            <div className="space-y-4">
                {waitingQueue.slice(0, 5).map((q, i) => {
                    const isPaid = checkPatientIsPaid(q);
                    const isEmergency = q.priority === 'critique' || q.priority === 'urgent';
                    const isBlocked = !isPaid && !isEmergency;

                    return (
                    <div 
                      key={i} 
                      onClick={() => {
                        if (isBlocked) {
                          onNavigateMenu?.('WAITING_ROOM');
                        } else if (onStartConsultation) {
                          onStartConsultation(q);
                        } else {
                          onNavigateMenu?.('WAITING_ROOM');
                        }
                      }}
                      className={`flex items-center justify-between p-4 rounded-2xl transition-all cursor-pointer hover:scale-[1.01] ${
                        isBlocked 
                          ? (theme === 'dark' ? 'bg-white/5 opacity-70 border border-dashed border-amber-500/30' : 'bg-slate-50 opacity-80 border border-dashed border-amber-300')
                          : (theme === 'dark' ? 'bg-white/5 hover:bg-white/10' : 'bg-slate-50 hover:bg-amber-50/60')
                      }`}
                    >
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-500 font-bold">
                                {i + 1}
                            </div>
                            <div>
                                <div className="flex items-center gap-2">
                                  <p className={`font-bold ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>{q.lastName} {q.firstName}</p>
                                  {isBlocked && (
                                    <span className="text-[9px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded flex items-center gap-1 border border-amber-200">
                                      <Lock size={10} /> Caisse requise
                                    </span>
                                  )}
                                  {isEmergency && !isPaid && (
                                    <span className="text-[9px] font-bold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded flex items-center gap-1 border border-rose-200 animate-pulse">
                                      <Zap size={10} /> Urgence Bypass
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">{q.motifLabel || q.motif}</p>
                            </div>
                        </div>
                        <div className="text-right">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest ${
                                q.priority === 'critique' ? 'bg-rose-500 text-white' :
                                q.priority === 'urgent' ? 'bg-amber-500 text-white' :
                                'bg-emerald-500/10 text-emerald-500'
                            }`}>
                                {q.priority || 'Normal'}
                            </span>
                        </div>
                    </div>
                  );
                })}
                {waitingQueue.length === 0 && (
                    <p className="text-center py-10 text-slate-400 font-bold uppercase text-xs">Salle d'attente vide</p>
                )}
            </div>
        </div>

        <div className={`p-8 rounded-[40px] border ${theme === 'dark' ? 'bg-[#0f172a] border-white/10' : 'bg-white border-slate-100 shadow-sm'}`}>
            <div className="flex justify-between items-center mb-6">
              <h3 className={`text-xl font-black ${theme === 'dark' ? 'text-white' : 'text-slate-950'} uppercase tracking-tight flex items-center gap-3`}>
                  <Calendar className="text-blue-600" /> RDV du jour
              </h3>
              <button onClick={() => onNavigateMenu?.('APPOINTMENTS')} className="text-[10px] font-black text-blue-600 uppercase hover:underline cursor-pointer">
                Voir tout
              </button>
            </div>
            <div className="space-y-4">
                {validatedAppointments.filter(a => a.date === new Date().toISOString().split('T')[0]).slice(0, 5).map((a, i) => (
                    <div 
                      key={i} 
                      onClick={() => onNavigateMenu?.('APPOINTMENTS')}
                      className={`flex items-center justify-between p-4 rounded-2xl transition-all cursor-pointer hover:scale-[1.01] ${theme === 'dark' ? 'bg-white/5 hover:bg-white/10' : 'bg-slate-50 hover:bg-blue-50/60'}`}
                    >
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-full bg-blue-600/10 flex items-center justify-center text-blue-600">
                                <Clock size={18} />
                            </div>
                            <div>
                                <p className={`font-bold ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>{a.patient}</p>
                                <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">{a.time}</p>
                            </div>
                        </div>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest ${
                            (a.status === 'CHECKED_IN' || a.status === 'IN_PROGRESS') ? 'bg-emerald-500/10 text-emerald-500' : 'bg-slate-500/10 text-slate-500'
                        }`}>
                            {a.status === 'CHECKED_IN' ? 'Validé Accueil' : a.status}
                        </span>
                    </div>
                ))}
                {validatedAppointments.filter(a => a.date === new Date().toISOString().split('T')[0]).length === 0 && (
                    <p className="text-center py-10 text-slate-400 font-bold uppercase text-xs">Aucun rendez-vous validé</p>
                )}
            </div>
        </div>
      </div>

      {/* New Hospitalized Patients Section */}
      <div 
        onClick={() => onNavigateMenu?.('WAITING_ROOM')}
        className={`p-8 rounded-[40px] border transition-all cursor-pointer hover:scale-[1.005] ${theme === 'dark' ? 'bg-[#0f172a] border-white/10 hover:border-white/20' : 'bg-white border-slate-100 shadow-sm hover:border-blue-200'}`}
      >
        <h3 className={`text-xl font-black ${theme === 'dark' ? 'text-white' : 'text-slate-950'} mb-6 uppercase tracking-tight flex items-center gap-3`}>
            <Activity className="text-rose-500" /> Patients Hospitalisés en cours
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* We'll need to pass hospitalizedQueue to Dashboard if we want to show details, 
               but for now we can show a summary or count. 
               Actually, let's just keep the count in stats and maybe add a small list if we had the data.
            */}
            {hospitalizedCount > 0 ? (
                <div className="col-span-full">
                    <p className={`${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'} font-medium`}>
                        Il y a actuellement <span className="font-bold text-blue-600">{hospitalizedCount}</span> patients hospitalisés nécessitant un suivi.
                    </p>
                </div>
            ) : (
                <p className="col-span-full text-center py-10 text-slate-400 font-bold uppercase text-xs italic">Aucun patient hospitalisé</p>
            )}
        </div>
      </div>
    </div>
  );
};

export default ConsultationDashboard;
