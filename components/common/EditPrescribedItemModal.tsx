import React, { useEffect, useState } from 'react';
import { Edit3, Save, X } from 'lucide-react';
import {
  PrescribedItemKind,
  saveEditedPrescribedItem,
} from '../../src/utils/prescriptionGuardrails';
import { PaymentRequest, User } from '../../types';

interface EditPrescribedItemModalProps {
  target: { kind: PrescribedItemKind; rawDoc: any } | null;
  onClose: () => void;
  onSaved?: () => void;
  paymentRequests?: PaymentRequest[];
  user?: User;
  establishment?: any;
}

export const EditPrescribedItemModal: React.FC<EditPrescribedItemModalProps> = ({
  target,
  onClose,
  onSaved,
  paymentRequests = [],
  user,
  establishment,
}) => {
  const [title, setTitle] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [dosageOrFreq, setDosageOrFreq] = useState('');
  const [notes, setNotes] = useState('');
  const [urgent, setUrgent] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!target?.rawDoc) return;
    const d = target.rawDoc;
    setErrorMsg(null);
    if (target.kind === 'SOIN') {
      setTitle(d.actName || d.actType || d.title || '');
      setQuantity(Number(d.durationDays || d.quantity || 1));
      setDosageOrFreq(d.frequency || d.timing || '');
      setNotes(d.instructions || d.notes || '');
    } else if (target.kind === 'PHARMA') {
      const firstMed = (d.items || d.medications || [])[0] || {};
      setTitle(firstMed.name || firstMed.nom || d.medicationName || '');
      setQuantity(Number(firstMed.quantity || firstMed.qty || d.quantity || 1));
      setDosageOrFreq(firstMed.dosage || firstMed.posologie || d.dosage || '');
      setNotes(d.instructions || d.notes || '');
    } else {
      const examList = (d.exams || []).map((e: any) => (typeof e === 'string' ? e : e.name)).filter(Boolean);
      setTitle(examList.join(', ') || d.examName || '');
      setQuantity(1);
      setDosageOrFreq(d.category || '');
      setNotes(d.notes || d.instructions || '');
      setUrgent(Boolean(d.urgent));
    }
  }, [target]);

  if (!target) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setErrorMsg('Veuillez renseigner le libellé.');
      return;
    }
    setIsSaving(true);
    setErrorMsg(null);
    try {
      const d = target.rawDoc;
      let updates: Record<string, any> = {};

      if (target.kind === 'SOIN') {
        updates = {
          actName: title.trim(),
          actType: title.trim(),
          frequency: dosageOrFreq.trim(),
          timing: dosageOrFreq.trim(),
          durationDays: Math.max(1, Number(quantity) || 1),
          instructions: notes.trim(),
          notes: notes.trim(),
        };
      } else if (target.kind === 'PHARMA') {
        const existingItems = Array.isArray(d.items) && d.items.length > 0 ? [...d.items] : [{}];
        const unitPrice = Number(existingItems[0]?.unitPrice ?? existingItems[0]?.price ?? 0);
        const qty = Math.max(1, Number(quantity) || 1);
        existingItems[0] = {
          ...existingItems[0],
          name: title.trim(),
          quantity: qty,
          dosage: dosageOrFreq.trim(),
          posologie: dosageOrFreq.trim(),
        };
        const newTotal = unitPrice > 0 ? unitPrice * qty : Number(d.totalAmount || 0);
        updates = {
          items: existingItems,
          dosage: dosageOrFreq.trim(),
          instructions: notes.trim(),
          notes: notes.trim(),
          ...(newTotal > 0 ? { totalAmount: newTotal } : {}),
        };
      } else {
        const examNames = title
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        updates = {
          examName: examNames[0] || title.trim(),
          exams: examNames.map((name) => ({ name })),
          urgent,
          notes: notes.trim(),
          instructions: notes.trim(),
        };
      }

      await saveEditedPrescribedItem({
        kind: target.kind,
        docId: d.id,
        updates,
        paymentRequests,
        user,
        establishment,
      });

      window.dispatchEvent(
        new CustomEvent('app-notification', {
          detail: { message: '✓ Prescription mise à jour avec succès.', type: 'success' },
        })
      );
      onSaved?.();
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || "L'élément ne peut plus être modifié.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl border border-slate-200 max-w-md w-full p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
            <Edit3 size={18} className="text-blue-600" />
            <span>
              Modifier{' '}
              {target.kind === 'SOIN'
                ? 'le Soin'
                : target.kind === 'PHARMA'
                ? "l'Ordonnance"
                : "l'Examen Labo"}
            </span>
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {errorMsg && (
          <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-xs font-bold text-rose-700">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <label className="text-[11px] font-black uppercase tracking-wider text-slate-600 block mb-1">
              {target.kind === 'LABO' ? 'Examen(s) (séparés par virgule)' : 'Désignation / Type'}
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 outline-none focus:border-blue-500"
              required
            />
          </div>

          {target.kind !== 'LABO' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-black uppercase tracking-wider text-slate-600 block mb-1">
                  {target.kind === 'PHARMA' ? 'Quantité' : 'Durée (jours)'}
                </label>
                <input
                  type="number"
                  min={1}
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="text-[11px] font-black uppercase tracking-wider text-slate-600 block mb-1">
                  {target.kind === 'PHARMA' ? 'Posologie / Dosage' : 'Fréquence / Horaire'}
                </label>
                <input
                  type="text"
                  value={dosageOrFreq}
                  onChange={(e) => setDosageOrFreq(e.target.value)}
                  placeholder={target.kind === 'PHARMA' ? 'Ex: 1 cp 3x/j' : 'Ex: 2x/j, 14:00'}
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 outline-none focus:border-blue-500"
                />
              </div>
            </div>
          )}

          {target.kind === 'LABO' && (
            <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={urgent}
                onChange={(e) => setUrgent(e.target.checked)}
                className="rounded border-slate-300 text-rose-600"
              />
              <span>Examen Urgent</span>
            </label>
          )}

          <div>
            <label className="text-[11px] font-black uppercase tracking-wider text-slate-600 block mb-1">
              Instructions / Observations
            </label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-semibold text-slate-900 outline-none focus:border-blue-500"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-black uppercase tracking-wider cursor-pointer"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-black uppercase tracking-wider cursor-pointer flex items-center gap-1.5"
            >
              <Save size={14} />
              <span>{isSaving ? 'Enregistrement...' : 'Enregistrer'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
