
export enum PatientStatus {
  WAITING_ADMISSION = 'En attente accueil',
  WAITING_TRIAGE = 'En attente triage',
  IN_CONSULTATION = 'En consultation',
  WAITING_LAB = 'En attente Labo',
  IN_EMERGENCY = 'En Urgence',
  INPATIENT = 'Hospitalisé',
  READY_TO_DISCHARGE = 'Prêt pour la sortie',
  IN_MATERNITY = 'En Maternité',
  DISCHARGED = 'Sorti',
  TRIAGE = 'TRIAGE',
  ER_ROOM = 'ER_ROOM',
  OBSERVATION = 'OBSERVATION',
  NON_URGENT = 'NON_URGENT',
  ORIENTED = 'ORIENTED'
}

export enum TriageLevel {
  RED = 'ROUGE',
  ORANGE = 'ORANGE',
  YELLOW = 'JAUNE',
  GREEN = 'VERT'
}

export interface TriageData {
  id: string;
  patientId: string;
  timestamp: string;
  motif: string;
  vitals: {
    bpSys: number;
    bpDia: number;
    heartRate: number;
    respRate: number;
    spo2: number;
    temp: number;
  };
  consciousness: 'ALERT' | 'VOICE' | 'PAIN' | 'UNCONSCIOUS';
  painScale: number;
  level: TriageLevel;
}

export interface EmergencyPatient extends Patient {
  emergencyId: string;
  arrivalTimestamp: string;
  triage?: TriageData;
  management?: EmergencyManagement;
  monitoring: EmergencyMonitoring[];
  orientation?: EmergencyOrientation;
  status: PatientStatus.TRIAGE | PatientStatus.ER_ROOM | PatientStatus.OBSERVATION | PatientStatus.NON_URGENT | PatientStatus.ORIENTED;
}

export interface EmergencyManagement {
  id: string;
  timestamp: string;
  doctorId: string;
  doctorName: string;
  diagnosis: string;
  acts: string[];
  treatments: string[];
}

export interface EmergencyMonitoring {
  id: string;
  timestamp: string;
  vitals: {
    bpSys: number;
    bpDia: number;
    heartRate: number;
    respRate: number;
    spo2: number;
    temp: number;
  };
  nurseId: string;
  nurseName: string;
  note?: string;
}

export interface EmergencyOrientation {
  id: string;
  timestamp: string;
  type: 'HOSPITALIZATION' | 'CONSULTATION' | 'DISCHARGE' | 'EXTERNAL_TRANSFER';
  summary: string;
}

export enum Role {
  ADMIN = 'ADMIN',
  RECEPTION = 'ACCUEIL',
  DOCTOR = 'MEDECIN',
  NURSE = 'INFIRMIER',
  LAB = 'LABO',
  MATERNITY = 'SAGE_FEMME',
  PHARMACY = 'PHARMACIEN',
  CASHIER = 'CAISSIER',
  ACCOUNTANT = 'GESTIONNAIRE',
  URGENCE = 'URGENCE',
  INPATIENT = 'HOSPITALISATION',
  SUPER_ADMIN = 'SUPER_ADMIN'
}

export type EmergencySubMenu = 'patients' | 'prise_en_charge' | 'historique' | 'dashboard' | 'TRIAGE' | 'ER_ROOM' | 'OBSERVATION' | 'NON_URGENT' | 'MANAGEMENT' | 'DISCHARGE';

export type EmergencyStatusV1 = 'En attente' | 'Pris en charge' | 'En cours de suivi' | 'Sortie';

export interface EmergencyVitalSign {
  id: string;
  timestamp: string;
  date: string;
  time: string;
  bpSys?: number;
  bpDia?: number;
  heartRate?: number;
  respRate?: number;
  spo2?: number;
  temp?: number;
  weight?: number;
  height?: number;
  glycemia?: number;
  painScale?: number;
  measuredBy: string;
  measuredById?: string;
  notes?: string;
}

export interface EmergencyCare {
  id: string;
  type: string;
  description: string;
  timestamp: string;
  date: string;
  time: string;
  professional: string;
  professionalId?: string;
  product?: string;
  quantity?: string;
  observation?: string;
  status: 'Prévu' | 'Réalisé' | 'Annulé';
  billed?: boolean;
}

export interface EmergencyFollowUp {
  id: string;
  timestamp: string;
  date: string;
  time: string;
  author: string;
  authorId?: string;
  authorRole?: string;
  motif?: string;
  observations?: string;
  clinicalExam?: string;
  evolution?: string;
  treatments?: string;
  requestedExams?: string;
  results?: string;
  conduct?: string;
  conclusion?: string;
  freeText?: string;
  voiceNoteId?: string;
  voiceNoteAudioUrl?: string;
  voiceNoteTranscript?: string;
}

export interface EmergencyVoiceNote {
  id: string;
  timestamp: string;
  date: string;
  time: string;
  author: string;
  authorId?: string;
  durationSeconds?: number;
  audioData?: string; // base64 data URL
  transcript?: string;
  followUpId?: string;
}

export interface EmergencyDischarge {
  date: string;
  time: string;
  timestamp: string;
  professional: string;
  professionalId?: string;
  conclusion: string;
  instructions?: string;
  treatment?: string;
  appointment?: string;
  orientation: 'Retour à domicile' | 'Consultation' | 'Hospitalisation' | 'Transfert' | 'Autre';
  destinationDetails?: string;
}

export interface EmergencyEncounter {
  id: string;
  patientId: string;
  patientDme?: string;
  patientName: string;
  lastName: string;
  firstName: string;
  age?: number;
  birthDate?: string;
  gender?: string;
  arrivalTimestamp: string;
  arrivalDate: string;
  arrivalTime: string;
  arrivalMotif: string;
  responsibleStaff?: string;
  responsibleStaffId?: string;
  status: EmergencyStatusV1;
  vitals: EmergencyVitalSign[];
  cares: EmergencyCare[];
  followUps: EmergencyFollowUp[];
  voiceNotes?: EmergencyVoiceNote[];
  discharge?: EmergencyDischarge;
  createdAt?: string;
  updatedAt?: string;
}

export type NurseSubMenu = 'dashboard' | 'triage' | 'soins' | 'historique' | 'hospitalisation';

export type ReceptionSubMenu = 'dashboard' | 'admissions' | 'historique' | 'sorties' | 'demandes' | 'profil';

export type CashierSubMenu = 'dashboard' | 'facturation' | 'pending' | 'daily' | 'dettes';

export type LabSubMenu = 'dashboard' | 'demandes' | 'encours' | 'resultats' | 'validations' | 'rapports';

export type InpatientSubMenu = 'beds' | 'patient_bed' | 'requests' | 'history' | 'dashboard' | 'planner';

export type BedStatus = 'AVAILABLE' | 'OCCUPIED' | 'MAINTENANCE';

export type BedCategory = 'hospitalisation' | 'materniter' | 'all' | 'other';

export interface Bed {
  id: string;
  name: string;
  status: BedStatus;
  roomId: string;
  patientId?: string;
  patientName?: string;
  patientAge?: number;
  patientGender?: string;
  patientDossier?: string;
  admissionDate?: string;
  admissionTime?: string;
  admissionDoctor?: string;
  admissionDoctorId?: string;
  admissionReason?: string;
  admissionOrigin?: string;
  service?: string;
  priority?: 'Normal' | 'Urgent' | 'Critique';
  type?: string;
  lastUpdated?: string;
  category?: BedCategory;
}

export interface InpatientVitalSign {
  id: string;
  timestamp: string;
  date: string;
  time: string;
  bpSys?: number;
  bpDia?: number;
  heartRate?: number;
  pulse?: number;
  respRate?: number;
  spo2?: number;
  temp?: number;
  glycemia?: number;
  weight?: number;
  measuredBy: string;
  measuredById?: string;
  notes?: string;
}

export interface InpatientCare {
  id: string;
  type: string;
  description: string;
  timestamp: string;
  date: string;
  time: string;
  professional: string;
  professionalId?: string;
  status: 'Réalisé' | 'Prévu' | 'Annulé';
  observation?: string;
  product?: string;
  quantity?: string;
}

export interface InpatientObservation {
  id: string;
  timestamp: string;
  date: string;
  time: string;
  author: string;
  authorId?: string;
  authorRole?: string;
  title?: string;
  content: string;
  voiceNoteAudioUrl?: string;
  voiceNoteTranscript?: string;
  voiceNoteDurationSec?: number;
}

export interface InpatientRecord {
  id: string;
  patientId: string;
  patientName: string;
  patientAge?: number;
  patientGender?: string;
  patientDossier?: string;
  bedId: string;
  bedName?: string;
  roomId?: string;
  roomName?: string;
  service?: string;
  admissionDate: string;
  admissionTime?: string;
  admittedBy?: string;
  admittedById?: string;
  doctorName?: string;
  doctorId?: string;
  reason?: string;
  origin?: string;
  priority?: 'Normal' | 'Urgent' | 'Critique';
  status: 'admitted' | 'pending_discharge' | 'discharged';
  dischargeDate?: string;
  dischargeTime?: string;
  dischargedBy?: string;
  dischargeReason?: string;
  dischargeNotes?: string;
  duration?: string;
  vitals?: InpatientVitalSign[];
  cares?: InpatientCare[];
  observations?: InpatientObservation[];
}

export interface Room {
  id: string;
  name: string;
  description?: string;
  capacity: number;
}

export type PharmacySubMenu = 'dashboard' | 'prescriptions' | 'sales' | 'history';

export type MaternitySubMenu = 'dashboard' | 'waiting_room' | 'cpn' | 'delivery_room' | 'history' | 'labor' | 'delivery' | 'postpartum';

export type AccountingSubMenu = 'tresorerie' | 'creances' | 'fournisseurs' | 'depenses' | 'dashboard';

export type ConsultationSubMenu = 'dashboard' | 'WAITING_ROOM' | 'CONSULTATION' | 'HISTORY' | 'APPOINTMENTS' | 'PATIENT_DIRECTORY' | 'PATIENTS_HOSPITALISES';

export type VisitMotif = 
  | 'CONSULTATION' 
  | 'URGENCE' 
  | 'LABORATOIRE' 
  | 'MATERNITE' 
  | 'PHARMACIE' 
  | 'SOIN_INFIRMIER'
  | 'HOSPITALISATION'
  | 'AUTRE';

export type PaymentStatus = 'PENDING' | 'PARTIAL' | 'PAID' | 'PAID_PENDING_PICKUP' | 'DELIVERED' | 'EXEMPT' | 'CANCELLED';

export interface PaymentRequestItem {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  actId?: string;
  codeInterne?: string;
  practitionerId?: string;
  practitionerName?: string;
  practitionerRole?: string;
  performedAt?: string;
}

export interface PaymentRequest {
  id: string;
  patientId: string;
  patientName: string;
  requestingService: string;
  sourceModule: string;
  type: 'CONSULTATION' | 'LABORATOIRE' | 'HOSPITALISATION' | 'MATERNITE' | 'PHARMACIE' | 'VENTE_DIRECTE' | 'ADMINISTRATIF' | 'AUTRE';
  items: PaymentRequestItem[];
  totalAmount: number;
  amountPaid: number;
  status: PaymentStatus;
  createdAt: string;
  createdBy: string;
  createdById?: string;
  practitionerId?: string;
  practitionerName?: string;
  practitionerRole?: string;
  performedBy?: string;
  performedById?: string;
  requestedBy?: string;
  requestedById?: string;
  isClotured?: boolean;
  cloturedAt?: string;
  cloturedBy?: string;
  cloturedById?: string;
  targetCashier?: string;
  paymentMethod?: string;
  avoirUtilise?: number;
  detteCreee?: number;
  avoirGenere?: number;
  pharmacySessionId?: string;
  deliveryStatus?: string;
  deliveredAt?: string;
  deliveredBy?: string;
  deliveredById?: string;
}

export interface CashierTransaction {
  id: string;
  paymentRequestId: string;
  amount: number;
  paymentMethod: 'CASH' | 'CARD' | 'MOBILE_MONEY' | 'TRANSFER' | 'CHECK';
  date: string;
  cashierId: string;
  cashierName: string;
  sessionId?: string;
  notes?: string;
}

export interface CashierSession {
  id: string;
  cashierId: string;
  cashierName: string;
  openedAt: string;
  closedAt?: string;
  initialFloat: number;
  status: 'OPEN' | 'CLOSED';
  totalCash: number;
  totalMobileMoney: number;
  totalCard: number;
  totalTransfer: number;
  totalCheck: number;
  totalAvance?: number;
  totalCollected: number;
  expectedFinalFloat?: number;
  actualCashInHand?: number;
  difference?: number;
  notes?: string;
}

export interface ParametresCaisse {
  detteAutorisee: boolean;
  seuilDetteMax: number;
  paiementPartielAutorise: boolean;
  avoirPatientAutorise: boolean;
  applicationAutoAvoir: boolean;
  modesPaiement: {
    especes: boolean;
    mobileMoney: boolean;
    carte: boolean;
    virement: boolean;
    autre: boolean;
  };
  impression: {
    nomStructure: string;
    logo: string;
    adresse: string;
    telephone: string;
    slogan: string;
    piedDePage: string;
  };
  permissions: {
    autoriserDette: Role[];
    annulerTransaction: Role[];
    rembourserAvoir: Role[];
    modifierFacture: Role[];
  };
  technique: {
    caissesActives: string[];
    formatRecu: string;
    formatTransaction: string;
  };
}

export interface LigneFacturation {
  id: string;
  libelle: string;
  source: string;
  quantite: number;
  prixUnitaire: number;
  montantTotal: number;
  paymentRequestId?: string;
  paymentRequestIds?: string[];
  isPaid?: boolean;
  originalPrice?: number;
  date?: string;
  createdAt?: string;
}

export interface TransactionFacturation {
  id: string;
  patientId: string;
  patientName: string;
  date: string;
  lignes: LigneFacturation[];
  sousTotal: number;
  totalGeneral: number;
  montantPaye: number;
  avoirUtilise: number;
  surplusConserve: number;
  detteCreee: number;
  modePaiement: 'CASH' | 'CARD' | 'MOBILE_MONEY' | 'TRANSFER' | 'CHECK' | 'OTHER';
  caissierId: string;
  caissierName: string;
  status: 'VALIDATED' | 'CANCELLED';
}

export interface AvoirPatient {
  id: string;
  patientId: string;
  montant: number;
  dateCreation: string;
  transactionSourceId: string;
  status: 'AVAILABLE' | 'USED' | 'REFUNDED';
}

export interface DettePatient {
  id: string;
  patientId: string;
  patientName?: string;
  montantInitial: number;
  montantRestant: number;
  dateCreation: string;
  transactionSourceId: string;
  status: 'PENDING' | 'PARTIAL' | 'PAID';
  origin?: string;
  description?: string;
  isEmergencyOverride?: boolean;
}

export interface HistoriqueFinancierPatient {
  patientId: string;
  transactions: TransactionFacturation[];
  avoirs: AvoirPatient[];
  dettes: DettePatient[];
}

export interface Consumable {
  id: string;
  name: string;
  price: number;
  stock: number;
  
  // Général
  codeInterne?: string;
  description?: string;
  categorie?: string;
  sousCategorie?: string;
  servicePrincipal?: string;

  // Stock
  uniteGestion?: string;
  quantiteParConditionnement?: number;
  seuilAlerte?: number;
  gestionParLot?: boolean;
  datePeremptionApplicable?: boolean;
  numeroLot?: string;
  datePeremption?: string;

  // Utilisation
  venduAuPatient?: boolean;
  consommeEnInterne?: boolean;
  deductionAutomatique?: boolean;
  lieActeMedical?: boolean;
  lieExamenLabo?: boolean;
  lieSoinInfirmier?: boolean;
  lieHospitalisation?: boolean;
  lieDocumentAdministratif?: boolean;
  modeUtilisation?: string;

  // Tarification
  prixAchat?: number;
  facturableAuPatient?: boolean;
  caisseConcernee?: string;

  // Intégrations métier
  actesLies?: string[];
  examensLaboLies?: string[];
  soinsLies?: string[];
  modulesLies?: string[];

  // Paramètres intelligents
  prioriteApprovisionnement?: string;
  regleAlerteStock?: string;
  commentaireAdministratif?: string;
  recommandationsUsage?: string;
  servicePrioritaire?: string;
}

export type UserStatus = 'ACTIVE' | 'INACTIVE' | 'BLOCKED';

export interface User {
  id: string;
  username: string;
  email?: string;
  phone?: string;
  password?: string; // TODO: For production, implement secure hashing (bcrypt/Argon2)
  forcePasswordChange?: boolean;
  passwordChangedAt?: string;
  isMainAdmin?: boolean;
  createdBySuperAdmin?: boolean;
  name: string;
  role: Role; // Legacy single role for backward compatibility
  roles?: string[]; // Array of CustomRole IDs for multi-role support
  status?: UserStatus;
  createdAt?: string;
  lastLogin?: string;
  token: string;
  profession?: string;
  salary?: string;
  schedule?: string;
  quotePartRate?: string;
  profileImage?: string;
  profile_image_url?: string;
  clinicId?: string;
  hospital_id?: string;
  structureName?: string;
}

export interface CustomRole {
  id: string;
  name: string;
  description: string;
  permissions: Record<string, string[]>; // e.g., { 'module_consultation': ['read', 'write'], 'global': ['prescribe_meds'] }
  createdAt: string;
  updatedAt: string;
  isSystem?: boolean;
}

export interface EstablishmentConfig {
  name: string;
  address: string;
  phone: string;
  logo?: string;
  language: 'FR' | 'EN';
  currency: 'XAF' | 'USD' | 'EUR';
  theme?: string;
  email?: string;
  city?: string;
  country?: string;
  slogan?: string;
  taxId?: string;
  website?: string;
  bankInfo?: string;
  invoiceFooter?: string;
  licence_id?: string;
  licenceId?: string;
  hospital_id?: string;
  tenantId?: string;
  
  // Laboratory Workflow Configuration
  requireBiologistValidation?: boolean;
  require_biologist_validation?: boolean;
}

export interface LabExamRequest {
  id: string;
  patientId: string;
  patientName: string;
  patientAge?: number;
  patientGender?: string;
  prescriberId: string;
  prescriberName: string;
  department?: string; // service demandeur
  date: string;
  status: 'en attente' | 'patient appelé' | 'prélèvement fait' | 'en cours' | 'terminé' | 'validé' | 'annulé';
  priority: 'normal' | 'urgent' | 'critique';
  clinicalContext: {
    motif: string;
    diagnostic: string;
    note: string;
  };
  exams: {
    actId: string;
    name: string;
    price: number;
    category: string;
    sampleType?: string;
    technique?: string;
    sampleStatus?: 'en attente' | 'prélevé' | 'conforme' | 'à refaire';
    sampleRemarks?: string;
    isSensitive?: boolean;
    consommables?: string[];
  }[];
  totalAmount: number;
  comments?: string;
  billingStatus: 'pending' | 'partial' | 'paid' | 'exonéré';
  
  // Emergency Debt & Override
  isEmergencyOverride?: boolean;
  debtId?: string;
  
  // Prélèvement
  sampleType?: string;
  sampleTime?: string;
  sampledBy?: string;
  sampleRemarks?: string;
  technicianId?: string;
  sampleCount?: number;
  
  // Timestamps
  createdAt?: string;
  updatedAt?: string;
}

export interface ParametreResultat {
  nom: string;
  unite: string;
  valeurReference: string;
  valeur: string;
  isAnormal?: boolean;
}

export interface LigneResultat {
  examId: string; // actId
  examName: string;
  parametres: ParametreResultat[];
  conclusion?: string;
  isSensitive?: boolean;
}

export interface ResultatLaboratoire {
  id: string;
  demandeId: string;
  patientId: string;
  lignes: LigneResultat[];
  commentaireGlobal?: string;
  statut: 'brouillon' | 'prêt pour validation' | 'validé' | 'rejeté';
  saisiPar: string;
  saisiParId?: string;
  dateSaisie: string;
  validePar?: string;
  valideParId?: string;
  dateValidation?: string;
  remarquesValidation?: string;
  rejectionType?: 'TYPO' | 'SAMPLE_REJECTION';
  rejectionReason?: string;
  isDirectPublication?: boolean;
}

export interface RapportLaboratoirePDF {
  id: string;
  resultatId: string;
  patientId: string;
  dateGeneration: string;
  url?: string; // URL ou base64
}

export interface ConsultationAddendum {
  id: string;
  consultationId: string;
  patientId: string;
  date: string;
  time: string;
  timestamp: string;
  authorId?: string;
  authorName: string;
  authorRole: string;
  reason: 'Précision diagnostique' | 'Ajustement posologique' | 'Observation complémentaire' | 'Évolution clinique' | 'Correction médico-légale' | string;
  content: string;
}

export interface ConsultationRecord {
  id: string;
  patientId: string;
  patient?: string;
  patientName?: string;
  patientIdRaw?: string;
  age?: number;
  gender?: string;
  date: string;
  time: string;
  doctor: string;
  doctorName?: string;
  doctorId?: string;
  practitionerId?: string;
  practitionerName?: string;
  practitionerRole?: string;
  doctorEmail?: string;
  motif: string;
  diagnosis: string;
  treatment?: string;
  exams?: string;
  observation?: string;
  type?: string;
  status: 'draft' | 'cloture' | 'archived';
  isReadOnly?: boolean;
  isClotured?: boolean;
  cloturedAt?: string;
  cloturedBy?: string;
  cloturedById?: string;
  exitDisposition?: 'HOME' | 'HOSPITALIZATION' | 'MATERNITY' | 'TRANSFER' | 'FOLLOW_UP';
  addenda?: ConsultationAddendum[];
  createdAt: string;
  updatedAt?: string;
}

export interface HistoriqueLaboratoirePatient {
  patientId: string;
  demandes: LabExamRequest[];
  resultats: ResultatLaboratoire[];
  rapports: RapportLaboratoirePDF[];
}

export interface MedicalAct {
  id: string;
  name: string;
  price: number;
  category: string;
  
  // Optional alias fields for multilingual / form compatibility
  nom?: string;
  prixBase?: string | number;
  categorie?: string;
  status?: 'active' | 'inactive';
  is_active?: boolean;
  
  // New fields from AddMedicalActForm
  codeInterne?: string;
  description?: string;
  type?: string;
  
  serviceId?: string;
  servicePrincipal?: string;
  sousService?: string;
  priorite?: string;
  
  professionsAutorisees?: string[];
  dureeEstimee?: string;
  necessiteRdv?: boolean;
  peutEtreUrgent?: boolean;
  genereHospitalisation?: boolean;
  necessiteSurveillance?: boolean;
  necessiteConsentement?: boolean;
  
  modeTarification?: string;
  factureA?: string;
  remboursable?: boolean;
  partageRevenu?: boolean;
  pourcentageMedecin?: string;
  pourcentageStructure?: string;
  
  medicamentsUtilises?: string[];
  consommables?: string[];
  equipements?: string[];
  
  indications?: string;
  signesDeclencheurs?: string[];
  parametresSurveiller?: string[];
  niveauRisque?: string;
  actionsAssociees?: string[];
  
  // Paramètres de laboratoire (si type === 'Laboratoire')
  isSensitive?: boolean;
  labParameters?: {
    nom: string;
    unite: string;
    valeurReferenceMin?: number;
    valeurReferenceMax?: number;
    valeurReferenceTexte?: string;
  }[];
}

export interface Medication {
  id: string;
  name: string;
  dci?: string;
  dosage: string;
  price: number;
  stock: number;
  routes?: string[];
  forms?: string[];
  concentrations?: string[];
  units?: string;
  quantityPerBox?: number;
  contraindications?: string[];
  alerts?: string[];
  
  // New fields from AddMedicationForm
  codeInterne?: string;
  codeBarre?: string;
  laboratoire?: string;
  classeTherapeutique?: string;
  sousClasseTherapeutique?: string;
  indications?: string;
  formeGalenique?: string;
  dosageValeur?: string;
  dosageUnite?: string;
  concentration?: string;
  volumeParUnite?: string;
  voiesAdministration?: string[];
  typePosologie?: string;
  doseMinimale?: string;
  doseMaximale?: string;
  frequenceStandard?: string;
  dureeStandard?: string;
  doseMaxParPrise?: string;
  doseMaxParJour?: string;
  effetsSecondaires?: string[];
  interactions?: string;
  typeConditionnement?: string;
  unitesParConditionnement?: string;
  volumeParUniteStock?: string;
  prixAchat?: string | number;
  prixVente?: string | number;
  seuilAlerte?: string | number;
  family?: string;
  unit?: string;
  batchNumber?: string;
  expiryDate?: string;
  lastRestockedAt?: string;
  lastRestockedBy?: string;
  parametresSurveiller?: string[];
  signesAlerte?: string[];
  niveauRisque?: string;
  recommandations?: string;
}

export interface StockMovement {
  id: string;
  medicationId: string;
  medicationName: string;
  type: 'REFILL' | 'ADJUSTMENT' | 'SALE' | 'EXPIRATION';
  quantity: number;
  previousStock: number;
  newStock: number;
  batchNumber?: string;
  expiryDate?: string;
  purchaseCost?: number;
  supplier?: string;
  notes?: string;
  adminName: string;
  adminId?: string;
  createdAt: string;
}

export interface Tool {
  id: string;
  name: string;
  code: string;
  description: string;
  moduleParent: string;
  status: 'ACTIVE' | 'INACTIVE';
  criticality: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  visibility: 'VISIBLE' | 'HIDDEN' | 'OPTIONAL' | 'MANDATORY';
  authorizedRoles: string[];
  dependencies: string[];
  impacts: string[];
  createdAt: string;
  updatedAt: string;
  mode?: 'SIMPLE' | 'ADVANCED';
}

export interface Ordonnance {
  id: string;
  patientId: string;
  prescripteurId: string;
  prescripteurName: string;
  prescripteurRole?: string;
  date: string;
  status: 'DRAFT' | 'VALIDATED' | 'TRANSMITTED' | 'PREPARED' | 'DELIVERED' | 'CANCELLED';
  diagnostic?: string;
  indication?: string;
  notes?: string;
  traitements: Prescription[];
  pharmacyStatus?: 'PENDING' | 'PREPARING' | 'READY' | 'DELIVERED';
}

export interface Prescription {
  id: string;
  patientId: string;
  doctorId: string;
  medicationId: string;
  medicationName: string;
  indication?: string;
  route: string;
  dosageScheme: string;
  frequency: number;
  duration: number;
  calculationType: 'FIXED' | 'MG_KG_PRISE' | 'MG_KG_JOUR' | 'M2';
  dosePerIntake: number;
  dosePer24h: number;
  totalDose: number;
  volumePerIntake?: number;
  unitsPerIntake: number;
  totalUnits: number;
  totalBoxes: number;
  createdAt: string;
  status: 'DRAFT' | 'VALIDATED' | 'SUSPENDED' | 'STOPPED';
  monitoringParams?: string[];
  sideEffects?: string[];
  instructions?: string;
}

export interface CareTask {
  id: string;
  patientId: string;
  patientName?: string;
  bedId?: string;
  prescriptionId?: string;
  medicationName?: string;
  title?: string;
  category: 'MEDICATION' | 'NURSING' | 'EXAM' | 'VITAL_SIGNS';
  scheduledAt: string;
  executedAt?: string;
  executedBy?: string;
  status: 'TODO' | 'DONE' | 'LATE' | 'MISSED' | 'REFUSED' | 'SUSPENDED' | 'STOPPED';
  dose?: number;
  volume?: number;
  units?: number;
  route?: string;
  instructions?: string;
  monitoringParams?: string[];
  sideEffects?: string[];
  comment?: string;
}

export interface CarePlanItem {
  id: string;
  title: string;
  instructions?: string;
  category: 'NURSING' | 'EXAM' | 'VITAL_SIGNS';
  frequency: number; // times per 24h
  duration: number; // days
  createdAt: string;
}

export interface CarePlan {
  id: string;
  patientId: string;
  bedId: string;
  doctorId: string;
  doctorName: string;
  createdAt: string;
  items: CarePlanItem[];
  status: 'ACTIVE' | 'ARCHIVED';
}

export type ServiceType = 'clinique' | 'technique' | 'administratif' | 'soutien' | 'specialise';

export interface Service {
  id: string;
  name: string;
  description: string;
  type: ServiceType;
  status: 'active' | 'inactive';
  is_active?: boolean;
  order?: number;
  users: string[]; // User IDs
  activeTools: string[]; // Tool IDs or codes
  linkedModules: string[]; // Module IDs or names
  specificSettings: Record<string, any>;
  updatedAt?: string;
  createdAt?: string;
}

export interface Patient {
  id: string;
  firstName: string;
  lastName: string;
  birthDate: string;
  gender: 'M' | 'F';
  phone: string;
  residence: string;
  emergencyContact: string;
  emergencyPhone: string;
  maritalStatus: 'CELIBATAIRE' | 'MARIE' | 'VEUF' | 'DIVORCE';
  ethnicity?: string;
  religion?: string;
  bloodGroup?: string;
  allergies?: string[];
  lastVisit?: string;
  status?: PatientStatus;
  createdAt?: string;
  creditBlocked?: boolean; // When true: debt generation strictly disabled (Credit Lock)
  allowCredit?: boolean; // When false: debt generation strictly disabled
  patientId?: string;
  age?: number;
  hospitalizationStatus?: string;
  admittedBedId?: string | null;
  admittedBedName?: string | null;
  admittedRoomName?: string | null;
  lastHospitalizationDate?: string;
  dischargeDate?: string;
  // Paramètres cliniques de triage
  vitals?: {
    bpSys: number;
    bpDia: number;
    heartRate: number;
    respRate: number;
    pulse: number;
    spo2: number;
    temp: number;
    height: number;
    weight: number;
    bmi: number;
    waistCirc: number;
  };
}

export interface VisitRecord {
  id: string;
  patientId: string;
  motif: VisitMotif;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'EMERGENCY';
  destination: Role;
  arrivalTime: string;
  fee: number;
}

export interface PregnancyDossier {
  id: string;
  patientId: string;
  patientName?: string;
  patientDossierNum?: string;
  patientAge?: number | string;
  gestity: number;
  parity: number;
  previousMiscarriages?: number;
  previousNeonatalDeaths?: number;
  previousCesareans?: number;
  previousComplications?: string;
  obstetricalHistory: string;
  pregnancyType?: 'SINGLE' | 'MULTIPLE';
  ddr: string; // Date des Dernières Règles
  dpa: string; // Date Prévue d'Accouchement
  gestationalAgeWeeks: number;
  riskFactors: string[];
  status: 'A_JOUR' | 'EN_RETARD' | 'TERMINEE';
  cpnCount: number;
  lastCpnDate?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CPNVisit {
  id: string;
  pregnancyId: string;
  patientId: string;
  patientName?: string;
  patientDossierNum?: string;
  patientAge?: number | string;
  date: string;
  time?: string;
  visitNumber?: number;
  status?: 'VALIDEE' | 'EN_COURS' | 'BROUILLON';
  week: number; // Semaine d'aménorrhée
  motif: string;
  complaints: string[];
  symptoms?: string;
  clinicalNotes?: string;
  eventsSinceLastVisit?: string;
  bpSys: number;
  bpDia: number;
  weight: number;
  edema: boolean | string;
  temp: number;
  pulse: number;
  respiratoryRate?: number;
  spo2?: number;
  fundalHeight: number;
  bcf: number;
  fetalMovements: boolean | string;
  presentation: string;
  position?: string;
  proteinuria?: string;
  glycemia?: number;
  obstetricalObservations?: string;
  obstetricalAntecedents?: string;
  prescribedExams?: any[];
  prescriptions?: any[];
  dietaryAdvice?: string;
  supplementation?: string;
  hygieneAdvice?: string;
  surveillanceAdvice?: string;
  generalAdvice?: string;
  conclusion: string;
  finalObservations?: string;
  diagnosis?: string;
  actionPlan?: string;
  isRiskPregnancy?: boolean;
  orientation?: string;
  nextVisitDate: string;
  userId: string;
  userName?: string;
  practitionerId?: string;
  practitionerName?: string;
  practitionerRole?: string;
  performedBy?: string;
  performedById?: string;
  createdAt?: string;
}

export interface MaternityAdmission {
  id: string;
  patientId: string;
  patientName: string;
  patientDossierNum?: string;
  patientAge?: number | string;
  patientPhone?: string;
  dmeId?: string;
  pregnancyId?: string;
  admissionDate: string;
  admissionTime: string;
  admittedAt?: string;
  gestationalAge?: string | number;
  motif: string;
  stage: 'WAITING' | 'ADMITTED' | 'LABOR' | 'DELIVERY' | 'POSTPARTUM' | 'DISCHARGED';
  status: 'En attente' | 'Admise' | 'En travail' | 'Accouchement réalisé' | 'Suites immédiates' | 'Sortie/transfert';
  contractions?: string;
  liquidLoss?: string;
  bleeding?: string;
  fetalMovements?: string;
  bpSys?: number;
  bpDia?: number;
  pulse?: number;
  temp?: number;
  bcf?: number;
  presentation?: string;
  dilation?: number;
  observations?: string;
  obstetricalHistory?: string;
  bedId?: string;
  midwife?: string;
  midwifeId?: string;
  doctor?: string;
  doctorId?: string;
  practitionerId?: string;
  practitionerName?: string;
  practitionerRole?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MaternityDelivery {
  id: string;
  admissionId: string;
  pregnancyId?: string;
  motherPatientId: string;
  motherName: string;
  motherDossierNum?: string;
  motherAge?: number | string;
  deliveryDate: string;
  deliveryTime: string;
  deliveryMode: string;
  location: string;
  attendedBy: string;
  attendedById?: string;
  midwife?: string;
  midwifeId?: string;
  doctor?: string;
  doctorId?: string;
  practitionerId?: string;
  practitionerName?: string;
  practitionerRole?: string;
  fetalPresentation: string;
  newbornId?: string;
  newbornGender: 'M' | 'F';
  newbornBirthTime: string;
  newbornWeight: number;
  newbornHeight: number;
  newbornHeadCircumference?: number;
  apgar1Min: number;
  apgar5Min: number;
  newbornObservations?: string;
  maternalImmediateState?: string;
  maternalObservations?: string;
  immediateDisposition?: string;
  createdAt: string;
}

export interface NewbornRecord {
  id: string;
  dossierNumber: string;
  firstName: string;
  lastName: string;
  motherId: string;
  motherName: string;
  motherDossierNum?: string;
  deliveryId: string;
  pregnancyId?: string;
  birthDate: string;
  birthTime: string;
  gender: 'M' | 'F';
  weight: number;
  height: number;
  headCircumference?: number;
  apgar1: number;
  apgar5: number;
  establishment?: string;
  observations?: string;
  status: 'VIVANT' | 'SOUS_SURVEILLANCE' | 'TRANSFERE';
  deliveredBy?: string;
  deliveredById?: string;
  practitionerId?: string;
  practitionerName?: string;
  createdAt: string;
}

export interface CPNExam {
  id: string;
  pregnancyId: string;
  type: string;
  name: string;
  status: 'RECOMMANDE' | 'EN_ATTENTE' | 'FAIT';
  date?: string;
  result?: string;
  anomalyDetected: boolean;
}

export interface CPNPrevention {
  id: string;
  pregnancyId: string;
  type: string;
  name: string;
  category: 'SUPPLEMENTATION' | 'PALUDISME' | 'VACCINATION';
  status: 'A_FAIRE' | 'FAIT';
  administrationDate?: string;
  nextDoseDate?: string;
  date: string;
}

export interface Expense {
  id: string;
  reference: string;
  category: string;
  description: string;
  amount: number;
  supplier: string;
  date: string;
  receiptUrl?: string;
  createdBy: string;
  status: 'ACTIVE' | 'CANCELLED' | 'ARCHIVED';
}

export type ExpenseCategory = 
  | 'FOURNISSEURS'        // Fournisseurs (Suppliers/Restocking)
  | 'CHARGES_FACTURES'    // Charges & Factures (Utilities, Rent, Operations)
  | 'SALAIRES'            // Salaires (Staff Payroll)
  | 'QUOTES_PARTS';       // Quotes-parts (Doctor/Surgeon Commissions)

export interface HospitalExpense {
  id: string;
  reference: string;
  date: string;
  category: ExpenseCategory;
  categoryLabel: string;
  beneficiary: string;         // Bénéficiaire (Payee)
  beneficiaryId?: string;      // Staff userId, Supplier id, or custom
  beneficiaryRole?: string;
  amount: number;              // Montant
  status: 'PAID' | 'PENDING';  // Statut (Payé, En attente)
  description?: string;
  paymentMethod?: 'CASH' | 'TRANSFER' | 'CHECK' | 'MOBILE_MONEY';
  paidAt?: string;
  paidBy?: string;
  createdAt: string;
  createdBy: string;
  metadata?: {
    // Fournisseurs
    supplierId?: string;
    supplierName?: string;
    invoiceId?: string;
    invoiceNumber?: string;
    moduleSource?: 'PHARMACIE' | 'LABORATOIRE' | 'GENERAL';

    // Salaires
    staffId?: string;
    staffName?: string;
    staffRole?: string;
    baseSalary?: number;
    month?: string;

    // Quotes-parts
    doctorId?: string;
    doctorName?: string;
    commissionRate?: number;
    dateRangeStart?: string;
    dateRangeEnd?: string;
    actsCount?: number;
    totalActsAmount?: number;

    // Charges & Factures
    chargeType?: string;
    billNumber?: string;

    // Anti-fraud override
    adminOverride?: boolean;
    overrideReason?: string;
    originalCalculatedAmount?: number;
  };
}

export interface Supplier {
  id: string;
  name: string;
  contact: string;
  phone?: string;
  email?: string;
  address: string;
  taxId?: string; // NIF / RC / Identifiant fiscal
  category: string;
  historyCount: number;
  totalBought: number;
  outstandingDebt: number;
  balance?: number; // Alias of outstandingDebt
  nextDeadline?: string;
  notes?: string;
  createdAt?: string;
}

export interface SupplierPayment {
  id: string;
  supplierId: string;
  supplierName: string;
  invoiceId?: string;
  invoiceNumber?: string;
  amount: number;
  date: string;
  paymentMethod: 'CASH' | 'TRANSFER' | 'CHECK' | 'MOBILE_MONEY';
  reference?: string;
  notes?: string;
  paidBy?: string;
  createdBy?: string;
  createdAt?: string;
}

export interface SupplierInvoice {
  id: string;
  invoiceNumber: string;
  supplierId: string;
  supplierName: string;
  moduleSource: 'PHARMACIE' | 'LABORATOIRE' | 'GENERAL';
  type: 'LIVRAISON_STOCK' | 'BON_COMMANDE' | 'SERVICE';
  items: Array<{
    name: string;
    quantity: number;
    unitCost: number;
    totalCost: number;
    batchNumber?: string;
    expiryDate?: string;
  }>;
  totalAmount: number;
  amountPaid: number;
  status: 'PENDING' | 'PARTIAL' | 'PAID';
  date: string;
  dueDate?: string;
  validatedBy?: string;
  notes?: string;
  createdAt?: string;
}

export interface TreasuryAccount {
  id: string;
  name: string;
  type: 'CAISSE' | 'BANQUE' | 'MOBILE_MONEY';
  balance: number;
  status: 'Active' | 'Inactive';
}

export interface AuditLog {
  id: string;
  timestamp: string;
  user: string;
  action: string;
  details?: any;
  oldValue?: any;
  newValue?: any;
}

export interface StaffSalary {
  id: string;
  name: string;
  role: string;
  specialty: string;
  baseSalary: number;
  primes: number;
  gardes: number;
  deductions: number;
  actsCount: number;
}

export interface QuotePartRule {
  service: string;
  providerPercent: number;
  facilityPercent: number;
}

// CATALOGUE DE PROTOCOLES TYPES
export type ProtocolCategory =
  | 'EXAM_PACK'          // Packs d'examens
  | 'THERAPEUTIC'         // Protocoles thérapeutiques
  | 'CARE'                // Protocoles de soins
  | 'HOSPITALIZATION'     // Protocoles d'hospitalisation
  | 'OBSTETRICAL'         // Protocoles obstétricaux
  | 'EMERGENCY'           // Protocoles d'urgence
  | 'CARE_PATHWAY';       // Parcours de soins

export interface ProtocolVersion {
  version: string;
  date: string;
  author: string;
  changes: string;
}

export interface ProtocolLog {
  user: string;
  date: string;
  time: string;
  action: 'creation' | 'modification' | 'activation' | 'deactivation' | 'archiving';
  details?: string;
}

export interface ProtocolElement {
  id: string; // ID from referential or custom name
  type: 'EXAM' | 'MEDICATION' | 'CONSUMABLE' | 'ACT' | 'VITAL';
  name: string;
  quantity?: number;
  frequency?: string;
  duration?: string;
  priority?: 'HIGH' | 'MEDIUM' | 'LOW';
  isRequired?: boolean;
}

export interface Protocol {
  id: string;
  code: string;
  name: string;
  category: ProtocolCategory;
  description: string;
  objective: string;
  scientificReference: string;
  author: string;
  createdAt: string;
  lastUpdated: string;
  version: string;
  versionHistory: ProtocolVersion[];
  status: 'DRAFT' | 'PENDING' | 'ACTIVE' | 'ARCHIVED';
  
  // Composition elements
  elements: ProtocolElement[];
  clinicalGuidance?: string; // Conseils
  
  // Specific settings for therapeutic protocol
  therapeuticSettings?: {
    standardDosages: string;
    treatmentDuration: string;
    contraindications: string;
    precautions: string;
  };
  
  // Specific settings for hospitalization protocol
  hospitalizationSettings?: {
    treatments: string;
    administrationSchedule: string; // Horaires d'administration
    monitoringParams: string[]; // Paramètres à surveiller
    monitoringFrequency: string; // Fréquence de surveillance
    dischargeCriteria: string; // Critères de sortie
  };
  
  // Specific settings for care pathways (steps)
  pathwaySteps?: {
    id: string;
    stepNumber: number;
    name: string;
    linkedProtocolId?: string; // Link to another protocol ID (e.g. CPN1)
  }[];

  // Stats
  useCount: number;
  userServices: string[]; // E.g., ['Maternité', 'Urgences']
  lastUsedAt?: string;
  
  // Traceability logs
  logs: ProtocolLog[];
}

// ==========================================
// SAAS MULTI-TENANT & LICENCE / QUOTA SCHEMAS
// ==========================================

export interface Licence {
  id: string; // e.g. 'licence_basic', 'licence_standard', 'licence_premium', 'licence_enterprise'
  nom_licence: string; // e.g. 'Basic', 'Standard', 'Premium', 'Enterprise'
  max_users: number; // Included base staff users limit
  min_users?: number; // Recommended min users for this tier
  max_users_cap?: number; // Recommended upper ceiling before upgrading tier
  pricePerExtraUserFCFA?: number; // Monthly cost per additional user seat beyond max_users
  description?: string;
  monthlyPriceFCFA?: number;
  includedServiceIds?: string[];
  badgeColor?: string;
  durationValue?: number;
  durationUnit?: 'Mois' | 'Années';
  status?: 'ACTIVE' | 'ARCHIVED';
  createdAt?: string;
  updatedAt?: string;
}

export type SubscriptionPlan = Licence;

export interface Hospital {
  id: string;
  name: string;
  licence_id: string; // Foreign key referencing Licence(id)
  licenceId?: string;
  max_users?: number;
  address?: string;
  city?: string;
  country?: string;
  phone?: string;
  email?: string;
  responsibleUser?: string;
  status?: 'ACTIVE' | 'SUSPENDED' | 'EXPIRED' | 'DEMO';
  createdAt?: string;
  updatedAt?: string;
}

