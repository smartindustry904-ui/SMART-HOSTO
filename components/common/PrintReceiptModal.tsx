import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Printer, X, Receipt, FileText, CheckCircle2, Building2, Phone, Mail, MapPin, User, ShieldCheck, MessageSquare, Loader2, Check } from 'lucide-react';
import { EstablishmentConfig } from '../../types';
import { printElementDirectly } from '../../src/utils/print';
import { getApiUrl } from '../../src/utils/apiConfig';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const buildReceiptPdfDoc = (
  receipt: PrintableReceiptData,
  establishment: EstablishmentConfig,
  currency: string
): jsPDF => {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  // 1. Establishment Header Banner
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(0, 0, 210, 24, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(establishment?.name || 'SMART-HOSTO SIH', 15, 16);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(203, 213, 225); // slate-300
  doc.text(`Tél: ${establishment?.phone || '+237 600 000 000'}`, 140, 11);
  doc.text(establishment?.address || 'Hôpital Général', 140, 16);

  // 2. Receipt Title & Reference
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('REÇU DE CAISSE & ENCAISSEMENT', 15, 36);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text(`Réf : ${receipt.id}   |   Date : ${receipt.date} ${receipt.time || ''}`, 15, 42);

  // 3. Patient & Cashier Info Box
  doc.setFillColor(248, 250, 252); // slate-50
  doc.rect(15, 47, 180, 22, 'F');
  doc.setDrawColor(226, 232, 240);
  doc.rect(15, 47, 180, 22, 'S');

  doc.setFontSize(9);
  doc.setTextColor(51, 65, 85);
  doc.setFont('helvetica', 'bold');
  doc.text('Patient :', 20, 55);
  doc.setFont('helvetica', 'normal');
  doc.text(`${receipt.patientName} ${receipt.patientId ? `(ID: ${receipt.patientId})` : ''}`, 42, 55);

  doc.setFont('helvetica', 'bold');
  doc.text('Caissier / Opérateur :', 20, 62);
  doc.setFont('helvetica', 'normal');
  doc.text(`${receipt.operatorName || 'La Caisse'} ${receipt.operatorRole ? `(${receipt.operatorRole})` : ''}`, 58, 62);

  if (receipt.paymentMethod) {
    doc.setFont('helvetica', 'bold');
    doc.text('Mode de paiement :', 125, 55);
    doc.setFont('helvetica', 'normal');
    doc.text(receipt.paymentMethod, 160, 55);
  }

  // 4. Items Table
  const tableRows = (receipt.items || []).map(it => [
    it.name,
    String(it.quantity || 1),
    it.unitPrice ? `${it.unitPrice.toLocaleString('fr-FR')} ${currency}` : '-',
    `${(it.totalPrice || 0).toLocaleString('fr-FR')} ${currency}`
  ]);

  autoTable(doc, {
    startY: 75,
    head: [['Désignation / Prestation', 'Qté', 'Prix Unitaire', 'Total']],
    body: tableRows,
    theme: 'striped',
    headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
    styles: { fontSize: 9, cellPadding: 3.5 },
    columnStyles: {
      0: { cellWidth: 90 },
      1: { halign: 'center', cellWidth: 20 },
      2: { halign: 'right', cellWidth: 35 },
      3: { halign: 'right', cellWidth: 35, fontStyle: 'bold' }
    }
  });

  const finalY = (doc as any).lastAutoTable?.finalY || 120;

  // 5. Totals Section
  doc.setFillColor(241, 245, 249);
  doc.rect(115, finalY + 6, 80, 28, 'F');
  doc.setDrawColor(203, 213, 225);
  doc.rect(115, finalY + 6, 80, 28, 'S');

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('Total réglé :', 120, finalY + 16);
  doc.setFontSize(12);
  doc.setTextColor(16, 185, 129); // emerald-600
  doc.text(`${(receipt.amountPaid || 0).toLocaleString('fr-FR')} ${currency}`, 190, finalY + 16, { align: 'right' });

  if (receipt.changeGiven && receipt.changeGiven > 0) {
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    doc.setFont('helvetica', 'normal');
    doc.text('Monnaie rendue :', 120, finalY + 24);
    doc.text(`${receipt.changeGiven.toLocaleString('fr-FR')} ${currency}`, 190, finalY + 24, { align: 'right' });
  }

  // 6. Security & Legal notice
  doc.setFontSize(7.5);
  doc.setTextColor(148, 163, 184);
  doc.text('Ce reçu constitue une preuve officielle de paiement certifiée et enregistrée dans le système SMART-HOSTO.', 15, 280);
  doc.text('En cas de réclamation, veuillez présenter ce document au bureau de facturation.', 15, 285);

  return doc;
};

export interface ReceiptItem {
  id?: string;
  name: string;
  quantity: number;
  unitPrice?: number;
  totalPrice: number;
  category?: string;
}

export interface PrintableReceiptData {
  id: string;
  date: string;
  time?: string;
  type?: 'TICKET_ADMISSION' | 'RECU_ENCAISSEMENT' | 'VENTE_PHARMACIE' | 'FACTURE';
  title?: string;
  patientName: string;
  patientId?: string;
  dmeId?: string;
  patientPhone?: string;
  patientAddress?: string;
  operatorName?: string;
  operatorRole?: string;
  paymentMethod?: string;
  department?: string;
  doctorName?: string;
  items: ReceiptItem[];
  subtotal?: number;
  insuranceCoverage?: number;
  insuranceName?: string;
  previousDebt?: number;
  totalAmount: number;
  amountPaid: number;
  changeGiven?: number;
  creditApplied?: number;
  newDebt?: number;
  newAdvance?: number;
  isPaid?: boolean;
  notes?: string;
  footer?: string;
}

interface PrintReceiptModalProps {
  receipt: PrintableReceiptData;
  establishment: EstablishmentConfig;
  initialFormat?: 'THERMAL_80MM' | 'A4';
  onClose: () => void;
}

export const PrintReceiptModal: React.FC<PrintReceiptModalProps> = ({
  receipt,
  establishment,
  initialFormat,
  onClose
}) => {
  const defaultFormat = initialFormat || establishment.receiptFormat || 'THERMAL_80MM';
  const [selectedFormat, setSelectedFormat] = useState<'THERMAL_80MM' | 'A4'>(defaultFormat);

  const currency = establishment.currency || 'FCFA';

  useEffect(() => {
    document.body.classList.add('has-print-modal');

    // Intercept keyboard shortcut Ctrl+P / Cmd+P to invoke isolated receipt printing
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        handlePrint();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.classList.remove('has-print-modal');
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedFormat]);

  const formatMoney = (val?: number) => {
    return (val || 0).toLocaleString('fr-FR');
  };

  const handlePrint = () => {
    // Triggers standard native browser print with zero background bleed
    window.print();
  };

  const [waPhone, setWaPhone] = useState(receipt.patientPhone || '');
  const [showWaInput, setShowWaInput] = useState(false);
  const [sendingWa, setSendingWa] = useState(false);
  const [waSentSuccess, setWaSentSuccess] = useState(false);

  const handleSendWhatsApp = async () => {
    const targetPhone = (waPhone || receipt.patientPhone || '').trim();
    if (!targetPhone) {
      setShowWaInput(true);
      return;
    }
    setSendingWa(true);
    try {
      // 1. Generate styled official PDF in memory
      let pdfBase64: string | undefined;
      try {
        const pdfDoc = buildReceiptPdfDoc(receipt, establishment, currency);
        pdfBase64 = pdfDoc.output('datauristring');
      } catch (pdfErr) {
        console.warn('Receipt PDF generation warning:', pdfErr);
      }

      const summaryLines = (receipt.items || []).map(
        it => `${it.name} (x${it.quantity}) : ${(it.totalPrice || 0).toLocaleString('fr-FR')} ${currency}`
      );
      const res = await fetch(getApiUrl('/api/whatsapp/send-document'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: targetPhone,
          documentType: 'RECEIPT',
          patientName: receipt.patientName,
          patientId: receipt.patientId,
          title: receipt.title || 'Reçu de Paiement Hospitalier',
          summaryLines,
          totalAmount: receipt.amountPaid,
          currency,
          pdfBase64,
          pdfFilename: `Recu_Caisse_${receipt.id || Date.now()}.pdf`,
          staffName: receipt.operatorName || 'La Caisse',
          staffRole: receipt.operatorRole || 'CAISSIER'
        })
      });
      const data = await res.json();
      if (data.success) {
        setWaSentSuccess(true);
        setShowWaInput(false);
        setTimeout(() => setWaSentSuccess(false), 6000);
      } else {
        alert(data.message || 'Erreur lors de l\'envoi WhatsApp');
      }
    } catch (err: any) {
      alert('Erreur réseau WhatsApp: ' + err.message);
    } finally {
      setSendingWa(false);
    }
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div id="ticket-print-portal" className={`ticket-modal-backdrop fixed inset-0 z-[150] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto ${
      selectedFormat === 'THERMAL_80MM' ? 'print-format-thermal' : 'print-format-a4'
    }`}>
      {/* Dynamic Airtight Print CSS Isolation: hides dashboard background, sidebar & chrome entirely */}
      <style>{`
        @media print {
          /* Complete elimination of background app and root chrome */
          body.has-print-modal > #root,
          body.has-print-modal > *:not(#ticket-print-portal):not(script):not(style) {
            display: none !important;
          }

          html, body {
            background: #ffffff !important;
            color: #000000 !important;
            margin: 0 !important;
            padding: 0 !important;
            height: auto !important;
            min-height: auto !important;
            overflow: visible !important;
          }

          #ticket-print-portal,
          .ticket-modal-backdrop {
            position: static !important;
            background: transparent !important;
            backdrop-filter: none !important;
            -webkit-backdrop-filter: none !important;
            padding: 0 !important;
            margin: 0 !important;
            overflow: visible !important;
            display: block !important;
            width: 100% !important;
            max-width: 100% !important;
            height: auto !important;
            min-height: auto !important;
          }

          .ticket-print-wrapper {
            position: static !important;
            margin: 0 auto !important;
            padding: 0 !important;
            border: none !important;
            box-shadow: none !important;
            border-radius: 0 !important;
            background: #ffffff !important;
            color: #000000 !important;
            max-height: none !important;
            height: auto !important;
            overflow: visible !important;
            display: block !important;
            width: 100% !important;
          }

          .ticket-scroll-area {
            max-height: none !important;
            height: auto !important;
            overflow: visible !important;
            padding: 0 !important;
            margin: 0 !important;
            background: transparent !important;
            display: block !important;
          }

          .no-print,
          .no-print *,
          .ticket-actions-bar,
          .ticket-actions-bar *,
          button {
            display: none !important;
          }

          tr, .avoid-break {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
        }
      `}</style>

      {/* Format-specific dynamic @page CSS rule for browser print preview */}
      {selectedFormat === 'THERMAL_80MM' ? (
        <style>{`
          @media print {
            @page {
              size: 80mm auto !important;
              margin: 0 !important;
            }
            #thermal-receipt {
              display: block !important;
              width: 76mm !important;
              max-width: 76mm !important;
              margin: 0 auto !important;
              padding: 2mm 1mm !important;
              border: none !important;
              box-shadow: none !important;
              background: #ffffff !important;
              color: #000000 !important;
              font-family: 'Courier New', Courier, monospace !important;
            }
            #a4-receipt {
              display: none !important;
            }
          }
        `}</style>
      ) : (
        <style>{`
          @media print {
            @page {
              size: A4 portrait !important;
              margin: 8mm 10mm !important;
            }
            #a4-receipt {
              display: block !important;
              width: 100% !important;
              max-width: 190mm !important;
              margin: 0 auto !important;
              padding: 0 !important;
              border: none !important;
              box-shadow: none !important;
              background: #ffffff !important;
              color: #000000 !important;
            }
            #thermal-receipt {
              display: none !important;
            }
          }
        `}</style>
      )}

      <div className={`ticket-print-wrapper bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200 transition-all ${
        selectedFormat === 'THERMAL_80MM' 
          ? 'w-full max-w-[86mm] h-auto max-h-[94vh] print-format-thermal' 
          : 'w-full max-w-4xl lg:max-w-5xl h-auto max-h-[94vh] print-format-a4'
      }`}>
        
        {/* MODAL CONTROL HEADER (NO-PRINT) */}
        <div className="no-print p-4 sm:p-5 bg-slate-50 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs">
              <Printer size={18} />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900 leading-tight">
                Aperçu Impression
              </h3>
              <p className="text-[10px] text-slate-500 font-mono">
                Réf: {receipt.id}
              </p>
            </div>
          </div>

          {/* FORMAT TOGGLE SWITCHER */}
          <div className="flex items-center gap-1.5 bg-slate-200/70 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setSelectedFormat('THERMAL_80MM')}
              className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${
                selectedFormat === 'THERMAL_80MM'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Receipt size={14} />
              <span>Supermarché (80mm)</span>
            </button>
            <button
              type="button"
              onClick={() => setSelectedFormat('A4')}
              className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${
                selectedFormat === 'A4'
                  ? 'bg-white text-blue-600 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileText size={14} />
              <span>Format A4</span>
            </button>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-slate-200 text-slate-400 hover:text-slate-700 flex items-center justify-center transition-colors cursor-pointer"
            title="Fermer"
          >
            <X size={18} />
          </button>
        </div>

        {/* TICKET / INVOICE BODY */}
        <div className={`ticket-scroll-area flex-1 overflow-y-auto custom-scrollbar flex justify-center ${
          selectedFormat === 'THERMAL_80MM' 
            ? 'p-2 sm:p-3 bg-white' 
            : 'p-4 sm:p-6 bg-slate-100/60'
        }`}>

          {/* ========================================================= */}
          {/* OPTION A: SUPERMARKET THERMAL RECEIPT (80mm)             */}
          {/* ========================================================= */}
          {selectedFormat === 'THERMAL_80MM' && (
            <div 
              id="thermal-receipt"
              className="bg-white p-4 sm:p-5 text-slate-900 font-mono text-xs w-full max-w-[80mm] space-y-3"
              style={{ width: '80mm', maxWidth: '100%', margin: '0 auto' }}
            >
              {/* Header */}
              <div className="text-center pb-2 border-b border-dashed border-slate-300">
                <div className="w-10 h-10 mx-auto mb-1 bg-slate-900 text-white rounded-xl flex items-center justify-center font-black text-xs font-sans">
                  {establishment.logo || 'SH'}
                </div>
                <h2 className="font-black text-sm uppercase tracking-wide font-sans">{establishment.name}</h2>
                <p className="text-[10px] text-slate-600">{establishment.address}</p>
                <p className="text-[10px] text-slate-600">Tél: {establishment.phone}</p>
                {establishment.slogan && (
                  <p className="text-[9px] italic text-slate-500 mt-1 font-sans">"{establishment.slogan}"</p>
                )}
                {establishment.taxId && (
                  <p className="text-[8px] text-slate-400 mt-0.5">{establishment.taxId}</p>
                )}
              </div>

              {/* Receipt Title */}
              <div className="text-center py-1 bg-slate-50 border-y border-dashed border-slate-300">
                <p className="font-black text-xs uppercase tracking-wider">
                  {receipt.title || (receipt.type === 'TICKET_ADMISSION' ? 'TICKET D\'ADMISSION' : 'REÇU DE CAISSE')}
                </p>
                <p className="text-[9.5px] font-bold text-slate-500">N° {receipt.id}</p>
              </div>

              {/* Patient & Date Meta */}
              <div className="text-[10px] space-y-1 pb-2 border-b border-dashed border-slate-300">
                <div className="flex justify-between">
                  <span className="text-slate-500">Date :</span>
                  <span className="font-bold">{receipt.date} {receipt.time ? `• ${receipt.time}` : ''}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Patient :</span>
                  <span className="font-black truncate max-w-[170px]">{receipt.patientName}</span>
                </div>
                {(receipt.patientId || receipt.dmeId) && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Identifiant :</span>
                    <span className="font-bold">{receipt.patientId || receipt.dmeId}</span>
                  </div>
                )}
                {receipt.department && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Service :</span>
                    <span className="font-bold">{receipt.department}</span>
                  </div>
                )}
                {receipt.operatorName && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Opérateur :</span>
                    <span className="font-bold">{receipt.operatorName}</span>
                  </div>
                )}
              </div>

              {/* Prestations Table */}
              <div className="pb-2 border-b border-dashed border-slate-300">
                <table className="w-full text-[10px]">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500">
                      <th className="text-left pb-1">Désignation</th>
                      <th className="text-center pb-1">Qté</th>
                      <th className="text-right pb-1">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-dotted divide-slate-200">
                    {receipt.items.map((item, idx) => (
                      <tr key={idx}>
                        <td className="py-1 pr-1 font-semibold leading-tight">{item.name}</td>
                        <td className="py-1 text-center font-bold">{item.quantity}</td>
                        <td className="py-1 text-right font-black">{formatMoney(item.totalPrice)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Financial Recap */}
              <div className="text-[10px] space-y-1 pb-2 border-b border-dashed border-slate-300">
                {receipt.subtotal !== undefined && receipt.subtotal > 0 && receipt.subtotal !== receipt.totalAmount && (
                  <div className="flex justify-between text-slate-500">
                    <span>Sous-total prestations :</span>
                    <span>{formatMoney(receipt.subtotal)} {currency}</span>
                  </div>
                )}

                {receipt.previousDebt !== undefined && receipt.previousDebt > 0 && (
                  <div className="flex justify-between text-rose-600 font-bold">
                    <span>Dette antérieure incluse :</span>
                    <span>+{formatMoney(receipt.previousDebt)} {currency}</span>
                  </div>
                )}

                {receipt.insuranceCoverage !== undefined && receipt.insuranceCoverage > 0 && (
                  <div className="flex justify-between text-emerald-600 font-bold">
                    <span>Prise en charge {receipt.insuranceName || 'Assurance'} :</span>
                    <span>-{formatMoney(receipt.insuranceCoverage)} {currency}</span>
                  </div>
                )}

                {receipt.creditApplied !== undefined && receipt.creditApplied > 0 && (
                  <div className="flex justify-between text-emerald-600 font-bold">
                    <span>Avoir / Avance déduit :</span>
                    <span>-{formatMoney(receipt.creditApplied)} {currency}</span>
                  </div>
                )}

                <div className="flex justify-between items-center text-xs font-black pt-1 border-t border-slate-300">
                  <span>TOTAL NET :</span>
                  <span className="text-sm">{formatMoney(receipt.totalAmount)} {currency}</span>
                </div>

                <div className="flex justify-between text-slate-700 pt-1">
                  <span>Montant remis ({receipt.paymentMethod || 'Espèces'}) :</span>
                  <span className="font-bold">{formatMoney(receipt.amountPaid)} {currency}</span>
                </div>

                {receipt.changeGiven !== undefined && receipt.changeGiven > 0 && (
                  <div className="flex justify-between text-emerald-700 font-bold">
                    <span>Monnaie rendue :</span>
                    <span>{formatMoney(receipt.changeGiven)} {currency}</span>
                  </div>
                )}

                {receipt.newAdvance !== undefined && receipt.newAdvance > 0 && (
                  <div className="flex justify-between text-blue-700 font-bold">
                    <span>Avance conservée :</span>
                    <span>+{formatMoney(receipt.newAdvance)} {currency}</span>
                  </div>
                )}

                {receipt.newDebt !== undefined && receipt.newDebt > 0 && (
                  <div className="flex justify-between text-rose-700 font-bold">
                    <span>Reste à payer (Dette) :</span>
                    <span>{formatMoney(receipt.newDebt)} {currency}</span>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="text-center text-[9px] text-slate-500 space-y-1 pt-1 font-sans">
                <p className="font-bold uppercase tracking-wider text-slate-700">
                  {receipt.isPaid !== false ? '✓ ACQUITTÉ & CERTIFIÉ' : 'EN ATTENTE DE RÈGLEMENT'}
                </p>
                <p>{receipt.footer || establishment.invoiceFooter || 'Merci pour votre confiance.'}</p>
                <p className="text-[8px] text-slate-400 font-mono">Imprimé via SmartHosto SIH • {new Date().toLocaleTimeString('fr-FR')}</p>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* OPTION B: STANDARD A4 INVOICE / RECEIPT                  */}
          {/* ========================================================= */}
          {selectedFormat === 'A4' && (
            <div 
              id="a4-receipt"
              className="bg-white p-6 sm:p-10 shadow-sm border border-slate-200 rounded-2xl text-slate-900 w-full max-w-full space-y-6 font-sans"
            >
              {/* A4 Official Hospital Header */}
              <div className="flex items-start justify-between border-b-2 border-slate-900 pb-6 gap-6">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 bg-slate-900 text-white rounded-2xl flex items-center justify-center font-black text-xl tracking-tighter shrink-0 shadow-sm">
                    {establishment.logo || 'SH'}
                  </div>
                  <div>
                    <h1 className="text-xl sm:text-2xl font-black uppercase tracking-tight text-slate-900">
                      {establishment.name}
                    </h1>
                    <p className="text-xs font-semibold text-slate-600 mt-0.5">{establishment.address}</p>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 mt-1">
                      <span className="flex items-center gap-1"><Phone size={12} /> {establishment.phone}</span>
                      {establishment.email && <span className="flex items-center gap-1"><Mail size={12} /> {establishment.email}</span>}
                    </div>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <span className="inline-block px-3 py-1 bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest rounded-lg mb-2">
                    DOCUMENT OFFICIEL
                  </span>
                  <p className="text-lg font-black text-slate-900">
                    {receipt.title || (receipt.type === 'TICKET_ADMISSION' ? 'FICHE D\'ORIENTATION & ADMISSION' : 'REÇU DE PAIEMENT & FACTURE')}
                  </p>
                  <p className="text-xs font-mono font-bold text-blue-600 mt-0.5">N° {receipt.id}</p>
                  <p className="text-xs text-slate-500 font-medium">{receipt.date} {receipt.time ? `• ${receipt.time}` : ''}</p>
                </div>
              </div>

              {/* Bilateral Information Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Left: Patient Details */}
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-1.5">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Bénéficiaire des Soins</p>
                  <p className="text-base font-black text-slate-900">{receipt.patientName}</p>
                  <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 pt-1">
                    <div>
                      <span className="text-slate-400 block text-[10px] font-bold">Identifiant / DME :</span>
                      <span className="font-mono font-bold">{receipt.patientId || receipt.dmeId || 'N/A'}</span>
                    </div>
                    {receipt.patientPhone && (
                      <div>
                        <span className="text-slate-400 block text-[10px] font-bold">Téléphone :</span>
                        <span>{receipt.patientPhone}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Right: Payment & Administrative Details */}
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-1.5">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Détails Administratifs</p>
                  <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 pt-1">
                    <div>
                      <span className="text-slate-400 block text-[10px] font-bold">Service clinique :</span>
                      <span className="font-bold text-slate-900">{receipt.department || 'Consultations & Soins'}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px] font-bold">Mode de règlement :</span>
                      <span className="font-bold text-slate-900 uppercase">{receipt.paymentMethod || 'ESPÈCES'}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px] font-bold">Opérateur / Caisse :</span>
                      <span className="font-medium text-slate-900">{receipt.operatorName || 'Caissier Principal'}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px] font-bold">Statut de quittance :</span>
                      <span className="inline-flex items-center gap-1 font-black text-emerald-700">
                        <CheckCircle2 size={12} /> {receipt.isPaid !== false ? 'Soldé' : 'En attente'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Prestations Table */}
              <div className="border border-slate-200 rounded-2xl overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-900 text-white font-black uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="py-3 px-4">#</th>
                      <th className="py-3 px-4">Prestation / Acte / Produit</th>
                      <th className="py-3 px-4 text-center">Quantité</th>
                      <th className="py-3 px-4 text-right">Prix Unitaire</th>
                      <th className="py-3 px-4 text-right">Montant Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {receipt.items.map((item, idx) => (
                      <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                        <td className="py-2.5 px-4 font-mono text-slate-400">{idx + 1}</td>
                        <td className="py-2.5 px-4 font-bold text-slate-900">{item.name}</td>
                        <td className="py-2.5 px-4 text-center font-bold text-slate-700">{item.quantity}</td>
                        <td className="py-2.5 px-4 text-right font-mono text-slate-600">
                          {formatMoney(item.unitPrice || (item.totalPrice / Math.max(1, item.quantity)))} {currency}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono font-black text-slate-900">
                          {formatMoney(item.totalPrice)} {currency}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Financial Recap Table */}
              <div className="flex justify-end">
                <div className="w-full max-w-sm space-y-2 bg-slate-50 p-4 rounded-2xl border border-slate-200 text-xs">
                  <div className="flex justify-between text-slate-600">
                    <span>Total Prestations Brut :</span>
                    <span className="font-bold">{formatMoney(receipt.subtotal || receipt.totalAmount)} {currency}</span>
                  </div>

                  {receipt.previousDebt !== undefined && receipt.previousDebt > 0 && (
                    <div className="flex justify-between text-rose-600 font-bold">
                      <span>Dettes antérieures incluses :</span>
                      <span>+{formatMoney(receipt.previousDebt)} {currency}</span>
                    </div>
                  )}

                  {receipt.insuranceCoverage !== undefined && receipt.insuranceCoverage > 0 && (
                    <div className="flex justify-between text-emerald-600 font-bold">
                      <span>Prise en charge {receipt.insuranceName || 'Assurance'} :</span>
                      <span>-{formatMoney(receipt.insuranceCoverage)} {currency}</span>
                    </div>
                  )}

                  {receipt.creditApplied !== undefined && receipt.creditApplied > 0 && (
                    <div className="flex justify-between text-emerald-600 font-bold">
                      <span>Avoir patient déduit :</span>
                      <span>-{formatMoney(receipt.creditApplied)} {currency}</span>
                    </div>
                  )}

                  <div className="flex justify-between items-center text-sm font-black text-slate-900 pt-2 border-t-2 border-slate-300">
                    <span>MONTANT NET ACQUITTÉ :</span>
                    <span className="text-base text-blue-600 font-mono">{formatMoney(receipt.totalAmount)} {currency}</span>
                  </div>

                  <div className="flex justify-between text-slate-600 pt-1 border-t border-slate-200">
                    <span>Montant réglé ({receipt.paymentMethod || 'Espèces'}) :</span>
                    <span className="font-bold">{formatMoney(receipt.amountPaid)} {currency}</span>
                  </div>

                  {receipt.changeGiven !== undefined && receipt.changeGiven > 0 && (
                    <div className="flex justify-between text-emerald-600 font-bold">
                      <span>Monnaie rendue :</span>
                      <span>{formatMoney(receipt.changeGiven)} {currency}</span>
                    </div>
                  )}

                  {receipt.newDebt !== undefined && receipt.newDebt > 0 && (
                    <div className="flex justify-between text-rose-600 font-black">
                      <span>Reste dû (Dette en compte) :</span>
                      <span>{formatMoney(receipt.newDebt)} {currency}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Legal Footer */}
              <div className="pt-4 border-t border-slate-100 text-center text-[10px] text-slate-500 space-y-0.5">
                <p className="font-bold text-slate-700">
                  {establishment.name} — {establishment.taxId || 'Agrément Ministère de la Santé'}
                </p>
                <p>{receipt.footer || establishment.invoiceFooter || 'Merci de votre confiance. En cas de réclamation, veuillez contacter le service facturation.'}</p>
              </div>
            </div>
          )}

        </div>

        {/* MODAL BOTTOM ACTION BAR (NO-PRINT) */}
        <div className="ticket-actions-bar no-print p-4 sm:p-5 bg-white border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">Format actif :</span>
            <strong className="text-xs text-slate-800">{selectedFormat === 'THERMAL_80MM' ? 'Supermarché (80mm)' : 'Pleine Page (A4)'}</strong>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {showWaInput ? (
              <div className="flex items-center gap-1.5 bg-slate-50 p-1 rounded-xl border border-emerald-300 animate-in fade-in">
                <input
                  type="tel"
                  placeholder="Ex: 681051123 ou +237..."
                  value={waPhone}
                  onChange={e => setWaPhone(e.target.value)}
                  className="px-2.5 py-1 text-xs bg-white border border-slate-200 rounded-lg text-slate-800 font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500 w-40"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={handleSendWhatsApp}
                  disabled={sendingWa}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold text-xs flex items-center gap-1 transition-all cursor-pointer"
                >
                  {sendingWa ? <Loader2 size={13} className="animate-spin" /> : <MessageSquare size={13} />}
                  <span>Confirmer</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowWaInput(false)}
                  className="px-2 py-1.5 text-slate-400 hover:text-slate-600 text-xs"
                >
                  Annuler
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  if (!receipt.patientPhone && !waPhone) {
                    setShowWaInput(true);
                  } else {
                    handleSendWhatsApp();
                  }
                }}
                disabled={sendingWa}
                className={`px-4 py-2.5 rounded-xl font-bold text-xs transition-all flex items-center gap-2 cursor-pointer shadow-xs active:scale-[0.98] ${
                  waSentSuccess
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/20'
                }`}
                title="Transmettre le reçu au patient sur son WhatsApp"
              >
                {sendingWa ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : waSentSuccess ? (
                  <Check size={15} className="text-emerald-700 font-black" />
                ) : (
                  <MessageSquare size={15} />
                )}
                <span>
                  {sendingWa
                    ? 'Transmission...'
                    : waSentSuccess
                    ? 'Reçu envoyé sur WhatsApp !'
                    : 'Envoyer sur WhatsApp 📲'}
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs hover:bg-slate-50 transition-colors cursor-pointer"
            >
              Fermer
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-black text-xs uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer shadow-xs shadow-blue-600/20 active:scale-[0.98]"
            >
              <Printer size={16} />
              <span>Imprimer ({selectedFormat === 'THERMAL_80MM' ? '80mm' : 'A4'})</span>
            </button>
          </div>
        </div>

      </div>
    </div>,
    document.body
  );
};
