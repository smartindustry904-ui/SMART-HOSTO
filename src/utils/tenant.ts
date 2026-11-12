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
  // 1. Resolve explicit tenant from establishment first if valid and not default/ALL
  const estTenant = 
    establishment?.tenantId || 
    (establishment as any)?.hospital_id || 
    (establishment as any)?.clinicId ||
    (establishment as any)?.id;

  // 2. If user object is provided
  if (user) {
    // Check user-assigned clinic/hospital/tenant
    const userTenant = 
      (user as any).tenantId ||
      (user as any).clinicId ||
      (user as any).hospital_id ||
      (user as any).structureId;

    if (userTenant && String(userTenant).trim() !== '' && String(userTenant).trim() !== 'ALL') {
      return String(userTenant).trim();
    }

    // SuperAdmin check
    const isSuperAdmin = 
      user.role === 'SUPER_ADMIN' || 
      String(user.role).toUpperCase() === 'SUPER_ADMIN' ||
      user.roles?.includes('role_super_admin') ||
      user.username === 'superadmin' ||
      user.username === 'sa1';

    if (isSuperAdmin) {
      const override = (user as any).activeTenantId || (user as any).selectedTenantId;
      if (override && String(override).trim() !== '' && String(override).trim() !== 'ALL') {
        return String(override).trim();
      }
      // If an establishment is configured with a specific tenant/id, prioritize that hospital
      if (estTenant && estTenant !== 'default_hospital' && estTenant !== 'ALL') {
        return String(estTenant).trim();
      }
      return 'ALL';
    }
  }

  // 3. Check establishment config
  if (estTenant && estTenant !== 'default_hospital' && estTenant !== 'ALL') {
    return String(estTenant).trim();
  }

  // 4. Check persisted browser session in case user prop was omitted in sub-component
  if (typeof localStorage !== 'undefined') {
    try {
      const savedSession = localStorage.getItem('hospital_session');
      if (savedSession) {
        const u = JSON.parse(savedSession);
        const uTenant = u.tenantId || u.clinicId || u.hospital_id || u.structureId;
        if (uTenant && String(uTenant).trim() !== '' && String(uTenant).trim() !== 'ALL') {
          return String(uTenant).trim();
        }
        const isSuper = u.role === 'SUPER_ADMIN' || u.username === 'superadmin' || u.username === 'sa1';
        if (isSuper) {
          const override = u.activeTenantId || u.selectedTenantId;
          if (override && String(override).trim() !== '' && String(override).trim() !== 'ALL') {
            return String(override).trim();
          }
          if (estTenant && estTenant !== 'default_hospital' && estTenant !== 'ALL') {
            return String(estTenant).trim();
          }
          return 'ALL';
        }
      }
    } catch {}
  }

  return estTenant ? String(estTenant).trim() : 'default_hospital';
}

/**
 * Checks whether an entity belongs to the given tenant ID.
 * Strict isolation rules:
 *   - If tenantId is 'ALL' (SuperAdmin global view): matches everything.
 *   - If tenantId is 'default_hospital': matches items with no tenant OR explicitly 'default_hospital'.
 *   - If tenantId is a specific hospital (e.g. 'tenant_saintluc_456'): ONLY matches items that
 *     explicitly have clinicId or hospital_id === tenantId.
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

  if (tenantId === 'default_hospital') {
    return !cleanItemTenant || cleanItemTenant === 'default_hospital';
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
