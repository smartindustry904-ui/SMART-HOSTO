import { BedStatus } from '../../types';

/**
 * Normalizes any bed status string (French canonical or legacy English)
 * to one of the 3 strict states: 'LIBRE' | 'OCCUPÉ' | 'EN NETTOYAGE'.
 */
export function normalizeBedStatus(status?: string): 'LIBRE' | 'OCCUPÉ' | 'EN NETTOYAGE' {
  const s = String(status || '').trim().toUpperCase();
  if (s === 'OCCUPÉ' || s === 'OCCUPE' || s === 'OCCUPIED') return 'OCCUPÉ';
  if (s === 'EN NETTOYAGE' || s === 'EN_NETTOYAGE' || s === 'CLEANING' || s === 'MAINTENANCE') return 'EN NETTOYAGE';
  return 'LIBRE';
}

export function isBedLibre(status?: BedStatus | string): boolean {
  return normalizeBedStatus(status) === 'LIBRE';
}

export function isBedOccupe(status?: BedStatus | string): boolean {
  return normalizeBedStatus(status) === 'OCCUPÉ';
}

export function isBedEnNettoyage(status?: BedStatus | string): boolean {
  return normalizeBedStatus(status) === 'EN NETTOYAGE';
}

export type CareFrequencyCode =
  | 'UNE_FOIS'
  | 'Q6H'
  | 'Q8H'
  | 'Q12H'
  | 'MATIN_MIDI_SOIR'
  | 'MATIN_SOIR'
  | 'QUOTIDIEN';

export interface CareFrequencyOption {
  code: CareFrequencyCode;
  label: string;
  times: string[]; // HH:MM slots per 24h cycle
  description: string;
}

export const CARE_FREQUENCY_OPTIONS: CareFrequencyOption[] = [
  { code: 'UNE_FOIS', label: 'Une fois (Immédiat)', times: [], description: 'Acte unique planifié immédiatement' },
  { code: 'Q6H', label: 'Toutes les 6 heures (4x/j)', times: ['08:00', '14:00', '20:00', '02:00'], description: '08:00, 14:00, 20:00, 02:00' },
  { code: 'Q8H', label: 'Toutes les 8 heures (3x/j)', times: ['08:00', '16:00', '00:00'], description: '08:00, 16:00, 00:00' },
  { code: 'Q12H', label: 'Toutes les 12 heures (2x/j)', times: ['08:00', '20:00'], description: '08:00, 20:00' },
  { code: 'MATIN_MIDI_SOIR', label: 'Matin / Midi / Soir (3x/j)', times: ['08:00', '13:00', '19:00'], description: '08:00, 13:00, 19:00' },
  { code: 'MATIN_SOIR', label: 'Matin & Soir (2x/j)', times: ['08:00', '20:00'], description: '08:00, 20:00' },
  { code: 'QUOTIDIEN', label: '1 fois / jour', times: ['08:00'], description: '08:00 chaque jour' }
];

export interface ScheduledCareSlot {
  scheduledDate: string; // YYYY-MM-DD
  scheduledTime: string; // HH:MM
  scheduledAt: string;   // ISO string for chronological sorting
  dayNumber: number;
  slotIndex: number;
}

/**
 * Generates chronological, time-stamped nursing task slots from a frequency & duration (in days).
 * For example, 'Q6H' for 1 day generates 4 tasks at 08:00, 14:00, 20:00, and 02:00 (next morning).
 */
export function generateCareScheduleTasks(
  frequency: CareFrequencyCode,
  durationDays: number = 1,
  baseDate: Date = new Date()
): ScheduledCareSlot[] {
  const safeDays = Math.max(1, Math.min(30, Math.floor(Number(durationDays) || 1)));
  const slots: ScheduledCareSlot[] = [];

  if (frequency === 'UNE_FOIS') {
    const hh = String(baseDate.getHours()).padStart(2, '0');
    const mm = String(baseDate.getMinutes()).padStart(2, '0');
    const dateStr = baseDate.toISOString().split('T')[0];
    slots.push({
      scheduledDate: dateStr,
      scheduledTime: `${hh}:${mm}`,
      scheduledAt: baseDate.toISOString(),
      dayNumber: 1,
      slotIndex: 0
    });
    return slots;
  }

  const opt = CARE_FREQUENCY_OPTIONS.find(o => o.code === frequency) || CARE_FREQUENCY_OPTIONS[1];
  const times = opt.times;

  for (let day = 0; day < safeDays; day++) {
    for (let idx = 0; idx < times.length; idx++) {
      const timeStr = times[idx];
      const [hStr, mStr] = timeStr.split(':');
      const hour = Number(hStr);
      const minute = Number(mStr);

      // Hours like 00:00 or 02:00 in a 08:00-start cycle belong to the night/early morning of (day + 1)
      const dayOffset = hour < 6 ? day + 1 : day;
      const slotDate = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate() + dayOffset, hour, minute, 0, 0);
      const y = slotDate.getFullYear();
      const m = String(slotDate.getMonth() + 1).padStart(2, '0');
      const d = String(slotDate.getDate()).padStart(2, '0');

      slots.push({
        scheduledDate: `${y}-${m}-${d}`,
        scheduledTime: timeStr,
        scheduledAt: slotDate.toISOString(),
        dayNumber: day + 1,
        slotIndex: idx
      });
    }
  }

  return slots.sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
}
