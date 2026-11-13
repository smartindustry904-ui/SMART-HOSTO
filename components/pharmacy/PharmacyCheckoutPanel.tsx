import React, { useState, useMemo } from 'react';
import { 
  ShoppingCart, 
  X, 
  DollarSign, 
  Smartphone, 
  CreditCard, 
  User, 
  UserCheck, 
  Search, 
  Wallet, 
  AlertTriangle, 
  CheckCircle, 
  Loader2, 
  Sparkles,
  TrendingDown,
  Lock,
  RotateCcw
} from 'lucide-react';
import { Patient, AvoirPatient, DettePatient } from '../../types';
import { LambdaConversionModal } from '../common/LambdaConversionModal';

interface PharmacyCheckoutPanelProps {
  cart: any[];
  patients: Patient[];
  avoirs: AvoirPatient[];
  dettes: DettePatient[];
  linkedPatient: Patient | null;
  paymentMethod: 'CASH' | 'MOBILE_MONEY' | 'CARD' | 'TRANSFER' | 'CHECK' | 'AVOIR';
  directAmountReceived: string;
  isProcessing: boolean;
  currency?: string;
  user?: any;
  establishment?: any;
  onRemoveFromCart: (id: string) => void;
  onSelectPatient: (patient: Patient | null) => void;
  onSetPaymentMethod: (method: any) => void;
  onSetAmountReceived: (val: string) => void;
  onSubmitPayment: (options: {
    useAvoir: boolean;
    sendToDebt: boolean;
    convertChangeToAvance?: boolean;
    avoirAmount: number;
    debtAmount: number;
    cashRemis: number;
    changeToAvanceAmount?: number;
    prescriberName?: string;
    prescriberLicense?: string;
  }) => void;
}

export const PharmacyCheckoutPanel: React.FC<PharmacyCheckoutPanelProps> = ({
  cart,
  patients,
  avoirs,
  dettes,
  linkedPatient,
  paymentMethod,
  directAmountReceived,
  isProcessing,
  currency = 'FCFA',
  user,
  establishment,
  onRemoveFromCart,
  onSelectPatient,
  onSetPaymentMethod,
  onSetAmountReceived,
  onSubmitPayment
}) => {
  const [patientSearch, setPatientSearch] = useState('');
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [useAvoir, setUseAvoir] = useState(false);
  const [sendToDebt, setSendToDebt] = useState(false);
  const [convertChangeToAvance, setConvertChangeToAvance] = useState(false);
  const [prescriberName, setPrescriberName] = useState('');
  const [prescriberLicense, setPrescriberLicense] = useState('');
  const [showLambdaModal, setShowLambdaModal] = useState(false);

  // Filter patients for linking
  const matchingPatients = useMemo(() => {
    if (!patientSearch.trim()) return [];
    const q = patientSearch.toLowerCase();
    return patients.filter(p => 
      `${p.firstName || ''} ${p.lastName || ''}`.toLowerCase().includes(q) ||
      (p.id && p.id.toLowerCase().includes(q)) ||
      (p.phone && p.phone.includes(q))
    ).slice(0, 5);
  }, [patientSearch, patients]);

  // Compute live wallet for linked patient
  const patientAvoirs = useMemo(() => {
    if (!linkedPatient) return [];
    const pId = linkedPatient.id;
    return avoirs.filter(a => a.patientId === pId && a.status === 'AVAILABLE');
  }, [linkedPatient, avoirs]);

  const totalAvoirDispo = useMemo(() => {
    return patientAvoirs.reduce((sum, a) => sum + (a.montant || 0), 0);
  }, [patientAvoirs]);

  const patientDettes = useMemo(() => {
    if (!linkedPatient) return [];
    const pId = linkedPatient.id;
    return dettes.filter(d => d.patientId === pId && d.status !== 'PAID');
  }, [linkedPatient, dettes]);

  const totalDetteEnCours = useMemo(() => {
    return patientDettes.reduce((sum, d) => sum + (d.montantRestant || 0), 0);
  }, [patientDettes]);

  // Calculations
  const grossTotal = cart.reduce((sum, item) => sum + ((item.price || 0) * (item.quantity || 1)), 0);
  const appliedAvoir = (linkedPatient && useAvoir) ? Math.min(totalAvoirDispo, grossTotal) : 0;
  const netToPay = Math.max(0, grossTotal - appliedAvoir);

  const receivedNum = parseFloat(directAmountReceived) || 0;

  // Excess & Shortage calculations
  const rawChange = receivedNum > netToPay ? receivedNum - netToPay : 0;
  const rawShortage = receivedNum < netToPay ? netToPay - receivedNum : 0;

  const hasPrescriptionItem = useMemo(() => {
    return cart.some(item => Boolean(item.requiresPrescription || item.soumisOrdonnance));
  }, [cart]);

  const isPrescriberValid = !hasPrescriptionItem || prescriberName.trim() !== '' || prescriberLicense.trim() !== '';

  const isLambdaPatient = useMemo(() => {
    if (!linkedPatient) return true;
    return Boolean(
      linkedPatient.isLambda === true ||
      (linkedPatient as any).isAnonymous === true ||
      (linkedPatient as any).patientStatus === 'LAMBDA' ||
      (linkedPatient.lastName || '').toUpperCase() === 'LAMBDA'
    );
  }, [linkedPatient]);

  const changeConvertedToAvance = (convertChangeToAvance && linkedPatient && !isLambdaPatient) ? rawChange : 0;
  const cashChangeToReturn = convertChangeToAvance && !isLambdaPatient ? 0 : rawChange;

  const createdDebt = (linkedPatient && !isLambdaPatient && sendToDebt) 
    ? (paymentMethod === 'CASH' ? rawShortage : 0)
    : 0;

  const isCreditBlocked = linkedPatient ? (linkedPatient.creditBlocked === true || linkedPatient.allowCredit === false) : false;

  const isPaymentValid = useMemo(() => {
    if (cart.length === 0) return false;
    if (!isPrescriberValid) return false;
    if (netToPay === 0) return true; // Fully covered by Avoir!
    if (!linkedPatient || isLambdaPatient) {
      // Anonymous Walk-in or Lambda: STRICT FULL PAYMENT REQUIRED
      if (paymentMethod === 'CASH') return receivedNum >= netToPay;
      return true;
    }
    // Linked Patient: Credit Lock strictly enforced
    if (isCreditBlocked) {
      if (paymentMethod === 'CASH') return receivedNum >= netToPay;
      return true;
    }
    if (sendToDebt) return true;
    if (paymentMethod === 'CASH') return receivedNum >= netToPay;
    return true; // Mobile/Card
  }, [cart.length, isPrescriberValid, netToPay, linkedPatient, isLambdaPatient, isCreditBlocked, sendToDebt, paymentMethod, receivedNum]);

  const handleLinkPatient = (patient: Patient) => {
    onSelectPatient(patient);
    setPatientSearch('');
    setShowSearchDropdown(false);
    const isLamb = Boolean(
      patient.isLambda === true ||
      (patient as any).isAnonymous === true ||
      (patient as any).patientStatus === 'LAMBDA' ||
      (patient.lastName || '').toUpperCase() === 'LAMBDA'
    );
    if (isLamb) {
      setSendToDebt(false);
      setConvertChangeToAvance(false);
    }
  };

  const handleUnlinkPatient = () => {
    onSelectPatient(null);
    setUseAvoir(false);
    setSendToDebt(false);
    setConvertChangeToAvance(false);
  };

  const handlePayClick = () => {
    onSubmitPayment({
      useAvoir: linkedPatient && !isLambdaPatient ? useAvoir : false,
      sendToDebt: linkedPatient && !isLambdaPatient ? sendToDebt : false,
      convertChangeToAvance: linkedPatient && !isLambdaPatient && convertChangeToAvance && rawChange > 0,
      avoirAmount: appliedAvoir,
      debtAmount: createdDebt,
      cashRemis: receivedNum || (netToPay - createdDebt),
      changeToAvanceAmount: changeConvertedToAvance,
      prescriberName: prescriberName.trim() || undefined,
      prescriberLicense: prescriberLicense.trim() || undefined
    });
    if (hasPrescriptionItem) {
      setPrescriberName('');
      setPrescriberLicense('');
    }
  };

  const quickPresets = [
    { label: 'Exact', value: netToPay },
    { label: '5 000 F', value: 5000 },
    { label: '10 000 F', value: 10000 },
    { label: '20 000 F', value: 20000 },
    { label: '50 000 F', value: 50000 }
  ].filter(p => p.value >= netToPay || p.label === 'Exact');

  return (
    <div className="bg-slate-900 rounded-[32px] p-6 text-white shadow-xl flex flex-col justify-between min-h-[620px] relative overflow-hidden border border-slate-800">
      <div className="absolute top-0 right-0 w-44 h-44 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-36 h-36 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />

      <div className="relative z-10 space-y-4">
        {/* HEADER */}
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <h3 className="font-black text-xs uppercase tracking-widest flex items-center gap-2 text-white">
            <ShoppingCart size={17} className="text-blue-400" />
            Panier Vente Officine
          </h3>
          <span className="text-[10px] font-black bg-white/10 px-2.5 py-0.5 rounded-full text-slate-300 font-mono">
            {cart.length} article(s)
          </span>
        </div>

        {/* 1. PATIENT LINKING BAR */}
        <div className="bg-white/5 p-3.5 rounded-2xl border border-white/10 space-y-2.5">
          <div className="flex items-center justify-between">
            <label className="text-[10px] font-black uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
              <User size={13} className="text-blue-400" />
              Bénéficiaire / Patient
            </label>
            {linkedPatient && (
              <button
                type="button"
                onClick={handleUnlinkPatient}
                className="text-[10px] font-bold text-rose-400 hover:text-rose-300 hover:underline cursor-pointer"
              >
                Délier (Client Comptant)
              </button>
            )}
          </div>

          {!linkedPatient ? (
            /* ANONYMOUS CLIENT SEARCH INPUT */
            <div className="relative">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                <input
                  type="text"
                  placeholder="Lier un patient (Nom, DME, Tél)..."
                  value={patientSearch}
                  onChange={e => {
                    setPatientSearch(e.target.value);
                    setShowSearchDropdown(true);
                  }}
                  onFocus={() => setShowSearchDropdown(true)}
                  className="w-full pl-9 pr-3 py-2 bg-white/10 border border-white/10 rounded-xl text-xs font-bold text-white placeholder:text-slate-500 outline-none focus:border-blue-400"
                />
              </div>

              {/* SEARCH DROPDOWN */}
              {showSearchDropdown && matchingPatients.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-1.5 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl z-30 overflow-hidden divide-y divide-slate-700/60 max-h-48 overflow-y-auto">
                  {matchingPatients.map(p => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handleLinkPatient(p)}
                      className="w-full p-2.5 text-left hover:bg-slate-700/80 transition-colors flex items-center justify-between cursor-pointer"
                    >
                      <div>
                        <p className="font-bold text-xs text-white">{p.firstName} {p.lastName}</p>
                        <p className="text-[10px] text-slate-400 font-mono">DME: {p.id} {p.phone ? `• Tél: ${p.phone}` : ''}</p>
                      </div>
                      <span className="text-[9px] font-bold bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded">
                        Lier
                      </span>
                    </button>
                  ))}
                </div>
              )}

              <p className="text-[9px] text-slate-400 italic mt-1.5 flex items-center gap-1">
                <Lock size={11} className="text-slate-500 shrink-0" />
                Comptant par défaut. Liez un patient pour débloquer Avance & Dette.
              </p>
            </div>
          ) : (
            /* LINKED PATIENT CARD WITH CENTRAL WALLET */
            <div className="space-y-2">
              <div className="flex items-center justify-between bg-white/10 p-2.5 rounded-xl">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-xs shrink-0">
                    <UserCheck size={16} />
                  </div>
                  <div className="min-w-0">
                    <p className="font-black text-xs text-white truncate">
                      {linkedPatient.firstName} {linkedPatient.lastName}
                    </p>
                    <p className="text-[9px] text-slate-400 font-mono">
                      DME: {linkedPatient.id} {linkedPatient.phone ? `• ${linkedPatient.phone}` : ''}
                    </p>
                  </div>
                </div>
                <span className="text-[9px] font-black bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full shrink-0">
                  Dossier Lié
                </span>
              </div>

              {/* CENTRAL WALLET HIGHLIGHTS */}
              <div className="grid grid-cols-2 gap-2 text-[10px]">
                <div className="bg-emerald-950/40 border border-emerald-500/30 p-2 rounded-xl">
                  <span className="text-[9px] font-bold text-emerald-400 block uppercase tracking-wider">Solde Avance</span>
                  <span className="font-black text-xs text-emerald-300 font-mono">
                    {totalAvoirDispo.toLocaleString()} F
                  </span>
                </div>
                <div className="bg-rose-950/40 border border-rose-500/30 p-2 rounded-xl">
                  <span className="text-[9px] font-bold text-rose-400 block uppercase tracking-wider">Dette Active</span>
                  <span className="font-black text-xs text-rose-300 font-mono">
                    {totalDetteEnCours.toLocaleString()} F
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 2. CART ITEMS LIST */}
        <div className="space-y-2 max-h-40 overflow-y-auto pr-1 custom-scrollbar">
          {cart.map((item, idx) => (
            <div key={idx} className="p-2.5 bg-white/5 hover:bg-white/10 rounded-xl flex justify-between items-center gap-2 transition-colors border border-white/5">
              <div className="flex-1 min-w-0">
                <p className="font-extrabold text-xs text-white truncate">{item.name}</p>
                <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                  {item.quantity} x {item.price} F = <span className="text-emerald-400 font-bold font-mono">{item.price * item.quantity} F</span>
                </p>
              </div>
              <button 
                onClick={() => onRemoveFromCart(item.id)}
                className="text-slate-400 hover:text-rose-400 p-1.5 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
                title="Retirer du panier"
              >
                <X size={14} />
              </button>
            </div>
          ))}

          {cart.length === 0 && (
            <div className="py-6 text-center text-slate-400 flex flex-col items-center justify-center">
              <div className="w-10 h-10 rounded-full bg-white/5 text-slate-500 flex items-center justify-center mb-1.5">
                <ShoppingCart size={18} />
              </div>
              <p className="text-xs font-semibold italic">Panier vide</p>
            </div>
          )}
        </div>
      </div>

      {/* 3. PAYMENT & RECONCILIATION */}
      <div className="relative z-10 pt-4 border-t border-white/10 space-y-3">
        
        {/* 1. CONSUMING EXISTING CREDIT (UTILISER L'AVANCE) */}
        {linkedPatient && totalAvoirDispo > 0 && (
          <div className="bg-emerald-950/40 p-2.5 rounded-xl border border-emerald-500/30">
            <label className="flex items-center justify-between gap-2 cursor-pointer select-none">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={useAvoir}
                  onChange={e => setUseAvoir(e.target.checked)}
                  className="w-4 h-4 rounded text-emerald-500 focus:ring-emerald-400 cursor-pointer"
                />
                <span className="font-bold text-emerald-200 text-xs">
                  Utiliser l'Avance ({totalAvoirDispo.toLocaleString()} F)
                </span>
              </div>
              {useAvoir && (
                <span className="text-xs font-black text-emerald-400 font-mono">
                  -{appliedAvoir.toLocaleString()} F
                </span>
              )}
            </label>
          </div>
        )}

        {/* PAYMENT METHOD BUTTONS */}
        {netToPay > 0 && (
          <div>
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider block mb-1.5">Mode de Règlement</label>
            <div className="grid grid-cols-3 gap-1.5">
              {[
                { id: 'CASH', label: 'Espèces', icon: DollarSign },
                { id: 'MOBILE_MONEY', label: 'Mobile', icon: Smartphone },
                { id: 'CARD', label: 'Carte', icon: CreditCard }
              ].map(mode => (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => onSetPaymentMethod(mode.id as any)}
                  className={`py-2 px-1 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1 border cursor-pointer transition-colors ${
                    paymentMethod === mode.id 
                      ? 'bg-blue-600 text-white border-blue-500 shadow-sm' 
                      : 'bg-white/5 text-slate-300 border-white/10 hover:bg-white/10'
                  }`}
                >
                  <mode.icon size={12} /> {mode.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* TOTAL BREAKDOWN */}
        <div className="space-y-1 bg-white/5 p-3 rounded-2xl border border-white/10">
          <div className="flex justify-between items-center text-xs text-slate-400 font-bold">
            <span>Total Panier</span>
            <span className="font-mono text-slate-300">{grossTotal.toLocaleString()} F</span>
          </div>
          {appliedAvoir > 0 && (
            <div className="flex justify-between items-center text-xs text-emerald-400 font-bold">
              <span>Avance Déduite</span>
              <span className="font-mono">-{appliedAvoir.toLocaleString()} F</span>
            </div>
          )}
          <div className="flex justify-between items-center pt-1.5 border-t border-white/10">
            <span className="text-xs font-black text-white uppercase">Net à Encaisser</span>
            <span className="text-xl font-black text-emerald-400 font-mono">
              {netToPay.toLocaleString()} <span className="text-xs font-bold text-slate-400">F</span>
            </span>
          </div>
        </div>

        {/* CASH REMIS CALCULATOR (IF CASH PAYMENT) */}
        {cart.length > 0 && netToPay > 0 && paymentMethod === 'CASH' && (
          <div className="space-y-2.5 bg-white/5 p-3.5 rounded-2xl border border-white/10">
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-[10px] font-black text-slate-300 uppercase tracking-wider">
                  Montant Remis (Espèces)
                </label>
                <span className="text-[10px] font-mono text-slate-400">Net: {netToPay.toLocaleString()} F</span>
              </div>
              <input 
                type="number"
                placeholder={netToPay.toString()}
                value={directAmountReceived}
                onChange={e => onSetAmountReceived(e.target.value)}
                className="w-full px-3 py-2 bg-white/10 border border-white/10 rounded-xl text-xs font-black outline-none text-white focus:border-emerald-500 font-mono"
              />

              {/* Quick Presets */}
              <div className="flex flex-wrap gap-1 mt-1.5">
                {quickPresets.map((preset, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => onSetAmountReceived(preset.value.toString())}
                    className="px-2 py-0.5 bg-white/10 hover:bg-white/20 text-slate-200 rounded text-[9px] font-mono font-bold transition-colors cursor-pointer"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            {/* EXCESS CASH: CHANGE vs CONVERT TO ADVANCE */}
            {receivedNum > netToPay && (
              <div className="space-y-2 pt-2 border-t border-white/10">
                <div className="p-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex justify-between items-center text-xs">
                  <span className="text-[10px] uppercase tracking-wider font-extrabold text-emerald-300">
                    Monnaie à rendre :
                  </span>
                  <span className="font-mono font-black text-emerald-200 text-sm">
                    {rawChange.toLocaleString()} F
                  </span>
                </div>

                {/* CONVERT TO AVANCE BUTTON (DISABLED IF LAMBDA/ANONYMOUS) */}
                {linkedPatient && !isLambdaPatient ? (
                  <button
                    type="button"
                    onClick={() => setConvertChangeToAvance(!convertChangeToAvance)}
                    className={`w-full p-2 rounded-xl border text-left flex items-center justify-between gap-2 transition-all cursor-pointer ${
                      convertChangeToAvance
                        ? 'bg-emerald-600 text-white border-emerald-500'
                        : 'bg-white/5 text-slate-300 border-white/10 hover:bg-white/10'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <Sparkles size={13} className={convertChangeToAvance ? 'text-amber-300' : 'text-emerald-400'} />
                      <span className="text-[10px] font-bold">
                        {convertChangeToAvance ? "Monnaie créditée en Avance !" : "Convertir la monnaie en Avance"}
                      </span>
                    </div>
                    <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded ${convertChangeToAvance ? 'bg-emerald-700 text-white' : 'bg-emerald-950 text-emerald-300 border border-emerald-500/30'}`}>
                      +{rawChange.toLocaleString()} F
                    </span>
                  </button>
                ) : (
                  <div className="w-full p-2 rounded-xl border border-white/10 bg-white/5 opacity-60 flex items-center justify-between gap-2 cursor-not-allowed">
                    <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1.5">
                      <Lock size={12} className="text-amber-400" /> Avance désactivée (Patient Lambda)
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* SHORTAGE: REMAINING BALANCE vs TRANSFER TO DEBT */}
            {directAmountReceived !== '' && receivedNum < netToPay && (
              <div className="space-y-2 pt-2 border-t border-white/10">
                <div className="p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/30 flex justify-between items-center text-xs">
                  <span className="text-[10px] uppercase tracking-wider font-extrabold text-rose-300">
                    Reste à Payer :
                  </span>
                  <span className="font-mono font-black text-rose-200 text-sm">
                    {rawShortage.toLocaleString()} F
                  </span>
                </div>

                {/* TRANSFER SHORTAGE TO DEBT */}
                {linkedPatient && !isLambdaPatient ? (
                  isCreditBlocked ? (
                    <div className="p-2.5 bg-rose-950/80 border border-rose-500/50 rounded-xl flex items-center gap-2 text-rose-200 text-[10px] font-bold">
                      <Lock size={14} className="text-rose-400 shrink-0" />
                      <span>🔒 Crédit Bloqué (Comptabilité) : Ce patient a un verrou actif sur les dettes. Paiement comptant intégral exigé.</span>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setSendToDebt(!sendToDebt)}
                      className={`w-full p-2 rounded-xl border text-left flex items-center justify-between gap-2 transition-all cursor-pointer ${
                        sendToDebt
                          ? 'bg-rose-600 text-white border-rose-500'
                          : 'bg-white/5 text-slate-300 border-white/10 hover:bg-white/10'
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <TrendingDown size={13} className={sendToDebt ? 'text-amber-300' : 'text-rose-400'} />
                        <span className="text-[10px] font-bold">
                          {sendToDebt ? "Solde transféré en Dette !" : "Transférer le reste en Dette"}
                        </span>
                      </div>
                      <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded ${sendToDebt ? 'bg-rose-700 text-white' : 'bg-rose-950 text-rose-300 border border-rose-500/30'}`}>
                        +{rawShortage.toLocaleString()} F
                      </span>
                    </button>
                  )
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowLambdaModal(true)}
                    className="w-full p-2.5 bg-rose-950/60 hover:bg-rose-950/90 border border-rose-500/40 rounded-xl text-left flex items-center justify-between gap-2 transition-colors cursor-pointer"
                    title="Cliquez pour convertir en Patient Enregistré"
                  >
                    <div className="flex items-center gap-1.5 text-[10px] text-rose-200 font-bold">
                      <Lock size={13} className="text-rose-400 shrink-0" />
                      <span>Mettre en Dette (Verrouillé — Patient Lambda)</span>
                    </div>
                    <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      Convertir
                    </span>
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* POS GUARD: SOUMIS À ORDONNANCE */}
        {hasPrescriptionItem && (
          <div className="p-3.5 bg-rose-950/60 border border-rose-500/50 rounded-2xl space-y-2.5 animate-in fade-in">
            <div className="flex items-center gap-2 text-rose-300">
              <AlertTriangle size={15} className="shrink-0 text-rose-400" />
              <span className="text-[10px] font-black uppercase tracking-wider">
                Produit(s) Soumis à Ordonnance — Prescripteur Requis
              </span>
            </div>
            <div className="grid grid-cols-1 gap-2">
              <input
                type="text"
                placeholder="Nom du Prescripteur (ex: Dr. Mbarga)..."
                value={prescriberName}
                onChange={(e) => setPrescriberName(e.target.value)}
                className="w-full px-3 py-2 bg-white/10 border border-white/15 rounded-xl text-xs font-bold text-white placeholder:text-slate-400 focus:outline-none focus:border-rose-400"
              />
              <input
                type="text"
                placeholder="OU Numéro d'Ordre (ex: ONMC-4521)..."
                value={prescriberLicense}
                onChange={(e) => setPrescriberLicense(e.target.value)}
                className="w-full px-3 py-2 bg-white/10 border border-white/15 rounded-xl text-xs font-bold font-mono text-white placeholder:text-slate-400 focus:outline-none focus:border-rose-400"
              />
            </div>
            {!isPrescriberValid && (
              <p className="text-[10px] font-bold text-amber-300">
                ⚠️ Saisissez le Nom du Prescripteur ou le Numéro d'Ordre pour débloquer l'encaissement.
              </p>
            )}
          </div>
        )}

        {/* SUBMIT BUTTON */}
        <button 
          onClick={handlePayClick}
          disabled={!isPaymentValid || isProcessing}
          className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-3.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all shadow-lg shadow-emerald-600/10 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed active:scale-98"
        >
          {isProcessing ? (
            <><Loader2 size={15} className="animate-spin" /> Traitement Caisse...</>
          ) : !isPrescriberValid ? (
            <><Lock size={15} /> Ordonnance / Prescripteur Requis</>
          ) : (
            <><CheckCircle size={15} /> Payer & Délivrer Médicaments</>
          )}
        </button>
      </div>

      <LambdaConversionModal
        isOpen={showLambdaModal}
        onClose={() => setShowLambdaModal(false)}
        patient={linkedPatient}
        patientId={linkedPatient?.id}
        patientName={linkedPatient ? `${linkedPatient.firstName} ${linkedPatient.lastName}` : 'Client Comptant (Lambda)'}
        user={user}
        establishment={establishment}
        onConverted={(updatedPatient) => {
          onSelectPatient(updatedPatient);
          setSendToDebt(true);
        }}
      />
    </div>
  );
};
