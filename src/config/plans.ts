import { CANONICAL_MODULES, hasImplementedModule } from './modules';

export type SaaSPlanId = 'DEMO' | 'BASIC' | 'STANDARD' | 'PREMIUM' | 'ENTERPRISE';

export interface SaaSPlan {
  id: SaaSPlanId;
  label: string;
  badgeColor: string;
  description: string;
  monthlyPriceFCFA: number;
  includedServiceIds: string[]; // Canonical service IDs included in the contract
}

/**
 * CONTRACTUAL PLANS OF SMARTHOSTO
 * 
 * Defines the default baseline of hospital services included in each commercial tier.
 */
export const SAAS_PLANS: Record<SaaSPlanId, SaaSPlan> = {
  DEMO: {
    id: 'DEMO',
    label: 'Démonstration / Essai',
    badgeColor: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
    description: 'Accès découverte aux fonctionnalités de base pour évaluation',
    monthlyPriceFCFA: 0,
    includedServiceIds: [
      'SRV-ACCUEIL',
      'SRV-CONSULTATION',
      'SRV-CAISSE'
    ]
  },
  BASIC: {
    id: 'BASIC',
    label: 'Formule Basique (Cabinet Médical)',
    badgeColor: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    description: 'Cabinet médical ou dispensaire sans hospitalisation ni laboratoire',
    monthlyPriceFCFA: 450000,
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
    label: 'Formule Standard (Centre Médical)',
    badgeColor: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
    description: 'Centre médical avec analyses biologiques et soins ambulatoires',
    monthlyPriceFCFA: 950000,
    includedServiceIds: [
      'SRV-ACCUEIL',
      'SRV-CONSULTATION',
      'SRV-INFIRMIER',
      'SRV-LABO',
      'SRV-PHARMACIE',
      'SRV-CAISSE'
    ]
  },
  PREMIUM: {
    id: 'PREMIUM',
    label: 'Formule Premium (Clinique Médico-Chirurgicale)',
    badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    description: 'Clinique complète avec maternité, urgences et séjours d\'hospitalisation',
    monthlyPriceFCFA: 1500000,
    includedServiceIds: [
      'SRV-ACCUEIL',
      'SRV-CONSULTATION',
      'SRV-INFIRMIER',
      'SRV-HOSPITALISATION',
      'SRV-URGENCES',
      'SRV-MATERNITE',
      'SRV-LABO',
      'SRV-PHARMACIE',
      'SRV-CAISSE'
    ]
  },
  ENTERPRISE: {
    id: 'ENTERPRISE',
    label: 'Formule Enterprise (Centre Hospitalier / Hôpital)',
    badgeColor: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
    description: 'Tous les modules hospitaliers actuels et futurs sans restriction',
    monthlyPriceFCFA: 2800000,
    includedServiceIds: [
      'SRV-ACCUEIL',
      'SRV-CONSULTATION',
      'SRV-INFIRMIER',
      'SRV-HOSPITALISATION',
      'SRV-URGENCES',
      'SRV-MATERNITE',
      'SRV-LABO',
      'SRV-PHARMACIE',
      'SRV-CAISSE'
    ]
  }
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
  planId: SaaSPlanId = 'STANDARD',
  customConfig: Record<string, {
    isAuthorized?: boolean;
    isCustomGranted?: boolean;
    isRevoked?: boolean;
    status?: 'active' | 'inactive';
    is_active?: boolean;
    specificSettings?: Record<string, any>;
  }> = {},
  availableServices: Array<{ id: string; name: string; type: string; description?: string; specificSettings?: any }> = []
): StructureServiceEntitlement[] => {
  const plan = SAAS_PLANS[planId] || SAAS_PLANS.STANDARD;

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
    const isInPlan = plan.includedServiceIds.includes(srv.id);
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
