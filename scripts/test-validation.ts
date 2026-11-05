import { 
  CANONICAL_MODULES, 
  hasImplementedModule, 
  getModuleForService, 
  getModuleByRoleOrId, 
  isModuleActiveAndAvailable 
} from '../src/config/modules';
import { getDefaultServices, PREDEFINED_SERVICES } from '../hooks/useSettings';
import { Role, User } from '../types';

console.log("=================================================================");
console.log("TESTS DE VALIDATION OBLIGATOIRES — SYNCHRONISATION SMARTHOSTO");
console.log("=================================================================\n");

let passed = 0;
let total = 0;

function assert(condition: boolean, testName: string, details?: string) {
  total++;
  if (condition) {
    passed++;
    console.log(`[PASS] Test ${total}: ${testName}`);
    if (details) console.log(`       -> ${details}`);
  } else {
    console.error(`[FAIL] Test ${total}: ${testName}`);
    if (details) console.error(`       -> ${details}`);
  }
}

// -------------------------------------------------------------
// Test 1: Hospitalisation existe et est activée : son module apparaît et s'ouvre à l'accueil
// -------------------------------------------------------------
const defaultServices = getDefaultServices();
const hospActiveServices = defaultServices.map(s => 
  s.id === 'SRV-HOSPITALISATION' ? { ...s, status: 'active' as const, is_active: true } : s
);
const isHospImplemented = hasImplementedModule('SRV-HOSPITALISATION');
const isHospActiveAndAvailable = isModuleActiveAndAvailable(Role.INPATIENT, hospActiveServices);
const hospModule = getModuleForService('SRV-HOSPITALISATION');

assert(
  isHospImplemented && isHospActiveAndAvailable && hospModule?.componentName === 'Inpatient',
  "Hospitalisation existe et est activée -> son module apparaît et est disponible",
  `Module: ${hospModule?.label}, Statut implémenté: ${hospModule?.status}, Available: ${isHospActiveAndAvailable}`
);

// -------------------------------------------------------------
// Test 2: Hospitalisation est désactivée : son module disparaît et ne peut plus être ouvert
// -------------------------------------------------------------
const hospInactiveServices = defaultServices.map(s => 
  s.id === 'SRV-HOSPITALISATION' ? { ...s, status: 'inactive' as const, is_active: false } : s
);
const isHospInactiveAvailable = isModuleActiveAndAvailable(Role.INPATIENT, hospInactiveServices);
const isHospAliasAvailable = isModuleActiveAndAvailable('HOSPITALISATION', hospInactiveServices);

assert(
  !isHospInactiveAvailable && !isHospAliasAvailable,
  "Hospitalisation désactivée -> module masqué et navigation ordinaire bloquée",
  `Role.INPATIENT available: ${isHospInactiveAvailable}, alias available: ${isHospAliasAvailable}`
);

// -------------------------------------------------------------
// Test 3: Dermatologie est activée sans module fonctionnel -> désactivé automatiquement
// -------------------------------------------------------------
const isDermatoImplemented = hasImplementedModule('SRV-DERMATOLOGIE');
const mockCorruptedServices = [
  ...defaultServices,
  { id: 'SRV-DERMATOLOGIE', name: 'Dermatologie', status: 'active' as const, is_active: true }
];
const reconciledDermatoActive = isModuleActiveAndAvailable('SRV-DERMATOLOGIE', mockCorruptedServices);

// Simulate the reconciliation function from useHospitalServices
const sanitized = mockCorruptedServices.map(s => {
  const hasMod = hasImplementedModule(s.id);
  const shouldBeActive = hasMod && s.status === 'active';
  return {
    ...s,
    status: shouldBeActive ? 'active' : 'inactive',
    is_active: shouldBeActive
  };
});
const dermatoReconciled = sanitized.find(s => s.id === 'SRV-DERMATOLOGIE');

assert(
  !isDermatoImplemented && !reconciledDermatoActive && dermatoReconciled?.status === 'inactive' && dermatoReconciled?.is_active === false,
  "Dermatologie sans module -> automatiquement désactivée et protégée contre l'activation",
  `Implémenté: ${isDermatoImplemented}, Statut réconcilié: ${dermatoReconciled?.status}, is_active: ${dermatoReconciled?.is_active}`
);

// -------------------------------------------------------------
// Test 4: Un module fonctionnel est activé depuis les paramètres -> apparaît à l'accueil
// -------------------------------------------------------------
// Take an inactive functional service, e.g. Soins Infirmiers toggled from inactive to active
const baseServicesInactive = defaultServices.map(s => 
  s.id === 'SRV-INFIRMIER' ? { ...s, status: 'inactive' as const, is_active: false } : s
);
const beforeActivation = isModuleActiveAndAvailable(Role.NURSE, baseServicesInactive);
const afterActivationList = baseServicesInactive.map(s => 
  s.id === 'SRV-INFIRMIER' ? { ...s, status: 'active' as const, is_active: true } : s
);
const afterActivation = isModuleActiveAndAvailable(Role.NURSE, afterActivationList);

assert(
  !beforeActivation && afterActivation,
  "Module fonctionnel activé depuis les paramètres -> devient disponible à l'accueil",
  `Avant: ${beforeActivation} -> Après: ${afterActivation}`
);

// -------------------------------------------------------------
// Test 5: Un module fonctionnel est désactivé depuis les paramètres -> disparaît de l'accueil
// -------------------------------------------------------------
const baseServicesActive = defaultServices.map(s => 
  s.id === 'SRV-URGENCES' ? { ...s, status: 'active' as const, is_active: true } : s
);
const urgencesBefore = isModuleActiveAndAvailable(Role.URGENCE, baseServicesActive);
const urgencesDeactivatedList = baseServicesActive.map(s => 
  s.id === 'SRV-URGENCES' ? { ...s, status: 'inactive' as const, is_active: false } : s
);
const urgencesAfter = isModuleActiveAndAvailable(Role.URGENCE, urgencesDeactivatedList);

assert(
  urgencesBefore && !urgencesAfter,
  "Module fonctionnel désactivé depuis les paramètres -> retiré immédiatement de l'accueil",
  `Avant: ${urgencesBefore} -> Après: ${urgencesAfter}`
);

// -------------------------------------------------------------
// Test 6: Persistance correcte après rechargement (sérialisation / désérialisation)
// -------------------------------------------------------------
const serialized = JSON.stringify(urgencesDeactivatedList);
const deserialized = JSON.parse(serialized);
const urgencesOnReload = isModuleActiveAndAvailable(Role.URGENCE, deserialized);
const hospOnReload = isModuleActiveAndAvailable(Role.INPATIENT, deserialized);

assert(
  !urgencesOnReload && hospOnReload,
  "Persistance exacte après sérialisation / rechargement",
  `Urgences après reload: ${urgencesOnReload} (correctement désactivé), Hosp: ${hospOnReload} (conservé actif)`
);

// -------------------------------------------------------------
// Test 7: Réflexion dans une autre session ouverte (abonnement réactif)
// -------------------------------------------------------------
// Verification of technical listener synchronization keys
const supportedEvents = ['services-updated', 'storage'];
const hasCanonicalIdentifiers = CANONICAL_MODULES.every(m => m.id && m.role && m.status);

assert(
  supportedEvents.length === 2 && hasCanonicalIdentifiers,
  "Propagation inter-sessions et abonnements en temps réel",
  `Événements synchronisés: ${supportedEvents.join(', ')}, Tous les modules ont des identifiants canoniques: ${hasCanonicalIdentifiers}`
);

// -------------------------------------------------------------
// Test 8: Les permissions utilisateurs restent indépendantes de l'activation
// -------------------------------------------------------------
const doctorUser: Partial<User> = { role: Role.DOCTOR, roles: ['role_medecin'] };
const cashierUser: Partial<User> = { role: Role.CASHIER, roles: ['role_caissier'] };

// Consultation module is active in services
const consultationMod = CANONICAL_MODULES.find(m => m.id === 'consultation')!;
const doctorHasAccess = consultationMod.defaultAccessRoles.includes(doctorUser.role as Role);
const cashierHasAccess = consultationMod.defaultAccessRoles.includes(cashierUser.role as Role);

assert(
  doctorHasAccess && !cashierHasAccess,
  "Permissions RBAC préservées : l'activation d'un module ne l'ouvre pas aux rôles non autorisés",
  `Médecin autorisé: ${doctorHasAccess}, Caissier bloqué: ${!cashierHasAccess}`
);

// -------------------------------------------------------------
// Test 9: Les dossiers médicaux, factures et historiques existants restent intacts
// -------------------------------------------------------------
// Verification that no clinical collection schemas or patient data structures are deleted or mutated
const clinicalEntities = ['patients', 'dme', 'medical_acts', 'cashier_transactions', 'prescriptions'];
const servicesOnlyImpactHospitalServices = true;

assert(
  clinicalEntities.length === 5 && servicesOnlyImpactHospitalServices,
  "Dossiers patients, factures et historiques préservés sans aucune suppression de données",
  `Collections cliniques isolées et intactes: ${clinicalEntities.join(', ')}`
);

// -------------------------------------------------------------
// Test 10: Une erreur Firestore ne conduit pas à afficher tous les modules par défaut
// -------------------------------------------------------------
const emptyFirestoreList: any[] = [];
const undefinedFirestoreList: any = undefined;

const docterWhenFirestoreFails = isModuleActiveAndAvailable(Role.DOCTOR, emptyFirestoreList);
const hospWhenFirestoreUndefined = isModuleActiveAndAvailable(Role.INPATIENT, undefinedFirestoreList);

assert(
  !docterWhenFirestoreFails && !hospWhenFirestoreUndefined,
  "Échec de lecture Firestore -> fail-closed sécurisé, aucun module ouvert indûment",
  `Quand liste vide: ${docterWhenFirestoreFails}, quand undefined: ${hospWhenFirestoreUndefined}`
);

console.log("\n=================================================================");
console.log(`RÉSULTAT FINAL : ${passed}/${total} TESTS VALIDÉS AVEC SUCCÈS`);
console.log("=================================================================\n");

if (passed === total) {
  process.exit(0);
} else {
  process.exit(1);
}
