import { CANONICAL_MODULES, hasImplementedModule } from './modules';

export type SaaSPlanId = 'DEMO' | 'BASIC' | 'STANDARD' | 'PREMIUM' | 'ENTERPRISE';

export interface SaaSPlan {
  id: SaaSPlanId | string;
  label: string;
  badgeColor: string;
  description: string;
  monthlyPriceFCFA: number;
  max_users: number; // Base included users in this tier
  min_users?: number; // Recommended min users
  max_users_cap?: number; // Recommended max users before next tier
  pricePerExtraUserFCFA: number; // Price per additional user seat per month
  includedServiceIds: string[]; // Canonical service IDs included in the contract
}

/**
 * CONTRACTUAL PLANS OF SMARTHOSTO (PAR TRANCHE D'UTILISATEURS & MODULES)
 * 
 * Defines the baseline of hospital services, included user seats (max_users),
 * and per-extra-user seat pricing for each commercial tier.
 */
export const SAAS_PLANS: Record<SaaSPlanId, SaaSPlan> = {
  DEMO: {
    id: 'DEMO',
    label: 'Démonstration / Essai (1–3 util.)',
    badgeColor: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
    description: 'Accès découverte aux fonctionnalités de base pour évaluation (jusqu\'à 3 utilisateurs)',
    monthlyPriceFCFA: 0,
    max_users: 3,
    min_users: 1,
    max_users_cap: 5,
    pricePerExtraUserFCFA: 0,
    includedServiceIds: [
      'SRV-ACCUEIL',
      'SRV-CONSULTATION',
      'SRV-CAISSE'
    ]
  },
  BASIC: {
    id: 'BASIC',
    label: 'Formule Basique — Cabinet (5 util. inclus)',
    badgeColor: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    description: 'Cabinet médical ou dispensaire sans hospitalisation ni laboratoire (Pack 5 utilisateurs inclus)',
    monthlyPriceFCFA: 60000,
    max_users: 5,
    min_users: 1,
    max_users_cap: 14,
    pricePerExtraUserFCFA: 10000,
    includedServiceIds: [
      'SRV-ACCUEIL',
      'SRV-CONSULTATION',
      'SRV-INFIRMIER',
      'SRV-PHARMACIE',
      'SRV-CAISSE'
    ]
  },
  STANDARD: {
    id: 'STANDARD',
    label: 'Formule Standard — Centre Médical (15 util. inclus)',
    badgeColor: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
    description: 'Centre médical avec analyses biologiques et soins ambulatoires (Pack 15 utilisateurs inclus)',
    monthlyPriceFCFA: 150000,
    max_users: 15,
    min_users: 6,
    max_users_cap: 34,
    pricePerExtraUserFCFA: 8500,
    includedServiceIds: [
      'SRV-ACCUEIL',
      'SRV-CONSULTATION',
      'SRV-INFIRMIER',
      'SRV-LABO',
      'SRV-PHARMACIE',
      'SRV-CAISSE',
      'SRV-COMPTABILITE'
    ]
  },
  PREMIUM: {
    id: 'PREMIUM',
    label: 'Formule Premium — Clinique (35 util. inclus)',
    badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    description: 'Clinique complète avec maternité, urgences et séjours d\'hospitalisation (Pack 35 utilisateurs inclus)',
    monthlyPriceFCFA: 300000,
    max_users: 35,
    min_users: 16,
    max_users_cap: 99,
    pricePerExtraUserFCFA: 7000,
    includedServiceIds: [
      'SRV-ACCUEIL',
      'SRV-CONSULTATION',
      'SRV-INFIRMIER',
      'SRV-HOSPITALISATION',
      'SRV-URGENCES',
      'SRV-MATERNITE',
      'SRV-LABO',
      'SRV-PHARMACIE',
      'SRV-CAISSE',
      'SRV-COMPTABILITE'
    ]
  },
  ENTERPRISE: {
    id: 'ENTERPRISE',
    label: 'Formule Enterprise — Hôpital / CHU (100 util. inclus)',
    badgeColor: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
    description: 'Tous les modules hospitaliers actuels et futurs pour grands hôpitaux (Pack 100 utilisateurs inclus)',
    monthlyPriceFCFA: 650000,
    max_users: 100,
    min_users: 50,
    max_users_cap: 500,
    pricePerExtraUserFCFA: 5000,
    includedServiceIds: [
      'SRV-ACCUEIL',
      'SRV-CONSULTATION',
      'SRV-INFIRMIER',
      'SRV-HOSPITALISATION',
      'SRV-URGENCES',
      'SRV-MATERNITE',
      'SRV-LABO',
      'SRV-PHARMACIE',
      'SRV-CAISSE',
      'SRV-COMPTABILITE'
    ]
  }
};

/**
 * Calculates the exact monthly and total price for a given plan and number of users.
 * Formula: Base Monthly Price (covers up to plan.max_users) + Extra Users * pricePerExtraUserFCFA
 */
export const calculateLicensePriceForUsers = (
  plan: Partial<SaaSPlan> | undefined,
  targetUsers: number,
  durationMonths: number = 1
) => {
  const basePrice = Number(plan?.monthlyPriceFCFA ?? 150000);
  const includedUsers = Math.max(1, Number(plan?.max_users ?? 15));
  const extraUserRate = Number(plan?.pricePerExtraUserFCFA ?? 8500);
  const requestedUsers = Math.max(1, Number(targetUsers) || includedUsers);

  const extraUsers = Math.max(0, requestedUsers - includedUsers);
  const extraUsersMonthlyCost = extraUsers * extraUserRate;
  const monthlyTotal = basePrice + extraUsersMonthlyCost;
  const periodTotal = monthlyTotal * Math.max(1, durationMonths);
  const costPerUserMonthly = requestedUsers > 0 ? Math.round(monthlyTotal / requestedUsers) : 0;

  return {
    basePrice,
    includedUsers,
    requestedUsers,
    extraUsers,
    extraUserRate,
    extraUsersMonthlyCost,
    monthlyTotal,
    periodTotal,
    costPerUserMonthly
  };
};

/**
 * Recommends the most cost-effective / appropriate plan for a given number of users.
 */
export const recommendPlanForUserCount = (
  userCount: number,
  plansCatalog: Record<string, Partial<SaaSPlan>> = SAAS_PLANS
): string => {
  const n = Math.max(1, Number(userCount) || 1);
  if (n <= 3 && plansCatalog.DEMO) return 'DEMO';
  if (n <= 8 && plansCatalog.BASIC) return 'BASIC';
  if (n <= 25 && plansCatalog.STANDARD) return 'STANDARD';
  if (n <= 65 && plansCatalog.PREMIUM) return 'PREMIUM';
  if (plansCatalog.ENTERPRISE) return 'ENTERPRISE';
  return Object.keys(plansCatalog)[0] || 'STANDARD';
};

/**
 * Service Entitlement representation for a given structure/clinic.
 */
export interface StructureServiceEntitlement {
  serviceId: string;
  serviceName: string;
  type: string;
  description: string;
  isImplemented: boolean;
  isInPlan: boolean; // Included in the subscribed plan
  isCustomGranted: boolean; // Granted as a custom add-on by Super Admin
  isRevoked: boolean; // Explicitly revoked by Super Admin
  isAuthorized: boolean; // (isInPlan && !isRevoked) || isCustomGranted
  status: 'active' | 'inactive';
  is_active: boolean; // isAuthorized && isImplemented && status === 'active'
  isAvailableAtAccueil: boolean; // Resulting availability for the structure's Accueil
  specificSettings?: Record<string, any>;
  updatedAt?: string;
  updatedBy?: string;
}

/**
 * Computes the complete list of entitlements for a structure based on its plan and overrides.
 */
export const computeStructureEntitlements = (
  planId: SaaSPlanId | string = 'STANDARD',
  customConfig: Record<string, {
    isAuthorized?: boolean;
    isCustomGranted?: boolean;
    isRevoked?: boolean;
    status?: 'active' | 'inactive';
    is_active?: boolean;
    specificSettings?: Record<string, any>;
  }> = {},
  availableServices: Array<{ id: string; name: string; type: string; description?: string; specificSettings?: any }> = [],
  plansCatalog: Record<string, Partial<SaaSPlan>> = SAAS_PLANS
): StructureServiceEntitlement[] => {
  const key = String(planId || 'STANDARD').toUpperCase();
  const plan = plansCatalog[key] || SAAS_PLANS[key as SaaSPlanId] || SAAS_PLANS.STANDARD;
  const planIncluded = plan.includedServiceIds || SAAS_PLANS.STANDARD.includedServiceIds;

  // Combine predefined catalog with any custom services passed
  const catalog = availableServices.length > 0 ? availableServices : [
    { id: 'SRV-ACCUEIL', name: 'Accueil Patients', type: 'clinique', description: 'Admissions et orientation des patients' },
    { id: 'SRV-CONSULTATION', name: 'Consultation', type: 'clinique', description: 'Consultations médicales et dossier patient', specificSettings: { consultationFee: 10000 } },
    { id: 'SRV-INFIRMIER', name: 'Soins Infirmiers', type: 'soutien', description: 'Constantes vitales et soins ambulatoires', specificSettings: { fee: 2500 } },
    { id: 'SRV-HOSPITALISATION', name: 'Hospitalisation', type: 'clinique', description: 'Séjours en lits et surveillance hospitalière', specificSettings: { hospitalBeds: 12, maternityBeds: 8, admissionFee: 15000 } },
    { id: 'SRV-URGENCES', name: 'Urgences', type: 'clinique', description: 'Prise en charge vitale immédiate', specificSettings: { consultationFee: 15000 } },
    { id: 'SRV-MATERNITE', name: 'Maternité', type: 'clinique', description: 'Suivi obstétrical CPN et accouchements', specificSettings: { consultationFee: 5000 } },
    { id: 'SRV-LABO', name: 'Laboratoire', type: 'technique', description: 'Analyses biomédicales et examens' },
    { id: 'SRV-PHARMACIE', name: 'Pharmacie', type: 'technique', description: 'Gestion des stocks et délivrance d\'ordonnances' },
    { id: 'SRV-CAISSE', name: 'Caisse & Facturation', type: 'administratif', description: 'Facturation, encaissements et reçus' },
    { id: 'SRV-COMPTABILITE', name: 'Comptabilité', type: 'administratif', description: 'Gestion financière, trésorerie et bilans' },
    // Un-implemented services
    { id: 'SRV-DERMATOLOGIE', name: 'Dermatologie', type: 'specialise', description: 'Maladies de la peau (intégré aux consultations)' },
    { id: 'SRV-CARDIOLOGIE', name: 'Cardiologie', type: 'specialise', description: 'Maladies cardiovasculaires' },
    { id: 'SRV-PEDIATRIE', name: 'Pédiatrie', type: 'clinique', description: 'Soins pédiatriques' },
    { id: 'SRV-BLOC', name: 'Bloc opératoire', type: 'clinique', description: 'Plateau technique chirurgical' },
    { id: 'SRV-REA', name: 'Réanimation', type: 'clinique', description: 'Soins intensifs' },
    { id: 'SRV-IMAGERIE', name: 'Imagerie médicale', type: 'technique', description: 'Radiologie et échographie' },
    { id: 'SRV-VACCINATION', name: 'Vaccination', type: 'soutien', description: 'Programme vaccinal' },
    { id: 'SRV-NUTRITION', name: 'Nutrition', type: 'soutien', description: 'Conseils diététiques' },
    { id: 'SRV-KINE', name: 'Kinésithérapie', type: 'soutien', description: 'Rééducation fonctionnelle' },
    { id: 'SRV-DIALYSE', name: 'Dialyse', type: 'specialise', description: 'Soins rénaux' },
    { id: 'SRV-ONCOLOGIE', name: 'Oncologie', type: 'specialise', description: 'Traitement des cancers' },
    { id: 'SRV-ORL', name: 'ORL', type: 'specialise', description: 'Oto-rhino-laryngologie' },
    { id: 'SRV-OPHTALMOLOGIE', name: 'Ophtalmologie', type: 'specialise', description: 'Maladies des yeux' },
    { id: 'SRV-PSYCHIATRIE', name: 'Psychiatrie', type: 'specialise', description: 'Santé mentale' }
  ];

  return catalog.map(srv => {
    const isImplemented = hasImplementedModule(srv.id);
    const isInPlan = planIncluded.includes(srv.id);
    const saved = customConfig[srv.id];

    const isCustomGranted = saved?.isCustomGranted ?? false;
    const isRevoked = saved?.isRevoked ?? false;

    // A service is authorized if: (included in plan AND not revoked) OR explicitly granted
    const isAuthorized = (isInPlan && !isRevoked) || isCustomGranted;

    // Status: default to 'active' if in plan and implemented, unless explicitly specified in saved config
    let status: 'active' | 'inactive' = 'inactive';
    if (isImplemented && isAuthorized) {
      if (saved?.status !== undefined) {
        status = saved.status;
      } else {
        status = 'active'; // Default active when authorized
      }
    }

    const isActive = isImplemented && isAuthorized && status === 'active';

    return {
      serviceId: srv.id,
      serviceName: srv.name,
      type: srv.type,
      description: srv.description || '',
      isImplemented,
      isInPlan,
      isCustomGranted,
      isRevoked,
      isAuthorized,
      status: isActive ? 'active' : 'inactive',
      is_active: isActive,
      isAvailableAtAccueil: isActive,
      specificSettings: saved?.specificSettings || srv.specificSettings || {}
    };
  });
};

/**
 * Helper to generate synchronized servicesConfig and activatedModules maps
 * when a structure's plan or custom services change.
 */
export const buildClinicEntitlementMaps = (
  planId: SaaSPlanId | string = 'STANDARD',
  existingServicesConfig: Record<string, any> = {},
  plansCatalog: Record<string, Partial<SaaSPlan>> = SAAS_PLANS
) => {
  const entitlements = computeStructureEntitlements(planId, existingServicesConfig, [], plansCatalog);
  const servicesConfig: Record<string, any> = {};
  const activatedModules: Record<string, boolean> = {};

  entitlements.forEach(e => {
    servicesConfig[e.serviceId] = {
      isAuthorized: e.isAuthorized,
      isCustomGranted: e.isCustomGranted,
      isRevoked: e.isRevoked,
      status: e.status,
      is_active: e.is_active,
      specificSettings: e.specificSettings || {}
    };
    if (e.is_active) {
      activatedModules[e.serviceId] = true;
      activatedModules[e.serviceName] = true;
    }
  });

  return { servicesConfig, activatedModules, entitlements };
};
