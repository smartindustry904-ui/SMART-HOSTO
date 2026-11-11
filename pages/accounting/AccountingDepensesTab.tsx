import React, { useState, useMemo } from 'react';
import { 
  CreditCard, 
  Plus, 
  Search, 
  Filter, 
  DollarSign, 
  Calendar, 
  CheckCircle, 
  Clock, 
  AlertCircle, 
  Truck, 
  Users, 
  Building, 
  Stethoscope, 
  FileText, 
  Printer, 
  X, 
  Loader2, 
  Lock, 
  Unlock, 
  ArrowUpRight, 
  ShieldCheck, 
  ChevronRight,
  Eye,
  Trash2,
  Edit2,
  Pill,
  Check,
  Receipt
} from 'lucide-react';
import { 
  HospitalExpense, 
  ExpenseCategory, 
  Supplier, 
  SupplierInvoice, 
  SupplierPayment, 
  User, 
  PaymentRequest 
} from '../../types';
import { collection, doc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db, sanitizeData } from '../../src/firebase';
import { useSettings } from '../../hooks/useSettings';
import { stampTenantData } from '../../src/utils/tenant';

interface AccountingDepensesTabProps {
  expenses: HospitalExpense[];
  suppliers: Supplier[];
  supplierInvoices: SupplierInvoice[];
  users: User[];
  consultations: any[];
  paymentRequests: PaymentRequest[];
  currency?: string;
  user?: any;
}

export const AccountingDepensesTab: React.FC<AccountingDepensesTabProps> = ({
  expenses = [],
  suppliers = [],
  supplierInvoices = [],
  users = [],
  consultations = [],
  paymentRequests = [],
  currency = 'FCFA',
  user
}) => {
  const { establishment } = useSettings();
  const [activeSubTab, setActiveSubTab] = useState<'JOURNAL' | 'FOURNISSEURS'>('JOURNAL');

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | ExpenseCategory>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PAID' | 'PENDING'>('ALL');
  const [datePeriodFilter, setDatePeriodFilter] = useState<'ALL' | 'TODAY' | 'MONTH'>('ALL');

  // New Payment Modal State
  const [isNewPaymentModalOpen, setIsNewPaymentModalOpen] = useState(false);
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);

  // Form Fields
  const [selectedCategory, setSelectedCategory] = useState<ExpenseCategory>('FOURNISSEURS');
  const [beneficiary, setBeneficiary] = useState('');
  const [beneficiaryId, setBeneficiaryId] = useState('');
  const [beneficiaryRole, setBeneficiaryRole] = useState('');
  const [amountInput, setAmountInput] = useState<string>('');
  const [description, setDescription] = useState('');
  const [paymentStatus, setPaymentStatus] = useState<'PAID' | 'PENDING'>('PAID');
  const [paymentMethod, setPaymentMethod] = useState<'TRANSFER' | 'CHECK' | 'CASH' | 'MOBILE_MONEY'>('CASH');
  const [paymentRef, setPaymentRef] = useState('');

  // Auto-fill logic state: Staff & Doctors
  const [selectedStaffUser, setSelectedStaffUser] = useState<User | null>(null);
  const [salaryMonth, setSalaryMonth] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  // Doctor Quotes-parts range
  const [quotesStartDate, setQuotesStartDate] = useState<string>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  });
  const [quotesEndDate, setQuotesEndDate] = useState<string>(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [doctorCommissionRate, setDoctorCommissionRate] = useState<number>(20);

  // Fournisseurs selection state
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [selectedSupplierInvoice, setSelectedSupplierInvoice] = useState<SupplierInvoice | null>(null);
  const [supplierPaymentMode, setSupplierPaymentMode] = useState<'INVOICE' | 'FREE'>('INVOICE');

  // Charges & Factures
  const [chargeType, setChargeType] = useState('ELECTRICITE');
  const [billNumber, setBillNumber] = useState('');

  // Anti-fraud admin override state
  const [isAdminOverride, setIsAdminOverride] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');
  const [calculatedAmount, setCalculatedAmount] = useState<number>(0);

  // Detail / Voucher Modal State
  const [selectedExpenseForVoucher, setSelectedExpenseForVoucher] = useState<HospitalExpense | null>(null);

  // Mark as Paid Quick Modal State
  const [selectedExpenseForQuickPay, setSelectedExpenseForQuickPay] = useState<HospitalExpense | null>(null);
  const [quickPayMethod, setQuickPayMethod] = useState<'TRANSFER' | 'CHECK' | 'CASH' | 'MOBILE_MONEY'>('CASH');
  const [quickPayRef, setQuickPayRef] = useState('');
  const [isSubmittingQuickPay, setIsSubmittingQuickPay] = useState(false);

  // Supplier CRUD Modal State (for secondary tab)
  const [isSupplierModalOpen, setIsSupplierModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [supplierFormData, setSupplierFormData] = useState({
    name: '',
    contact: '',
    phone: '',
    email: '',
    address: '',
    taxId: '',
    category: 'Médicaments & Pharmacie'
  });
  const [isSavingSupplier, setIsSavingSupplier] = useState(false);

  // 1. Filtered registered users
  const staffList = useMemo(() => users, [users]);
  const doctorList = useMemo(() => {
    return users.filter(u => {
      const roleStr = String(u.role || '').toUpperCase();
      const profStr = String(u.profession || '').toUpperCase();
      return roleStr.includes('DOCTOR') || roleStr.includes('MEDECIN') || roleStr.includes('CHIRURGIEN') || profStr.includes('DOCTEUR') || profStr.includes('MÉDECIN');
    });
  }, [users]);

  // 2. Doctor quotes-parts dynamic computation
  const doctorPerformance = useMemo(() => {
    if (selectedCategory !== 'QUOTES_PARTS' || !selectedStaffUser) {
      return { count: 0, totalGross: 0, acts: [] };
    }

    const start = new Date(quotesStartDate).getTime();
    const end = new Date(quotesEndDate + 'T23:59:59').getTime();
    const doctorNameLower = (selectedStaffUser.name || '').toLowerCase();
    const doctorEmailLower = (selectedStaffUser.email || '').toLowerCase();
    const doctorId = selectedStaffUser.id;

    // A. Consultations matching this doctor
    const matchedConsultations = consultations.filter(c => {
      const cDate = new Date(c.createdAt || c.date || 0).getTime();
      if (isNaN(cDate) || cDate < start || cDate > end) return false;
      const cDoc = String(c.doctor || c.doctorName || '').toLowerCase();
      const cEmail = String(c.doctorEmail || '').toLowerCase();
      const cDocId = String(c.doctorId || '');
      return (cDoc && cDoc.includes(doctorNameLower)) || (cEmail && cEmail === doctorEmailLower) || (cDocId && cDocId === doctorId);
    });

    // B. Payment Requests created by or linked to this doctor
    const matchedPaymentRequests = paymentRequests.filter(pr => {
      const prDate = new Date(pr.createdAt || pr.date || 0).getTime();
      if (isNaN(prDate) || prDate < start || prDate > end) return false;
      const prCreated = String(pr.createdBy || '').toLowerCase();
      const prDocId = String((pr as any).doctorId || '');
      return (prCreated && prCreated.includes(doctorNameLower)) || (prDocId && prDocId === doctorId);
    });

    // Merge into unique line items
    const acts: Array<{ id: string; date: string; patient: string; type: string; amount: number }> = [];

    matchedPaymentRequests.forEach(pr => {
      acts.push({
        id: pr.id,
        date: pr.createdAt || (pr as any).date || '',
        patient: pr.patientName || 'Patient',
        type: pr.type || 'Acte Médical / Prestation',
        amount: Number(pr.totalAmount || 0)
      });
    });

    // Add consultations that weren't already accounted for by payment requests
    matchedConsultations.forEach(c => {
      const alreadyHasPr = acts.some(a => a.id.includes(c.id) || a.patient.toLowerCase() === String(c.patient || '').toLowerCase());
      if (!alreadyHasPr) {
        // Fallback standard consultation rate if not in PR
        const fallbackAmt = Number(c.amount || c.cost || 10000);
        acts.push({
          id: c.id,
          date: c.createdAt || c.date || '',
          patient: c.patient || 'Patient',
          type: c.type || 'Consultation',
          amount: fallbackAmt
        });
      }
    });

    const totalGross = acts.reduce((sum, a) => sum + a.amount, 0);
    return {
      count: acts.length,
      totalGross,
      acts
    };
  }, [selectedCategory, selectedStaffUser, quotesStartDate, quotesEndDate, consultations, paymentRequests]);

  // 3. Dynamic Auto-Fill Trigger when category or person changes
  const handleSelectStaffForSalary = (u: User) => {
    setSelectedStaffUser(u);
    setBeneficiary(u.name || 'Personnel');
    setBeneficiaryId(u.id);
    setBeneficiaryRole(u.role || u.profession || 'Personnel');

    // Parse base salary
    const rawSal = u.salary || (u as any).baseSalary || 0;
    let cleanSalary = 0;
    if (typeof rawSal === 'number') {
      cleanSalary = rawSal;
    } else {
      const parsed = parseFloat(String(rawSal).replace(/[^0-9.]/g, ''));
      cleanSalary = isNaN(parsed) ? 0 : parsed;
    }

    setCalculatedAmount(cleanSalary);
    setAmountInput(cleanSalary > 0 ? String(cleanSalary) : '');
    setIsAdminOverride(false);
    setOverrideReason('');
    setDescription(`Paiement du salaire fixe - Période : ${salaryMonth} (${u.name})`);
  };

  const handleSelectDoctorForQuotes = (u: User) => {
    setSelectedStaffUser(u);
    setBeneficiary(u.name || 'Médecin');
    setBeneficiaryId(u.id);
    setBeneficiaryRole(u.role || 'Médecin / Praticien');

    // Determine commission rate: check profile quotePartRate (e.g. "20%" or "15")
    let rate = 20;
    if (u.quotePartRate) {
      const parsed = parseFloat(String(u.quotePartRate).replace(/[^0-9.]/g, ''));
      if (!isNaN(parsed) && parsed > 0) rate = parsed;
    }
    setDoctorCommissionRate(rate);

    // Initial recalculation will trigger via doctorPerformance
    setIsAdminOverride(false);
    setOverrideReason('');
  };

  // Update quotes-parts amount when doctorPerformance or rate updates
  React.useEffect(() => {
    if (selectedCategory === 'QUOTES_PARTS' && selectedStaffUser) {
      const computedNet = Math.round(doctorPerformance.totalGross * (doctorCommissionRate / 100));
      setCalculatedAmount(computedNet);
      if (!isAdminOverride) {
        setAmountInput(String(computedNet));
      }
      setDescription(`Rétrocession honoraires / Quotes-parts (${doctorCommissionRate}%) - Période du ${quotesStartDate} au ${quotesEndDate} (${selectedStaffUser.name})`);
    }
  }, [selectedCategory, selectedStaffUser, doctorPerformance, doctorCommissionRate, quotesStartDate, quotesEndDate, isAdminOverride]);

  // Handle Supplier Selection in Nouveau Paiement
  const handleSelectSupplier = (supp: Supplier) => {
    setSelectedSupplier(supp);
    setBeneficiary(supp.name);
    setBeneficiaryId(supp.id);
    setBeneficiaryRole('Fournisseur');

    // Find pending invoices for this supplier
    const pendingInvs = supplierInvoices.filter(
      i => i.supplierId === supp.id && (i.status === 'PENDING' || i.status === 'PARTIAL')
    );

    if (pendingInvs.length > 0) {
      const firstInv = pendingInvs[0];
      setSelectedSupplierInvoice(firstInv);
      const remaining = Number(firstInv.totalAmount || 0) - Number(firstInv.amountPaid || 0);
      setAmountInput(String(Math.max(0, remaining)));
      setDescription(`Règlement facture N° ${firstInv.invoiceNumber || firstInv.id} - Source: ${firstInv.moduleSource || 'Pharmacie'}`);
    } else {
      setSelectedSupplierInvoice(null);
      setAmountInput('');
      setDescription(`Règlement / Acompte Fournisseur : ${supp.name}`);
    }
  };

  const handleSelectSupplierInvoice = (inv: SupplierInvoice) => {
    setSelectedSupplierInvoice(inv);
    const remaining = Number(inv.totalAmount || 0) - Number(inv.amountPaid || 0);
    setAmountInput(String(Math.max(0, remaining)));
    setDescription(`Règlement facture N° ${inv.invoiceNumber || inv.id} - Source: ${inv.moduleSource || 'Pharmacie'}`);
  };

  // Open New Payment Modal with reset
  const handleOpenNewPaymentModal = () => {
    setSelectedCategory('FOURNISSEURS');
    setBeneficiary('');
    setBeneficiaryId('');
    setBeneficiaryRole('');
    setAmountInput('');
    setDescription('');
    setPaymentStatus('PAID');
    setPaymentMethod('CASH');
    setPaymentRef('');
    setSelectedStaffUser(null);
    setSelectedSupplier(null);
    setSelectedSupplierInvoice(null);
    setIsAdminOverride(false);
    setOverrideReason('');
    setCalculatedAmount(0);
    setIsNewPaymentModalOpen(true);
  };

  // Category switch in Modal
  const handleCategoryChange = (cat: ExpenseCategory) => {
    setSelectedCategory(cat);
    setBeneficiary('');
    setBeneficiaryId('');
    setBeneficiaryRole('');
    setAmountInput('');
    setDescription('');
    setSelectedStaffUser(null);
    setSelectedSupplier(null);
    setSelectedSupplierInvoice(null);
    setIsAdminOverride(false);
    setOverrideReason('');
    setCalculatedAmount(0);

    if (cat === 'CHARGES_FACTURES') {
      setBeneficiary('Compagnie d’Électricité');
      setDescription('Paiement facture d’électricité du mois');
    }
  };

  // SUBMIT NEW EXPENSE HANDLER (Strict Anti-Double Click)
  const handleSavePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingPayment) return;

    const amt = parseFloat(amountInput);
    if (isNaN(amt) || amt <= 0) {
      alert("Veuillez saisir un montant valide supérieur à 0.");
      return;
    }

    if (!beneficiary.trim()) {
      alert("Veuillez renseigner le bénéficiaire du paiement.");
      return;
    }

    if ((selectedCategory === 'SALAIRES' || selectedCategory === 'QUOTES_PARTS') && isAdminOverride && !overrideReason.trim()) {
      alert("Une justification écrite est obligatoire pour toute dérogation de montant salarial.");
      return;
    }

    setIsSubmittingPayment(true);
    try {
      const now = new Date();
      const expenseId = `EXP-${Date.now()}`;
      const reference = `DEC-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-${Date.now().toString().slice(-4)}`;

      let categoryLabel = 'Fournisseurs';
      if (selectedCategory === 'CHARGES_FACTURES') categoryLabel = 'Charges & Factures';
      if (selectedCategory === 'SALAIRES') categoryLabel = 'Salaires';
      if (selectedCategory === 'QUOTES_PARTS') categoryLabel = 'Quotes-parts Médecins';

      const expenseDoc: HospitalExpense = {
        id: expenseId,
        reference: reference,
        date: now.toISOString(),
        category: selectedCategory,
        categoryLabel: categoryLabel,
        beneficiary: beneficiary.trim(),
        beneficiaryId: beneficiaryId || undefined,
        beneficiaryRole: beneficiaryRole || undefined,
        amount: amt,
        status: paymentStatus,
        description: description.trim(),
        paymentMethod: paymentStatus === 'PAID' ? paymentMethod : undefined,
        paidAt: paymentStatus === 'PAID' ? now.toISOString() : undefined,
        paidBy: paymentStatus === 'PAID' ? (user?.name || 'Comptable') : undefined,
        createdAt: now.toISOString(),
        createdBy: user?.name || 'Comptable',
        metadata: {
          adminOverride: isAdminOverride,
          overrideReason: isAdminOverride ? overrideReason.trim() : undefined,
          originalCalculatedAmount: calculatedAmount > 0 ? calculatedAmount : undefined
        }
      };

      // Category specific metadata & side-effects
      if (selectedCategory === 'FOURNISSEURS') {
        expenseDoc.metadata!.supplierId = selectedSupplier?.id;
        expenseDoc.metadata!.supplierName = selectedSupplier?.name;
        if (selectedSupplierInvoice) {
          expenseDoc.metadata!.invoiceId = selectedSupplierInvoice.id;
          expenseDoc.metadata!.invoiceNumber = selectedSupplierInvoice.invoiceNumber;
          expenseDoc.metadata!.moduleSource = selectedSupplierInvoice.moduleSource;
        }

        // Side-effects if marked as PAID
        if (paymentStatus === 'PAID') {
          // 1. If invoice was selected, update supplier_invoices
          if (selectedSupplierInvoice) {
            const invRef = doc(db, 'supplier_invoices', selectedSupplierInvoice.id);
            const prevPaid = Number(selectedSupplierInvoice.amountPaid || 0);
            const total = Number(selectedSupplierInvoice.totalAmount || 0);
            const newPaid = prevPaid + amt;
            await updateDoc(invRef, {
              amountPaid: newPaid,
              status: newPaid >= total ? 'PAID' : 'PARTIAL',
              updatedAt: now.toISOString()
            });
          }

          // 2. Update supplier outstanding debt
          if (selectedSupplier) {
            const suppRef = doc(db, 'suppliers', selectedSupplier.id);
            const currentDebt = Number(selectedSupplier.outstandingDebt || selectedSupplier.balance || 0);
            const newDebt = Math.max(0, currentDebt - amt);
            await updateDoc(suppRef, {
              outstandingDebt: newDebt,
              balance: newDebt,
              updatedAt: now.toISOString()
            });
          }

          // 3. Log to supplier_payments
          const suppPayId = `PAY-SUPP-${Date.now()}`;
          const suppPayDoc: SupplierPayment = stampTenantData({
            id: suppPayId,
            supplierId: selectedSupplier?.id || 'DIV',
            supplierName: beneficiary.trim(),
            invoiceId: selectedSupplierInvoice?.id,
            invoiceNumber: selectedSupplierInvoice?.invoiceNumber,
            amount: amt,
            date: now.toISOString(),
            paymentMethod: paymentMethod,
            reference: reference,
            paidBy: user?.name || 'Comptable',
            createdAt: now.toISOString()
          }, user);
          await setDoc(doc(db, 'supplier_payments', suppPayId), sanitizeData(suppPayDoc));
        }
      } else if (selectedCategory === 'SALAIRES') {
        expenseDoc.metadata!.staffId = selectedStaffUser?.id;
        expenseDoc.metadata!.staffName = selectedStaffUser?.name;
        expenseDoc.metadata!.staffRole = selectedStaffUser?.role;
        expenseDoc.metadata!.baseSalary = calculatedAmount;
        expenseDoc.metadata!.month = salaryMonth;
      } else if (selectedCategory === 'QUOTES_PARTS') {
        expenseDoc.metadata!.doctorId = selectedStaffUser?.id;
        expenseDoc.metadata!.doctorName = selectedStaffUser?.name;
        expenseDoc.metadata!.commissionRate = doctorCommissionRate;
        expenseDoc.metadata!.dateRangeStart = quotesStartDate;
        expenseDoc.metadata!.dateRangeEnd = quotesEndDate;
        expenseDoc.metadata!.actsCount = doctorPerformance.count;
        expenseDoc.metadata!.totalActsAmount = doctorPerformance.totalGross;
      } else if (selectedCategory === 'CHARGES_FACTURES') {
        expenseDoc.metadata!.chargeType = chargeType;
        expenseDoc.metadata!.billNumber = billNumber.trim();
      }

      // Save to universal 'expenses' collection stamped with tenant ID
      const stampedExpenseDoc = stampTenantData(expenseDoc, user);
      await setDoc(doc(db, 'expenses', expenseId), sanitizeData(stampedExpenseDoc));

      setIsNewPaymentModalOpen(false);
    } catch (err) {
      console.error("Error creating expense payment:", err);
      alert("Une erreur est survenue lors de l'enregistrement du décaissement.");
    } finally {
      setIsSubmittingPayment(false);
    }
  };

  // QUICK PAY HANDLER FOR PENDING EXPENSES (Strict Anti-Double Click)
  const handleExecuteQuickPay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingQuickPay || !selectedExpenseForQuickPay) return;

    setIsSubmittingQuickPay(true);
    try {
      const now = new Date();
      const expRef = doc(db, 'expenses', selectedExpenseForQuickPay.id);

      await updateDoc(expRef, {
        status: 'PAID',
        paymentMethod: quickPayMethod,
        paidAt: now.toISOString(),
        paidBy: user?.name || 'Comptable',
        reference: quickPayRef || selectedExpenseForQuickPay.reference,
        updatedAt: now.toISOString()
      });

      // If it was a supplier invoice, update the supplier invoice and debt
      if (selectedExpenseForQuickPay.category === 'FOURNISSEURS' && selectedExpenseForQuickPay.metadata?.supplierId) {
        const suppId = selectedExpenseForQuickPay.metadata.supplierId;
        const supp = suppliers.find(s => s.id === suppId);
        if (supp) {
          const suppRef = doc(db, 'suppliers', suppId);
          const currentDebt = Number(supp.outstandingDebt || supp.balance || 0);
          const newDebt = Math.max(0, currentDebt - selectedExpenseForQuickPay.amount);
          await updateDoc(suppRef, {
            outstandingDebt: newDebt,
            balance: newDebt,
            updatedAt: now.toISOString()
          });
        }

        if (selectedExpenseForQuickPay.metadata.invoiceId) {
          const invRef = doc(db, 'supplier_invoices', selectedExpenseForQuickPay.metadata.invoiceId);
          const inv = supplierInvoices.find(i => i.id === selectedExpenseForQuickPay.metadata?.invoiceId);
          if (inv) {
            const prevPaid = Number(inv.amountPaid || 0);
            const total = Number(inv.totalAmount || 0);
            const newPaid = prevPaid + selectedExpenseForQuickPay.amount;
            await updateDoc(invRef, {
              amountPaid: newPaid,
              status: newPaid >= total ? 'PAID' : 'PARTIAL',
              updatedAt: now.toISOString()
            });
          }
        }
      }

      setSelectedExpenseForQuickPay(null);
      setQuickPayRef('');
    } catch (err) {
      console.error("Error confirming payment:", err);
      alert("Erreur lors de la validation du paiement.");
    } finally {
      setIsSubmittingQuickPay(false);
    }
  };

  // Supplier CRUD Handlers (for Fournisseurs sub-tab)
  const handleSaveSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierFormData.name.trim() || isSavingSupplier) return;

    setIsSavingSupplier(true);
    try {
      if (editingSupplier) {
        const suppRef = doc(db, 'suppliers', editingSupplier.id);
        await updateDoc(suppRef, {
          ...supplierFormData,
          updatedAt: new Date().toISOString()
        });
      } else {
        const newId = `SUPP-${Date.now()}`;
        const newSupplier: Supplier = stampTenantData({
          id: newId,
          ...supplierFormData,
          outstandingDebt: 0,
          balance: 0,
          totalBought: 0,
          historyCount: 0,
          createdAt: new Date().toISOString()
        }, user);
        await setDoc(doc(db, 'suppliers', newId), sanitizeData(newSupplier));
      }

      setIsSupplierModalOpen(false);
      setEditingSupplier(null);
      setSupplierFormData({
        name: '',
        contact: '',
        phone: '',
        email: '',
        address: '',
        taxId: '',
        category: 'Médicaments & Pharmacie'
      });
    } catch (err) {
      console.error("Error saving supplier:", err);
    } finally {
      setIsSavingSupplier(false);
    }
  };

  // Filtered Expenses for the Main Table
  const filteredExpenses = useMemo(() => {
    const now = new Date();
    return expenses.filter(exp => {
      // Category filter
      if (categoryFilter !== 'ALL' && exp.category !== categoryFilter) return false;

      // Status filter
      if (statusFilter !== 'ALL' && exp.status !== statusFilter) return false;

      // Date Period filter
      if (datePeriodFilter !== 'ALL') {
        const d = new Date(exp.date || exp.createdAt || 0);
        if (isNaN(d.getTime())) return true;
        if (datePeriodFilter === 'TODAY') {
          if (d.toDateString() !== now.toDateString()) return false;
        } else if (datePeriodFilter === 'MONTH') {
          if (d.getMonth() !== now.getMonth() || d.getFullYear() !== now.getFullYear()) return false;
        }
      }

      // Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesBen = (exp.beneficiary || '').toLowerCase().includes(q);
        const matchesRef = (exp.reference || '').toLowerCase().includes(q);
        const matchesDesc = (exp.description || '').toLowerCase().includes(q);
        const matchesCat = (exp.categoryLabel || '').toLowerCase().includes(q);
        if (!matchesBen && !matchesRef && !matchesDesc && !matchesCat) return false;
      }

      return true;
    });
  }, [expenses, categoryFilter, statusFilter, datePeriodFilter, searchQuery]);

  // Overall KPI Metrics
  const totalPaidOverall = useMemo(() => {
    return expenses.filter(e => e.status === 'PAID').reduce((sum, e) => sum + Number(e.amount || 0), 0);
  }, [expenses]);

  const pendingExpenses = useMemo(() => {
    return expenses.filter(e => e.status === 'PENDING');
  }, [expenses]);

  const totalPendingAmount = useMemo(() => {
    return pendingExpenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);
  }, [pendingExpenses]);

  const totalPayrollThisMonth = useMemo(() => {
    const now = new Date();
    return expenses
      .filter(e => {
        if (e.status !== 'PAID') return false;
        if (e.category !== 'SALAIRES' && e.category !== 'QUOTES_PARTS') return false;
        const d = new Date(e.paidAt || e.date || 0);
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      })
      .reduce((sum, e) => sum + Number(e.amount || 0), 0);
  }, [expenses]);

  const totalSuppliersPaidThisMonth = useMemo(() => {
    const now = new Date();
    return expenses
      .filter(e => {
        if (e.status !== 'PAID' || e.category !== 'FOURNISSEURS') return false;
        const d = new Date(e.paidAt || e.date || 0);
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      })
      .reduce((sum, e) => sum + Number(e.amount || 0), 0);
  }, [expenses]);

  // Format Helper
  const formatDateTime = (iso?: string) => {
    if (!iso) return '-';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getCategoryBadge = (cat: ExpenseCategory) => {
    switch (cat) {
      case 'FOURNISSEURS':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
            <Truck size={12} /> Fournisseurs
          </span>
        );
      case 'SALAIRES':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
            <Users size={12} /> Salaires
          </span>
        );
      case 'QUOTES_PARTS':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-50 text-purple-700 border border-purple-200">
            <Stethoscope size={12} /> Quotes-parts
          </span>
        );
      case 'CHARGES_FACTURES':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">
            <Building size={12} /> Charges & Factures
          </span>
        );
    }
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      
      {/* Top Banner & Navigation Sub-tabs */}
      <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-800 rounded-full text-xs font-bold border border-emerald-200 mb-2">
            <CreditCard size={14} /> Moteur Universel des Décaissements Hospitaliers
          </div>
          <h2 className="text-xl font-black text-slate-900 tracking-tight">Dépenses & Règlements</h2>
          <p className="text-xs text-slate-500 max-w-2xl font-medium">
            Centralisation de tous les flux de trésorerie sortants : Fournisseurs, Charges courantes, Salaires du personnel et Quotes-parts médicales.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Sub-tabs switcher */}
          <div className="flex items-center bg-slate-100 p-1 rounded-2xl border border-slate-200/70">
            <button
              onClick={() => setActiveSubTab('JOURNAL')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeSubTab === 'JOURNAL'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileText size={14} /> Journal des Dépenses
            </button>
            <button
              onClick={() => setActiveSubTab('FOURNISSEURS')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeSubTab === 'FOURNISSEURS'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Truck size={14} /> Fournisseurs & Factures d'Achats
            </button>
          </div>

          {/* New Payment Button */}
          <button
            onClick={handleOpenNewPaymentModal}
            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-xs font-bold transition-all shadow-sm flex items-center gap-2 cursor-pointer shrink-0"
          >
            <Plus size={16} /> Nouveau Paiement
          </button>
        </div>
      </div>

      {/* KPI DASHBOARD SUMMARY */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* KPI 1 */}
        <div className="p-4 bg-white rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Décaissements</span>
            <div className="p-2 bg-emerald-50 rounded-xl text-emerald-600">
              <CheckCircle size={16} />
            </div>
          </div>
          <div className="text-xl font-black text-slate-900">
            {totalPaidOverall.toLocaleString('fr-FR')} <span className="text-xs font-bold text-slate-500">{currency}</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-1 font-medium">Règlements effectifs certifiés</div>
        </div>

        {/* KPI 2 */}
        <div className="p-4 bg-white rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-bold text-amber-600 uppercase tracking-wider">En Attente de Paiement</span>
            <div className="p-2 bg-amber-50 rounded-xl text-amber-600">
              <Clock size={16} />
            </div>
          </div>
          <div className="text-xl font-black text-amber-700">
            {totalPendingAmount.toLocaleString('fr-FR')} <span className="text-xs font-bold text-amber-600">{currency}</span>
          </div>
          <div className="text-[11px] text-amber-600 mt-1 font-medium">{pendingExpenses.length} décaissement(s) en attente</div>
        </div>

        {/* KPI 3 */}
        <div className="p-4 bg-white rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-bold text-blue-600 uppercase tracking-wider">Salaires & Quotes-parts</span>
            <div className="p-2 bg-blue-50 rounded-xl text-blue-600">
              <Users size={16} />
            </div>
          </div>
          <div className="text-xl font-black text-slate-900">
            {totalPayrollThisMonth.toLocaleString('fr-FR')} <span className="text-xs font-bold text-slate-500">{currency}</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-1 font-medium">Reversé au personnel ce mois</div>
        </div>

        {/* KPI 4 */}
        <div className="p-4 bg-white rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-bold text-amber-700 uppercase tracking-wider">Fournisseurs & Stocks</span>
            <div className="p-2 bg-amber-50 rounded-xl text-amber-700">
              <Truck size={16} />
            </div>
          </div>
          <div className="text-xl font-black text-slate-900">
            {totalSuppliersPaidThisMonth.toLocaleString('fr-FR')} <span className="text-xs font-bold text-slate-500">{currency}</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-1 font-medium">Pharmacie, Labo & Matériel ce mois</div>
        </div>
      </div>

      {/* VIEW 1: UNIVERSAL JOURNAL DES DÉPENSES */}
      {activeSubTab === 'JOURNAL' && (
        <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden flex flex-col">
          
          {/* Filtering & Search Strip */}
          <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-col md:flex-row md:items-center justify-between gap-3">
            
            {/* Search Input */}
            <div className="relative flex-1 max-w-md">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Rechercher par bénéficiaire, référence, motif..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Filters Group */}
            <div className="flex flex-wrap items-center gap-2">
              
              {/* Category Filter */}
              <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs">
                <Filter size={13} className="text-slate-400" />
                <span className="text-slate-400 font-bold">Catégorie:</span>
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value as any)}
                  className="bg-transparent font-bold text-slate-700 focus:outline-none cursor-pointer"
                >
                  <option value="ALL">Toutes les catégories</option>
                  <option value="FOURNISSEURS">Fournisseurs</option>
                  <option value="CHARGES_FACTURES">Charges & Factures</option>
                  <option value="SALAIRES">Salaires</option>
                  <option value="QUOTES_PARTS">Quotes-parts</option>
                </select>
              </div>

              {/* Status Filter */}
              <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs">
                <span className="text-slate-400 font-bold">Statut:</span>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as any)}
                  className="bg-transparent font-bold text-slate-700 focus:outline-none cursor-pointer"
                >
                  <option value="ALL">Tous les statuts</option>
                  <option value="PAID">Payé</option>
                  <option value="PENDING">En attente</option>
                </select>
              </div>

              {/* Period Filter */}
              <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs">
                <Calendar size={13} className="text-slate-400" />
                <select
                  value={datePeriodFilter}
                  onChange={(e) => setDatePeriodFilter(e.target.value as any)}
                  className="bg-transparent font-bold text-slate-700 focus:outline-none cursor-pointer"
                >
                  <option value="ALL">Tout l'historique</option>
                  <option value="TODAY">Aujourd'hui</option>
                  <option value="MONTH">Ce mois</option>
                </select>
              </div>

            </div>
          </div>

          {/* Compact Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  <th className="py-3 px-4">Date & Réf</th>
                  <th className="py-3 px-4">Bénéficiaire (Payee)</th>
                  <th className="py-3 px-4">Catégorie</th>
                  <th className="py-3 px-4">Motif / Description</th>
                  <th className="py-3 px-4 text-right">Montant</th>
                  <th className="py-3 px-4 text-center">Statut</th>
                  <th className="py-3 px-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredExpenses.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-400">
                      <div className="max-w-xs mx-auto space-y-2">
                        <CreditCard size={36} className="mx-auto text-slate-300" />
                        <p className="font-bold text-slate-600 text-sm">Aucun décaissement trouvé</p>
                        <p className="text-xs text-slate-400">
                          Enregistrez un nouveau paiement pour les fournisseurs, les salaires ou les charges hospitalières.
                        </p>
                        <button
                          onClick={handleOpenNewPaymentModal}
                          className="mt-3 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer inline-flex items-center gap-1.5"
                        >
                          <Plus size={14} /> Nouveau Paiement
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredExpenses.map((expense) => {
                    const isPaid = expense.status === 'PAID';
                    const hasAdminOverride = expense.metadata?.adminOverride;

                    return (
                      <tr key={expense.id} className="hover:bg-slate-50/70 transition-colors">
                        
                        {/* Column 1: Date & Reference */}
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="font-bold text-slate-900">{formatDateTime(expense.date)}</div>
                          <div className="text-[11px] font-mono text-slate-400">{expense.reference}</div>
                        </td>

                        {/* Column 2: Bénéficiaire */}
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center font-bold text-xs shrink-0">
                              {expense.beneficiary.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <div className="font-bold text-slate-900">{expense.beneficiary}</div>
                              {expense.beneficiaryRole && (
                                <div className="text-[10px] text-slate-400">{expense.beneficiaryRole}</div>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Column 3: Catégorie */}
                        <td className="py-3 px-4 whitespace-nowrap">
                          {getCategoryBadge(expense.category)}
                        </td>

                        {/* Column 4: Motif / Description */}
                        <td className="py-3 px-4 max-w-xs">
                          <div className="truncate text-slate-700 font-medium" title={expense.description}>
                            {expense.description || 'Paiement sans description'}
                          </div>
                          {hasAdminOverride && (
                            <div className="inline-flex items-center gap-1 text-[10px] text-amber-700 font-bold bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 mt-0.5">
                              <AlertCircle size={10} /> Dérogation admin appliquée
                            </div>
                          )}
                        </td>

                        {/* Column 5: Montant */}
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <span className="font-black text-slate-900 text-sm">
                            {Number(expense.amount || 0).toLocaleString('fr-FR')}
                          </span>
                          <span className="text-[10px] font-bold text-slate-500 ml-1">{currency}</span>
                        </td>

                        {/* Column 6: Statut */}
                        <td className="py-3 px-4 text-center whitespace-nowrap">
                          {isPaid ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <CheckCircle size={12} /> Payé
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-amber-50 text-amber-700 border border-amber-200">
                              <Clock size={12} /> En attente
                            </span>
                          )}
                        </td>

                        {/* Column 7: Actions */}
                        <td className="py-3 px-4 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-1.5">
                            
                            {/* If pending: Quick Pay Button */}
                            {!isPaid && (
                              <button
                                onClick={() => {
                                  setSelectedExpenseForQuickPay(expense);
                                  setQuickPayRef(`REG-${Date.now().toString().slice(-6)}`);
                                }}
                                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all shadow-2xs cursor-pointer flex items-center gap-1"
                                title="Valider et payer maintenant"
                              >
                                <Check size={12} /> Régler
                              </button>
                            )}

                            {/* View Voucher / Reçu */}
                            <button
                              onClick={() => setSelectedExpenseForVoucher(expense)}
                              className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                              title="Voir le bon de décaissement"
                            >
                              <Receipt size={15} />
                            </button>

                          </div>
                        </td>

                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Table Footer info */}
          <div className="p-3 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between text-xs text-slate-500 font-medium">
            <span>Affichage de {filteredExpenses.length} décaissement(s) sur {expenses.length} au total</span>
            <span>Comptabilité Hospitalière Certifiée • Anti-Fraude Activé</span>
          </div>

        </div>
      )}

      {/* VIEW 2: DEDICATED FOURNISSEURS & FACTURES D'ACHATS SUB-TAB */}
      {activeSubTab === 'FOURNISSEURS' && (
        <div className="space-y-4 animate-in fade-in duration-200">
          
          {/* Supplier Directory Header Card */}
          <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-black text-slate-900">Annuaire des Fournisseurs & Approvisionnements</h3>
              <p className="text-xs text-slate-500 font-medium">
                Gestion des comptes tiers et suivi des livraisons de stocks provenant de la Pharmacie et du Laboratoire.
              </p>
            </div>
            <button
              onClick={() => {
                setEditingSupplier(null);
                setSupplierFormData({
                  name: '',
                  contact: '',
                  phone: '',
                  email: '',
                  address: '',
                  taxId: '',
                  category: 'Médicaments & Pharmacie'
                });
                setIsSupplierModalOpen(true);
              }}
              className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
            >
              <Plus size={14} /> Nouveau Fournisseur
            </button>
          </div>

          {/* Grid of Suppliers with Balances */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {suppliers.map(supp => {
              const debt = Number(supp.outstandingDebt || supp.balance || 0);
              const pendingInvs = supplierInvoices.filter(i => i.supplierId === supp.id && i.status !== 'PAID');

              return (
                <div key={supp.id} className="p-4 bg-white rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div>
                        <span className="text-[10px] font-bold px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md">
                          {supp.category || 'Fournisseur'}
                        </span>
                        <h4 className="font-black text-slate-900 text-sm mt-1">{supp.name}</h4>
                        <div className="text-[11px] text-slate-500">{supp.contact || supp.phone || 'Aucun contact'}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] font-bold text-slate-400 uppercase">Dette en cours</div>
                        <div className={`text-base font-black ${debt > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                          {debt.toLocaleString('fr-FR')} <span className="text-[10px]">{currency}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs mt-2">
                    <span className="text-[11px] text-slate-400 font-medium">{pendingInvs.length} facture(s) en attente</span>
                    <button
                      onClick={() => {
                        handleOpenNewPaymentModal();
                        handleSelectSupplier(supp);
                      }}
                      className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1"
                    >
                      <CreditCard size={12} /> Régler
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Supplier Invoices List (Pharmacy & Lab restocking) */}
          <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs overflow-hidden mt-6">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h4 className="font-black text-slate-900 text-sm">Factures d'Achats & Réapprovisionnements</h4>
                <p className="text-xs text-slate-500">Générées automatiquement lors de la réception de stock Pharmacie & Laboratoire.</p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-200">
                    <th className="py-2.5 px-4">Date</th>
                    <th className="py-2.5 px-4">Fournisseur</th>
                    <th className="py-2.5 px-4">Origine</th>
                    <th className="py-2.5 px-4">Réf Facture</th>
                    <th className="py-2.5 px-4 text-right">Total</th>
                    <th className="py-2.5 px-4 text-right">Reste à Payer</th>
                    <th className="py-2.5 px-4 text-center">Statut</th>
                    <th className="py-2.5 px-4 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {supplierInvoices.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-400">
                        Aucune facture d'achat enregistrée.
                      </td>
                    </tr>
                  ) : (
                    supplierInvoices.map(inv => {
                      const total = Number(inv.totalAmount || 0);
                      const paid = Number(inv.amountPaid || 0);
                      const rest = Math.max(0, total - paid);
                      const isFullyPaid = inv.status === 'PAID' || rest === 0;

                      return (
                        <tr key={inv.id} className="hover:bg-slate-50/70">
                          <td className="py-3 px-4 font-medium text-slate-700">{formatDateTime(inv.date || inv.createdAt)}</td>
                          <td className="py-3 px-4 font-bold text-slate-900">{inv.supplierName}</td>
                          <td className="py-3 px-4">
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
                              {inv.moduleSource || 'GÉNÉRAL'}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-mono text-slate-600">{inv.invoiceNumber || inv.id}</td>
                          <td className="py-3 px-4 text-right font-medium">{total.toLocaleString('fr-FR')} {currency}</td>
                          <td className="py-3 px-4 text-right font-black text-rose-600">{rest.toLocaleString('fr-FR')} {currency}</td>
                          <td className="py-3 px-4 text-center">
                            {isFullyPaid ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                Réglée
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                À régler
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center">
                            {!isFullyPaid && (
                              <button
                                onClick={() => {
                                  const supp = suppliers.find(s => s.id === inv.supplierId);
                                  handleOpenNewPaymentModal();
                                  setSelectedCategory('FOURNISSEURS');
                                  if (supp) setSelectedSupplier(supp);
                                  handleSelectSupplierInvoice(inv);
                                }}
                                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all cursor-pointer inline-flex items-center gap-1"
                              >
                                <CreditCard size={12} /> Payer
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: NOUVEAU PAIEMENT (Universal Outgoing Cash Flow Engine) */}
      {/* ========================================================================= */}
      {isNewPaymentModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-2xl w-full overflow-hidden animate-in zoom-in-95 duration-200 my-auto">
            
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-emerald-50 text-emerald-700 rounded-xl">
                  <CreditCard size={20} />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">Enregistrer un Décaissement</h3>
                  <p className="text-xs text-slate-500 font-medium">Flux financier sortant certifié de l'hôpital</p>
                </div>
              </div>
              <button
                onClick={() => setIsNewPaymentModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSavePayment} className="p-6 space-y-5">
              
              {/* 1. Category Selection Dropdown */}
              <div>
                <label className="block text-xs font-black text-slate-700 uppercase tracking-wider mb-2">
                  1. Catégorie de Dépense *
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  
                  {/* Category: Fournisseurs */}
                  <button
                    type="button"
                    onClick={() => handleCategoryChange('FOURNISSEURS')}
                    className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                      selectedCategory === 'FOURNISSEURS'
                        ? 'border-emerald-600 bg-emerald-50/50 text-emerald-900 ring-2 ring-emerald-500/20 shadow-xs'
                        : 'border-slate-200 hover:border-slate-300 text-slate-700 bg-white'
                    }`}
                  >
                    <Truck size={18} className={selectedCategory === 'FOURNISSEURS' ? 'text-emerald-600 mb-2' : 'text-slate-400 mb-2'} />
                    <div>
                      <div className="text-xs font-black">Fournisseurs</div>
                      <div className="text-[10px] text-slate-500 leading-tight">Achats & stocks</div>
                    </div>
                  </button>

                  {/* Category: Charges & Factures */}
                  <button
                    type="button"
                    onClick={() => handleCategoryChange('CHARGES_FACTURES')}
                    className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                      selectedCategory === 'CHARGES_FACTURES'
                        ? 'border-emerald-600 bg-emerald-50/50 text-emerald-900 ring-2 ring-emerald-500/20 shadow-xs'
                        : 'border-slate-200 hover:border-slate-300 text-slate-700 bg-white'
                    }`}
                  >
                    <Building size={18} className={selectedCategory === 'CHARGES_FACTURES' ? 'text-emerald-600 mb-2' : 'text-slate-400 mb-2'} />
                    <div>
                      <div className="text-xs font-black">Charges</div>
                      <div className="text-[10px] text-slate-500 leading-tight">Factures & loyer</div>
                    </div>
                  </button>

                  {/* Category: Salaires */}
                  <button
                    type="button"
                    onClick={() => handleCategoryChange('SALAIRES')}
                    className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                      selectedCategory === 'SALAIRES'
                        ? 'border-emerald-600 bg-emerald-50/50 text-emerald-900 ring-2 ring-emerald-500/20 shadow-xs'
                        : 'border-slate-200 hover:border-slate-300 text-slate-700 bg-white'
                    }`}
                  >
                    <Users size={18} className={selectedCategory === 'SALAIRES' ? 'text-emerald-600 mb-2' : 'text-slate-400 mb-2'} />
                    <div>
                      <div className="text-xs font-black">Salaires</div>
                      <div className="text-[10px] text-slate-500 leading-tight">Personnel fixe</div>
                    </div>
                  </button>

                  {/* Category: Quotes-parts */}
                  <button
                    type="button"
                    onClick={() => handleCategoryChange('QUOTES_PARTS')}
                    className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                      selectedCategory === 'QUOTES_PARTS'
                        ? 'border-emerald-600 bg-emerald-50/50 text-emerald-900 ring-2 ring-emerald-500/20 shadow-xs'
                        : 'border-slate-200 hover:border-slate-300 text-slate-700 bg-white'
                    }`}
                  >
                    <Stethoscope size={18} className={selectedCategory === 'QUOTES_PARTS' ? 'text-emerald-600 mb-2' : 'text-slate-400 mb-2'} />
                    <div>
                      <div className="text-xs font-black">Quotes-parts</div>
                      <div className="text-[10px] text-slate-500 leading-tight">Commissions Dr.</div>
                    </div>
                  </button>

                </div>
              </div>

              {/* 2. DYNAMIC CATEGORY CONFIGURATION */}

              {/* A. FOURNISSEURS CONFIGURATION */}
              {selectedCategory === 'FOURNISSEURS' && (
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-800">Sélectionner le Fournisseur *</label>
                    <span className="text-[11px] text-slate-500">{suppliers.length} fournisseur(s) enregistrés</span>
                  </div>

                  <select
                    value={selectedSupplier?.id || ''}
                    onChange={(e) => {
                      const supp = suppliers.find(s => s.id === e.target.value);
                      if (supp) handleSelectSupplier(supp);
                    }}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  >
                    <option value="">-- Choisir un fournisseur --</option>
                    {suppliers.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.category || 'Fournisseur'}) • Dette: {Number(s.outstandingDebt || s.balance || 0).toLocaleString()} {currency}
                      </option>
                    ))}
                  </select>

                  {/* If supplier selected, show pending invoices */}
                  {selectedSupplier && (
                    <div className="mt-3 space-y-2">
                      <div className="text-[11px] font-bold text-slate-600">Factures d'Achats en attente de ce fournisseur :</div>
                      {(() => {
                        const suppInvs = supplierInvoices.filter(
                          i => i.supplierId === selectedSupplier.id && i.status !== 'PAID'
                        );

                        if (suppInvs.length === 0) {
                          return (
                            <div className="p-2.5 bg-white rounded-xl border border-slate-200 text-xs text-slate-500">
                              Aucune facture impayée pour ce fournisseur. Vous effectuez un règlement libre ou un acompte.
                            </div>
                          );
                        }

                        return (
                          <div className="space-y-1.5 max-h-40 overflow-y-auto custom-scrollbar">
                            {suppInvs.map(inv => {
                              const remaining = Number(inv.totalAmount || 0) - Number(inv.amountPaid || 0);
                              const isSelected = selectedSupplierInvoice?.id === inv.id;

                              return (
                                <div
                                  key={inv.id}
                                  onClick={() => handleSelectSupplierInvoice(inv)}
                                  className={`p-2.5 rounded-xl border text-xs cursor-pointer flex items-center justify-between transition-all ${
                                    isSelected
                                      ? 'border-emerald-600 bg-emerald-50/70 font-bold'
                                      : 'border-slate-200 bg-white hover:border-slate-300'
                                  }`}
                                >
                                  <div>
                                    <div className="font-bold text-slate-900">
                                      Facture {inv.invoiceNumber || inv.id} ({inv.moduleSource || 'Pharmacie'})
                                    </div>
                                    <div className="text-[10px] text-slate-400">{formatDateTime(inv.date || inv.createdAt)}</div>
                                  </div>
                                  <div className="text-right">
                                    <span className="text-[10px] text-slate-400 block">Reste à payer</span>
                                    <span className="font-black text-rose-600">{remaining.toLocaleString('fr-FR')} {currency}</span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              )}

              {/* B. SALAIRES CONFIGURATION */}
              {selectedCategory === 'SALAIRES' && (
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-800">Sélectionner l'Employé / Salarié *</label>
                    <span className="text-[11px] text-slate-500">{staffList.length} membres du personnel</span>
                  </div>

                  <select
                    value={selectedStaffUser?.id || ''}
                    onChange={(e) => {
                      const u = staffList.find(s => s.id === e.target.value);
                      if (u) handleSelectStaffForSalary(u);
                    }}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  >
                    <option value="">-- Choisir un salarié --</option>
                    {staffList.map(u => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({u.role || u.profession || 'Personnel'})
                      </option>
                    ))}
                  </select>

                  <div className="grid grid-cols-2 gap-3 pt-2">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">Mois de Paie</label>
                      <input
                        type="month"
                        value={salaryMonth}
                        onChange={(e) => {
                          setSalaryMonth(e.target.value);
                          if (selectedStaffUser) {
                            setDescription(`Paiement du salaire fixe - Période : ${e.target.value} (${selectedStaffUser.name})`);
                          }
                        }}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">Salaire de Base RH</label>
                      <div className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700">
                        {calculatedAmount.toLocaleString('fr-FR')} {currency}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* C. QUOTES-PARTS CONFIGURATION (Doctor auto-calculate) */}
              {selectedCategory === 'QUOTES_PARTS' && (
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-800">Sélectionner le Médecin / Chirurgien *</label>
                    <span className="text-[11px] text-purple-700 font-bold bg-purple-50 px-2 py-0.5 rounded-md border border-purple-200">
                      Calcul automatique des commissions
                    </span>
                  </div>

                  <select
                    value={selectedStaffUser?.id || ''}
                    onChange={(e) => {
                      const u = users.find(s => s.id === e.target.value);
                      if (u) handleSelectDoctorForQuotes(u);
                    }}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                  >
                    <option value="">-- Choisir un médecin / praticien --</option>
                    {(doctorList.length > 0 ? doctorList : staffList).map(u => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({u.role || u.profession || 'Médecin'})
                      </option>
                    ))}
                  </select>

                  {/* Date range picker for procedure volume */}
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-600 mb-1">Du (Date Début)</label>
                      <input
                        type="date"
                        value={quotesStartDate}
                        onChange={(e) => setQuotesStartDate(e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-medium"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-600 mb-1">Au (Date Fin)</label>
                      <input
                        type="date"
                        value={quotesEndDate}
                        onChange={(e) => setQuotesEndDate(e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-medium"
                      />
                    </div>
                  </div>

                  {/* Calculated metrics box */}
                  {selectedStaffUser && (
                    <div className="p-3 bg-purple-50/70 border border-purple-200/80 rounded-xl space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-purple-900 font-bold">Actes & consultations identifiés :</span>
                        <span className="font-black text-purple-950">{doctorPerformance.count} acte(s)</span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-purple-900 font-bold">Volume brut facturé :</span>
                        <span className="font-black text-purple-950">{doctorPerformance.totalGross.toLocaleString('fr-FR')} {currency}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-purple-900 font-bold">Taux de Quote-part appliqué :</span>
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            min="1"
                            max="100"
                            value={doctorCommissionRate}
                            onChange={(e) => setDoctorCommissionRate(Math.max(1, Math.min(100, Number(e.target.value))))}
                            className="w-14 px-2 py-0.5 bg-white border border-purple-300 rounded text-center text-xs font-black text-purple-900"
                          />
                          <span className="font-bold text-purple-900">%</span>
                        </div>
                      </div>
                      <div className="pt-2 border-t border-purple-200/80 flex items-center justify-between">
                        <span className="text-xs font-black text-purple-950 uppercase tracking-wider">Montant Net à Reverser :</span>
                        <span className="text-base font-black text-purple-700">
                          {calculatedAmount.toLocaleString('fr-FR')} {currency}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* D. CHARGES & FACTURES CONFIGURATION */}
              {selectedCategory === 'CHARGES_FACTURES' && (
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">Type de Charge *</label>
                      <select
                        value={chargeType}
                        onChange={(e) => setChargeType(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800"
                      >
                        <option value="ELECTRICITE">Électricité (CIE / Senelec / etc.)</option>
                        <option value="EAU">Eau courante (SODECI / etc.)</option>
                        <option value="LOYER">Loyer des locaux hospitaliers</option>
                        <option value="INTERNET">Internet & Télécoms</option>
                        <option value="CARBURANT">Carburant Groupe Électrogène / Ambulance</option>
                        <option value="MAINTENANCE">Maintenance Équipements Médicaux</option>
                        <option value="ASSURANCE">Assurances & Taxes</option>
                        <option value="AUTRE">Autre charge d'exploitation</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">N° Facture / Référence Reçu</label>
                      <input
                        type="text"
                        placeholder="Ex: FAC-2026-998"
                        value={billNumber}
                        onChange={(e) => setBillNumber(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* 3. BENEFICIARY & AMOUNT (With Anti-Fraud Read-Only Lock) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                
                {/* Beneficiary Field */}
                <div>
                  <label className="block text-xs font-black text-slate-700 uppercase tracking-wider mb-1">
                    Bénéficiaire (Payee) *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Nom du bénéficiaire ou société"
                    value={beneficiary}
                    onChange={(e) => setBeneficiary(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>

                {/* Amount to Pay Field (Read-only if calculated, anti-fraud lock) */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-black text-slate-700 uppercase tracking-wider">
                      Montant à Payer ({currency}) *
                    </label>
                    {(selectedCategory === 'SALAIRES' || selectedCategory === 'QUOTES_PARTS') && (
                      <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1">
                        {isAdminOverride ? <Unlock size={11} className="text-amber-600" /> : <Lock size={11} className="text-slate-400" />}
                        {isAdminOverride ? 'Déverrouillé' : 'Verrouillé RH'}
                      </span>
                    )}
                  </div>

                  <div className="relative">
                    <input
                      type="number"
                      required
                      min="1"
                      step="any"
                      readOnly={(selectedCategory === 'SALAIRES' || selectedCategory === 'QUOTES_PARTS') && !isAdminOverride}
                      placeholder="0"
                      value={amountInput}
                      onChange={(e) => setAmountInput(e.target.value)}
                      className={`w-full px-3.5 py-2.5 rounded-xl text-sm font-black focus:outline-none transition-all ${
                        (selectedCategory === 'SALAIRES' || selectedCategory === 'QUOTES_PARTS') && !isAdminOverride
                          ? 'bg-slate-100 text-slate-700 border border-slate-200 cursor-not-allowed'
                          : 'bg-white text-slate-900 border border-slate-300 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500'
                      }`}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                      {currency}
                    </span>
                  </div>

                  {/* Anti-Fraud Override Toggle for Salaires & Quotes-parts */}
                  {(selectedCategory === 'SALAIRES' || selectedCategory === 'QUOTES_PARTS') && (
                    <div className="mt-1.5 flex items-center justify-between text-[11px]">
                      {!isAdminOverride ? (
                        <button
                          type="button"
                          onClick={() => setIsAdminOverride(true)}
                          className="text-amber-700 hover:text-amber-800 font-bold underline cursor-pointer"
                        >
                          Dérogation administrative (Modifier le montant)
                        </button>
                      ) : (
                        <div className="w-full space-y-1 bg-amber-50 p-2 rounded-xl border border-amber-200 mt-1">
                          <div className="flex items-center justify-between text-amber-900 font-bold text-[10px]">
                            <span>⚠️ Dérogation active</span>
                            <button
                              type="button"
                              onClick={() => {
                                setIsAdminOverride(false);
                                setAmountInput(String(calculatedAmount));
                                setOverrideReason('');
                              }}
                              className="text-slate-500 hover:text-slate-800 underline"
                            >
                              Annuler
                            </button>
                          </div>
                          <input
                            type="text"
                            required
                            placeholder="Motif impératif de la dérogation (ex: prime, retenue)..."
                            value={overrideReason}
                            onChange={(e) => setOverrideReason(e.target.value)}
                            className="w-full px-2 py-1 bg-white border border-amber-300 rounded text-xs font-medium"
                          />
                        </div>
                      )}
                    </div>
                  )}

                </div>

              </div>

              {/* 4. Description / Reason */}
              <div>
                <label className="block text-xs font-black text-slate-700 uppercase tracking-wider mb-1">
                  Motif / Description du Paiement *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Détails du règlement..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>

              {/* 5. Execution Status & Payment Method */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-black text-slate-700 uppercase tracking-wider">
                    Statut de la Transaction *
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setPaymentStatus('PAID')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        paymentStatus === 'PAID'
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'bg-white border border-slate-200 text-slate-600'
                      }`}
                    >
                      <CheckCircle size={13} className="inline mr-1" /> Payé Immédiatement
                    </button>
                    <button
                      type="button"
                      onClick={() => setPaymentStatus('PENDING')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        paymentStatus === 'PENDING'
                          ? 'bg-amber-600 text-white shadow-xs'
                          : 'bg-white border border-slate-200 text-slate-600'
                      }`}
                    >
                      <Clock size={13} className="inline mr-1" /> En Attente de Règlement
                    </button>
                  </div>
                </div>

                {paymentStatus === 'PAID' && (
                  <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-200/60">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">Mode de Paiement</label>
                      <select
                        value={paymentMethod}
                        onChange={(e) => setPaymentMethod(e.target.value as any)}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800"
                      >
                        <option value="CASH">Espèces (Caisse / Tiroir)</option>
                        <option value="TRANSFER">Virement Bancaire</option>
                        <option value="CHECK">Chèque Hospitalier</option>
                        <option value="MOBILE_MONEY">Mobile Money</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">N° Chèque / Réf Virement</label>
                      <input
                        type="text"
                        placeholder="Optionnel"
                        value={paymentRef}
                        onChange={(e) => setPaymentRef(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Action Buttons (Strict Anti-Double Click) */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsNewPaymentModalOpen(false)}
                  disabled={isSubmittingPayment}
                  className="px-4 py-2.5 border border-slate-200 text-slate-600 hover:bg-slate-100 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingPayment}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black transition-all shadow-sm flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmittingPayment ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      <span>Enregistrement en cours...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle size={16} />
                      <span>Valider le Décaissement</span>
                    </>
                  )}
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: QUICK PAY MODAL (For Pending Payments) */}
      {/* ========================================================================= */}
      {selectedExpenseForQuickPay && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
                  <CheckCircle size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900">Régler le Décaissement</h3>
                  <p className="text-[11px] text-slate-500">{selectedExpenseForQuickPay.reference}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedExpenseForQuickPay(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleExecuteQuickPay} className="p-5 space-y-4">
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-1">
                <div className="text-xs text-slate-500">Bénéficiaire : <strong className="text-slate-900">{selectedExpenseForQuickPay.beneficiary}</strong></div>
                <div className="text-xs text-slate-500">Motif : <span className="text-slate-700">{selectedExpenseForQuickPay.description}</span></div>
                <div className="text-base font-black text-slate-900 pt-1">
                  Montant : <span className="text-emerald-600">{Number(selectedExpenseForQuickPay.amount).toLocaleString('fr-FR')} {currency}</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Moyen de Décaissement</label>
                <select
                  value={quickPayMethod}
                  onChange={(e) => setQuickPayMethod(e.target.value as any)}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800"
                >
                  <option value="CASH">Espèces en Caisse</option>
                  <option value="TRANSFER">Virement Bancaire</option>
                  <option value="CHECK">Chèque</option>
                  <option value="MOBILE_MONEY">Mobile Money</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">N° Quittance / Réf Transaction</label>
                <input
                  type="text"
                  placeholder="Ex: CHQ-88902 ou VIR-776"
                  value={quickPayRef}
                  onChange={(e) => setQuickPayRef(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setSelectedExpenseForQuickPay(null)}
                  disabled={isSubmittingQuickPay}
                  className="px-4 py-2 border border-slate-200 text-slate-600 hover:bg-slate-100 rounded-xl text-xs font-bold"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingQuickPay}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isSubmittingQuickPay ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      <span>Règlement...</span>
                    </>
                  ) : (
                    <>
                      <Check size={14} />
                      <span>Confirmer le Paiement</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: BORDEREAU DE DÉCAISSEMENT / VOUCHER (Printable) */}
      {/* ========================================================================= */}
      {selectedExpenseForVoucher && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-lg w-full overflow-hidden animate-in zoom-in-95 duration-200 my-auto">
            
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2">
                <FileText size={18} className="text-slate-600" />
                <span className="text-xs font-black text-slate-900 uppercase tracking-wider">Reçu Officiel de Décaissement</span>
              </div>
              <button
                onClick={() => setSelectedExpenseForVoucher(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-5 text-xs text-slate-700" id="printable-voucher">
              {/* Header */}
              <div className="text-center border-b border-slate-100 pb-3">
                <h4 className="text-base font-black text-slate-900">{establishment?.name || 'CENTRE HOSPITALIER'}</h4>
                <p className="text-[11px] text-slate-500">{establishment?.address} • {establishment?.phone}</p>
                <div className="mt-2 inline-block px-3 py-1 bg-slate-100 rounded-full font-bold text-slate-800 text-[11px]">
                  BON DE DÉCAISSEMENT CAISSE / BANQUE
                </div>
              </div>

              {/* Voucher Details */}
              <div className="space-y-2 bg-slate-50 p-4 rounded-2xl border border-slate-200/60">
                <div className="flex justify-between">
                  <span className="text-slate-500">Réf Décaissement :</span>
                  <span className="font-mono font-bold text-slate-900">{selectedExpenseForVoucher.reference}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Date & Heure :</span>
                  <span className="font-medium text-slate-900">{formatDateTime(selectedExpenseForVoucher.date)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Bénéficiaire :</span>
                  <span className="font-black text-slate-900">{selectedExpenseForVoucher.beneficiary}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Catégorie :</span>
                  <span className="font-bold text-slate-800">{selectedExpenseForVoucher.categoryLabel}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Mode de paiement :</span>
                  <span className="font-bold text-slate-800">{selectedExpenseForVoucher.paymentMethod || 'ESPÈCES'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Statut :</span>
                  <span className={`font-bold ${selectedExpenseForVoucher.status === 'PAID' ? 'text-emerald-700' : 'text-amber-700'}`}>
                    {selectedExpenseForVoucher.status === 'PAID' ? 'PAYÉ / CERTIFIÉ' : 'EN ATTENTE'}
                  </span>
                </div>
              </div>

              {/* Amount Highlight */}
              <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-200 text-center">
                <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-widest block mb-0.5">Montant Décaissé</span>
                <span className="text-2xl font-black text-emerald-900">
                  {Number(selectedExpenseForVoucher.amount).toLocaleString('fr-FR')} {currency}
                </span>
              </div>

              {/* Description */}
              <div>
                <span className="text-slate-500 font-bold block mb-1">Motif du règlement :</span>
                <p className="p-2.5 bg-white border border-slate-200 rounded-xl text-slate-800 font-medium">
                  {selectedExpenseForVoucher.description}
                </p>
              </div>

              {/* Signatures */}
              <div className="pt-6 grid grid-cols-2 gap-4 text-center border-t border-slate-100">
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Comptabilité / Caisse</p>
                  <div className="h-12 border-b border-dashed border-slate-300"></div>
                  <p className="text-[10px] text-slate-500 mt-1">{selectedExpenseForVoucher.createdBy}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Le Bénéficiaire</p>
                  <div className="h-12 border-b border-dashed border-slate-300"></div>
                  <p className="text-[10px] text-slate-500 mt-1">Signature & Mention "Reçu"</p>
                </div>
              </div>

            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
              <button
                onClick={() => setSelectedExpenseForVoucher(null)}
                className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-100"
              >
                Fermer
              </button>
              <button
                onClick={() => window.print()}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-black flex items-center gap-1.5"
              >
                <Printer size={14} /> Imprimer le Bon
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 4: SUPPLIER CREATE/EDIT MODAL */}
      {/* ========================================================================= */}
      {isSupplierModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Truck size={18} className="text-slate-700" />
                <h3 className="text-sm font-black text-slate-900">
                  {editingSupplier ? 'Modifier le Fournisseur' : 'Nouveau Fournisseur'}
                </h3>
              </div>
              <button onClick={() => setIsSupplierModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveSupplier} className="p-5 space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Raison Sociale / Nom *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Laboratoires MediPharm CI"
                  value={supplierFormData.name}
                  onChange={(e) => setSupplierFormData(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-medium"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Catégorie</label>
                <select
                  value={supplierFormData.category}
                  onChange={(e) => setSupplierFormData(prev => ({ ...prev, category: e.target.value }))}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-bold text-slate-800"
                >
                  <option value="Médicaments & Pharmacie">Médicaments & Pharmacie</option>
                  <option value="Réactifs & Laboratoire">Réactifs & Laboratoire</option>
                  <option value="Consommables Médicaux">Consommables Médicaux</option>
                  <option value="Maintenance Équipements">Maintenance Équipements</option>
                  <option value="Services Généraux">Services Généraux</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Personne Contact</label>
                  <input
                    type="text"
                    value={supplierFormData.contact}
                    onChange={(e) => setSupplierFormData(prev => ({ ...prev, contact: e.target.value }))}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-medium"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Téléphone</label>
                  <input
                    type="text"
                    value={supplierFormData.phone}
                    onChange={(e) => setSupplierFormData(prev => ({ ...prev, phone: e.target.value }))}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-medium"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Identifiant Fiscal (NIF / RC)</label>
                <input
                  type="text"
                  value={supplierFormData.taxId}
                  onChange={(e) => setSupplierFormData(prev => ({ ...prev, taxId: e.target.value }))}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-medium"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsSupplierModalOpen(false)}
                  className="px-3.5 py-2 border border-slate-200 text-slate-600 rounded-xl font-bold"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isSavingSupplier}
                  className="px-4 py-2 bg-slate-900 text-white rounded-xl font-black flex items-center gap-1.5"
                >
                  {isSavingSupplier && <Loader2 size={13} className="animate-spin" />}
                  <span>Enregistrer Fournisseur</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
export default AccountingDepensesTab;
