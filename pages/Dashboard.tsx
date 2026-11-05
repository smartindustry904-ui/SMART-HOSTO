
import React, { useState, useEffect, useMemo } from 'react';
import { 
  TrendingUp, 
  Users, 
  UserPlus,
  Stethoscope,
  AlertCircle, 
  CheckCircle, 
  ArrowUpRight, 
  Activity,
  CreditCard,
  BedDouble,
  Clock,
  ArrowRight,
  ShieldAlert,
  Microscope,
  Pill
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { useSettings } from '../hooks/useSettings';
import { db } from '../src/firebase';
import { collection, query, onSnapshot, where, orderBy, limit, Timestamp } from 'firebase/firestore';
import StatCard from '../components/StatCard';

const Dashboard = ({ theme }: { theme: 'light' | 'dark' }) => {
  const { establishment } = useSettings();
  const [timeRange, setTimeRange] = useState<'day' | 'week' | 'month'>('day');
  const [patients, setPatients] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [beds, setBeds] = useState<any[]>([]);
  const [queues, setQueues] = useState<any[]>([]);
  const [inpatientRecords, setInpatientRecords] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [meds, setMeds] = useState<any[]>([]);

  // 1. Fetch real data
  useEffect(() => {
    // Patients of the day (from service_queues or reception_visits)
    const today = new Date().toISOString().split('T')[0];
    const qQueues = query(collection(db, 'service_queues'));
    const unsubQueues = onSnapshot(qQueues, (snap) => {
      setQueues(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // Transactions for revenue
    const qTrans = query(collection(db, 'cashier_transactions'), orderBy('date', 'desc'), limit(100));
    const unsubTrans = onSnapshot(qTrans, (snap) => {
      setTransactions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // Beds for occupancy
    const unsubBeds = onSnapshot(collection(db, 'beds'), (snap) => {
      setBeds(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // Recent activity (audit logs or specific events)
    const qAudit = query(collection(db, 'audit_logs'), orderBy('timestamp', 'desc'), limit(5));
    const unsubAudit = onSnapshot(qAudit, (snap) => {
      setAuditLogs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // Stock meds for stock alert
    const unsubMeds = onSnapshot(collection(db, 'pharmacy_inventory'), (snap) => {
      setMeds(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // Inpatient records for real admissions count
    const unsubInpatients = onSnapshot(collection(db, 'inpatient_records'), (snap) => {
      setInpatientRecords(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => {
      unsubQueues();
      unsubTrans();
      unsubBeds();
      unsubAudit();
      unsubMeds();
      unsubInpatients();
    };
  }, []);

  // 2. Compute stats based on timeRange
  const filteredData = useMemo(() => {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    
    let startDate = new Date();
    if (timeRange === 'day') {
      startDate.setHours(0, 0, 0, 0);
    } else if (timeRange === 'week') {
      startDate.setDate(now.getDate() - 7);
    } else if (timeRange === 'month') {
      startDate.setDate(now.getDate() - 30);
    }

    const filteredQueues = queues.filter(q => {
      if (!q.date) return false;
      if (timeRange === 'day') return q.date === todayStr;
      const qDate = new Date(q.date);
      return qDate >= startDate;
    });

    const filteredTransactions = transactions.filter(t => {
      if (!t.date) return false;
      const tDate = new Date(t.date);
      return tDate >= startDate;
    });

    return { queues: filteredQueues, transactions: filteredTransactions };
  }, [queues, transactions, timeRange]);

  const patientsCount = useMemo(() => {
    // Only count patients strictly in the waiting room (decrement when called by doctor)
    return filteredData.queues.filter(q => q.status === 'waiting').length;
  }, [filteredData]);

  const admissionsCount = useMemo(() => {
    // Count currently admitted patients
    return inpatientRecords.filter(r => r.status === 'admitted').length;
  }, [inpatientRecords]);

  const emergencyCount = useMemo(() => {
    // Only count urgent cases strictly in waiting room
    return filteredData.queues.filter(q => (q.service === 'Urgences' || q.queueName === 'Urgences') && q.status === 'waiting').length;
  }, [filteredData]);

  const occupancyRate = useMemo(() => {
    if (beds.length === 0) return 0;
    const occupied = beds.filter(b => b.status === 'OCCUPIED' || b.occupied).length;
    return Math.round((occupied / beds.length) * 100);
  }, [beds]);

  const totalRevenue = useMemo(() => {
    return filteredData.transactions
      .reduce((sum, t) => sum + (t.totalAmount || t.amount || 0), 0);
  }, [filteredData]);

    const lowStockMeds = useMemo(() => {
    return meds.filter(m => m.stock < 10);
  }, [meds]);

  const receptionTodayCount = useMemo(() => {
    return filteredData.queues.length;
  }, [filteredData]);

  const triageWaitingCount = useMemo(() => {
    return filteredData.queues.filter(q => q.status === 'waiting_triage').length;
  }, [filteredData]);

  // 3. Prepare Chart Data (Last 7 points based on timeRange)
  const chartData = useMemo(() => {
    const days = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
    const result = [];
    
    // Determine step size and count for chart
    let count = 7;
    let stepDays = 1;

    if (timeRange === 'month') {
      count = 4; // 4 weeks
      stepDays = 7;
    }

    for (let i = count - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - (i * stepDays));
      const dateStr = d.toISOString().split('T')[0];
      const dayName = timeRange === 'month' ? `Sem ${count - i}` : days[d.getDay()];

      const periodPatients = queues.filter(q => {
        const qd = new Date(q.date);
        if (stepDays === 1) return q.date === dateStr;
        const start = new Date(d);
        start.setHours(0,0,0,0);
        const end = new Date(d);
        end.setDate(end.getDate() + stepDays);
        return qd >= start && qd < end;
      }).length;

      const periodRev = transactions
        .filter(t => {
          const td = new Date(t.date);
          if (stepDays === 1) return t.date === dateStr;
          const start = new Date(d);
          start.setHours(0,0,0,0);
          const end = new Date(d);
          end.setDate(end.getDate() + stepDays);
          return td >= start && td < end;
        })
        .reduce((sum, t) => sum + (t.totalAmount || t.amount || 0), 0);

      result.push({
        name: dayName,
        patients: periodPatients,
        rev: periodRev,
        fullDate: dateStr
      });
    }
    return result;
  }, [queues, transactions, timeRange]);

  return (
    <div className={`p-8 max-w-[1600px] mx-auto animate-in fade-in duration-500 ${theme === 'dark' ? 'text-white' : ''}`}>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-10">
        <div>
          <h1 className={`text-5xl font-extrabold ${theme === 'dark' ? 'text-white' : 'text-slate-950'} tracking-tight mb-3 font-heading italic uppercase`}>Tableau de Bord <span className="text-blue-600">Pilotage</span></h1>
          <p className={`${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'} font-medium text-base flex items-center gap-2`}>
            <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
            Flux en temps réel de l'activité clinique et financière.
          </p>
        </div>
        <div className={`${theme === 'dark' ? 'bg-white/5 border-white/10' : 'bg-white border-slate-200'} p-1.5 rounded-2xl flex gap-1 shadow-sm`}>
          <button 
            onClick={() => setTimeRange('day')}
            className={`px-5 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${timeRange === 'day' ? (theme === 'dark' ? 'bg-white text-slate-950' : 'bg-slate-950 text-white shadow-md') : (theme === 'dark' ? 'text-slate-500 hover:text-white' : 'text-slate-400 hover:text-slate-900 hover:bg-slate-50')}`}
          >
            Aujourd'hui
          </button>
          <button 
            onClick={() => setTimeRange('week')}
            className={`px-5 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${timeRange === 'week' ? (theme === 'dark' ? 'bg-white text-slate-950' : 'bg-slate-950 text-white shadow-md') : (theme === 'dark' ? 'text-slate-500 hover:text-white' : 'text-slate-400 hover:text-slate-900 hover:bg-slate-50')}`}
          >
            Semaine
          </button>
          <button 
            onClick={() => setTimeRange('month')}
            className={`px-5 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${timeRange === 'month' ? (theme === 'dark' ? 'bg-white text-slate-950' : 'bg-slate-950 text-white shadow-md') : (theme === 'dark' ? 'text-slate-500 hover:text-white' : 'text-slate-400 hover:text-slate-900 hover:bg-slate-50')}`}
          >
            Mois
          </button>
        </div>
      </div>

      {/* Quick Modules Navigation Bar */}
      <div className={`p-4 rounded-3xl mb-8 flex flex-wrap items-center justify-between gap-3 border ${
        theme === 'dark' ? 'bg-white/5 border-white/10' : 'bg-white border-slate-200/80 shadow-sm'
      }`}>
        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 pl-2">
          Accès Rapide aux Services :
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('change-module', { detail: 'RECEPTION' }))}
            className="px-4 py-2.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 rounded-2xl font-black text-xs uppercase tracking-wider flex items-center gap-2 transition-all hover:scale-[1.02]"
          >
            <UserPlus size={15} />
            Accueil & Triage
          </button>

          <button
            onClick={() => window.dispatchEvent(new CustomEvent('change-module', { detail: 'DOCTOR' }))}
            className="px-4 py-2.5 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 rounded-2xl font-black text-xs uppercase tracking-wider flex items-center gap-2 transition-all hover:scale-[1.02]"
          >
            <Stethoscope size={15} />
            Consultation
          </button>

          <button
            onClick={() => window.dispatchEvent(new CustomEvent('change-module', { detail: 'URGENCE' }))}
            className="px-4 py-2.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 rounded-2xl font-black text-xs uppercase tracking-wider flex items-center gap-2 transition-all hover:scale-[1.02]"
          >
            <ShieldAlert size={15} />
            Urgences
          </button>

          <button
            onClick={() => window.dispatchEvent(new CustomEvent('change-module', { detail: 'CASHIER' }))}
            className="px-4 py-2.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-2xl font-black text-xs uppercase tracking-wider flex items-center gap-2 transition-all hover:scale-[1.02]"
          >
            <CreditCard size={15} />
            Caisse
          </button>

          <button
            onClick={() => window.dispatchEvent(new CustomEvent('change-module', { detail: 'PHARMACY' }))}
            className="px-4 py-2.5 bg-teal-500/10 hover:bg-teal-500/20 text-teal-600 dark:text-teal-400 rounded-2xl font-black text-xs uppercase tracking-wider flex items-center gap-2 transition-all hover:scale-[1.02]"
          >
            <Pill size={15} />
            Pharmacie
          </button>

          <button
            onClick={() => window.dispatchEvent(new CustomEvent('change-module', { detail: 'LAB' }))}
            className="px-4 py-2.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 rounded-2xl font-black text-xs uppercase tracking-wider flex items-center gap-2 transition-all hover:scale-[1.02]"
          >
            <Microscope size={15} />
            Laboratoire
          </button>

          <button
            onClick={() => window.dispatchEvent(new CustomEvent('change-module', { detail: 'HOSPITALISATION' }))}
            className="px-4 py-2.5 bg-purple-500/10 hover:bg-purple-500/20 text-purple-600 dark:text-purple-400 rounded-2xl font-black text-xs uppercase tracking-wider flex items-center gap-2 transition-all hover:scale-[1.02]"
          >
            <BedDouble size={15} />
            Hospitalisation & Lits
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-10">
        <StatCard 
          title="Accueil & Triage" 
          value={receptionTodayCount.toString().padStart(2, '0')} 
          icon={UserPlus} 
          color="bg-sky-600" 
          subtext={triageWaitingCount > 0 ? `${triageWaitingCount} en attente triage` : "Flux Admissions"}
          theme={theme}
          onClick={() => window.dispatchEvent(new CustomEvent('change-module', { detail: 'RECEPTION' }))}
        />
        <StatCard 
          title="Patients En Attente" 
          value={patientsCount.toString().padStart(2, '0')} 
          icon={Users} 
          color="bg-blue-600" 
          subtext="Salle de consultation"
          theme={theme}
          onClick={() => window.dispatchEvent(new CustomEvent('change-module', { detail: 'DOCTOR' }))}
        />
        <StatCard 
          title="Admissions (Hosp.)" 
          value={admissionsCount.toString().padStart(2, '0')} 
          icon={BedDouble} 
          color="bg-indigo-600" 
          subtext="Patients hospitalisés"
          theme={theme}
          onClick={() => window.dispatchEvent(new CustomEvent('change-module', { detail: 'HOSPITALISATION' }))}
        />
        <StatCard 
          title="Urgences" 
          value={emergencyCount.toString().padStart(2, '0')} 
          icon={AlertCircle} 
          color="bg-rose-600" 
          subtext="Cas critiques"
          theme={theme}
          onClick={() => window.dispatchEvent(new CustomEvent('change-module', { detail: 'URGENCE' }))}
        />
        <StatCard 
          title="Recettes" 
          value={(totalRevenue || 0).toLocaleString()} 
          change="+12%" 
          icon={CreditCard} 
          color="bg-emerald-600" 
          subtext={establishment.currency}
          theme={theme}
          onClick={() => window.dispatchEvent(new CustomEvent('change-module', { detail: 'CASHIER' }))}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Performance Chart */}
        <div className={`lg:col-span-8 ${theme === 'dark' ? 'bg-[#0f172a] border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.3)]' : 'bg-white border-slate-100 shadow-sm'} p-10 rounded-[40px] border flex flex-col`}>
          <div className="flex justify-between items-center mb-10">
            <div>
              <h2 className={`text-2xl font-extrabold ${theme === 'dark' ? 'text-white' : 'text-slate-950'} uppercase tracking-tight font-heading`}>Fréquentation Patient</h2>
              <p className="text-slate-400 text-xs font-bold mt-1 uppercase tracking-widest">Analyse sur la période: {timeRange}</p>
            </div>
            <div className={`flex gap-6 text-[10px] font-black uppercase tracking-widest ${theme === 'dark' ? 'text-white' : 'text-slate-950'}`}>
              <span className="flex items-center gap-2 text-blue-600">
                <div className="w-3 h-3 bg-blue-600 rounded-full"></div> Admissions
              </span>
            </div>
          </div>
          <div className="h-[400px] mt-auto">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis 
                  dataKey="name" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{fill: '#94a3b8', fontSize: 10, fontWeight: 900}} 
                  dy={15} 
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{fill: '#94a3b8', fontSize: 10, fontWeight: 900}} 
                />
                <Tooltip 
                  cursor={{fill: '#f8fafc'}}
                  contentStyle={{borderRadius: '24px', border: 'none', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)', padding: '16px'}}
                  itemStyle={{fontSize: '12px', fontWeight: 'bold'}}
                  labelStyle={{fontSize: '10px', color: '#94a3b8', marginBottom: '8px', fontWeight: 'bold', textTransform: 'uppercase'}}
                />
                <Bar dataKey="patients" radius={[8, 8, 8, 8]} barSize={40}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={index === chartData.length - 1 ? '#2563eb' : '#94a3b8'} fillOpacity={index === chartData.length - 1 ? 1 : 0.2} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Right Sidebar */}
        <div className="lg:col-span-4 space-y-8">
          {/* Recent Transactions Table */}
          <div className={`${theme === 'dark' ? 'bg-[#0f172a] border-white/10 shadow-sm' : 'bg-white border-slate-100 shadow-sm'} p-8 rounded-[40px] border`}>
            <div className="flex justify-between items-center mb-8">
              <h2 className={`text-xl font-black ${theme === 'dark' ? 'text-white' : 'text-slate-950'} uppercase tracking-tight`}>Flux Financier</h2>
              <button 
                onClick={() => {
                  // This is a bit tricky as Dashboard is a separate module. 
                  // If we want to navigate to Cashier/Daily, we need a way to trigger that.
                  // For now, let's just make it a visual placeholder or use a custom event if App.tsx supports it.
                  window.dispatchEvent(new CustomEvent('change-module', { detail: 'CASHIER' }));
                }}
                className="text-[10px] font-black text-blue-600 uppercase hover:underline"
              >
                Tout voir
              </button>
            </div>
            <div className="space-y-4">
              {transactions.slice(0, 5).map((tx, i) => (
                <div 
                  key={i} 
                  onClick={() => window.dispatchEvent(new CustomEvent('change-module', { detail: 'CASHIER' }))}
                  className="flex justify-between items-center p-4 rounded-2xl hover:bg-slate-100/80 transition-all cursor-pointer group border border-transparent hover:border-slate-200 hover:scale-[1.01] active:scale-[0.99]"
                >
                  <div className="flex gap-3 items-center">
                    <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                      <CreditCard size={18} />
                    </div>
                    <div>
                      <p className="text-sm font-black text-slate-900 truncate max-w-[120px]">{tx.patientName || 'Patient'}</p>
                      <p className="text-[10px] text-slate-400 font-bold">{new Date(tx.date).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-black text-emerald-600">+{(tx.amount || tx.totalAmount || 0).toLocaleString()} F</p>
                    <p className="text-[10px] text-slate-400 font-bold uppercase">{tx.paymentMethod || 'CASH'}</p>
                  </div>
                </div>
              ))}
              {transactions.length === 0 && (
                <p className="text-center py-10 text-slate-400 text-xs font-bold uppercase italic opacity-50">Aucune transaction</p>
              )}
            </div>
            <button 
              onClick={() => window.dispatchEvent(new CustomEvent('change-module', { detail: 'CASHIER' }))}
              className={`w-full mt-8 py-4 text-[10px] font-black uppercase tracking-widest ${theme === 'dark' ? 'text-blue-400 border-white/5 hover:bg-white/5' : 'text-blue-600 border-blue-50 hover:bg-blue-50'} border rounded-2xl transition-all flex items-center justify-center gap-2 group cursor-pointer`}
            >
              Détails Transactions <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
            </button>
          </div>

          {/* Stock Alert */}
          <div 
            onClick={() => window.dispatchEvent(new CustomEvent('change-module', { detail: 'PHARMACY' }))}
            className="bg-slate-950 p-8 rounded-[40px] text-white shadow-2xl shadow-slate-900/20 relative overflow-hidden group cursor-pointer hover:scale-[1.01] transition-transform"
          >
            <div className="absolute -right-10 -top-10 w-40 h-40 bg-blue-500/10 rounded-full blur-3xl group-hover:bg-blue-500/20 transition-all"></div>
            <div className="flex justify-between items-start mb-8 relative z-10">
              <div className="p-3 bg-white/10 rounded-2xl text-cyan-400">
                <Activity size={24} />
              </div>
              <span className="bg-rose-500 text-white px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest animate-pulse">Alerte Stock</span>
            </div>
            <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest mb-1">Ruptures imminentes</p>
            <h4 className="text-2xl font-black mb-6 leading-tight">{lowStockMeds.length > 0 ? `${lowStockMeds.length} Médicaments en alerte` : 'Stock Optimal'}</h4>
            <div className="w-full bg-white/10 h-1.5 rounded-full overflow-hidden mb-6">
              <div className="bg-cyan-400 h-full transition-all duration-1000" style={{ width: lowStockMeds.length > 0 ? '75%' : '0%' }}></div>
            </div>
            <button className="w-full bg-white text-slate-950 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-cyan-50 transition-all cursor-pointer">Gérer l'inventaire</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
