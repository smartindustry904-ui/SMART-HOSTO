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
import { SAAS_PLANS, SaaSPlanId, calculateLicensePriceForUsers, recommendPlanForUserCount, buildClinicEntitlementMaps } from '../../src/config/plans';
import { CANONICAL_MODULES, hasImplementedModule } from '../../src/config/modules';
import { db, sanitizeData } from '../../src/firebase';
import { doc, setDoc, updateDoc, deleteDoc, addDoc, collection, onSnapshot } from 'firebase/firestore';

interface SuperAdminUsersProps {
  clinics: ClinicTenant[];
  hospitalUsers: UserType[];
  plans?: Record<string, any>;
  currentUser: UserType | null;
  onRefreshData?: () => void;
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  onNavigateToServices?: (clinicId: string) => void;
}

export const SuperAdminUsers: React.FC<SuperAdminUsersProps> = ({
  clinics,
  hospitalUsers,
  plans: externalPlans,
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
    // License & Per-User Quota
    licence_id: 'licence_standard',
    plan: 'STANDARD' as SaaSPlanId,
    maxUsers: 15,
    invoiceStatus: 'PAID' as 'PAID' | 'PENDING',
    startDate: new Date().toISOString().split('T')[0],
    durationValue: 1,
    durationUnit: 'Années' as 'Mois' | 'Années',
    extraOptions: [] as string[]
  }));

  // Dynamic Contractual Plans catalog from ControlCenter or SAAS_PLANS
  const availablePlans = useMemo<Record<string, any>>(() => {
    if (externalPlans && Object.keys(externalPlans).length > 0) {
      return externalPlans;
    }
    const initial: Record<string, any> = {};
    Object.keys(SAAS_PLANS).forEach(k => {
      initial[k] = SAAS_PLANS[k as SaaSPlanId];
    });
    return initial;
  }, [externalPlans]);

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

  // Selected Plan definition & Per-User Pricing Calculation
  const selectedPlanConfig = useMemo(() => {
    const p = availablePlans[structureForm.plan] || SAAS_PLANS[structureForm.plan as SaaSPlanId] || SAAS_PLANS.STANDARD;
    const pricing = calculateLicensePriceForUsers(p, structureForm.maxUsers, totalMonths);
    return {
      label: p.label || 'Standard',
      max_users: p.max_users || 15,
      pricePerExtraUserFCFA: p.pricePerExtraUserFCFA ?? 8500,
      monthlyPriceFCFA: pricing.monthlyTotal,
      basePriceFCFA: pricing.basePrice,
      extraUsers: pricing.extraUsers,
      extraUsersCostFCFA: pricing.extraUsersMonthlyCost,
      periodTotalFCFA: pricing.periodTotal,
      costPerUserMonthly: pricing.costPerUserMonthly,
      includedServiceIds: p.includedServiceIds || ['SRV-ACCUEIL', 'SRV-CONSULTATION', 'SRV-CAISSE']
    };
  }, [availablePlans, structureForm.plan, structureForm.maxUsers, totalMonths]);

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
      const linkedAdmin = hospitalUsers.find(
        u => (u as any).clinicId === c.id || (u as any).hospital_id === c.id || u.id === `usr_${c.id}_admin`
      );
      const loginUsername = linkedAdmin?.username || c.responsibleUser || `admin_${c.id.substring(0, 8)}`;
      const activeUsersCount = c.usage?.activeUsers || 1;
      const maxUsersQuota = c.quotas?.maxUsers || 15;

      list.push({
        id: c.id,
        name: c.name,
        username: loginUsername,
        responsibleName: c.responsibleUser || linkedAdmin?.name || 'Responsable non défini',
        email: c.email || linkedAdmin?.email || 'N/A',
        phone: c.phone || 'N/A',
        accountType: 'STRUCTURE',
        roleLabel: 'Administrateur d\'Établissement',
        structureName: `${c.name} (${c.structureType || 'Clinique'})`,
        createdAt: c.createdAt || 'N/A',
        status: c.status || 'ACTIVE',
        activeUsersCount,
        maxUsersQuota,
        monthlyPrice: c.licensePrice || 150000,
        licenseInfo: `Formule ${c.licenseType} (${activeUsersCount}/${maxUsersQuota} util.)`,
        licenseExpiry: c.licenseEnd || 'Non spécifiée',
        originalClinic: c,
        linkedAdminUser: linkedAdmin || null
      });
    });

    return list;
  }, [hospitalUsers, clinics]);

  // Filtered Accounts
  const filteredAccounts = useMemo(() => {
    return unifiedAccounts.filter(acc => {
      if (activeCategory === 'SUPER_ADMINS' && acc.accountType !== 'SUPER_ADMIN') return false;
      if (activeCategory === 'HOSPITAL_STRUCTURES' && acc.accountType !== 'STRUCTURE') return false;
      if (filterStatus !== 'ALL' && acc.status !== filterStatus) return false;
      if (filterPlan !== 'ALL' && acc.accountType === 'STRUCTURE') {
        const clinicPlan = acc.originalClinic?.licenseType;
        if (clinicPlan !== filterPlan) return false;
      }

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

  // Handler: Toggle Account Status (Suspend / Reactivate) synced across all collections
  const handleToggleStatus = async (account: any) => {
    if (account.username === 'superadmin' || account.isMaster) {
      showToast('Impossible de suspendre le Super Administrateur racine', 'info');
      return;
    }

    const newStatus = account.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    try {
      if (account.accountType === 'SUPER_ADMIN') {
        await updateDoc(doc(db, 'hospital_users', account.id), sanitizeData({
          status: newStatus,
          updatedAt: new Date().toISOString()
        }));
        await setDoc(doc(db, 'users', account.id), sanitizeData({
          status: newStatus,
          updatedAt: new Date().toISOString()
        }), { merge: true });
      } else if (account.accountType === 'STRUCTURE') {
        await updateDoc(doc(db, 'saas_clinics', account.id), sanitizeData({
          status: newStatus,
          updatedAt: new Date().toISOString()
        }));
        await setDoc(doc(db, 'hospitals', account.id), sanitizeData({
          id: account.id,
          status: newStatus,
          updatedAt: new Date().toISOString()
        }), { merge: true });
        const adminId = account.linkedAdminUser?.id || `usr_${account.id}_admin`;
        await setDoc(doc(db, 'hospital_users', adminId), sanitizeData({
          status: newStatus,
          updatedAt: new Date().toISOString()
        }), { merge: true });
        await setDoc(doc(db, 'users', adminId), sanitizeData({
          status: newStatus,
          updatedAt: new Date().toISOString()
        }), { merge: true });
      }

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

  // Handler: Open Edit / Password Reset / License Extension Modal
  const handleOpenEditAccount = (account: any) => {
    const isSuper = account.accountType === 'SUPER_ADMIN';
    const currentPlanId = account.originalClinic?.licenseType || 'STANDARD';
    const currentMaxUsers = account.originalClinic?.quotas?.maxUsers || availablePlans[currentPlanId]?.max_users || 15;
    const calcPrice = calculateLicensePriceForUsers(availablePlans[currentPlanId], currentMaxUsers, 1).monthlyTotal;

    setEditingAccount({
      ...account,
      editName: account.name || '',
      editUsername: account.username || '',
      editEmail: account.email !== 'N/A' ? account.email : '',
      editPhone: account.phone !== 'N/A' ? (account.phone || '') : '',
      editCity: account.originalClinic?.city || 'Dakar',
      editResponsible: account.responsibleName || account.originalClinic?.responsibleUser || '',
      editStatus: account.status || 'ACTIVE',
      editPlan: currentPlanId,
      editMaxUsers: currentMaxUsers,
      editLicensePrice: account.originalClinic?.licensePrice || calcPrice,
      editLicenseEnd: account.originalClinic?.licenseEnd || new Date(Date.now() + 365 * 86400000).toISOString().split('T')[0],
      newPassword: '',
      forcePasswordChange: !isSuper
    });
  };

  // Handler: Save Edited Account / Reset Password / Renew License (100% synced across DB & Services)
  const handleSaveEditedAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAccount) return;

    setIsSubmitting(true);
    try {
      const cleanNewPass = (editingAccount.newPassword || '').trim();
      const cleanUsername = (editingAccount.editUsername || '').trim().toLowerCase();

      if (editingAccount.accountType === 'SUPER_ADMIN') {
        const updates: any = {
          name: (editingAccount.editName || '').trim() || cleanUsername,
          username: cleanUsername,
          email: (editingAccount.editEmail || '').trim().toLowerCase(),
          status: editingAccount.editStatus || 'ACTIVE',
          updatedAt: new Date().toISOString()
        };
        if (cleanNewPass) {
          updates.password = cleanNewPass;
        }

        await setDoc(doc(db, 'hospital_users', editingAccount.id), sanitizeData(updates), { merge: true });
        await setDoc(doc(db, 'users', editingAccount.id), sanitizeData(updates), { merge: true });

        await addDoc(collection(db, 'saas_logs'), sanitizeData({
          timestamp: new Date().toISOString(),
          user: currentUser?.username || 'superadmin',
          action: cleanNewPass ? 'SUPER_ADMIN_PASSWORD_RESET' : 'SUPER_ADMIN_UPDATE',
          details: `Compte Super Admin @${cleanUsername} mis à jour${cleanNewPass ? ' (mot de passe réinitialisé)' : ''}`,
          category: 'SECURITY'
        }));

        if (cleanNewPass) {
          setCreatedCredentials({
            type: 'SUPER_ADMIN',
            title: 'Identifiants Super Admin Mis à Jour',
            name: updates.name,
            username: cleanUsername,
            password: cleanNewPass,
            email: updates.email
          });
        }

        showToast(`Compte Super Admin "${updates.name}" mis à jour avec succès`, 'success');
      } else {
        // Structure & Linked Admin update + Module & Quota sync
        const clinic = editingAccount.originalClinic;
        const nextPlanId = (editingAccount.editPlan || clinic.licenseType || 'STANDARD').toUpperCase();
        const planDef = availablePlans[nextPlanId] || SAAS_PLANS[nextPlanId as SaaSPlanId] || SAAS_PLANS.STANDARD;
        const maxUsersNum = Math.max(1, Number(editingAccount.editMaxUsers) || planDef.max_users || 15);
        const computedPrice = Number(editingAccount.editLicensePrice) || calculateLicensePriceForUsers(planDef, maxUsersNum, 1).monthlyTotal;
        const licenceId = `licence_${nextPlanId.toLowerCase()}`;

        const { servicesConfig, activatedModules } = buildClinicEntitlementMaps(
          nextPlanId,
          clinic.servicesConfig || {},
          availablePlans
        );

        const clinicUpdates: any = {
          name: (editingAccount.editName || '').trim() || clinic.name,
          city: (editingAccount.editCity || '').trim() || clinic.city,
          phone: (editingAccount.editPhone || '').trim() || clinic.phone,
          email: (editingAccount.editEmail || '').trim().toLowerCase() || clinic.email,
          responsibleUser: (editingAccount.editResponsible || '').trim() || clinic.responsibleUser,
          status: editingAccount.editStatus || 'ACTIVE',
          licenseType: nextPlanId,
          nom_licence: planDef.nom_licence || planDef.label || nextPlanId,
          licence_id: licenceId,
          licenceId: licenceId,
          licensePrice: computedPrice,
          licenseEnd: editingAccount.editLicenseEnd || clinic.licenseEnd,
          quotas: {
            ...(clinic.quotas || {}),
            maxUsers: maxUsersNum
          },
          servicesConfig,
          activatedModules,
          updatedAt: new Date().toISOString()
        };

        await updateDoc(doc(db, 'saas_clinics', editingAccount.id), sanitizeData(clinicUpdates));
        await setDoc(doc(db, 'hospitals', editingAccount.id), sanitizeData({
          id: editingAccount.id,
          name: clinicUpdates.name,
          licence_id: licenceId,
          licenceId: licenceId,
          nom_licence: clinicUpdates.nom_licence,
          licenseType: nextPlanId,
          licensePrice: computedPrice,
          max_users: maxUsersNum,
          city: clinicUpdates.city,
          phone: clinicUpdates.phone,
          email: clinicUpdates.email,
          responsibleUser: clinicUpdates.responsibleUser,
          status: clinicUpdates.status,
          updatedAt: new Date().toISOString()
        }), { merge: true });

        // Update or create linked local Admin account
        const adminId = editingAccount.linkedAdminUser?.id || `usr_${editingAccount.id}_admin`;
        const adminUpdates: any = {
          id: adminId,
          username: cleanUsername,
          name: clinicUpdates.responsibleUser,
          email: clinicUpdates.email,
          role: Role.ADMIN,
          roles: ['role_admin'],
          status: clinicUpdates.status === 'ACTIVE' ? 'ACTIVE' : 'SUSPENDED',
          clinicId: editingAccount.id,
          hospital_id: editingAccount.id,
          structureName: clinicUpdates.name,
          isMainAdmin: true,
          updatedAt: new Date().toISOString()
        };

        if (cleanNewPass) {
          adminUpdates.password = cleanNewPass;
          adminUpdates.forcePasswordChange = Boolean(editingAccount.forcePasswordChange);
        }

        await setDoc(doc(db, 'hospital_users', adminId), sanitizeData(adminUpdates), { merge: true });
        await setDoc(doc(db, 'users', adminId), sanitizeData(adminUpdates), { merge: true });

        await addDoc(collection(db, 'saas_logs'), sanitizeData({
          timestamp: new Date().toISOString(),
          user: currentUser?.username || 'superadmin',
          action: cleanNewPass ? 'STRUCTURE_ADMIN_PASSWORD_RESET' : 'STRUCTURE_UPDATE',
          details: `Structure "${clinicUpdates.name}" synchronisée (Formule: ${nextPlanId}, Quota: ${maxUsersNum} util., Tarif: ${computedPrice.toLocaleString('fr-FR')} FCFA/m, Exp: ${clinicUpdates.licenseEnd})${cleanNewPass ? ' + Mot de passe réinitialisé' : ''}`,
          category: 'LICENSE',
          clinicId: editingAccount.id,
          clinicName: clinicUpdates.name
        }));

        if (cleanNewPass) {
          setCreatedCredentials({
            type: 'STRUCTURE',
            title: `Nouveaux Identifiants (${clinicUpdates.name})`,
            name: clinicUpdates.responsibleUser,
            username: cleanUsername,
            password: cleanNewPass,
            email: clinicUpdates.email
          });
        }

        showToast(`Structure "${clinicUpdates.name}", ses modules et son quota (${maxUsersNum} util.) synchronisés !`, 'success');
      }

      setEditingAccount(null);
    } catch (err) {
      console.error('Error updating account:', err);
      showToast('Erreur lors de la mise à jour du compte', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handler: Delete Account / Test Structure
  const handleDeleteAccount = async (account: any) => {
    if (account.isMaster || account.id === 'super_admin_id' || account.id === 'sa1_superadmin' || account.username === 'superadmin') {
      showToast('Impossible de supprimer un compte Super Administrateur racine.', 'info');
      return;
    }

    const confirmMsg = account.accountType === 'STRUCTURE'
      ? `Voulez-vous vraiment supprimer la structure "${account.name}" et son compte administrateur (@${account.username}) ?`
      : `Voulez-vous vraiment supprimer le Super Administrateur "${account.name}" (@${account.username}) ?`;

    if (!window.confirm(confirmMsg)) return;

    try {
      if (account.accountType === 'SUPER_ADMIN') {
        await deleteDoc(doc(db, 'hospital_users', account.id));
        await deleteDoc(doc(db, 'users', account.id)).catch(() => {});
      } else {
        await deleteDoc(doc(db, 'saas_clinics', account.id));
        await deleteDoc(doc(db, 'hospitals', account.id)).catch(() => {});
        const adminId = account.linkedAdminUser?.id || `usr_${account.id}_admin`;
        await deleteDoc(doc(db, 'hospital_users', adminId)).catch(() => {});
        await deleteDoc(doc(db, 'users', adminId)).catch(() => {});
      }

      await addDoc(collection(db, 'saas_logs'), sanitizeData({
        timestamp: new Date().toISOString(),
        user: currentUser?.username || 'superadmin',
        action: 'ACCOUNT_DELETION',
        details: `Suppression de ${account.name} (@${account.username}, ID: ${account.id})`,
        category: 'SECURITY'
      }));

      showToast(`Compte "${account.name}" supprimé avec succès.`, 'info');
    } catch (err) {
      console.error('Error deleting account:', err);
      showToast('Erreur lors de la suppression', 'error');
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
      await setDoc(doc(db, 'users', newUserId), sanitizeData(newUser));

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

      // 2. Fetch Selected Plan configuration & Per-User Pricing
      const selectedPlan = availablePlans[structureForm.plan] || SAAS_PLANS[structureForm.plan as SaaSPlanId] || SAAS_PLANS.STANDARD;
      const selectedMaxUsers = Math.max(1, Number(structureForm.maxUsers) || selectedPlan.max_users || 15);
      const pricing = calculateLicensePriceForUsers(selectedPlan, selectedMaxUsers, totalMonths);
      const planMonthlyPrice = pricing.monthlyTotal;
      const selectedLicenceId = `licence_${String(structureForm.plan).toLowerCase()}`;

      // Build Entitlements & Activated Modules from Catalog
      const { servicesConfig, activatedModules: activatedModulesMap } = buildClinicEntitlementMaps(
        structureForm.plan,
        {},
        availablePlans
      );

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
        nom_licence: selectedPlan.nom_licence || selectedPlan.label || structureForm.plan,
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
          dailyConnections: 1
        },
        activatedModules: activatedModulesMap,
        activatedTools: {
          "Ordonnance intelligente": true,
          "Calculateur de posologie": true
        }
      };

      const clinicPayload = {
        ...newClinic,
        servicesConfig
      };
      await setDoc(doc(db, 'saas_clinics', clinicId), sanitizeData(clinicPayload));

      // Update Hospital table with foreign key: licence_id & max_users
      await setDoc(doc(db, 'hospitals', clinicId), sanitizeData({
        id: clinicId,
        name: finalStructureName,
        licence_id: selectedLicenceId,
        licenceId: selectedLicenceId,
        nom_licence: selectedPlan.nom_licence || selectedPlan.label || structureForm.plan,
        licenseType: structureForm.plan,
        licensePrice: planMonthlyPrice,
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

      // 4. Create Initial Hospital Admin User in hospital_users & users
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

      // 5. Generate Initial Subscription Invoice in saas_invoices with matching doc ID
      const invoiceId = `INV-${Date.now().toString().slice(-6)}`;
      const initialInvoice: SubscriptionInvoice = {
        id: invoiceId,
        clinicId,
        clinicName: finalStructureName,
        plan: structureForm.plan,
        userCount: selectedMaxUsers,
        amount: pricing.periodTotal,
        currency: 'FCFA',
        dueDate: computedExpirationDate,
        paidDate: structureForm.invoiceStatus === 'PAID' ? new Date().toISOString().split('T')[0] : undefined,
        status: structureForm.invoiceStatus || 'PAID',
        paymentMethod: 'Virement bancaire'
      };

      await setDoc(doc(db, 'saas_invoices', invoiceId), sanitizeData({
        ...initialInvoice,
        createdAt: new Date().toISOString()
      }));

      // 6. Traceability in saas_logs
      await addDoc(collection(db, 'saas_logs'), sanitizeData({
        timestamp: new Date().toISOString(),
        user: currentUser?.username || 'superadmin',
        action: 'STRUCTURE_ONBOARDING',
        details: `Nouvel établissement provisionné : "${finalStructureName}" (ID: ${clinicId}) — Formule ${structureForm.plan} (${selectedMaxUsers} utilisateurs • ${planMonthlyPrice.toLocaleString('fr-FR')} FCFA/mois). Admin créé : [@${cleanAdminUsername}]`,
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

      showToast(`Structure "${finalStructureName}" (${selectedMaxUsers} util. max) et son compte admin provisionnés !`, 'success');
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
        licence_id: 'licence_standard',
        plan: 'STANDARD',
        maxUsers: 15,
        invoiceStatus: 'PAID',
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
    <div className="space-y-4 animate-in fade-in duration-300">
      
      {/* COMPACT HEADER & ACTION BAR */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gradient-to-b from-[#161a29] to-[#0f121d] border border-white/15 px-4 py-3 rounded-2xl shadow-[0_10px_28px_rgba(0,0,0,0.5),inset_0_1px_0_0_rgba(255,255,255,0.16)]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-purple-500/20 border border-purple-400/30 flex items-center justify-center text-purple-300 shrink-0">
            <Users size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-extrabold text-white tracking-tight">Gestion Centrale des Comptes</h2>
              <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest bg-purple-500/20 text-purple-300 border border-purple-500/30">
                Gouvernance des Accès
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-medium">Super Administrateurs, Structures Clientes, Mots de passe & Quotas</p>
          </div>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-gradient-to-b from-rose-500 to-rose-700 hover:from-rose-400 hover:to-rose-600 text-white rounded-xl font-black text-xs uppercase tracking-wider flex items-center gap-1.5 border border-rose-400/40 shadow-[0_6px_16px_rgba(225,29,72,0.4),inset_0_1px_0_0_rgba(255,255,255,0.3)] transition-all cursor-pointer self-start sm:self-auto"
        >
          <Plus size={15} /> Créer un Utilisateur / Structure
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
                      <td className="py-3.5 pl-6">
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs ${
                            isSuper 
                              ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30' 
                              : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                          }`}>
                            {isSuper ? <ShieldCheck size={17} /> : <Building2 size={17} />}
                          </div>
                          <div>
                            <p className="font-extrabold text-white">{account.name}</p>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="text-[11px] font-mono font-bold text-rose-300">@{account.username}</span>
                              <span className="text-[10px] font-mono text-slate-500">({account.id})</span>
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Associated Structure */}
                      <td className="py-3.5">
                        <p className="font-bold text-slate-200">{account.structureName}</p>
                        <p className="text-[10px] text-slate-400">
                          {account.responsibleName ? `${account.responsibleName} • ` : ''}{account.email}
                        </p>
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
                      <td className="py-3.5">
                        <p className="font-bold text-slate-200">{account.licenseInfo}</p>
                        {!isSuper && account.maxUsersQuota && (
                          <div className="mt-1 flex items-center gap-2">
                            <div className="w-20 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${
                                  account.activeUsersCount >= account.maxUsersQuota
                                    ? 'bg-rose-500'
                                    : account.activeUsersCount / account.maxUsersQuota >= 0.8
                                    ? 'bg-amber-400'
                                    : 'bg-emerald-400'
                                }`}
                                style={{ width: `${Math.min(100, Math.round((account.activeUsersCount / account.maxUsersQuota) * 100))}%` }}
                              />
                            </div>
                            <span className="text-[10px] font-mono text-emerald-300">
                              {(account.monthlyPrice || 0).toLocaleString('fr-FR')} FCFA/m
                            </span>
                          </div>
                        )}
                        <p className="text-[10px] text-slate-400 mt-0.5">Exp: {account.licenseExpiry}</p>
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
                      <td className="py-3.5 text-right pr-6">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Services management shortcut if structure */}
                          {!isSuper && onNavigateToServices && (
                            <button
                              onClick={() => onNavigateToServices(account.id)}
                              title="Gérer les services de cette structure"
                              className="p-2 bg-white/5 hover:bg-rose-600 hover:text-white text-slate-300 rounded-xl transition-all cursor-pointer"
                            >
                              <Layers size={14} />
                            </button>
                          )}

                          {/* Edit / Reset Password / Extend License */}
                          <button
                            onClick={() => handleOpenEditAccount(account)}
                            title="Modifier / Réinitialiser mot de passe / Prolonger licence"
                            className="p-2 bg-white/5 hover:bg-purple-600 hover:text-white text-slate-300 rounded-xl transition-all cursor-pointer"
                          >
                            <Edit size={14} />
                          </button>

                          {/* View account details */}
                          <button
                            onClick={() => setViewingAccount(account)}
                            title="Voir la fiche détaillée"
                            className="p-2 bg-white/5 hover:bg-white/15 text-slate-300 hover:text-white rounded-xl transition-all cursor-pointer"
                          >
                            <Eye size={14} />
                          </button>

                          {/* Suspend / Reactivate */}
                          {!account.isMaster && (
                            <button
                              onClick={() => handleToggleStatus(account)}
                              title={isActive ? 'Suspendre ce compte' : 'Réactiver ce compte'}
                              className={`p-2 rounded-xl transition-all cursor-pointer ${
                                isActive 
                                  ? 'bg-white/5 hover:bg-amber-500/20 text-slate-300 hover:text-amber-300' 
                                  : 'bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25'
                              }`}
                            >
                              {isActive ? <Lock size={14} /> : <Unlock size={14} />}
                            </button>
                          )}

                          {/* Delete Account / Structure */}
                          {!account.isMaster && account.id !== 'super_admin_id' && account.id !== 'sa1_superadmin' && (
                            <button
                              onClick={() => handleDeleteAccount(account)}
                              title="Supprimer ce compte / cette structure"
                              className="p-2 bg-white/5 hover:bg-rose-500/25 text-slate-400 hover:text-rose-400 rounded-xl transition-all cursor-pointer"
                            >
                              <Trash2 size={14} />
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

                {/* 3. Licence Commerciale & Quotas par Nombre d'Utilisateurs */}
                <div>
                  <h4 className="text-xs font-black uppercase tracking-wider text-rose-400 mb-3">
                    3. Licence & Tarification par Nombre d'Utilisateurs (SaaS Multi-Tenant)
                  </h4>

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div>
                      <label className="text-xs font-bold text-slate-400 flex items-center justify-between">
                        <span>Formule Commerciale *</span>
                        <span className="text-[10px] text-emerald-400 font-bold">Palier</span>
                      </label>
                      <select 
                        required
                        value={structureForm.plan}
                        onChange={(e: any) => {
                          const planKey = e.target.value as SaaSPlanId;
                          const p = availablePlans[planKey] || SAAS_PLANS[planKey] || SAAS_PLANS.STANDARD;
                          const defaultMax = p.max_users || 15;
                          setStructureForm({
                            ...structureForm,
                            plan: planKey,
                            licence_id: `licence_${planKey.toLowerCase()}`,
                            maxUsers: defaultMax
                          });
                        }}
                        className="w-full mt-1 px-3 py-2 bg-slate-950 border border-emerald-500/40 rounded-xl text-xs font-bold text-emerald-300 focus:outline-none focus:border-rose-500"
                      >
                        {Object.keys(availablePlans).map(planKey => {
                          const p = availablePlans[planKey];
                          return (
                            <option key={planKey} value={planKey}>
                              {planKey} ({p.max_users || 15} util. inclus)
                            </option>
                          );
                        })}
                      </select>
                      <p className="text-[10px] text-slate-400 mt-1">
                        Socle : {selectedPlanConfig.max_users} util. inclus
                      </p>
                    </div>

                    <div>
                      <label className="text-xs font-bold text-slate-400 flex items-center justify-between">
                        <span>Nombre d'Utilisateurs *</span>
                        <span className="text-[10px] text-blue-400 font-mono font-bold">Quota</span>
                      </label>
                      <input
                        type="number"
                        required
                        min={1}
                        max={500}
                        value={structureForm.maxUsers}
                        onChange={(e) => {
                          const val = Math.max(1, parseInt(e.target.value) || 1);
                          setStructureForm({
                            ...structureForm,
                            maxUsers: val
                          });
                        }}
                        className="w-full mt-1 px-3 py-2 bg-slate-950 border border-blue-500/40 rounded-xl text-xs font-mono font-bold text-blue-300 focus:outline-none focus:border-rose-500"
                      />
                      <div className="flex flex-wrap gap-1 mt-1">
                        {[5, 10, 15, 25, 35, 50, 100].map(uCount => (
                          <button
                            key={uCount}
                            type="button"
                            onClick={() => {
                              const recPlan = recommendPlanForUserCount(uCount, availablePlans) as SaaSPlanId;
                              setStructureForm({
                                ...structureForm,
                                maxUsers: uCount,
                                plan: recPlan,
                                licence_id: `licence_${recPlan.toLowerCase()}`
                              });
                            }}
                            className={`px-1.5 py-0.5 rounded text-[9px] font-bold cursor-pointer ${
                              structureForm.maxUsers === uCount
                                ? 'bg-blue-600 text-white'
                                : 'bg-white/5 text-slate-400 hover:text-white'
                            }`}
                          >
                            {uCount}
                          </button>
                        ))}
                      </div>
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
                      <p className="text-[10px] text-emerald-400 font-mono mt-1">
                        Exp: {computedExpirationDate}
                      </p>
                    </div>

                    <div>
                      <label className="text-xs font-bold text-slate-400">Statut Facture Initiale</label>
                      <select
                        value={structureForm.invoiceStatus}
                        onChange={(e) => setStructureForm({ ...structureForm, invoiceStatus: e.target.value as 'PAID' | 'PENDING' })}
                        className="w-full mt-1 px-3 py-2 bg-slate-950 border border-white/10 rounded-xl text-xs font-bold text-white focus:outline-none"
                      >
                        <option value="PAID">PAYÉE (Encaissée)</option>
                        <option value="PENDING">EN ATTENTE</option>
                      </select>
                    </div>
                  </div>

                  {/* Live Per-User Pricing Summary Box */}
                  <div className="mt-3 p-3 bg-emerald-950/20 border border-emerald-500/30 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                    <div>
                      <span className="text-[10px] font-black uppercase tracking-wider text-emerald-300">
                        Calcul Tarifaire ({structureForm.maxUsers} utilisateurs • Formule {structureForm.plan})
                      </span>
                      <p className="text-[11px] text-slate-300 mt-0.5">
                        Forfait socle ({selectedPlanConfig.max_users} util.) : <strong className="text-white">{selectedPlanConfig.basePriceFCFA.toLocaleString('fr-FR')} FCFA</strong>
                        {selectedPlanConfig.extraUsers > 0 && (
                          <span>
                            {' '}+ {selectedPlanConfig.extraUsers} util. supp. × {selectedPlanConfig.pricePerExtraUserFCFA.toLocaleString('fr-FR')} FCFA = <strong className="text-blue-300">+{selectedPlanConfig.extraUsersCostFCFA.toLocaleString('fr-FR')} FCFA</strong>
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-black text-white">
                        {selectedPlanConfig.monthlyPriceFCFA.toLocaleString('fr-FR')} <span className="text-emerald-400 text-xs">FCFA / mois</span>
                      </p>
                      <p className="text-[10px] font-bold text-emerald-300">
                        Total ({totalMonths} mois) : {selectedPlanConfig.periodTotalFCFA.toLocaleString('fr-FR')} FCFA
                      </p>
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
          <div className="bg-slate-900 border border-white/15 rounded-3xl max-w-lg w-full p-6 relative shadow-2xl">
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-rose-500/15 text-rose-400 border border-rose-500/30 rounded-2xl">
                  {viewingAccount.accountType === 'SUPER_ADMIN' ? <ShieldCheck size={22} /> : <Building2 size={22} />}
                </div>
                <div>
                  <h3 className="text-lg font-black text-white">{viewingAccount.name}</h3>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-rose-300 font-mono font-bold">@{viewingAccount.username}</span>
                    <span className="text-[11px] text-slate-400 font-mono">• ID: {viewingAccount.id}</span>
                  </div>
                </div>
              </div>
              <button onClick={() => setViewingAccount(null)} className="text-slate-400 hover:text-white cursor-pointer">✕</button>
            </div>

            <div className="space-y-2.5 bg-slate-950/70 border border-white/10 p-4 rounded-2xl text-xs">
              <div className="flex justify-between py-1 border-b border-white/5">
                <span className="text-slate-400">ID Système (Connexion directe) :</span>
                <span className="font-mono font-bold text-purple-300">{viewingAccount.id}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-white/5">
                <span className="text-slate-400">Identifiant Login :</span>
                <span className="font-mono font-bold text-white">@{viewingAccount.username}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-white/5">
                <span className="text-slate-400">Catégorie :</span>
                <span className="font-bold text-white">{viewingAccount.accountType}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-white/5">
                <span className="text-slate-400">Structure rattachée :</span>
                <span className="font-bold text-white">{viewingAccount.structureName}</span>
              </div>
              {viewingAccount.responsibleName && (
                <div className="flex justify-between py-1 border-b border-white/5">
                  <span className="text-slate-400">Responsable :</span>
                  <span className="font-bold text-white">{viewingAccount.responsibleName}</span>
                </div>
              )}
              <div className="flex justify-between py-1 border-b border-white/5">
                <span className="text-slate-400">E-mail de contact :</span>
                <span className="font-bold text-white">{viewingAccount.email}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-white/5">
                <span className="text-slate-400">Statut :</span>
                <span className={`font-bold ${viewingAccount.status === 'ACTIVE' ? 'text-emerald-400' : 'text-rose-400'}`}>{viewingAccount.status}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-white/5">
                <span className="text-slate-400">Licence / Quota :</span>
                <span className="font-bold text-white">{viewingAccount.licenseInfo}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-400">Expiration :</span>
                <span className="font-bold text-emerald-300">{viewingAccount.licenseExpiry}</span>
              </div>
            </div>

            <div className="mt-5 flex justify-between items-center gap-3">
              <button
                onClick={() => {
                  const target = viewingAccount;
                  setViewingAccount(null);
                  handleOpenEditAccount(target);
                }}
                className="px-4 py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <Key size={14} /> Modifier / Réinitialiser Mot de Passe
              </button>
              <button 
                onClick={() => setViewingAccount(null)}
                className="px-5 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: EDIT ACCOUNT / RESET PASSWORD / EXTEND LICENSE */}
      {editingAccount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
          <div className="bg-slate-900 border border-white/15 rounded-3xl max-w-xl w-full p-6 relative shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start mb-5">
              <div>
                <span className="text-[10px] uppercase font-black tracking-widest text-purple-400">
                  {editingAccount.accountType === 'SUPER_ADMIN' ? 'Édition Super Administrateur' : 'Gestion Structure & Accès Admin'}
                </span>
                <h3 className="text-lg font-black text-white mt-0.5">{editingAccount.name}</h3>
                <p className="text-[11px] font-mono text-slate-400">ID: {editingAccount.id}</p>
              </div>
              <button onClick={() => setEditingAccount(null)} className="p-1.5 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white rounded-xl cursor-pointer">✕</button>
            </div>

            <form onSubmit={handleSaveEditedAccount} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 font-bold">
                    {editingAccount.accountType === 'SUPER_ADMIN' ? 'Nom Complet' : 'Nom de la Structure'}
                  </label>
                  <input
                    type="text"
                    required
                    value={editingAccount.editName}
                    onChange={e => setEditingAccount({ ...editingAccount, editName: e.target.value })}
                    className="w-full mt-1 px-3.5 py-2 bg-slate-950 border border-white/10 rounded-xl text-white font-bold focus:outline-none focus:border-purple-500"
                  />
                </div>
                <div>
                  <label className="text-slate-400 font-bold">Identifiant Login (@username) *</label>
                  <input
                    type="text"
                    required
                    value={editingAccount.editUsername}
                    onChange={e => setEditingAccount({ ...editingAccount, editUsername: e.target.value })}
                    className="w-full mt-1 px-3.5 py-2 bg-slate-950 border border-white/10 rounded-xl text-rose-300 font-mono font-bold focus:outline-none focus:border-purple-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 font-bold">Adresse E-mail</label>
                  <input
                    type="email"
                    value={editingAccount.editEmail}
                    onChange={e => setEditingAccount({ ...editingAccount, editEmail: e.target.value })}
                    className="w-full mt-1 px-3.5 py-2 bg-slate-950 border border-white/10 rounded-xl text-white focus:outline-none focus:border-purple-500"
                  />
                </div>
                <div>
                  <label className="text-slate-400 font-bold">Statut du Compte</label>
                  <select
                    value={editingAccount.editStatus}
                    onChange={e => setEditingAccount({ ...editingAccount, editStatus: e.target.value })}
                    className="w-full mt-1 px-3.5 py-2 bg-slate-950 border border-white/10 rounded-xl text-white font-bold focus:outline-none focus:border-purple-500"
                  >
                    <option value="ACTIVE">ACTIF (Autorisé)</option>
                    <option value="SUSPENDED">SUSPENDU (Bloqué)</option>
                  </select>
                </div>
              </div>

              {editingAccount.accountType === 'STRUCTURE' && (
                <div className="p-3.5 bg-slate-950/70 border border-white/10 rounded-2xl space-y-3">
                  <p className="text-[11px] font-black uppercase tracking-wider text-rose-400">Licence par Nombre d'Utilisateurs & Responsable</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-slate-400 font-bold">Responsable</label>
                      <input
                        type="text"
                        value={editingAccount.editResponsible}
                        onChange={e => setEditingAccount({ ...editingAccount, editResponsible: e.target.value })}
                        className="w-full mt-1 px-3 py-2 bg-slate-900 border border-white/10 rounded-xl text-white focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-slate-400 font-bold">Formule Commerciale</label>
                      <select
                        value={editingAccount.editPlan}
                        onChange={e => {
                          const nextPlan = e.target.value;
                          const planDef = availablePlans[nextPlan] || SAAS_PLANS[nextPlan as SaaSPlanId] || SAAS_PLANS.STANDARD;
                          const nextUsers = Math.max(Number(editingAccount.editMaxUsers) || 1, Number(planDef.max_users) || 5);
                          const nextPrice = calculateLicensePriceForUsers(planDef, nextUsers, 1).monthlyTotal;
                          setEditingAccount({
                            ...editingAccount,
                            editPlan: nextPlan,
                            editMaxUsers: nextUsers,
                            editLicensePrice: nextPrice
                          });
                        }}
                        className="w-full mt-1 px-3 py-2 bg-slate-900 border border-white/10 rounded-xl text-white font-bold focus:outline-none"
                      >
                        {Object.keys(availablePlans).map(k => (
                          <option key={k} value={k}>
                            {k} ({availablePlans[k]?.max_users || 15} util. inclus)
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-slate-400 font-bold flex items-center justify-between">
                        <span>Quota Max Utilisateurs</span>
                        <span className="text-[10px] font-mono text-emerald-400">
                          Actifs : {editingAccount.activeUsersCount || 1}
                        </span>
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={500}
                        value={editingAccount.editMaxUsers}
                        onChange={e => {
                          const nextUsers = Math.max(1, Number(e.target.value) || 1);
                          const planDef = availablePlans[editingAccount.editPlan] || SAAS_PLANS[editingAccount.editPlan as SaaSPlanId] || SAAS_PLANS.STANDARD;
                          const nextPrice = calculateLicensePriceForUsers(planDef, nextUsers, 1).monthlyTotal;
                          setEditingAccount({
                            ...editingAccount,
                            editMaxUsers: nextUsers,
                            editLicensePrice: nextPrice
                          });
                        }}
                        className="w-full mt-1 px-3 py-2 bg-slate-900 border border-emerald-500/30 rounded-xl text-emerald-300 font-mono font-bold focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-slate-400 font-bold">Tarif Mensuel Calculé (FCFA)</label>
                      <input
                        type="number"
                        min={0}
                        step={5000}
                        value={editingAccount.editLicensePrice ?? 150000}
                        onChange={e => setEditingAccount({ ...editingAccount, editLicensePrice: Number(e.target.value) })}
                        className="w-full mt-1 px-3 py-2 bg-slate-900 border border-blue-500/30 rounded-xl text-blue-300 font-mono font-bold focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between">
                      <label className="text-slate-400 font-bold">Date d'Expiration de la Licence</label>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            const base = editingAccount.editLicenseEnd ? new Date(editingAccount.editLicenseEnd) : new Date();
                            base.setMonth(base.getMonth() + 1);
                            setEditingAccount({ ...editingAccount, editLicenseEnd: base.toISOString().split('T')[0], editStatus: 'ACTIVE' });
                          }}
                          className="px-2 py-0.5 rounded bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 font-bold text-[10px] cursor-pointer"
                        >
                          +1 Mois
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const base = editingAccount.editLicenseEnd ? new Date(editingAccount.editLicenseEnd) : new Date();
                            base.setFullYear(base.getFullYear() + 1);
                            setEditingAccount({ ...editingAccount, editLicenseEnd: base.toISOString().split('T')[0], editStatus: 'ACTIVE' });
                          }}
                          className="px-2 py-0.5 rounded bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 font-bold text-[10px] cursor-pointer"
                        >
                          +1 An
                        </button>
                      </div>
                    </div>
                    <input
                      type="date"
                      value={editingAccount.editLicenseEnd}
                      onChange={e => setEditingAccount({ ...editingAccount, editLicenseEnd: e.target.value })}
                      className="w-full mt-1 px-3 py-2 bg-slate-900 border border-white/10 rounded-xl text-white font-mono font-bold focus:outline-none"
                    />
                  </div>
                </div>
              )}

              {/* Password Reset Box */}
              <div className="p-3.5 bg-purple-950/20 border border-purple-500/30 rounded-2xl space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="font-extrabold text-purple-200 flex items-center gap-1.5">
                    <Key size={14} className="text-purple-400" />
                    Réinitialiser le Mot de Passe <span className="text-[10px] text-slate-400 font-normal">(Laisser vide pour conserver l'actuel)</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setEditingAccount({ ...editingAccount, newPassword: generateAutoPassword() })}
                    className="px-2.5 py-1 rounded-lg bg-purple-600/30 hover:bg-purple-600/50 border border-purple-400/30 text-purple-200 font-bold text-[10px] flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw size={11} /> Générer un mot de passe
                  </button>
                </div>
                <input
                  type="text"
                  placeholder="Saisir ou générer un nouveau mot de passe..."
                  value={editingAccount.newPassword}
                  onChange={e => setEditingAccount({ ...editingAccount, newPassword: e.target.value })}
                  className="w-full px-3.5 py-2 bg-slate-950 border border-purple-500/40 rounded-xl text-purple-200 font-mono font-bold focus:outline-none focus:border-purple-400"
                />
                {editingAccount.accountType === 'STRUCTURE' && editingAccount.newPassword && (
                  <label className="flex items-center gap-2 text-[11px] text-slate-300 cursor-pointer pt-1">
                    <input
                      type="checkbox"
                      checked={editingAccount.forcePasswordChange}
                      onChange={e => setEditingAccount({ ...editingAccount, forcePasswordChange: e.target.checked })}
                      className="rounded border-white/20"
                    />
                    <span>Demander le changement obligatoire du mot de passe à la prochaine connexion</span>
                  </label>
                )}
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setEditingAccount(null)}
                  className="px-4 py-2 rounded-xl font-bold text-slate-400 hover:text-white cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 bg-gradient-to-b from-purple-500 to-purple-700 hover:from-purple-400 hover:to-purple-600 text-white rounded-xl font-black uppercase tracking-wider flex items-center gap-1.5 border border-purple-400/40 shadow-lg cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
                  Enregistrer les Modifications
                </button>
              </div>
            </form>
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
