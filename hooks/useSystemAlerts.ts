import { useState, useEffect, useMemo, useCallback } from 'react';
import { db } from '../src/firebase';
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { Role, User } from '../types';
import { getActiveTenantId, belongsToTenant } from '../src/utils/tenant';

export interface SystemAlert {
  id: string;
  source: 'PHARMACY' | 'LAB' | 'EMERGENCY' | 'BEDS' | 'TRIAGE' | 'LICENCE';
  sourceLabel: string;
  title: string;
  message: string;
  severity: 'critical' | 'warning' | 'info';
  timestamp: string; // ISO string or parsable date
  relativeTime: string;
  targetModule: Role | 'SETTING';
  targetTab?: string;
  targetId?: string;
  itemDetails?: any;
}

/**
 * Computes human-friendly French relative time from a date string or timestamp
 */
export function getRelativeTimeString(dateInput: any): string {
  if (!dateInput) return "À l'instant";
  
  let date: Date;
  if (typeof dateInput === 'object' && dateInput.toDate) {
    date = dateInput.toDate();
  } else if (typeof dateInput === 'string' || typeof dateInput === 'number') {
    date = new Date(dateInput);
  } else if (dateInput instanceof Date) {
    date = dateInput;
  } else {
    return "À l'instant";
  }

  if (isNaN(date.getTime())) return "À l'instant";

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  
  // Future dates or less than 30 seconds
  if (diffMs < 30000) return "À l'instant";
  
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  if (diffMinutes < 60) {
    return `Il y a ${diffMinutes} min`;
  }
  
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `Il y a ${diffHours} h`;
  }
  
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return 'Hier';
  if (diffDays < 7) return `Il y a ${diffDays} j`;
  
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

/**
 * Determines whether a user with given role(s) can view a specific alert
 */
export function isAlertVisibleForUser(user: User | null, alert: SystemAlert): boolean {
  if (!user) return false;

  // Administrators, Super Admins, Directors see EVERYTHING
  const isAdmin = user.role === Role.ADMIN || 
                  user.role === Role.SUPER_ADMIN || 
                  user.roles?.includes('role_admin') || 
                  user.roles?.includes('role_super_admin') || 
                  user.roles?.includes('role_directeur');
  if (isAdmin) return true;

  const role = user.role;
  const userRoles = user.roles || [];

  switch (alert.source) {
    case 'PHARMACY':
      return role === Role.PHARMACY || userRoles.includes('role_pharmacien');

    case 'LAB':
      return role === Role.LAB || 
             userRoles.includes('role_laborantin') || 
             userRoles.includes('role_biologiste') || 
             role === Role.DOCTOR || 
             userRoles.includes('role_medecin');

    case 'EMERGENCY':
    case 'TRIAGE':
      return role === Role.DOCTOR || 
             role === Role.URGENCE || 
             role === Role.NURSE || 
             role === Role.RECEPTION || 
             userRoles.includes('role_medecin') || 
             userRoles.includes('role_infirmier') || 
             userRoles.includes('role_accueil') || 
             userRoles.includes('role_secretaire');

    case 'BEDS':
      return role === Role.NURSE || 
             role === Role.DOCTOR || 
             role === Role.MATERNITY || 
             userRoles.includes('role_infirmier') || 
             userRoles.includes('role_major') || 
             userRoles.includes('role_sage_femme');

    default:
      return false;
  }
}

export const useSystemAlerts = (user: User | null) => {
  const [pharmacyItems, setPharmacyItems] = useState<any[]>([]);
  const [labRequests, setLabRequests] = useState<any[]>([]);
  const [queueItems, setQueueItems] = useState<any[]>([]);
  const [emergencyPatients, setEmergencyPatients] = useState<any[]>([]);
  const [beds, setBeds] = useState<any[]>([]);
  const [readAlertIds, setReadAlertIds] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('hospital_read_alerts');
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch {
      return new Set();
    }
  });

  const activeTenantId = getActiveTenantId(user);

  // 1. Real-time Listeners for Pharmacy, Lab, Queues, Emergencies, Beds (Strictly isolated by clinic tenant)
  useEffect(() => {
    // Pharmacy inventory
    const unsubPharmacy = onSnapshot(collection(db, 'pharmacy_inventory'), (snap) => {
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setPharmacyItems(items.filter(item => belongsToTenant(item, activeTenantId)));
    }, (err) => console.warn('Alerts: Error listening to pharmacy_inventory', err));

    // Lab requests
    const unsubLab = onSnapshot(collection(db, 'lab_requests'), (snap) => {
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setLabRequests(items.filter(item => belongsToTenant(item, activeTenantId)));
    }, (err) => console.warn('Alerts: Error listening to lab_requests', err));

    // Service Queues (Triage / Waiting)
    const unsubQueues = onSnapshot(collection(db, 'service_queues'), (snap) => {
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setQueueItems(items.filter(item => belongsToTenant(item, activeTenantId)));
    }, (err) => console.warn('Alerts: Error listening to service_queues', err));

    // Emergency Patients
    const unsubEmergencies = onSnapshot(collection(db, 'emergency_patients'), (snap) => {
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setEmergencyPatients(items.filter(item => belongsToTenant(item, activeTenantId)));
    }, (err) => console.warn('Alerts: Error listening to emergency_patients', err));

    // Beds Infrastructure
    const unsubBeds = onSnapshot(collection(db, 'beds'), (snap) => {
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setBeds(items.filter(item => belongsToTenant(item, activeTenantId)));
    }, (err) => console.warn('Alerts: Error listening to beds', err));

    return () => {
      unsubPharmacy();
      unsubLab();
      unsubQueues();
      unsubEmergencies();
      unsubBeds();
    };
  }, [activeTenantId]);

  // 2. Derive real-time alerts based on exact database states
  const rawAlerts = useMemo<SystemAlert[]>(() => {
    const generated: SystemAlert[] = [];

    // --- A. PHARMACIE (Low Stock / Ruptures) ---
    pharmacyItems.forEach((item) => {
      const stock = typeof item.stock === 'number' ? item.stock : (item.quantity ?? 0);
      const minStock = typeof item.minStock === 'number' ? item.minStock : (typeof item.seuilAlerte === 'number' ? item.seuilAlerte : 10);
      const medName = item.name || item.nom || item.designation || 'Médicament';

      if (stock <= minStock) {
        const isCritical = stock <= 0 || stock <= 2;
        const timestamp = item.lastRestockedAt || item.updatedAt || item.createdAt || new Date().toISOString();

        generated.push({
          id: `pharmacy-stock-${item.id}`,
          source: 'PHARMACY',
          sourceLabel: 'Pharmacie',
          title: isCritical 
            ? `Rupture de stock imminente: ${medName}` 
            : `Stock critique: ${medName}`,
          message: isCritical 
            ? `Rupture totale (${stock} restant(s)). Réapprovisionnement urgent requis.`
            : `Niveau de stock bas (${stock} restant(s), seuil: ${minStock}).`,
          severity: isCritical ? 'critical' : 'warning',
          timestamp,
          relativeTime: getRelativeTimeString(timestamp),
          targetModule: Role.PHARMACY,
          targetTab: 'sales',
          targetId: item.id,
          itemDetails: item
        });
      }
    });

    // --- B. LABORATOIRE (Pending Validations) ---
    const pendingValidationRequests = labRequests.filter(req => {
      const s = (req.status || '').toLowerCase();
      return s === 'ready_for_validation' || 
             s === 'en attente de validation' || 
             s === 'pending_validation' || 
             s === 'completed_pending_validation';
    });

    if (pendingValidationRequests.length > 0) {
      // Group or generate detailed alerts
      pendingValidationRequests.forEach(req => {
        const patientName = req.patientName || req.patient || 'Patient';
        const examName = req.examName || req.testName || (Array.isArray(req.tests) ? req.tests.map((t: any) => t.name || t).join(', ') : 'Analyses');
        const timestamp = req.completedAt || req.updatedAt || req.createdAt || req.date || new Date().toISOString();

        generated.push({
          id: `lab-validation-${req.id || req.firebaseId}`,
          source: 'LAB',
          sourceLabel: 'Laboratoire',
          title: `Validation requise: ${examName}`,
          message: `Résultats prêts pour validation biologique (${patientName}).`,
          severity: 'info',
          timestamp,
          relativeTime: getRelativeTimeString(timestamp),
          targetModule: Role.LAB,
          targetTab: 'validations',
          targetId: req.id || req.firebaseId,
          itemDetails: req
        });
      });
    }

    // --- C. ACCUEIL / TRIAGE / URGENCES (Emergencies / Cas Critiques) ---
    // 1. From Service Queues (today's critical patients)
    queueItems.forEach(q => {
      const isUrgentOrCritical = (q.priority === 'CRITICAL' || q.priority === 'critique' || (q.priorityAlerts && q.priorityAlerts.length > 0)) && 
                                 q.status !== 'completed' && q.status !== 'discharged' && q.status !== 'cloture';
      if (isUrgentOrCritical) {
        const patientName = q.firstName ? `${q.firstName} ${q.lastName}` : (q.patientName || 'Patient');
        const timestamp = q.createdAt || q.time || new Date().toISOString();
        const alertList = q.priorityAlerts && q.priorityAlerts.length > 0 ? ` (${q.priorityAlerts.join(', ')})` : '';

        generated.push({
          id: `queue-critical-${q.id || q.queueDocId}`,
          source: 'TRIAGE',
          sourceLabel: 'Triage & Urgences',
          title: `Urgence vitale: ${patientName}`,
          message: `Cas critique en file d'attente${alertList} - Prise en charge médicale prioritaire requise.`,
          severity: 'critical',
          timestamp,
          relativeTime: getRelativeTimeString(timestamp),
          targetModule: Role.DOCTOR,
          targetTab: 'WAITING_ROOM',
          targetId: q.id || q.queueDocId,
          itemDetails: q
        });
      }
    });

    // 2. From Emergency Patients (in triage / ER room with critical level)
    emergencyPatients.forEach(ep => {
      const isTriageRed = ep.triage?.level === 'ROUGE' || ep.status === 'ER_ROOM';
      if (isTriageRed && ep.status !== 'ORIENTED' && (ep as any).status !== 'DISCHARGED') {
        const patientName = `${ep.firstName || ''} ${ep.lastName || ''}`.trim() || 'Patient Urgence';
        const timestamp = ep.arrivalTimestamp || ep.triage?.timestamp || ep.createdAt || new Date().toISOString();

        generated.push({
          id: `emergency-critical-${ep.id || ep.emergencyId}`,
          source: 'EMERGENCY',
          sourceLabel: 'Urgences',
          title: `Urgence Vitale (Salle Déchocage): ${patientName}`,
          message: `Patient en soins critiques urgents (${ep.triage?.motif || 'Détresse vitale'}).`,
          severity: 'critical',
          timestamp,
          relativeTime: getRelativeTimeString(timestamp),
          targetModule: Role.URGENCE,
          targetTab: 'ER_ROOM',
          targetId: ep.id || ep.emergencyId,
          itemDetails: ep
        });
      }
    });

    // --- D. HOSPITALISATION & MATERNITE (Bed Shortage / Tension Hospitalière) ---
    if (beds.length > 0) {
      const totalBeds = beds.length;
      const availableBeds = beds.filter(b => b.status === 'AVAILABLE' && !b.occupied).length;
      const occupiedBeds = totalBeds - availableBeds;
      const occupancyRate = Math.round((occupiedBeds / totalBeds) * 100);
      const availableRatio = availableBeds / totalBeds;

      if (availableRatio <= 0.10 || availableBeds <= 1) {
        const isExhausted = availableBeds === 0;
        const timestamp = new Date().toISOString();

        generated.push({
          id: 'beds-shortage-alert',
          source: 'BEDS',
          sourceLabel: 'Hospitalisation',
          title: isExhausted 
            ? 'Pénurie de lits: Capacité maximale atteinte (100%)' 
            : `Tension hospitalière: Moins de 10% de lits disponibles`,
          message: `${availableBeds} lit(s) libre(s) sur ${totalBeds} (${occupancyRate}% d'occupation). Risque de saturation des services.`,
          severity: isExhausted ? 'critical' : 'warning',
          timestamp,
          relativeTime: getRelativeTimeString(timestamp),
          targetModule: Role.NURSE,
          targetTab: 'beds',
          targetId: 'beds-infrastructure',
          itemDetails: { totalBeds, availableBeds, occupancyRate }
        });
      }
    }

    // Sort by severity (critical > warning > info) then by timestamp desc
    return generated.sort((a, b) => {
      const score = (sev: string) => sev === 'critical' ? 3 : sev === 'warning' ? 2 : 1;
      const diff = score(b.severity) - score(a.severity);
      if (diff !== 0) return diff;
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    });
  }, [pharmacyItems, labRequests, queueItems, emergencyPatients, beds]);

  // 3. Filter alerts by logged-in user role (Targeting)
  const userAlerts = useMemo(() => {
    return rawAlerts.filter(alert => isAlertVisibleForUser(user, alert));
  }, [rawAlerts, user]);

  // 4. Unread count and counts by severity
  const unreadAlerts = useMemo(() => {
    return userAlerts.filter(a => !readAlertIds.has(a.id));
  }, [userAlerts, readAlertIds]);

  const criticalCount = useMemo(() => {
    return userAlerts.filter(a => a.severity === 'critical').length;
  }, [userAlerts]);

  const warningCount = useMemo(() => {
    return userAlerts.filter(a => a.severity === 'warning').length;
  }, [userAlerts]);

  const infoCount = useMemo(() => {
    return userAlerts.filter(a => a.severity === 'info').length;
  }, [userAlerts]);

  const markAsRead = useCallback((id: string) => {
    setReadAlertIds(prev => {
      const next = new Set(prev);
      next.add(id);
      try {
        localStorage.setItem('hospital_read_alerts', JSON.stringify(Array.from(next)));
      } catch {}
      return next;
    });
  }, []);

  const markAllAsRead = useCallback(() => {
    const allIds = new Set(userAlerts.map(a => a.id));
    setReadAlertIds(allIds);
    try {
      localStorage.setItem('hospital_read_alerts', JSON.stringify(Array.from(allIds)));
    } catch {}
  }, [userAlerts]);

  // 5. Trigger navigation to deep-linked module and tab
  const navigateToAlert = useCallback((alert: SystemAlert) => {
    markAsRead(alert.id);
    
    // Dispatch rich event for App.tsx navigation
    window.dispatchEvent(new CustomEvent('change-module', {
      detail: {
        module: alert.targetModule,
        tab: alert.targetTab,
        itemId: alert.targetId,
        alertId: alert.id
      }
    }));
  }, [markAsRead]);

  return {
    alerts: userAlerts,
    allRawAlerts: rawAlerts,
    unreadAlerts,
    unreadCount: unreadAlerts.length,
    criticalCount,
    warningCount,
    infoCount,
    totalCount: userAlerts.length,
    markAsRead,
    markAllAsRead,
    navigateToAlert
  };
};
