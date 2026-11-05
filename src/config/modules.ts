import { Role } from '../../types';

export interface CanonicalModule {
  id: string; // Technical identifier
  role: Role | string; // Role enum or string routing key
  label: string; // Human-readable display label
  description: string;
  componentName: string; // The React component implementing this module
  status: 'IMPLEMENTED' | 'NOT_IMPLEMENTED';
  serviceId: string | null; // Associated parametric service ID in hospital_services, or null for system administration modules
  defaultAccessRoles: Role[]; // Default RBAC roles permitted
  color: string;
  isSpecialAdmin?: boolean; // True for system-level configuration (e.g., Settings, SuperAdmin)
}

/**
 * CANONICAL REFERENCE LIST OF IMPLEMENTED MODULES IN SMARTHOSTO.
 * 
 * Only modules in this list that have status === 'IMPLEMENTED' possess a functional UI component.
 * Services without an implemented module (such as Dermatologie, Cardiologie, Ophtalmologie, etc.)
 * cannot be opened as a dedicated accueil module.
 */
export const CANONICAL_MODULES: CanonicalModule[] = [
  {
    id: 'accueil',
    role: Role.RECEPTION,
    label: 'Accueil Patients',
    description: 'Enregistrement administratif, gestion des files & orientation des patients',
    componentName: 'Reception',
    status: 'IMPLEMENTED',
    serviceId: 'SRV-ACCUEIL',
    defaultAccessRoles: [Role.ADMIN, Role.SUPER_ADMIN, Role.RECEPTION, Role.DOCTOR, Role.NURSE, Role.CASHIER, Role.ACCOUNTANT],
    color: 'blue'
  },
  {
    id: 'consultation',
    role: Role.DOCTOR,
    label: 'Consultation',
    description: 'Dossier médical informatisé, examen clinique et prescriptions',
    componentName: 'Consultation',
    status: 'IMPLEMENTED',
    serviceId: 'SRV-CONSULTATION',
    defaultAccessRoles: [Role.ADMIN, Role.SUPER_ADMIN, Role.DOCTOR],
    color: 'indigo'
  },
  {
    id: 'soins_infirmiers',
    role: Role.NURSE,
    label: 'Soins Infirmiers',
    description: 'Triage infirmier, constantes vitales et actes de soins ambulatoires',
    componentName: 'SoinsInfirmiers',
    status: 'IMPLEMENTED',
    serviceId: 'SRV-INFIRMIER',
    defaultAccessRoles: [Role.ADMIN, Role.SUPER_ADMIN, Role.NURSE, Role.DOCTOR],
    color: 'teal'
  },
  {
    id: 'hospitalisation',
    role: Role.INPATIENT,
    label: 'Hospitalisation',
    description: 'Gestion des lits, admissions de séjour et surveillance hospitalière',
    componentName: 'Inpatient',
    status: 'IMPLEMENTED',
    serviceId: 'SRV-HOSPITALISATION',
    defaultAccessRoles: [Role.ADMIN, Role.SUPER_ADMIN, Role.DOCTOR, Role.NURSE, Role.INPATIENT],
    color: 'indigo'
  },
  {
    id: 'urgences',
    role: Role.URGENCE,
    label: 'Urgences',
    description: 'Prise en charge vitale immédiate et triage d\'urgence',
    componentName: 'Emergency',
    status: 'IMPLEMENTED',
    serviceId: 'SRV-URGENCES',
    defaultAccessRoles: [Role.ADMIN, Role.SUPER_ADMIN, Role.DOCTOR, Role.NURSE],
    color: 'rose'
  },
  {
    id: 'maternite',
    role: Role.MATERNITY,
    label: 'Maternité',
    description: 'Suivi obstétrical prénatal (CPN), travail, accouchement et post-partum',
    componentName: 'Maternity',
    status: 'IMPLEMENTED',
    serviceId: 'SRV-MATERNITE',
    defaultAccessRoles: [Role.ADMIN, Role.SUPER_ADMIN, Role.MATERNITY, Role.DOCTOR],
    color: 'pink'
  },
  {
    id: 'laboratoire',
    role: Role.LAB,
    label: 'Laboratoire',
    description: 'Analyses biomédicales, saisie et validation des résultats',
    componentName: 'Lab',
    status: 'IMPLEMENTED',
    serviceId: 'SRV-LABO',
    defaultAccessRoles: [Role.ADMIN, Role.SUPER_ADMIN, Role.LAB],
    color: 'amber'
  },
  {
    id: 'pharmacie',
    role: Role.PHARMACY,
    label: 'Pharmacie',
    description: 'Dispensation des ordonnances, gestion des stocks et délivrance',
    componentName: 'Pharmacy',
    status: 'IMPLEMENTED',
    serviceId: 'SRV-PHARMACIE',
    defaultAccessRoles: [Role.ADMIN, Role.SUPER_ADMIN, Role.PHARMACY],
    color: 'teal'
  },
  {
    id: 'caisse',
    role: Role.CASHIER,
    label: 'Caisse',
    description: 'Facturation, encaissements et gestion des reçus patients',
    componentName: 'Cashier',
    status: 'IMPLEMENTED',
    serviceId: 'SRV-CAISSE',
    defaultAccessRoles: [Role.ADMIN, Role.SUPER_ADMIN, Role.CASHIER, Role.ACCOUNTANT],
    color: 'emerald'
  },
  {
    id: 'comptabilite',
    role: Role.ACCOUNTANT,
    label: 'Comptabilité',
    description: 'Gestion financière, trésorerie, rapprochement et RH',
    componentName: 'Accounting',
    status: 'IMPLEMENTED',
    serviceId: 'SRV-CAISSE', // Administrative financial module linked to cashier/finances
    defaultAccessRoles: [Role.ADMIN, Role.SUPER_ADMIN, Role.ACCOUNTANT],
    color: 'orange'
  },
  // System Administration Modules (Protected by user role, independent of clinical services)
  {
    id: 'parametrage',
    role: 'SETTING',
    label: 'Paramétrage',
    description: 'Configuration générale du SIH, services, utilisateurs et référentiels',
    componentName: 'Settings',
    status: 'IMPLEMENTED',
    serviceId: null,
    defaultAccessRoles: [Role.ADMIN, Role.SUPER_ADMIN],
    color: 'slate',
    isSpecialAdmin: true
  },
  {
    id: 'super_admin',
    role: Role.SUPER_ADMIN,
    label: 'Super Admin',
    description: 'Centre de contrôle multi-tenant et pilotage avancé de la plateforme',
    componentName: 'ControlCenter',
    status: 'IMPLEMENTED',
    serviceId: null,
    defaultAccessRoles: [Role.SUPER_ADMIN],
    color: 'purple',
    isSpecialAdmin: true
  },
  {
    id: 'dashboard_admin',
    role: Role.ADMIN,
    label: 'Tableau de bord Admin',
    description: 'Indicateurs de performance et vue d\'ensemble de l\'établissement',
    componentName: 'Dashboard',
    status: 'IMPLEMENTED',
    serviceId: null,
    defaultAccessRoles: [Role.ADMIN, Role.SUPER_ADMIN],
    color: 'blue',
    isSpecialAdmin: true
  }
];

/**
 * Checks if a service ID has a corresponding implemented module.
 */
export const hasImplementedModule = (serviceId: string): boolean => {
  if (!serviceId) return false;
  const normalized = serviceId.toUpperCase().trim();
  // Map alias if needed (e.g. SRV-SOINS -> SRV-INFIRMIER)
  const canonicalId = normalized === 'SRV-SOINS' ? 'SRV-INFIRMIER' : normalized;
  return CANONICAL_MODULES.some(
    m => m.status === 'IMPLEMENTED' && m.serviceId === canonicalId
  );
};

/**
 * Returns the canonical module associated with a parametric service ID.
 */
export const getModuleForService = (serviceId: string): CanonicalModule | undefined => {
  if (!serviceId) return undefined;
  const normalized = serviceId.toUpperCase().trim();
  const canonicalId = normalized === 'SRV-SOINS' ? 'SRV-INFIRMIER' : normalized;
  return CANONICAL_MODULES.find(
    m => m.status === 'IMPLEMENTED' && m.serviceId === canonicalId
  );
};

/**
 * Returns the canonical module matching a given role or routing key.
 */
export const getModuleByRoleOrId = (roleOrId: Role | string): CanonicalModule | undefined => {
  if (!roleOrId) return undefined;
  return CANONICAL_MODULES.find(m => m.role === roleOrId || m.id === roleOrId);
};

/**
 * Determines whether a module is implemented AND its associated service is active.
 * If services is undefined or empty, returns false for safety.
 */
export const isModuleActiveAndAvailable = (
  moduleIdOrRole: Role | string,
  servicesList: Array<{ id: string; status: 'active' | 'inactive'; is_active?: boolean }>
): boolean => {
  const mod = getModuleByRoleOrId(moduleIdOrRole);
  if (!mod || mod.status !== 'IMPLEMENTED') return false;

  // System administration modules are always available if user role permits
  if (mod.isSpecialAdmin || mod.serviceId === null) {
    return true;
  }

  // Find the corresponding service
  const service = (servicesList || []).find(
    s => s.id.toUpperCase() === mod.serviceId?.toUpperCase()
  );

  if (!service) return false;
  return service.status === 'active' && service.is_active !== false;
};
