import React, { useState, useMemo, useEffect } from 'react';
import { 
  Users, 
  UserCheck, 
  UserX, 
  Plus, 
  Search, 
  Filter, 
  Building2, 
  ShieldCheck, 
  ShieldAlert, 
  Key, 
  Lock, 
  Unlock, 
  Edit, 
  Trash2, 
  Eye, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Calendar, 
  Layers, 
  AlertTriangle, 
  Mail, 
  Phone, 
  MapPin, 
  ArrowRight,
  Shield,
  Loader2,
  DollarSign,
  RefreshCw,
  Copy,
  Check,
  Sparkles
} from 'lucide-react';
import { Role, User as UserType, Licence } from '../../types';
import { ClinicTenant, SubscriptionInvoice } from '../../pages/ControlCenter';
import { SAAS_PLANS, SaaSPlanId } from '../../src/config/plans';
import { CANONICAL_MODULES, hasImplementedModule } from '../../src/config/modules';
import { db, sanitizeData } from '../../src/firebase';
import { doc, setDoc, updateDoc, deleteDoc, addDoc, collection, onSnapshot } from 'firebase/firestore';

interface SuperAdminUsersProps {
  clinics: ClinicTenant[];
  hospitalUsers: UserType[];
  currentUser: UserType | null;
  onRefreshData?: () => void;
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  onNavigateToServices?: (clinicId: string) => void;
}

export const SuperAdminUsers: React.FC<SuperAdminUsersProps> = ({
  clinics,
  hospitalUsers,
  currentUser,
  showToast,
  onNavigateToServices
}) => {
  // Tabs for the Users menu
  const [activeCategory, setActiveCategory] = useState<'ALL' | 'SUPER_ADMINS' | 'HOSPITAL_STRUCTURES'>('ALL');
  
  // Search & Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [filterPlan, setFilterPlan] = useState<string>('ALL');

  // Helper: Automatic Password Generator
  const generateAutoPassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789#@!';
    let pass = 'SH-';
    for (let i = 0; i < 8; i++) {
      pass += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return pass;
  };

  // Modal State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creationType, setCreationType] = useState<'SUPER_ADMIN' | 'STRUCTURE'>('STRUCTURE');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdCredentials, setCreatedCredentials] = useState<{
    type: string;
    title: string;
    name: string;
    username: string;
    password: string;
    email?: string;
  } | null>(null);
  const [copiedPass, setCopiedPass] = useState(false);

  // Selected User for View Details / Edit
  const [viewingAccount, setViewingAccount] = useState<any | null>(null);
  const [editingAccount, setEditingAccount] = useState<any | null>(null);

  // --- Form State for Super Admin Creation ---
  const [superAdminForm, setSuperAdminForm] = useState(() => ({
    name: '',
    username: '',
    email: '',
    password: generateAutoPassword(),
    status: 'ACTIVE' as 'ACTIVE' | 'INACTIVE'
  }));

  // --- Form State for Hospital Structure Creation ---
  const [structureForm, setStructureForm] = useState(() => ({
    name: '',
    id: '', // Unique slug/ID
    email: '',
    phone: '',
    address: '',
    city: '',
    country: 'Sénégal',
    structureType: 'Clinique' as 'Cabinet médical' | 'Centre médical' | 'Clinique' | 'Hôpital' | 'Maternité',
    responsibleUser: '',
    adminUsername: '',
    adminPassword: generateAutoPassword(),
    // License & Quota
    licence_id: 'licence_basic',
    plan: 'STANDARD' as SaaSPlanId,
    startDate: new Date().toISOString().split('T')[0],
    durationValue: 1,
    durationUnit: 'Années' as 'Mois' | 'Années',
    extraOptions: [] as string[]
  }));

  // Catalog of Licenses & Quotas from Firestore licences collection
  const [availableLicences, setAvailableLicences] = useState<Licence[]>([
    {
      id: 'licence_basic',
      nom_licence: 'Basic',
      max_users: 5,
      monthlyPriceFCFA: 350000,
      description: 'Pour cabinets et centres de proximité'
    },
    {
      id: 'licence_pro',
      nom_licence: 'Pro',
      max_users: 25,
      monthlyPriceFCFA: 950000,
      description: 'Pour cliniques et polycliniques'
    },
    {
      id: 'licence_enterprise',
      nom_licence: 'Enterprise',
      max_users: 100,
      monthlyPriceFCFA: 2500000,
      description: 'Pour grands hôpitaux et CHU'
    }
  ]);

  // Sync with Firestore licences collection
  useEffect(() => {
    const unsubLic = onSnapshot(collection(db, 'licences'), (snapshot) => {
      if (!snapshot.empty) {
        const licList: Licence[] = snapshot.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
        setAvailableLicences(licList);
      }
    }, (err) => {
      console.warn('Note: licences snapshot in SuperAdminUsers:', err);
    });
    return () => unsubLic();
  }, []);

  // Dynamic Contractual Plans catalog from Firestore saas_plans
  const [availablePlans, setAvailablePlans] = useState<Record<string, {
    id: string;
    label: string;
    description?: string;
    monthlyPriceFCFA: number;
    includedServiceIds: string[];
    badgeColor?: string;
    status?: string;
  }>>(() => {
    const initial: Record<string, any> = {};
    Object.keys(SAAS_PLANS).forEach(k => {
      initial[k] = SAAS_PLANS[k as SaaSPlanId];
    });
    return initial;
  });

  // Sync with Firestore saas_plans collection
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'saas_plans'), (snapshot) => {
      const dbPlans: Record<string, any> = {};
      snapshot.forEach(doc => {
        const data = doc.data();
        if (data && data.id) {
          dbPlans[data.id] = data;
        }
      });
      if (Object.keys(dbPlans).length > 0) {
        setAvailablePlans(prev => ({
          ...prev,
          ...dbPlans
        }));
      }
    }, (err) => {
      console.warn('Note: saas_plans snapshot in SuperAdminUsers:', err);
    });
    return () => unsub();
  }, []);

  // Computed total duration in months
  const totalMonths = useMemo(() => {
    const val = Number(structureForm.durationValue) || 1;
    return structureForm.durationUnit === 'Années' ? val * 12 : val;
  }, [structureForm.durationValue, structureForm.durationUnit]);

  // Computed Expiration Date for structure creation
  const computedExpirationDate = useMemo(() => {
    if (!structureForm.startDate) return '';
    const start = new Date(structureForm.startDate);
    const end = new Date(start);
    end.setMonth(end.getMonth() + totalMonths);
    return end.toISOString().split('T')[0];
  }, [structureForm.startDate, totalMonths]);

  // Selected Plan definition from database or catalog
  const selectedPlanConfig = useMemo(() => {
    const p = availablePlans[structureForm.plan] || SAAS_PLANS[structureForm.plan as SaaSPlanId] || SAAS_PLANS.STANDARD;
    return {
      label: p.label || 'Standard',
      monthlyPriceFCFA: p.monthlyPriceFCFA || 950000,
      includedServiceIds: p.includedServiceIds || ['SRV-ACCUEIL', 'SRV-CONSULTATION', 'SRV-CAISSE']
    };
  }, [availablePlans, structureForm.plan]);

  // Unified Accounts List (Super Admins + Hospital Users / Structures)
  const unifiedAccounts = useMemo(() => {
    const list: any[] = [];

    // 1. Super Admins from hospitalUsers or explicit role
    hospitalUsers.forEach(u => {
      const isSuper = u.role === Role.SUPER_ADMIN || u.roles?.includes('role_super_admin') || (u.username || '').toLowerCase() === 'superadmin' || (u.username || '').toLowerCase() === 'sa1';
      if (isSuper) {
        list.push({
          id: u.id,
          name: u.name || u.username,
          username: u.username,
          email: u.email || 'N/A',
          accountType: 'SUPER_ADMIN',
          roleLabel: 'Super Administrateur',
          structureName: 'Plateforme Centrale SmartHosto',
          createdAt: u.createdAt || 'N/A',
          status: u.status || 'ACTIVE',
          licenseInfo: 'Privilèges Système Complets',
          licenseExpiry: 'Illimité',
          originalUser: u
        });
      }
    });

    // If SA1 superadmin account is not in the db list, provide representation
    if (!list.some(a => (a.username || '').toLowerCase() === 'sa1')) {
      list.push({
        id: 'sa1_superadmin',
        name: 'Super Administrateur SA1',
        username: 'SA1',
        email: 'sa1@smarthosto.com',
        accountType: 'SUPER_ADMIN',
        roleLabel: 'Super Administrateur Principal',
        structureName: 'Plateforme Centrale SmartHosto',
        createdAt: '2026-10-12',
        status: 'ACTIVE',
        licenseInfo: 'Privilèges Système Complets',
        licenseExpiry: 'Illimité',
        isMaster: true
      });
    }

    // 2. Hospital Client Structures
    clinics.forEach(c => {
      list.push({
        id: c.id,
        name: c.name,
        username: c.responsibleUser || `admin_${c.id.substring(0, 8)}`,
        email: c.email || 'N/A',
        phone: c.phone || 'N/A',
        accountType: 'STRUCTURE',
        roleLabel: 'Administrateur d\'Établissement',
        structureName: `${c.name} (${c.structureType || 'Clinique'})`,
        createdAt: c.createdAt || 'N/A',
        status: c.status || 'ACTIVE',
        licenseInfo: `Formule ${c.licenseType}`,
        licenseExpiry: c.licenseEnd || 'Non spécifiée',
        originalClinic: c
      });
    });

    return list;
  }, [hospitalUsers, clinics]);

  // Filtered Accounts
  const filteredAccounts = useMemo(() => {
    return unifiedAccounts.filter(acc => {
      // Category filter
      if (activeCategory === 'SUPER_ADMINS' && acc.accountType !== 'SUPER_ADMIN') return false;
      if (activeCategory === 'HOSPITAL_STRUCTURES' && acc.accountType !== 'STRUCTURE') return false;

      // Status filter
      if (filterStatus !== 'ALL' && acc.status !== filterStatus) return false;

      // Plan filter (for structures)
      if (filterPlan !== 'ALL' && acc.accountType === 'STRUCTURE') {
        const clinicPlan = acc.originalClinic?.licenseType;
        if (clinicPlan !== filterPlan) return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matches = 
          (acc.name || '').toLowerCase().includes(q) ||
          (acc.username || '').toLowerCase().includes(q) ||
          (acc.email || '').toLowerCase().includes(q) ||
          (acc.structureName || '').toLowerCase().includes(q) ||
          (acc.id || '').toLowerCase().includes(q);
        if (!matches) return false;
      }

      return true;
    });
  }, [unifiedAccounts, activeCategory, filterStatus, filterPlan, searchQuery]);

  // Handler: Toggle Account Status (Suspend / Reactivate)
  const handleToggleStatus = async (account: any) => {
    if (account.username === 'superadmin' || account.isMaster) {
      showToast('Impossible de suspendre le Super Administrateur racine', 'info');
      return;
    }

    const newStatus = account.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    try {
      if (account.accountType === 'SUPER_ADMIN') {
        // Update in hospital_users
        await updateDoc(doc(db, 'hospital_users', account.id), sanitizeData({
          status: newStatus,
          updatedAt: new Date().toISOString()
        }));
      } else if (account.accountType === 'STRUCTURE') {
        // Update in saas_clinics
        await updateDoc(doc(db, 'saas_clinics', account.id), sanitizeData({
          status: newStatus,
          updatedAt: new Date().toISOString()
        }));
      }

      // Audit log
      await addDoc(collection(db, 'saas_logs'), sanitizeData({
        timestamp: new Date().toISOString(),
        user: currentUser?.username || 'superadmin',
        action: newStatus === 'ACTIVE' ? 'USER_REACTIVATION' : 'USER_SUSPENSION',
        details: `Compte ${account.username} (${account.accountType}) basculé à ${newStatus}`,
        category: 'SECURITY'
      }));

      showToast(`Compte ${account.name} ${newStatus === 'ACTIVE' ? 'réactivé' : 'suspendu'} avec succès`, 'success');
    } catch (err) {
      console.error('Error toggling account status:', err);
      showToast('Erreur lors de la modification du statut', 'error');
    }
  };

  // Handler: Create Super Administrator
  const handleCreateSuperAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!superAdminForm.username || !superAdminForm.password) {
      showToast("L'identifiant de connexion et le mot de passe sont requis", 'info');
      return;
    }

    setIsSubmitting(true);
    try {
      const cleanUsername = superAdminForm.username.trim().toLowerCase();
      const finalName = superAdminForm.name.trim() || cleanUsername;
      const finalEmail = superAdminForm.email.trim().toLowerCase() || `${cleanUsername}@smarthosto.com`;

      const newUserId = `sa_${Date.now()}`;
      const newUser: UserType = {
        id: newUserId,
        username: cleanUsername,
        name: finalName,
        email: finalEmail,
        password: superAdminForm.password,
        role: Role.SUPER_ADMIN,
        roles: ['role_super_admin', 'role_admin'],
        status: superAdminForm.status,
        profession: 'Super Administrateur SaaS',
        token: 'token_sa',
        createdAt: new Date().toISOString()
      };

      await setDoc(doc(db, 'hospital_users', newUserId), sanitizeData(newUser));

      // Audit Log
      await addDoc(collection(db, 'saas_logs'), sanitizeData({
        timestamp: new Date().toISOString(),
        user: currentUser?.username || 'superadmin',
        action: 'SUPER_ADMIN_CREATION',
        details: `Nouveau Super Administrateur créé : ${newUser.username} (${newUser.email})`,
        category: 'SECURITY'
      }));

      // Store created credentials for confirmation modal
      setCreatedCredentials({
        type: 'SUPER_ADMIN',
        title: 'Super Administrateur',
        name: newUser.name,
        username: newUser.username,
        password: superAdminForm.password,
        email: newUser.email
      });

      showToast(`Super Administrateur ${newUser.name} créé avec succès`, 'success');
      setShowCreateModal(false);
      setSuperAdminForm({
        name: '',
        username: '',
        email: '',
        password: generateAutoPassword(),
        status: 'ACTIVE'
      });
    } catch (err) {
      console.error('Error creating super admin:', err);
      showToast('Erreur lors de la création du compte', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handler: Create Hospital Structure with Admin Account, License & Traceability
  const handleCreateStructure = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!structureForm.adminUsername || !structureForm.adminPassword) {
      showToast("L'identifiant admin et le mot de passe sont requis", 'info');
      return;
    }

    setIsSubmitting(true);
    try {
      // 1. Generate Unique Identifiers & Fallbacks for Optional Fields
      const cleanAdminUsername = structureForm.adminUsername.trim().toLowerCase();
      const rawSlug = structureForm.id.trim() || structureForm.name.trim().toLowerCase().replace(/[^a-z0-9]/g, '_') || cleanAdminUsername;
      const clinicId = rawSlug.startsWith('tenant_') ? rawSlug : `tenant_${rawSlug}_${Math.floor(100 + Math.random() * 900)}`;
      const adminUserId = `usr_${clinicId}_admin`;

      const finalStructureName = structureForm.name.trim() || `Centre ${cleanAdminUsername}`;
      const finalResponsibleUser = structureForm.responsibleUser.trim() || `Dr. ${cleanAdminUsername}`;
      const finalEmail = structureForm.email.trim().toLowerCase() || `admin@${rawSlug}.smarthosto.internal`;
      const finalCountry = structureForm.country.trim() || 'Sénégal';
      const finalCity = structureForm.city.trim() || 'Dakar';
      const finalPhone = structureForm.phone.trim() || '+221 33 000 00 00';
      const finalAddress = structureForm.address.trim() || 'Adresse principale';

      // 2. Fetch Selected Plan configuration (from DB availablePlans or default SAAS_PLANS)
      const selectedPlan = availablePlans[structureForm.plan] || SAAS_PLANS[structureForm.plan as SaaSPlanId] || SAAS_PLANS.STANDARD;
      const planMonthlyPrice = selectedPlan.monthlyPriceFCFA || 950000;
      const planIncludedServices = selectedPlan.includedServiceIds || ['SRV-ACCUEIL', 'SRV-CONSULTATION', 'SRV-CAISSE'];

      // Build Entitlements & Activated Modules from Catalog
      const servicesConfig: Record<string, any> = {};
      const activatedModulesMap: Record<string, boolean> = {};

      // Mark all plan-included services as authorized & active
      planIncludedServices.forEach(srvId => {
        if (hasImplementedModule(srvId)) {
          servicesConfig[srvId] = {
            isAuthorized: true,
            isCustomGranted: false,
            status: 'active',
            is_active: true
          };
          activatedModulesMap[srvId] = true;
        }
      });

      // Add extra options if selected
      structureForm.extraOptions.forEach(optId => {
        if (hasImplementedModule(optId)) {
          servicesConfig[optId] = {
            isAuthorized: true,
            isCustomGranted: true,
            status: 'active',
            is_active: true
          };
          activatedModulesMap[optId] = true;
        }
      });

      // Fetch Selected Licence and Quota Limit
      const selectedLicence = availableLicences.find(l => l.id === structureForm.licence_id) || 
        availableLicences.find(l => l.nom_licence.toUpperCase() === String(structureForm.plan).toUpperCase()) || 
        availableLicences[0];
      const selectedMaxUsers = selectedLicence?.max_users || (structureForm.plan === 'ENTERPRISE' ? 100 : structureForm.plan === 'PREMIUM' ? 50 : 5);
      const selectedLicenceId = selectedLicence?.id || structureForm.licence_id || 'licence_basic';

      // 3. Create Structure Tenant in saas_clinics & hospitals table
      const newClinic: ClinicTenant = {
        id: clinicId,
        name: finalStructureName,
        address: finalAddress,
        city: finalCity,
        country: finalCountry,
        phone: finalPhone,
        email: finalEmail,
        responsibleUser: finalResponsibleUser,
        createdAt: new Date().toISOString().split('T')[0],
        status: 'ACTIVE',
        licence_id: selectedLicenceId,
        licenceId: selectedLicenceId,
        nom_licence: selectedLicence?.nom_licence || structureForm.plan,
        licenseType: structureForm.plan,
        licenseStart: structureForm.startDate,
        licenseEnd: computedExpirationDate,
        licensePrice: planMonthlyPrice,
        autoRenew: true,
        structureType: structureForm.structureType,
        quotas: {
          maxUsers: selectedMaxUsers,
          maxPatients: 5000,
          maxStorageGB: 50,
          maxSites: 1,
          maxMonthlyConsultations: 1000,
          maxMonthlyHospitalizations: 100
        },
        usage: {
          activeUsers: 1,
          totalPatients: 0,
          storageUsedGB: 0.1,
          sitesUsed: 1,
          monthlyConsultations: 0,
          monthlyHospitalizations: 0,
          monthlyPrescriptions: 0,
          totalExams: 0,
          dailyConnections: 0
        },
        activatedModules: activatedModulesMap,
        activatedTools: {
          "Ordonnance intelligente": true,
          "Calculateur de posologie": true
        }
      };

      // Add servicesConfig to clinic document
      const clinicPayload = {
        ...newClinic,
        servicesConfig
      };
      await setDoc(doc(db, 'saas_clinics', clinicId), sanitizeData(clinicPayload));

      // Update Hospital table with foreign key: licence_id
      await setDoc(doc(db, 'hospitals', clinicId), sanitizeData({
        id: clinicId,
        name: finalStructureName,
        licence_id: selectedLicenceId,
        licenceId: selectedLicenceId,
        nom_licence: selectedLicence?.nom_licence || structureForm.plan,
        max_users: selectedMaxUsers,
        address: finalAddress,
        city: finalCity,
        country: finalCountry,
        phone: finalPhone,
        email: finalEmail,
        responsibleUser: finalResponsibleUser,
        status: 'ACTIVE',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }));

      // 4. Create Initial Hospital Admin User in hospital_users
      const newAdminUser: UserType = {
        id: adminUserId,
        username: cleanAdminUsername,
        name: finalResponsibleUser,
        email: finalEmail,
        password: structureForm.adminPassword,
        role: Role.ADMIN,
        roles: ['role_admin'],
        status: 'ACTIVE',
        profession: 'Administrateur d\'Établissement',
        token: `token_${clinicId}`,
        createdAt: new Date().toISOString(),
        forcePasswordChange: true
      };

      await setDoc(doc(db, 'hospital_users', adminUserId), sanitizeData({
        ...newAdminUser,
        clinicId,
        hospital_id: clinicId,
        structureName: finalStructureName,
        isMainAdmin: true,
        createdBySuperAdmin: true,
        forcePasswordChange: true
      }));

      await setDoc(doc(db, 'users', adminUserId), sanitizeData({
        ...newAdminUser,
        clinicId,
        hospital_id: clinicId,
        structureName: finalStructureName,
        isMainAdmin: true,
        createdBySuperAdmin: true,
        forcePasswordChange: true
      }));

      // 5. Generate Initial Subscription Invoice in saas_invoices
      const initialInvoice: SubscriptionInvoice = {
        id: `INV-${Date.now().toString().slice(-6)}`,
        clinicId,
        clinicName: finalStructureName,
        plan: structureForm.plan,
        amount: planMonthlyPrice * (totalMonths || 1),
        currency: 'FCFA',
        dueDate: computedExpirationDate,
        paidDate: new Date().toISOString().split('T')[0],
        status: 'PAID',
        paymentMethod: 'Virement bancaire'
      };

      await addDoc(collection(db, 'saas_invoices'), sanitizeData({
        ...initialInvoice,
        createdAt: new Date().toISOString()
      }));

      // 6. Traceability in saas_logs
      await addDoc(collection(db, 'saas_logs'), sanitizeData({
        timestamp: new Date().toISOString(),
        user: currentUser?.username || 'superadmin',
        action: 'STRUCTURE_ONBOARDING',
        details: `Nouvel établissement provisionné : "${finalStructureName}" (ID: ${clinicId}) avec formule ${structureForm.plan}. Admin créé : [${cleanAdminUsername}]`,
        category: 'LICENSE',
        clinicId,
        clinicName: finalStructureName
      }));

      // Store created credentials for confirmation modal
      setCreatedCredentials({
        type: 'STRUCTURE',
        title: `Centre Hospitalier (${finalStructureName})`,
        name: finalResponsibleUser,
        username: cleanAdminUsername,
        password: structureForm.adminPassword,
        email: finalEmail
      });

      showToast(`Structure "${finalStructureName}" et son compte administrateur provisionnés avec succès !`, 'success');
      setShowCreateModal(false);
      // Reset form
      setStructureForm({
        name: '',
        id: '',
        email: '',
        phone: '',
        address: '',
        city: '',
        country: 'Sénégal',
        structureType: 'Clinique',
        responsibleUser: '',
        adminUsername: '',
        adminPassword: generateAutoPassword(),
        plan: 'STANDARD',
        startDate: new Date().toISOString().split('T')[0],
        durationValue: 1,
        durationUnit: 'Années',
        extraOptions: []
      });
    } catch (err) {
      console.error('Error creating hospital structure:', err);
      showToast('Erreur lors du provisionnement de la structure', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      
      {/* HEADER & ACTION BAR */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/60 border border-white/10 p-5 rounded-3xl backdrop-blur-xl">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest bg-purple-500/20 text-purple-400 border border-purple-500/30">
              Gouvernance des Accès
            </span>
            <span className="text-xs text-slate-400 font-bold">• Super Administrateurs & Structures Clientes</span>
          </div>
          <h2 className="text-2xl font-black text-white mt-1">Gestion Centrale des Comptes</h2>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="px-5 py-3 bg-rose-600 hover:bg-rose-500 text-white rounded-2xl font-black text-xs uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-rose-900/30 transition-all cursor-pointer self-start sm:self-auto"
        >
          <Plus size={16} /> Créer un Utilisateur / Structure
        </button>
      </div>

      {/* CATEGORY TABS & SEARCH / FILTERS */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        
        {/* Category switcher */}
        <div className="flex items-center gap-1 bg-slate-950/60 p-1.5 rounded-2xl border border-white/5">
          <button
            onClick={() => setActiveCategory('ALL')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeCategory === 'ALL' ? 'bg-rose-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
            }`}
          >
            Tous les Comptes ({unifiedAccounts.length})
          </button>
          <button
            onClick={() => setActiveCategory('SUPER_ADMINS')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeCategory === 'SUPER_ADMINS' ? 'bg-rose-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
            }`}
          >
            <ShieldCheck size={14} /> Super Administrateurs ({unifiedAccounts.filter(a => a.accountType === 'SUPER_ADMIN').length})
          </button>
          <button
            onClick={() => setActiveCategory('HOSPITAL_STRUCTURES')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeCategory === 'HOSPITAL_STRUCTURES' ? 'bg-rose-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Building2 size={14} /> Structures Hospitalières ({clinics.length})
          </button>
        </div>

        {/* Search bar & quick filters */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 md:w-64">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
            <input 
              type="text"
              placeholder="Rechercher nom, login, structure..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-900/50 border border-white/10 rounded-2xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500"
            />
          </div>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-3 py-2 bg-slate-900/50 border border-white/10 rounded-2xl text-xs text-slate-300 focus:outline-none focus:border-rose-500"
          >
            <option value="ALL">Tous statuts</option>
            <option value="ACTIVE">Actifs</option>
            <option value="SUSPENDED">Suspendus</option>
          </select>
        </div>

      </div>

      {/* ACCOUNTS TABLE */}
      <div className="bg-slate-900/50 border border-white/10 rounded-3xl overflow-hidden backdrop-blur-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-white/5 bg-slate-950/40 text-[10px] font-black text-slate-400 uppercase tracking-wider">
                <th className="py-4 pl-6">Compte / Identifiant</th>
                <th className="py-4">Structure Associée</th>
                <th className="py-4">Catégorie</th>
                <th className="py-4">Rôle</th>
                <th className="py-4">Licence / Validité</th>
                <th className="py-4">Statut</th>
                <th className="py-4 text-right pr-6">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-xs">
              {filteredAccounts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500">
                    <Users size={36} className="mx-auto mb-2 opacity-40" />
                    <p className="font-bold">Aucun compte ne correspond à vos critères de recherche.</p>
                  </td>
                </tr>
              ) : (
                filteredAccounts.map(account => {
                  const isSuper = account.accountType === 'SUPER_ADMIN';
                  const isActive = account.status === 'ACTIVE';

                  return (
                    <tr key={account.id} className="hover:bg-white/[0.02] transition-colors">
                      {/* Name / Username */}
                      <td className="py-4 pl-6">
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs ${
                            isSuper 
                              ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30' 
                              : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                          }`}>
                            {isSuper ? <ShieldCheck size={18} /> : <Building2 size={18} />}
                          </div>
                          <div>
                            <p className="font-extrabold text-white">{account.name}</p>
                            <p className="text-[11px] font-mono text-slate-400">@{account.username}</p>
                          </div>
                        </div>
                      </td>

                      {/* Associated Structure */}
                      <td className="py-4">
                        <p className="font-bold text-slate-200">{account.structureName}</p>
                        <p className="text-[10px] text-slate-500">{account.email}</p>
                      </td>

                      {/* Account Type */}
                      <td className="py-4">
                        <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                          isSuper 
                            ? 'bg-purple-500/10 text-purple-300 border border-purple-500/20' 
                            : 'bg-blue-500/10 text-blue-300 border border-blue-500/20'
                        }`}>
                          {isSuper ? 'Super Admin' : 'Structure Hospitalière'}
                        </span>
                      </td>

                      {/* Role */}
                      <td className="py-4">
                        <span className="font-bold text-slate-300">{account.roleLabel}</span>
                      </td>

                      {/* License Info */}
                      <td className="py-4">
                        <p className="font-bold text-slate-200">{account.licenseInfo}</p>
                        <p className="text-[10px] text-slate-400">Exp: {account.licenseExpiry}</p>
                      </td>

                      {/* Status Badge */}
                      <td className="py-4">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black ${
                          isActive 
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                            : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                        }`}>
                          {isActive ? <CheckCircle2 size={10} /> : <XCircle size={10} />}
                          {isActive ? 'ACTIF' : 'SUSPENDU'}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="py-4 text-right pr-6">
                        <div className="flex items-center justify-end gap-2">
                          {/* Services management shortcut if structure */}
                          {!isSuper && onNavigateToServices && (
                            <button
                              onClick={() => onNavigateToServices(account.id)}
                              title="Gérer les services de cette structure"
                              className="p-2 bg-white/5 hover:bg-rose-600 hover:text-white text-slate-400 rounded-xl transition-all"
                            >
                              <Layers size={14} />
                            </button>
                          )}

                          {/* View account details */}
                          <button
                            onClick={() => setViewingAccount(account)}
                            title="Voir la fiche détaillée"
                            className="p-2 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white rounded-xl transition-all"
                          >
                            <Eye size={14} />
                          </button>

                          {/* Suspend / Reactivate */}
                          {!account.isMaster && (
                            <button
                              onClick={() => handleToggleStatus(account)}
                              title={isActive ? 'Suspendre ce compte' : 'Réactiver ce compte'}
                              className={`p-2 rounded-xl transition-all ${
                                isActive 
                                  ? 'bg-white/5 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400' 
                                  : 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
                              }`}
                            >
                              {isActive ? <Lock size={14} /> : <Unlock size={14} />}
                            </button>
                          )}
                        </div>
                      </td>

                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL: CREATE ACCOUNT (SUPER ADMIN OR HOSPITAL STRUCTURE) */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
          <div className="bg-slate-900 border border-white/10 rounded-3xl max-w-2xl w-full p-6 md:p-8 relative max-h-[90vh] overflow-y-auto">
            
            <div className="flex justify-between items-center mb-6">
              <div>
                <span className="text-[10px] uppercase font-black tracking-widest text-rose-500">Provisionnement</span>
                <h3 className="text-xl font-black text-white mt-0.5">Création d'un Nouveau Compte</h3>
              </div>
              <button 
                onClick={() => setShowCreateModal(false)}
                className="p-2 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white rounded-xl transition-all"
              >
                ✕
              </button>
            </div>

            {/* Step 1: Select Type */}
            <div className="grid grid-cols-2 gap-3 mb-6">
              <button
                type="button"
                onClick={() => setCreationType('STRUCTURE')}
                className={`p-4 rounded-2xl border text-left transition-all ${
                  creationType === 'STRUCTURE'
                    ? 'bg-rose-500/10 border-rose-500 text-white'
                    : 'bg-slate-950/40 border-white/5 text-slate-400 hover:text-white'
                }`}
              >
                <Building2 size={24} className="mb-2 text-rose-400" />
                <p className="font-extrabold text-sm">Centre Hospitalier</p>
                <p className="text-[11px] text-slate-400 mt-1">Nouvelle clinique avec sa licence, modules et admin initial</p>
              </button>

              <button
                type="button"
                onClick={() => setCreationType('SUPER_ADMIN')}
                className={`p-4 rounded-2xl border text-left transition-all ${
                  creationType === 'SUPER_ADMIN'
                    ? 'bg-purple-500/10 border-purple-500 text-white'
                    : 'bg-slate-950/40 border-white/5 text-slate-400 hover:text-white'
                }`}
              >
                <ShieldCheck size={24} className="mb-2 text-purple-400" />
                <p className="font-extrabold text-sm">Super Administrateur</p>
                <p className="text-[11px] text-slate-400 mt-1">Opérateur autorisé avec privilèges de gestion de la plateforme</p>
              </button>
            </div>

            {/* FORM A: SUPER ADMIN CREATION */}
            {creationType === 'SUPER_ADMIN' && (
              <form onSubmit={handleCreateSuperAdmin} className="space-y-4">
                <div className="p-3 bg-purple-500/10 border border-purple-500/20 rounded-2xl text-xs text-purple-300">
                  <ShieldAlert size={16} className="inline mr-2" />
                  Ce compte disposera d'un accès intégral à la gouvernance globale de SmartHosto et aux structures clientes.
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-slate-400">Nom Complet</label>
                    <input 
                      type="text"
                      placeholder="Ex: Dr. Mamadou Diallo"
                      value={superAdminForm.name}
                      onChange={(e) => setSuperAdminForm({...superAdminForm, name: e.target.value})}
                      className="w-full mt-1.5 px-4 py-2.5 bg-slate-950 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-purple-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-400">Identifiant de Connexion *</label>
                    <input 
                      type="text"
                      required
                      placeholder="Ex: mamadou_sa"
                      value={superAdminForm.username}
                      onChange={(e) => setSuperAdminForm({...superAdminForm, username: e.target.value})}
                      className="w-full mt-1.5 px-4 py-2.5 bg-slate-950 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-purple-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-slate-400">Adresse E-mail</label>
                    <input 
                      type="email"
                      placeholder="Ex: mamadou@smarthosto.com"
                      value={superAdminForm.email}
                      onChange={(e) => setSuperAdminForm({...superAdminForm, email: e.target.value})}
                      className="w-full mt-1.5 px-4 py-2.5 bg-slate-950 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-purple-500"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between items-center">
                      <label className="text-xs font-bold text-slate-400">
                        Mot de Passe <span className="text-[10px] text-purple-400 font-bold">(Généré automatiquement)</span> *
                      </label>
                      <button
                        type="button"
                        onClick={() => setSuperAdminForm(prev => ({ ...prev, password: generateAutoPassword() }))}
                        className="text-[10px] font-bold text-purple-400 hover:text-purple-300 flex items-center gap-1 transition-colors cursor-pointer"
                        title="Générer un autre mot de passe"
                      >
                        <RefreshCw size={11} /> Régénérer
                      </button>
                    </div>
                    <div className="relative mt-1.5">
                      <input 
                        type="text"
                        required
                        value={superAdminForm.password}
                        onChange={(e) => setSuperAdminForm({...superAdminForm, password: e.target.value})}
                        className="w-full px-4 py-2.5 bg-purple-950/20 border border-purple-500/30 rounded-xl text-xs font-mono font-bold text-purple-200 focus:outline-none focus:border-purple-500"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-white/5">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="px-5 py-2.5 rounded-xl text-xs font-bold text-slate-400 hover:text-white transition-colors"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-6 py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-purple-900/30 transition-all disabled:opacity-50"
                  >
                    {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
                    Créer le Super Administrateur
                  </button>
                </div>
              </form>
            )}

            {/* FORM B: HOSPITAL STRUCTURE CREATION */}
            {creationType === 'STRUCTURE' && (
              <form onSubmit={handleCreateStructure} className="space-y-4">
                
                {/* 1. Informations Structure */}
                <div className="border-b border-white/5 pb-4">
                  <h4 className="text-xs font-black uppercase tracking-wider text-rose-400 mb-3">1. Informations de la Structure</h4>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-bold text-slate-400">Nom de la Structure</label>
                      <input 
                        type="text"
                        placeholder="Ex: Clinique Pasteur Dakar"
                        value={structureForm.name}
                        onChange={(e) => setStructureForm({...structureForm, name: e.target.value})}
                        className="w-full mt-1 px-3 py-2 bg-slate-950 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-rose-500"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-400">Type d'Établissement</label>
                      <select 
                        value={structureForm.structureType}
                        onChange={(e: any) => setStructureForm({...structureForm, structureType: e.target.value})}
                        className="w-full mt-1 px-3 py-2 bg-slate-950 border border-white/10 rounded-xl text-xs text-slate-300 focus:outline-none focus:border-rose-500"
                      >
                        <option value="Clinique">Clinique Médico-Chirurgicale</option>
                        <option value="Centre médical">Centre Médical</option>
                        <option value="Cabinet médical">Cabinet Médical</option>
                        <option value="Hôpital">Hôpital Général</option>
                        <option value="Maternité">Maternité & Clinique Obstétricale</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
                    <div>
                      <label className="text-xs font-bold text-slate-400">Ville</label>
                      <input 
                        type="text"
                        placeholder="Ex: Dakar"
                        value={structureForm.city}
                        onChange={(e) => setStructureForm({...structureForm, city: e.target.value})}
                        className="w-full mt-1 px-3 py-2 bg-slate-950 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-rose-500"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-400">Pays</label>
                      <input 
                        type="text"
                        placeholder="Ex: Sénégal"
                        value={structureForm.country}
                        onChange={(e) => setStructureForm({...structureForm, country: e.target.value})}
                        className="w-full mt-1 px-3 py-2 bg-slate-950 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-rose-500"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-400">Téléphone Contact</label>
                      <input 
                        type="text"
                        placeholder="+221 33 000 00 00"
                        value={structureForm.phone}
                        onChange={(e) => setStructureForm({...structureForm, phone: e.target.value})}
                        className="w-full mt-1 px-3 py-2 bg-slate-950 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-rose-500"
                      />
                    </div>
                  </div>
                </div>

                {/* 2. Responsable & Compte Administrateur Initial */}
                <div className="border-b border-white/5 pb-4">
                  <h4 className="text-xs font-black uppercase tracking-wider text-rose-400 mb-3">2. Compte Administrateur Local Initial</h4>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs font-bold text-slate-400">Nom du Responsable</label>
                      <input 
                        type="text"
                        placeholder="Ex: Dr. Awa Diop"
                        value={structureForm.responsibleUser}
                        onChange={(e) => setStructureForm({...structureForm, responsibleUser: e.target.value})}
                        className="w-full mt-1 px-3 py-2 bg-slate-950 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-rose-500"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-400">Identifiant Login Admin *</label>
                      <input 
                        type="text"
                        required
                        placeholder="Ex: admin_pasteur"
                        value={structureForm.adminUsername}
                        onChange={(e) => setStructureForm({...structureForm, adminUsername: e.target.value})}
                        className="w-full mt-1 px-3 py-2 bg-slate-950 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-rose-500"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between items-center">
                        <label className="text-xs font-bold text-slate-400">
                          Mot de Passe <span className="text-[10px] text-rose-400 font-bold">(Auto)</span> *
                        </label>
                        <button
                          type="button"
                          onClick={() => setStructureForm(prev => ({ ...prev, adminPassword: generateAutoPassword() }))}
                          className="text-[10px] font-bold text-rose-400 hover:text-rose-300 flex items-center gap-1 transition-colors cursor-pointer"
                          title="Générer un autre mot de passe"
                        >
                          <RefreshCw size={11} /> Régénérer
                        </button>
                      </div>
                      <input 
                        type="text"
                        required
                        value={structureForm.adminPassword}
                        onChange={(e) => setStructureForm({...structureForm, adminPassword: e.target.value})}
                        className="w-full mt-1 px-3 py-2 bg-rose-950/20 border border-rose-500/30 rounded-xl text-xs font-mono font-bold text-rose-200 focus:outline-none focus:border-rose-500"
                      />
                    </div>
                  </div>
                </div>

                {/* 3. Licence Commerciale & Quotas Utilisateurs */}
                <div>
                  <h4 className="text-xs font-black uppercase tracking-wider text-rose-400 mb-3">3. Licence & Quotas d'Utilisateurs (SaaS Multi-Tenant)</h4>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs font-bold text-slate-400 flex items-center justify-between">
                        <span>Licence du Centre (Quota) *</span>
                        <span className="text-[10px] text-emerald-400 font-bold">Obligatoire</span>
                      </label>
                      <select 
                        required
                        value={structureForm.licence_id}
                        onChange={(e: any) => {
                          const licId = e.target.value;
                          const found = availableLicences.find(l => l.id === licId);
                          const planKey = (found?.nom_licence || 'STANDARD').toUpperCase();
                          setStructureForm({
                            ...structureForm,
                            licence_id: licId,
                            plan: (availablePlans[planKey] ? planKey : structureForm.plan) as SaaSPlanId
                          });
                        }}
                        className="w-full mt-1 px-3 py-2 bg-slate-950 border border-emerald-500/40 rounded-xl text-xs font-bold text-emerald-300 focus:outline-none focus:border-rose-500"
                      >
                        <option value="" disabled>-- Sélectionner une Licence --</option>
                        {availableLicences.map(lic => (
                          <option key={lic.id} value={lic.id}>
                            {lic.nom_licence} (Max {lic.max_users} utilisateurs)
                          </option>
                        ))}
                      </select>
                      <p className="text-[10px] text-slate-400 mt-1">
                        {availableLicences.find(l => l.id === structureForm.licence_id) 
                          ? `Limite autorisée : ${availableLicences.find(l => l.id === structureForm.licence_id)?.max_users} utilisateurs`
                          : 'Plafond strict pour ce centre'}
                      </p>
                    </div>

                    <div>
                      <label className="text-xs font-bold text-slate-400">Durée d'Engagement *</label>
                      <div className="flex items-center gap-1.5 mt-1">
                        <input 
                          type="number"
                          required
                          min={1}
                          max={100}
                          value={structureForm.durationValue}
                          onChange={(e) => setStructureForm({...structureForm, durationValue: Math.max(1, parseInt(e.target.value) || 1)})}
                          className="w-1/2 px-3 py-2 bg-slate-950 border border-white/10 rounded-xl text-xs font-bold text-white focus:outline-none focus:border-rose-500"
                        />
                        <select 
                          value={structureForm.durationUnit}
                          onChange={(e) => setStructureForm({...structureForm, durationUnit: e.target.value as 'Mois' | 'Années'})}
                          className="w-1/2 px-3 py-2 bg-slate-950 border border-white/10 rounded-xl text-xs text-slate-300 focus:outline-none focus:border-rose-500"
                        >
                          <option value="Mois">Mois</option>
                          <option value="Années">Années</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="text-xs font-bold text-slate-400">Date d'Expiration Calculée</label>
                      <input 
                        type="text"
                        disabled
                        value={computedExpirationDate}
                        className="w-full mt-1 px-3 py-2 bg-slate-950/40 border border-white/5 rounded-xl text-xs font-mono font-bold text-emerald-400"
                      />
                    </div>
                  </div>

                  {/* Modules inclus dans cette formule */}
                  <div className="mt-3 p-3 bg-slate-950/60 border border-white/5 rounded-xl">
                    <p className="text-[11px] font-bold text-slate-300 mb-2">
                      Modules réellement inclus et activés pour cette structure ({selectedPlanConfig.includedServiceIds.length}) :
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedPlanConfig.includedServiceIds.map(srvId => {
                        const isImpl = hasImplementedModule(srvId);
                        return (
                          <span key={srvId} className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            isImpl ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300 line-through'
                          }`}>
                            {srvId} {isImpl ? '✓' : '(Non implémenté)'}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-white/5">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="px-5 py-2.5 rounded-xl text-xs font-bold text-slate-400 hover:text-white transition-colors"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-6 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-rose-900/30 transition-all disabled:opacity-50"
                  >
                    {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <Building2 size={16} />}
                    Provisionner la Structure & ses Droits
                  </button>
                </div>
              </form>
            )}

          </div>
        </div>
      )}

      {/* MODAL: VIEW DETAILS */}
      {viewingAccount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
          <div className="bg-slate-900 border border-white/10 rounded-3xl max-w-lg w-full p-6 relative">
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-rose-500/10 text-rose-400 rounded-2xl">
                  {viewingAccount.accountType === 'SUPER_ADMIN' ? <ShieldCheck size={24} /> : <Building2 size={24} />}
                </div>
                <div>
                  <h3 className="text-lg font-black text-white">{viewingAccount.name}</h3>
                  <p className="text-xs text-slate-400 font-mono">@{viewingAccount.username}</p>
                </div>
              </div>
              <button onClick={() => setViewingAccount(null)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            <div className="space-y-3 bg-slate-950/60 border border-white/5 p-4 rounded-2xl text-xs">
              <div className="flex justify-between py-1 border-b border-white/5">
                <span className="text-slate-400">Catégorie :</span>
                <span className="font-bold text-white">{viewingAccount.accountType}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-white/5">
                <span className="text-slate-400">Structure rattachée :</span>
                <span className="font-bold text-white">{viewingAccount.structureName}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-white/5">
                <span className="text-slate-400">E-mail de contact :</span>
                <span className="font-bold text-white">{viewingAccount.email}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-white/5">
                <span className="text-slate-400">Statut :</span>
                <span className="font-bold text-emerald-400">{viewingAccount.status}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-white/5">
                <span className="text-slate-400">Licence :</span>
                <span className="font-bold text-white">{viewingAccount.licenseInfo}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-400">Expiration :</span>
                <span className="font-bold text-white">{viewingAccount.licenseExpiry}</span>
              </div>
            </div>

            <div className="mt-5 flex justify-end">
              <button 
                onClick={() => setViewingAccount(null)}
                className="px-5 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold transition-all"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CREATED CREDENTIALS SUMMARY */}
      {createdCredentials && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in">
          <div className="bg-slate-900 border border-emerald-500/30 rounded-3xl max-w-md w-full p-6 relative shadow-2xl shadow-emerald-950/50">
            <div className="text-center mb-5">
              <div className="w-12 h-12 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <Sparkles size={24} />
              </div>
              <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                Compte Créé & Généré
              </span>
              <h3 className="text-xl font-black text-white mt-2">{createdCredentials.title}</h3>
              <p className="text-xs text-slate-400 mt-1">{createdCredentials.name}</p>
            </div>

            <div className="space-y-3 bg-slate-950 border border-white/10 p-4 rounded-2xl text-xs">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-500">Identifiant de connexion</span>
                <p className="font-mono font-bold text-white text-sm mt-0.5">@{createdCredentials.username}</p>
              </div>

              <div>
                <span className="text-[10px] uppercase font-bold text-slate-500">Mot de passe généré automatiquement</span>
                <div className="flex items-center justify-between bg-slate-900 border border-rose-500/30 p-2.5 rounded-xl mt-1">
                  <span className="font-mono font-black text-rose-300 text-sm">{createdCredentials.password}</span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(createdCredentials.password);
                      setCopiedPass(true);
                      setTimeout(() => setCopiedPass(false), 2000);
                    }}
                    className="px-2.5 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-[10px] font-extrabold flex items-center gap-1 transition-all cursor-pointer"
                  >
                    {copiedPass ? <Check size={12} /> : <Copy size={12} />}
                    {copiedPass ? 'Copié !' : 'Copier'}
                  </button>
                </div>
              </div>

              {createdCredentials.email && (
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-500">E-mail rattaché</span>
                  <p className="font-bold text-slate-300 mt-0.5">{createdCredentials.email}</p>
                </div>
              )}

              {createdCredentials.type === 'STRUCTURE' && (
                <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-start gap-2 text-amber-300 text-[11px]">
                  <ShieldAlert size={16} className="shrink-0 mt-0.5 text-amber-400" />
                  <div>
                    <span className="font-bold block">Mot de passe temporaire strict :</span>
                    L'administrateur sera automatiquement intercepté dès sa première connexion et devra obligatoirement définir un mot de passe personnel sécurisé avant d'accéder au système.
                  </div>
                </div>
              )}
            </div>

            <div className="mt-5 text-center">
              <button
                onClick={() => setCreatedCredentials(null)}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl font-black text-xs uppercase tracking-wider shadow-lg shadow-emerald-900/30 transition-all cursor-pointer"
              >
                Terminer & Transmettre au Titulaire
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
