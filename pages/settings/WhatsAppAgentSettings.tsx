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
  Lock,
  Mic,
  MicOff,
  Volume2
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
  audioUrl?: string;
  isVoice?: boolean;
}

const DEFAULT_SYSTEM_PROMPT = `Tu es l'Assistant Hospitalier Officiel sur WhatsApp pour la plateforme hospitalière SMART-HOSTO.
Tu t'adresses aux praticiens, cadres de santé, infirmiers et directeurs administratifs de l'établissement.

DIRECTIVES DE STYLE & MISE EN FORME (MARKDOWN NATUREL, ÉLÉGANT ET AÉRÉ) :
1. STRICTEMENT AUCUN CADRE NI TABLEAU BRUT :
   - N'utilise JAMAIS de cadres ASCII, de bordures (┌, ─, └, │, ━) ni de blocs de code monospace pour formater du texte comme des tableaux. L'utilisateur trouve cela inélégant et lourd sur mobile.
   - Privilégie un formatage Markdown standard WhatsApp naturel, fluide et agréable à lire :
     *Gras* pour les titres de sections, montants financiers, noms de patients et statuts.
     _Italique_ pour les sous-titres, dates, précisions de service et mentions administratives.
     Listes à puces simples (• ou -) avec des sauts de ligne clairs entre chaque bloc d'information.
   - Emojis sobres et ciblés : utilise un emoji pertinent en tête de titre (ex: 🏥, 📊, 🛏️, 💊, 💼) sans enchaîner plusieurs emojis à la suite.

2. SALUTATION PROFESSIONNELLE & RÔLE :
   - Salue courtoisement selon le rôle : "Bonjour Dr [Nom]" pour les médecins/chirurgiens, "Bonjour [Nom] (Direction Administrative)" pour les administrateurs.

3. STRUCTURE RECOMMANDEE D'UNE REPONSE :
   *🏥 Titre du Bilan*
   _Sous-titre explicatif avec horodatage_

   • *Indicateur 1 :* Valeur en FCFA
   • *Indicateur 2 :* Nombre ou état

   *Détails des dossiers :*
   - Date ou Nom : *Désignation de l'acte* → *Montant FCFA* _(Statut)_

   📄 _Envoyez *"PDF"* ou *"Excel"* pour recevoir le document officiel certifié._
   _SMART-HOSTO SIH • Service d'Information Médicale_

4. LIVRAISON DE DOCUMENTS OFFICIELS SUR MESURE (PDF / EXCEL) :
   - Le système génère et transmet instantanément le document officiel certifié (PDF ou Excel) dans la conversation WhatsApp en même temps que votre message.
   - Si l'utilisateur demande un rapport, un bilan, un audit, un export, ou mentionne "PDF", "Excel", "Document", "Télécharger" ou "Stats", présente-lui une synthèse claire des indicateurs majeurs et annonce-lui directement que le document officiel certifié ci-joint est transmis ci-dessous.
   - Ne dis JAMAIS "je vais le préparer plus tard" ou "il est en cours de génération, je vous l'enverrai dès qu'il sera prêt". Le document est transmis immédiatement avec votre réponse.

5. RÈGLES MÉTIER :
   - Rédige des réponses fluides, complètes et conclues proprement. Ne coupe jamais tes phrases en plein milieu.
   - Devise obligatoire : FCFA.
   - Confidentialité : les praticiens ne voient que leurs propres honoraires/commissions ; seuls les ADMIN ont accès aux caisses globales de l'établissement.

6. FLUX CONVERSATIONNEL & MÉMOIRE CONTEXTUELLE :
   - Tu disposes de l'historique récent des échanges.
   - Si l'utilisateur fait référence à une requête précédente (ex: "same like before", "la même chose en pdf", "et pour les urgences ?", "recommence avec...", "détaille ce chiffre"), analyse le fil de discussion pour assurer une continuité parfaite sans lui demander de répéter.`;



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
    const primaryModel = (config.geminiModel || 'gemini-3.5-flash').trim();
    const modelsToTry = [
      primaryModel,
      'gemini-3.5-flash',
      'gemini-3-flash-preview',
      'gemini-3.1-pro-preview',
      'gemini-2.5-flash'
    ].filter((v, i, a) => v && a.indexOf(v) === i);

    for (const model of modelsToTry) {
      try {
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
            generationConfig: { temperature: 0.25, maxOutputTokens: 2048 }
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
  const [subTab, setSubTab] = useState<'SIMULATOR' | 'LIVE_CHATS' | 'CONFIG' | 'DIRECTORY' | 'LOGS'>('SIMULATOR');

  // Config state
  const [config, setConfig] = useState({
    enabled: true,
    phoneNumberId: '',
    businessAccountId: '',
    accessToken: '',
    verifyToken: 'smarthosto_meta_verify_2026',
    geminiApiKey: '',
    geminiModel: 'gemini-3.5-flash',
    voiceEnabled: true,
    voiceName: 'Aoede',
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
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<any>(null);
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
        `• 💰 Le *catalogue des tarifs* hospitaliers\n\n` +
        `🎙️ *Notes vocales activées :* Vous pouvez m'envoyer un message vocal ou écrit !`,
      timestamp: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
      modelUsed: 'gemini-3.5-flash'
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

  // Live Threads & Handover State
  const [threads, setThreads] = useState<Array<any>>([]);
  const [selectedThreadPhone, setSelectedThreadPhone] = useState<string | null>(null);
  const [threadMessages, setThreadMessages] = useState<Array<any>>([]);
  const [isLoadingThreads, setIsLoadingThreads] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [humanReplyText, setHumanReplyText] = useState('');
  const [isSendingHumanReply, setIsSendingHumanReply] = useState(false);
  const [isTogglingMode, setIsTogglingMode] = useState(false);
  const threadEndRef = useRef<HTMLDivElement>(null);

  const fetchThreads = async () => {
    setIsLoadingThreads(true);
    try {
      const res = await fetch('/api/whatsapp/threads');
      const data = await res.json();
      if (data.success && Array.isArray(data.threads)) {
        setThreads(data.threads);
        if (!selectedThreadPhone && data.threads.length > 0) {
          setSelectedThreadPhone(data.threads[0].phone);
        }
      }
    } catch {}
    setIsLoadingThreads(false);
  };

  const fetchThreadMessages = async (phone: string) => {
    if (!phone) return;
    setIsLoadingMessages(true);
    try {
      const res = await fetch(`/api/whatsapp/threads/${encodeURIComponent(phone)}/messages`);
      const data = await res.json();
      if (data.success && Array.isArray(data.messages)) {
        setThreadMessages(data.messages);
      }
    } catch {}
    setIsLoadingMessages(false);
  };

  useEffect(() => {
    if (subTab === 'LIVE_CHATS') {
      fetchThreads();
    }
  }, [subTab]);

  useEffect(() => {
    if (selectedThreadPhone && subTab === 'LIVE_CHATS') {
      fetchThreadMessages(selectedThreadPhone);
      const interval = setInterval(() => {
        fetchThreadMessages(selectedThreadPhone);
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [selectedThreadPhone, subTab]);

  useEffect(() => {
    if (subTab === 'LIVE_CHATS') {
      threadEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [threadMessages, isSendingHumanReply]);

  const handleToggleHandoverMode = async (phone: string, targetMode: 'AI' | 'HUMAN') => {
    setIsTogglingMode(true);
    try {
      const res = await fetch(`/api/whatsapp/threads/${encodeURIComponent(phone)}/mode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: targetMode,
          staffName: currentUser?.name || 'Soignant',
          staffId: currentUser?.id
        })
      });
      const data = await res.json();
      if (data.success) {
        setThreads(prev =>
          prev.map(t => (t.phone === phone ? { ...t, mode: targetMode, assignedStaffName: currentUser?.name } : t))
        );
      }
    } catch {}
    setIsTogglingMode(false);
  };

  const handleSendHumanReply = async () => {
    if (!selectedThreadPhone || !humanReplyText.trim()) return;
    setIsSendingHumanReply(true);
    const textToSend = humanReplyText.trim();
    try {
      const res = await fetch(`/api/whatsapp/threads/${encodeURIComponent(selectedThreadPhone)}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: textToSend,
          staffName: currentUser?.name || 'Soignant SMART-HOSTO',
          staffRole: currentUser?.role || 'STAFF',
          staffId: currentUser?.id
        })
      });
      const data = await res.json();
      if (data.success) {
        setHumanReplyText('');
        fetchThreadMessages(selectedThreadPhone);
        fetchThreads();
      } else {
        alert(data.message || 'Erreur lors de l\'envoi');
      }
    } catch (err: any) {
      alert('Erreur: ' + err.message);
    } finally {
      setIsSendingHumanReply(false);
    }
  };

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

      // Synchronize with Render backend
      await fetch('https://smart-hosto.onrender.com/api/whatsapp/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).catch(() => {});

      setConfigBanner({
        type: 'success',
        text: 'Configuration Meta Cloud API & Gemini enregistrée avec succès.'
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

      let replyText = '';
      let modelUsed = '';
      let audioUrl: string | undefined;
      let metaSent = false;

      // 2. Try the Render backend simulator endpoint (produces audio note if voice enabled)
      try {
        const simRes = await fetch('https://smart-hosto.onrender.com/api/whatsapp/simulate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: textToSend,
            staffId: selectedStaffUser.id,
            phone: targetPhone,
            staffSnapshot: selectedStaffUser,
            sendToRealWhatsApp: forwardToRealWhatsApp
          })
        });
        if (simRes.ok) {
          const sData = await simRes.json();
          replyText = sData.reply;
          modelUsed = sData.modelUsed;
          audioUrl = sData.audioUrl;
          metaSent = Boolean(sData.metaDelivery?.sent);
        }
      } catch {}

      // Fallback to client-side reply if server is unreachable
      if (!replyText) {
        const clientContext = await buildClientHospitalContext(selectedStaffUser);
        const generated = await generateClientSideAgentReply(textToSend, clientContext, config);
        replyText = generated.reply;
        modelUsed = generated.modelUsed;
      }

      // 3. Log outbound response
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
        audioUrl,
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

  const startVoiceRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        stream.getTracks().forEach(track => track.stop());
        clearInterval(recordingTimerRef.current);
        setIsRecordingVoice(false);
        setRecordingSeconds(0);

        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = async () => {
          const base64Data = (reader.result as string) || '';
          await sendSimulatorVoiceNote(base64Data, audioBlob);
        };
      };

      mediaRecorder.start();
      setIsRecordingVoice(true);
      setRecordingSeconds(0);
      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds(prev => prev + 1);
      }, 1000);
    } catch (err: any) {
      alert("Microphone inaccessible : " + (err?.message || 'Vérifiez les permissions de votre navigateur.'));
      setIsRecordingVoice(false);
      clearInterval(recordingTimerRef.current);
    }
  };

  const stopVoiceRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  };

  const sendSimulatorVoiceNote = async (base64AudioUrl: string, blob: Blob) => {
    const userAudioUrl = URL.createObjectURL(blob);
    const userBubble: ChatBubble = {
      id: `usr_v_${Date.now()}`,
      sender: 'USER',
      text: '🎤 Note Vocale envoyée',
      timestamp: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
      audioUrl: userAudioUrl,
      isVoice: true
    };
    setChatHistory(prev => [...prev, userBubble]);
    setIsSendingChat(true);

    const targetPhone = selectedStaffUser.phone || personalPhone || '+237600000000';

    try {
      const cleanB64 = base64AudioUrl.replace(/^data:audio\/[^;]+;base64,/, '');
      const resp = await fetch('https://smart-hosto.onrender.com/api/whatsapp/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          staffId: selectedStaffUser.id,
          phone: targetPhone,
          staffSnapshot: selectedStaffUser,
          audioBase64: cleanB64,
          audioMimeType: 'audio/webm',
          sendToRealWhatsApp: forwardToRealWhatsApp
        })
      });

      if (resp.ok) {
        const data = await resp.json();
        const agentBubble: ChatBubble = {
          id: `agt_${Date.now()}`,
          sender: 'AGENT',
          text: data.reply || 'Note vocale traitée avec succès.',
          timestamp: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
          modelUsed: data.modelUsed,
          audioUrl: data.audioUrl,
          metaSent: Boolean(data.metaDelivery?.sent)
        };
        setChatHistory(prev => [...prev, agentBubble]);
      } else {
        throw new Error(`Erreur serveur (${resp.status})`);
      }
    } catch (err: any) {
      setChatHistory(prev => [
        ...prev,
        {
          id: `err_${Date.now()}`,
          sender: 'AGENT',
          text: `⚠️ Erreur lors du traitement de la note vocale : ${err?.message}`,
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
              { id: 'LIVE_CHATS', label: 'Discussions & Prise en Main', icon: MessageSquare },
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
                        {bubble.audioUrl && (
                          <div className="mt-2.5 pt-2 border-t border-slate-200/50 dark:border-zinc-700/50">
                            <div className="flex items-center gap-1.5 mb-1.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-400">
                              <Volume2 size={13} />
                              <span>{isUser ? 'Votre Note Vocale' : `Note Vocale IA (${config.voiceName || 'Aoede'})`}</span>
                            </div>
                            <audio
                              controls
                              src={bubble.audioUrl.startsWith('http') || bubble.audioUrl.startsWith('blob:') ? bubble.audioUrl : `https://smart-hosto.onrender.com${bubble.audioUrl}`}
                              className="w-full h-8 rounded-lg outline-none"
                            />
                          </div>
                        )}
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
                      <span>Analyse et traitement vocal en direct...</span>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Input Bar */}
              <form
                onSubmit={e => {
                  e.preventDefault();
                  if (isRecordingVoice) {
                    stopVoiceRecording();
                  } else {
                    sendSimulatorMessage();
                  }
                }}
                className="p-3 bg-[#F0F2F5] dark:bg-[#202C33] flex items-center gap-2 shrink-0"
              >
                {isRecordingVoice ? (
                  <div className="flex-1 px-4 py-2 rounded-full bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 flex items-center justify-between animate-pulse">
                    <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400 text-xs font-bold">
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping" />
                      <span>Enregistrement en cours... {recordingSeconds}s</span>
                    </div>
                    <span className="text-[10px] text-rose-500">Cliquez sur le micro pour envoyer</span>
                  </div>
                ) : (
                  <input
                    type="text"
                    value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
                    placeholder="Écrivez un message ou cliquez sur le micro pour parler..."
                    className="flex-1 px-4 py-2.5 rounded-full bg-white dark:bg-[#2A3942] text-slate-900 dark:text-white text-xs font-medium outline-none border border-transparent focus:border-emerald-500"
                  />
                )}

                {/* Microphone Record Button */}
                <button
                  type="button"
                  onClick={isRecordingVoice ? stopVoiceRecording : startVoiceRecording}
                  disabled={isSendingChat}
                  className={`w-10 h-10 rounded-full flex items-center justify-center transition-all cursor-pointer shrink-0 shadow-md ${
                    isRecordingVoice
                      ? 'bg-rose-600 hover:bg-rose-700 text-white animate-bounce'
                      : 'bg-slate-200 dark:bg-zinc-800 hover:bg-emerald-100 hover:text-emerald-700 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-200'
                  }`}
                  title={isRecordingVoice ? 'Arrêter et envoyer la note vocale' : 'Enregistrer une note vocale'}
                >
                  {isRecordingVoice ? <MicOff size={18} /> : <Mic size={18} />}
                </button>

                {/* Send Button */}
                {!isRecordingVoice && (
                  <button
                    type="submit"
                    disabled={!chatInput.trim() || isSendingChat}
                    className="w-10 h-10 rounded-full bg-[#00A884] hover:bg-[#008f6f] disabled:opacity-50 text-white flex items-center justify-center transition-all cursor-pointer shrink-0 shadow-md"
                  >
                    <Send size={16} />
                  </button>
                )}
              </form>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================
          SUBTAB: LIVE CONVERSATIONS & HUMAN HANDOVER INBOX
      ========================================================= */}
      {!staffOnlyMode && subTab === 'LIVE_CHATS' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Threads List Pane */}
          <div className="lg:col-span-4 space-y-4">
            <div
              className={`p-4 rounded-3xl border ${
                isDark ? 'bg-zinc-900/50 border-zinc-800' : 'bg-white border-slate-200 shadow-sm'
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-emerald-600/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                    <MessageSquare size={16} />
                  </div>
                  <div>
                    <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-zinc-200">
                      Discussions WhatsApp
                    </h3>
                    <p className="text-[10px] text-slate-500">
                      {threads.length} conversation{threads.length > 1 ? 's' : ''} active{threads.length > 1 ? 's' : ''}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={fetchThreads}
                  disabled={isLoadingThreads}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                  title="Actualiser les fils"
                >
                  <RefreshCw size={14} className={isLoadingThreads ? 'animate-spin' : ''} />
                </button>
              </div>

              {isLoadingThreads && threads.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-400">Chargement des conversations...</div>
              ) : threads.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-400 space-y-2">
                  <Smartphone size={28} className="mx-auto text-slate-300" />
                  <p>Aucun message reçu pour l'instant.</p>
                  <p className="text-[10px] text-slate-400">
                    Les échanges réels avec le numéro de l'hôpital apparaîtront ici en temps réel.
                  </p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1 custom-scrollbar">
                  {threads.map(t => {
                    const isSelected = selectedThreadPhone === t.phone;
                    const isHumanMode = t.mode === 'HUMAN';
                    return (
                      <div
                        key={t.phone}
                        onClick={() => setSelectedThreadPhone(t.phone)}
                        className={`p-3 rounded-2xl cursor-pointer transition-all border ${
                          isSelected
                            ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-500/50 shadow-xs'
                            : isDark
                            ? 'bg-zinc-950/40 border-zinc-800/80 hover:bg-zinc-800/40'
                            : 'bg-slate-50/70 border-slate-200/60 hover:bg-slate-100/70'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-lg bg-emerald-600 text-white font-black text-xs flex items-center justify-center">
                              {t.contactName?.charAt(0)?.toUpperCase() || 'P'}
                            </div>
                            <div>
                              <div className="text-xs font-black text-slate-900 dark:text-zinc-100 truncate max-w-[130px]">
                                {t.contactName}
                              </div>
                              <div className="text-[10px] text-slate-400 font-mono">+{t.phone}</div>
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${
                                isHumanMode
                                  ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-700'
                                  : 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-700'
                              }`}
                            >
                              {isHumanMode ? '👤 Humain' : '🤖 IA'}
                            </span>
                            <div className="text-[9px] text-slate-400 mt-0.5">
                              {t.lastTimestamp ? new Date(t.lastTimestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : ''}
                            </div>
                          </div>
                        </div>

                        <p className="text-[11px] text-slate-600 dark:text-zinc-400 line-clamp-1 italic mt-1">
                          {t.lastDirection === 'OUTBOUND' ? '↪ ' : '↩ '}
                          {t.lastMessage || 'Message'}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Active Conversation & Intervention Chat Pane */}
          <div className="lg:col-span-8 space-y-4">
            {selectedThreadPhone ? (
              <div
                className={`p-5 rounded-3xl border flex flex-col h-[680px] ${
                  isDark ? 'bg-zinc-900/50 border-zinc-800' : 'bg-white border-slate-200 shadow-sm'
                }`}
              >
                {/* Thread Header with Handover Toggle */}
                {(() => {
                  const currentThread = threads.find(t => t.phone === selectedThreadPhone) || {
                    phone: selectedThreadPhone,
                    contactName: `+${selectedThreadPhone}`,
                    mode: 'AI'
                  };
                  const isHuman = currentThread.mode === 'HUMAN';

                  return (
                    <div className="pb-4 border-b border-slate-100 dark:border-zinc-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white font-black text-sm flex items-center justify-center shadow-xs">
                          {currentThread.contactName?.charAt(0)?.toUpperCase() || 'P'}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-black text-slate-900 dark:text-zinc-100">
                              {currentThread.contactName}
                            </h3>
                            <span className="text-xs text-slate-400 font-mono">+{currentThread.phone}</span>
                          </div>
                          <div className="text-[11px] flex items-center gap-2 mt-0.5">
                            <span className="text-slate-500">Statut de réponse :</span>
                            <span
                              className={`font-black ${
                                isHuman ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'
                              }`}
                            >
                              {isHuman
                                ? `Intervention humaine en cours (${currentThread.assignedStaffName || 'Soignant'})`
                                : 'Réponse IA automatique activée'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Mode Toggle Button */}
                      <div>
                        {isHuman ? (
                          <button
                            type="button"
                            onClick={() => handleToggleHandoverMode(selectedThreadPhone, 'AI')}
                            disabled={isTogglingMode}
                            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer shadow-xs shadow-emerald-600/20 active:scale-[0.98]"
                          >
                            <Bot size={14} />
                            <span>Rendre la main à l'IA 🤖</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleToggleHandoverMode(selectedThreadPhone, 'HUMAN')}
                            disabled={isTogglingMode}
                            className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-900 text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer shadow-xs shadow-amber-500/20 active:scale-[0.98]"
                          >
                            <Users size={14} />
                            <span>Prendre la main (Pause IA) 👤</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* Messages History */}
                <div className="flex-1 overflow-y-auto py-4 space-y-3 pr-2 custom-scrollbar">
                  {isLoadingMessages && threadMessages.length === 0 ? (
                    <div className="py-16 text-center text-xs text-slate-400">Chargement de la discussion...</div>
                  ) : threadMessages.length === 0 ? (
                    <div className="py-16 text-center text-xs text-slate-400">Aucun message dans ce fil.</div>
                  ) : (
                    threadMessages.map(m => {
                      const isInbound = m.direction === 'INBOUND';
                      const isHuman = m.source === 'HUMAN_AGENT';
                      const isDoc = m.source === 'DOCUMENT_DISPATCH' || m.source === 'NOTIFICATION';

                      return (
                        <div
                          key={m.id}
                          className={`flex flex-col ${isInbound ? 'items-start' : 'items-end'}`}
                        >
                          <div className="flex items-center gap-1.5 mb-1 px-1 text-[10px] text-slate-400">
                            {isInbound ? (
                              <span>↩ {m.staffName || 'Patient'}</span>
                            ) : isHuman ? (
                              <span className="text-amber-600 dark:text-amber-400 font-bold flex items-center gap-1">
                                👤 {m.staffName || 'Soignant'} ({m.staffRole || 'STAFF'})
                              </span>
                            ) : isDoc ? (
                              <span className="text-blue-600 dark:text-blue-400 font-bold">
                                📄 Document officiel transmis
                              </span>
                            ) : (
                              <span className="text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
                                🤖 IA SMART-HOSTO ({m.aiModel || 'Gemini'})
                              </span>
                            )}
                            <span>•</span>
                            <span>
                              {m.createdAt
                                ? new Date(m.createdAt).toLocaleTimeString('fr-FR', {
                                    hour: '2-digit',
                                    minute: '2-digit'
                                  })
                                : ''}
                            </span>
                          </div>

                          <div
                            className={`max-w-[85%] rounded-2xl px-4 py-3 text-xs leading-relaxed whitespace-pre-wrap ${
                              isInbound
                                ? isDark
                                  ? 'bg-zinc-800 text-zinc-100 rounded-tl-xs'
                                  : 'bg-slate-100 text-slate-800 rounded-tl-xs'
                                : isHuman
                                ? 'bg-amber-600 text-white rounded-tr-xs shadow-xs'
                                : isDoc
                                ? 'bg-blue-600 text-white rounded-tr-xs shadow-xs'
                                : 'bg-emerald-700 text-white rounded-tr-xs shadow-xs'
                            }`}
                          >
                            {m.message}
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={threadEndRef} />
                </div>

                {/* Reply Input Box */}
                <div className="pt-3 border-t border-slate-100 dark:border-zinc-800 shrink-0">
                  <div className="flex items-center justify-between text-[11px] text-slate-400 mb-2">
                    <span>
                      Envoi depuis le numéro officiel : <strong className="text-emerald-600">+237 6 81 05 11 23</strong>
                    </span>
                    <span>
                      Opérateur : <strong className="text-slate-700 dark:text-zinc-300">{currentUser?.name || 'Soignant'}</strong>
                    </span>
                  </div>

                  <form
                    onSubmit={e => {
                      e.preventDefault();
                      handleSendHumanReply();
                    }}
                    className="flex items-center gap-2"
                  >
                    <input
                      type="text"
                      placeholder="Tapez votre réponse humaine à envoyer sur le WhatsApp du patient..."
                      value={humanReplyText}
                      onChange={e => setHumanReplyText(e.target.value)}
                      disabled={isSendingHumanReply}
                      className={`flex-1 px-4 py-3 rounded-2xl text-xs border focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all ${
                        isDark
                          ? 'bg-zinc-950 border-zinc-800 text-zinc-100 placeholder-zinc-500'
                          : 'bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400'
                      }`}
                    />
                    <button
                      type="submit"
                      disabled={isSendingHumanReply || !humanReplyText.trim()}
                      className="px-5 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-300 dark:disabled:bg-zinc-800 text-white font-black text-xs flex items-center gap-1.5 transition-all cursor-pointer disabled:cursor-not-allowed shadow-xs"
                    >
                      {isSendingHumanReply ? (
                        <RefreshCw size={14} className="animate-spin" />
                      ) : (
                        <Send size={14} />
                      )}
                      <span>Envoyer</span>
                    </button>
                  </form>
                </div>
              </div>
            ) : (
              <div
                className={`p-16 text-center rounded-3xl border flex flex-col items-center justify-center space-y-3 h-[680px] ${
                  isDark ? 'bg-zinc-900/50 border-zinc-800' : 'bg-white border-slate-200 shadow-sm'
                }`}
              >
                <div className="w-16 h-16 rounded-3xl bg-slate-100 dark:bg-zinc-800 flex items-center justify-center text-slate-400">
                  <MessageSquare size={32} />
                </div>
                <h4 className="font-black text-slate-800 dark:text-zinc-200 text-sm">
                  Sélectionnez une discussion à gauche
                </h4>
                <p className="text-xs text-slate-400 max-w-sm">
                  Visualisez l'historique en temps réel, prenez le relais sur l'IA ou répondez directement au patient ou praticien.
                </p>
              </div>
            )}
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
                  <option value="gemini-3.5-flash">gemini-3.5-flash (Nouvelle Génération • Recommandé)</option>
                  <option value="gemini-3.1-pro-preview">gemini-3.1-pro-preview (Flagship Pro • Raisonnement maximal)</option>
                  <option value="gemini-3-flash-preview">gemini-3-flash-preview (Haute performance)</option>
                  <option value="gemini-2.5-flash">gemini-2.5-flash (Classique stable)</option>
                </select>
              </div>
            </div>

            {/* Voice Notes & Audio Synthesis Settings */}
            <div className="p-4 rounded-2xl bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200/60 dark:border-emerald-800/40 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-md shadow-emerald-600/20">
                    <Volume2 size={16} />
                  </div>
                  <div>
                    <h4 className="text-xs font-black text-slate-800 dark:text-zinc-100 flex items-center gap-1.5">
                      <span>Notes Vocales IA WhatsApp</span>
                      <span className="px-2 py-0.5 rounded-full text-[9px] bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300 font-bold">
                        Speech-to-Speech
                      </span>
                    </h4>
                    <p className="text-[10px] text-slate-500 dark:text-zinc-400">
                      Écoute les notes vocales WhatsApp et répond vocalement avec voix de synthèse Gemini TTS
                    </p>
                  </div>
                </div>

                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.voiceEnabled}
                    onChange={e => setConfig({ ...config, voiceEnabled: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-zinc-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
                </label>
              </div>

              {config.voiceEnabled && (
                <div className="pt-2 border-t border-emerald-200/50 dark:border-emerald-800/40">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-zinc-400 block mb-1">
                    Voix de Synthèse Hospitalière
                  </label>
                  <select
                    value={config.voiceName}
                    onChange={e => setConfig({ ...config, voiceName: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-xl border border-emerald-300 dark:border-emerald-800 bg-white dark:bg-zinc-900 text-xs font-bold"
                  >
                    <option value="Aoede">Aoede (Voix féminine chaleureuse et professionnelle • Recommandée)</option>
                    <option value="Puck">Puck (Voix masculine dynamique et claire)</option>
                    <option value="Charon">Charon (Voix posée et institutionnelle)</option>
                    <option value="Kore">Kore (Voix douce et rassurante)</option>
                    <option value="Fenrir">Fenrir (Voix grave et assurée)</option>
                  </select>
                </div>
              )}
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
