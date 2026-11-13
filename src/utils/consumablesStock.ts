import { db, sanitizeData } from '../firebase';
import { collection, doc, getDoc, getDocs, writeBatch } from 'firebase/firestore';
import { User, EstablishmentConfig } from '../../types';
import { getActiveTenantId, belongsToTenant, stampTenantData } from './tenant';

export interface DeductConsumablesParams {
  actId?: string;
  actName?: string;
  quantityMultiplier?: number;
  user?: User | null;
  establishment?: EstablishmentConfig | null;
  moduleSource?: string;
}

/**
 * Automatically decrements configured consumables (hospital_consumables) and
 * attached pharmacy items (pharmacy_inventory) when a medical act or nursing care
 * is marked as Completed (Fait). Triggers low-stock alerts if threshold is reached.
 */
export async function deductConsumablesForAct({
  actId,
  actName,
  quantityMultiplier = 1,
  user,
  establishment,
  moduleSource = 'Soins'
}: DeductConsumablesParams): Promise<{ deductedCount: number; lowStockItems: string[] }> {
  const activeTenantId = getActiveTenantId(user, establishment);
  const mult = Math.max(1, Number(quantityMultiplier) || 1);
  let targetAct: any = null;

  try {
    // 1. Find the parameterized MedicalAct
    if (actId) {
      const snap = await getDoc(doc(db, 'medical_acts', actId));
      if (snap.exists() && belongsToTenant(snap.data(), activeTenantId)) {
        targetAct = { id: snap.id, ...snap.data() };
      }
    }

    if (!targetAct && actName) {
      const cleanName = String(actName).trim().toLowerCase();
      const actsSnap = await getDocs(collection(db, 'medical_acts'));
      const matched = actsSnap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(a => belongsToTenant(a, activeTenantId))
        .find((a: any) => {
          const n = String(a.name || a.nom || '').trim().toLowerCase();
          return n && (n === cleanName || cleanName.includes(n) || n.includes(cleanName));
        });
      if (matched) targetAct = matched;
    }

    if (!targetAct) {
      return { deductedCount: 0, lowStockItems: [] };
    }

    const attachedCons: any[] = Array.isArray(targetAct.attachedConsumables) ? targetAct.attachedConsumables : [];
    const attachedMeds: any[] = Array.isArray(targetAct.attachedMeds) ? targetAct.attachedMeds : [];
    const legacyConsNames: string[] = Array.isArray(targetAct.consommables) ? targetAct.consommables : [];

    if (attachedCons.length === 0 && attachedMeds.length === 0 && legacyConsNames.length === 0) {
      return { deductedCount: 0, lowStockItems: [] };
    }

    const batch = writeBatch(db);
    let deductedCount = 0;
    const lowStockItems: string[] = [];
    const nowIso = new Date().toISOString();

    const [consSnap, pharmSnap] = await Promise.all([
      getDocs(collection(db, 'hospital_consumables')),
      getDocs(collection(db, 'pharmacy_inventory'))
    ]);

    const consDocs = consSnap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(d => belongsToTenant(d, activeTenantId));
    const pharmDocs = pharmSnap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(d => belongsToTenant(d, activeTenantId));

    const applyDecrement = (
      colName: 'hospital_consumables' | 'pharmacy_inventory',
      stockDoc: any,
      qtyToDeduct: number
    ) => {
      const currentStock = Number(stockDoc.stock ?? stockDoc.stockInitial ?? stockDoc.quantite ?? 0);
      const nextStock = Math.max(0, currentStock - qtyToDeduct);
      const threshold = Number(stockDoc.minStock ?? stockDoc.seuilAlerte ?? stockDoc.alertThreshold ?? 10);
      const itemName = stockDoc.nom || stockDoc.name || stockDoc.nomCommercial || stockDoc.id;

      batch.update(doc(db, colName, stockDoc.id), sanitizeData({
        stock: nextStock,
        stockInitial: nextStock,
        quantite: nextStock,
        lastUpdated: nowIso
      }));
      deductedCount++;

      if (nextStock <= threshold) {
        lowStockItems.push(`${itemName} (${nextStock} restant${nextStock > 1 ? 's' : ''})`);
        const alertRef = doc(collection(db, 'system_alerts'));
        batch.set(alertRef, sanitizeData(stampTenantData({
          id: alertRef.id,
          type: nextStock === 0 ? 'STOCK_OUT' : 'LOW_STOCK',
          severity: nextStock === 0 ? 'CRITICAL' : 'WARNING',
          module: 'Pharmacie',
          sourceModule: moduleSource,
          itemId: stockDoc.id,
          itemName,
          currentStock: nextStock,
          threshold,
          message: `Alerte Stock (${moduleSource}) : ${itemName} — ${nextStock} restant(s) (seuil : ${threshold}).`,
          read: false,
          createdAt: nowIso
        }, user, establishment)));
      }
    };

    // 2. Deduct attachedConsumables from hospital_consumables (or fallback to pharmacy_inventory)
    for (const reqItem of attachedCons) {
      const qty = Math.max(1, Number(reqItem.quantity) || 1) * mult;
      const byId = consDocs.find((d: any) => d.id === reqItem.id);
      if (byId) {
        applyDecrement('hospital_consumables', byId, qty);
      } else if (reqItem.name) {
        const clean = String(reqItem.name).trim().toLowerCase();
        const byName = consDocs.find((d: any) => String(d.nom || d.name || '').toLowerCase().includes(clean));
        if (byName) {
          applyDecrement('hospital_consumables', byName, qty);
        } else {
          const pharmMatch = pharmDocs.find((d: any) => String(d.name || d.nomCommercial || d.nom || '').toLowerCase().includes(clean));
          if (pharmMatch) applyDecrement('pharmacy_inventory', pharmMatch, qty);
        }
      }
    }

    // 3. Deduct attachedMeds from pharmacy_inventory
    for (const reqMed of attachedMeds) {
      const qty = Math.max(1, Number(reqMed.quantity) || 1) * mult;
      const byId = pharmDocs.find((d: any) => d.id === reqMed.id);
      if (byId) {
        applyDecrement('pharmacy_inventory', byId, qty);
      } else if (reqMed.name) {
        const clean = String(reqMed.name).trim().toLowerCase();
        const byName = pharmDocs.find((d: any) => String(d.name || d.nomCommercial || d.nom || '').toLowerCase().includes(clean));
        if (byName) applyDecrement('pharmacy_inventory', byName, qty);
      }
    }

    // 4. Fallback for legacy string consommables array if no attachedConsumables
    if (attachedCons.length === 0 && legacyConsNames.length > 0) {
      for (const rawLabel of legacyConsNames) {
        const clean = String(rawLabel).replace(/\(x\d+.*?\)/i, '').trim().toLowerCase();
        if (!clean) continue;
        const cMatch = consDocs.find((d: any) => String(d.nom || d.name || '').toLowerCase().includes(clean));
        if (cMatch) {
          applyDecrement('hospital_consumables', cMatch, mult);
          continue;
        }
        const pMatch = pharmDocs.find((d: any) => String(d.name || d.nomCommercial || d.nom || '').toLowerCase().includes(clean));
        if (pMatch) {
          applyDecrement('pharmacy_inventory', pMatch, mult);
        }
      }
    }

    if (deductedCount > 0) {
      await batch.commit();
      if (lowStockItems.length > 0 && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('app-notification', {
          detail: {
            message: `⚠️ Alerte Stock Bas Pharmacie : ${lowStockItems.join(', ')}`,
            type: 'warning'
          }
        }));
      }
    }

    return { deductedCount, lowStockItems };
  } catch (err) {
    console.warn('deductConsumablesForAct failed:', err);
    return { deductedCount: 0, lowStockItems: [] };
  }
}
