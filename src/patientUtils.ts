/**
 * Universal Patient & Client Name Resolver
 * Corrects "Client Sans Nom" by reading all possible schema variants:
 * - lastName + firstName (Primary schema in database)
 * - nom + prenom
 * - fullName / name / patientName
 * - Fallbacks to provided fallback string or "Client Sans Nom"
 */

export function formatPatientFullName(
  patient?: any, 
  fallbackName?: string
): string {
  // If a non-empty string is passed directly
  if (typeof patient === 'string' && patient.trim()) {
    const trimmed = patient.trim();
    if (trimmed.toLowerCase() !== 'client sans nom' && trimmed.toLowerCase() !== 'sans nom') {
      return trimmed;
    }
  }

  if (patient && typeof patient === 'object') {
    // 1. Primary schema: lastName and firstName
    const last = (patient.lastName || patient.nom || '').trim();
    const first = (patient.firstName || patient.prenom || '').trim();
    
    if (last && first) {
      return `${last.toUpperCase()} ${first}`;
    }
    if (last) return last.toUpperCase();
    if (first) return first;

    // 2. Direct string fields
    if (patient.patientName && typeof patient.patientName === 'string' && patient.patientName.trim()) {
      const pName = patient.patientName.trim();
      if (pName.toLowerCase() !== 'client sans nom' && pName.toLowerCase() !== 'sans nom') {
        return pName;
      }
    }

    if (patient.fullName && typeof patient.fullName === 'string' && patient.fullName.trim()) {
      return patient.fullName.trim();
    }

    if (patient.name && typeof patient.name === 'string' && patient.name.trim()) {
      return patient.name.trim();
    }

    if (patient.clientName && typeof patient.clientName === 'string' && patient.clientName.trim()) {
      return patient.clientName.trim();
    }
  }

  // 3. Fallback name
  if (fallbackName && typeof fallbackName === 'string' && fallbackName.trim()) {
    const fTrim = fallbackName.trim();
    if (fTrim.toLowerCase() !== 'client sans nom' && fTrim.toLowerCase() !== 'sans nom') {
      return fTrim;
    }
  }

  return 'Client Sans Nom';
}

/**
 * Returns clean 1 or 2 letter initials for avatars
 */
export function getPatientInitials(patient?: any, fallback = 'C'): string {
  const fullName = formatPatientFullName(patient, '');
  if (!fullName || fullName === 'Client Sans Nom') return fallback;

  const parts = fullName.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  if (parts.length === 1 && parts[0].length > 0) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return fallback;
}
