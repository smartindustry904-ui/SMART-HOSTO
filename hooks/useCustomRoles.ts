import { useState, useEffect } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../src/firebase';
import { CustomRole, User } from '../types';
import { DEFAULT_ROLES } from '../constants/rbac';
import { getActiveTenantId, belongsToTenant } from '../src/utils/tenant';

let globalCachedRoles: CustomRole[] = [];

try {
  const cached = localStorage.getItem('hospital_roles_cache');
  if (cached) {
    globalCachedRoles = JSON.parse(cached);
  }
} catch {}

if (globalCachedRoles.length === 0) {
  globalCachedRoles = DEFAULT_ROLES;
}

export function getCachedCustomRoles(): CustomRole[] {
  return globalCachedRoles;
}

export function useCustomRoles(user?: User | null) {
  const [roles, setRoles] = useState<CustomRole[]>(globalCachedRoles);
  const [loading, setLoading] = useState(true);

  const activeTenantId = getActiveTenantId(user);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'hospital_roles'), (snap) => {
      const allRoles: CustomRole[] = snap.docs.map(d => ({ id: d.id, ...d.data() } as CustomRole));
      const tenantRoles = allRoles.filter(r => belongsToTenant(r, activeTenantId));
      
      const finalRoles = tenantRoles.length > 0 ? tenantRoles : DEFAULT_ROLES;
      globalCachedRoles = finalRoles;
      setRoles(finalRoles);
      setLoading(false);
      try {
        localStorage.setItem('hospital_roles_cache', JSON.stringify(finalRoles));
      } catch {}
    }, (err) => {
      console.warn("Notice: Error listening to hospital_roles:", err);
      setLoading(false);
    });

    return () => unsub();
  }, [activeTenantId]);

  return { roles, loading };
}
