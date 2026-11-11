import { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../src/firebase';
import { User, EstablishmentConfig, Licence } from '../types';
import { getActiveTenantId, belongsToTenant } from '../src/utils/tenant';

export interface HospitalLicenseInfo {
  clinicId: string;
  clinicName: string;
  planName: string;
  licenseType: string;
  status: 'ACTIVE' | 'WARNING' | 'EXPIRED';
  licenseStart: string | null;
  licenseEnd: string | null;
  daysRemaining: number;
  isExpired: boolean;
  isNearingExpiration: boolean;
  isCriticalExpiration: boolean;
  maxUsers: number;
  monthlyPriceFCFA: number;
  features: string[];
  contactEmail: string;
  contactPhone: string;
  loading: boolean;
}

export function useHospitalLicense(user?: User | null, establishment?: EstablishmentConfig | null) {
  const [activeHospitalRecord, setActiveHospitalRecord] = useState<any>(null);
  const [licencesCatalog, setLicencesCatalog] = useState<Licence[]>([]);
  const [loading, setLoading] = useState(true);

  const activeTenantId = getActiveTenantId(user, establishment);

  useEffect(() => {
    // 1. Listen to licences catalog
    const unsubLicences = onSnapshot(collection(db, 'licences'), (snap) => {
      setLicencesCatalog(snap.docs.map(d => ({ id: d.id, ...d.data() } as Licence)));
    }, (err) => console.warn('useHospitalLicense: Error listening to licences', err));

    // 2. Listen to hospitals collection
    const unsubHospitals = onSnapshot(collection(db, 'hospitals'), (snap) => {
      if (!snap.empty) {
        const found = snap.docs.find(d => 
          d.id === activeTenantId || 
          d.data().clinicId === activeTenantId || 
          d.data().tenantId === activeTenantId ||
          (activeTenantId === 'default_hospital' && (d.data().isDefault || d.id === 'default_hospital'))
        );
        if (found) {
          setActiveHospitalRecord({ id: found.id, ...found.data() });
          setLoading(false);
          return;
        }
      }
      setLoading(false);
    }, (err) => {
      console.warn('useHospitalLicense: Error listening to hospitals', err);
      setLoading(false);
    });

    // 3. Fallback listen to saas_clinics
    const unsubClinics = onSnapshot(collection(db, 'saas_clinics'), (snap) => {
      if (!snap.empty) {
        const found = snap.docs.find(d => 
          d.id === activeTenantId || 
          d.data().clinicId === activeTenantId || 
          d.data().tenantId === activeTenantId
        );
        if (found) {
          setActiveHospitalRecord((prev: any) => prev || { id: found.id, ...found.data() });
        }
      }
    }, () => {});

    return () => {
      unsubLicences();
      unsubHospitals();
      unsubClinics();
    };
  }, [activeTenantId]);

  const licenseInfo = useMemo<HospitalLicenseInfo>(() => {
    const rawName = activeHospitalRecord?.nom_licence || activeHospitalRecord?.licenseType || 'Standard';
    const cleanPlanName = String(rawName).toUpperCase();

    // Match in catalogue
    const matchedLicence = licencesCatalog.find(l => 
      l.nom_licence.toUpperCase() === cleanPlanName || 
      l.id.toUpperCase().includes(cleanPlanName)
    );

    const maxUsers = 
      Number(activeHospitalRecord?.quotas?.maxUsers) || 
      Number(activeHospitalRecord?.max_users) || 
      matchedLicence?.max_users || 
      (cleanPlanName.includes('ENTERPRISE') ? 100 : cleanPlanName.includes('PREMIUM') ? 35 : 15);

    const monthlyPriceFCFA = 
      Number(activeHospitalRecord?.licensePrice) || 
      matchedLicence?.monthlyPriceFCFA || 
      (cleanPlanName.includes('ENTERPRISE') ? 150000 : cleanPlanName.includes('PREMIUM') ? 95000 : 50000);

    const licenseStart = activeHospitalRecord?.licenseStart || activeHospitalRecord?.createdAt || null;
    
    // Determine licenseEnd
    let licenseEnd: string | null = activeHospitalRecord?.licenseEnd || activeHospitalRecord?.date_fin || activeHospitalRecord?.expiresAt || null;
    
    // Default expiration is 1 year from licenseStart or creation if not set in record
    if (!licenseEnd && licenseStart) {
      const d = new Date(licenseStart);
      d.setFullYear(d.getFullYear() + 1);
      licenseEnd = d.toISOString();
    } else if (!licenseEnd) {
      // Default fallback: 1 year from now
      const d = new Date();
      d.setFullYear(d.getFullYear() + 1);
      licenseEnd = d.toISOString();
    }

    const endDate = new Date(licenseEnd);
    const now = new Date();
    const diffMs = endDate.getTime() - now.getTime();
    const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    const isRecordExpired = (activeHospitalRecord?.status || '').toUpperCase() === 'EXPIRED';
    const isExpired = isRecordExpired || daysRemaining <= 0;
    const isCriticalExpiration = !isExpired && daysRemaining <= 7;
    const isNearingExpiration = !isExpired && daysRemaining <= 30;

    const status: 'ACTIVE' | 'WARNING' | 'EXPIRED' = isExpired 
      ? 'EXPIRED' 
      : isNearingExpiration 
        ? 'WARNING' 
        : 'ACTIVE';

    return {
      clinicId: activeTenantId,
      clinicName: activeHospitalRecord?.name || establishment?.name || 'Votre Établissement',
      planName: rawName,
      licenseType: activeHospitalRecord?.licenseType || 'STANDARD',
      status,
      licenseStart,
      licenseEnd,
      daysRemaining,
      isExpired,
      isNearingExpiration,
      isCriticalExpiration,
      maxUsers,
      monthlyPriceFCFA,
      features: [
        'Dossier Médical Électronique (DME)',
        'Gestion des admissions & Triage infirmier',
        'Consultations & Prescriptions numériques',
        'Caisse, Facturation & Recouvrement des dettes',
        'Pharmacie & Dispensaire avec alertes stock',
        'Laboratoire & Validation des analyses biomédicales',
        'Hospitalisation, Gestion des lits & Surveillance',
        'Urgences & Salle de déchocage',
        'Maternité & Consultations prénatales (CPN)',
        'États financiers & Rapports d\'activité',
        'Sauvegarde Cloud & Isolation multi-tenant sécurisée'
      ],
      contactEmail: 'contact@smarthosto.com',
      contactPhone: '+237 222 33 44 55',
      loading
    };
  }, [activeHospitalRecord, licencesCatalog, activeTenantId, establishment, loading]);

  return licenseInfo;
}
