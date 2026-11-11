import React, { useState, useEffect } from 'react';
import { 
  TrendingUp, 
  Landmark, 
  Users, 
  Truck, 
  LayoutDashboard,
  ShieldCheck,
  CreditCard
} from 'lucide-react';
import { 
  AccountingSubMenu, 
  CashierSession, 
  CashierTransaction, 
  DettePatient, 
  AvoirPatient, 
  Patient, 
  Supplier, 
  SupplierInvoice, 
  SupplierPayment,
  PaymentRequest,
  HospitalExpense,
  User
} from '../types';
import { useSettings } from '../hooks/useSettings';
import { MicroHeader } from '../components/common/MicroHeader';
import { collection, query, onSnapshot, orderBy } from 'firebase/firestore';
import { db } from '../src/firebase';
import { getActiveTenantId, belongsToTenant } from '../src/utils/tenant';

import { AccountingDashboardTab } from './accounting/AccountingDashboardTab';
import { AccountingTresorerieTab } from './accounting/AccountingTresorerieTab';
import { AccountingComptesClientsTab } from './accounting/AccountingComptesClientsTab';
import { AccountingFournisseursTab } from './accounting/AccountingFournisseursTab';
import { AccountingDepensesTab } from './accounting/AccountingDepensesTab';
import { ShiftClosingSlipModal } from './accounting/ShiftClosingSlipModal';
import { SessionTransactionsModal } from './accounting/SessionTransactionsModal';

interface AccountingProps {
  user: any;
  paymentRequests?: PaymentRequest[];
  cashierTransactions?: CashierTransaction[];
  onBackToDashboard: () => void;
  activeTab?: AccountingSubMenu;
  setActiveTab?: (tab: AccountingSubMenu) => void;
  theme?: 'light' | 'dark';
}

export const Accounting: React.FC<AccountingProps> = ({
  user,
  paymentRequests: paymentRequestsProp = [],
  cashierTransactions: cashierTransactionsProp = [],
  onBackToDashboard,
  activeTab: activeTabProp,
  setActiveTab: setActiveTabProp,
  theme = 'light'
}) => {
  // Navigation: Restrict strictly to 4 Essential Hospital Finance Pillars
  const [internalTab, setInternalTab] = useState<AccountingSubMenu>('dashboard');
  const activeTabRaw = activeTabProp !== undefined ? activeTabProp : internalTab;
  const setActiveTab = setActiveTabProp !== undefined ? setActiveTabProp : setInternalTab;

  // Map any legacy tab into one of the 4 essential pillars
  const activeTab: 'dashboard' | 'tresorerie' | 'creances' | 'depenses' = (() => {
    if (activeTabRaw === 'tresorerie' || activeTabRaw === 'recettes') return 'tresorerie';
    if (activeTabRaw === 'creances') return 'creances';
    if (activeTabRaw === 'depenses' || activeTabRaw === 'fournisseurs') return 'depenses';
    return 'dashboard';
  })();

  const { establishment } = useSettings();
  const currency = establishment?.currency || 'FCFA';
  const activeTenantId = getActiveTenantId(user, establishment);

  // Live Database Collections State - Pure real-time listeners, ZERO dummy data
  const [cashierSessions, setCashierSessions] = useState<CashierSession[]>([]);
  const [cashierTransactions, setCashierTransactions] = useState<CashierTransaction[]>(cashierTransactionsProp);
  const [paymentRequests, setPaymentRequests] = useState<PaymentRequest[]>(paymentRequestsProp || []);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [dettes, setDettes] = useState<DettePatient[]>([]);
  const [avoirs, setAvoirs] = useState<AvoirPatient[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierInvoices, setSupplierInvoices] = useState<SupplierInvoice[]>([]);
  const [supplierPayments, setSupplierPayments] = useState<SupplierPayment[]>([]);
  const [expenses, setExpenses] = useState<HospitalExpense[]>([]);
  const [hospitalUsers, setHospitalUsers] = useState<User[]>([]);
  const [consultations, setConsultations] = useState<any[]>([]);

  // Shift slip modal and transaction drill-down modal state
  const [selectedSessionForSlip, setSelectedSessionForSlip] = useState<CashierSession | null>(null);
  const [selectedSessionForTransactions, setSelectedSessionForTransactions] = useState<CashierSession | null>(null);

  // 1. LIVE FIRESTORE LISTENERS
  useEffect(() => {
    // 1. Cashier Sessions (Shift Closings)
    const unsubSessions = onSnapshot(
      collection(db, 'cashier_sessions'),
      (snapshot) => {
        const sorted = snapshot.docs
          .map(d => ({ id: d.id, ...d.data() } as CashierSession))
          .filter(item => belongsToTenant(item, activeTenantId));
        sorted.sort((a, b) => new Date(b.closedAt || b.openedAt || 0).getTime() - new Date(a.closedAt || a.openedAt || 0).getTime());
        setCashierSessions(sorted);
      },
      (error) => console.warn("Error fetching cashier_sessions:", error)
    );

    // 2. Cashier Transactions (POS Receipts)
    const unsubTransactions = onSnapshot(
      collection(db, 'cashier_transactions'),
      (snapshot) => {
        const txs = snapshot.docs
          .map(d => ({ id: d.id, ...d.data() } as CashierTransaction))
          .filter(item => belongsToTenant(item, activeTenantId));
        txs.sort((a: any, b: any) => new Date(b.date || b.timestamp || b.createdAt || 0).getTime() - new Date(a.date || a.timestamp || a.createdAt || 0).getTime());
        setCashierTransactions(txs);
      },
      (error) => console.warn("Error fetching cashier_transactions:", error)
    );

    // 3. Payment Requests (Patient Invoices)
    const unsubPaymentRequests = onSnapshot(
      collection(db, 'payment_requests'),
      (snapshot) => {
        const prs = snapshot.docs
          .map(d => ({ id: d.id, ...d.data() } as PaymentRequest))
          .filter(item => belongsToTenant(item, activeTenantId));
        prs.sort((a: any, b: any) => new Date(b.createdAt || b.date || 0).getTime() - new Date(a.createdAt || a.date || 0).getTime());
        setPaymentRequests(prs);
      },
      (error) => console.warn("Error fetching payment_requests:", error)
    );

    // 4. Patients (with Credit Lock toggles)
    const unsubPatients = onSnapshot(
      collection(db, 'patients'),
      (snapshot) => {
        const pts = snapshot.docs
          .map(d => ({ id: d.id, ...d.data() } as Patient))
          .filter(item => belongsToTenant(item, activeTenantId));
        setPatients(pts);
      },
      (error) => console.warn("Error fetching patients:", error)
    );

    // 5. Dettes Patients (Client Receivables)
    const unsubDettes = onSnapshot(
      collection(db, 'dettes_patient'),
      (snapshot) => {
        const dts = snapshot.docs
          .map(d => ({ id: d.id, ...d.data() } as DettePatient))
          .filter(item => belongsToTenant(item, activeTenantId));
        setDettes(dts);
      },
      (error) => console.warn("Error fetching dettes_patient:", error)
    );

    // 6. Avoirs Patients (Client Advances)
    const unsubAvoirs = onSnapshot(
      collection(db, 'avoirs_patient'),
      (snapshot) => {
        const avs = snapshot.docs
          .map(d => ({ id: d.id, ...d.data() } as AvoirPatient))
          .filter(item => belongsToTenant(item, activeTenantId));
        setAvoirs(avs);
      },
      (error) => console.warn("Error fetching avoirs_patient:", error)
    );

    // 7. Suppliers (Fournisseurs)
    const unsubSuppliers = onSnapshot(
      collection(db, 'suppliers'),
      (snapshot) => {
        const sups = snapshot.docs
          .map(d => ({ id: d.id, ...d.data() } as Supplier))
          .filter(item => belongsToTenant(item, activeTenantId));
        setSuppliers(sups);
      },
      (error) => console.warn("Error fetching suppliers:", error)
    );

    // 8. Supplier Invoices (Achats & Réapprovisionnements)
    const unsubInvoices = onSnapshot(
      collection(db, 'supplier_invoices'),
      (snapshot) => {
        const invs = snapshot.docs
          .map(d => ({ id: d.id, ...d.data() } as SupplierInvoice))
          .filter(item => belongsToTenant(item, activeTenantId));
        invs.sort((a: any, b: any) => new Date(b.createdAt || b.date || 0).getTime() - new Date(a.createdAt || a.date || 0).getTime());
        setSupplierInvoices(invs);
      },
      (error) => console.warn("Error fetching supplier_invoices:", error)
    );

    // 9. Supplier Payments (Règlements)
    const unsubPayments = onSnapshot(
      collection(db, 'supplier_payments'),
      (snapshot) => {
        const pymts = snapshot.docs
          .map(d => ({ id: d.id, ...d.data() } as SupplierPayment))
          .filter(item => belongsToTenant(item, activeTenantId));
        pymts.sort((a: any, b: any) => new Date(b.createdAt || b.date || 0).getTime() - new Date(a.createdAt || a.date || 0).getTime());
        setSupplierPayments(pymts);
      },
      (error) => console.warn("Error fetching supplier_payments:", error)
    );

    // 10. Expenses & Disbursements (Dépenses Générales)
    const unsubExpenses = onSnapshot(
      collection(db, 'expenses'),
      (snapshot) => {
        const exps = snapshot.docs
          .map(d => ({ id: d.id, ...d.data() } as HospitalExpense))
          .filter(item => belongsToTenant(item, activeTenantId));
        exps.sort((a, b) => new Date(b.createdAt || b.date || 0).getTime() - new Date(a.createdAt || a.date || 0).getTime());
        setExpenses(exps);
      },
      (error) => console.warn("Error fetching expenses:", error)
    );

    // 11. Hospital Staff / Users (Salaires & Médecins)
    const unsubUsers = onSnapshot(
      collection(db, 'hospital_users'),
      (snapshot) => {
        const usrs = snapshot.docs
          .map(d => ({ id: d.id, ...d.data() } as User))
          .filter(item => belongsToTenant(item, activeTenantId));
        setHospitalUsers(usrs);
      },
      (error) => console.warn("Error fetching hospital_users:", error)
    );

    // 12. Consultations (Volume d'actes pour Quotes-parts)
    const unsubConsultations = onSnapshot(
      collection(db, 'consultations'),
      (snapshot) => {
        const cslts = snapshot.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(item => belongsToTenant(item, activeTenantId));
        setConsultations(cslts);
      },
      (error) => console.warn("Error fetching consultations:", error)
    );

    return () => {
      unsubSessions();
      unsubTransactions();
      unsubPaymentRequests();
      unsubPatients();
      unsubDettes();
      unsubAvoirs();
      unsubSuppliers();
      unsubInvoices();
      unsubPayments();
      unsubExpenses();
      unsubUsers();
      unsubConsultations();
    };
  }, [activeTenantId]);

  const tabLabels: Record<string, string> = {
    dashboard: 'Tableau de Bord',
    tresorerie: 'Trésorerie & Caisses',
    creances: 'Comptes Clients',
    depenses: 'Dépenses & Paiements'
  };

  const navItems = [
    { id: 'dashboard' as const, label: 'Tableau de Bord', icon: LayoutDashboard },
    { id: 'tresorerie' as const, label: 'Trésorerie & Caisses', icon: Landmark },
    { id: 'creances' as const, label: 'Comptes Clients', icon: Users },
    { id: 'depenses' as const, label: 'Dépenses & Paiements', icon: CreditCard },
  ];

  return (
    <div className={`h-screen flex flex-col overflow-hidden p-3 sm:p-5 font-sans ${theme === 'dark' ? 'bg-[#090d16] text-slate-100' : 'bg-[#F8FAFC] text-slate-900'}`}>
      
      {/* Top Header & Navigation Strip */}
      <MicroHeader
        icon={TrendingUp}
        breadcrumbs={[
          { label: 'Comptabilité', onClick: () => setActiveTab('dashboard') },
          { label: tabLabels[activeTab] || activeTab, active: true }
        ]}
        onHomeClick={onBackToDashboard}
        onBackClick={activeTab !== 'dashboard' ? () => setActiveTab('dashboard') : undefined}
        user={{ name: user?.name || 'Comptable' }}
        theme={theme}
        actions={
          <div className="flex items-center gap-1.5 overflow-x-auto">
            {navItems.map(item => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`px-3 py-1.5 rounded-xl font-semibold text-xs transition-all shrink-0 cursor-pointer flex items-center gap-1.5 ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-xs'
                      : theme === 'dark'
                      ? 'bg-slate-800/80 border border-slate-700/80 text-slate-300 hover:bg-slate-800'
                      : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100/80'
                  }`}
                >
                  <Icon size={14} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        }
      />

      {/* Main Content Area */}
      <main className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pt-4">
        
        {/* TAB 1: TABLEAU DE BORD */}
        {activeTab === 'dashboard' && (
          <AccountingDashboardTab
            sessions={cashierSessions}
            transactions={cashierTransactions}
            dettes={dettes}
            avoirs={avoirs}
            suppliers={suppliers}
            supplierInvoices={supplierInvoices}
            currency={currency}
            onNavigateTab={(tab) => setActiveTab(tab)}
            onOpenSessionSlip={(session) => setSelectedSessionForSlip(session)}
            onOpenSessionTransactions={(session) => setSelectedSessionForTransactions(session)}
          />
        )}

        {/* TAB 2: TRÉSORERIE & CAISSES (READ-ONLY AGGREGATION) */}
        {activeTab === 'tresorerie' && (
          <AccountingTresorerieTab
            sessions={cashierSessions}
            transactions={cashierTransactions}
            patients={patients}
            currency={currency}
            onOpenSessionSlip={(session) => setSelectedSessionForSlip(session)}
          />
        )}

        {/* TAB 3: COMPTES CLIENTS & CRÉDIT CONTROL */}
        {activeTab === 'creances' && (
          <AccountingComptesClientsTab
            patients={patients}
            dettes={dettes}
            avoirs={avoirs}
            paymentRequests={paymentRequests}
            currency={currency}
          />
        )}

        {/* TAB 4: DÉPENSES & PAIEMENTS (UNIVERSAL EXPENSES ENGINE) */}
        {activeTab === 'depenses' && (
          <AccountingDepensesTab
            expenses={expenses}
            suppliers={suppliers}
            supplierInvoices={supplierInvoices}
            users={hospitalUsers}
            consultations={consultations}
            paymentRequests={paymentRequests}
            currency={currency}
            user={user}
          />
        )}

      </main>

      {/* SHIFT CLOSING SLIP MODAL (Bordereau Officiel de Clôture de Caisse) */}
      {selectedSessionForSlip && (
        <ShiftClosingSlipModal
          session={selectedSessionForSlip}
          currency={currency}
          onClose={() => setSelectedSessionForSlip(null)}
        />
      )}

      {/* SESSION TRANSACTIONS DRILL-DOWN MODAL */}
      {selectedSessionForTransactions && (
        <SessionTransactionsModal
          session={selectedSessionForTransactions}
          transactions={cashierTransactions}
          patients={patients}
          currency={currency}
          onClose={() => setSelectedSessionForTransactions(null)}
          onOpenBordereau={() => {
            const s = selectedSessionForTransactions;
            setSelectedSessionForTransactions(null);
            setSelectedSessionForSlip(s);
          }}
        />
      )}

    </div>
  );
};

export default Accounting;
