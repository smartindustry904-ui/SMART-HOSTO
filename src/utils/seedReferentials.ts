import { collection, doc, getDocs, writeBatch } from 'firebase/firestore';
import { db, sanitizeData } from '../firebase';
import { getActiveTenantId, belongsToTenant, stampTenantData } from './tenant';
import { EstablishmentConfig, User } from '../../types';

export const SEED_CONSULTATIONS = [
  {
    id: 'ACT-CONS-GEN',
    name: 'Consultation Générale',
    price: 10000,
    validite_jours: 14,
    category: 'consultation',
    type: 'acte médical',
    servicePrincipal: 'consultation',
    sousService: 'Médecine générale',
    priorite: 'normal',
    codeInterne: 'ACT-CONS-GEN',
    description: 'Consultation de médecine générale pour adulte ou adolescent (validité 14 jours)',
  },
  {
    id: 'ACT-CONS-PED',
    name: 'Consultation Pédiatrique',
    price: 10000,
    validite_jours: 14,
    category: 'consultation',
    type: 'acte médical',
    servicePrincipal: 'consultation',
    sousService: 'Pédiatrie',
    priorite: 'normal',
    codeInterne: 'ACT-CONS-PED',
    description: 'Consultation pédiatrique pour nourrissons et enfants (validité 14 jours)',
  },
  {
    id: 'ACT-CONS-GYN',
    name: 'Consultation Gynécologique',
    price: 15000,
    validite_jours: 14,
    category: 'consultation',
    type: 'acte médical',
    servicePrincipal: 'consultation',
    sousService: 'Gynécologie',
    priorite: 'normal',
    codeInterne: 'ACT-CONS-GYN',
    description: 'Consultation et suivi gynécologique (validité 14 jours)',
  },
  {
    id: 'ACT-CPN-01',
    name: 'Consultation Prénatale (CPN)',
    price: 5000,
    validite_jours: 14,
    category: 'consultation',
    type: 'acte médical',
    servicePrincipal: 'maternite',
    sousService: 'CPN',
    priorite: 'normal',
    codeInterne: 'ACT-CPN-01',
    description: 'Consultation prénatale de suivi de grossesse',
  },
  {
    id: 'ACT-CONS-SPEC',
    name: 'Consultation Spécialisée',
    price: 20000,
    validite_jours: 14,
    category: 'consultation',
    type: 'acte médical',
    servicePrincipal: 'consultation',
    sousService: 'Spécialité',
    priorite: 'normal',
    codeInterne: 'ACT-CONS-SPEC',
    description: 'Consultation médicale spécialisée (Cardiologie, ORL, Dermatologie, etc.)',
  },
  {
    id: 'ACT-CONS-URG',
    name: 'Consultation Urgence',
    price: 15000,
    validite_jours: 7,
    category: 'consultation',
    type: 'acte médical',
    servicePrincipal: 'urgences',
    sousService: 'Urgences',
    priorite: 'urgent',
    codeInterne: 'ACT-CONS-URG',
    description: 'Prise en charge médicale immédiate aux Urgences (validité 7 jours)',
  },
];

export const SEED_SOINS_INFIRMIERS = [
  { id: 'ACT-SOIN-INJ-IM', name: 'Injection IM', price: 1500, soumis_a_ordonnance: true, requiresPrescription: true, soumisOrdonnance: true },
  { id: 'ACT-SOIN-INJ-IV', name: 'Injection IV', price: 2000, soumis_a_ordonnance: true, requiresPrescription: true, soumisOrdonnance: true },
  { id: 'ACT-SOIN-PERF', name: 'Pose de perfusion', price: 3500, soumis_a_ordonnance: true, requiresPrescription: true, soumisOrdonnance: true },
  { id: 'ACT-SOIN-PANS-SIMPLE', name: 'Pansement simple', price: 2000, soumis_a_ordonnance: false, requiresPrescription: false, soumisOrdonnance: false },
  { id: 'ACT-SOIN-PANS-COMP', name: 'Pansement complexe', price: 5000, soumis_a_ordonnance: false, requiresPrescription: false, soumisOrdonnance: false },
  { id: 'ACT-SOIN-SUTURE', name: 'Suture simple', price: 8000, soumis_a_ordonnance: true, requiresPrescription: true, soumisOrdonnance: true },
  { id: 'ACT-SOIN-ABL-FILS', name: 'Ablation de fils', price: 2500, soumis_a_ordonnance: false, requiresPrescription: false, soumisOrdonnance: false },
  { id: 'ACT-SOIN-NEBUL', name: 'Nébulisation', price: 3000, soumis_a_ordonnance: false, requiresPrescription: false, soumisOrdonnance: false },
  { id: 'ACT-SOIN-LAV-OREILLE', name: "Lavage d'oreille", price: 3000, soumis_a_ordonnance: false, requiresPrescription: false, soumisOrdonnance: false },
  { id: 'ACT-SOIN-SOND-URIN', name: 'Sondage urinaire', price: 5000, soumis_a_ordonnance: false, requiresPrescription: false, soumisOrdonnance: false },
];

export const SEED_LAB_EXAMS = [
  { id: 'LAB-GE', name: 'Goutte Épaisse (GE)', price: 2000, category: 'Parasitologie' },
  { id: 'LAB-TDR-PALU', name: 'TDR Paludisme', price: 2000, category: 'Parasitologie' },
  { id: 'LAB-NFS', name: 'Numération Formule Sanguine (NFS)', price: 5000, category: 'Hématologie' },
  { id: 'LAB-GLYC', name: 'Glycémie à jeun', price: 2500, category: 'Biochimie' },
  { id: 'LAB-ECBU', name: 'ECBU', price: 6000, category: 'Bactériologie' },
  { id: 'LAB-WIDAL', name: 'Sérologie Widal & Félix', price: 5000, category: 'Sérologie' },
  { id: 'LAB-GSRH', name: 'Groupe Sanguin / Rhésus', price: 3500, category: 'Hématologie' },
  { id: 'LAB-CREAT', name: 'Créatininémie', price: 3500, category: 'Biochimie' },
  { id: 'LAB-TRANSAM', name: 'Transaminases (ASAT/ALAT)', price: 6000, category: 'Biochimie' },
  { id: 'LAB-BHCG', name: 'Test de Grossesse (B-HCG)', price: 4000, category: 'Sérologie' },
  { id: 'LAB-KAOP', name: 'Examen parasitologique des selles (KAOP)', price: 3500, category: 'Parasitologie' },
  { id: 'LAB-CRP', name: 'CRP', price: 4500, category: 'Biochimie' },
];

export const SEED_MEDICATIONS = [
  { id: 'MED-PARA-500-1G', name: 'Paracétamol 500mg / 1g', category: 'Antalgique / Antipyrétique', price: 500, stock: 250, minStock: 40, unit: 'Boîte/Plaquette', soumis_a_ordonnance: false },
  { id: 'MED-COARTEM', name: 'Artéméther-Luméfantrine (Coartem)', category: 'Antipaludique', price: 2500, stock: 120, minStock: 25, unit: 'Boîte', soumis_a_ordonnance: true },
  { id: 'MED-AMOX-500', name: 'Amoxicilline 500mg', category: 'Antibiotique', price: 1500, stock: 180, minStock: 30, unit: 'Boîte', soumis_a_ordonnance: true },
  { id: 'MED-CIPRO-500', name: 'Ciprofloxacine 500mg', category: 'Antibiotique', price: 2500, stock: 100, minStock: 20, unit: 'Boîte', soumis_a_ordonnance: true },
  { id: 'MED-METRO-500', name: 'Métronidazole 500mg', category: 'Antibiotique / Antiparasitaire', price: 1200, stock: 150, minStock: 25, unit: 'Boîte', soumis_a_ordonnance: true },
  { id: 'MED-OMEP-20', name: 'Oméprazole 20mg', category: 'Gastro-entérologie', price: 1800, stock: 140, minStock: 20, unit: 'Boîte', soumis_a_ordonnance: true },
  { id: 'MED-IBUP-400', name: 'Ibuprofène 400mg', category: 'Anti-inflammatoire (AINS)', price: 1000, stock: 200, minStock: 30, unit: 'Boîte', soumis_a_ordonnance: false },
  { id: 'MED-SERUM-PHY', name: 'Sérum Physiologique 0.9% (500ml)', category: 'Soluté de perfusion', price: 1200, stock: 120, minStock: 25, unit: 'Flacon 500ml', soumis_a_ordonnance: true },
  { id: 'MED-SERUM-GLU5', name: 'Sérum Glucosé 5% (500ml)', category: 'Soluté de perfusion', price: 1200, stock: 120, minStock: 25, unit: 'Flacon 500ml', soumis_a_ordonnance: true },
  { id: 'MED-RINGER-LAC', name: 'Ringer Lactate (500ml)', category: 'Soluté de perfusion', price: 1500, stock: 100, minStock: 20, unit: 'Flacon 500ml', soumis_a_ordonnance: true },
];

export const SEED_CONSUMABLES = [
  { id: 'CONS-GANTS-EXAM', name: "Gants d'examen", category: 'Protection', stock: 500, minStock: 50, unit: 'Paire', price: 200 },
  { id: 'CONS-SER-5ML', name: 'Seringue 5ml', category: 'Injection', stock: 400, minStock: 50, unit: 'Unité', price: 200 },
  { id: 'CONS-SER-10ML', name: 'Seringue 10ml', category: 'Injection', stock: 300, minStock: 40, unit: 'Unité', price: 300 },
  { id: 'CONS-COMP-STER', name: 'Compresses stériles', category: 'Pansement', stock: 350, minStock: 40, unit: 'Paquet', price: 500 },
  { id: 'CONS-BETADINE-J', name: 'Bétadine jaune', category: 'Antiseptique', stock: 80, minStock: 15, unit: 'Flacon', price: 2500 },
  { id: 'CONS-KTV', name: 'Cathéter veineux', category: 'Perfusion', stock: 200, minStock: 30, unit: 'Unité', price: 800 },
  { id: 'CONS-PERFUSEUR', name: 'Perfuseur', category: 'Perfusion', stock: 250, minStock: 30, unit: 'Unité', price: 600 },
  { id: 'CONS-COTON-HYD', name: 'Coton hydrophile', category: 'Pansement', stock: 100, minStock: 20, unit: 'Rouleau', price: 1500 },
  { id: 'CONS-BANDE-VEL', name: 'Bande Velpeau', category: 'Pansement', stock: 150, minStock: 25, unit: 'Rouleau', price: 800 },
];

/**
 * Idempotently seeds common Medical Acts (Consultations, Soins Infirmiers, Lab Exams),
 * Pharmacy Medications, and Hospital Consumables into Firestore without creating duplicates.
 */
export async function seedCommonReferentials(
  user?: User | null,
  establishment?: EstablishmentConfig | null
): Promise<{ addedActs: number; addedMeds: number; addedConsumables: number }> {
  const activeTenantId = getActiveTenantId(user, establishment);
  const nowIso = new Date().toISOString();

  const [actsSnap, medsSnap, consSnap] = await Promise.all([
    getDocs(collection(db, 'medical_acts')),
    getDocs(collection(db, 'pharmacy_inventory')),
    getDocs(collection(db, 'hospital_consumables')),
  ]);

  const existingActKeys = new Set<string>();
  actsSnap.docs.forEach((d) => {
    const data = d.data();
    if (!belongsToTenant(data, activeTenantId)) return;
    existingActKeys.add(d.id);
    if (data.name) existingActKeys.add(String(data.name).trim().toLowerCase());
  });

  const existingMedKeys = new Set<string>();
  medsSnap.docs.forEach((d) => {
    const data = d.data();
    if (!belongsToTenant(data, activeTenantId)) return;
    existingMedKeys.add(d.id);
    if (data.name) existingMedKeys.add(String(data.name).trim().toLowerCase());
  });

  const existingConsKeys = new Set<string>();
  consSnap.docs.forEach((d) => {
    const data = d.data();
    if (!belongsToTenant(data, activeTenantId)) return;
    existingConsKeys.add(d.id);
    if (data.name) existingConsKeys.add(String(data.name).trim().toLowerCase());
  });

  const batch = writeBatch(db);
  let addedActs = 0;
  let addedMeds = 0;
  let addedConsumables = 0;

  // 1. Seed Consultations
  for (const c of SEED_CONSULTATIONS) {
    if (existingActKeys.has(c.id) || existingActKeys.has(c.name.toLowerCase())) continue;
    const ref = doc(db, 'medical_acts', c.id);
    batch.set(ref, sanitizeData(stampTenantData({
      ...c,
      validityDays: c.validite_jours,
      status: 'active',
      createdAt: nowIso,
      updatedAt: nowIso,
    }, user, establishment)), { merge: true });
    addedActs++;
  }

  // 2. Seed Soins Infirmiers
  for (const s of SEED_SOINS_INFIRMIERS) {
    if (existingActKeys.has(s.id) || existingActKeys.has(s.name.toLowerCase())) continue;
    const ref = doc(db, 'medical_acts', s.id);
    batch.set(ref, sanitizeData(stampTenantData({
      ...s,
      category: 'soin',
      type: 'acte infirmier',
      servicePrincipal: 'SRV-INFIRMIER',
      sousService: 'Soins Infirmiers',
      priorite: 'normal',
      codeInterne: s.id,
      status: 'active',
      createdAt: nowIso,
      updatedAt: nowIso,
    }, user, establishment)), { merge: true });
    addedActs++;
  }

  // 3. Seed Lab Exams
  for (const ex of SEED_LAB_EXAMS) {
    if (existingActKeys.has(ex.id) || existingActKeys.has(ex.name.toLowerCase())) continue;
    const ref = doc(db, 'medical_acts', ex.id);
    batch.set(ref, sanitizeData(stampTenantData({
      ...ex,
      type: 'examen',
      servicePrincipal: 'SRV-LABO',
      sousService: 'Laboratoire',
      priorite: 'normal',
      codeInterne: ex.id,
      status: 'active',
      createdAt: nowIso,
      updatedAt: nowIso,
    }, user, establishment)), { merge: true });
    addedActs++;
  }

  // 4. Seed Pharmacy Medications
  for (const med of SEED_MEDICATIONS) {
    if (existingMedKeys.has(med.id) || existingMedKeys.has(med.name.toLowerCase())) continue;
    const ref = doc(db, 'pharmacy_inventory', med.id);
    batch.set(ref, sanitizeData(stampTenantData({
      ...med,
      requiresPrescription: med.soumis_a_ordonnance,
      status: 'available',
      createdAt: nowIso,
      updatedAt: nowIso,
    }, user, establishment)), { merge: true });
    addedMeds++;
  }

  // 5. Seed Hospital Consumables
  for (const cons of SEED_CONSUMABLES) {
    if (existingConsKeys.has(cons.id) || existingConsKeys.has(cons.name.toLowerCase())) continue;
    const ref = doc(db, 'hospital_consumables', cons.id);
    batch.set(ref, sanitizeData(stampTenantData({
      ...cons,
      createdAt: nowIso,
      updatedAt: nowIso,
    }, user, establishment)), { merge: true });
    addedConsumables++;
  }

  if (addedActs + addedMeds + addedConsumables > 0) {
    await batch.commit();
  }

  return { addedActs, addedMeds, addedConsumables };
}
