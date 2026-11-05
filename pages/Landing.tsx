
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Phone, 
  ChevronRight, 
  Activity, 
  Calendar, 
  User, 
  Lock,
  AlertCircle,
  ArrowRight,
  Zap,
  Sun
} from 'lucide-react';
import { Role, User as UserType } from '../types';
import { auth, db, sanitizeData } from '../src/firebase';
import { signInAnonymously } from 'firebase/auth';
import { collection, getDocs, doc, setDoc, getDoc } from 'firebase/firestore';
import { ShieldCheck, HelpCircle } from 'lucide-react';

interface LandingProps {
  onLogin: (user: UserType) => void;
  theme: 'light' | 'dark';
  toggleTheme: () => void;
}

const Landing: React.FC<LandingProps> = ({ onLogin, theme, toggleTheme }) => {
  const [showLogin, setShowLogin] = useState(false);
  const [lang, setLang] = useState<'FR' | 'EN'>('FR');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const t = {
    FR: {
      heroDesc: "Le cockpit intégré pour les professionnels de santé en Afrique. Une gestion hospitalière réinventée, fluide et sécurisée.",
      navAbout: "Plateforme",
      navServices: "Sécurité",
      navModules: "Interopérabilité",
      connexion: "Accès Portail",
      loginTitle: "Accès Personnel",
      loginSub: "IDENTIFICATION PROFESSIONNELLE SÉCURISÉE",
      placeholderUser: "Identifiant métier",
      placeholderPass: "Mot de passe",
      errorAuth: "Identifiants incorrects.",
      footerDesc: "Excellence opérationnelle pour la santé en Afrique.",
    },
    EN: {
      heroDesc: "The integrated cockpit for healthcare professionals in Africa. Hospital management reimagined—fluid and secure.",
      navAbout: "Platform",
      navServices: "Security",
      navModules: "Interoperability",
      connexion: "Portal Access",
      loginTitle: "Personnel Access",
      loginSub: "SECURE PROFESSIONAL IDENTIFICATION",
      placeholderUser: "Professional ID",
      placeholderPass: "Password",
      errorAuth: "Invalid credentials.",
      footerDesc: "Operational excellence for African healthcare.",
    }
  };

  const [showForgotModal, setShowForgotModal] = useState(false);
  const content = t[lang];

  // Auto-seed SA1 Super Admin account into Firestore on mount if not exists
  useEffect(() => {
    const seedSA1User = async () => {
      try {
        const sa1Ref = doc(db, 'hospital_users', 'sa1_superadmin');
        const sa1Snap = await getDoc(sa1Ref);
        if (!sa1Snap.exists()) {
          const sa1Doc = {
            id: 'sa1_superadmin',
            username: 'SA1',
            email: 'sa1@smarthosto.com',
            name: 'Super Administrateur SA1',
            role: Role.SUPER_ADMIN,
            roles: ['role_super_admin', 'role_admin'],
            status: 'ACTIVE',
            password: 'SA1-9xK8#mP2',
            profession: 'Super Administrateur SaaS',
            token: 'sa1_token',
            createdAt: new Date().toISOString()
          };
          await setDoc(sa1Ref, sanitizeData(sa1Doc), { merge: true });
        }
      } catch (err) {
        console.warn("Auto-seed SA1 super admin document notice:", err);
      }
    };
    seedSA1User();
  }, []);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    setTimeout(async () => {
      try {
        await signInAnonymously(auth);
        
        let firestoreUsers: UserType[] = [];
        try {
          const snap = await getDocs(collection(db, 'hospital_users'));
          firestoreUsers = snap.docs.map(d => ({ id: d.id, ...d.data() } as UserType));
        } catch (e) {
          console.warn("Could not query Firestore hospital_users directly:", e);
        }

        const cleanInputUser = (username || '').trim().toLowerCase();
        let user: (UserType & { isLicenseExpired?: boolean; clinicStatus?: string; licenseEnd?: string }) | undefined = firestoreUsers.find(
          u => ((u.username || '').toLowerCase() === cleanInputUser || (u.email || '').toLowerCase() === cleanInputUser) &&
               (u.password === password || (!u.password && (password === 'admin123' || password === 'SA1-9xK8#mP2')))
        );

        // Fallback for bootstrap master accounts if not yet saved in Firestore
        if (!user) {
          if (cleanInputUser === 'sa1' || cleanInputUser === 'sa1@smarthosto.com') {
            if (password === 'SA1-9xK8#mP2' || password === 'admin123' || password === 'superadmin' || password === 'password') {
              user = {
                id: 'sa1_superadmin',
                username: 'SA1',
                email: 'sa1@smarthosto.com',
                name: 'Super Administrateur SA1',
                role: Role.SUPER_ADMIN,
                roles: ['role_super_admin', 'role_admin'],
                status: 'ACTIVE',
                password: 'SA1-9xK8#mP2',
                profession: 'Super Administrateur SaaS',
                token: 'sa1_token',
                createdAt: new Date().toISOString()
              };
              try {
                await setDoc(doc(db, 'hospital_users', user.id), sanitizeData(user), { merge: true });
              } catch {}
            }
          } else if (cleanInputUser === 'superadmin' && (password === 'admin123' || password === 'superadmin' || password === 'password')) {
            user = {
              id: 'super_admin_id',
              username: 'superadmin',
              email: 'publisher@smarthosto.com',
              name: 'Éditeur SmartHosto',
              role: Role.SUPER_ADMIN,
              roles: ['role_super_admin', 'role_admin'],
              status: 'ACTIVE',
              password: 'admin123',
              profession: 'Super Administrateur SaaS',
              token: 'super_fake',
              createdAt: new Date().toISOString()
            };
            try {
              await setDoc(doc(db, 'hospital_users', user.id), sanitizeData(user), { merge: true });
            } catch {}
          } else if (cleanInputUser === 'admin' && (password === 'admin123' || password === 'admin' || password === 'password')) {
            user = {
              id: '1',
              username: 'admin',
              email: 'admin@smarthosto.com',
              name: 'Administrateur',
              role: Role.ADMIN,
              roles: ['role_admin'],
              status: 'ACTIVE',
              password: 'admin123',
              profession: 'Admin SYSTEM',
              token: 'fake',
              createdAt: new Date().toISOString()
            };
            try {
              await setDoc(doc(db, 'hospital_users', user.id), sanitizeData(user), { merge: true });
            } catch {}
          }
        }

        if (user) {
          // Verify account status
          if (user.status === 'BLOCKED' || user.status === 'INACTIVE' || (user.status as string) === 'SUSPENDED') {
            setError('Ce compte est désactivé ou suspendu. Veuillez contacter votre administration.');
            setLoading(false);
            return;
          }

          // Verify tenant structure license status if tied to a clinic
          const userWithClinic = user as any;
          if (userWithClinic.clinicId && user.role !== Role.SUPER_ADMIN) {
            try {
              const clinicsSnap = await getDocs(collection(db, 'saas_clinics'));
              const clinicDoc = clinicsSnap.docs.find(d => d.id === userWithClinic.clinicId);
              if (clinicDoc) {
                const clinicData = clinicDoc.data();
                const nowTime = new Date().getTime();
                const isLicenseExpired = clinicData.status === 'EXPIRED' || (clinicData.licenseEnd && new Date(clinicData.licenseEnd).getTime() < nowTime);
                if (isLicenseExpired || clinicData.status === 'SUSPENDED') {
                  user = {
                    ...user,
                    isLicenseExpired: true,
                    clinicStatus: clinicData.status,
                    licenseEnd: clinicData.licenseEnd
                  };
                }
              }
            } catch (err) {
              console.warn("Could not check clinic license status:", err);
            }
          }

          const authenticatedUser = { ...user, lastLogin: new Date().toISOString() };
          localStorage.setItem('hospital_session', JSON.stringify(authenticatedUser));
          onLogin(authenticatedUser);
        } else {
          setError('Identifiant ou mot de passe incorrect.');
        }
      } catch (err) {
        console.error('Firebase Auth Error:', err);
        setError('Erreur de connexion au serveur.');
      } finally {
        setLoading(false);
      }
    }, 600);
  };

  return (
    <div className={`h-screen max-h-screen ${theme === 'dark' ? 'bg-[#000000] text-zinc-200' : 'bg-[#F0F5F9] text-slate-900'} selection:bg-emerald-500/30 overflow-hidden font-sans relative flex flex-col transition-colors duration-300`}>
      {/* Immersive Background System */}
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
        {/* Background Image Layer */}
        <div className="absolute inset-0 z-0">
          <img 
            src="https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?q=80&w=2000&auto=format&fit=crop" 
            alt="Medical Facility Background"
            className={`w-full h-full object-cover mix-blend-overlay scale-105 transition-opacity duration-1000 ${theme === 'dark' ? 'opacity-30' : 'opacity-10'}`}
            referrerPolicy="no-referrer"
          />
          <div className={`absolute inset-0 bg-gradient-to-b ${theme === 'dark' ? 'from-[#000000] via-[#000000]/40 to-[#000000]' : 'from-slate-100/80 via-white/40 to-slate-100/80'}`}></div>
        </div>

        <div className={`absolute top-[-10%] left-[-10%] w-[50%] h-[50%] ${theme === 'dark' ? 'bg-emerald-950/20' : 'bg-emerald-200/20'} rounded-full blur-[140px] animate-pulse`}></div>
        <div className={`absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] ${theme === 'dark' ? 'bg-amber-950/10' : 'bg-amber-200/10'} rounded-full blur-[160px]`}></div>
        <div className={`absolute top-[20%] right-[10%] w-[40%] h-[40%] ${theme === 'dark' ? 'bg-blue-950/20' : 'bg-indigo-200/15'} rounded-full blur-[120px]`}></div>
      </div>

      {/* Navigation */}
      <nav className={`relative z-50 flex items-center justify-between px-10 py-6 border-b backdrop-blur-md transition-colors ${theme === 'dark' ? 'border-zinc-800/80 bg-black/70' : 'border-slate-200 bg-white/40'}`}>
        <div className="flex items-center gap-12">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-emerald-400 to-emerald-700 rounded-xl flex items-center justify-center rotate-3 shadow-lg shadow-emerald-500/20">
              <Activity className="text-white" size={22} />
            </div>
            <span className={`text-xl font-black tracking-tighter uppercase italic ${theme === 'dark' ? 'text-zinc-100' : 'text-slate-900'}`}>SmartHosto</span>
          </div>
          
          <div className={`hidden md:flex items-center gap-8 text-[8px] font-black uppercase tracking-[0.4em] ${theme === 'dark' ? 'text-zinc-400' : 'text-slate-400'}`}>
            <button className="hover:text-emerald-500 transition-colors">{content.navAbout}</button>
            <button className="hover:text-emerald-500 transition-colors">{content.navServices}</button>
            <button className="hover:text-emerald-500 transition-colors">{content.navModules}</button>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <button 
            onClick={toggleTheme}
            className={`p-2.5 rounded-xl transition-all border ${theme === 'dark' ? 'bg-zinc-900 text-amber-400 border-zinc-800 hover:border-zinc-700 hover:shadow-[0_0_12px_rgba(251,191,36,0.2)]' : 'bg-slate-900 text-white hover:bg-slate-800'}`}
          >
            {theme === 'dark' ? <Zap size={20} /> : <Sun size={20} />}
          </button>

          <div className={`flex items-center gap-1 p-1 rounded-full border ${theme === 'dark' ? 'bg-zinc-900 border-zinc-800' : 'bg-slate-200 border-slate-300'}`}>
            <button 
              onClick={() => setLang('FR')}
              className={`px-3 py-1.5 rounded-full text-[9px] font-black transition-all ${lang === 'FR' ? 'bg-emerald-600 text-white shadow-lg' : theme === 'dark' ? 'text-zinc-400 hover:text-zinc-200' : 'text-slate-500'}`}
            >
              FR
            </button>
            <button 
              onClick={() => setLang('EN')}
              className={`px-3 py-1.5 rounded-full text-[9px] font-black transition-all ${lang === 'EN' ? 'bg-emerald-600 text-white shadow-lg' : theme === 'dark' ? 'text-zinc-400 hover:text-zinc-200' : 'text-slate-500'}`}
            >
              EN
            </button>
          </div>
          <button 
            onClick={() => setShowLogin(true)}
            className="group relative px-8 py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-[10px] uppercase tracking-[0.2em] rounded-full transition-all shadow-xl shadow-emerald-500/20 active:scale-95 cursor-pointer"
          >
            {content.connexion}
          </button>
        </div>
      </nav>

      {/* Hero Body */}
      <main className="relative z-10 flex-1 flex flex-col justify-center container mx-auto px-10">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <motion.div 
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8 }}
            className="space-y-10"
          >
            <div className="space-y-6">
              <span className={`inline-block px-4 py-1.5 text-[9px] font-black uppercase tracking-[0.4em] rounded-full border ${theme === 'dark' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-emerald-100 text-emerald-700 border-emerald-200'}`}>
                Next-Gen Hospital OS
              </span>
              <h1 className={`text-6xl xl:text-7xl font-black tracking-tighter leading-[0.9] ${theme === 'dark' ? 'text-zinc-100' : 'text-slate-900'}`}>
                THE POWER <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-blue-500 to-amber-400 drop-shadow-2xl">
                  OF CARE
                </span>
              </h1>
              <p className={`text-lg font-medium max-w-md leading-relaxed ${theme === 'dark' ? 'text-zinc-400' : 'text-slate-500'}`}>
                {content.heroDesc}
              </p>
            </div>

            <div className="flex items-center gap-6">
              <button 
                onClick={() => setShowLogin(true)}
                className={`px-12 py-5 rounded-2xl font-black text-xs uppercase tracking-[0.3em] transition-all flex items-center gap-3 cursor-pointer ${
                  theme === 'dark' 
                    ? 'bg-zinc-100 text-black hover:bg-white border border-white/20 hover:shadow-[0_0_20px_rgba(255,255,255,0.2)]' 
                    : 'bg-slate-900 text-white shadow-2xl hover:scale-105'
                }`}
              >
                {lang === 'FR' ? 'Ouvrir Session' : 'Get Started'}
                <ArrowRight size={20} />
              </button>
            </div>

            {/* Glossy Metrics Section */}
            <div className="flex gap-4 pt-4">
              {[
                { label: "Active Nodes", val: "128", col: "emerald" },
                { label: "Uptime", val: "99.9%", col: "amber" },
                { label: "Precision", val: "Gold", col: "white" }
              ].map((m, i) => (
                <div key={i} className={`flex-1 p-5 border rounded-3xl backdrop-blur-xl transition-all ${
                  theme === 'dark' 
                    ? 'bg-[#111111] border-zinc-800 hover:border-zinc-700 hover:shadow-[0_0_15px_rgba(16,185,129,0.15)]' 
                    : 'bg-white border-slate-200 shadow-sm'
                }`}>
                  <p className={`text-xl font-black ${theme === 'dark' ? 'text-zinc-100' : 'text-slate-900'}`}>{m.val}</p>
                  <p className={`text-[8px] font-black uppercase tracking-widest mt-1 ${theme === 'dark' ? 'text-zinc-400' : 'text-slate-400'}`}>{m.label}</p>
                </div>
              ))}
            </div>
          </motion.div>

          {/* App Visualization with Pertinent Info */}
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1, delay: 0.3 }}
            className="relative"
          >
            {/* Outer Container with Shiny Border */}
            <div className="bg-[#111111]/80 backdrop-blur-[40px] rounded-[4rem] p-4 border border-zinc-800 dark:border-white/10 shadow-[0_0_50px_rgba(0,0,0,0.8)] overflow-hidden relative">
              {/* Internal Dashboard Mockup */}
              <div className="bg-black rounded-[3.2rem] aspect-video overflow-hidden border border-zinc-800 shadow-inner flex relative">
                {/* Side Bar (Glassy) */}
                <div className="w-24 bg-[#0a0a0a] backdrop-blur-2xl border-r border-zinc-800 p-6 flex flex-col items-center gap-8 pt-12">
                   <div className="w-12 h-12 bg-emerald-500 rounded-2xl shadow-lg shadow-emerald-500/40 flex items-center justify-center">
                     <Activity className="text-white" size={24} />
                   </div>
                   {[User, Calendar, Lock, Phone].map((Icon, i) => (
                     <div key={i} className="w-12 h-12 bg-zinc-900 rounded-2xl border border-zinc-800 flex items-center justify-center text-zinc-400 hover:text-emerald-400 hover:border-zinc-700 transition-colors cursor-pointer">
                        <Icon size={20} />
                     </div>
                   ))}
                </div>

                {/* Main Dashboard Area */}
                <div className="flex-1 p-10 flex flex-col gap-8">
                   {/* Top Header Metrics */}
                   <div className="flex justify-between items-end">
                     <div>
                       <h3 className="text-2xl font-black text-zinc-100">Clinical Overview</h3>
                       <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mt-1">Live Hospital Pulse • Dakar Sector</p>
                     </div>
                     <div className="flex gap-4">
                       <div className="px-6 py-3 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl backdrop-blur-xl">
                         <p className="text-emerald-400 text-xs font-black">98% Efficient</p>
                       </div>
                       <div className="w-12 h-12 bg-zinc-900 rounded-full border border-zinc-800"></div>
                     </div>
                   </div>

                   {/* Pertinent Data Grid */}
                   <div className="grid grid-cols-4 gap-6">
                     {[
                       { label: "Active Admissions", val: "42", trend: "+12%", col: "emerald" },
                       { label: "Bed Occupancy", val: "89%", trend: "High", col: "amber" },
                       { label: "Medication Stock", val: "Safe", trend: "100%", col: "emerald" },
                       { label: "Critical Alerts", val: "02", trend: "Stable", col: "rose" }
                     ].map((stat, i) => (
                       <div key={i} className="bg-[#111111] backdrop-blur-xl p-6 rounded-[2.5rem] border border-zinc-800 group hover:border-zinc-700 hover:shadow-[0_0_15px_rgba(59,130,246,0.15)] transition-all">
                          <p className="text-[8px] font-black uppercase tracking-widest text-zinc-400 mb-2">{stat.label}</p>
                          <div className="flex items-baseline gap-2">
                            <span className="text-3xl font-black text-zinc-100">{stat.val}</span>
                            <span className={`text-[9px] font-bold text-${stat.col}-400`}>{stat.trend}</span>
                          </div>
                       </div>
                     ))}
                   </div>

                   {/* Real-time Flow Chart Mockup */}
                   <div className="flex-1 bg-[#111111] rounded-[3rem] border border-zinc-800 p-10 flex flex-col gap-6 relative overflow-hidden">
                      <div className="flex justify-between items-center">
                        <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Patient Flow Trends (24h)</p>
                        <div className="flex gap-2">
                           <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                           <div className="w-2 h-2 rounded-full bg-zinc-700"></div>
                        </div>
                      </div>
                      <div className="flex-1 flex items-end gap-3 px-4">
                        {[40, 70, 45, 90, 65, 80, 55, 60, 30, 85, 45, 75, 95, 60].map((h, i) => (
                          <motion.div 
                            key={i} 
                            initial={{ height: 0 }}
                            animate={{ height: `${h}%` }}
                            transition={{ delay: 0.5 + i * 0.05 }}
                            className={`flex-1 rounded-t-xl transition-all duration-500 ${i === 12 ? 'bg-amber-400 shadow-[0_0_20px_rgba(251,191,36,0.3)]' : 'bg-emerald-500/40 hover:bg-emerald-400'}`}
                          ></motion.div>
                        ))}
                      </div>
                      {/* Floating Data Badge */}
                      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 px-6 py-3 bg-zinc-900 border border-zinc-700 text-zinc-100 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-2xl">
                        Peak Performance Detected
                      </div>
                   </div>
                </div>
              </div>

              {/* Enhanced Glass Floaties */}
              <motion.div 
                animate={{ y: [0, -15, 0], rotate: [0, 5, 0] }} 
                transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }} 
                className="absolute -top-6 -right-6 p-8 bg-[#111111]/90 backdrop-blur-[50px] rounded-[2.5rem] border border-zinc-700 shadow-[0_0_30px_rgba(0,0,0,0.8)]"
              >
                 <Activity className="text-emerald-400" size={32} />
                 <div className="mt-4 space-y-2">
                    <div className="w-16 h-2 bg-emerald-400/20 rounded-full"></div>
                    <div className="w-10 h-2 bg-emerald-400/10 rounded-full"></div>
                 </div>
              </motion.div>

              <motion.div 
                animate={{ x: [0, 10, 0], y: [0, 10, 0] }} 
                transition={{ duration: 6, repeat: Infinity, delay: 1 }} 
                className="absolute -bottom-10 -left-10 p-10 bg-amber-500/5 backdrop-blur-3xl rounded-full border border-zinc-800"
              >
                 <div className="w-20 h-20 bg-gradient-to-tr from-amber-500/20 to-transparent rounded-full blur-xl"></div>
              </motion.div>
            </div>
            
            <div className="absolute -left-20 top-1/4 w-80 h-80 bg-emerald-500/20 rounded-full blur-[140px] animate-pulse"></div>
          </motion.div>
        </div>
      </main>

      {/* Micro-Footer with Glass effect */}
      <footer className="relative z-20 px-10 py-6 border-t border-zinc-800/80 backdrop-blur-xl flex justify-between items-center">
        <p className="text-[9px] font-black uppercase tracking-[0.5em] text-zinc-400">{content.footerDesc}</p>
        <div className="flex gap-8 items-center">
           <span className="text-[9px] font-black text-zinc-400 tracking-widest uppercase">System Operational</span>
           <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
        </div>
      </footer>

      {/* Login Modal */}
      <AnimatePresence>
        {showLogin && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowLogin(false)} className="absolute inset-0 bg-black/80 backdrop-blur-xl" />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }} 
              animate={{ opacity: 1, scale: 1 }} 
              exit={{ opacity: 0, scale: 0.95 }} 
              className={`relative w-full max-w-md rounded-[3.5rem] p-12 border ${
                theme === 'dark' 
                  ? 'bg-[#111111] border-zinc-800 text-zinc-100 shadow-[0_0_50px_rgba(0,0,0,0.9)]' 
                  : 'bg-white text-slate-950 shadow-2xl border-slate-100'
              }`}
            >
              <div className="text-center space-y-4 mb-10">
                <div className="w-20 h-20 bg-emerald-600 rounded-[2rem] mx-auto flex items-center justify-center shadow-xl shadow-emerald-500/20 rotate-6">
                  <Activity className="text-white" size={40} />
                </div>
                <h2 className="text-3xl font-black tracking-tighter">{content.loginTitle}</h2>
                <p className={`text-[10px] font-black uppercase tracking-widest ${theme === 'dark' ? 'text-zinc-400' : 'text-slate-400'}`}>{content.loginSub}</p>
              </div>

              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-4">
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder={content.placeholderUser}
                    className={`w-full px-8 py-5 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500/40 transition-all font-bold text-sm border ${
                      theme === 'dark' 
                        ? 'bg-black border-zinc-800 text-zinc-100 placeholder-zinc-500' 
                        : 'bg-slate-50 border-slate-100 text-slate-950 placeholder-slate-400'
                    }`}
                    required
                  />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={content.placeholderPass}
                    className={`w-full px-8 py-5 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500/40 transition-all font-bold text-sm border ${
                      theme === 'dark' 
                        ? 'bg-black border-zinc-800 text-zinc-100 placeholder-zinc-500' 
                        : 'bg-slate-50 border-slate-100 text-slate-950 placeholder-slate-400'
                    }`}
                    required
                  />
                </div>

                {error && (
                  <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center gap-3">
                    <AlertCircle size={16} />
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className={`w-full py-5 rounded-2xl font-black text-xs uppercase tracking-[0.3em] transition-all disabled:opacity-50 cursor-pointer ${
                    theme === 'dark'
                      ? 'bg-zinc-100 text-black hover:bg-emerald-500 hover:text-white border border-white/20'
                      : 'bg-slate-950 text-white shadow-xl hover:bg-emerald-600'
                  }`}
                >
                  {loading ? "Vérification en cours..." : content.connexion}
                </button>
              </form>

              {/* Password Recovery Link */}
              <div className="mt-6 text-center">
                <button
                  type="button"
                  onClick={() => setShowForgotModal(true)}
                  className={`text-xs font-bold transition-colors cursor-pointer ${
                    theme === 'dark' ? 'text-zinc-400 hover:text-emerald-400' : 'text-slate-500 hover:text-emerald-600'
                  }`}
                >
                  Mot de passe ou identifiant oublié ?
                </button>
              </div>

              <div className="mt-8 pt-6 border-t border-white/5 text-center">
                <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest flex items-center justify-center gap-1.5">
                  <ShieldCheck size={13} className="text-emerald-500" />
                  Routage automatique par privilège certifié
                </p>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Password Recovery Modal */}
      <AnimatePresence>
        {showForgotModal && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowForgotModal(false)} className="absolute inset-0 bg-black/80 backdrop-blur-xl" />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }} 
              animate={{ opacity: 1, scale: 1 }} 
              exit={{ opacity: 0, scale: 0.95 }} 
              className={`relative w-full max-w-md rounded-3xl p-8 border ${
                theme === 'dark' ? 'bg-[#111111] border-zinc-800 text-zinc-100' : 'bg-white text-slate-950 shadow-2xl border-slate-100'
              }`}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-2xl">
                  <HelpCircle size={24} />
                </div>
                <div>
                  <h3 className="text-lg font-black">Récupération de Compte</h3>
                  <p className="text-xs text-zinc-400">Assistance d'authentification SmartHosto</p>
                </div>
              </div>

              <div className="space-y-3 text-xs text-zinc-300">
                <p>
                  Pour des raisons strictes de sécurité et de secret médical, la réinitialisation de mot de passe s'effectue selon votre profil :
                </p>
                <div className="p-3 bg-zinc-900/60 rounded-xl border border-zinc-800">
                  <p className="font-bold text-white mb-1">Personnel Médical & Administratif :</p>
                  <p className="text-zinc-400">Contactez l'administrateur de votre établissement pour générer une réinitialisation de vos identifiants.</p>
                </div>
                <div className="p-3 bg-zinc-900/60 rounded-xl border border-zinc-800">
                  <p className="font-bold text-white mb-1">Super Administrateur de Plateforme :</p>
                  <p className="text-zinc-400">Utilisez votre adresse e-mail de sécurité enregistrée ou contactez l'équipe support à contact@smarthosto.com.</p>
                </div>
              </div>

              <div className="mt-6 flex justify-end">
                <button
                  type="button"
                  onClick={() => setShowForgotModal(false)}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
                >
                  J'ai compris
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Landing;
