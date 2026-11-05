
import React, { useState, useEffect } from 'react';
import { Role, User, EmergencySubMenu, NurseSubMenu, ReceptionSubMenu, CashierSubMenu, LabSubMenu, InpatientSubMenu, PharmacySubMenu, AccountingSubMenu, ConsultationSubMenu, MaternitySubMenu } from './types';
import Sidebar from './components/Sidebar';
import Landing from './pages/Landing';
import Dashboard from './pages/Dashboard';
import Reception from './pages/Reception';
import SoinsInfirmiers from './pages/SoinsInfirmiers';
import Consultation from './pages/Consultation';
import Inpatient from './pages/Inpatient';
import Lab from './pages/Lab';
import Maternity from './pages/Maternity';
import Pharmacy from './pages/Pharmacy';
import Cashier from './pages/Cashier';
import { Accounting } from './pages/Accounting';
import Personnel from './pages/Personnel';
import Emergency from './pages/Emergency';
import ModuleSelector from './pages/ModuleSelector';
import Settings from './pages/Settings';
import ComingSoon from './pages/ComingSoon';
import { ControlCenter } from './pages/ControlCenter';
import ForcePasswordChangeModal from './components/auth/ForcePasswordChangeModal';
import { UserProfileModal } from './components/profile/UserProfileModal';
import { Menu, LogOut, Bell, LayoutDashboard, CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { useSettings, useHospitalServices } from './hooks/useSettings';
import { isModuleActiveAndAvailable } from './src/config/modules';
import { auth, db } from './src/firebase';
import { signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { collection, query, onSnapshot, orderBy, doc, getDoc } from 'firebase/firestore';
import { applyTheme } from './constants/themes';

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [showUserProfileModal, setShowUserProfileModal] = useState<boolean>(false);
  const [currentModule, setCurrentModule] = useState<Role | 'DASHBOARD' | 'SETTING' | 'IMAGERIE' | 'HOSPITALISATION' | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('smarthosto_theme');
    return (saved === 'dark' || saved === 'light') ? saved : 'light';
  });

  const toggleTheme = () => setTheme(prev => prev === 'light' ? 'dark' : 'light');

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('smarthosto_theme', theme);
  }, [theme]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(false);
  const [isSidebarLocked, setIsSidebarLocked] = useState(() => {
    return localStorage.getItem('sidebar_locked') === 'true';
  });

  useEffect(() => {
    localStorage.setItem('sidebar_locked', isSidebarLocked.toString());
    if (isSidebarLocked) {
      setIsSidebarExpanded(true);
    }
  }, [isSidebarLocked]);
  const [activeSettingsTab, setActiveSettingsTab] = useState<'users' | 'roles' | 'establishment' | 'referentials' | 'cashier_settings' | 'services' | 'protocols'>('users');
  const [activeMaternityTab, setActiveMaternityTab] = useState<MaternitySubMenu>('dashboard');
  const [activeConsultationTab, setActiveConsultationTab] = useState<ConsultationSubMenu>('dashboard');
  const [activeEmergencyTab, setActiveEmergencyTab] = useState<EmergencySubMenu>('patients');
  const [activeReceptionTab, setActiveReceptionTab] = useState<ReceptionSubMenu>('dashboard');
  const [activeNurseTab, setActiveNurseTab] = useState<NurseSubMenu>('triage');
  const [activeCashierTab, setActiveCashierTab] = useState<CashierSubMenu>('dashboard');
  const [activeLabTab, setActiveLabTab] = useState<LabSubMenu>('dashboard');
  const [activeInpatientTab, setActiveInpatientTab] = useState<InpatientSubMenu>('dashboard');
  const [activePharmacyTab, setActivePharmacyTab] = useState<PharmacySubMenu>('dashboard');
  const [activeAccountingTab, setActiveAccountingTab] = useState<AccountingSubMenu>('dashboard');
  const [notifications, setNotifications] = useState<{id: number, message: string, type: 'success' | 'error' | 'info'}[]>([]);
  const { establishment, cashierSettings: cashierSettingsGlobal } = useSettings();
  const { services: hospitalServicesList, loading: hospitalServicesLoading } = useHospitalServices();
  const hospitalServicesRef = React.useRef(hospitalServicesList);
  hospitalServicesRef.current = hospitalServicesList;

  // Sécurisation stricte de la navigation : si le module courant est désactivé dans les paramètres,
  // rediriger immédiatement vers l'accueil pour empêcher tout contournement ou accès direct
  useEffect(() => {
    if (currentModule && currentModule !== 'DASHBOARD' && !hospitalServicesLoading) {
      if (!isModuleActiveAndAvailable(currentModule, hospitalServicesList)) {
        setCurrentModule('DASHBOARD');
        window.dispatchEvent(new CustomEvent('app-notification', {
          detail: {
            message: `Ce module a été désactivé dans les paramètres et n'est plus accessible.`,
            type: 'error'
          }
        }));
      }
    }
  }, [currentModule, hospitalServicesList, hospitalServicesLoading]);

  useEffect(() => {
    const handleNotification = (e: any) => {
      let message = '';
      let type: 'success' | 'error' | 'info' = 'success';

      if (typeof e.detail === 'string') {
        message = e.detail;
        if (e.detail.toLowerCase().includes('erreur') || e.detail.toLowerCase().includes('échec') || e.detail.toLowerCase().includes('fail')) {
          type = 'error';
        }
      } else if (e.detail && typeof e.detail === 'object') {
        message = e.detail.message || e.detail.text || '';
        type = e.detail.type || 'success';
      }

      if (!message) return;

      const newNotif = { id: Date.now() + Math.random(), message, type };
      setTimeout(() => {
        setNotifications(prev => [...prev, newNotif]);
        setTimeout(() => {
          setNotifications(prev => prev.filter(n => n.id !== newNotif.id));
        }, 5000);
      }, 0);
    };

    window.addEventListener('app-notification', handleNotification);
    
    const handleChangeLabTab = (e: any) => {
      if (e.detail) setTimeout(() => setActiveLabTab(e.detail), 0);
    };
    const handleChangeSettingsTab = (e: any) => {
      if (e.detail) setTimeout(() => setActiveSettingsTab(e.detail), 0);
    };
    const handleChangeEmergencyTab = (e: any) => {
      if (e.detail) setTimeout(() => setActiveEmergencyTab(e.detail), 0);
    };
    const handleChangeConsultationTab = (e: any) => {
      if (e.detail) setTimeout(() => setActiveConsultationTab(e.detail), 0);
    };
    const handleChangeInpatientTab = (e: any) => {
      if (e.detail) setTimeout(() => setActiveInpatientTab(e.detail), 0);
    };
    const handleChangePharmacyTab = (e: any) => {
      if (e.detail) setTimeout(() => setActivePharmacyTab(e.detail), 0);
    };

    window.addEventListener('change-lab-tab', handleChangeLabTab);
    window.addEventListener('change-settings-tab', handleChangeSettingsTab);
    window.addEventListener('change-emergency-tab', handleChangeEmergencyTab);
    window.addEventListener('change-consultation-tab', handleChangeConsultationTab);
    window.addEventListener('change-inpatient-tab', handleChangeInpatientTab);
    window.addEventListener('change-pharmacy-tab', handleChangePharmacyTab);

    const handleChangeModule = (e: any) => {
      if (!e.detail) return;
      setTimeout(() => {
        let targetRole: any = null;
        let targetTab: any = null;

        if (typeof e.detail === 'string') {
          targetRole = e.detail;
        } else if (typeof e.detail === 'object') {
          targetRole = e.detail.module;
          targetTab = e.detail.tab || e.detail.subTab;
        }

        if (!targetRole) return;

        // Contrôle de navigation : interdire l'accès par événement aux modules désactivés
        if (targetRole !== 'DASHBOARD' && !isModuleActiveAndAvailable(targetRole, hospitalServicesRef.current)) {
          window.dispatchEvent(new CustomEvent('app-notification', {
            detail: {
              message: `Ce module est actuellement désactivé dans les paramètres et ne peut pas être ouvert.`,
              type: 'error'
            }
          }));
          return;
        }

        setCurrentModule(targetRole);

        if (targetTab) {
          if (targetRole === Role.RECEPTION) setActiveReceptionTab(targetTab);
          else if (targetRole === Role.DOCTOR) setActiveConsultationTab(targetTab);
          else if (targetRole === Role.NURSE) setActiveNurseTab(targetTab);
          else if (targetRole === Role.INPATIENT || targetRole === 'HOSPITALISATION') setActiveInpatientTab(targetTab);
          else if (targetRole === Role.LAB) setActiveLabTab(targetTab);
          else if (targetRole === Role.PHARMACY) setActivePharmacyTab(targetTab);
          else if (targetRole === Role.CASHIER) setActiveCashierTab(targetTab);
          else if (targetRole === Role.MATERNITY) setActiveMaternityTab(targetTab);
          else if (targetRole === Role.ACCOUNTANT) setActiveAccountingTab(targetTab);
          else if (targetRole === Role.URGENCE) setActiveEmergencyTab(targetTab);
          else if (targetRole === 'SETTING') setActiveSettingsTab(targetTab);
        }
      }, 0);
    };
    window.addEventListener('change-module', handleChangeModule);

    const handleOpenUserProfile = () => setShowUserProfileModal(true);
    window.addEventListener('open-user-profile', handleOpenUserProfile);

    return () => {
      window.removeEventListener('app-notification', handleNotification);
      window.removeEventListener('change-lab-tab', handleChangeLabTab);
      window.removeEventListener('change-settings-tab', handleChangeSettingsTab);
      window.removeEventListener('change-emergency-tab', handleChangeEmergencyTab);
      window.removeEventListener('change-consultation-tab', handleChangeConsultationTab);
      window.removeEventListener('change-inpatient-tab', handleChangeInpatientTab);
      window.removeEventListener('change-pharmacy-tab', handleChangePharmacyTab);
      window.removeEventListener('change-module', handleChangeModule);
      window.removeEventListener('open-user-profile', handleOpenUserProfile);
    };
  }, []);

  // État global de la file d'attente partagée entre l'accueil et les médecins
  const [globalWaitingQueue, setGlobalWaitingQueue] = useState<any[]>([]);

  // Real-time synchronization of the service queues from Firestore
  useEffect(() => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const q = query(
        collection(db, 'service_queues'),
        orderBy('createdAt', 'desc')
      );
      
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const queueMap = new Map<string, any>();
        snapshot.docs.forEach((docSnap) => {
          const data = docSnap.data();
          // Only show today's patients and those with relevant statuses
          const isToday = data.createdAt?.startsWith(today);
          if (isToday && (data.status === 'waiting' || data.status === 'waiting_triage' || data.status === 'in_consultation' || data.status === 'ready_for_discharge' || data.status === 'called')) {
            queueMap.set(docSnap.id, {
              id: data.patientId || docSnap.id,
              queueDocId: docSnap.id,
              dmeId: data.dmeId || data.patientId,
              firstName: data.firstName,
              lastName: data.lastName,
              age: data.age,
              gender: data.gender,
              time: data.time || 'Aujourd\'hui',
              motif: data.motif || 'CONSULTATION',
              motifId: data.motifId || '',
              motifLabel: data.motifLabel || '',
              speciality: data.speciality || '',
              queueName: data.queueName || '',
              service: data.service || '',
              serviceId: data.serviceId || '',
              paymentStatus: data.paymentStatus || 'PENDING',
              priority: data.priority || 'normal',
              priorityAlerts: data.priorityAlerts || [],
              allergies: data.allergies || [],
              status: data.status,
              vitals: data.vitals || null
            });
          }
        });
        setGlobalWaitingQueue(Array.from(queueMap.values()));
      }, (err) => {
        console.warn("Error listening to service_queues:", err);
      });
      return () => unsubscribe();
    } catch (e) {
      console.error("Error setting up service_queues snapshot:", e);
    }
  }, []);

  // Global state for financial flow
  const [paymentRequests, setPaymentRequests] = useState<any[]>([]);

  useEffect(() => {
    try {
      const q = query(collection(db, 'payment_requests'));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const reqsMap = new Map<string, any>();
        snapshot.docs.forEach((docSnap) => {
          reqsMap.set(docSnap.id, { ...docSnap.data(), id: docSnap.id });
        });
        setPaymentRequests(Array.from(reqsMap.values()));
      }, (err) => {
        console.warn("Error listening to payment_requests:", err);
      });
      return () => unsubscribe();
    } catch (e) {
      console.error("Error setting up payment_requests snapshot:", e);
    }
  }, []);

  const [cashierTransactions, setCashierTransactions] = useState<any[]>([]);
  const [transactionsFacturation, setTransactionsFacturation] = useState<any[]>([]);
  const [avoirsPatient, setAvoirsPatient] = useState<any[]>([]);
  const [dettesPatient, setDettesPatient] = useState<any[]>([]);
  const [parametresCaisse, setParametresCaisse] = useState<any>({
    detteAutorisee: true,
    seuilDetteMax: 50000,
    paiementPartielAutorise: true,
    avoirPatientAutorise: true,
    applicationAutoAvoir: true,
    modesPaiement: {
      especes: true,
      mobileMoney: true,
      carteBancaire: true,
      virement: false,
      cheque: false,
      autre: false
    },
    impression: {
      nomClinique: 'SmartHosto',
      logo: '',
      adresse: 'Dakar, Sénégal',
      telephone: '+221 77 000 00 00',
      slogan: 'Votre santé, notre priorité',
      piedDePage: 'Merci de votre confiance.'
    },
    permissions: {
      autoriserDette: ['ADMIN', 'DIRECTOR'],
      annulerTransaction: ['ADMIN'],
      rembourserAvoir: ['ADMIN', 'CHIEF_CASHIER'],
      modifierFactureValidee: ['ADMIN']
    },
    technique: {
      caissesActives: ['Caisse 1', 'Caisse 2'],
      formatRecu: 'REC-YYYYMMDD-XXXX',
      formatTransaction: 'TX-YYYYMMDD-XXXX'
    }
  });

  useEffect(() => {
    try {
      const q = query(collection(db, 'parametres_caisse'));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        if (!snapshot.empty) {
          const data = snapshot.docs[0].data();
          setParametresCaisse(data);
        }
      }, (err) => {
        console.warn("Error listening to parametres_caisse:", err);
      });
      return () => unsubscribe();
    } catch (e) {
      console.error("Error setting up parametres_caisse snapshot:", e);
    }
  }, []);
  useEffect(() => {
    try {
      const q = query(collection(db, 'cashier_transactions'));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const txsMap = new Map<string, any>();
        snapshot.docs.forEach((docSnap) => {
          txsMap.set(docSnap.id, { ...docSnap.data(), id: docSnap.id });
        });
        setCashierTransactions(Array.from(txsMap.values()));
      }, (err) => {
        console.warn("Error listening to cashier_transactions:", err);
      });
      return () => unsubscribe();
    } catch (e) {
      console.error("Error setting up cashier_transactions snapshot:", e);
    }
  }, []);

  useEffect(() => {
    try {
      const q = query(collection(db, 'transactions_facturation'));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const txsMap = new Map<string, any>();
        snapshot.docs.forEach((docSnap) => {
          txsMap.set(docSnap.id, { ...docSnap.data(), id: docSnap.id });
        });
        setTransactionsFacturation(Array.from(txsMap.values()));
      }, (err) => {
        console.warn("Error listening to transactions_facturation:", err);
      });
      return () => unsubscribe();
    } catch (e) {
      console.error("Error setting up transactions_facturation snapshot:", e);
    }
  }, []);

  useEffect(() => {
    try {
      const q = query(collection(db, 'avoirs_patient'));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const itemsMap = new Map<string, any>();
        snapshot.docs.forEach((docSnap) => {
          itemsMap.set(docSnap.id, { ...docSnap.data(), id: docSnap.id });
        });
        setAvoirsPatient(Array.from(itemsMap.values()));
      }, (err) => {
        console.warn("Error listening to avoirs_patient:", err);
      });
      return () => unsubscribe();
    } catch (e) {
      console.error("Error setting up avoirs_patient snapshot:", e);
    }
  }, []);

  useEffect(() => {
    try {
      const q = query(collection(db, 'dettes_patient'));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const itemsMap = new Map<string, any>();
        snapshot.docs.forEach((docSnap) => {
          itemsMap.set(docSnap.id, { ...docSnap.data(), id: docSnap.id });
        });
        setDettesPatient(Array.from(itemsMap.values()));
      }, (err) => {
        console.warn("Error listening to dettes_patient:", err);
      });
      return () => unsubscribe();
    } catch (e) {
      console.error("Error setting up dettes_patient snapshot:", e);
    }
  }, []);

  // Vérification de la session au démarrage
  useEffect(() => {
    const savedSession = localStorage.getItem('hospital_session');
    
    // Appliquer le thème sauvegardé
    const savedConfig = localStorage.getItem('hospital_config');
    if (savedConfig) {
      const config = JSON.parse(savedConfig);
      if (config.theme) {
        applyTheme(config.theme);
      } else {
        applyTheme('blue');
      }
    } else {
      applyTheme('blue');
    }

    if (savedSession) {
      const userData = JSON.parse(savedSession);
      
      // Set up authentication before showing authenticated modules
      signInAnonymously(auth)
        .then(async () => {
          let latestUser = userData;
          if (userData.id) {
            try {
              const uSnap = await getDoc(doc(db, 'hospital_users', userData.id));
              if (uSnap.exists()) {
                latestUser = { ...userData, ...uSnap.data() };
                localStorage.setItem('hospital_session', JSON.stringify(latestUser));
              }
            } catch (syncErr) {
              console.warn("Could not sync fresh user doc from Firestore:", syncErr);
            }
          }
          setUser(latestUser);
          if (latestUser.role === Role.SUPER_ADMIN) {
            setCurrentModule(Role.SUPER_ADMIN);
          } else {
            setCurrentModule('DASHBOARD');
          }
        })
        .catch(err => {
          console.error("Firebase recovery sign-in failed:", err);
          // Fallback to allow app to run even if firebase has transient issues
          setUser(userData);
          if (userData.role === Role.SUPER_ADMIN) {
            setCurrentModule(Role.SUPER_ADMIN);
          } else {
            setCurrentModule('DASHBOARD');
          }
        });
    }
  }, []);

  // Gestion responsive de la sidebar
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 768) {
        setIsSidebarOpen(false);
      } else {
        setIsSidebarOpen(true);
      }
    };
    
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleLogin = (userData: User) => {
    setUser(userData);
    const isSuperAdmin = userData.role === Role.SUPER_ADMIN || userData.roles?.includes('role_super_admin') || userData.username === 'superadmin';
    if (isSuperAdmin) {
      setCurrentModule(Role.SUPER_ADMIN);
    } else {
      // Default to first accessible module if possible, or just stay at dashboard selection
      setCurrentModule('DASHBOARD');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('hospital_session');
    auth.signOut();
    setUser(null);
    setCurrentModule(null);
  };

  const renderModule = () => {
    if (!user || !currentModule) return null;

    if (currentModule === 'DASHBOARD') {
      return <ModuleSelector user={user} onSelectModule={setCurrentModule} onLogout={handleLogout} theme={theme} toggleTheme={toggleTheme} />;
    }

    if (currentModule === 'SETTING') {
      const isAdmin = user.role === Role.ADMIN || user.roles?.includes('role_admin');
      if (!isAdmin) return <ModuleSelector user={user} onSelectModule={setCurrentModule} onLogout={handleLogout} theme={theme} toggleTheme={toggleTheme} />;
      return <Settings activeTab={activeSettingsTab} setActiveTab={setActiveSettingsTab} user={user} />;
    }

    // Protection d'affichage : si le module est désactivé dans les paramètres, bloquer l'affichage
    if (!isModuleActiveAndAvailable(currentModule, hospitalServicesList)) {
      return <ModuleSelector user={user} onSelectModule={setCurrentModule} onLogout={handleLogout} theme={theme} toggleTheme={toggleTheme} />;
    }

    switch(currentModule) {
      case Role.ADMIN: return <Dashboard theme={theme} />;
      case Role.RECEPTION: 
        return (
          <Reception 
            user={user} 
            globalWaitingQueue={globalWaitingQueue}
            setGlobalWaitingQueue={setGlobalWaitingQueue} 
            paymentRequests={paymentRequests} 
            setPaymentRequests={setPaymentRequests} 
            activeTab={activeReceptionTab}
            setActiveTab={setActiveReceptionTab}
            onBackToDashboard={() => setCurrentModule('DASHBOARD')}
            theme={theme}
          />
        );
      case Role.DOCTOR: 
        return <Consultation 
          user={user} 
          waitingQueue={globalWaitingQueue} 
          setWaitingQueue={setGlobalWaitingQueue} 
          paymentRequests={paymentRequests} 
          setPaymentRequests={setPaymentRequests}
          activeMenu={activeConsultationTab}
          setActiveMenu={setActiveConsultationTab}
        />;
      case Role.NURSE: 
        return (
          <SoinsInfirmiers 
            user={user} 
            globalWaitingQueue={globalWaitingQueue}
            setGlobalWaitingQueue={setGlobalWaitingQueue}
            paymentRequests={paymentRequests} 
            setPaymentRequests={setPaymentRequests} 
            activeTab={activeNurseTab}
            setActiveTab={setActiveNurseTab}
            onBackToDashboard={() => setCurrentModule('DASHBOARD')}
            theme={theme}
          />
        );
      case Role.INPATIENT:
      case 'HOSPITALISATION' as any:
        return (
          <Inpatient 
            user={user} 
            paymentRequests={paymentRequests} 
            setPaymentRequests={setPaymentRequests} 
            activeTab={activeInpatientTab}
            setActiveTab={setActiveInpatientTab}
            onBackToDashboard={() => setCurrentModule('DASHBOARD')}
            theme={theme}
          />
        );
      case Role.LAB: 
        return (
          <Lab 
            paymentRequests={paymentRequests} 
            setPaymentRequests={setPaymentRequests} 
            user={user} 
            activeTab={activeLabTab}
            setActiveTab={setActiveLabTab}
            onBackToDashboard={() => setCurrentModule('DASHBOARD')}
            theme={theme}
          />
        );
      case Role.PHARMACY: 
        return (
          <Pharmacy 
            paymentRequests={paymentRequests} 
            setPaymentRequests={setPaymentRequests} 
            user={user} 
            activeTab={activePharmacyTab}
            setActiveTab={setActivePharmacyTab}
            onBackToDashboard={() => setCurrentModule('DASHBOARD')}
            theme={theme}
          />
        );
      case Role.CASHIER: 
        return (
          <Cashier 
            user={user} 
            paymentRequests={paymentRequests} 
            setPaymentRequests={setPaymentRequests} 
            cashierTransactions={cashierTransactions} 
            setCashierTransactions={setCashierTransactions} 
            transactionsFacturation={transactionsFacturation} 
            setTransactionsFacturation={setTransactionsFacturation} 
            avoirsPatient={avoirsPatient} 
            setAvoirsPatient={setAvoirsPatient} 
            dettesPatient={dettesPatient} 
            setDettesPatient={setDettesPatient} 
            parametresCaisse={parametresCaisse} 
            activeTab={activeCashierTab}
            setActiveTab={setActiveCashierTab}
            onBackToDashboard={() => setCurrentModule('DASHBOARD')}
            theme={theme}
          />
        );
      case Role.MATERNITY: 
        return (
          <Maternity 
            user={user} 
            activeTab={activeMaternityTab} 
            setActiveTab={setActiveMaternityTab} 
            onBackToDashboard={() => setCurrentModule('DASHBOARD')}
            paymentRequests={paymentRequests} 
            setPaymentRequests={setPaymentRequests} 
            waitingQueue={globalWaitingQueue} 
            setWaitingQueue={setGlobalWaitingQueue} 
            theme={theme}
          />
        );
      case Role.ACCOUNTANT: 
        return (
          <Accounting 
            user={user} 
            paymentRequests={paymentRequests} 
            cashierTransactions={cashierTransactions} 
            onBackToDashboard={() => setCurrentModule('DASHBOARD')}
            activeTab={activeAccountingTab}
            setActiveTab={setActiveAccountingTab}
          />
        ); 
      case Role.URGENCE:
        return (
          <Emergency 
            user={user} 
            globalWaitingQueue={globalWaitingQueue} 
            setGlobalWaitingQueue={setGlobalWaitingQueue} 
            paymentRequests={paymentRequests} 
            setPaymentRequests={setPaymentRequests} 
            activeMenu={activeEmergencyTab}
            setActiveMenu={setActiveEmergencyTab}
            onBackToDashboard={() => setCurrentModule('DASHBOARD')}
          />
        );
      case 'IMAGERIE':
        return <ComingSoon moduleName={currentModule} onBack={() => setCurrentModule('DASHBOARD')} />;
      default: 
        return (
          <ModuleSelector 
            user={user} 
            onSelectModule={setCurrentModule} 
            onLogout={handleLogout}
            onOpenProfile={() => setShowUserProfileModal(true)}
            theme={theme}
            toggleTheme={toggleTheme}
          />
        );
    }
  };

  if (!user) {
    return <Landing onLogin={handleLogin} theme={theme} toggleTheme={toggleTheme} />;
  }

  // Interception obligatoire : Changement de mot de passe requis au premier accès
  if (user.forcePasswordChange) {
    return (
      <ForcePasswordChangeModal 
        user={user} 
        onPasswordChanged={(updatedUser) => {
          setUser(updatedUser);
          localStorage.setItem('hospital_session', JSON.stringify(updatedUser));
        }}
        onLogout={handleLogout}
        theme={theme}
      />
    );
  }

  if (currentModule === Role.SUPER_ADMIN) {
    const isRealSuperAdmin = user.role === Role.SUPER_ADMIN || user.roles?.includes('role_super_admin') || user.username === 'superadmin';
    if (!isRealSuperAdmin) {
      setCurrentModule('DASHBOARD');
      return null;
    }
    return (
      <div className="min-h-screen bg-slate-950">
        <ControlCenter 
          currentUser={user} 
          onBackToDashboard={handleLogout} 
        />
      </div>
    );
  }

  // Cas 4 : Blocage explicite en cas de licence expirée pour le personnel médical
  const isLicenseExpired = (user as any).isLicenseExpired;
  const isLocalAdmin = user.role === Role.ADMIN || user.roles?.includes('role_admin');

  if (isLicenseExpired && !isLocalAdmin) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-6 text-center">
        <div className="max-w-md bg-slate-900 border border-rose-500/30 p-8 rounded-3xl shadow-2xl space-y-4">
          <div className="w-16 h-16 bg-rose-500/10 text-rose-500 rounded-2xl mx-auto flex items-center justify-center">
            <AlertCircle size={36} />
          </div>
          <h2 className="text-2xl font-black text-white">Licence de l'Établissement Expirée</h2>
          <p className="text-xs text-slate-400">
            L'abonnement de votre structure hospitalière est arrivé à expiration ou a été suspendu par l'administration SmartHosto.
          </p>
          <div className="p-4 bg-slate-950/80 rounded-2xl border border-white/5 text-xs text-slate-300">
            Veuillez contacter la direction de votre clinique ou le service commercial SmartHosto (contact@smarthosto.com) pour réactiver vos accès.
          </div>
          <button
            onClick={handleLogout}
            className="w-full py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
          >
            Se déconnecter
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen flex transition-colors duration-300 ${theme === 'dark' ? 'bg-[#000000] text-zinc-200' : 'bg-[#F0F5F9] text-slate-900'}`}>
      {isLicenseExpired && isLocalAdmin && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-rose-600 text-white text-xs font-bold px-4 py-2 flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-2">
            <AlertCircle size={15} />
            <span>ATTENTION : La licence de votre établissement est expirée. Contactez le Super Administrateur pour régulariser votre abonnement.</span>
          </div>
          <button onClick={() => setCurrentModule('SETTING')} className="underline text-xs cursor-pointer">
            Voir paramètres
          </button>
        </div>
      )}
      {currentModule !== 'DASHBOARD' && (
        <Sidebar 
          user={user} 
          currentRole={currentModule || 'DASHBOARD'} 
          setRole={setCurrentModule} 
          onLogout={handleLogout} 
          onOpenProfile={() => setShowUserProfileModal(true)}
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
          isExpanded={isSidebarExpanded}
          onToggleExpand={setIsSidebarExpanded}
          isLocked={isSidebarLocked}
          onToggleLock={() => setIsSidebarLocked(!isSidebarLocked)}
          theme={theme}
          toggleTheme={toggleTheme}
          activeSettingsTab={activeSettingsTab}
          setActiveSettingsTab={setActiveSettingsTab}
          activeMaternityTab={activeMaternityTab}
          setActiveMaternityTab={setActiveMaternityTab}
          activeConsultationTab={activeConsultationTab}
          setActiveConsultationTab={setActiveConsultationTab}
          activeEmergencyTab={activeEmergencyTab}
          setActiveEmergencyTab={setActiveEmergencyTab}
          activeReceptionTab={activeReceptionTab}
          setActiveReceptionTab={setActiveReceptionTab}
          activeNurseTab={activeNurseTab}
          setActiveNurseTab={setActiveNurseTab}
          activeCashierTab={activeCashierTab}
          setActiveCashierTab={setActiveCashierTab}
          activeLabTab={activeLabTab}
          setActiveLabTab={setActiveLabTab}
          activeInpatientTab={activeInpatientTab}
          setActiveInpatientTab={setActiveInpatientTab}
          activePharmacyTab={activePharmacyTab}
          setActivePharmacyTab={setActivePharmacyTab}
          activeAccountingTab={activeAccountingTab}
          setActiveAccountingTab={setActiveAccountingTab}
        />
      )}
      
      <main className={`flex-1 min-h-screen relative transition-all duration-500 ${currentModule !== 'DASHBOARD' ? (isSidebarExpanded || isSidebarLocked ? 'md:pl-[320px]' : 'md:pl-[136px]') : 'pl-0'}`}>
        {!isSidebarOpen && currentModule !== 'DASHBOARD' && (
          <button 
            onClick={() => setIsSidebarOpen(true)}
            className="fixed top-6 left-6 z-50 p-3 bg-blue-600 text-white rounded-2xl shadow-xl hover:bg-blue-700 transition-all flex items-center justify-center cursor-pointer animate-in fade-in md:hidden"
          >
            <LayoutDashboard size={20} />
          </button>
        )}
        <div className="max-w-[1600px] mx-auto">
          {/* renderModule handles its own header for Dashboard */}
          {renderModule()}
        </div>
        
        {/* Notifications persistantes contextuelles */}
        <div className="fixed bottom-8 right-8 z-50 pointer-events-none max-w-md w-full">
          <div className="space-y-3 flex flex-col items-end">
            {notifications.map(notif => (
              <div 
                key={notif.id} 
                className={`px-5 py-4 rounded-2xl shadow-2xl flex items-center justify-between gap-4 pointer-events-auto border transition-all duration-300 animate-in slide-in-from-right-8 fade-in w-full ${
                  notif.type === 'error' 
                    ? 'bg-rose-600 text-white border-rose-500' 
                    : notif.type === 'info'
                    ? 'bg-indigo-600 text-white border-indigo-500'
                    : 'bg-emerald-600 text-white border-emerald-500'
                }`}
              >
                <div className="flex items-center gap-3">
                  {notif.type === 'error' ? (
                    <AlertCircle size={20} className="text-rose-200 shrink-0" />
                  ) : notif.type === 'info' ? (
                    <Info size={20} className="text-indigo-200 shrink-0" />
                  ) : (
                    <CheckCircle2 size={20} className="text-emerald-200 shrink-0" />
                  )}
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-wider opacity-80">
                      {notif.type === 'error' ? 'Erreur' : notif.type === 'info' ? 'Information' : 'Succès'}
                    </p>
                    <p className="text-xs font-bold leading-tight">{notif.message}</p>
                  </div>
                </div>
                <button 
                  onClick={() => setNotifications(prev => prev.filter(n => n.id !== notif.id))}
                  className="p-1 hover:bg-white/20 rounded-lg transition-colors shrink-0"
                  title="Fermer"
                >
                  <X size={16} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* Mon Profil (Staff Profile & Financial Dashboard Modal) */}
      {showUserProfileModal && user && (
        <UserProfileModal
          user={user}
          isOpen={showUserProfileModal}
          onClose={() => setShowUserProfileModal(false)}
          onUserUpdated={(updatedUser) => {
            setUser(updatedUser);
            localStorage.setItem('hospital_session', JSON.stringify(updatedUser));
          }}
          theme={theme}
        />
      )}
    </div>
  );
};

export default App;
