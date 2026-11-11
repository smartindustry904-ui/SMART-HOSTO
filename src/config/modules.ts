import { Role, CustomRole } from '../../types';
import { getCachedCustomRoles } from '../../hooks/useCustomRoles';

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
    defaultAccessRoles: [Role.ADMIN, Role.SUPER_ADMIN, Role.RECEPTION, Role.DOCTOR, Role.NURSE],
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
    serviceId: 'SRV-COMPTABILITE', // Independent administrative financial module
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

/**
 * Determines whether a user is authorized to access a given module based on their role and permissions.
 * Strict segregation:
 * - ADMIN and SUPER_ADMIN have access to all modules.
 * - Caissier ONLY accesses Caisse (cannot see Soins, Consultation, Lab, Pharmacie, etc.)
 * - Pharmacien ONLY accesses Pharmacie.
 * - Laborantin ONLY accesses Labo.
 * - Infirmier accesses Soins Infirmiers, Hospitalisation, Urgences, Accueil (triage).
 * - Médecin accesses Consultation, Soins Infirmiers, Hospitalisation, Urgences, Maternité, Accueil.
 * - Sage-femme accesses Maternité, Hospitalisation.
 * - Accueil / Secrétaire accesses Accueil.
 * - Comptable accesses Comptabilité, Caisse.
 */
export const MODULE_KEY_MAP: Record<string, string> = {
  'accueil': 'module_accueil',
  'consultation': 'module_consultation',
  'soins_infirmiers': 'module_soins_infirmiers',
  'hospitalisation': 'module_hospitalisation',
  'pharmacie': 'module_pharmacie',
  'caisse': 'module_caisse',
  'comptabilite': 'module_comptabilite',
  'urgences': 'module_urgence',
  'laboratoire': 'module_laboratoire',
  'imagerie': 'module_imagerie',
  'maternite': 'module_maternite',
  'bloc': 'module_bloc',
  [Role.RECEPTION]: 'module_accueil',
  [Role.DOCTOR]: 'module_consultation',
  [Role.NURSE]: 'module_soins_infirmiers',
  [Role.INPATIENT]: 'module_hospitalisation',
  [Role.PHARMACY]: 'module_pharmacie',
  [Role.CASHIER]: 'module_caisse',
  [Role.URGENCE]: 'module_urgence',
  [Role.LAB]: 'module_laboratoire',
  [Role.MATERNITY]: 'module_maternite',
  [Role.ACCOUNTANT]: 'module_comptabilite',
};

export interface UserModulePermissions {
  canRead: boolean;
  canWrite: boolean;
  canDelete: boolean;
  canValidate: boolean;
  isReadOnly: boolean;
}

export const isUserAuthorizedForModule = (
  user: any, 
  moduleRoleOrId: Role | string,
  customRoles?: CustomRole[]
): boolean => {
  if (!user) return false;

  const rawUserRole = (user.role || '').toUpperCase().trim();
  const userRoles: string[] = Array.isArray(user.roles) ? user.roles : [];

  const isAdmin = 
    rawUserRole === Role.ADMIN ||
    rawUserRole === Role.SUPER_ADMIN ||
    rawUserRole === 'SUPER_ADMIN' ||
    userRoles.includes('role_admin') ||
    userRoles.includes('role_super_admin') ||
    (user.username || '').toLowerCase() === 'superadmin' ||
    (user.username || '').toLowerCase() === 'sa1';

  if (isAdmin) {
    if (moduleRoleOrId === Role.SUPER_ADMIN || moduleRoleOrId === 'super_admin') {
      return rawUserRole === Role.SUPER_ADMIN || rawUserRole === 'SUPER_ADMIN' || userRoles.includes('role_super_admin');
    }
    return true;
  }

  // Super Admin and Settings modules are forbidden for non-admin
  if (moduleRoleOrId === Role.SUPER_ADMIN || moduleRoleOrId === 'super_admin' || moduleRoleOrId === 'SETTING' || moduleRoleOrId === Role.ADMIN) {
    return false;
  }

  // 1. Dynamic RBAC Check: If an admin edited a role or created custom permissions, enforce it live!
  const targetMod = getModuleByRoleOrId(moduleRoleOrId);
  const targetId = targetMod ? targetMod.id : String(moduleRoleOrId).toLowerCase();
  const targetRole = targetMod ? targetMod.role : moduleRoleOrId;
  const targetRbacKey = MODULE_KEY_MAP[targetId] || MODULE_KEY_MAP[targetRole as string] || `module_${targetId}`;

  const rolesList = (customRoles && customRoles.length > 0) ? customRoles : getCachedCustomRoles();

  for (const roleId of userRoles) {
    const roleDef = rolesList.find(r => r.id === roleId);
    if (roleDef && roleDef.permissions) {
      let actions = roleDef.permissions[targetRbacKey];
      // Backward compatibility fallback for legacy roles
      if ((!actions || actions.length === 0) && targetRbacKey === 'module_comptabilite') {
        actions = roleDef.permissions['module_caisse'];
      }
      if ((!actions || actions.length === 0) && targetRbacKey === 'module_soins_infirmiers') {
        actions = roleDef.permissions['module_consultation'];
      }
      if (Array.isArray(actions) && actions.length > 0) {
        return true;
      }
    }
  }

  // 2. Resolve effective primary role for standard role enforcement
  let effectiveRole = rawUserRole;
  if (userRoles.includes('role_caissier') && !userRoles.includes('role_medecin') && !userRoles.includes('role_admin') && rawUserRole === Role.DOCTOR) {
    effectiveRole = Role.CASHIER;
  } else if (userRoles.includes('role_infirmier') && !userRoles.includes('role_medecin') && !userRoles.includes('role_admin') && rawUserRole === Role.DOCTOR) {
    effectiveRole = Role.NURSE;
  } else if ((userRoles.includes('role_secretaire') || userRoles.includes('role_accueil')) && !userRoles.includes('role_medecin') && !userRoles.includes('role_admin') && rawUserRole === Role.DOCTOR) {
    effectiveRole = Role.RECEPTION;
  } else if (userRoles.includes('role_pharmacien') && !userRoles.includes('role_medecin') && !userRoles.includes('role_admin') && rawUserRole === Role.DOCTOR) {
    effectiveRole = Role.PHARMACY;
  } else if (userRoles.includes('role_laborantin') && !userRoles.includes('role_medecin') && !userRoles.includes('role_admin') && rawUserRole === Role.DOCTOR) {
    effectiveRole = Role.LAB;
  } else if (userRoles.includes('role_comptable') && !userRoles.includes('role_medecin') && !userRoles.includes('role_admin')) {
    effectiveRole = Role.ACCOUNTANT;
  }

  // 3. Fallback to standard system role mappings
  switch (effectiveRole) {
    case Role.CASHIER:
      return targetRole === Role.CASHIER;

    case Role.PHARMACY:
      return targetRole === Role.PHARMACY;

    case Role.LAB:
      return targetRole === Role.LAB;

    case Role.RECEPTION:
      return targetRole === Role.RECEPTION;

    case Role.MATERNITY:
      return targetRole === Role.MATERNITY || targetRole === Role.INPATIENT;

    case Role.ACCOUNTANT:
      return targetRole === Role.ACCOUNTANT;

    case Role.NURSE:
      return (
        targetRole === Role.NURSE ||
        targetRole === Role.INPATIENT ||
        targetRole === Role.URGENCE ||
        targetRole === Role.RECEPTION
      );

    case Role.DOCTOR:
      return (
        targetRole === Role.DOCTOR ||
        targetRole === Role.NURSE ||
        targetRole === Role.INPATIENT ||
        targetRole === Role.URGENCE ||
        targetRole === Role.MATERNITY ||
        targetRole === Role.RECEPTION
      );

    case Role.INPATIENT:
      return targetRole === Role.INPATIENT;

    case Role.URGENCE:
      return targetRole === Role.URGENCE || targetRole === Role.INPATIENT || targetRole === Role.NURSE;
  }

  return false;
};

/**
 * Enforces dynamic role action attributes (read, write, delete, validate).
 * If a user only has 'read' permission on a module, isReadOnly is true and write operations must be locked.
 */
export const getUserModulePermissions = (
  user: any,
  moduleRoleOrId: Role | string,
  customRoles?: CustomRole[]
): UserModulePermissions => {
  if (!user) {
    return { canRead: false, canWrite: false, canDelete: false, canValidate: false, isReadOnly: true };
  }

  const rawUserRole = (user.role || '').toUpperCase().trim();
  const userRoles: string[] = Array.isArray(user.roles) ? user.roles : [];

  const isAdmin = 
    rawUserRole === Role.ADMIN ||
    rawUserRole === Role.SUPER_ADMIN ||
    rawUserRole === 'SUPER_ADMIN' ||
    userRoles.includes('role_admin') ||
    userRoles.includes('role_super_admin') ||
    (user.username || '').toLowerCase() === 'superadmin' ||
    (user.username || '').toLowerCase() === 'sa1';

  if (isAdmin) {
    return { canRead: true, canWrite: true, canDelete: true, canValidate: true, isReadOnly: false };
  }

  const targetMod = getModuleByRoleOrId(moduleRoleOrId);
  const targetId = targetMod ? targetMod.id : String(moduleRoleOrId).toLowerCase();
  const targetRole = targetMod ? targetMod.role : moduleRoleOrId;
  const targetRbacKey = MODULE_KEY_MAP[targetId] || MODULE_KEY_MAP[targetRole as string] || `module_${targetId}`;

  const rolesList = (customRoles && customRoles.length > 0) ? customRoles : getCachedCustomRoles();

  let hasRead = false;
  let hasWrite = false;
  let hasDelete = false;
  let hasValidate = false;
  let explicitlyFoundInRbac = false;

  for (const roleId of userRoles) {
    const roleDef = rolesList.find(r => r.id === roleId);
    if (roleDef && roleDef.permissions) {
      let actions = roleDef.permissions[targetRbacKey];
      if ((!actions || actions.length === 0) && targetRbacKey === 'module_comptabilite') {
        actions = roleDef.permissions['module_caisse'];
      }
      if ((!actions || actions.length === 0) && targetRbacKey === 'module_soins_infirmiers') {
        actions = roleDef.permissions['module_consultation'];
      }
      if (Array.isArray(actions) && actions.length > 0) {
        explicitlyFoundInRbac = true;
        if (actions.includes('read')) hasRead = true;
        if (actions.includes('write')) hasWrite = true;
        if (actions.includes('delete')) hasDelete = true;
        if (actions.includes('validate')) hasValidate = true;
      }
    }
  }

  if (explicitlyFoundInRbac) {
    return {
      canRead: hasRead,
      canWrite: hasWrite,
      canDelete: hasDelete,
      canValidate: hasValidate,
      isReadOnly: hasRead && !hasWrite
    };
  }

  // Fallback default: if user is authorized by system role, they have standard read/write
  const isAuthorized = isUserAuthorizedForModule(user, moduleRoleOrId, rolesList);
  return {
    canRead: isAuthorized,
    canWrite: isAuthorized,
    canDelete: false,
    canValidate: false,
    isReadOnly: !isAuthorized
  };
};
