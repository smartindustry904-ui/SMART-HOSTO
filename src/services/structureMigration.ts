import { collection, getDocs, doc, setDoc, getDoc } from 'firebase/firestore';
import { db, sanitizeData } from '../firebase';
import { SAAS_PLANS, computeStructureEntitlements, SaaSPlanId } from '../config/plans';
import { getDefaultServices } from '../../hooks/useSettings';
import { Service } from '../../types';

export interface MigrationReport {
  timestamp: string;
  structuresProcessed: number;
  structuresCreated: number;
  structuresUpdated: number;
  details: string[];
}

/**
 * Idempotent migration service that guarantees every clinic in saas_clinics
 * has a well-defined servicesConfig aligned with its contractual plan,
 * while preserving all existing active hospital services and clinical data.
 */
export async function runStructureServicesMigration(): Promise<MigrationReport> {
  const report: MigrationReport = {
    timestamp: new Date().toISOString(),
    structuresProcessed: 0,
    structuresCreated: 0,
    structuresUpdated: 0,
    details: []
  };

  try {
    // 1. Fetch current hospital_services to capture existing active states
    const existingServicesSnap = await getDocs(collection(db, 'hospital_services'));
    const existingServicesMap = new Map<string, Service>();
    if (!existingServicesSnap.empty) {
      existingServicesSnap.docs.forEach(d => {
        existingServicesMap.set(d.id, { id: d.id, ...d.data() } as Service);
      });
    }

    // 2. Fetch existing clinics in saas_clinics
    const clinicsSnap = await getDocs(collection(db, 'saas_clinics'));

    if (clinicsSnap.empty) {
      // Bootstrap the primary structures if none exist yet
      report.details.push("Aucune structure trouvée dans saas_clinics. Initialisation des structures initiales.");

      const defaultServices = getDefaultServices();
      const initialServicesConfig: Record<string, any> = {};

      defaultServices.forEach(s => {
        const existingDoc = existingServicesMap.get(s.id);
        const isActive = existingDoc 
          ? (existingDoc.status === 'active' || (existingDoc as any).is_active === true)
          : (s.status === 'active');
        
        initialServicesConfig[s.id] = {
          isAuthorized: true,
          isCustomGranted: false,
          isRevoked: false,
          status: isActive ? 'active' : 'inactive',
          is_active: isActive,
          specificSettings: existingDoc?.specificSettings || s.specificSettings || {},
          updatedAt: new Date().toISOString(),
          updatedBy: 'Migration Initial'
        };
      });

      // Primary Clinic (Matches current live establishment)
      const primaryClinic = {
        id: 'clinic-principal',
        name: 'Hôpital Central SmartHosto',
        address: 'Avenue de l\'Indépendance, Yaoundé',
        city: 'Yaoundé',
        country: 'Cameroun',
        phone: '+237 222 33 44 55',
        email: 'contact@smarthosto.com',
        responsibleUser: 'Dr. Directeur Médical',
        createdAt: new Date().toISOString().split('T')[0],
        status: 'ACTIVE',
        licenseType: 'PREMIUM' as SaaSPlanId,
        licenseStart: new Date().toISOString().split('T')[0],
        licenseEnd: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        licensePrice: 1500000,
        autoRenew: true,
        structureType: 'Clinique',
        websiteUrl: 'https://smarthosto.com',
        quotas: {
          maxUsers: 50,
          maxPatients: 10000,
          maxStorageGB: 100,
          maxSites: 3,
          maxMonthlyConsultations: 3000,
          maxMonthlyHospitalizations: 500
        },
        usage: {
          activeUsers: 8,
          totalPatients: 120,
          storageUsedGB: 1.2,
          sitesUsed: 1,
          monthlyConsultations: 145,
          monthlyHospitalizations: 18,
          monthlyPrescriptions: 190,
          totalExams: 84,
          dailyConnections: 12
        },
        activatedModules: {
          'Accueil & Admissions': true,
          'Consultations': true,
          'Soins Infirmiers': true,
          'Hospitalisation': true,
          'Urgences': true,
          'Maternité': true,
          'Laboratoire': true,
          'Pharmacie': true,
          'Caisse & Facturation': true,
          'Comptabilité': true
        },
        activatedTools: {
          'Ordonnance intelligente': true,
          'Calculateur de posologie': true,
          'Planificateur de soins': true,
          'Bulletin d\'examens': true,
          'Outil CPN': true,
          'Partogramme intelligent': true
        },
        servicesConfig: initialServicesConfig
      };

      await setDoc(doc(db, 'saas_clinics', primaryClinic.id), sanitizeData(primaryClinic));
      report.structuresCreated++;
      report.details.push(`Création de la structure principale : "${primaryClinic.name}" (${primaryClinic.id}) avec plan ${primaryClinic.licenseType}.`);

      // Secondary Clinic 1: Centre Médical de l'Espoir (STANDARD)
      const standardEntitlements = computeStructureEntitlements('STANDARD');
      const standardServicesConfig: Record<string, any> = {};
      standardEntitlements.forEach(e => {
        standardServicesConfig[e.serviceId] = {
          isAuthorized: e.isAuthorized,
          isCustomGranted: false,
          isRevoked: false,
          status: e.status,
          is_active: e.is_active,
          specificSettings: e.specificSettings || {}
        };
      });

      const secondaryClinic1 = {
        id: 'clinic-espoir',
        name: 'Centre Médical de l\'Espoir',
        address: 'Quartier Akwa, Douala',
        city: 'Douala',
        country: 'Cameroun',
        phone: '+237 233 44 55 66',
        email: 'contact@espoir-sante.cm',
        responsibleUser: 'Dr. Mbarga',
        createdAt: new Date().toISOString().split('T')[0],
        status: 'ACTIVE',
        licenseType: 'STANDARD' as SaaSPlanId,
        licenseStart: new Date().toISOString().split('T')[0],
        licenseEnd: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        licensePrice: 950000,
        autoRenew: true,
        structureType: 'Centre médical',
        websiteUrl: 'https://espoir-sante.cm',
        quotas: {
          maxUsers: 20,
          maxPatients: 5000,
          maxStorageGB: 50,
          maxSites: 1,
          maxMonthlyConsultations: 1500,
          maxMonthlyHospitalizations: 0
        },
        usage: {
          activeUsers: 4,
          totalPatients: 45,
          storageUsedGB: 0.5,
          sitesUsed: 1,
          monthlyConsultations: 62,
          monthlyHospitalizations: 0,
          monthlyPrescriptions: 80,
          totalExams: 30,
          dailyConnections: 6
        },
        activatedModules: {
          'Accueil & Admissions': true,
          'Consultations': true,
          'Soins Infirmiers': true,
          'Laboratoire': true,
          'Pharmacie': true,
          'Caisse & Facturation': true
        },
        activatedTools: {
          'Ordonnance intelligente': true,
          'Calculateur de posologie': true,
          'Bulletin d\'examens': true
        },
        servicesConfig: standardServicesConfig
      };
      await setDoc(doc(db, 'saas_clinics', secondaryClinic1.id), sanitizeData(secondaryClinic1));
      report.structuresCreated++;
      report.details.push(`Création de la structure secondaire : "${secondaryClinic1.name}" (${secondaryClinic1.id}) avec plan ${secondaryClinic1.licenseType}.`);

      // Secondary Clinic 2: Cabinet Médical Pasteur (BASIC)
      const basicEntitlements = computeStructureEntitlements('BASIC');
      const basicServicesConfig: Record<string, any> = {};
      basicEntitlements.forEach(e => {
        basicServicesConfig[e.serviceId] = {
          isAuthorized: e.isAuthorized,
          isCustomGranted: false,
          isRevoked: false,
          status: e.status,
          is_active: e.is_active,
          specificSettings: e.specificSettings || {}
        };
      });

      const secondaryClinic2 = {
        id: 'clinic-pasteur',
        name: 'Cabinet Médical Pasteur',
        address: 'Rue de la Santé, Bafoussam',
        city: 'Bafoussam',
        country: 'Cameroun',
        phone: '+237 233 11 22 33',
        email: 'pasteur@bafoussam-sante.cm',
        responsibleUser: 'Dr. Kamga',
        createdAt: new Date().toISOString().split('T')[0],
        status: 'ACTIVE',
        licenseType: 'BASIC' as SaaSPlanId,
        licenseStart: new Date().toISOString().split('T')[0],
        licenseEnd: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        licensePrice: 450000,
        autoRenew: true,
        structureType: 'Cabinet médical',
        websiteUrl: '',
        quotas: {
          maxUsers: 5,
          maxPatients: 1000,
          maxStorageGB: 10,
          maxSites: 1,
          maxMonthlyConsultations: 500,
          maxMonthlyHospitalizations: 0
        },
        usage: {
          activeUsers: 2,
          totalPatients: 20,
          storageUsedGB: 0.1,
          sitesUsed: 1,
          monthlyConsultations: 25,
          monthlyHospitalizations: 0,
          monthlyPrescriptions: 30,
          totalExams: 0,
          dailyConnections: 3
        },
        activatedModules: {
          'Accueil & Admissions': true,
          'Consultations': true,
          'Soins Infirmiers': true,
          'Pharmacie': true,
          'Caisse & Facturation': true
        },
        activatedTools: {
          'Ordonnance intelligente': true,
          'Calculateur de posologie': true
        },
        servicesConfig: basicServicesConfig
      };
      await setDoc(doc(db, 'saas_clinics', secondaryClinic2.id), sanitizeData(secondaryClinic2));
      report.structuresCreated++;
      report.details.push(`Création de la structure secondaire : "${secondaryClinic2.name}" (${secondaryClinic2.id}) avec plan ${secondaryClinic2.licenseType}.`);

    } else {
      // Structures already exist: check if they need servicesConfig migration
      for (const clinicDoc of clinicsSnap.docs) {
        report.structuresProcessed++;
        const clinicData = clinicDoc.data();
        if (!clinicData.servicesConfig || Object.keys(clinicData.servicesConfig).length === 0) {
          const plan = (clinicData.licenseType || 'STANDARD') as SaaSPlanId;
          const entitlements = computeStructureEntitlements(plan);
          const servicesConfig: Record<string, any> = {};

          entitlements.forEach(e => {
            // If this is the primary clinic or has existing matching services, preserve existing active statuses
            const existingDoc = existingServicesMap.get(e.serviceId);
            const shouldBeActive = existingDoc 
              ? (existingDoc.status === 'active' || (existingDoc as any).is_active === true) && e.isAuthorized
              : e.is_active;

            servicesConfig[e.serviceId] = {
              isAuthorized: e.isAuthorized,
              isCustomGranted: false,
              isRevoked: false,
              status: shouldBeActive ? 'active' : 'inactive',
              is_active: shouldBeActive,
              specificSettings: existingDoc?.specificSettings || e.specificSettings || {},
              updatedAt: new Date().toISOString(),
              updatedBy: 'Migration Auto'
            };
          });

          await setDoc(doc(db, 'saas_clinics', clinicDoc.id), sanitizeData({
            ...clinicData,
            servicesConfig
          }), { merge: true });

          report.structuresUpdated++;
          report.details.push(`Structure "${clinicData.name}" (${clinicDoc.id}) migrée vers servicesConfig pour plan ${plan}.`);
        } else {
          report.details.push(`Structure "${clinicData.name}" (${clinicDoc.id}) possède déjà une configuration valide (idempotence respectée).`);
        }
      }
    }

    return report;
  } catch (error: any) {
    console.error("Migration error:", error);
    report.details.push(`Erreur lors de la migration : ${error.message || error}`);
    return report;
  }
}
