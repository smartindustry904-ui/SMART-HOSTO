import { User, EstablishmentConfig } from '../../types';

/**
 * Resolves the active Tenant / Clinic ID for the current user session.
 * For SUPER_ADMIN:
 *   - returns 'ALL' if no specific tenant context has been selected,
 *   - or the specific clinic ID if the superadmin switched context.
 * For local Hospital Admin or Hospital Staff:
 *   - strictly returns their hospital/clinic ID (e.g. 'tenant_saintluc_123').
 */
export function getActiveTenantId(user?: User | null, establishment?: EstablishmentConfig | null): string {
  // 1. If user object is provided
  if (user) {
    // SuperAdmin global overview unless an explicit context is locked
    const isSuperAdmin = 
      user.role === 'SUPER_ADMIN' || 
      String(user.role).toUpperCase() === 'SUPER_ADMIN' ||
      user.roles?.includes('role_super_admin') ||
      user.username === 'superadmin' ||
      user.username === 'sa1';

    if (isSuperAdmin) {
      const override = (user as any).activeTenantId || (user as any).selectedTenantId;
      return override ? String(override).trim() : 'ALL';
    }

    const tenantId = 
      (user as any).clinicId ||
      (user as any).hospital_id ||
      (user as any).structureId;

    if (tenantId) return String(tenantId).trim();
  }

  // 2. Check establishment config
  const estTenant = 
    establishment?.tenantId || 
    (establishment as any)?.hospital_id || 
    (establishment as any)?.clinicId ||
    (establishment as any)?.id;

  if (estTenant && estTenant !== 'default_hospital') {
    return String(estTenant).trim();
  }

  // 3. Check persisted browser session in case user prop was omitted in sub-component
  if (typeof localStorage !== 'undefined') {
    try {
      const savedSession = localStorage.getItem('hospital_session');
      if (savedSession) {
        const u = JSON.parse(savedSession);
        const isSuper = u.role === 'SUPER_ADMIN' || u.username === 'superadmin' || u.username === 'sa1';
        if (isSuper) {
          const override = u.activeTenantId || u.selectedTenantId;
          return override ? String(override).trim() : 'ALL';
        }
        const uTenant = u.clinicId || u.hospital_id || u.structureId;
        if (uTenant) return String(uTenant).trim();
      }
    } catch {}
  }

  return estTenant && estTenant !== 'default_hospital' ? String(estTenant).trim() : 'clinic-principal';
}

/**
 * Checks whether an entity belongs to the given tenant ID.
 * Strict isolation rules:
 *   - If tenantId is 'ALL' (SuperAdmin global view): matches everything.
 *   - If item has NO tenant specified (!cleanItemTenant): NEVER matches any specific clinic.
 *     This strictly eliminates old untagged/dummy records from legacy sessions or past testing.
 *   - Matches strictly when cleanItemTenant === tenantId (or clinic-principal / default_hospital equivalence).
 */
export function belongsToTenant(item: any, tenantId: string): boolean {
  if (!item) return false;
  if (!tenantId || tenantId === 'ALL') return true;

  const itemTenant = 
    item.clinicId || 
    item.hospital_id || 
    item.structureId || 
    item.tenantId;

  const cleanItemTenant = itemTenant ? String(itemTenant).trim() : '';

  // Strict isolation: if an item has NO tenant tag, reject it so legacy/dummy records never bleed into notifications
  if (!cleanItemTenant) {
    return false;
  }

  // Primary clinic alias equivalence
  const isTargetPrimary = tenantId === 'clinic-principal' || tenantId === 'default_hospital';
  const isItemPrimary = cleanItemTenant === 'clinic-principal' || cleanItemTenant === 'default_hospital';
  if (isTargetPrimary && isItemPrimary) {
    return true;
  }

  return cleanItemTenant === tenantId;
}

/**
 * Filters an array of records in-memory so only items of the active tenant are kept.
 */
export function filterByActiveTenant<T = any>(items: T[], tenantId: string): T[] {
  if (!Array.isArray(items)) return [];
  if (!tenantId || tenantId === 'ALL') return items;
  return items.filter(item => belongsToTenant(item, tenantId));
}

/**
 * Stamps an entity payload with tenant identification fields before saving to Firestore.
 */
export function stampTenantData<T extends Record<string, any>>(
  data: T, 
  user?: User | null, 
  establishment?: EstablishmentConfig | null
): T {
  const tenantId = getActiveTenantId(user, establishment);
  const resolvedTenant = (!tenantId || tenantId === 'ALL') ? 'default_hospital' : tenantId;
  const structureName = 
    (user as any)?.structureName || 
    establishment?.name || 
    data?.structureName || 
    '';

  return {
    ...data,
    clinicId: data.clinicId || resolvedTenant,
    hospital_id: data.hospital_id || resolvedTenant,
    structureName: data.structureName || structureName
  };
}
