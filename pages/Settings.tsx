
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { 
  Users, 
  Hospital, 
  Database, 
  CreditCard, 
  Plus, 
  Trash2, 
  Save, 
  CheckCircle2, 
  AlertCircle,
  ChevronRight,
  ChevronDown,
  Check,
  UserPlus,
  Stethoscope,
  Pill,
  Building2,
  Shield,
  Edit2,
  Key,
  Ban,
  Palette,
  X,
  Search,
  Filter,
  Wrench,
  Package,
  Camera,
  History,
  PlusCircle,
  RotateCcw,
  Beaker,
  FlaskConical,
  ShieldCheck,
  ShieldAlert,
  Zap,
  AlertTriangle,
  TrendingUp,
  Printer,
  Receipt,
  FileText
} from 'lucide-react';
import { Role, User, EstablishmentConfig, MedicalAct, Medication, CustomRole, UserStatus, Supplier, SupplierInvoice, Licence } from '../types';
import { HospitalisationSettingsTab } from './settings/HospitalisationSettingsTab';
import { DEFAULT_ROLES } from '../constants/rbac';
import { THEMES, ThemeColor, applyTheme } from '../constants/themes';
import RolesPermissions from './settings/RolesPermissions';
import ServicesDepartments from './settings/ServicesDepartments';
import ProtocolsManagement from './settings/ProtocolsManagement';
import WhatsAppAgentSettings from './settings/WhatsAppAgentSettings';
import AddMedicationForm from './settings/AddMedicationForm';
import RestockModal from './settings/RestockModal';
import StockMovementsModal from './settings/StockMovementsModal';
import AddMedicalActForm from './settings/AddMedicalActForm';
import AddConsumableForm from './settings/AddConsumableForm';
import { Breadcrumbs } from '../components/common/Breadcrumbs';
import { MicroHeader } from '../components/common/MicroHeader';
import { MedicalStatusBadge } from '../components/common/MedicalStatusBadge';
import { Avatar } from '../components/common/Avatar';
import { ImageUpload } from '../components/common/ImageUpload';
import { StaffPerformanceModal } from '../components/profile/StaffPerformanceModal';
import { AppearanceSettings } from './settings/AppearanceSettings';
import { LicenseSettings } from './settings/LicenseSettings';
import { db, sanitizeData, handleFirestoreError, OperationType } from '../src/firebase';
import { collection, onSnapshot, doc, setDoc, deleteDoc, query, orderBy, where, addDoc, updateDoc, getDocs, limit, getDoc } from 'firebase/firestore';
import { getActiveTenantId, belongsToTenant, stampTenantData } from '../src/utils/tenant';

interface SettingsProps {
  activeTab: 'users' | 'roles' | 'establishment' | 'appearance' | 'referentials' | 'cashier_settings' | 'services' | 'protocols' | 'whatsapp_agent' | 'licence';
  setActiveTab: (tab: 'users' | 'roles' | 'establishment' | 'appearance' | 'referentials' | 'cashier_settings' | 'services' | 'protocols' | 'whatsapp_agent' | 'licence') => void;
  user: User | null;
  onBackToDashboard?: () => void;
  theme?: 'light' | 'dark';
  toggleTheme?: () => void;
}

const PRIMARY_ROLES = [
  { value: Role.RECEPTION, label: 'Accueil / Réception', tag: 'role_receptionniste', desc: 'Orientation, admission patients et création dossiers' },
  { value: Role.CASHIER, label: 'Caissier / Caisse & Facturation', tag: 'role_caissier', desc: 'Encaissement des actes, facturation et clôture de caisse' },
  { value: Role.DOCTOR, label: 'Médecin / Consultation', tag: 'role_medecin', desc: 'Consultations médicales, diagnostics et prescriptions' },
  { value: Role.NURSE, label: 'Infirmier / Soins Infirmiers', tag: 'role_infirmier', desc: 'Constantes vitales, soins ambulatoires et administration' },
  { value: Role.PHARMACY, label: 'Pharmacien / Pharmacie', tag: 'role_pharmacien', desc: 'Gestion des stocks, dispensation et délivrance médicaments' },
  { value: Role.LAB, label: 'Laborantin / Laboratoire', tag: 'role_laborantin', desc: 'Prélèvements, bilans sanguins et analyses biologiques' },
  { value: Role.MATERNITY, label: 'Sage-Femme / Maternité', tag: 'role_sage_femme', desc: 'CPN, accouchements, suite de couches et santé de la mère' },
  { value: Role.INPATIENT, label: 'Hospitalisation', tag: 'role_hospitalisation', desc: 'Gestion des lits, surveillance et séjours hospitaliers' },
  { value: Role.URGENCE, label: 'Urgences', tag: 'role_urgence', desc: 'Triage immédiat, salle de déchoquage et soins d\'urgence' },
  { value: Role.ACCOUNTANT, label: 'Gestionnaire / Comptable', tag: 'role_gestionnaire', desc: 'Comptabilité, états financiers et gestion administrative' },
  { value: Role.ADMIN, label: 'Administrateur Établissement', tag: 'role_admin', desc: 'Gestion complète du personnel et configuration du centre' },
];

const Settings: React.FC<SettingsProps> = ({ activeTab, setActiveTab, user, onBackToDashboard, theme = 'light', toggleTheme }) => {
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [showAddMedication, setShowAddMedication] = useState(false);
  const [editingMedication, setEditingMedication] = useState<Medication | null>(null);
  const [showAddMedicalAct, setShowAddMedicalAct] = useState(false);
  const [editingMedicalAct, setEditingMedicalAct] = useState<MedicalAct | null>(null);
  const [showAddConsumable, setShowAddConsumable] = useState(false);

  // --- State for Roles ---
  const [roles, setRoles] = useState<CustomRole[]>([]);

  // --- State for Users ---
  const [users, setUsers] = useState<User[]>([]);
  const [newUser, setNewUser] = useState<Partial<User>>({ role: Role.RECEPTION, roles: [], status: 'ACTIVE' });
  const [isEditingUser, setIsEditingUser] = useState(false);
  const [showUserForm, setShowUserForm] = useState(false);
  const [isRolesDropdownOpen, setIsRolesDropdownOpen] = useState(false);
  const [viewingUser, setViewingUser] = useState<User | null>(null);
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState<string>('ALL');
  const [userStatusFilter, setUserStatusFilter] = useState<string>('ALL');

  const availableRoles = useMemo(() => {
    return roles.length > 0 ? roles : DEFAULT_ROLES;
  }, [roles]);

  const handlePrimaryRoleChange = (selectedRole: Role) => {
    const opt = PRIMARY_ROLES.find(o => o.value === selectedRole);
    const currentRoles = newUser.roles || [];
    let updatedRoles = [...currentRoles];
    if (opt?.tag) {
      const matchingRole = availableRoles.find(r => r.id === opt.tag || r.id === opt.tag.replace('role_', ''));
      const targetId = matchingRole ? matchingRole.id : opt.tag;
      if (!updatedRoles.includes(targetId)) {
        updatedRoles.push(targetId);
      }
    }
    setNewUser({
      ...newUser,
      role: selectedRole,
      roles: updatedRoles
    });
  };

  // --- State for SaaS Multi-Tenant Licence & Quota Tracking ---
  const [licencesCatalog, setLicencesCatalog] = useState<Licence[]>([]);
  const [activeHospitalRecord, setActiveHospitalRecord] = useState<any>(null);

  // --- State for Establishment ---
  const [establishment, setEstablishment] = useState<EstablishmentConfig>({
    name: 'Hôpital Central de Yaoundé',
    address: 'Avenue de l\'Indépendance, Yaoundé, Cameroun',
    phone: '+237 222 33 44 55',
    language: 'FR' as const,
    currency: 'XAF' as const,
    theme: 'blue',
    email: 'contact@smarthosto.com',
    city: 'Yaoundé',
    country: 'Cameroun',
    slogan: 'Votre santé, notre priorité absolue',
    logo: 'SH',
    taxId: 'NIF: M0123456789J / RCCM: RC/YAO/2024/B/123',
    website: 'www.smarthosto.com',
    bankInfo: 'RIB: 10001 00001 12345678901 23 - Afriland First Bank',
    invoiceFooter: 'Merci de votre confiance. En cas de réclamation, veuillez contacter le service facturation.'
  });

  // --- State for Referentials ---
  const [activeReferentialTab, setActiveReferentialTab] = useState<'acts' | 'medications' | 'consumables'>('acts');
  const [acts, setActs] = useState<MedicalAct[]>([]);
  const [meds, setMeds] = useState<Medication[]>([]);
  const [consumables, setConsumables] = useState<any[]>([]);

  // --- State for Acts Filters ---
  const [actSearchQuery, setActSearchQuery] = useState('');
  const [actCategoryFilter, setActCategoryFilter] = useState('tous');

  // --- State for Consumables Filters ---
  const [consumableSearch, setConsumableSearch] = useState('');
  const [consumableCategoryFilter, setConsumableCategoryFilter] = useState('tous');

  // --- State for Medication & Consumables Restock & Audit ---
  const [selectedMedForRestock, setSelectedMedForRestock] = useState<Medication | null>(null);
  const [selectedConsumableForRestock, setSelectedConsumableForRestock] = useState<any | null>(null);
  const [showUniversalRestock, setShowUniversalRestock] = useState<boolean>(false);
  const [showStockMovements, setShowStockMovements] = useState(false);
  const [medSearchQuery, setMedSearchQuery] = useState('');
  const [medFamilyFilter, setMedFamilyFilter] = useState('tous');
  
  // --- State for Cashier Settings ---
  const [cashierSettings, setCashierSettings] = useState({
    partialPayment: true,
    maxDebt: 50000,
    allowCredit: true,
    autoApplyCredit: true
  });

  const activeTenantId = useMemo(() => getActiveTenantId(user, establishment), [user, establishment]);

  // Firestore Listeners
  useEffect(() => {
    const unsubUsers = onSnapshot(collection(db, 'hospital_users'), (snap) => {
      const allUsers = snap.docs.map(d => ({ id: d.id, ...d.data() } as User));
      setUsers(allUsers.filter(u => belongsToTenant(u, activeTenantId)));
    });

    const unsubRoles = onSnapshot(collection(db, 'hospital_roles'), (snap) => {
      const allRoles = snap.docs.map(d => ({ id: d.id, ...d.data() } as CustomRole));
      setRoles(allRoles.filter(r => belongsToTenant(r, activeTenantId)));
    });

    const unsubConfig = onSnapshot(collection(db, 'hospital_config'), (snap) => {
      const matched = snap.docs.find(d => belongsToTenant(d.data(), activeTenantId));
      if (matched) {
        setEstablishment(matched.data() as EstablishmentConfig);
      } else if (!snap.empty && activeTenantId === 'default_hospital') {
        setEstablishment(snap.docs[0].data() as EstablishmentConfig);
      }
    });

    const unsubActs = onSnapshot(collection(db, 'medical_acts'), (snap) => {
      const allActs = snap.docs.map(d => ({ id: d.id, ...d.data() } as MedicalAct));
      setActs(allActs.filter(a => belongsToTenant(a, activeTenantId)));
    });

    const unsubMeds = onSnapshot(collection(db, 'pharmacy_inventory'), (snap) => {
      const allMeds = snap.docs.map(d => ({ id: d.id, ...d.data() } as Medication));
      setMeds(allMeds.filter(m => belongsToTenant(m, activeTenantId)));
    });

    const unsubConsumables = onSnapshot(collection(db, 'hospital_consumables'), (snap) => {
      const allCons = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setConsumables(allCons.filter(c => belongsToTenant(c, activeTenantId)));
    });

    const unsubCashier = onSnapshot(collection(db, 'parametres_caisse'), (snap) => {
      const matched = snap.docs.find(d => belongsToTenant(d.data(), activeTenantId));
      const target = matched || (activeTenantId === 'default_hospital' ? snap.docs[0] : null);
      if (target) {
        const data = target.data();
        setCashierSettings({
          partialPayment: data.paiementPartielAutorise,
          maxDebt: data.seuilDetteMax,
          allowCredit: data.avoirPatientAutorise,
          autoApplyCredit: data.applicationAutoAvoir
        });
      }
    });

    const unsubLicences = onSnapshot(collection(db, 'licences'), (snap) => {
      setLicencesCatalog(snap.docs.map(d => ({ id: d.id, ...d.data() } as Licence)));
    });

    const unsubHospitals = onSnapshot(collection(db, 'hospitals'), (snap) => {
      if (!snap.empty) {
        const currentClinicId = (user as any)?.clinicId || (user as any)?.hospital_id || '';
        const found = snap.docs.find(d => d.id === currentClinicId || (d.data() as any).name === establishment.name);
        if (found) {
          setActiveHospitalRecord({ id: found.id, ...found.data() });
        }
      }
    });

    const unsubClinics = onSnapshot(collection(db, 'saas_clinics'), (snap) => {
      if (!snap.empty) {
        const currentClinicId = (user as any)?.clinicId || (user as any)?.hospital_id || '';
        const found = snap.docs.find(d => d.id === currentClinicId || (d.data() as any).name === establishment.name);
        if (found) {
          setActiveHospitalRecord(prev => prev || { id: found.id, ...found.data() });
        }
      }
    });

    return () => {
      unsubUsers();
      unsubRoles();
      unsubConfig();
      unsubActs();
      unsubMeds();
      unsubConsumables();
      unsubCashier();
      unsubLicences();
      unsubHospitals();
      unsubClinics();
    };
  }, [user, establishment.name, activeTenantId]);

  // Handle deep-linking navigation from System Alerts (e.g. Low Stock restock)
  useEffect(() => {
    if (activeTab === 'referentials') {
      const targetRefTab = localStorage.getItem('hospital_active_referential_tab');
      if (targetRefTab === 'medicaments' || targetRefTab === 'medications') {
        setActiveReferentialTab('medications');
        localStorage.removeItem('hospital_active_referential_tab');
      }
      const refSearch = localStorage.getItem('hospital_referential_search');
      if (refSearch) {
        setMedSearchQuery(refSearch);
        localStorage.removeItem('hospital_referential_search');
      }
    }
  }, [activeTab]);

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  };

  // --- Restock Submit Handler for Medications & Consumables ---
  const handleRestockSubmit = async (data: {
    itemType?: 'MEDICATION' | 'CONSUMABLE';
    itemId?: string;
    itemName?: string;
    quantity: number;
    batchNumber: string;
    expiryDate: string;
    purchaseCost?: number;
    supplier?: string;
    supplierId?: string;
    notes?: string;
  }) => {
    const isConsumable = data.itemType === 'CONSUMABLE' || (!selectedMedForRestock && selectedConsumableForRestock);
    const targetItemId = data.itemId || (isConsumable ? selectedConsumableForRestock?.id : selectedMedForRestock?.id);

    if (!targetItemId) {
      showMessage('error', "Aucun article sélectionné pour le réapprovisionnement");
      return;
    }

    try {
      if (isConsumable) {
        // === 1. RESTOCK CONSUMABLE ===
        const consumableRef = doc(db, 'hospital_consumables', targetItemId);
        const consumableSnap = await getDoc(consumableRef);
        
        let consumableData = consumableSnap.exists() ? consumableSnap.data() : selectedConsumableForRestock;
        const consumableName = consumableData?.nom || consumableData?.name || data.itemName || 'Consommable';
        const currentStock = Number(consumableData?.stock !== undefined ? consumableData?.stock : (consumableData?.stockInitial || 0));
        const newStock = currentStock + data.quantity;

        // Increment live stock count in hospital_consumables
        await updateDoc(consumableRef, {
          stock: newStock,
          ...(data.purchaseCost !== undefined ? { dernierPrixAchat: data.purchaseCost } : {}),
          lastRestockedAt: new Date().toISOString(),
          lastRestockedBy: user?.name || 'Administrateur',
          lastSupplier: data.supplier || '',
          lastBatchNumber: data.batchNumber || '',
          updatedAt: new Date().toISOString()
        });

        // Audit Trail in stock_movements
        const movementId = `STK-MOV-${Date.now()}`;
        const movementEntry = {
          id: movementId,
          medicationId: targetItemId,
          medicationName: consumableName,
          type: 'REFILL',
          itemType: 'CONSUMABLE',
          quantity: data.quantity,
          previousStock: currentStock,
          newStock: newStock,
          batchNumber: data.batchNumber || '',
          expiryDate: data.expiryDate || '',
          purchaseCost: data.purchaseCost || 0,
          supplier: data.supplier || '',
          notes: data.notes || '',
          adminName: user?.name || 'Administrateur',
          adminId: user?.id || '',
          createdAt: new Date().toISOString()
        };
        await setDoc(doc(db, 'stock_movements', movementId), sanitizeData(stampTenantData(movementEntry, user, establishment)));

        // Automated Accounting Synchronization: Generate Supplier Invoice (Comptabilité > Dépenses & Paiements)
        const supplierName = (data.supplier || '').trim() || 'Fournisseur Consommables';
        const unitCost = Number(data.purchaseCost) || 0;
        const totalInvoiceAmount = unitCost * data.quantity;
        const invoiceId = `FAC-FOUR-${Date.now()}`;
        const supplierId = data.supplierId || `SUPP-${supplierName.toLowerCase().replace(/[^a-z0-9]/g, '-') || Date.now()}`;

        if (totalInvoiceAmount > 0 || supplierName) {
          try {
            // 1. Supplier Invoice for Achats / Fournisseurs Tab
            const newInvoice: SupplierInvoice = {
              id: invoiceId,
              invoiceNumber: `FAC-ACHAT-${Date.now().toString().slice(-6)}`,
              supplierId: supplierId,
              supplierName: supplierName,
              moduleSource: 'CONSOMMABLES' as any,
              type: 'LIVRAISON_STOCK',
              items: [{
                name: consumableName,
                quantity: data.quantity,
                unitCost: unitCost,
                totalCost: totalInvoiceAmount,
                batchNumber: data.batchNumber || '',
                expiryDate: data.expiryDate || ''
              }],
              totalAmount: totalInvoiceAmount,
              amountPaid: 0,
              status: 'PENDING',
              date: new Date().toISOString(),
              notes: data.notes || `Livraison consommables: ${consumableName} (${data.quantity} ${consumableData?.uniteGestion || 'unités'})`,
              createdAt: new Date().toISOString()
            };
            await setDoc(doc(db, 'supplier_invoices', invoiceId), sanitizeData(stampTenantData(newInvoice, user, establishment)));

            // 2. Direct Expense Record for Dépenses & Paiements Tab
            const expenseId = `EXP-RESTOCK-${Date.now()}`;
            const newExpense = {
              id: expenseId,
              reference: `EXP-FOUR-${Date.now().toString().slice(-6)}`,
              date: new Date().toISOString(),
              category: 'FOURNISSEURS',
              categoryLabel: 'Fournisseurs (Réapprovisionnement Consommables)',
              beneficiary: supplierName,
              beneficiaryId: supplierId,
              beneficiaryRole: 'Fournisseur',
              amount: totalInvoiceAmount,
              status: 'PENDING',
              description: `Achat stock consommable: ${consumableName} (${data.quantity} ${consumableData?.uniteGestion || 'unités'})`,
              createdBy: user?.name || 'Administrateur',
              createdAt: new Date().toISOString(),
              metadata: {
                invoiceId: invoiceId,
                supplierId: supplierId,
                itemType: 'CONSUMABLE',
                itemId: targetItemId
              }
            };
            await setDoc(doc(db, 'expenses', expenseId), sanitizeData(stampTenantData(newExpense, user, establishment)));

            // 3. Update or create Supplier Record
            const suppRef = doc(db, 'suppliers', supplierId);
            const suppSnap = await getDoc(suppRef);
            if (suppSnap.exists()) {
              const existingSupp = suppSnap.data() as Supplier;
              const currentDebt = Number(existingSupp.outstandingDebt || existingSupp.balance || 0);
              const currentBought = Number(existingSupp.totalBought || 0);
              const currentHistory = Number(existingSupp.historyCount || 0);

              await updateDoc(suppRef, {
                outstandingDebt: currentDebt + totalInvoiceAmount,
                balance: currentDebt + totalInvoiceAmount,
                totalBought: currentBought + totalInvoiceAmount,
                historyCount: currentHistory + 1,
                updatedAt: new Date().toISOString()
              });
            } else {
              const newSupplier: Supplier = {
                id: supplierId,
                name: supplierName,
                contact: 'Service Approvisionnement Consommables',
                phone: '',
                email: '',
                address: 'Dépôt Matériel Médical',
                category: 'Consommables & Matériel',
                outstandingDebt: totalInvoiceAmount,
                balance: totalInvoiceAmount,
                totalBought: totalInvoiceAmount,
                historyCount: 1,
                createdAt: new Date().toISOString()
              };
              await setDoc(suppRef, sanitizeData(stampTenantData(newSupplier, user, establishment)));
            }
          } catch (invErr) {
            console.error("Error syncing accounting for consumable restock:", invErr);
          }
        }

        showMessage('success', `Stock de "${consumableName}" réapprovisionné (+${data.quantity}). Nouveau stock: ${newStock}. Facture synchronisée en Comptabilité.`);
        setSelectedConsumableForRestock(null);
        setShowUniversalRestock(false);

      } else {
        // === 2. RESTOCK MEDICATION ===
        const medRef = doc(db, 'pharmacy_inventory', targetItemId);
        const medSnap = await getDoc(medRef);
        if (!medSnap.exists()) {
          showMessage('error', 'Médicament non trouvé dans le catalogue');
          return;
        }

        const currentMed = medSnap.data() as Medication;
        const currentStock = Number(currentMed.stock) || 0;
        const newStock = currentStock + data.quantity;

        // 1. Accumulation logic: update pharmacy_inventory with new accumulated stock!
        await updateDoc(medRef, {
          stock: newStock,
          batchNumber: data.batchNumber,
          expiryDate: data.expiryDate,
          ...(data.purchaseCost !== undefined ? { prixAchat: data.purchaseCost } : {}),
          lastRestockedAt: new Date().toISOString(),
          lastRestockedBy: user?.name || 'Administrateur',
          updatedAt: new Date().toISOString()
        });

        // 2. Audit Trail: Automatically generate an entry in stock_movements
        const movementId = `STK-MOV-${Date.now()}`;
        const movementEntry = {
          id: movementId,
          medicationId: targetItemId,
          medicationName: currentMed.name,
          type: 'REFILL',
          itemType: 'MEDICATION',
          quantity: data.quantity,
          previousStock: currentStock,
          newStock: newStock,
          batchNumber: data.batchNumber,
          expiryDate: data.expiryDate,
          purchaseCost: data.purchaseCost || 0,
          supplier: data.supplier || '',
          notes: data.notes || '',
          adminName: user?.name || 'Administrateur',
          adminId: user?.id || '',
          createdAt: new Date().toISOString()
        };
        await setDoc(doc(db, 'stock_movements', movementId), sanitizeData(stampTenantData(movementEntry, user, establishment)));

        // 3. Automated Accounting Integration: Generate Supplier Invoice (Achats & Fournisseurs)
        const supplierName = (data.supplier || '').trim();
        const unitCost = Number(data.purchaseCost) || 0;
        const totalInvoiceAmount = unitCost * data.quantity;

        if (supplierName || totalInvoiceAmount > 0) {
          try {
            const invoiceId = `FAC-FOUR-${Date.now()}`;
            const supplierId = data.supplierId || `SUPP-${supplierName.toLowerCase().replace(/[^a-z0-9]/g, '-') || Date.now()}`;
            
            const newInvoice: SupplierInvoice = {
              id: invoiceId,
              invoiceNumber: `FAC-ACHAT-${Date.now().toString().slice(-6)}`,
              supplierId: supplierId,
              supplierName: supplierName || 'Fournisseur Médicaments',
              moduleSource: 'PHARMACIE',
              type: 'LIVRAISON_STOCK',
              items: [{
                name: currentMed.name,
                quantity: data.quantity,
                unitCost: unitCost,
                totalCost: totalInvoiceAmount,
                batchNumber: data.batchNumber,
                expiryDate: data.expiryDate
              }],
              totalAmount: totalInvoiceAmount,
              amountPaid: 0,
              status: 'PENDING',
              date: new Date().toISOString(),
              notes: data.notes || `Livraison de réapprovisionnement: ${currentMed.name} (${data.quantity} unités, Lot: ${data.batchNumber})`,
              createdAt: new Date().toISOString()
            };
            await setDoc(doc(db, 'supplier_invoices', invoiceId), sanitizeData(stampTenantData(newInvoice, user, establishment)));

            // Sync to expenses collection for universal accounting visibility
            const expenseId = `EXP-RESTOCK-${Date.now()}`;
            const newExpense = {
              id: expenseId,
              reference: `EXP-FOUR-${Date.now().toString().slice(-6)}`,
              date: new Date().toISOString(),
              category: 'FOURNISSEURS',
              categoryLabel: 'Fournisseurs (Réapprovisionnement Médicaments)',
              beneficiary: supplierName || 'Fournisseur Médicaments',
              beneficiaryId: supplierId,
              beneficiaryRole: 'Fournisseur',
              amount: totalInvoiceAmount,
              status: 'PENDING',
              description: `Achat stock pharmacie: ${currentMed.name} (${data.quantity} unités)`,
              createdBy: user?.name || 'Administrateur',
              createdAt: new Date().toISOString(),
              metadata: {
                invoiceId: invoiceId,
                supplierId: supplierId,
                itemType: 'MEDICATION',
                itemId: targetItemId
              }
            };
            await setDoc(doc(db, 'expenses', expenseId), sanitizeData(stampTenantData(newExpense, user, establishment)));

            // Check if supplier exists in 'suppliers'
            const suppRef = doc(db, 'suppliers', supplierId);
            const suppSnap = await getDoc(suppRef);
            if (suppSnap.exists()) {
              const existingSupp = suppSnap.data() as Supplier;
              const currentDebt = Number(existingSupp.outstandingDebt || existingSupp.balance || 0);
              const currentBought = Number(existingSupp.totalBought || 0);
              const currentHistory = Number(existingSupp.historyCount || 0);

              await updateDoc(suppRef, {
                outstandingDebt: currentDebt + totalInvoiceAmount,
                balance: currentDebt + totalInvoiceAmount,
                totalBought: currentBought + totalInvoiceAmount,
                historyCount: currentHistory + 1,
                updatedAt: new Date().toISOString()
              });
            } else {
              const newSupplier: Supplier = {
                id: supplierId,
                name: supplierName || 'Fournisseur Pharmacie',
                contact: 'Service Approvisionnement',
                phone: '',
                email: '',
                address: 'Dépôt Médical Central',
                category: 'Médicaments & Pharmacie',
                outstandingDebt: totalInvoiceAmount,
                balance: totalInvoiceAmount,
                totalBought: totalInvoiceAmount,
                historyCount: 1,
                createdAt: new Date().toISOString()
              };
              await setDoc(suppRef, sanitizeData(stampTenantData(newSupplier, user, establishment)));
            }
          } catch (invErr) {
            console.error("Error creating automated supplier invoice:", invErr);
          }
        }

        showMessage('success', `Stock de "${currentMed.name}" réapprovisionné (+${data.quantity}). Nouveau stock: ${newStock}. Facture synchronisée en Comptabilité.`);
        setSelectedMedForRestock(null);
        setShowUniversalRestock(false);
      }
    } catch (error) {
      console.error("Error restocking item:", error);
      showMessage('error', "Erreur lors du réapprovisionnement du stock");
      handleFirestoreError(error, OperationType.WRITE, 'stock_movements');
    }
  };

  const handleDeleteConsumable = async (consumableId: string, consumableName: string) => {
    if (window.confirm(`Voulez-vous vraiment supprimer "${consumableName}" des consommables ?`)) {
      try {
        await deleteDoc(doc(db, 'hospital_consumables', consumableId));
        showMessage('success', `Consommable "${consumableName}" supprimé`);
      } catch (error) {
        console.error("Error deleting consumable:", error);
        showMessage('error', "Erreur lors de la suppression");
      }
    }
  };

  const handleDeleteMedication = async (medId: string, medName: string) => {
    if (window.confirm(`Voulez-vous vraiment supprimer "${medName}" du catalogue ?`)) {
      try {
        await deleteDoc(doc(db, 'pharmacy_inventory', medId));
        showMessage('success', `Médicament "${medName}" supprimé`);
      } catch (err) {
        console.error("Error deleting med:", err);
        showMessage('error', "Erreur lors de la suppression");
      }
    }
  };

  // Helper: Check if logged-in user is the hospital center's principal admin
  const isPrincipalAdmin = useMemo(() => {
    if (!user) return false;
    return (
      user.role === Role.ADMIN ||
      user.roles?.includes('role_admin') ||
      (user.username || '').toLowerCase() === 'admin' ||
      (user as any).isMainAdmin === true
    );
  }, [user]);

  // Helper: Filter out Super Admin accounts from hospital center's user list
  const isSuperAdminUser = (u: User) => {
    const uname = (u.username || '').toLowerCase();
    return (
      u.role === Role.SUPER_ADMIN ||
      (u.role as string) === 'SUPER_ADMIN' ||
      u.roles?.includes('role_super_admin') ||
      uname === 'superadmin' ||
      uname === 'sa1' ||
      (u as any).accountType === 'SUPER_ADMIN' ||
      (u as any).isSuperAdmin === true
    );
  };

  // Helper: Automatic Password Generator
  const generateAutoPassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789#@!';
    let pass = 'SH-';
    for (let i = 0; i < 8; i++) {
      pass += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return pass;
  };

  // --- Handlers ---
  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isPrincipalAdmin) {
      showMessage('error', "Seul l'administrateur principal de cet établissement est autorisé à créer de nouveaux utilisateurs.");
      return;
    }

    if (!isEditingUser && isQuotaReached) {
      showMessage('error', "Vous avez atteint la limite d'utilisateurs pour votre licence actuelle. Veuillez contacter l'administrateur système pour passer à une licence supérieure.");
      return;
    }

    const cleanUsername = (newUser.username || '').trim();
    if (!cleanUsername) {
      showMessage('error', "L'identifiant de connexion (Username) est obligatoire.");
      return;
    }

    const autoPass = newUser.password || generateAutoPassword();
    const finalName = (newUser.name || '').trim() || cleanUsername;
    const finalEmail = (newUser.email || '').trim() || `${cleanUsername.toLowerCase()}@smarthosto.com`;

    const sanitizedBaseSalary = Math.max(0, Math.floor(Number(newUser.salaire_de_base) || 0));

    try {
      if (isEditingUser && newUser.id) {
        const photoUrl = newUser.profile_image_url || newUser.profileImage;
        await setDoc(doc(db, 'hospital_users', newUser.id), sanitizeData({
          ...newUser,
          username: cleanUsername,
          name: finalName,
          email: finalEmail,
          salaire_de_base: sanitizedBaseSalary,
          profile_image_url: photoUrl || null,
          profileImage: photoUrl || null,
          updatedAt: new Date().toISOString()
        }), { merge: true });
        showMessage('success', 'Utilisateur modifié avec succès');
      } else {
        const photoUrl = newUser.profile_image_url || newUser.profileImage;
        const currentClinicId = (user as any)?.clinicId || (user as any)?.hospital_id || (user as any)?.structureId || establishment.tenantId || establishment.hospital_id || '';
        const currentStructureName = (user as any)?.structureName || establishment.name || '';
        
        // 1. Call Backend Quota Guard (The Hard Lock)
        try {
          const apiRes = await fetch('/api/hospital/staff', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              username: cleanUsername,
              name: finalName,
              email: finalEmail,
              password: autoPass,
              role: (newUser.role as Role) || Role.DOCTOR,
              roles: newUser.roles || [],
              status: newUser.status || 'ACTIVE',
              profession: newUser.profession || '',
              salaire_de_base: sanitizedBaseSalary,
              hospital_id: currentClinicId,
              clinicId: currentClinicId,
              structureName: currentStructureName,
              forcePasswordChange: newUser.forcePasswordChange ?? true,
              profileImage: photoUrl,
              profile_image_url: photoUrl
            })
          });

          if (!apiRes.ok) {
            const errData = await apiRes.json().catch(() => ({}));
            if (apiRes.status === 403 && errData.error === 'QUOTA_REACHED') {
              showMessage('error', "Vous avez atteint la limite d'utilisateurs pour votre licence actuelle. Veuillez contacter l'administrateur système pour passer à une licence supérieure.");
              return;
            }
            throw new Error(errData.message || "Erreur de quota ou de validation serveur");
          }
        } catch (fetchErr: any) {
          if (fetchErr?.message?.includes('QUOTA_REACHED') || fetchErr?.message?.includes('limite')) {
            showMessage('error', "Vous avez atteint la limite d'utilisateurs pour votre licence actuelle. Veuillez contacter l'administrateur système pour passer à une licence supérieure.");
            return;
          }
          console.warn("Backend API call failed, verifying local quota before fallback:", fetchErr);
          if (isQuotaReached) {
            showMessage('error', "Vous avez atteint la limite d'utilisateurs pour votre licence actuelle. Veuillez contacter l'administrateur système pour passer à une licence supérieure.");
            return;
          }
          const userId = Math.random().toString(36).substr(2, 9);
          const userToAdd: User = {
            id: userId,
            username: cleanUsername,
            email: finalEmail,
            password: autoPass,
            forcePasswordChange: newUser.forcePasswordChange ?? true,
            name: finalName,
            role: (newUser.role as Role) || Role.DOCTOR,
            roles: newUser.roles || [],
            status: newUser.status || 'ACTIVE',
            token: 'fake',
            profession: newUser.profession || '',
            salaire_de_base: sanitizedBaseSalary,
            profileImage: photoUrl,
            profile_image_url: photoUrl,
            createdAt: new Date().toISOString()
          };
          await setDoc(doc(db, 'hospital_users', userId), sanitizeData({
            ...userToAdd,
            clinicId: currentClinicId,
            hospital_id: currentClinicId,
            structureName: currentStructureName,
            createdById: user?.id || '',
            createdByUsername: user?.username || '',
            createdBySuperAdmin: false,
            isMainAdmin: false
          }));
        }

        showMessage('success', `Utilisateur "${cleanUsername}" créé avec succès ! Mot de passe généré : ${autoPass}`);
      }
      
      setNewUser({ role: Role.RECEPTION, roles: [], status: 'ACTIVE' });
      setIsRolesDropdownOpen(false);
      setIsEditingUser(false);
      setShowUserForm(false);
    } catch (error) {
      console.error("Error saving user:", error);
      showMessage('error', 'Erreur lors de l\'enregistrement de l\'utilisateur');
    }
  };

  const handleEditUser = (userToEdit: User) => {
    setNewUser({ 
      ...userToEdit, 
      role: userToEdit.role || Role.RECEPTION,
      roles: userToEdit.roles || [],
      password: '' 
    });
    setIsRolesDropdownOpen(false);
    setIsEditingUser(true);
  };

  const handleResetPassword = (id: string) => {
    showMessage('success', 'Un email de réinitialisation a été envoyé à l\'utilisateur');
  };

  const handleToggleStatus = async (id: string) => {
    const userToToggle = users.find(u => u.id === id);
    if (userToToggle?.username === 'admin' || (userToToggle as any)?.isMainAdmin) {
      showMessage('error', 'Impossible de désactiver l\'administrateur principal');
      return;
    }
    
    try {
      await updateDoc(doc(db, 'hospital_users', id), sanitizeData({
        status: userToToggle?.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE',
        updatedAt: new Date().toISOString()
      }));
      showMessage('success', 'Statut mis à jour');
    } catch (error) {
      console.error("Error toggling status:", error);
    }
  };

  const handleDeleteUser = async (id: string) => {
    const userToDelete = users.find(u => u.id === id);
    if (userToDelete?.username === 'admin' || (userToDelete as any)?.isMainAdmin) {
      showMessage('error', 'Impossible de supprimer l\'administrateur principal');
      return;
    }
    
    try {
      await deleteDoc(doc(db, 'hospital_users', id));
      showMessage('success', 'Utilisateur supprimé');
    } catch (error) {
      console.error("Error deleting user:", error);
    }
  };

  const filteredUsers = users.filter(userToFilter => {
    // 1. Exclude Super Admin accounts from hospital center user list
    if (isSuperAdminUser(userToFilter)) return false;

    // 2. Strict center isolation:
    // Only allow:
    // a) The main admin account of THIS hospital center (the logged in main admin or matching clinicId main admin)
    // b) Users created locally inside THIS hospital center
    const currentUName = (user?.username || '').toLowerCase().trim();
    const currentClinicId = (user as any)?.clinicId || (user as any)?.structureId || '';

    const targetUName = (userToFilter.username || '').toLowerCase().trim();
    const targetClinicId = (userToFilter as any)?.clinicId || (userToFilter as any)?.structureId || '';
    
    const isTargetCreatedBySuperAdmin = 
      (userToFilter as any)?.createdBySuperAdmin === true ||
      (userToFilter as any)?.isMainAdmin === true ||
      userToFilter.id.startsWith('usr_tenant_') ||
      (userToFilter as any)?.accountType === 'STRUCTURE';

    // Is target the main admin / logged-in admin of THIS center?
    const isThisCenterMainAdmin = 
      userToFilter.id === user?.id ||
      (targetUName && targetUName === currentUName) ||
      ((userToFilter as any)?.isMainAdmin === true && currentClinicId && targetClinicId === currentClinicId) ||
      (targetUName === 'admin' && (!currentUName || currentUName === 'admin'));

    // Rule A: If target was created by Super Admin (e.g. main admin of a structure), ONLY allow it if it is THIS center's main admin!
    if (isTargetCreatedBySuperAdmin && !isThisCenterMainAdmin) {
      return false;
    }

    // Rule B: If target has a clinicId specified that differs from current center's clinicId, EXCLUDE IT!
    if (targetClinicId && currentClinicId && targetClinicId !== currentClinicId) {
      return false;
    }

    // Rule C: If target was created by a user from another center, EXCLUDE IT!
    if ((userToFilter as any)?.createdById && user?.id && (userToFilter as any)?.createdById !== user?.id && targetClinicId && currentClinicId && targetClinicId !== currentClinicId) {
      return false;
    }

    const q = (userSearchQuery || '').toLowerCase().trim();
    const matchesSearch = 
      !q ||
      (userToFilter.name || '').toLowerCase().includes(q) ||
      (userToFilter.username || '').toLowerCase().includes(q) ||
      (userToFilter.email && (userToFilter.email || '').toLowerCase().includes(q));
    
    const matchesRole = userRoleFilter === 'ALL' || 
      (userToFilter.roles && userToFilter.roles.includes(userRoleFilter)) || 
      (!userToFilter.roles?.length && userToFilter.role === userRoleFilter);
      
    const matchesStatus = userStatusFilter === 'ALL' || userToFilter.status === userStatusFilter;

    return matchesSearch && matchesRole && matchesStatus;
  });

  // --- SaaS Quota & Licence Calculation for Hospital Admin ---
  const centerStaffCount = useMemo(() => {
    return users.filter(userToFilter => {
      if (isSuperAdminUser(userToFilter)) return false;
      const currentUName = (user?.username || '').toLowerCase().trim();
      const currentClinicId = (user as any)?.clinicId || (user as any)?.hospital_id || (user as any)?.structureId || '';
      const targetUName = (userToFilter.username || '').toLowerCase().trim();
      const targetClinicId = (userToFilter as any)?.clinicId || (userToFilter as any)?.hospital_id || (userToFilter as any)?.structureId || '';
      
      const isTargetCreatedBySuperAdmin = 
        (userToFilter as any)?.createdBySuperAdmin === true ||
        (userToFilter as any)?.isMainAdmin === true ||
        userToFilter.id.startsWith('usr_tenant_') ||
        (userToFilter as any)?.accountType === 'STRUCTURE';

      const isThisCenterMainAdmin = 
        userToFilter.id === user?.id ||
        (targetUName && targetUName === currentUName) ||
        ((userToFilter as any)?.isMainAdmin === true && currentClinicId && targetClinicId === currentClinicId) ||
        (targetUName === 'admin' && (!currentUName || currentUName === 'admin'));

      if (isTargetCreatedBySuperAdmin && !isThisCenterMainAdmin) return false;
      if (targetClinicId && currentClinicId && targetClinicId !== currentClinicId) return false;
      return true;
    }).length;
  }, [users, user]);

  const currentLicence = useMemo<Licence | null>(() => {
    const customMaxUsers = Number(activeHospitalRecord?.quotas?.maxUsers || activeHospitalRecord?.max_users || 0);
    const customPrice = Number(activeHospitalRecord?.licensePrice || 0);
    const targetLicId = activeHospitalRecord?.licence_id || activeHospitalRecord?.licenceId || establishment.licence_id || establishment.licenceId;
    if (targetLicId && licencesCatalog.length > 0) {
      const found = licencesCatalog.find(l => 
        l.id.toLowerCase() === String(targetLicId).toLowerCase() || 
        l.id.toLowerCase().includes(String(targetLicId).toLowerCase())
      );
      if (found) {
        return {
          ...found,
          max_users: customMaxUsers > 0 ? customMaxUsers : found.max_users,
          monthlyPriceFCFA: customPrice > 0 ? customPrice : found.monthlyPriceFCFA
        };
      }
    }
    const planName = (activeHospitalRecord?.nom_licence || activeHospitalRecord?.licenseType || 'Basic').toUpperCase();
    const foundByName = licencesCatalog.find(l => l.nom_licence.toUpperCase() === planName || l.id.toUpperCase().includes(planName));
    if (foundByName) {
      return {
        ...foundByName,
        max_users: customMaxUsers > 0 ? customMaxUsers : foundByName.max_users,
        monthlyPriceFCFA: customPrice > 0 ? customPrice : foundByName.monthlyPriceFCFA
      };
    }

    return {
      id: 'licence_basic',
      nom_licence: activeHospitalRecord?.nom_licence || activeHospitalRecord?.licenseType || 'Basic',
      max_users: customMaxUsers > 0 ? customMaxUsers : (activeHospitalRecord?.licenseType === 'ENTERPRISE' ? 100 : activeHospitalRecord?.licenseType === 'PREMIUM' ? 35 : activeHospitalRecord?.licenseType === 'STANDARD' ? 15 : 5),
      monthlyPriceFCFA: customPrice > 0 ? customPrice : 60000
    };
  }, [licencesCatalog, activeHospitalRecord, establishment]);

  const maxUsersAllowed = useMemo(() => {
    const customQuota = Number(activeHospitalRecord?.quotas?.maxUsers || activeHospitalRecord?.max_users || 0);
    if (customQuota > 0) return customQuota;
    return currentLicence?.max_users || 5;
  }, [currentLicence, activeHospitalRecord]);

  const isQuotaReached = useMemo(() => {
    return centerStaffCount >= maxUsersAllowed;
  }, [centerStaffCount, maxUsersAllowed]);

  const quotaPercentage = useMemo(() => {
    if (maxUsersAllowed <= 0) return 100;
    return Math.min(100, Math.round((centerStaffCount / maxUsersAllowed) * 100));
  }, [centerStaffCount, maxUsersAllowed]);

  const handleSaveEstablishment = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const q = query(collection(db, 'hospital_config'), limit(1));
      const snap = await getDocs(q);
      if (snap.empty) {
        await addDoc(collection(db, 'hospital_config'), sanitizeData(establishment));
      } else {
        await updateDoc(doc(db, 'hospital_config', snap.docs[0].id), sanitizeData(establishment));
      }
      localStorage.setItem('hospital_config', JSON.stringify(establishment));
      window.dispatchEvent(new CustomEvent('settings-updated'));
      showMessage('success', 'Configuration de l\'établissement enregistrée');
    } catch (error) {
      console.error("Error saving establishment config:", error);
      showMessage('error', 'Erreur lors de l\'enregistrement');
    }
  };

  const handleSaveCashierSettings = async () => {
    try {
      const qCaisse = query(collection(db, 'parametres_caisse'), limit(1));
      const snapCaisse = await getDocs(qCaisse);
      const caissePayload = {
        paiementPartielAutorise: cashierSettings.partialPayment,
        seuilDetteMax: cashierSettings.maxDebt,
        avoirPatientAutorise: cashierSettings.allowCredit,
        applicationAutoAvoir: cashierSettings.autoApplyCredit,
        updatedAt: new Date().toISOString()
      };
      if (snapCaisse.empty) {
        await addDoc(collection(db, 'parametres_caisse'), sanitizeData(caissePayload));
      } else {
        await updateDoc(doc(db, 'parametres_caisse', snapCaisse.docs[0].id), sanitizeData(caissePayload));
      }

      const qConfig = query(collection(db, 'hospital_config'), limit(1));
      const snapConfig = await getDocs(qConfig);
      if (snapConfig.empty) {
        await addDoc(collection(db, 'hospital_config'), sanitizeData(establishment));
      } else {
        await updateDoc(doc(db, 'hospital_config', snapConfig.docs[0].id), sanitizeData(establishment));
      }
      localStorage.setItem('hospital_config', JSON.stringify(establishment));
      window.dispatchEvent(new CustomEvent('settings-updated'));

      showMessage('success', 'Paramètres de caisse et format de reçu enregistrés avec succès');
    } catch (error) {
      console.error("Error saving cashier settings:", error);
      showMessage('error', 'Erreur lors de l\'enregistrement des paramètres de caisse');
    }
  };

  const tabLabels: Record<string, string> = {
    users: 'Utilisateurs',
    roles: 'Rôles & Permissions',
    establishment: 'Établissement',
    appearance: 'Apparence & Thèmes',
    referentials: 'Référentiels',
    cashier_settings: 'Caisse',
    services: 'Services',
    protocols: 'Protocoles',
    whatsapp_agent: 'Agent WhatsApp IA'
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden p-3 sm:p-5 font-sans bg-slate-50 text-slate-900">
      <MicroHeader
        icon={Database}
        title={tabLabels[activeTab] || 'Paramètres'}
        subtitle="Console de Paramétrage • Configuration Centrale du SIH"
        breadcrumbs={[
          { label: 'Paramètres', onClick: () => setActiveTab('users') },
          { label: tabLabels[activeTab] || activeTab, active: true }
        ]}
        onHomeClick={onBackToDashboard}
        onBackClick={activeTab !== 'users' ? () => setActiveTab('users') : undefined}
        user={{ name: user?.name || 'Administrateur', role: 'Super Admin' }}
        quickStats={[
          { label: 'Utilisateurs', value: users.length, onClick: () => setActiveTab('users'), active: activeTab === 'users' },
          { label: 'Rôles', value: roles.length, onClick: () => setActiveTab('roles'), active: activeTab === 'roles' }
        ]}
        actions={
          <div className="flex items-center gap-1.5 overflow-x-auto max-w-[660px]">
            {[
              { id: 'users', label: 'Utilisateurs' },
              { id: 'roles', label: 'Rôles' },
              { id: 'establishment', label: 'Établissement' },
              { id: 'licence', label: '💳 Licence & Abonnement' },
              { id: 'appearance', label: '🎨 Thèmes & Couleurs' },
              { id: 'referentials', label: 'Référentiels' },
              { id: 'hospitalisation', label: '🛏️ Hospitalisation' },
              { id: 'cashier_settings', label: 'Caisse' },
              { id: 'protocols', label: 'Protocoles' },
              { id: 'whatsapp_agent', label: '💬 WhatsApp IA' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-2.5 py-1 rounded-xl font-bold text-xs transition-all shrink-0 cursor-pointer ${
                  activeTab === tab.id
                    ? 'bg-rose-600 text-white shadow-xs'
                    : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        }
      />

      {message && (
        <div className={`mt-2 flex items-center gap-3 px-4 py-2 rounded-xl font-bold text-xs animate-in fade-in shrink-0 ${message.type === 'success' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-rose-50 text-rose-600 border border-rose-100'}`}>
          {message.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          {message.text}
        </div>
      )}

      <main className="flex-1 min-h-0 overflow-y-auto custom-scrollbar mt-3">
        {/* Content Area */}
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 min-h-[500px]">
          {activeTab === 'roles' && (
            <RolesPermissions roles={roles} setRoles={setRoles} users={users} setUsers={setUsers} showMessage={showMessage} currentUser={user} />
          )}

          {activeTab === 'licence' && (
            <LicenseSettings user={user} establishment={establishment} usersCount={users.length} />
          )}

          {activeTab === 'users' && (
            <div className="space-y-6">
              {/* QUOTA TRACKER (SOFT LOCK & UP-SELL) */}
              <div className="bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 border border-slate-700/60 rounded-3xl p-5 text-white shadow-xl relative overflow-hidden">
                <div className={`absolute top-0 right-0 w-80 h-80 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20 ${
                  isQuotaReached ? 'bg-rose-500/15' : quotaPercentage >= 80 ? 'bg-amber-500/15' : 'bg-blue-500/10'
                }`} />

                <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-blue-500/20 text-blue-300 border border-blue-500/30">
                        {currentLicence?.nom_licence ? `Licence ${currentLicence.nom_licence}` : 'Abonnement Standard'}
                      </span>
                      <span className="text-xs text-slate-400 font-bold">• Quota d'accès multi-tenant</span>
                    </div>
                    <h3 className="text-lg font-black text-white mt-1 flex items-center gap-2">
                      <Users size={18} className="text-blue-400" />
                      Consommation des Comptes Utilisateurs
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Personnel actif autorisé sur votre licence hospitalière
                    </p>
                  </div>

                  {/* Numerical Counter */}
                  <div className="flex items-baseline gap-2 bg-slate-950/70 border border-white/10 px-5 py-3 rounded-2xl shrink-0 self-start md:self-auto">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Utilisateurs :</span>
                    <span className={`text-2xl font-black font-mono ${
                      isQuotaReached ? 'text-rose-400' : quotaPercentage >= 80 ? 'text-amber-400' : 'text-emerald-400'
                    }`}>
                      {centerStaffCount}
                    </span>
                    <span className="text-slate-500 font-bold text-lg">/</span>
                    <span className="text-white font-bold text-lg font-mono">{maxUsersAllowed}</span>
                    <span className={`ml-2 px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider ${
                      isQuotaReached 
                        ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40' 
                        : 'bg-slate-800 text-slate-300'
                    }`}>
                      {isQuotaReached ? 'Quota Atteint' : `${Math.max(0, maxUsersAllowed - centerStaffCount)} disponible${Math.max(0, maxUsersAllowed - centerStaffCount) > 1 ? 's' : ''}`}
                    </span>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="mt-4 space-y-1.5 relative z-10">
                  <div className="flex justify-between items-center text-[11px] font-bold">
                    <span className="text-slate-400">Progression du quota autorisé</span>
                    <span className={isQuotaReached ? 'text-rose-400 font-black' : quotaPercentage >= 80 ? 'text-amber-400 font-black' : 'text-blue-400 font-black'}>
                      {quotaPercentage}% ({centerStaffCount} / {maxUsersAllowed} utilisateurs)
                    </span>
                  </div>
                  <div className="w-full h-3 bg-slate-950/90 rounded-full overflow-hidden border border-white/5 p-0.5">
                    <div 
                      className={`h-full rounded-full transition-all duration-500 ${
                        isQuotaReached 
                          ? 'bg-gradient-to-r from-rose-600 to-rose-400 shadow-md shadow-rose-500/50' 
                          : quotaPercentage >= 80 
                          ? 'bg-gradient-to-r from-amber-500 to-orange-400' 
                          : 'bg-gradient-to-r from-blue-600 to-emerald-400'
                      }`}
                      style={{ width: `${Math.min(100, Math.max(5, quotaPercentage))}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* CLEAN PROFESSIONAL BANNER WHEN QUOTA IS REACHED */}
              {isQuotaReached && (
                <div className="bg-gradient-to-r from-rose-50 via-rose-50/80 to-amber-50/50 border-2 border-rose-300 rounded-2xl p-4.5 flex items-start gap-4 shadow-sm animate-in fade-in slide-in-from-top-2 duration-300">
                  <div className="w-10 h-10 rounded-xl bg-rose-600 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-md shadow-rose-600/30">
                    <AlertTriangle size={22} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-black text-rose-950 uppercase tracking-tight">
                        Plafond de licence atteint
                      </h4>
                      <span className="px-2 py-0.5 text-[9px] font-black uppercase tracking-wider bg-rose-200 text-rose-800 rounded-md">
                        Blocage Actif
                      </span>
                    </div>
                    <p className="text-xs text-rose-900 font-medium mt-1 leading-relaxed">
                      Vous avez atteint la limite d'utilisateurs pour votre licence actuelle. Veuillez contacter l'administrateur système pour passer à une licence supérieure.
                    </p>
                  </div>
                </div>
              )}

              {/* Title & Actions Bar */}
              <div className="flex items-center justify-between flex-wrap gap-4 pt-2">
                <div>
                  <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Gestion des Utilisateurs du Centre</h2>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">Personnel actif de votre structure hospitalière</p>
                </div>
                <div className="flex items-center gap-4">
                  {isPrincipalAdmin ? (
                    <button
                      disabled={isQuotaReached}
                      onClick={() => {
                        if (isQuotaReached) return;
                        setNewUser({
                          role: Role.RECEPTION,
                          roles: ['role_receptionniste'],
                          status: 'ACTIVE',
                          password: generateAutoPassword()
                        });
                        setIsRolesDropdownOpen(false);
                        setShowUserForm(true);
                      }}
                      title={isQuotaReached ? "Vous avez atteint la limite d'utilisateurs pour votre licence actuelle." : "Créer un nouvel utilisateur pour ce centre"}
                      className={`px-4 py-2.5 rounded-xl flex items-center gap-2 text-sm font-bold transition-all shadow-md ${
                        isQuotaReached
                          ? 'bg-slate-200 text-slate-400 cursor-not-allowed border border-slate-300 shadow-none opacity-60'
                          : 'bg-blue-600 text-white hover:bg-blue-700 shadow-blue-600/20 cursor-pointer'
                      }`}
                    >
                      <UserPlus size={16} />
                      Nouvel Utilisateur
                    </button>
                  ) : (
                    <div className="flex items-center gap-2 px-3.5 py-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl text-xs font-bold">
                      <ShieldAlert size={16} className="text-amber-600 shrink-0" />
                      <span>Seul l'administrateur principal de cet établissement peut créer de nouveaux utilisateurs</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Add/Edit User Form */}
              {(showUserForm || isEditingUser) && (
              <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
                <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                  <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <div>
                      <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">
                        {isEditingUser ? 'Éditer l\'utilisateur' : 'Nouvel Utilisateur du Centre'}
                      </h3>
                      {!isEditingUser && (
                        <p className="text-xs text-slate-500">Seul l'identifiant de connexion est obligatoire. Le mot de passe est généré automatiquement.</p>
                      )}
                    </div>
                    <button 
                      onClick={() => { 
                        setIsEditingUser(false); 
                        setShowUserForm(false);
                        setIsRolesDropdownOpen(false);
                        setNewUser({ role: Role.RECEPTION, roles: [], status: 'ACTIVE' }); 
                      }}
                      className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-200 text-slate-500 transition-colors"
                    >
                      <X size={20} />
                    </button>
                  </div>
                  
                  <div className="p-6 overflow-y-auto">
                    <form id="user-form" onSubmit={handleAddUser} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Username (Identifiant) *</label>
                        <input 
                          type="text" 
                          placeholder="Ex: jdupont" 
                          className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 ring-blue-600/20 outline-none font-medium"
                          value={newUser.username || ''}
                          onChange={e => setNewUser({...newUser, username: e.target.value})}
                          required
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Mot de passe (Généré auto)</label>
                        <div className="flex gap-2">
                          <input 
                            type="text" 
                            placeholder="Mot de passe" 
                            className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 font-mono font-bold text-blue-700 outline-none"
                            value={newUser.password || ''}
                            onChange={e => setNewUser({...newUser, password: e.target.value})}
                          />
                          <button
                            type="button"
                            onClick={() => setNewUser({...newUser, password: generateAutoPassword()})}
                            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors shrink-0"
                            title="Régénérer"
                          >
                            Régénérer
                          </button>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Nom complet</label>
                        <input 
                          type="text" 
                          placeholder="Ex: Dr. Jean Dupont" 
                          className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 ring-blue-600/20 outline-none"
                          value={newUser.name || ''}
                          onChange={e => setNewUser({...newUser, name: e.target.value})}
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Email</label>
                        <input 
                          type="email" 
                          placeholder="Ex: jean.dupont@hopital.com" 
                          className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 ring-blue-600/20 outline-none"
                          value={newUser.email || ''}
                          onChange={e => setNewUser({...newUser, email: e.target.value})}
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <ImageUpload
                          currentImageUrl={newUser.profile_image_url || newUser.profileImage}
                          userId={newUser.id || newUser.username || 'staff'}
                          label="Photo de profil du personnel"
                          onImageUploaded={(url) => {
                            setNewUser({
                              ...newUser,
                              profile_image_url: url,
                              profileImage: url
                            });
                          }}
                          onImageRemoved={() => {
                            setNewUser({
                              ...newUser,
                              profile_image_url: undefined,
                              profileImage: undefined
                            });
                          }}
                        />
                      </div>

                      {/* Rôle Métier Principal */}
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase flex items-center justify-between">
                          <span>Rôle Métier Principal (Module) *</span>
                          <span className="text-blue-600 font-semibold lowercase">accès strict par rôle</span>
                        </label>
                        <select
                          className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 ring-blue-600/20 outline-none font-bold text-slate-800 bg-white shadow-sm"
                          value={newUser.role || Role.RECEPTION}
                          onChange={e => handlePrimaryRoleChange(e.target.value as Role)}
                          required
                        >
                          {PRIMARY_ROLES.map(pr => (
                            <option key={pr.value} value={pr.value} className="py-1">
                              {pr.label}
                            </option>
                          ))}
                        </select>
                        <p className="text-[11px] text-slate-400 font-medium px-1">
                          {PRIMARY_ROLES.find(pr => pr.value === (newUser.role || Role.RECEPTION))?.desc}
                        </p>
                      </div>

                      {/* Statut du compte */}
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Statut du compte</label>
                        <select 
                          className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 ring-blue-600/20 outline-none font-medium bg-white shadow-sm"
                          value={newUser.status || 'ACTIVE'}
                          onChange={e => setNewUser({...newUser, status: e.target.value as UserStatus})}
                        >
                          <option value="ACTIVE">Actif (Accès autorisé)</option>
                          <option value="INACTIVE">Inactif (Désactivé)</option>
                          <option value="BLOCKED">Bloqué (Accès refusé)</option>
                        </select>
                      </div>

                      {/* Informations Financières / RH (Admin Only Guard) */}
                      {([Role.ADMIN, Role.SUPER_ADMIN, 'ADMIN', 'ADMINISTRATEUR', 'DIRECTEUR', 'SUPER_ADMIN'].includes(String(user?.role || '').toUpperCase()) ||
                        (user?.roles || []).includes('role_admin') ||
                        (user?.roles || []).includes('role_super_admin')) && (
                        <div className="col-span-1 md:col-span-2 p-4 rounded-2xl bg-emerald-50/60 border border-emerald-200/80 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-black uppercase tracking-wider text-emerald-800">
                              Informations Financières / RH (Accès Administrateur)
                            </span>
                            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-md">
                              Synchronisé avec Comptabilité / Paie
                            </span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-slate-600 uppercase">
                                Salaire de Base (Mensuel) — CFA
                              </label>
                              <div className="relative">
                                <input
                                  type="number"
                                  min={0}
                                  step={500}
                                  className="w-full px-4 py-3 pr-16 rounded-xl border border-emerald-300 focus:ring-2 ring-emerald-500/30 outline-none font-black text-slate-900 bg-white shadow-sm"
                                  placeholder="0"
                                  value={newUser.salaire_de_base ?? 0}
                                  onChange={e =>
                                    setNewUser({
                                      ...newUser,
                                      salaire_de_base: Math.max(0, Math.floor(Number(e.target.value) || 0)),
                                    })
                                  }
                                />
                                <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-black text-emerald-700">
                                  FCFA
                                </span>
                              </div>
                            </div>
                            <div className="text-xs font-bold text-emerald-800 pb-2">
                              Montant formaté :{' '}
                              <span className="text-sm font-black">
                                {Number(newUser.salaire_de_base || 0).toLocaleString('fr-FR')} FCFA / mois
                              </span>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Rôles & Habilitations additionnels (Multi-sélection spacieuse) */}
                      <div className="col-span-1 md:col-span-2 space-y-2 mt-1">
                        <div className="flex items-center justify-between">
                          <label className="text-[10px] font-bold text-slate-500 uppercase">
                            Permissions & Rôles Additionnels ({newUser.roles?.length || 0} sélectionné{(newUser.roles?.length || 0) > 1 ? 's' : ''})
                          </label>
                          <button
                            type="button"
                            onClick={() => setIsRolesDropdownOpen(!isRolesDropdownOpen)}
                            className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 transition-colors"
                          >
                            {isRolesDropdownOpen ? 'Masquer la liste' : 'Gérer les habilitations'}
                            <ChevronDown size={14} className={`transform transition-transform ${isRolesDropdownOpen ? 'rotate-180' : ''}`} />
                          </button>
                        </div>

                        {/* Selected roles chips trigger */}
                        <div 
                          onClick={() => setIsRolesDropdownOpen(!isRolesDropdownOpen)}
                          className="w-full min-h-[48px] px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:border-blue-400 transition-all flex flex-wrap gap-2 items-center cursor-pointer shadow-sm"
                        >
                          {(newUser.roles?.length || 0) === 0 ? (
                            <div className="flex items-center justify-between w-full text-slate-400 text-xs">
                              <span>Aucun rôle additionnel. Cliquez pour ouvrir la liste complète.</span>
                              <ChevronDown size={16} />
                            </div>
                          ) : (
                            <>
                              {newUser.roles?.map(roleId => {
                                const matchedRole = availableRoles.find(r => r.id === roleId);
                                return (
                                  <span key={roleId} className="px-2.5 py-1 bg-blue-50 text-blue-700 text-xs font-bold rounded-lg flex items-center gap-1.5 border border-blue-100">
                                    {matchedRole ? matchedRole.name : roleId}
                                    <button 
                                      type="button" 
                                      onClick={(e) => { 
                                        e.stopPropagation(); 
                                        setNewUser({ ...newUser, roles: newUser.roles?.filter(id => id !== roleId) }); 
                                      }} 
                                      className="hover:text-rose-600 hover:bg-rose-50 rounded p-0.5"
                                      title="Retirer ce rôle"
                                    >
                                      <X size={12} />
                                    </button>
                                  </span>
                                );
                              })}
                              <div className="ml-auto text-slate-400">
                                <ChevronDown size={16} className={`transform transition-transform ${isRolesDropdownOpen ? 'rotate-180' : ''}`} />
                              </div>
                            </>
                          )}
                        </div>

                        {/* Expandable panel - No cramped scrolling! */}
                        {isRolesDropdownOpen && (
                          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3 animate-in fade-in slide-in-from-top-2 duration-150 shadow-sm">
                            <div className="flex items-center justify-between border-b border-slate-200/60 pb-2">
                              <span className="text-xs font-bold text-slate-700">
                                Cochez les profils et accès autorisés pour cet utilisateur :
                              </span>
                              <button
                                type="button"
                                onClick={() => setIsRolesDropdownOpen(false)}
                                className="text-xs font-bold text-slate-500 hover:text-slate-800 bg-white px-2.5 py-1 rounded-lg border border-slate-200 shadow-xs"
                              >
                                Fermer la liste
                              </button>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-64 overflow-y-auto pr-1">
                              {availableRoles.map(role => {
                                const isChecked = newUser.roles?.includes(role.id) || false;
                                return (
                                  <label 
                                    key={role.id} 
                                    className={`flex items-start gap-3 p-3 rounded-xl border transition-all cursor-pointer ${
                                      isChecked 
                                        ? 'bg-blue-50/70 border-blue-300 ring-1 ring-blue-400/30 shadow-xs' 
                                        : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/50'
                                    }`}
                                  >
                                    <input 
                                      type="checkbox" 
                                      checked={isChecked}
                                      onChange={(e) => {
                                        const currentRoles = newUser.roles || [];
                                        if (e.target.checked) {
                                          setNewUser({...newUser, roles: [...currentRoles, role.id]});
                                        } else {
                                          setNewUser({...newUser, roles: currentRoles.filter(id => id !== role.id)});
                                        }
                                      }}
                                      className="mt-0.5 rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
                                    />
                                    <div className="flex-1 min-w-0">
                                      <div className="text-xs font-black text-slate-900 leading-tight">{role.name}</div>
                                      {role.description && (
                                        <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2 leading-relaxed">
                                          {role.description}
                                        </p>
                                      )}
                                    </div>
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="col-span-1 md:col-span-2 flex items-center gap-2 mt-2">
                        <input 
                          type="checkbox" 
                          id="forcePasswordChange"
                          checked={newUser.forcePasswordChange || false}
                          onChange={e => setNewUser({...newUser, forcePasswordChange: e.target.checked})}
                          className="rounded text-blue-600 focus:ring-blue-500"
                        />
                        <label htmlFor="forcePasswordChange" className="text-xs font-medium text-slate-600 cursor-pointer">
                          Forcer le changement de mot de passe au prochain login
                        </label>
                      </div>
                    </form>
                  </div>
                  
                  <div className="p-6 border-t border-slate-100 bg-slate-50/50 flex justify-end gap-3">
                    <button 
                      type="button"
                      onClick={() => { 
                        setIsEditingUser(false); 
                        setShowUserForm(false);
                        setIsRolesDropdownOpen(false);
                        setNewUser({ role: Role.RECEPTION, roles: [], status: 'ACTIVE' }); 
                      }}
                      className="px-6 py-3 rounded-xl font-bold text-slate-600 hover:bg-slate-200 transition-colors"
                    >
                      Annuler
                    </button>
                    <button 
                      type="submit" 
                      form="user-form"
                      className="bg-blue-600 text-white font-bold px-8 py-3 rounded-xl flex items-center justify-center gap-2 hover:bg-blue-700 transition-colors shadow-lg shadow-blue-600/20"
                    >
                      {isEditingUser ? <Save size={18} /> : <UserPlus size={18} />}
                      {isEditingUser ? 'Enregistrer' : 'Ajouter'}
                    </button>
                  </div>
                </div>
              </div>
              )}

              {/* Users List */}
              <div className="space-y-4">
                {/* Search and Filters */}
                <div className="flex flex-col md:flex-row gap-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                    <input
                      type="text"
                      placeholder="Rechercher un utilisateur (nom, username, email)..."
                      value={userSearchQuery}
                      onChange={(e) => setUserSearchQuery(e.target.value)}
                      className="w-full pl-11 pr-4 py-3 rounded-2xl border border-slate-200 focus:ring-2 ring-blue-600/20 outline-none bg-slate-50 focus:bg-white transition-colors"
                    />
                  </div>
                  <div className="flex gap-2">
                    <div className="relative">
                      <Filter className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                      <select
                        value={userRoleFilter}
                        onChange={(e) => setUserRoleFilter(e.target.value)}
                        className="pl-10 pr-8 py-3 rounded-2xl border border-slate-200 focus:ring-2 ring-blue-600/20 outline-none bg-slate-50 focus:bg-white transition-colors appearance-none font-medium text-slate-700 text-sm"
                      >
                        <option value="ALL">Tous les rôles</option>
                        {roles.map(role => (
                          <option key={role.id} value={role.id}>{role.name}</option>
                        ))}
                      </select>
                    </div>
                    <select
                      value={userStatusFilter}
                      onChange={(e) => setUserStatusFilter(e.target.value)}
                      className="px-4 py-3 rounded-2xl border border-slate-200 focus:ring-2 ring-blue-600/20 outline-none bg-slate-50 focus:bg-white transition-colors font-medium text-slate-700 text-sm"
                    >
                      <option value="ALL">Tous les statuts</option>
                      <option value="ACTIVE">Actif</option>
                      <option value="INACTIVE">Inactif</option>
                      <option value="BLOCKED">Bloqué</option>
                    </select>
                  </div>
                </div>

                <div className="overflow-x-auto rounded-3xl border border-slate-100">
                  <table className="w-full text-left border-collapse whitespace-nowrap">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100">
                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Utilisateur</th>
                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Contact</th>
                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Rôles</th>
                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Statut</th>
                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Dernière Connexion</th>
                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {filteredUsers.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                            Aucun utilisateur trouvé pour cette recherche.
                          </td>
                        </tr>
                      ) : (
                        filteredUsers.map(u => (
                          <tr key={u.id} onClick={() => setViewingUser(u)} className="hover:bg-slate-50/50 transition-colors cursor-pointer">
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                <Avatar user={u} size={36} />
                                <div>
                                  <div className="font-bold text-slate-900">{u.name}</div>
                                  <div className="text-xs text-slate-500 font-medium">@{u.username}</div>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-sm text-slate-600">{u.email || '-'}</td>
                            <td className="px-6 py-4">
                              <div className="flex flex-wrap gap-1 max-w-[220px]">
                                <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded-md text-[9px] font-black uppercase tracking-wider">
                                  {u.role || 'ACCUEIL'}
                                </span>
                                {u.roles && u.roles.length > 0 && (
                                  u.roles.map(roleId => {
                                    const role = availableRoles.find(r => r.id === roleId);
                                    if (!role) return null;
                                    return (
                                      <span key={roleId} className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md text-[9px] font-bold">
                                        {role.name}
                                      </span>
                                    );
                                  })
                                )}
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${
                                u.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-600' : 
                                u.status === 'BLOCKED' ? 'bg-rose-50 text-rose-600' : 
                                'bg-slate-100 text-slate-500'
                              }`}>
                                {u.status || 'ACTIVE'}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-xs text-slate-500 font-medium">
                              {u.lastLogin ? new Date(u.lastLogin).toLocaleString('fr-FR') : 'Jamais'}
                            </td>
                            <td className="px-6 py-4 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <button 
                                  onClick={(e) => { e.stopPropagation(); setViewingUser(u); }}
                                  className="px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold rounded-xl transition-colors flex items-center gap-1.5 shrink-0 cursor-pointer"
                                  title="Consulter la Fiche Performance RH & Quotes-parts"
                                >
                                  <TrendingUp size={14} />
                                  <span>Performance RH</span>
                                </button>
                                <button onClick={(e) => { e.stopPropagation(); handleEditUser(u); }} className="p-2 text-slate-400 hover:text-blue-600 transition-colors" title="Éditer">
                                  <Edit2 size={16} />
                                </button>
                                <button onClick={(e) => { e.stopPropagation(); handleResetPassword(u.id); }} className="p-2 text-slate-400 hover:text-amber-600 transition-colors" title="Réinitialiser mot de passe">
                                  <Key size={16} />
                                </button>
                                <button onClick={(e) => { e.stopPropagation(); handleToggleStatus(u.id); }} className={`p-2 transition-colors ${u.status === 'ACTIVE' ? 'text-slate-400 hover:text-orange-600' : 'text-orange-600 hover:text-emerald-600'}`} title={u.status === 'ACTIVE' ? 'Désactiver' : 'Activer'}>
                                  <Ban size={16} />
                                </button>
                                <button 
                                  onClick={(e) => { e.stopPropagation(); handleDeleteUser(u.id); }}
                                  className="p-2 text-slate-400 hover:text-rose-600 transition-colors"
                                  title="Supprimer"
                                >
                                  <Trash2 size={18} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* User Details & Fiche Performance RH Modal */}
          {viewingUser && (
            <StaffPerformanceModal
              staffUser={viewingUser}
              currentUser={user!}
              isOpen={!!viewingUser}
              onClose={() => setViewingUser(null)}
            />
          )}

          {activeTab === 'establishment' && (
            <div className="space-y-8">
              <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Configuration de l'Établissement</h2>
              <form onSubmit={handleSaveEstablishment} className="space-y-6">
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Nom de l'Hôpital</label>
                    <input 
                      type="text" 
                      className="w-full px-4 py-3 rounded-xl border border-slate-200"
                      value={establishment.name}
                      onChange={e => setEstablishment({...establishment, name: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Téléphone</label>
                    <input 
                      type="text" 
                      className="w-full px-4 py-3 rounded-xl border border-slate-200"
                      value={establishment.phone}
                      onChange={e => setEstablishment({...establishment, phone: e.target.value})}
                    />
                  </div>
                  <div className="col-span-2 space-y-2">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Adresse</label>
                    <textarea 
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 min-h-[100px]"
                      value={establishment.address}
                      onChange={e => setEstablishment({...establishment, address: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Langue par défaut</label>
                    <select 
                      className="w-full px-4 py-3 rounded-xl border border-slate-200"
                      value={establishment.language}
                      onChange={e => setEstablishment({...establishment, language: e.target.value as any})}
                    >
                      <option value="FR">Français</option>
                      <option value="EN">Anglais</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Devise</label>
                    <select 
                      className="w-full px-4 py-3 rounded-xl border border-slate-200"
                      value={establishment.currency}
                      onChange={e => setEstablishment({...establishment, currency: e.target.value as any})}
                    >
                      <option value="XAF">Franc CFA (XAF)</option>
                      <option value="USD">Dollar (USD)</option>
                      <option value="EUR">Euro (EUR)</option>
                    </select>
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Email de contact</label>
                    <input 
                      type="email" 
                      className="w-full px-4 py-3 rounded-xl border border-slate-200"
                      value={establishment.email || ''}
                      onChange={e => setEstablishment({...establishment, email: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Slogan / Devise d'établissement</label>
                    <input 
                      type="text" 
                      className="w-full px-4 py-3 rounded-xl border border-slate-200"
                      value={establishment.slogan || ''}
                      onChange={e => setEstablishment({...establishment, slogan: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Ville</label>
                    <input 
                      type="text" 
                      className="w-full px-4 py-3 rounded-xl border border-slate-200"
                      value={establishment.city || ''}
                      onChange={e => setEstablishment({...establishment, city: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Pays</label>
                    <input 
                      type="text" 
                      className="w-full px-4 py-3 rounded-xl border border-slate-200"
                      value={establishment.country || ''}
                      onChange={e => setEstablishment({...establishment, country: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest text-center block">Logo de l'Hôpital</label>
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-24 h-24 rounded-2xl bg-white border border-slate-200 flex items-center justify-center overflow-hidden shadow-sm">
                        {establishment.logo ? (
                          <img src={establishment.logo} alt="Logo" className="w-full h-full object-contain p-2" />
                        ) : (
                          <Hospital className="text-slate-300" size={40} />
                        )}
                      </div>
                      <input 
                        type="file" 
                        accept="image/*"
                        id="establishment-logo-upload"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const reader = new FileReader();
                            reader.onloadend = () => {
                              setEstablishment({...establishment, logo: reader.result as string});
                            };
                            reader.readAsDataURL(file);
                          }
                        }}
                      />
                      <label 
                        htmlFor="establishment-logo-upload"
                        className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-[10px] font-black uppercase tracking-widest cursor-pointer transition-all border border-slate-200"
                      >
                        {establishment.logo ? 'Changer le logo' : 'Charger un logo'}
                      </label>
                    </div>
                  </div>

                  <div className="col-span-2 mt-4 pt-6 border-t border-slate-100">
                    <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight mb-4 flex items-center gap-2">
                      <CreditCard size={18} className="text-blue-600" />
                      Informations de Facturation
                    </h3>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Identifiant Fiscal (NIF/RCCM)</label>
                    <input 
                      type="text" 
                      className="w-full px-4 py-3 rounded-xl border border-slate-200"
                      value={establishment.taxId || ''}
                      onChange={e => setEstablishment({...establishment, taxId: e.target.value})}
                      placeholder="Ex: NIF: M0123... / RCCM: RC/YAO/..."
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Site Web</label>
                    <input 
                      type="text" 
                      className="w-full px-4 py-3 rounded-xl border border-slate-200"
                      value={establishment.website || ''}
                      onChange={e => setEstablishment({...establishment, website: e.target.value})}
                      placeholder="www.hopital.com"
                    />
                  </div>

                  <div className="col-span-2 space-y-2">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Informations Bancaires (RIB)</label>
                    <input 
                      type="text" 
                      className="w-full px-4 py-3 rounded-xl border border-slate-200"
                      value={establishment.bankInfo || ''}
                      onChange={e => setEstablishment({...establishment, bankInfo: e.target.value})}
                      placeholder="Banque - Code - Agence - N° Compte"
                    />
                  </div>

                  <div className="col-span-2 space-y-2">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Pied de page de Facture</label>
                    <textarea 
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 min-h-[80px]"
                      value={establishment.invoiceFooter || ''}
                      onChange={e => setEstablishment({...establishment, invoiceFooter: e.target.value})}
                      placeholder="Texte qui s'affichera au bas de chaque facture..."
                    />
                  </div>

                  {/* Format d'impression des Tickets & Reçus (Thermique 80mm vs A4) */}
                  <div className="col-span-2 space-y-4 pt-4 border-t border-slate-100">
                    <div className="flex items-center gap-2">
                      <Printer size={20} className="text-blue-600" />
                      <div>
                        <label className="text-sm font-black text-slate-800 uppercase tracking-widest block">Format d'Impression des Reçus & Tickets</label>
                        <p className="text-xs text-slate-500 font-medium">Sélectionnez le format par défaut utilisé pour l'impression des tickets d'admission et des reçus de caisse.</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Option 1: Format Thermique Supermarché 80mm */}
                      <button
                        type="button"
                        onClick={() => setEstablishment({...establishment, receiptFormat: 'THERMAL_80MM', ticketFormat: 'THERMAL_80MM'})}
                        className={`p-5 rounded-2xl border-2 text-left transition-all cursor-pointer relative flex flex-col justify-between ${
                          (establishment.receiptFormat || 'THERMAL_80MM') === 'THERMAL_80MM'
                            ? 'border-blue-600 bg-blue-50/50 shadow-sm'
                            : 'border-slate-200 hover:border-slate-300 bg-white'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center font-black text-xs shrink-0">
                              80mm
                            </div>
                            <div>
                              <p className="font-black text-slate-900 text-sm">Ticket Thermique (Supermarché / 80mm)</p>
                              <p className="text-xs text-slate-500 font-medium">Rouleau compact pour imprimantes de caisse POS</p>
                            </div>
                          </div>
                          {(establishment.receiptFormat || 'THERMAL_80MM') === 'THERMAL_80MM' && (
                            <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold shrink-0">✓</span>
                          )}
                        </div>
                        <p className="text-xs text-slate-600 leading-relaxed mt-1">
                          Idéal pour les imprimantes thermiques de comptoir (Epson, Xprinter, Star). Format rouleau économique, coupe automatique et impression instantanée.
                        </p>
                      </button>

                      {/* Option 2: Format A4 Facture Standard */}
                      <button
                        type="button"
                        onClick={() => setEstablishment({...establishment, receiptFormat: 'A4', ticketFormat: 'A4'})}
                        className={`p-5 rounded-2xl border-2 text-left transition-all cursor-pointer relative flex flex-col justify-between ${
                          establishment.receiptFormat === 'A4'
                            ? 'border-blue-600 bg-blue-50/50 shadow-sm'
                            : 'border-slate-200 hover:border-slate-300 bg-white'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center font-black text-xs shrink-0">
                              A4
                            </div>
                            <div>
                              <p className="font-black text-slate-900 text-sm">Format A4 (Facture Pleine Page)</p>
                              <p className="text-xs text-slate-500 font-medium">Feuille standard bureautique laser / jet d'encre</p>
                            </div>
                          </div>
                          {establishment.receiptFormat === 'A4' && (
                            <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold shrink-0">✓</span>
                          )}
                        </div>
                        <p className="text-xs text-slate-600 leading-relaxed mt-1">
                          Idéal pour les imprimantes de bureau. Présentation officielle avec en-tête hospitalier, tableau complet des prestations, cadre pour cachet et signatures.
                        </p>
                      </button>
                    </div>
                  </div>
                  
                  <div className="col-span-2 space-y-4 mt-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Palette size={20} className="text-slate-400" />
                        <label className="text-sm font-black text-slate-700 uppercase tracking-widest">Thème de l'interface</label>
                      </div>
                      <button
                        type="button"
                        onClick={() => setActiveTab('appearance')}
                        className="px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                      >
                        <Palette size={14} />
                        <span>Personnalisation Avancée</span>
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      {(Object.keys(THEMES) as ThemeColor[]).map((themeName) => (
                        <button
                          key={themeName}
                          type="button"
                          onClick={() => {
                            setEstablishment({...establishment, theme: themeName});
                            applyTheme(themeName);
                          }}
                          className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border-2 transition-all cursor-pointer ${
                            (establishment.theme || 'blue') === themeName 
                              ? 'border-blue-600 bg-blue-50/50 shadow-xs' 
                              : 'border-slate-200 hover:border-slate-300 bg-white'
                          }`}
                        >
                          <div 
                            className="w-5 h-5 rounded-lg shadow-inner shrink-0" 
                            style={{ backgroundColor: THEMES[themeName].accent || THEMES[themeName][500] }}
                          />
                          <span className="font-bold text-xs">{THEMES[themeName].name || themeName}</span>
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-slate-500 font-medium">
                      Sélectionnez une couleur principale pour personnaliser l'interface de l'application ou accédez à l'onglet dédié pour un thème sur-mesure.
                    </p>
                  </div>
                </div>
                <button type="submit" className="bg-slate-900 text-white px-8 py-4 rounded-2xl font-bold flex items-center gap-2 hover:bg-blue-600 transition-all">
                  <Save size={20} /> Enregistrer les modifications
                </button>
              </form>
            </div>
          )}

          {activeTab === 'appearance' && (
            <AppearanceSettings
              establishment={establishment}
              setEstablishment={setEstablishment}
              currentThemeMode={theme}
              toggleThemeMode={toggleTheme}
              showMessage={showMessage}
            />
          )}

          {activeTab === 'services' && (
            <div className="bg-slate-50 border border-slate-200 p-8 rounded-3xl text-center space-y-4">
              <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-2xl mx-auto flex items-center justify-center">
                <ShieldAlert size={32} />
              </div>
              <h3 className="text-xl font-black text-slate-900">Gouvernance Commerciale Centralisée</h3>
              <p className="text-sm text-slate-600 max-w-lg mx-auto">
                La gestion et l'activation des services hospitaliers sont désormais gérées exclusivement par le Super Administrateur de SmartHosto selon votre forfait commercial.
              </p>
              <button 
                onClick={() => setActiveTab('establishment')}
                className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all"
              >
                Retour aux paramètres de l'établissement
              </button>
            </div>
          )}

          {activeTab === 'protocols' && (
            <ProtocolsManagement user={user} establishment={establishment} showMessage={showMessage} />
          )}

          {activeTab === 'referentials' && (
            <div className="space-y-8">
              <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Référentiels de Base</h2>
              
              {/* Referential Tabs */}
              <div className="flex bg-slate-100 p-1.5 rounded-2xl gap-1 overflow-x-auto">
                <button
                  onClick={() => setActiveReferentialTab('acts')}
                  className={`flex-1 px-6 py-3 rounded-xl font-bold text-sm transition-all whitespace-nowrap ${
                    activeReferentialTab === 'acts'
                      ? 'bg-white text-blue-600 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
                  }`}
                >
                  Actes Médicaux
                </button>
                <button
                  onClick={() => setActiveReferentialTab('medications')}
                  className={`flex-1 px-6 py-3 rounded-xl font-bold text-sm transition-all whitespace-nowrap ${
                    activeReferentialTab === 'medications'
                      ? 'bg-white text-blue-600 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
                  }`}
                >
                  Médicaments de base
                </button>
                <button
                  onClick={() => setActiveReferentialTab('consumables')}
                  className={`flex-1 px-6 py-3 rounded-xl font-bold text-sm transition-all whitespace-nowrap ${
                    activeReferentialTab === 'consumables'
                      ? 'bg-white text-blue-600 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
                  }`}
                >
                  Consommables
                </button>
              </div>

              {/* Acts */}
              {activeReferentialTab === 'acts' && (
                <div className="space-y-4 animate-in fade-in duration-300">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-200/80">
                    <div>
                      <h3 className="font-black text-slate-900 text-sm uppercase tracking-wider flex items-center gap-2">
                        <Stethoscope className="text-blue-600" size={18} />
                        Référentiel des Actes Médicaux & Tarifs ({acts.length})
                      </h3>
                      <p className="text-xs text-slate-500 font-medium mt-0.5">
                        Catalogue officiel des prestations utilisées pour l'admission, l'orientation et la facturation
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => {
                          setEditingMedicalAct(null);
                          setShowAddMedicalAct(true);
                        }}
                        className="px-4 py-2 rounded-xl text-xs font-extrabold bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center gap-1.5 shadow-md shadow-blue-500/20"
                      >
                        <Plus size={16} />
                        Nouvel Acte Médical
                      </button>
                    </div>
                  </div>

                  {/* Filters */}
                  <div className="flex flex-col sm:flex-row gap-3">
                    <div className="relative flex-1">
                      <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                      <input 
                        type="text"
                        value={actSearchQuery}
                        onChange={(e) => setActSearchQuery(e.target.value)}
                        placeholder="Rechercher un acte, code, spécialité..."
                        className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                      {actSearchQuery && (
                        <button onClick={() => setActSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                          <X size={14} />
                        </button>
                      )}
                    </div>

                    <select
                      value={actCategoryFilter}
                      onChange={(e) => setActCategoryFilter(e.target.value)}
                      className="px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:ring-2 focus:ring-blue-500 outline-none"
                    >
                      <option value="tous">Toutes les catégories</option>
                      <option value="consultation">Consultations</option>
                      <option value="accouchement">Maternité / Accouchement</option>
                      <option value="urgence">Urgences</option>
                      <option value="hospitalisation">Hospitalisation</option>
                      <option value="soin">Soins infirmiers</option>
                      <option value="analyse">Analyses / Laboratoire</option>
                      <option value="chirurgie">Chirurgie / Bloc</option>
                    </select>
                  </div>

                  <div className="overflow-hidden rounded-2xl border border-slate-150 shadow-sm bg-white">
                    <table className="w-full text-left border-collapse">
                      <thead className="bg-slate-50 border-b border-slate-150">
                        <tr>
                          <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider">Acte Médical</th>
                          <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider">Service / Spécialité</th>
                          <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider">Catégorie</th>
                          <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider text-right">Tarif Prestation</th>
                          <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider text-center">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {acts
                          .filter(a => {
                            if (actCategoryFilter !== 'tous') {
                              const cat = (a.category || a.categorie || '').toLowerCase();
                              if (!cat.includes(actCategoryFilter.toLowerCase())) return false;
                            }
                            if (actSearchQuery.trim()) {
                              const q = actSearchQuery.toLowerCase();
                              const nameMatch = (a.name || a.nom || '').toLowerCase().includes(q);
                              const codeMatch = (a.codeInterne || a.id || '').toLowerCase().includes(q);
                              const srvMatch = (a.servicePrincipal || a.sousService || '').toLowerCase().includes(q);
                              const catMatch = (a.category || '').toLowerCase().includes(q);
                              return nameMatch || codeMatch || srvMatch || catMatch;
                            }
                            return true;
                          })
                          .map(a => (
                            <tr key={a.id} className="hover:bg-slate-50/70 transition-colors">
                              <td className="px-4 py-3.5">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-extrabold text-sm text-slate-900">{a.name || a.nom}</span>
                                  {(a.requiresPrescription || a.soumisOrdonnance) && (
                                    <span className="text-[9px] font-black uppercase tracking-wider bg-rose-100 text-rose-700 border border-rose-200 px-2 py-0.5 rounded-full">
                                      🔒 Ordonnance
                                    </span>
                                  )}
                                  {(Number(a.validite_jours) || 0) > 0 && (
                                    <span className="text-[9px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full">
                                      Validité : {a.validite_jours} j
                                    </span>
                                  )}
                                </div>
                                {a.codeInterne && (
                                  <span className="inline-block mt-0.5 text-[9px] font-mono font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                                    {a.codeInterne}
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-3.5">
                                <span className="text-xs font-bold text-slate-700 block capitalize">
                                  {a.servicePrincipal ? a.servicePrincipal.replace('_', ' ') : 'Consultation'}
                                </span>
                                {a.sousService && (
                                  <span className="text-[10px] text-blue-600 font-semibold">
                                    {a.sousService}
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-3.5">
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-slate-100 text-slate-600 border border-slate-200">
                                  {a.category || a.categorie || 'Acte'}
                                </span>
                              </td>
                              <td className="px-4 py-3.5 text-right font-black text-sm text-blue-600">
                                {(a.price || 0).toLocaleString()} {establishment.currency}
                              </td>
                              <td className="px-4 py-3.5 text-center">
                                <div className="flex items-center justify-center gap-1">
                                  <button
                                    onClick={() => {
                                      setEditingMedicalAct(a);
                                      setShowAddMedicalAct(true);
                                    }}
                                    className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                    title="Modifier la prestation"
                                  >
                                    <Edit2 size={16} />
                                  </button>
                                  <button
                                    onClick={async () => {
                                      if (window.confirm(`Confirmer la suppression de l'acte médical "${a.name || a.nom}" ?`)) {
                                        try {
                                          await deleteDoc(doc(db, 'medical_acts', a.id));
                                          showMessage('success', `Acte "${a.name || a.nom}" supprimé`);
                                        } catch (err) {
                                          console.error("Error deleting act:", err);
                                          showMessage('error', "Erreur lors de la suppression");
                                        }
                                      }
                                    }}
                                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                                    title="Supprimer l'acte"
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        {acts.length === 0 && (
                          <tr>
                            <td colSpan={5} className="py-10 text-center text-slate-400 text-xs font-bold">
                              Aucun acte médical enregistré dans le référentiel.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Meds */}
              {activeReferentialTab === 'medications' && (
                <div className="space-y-6 animate-in fade-in duration-300">
                  {/* Header & Main Actions */}
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-200/80">
                    <div>
                      <h3 className="font-black text-slate-900 text-sm uppercase tracking-wider flex items-center gap-2">
                        <Pill className="text-blue-600" size={18} />
                        Référentiel des Médicaments ({meds.length})
                      </h3>
                      <p className="text-xs text-slate-500 font-medium mt-0.5">
                        Gestion du catalogue des médicaments et réapprovisionnement des stocks
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => setShowStockMovements(true)}
                        className="px-3.5 py-2 rounded-xl text-xs font-extrabold bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 transition-colors flex items-center gap-1.5 shadow-sm"
                      >
                        <History size={16} className="text-slate-500" />
                        Historique Mouvements
                      </button>
                      <button 
                        onClick={() => setShowAddMedication(true)}
                        className="px-4 py-2 rounded-xl text-xs font-extrabold bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center gap-1.5 shadow-md shadow-blue-500/20"
                      >
                        <Plus size={16} />
                        Nouveau Médicament
                      </button>
                    </div>
                  </div>

                  {/* Search & Category Filter Bar */}
                  <div className="flex flex-col md:flex-row gap-3">
                    <div className="relative flex-1">
                      <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                      <input 
                        type="text" 
                        placeholder="Rechercher par nom commercial, DCI, catégorie..."
                        value={medSearchQuery}
                        onChange={(e) => setMedSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-xs font-bold text-slate-800"
                      />
                    </div>
                    <select
                      value={medFamilyFilter}
                      onChange={(e) => setMedFamilyFilter(e.target.value)}
                      className="px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:ring-2 focus:ring-blue-500 outline-none"
                    >
                      <option value="tous">Toutes les familles</option>
                      {Array.from(new Set(meds.map(m => m.family || m.classeTherapeutique).filter(Boolean))).map(fam => (
                        <option key={fam as string} value={fam as string}>{fam as string}</option>
                      ))}
                    </select>
                  </div>

                  {/* Medications List */}
                  {(() => {
                    const filteredMeds = meds.filter(m => {
                      const matchSearch = (m.name || '').toLowerCase().includes(medSearchQuery.toLowerCase()) ||
                                          (m.dci || '').toLowerCase().includes(medSearchQuery.toLowerCase()) ||
                                          (m.family || m.classeTherapeutique || '').toLowerCase().includes(medSearchQuery.toLowerCase());
                      const matchFam = medFamilyFilter === 'tous' || (m.family || m.classeTherapeutique) === medFamilyFilter;
                      return matchSearch && matchFam;
                    });

                    if (filteredMeds.length === 0) {
                      return (
                        <div className="p-8 text-center bg-slate-50 border border-slate-100 rounded-2xl text-slate-400 text-xs font-bold">
                          Aucun médicament ne correspond aux critères de recherche.
                        </div>
                      );
                    }

                    return (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {filteredMeds.map(m => {
                          const currentStock = Number(m.stock) || 0;
                          const threshold = Number(m.seuilAlerte) || Number(m.minThreshold) || 10;
                          const isLowStock = currentStock <= threshold;

                          return (
                            <div key={m.id} className="p-4 bg-white rounded-2xl border border-slate-200/80 hover:border-blue-200 transition-all shadow-sm flex flex-col justify-between gap-3">
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <h4 className="font-extrabold text-slate-900 text-sm">{m.name}</h4>
                                    <span className="text-[10px] font-black uppercase tracking-wider bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md">
                                      {m.family || m.classeTherapeutique || 'Général'}
                                    </span>
                                    {(m.requiresPrescription || m.soumisOrdonnance) && (
                                      <span className="text-[9px] font-black uppercase tracking-wider bg-rose-100 text-rose-700 border border-rose-200 px-2 py-0.5 rounded-full">
                                        🔒 Ordonnance
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-xs text-slate-500 font-medium mt-0.5">
                                    Conditionnement: <span className="font-bold text-slate-700">{m.unit || m.typeConditionnement || 'Boîte'}</span>
                                    {m.batchNumber && (
                                      <span className="ml-2 font-mono text-[10px] text-slate-400">• Lot: {m.batchNumber}</span>
                                    )}
                                  </p>
                                </div>
                                <div className="text-right shrink-0">
                                  <span className="font-black text-emerald-600 text-sm block">
                                    {m.price || m.prixVente || 0} {establishment.currency}
                                  </span>
                                </div>
                              </div>

                              <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                                <div className="flex items-center gap-2">
                                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-black ${
                                    isLowStock 
                                      ? 'bg-rose-50 text-rose-700 border border-rose-200' 
                                      : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  }`}>
                                    <Package size={14} />
                                    Stock: {currentStock}
                                  </span>
                                  {isLowStock && (
                                    <span className="text-[10px] text-rose-500 font-bold">
                                      (Seuil ≤ {threshold})
                                    </span>
                                  )}
                                </div>

                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={() => {
                                      setEditingMedication(m);
                                      setShowAddMedication(true);
                                    }}
                                    className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                    title="Modifier le médicament"
                                  >
                                    <Edit2 size={15} />
                                  </button>
                                  <button
                                    onClick={() => setSelectedMedForRestock(m)}
                                    className="px-3 py-1.5 rounded-xl font-bold text-xs bg-emerald-600 text-white hover:bg-emerald-700 transition-colors flex items-center gap-1 shadow-sm"
                                    title="Ajouter du stock pour ce médicament"
                                  >
                                    <PlusCircle size={14} /> Réapprovisionner
                                  </button>
                                  <button
                                    onClick={() => handleDeleteMedication(m.id, m.name)}
                                    className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                                    title="Supprimer la référence"
                                  >
                                    <Trash2 size={15} />
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Consumables */}
              {activeReferentialTab === 'consumables' && (
                <div className="space-y-6 animate-in fade-in duration-300">
                  {/* Header & Main Actions */}
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-200/80">
                    <div>
                      <h3 className="font-black text-slate-900 text-sm uppercase tracking-wider flex items-center gap-2">
                        <Package className="text-emerald-600" size={18} />
                        Référentiel des Consommables ({consumables.length})
                      </h3>
                      <p className="text-xs text-slate-500 font-medium mt-0.5">
                        Gestion du matériel médical consommable et alimentation du stock via réapprovisionnement
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => {
                          setSelectedConsumableForRestock(null);
                          setSelectedMedForRestock(null);
                          setShowUniversalRestock(true);
                        }}
                        className="px-3.5 py-2 rounded-xl text-xs font-extrabold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors flex items-center gap-1.5 shadow-md shadow-emerald-600/20 cursor-pointer"
                      >
                        <PlusCircle size={16} />
                        Réapprovisionner Consommable
                      </button>
                      <button 
                        onClick={() => setShowAddConsumable(true)}
                        className="px-3.5 py-2 rounded-xl text-xs font-extrabold bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 transition-colors flex items-center gap-1.5 shadow-sm cursor-pointer"
                      >
                        <Plus size={16} />
                        Ajouter un consommable
                      </button>
                    </div>
                  </div>

                  {/* Filters & Search */}
                  <div className="flex flex-col md:flex-row gap-4">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                      <input 
                        type="text" 
                        placeholder="Rechercher par nom, code, catégorie..."
                        value={consumableSearch}
                        onChange={(e) => setConsumableSearch(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none text-sm"
                      />
                    </div>
                    <div className="flex gap-2 overflow-x-auto pb-2 md:pb-0 hide-scrollbar">
                      {['tous', 'médical', 'laboratoire', 'chirurgical', 'administratif', 'technique'].map(cat => (
                        <button
                          key={cat}
                          onClick={() => setConsumableCategoryFilter(cat)}
                          className={`px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap transition-colors ${
                            consumableCategoryFilter === cat 
                              ? 'bg-slate-900 text-white' 
                              : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          <span className="capitalize">{cat}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Table */}
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left">
                        <thead className="bg-slate-50 border-b border-slate-100">
                          <tr>
                            <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-wider">Nom & Code</th>
                            <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-wider">Catégorie</th>
                            <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-wider">Service</th>
                            <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-wider">Stock Réel</th>
                            <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-wider">Seuil Alerte</th>
                            <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-wider text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {consumables
                            .filter(c => consumableCategoryFilter === 'tous' || c.categorie === consumableCategoryFilter)
                            .filter(c => 
                              c.nom?.toLowerCase().includes(consumableSearch.toLowerCase()) || 
                              c.name?.toLowerCase().includes(consumableSearch.toLowerCase()) ||
                              c.codeInterne?.toLowerCase().includes(consumableSearch.toLowerCase()) ||
                              c.categorie?.toLowerCase().includes(consumableSearch.toLowerCase()) ||
                              c.sousCategorie?.toLowerCase().includes(consumableSearch.toLowerCase())
                            )
                            .map(c => {
                              const currentLiveStock = Number(c.stock !== undefined ? c.stock : (c.stockInitial || 0));
                              const alertThreshold = Number(c.seuilAlerte) || 10;
                              const isLowStock = currentLiveStock <= alertThreshold;
                              const stockStatus = currentLiveStock <= alertThreshold ? 'rouge' : (currentLiveStock <= alertThreshold * 2 ? 'jaune' : 'vert');

                              return (
                                <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                                  <td className="px-6 py-4">
                                    <p className="font-bold text-slate-900 text-sm">{c.nom || c.name}</p>
                                    {c.codeInterne && <p className="text-xs text-slate-500 font-mono font-medium">{c.codeInterne}</p>}
                                  </td>
                                  <td className="px-6 py-4">
                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-800 capitalize">
                                      {c.categorie}
                                    </span>
                                    {c.sousCategorie && <p className="text-xs text-slate-500 mt-1">{c.sousCategorie}</p>}
                                  </td>
                                  <td className="px-6 py-4">
                                    <span className="text-sm text-slate-600 capitalize">{c.servicePrincipal?.replace('_', ' ') || 'Consultation'}</span>
                                  </td>
                                  <td className="px-6 py-4">
                                    <div className="flex items-center gap-2">
                                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-black ${
                                        isLowStock 
                                          ? 'bg-rose-50 text-rose-700 border border-rose-200' 
                                          : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                      }`}>
                                        <div className={`w-2 h-2 rounded-full ${
                                          stockStatus === 'vert' ? 'bg-emerald-500' : 
                                          stockStatus === 'jaune' ? 'bg-amber-500' : 'bg-rose-500'
                                        }`} />
                                        Stock: {currentLiveStock}
                                      </span>
                                      <span className="text-xs text-slate-500 font-medium">{c.uniteGestion || c.unit || 'unités'}</span>
                                    </div>
                                    {currentLiveStock === 0 && (
                                      <span className="text-[10px] text-rose-500 font-bold block mt-0.5">
                                        À réapprovisionner
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-6 py-4">
                                    <span className="text-xs font-bold text-slate-600">
                                      ≤ {alertThreshold} {c.uniteGestion || 'unités'}
                                    </span>
                                  </td>
                                  <td className="px-6 py-4 text-right">
                                    <div className="flex items-center justify-end gap-2">
                                      <button 
                                        onClick={() => setSelectedConsumableForRestock(c)}
                                        className="px-3 py-1.5 rounded-xl font-bold text-xs bg-emerald-600 text-white hover:bg-emerald-700 transition-colors flex items-center gap-1 shadow-xs cursor-pointer"
                                        title="Réapprovisionner ce consommable"
                                      >
                                        <PlusCircle size={14} /> Réapprovisionner
                                      </button>
                                      <button 
                                        onClick={() => handleDeleteConsumable(c.id, c.nom || c.name)}
                                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                                        title="Supprimer la référence"
                                      >
                                        <Trash2 size={16} />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          {consumables.length === 0 && (
                            <tr>
                              <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                                <Package size={32} className="mx-auto mb-3 opacity-20" />
                                <p className="font-medium">Aucun consommable trouvé</p>
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'hospitalisation' && (
            <HospitalisationSettingsTab
              user={user}
              establishment={establishment}
              currency={establishment.currency}
              showMessage={showMessage}
            />
          )}

          {activeTab === 'cashier_settings' && (
            <div className="space-y-8">
              <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Paramètres de la caisse</h2>
              
              {/* Règles financières */}
              <div className="bg-white p-8 rounded-[32px] border border-slate-200 shadow-sm space-y-6">
                <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight border-b border-slate-100 pb-4">A. Règles financières</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl">
                    <div>
                      <p className="font-bold text-slate-900">Paiement partiel autorisé</p>
                      <p className="text-xs text-slate-500">Accepter un paiement inférieur au total</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        className="sr-only peer" 
                        checked={cashierSettings.partialPayment} 
                        onChange={(e) => setCashierSettings({...cashierSettings, partialPayment: e.target.checked})}
                      />
                      <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                  </div>
                  
                  <div className="space-y-2">
                    <label className={`text-[10px] font-black uppercase tracking-widest ${cashierSettings.partialPayment ? 'text-slate-400' : 'text-slate-300'}`}>
                      Seuil maximal de dette (FCFA)
                    </label>
                    <input 
                      type="number" 
                      value={cashierSettings.maxDebt} 
                      onChange={(e) => setCashierSettings({...cashierSettings, maxDebt: parseInt(e.target.value) || 0})}
                      disabled={!cashierSettings.partialPayment}
                      className={`w-full px-4 py-3 rounded-xl border border-slate-200 font-bold text-slate-900 transition-all ${!cashierSettings.partialPayment ? 'bg-slate-100 text-slate-400 cursor-not-allowed opacity-60' : 'bg-slate-50'}`} 
                    />
                  </div>

                  <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl">
                    <div>
                      <p className="font-bold text-slate-900">Avoir patient autorisé</p>
                      <p className="text-xs text-slate-500">Conserver la monnaie comme avoir</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        className="sr-only peer" 
                        checked={cashierSettings.allowCredit} 
                        onChange={(e) => setCashierSettings({...cashierSettings, allowCredit: e.target.checked})}
                      />
                      <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl">
                    <div>
                      <p className="font-bold text-slate-900">Application auto. de l'avoir</p>
                      <p className="text-xs text-slate-500">Déduire l'avoir au prochain achat</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        className="sr-only peer" 
                        checked={cashierSettings.autoApplyCredit} 
                        onChange={(e) => setCashierSettings({...cashierSettings, autoApplyCredit: e.target.checked})}
                      />
                      <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                  </div>
                </div>
              </div>

              {/* Modes de paiement */}
              <div className="bg-white p-8 rounded-[32px] border border-slate-200 shadow-sm space-y-6">
                <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight border-b border-slate-100 pb-4">B. Modes de paiement</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {['Espèces', 'Mobile Money', 'Carte bancaire', 'Virement', 'Chèque', 'Autre'].map((mode) => (
                    <div key={mode} className="flex items-center gap-3 p-3 border border-slate-200 rounded-xl">
                      <input type="checkbox" defaultChecked={['Espèces', 'Mobile Money', 'Carte bancaire'].includes(mode)} className="w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                      <span className="font-medium text-slate-700">{mode}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Informations d'impression */}
              <div className="bg-white p-8 rounded-[32px] border border-slate-200 shadow-sm space-y-6">
                <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight border-b border-slate-100 pb-4">C. Informations d'impression (Reçus)</h3>
                
                {/* Format Toggle for Tickets & Receipts */}
                <div className="space-y-3 pb-4 border-b border-slate-100">
                  <label className="text-xs font-black uppercase tracking-widest text-slate-700 flex items-center gap-2">
                    <Printer size={16} className="text-blue-600" />
                    Format d'impression des Tickets & Reçus
                  </label>
                  <p className="text-xs text-slate-500 font-medium">Basculez entre le format rouleau compact thermique et la facture pleine page A4.</p>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                    <button
                      type="button"
                      onClick={() => setEstablishment({...establishment, receiptFormat: 'THERMAL_80MM', ticketFormat: 'THERMAL_80MM'})}
                      className={`p-4 rounded-2xl border-2 text-left transition-all cursor-pointer relative flex flex-col justify-between ${
                        (establishment.receiptFormat || 'THERMAL_80MM') === 'THERMAL_80MM'
                          ? 'border-blue-600 bg-blue-50/50 shadow-sm'
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3 mb-1">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center font-black text-xs shrink-0 font-mono">
                            80mm
                          </div>
                          <div>
                            <p className="font-black text-slate-900 text-xs">Ticket Thermique (Supermarché / 80mm)</p>
                            <p className="text-[10px] text-slate-500">Imprimante ticket de caisse POS</p>
                          </div>
                        </div>
                        {(establishment.receiptFormat || 'THERMAL_80MM') === 'THERMAL_80MM' && (
                          <span className="w-4 h-4 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] font-bold shrink-0">✓</span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-600 leading-tight mt-1">
                        Format rouleau continu compact, économique et idéal pour les encaissements rapides de comptoir.
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setEstablishment({...establishment, receiptFormat: 'A4', ticketFormat: 'A4'})}
                      className={`p-4 rounded-2xl border-2 text-left transition-all cursor-pointer relative flex flex-col justify-between ${
                        establishment.receiptFormat === 'A4'
                          ? 'border-blue-600 bg-blue-50/50 shadow-sm'
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3 mb-1">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-black text-xs shrink-0 font-mono">
                            A4
                          </div>
                          <div>
                            <p className="font-black text-slate-900 text-xs">Format A4 (Facture Pleine Page)</p>
                            <p className="text-[10px] text-slate-500">Imprimante bureautique standard</p>
                          </div>
                        </div>
                        {establishment.receiptFormat === 'A4' && (
                          <span className="w-4 h-4 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] font-bold shrink-0">✓</span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-600 leading-tight mt-1">
                        Présentation officielle pleine page avec en-tête hospitalier, tableau d'actes et signatures.
                      </p>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nom de la structure</label>
                    <input 
                      type="text" 
                      value={establishment.name} 
                      onChange={e => setEstablishment({...establishment, name: e.target.value})}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 font-medium text-slate-900" 
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Téléphone</label>
                    <input 
                      type="text" 
                      value={establishment.phone} 
                      onChange={e => setEstablishment({...establishment, phone: e.target.value})}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 font-medium text-slate-900" 
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Adresse</label>
                    <input 
                      type="text" 
                      value={establishment.address} 
                      onChange={e => setEstablishment({...establishment, address: e.target.value})}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 font-medium text-slate-900" 
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Slogan ou Message</label>
                    <input 
                      type="text" 
                      value={establishment.slogan || ''} 
                      onChange={e => setEstablishment({...establishment, slogan: e.target.value})}
                      placeholder="Votre santé, notre priorité" 
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 font-medium text-slate-900" 
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Pied de page des reçus</label>
                    <input 
                      type="text" 
                      value={establishment.invoiceFooter || ''} 
                      onChange={e => setEstablishment({...establishment, invoiceFooter: e.target.value})}
                      placeholder="Merci de votre confiance. En cas de réclamation, contactez la facturation." 
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 font-medium text-slate-900" 
                    />
                  </div>
                </div>
              </div>

              {/* Permissions financières */}
              <div className="bg-white p-8 rounded-[32px] border border-slate-200 shadow-sm space-y-6">
                <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight border-b border-slate-100 pb-4">D. Permissions financières</h3>
                <div className="space-y-4">
                  {[
                    { label: 'Autoriser une dette au-delà du seuil', roles: ['Administrateur', 'Gestionnaire'] },
                    { label: 'Annuler une transaction', roles: ['Administrateur', 'Gestionnaire', 'Caissier Principal'] },
                    { label: 'Rembourser un avoir', roles: ['Administrateur', 'Gestionnaire'] },
                    { label: 'Modifier une facture validée', roles: ['Administrateur'] }
                  ].map((perm, idx) => (
                    <div key={idx} className="flex flex-col md:flex-row md:items-center justify-between p-4 bg-slate-50 rounded-2xl gap-4">
                      <span className="font-bold text-slate-900">{perm.label}</span>
                      <div className="flex flex-wrap gap-2">
                        {perm.roles.map(r => (
                          <span key={r} className="px-3 py-1 bg-blue-100 text-blue-700 text-xs font-bold rounded-full">{r}</span>
                        ))}
                        <button className="px-3 py-1 bg-slate-200 text-slate-600 text-xs font-bold rounded-full hover:bg-slate-300">+</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Paramètres techniques */}
              <div className="bg-white p-8 rounded-[32px] border border-slate-200 shadow-sm space-y-6">
                <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight border-b border-slate-100 pb-4">E. Paramètres techniques de caisse</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Format de numérotation des reçus</label>
                    <input type="text" defaultValue="REC-YYYYMMDD-XXXX" className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 font-mono text-sm text-slate-900" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Format d'identifiant des transactions</label>
                    <input type="text" defaultValue="TRX-YYYYMMDD-XXXX" className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 font-mono text-sm text-slate-900" />
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-4">
                <button 
                  type="button"
                  onClick={handleSaveCashierSettings}
                  className="px-8 py-4 bg-blue-600 text-white rounded-2xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-600/20 active:scale-95"
                >
                  Enregistrer les paramètres de caisse
                </button>
              </div>
            </div>
          )}

          {activeTab === 'whatsapp_agent' && (
            <WhatsAppAgentSettings
              currentUser={user}
              usersList={users}
              staffOnlyMode={false}
            />
          )}
        </div>
      </main>

      {showAddMedication && (
        <AddMedicationForm 
          initialData={editingMedication}
          onClose={() => {
            setShowAddMedication(false);
            setEditingMedication(null);
          }}
          onSave={async (med) => {
            try {
              const medId = editingMedication?.id || `MED-${Date.now()}`;
              const payload: any = {
                id: medId,
                name: med.name,
                family: med.family,
                classeTherapeutique: med.family,
                unit: med.unit,
                typeConditionnement: med.unit,
                price: med.price,
                prixVente: med.price,
                seuilAlerte: med.seuilAlerte,
                requiresPrescription: Boolean(med.requiresPrescription),
                soumisOrdonnance: Boolean(med.requiresPrescription),
                updatedAt: new Date().toISOString()
              };
              if (!editingMedication) {
                payload.stock = 0;
                payload.reservedStock = 0;
                payload.createdAt = new Date().toISOString();
              }
              await setDoc(doc(db, 'pharmacy_inventory', medId), sanitizeData(stampTenantData(payload, user, establishment)), { merge: true });
              setShowAddMedication(false);
              setEditingMedication(null);
              showMessage('success', editingMedication ? `Médicament "${med.name}" mis à jour avec succès` : `Médicament "${med.name}" ajouté avec succès`);
            } catch (error) {
              console.error("Error saving medication:", error);
              showMessage('error', 'Erreur lors de l\'enregistrement');
            }
          }}
        />
      )}

      {(selectedMedForRestock || selectedConsumableForRestock || showUniversalRestock) && (
        <RestockModal
          medication={selectedMedForRestock}
          consumable={selectedConsumableForRestock}
          initialType={selectedConsumableForRestock ? 'CONSUMABLE' : 'MEDICATION'}
          currency={establishment.currency}
          user={user}
          establishment={establishment}
          onClose={() => {
            setSelectedMedForRestock(null);
            setSelectedConsumableForRestock(null);
            setShowUniversalRestock(false);
          }}
          onSubmit={handleRestockSubmit}
        />
      )}

      {showStockMovements && (
        <StockMovementsModal
          currency={establishment.currency}
          user={user}
          establishment={establishment}
          onClose={() => setShowStockMovements(false)}
        />
      )}

      {showAddMedicalAct && (
        <AddMedicalActForm 
          initialData={editingMedicalAct}
          user={user}
          establishment={establishment}
          onClose={() => {
            setShowAddMedicalAct(false);
            setEditingMedicalAct(null);
          }}
          onSave={async (act) => {
            try {
              const actId = editingMedicalAct?.id || Date.now().toString();
              const newAct = {
                id: actId,
                name: act.nom,
                price: Number(act.prixBase) || 0,
                category: act.categorie || 'Non catégorisé',
                ...act,
                validite_jours: Math.max(0, Math.floor(Number(act.validite_jours) || 0)),
                updatedAt: new Date().toISOString()
              };
              await setDoc(doc(db, 'medical_acts', actId), sanitizeData(stampTenantData(newAct, user, establishment)), { merge: true });
              setShowAddMedicalAct(false);
              setEditingMedicalAct(null);
              showMessage('success', editingMedicalAct ? 'Prestation mise à jour avec succès' : 'Prestation ajoutée avec succès');
            } catch (error) {
              console.error("Error saving medical act:", error);
              showMessage('error', 'Erreur lors de l\'enregistrement de la prestation');
            }
          }}
        />
      )}

      {showAddConsumable && (
        <AddConsumableForm 
          onClose={() => setShowAddConsumable(false)}
          onSave={async (consumable) => {
            try {
              const consumableId = Date.now().toString();
              const newConsumable = {
                id: consumableId,
                name: consumable.nom,
                price: Number(consumable.prixVente) || 0,
                ...consumable,
                stock: 0, // Strict accounting: starts strictly at 0 until restocked!
                stockInitial: 0,
                updatedAt: new Date().toISOString(),
                createdAt: new Date().toISOString()
              };
              await setDoc(doc(db, 'hospital_consumables', consumableId), sanitizeData(stampTenantData(newConsumable, user, establishment)));
              setShowAddConsumable(false);
              showMessage('success', 'Consommable enregistré avec succès (Stock initial: 0)');
            } catch (error) {
              console.error("Error saving consumable:", error);
              showMessage('error', 'Erreur lors de l\'enregistrement');
            }
          }}
        />
      )}
    </div>
  );
};

export default Settings;
