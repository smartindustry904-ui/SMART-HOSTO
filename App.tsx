
import React, { useState, useEffect, Suspense, lazy } from 'react';
import { Role, User, EmergencySubMenu, NurseSubMenu, ReceptionSubMenu, CashierSubMenu, LabSubMenu, InpatientSubMenu, PharmacySubMenu, AccountingSubMenu, ConsultationSubMenu, MaternitySubMenu } from './types';
import Sidebar from './components/Sidebar';
import Landing from './pages/Landing';
import ModuleSelector from './pages/ModuleSelector';

// Code-split dynamic page loading for performance optimization
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Reception = lazy(() => import('./pages/Reception'));
const SoinsInfirmiers = lazy(() => import('./pages/SoinsInfirmiers'));
const Consultation = lazy(() => import('./pages/Consultation'));
const Inpatient = lazy(() => import('./pages/Inpatient'));
const Lab = lazy(() => import('./pages/Lab'));
const Maternity = lazy(() => import('./pages/Maternity'));
const Pharmacy = lazy(() => import('./pages/Pharmacy'));
const Cashier = lazy(() => import('./pages/Cashier'));
const Accounting = lazy(() => import('./pages/Accounting').then(m => ({ default: m.Accounting })));
const Personnel = lazy(() => import('./pages/Personnel'));
const Emergency = lazy(() => import('./pages/Emergency'));
const Settings = lazy(() => import('./pages/Settings'));
const ComingSoon = lazy(() => import('./pages/ComingSoon'));
const ControlCenter = lazy(() => import('./pages/ControlCenter').then(m => ({ default: m.ControlCenter })));

import ForcePasswordChangeModal from './components/auth/ForcePasswordChangeModal';
import { UserProfileModal } from './components/profile/UserProfileModal';
import { Menu, LogOut, Bell, LayoutDashboard, CheckCircle2, AlertCircle, Info, X, AlertTriangle, CreditCard, ShieldAlert } from 'lucide-react';
import { useSettings, useHospitalServices } from './hooks/useSettings';
import { isModuleActiveAndAvailable, isUserAuthorizedForModule } from './src/config/modules';
import { useHospitalLicense } from './hooks/useHospitalLicense';
import { useCustomRoles } from './hooks/useCustomRoles';
import { auth, db } from './src/firebase';
import { signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { collection, query, onSnapshot, orderBy, doc, getDoc } from 'firebase/firestore';
import { applyTheme } from './constants/themes';
import { getActiveTenantId, belongsToTenant } from './src/utils/tenant';

const ModuleLoadingFallback: React.FC<{ theme: 'light' | 'dark' }> = ({ theme }) => (
  <div className={`min-h-[60vh] flex flex-col items-center justify-center p-8 transition-colors ${theme === 'dark' ? 'text-zinc-300' : 'text-slate-700'}`}>
    <div className="relative flex items-center justify-center mb-5">
      <div className="w-14 h-14 rounded-full border-4 border-blue-500/20 border-t-blue-600 animate-spin" />
      <div className="absolute w-6 h-6 rounded-full bg-blue-500/10 flex items-center justify-center">
        <div className="w-2.5 h-2.5 rounded-full bg-blue-600 animate-ping" />
      </div>
    </div>
    <p className="text-xs font-bold tracking-widest uppercase opacity-80">Initialisation du service médical...</p>
    <p className="text-[11px] opacity-50 mt-1">SMART-HOSTO Cockpit</p>
  </div>
);

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [showUserProfileModal, setShowUserProfileModal] = useState<boolean>(false);
  const [inspectingTenant, setInspectingTenant] = useState<{ id: string; name: string } | null>(null);
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
  const [activeSettingsTab, setActiveSettingsTab] = useState<'users' | 'roles' | 'establishment' | 'referentials' | 'cashier_settings' | 'services' | 'protocols' | 'whatsapp_agent' | 'appearance' | 'licence'>('users');
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
  const { establishment, cashierSettings: cashierSettingsGlobal, updateEstablishment } = useSettings();
  const { services: hospitalServicesList, loading: hospitalServicesLoading } = useHospitalServices();
  const hospitalLicense = useHospitalLicense(user, establishment);
  const { roles: customRoles } = useCustomRoles(user);
  const hospitalServicesRef = React.useRef(hospitalServicesList);
  hospitalServicesRef.current = hospitalServicesList;

  const activeTenantId = React.useMemo(() => {
    if (inspectingTenant && isUserSuperAdmin(user)) {
      return inspectingTenant.id;
    }
    return getActiveTenantId(user, establishment);
  }, [user, establishment, inspectingTenant]);

  const isUserSuperAdmin = (u: any): boolean => {
    if (!u) return false;
    const uname = String(u.username || '').toLowerCase().trim();
    const uid = String(u.id || '').toLowerCase().trim();
    const urole = String(u.role || '').toUpperCase().trim();
    return (
      urole === Role.SUPER_ADMIN ||
      urole === 'SUPER_ADMIN' ||
      u.roles?.includes('role_super_admin') ||
      uname === 'superadmin' ||
      uname === 'sa1' ||
      uid === 'super_admin_id' ||
      uid === 'sa1_superadmin' ||
      uid.startsWith('sa_')
    );
  };

  // Sécurisation stricte de la navigation : si le module courant est désactivé dans les paramètres,
  // ou si l'utilisateur n'a pas les droits pour ce module, rediriger immédiatement vers le sélecteur
  useEffect(() => {
    if (currentModule && currentModule !== 'DASHBOARD' && currentModule !== Role.SUPER_ADMIN && user && !hospitalServicesLoading) {
      if (!isModuleActiveAndAvailable(currentModule, hospitalServicesList)) {
        setCurrentModule('DASHBOARD');
        window.dispatchEvent(new CustomEvent('app-notification', {
          detail: {
            message: `Ce module a été désactivé dans les paramètres et n'est plus accessible.`,
            type: 'error'
          }
        }));
      } else if (!isUserAuthorizedForModule(user, currentModule, customRoles)) {
        setCurrentModule('DASHBOARD');
        window.dispatchEvent(new CustomEvent('app-notification', {
          detail: {
            message: `Accès refusé : votre profil ne dispose pas des autorisations pour accéder à ce module.`,
            type: 'error'
          }
        }));
      }
    }
  }, [currentModule, hospitalServicesList, hospitalServicesLoading, user]);

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

    const handleSettingsUpdated = () => {
      try {
        const savedConfig = localStorage.getItem('hospital_config');
        if (savedConfig) {
          const config = JSON.parse(savedConfig);
          if (config.theme) {
            applyTheme(config.theme, config.customThemeColor);
          }
        }
      } catch (err) {}
    };
    window.addEventListener('settings-updated', handleSettingsUpdated);

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
      window.removeEventListener('settings-updated', handleSettingsUpdated);
    };
  }, []);

  // État global de la file d'attente partagée entre l'accueil et les médecins
  const [globalWaitingQueue, setGlobalWaitingQueue] = useState<any[]>([]);

  // Real-time synchronization of the service queues from Firestore (Strict Tenant Isolation)
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
          // STRICT MULTI-TENANT ISOLATION: Exclude queues of other hospital structures
          if (!belongsToTenant(data, activeTenantId)) return;

          // Only show today's patients and those with relevant statuses
          const isToday = data.createdAt?.startsWith(today);
          if (isToday && (data.status === 'waiting' || data.status === 'waiting_triage' || data.status === 'in_consultation' || data.status === 'ready_for_discharge' || data.status === 'called')) {
            queueMap.set(docSnap.id, {
              id: data.patientId || docSnap.id,
              queueDocId: docSnap.id,
              clinicId: data.clinicId,
              hospital_id: data.hospital_id,
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
  }, [activeTenantId]);

  // Global state for financial flow (Strict Tenant Isolation)
  const [paymentRequests, setPaymentRequests] = useState<any[]>([]);

  useEffect(() => {
    try {
      const q = query(collection(db, 'payment_requests'));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const reqsMap = new Map<string, any>();
        snapshot.docs.forEach((docSnap) => {
          const data = docSnap.data();
          if (!belongsToTenant(data, activeTenantId)) return;
          reqsMap.set(docSnap.id, { ...data, id: docSnap.id });
        });
        setPaymentRequests(Array.from(reqsMap.values()));
      }, (err) => {
        console.warn("Error listening to payment_requests:", err);
      });
      return () => unsubscribe();
    } catch (e) {
      console.error("Error setting up payment_requests snapshot:", e);
    }
  }, [activeTenantId]);

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
          const matched = snapshot.docs.find(d => belongsToTenant(d.data(), activeTenantId));
          const data = matched ? matched.data() : snapshot.docs[0].data();
          setParametresCaisse(data);
        }
      }, (err) => {
        console.warn("Error listening to parametres_caisse:", err);
      });
      return () => unsubscribe();
    } catch (e) {
      console.error("Error setting up parametres_caisse snapshot:", e);
    }
  }, [activeTenantId]);

  useEffect(() => {
    try {
      const q = query(collection(db, 'cashier_transactions'));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const txsMap = new Map<string, any>();
        snapshot.docs.forEach((docSnap) => {
          const data = docSnap.data();
          if (!belongsToTenant(data, activeTenantId)) return;
          txsMap.set(docSnap.id, { ...data, id: docSnap.id });
        });
        setCashierTransactions(Array.from(txsMap.values()));
      }, (err) => {
        console.warn("Error listening to cashier_transactions:", err);
      });
      return () => unsubscribe();
    } catch (e) {
      console.error("Error setting up cashier_transactions snapshot:", e);
    }
  }, [activeTenantId]);

  useEffect(() => {
    try {
      const q = query(collection(db, 'transactions_facturation'));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const txsMap = new Map<string, any>();
        snapshot.docs.forEach((docSnap) => {
          const data = docSnap.data();
          if (!belongsToTenant(data, activeTenantId)) return;
          txsMap.set(docSnap.id, { ...data, id: docSnap.id });
        });
        setTransactionsFacturation(Array.from(txsMap.values()));
      }, (err) => {
        console.warn("Error listening to transactions_facturation:", err);
      });
      return () => unsubscribe();
    } catch (e) {
      console.error("Error setting up transactions_facturation snapshot:", e);
    }
  }, [activeTenantId]);

  useEffect(() => {
    try {
      const q = query(collection(db, 'avoirs_patient'));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const itemsMap = new Map<string, any>();
        snapshot.docs.forEach((docSnap) => {
          const data = docSnap.data();
          if (!belongsToTenant(data, activeTenantId)) return;
          itemsMap.set(docSnap.id, { ...data, id: docSnap.id });
        });
        setAvoirsPatient(Array.from(itemsMap.values()));
      }, (err) => {
        console.warn("Error listening to avoirs_patient:", err);
      });
      return () => unsubscribe();
    } catch (e) {
      console.error("Error setting up avoirs_patient snapshot:", e);
    }
  }, [activeTenantId]);

  useEffect(() => {
    try {
      const q = query(collection(db, 'dettes_patient'));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const itemsMap = new Map<string, any>();
        snapshot.docs.forEach((docSnap) => {
          const data = docSnap.data();
          if (!belongsToTenant(data, activeTenantId)) return;
          itemsMap.set(docSnap.id, { ...data, id: docSnap.id });
        });
        setDettesPatient(Array.from(itemsMap.values()));
      }, (err) => {
        console.warn("Error listening to dettes_patient:", err);
      });
      return () => unsubscribe();
    } catch (e) {
      console.error("Error setting up dettes_patient snapshot:", e);
    }
  }, [activeTenantId]);

  // Auto-synchronize establishment information with the active hospital structure
  useEffect(() => {
    if (!activeTenantId || activeTenantId === 'ALL' || activeTenantId === 'default_hospital') {
      return;
    }
    const clinicRef = doc(db, 'saas_clinics', activeTenantId);
    getDoc(clinicRef).then(snap => {
      if (snap.exists()) {
        const cData = snap.data();
        if ((cData.name && cData.name !== establishment.name) || establishment.id !== activeTenantId) {
          updateEstablishment({
            id: activeTenantId,
            tenantId: activeTenantId,
            clinicId: activeTenantId,
            hospital_id: activeTenantId,
            name: cData.name || establishment.name,
            address: cData.address || establishment.address,
            phone: cData.phone || establishment.phone,
            city: cData.city || establishment.city,
            country: cData.country || establishment.country,
            email: cData.email || establishment.email
          });
        }
      } else {
        getDoc(doc(db, 'hospitals', activeTenantId)).then(hSnap => {
          if (hSnap.exists()) {
            const hData = hSnap.data();
            if ((hData.name && hData.name !== establishment.name) || establishment.id !== activeTenantId) {
              updateEstablishment({
                id: activeTenantId,
                tenantId: activeTenantId,
                clinicId: activeTenantId,
                hospital_id: activeTenantId,
                name: hData.name || establishment.name,
                address: hData.address || establishment.address,
                phone: hData.phone || establishment.phone,
                city: hData.city || establishment.city,
                country: hData.country || establishment.country,
                email: hData.email || establishment.email
              });
            }
          }
        }).catch(() => {});
      }
    }).catch(() => {});
  }, [activeTenantId, establishment.id, establishment.name]);

  // Vérification de la session au démarrage
  useEffect(() => {
    const savedSession = localStorage.getItem('hospital_session');
    
    // Appliquer le thème sauvegardé
    const savedConfig = localStorage.getItem('hospital_config');
    if (savedConfig) {
      try {
        const config = JSON.parse(savedConfig);
        if (config.theme) {
          applyTheme(config.theme, config.customThemeColor);
        } else {
          applyTheme('blue');
        }
      } catch (e) {
        applyTheme('blue');
      }
    } else {
      applyTheme('blue');
    }

    if (savedSession) {
      try {
        const userData = JSON.parse(savedSession);
        if (isUserSuperAdmin(userData)) {
          userData.role = Role.SUPER_ADMIN;
        }
        // Restauration hors-ligne instantanée (0ms de délai) : affichage immédiat de l'interface
        setUser(userData);
        if (isUserSuperAdmin(userData)) {
          setCurrentModule(Role.SUPER_ADMIN);
        } else {
          setCurrentModule('DASHBOARD');
        }

        // Authentification et synchronisation discrète en tâche de fond sans bloquer l'UI
        signInAnonymously(auth).catch(() => {});
        if (userData.id) {
          getDoc(doc(db, 'hospital_users', userData.id))
            .then((uSnap) => {
              if (uSnap.exists()) {
                const freshData = uSnap.data();
                delete freshData.password;
                setUser(prev => prev ? { ...prev, ...freshData } : userData);
                localStorage.setItem('hospital_session', JSON.stringify({ ...userData, ...freshData }));
              }
            })
            .catch(() => {});
        }
      } catch (err) {
        console.warn("Session restore error:", err);
      }
    }
  }, []);

  // Synchronisation en direct du profil utilisateur actif avec la base de données réelle
  useEffect(() => {
    if (!user?.id) return;
    try {
      const unsub = onSnapshot(doc(db, 'hospital_users', user.id), (snap) => {
        if (snap.exists()) {
          const fresh = snap.data();
          delete fresh.password;
          setUser(prev => prev ? { ...prev, ...fresh } : null);
          const saved = localStorage.getItem('hospital_session');
          if (saved) {
            try {
              const current = JSON.parse(saved);
              localStorage.setItem('hospital_session', JSON.stringify({ ...current, ...fresh }));
            } catch {}
          }
        }
      }, (err) => {
        console.warn("Live user profile sync notice:", err);
      });
      return () => unsub();
    } catch (e) {
      console.warn("Could not attach live user profile listener:", e);
    }
  }, [user?.id]);

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
    const isSuperAdmin = isUserSuperAdmin(userData);
    if (isSuperAdmin) {
      userData.role = Role.SUPER_ADMIN;
    }
    setUser(userData);
    if (isSuperAdmin) {
      setCurrentModule(Role.SUPER_ADMIN);
    } else {
      // Default to first accessible module if possible, or just stay at dashboard selection
      setCurrentModule('DASHBOARD');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('hospital_session');
    localStorage.removeItem('hospital_config');
    localStorage.removeItem('hospital_services');
    localStorage.removeItem('hospital_cashier_config');
    localStorage.removeItem('hospital_tools');
    localStorage.removeItem('hospital_protocols');
    localStorage.removeItem('hospital_medical_acts');
    auth.signOut();
    setInspectingTenant(null);
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
      return <Settings activeTab={activeSettingsTab} setActiveTab={setActiveSettingsTab} user={user} theme={theme} toggleTheme={toggleTheme} />;
    }

    // Protection d'affichage : si le module est désactivé dans les paramètres, bloquer l'affichage
    if (!isModuleActiveAndAvailable(currentModule, hospitalServicesList)) {
      return <ModuleSelector user={user} onSelectModule={setCurrentModule} onLogout={handleLogout} theme={theme} toggleTheme={toggleTheme} />;
    }

    // Protection RBAC stricte : vérifier si l'utilisateur est autorisé pour ce module
    if (!isUserAuthorizedForModule(user, currentModule, customRoles)) {
      return <ModuleSelector user={user} onSelectModule={setCurrentModule} onLogout={handleLogout} theme={theme} toggleTheme={toggleTheme} />;
    }

    switch(currentModule) {
      case Role.ADMIN: return <Dashboard theme={theme} user={user} />;
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
          onBackToDashboard={() => setCurrentModule('DASHBOARD')}
          theme={theme}
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
            theme={theme}
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
            theme={theme}
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

  if ((currentModule === Role.SUPER_ADMIN || isUserSuperAdmin(user)) && !inspectingTenant) {
    const isRealSuperAdmin = isUserSuperAdmin(user);
    if (!isRealSuperAdmin) {
      setCurrentModule('DASHBOARD');
      return null;
    }
    return (
      <div className="min-h-screen bg-[#070910]">
        <ControlCenter 
          currentUser={user} 
          onBackToDashboard={handleLogout}
          onInspectTenant={(clinic) => {
            setInspectingTenant({ id: clinic.id, name: clinic.name });
            setCurrentModule('DASHBOARD');
          }}
        />
      </div>
    );
  }

  // Contrôle de conformité de licence SaaS
  const isLicenseExpired = hospitalLicense.isExpired;
  const isLocalAdmin = user.role === Role.ADMIN || user.roles?.includes('role_admin') || (user as any).isMainAdmin === true;
  const isSuperUser = isUserSuperAdmin(user);

  // Blocage temporaire d'accès en cas de licence expirée pour le personnel médical
  if (isLicenseExpired && !isSuperUser && !isLocalAdmin) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-300">
        <div className="max-w-lg bg-slate-900 border border-rose-500/40 p-8 sm:p-10 rounded-3xl shadow-2xl space-y-6">
          <div className="w-20 h-20 bg-rose-500/15 border border-rose-500/30 text-rose-500 rounded-3xl mx-auto flex items-center justify-center shadow-lg shadow-rose-500/20">
            <ShieldAlert size={44} />
          </div>

          <div className="space-y-2">
            <span className="px-3 py-1 bg-rose-500/20 text-rose-400 border border-rose-500/30 text-[10px] font-black uppercase tracking-widest rounded-full">
              Accès Suspendu • Licence Expirée
            </span>
            <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              Abonnement Expiré
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 font-medium leading-relaxed">
              La licence d'exploitation hospitalière de votre établissement (<strong>{hospitalLicense.clinicName}</strong>) est arrivée à échéance.
            </p>
          </div>

          <div className="p-4 bg-slate-950/80 rounded-2xl border border-white/10 text-xs text-slate-300 space-y-2 text-left">
            <p className="font-bold text-rose-300 flex items-center gap-1.5">
              <AlertTriangle size={15} /> Mesure de sécurité & continuité :
            </p>
            <p className="text-slate-400 leading-relaxed">
              L'accès aux modules cliniques, médicaux et de facturation est temporairement verrouillé jusqu'au renouvellement de la licence. L'ensemble des dossiers médicaux et données patients restent intégralement protégés et sauvegardés.
            </p>
            <div className="pt-2 border-t border-white/10 text-[11px] text-slate-400">
              Veuillez contacter l'administrateur principal de votre établissement ou le support commercial Smart Hosto au <span className="font-mono text-white font-bold">{hospitalLicense.contactPhone}</span>.
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <button
              onClick={handleLogout}
              className="flex-1 py-3.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer"
            >
              Se déconnecter
            </button>
            <a
              href={`mailto:${hospitalLicense.contactEmail}?subject=Renouvellement%20Licence%20SmartHosto%20-%20${encodeURIComponent(hospitalLicense.clinicName)}`}
              className="flex-1 py-3.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 shadow-md shadow-rose-600/30 cursor-pointer"
            >
              Contacter le support
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen flex transition-colors duration-300 ${theme === 'dark' ? 'bg-[#050508] text-zinc-100' : 'bg-[#F1F5F9] text-slate-900'}`}>
      {inspectingTenant && isUserSuperAdmin(user) && (
        <div className="fixed top-0 left-0 right-0 z-[100] bg-gradient-to-r from-purple-900/95 via-rose-900/95 to-slate-900/95 backdrop-blur-md border-b border-white/15 text-white text-xs font-bold px-4 py-2 flex items-center justify-between shadow-xl">
          <div className="flex items-center gap-2.5">
            <span className="px-2 py-0.5 rounded-md bg-rose-500/30 border border-rose-400/40 text-[10px] font-black uppercase tracking-wider text-rose-200">
              Mode Inspection Super Admin
            </span>
            <span className="text-zinc-200">
              Établissement inspecté : <strong className="text-white">{inspectingTenant.name}</strong> <span className="text-zinc-400 font-mono text-[10px]">({inspectingTenant.id})</span>
            </span>
          </div>
          <button
            onClick={() => {
              setInspectingTenant(null);
              setCurrentModule(Role.SUPER_ADMIN);
            }}
            className="px-3 py-1 rounded-lg bg-white/15 hover:bg-white/25 border border-white/20 text-white font-extrabold text-[11px] transition-all cursor-pointer"
          >
            ← Retour au Control Center
          </button>
        </div>
      )}
      {/* 1. Alerte critique d'expiration de licence pour l'administrateur de l'établissement */}
      {isLicenseExpired && isLocalAdmin && !isSuperUser && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-gradient-to-r from-rose-700 via-rose-600 to-rose-700 text-white text-xs font-bold px-4 py-3 flex items-center justify-between shadow-xl border-b border-rose-400/40">
          <div className="flex items-center gap-2.5">
            <ShieldAlert size={18} className="text-white shrink-0 animate-bounce" />
            <span>
              <strong>LICENCE EXPIRÉE :</strong> La licence de votre établissement ({hospitalLicense.clinicName}) est arrivée à échéance. L'accès du personnel est suspendu. Veuillez régulariser votre abonnement.
            </span>
          </div>
          <button 
            onClick={() => {
              setCurrentModule('SETTING');
              setActiveSettingsTab('licence');
            }} 
            className="px-3.5 py-1.5 bg-white text-rose-700 rounded-lg text-xs font-black uppercase tracking-wider hover:bg-rose-50 transition-colors shadow-sm shrink-0 cursor-pointer"
          >
            Gérer ma licence
          </button>
        </div>
      )}

      {/* 2. Bandeau d'avertissement quand la licence approche de son expiration (30 jours ou moins) */}
      {hospitalLicense.isNearingExpiration && !isLicenseExpired && !isSuperUser && (
        <div className={`fixed top-0 left-0 right-0 z-50 text-xs font-bold px-4 py-2.5 flex items-center justify-between shadow-md transition-all ${
          hospitalLicense.isCriticalExpiration
            ? 'bg-gradient-to-r from-rose-600 via-amber-600 to-rose-700 text-white border-b border-rose-400'
            : 'bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 text-amber-950 border-b border-amber-300'
        }`}>
          <div className="flex items-center gap-2.5">
            <AlertTriangle size={18} className="shrink-0" />
            <span>
              <strong>Avertissement Échéance :</strong> Votre abonnement hospitalier ({hospitalLicense.planName}) expire dans{' '}
              <span className="font-black underline decoration-2">{hospitalLicense.daysRemaining} jour{hospitalLicense.daysRemaining > 1 ? 's' : ''}</span>. Renouvelez dès maintenant pour garantir la continuité opérationnelle.
            </span>
          </div>
          <button 
            onClick={() => {
              setCurrentModule('SETTING');
              setActiveSettingsTab('licence');
            }} 
            className="px-3 py-1 rounded-lg bg-black/15 hover:bg-black/25 text-current text-xs font-black uppercase tracking-wider transition-colors shrink-0 cursor-pointer"
          >
            Détails de la licence
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
      
      <main className={`flex-1 min-h-screen relative transition-all duration-300 ${currentModule !== 'DASHBOARD' ? (isSidebarExpanded || isSidebarLocked ? 'md:pl-[308px]' : 'md:pl-[112px]') : 'pl-0'}`}>
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
          <Suspense fallback={<ModuleLoadingFallback theme={theme} />}>
            {renderModule()}
          </Suspense>
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
