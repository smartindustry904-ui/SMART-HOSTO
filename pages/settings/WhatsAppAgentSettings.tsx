import React, { useState, useEffect, useRef } from 'react';
import {
  MessageSquare,
  Send,
  Key,
  CheckCircle2,
  AlertCircle,
  Copy,
  RefreshCw,
  Smartphone,
  Sparkles,
  Shield,
  Users,
  Terminal,
  Save,
  ExternalLink,
  Bot,
  Phone,
  CheckCheck,
  Zap,
  Lock
} from 'lucide-react';
import { User } from '../../types';
import { db, sanitizeData } from '../../src/firebase';
import {
  doc,
  setDoc,
  getDoc,
  getDocs,
  getDocsFromCache,
  collection,
  query,
  limit
} from 'firebase/firestore';

interface WhatsAppAgentSettingsProps {
  currentUser: User | null;
  usersList?: User[];
  staffOnlyMode?: boolean;
  theme?: 'light' | 'dark';
  onUserPhoneUpdated?: (newPhone: string) => void;
}

interface ChatBubble {
  id: string;
  sender: 'USER' | 'AGENT';
  text: string;
  timestamp: string;
  modelUsed?: string;
  metaSent?: boolean;
}

const DEFAULT_SYSTEM_PROMPT = `Tu es l'Assistant Exécutif Hospitalier officiel sur WhatsApp pour la plateforme hospitalière SMART-HOSTO.
Tu t'adresses aux praticiens, cadres de santé et directeurs médicaux/administratifs de l'établissement.

DIRECTIVES MAJEURES DE STYLE ET MISE EN FORME PROFESSIONNELLE :
1. TON EXÉCUTIF & MÉDICAL :
   - Adopte une posture formelle, courtoise, rigoureuse et institutionnelle d'un Système d'Information Hospitalier (SIH) de référence.
   - Évite formellement les accumulations d'emojis informels ou enfantins. Utilise uniquement des marqueurs fonctionnels sobres (ex: [PAYÉ], [EN ATTENTE], [URGENT], ▪, ▫, 🏥).
   - Salutation protocolaire : "Bonjour Dr [Nom]" pour les praticiens, "Bonjour [Nom] — Direction Administrative" pour les administrateurs.

2. CARTES ET EN-TÊTES DE MODULES :
   - Structure tes messages avec des cartes délimitées par des séparateurs horizontaux propres :
     ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     🏥 *SMART-HOSTO* • *[TITRE DU RAPPORT]*
     ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

3. TABLEAUX & GRILLES ALIGNÉES EN MONOSPACE (Triple Backticks \`\`\`) :
   - WhatsApp prend parfaitement en charge les blocs de texte monospace grâce aux triples apostrophes inverses (\`\`\`).
   - Pour TOUTE liste de 2 éléments ou plus (patients, lits, factures, tarifs, stocks), utilise OBLIGATOIREMENT un bloc monospace pour afficher un tableau à colonnes alignées :
   Exemple pour les patients / hospitalisations :
   \`\`\`
   PATIENT          LIT       DATE ADM.   STATUT
   ───────────────────────────────────────────
   DERAIN DJOFANG   Lit 1    17/07/2026  Attente
   nkounadji DJOF.  Lit 3    17/07/2026  Attente
   DERA DJOFANG     Lit 2    04/08/2026  Attente
   \`\`\`
   Exemple pour les commissions et actes :
   \`\`\`
   DATE     ACTE            HONORAIRES  STATUT
   ───────────────────────────────────────────
   09/11    Consultation      +750 F    Attente
   06/11    Consultation      +750 F    Attente
   \`\`\`
   Exemple pour la pharmacie :
   \`\`\`
   ARTICLE             STOCK  SEUIL  STATUT
   ───────────────────────────────────────────
   Doliprane 1000mg       2     10   CRITIQUE
   Amoxicilline 500mg    45     15   Normal
   \`\`\`

4. ENCADRÉS KPI & CHIFFRES CLÉS :
   - Présente les métriques financières ou capacitaires sous forme de fiches synthétiques encadrées :
   ┌────────────────────────────────────────┐
   │ COMMISSIONS EN ATTENTE : 1 500 FCFA    │
   │ DOSSIERS CLÔTURÉS      : 3             │
   └────────────────────────────────────────┘

5. RÈGLES MÉTIER :
   - Devise obligatoire : FCFA.
   - Respect absolu de la confidentialité et du rôle : seul le profil ADMIN a accès aux agrégats de caisse et finances globales de l'établissement.
   - Signature en pied de page :
     ─────────────────────────────
     _SMART-HOSTO SIH • Données certifiées en temps réel_`;

// Helper to parse JSON safely without throwing "Unexpected end of JSON input"
async function safeParseJson(res: Response): Promise<any | null> {
  try {
    const text = await res.text();
    if (!text || !text.trim()) return null;
    const trimmed = text.trim();
    if (trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html')) return null;
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

// Helper to read Firestore collection cache-first (instant 0ms if cached in IndexedDB)
async function getCollectionCacheFirst(colName: string) {
  const colRef = collection(db, colName);
  try {
    const cached = await getDocsFromCache(colRef);
    if (!cached.empty) {
      getDocs(colRef).catch(() => {});
      return cached;
    }
  } catch {}
  return await Promise.race([
    getDocs(colRef),
    new Promise<any>((_, reject) => setTimeout(() => reject(new Error('timeout')), 3500))
  ]);
}

async function buildClientHospitalContext(staffUser: any) {
  const targetStaffId = String(staffUser?.id || '').trim();
  const staffNameLower = String(staffUser?.name || '').toLowerCase().trim();
  const staffEmailLower = String(staffUser?.email || '').toLowerCase().trim();
  const staffRole = String(staffUser?.role || staffUser?.profession || 'MEDECIN').toUpperCase();
  const isAdmin = staffRole.includes('ADMIN') || staffRole.includes('SUPER');

  let defaultRate = Number(staffUser?.quotePartRate) || 0;
  if (!defaultRate) {
    if (staffRole.includes('MEDECIN') || staffRole.includes('DOCTOR') || staffRole.includes('CHIRURGIEN')) defaultRate = 20;
    else if (staffRole.includes('MATERNITE') || staffRole.includes('SAGE_FEMME')) defaultRate = 15;
    else if (staffRole.includes('INFIRMIER') || staffRole.includes('NURSE')) defaultRate = 10;
    else if (staffRole.includes('LAB') || staffRole.includes('BIOLOGISTE')) defaultRate = 10;
    else defaultRate = 5;
  }

  const [cSnap, naSnap, prSnap, qSnap, mSnap, aSnap] = await Promise.all([
    getCollectionCacheFirst('consultations').catch(() => null),
    getCollectionCacheFirst('nursing_acts').catch(() => null),
    getCollectionCacheFirst('payment_requests').catch(() => null),
    getCollectionCacheFirst('service_queues').catch(() => null),
    getCollectionCacheFirst('pharmacy_inventory').catch(() => null),
    getCollectionCacheFirst('medical_acts').catch(() => null)
  ]);

  const personalActs: Array<{
    id: string;
    type: string;
    typeLabel: string;
    date: string;
    patientName: string;
    amount: number;
    commissionAmount: number;
    paymentStatus: 'PAID' | 'PENDING';
  }> = [];

  if (cSnap) {
    cSnap.forEach((d: any) => {
      const c = d.data();
      const isClotured =
        c.isClotured === true ||
        ['cloture', 'CLOTURE', 'completed', 'TERMINEE', 'FAIT'].includes(String(c.status || ''));
      if (!isClotured) return;

      const cDoctor = String(c.practitionerName || c.doctor || c.doctorName || '').toLowerCase().trim();
      const cEmail = String(c.doctorEmail || '').toLowerCase().trim();
      const cDocId = String(c.practitionerId || c.doctorId || '').trim();
      if (
        cDocId === targetStaffId ||
        (staffNameLower && cDoctor === staffNameLower) ||
        (staffEmailLower && cEmail === staffEmailLower)
      ) {
        const fee = Number(c.fee || c.amount || c.cost || 15000);
        const rate = Number(c.quotePartRate) || defaultRate;
        const comm = Math.round((fee * rate) / 100);
        const isPaid = c.paymentStatus === 'PAID' || c.paymentStatus === 'SOLDE';
        personalActs.push({
          id: d.id,
          type: 'CONSULTATION',
          typeLabel: c.specialty || c.type || 'Consultation Médicale',
          date: c.cloturedAt || c.createdAt || c.date || new Date().toISOString(),
          patientName: c.patientName || c.patient || 'Patient',
          amount: fee,
          commissionAmount: comm,
          paymentStatus: isPaid ? 'PAID' : 'PENDING'
        });
      }
    });
  }

  if (naSnap) {
    naSnap.forEach((d: any) => {
      const na = d.data();
      const isDone =
        na.isClotured === true ||
        ['FAIT', 'cloture', 'COMPLETED'].includes(String(na.status || ''));
      if (!isDone) return;

      const naPracId = String(na.practitionerId || na.nurseId || na.executedById || '').trim();
      const naPracName = String(na.practitionerName || na.executedBy || '').toLowerCase().trim();
      if (naPracId === targetStaffId || (staffNameLower && naPracName === staffNameLower)) {
        const fee = Number(na.price || na.amount || na.cost || 5000);
        const rate = Number(na.quotePartRate) || defaultRate;
        const comm = Math.round((fee * rate) / 100);
        const isPaid = na.paymentStatus === 'PAID' || na.paymentStatus === 'SOLDE';
        personalActs.push({
          id: d.id,
          type: 'SOIN',
          typeLabel: na.actName || 'Soin Infirmier',
          date: na.cloturedAt || na.executedAt || na.createdAt || new Date().toISOString(),
          patientName: na.patientName || 'Patient',
          amount: fee,
          commissionAmount: comm,
          paymentStatus: isPaid ? 'PAID' : 'PENDING'
        });
      }
    });
  }

  if (prSnap) {
    prSnap.forEach((d: any) => {
      const pr = d.data();
      const isClotured =
        pr.isClotured === true ||
        ['cloture', 'FAIT', 'COMPLETED'].includes(String(pr.actStatus || ''));
      if (!isClotured) return;

      const prDoc = String(pr.practitionerName || pr.doctor || pr.doctorName || '').toLowerCase().trim();
      const prDocId = String(pr.practitionerId || pr.doctorId || '').trim();
      if (prDocId === targetStaffId || (staffNameLower && prDoc === staffNameLower)) {
        const already = personalActs.some(a => a.id === d.id);
        if (!already) {
          const fee = Number(pr.totalAmount || pr.amount || 0);
          const rate = Number(pr.quotePartRate) || defaultRate;
          const comm = Math.round((fee * rate) / 100);
          const isPaid = pr.status === 'PAID' || pr.paymentStatus === 'PAID';
          personalActs.push({
            id: d.id,
            type: 'AUTRE',
            typeLabel: pr.type || 'Acte Médical',
            date: pr.cloturedAt || pr.createdAt || pr.date || new Date().toISOString(),
            patientName: pr.patientName || 'Patient',
            amount: fee,
            commissionAmount: comm,
            paymentStatus: isPaid ? 'PAID' : 'PENDING'
          });
        }
      }
    });
  }

  personalActs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const totalConsultations = personalActs.filter(a => a.type === 'CONSULTATION').length;
  const totalActs = personalActs.length;
  const totalCommissionsEarned = personalActs.reduce((sum, a) => sum + a.commissionAmount, 0);
  const totalCommissionsPaid = personalActs
    .filter(a => a.paymentStatus === 'PAID')
    .reduce((sum, a) => sum + a.commissionAmount, 0);
  const totalCommissionsPending = totalCommissionsEarned - totalCommissionsPaid;

  const today = new Date().toISOString().split('T')[0];
  const waitingPatients: Array<{
    name: string;
    motif: string;
    service: string;
    status: string;
    priority: string;
  }> = [];

  if (qSnap) {
    qSnap.forEach((d: any) => {
      const qData = d.data();
      const isToday = !qData.createdAt || String(qData.createdAt).startsWith(today);
      if (
        isToday &&
        ['waiting', 'waiting_triage', 'in_consultation', 'called'].includes(String(qData.status || 'waiting'))
      ) {
        waitingPatients.push({
          name: `${qData.firstName || ''} ${qData.lastName || ''}`.trim() || qData.patientName || 'Patient',
          motif: qData.motifLabel || qData.motif || 'Consultation',
          service: qData.service || qData.queueName || 'Médecine Générale',
          status: qData.status || 'waiting',
          priority: qData.priority || 'normal'
        });
      }
    });
  }

  const medications: Array<{ name: string; stock: number; price: number; alertThreshold: number }> = [];
  if (mSnap) {
    mSnap.forEach((d: any) => {
      const m = d.data();
      medications.push({
        name: m.name || d.id,
        stock: Number(m.stock) || 0,
        price: Number(m.price || m.prixVente) || 0,
        alertThreshold: Number(m.seuilAlerte) || 10
      });
    });
  }
  const lowStockMeds = medications.filter(m => m.stock <= m.alertThreshold);

  const medicalActsCatalog: Array<{ name: string; price: number; category: string }> = [];
  if (aSnap) {
    aSnap.forEach((d: any) => {
      const a = d.data();
      medicalActsCatalog.push({
        name: a.name || a.nom || d.id,
        price: Number(a.price || a.prixBase) || 0,
        category: a.category || a.categorie || 'Général'
      });
    });
  }

  let adminSummary: any = null;
  if (isAdmin) {
    let pendingCashierCount = 0;
    let pendingCashierAmount = 0;
    if (prSnap) {
      prSnap.forEach((d: any) => {
        const pr = d.data();
        if (pr.status === 'PENDING' || pr.paymentStatus === 'PENDING') {
          pendingCashierCount++;
          pendingCashierAmount += Number(pr.totalAmount || pr.amount || 0);
        }
      });
    }
    adminSummary = {
      licence: 'Active',
      activeStaffUsers: 1,
      maxStaffUsers: 25,
      pendingCashierInvoicesCount: pendingCashierCount,
      pendingCashierAmountFCFA: pendingCashierAmount
    };
  }

  return {
    currentDate: new Date().toLocaleString('fr-FR'),
    staff: {
      id: targetStaffId,
      name: staffUser?.name || 'Personnel Soignant',
      role: staffRole,
      profession: staffUser?.profession || 'Praticien Hospitalier',
      quotePartRatePercent: defaultRate
    },
    personalFinanceAndActs: {
      totalConsultations,
      totalActs,
      totalCommissionsEarnedFCFA: totalCommissionsEarned,
      totalCommissionsPaidFCFA: totalCommissionsPaid,
      totalCommissionsPendingFCFA: totalCommissionsPending,
      recentActs: personalActs.slice(0, 6)
    },
    waitingQueueToday: {
      totalWaiting: waitingPatients.length,
      urgentCount: waitingPatients.filter(p => p.priority === 'urgent' || p.priority === 'critique').length,
      patients: waitingPatients.slice(0, 10)
    },
    pharmacy: {
      totalMedicationsInCatalog: medications.length,
      lowStockCount: lowStockMeds.length,
      lowStockAlerts: lowStockMeds.slice(0, 8),
      sampleInventory: medications.slice(0, 25)
    },
    tariffsCatalog: medicalActsCatalog.slice(0, 25),
    ...(adminSummary ? { adminHospitalSummary: adminSummary } : {})
  };
}

function buildLocalFallbackReply(messageText: string, ctx: Awaited<ReturnType<typeof buildClientHospitalContext>>): string {
  const lower = messageText.trim().toLowerCase();
  const s = ctx.staff;
  const fin = ctx.personalFinanceAndActs;

  if (lower.includes('aide') || lower.includes('menu') || lower.includes('help') || lower === '/start' || lower === 'bonjour' || lower === 'salut') {
    return (
      `👋 *Bonjour ${s.name}* (${s.profession})\n` +
      `Bienvenue sur l'Assistant WhatsApp IA *SMART-HOSTO*.\n\n` +
      `Voici ce que vous pouvez me demander en langage naturel ou par commande :\n` +
      `• 📊 *"Mes commissions"* ou */stats* : Vos actes clôturés et quotes-parts gagnées\n` +
      `• 🏥 *"File d'attente"* ou */file* : Patients en attente aujourd'hui\n` +
      `• 💊 *"Stock [médicament]"* ou */stock* : Disponibilité et alertes pharmacie\n` +
      `• 💰 *"Tarif [acte]"* ou */tarif* : Prix des consultations et examens\n` +
      (ctx.adminHospitalSummary ? `• 🛡️ *"Bilan admin"* ou */admin* : Factures caisse en attente\n` : '') +
      `\n_Propulsé par Meta Cloud API & Google Gemini_`
    );
  }

  if (lower.includes('commission') || lower.includes('stat') || lower.includes('finance') || lower.includes('quote') || lower.includes('salaire') || lower.includes('acte')) {
    const recentList =
      fin.recentActs.length > 0
        ? fin.recentActs
            .slice(0, 4)
            .map(a => `  - ${a.date.slice(0, 10)} : *${a.typeLabel}* (${a.patientName}) → +${a.commissionAmount.toLocaleString('fr-FR')} FCFA [${a.paymentStatus === 'PAID' ? '✅ Payé' : '⏳ En attente'}]`)
            .join('\n')
        : '  _Aucun acte clôturé enregistré pour votre profil sur cette période._';

    return (
      `📊 *Bilan d'Activité & Quotes-Parts — ${s.name}*\n` +
      `• Rôle : *${s.role}* (${s.profession})\n` +
      `• Taux de quote-part : *${s.quotePartRatePercent}%*\n` +
      `• Consultations clôturées : *${fin.totalConsultations}*\n` +
      `• Total actes réalisés : *${fin.totalActs}*\n\n` +
      `💰 *Situation Financière :*\n` +
      `• Commissions générées : *${fin.totalCommissionsEarnedFCFA.toLocaleString('fr-FR')} FCFA*\n` +
      `• Déjà réglées (Payées) : *${fin.totalCommissionsPaidFCFA.toLocaleString('fr-FR')} FCFA*\n` +
      `• Solde en attente : *${fin.totalCommissionsPendingFCFA.toLocaleString('fr-FR')} FCFA*\n\n` +
      `📋 *Derniers actes clôturés :*\n${recentList}`
    );
  }

  if (lower.includes('file') || lower.includes('attente') || lower.includes('patient') || lower.includes('queue') || lower.includes('salle')) {
    const q = ctx.waitingQueueToday;
    if (q.totalWaiting === 0) {
      return `🏥 *File d'Attente du Jour*\nAucun patient n'est actuellement en salle d'attente ou en triage.`;
    }
    const list = q.patients
      .slice(0, 6)
      .map((p, idx) => `${idx + 1}. *${p.name}* — ${p.motif} (${p.service}) ${p.priority === 'urgent' ? '🚨 *URGENT*' : ''}`)
      .join('\n');
    return (
      `🏥 *File d'Attente en Temps Réel (${q.totalWaiting} patient${q.totalWaiting > 1 ? 's' : ''})*\n` +
      `• Urgences signalées : *${q.urgentCount}*\n\n` +
      `${list}`
    );
  }

  if (lower.includes('stock') || lower.includes('pharmacie') || lower.includes('medicament') || lower.includes('médicament') || lower.includes('paracetamol') || lower.includes('paracétamol')) {
    const searchTerms = lower
      .replace(/stock|pharmacie|médicament|medicament|vérifier|verifier|disponibilité|quel|est|le|point|du|et|les|alertes|de|rupture|\?/g, '')
      .trim();

    if (searchTerms.length >= 2) {
      const matches = ctx.pharmacy.sampleInventory.filter(m => m.name.toLowerCase().includes(searchTerms));
      if (matches.length > 0) {
        return (
          `💊 *Recherche Pharmacie ("${searchTerms}") :*\n` +
          matches
            .map(
              m =>
                `• *${m.name}* : *${m.stock} en stock* — Prix : ${m.price.toLocaleString('fr-FR')} FCFA ${
                  m.stock <= m.alertThreshold ? '⚠️ _(Stock bas)_' : '✅'
                }`
            )
            .join('\n')
        );
      }
    }

    const alerts =
      ctx.pharmacy.lowStockAlerts.length > 0
        ? ctx.pharmacy.lowStockAlerts.map(m => `  - ⚠️ *${m.name}* : ${m.stock} unité(s) (Seuil: ${m.alertThreshold})`).join('\n')
        : '  ✅ Aucune rupture ou alerte critique.';

    return (
      `💊 *Point Stock Pharmacie Central*\n` +
      `• Références au catalogue : *${ctx.pharmacy.totalMedicationsInCatalog}*\n` +
      `• Médicaments en alerte de stock : *${ctx.pharmacy.lowStockCount}*\n\n` +
      `*Alertes prioritaires :*\n${alerts}`
    );
  }

  if (lower.includes('tarif') || lower.includes('prix') || lower.includes('cout') || lower.includes('coût')) {
    if (ctx.tariffsCatalog.length === 0) {
      return `💰 *Catalogue des Tarifs*\nConsultation standard : *15 000 FCFA* • Soin infirmier : *5 000 FCFA*.`;
    }
    const items = ctx.tariffsCatalog
      .slice(0, 8)
      .map(a => `• *${a.name}* (${a.category}) : *${a.price.toLocaleString('fr-FR')} FCFA*`)
      .join('\n');
    return `💰 *Référentiel des Tarifs SMART-HOSTO :*\n${items}`;
  }

  if (ctx.adminHospitalSummary && (lower.includes('admin') || lower.includes('quota') || lower.includes('licence') || lower.includes('caisse'))) {
    const adm = ctx.adminHospitalSummary;
    return (
      `🛡️ *Synthèse Direction / Administration*\n` +
      `• Factures en attente Caisse : *${adm.pendingCashierInvoicesCount}* (${adm.pendingCashierAmountFCFA.toLocaleString('fr-FR')} FCFA)\n` +
      `• Patients en file d'attente : *${ctx.waitingQueueToday.totalWaiting}*\n` +
      `• Alertes stock pharmacie : *${ctx.pharmacy.lowStockCount}*`
    );
  }

  return (
    `🤖 *Assistant IA SMART-HOSTO (${s.name})*\n\n` +
    `Voici votre résumé rapide en direct :\n` +
    `• Actes clôturés : *${fin.totalActs}* (${fin.totalConsultations} consultations)\n` +
    `• Commissions générées : *${fin.totalCommissionsEarnedFCFA.toLocaleString('fr-FR')} FCFA*\n` +
    `• Patients en file d'attente aujourd'hui : *${ctx.waitingQueueToday.totalWaiting}*\n` +
    `• Alertes stock pharmacie : *${ctx.pharmacy.lowStockCount}*\n\n` +
    `_Envoyez *"Mes commissions"*, *"File d'attente"*, *"Stock pharmacie"* ou *"Tarifs"* pour plus de détails._`
  );
}

async function generateClientSideAgentReply(
  messageText: string,
  ctx: Awaited<ReturnType<typeof buildClientHospitalContext>>,
  config: { geminiApiKey: string; geminiModel: string; systemPrompt: string }
): Promise<{ reply: string; modelUsed: string }> {
  const apiKey = (config.geminiApiKey || (process.env as any).GEMINI_API_KEY || '').trim();

  if (apiKey) {
    try {
      const model = (config.geminiModel || 'gemini-2.5-flash').trim();
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: {
            parts: [
              {
                text: `${config.systemPrompt || DEFAULT_SYSTEM_PROMPT}\n\nCONTEXTE TEMPS RÉEL DE L'HÔPITAL ET DU MEMBRE DU PERSONNEL CONNECTÉ (JSON) :\n${JSON.stringify(ctx, null, 2)}`
              }
            ]
          },
          contents: [{ role: 'user', parts: [{ text: messageText }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 700 }
        })
      });

      if (resp.ok) {
        const data = await safeParseJson(resp);
        const candidateText = data?.candidates?.[0]?.content?.parts
          ?.map((p: any) => p.text || '')
          .join('')
          .trim();
        if (candidateText) {
          return { reply: candidateText, modelUsed: model };
        }
      }
    } catch {}
  }

  return {
    reply: buildLocalFallbackReply(messageText, ctx),
    modelUsed: 'smart-hospital-engine'
  };
}

export const WhatsAppAgentSettings: React.FC<WhatsAppAgentSettingsProps> = ({
  currentUser,
  usersList = [],
  staffOnlyMode = false,
  theme = 'light',
  onUserPhoneUpdated
}) => {
  const [subTab, setSubTab] = useState<'SIMULATOR' | 'CONFIG' | 'DIRECTORY' | 'LOGS'>('SIMULATOR');

  // Config state
  const [config, setConfig] = useState({
    enabled: true,
    phoneNumberId: '',
    businessAccountId: '',
    accessToken: '',
    verifyToken: 'smarthosto_meta_verify_2026',
    geminiApiKey: '',
    geminiModel: 'gemini-2.5-flash',
    allowUnregisteredPreview: true,
    systemPrompt: DEFAULT_SYSTEM_PROMPT
  });
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [configBanner, setConfigBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Simulator state
  const [selectedStaffId, setSelectedStaffId] = useState<string>(currentUser?.id || '');
  const [chatInput, setChatInput] = useState('');
  const [isSendingChat, setIsSendingChat] = useState(false);
  const [forwardToRealWhatsApp, setForwardToRealWhatsApp] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatBubble[]>([
    {
      id: 'welcome_msg',
      sender: 'AGENT',
      text:
        `👋 *Bonjour ${currentUser?.name || 'Docteur'} !*\n` +
        `Je suis votre Assistant WhatsApp IA *SMART-HOSTO* (Meta Cloud API + Gemini).\n\n` +
        `Posez-moi une question sur :\n` +
        `• 📊 Vos *commissions & actes clôturés*\n` +
        `• 🏥 La *file d'attente* des patients du jour\n` +
        `• 💊 Le *stock de médicaments* en pharmacie\n` +
        `• 💰 Le *catalogue des tarifs* hospitaliers`,
      timestamp: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
      modelUsed: 'gemini-2.5-flash'
    }
  ]);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Staff phone linking state
  const [personalPhone, setPersonalPhone] = useState(currentUser?.phone || '');
  const [isSavingPhone, setIsSavingPhone] = useState(false);
  const [editingStaffPhoneId, setEditingStaffPhoneId] = useState<string | null>(null);
  const [editingStaffPhoneValue, setEditingStaffPhoneValue] = useState<string>('');

  // Logs state
  const [logs, setLogs] = useState<Array<any>>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);

  const webhookUrl = `${window.location.origin}/api/whatsapp/webhook`;

  const selectedStaffUser =
    usersList.find(u => u.id === selectedStaffId) ||
    currentUser || {
      id: 'admin_user_1',
      name: 'Personnel Soignant',
      username: 'staff',
      role: 'MEDECIN' as any,
      profession: 'Médecin Généraliste',
      phone: personalPhone
    };

  useEffect(() => {
    if (currentUser?.phone) {
      setPersonalPhone(currentUser.phone);
    }
    if (currentUser?.id && !selectedStaffId) {
      setSelectedStaffId(currentUser.id);
    }
  }, [currentUser]);

  const fetchConfig = async () => {
    try {
      const snap = await getDoc(doc(db, 'whatsapp_config', 'settings'));
      if (snap.exists()) {
        setConfig(prev => ({ ...prev, ...(snap.data() as any) }));
      }
    } catch {}
  };

  const fetchLogs = async () => {
    setIsLoadingLogs(true);
    try {
      const mergedMap = new Map<string, any>();
      try {
        const snap = await getCollectionCacheFirst('whatsapp_logs');
        snap.docs.forEach((d: any) => mergedMap.set(d.id, { id: d.id, ...d.data() }));
      } catch {}

      const sorted = Array.from(mergedMap.values()).sort(
        (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
      );
      setLogs(sorted.slice(0, 50));
    } catch {}
    setIsLoadingLogs(false);
  };

  useEffect(() => {
    fetchConfig();
    fetchLogs();
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, isSendingChat]);

  const handleCopy = (value: string, label: string) => {
    navigator.clipboard.writeText(value);
    setCopiedField(label);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingConfig(true);
    setConfigBanner(null);
    try {
      const payload = {
        ...config,
        updatedAt: new Date().toISOString()
      };

      await setDoc(doc(db, 'whatsapp_config', 'settings'), sanitizeData(payload), { merge: true });

      setConfigBanner({
        type: 'success',
        text: 'Configuration Meta Cloud API & Gemini enregistrée avec succès dans Firestore.'
      });
    } catch (err: any) {
      setConfigBanner({
        type: 'error',
        text: err?.message || 'Impossible de sauvegarder la configuration'
      });
    } finally {
      setIsSavingConfig(false);
    }
  };

  const handleSavePersonalPhone = async () => {
    if (!currentUser?.id) return;
    setIsSavingPhone(true);
    try {
      const clean = personalPhone.trim();
      await setDoc(
        doc(db, 'hospital_users', currentUser.id),
        sanitizeData({ phone: clean, updatedAt: new Date().toISOString() }),
        { merge: true }
      );
      await setDoc(
        doc(db, 'users', currentUser.id),
        sanitizeData({ phone: clean, updatedAt: new Date().toISOString() }),
        { merge: true }
      );
      if (onUserPhoneUpdated) onUserPhoneUpdated(clean);
      setConfigBanner({
        type: 'success',
        text: `Numéro WhatsApp (${clean}) associé à votre profil avec succès !`
      });
    } catch (err: any) {
      setConfigBanner({
        type: 'error',
        text: err?.message || 'Erreur lors de la mise à jour du numéro WhatsApp'
      });
    } finally {
      setIsSavingPhone(false);
    }
  };

  const handleSaveDirectoryStaffPhone = async (staffId: string) => {
    try {
      const clean = editingStaffPhoneValue.trim();
      await setDoc(
        doc(db, 'hospital_users', staffId),
        sanitizeData({ phone: clean, updatedAt: new Date().toISOString() }),
        { merge: true }
      );
      await setDoc(
        doc(db, 'users', staffId),
        sanitizeData({ phone: clean, updatedAt: new Date().toISOString() }),
        { merge: true }
      );
      setEditingStaffPhoneId(null);
      setConfigBanner({
        type: 'success',
        text: 'Numéro WhatsApp du collaborateur mis à jour.'
      });
    } catch {
      setConfigBanner({
        type: 'error',
        text: 'Erreur lors de la mise à jour du numéro.'
      });
    }
  };

  const recordAuditLog = (entry: {
    direction: 'INBOUND' | 'OUTBOUND';
    staffId?: string;
    staffName?: string;
    staffRole?: string;
    phone: string;
    message: string;
    source: string;
    aiModel?: string;
  }) => {
    const id = `wa_log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const item = { id, ...entry, createdAt: new Date().toISOString() };
    setLogs(prev => [item, ...prev.slice(0, 49)]);
    setDoc(doc(db, 'whatsapp_logs', id), sanitizeData(item)).catch(() => {});
  };

  const sendSimulatorMessage = async (presetText?: string) => {
    const textToSend = (presetText ?? chatInput).trim();
    if (!textToSend || isSendingChat) return;

    if (!presetText) setChatInput('');

    const userBubble: ChatBubble = {
      id: `usr_${Date.now()}`,
      sender: 'USER',
      text: textToSend,
      timestamp: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    };

    setChatHistory(prev => [...prev, userBubble]);
    setIsSendingChat(true);

    const targetPhone = selectedStaffUser.phone || personalPhone || '+237600000000';

    try {
      // 1. Log inbound message
      recordAuditLog({
        direction: 'INBOUND',
        staffId: selectedStaffUser.id,
        staffName: selectedStaffUser.name,
        staffRole: String(selectedStaffUser.role || 'STAFF'),
        phone: targetPhone,
        message: textToSend,
        source: 'SIMULATOR'
      });

      // 2. Build live hospital & staff context directly from authenticated client Firestore cache
      const clientContext = await buildClientHospitalContext(selectedStaffUser);

      // 3. Generate reply via Gemini API (or Smart Hospital Engine fallback)
      const generated = await generateClientSideAgentReply(textToSend, clientContext, config);
      const replyText = generated.reply;
      const modelUsed = generated.modelUsed;
      let metaSent = false;

      // 4. Optional: Forward to real WhatsApp via Meta Cloud API if requested and configured
      if (forwardToRealWhatsApp && config.phoneNumberId && config.accessToken && targetPhone) {
        try {
          const cleanPhone = targetPhone.replace(/[^0-9]/g, '');
          const metaRes = await fetch(
            `https://graph.facebook.com/v21.0/${encodeURIComponent(config.phoneNumberId)}/messages`,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${config.accessToken}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                messaging_product: 'whatsapp',
                to: cleanPhone,
                type: 'text',
                text: { body: replyText }
              })
            }
          );
          if (metaRes.ok) metaSent = true;
        } catch {}
      }

      // 5. Log outbound response
      recordAuditLog({
        direction: 'OUTBOUND',
        staffId: selectedStaffUser.id,
        staffName: selectedStaffUser.name,
        staffRole: String(selectedStaffUser.role || 'STAFF'),
        phone: targetPhone,
        message: replyText,
        source: 'SIMULATOR',
        aiModel: modelUsed
      });

      const agentBubble: ChatBubble = {
        id: `agt_${Date.now()}`,
        sender: 'AGENT',
        text: replyText,
        timestamp: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
        modelUsed,
        metaSent
      };

      setChatHistory(prev => [...prev, agentBubble]);
    } catch (err: any) {
      setChatHistory(prev => [
        ...prev,
        {
          id: `err_${Date.now()}`,
          sender: 'AGENT',
          text: `⚠️ Erreur lors du traitement de la requête : ${err?.message || 'Réessayez.'}`,
          timestamp: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    } finally {
      setIsSendingChat(false);
    }
  };

  const handleSendTestMetaNotification = async (staff: User) => {
    if (!staff.phone) {
      setConfigBanner({
        type: 'error',
        text: `Veuillez d'abord renseigner le numéro WhatsApp de ${staff.name}.`
      });
      return;
    }

    if (!config.phoneNumberId || !config.accessToken) {
      setConfigBanner({
        type: 'error',
        text: "Identifiants Meta Cloud API (Phone Number ID & Access Token) requis dans l'onglet 'Meta API & Gemini' pour envoyer un vrai WhatsApp."
      });
      return;
    }

    const testMessage = `🔔 *Notification SMART-HOSTO*\nBonjour *${staff.name}*, votre liaison WhatsApp Staff (Meta Cloud API + Gemini) est opérationnelle. Envoyez *"Mes commissions"* ou *"File d'attente"* à tout moment !`;

    try {
      const cleanPhone = staff.phone.replace(/[^0-9]/g, '');
      const metaRes = await fetch(
        `https://graph.facebook.com/v21.0/${encodeURIComponent(config.phoneNumberId)}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${config.accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: cleanPhone,
            type: 'text',
            text: { body: testMessage }
          })
        }
      );
      const metaData = await safeParseJson(metaRes);
      if (metaRes.ok) {
        recordAuditLog({
          direction: 'OUTBOUND',
          staffId: staff.id,
          staffName: staff.name,
          staffRole: String(staff.role || 'STAFF'),
          phone: staff.phone,
          message: testMessage,
          source: 'NOTIFICATION',
          aiModel: 'Meta Cloud API'
        });
        setConfigBanner({
          type: 'success',
          text: `Message WhatsApp envoyé via Meta Cloud API à ${staff.name} (${staff.phone}).`
        });
      } else {
        throw new Error(metaData?.error?.message || 'Erreur Meta Graph API');
      }
    } catch (err: any) {
      setConfigBanner({
        type: 'error',
        text: err?.message || 'Erreur lors de l’envoi Meta Cloud API'
      });
    }
  };

  const quickPrompts = [
    { label: '📊 Mes commissions & actes', prompt: 'Quelles sont mes commissions et mes derniers actes clôturés ?' },
    { label: '🏥 File d’attente du jour', prompt: "Combien de patients sont en file d'attente aujourd'hui ?" },
    { label: '💊 Stock Pharmacie', prompt: 'Quel est le point du stock pharmacie et les alertes de rupture ?' },
    { label: '💰 Tarifs Consultations', prompt: 'Quels sont les tarifs des actes et consultations ?' },
    { label: '❓ Menu d’aide', prompt: 'Aide' }
  ];

  const isDark = theme === 'dark';

  return (
    <div className="space-y-6">
      {/* Top Status Card */}
      <div
        className={`p-5 rounded-3xl border flex flex-col lg:flex-row lg:items-center justify-between gap-4 ${
          isDark
            ? 'bg-gradient-to-r from-emerald-950/50 via-zinc-900 to-zinc-900 border-emerald-500/20'
            : 'bg-gradient-to-r from-emerald-50 via-white to-teal-50/40 border-emerald-200/80 shadow-sm'
        }`}
      >
        <div className="flex items-start sm:items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-lg shadow-emerald-600/25 shrink-0">
            <MessageSquare size={24} />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className={`text-lg font-black uppercase tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
                Agent WhatsApp Staff IA
              </h2>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                <Sparkles size={11} /> Meta Cloud API + Gemini
              </span>
              <span
                className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${
                  config.enabled
                    ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/25'
                    : 'bg-slate-500/15 text-slate-500'
                }`}
              >
                {config.enabled ? 'Actif' : 'En pause'}
              </span>
            </div>
            <p className={`text-xs mt-1 ${isDark ? 'text-zinc-400' : 'text-slate-600'}`}>
              Assistant intelligent réservé au personnel hospitalier : suivi des commissions, file d’attente en direct, stock pharmacie et tarifs via WhatsApp.
            </p>
          </div>
        </div>

        {/* Navigation Pills */}
        {!staffOnlyMode && (
          <div className="flex flex-wrap items-center gap-1.5 bg-slate-900/5 dark:bg-zinc-950/60 p-1.5 rounded-2xl">
            {[
              { id: 'SIMULATOR', label: 'Simulateur & Chat IA', icon: Bot },
              { id: 'CONFIG', label: 'Meta API & Gemini', icon: Key },
              { id: 'DIRECTORY', label: 'Numéros du Personnel', icon: Users },
              { id: 'LOGS', label: 'Journaux Webhook', icon: Terminal }
            ].map(t => {
              const Icon = t.icon;
              const active = subTab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setSubTab(t.id as any)}
                  className={`px-3 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer ${
                    active
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : isDark
                      ? 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                  }`}
                >
                  <Icon size={14} />
                  <span>{t.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {configBanner && (
        <div
          className={`p-4 rounded-2xl border text-xs font-bold flex items-center justify-between gap-3 ${
            configBanner.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400'
          }`}
        >
          <div className="flex items-center gap-2">
            {configBanner.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
            <span>{configBanner.text}</span>
          </div>
          <button onClick={() => setConfigBanner(null)} className="text-[11px] underline cursor-pointer">
            Fermer
          </button>
        </div>
      )}

      {/* Quick Personal WhatsApp Number Linker Card */}
      {currentUser && (staffOnlyMode || subTab === 'SIMULATOR') && (
        <div
          className={`p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
            isDark ? 'bg-zinc-900/60 border-zinc-800' : 'bg-white border-slate-200/80 shadow-sm'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0">
              <Smartphone size={20} />
            </div>
            <div>
              <h4 className={`text-xs font-black uppercase tracking-wider ${isDark ? 'text-zinc-200' : 'text-slate-800'}`}>
                Mon Numéro WhatsApp Professionnel ({currentUser.name})
              </h4>
              <p className="text-[11px] text-slate-400">
                Associez votre numéro (avec indicatif, ex: +237690000000) pour que Meta Cloud API vous identifie automatiquement.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="tel"
              value={personalPhone}
              onChange={e => setPersonalPhone(e.target.value)}
              placeholder="+237 6XX XX XX XX"
              className={`px-3.5 py-2 rounded-xl border text-xs font-bold outline-none w-48 ${
                isDark
                  ? 'bg-zinc-950 border-zinc-800 text-white focus:border-emerald-500'
                  : 'bg-slate-50 border-slate-200 text-slate-900 focus:border-emerald-600'
              }`}
            />
            <button
              onClick={handleSavePersonalPhone}
              disabled={isSavingPhone}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer shrink-0"
            >
              <Save size={14} />
              <span>{isSavingPhone ? 'Enregistrement...' : 'Lier mon WhatsApp'}</span>
            </button>
          </div>
        </div>
      )}

      {/* =========================================================
          SUBTAB 1: LIVE WHATSAPP SIMULATOR & STAFF CHAT
      ========================================================= */}
      {(subTab === 'SIMULATOR' || staffOnlyMode) && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Context & Quick Actions */}
          <div className="lg:col-span-5 space-y-4">
            <div
              className={`p-5 rounded-3xl border space-y-4 ${
                isDark ? 'bg-zinc-900/50 border-zinc-800' : 'bg-white border-slate-200 shadow-sm'
              }`}
            >
              <h3 className="text-xs font-black uppercase tracking-wider flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                <Zap size={15} />
                <span>Commandes Rapides du Personnel</span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-zinc-400">
                Cliquez sur une question ci-dessous pour interroger l’agent Gemini connecté en temps réel à la base de données Firestore de l’hôpital :
              </p>

              {!staffOnlyMode && usersList.length > 0 && (
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1.5">
                    Tester en tant que collaborateur :
                  </label>
                  <select
                    value={selectedStaffId}
                    onChange={e => setSelectedStaffId(e.target.value)}
                    className={`w-full px-3.5 py-2.5 rounded-xl border text-xs font-bold outline-none ${
                      isDark ? 'bg-zinc-950 border-zinc-800 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'
                    }`}
                  >
                    {usersList.map(u => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({u.role}) {u.phone ? `• 📱 ${u.phone}` : '• ⚠️ Sans numéro'}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="space-y-2 pt-1">
                {quickPrompts.map((q, idx) => (
                  <button
                    key={idx}
                    onClick={() => sendSimulatorMessage(q.prompt)}
                    disabled={isSendingChat}
                    className={`w-full text-left px-4 py-3 rounded-2xl border text-xs font-bold flex items-center justify-between transition-all cursor-pointer ${
                      isDark
                        ? 'bg-zinc-950/70 hover:bg-emerald-950/40 border-zinc-800 hover:border-emerald-500/40 text-zinc-200'
                        : 'bg-slate-50 hover:bg-emerald-50/80 border-slate-200/80 hover:border-emerald-300 text-slate-800'
                    }`}
                  >
                    <span>{q.label}</span>
                    <Send size={13} className="text-emerald-500 shrink-0" />
                  </button>
                ))}
              </div>

              <div className="pt-2 border-t border-slate-100 dark:border-zinc-800">
                <label className="flex items-center gap-2.5 text-xs font-bold cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={forwardToRealWhatsApp}
                    onChange={e => setForwardToRealWhatsApp(e.target.checked)}
                    className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  <span className={isDark ? 'text-zinc-300' : 'text-slate-700'}>
                    Envoyer aussi la réponse sur le vrai WhatsApp via Meta Cloud API
                  </span>
                </label>
              </div>
            </div>

            {/* Security & RBAC Notice */}
            <div
              className={`p-5 rounded-3xl border space-y-2 ${
                isDark ? 'bg-zinc-900/40 border-zinc-800' : 'bg-slate-100/80 border-slate-200/70'
              }`}
            >
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-blue-600 dark:text-blue-400">
                <Lock size={14} />
                <span>Sécurité & Cloisonnement RBAC</span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-zinc-400 leading-relaxed">
                L’agent vérifie automatiquement le numéro WhatsApp émetteur (<code className="font-mono">from</code>) dans la collection{' '}
                <code className="font-mono">hospital_users</code>. Chaque praticien n’accède qu’à ses propres commissions et actes clôturés.
              </p>
            </div>
          </div>

          {/* Right Column: WhatsApp Phone Mockup */}
          <div className="lg:col-span-7">
            <div className="rounded-3xl overflow-hidden border border-emerald-900/20 shadow-xl flex flex-col h-[540px] bg-[#EFEAE2] dark:bg-[#0B141A]">
              {/* WhatsApp Header */}
              <div className="bg-[#075E54] dark:bg-[#202C33] text-white px-5 py-3.5 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center font-black text-sm">
                    SH
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-black text-sm">SMART-HOSTO • Assistant Staff</h4>
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    </div>
                    <p className="text-[11px] text-emerald-100/80">
                      Connecté en tant que : {selectedStaffUser.name} ({selectedStaffUser.role})
                    </p>
                  </div>
                </div>
                <button
                  onClick={() =>
                    setChatHistory([
                      {
                        id: `reset_${Date.now()}`,
                        sender: 'AGENT',
                        text: `👋 Conversation réinitialisée. Comment puis-je vous aider, *${selectedStaffUser.name}* ?`,
                        timestamp: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
                      }
                    ])
                  }
                  className="p-2 rounded-xl hover:bg-white/10 text-emerald-100 transition-colors cursor-pointer"
                  title="Effacer la discussion"
                >
                  <RefreshCw size={16} />
                </button>
              </div>

              {/* Messages Container */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {chatHistory.map(bubble => {
                  const isUser = bubble.sender === 'USER';
                  return (
                    <div key={bubble.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                      <div
                        className={`max-w-[85%] rounded-2xl px-4 py-2.5 shadow-sm text-xs leading-relaxed whitespace-pre-wrap ${
                          isUser
                            ? 'bg-[#D9FDD3] dark:bg-[#005C4B] text-slate-900 dark:text-zinc-100 rounded-tr-none'
                            : 'bg-white dark:bg-[#202C33] text-slate-800 dark:text-zinc-100 rounded-tl-none'
                        }`}
                      >
                        <div>{bubble.text}</div>
                        <div className="flex items-center justify-end gap-1.5 mt-1 text-[10px] opacity-60">
                          {bubble.modelUsed && !isUser && <span className="font-mono">{bubble.modelUsed}</span>}
                          {bubble.metaSent && <span className="text-emerald-600 font-bold">• Envoyé Meta API</span>}
                          <span>{bubble.timestamp}</span>
                          {isUser && <CheckCheck size={13} className="text-sky-500" />}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {isSendingChat && (
                  <div className="flex justify-start">
                    <div className="bg-white dark:bg-[#202C33] text-slate-600 dark:text-zinc-300 rounded-2xl rounded-tl-none px-4 py-3 text-xs font-bold flex items-center gap-2 shadow-sm">
                      <RefreshCw size={14} className="animate-spin text-emerald-600" />
                      <span>Analyse des données SMART-HOSTO en direct...</span>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Input Bar */}
              <form
                onSubmit={e => {
                  e.preventDefault();
                  sendSimulatorMessage();
                }}
                className="p-3 bg-[#F0F2F5] dark:bg-[#202C33] flex items-center gap-2 shrink-0"
              >
                <input
                  type="text"
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  placeholder="Écrivez un message WhatsApp (ex: Quelles sont mes commissions ?)"
                  className="flex-1 px-4 py-2.5 rounded-full bg-white dark:bg-[#2A3942] text-slate-900 dark:text-white text-xs font-medium outline-none border border-transparent focus:border-emerald-500"
                />
                <button
                  type="submit"
                  disabled={!chatInput.trim() || isSendingChat}
                  className="w-10 h-10 rounded-full bg-[#00A884] hover:bg-[#008f6f] disabled:opacity-50 text-white flex items-center justify-center transition-all cursor-pointer shrink-0 shadow-md"
                >
                  <Send size={16} />
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================
          SUBTAB 2: META CLOUD API & GEMINI CONFIGURATION
      ========================================================= */}
      {!staffOnlyMode && subTab === 'CONFIG' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <form
            onSubmit={handleSaveConfig}
            className={`lg:col-span-7 p-6 rounded-3xl border space-y-5 ${
              isDark ? 'bg-zinc-900/50 border-zinc-800' : 'bg-white border-slate-200 shadow-sm'
            }`}
          >
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-zinc-800 pb-4">
              <div>
                <h3 className="text-sm font-black uppercase tracking-wider flex items-center gap-2">
                  <Key size={16} className="text-emerald-600" />
                  <span>Identifiants Meta WhatsApp Cloud API & Gemini</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Ces paramètres sont stockés de façon sécurisée dans Firestore et synchronisés avec le webhook Express.
                </p>
              </div>
              <label className="flex items-center gap-2 text-xs font-black cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.enabled}
                  onChange={e => setConfig({ ...config, enabled: e.target.checked })}
                  className="rounded text-emerald-600"
                />
                <span>Agent Actif</span>
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1">
                  Meta Phone Number ID
                </label>
                <input
                  type="text"
                  value={config.phoneNumberId}
                  onChange={e => setConfig({ ...config, phoneNumberId: e.target.value })}
                  placeholder="ex: 105928374650192"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950 text-xs font-mono"
                />
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1">
                  WhatsApp Business Account ID (Optionnel)
                </label>
                <input
                  type="text"
                  value={config.businessAccountId}
                  onChange={e => setConfig({ ...config, businessAccountId: e.target.value })}
                  placeholder="ex: 109827364519283"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950 text-xs font-mono"
                />
              </div>
            </div>

            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1">
                Meta Cloud API Access Token (Permanent ou Temporaire)
              </label>
              <input
                type="password"
                value={config.accessToken}
                onChange={e => setConfig({ ...config, accessToken: e.target.value })}
                placeholder="EAAGm0PX4ZCpsBA..."
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950 text-xs font-mono"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1">
                  Google Gemini API Key
                </label>
                <input
                  type="password"
                  value={config.geminiApiKey}
                  onChange={e => setConfig({ ...config, geminiApiKey: e.target.value })}
                  placeholder="AIzaSy..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950 text-xs font-mono"
                />
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1">
                  Modèle Gemini
                </label>
                <select
                  value={config.geminiModel}
                  onChange={e => setConfig({ ...config, geminiModel: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950 text-xs font-bold"
                >
                  <option value="gemini-2.5-flash">gemini-2.5-flash (Recommandé • Ultra rapide)</option>
                  <option value="gemini-2.5-pro">gemini-2.5-pro (Raisonnement avancé)</option>
                  <option value="gemini-2.0-flash">gemini-2.0-flash</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1">
                Instructions Système de l’Agent (Prompt Système)
              </label>
              <textarea
                rows={4}
                value={config.systemPrompt}
                onChange={e => setConfig({ ...config, systemPrompt: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950 text-xs"
              />
            </div>

            <div className="flex items-center justify-between pt-2">
              <label className="flex items-center gap-2 text-xs font-bold cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.allowUnregisteredPreview}
                  onChange={e => setConfig({ ...config, allowUnregisteredPreview: e.target.checked })}
                  className="rounded text-emerald-600"
                />
                <span>Autoriser le mode démo si le numéro n'est pas encore lié</span>
              </label>

              <button
                type="submit"
                disabled={isSavingConfig}
                className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black flex items-center gap-2 shadow-lg shadow-emerald-600/20 cursor-pointer"
              >
                <Save size={15} />
                <span>{isSavingConfig ? 'Enregistrement...' : 'Enregistrer la Configuration'}</span>
              </button>
            </div>
          </form>

          {/* Webhook Guide Card */}
          <div
            className={`lg:col-span-5 p-6 rounded-3xl border space-y-5 ${
              isDark ? 'bg-zinc-900/50 border-zinc-800' : 'bg-white border-slate-200 shadow-sm'
            }`}
          >
            <h3 className="text-sm font-black uppercase tracking-wider flex items-center gap-2 text-blue-600">
              <Shield size={16} />
              <span>Configuration du Webhook Meta Developers</span>
            </h3>

            <p className="text-xs text-slate-500 leading-relaxed">
              Dans votre console <strong>Meta for Developers → WhatsApp → Configuration</strong>, collez l’URL de Callback et le Jeton de vérification ci-dessous :
            </p>

            <div className="space-y-3">
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                    URL de Callback (Webhook URL)
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopy(webhookUrl, 'url')}
                    className="text-[11px] font-bold text-emerald-600 flex items-center gap-1 cursor-pointer"
                  >
                    <Copy size={12} />
                    <span>{copiedField === 'url' ? 'Copié !' : 'Copier'}</span>
                  </button>
                </div>
                <code className="text-xs font-mono break-all text-slate-800 dark:text-zinc-200">{webhookUrl}</code>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                    Verify Token (hub.verify_token)
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopy(config.verifyToken, 'token')}
                    className="text-[11px] font-bold text-emerald-600 flex items-center gap-1 cursor-pointer"
                  >
                    <Copy size={12} />
                    <span>{copiedField === 'token' ? 'Copié !' : 'Copier'}</span>
                  </button>
                </div>
                <input
                  type="text"
                  value={config.verifyToken}
                  onChange={e => setConfig({ ...config, verifyToken: e.target.value })}
                  className="w-full bg-transparent text-xs font-mono font-bold text-slate-800 dark:text-zinc-200 outline-none"
                />
              </div>
            </div>

            <div className="space-y-2 text-xs text-slate-600 dark:text-zinc-400 pt-2">
              <div className="font-black text-slate-800 dark:text-zinc-200">Étapes rapides :</div>
              <ol className="list-decimal list-inside space-y-1.5 text-[11px]">
                <li>Créez une application <strong>Business</strong> sur <span className="font-mono">developers.facebook.com</span>.</li>
                <li>Ajoutez le produit <strong>WhatsApp</strong> et récupérez le <span className="font-mono">Phone Number ID</span> et l’<span className="font-mono">Access Token</span>.</li>
                <li>Dans <strong>Configuration → Webhook</strong>, renseignez l’URL ci-dessus et abonnez-vous au champ <span className="font-mono font-bold">messages</span>.</li>
                <li>Ajoutez votre clé <span className="font-mono">GEMINI_API_KEY</span> pour activer les réponses IA génératives.</li>
              </ol>
            </div>

            <a
              href="https://developers.facebook.com/apps/"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 text-xs font-black text-blue-600 hover:underline pt-1"
            >
              <span>Ouvrir Meta for Developers</span>
              <ExternalLink size={13} />
            </a>
          </div>
        </div>
      )}

      {/* =========================================================
          SUBTAB 3: STAFF WHATSAPP DIRECTORY
      ========================================================= */}
      {!staffOnlyMode && subTab === 'DIRECTORY' && (
        <div
          className={`p-6 rounded-3xl border space-y-4 ${
            isDark ? 'bg-zinc-900/50 border-zinc-800' : 'bg-white border-slate-200 shadow-sm'
          }`}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-zinc-800 pb-4">
            <div>
              <h3 className="text-sm font-black uppercase tracking-wider flex items-center gap-2">
                <Users size={16} className="text-emerald-600" />
                <span>Annuaire WhatsApp du Personnel ({usersList.length} collaborateurs)</span>
              </h3>
              <p className="text-xs text-slate-400">
                Associez les numéros WhatsApp de vos médecins, infirmiers et administrateurs pour qu’ils puissent discuter avec l’agent.
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 dark:border-zinc-800 text-[10px] font-black uppercase tracking-widest text-slate-400">
                  <th className="py-3 px-4">Collaborateur</th>
                  <th className="py-3 px-4">Rôle / Fonction</th>
                  <th className="py-3 px-4">Numéro WhatsApp Lié</th>
                  <th className="py-3 px-4 text-right">Actions WhatsApp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-zinc-800 text-xs">
                {usersList.map(u => {
                  const isEditing = editingStaffPhoneId === u.id;
                  return (
                    <tr key={u.id} className="hover:bg-slate-50/80 dark:hover:bg-zinc-900/40">
                      <td className="py-3 px-4 font-bold">
                        <div>{u.name}</div>
                        <div className="text-[10px] text-slate-400">@{u.username}</div>
                      </td>
                      <td className="py-3 px-4">
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-blue-500/10 text-blue-600">
                          {u.role}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        {isEditing ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="tel"
                              value={editingStaffPhoneValue}
                              onChange={e => setEditingStaffPhoneValue(e.target.value)}
                              placeholder="+237690000000"
                              className="px-3 py-1.5 rounded-lg border border-emerald-500 text-xs font-mono"
                            />
                            <button
                              onClick={() => handleSaveDirectoryStaffPhone(u.id)}
                              className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-[11px] font-bold cursor-pointer"
                            >
                              OK
                            </button>
                            <button
                              onClick={() => setEditingStaffPhoneId(null)}
                              className="px-2 py-1.5 text-slate-400 text-[11px] cursor-pointer"
                            >
                              Annuler
                            </button>
                          </div>
                        ) : u.phone ? (
                          <span className="font-mono font-bold text-emerald-600 flex items-center gap-1.5">
                            <Phone size={13} />
                            {u.phone}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">Non renseigné</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right space-x-2">
                        <button
                          onClick={() => {
                            setEditingStaffPhoneId(u.id);
                            setEditingStaffPhoneValue(u.phone || '');
                          }}
                          className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-zinc-700 hover:bg-slate-100 text-[11px] font-bold cursor-pointer"
                        >
                          {u.phone ? 'Modifier numéro' : '+ Lier numéro'}
                        </button>
                        <button
                          onClick={() => handleSendTestMetaNotification(u)}
                          className="px-3 py-1.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 text-[11px] font-black cursor-pointer"
                        >
                          Notifier via Meta API
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =========================================================
          SUBTAB 4: WEBHOOK & AGENT LOGS
      ========================================================= */}
      {!staffOnlyMode && subTab === 'LOGS' && (
        <div
          className={`p-6 rounded-3xl border space-y-4 ${
            isDark ? 'bg-zinc-900/50 border-zinc-800' : 'bg-white border-slate-200 shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-zinc-800 pb-4">
            <div>
              <h3 className="text-sm font-black uppercase tracking-wider flex items-center gap-2">
                <Terminal size={16} className="text-emerald-600" />
                <span>Journaux d’Activité WhatsApp & Meta Webhook</span>
              </h3>
              <p className="text-xs text-slate-400">
                Historique des requêtes entrantes et réponses générées par Gemini pour le personnel.
              </p>
            </div>
            <button
              onClick={fetchLogs}
              className="px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-bold flex items-center gap-1.5 hover:bg-slate-50 cursor-pointer"
            >
              <RefreshCw size={13} className={isLoadingLogs ? 'animate-spin' : ''} />
              <span>Actualiser</span>
            </button>
          </div>

          {logs.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-400">
              Aucun échange WhatsApp enregistré pour le moment. Utilisez le simulateur pour tester l’agent !
            </div>
          ) : (
            <div className="space-y-2.5 max-h-[440px] overflow-y-auto pr-1">
              {logs.map(item => (
                <div
                  key={item.id}
                  className="p-3.5 rounded-2xl border border-slate-100 dark:border-zinc-800 bg-slate-50/70 dark:bg-zinc-950/50 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase ${
                          item.direction === 'INBOUND'
                            ? 'bg-blue-500/10 text-blue-600'
                            : 'bg-emerald-500/10 text-emerald-600'
                        }`}
                      >
                        {item.direction === 'INBOUND' ? '⬅ Entrant' : '➡ Sortant IA'}
                      </span>
                      <span className="font-black">{item.staffName || 'Personnel'}</span>
                      <span className="font-mono text-[11px] text-slate-400">({item.phone})</span>
                      <span className="px-2 py-0.5 rounded bg-slate-200/70 dark:bg-zinc-800 text-[10px] font-mono">
                        {item.source}
                      </span>
                      {item.aiModel && (
                        <span className="px-2 py-0.5 rounded bg-purple-500/10 text-purple-600 text-[10px] font-mono">
                          {item.aiModel}
                        </span>
                      )}
                    </div>
                    <p className="text-slate-700 dark:text-zinc-300 whitespace-pre-wrap line-clamp-3">{item.message}</p>
                  </div>
                  <div className="text-[10px] font-mono text-slate-400 shrink-0">
                    {item.createdAt ? new Date(item.createdAt).toLocaleString('fr-FR') : ''}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default WhatsAppAgentSettings;
