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

export interface ActiveInpatientLocation {
  bedId: string;
  bedName: string;
  roomName: string;
  locationLabel: string;
  inpatientId?: string;
}

/**
 * Checks in-memory beds / rooms / inpatient_records to see if a patient is
 * currently occupying a bed (status === 'OCCUPÉ').
 */
export function findActiveInpatientLocationFromLists(params: {
  patientIds: string[];
  beds: any[];
  rooms?: any[];
  inpatientRecords?: any[];
}): ActiveInpatientLocation | null {
  const cleanIds = Array.from(new Set((params.patientIds || []).filter(Boolean)));
  if (cleanIds.length === 0) return null;

  const occupiedBed = (params.beds || []).find((b) => {
    if (!isBedOccupe(b.status)) return false;
    return (
      (b.patientId && cleanIds.includes(b.patientId)) ||
      (b.patientDme && cleanIds.includes(b.patientDme))
    );
  });

  if (occupiedBed) {
    const roomObj = (params.rooms || []).find((r) => r.id === occupiedBed.roomId);
    const roomName = occupiedBed.roomName || roomObj?.name || 'Chambre';
    const bedName = occupiedBed.name || occupiedBed.bedNumber || 'Lit';
    return {
      bedId: occupiedBed.id,
      bedName,
      roomName,
      locationLabel: `${roomName} - ${bedName}`,
      inpatientId: occupiedBed.currentInpatientId || occupiedBed.inpatientId,
    };
  }

  const activeInp = (params.inpatientRecords || []).find((r) => {
    if (r.status !== 'admitted') return false;
    return (
      (r.patientId && cleanIds.includes(r.patientId)) ||
      (r.patientDme && cleanIds.includes(r.patientDme))
    );
  });

  if (activeInp) {
    const roomName = activeInp.roomName || 'Chambre';
    const bedName = activeInp.bedName || activeInp.bedNumber || 'Lit';
    return {
      bedId: activeInp.bedId || '',
      bedName,
      roomName,
      locationLabel: `${roomName} - ${bedName}`,
      inpatientId: activeInp.id,
    };
  }

  return null;
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
 * Generates chronological, time-stamped nursing task slots starting from NOW() (or a chosen future time).
 * Subsequent doses are strictly calculated as t0 + interval (never in the past).
 */
export function generateCareScheduleTasks(
  frequency: CareFrequencyCode,
  durationDays: number = 1,
  baseDate: Date = new Date()
): ScheduledCareSlot[] {
  const safeDays = Math.max(1, Math.min(30, Math.floor(Number(durationDays) || 1)));
  const slots: ScheduledCareSlot[] = [];

  // Base time t0 MUST never be in the past
  const nowMs = Date.now();
  const requestedMs = baseDate instanceof Date && !isNaN(baseDate.getTime()) ? baseDate.getTime() : nowMs;
  const t0Ms = Math.max(nowMs, requestedMs);

  const formatLocalSlot = (ms: number, dayNumber: number, slotIndex: number): ScheduledCareSlot => {
    const dt = new Date(ms);
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const d = String(dt.getDate()).padStart(2, '0');
    const hh = String(dt.getHours()).padStart(2, '0');
    const mm = String(dt.getMinutes()).padStart(2, '0');
    return {
      scheduledDate: `${y}-${m}-${d}`,
      scheduledTime: `${hh}:${mm}`,
      scheduledAt: dt.toISOString(),
      dayNumber,
      slotIndex,
    };
  };

  if (frequency === 'UNE_FOIS') {
    slots.push(formatLocalSlot(t0Ms, 1, 0));
    return slots;
  }

  const opt = CARE_FREQUENCY_OPTIONS.find(o => o.code === frequency) || CARE_FREQUENCY_OPTIONS[1];
  const dosesPerDay = Math.max(1, opt.times.length || 1);
  const intervalHours = 24 / dosesPerDay;
  const intervalMs = intervalHours * 60 * 60 * 1000;
  const totalSlots = dosesPerDay * safeDays;

  for (let i = 0; i < totalSlots; i++) {
    const slotMs = t0Ms + i * intervalMs;
    const dayNumber = Math.floor(i / dosesPerDay) + 1;
    slots.push(formatLocalSlot(slotMs, dayNumber, i));
  }

  return slots;
}
