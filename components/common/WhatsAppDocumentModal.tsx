import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  X, 
  Send, 
  Loader2, 
  CheckCircle2, 
  AlertCircle, 
  FileText, 
  Receipt, 
  FlaskConical, 
  Phone, 
  User, 
  Save, 
  ExternalLink,
  ShieldCheck,
  Sparkles,
  RefreshCw
} from 'lucide-react';
import { db } from '../../src/firebase';
import { doc, getDoc, getDocs, collection, query, where, setDoc } from 'firebase/firestore';
import { getApiUrl } from '../../src/utils/apiConfig';

export interface WhatsAppDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  patientName: string;
  patientId?: string;
  initialPhone?: string;
  documentType: 'RECEIPT' | 'PRESCRIPTION' | 'LAB_RESULTS' | 'APPOINTMENT';
  documentTitle: string;
  summaryLines?: string[];
  detailsText?: string;
  totalAmount?: number;
  currency?: string;
  getPdfBase64: () => string | Promise<string>;
  pdfFilename?: string;
  staffName?: string;
  staffRole?: string;
  onPhoneSaved?: (savedPhone: string) => void;
  onSuccess?: () => void;
}

/**
 * Normalizes phone number into international or clean digit format
 */
function cleanPhoneNumber(input: string): string {
  let cleaned = input.replace(/[\s\-\(\)\.]/g, '').trim();
  if (!cleaned) return '';
  // If Cameroon standard 9-digit format without country code (e.g. 688252720)
  if (/^[26][0-9]{8}$/.test(cleaned)) {
    cleaned = `237${cleaned}`;
  }
  // Strip leading '+'
  cleaned = cleaned.replace(/^\+/, '');
  return cleaned;
}

/**
 * Persist phone number in Firestore patient documents
 */
async function persistPatientPhone(patientIdOrCode: string, phone: string): Promise<boolean> {
  const clean = cleanPhoneNumber(phone);
  if (!clean || !patientIdOrCode) return false;

  try {
    const timestamp = new Date().toISOString();

    // 1. Check direct doc in 'patients'
    const directRef = doc(db, 'patients', patientIdOrCode);
    const directSnap = await getDoc(directRef);
    if (directSnap.exists()) {
      await setDoc(directRef, { phone: clean, updatedAt: timestamp }, { merge: true });
    }

    // 2. Query by 'patientId', 'dmeId', or 'id'
    const qFields = ['patientId', 'dmeId', 'id', 'patientNumber', 'dossierNumber'];
    for (const f of qFields) {
      try {
        const q = query(collection(db, 'patients'), where(f, '==', patientIdOrCode));
        const snap = await getDocs(q);
        if (!snap.empty) {
          for (const d of snap.docs) {
            await setDoc(doc(db, 'patients', d.id), { phone: clean, updatedAt: timestamp }, { merge: true });
          }
        }
      } catch (innerErr) {
        // Continue to other queries
      }
    }

    // 3. Update 'patient_records' if exists
    try {
      const prRef = doc(db, 'patient_records', patientIdOrCode);
      await setDoc(prRef, { phone: clean, updatedAt: timestamp }, { merge: true });
    } catch (prErr) {
      // Ignore if collection not present
    }

    return true;
  } catch (err) {
    console.warn('Erreur lors de la persistance du téléphone patient:', err);
    return false;
  }
}

export const WhatsAppDocumentModal: React.FC<WhatsAppDocumentModalProps> = ({
  isOpen,
  onClose,
  patientName,
  patientId,
  initialPhone,
  documentType,
  documentTitle,
  summaryLines = [],
  detailsText,
  totalAmount,
  currency = 'FCFA',
  getPdfBase64,
  pdfFilename,
  staffName,
  staffRole,
  onPhoneSaved,
  onSuccess
}) => {
  const [phone, setPhone] = useState(initialPhone || '');
  const [saveToRecord, setSaveToRecord] = useState(true);
  const [isLoadingPatient, setIsLoadingPatient] = useState(false);
  const [phoneFoundInRecord, setPhoneFoundInRecord] = useState(false);
  const [sending, setSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successData, setSuccessData] = useState<{ messageId?: string; phoneSent?: string } | null>(null);

  // Initialize and auto-fetch patient phone if not provided
  useEffect(() => {
    if (!isOpen) {
      setSending(false);
      setErrorMsg(null);
      setSuccessData(null);
      return;
    }

    if (initialPhone && initialPhone.trim()) {
      setPhone(initialPhone.trim());
      setPhoneFoundInRecord(true);
      return;
    }

    // Try looking up the phone in Firestore if initialPhone is empty
    if (patientId && patientId.trim()) {
      setIsLoadingPatient(true);
      (async () => {
        try {
          // Direct doc lookup
          const pRef = doc(db, 'patients', patientId.trim());
          const pSnap = await getDoc(pRef);
          if (pSnap.exists() && pSnap.data()?.phone) {
            setPhone(pSnap.data().phone);
            setPhoneFoundInRecord(true);
            setIsLoadingPatient(false);
            return;
          }

          // Query lookup
          const q = query(collection(db, 'patients'), where('patientId', '==', patientId.trim()));
          const snap = await getDocs(q);
          if (!snap.empty && snap.docs[0].data()?.phone) {
            setPhone(snap.docs[0].data().phone);
            setPhoneFoundInRecord(true);
            setIsLoadingPatient(false);
            return;
          }
        } catch (e) {
          console.warn('Patient lookup error:', e);
        } finally {
          setIsLoadingPatient(false);
        }
      })();
    }
  }, [isOpen, initialPhone, patientId]);

  if (!isOpen || typeof document === 'undefined') return null;

  const getDocTypeIcon = () => {
    switch (documentType) {
      case 'RECEIPT':
        return <Receipt size={22} className="text-emerald-400" />;
      case 'PRESCRIPTION':
        return <FileText size={22} className="text-indigo-400" />;
      case 'LAB_RESULTS':
        return <FlaskConical size={22} className="text-amber-400" />;
      default:
        return <FileText size={22} className="text-emerald-400" />;
    }
  };

  const getDocTypeLabel = () => {
    switch (documentType) {
      case 'RECEIPT':
        return 'Reçu de Caisse Officiel';
      case 'PRESCRIPTION':
        return 'Ordonnance Médicale Numérique';
      case 'LAB_RESULTS':
        return "Résultats d'Analyses Médicales";
      default:
        return 'Document Médical Officiel';
    }
  };

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorMsg(null);

    const clean = cleanPhoneNumber(phone);
    if (!clean || clean.length < 8) {
      setErrorMsg('Veuillez saisir un numéro de téléphone valide (ex: 688252720 ou 237688252720).');
      return;
    }

    setSending(true);

    try {
      // 1. If requested, persist phone number in Firestore patient record
      if (saveToRecord && patientId) {
        try {
          await persistPatientPhone(patientId, clean);
          onPhoneSaved?.(clean);
        } catch (saveErr) {
          console.warn('Failed to persist phone:', saveErr);
        }
      }

      // 2. Obtain official PDF base64 representation
      let pdfBase64: string | undefined;
      try {
        const rawPdf = await getPdfBase64();
        if (rawPdf && typeof rawPdf === 'string') {
          pdfBase64 = rawPdf;
        }
      } catch (pdfErr) {
        console.warn('PDF generation in modal failed:', pdfErr);
      }

      // 3. Dispatch to WhatsApp backend with robust error catching
      const apiUrl = getApiUrl('/api/whatsapp/send-document');
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: clean,
          documentType,
          patientName,
          patientId,
          title: documentTitle,
          summaryLines,
          detailsText,
          totalAmount,
          currency,
          pdfBase64,
          pdfFilename: pdfFilename || `${documentType.toLowerCase()}_${Date.now()}.pdf`,
          staffName,
          staffRole
        })
      });

      const responseText = await response.text();
      let resJson: any;
      try {
        resJson = JSON.parse(responseText);
      } catch (jsonErr) {
        throw new Error(
          `Le serveur WhatsApp démarre ou a répondu de façon inattendue (Code HTTP ${response.status}). Veuillez patienter 10 secondes et réessayer.`
        );
      }

      if (!response.ok || !resJson.success) {
        throw new Error(resJson?.message || `Erreur serveur HTTP ${response.status}`);
      }

      // Success
      setSuccessData({
        messageId: resJson.metaMessageId || resJson.messageId,
        phoneSent: clean
      });
      onSuccess?.();
    } catch (err: any) {
      console.error('WhatsApp send error:', err);
      setErrorMsg(err.message || 'Impossible de joindre le serveur WhatsApp.');
    } finally {
      setSending(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[200] bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 animate-in fade-in duration-200">
      <div 
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden flex flex-col animate-in zoom-in-95 duration-200 transition-all max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-600 via-emerald-700 to-teal-800 p-5 text-white flex items-center justify-between shrink-0 relative overflow-hidden">
          <div className="absolute -right-10 -bottom-10 opacity-10 pointer-events-none">
            <Send size={140} />
          </div>
          <div className="flex items-center gap-3 relative z-10">
            <div className="w-11 h-11 rounded-2xl bg-white/15 backdrop-blur-md flex items-center justify-center border border-white/20 shadow-inner">
              {getDocTypeIcon()}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase font-black tracking-widest px-2 py-0.5 rounded-full bg-emerald-500/40 text-emerald-100 border border-emerald-400/30">
                  WhatsApp Business
                </span>
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-200">
                  <ShieldCheck size={12} /> Officiel
                </span>
              </div>
              <h3 className="text-base font-black tracking-tight text-white mt-0.5">
                {getDocTypeLabel()}
              </h3>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors relative z-10"
            title="Fermer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-4 flex-1">
          {/* SUCCESS SCREEN */}
          {successData ? (
            <div className="py-6 flex flex-col items-center text-center space-y-4 animate-in fade-in zoom-in-95">
              <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-950/60 border-2 border-emerald-500 text-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                <CheckCircle2 size={36} className="animate-bounce" />
              </div>
              <div>
                <h4 className="text-lg font-black text-slate-900 dark:text-white">
                  Document Envoyé avec Succès !
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm">
                  Le patient a reçu le document officiel au format PDF ainsi que le récapitulatif sur son numéro WhatsApp :
                </p>
                <div className="mt-3 inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-50 dark:bg-emerald-900/40 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 font-mono font-bold text-sm">
                  <Phone size={14} /> +{successData.phoneSent}
                </div>
              </div>

              {saveToRecord && patientId && (
                <div className="flex items-center gap-2 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-3 py-2 rounded-xl border border-emerald-200/50">
                  <Save size={14} /> Numéro enregistré dans le dossier du patient ({patientId}) pour les prochains reçus.
                </div>
              )}

              <button
                type="button"
                onClick={onClose}
                className="w-full mt-4 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-2xl shadow-lg shadow-emerald-600/25 transition-all text-sm"
              >
                Terminer & Fermer
              </button>
            </div>
          ) : (
            /* DISPATCH FORM */
            <form onSubmit={handleSend} className="space-y-4">
              {/* Patient Badge */}
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300">
                    <User size={18} />
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-600 dark:text-slate-300 block">
                      Patient destinataire
                    </span>
                    <span className="text-xs font-black text-slate-900 dark:text-white">
                      {patientName || 'Patient'}
                    </span>
                  </div>
                </div>
                {patientId && (
                  <span className="text-[10px] font-mono font-bold px-2 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400">
                    {patientId}
                  </span>
                )}
              </div>

              {/* Document Summary Card */}
              <div className="p-3.5 rounded-2xl bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/40 space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-300">
                  <span className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 font-black">
                    <FileText size={14} /> {documentTitle}
                  </span>
                  {totalAmount !== undefined && (
                    <span className="text-emerald-700 dark:text-emerald-300 font-black">
                      {totalAmount.toLocaleString('fr-FR')} {currency}
                    </span>
                  )}
                </div>

                {summaryLines && summaryLines.length > 0 && (
                  <div className="text-[11px] text-slate-600 dark:text-slate-400 space-y-1 pt-1 border-t border-emerald-100 dark:border-emerald-900/30">
                    {summaryLines.slice(0, 3).map((line, idx) => (
                      <p key={idx} className="truncate">• {line}</p>
                    ))}
                    {summaryLines.length > 3 && (
                      <p className="text-[10px] italic text-slate-600 dark:text-slate-300">
                        + {summaryLines.length - 3} autre(s) prestation(s)...
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Phone Input Box */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                    <Phone size={14} className="text-emerald-600" />
                    Numéro WhatsApp du Patient
                  </label>
                  {isLoadingPatient ? (
                    <span className="text-[10px] text-slate-600 dark:text-slate-300 flex items-center gap-1">
                      <Loader2 size={10} className="animate-spin" /> Recherche...
                    </span>
                  ) : phoneFoundInRecord ? (
                    <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                      ✓ Issu du dossier
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded-full border border-amber-200 dark:border-amber-800">
                      Non renseigné
                    </span>
                  )}
                </div>

                <div className="relative flex items-center">
                  <div className="absolute left-3 flex items-center gap-1.5 pointer-events-none text-xs font-bold text-slate-600 dark:text-slate-300">
                    <span>🇨🇲</span>
                    <span>+237</span>
                    <span className="text-slate-300 dark:text-slate-700">|</span>
                  </div>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => {
                      setPhone(e.target.value);
                      setErrorMsg(null);
                    }}
                    placeholder="6XX XXX XXX"
                    className="w-full pl-24 pr-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl text-slate-900 dark:text-white font-mono text-sm font-bold focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all placeholder:text-slate-600 dark:placeholder:text-slate-300"
                    autoFocus
                  />
                </div>
                <p className="text-[10px] text-slate-600 dark:text-slate-300">
                  Format local (9 chiffres) ou international. Le document PDF officiel sera attaché au message.
                </p>
              </div>

              {/* Persistence Checkbox */}
              {patientId && (
                <label className="flex items-start gap-2.5 p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/60 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                  <input
                    type="checkbox"
                    checked={saveToRecord}
                    onChange={(e) => setSaveToRecord(e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300 dark:border-slate-600"
                  />
                  <div className="text-xs">
                    <span className="font-bold text-slate-800 dark:text-slate-200 block">
                      Enregistrer dans le dossier du patient
                    </span>
                    <span className="text-[11px] text-slate-600 dark:text-slate-300">
                      Le numéro sera conservé pour toutes ses futures visites, factures et prescriptions.
                    </span>
                  </div>
                </label>
              )}

              {/* In-Modal Error Alert (NO browser alert) */}
              {errorMsg && (
                <div className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-xs flex items-start gap-2.5 animate-in shake">
                  <AlertCircle size={16} className="shrink-0 mt-0.5 text-rose-500" />
                  <div className="flex-1">
                    <p className="font-bold">Échec de l'envoi</p>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-rose-600 dark:text-rose-400">
                      {errorMsg}
                    </p>
                  </div>
                </div>
              )}

              {/* Modal Action Buttons */}
              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={sending}
                  className="flex-1 py-3 px-4 rounded-2xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs hover:bg-slate-100 dark:hover:bg-slate-800 transition-all disabled:opacity-50"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={sending || !phone.trim()}
                  className="flex-[2] py-3 px-4 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold text-xs shadow-lg shadow-emerald-600/25 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                >
                  {sending ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      <span>Génération & Envoi...</span>
                    </>
                  ) : (
                    <>
                      <Send size={15} />
                      <span>Envoyer par WhatsApp</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
