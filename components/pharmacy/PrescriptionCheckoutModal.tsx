import React, { useState, useMemo } from 'react';
import { 
  X, 
  FileSpreadsheet, 
  Pill, 
  DollarSign, 
  Smartphone, 
  CreditCard, 
  Wallet, 
  AlertTriangle, 
  CheckCircle, 
  Loader2, 
  UserCheck,
  ArrowRight,
  Sparkles,
  TrendingDown,
  TrendingUp,
  ShieldCheck,
  RotateCcw,
  Lock
} from 'lucide-react';
import { Patient, AvoirPatient, DettePatient } from '../../types';
import { LambdaConversionModal } from '../common/LambdaConversionModal';

interface PrescriptionCheckoutModalProps {
  prescription: any;
  patients: Patient[];
  avoirs: AvoirPatient[];
  dettes: DettePatient[];
  paymentMethod?: 'CASH' | 'MOBILE_MONEY' | 'CARD' | 'TRANSFER' | 'CHECK';
  amountReceived?: string;
  isProcessing: boolean;
  currency?: string;
  onClose: () => void;
  onSetPaymentMethod?: (method: any) => void;
  onSetAmountReceived?: (val: string) => void;
  onSubmitPayment?: (options: {
    useAvoir: boolean;
    sendToDebt: boolean;
    convertChangeToAvance?: boolean;
    avoirAmount: number;
    debtAmount: number;
    cashRemis: number;
    changeToAvanceAmount?: number;
  }) => void;
  onConfirmPayment?: (options: {
    useAvoir: boolean;
    sendToDebt: boolean;
    convertChangeToAvance?: boolean;
    avoirAmount: number;
    debtAmount: number;
    cashRemis: number;
    changeToAvanceAmount?: number;
  }) => void;
}

export const PrescriptionCheckoutModal: React.FC<PrescriptionCheckoutModalProps> = ({
  prescription,
  patients,
  avoirs,
  dettes,
  paymentMethod: initialPaymentMethod = 'CASH',
  amountReceived: initialAmountReceived = '',
  isProcessing,
  currency = 'FCFA',
  onClose,
  onSetPaymentMethod,
  onSetAmountReceived,
  onSubmitPayment,
  onConfirmPayment
}) => {
  const [selectedMethod, setSelectedMethod] = useState<'CASH' | 'MOBILE_MONEY' | 'CARD' | 'TRANSFER' | 'CHECK'>(initialPaymentMethod || 'CASH');
  const [cashInput, setCashInput] = useState<string>(initialAmountReceived || '');
  const [useAvoir, setUseAvoir] = useState(false);
  const [sendToDebt, setSendToDebt] = useState(false);
  const [convertChangeToAvance, setConvertChangeToAvance] = useState(false);
  const [convertedPatientOverride, setConvertedPatientOverride] = useState<Patient | null>(null);
  const [showLambdaModal, setShowLambdaModal] = useState(false);

  // Match patient in central directory
  const matchedPatient = useMemo(() => {
    if (convertedPatientOverride) return convertedPatientOverride;
    if (!prescription) return null;
    return patients.find(p => 
      p.id === prescription.patientId || 
      `${p.firstName || ''} ${p.lastName || ''}`.trim().toLowerCase() === (prescription.patient || '').trim().toLowerCase()
    ) || (prescription.patientId && prescription.patientId !== 'PATIENT-COMPTANT' ? {
      id: prescription.patientId,
      firstName: prescription.patient || 'Patient',
      lastName: '',
      phone: '',
      birthDate: '',
      gender: 'M' as const,
      residence: '',
      emergencyContact: '',
      emergencyPhone: '',
      maritalStatus: 'CELIBATAIRE' as const
    } : null);
  }, [prescription, patients, convertedPatientOverride]);

  const isAnonymous = Boolean(
    !matchedPatient ||
    matchedPatient.id === 'PATIENT-COMPTANT' ||
    matchedPatient.isLambda === true ||
    (matchedPatient as any).isAnonymous === true ||
    (matchedPatient as any).patientStatus === 'LAMBDA' ||
    (matchedPatient.lastName || '').toUpperCase() === 'LAMBDA' ||
    (prescription?.patient || '').toUpperCase().includes('LAMBDA')
  );

  // Compute live wallet
  const patientAvoirs = useMemo(() => {
    if (!matchedPatient || isAnonymous) return [];
    return avoirs.filter(a => a.patientId === matchedPatient.id && a.status === 'AVAILABLE');
  }, [matchedPatient, avoirs, isAnonymous]);

  const totalAvoirDispo = useMemo(() => {
    return patientAvoirs.reduce((sum, a) => sum + (a.montant || 0), 0);
  }, [patientAvoirs]);

  const patientDettes = useMemo(() => {
    if (!matchedPatient || isAnonymous) return [];
    return dettes.filter(d => d.patientId === matchedPatient.id && d.status !== 'PAID');
  }, [matchedPatient, dettes, isAnonymous]);

  const totalDetteEnCours = useMemo(() => {
    return patientDettes.reduce((sum, d) => sum + (d.montantRestant || 0), 0);
  }, [patientDettes]);

  // Pricing calculations
  const grossTotal = prescription?.items?.reduce((sum: number, item: any) => sum + (item.price || item.unitPrice || 1500), 0) || 0;
  const appliedAvoir = (useAvoir && !isAnonymous) ? Math.min(totalAvoirDispo, grossTotal) : 0;
  const netToPay = Math.max(0, grossTotal - appliedAvoir);

  const receivedNum = parseFloat(cashInput) || 0;

  // Change and Debt calculations
  const rawChange = receivedNum > netToPay ? receivedNum - netToPay : 0;
  const rawShortage = receivedNum < netToPay ? netToPay - receivedNum : 0;

  const cashChangeToReturn = convertChangeToAvance ? 0 : rawChange;
  const changeConvertedToAvance = (convertChangeToAvance && !isAnonymous) ? rawChange : 0;

  const createdDebt = (sendToDebt && !isAnonymous)
    ? (selectedMethod === 'CASH' ? rawShortage : 0)
    : 0;

  const isCreditBlocked = matchedPatient ? (matchedPatient.creditBlocked === true || matchedPatient.allowCredit === false) : false;

  const isAmountSufficient = useMemo(() => {
    if (netToPay === 0) return true;
    if (isAnonymous) {
      if (selectedMethod === 'CASH') return receivedNum >= netToPay;
      return true;
    }
    // If credit is locked, patient cannot take on debt
    if (isCreditBlocked) {
      if (selectedMethod === 'CASH') return receivedNum >= netToPay;
      return true;
    }
    if (sendToDebt) return true;
    if (selectedMethod === 'CASH') return receivedNum >= netToPay;
    return true;
  }, [netToPay, isAnonymous, isCreditBlocked, sendToDebt, selectedMethod, receivedNum]);

  const handlePayClick = () => {
    const submitFn = onSubmitPayment || onConfirmPayment;
    if (!submitFn) return;

    submitFn({
      useAvoir: !isAnonymous && useAvoir,
      sendToDebt: !isAnonymous && sendToDebt,
      convertChangeToAvance: !isAnonymous && convertChangeToAvance && rawChange > 0,
      avoirAmount: appliedAvoir,
      debtAmount: createdDebt,
      cashRemis: receivedNum || (netToPay - createdDebt),
      changeToAvanceAmount: changeConvertedToAvance
    });
  };

  const handleMethodChange = (method: any) => {
    setSelectedMethod(method);
    if (onSetPaymentMethod) onSetPaymentMethod(method);
  };

  const handleCashChange = (val: string) => {
    setCashInput(val);
    if (onSetAmountReceived) onSetAmountReceived(val);
  };

  const quickPresets = [
    { label: 'Exact', value: netToPay },
    { label: '5 000 F', value: 5000 },
    { label: '10 000 F', value: 10000 },
    { label: '20 000 F', value: 20000 },
    { label: '50 000 F', value: 50000 }
  ].filter(p => p.value >= netToPay || p.label === 'Exact');

  return (
    <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-[32px] border border-slate-200 w-full max-w-4xl max-h-[92vh] overflow-hidden flex flex-col shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        
        {/* MODAL HEADER */}
        <div className="p-5 sm:p-6 border-b border-slate-150 bg-slate-50 flex justify-between items-start">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center shadow-xs shrink-0">
              <FileSpreadsheet size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 font-mono">
                  Caisse Pharmacie • Ordonnance #{prescription.id}
                </span>
                {!isAnonymous ? (
                  <span className="text-[9px] font-extrabold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1">
                    <UserCheck size={11} /> Dossier Lié ({matchedPatient?.id})
                  </span>
                ) : (
                  <span className="text-[9px] font-extrabold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full border border-amber-200">
                    Client Comptant
                  </span>
                )}
              </div>
              <h2 className="text-xl font-black text-slate-900 mt-0.5">{prescription.patient}</h2>
              <p className="text-xs font-semibold text-slate-500 mt-0.5">
                Prescrit par : <strong className="text-slate-700">{prescription.doctor}</strong> • Date : <strong className="text-slate-700">{new Date(prescription.date || Date.now()).toLocaleDateString('fr-FR')}</strong>
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-slate-200/70 rounded-xl transition-colors cursor-pointer text-slate-400 hover:text-slate-700"
          >
            <X size={20} />
          </button>
        </div>

        {/* MODAL BODY */}
        <div className="p-5 sm:p-6 overflow-y-auto flex-1 grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-50/40">
          
          {/* LEFT COLUMN: PRESCRIPTION PREVIEW & WALLET */}
          <div className="space-y-4">
            <h3 className="font-black text-xs text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
              <Pill size={15} className="text-blue-500" /> Traitement Prescrit ({prescription.items?.length || 0})
            </h3>
            
            <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1 custom-scrollbar">
              {prescription.items?.map((item: any, idx: number) => (
                <div key={idx} className="p-3 bg-white border border-slate-200/80 rounded-xl flex justify-between items-center text-xs shadow-2xs">
                  <div>
                    <span className="font-extrabold text-slate-800 block">{item.name}</span>
                    <span className="text-[10px] text-slate-400 font-semibold">{item.dosage || item.instructions || 'Posologie selon ordonnance'}</span>
                  </div>
                  <span className="font-black text-slate-900 font-mono shrink-0 ml-2">{(item.price || item.unitPrice || 1500).toLocaleString()} F</span>
                </div>
              ))}
            </div>

            {/* PATIENT FINANCIAL WALLET DISPLAY */}
            {!isAnonymous ? (
              <div className="bg-white p-4 rounded-2xl border border-slate-200 space-y-2.5 shadow-2xs">
                <h4 className="font-black text-[10px] uppercase tracking-wider text-slate-500 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Wallet size={14} className="text-blue-600" /> Portefeuille Central Patient
                  </span>
                  <span className="font-mono text-[9px] text-slate-400">DME: {matchedPatient?.id}</span>
                </h4>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-emerald-50/80 border border-emerald-200 p-2.5 rounded-xl">
                    <span className="text-[9px] font-extrabold text-emerald-700 block uppercase">Solde Avance (Avoir)</span>
                    <span className="font-black text-base text-emerald-800 font-mono">
                      {totalAvoirDispo.toLocaleString()} FCFA
                    </span>
                  </div>
                  <div className="bg-rose-50/80 border border-rose-200 p-2.5 rounded-xl">
                    <span className="text-[9px] font-extrabold text-rose-700 block uppercase">Dette Active</span>
                    <span className="font-black text-base text-rose-800 font-mono">
                      {totalDetteEnCours.toLocaleString()} FCFA
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-amber-50/80 border border-amber-200 p-3.5 rounded-2xl text-xs text-amber-900 flex items-start gap-2">
                <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">Client Sans Compte Patient Central</p>
                  <p className="text-[11px] text-amber-700 mt-0.5 leading-relaxed">
                    Les options de dette et de conversion d'avance sont désactivées. Le montant doit être réglé en totalité.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* RIGHT COLUMN: PAYMENT & RECONCILIATION */}
          <div className="space-y-4 bg-white p-5 rounded-2xl border border-slate-200 flex flex-col justify-between shadow-sm">
            <div className="space-y-4">
              
              {/* TOTAL DISPLAY */}
              <div className="bg-slate-900 text-white rounded-2xl p-4 shadow-md text-center">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">MONTANT TOTAL À RÉGLER</span>
                <p className="text-2xl sm:text-3xl font-black text-emerald-400 font-mono mt-1">
                  {grossTotal.toLocaleString()} <span className="text-sm font-bold text-slate-400">FCFA</span>
                </p>
              </div>

              {/* 1. CONSUME EXISTING CREDIT (UTILISER L'AVANCE) */}
              {!isAnonymous && totalAvoirDispo > 0 && (
                <div className="p-3 bg-emerald-50/90 rounded-xl border border-emerald-200">
                  <label className="flex items-center justify-between gap-2 cursor-pointer select-none">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={useAvoir}
                        onChange={e => setUseAvoir(e.target.checked)}
                        className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                      />
                      <span className="font-extrabold text-emerald-950 text-xs">
                        Utiliser l'Avance disponible ({totalAvoirDispo.toLocaleString()} FCFA)
                      </span>
                    </div>
                    {useAvoir && (
                      <span className="text-xs font-black text-emerald-700 font-mono">
                        -{appliedAvoir.toLocaleString()} F
                      </span>
                    )}
                  </label>
                </div>
              )}

              {/* NET BREAKDOWN IF CREDIT APPLIED */}
              {appliedAvoir > 0 && (
                <div className="flex justify-between items-center px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 text-xs font-bold">
                  <span className="text-slate-600 uppercase text-[10px] tracking-wider">Reste Net après Avance :</span>
                  <span className="text-slate-900 font-mono font-black text-sm">{netToPay.toLocaleString()} FCFA</span>
                </div>
              )}

              {/* PAYMENT METHOD SELECTION */}
              {netToPay > 0 && (
                <div>
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">Mode de Règlement</label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {[
                      { id: 'CASH', label: 'Espèces', icon: DollarSign },
                      { id: 'MOBILE_MONEY', label: 'Mobile', icon: Smartphone },
                      { id: 'CARD', label: 'Carte', icon: CreditCard }
                    ].map(mode => (
                      <button
                        key={mode.id}
                        type="button"
                        onClick={() => handleMethodChange(mode.id)}
                        className={`p-2 rounded-xl border text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-1 ${
                          selectedMethod === mode.id 
                            ? 'bg-blue-50 border-blue-500 text-blue-800 font-black shadow-xs' 
                            : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                        }`}
                      >
                        <mode.icon size={15} />
                        <span className="text-[10px] uppercase font-bold">{mode.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* CASH INPUT, CHANGE & DEBT CALCULATOR */}
              {selectedMethod === 'CASH' && netToPay > 0 && (
                <div className="space-y-3 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-[10px] font-black text-slate-700 uppercase tracking-wider">
                        Montant Remis (Espèces)
                      </label>
                      <span className="text-[10px] font-mono text-slate-400">Net: {netToPay.toLocaleString()} F</span>
                    </div>

                    <input 
                      type="number"
                      placeholder={netToPay.toString()}
                      value={cashInput}
                      onChange={e => handleCashChange(e.target.value)}
                      className="w-full px-3.5 py-2.5 border border-slate-200 focus:border-blue-500 rounded-xl text-sm font-black outline-none bg-white font-mono shadow-2xs"
                    />

                    {/* Quick Presets */}
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {quickPresets.map((preset, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => handleCashChange(preset.value.toString())}
                          className="px-2.5 py-1 bg-white hover:bg-blue-50 border border-slate-200 text-slate-700 hover:text-blue-700 rounded-lg text-[10px] font-bold font-mono transition-colors cursor-pointer shadow-2xs"
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* EXCESS CASH: CHANGE DUE vs CONVERT TO ADVANCE */}
                  {receivedNum > netToPay && (
                    <div className="space-y-2 pt-2 border-t border-slate-200">
                      <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 flex justify-between items-center text-xs">
                        <span className="font-extrabold text-emerald-900 text-[11px] uppercase tracking-wider">
                          Monnaie à Rendre :
                        </span>
                        <span className="font-mono font-black text-base text-emerald-700">
                          {rawChange.toLocaleString()} FCFA
                        </span>
                      </div>

                      {/* CONVERT CHANGE TO AVANCE (ONLY IF PATIENT LINKED) */}
                      {!isAnonymous ? (
                        <button
                          type="button"
                          onClick={() => setConvertChangeToAvance(!convertChangeToAvance)}
                          className={`w-full p-2.5 rounded-xl border text-left flex items-center justify-between gap-2 transition-all cursor-pointer ${
                            convertChangeToAvance
                              ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                              : 'bg-white text-slate-700 border-slate-200 hover:border-emerald-400'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <Sparkles size={14} className={convertChangeToAvance ? 'text-amber-300' : 'text-emerald-600'} />
                            <span className="text-[11px] font-bold">
                              {convertChangeToAvance ? "Monnaie convertie en Avance !" : "Convertir la monnaie en Avance"}
                            </span>
                          </div>
                          <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded ${convertChangeToAvance ? 'bg-emerald-700 text-white' : 'bg-emerald-100 text-emerald-800'}`}>
                            +{rawChange.toLocaleString()} F
                          </span>
                        </button>
                      ) : null}
                    </div>
                  )}

                  {/* SHORTAGE: REMAINING BALANCE vs TRANSFER TO DEBT */}
                  {cashInput !== '' && receivedNum < netToPay && (
                    <div className="space-y-2 pt-2 border-t border-slate-200">
                      <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 flex justify-between items-center text-xs">
                        <span className="font-extrabold text-rose-900 text-[11px] uppercase tracking-wider">
                          Reste à Payer :
                        </span>
                        <span className="font-mono font-black text-base text-rose-700">
                          {rawShortage.toLocaleString()} FCFA
                        </span>
                      </div>

                      {/* TRANSFER SHORTAGE TO DEBT (ONLY IF PATIENT LINKED) */}
                      {!isAnonymous ? (
                        isCreditBlocked ? (
                          <div className="p-2.5 bg-rose-50 border border-rose-300 rounded-xl flex items-center gap-2 text-rose-800 text-xs font-bold">
                            <Lock size={15} className="text-rose-600 shrink-0" />
                            <span>🔒 Crédit Bloqué (Comptabilité) : Ce patient n'est pas autorisé à différer son paiement. Règlement intégral exigé.</span>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setSendToDebt(!sendToDebt)}
                            className={`w-full p-2.5 rounded-xl border text-left flex items-center justify-between gap-2 transition-all cursor-pointer ${
                              sendToDebt
                                ? 'bg-rose-600 text-white border-rose-600 shadow-sm'
                                : 'bg-white text-slate-700 border-slate-200 hover:border-rose-400'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <TrendingDown size={14} className={sendToDebt ? 'text-amber-300' : 'text-rose-600'} />
                              <span className="text-[11px] font-bold">
                                {sendToDebt ? "Solde transféré en Dette active !" : "Transférer le reste en Dette"}
                              </span>
                            </div>
                            <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded ${sendToDebt ? 'bg-rose-700 text-white' : 'bg-rose-100 text-rose-800'}`}>
                              +{rawShortage.toLocaleString()} F
                            </span>
                          </button>
                        )
                      ) : (
                        <button
                          type="button"
                          onClick={() => setShowLambdaModal(true)}
                          className="w-full p-2.5 bg-rose-50 hover:bg-rose-100 border border-rose-300 rounded-xl text-left flex items-center justify-between gap-2 transition-colors cursor-pointer"
                          title="Cliquez pour convertir en Patient Enregistré"
                        >
                          <span className="text-[10px] text-rose-800 font-bold flex items-center gap-1.5">
                            <Lock size={13} className="text-rose-600 shrink-0" />
                            Mettre en Dette (Verrouillé — Patient Lambda)
                          </span>
                          <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300">
                            Convertir
                          </span>
                        </button>
                      )}
                    </div>
                  )}

                </div>
              )}
            </div>

            {/* SUBMIT BUTTON */}
            <div className="pt-3 border-t border-slate-200">
              <button
                type="button"
                disabled={isProcessing || !isAmountSufficient}
                onClick={handlePayClick}
                className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-md shadow-emerald-600/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed active:scale-98"
              >
                {isProcessing ? (
                  <><Loader2 size={16} className="animate-spin" /> Traitement Caisse...</>
                ) : (
                  <><CheckCircle size={16} /> Encaisser & Délivrer Ordonnance</>
                )}
              </button>
            </div>

          </div>
        </div>

      </div>

      <LambdaConversionModal
        isOpen={showLambdaModal}
        onClose={() => setShowLambdaModal(false)}
        patient={matchedPatient}
        patientId={prescription?.patientId}
        patientName={prescription?.patient || 'Patient Lambda'}
        onConverted={(updatedPatient) => {
          setConvertedPatientOverride(updatedPatient);
          setSendToDebt(true);
        }}
      />
    </div>
  );
};
