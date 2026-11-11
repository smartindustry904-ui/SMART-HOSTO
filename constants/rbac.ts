import { CustomRole } from '../types';

export const DEFAULT_ROLES: CustomRole[] = [
  {
    id: 'role_admin',
    name: 'Admin',
    description: 'Accès total au système',
    permissions: {
      'global': ['full_admin']
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isSystem: true
  },
  {
    id: 'role_medecin',
    name: 'Médecin',
    description: 'Accès aux consultations, prescriptions et dossiers patients',
    permissions: {
      'module_consultation': ['read', 'write'],
      'module_hospitalisation': ['read', 'write'],
      'module_urgence': ['read', 'write'],
      'global': ['prescribe_meds', 'view_sensitive_data']
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isSystem: true
  },
  {
    id: 'role_infirmier',
    name: 'Infirmier(ère)',
    description: 'Soins infirmiers et suivi hospitalisation',
    permissions: {
      'module_hospitalisation': ['read', 'write'],
      'module_urgence': ['read', 'write']
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isSystem: true
  },
  {
    id: 'role_caissier',
    name: 'Caissier(ère)',
    description: 'Gestion des encaissements et facturation',
    permissions: {
      'module_caisse': ['read', 'write', 'validate'],
      'global': ['manage_billing']
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isSystem: true
  },
  {
    id: 'role_secretaire',
    name: 'Secrétaire Accueil',
    description: 'Accueil, enregistrement et triage des patients',
    permissions: {
      'module_accueil': ['read', 'write']
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isSystem: true
  },
  {
    id: 'role_pharmacien',
    name: 'Pharmacien(ne)',
    description: 'Gestion de la pharmacie et dispensation',
    permissions: {
      'module_pharmacie': ['read', 'write', 'validate']
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isSystem: true
  },
  {
    id: 'role_laborantin',
    name: 'Laborantin(e)',
    description: 'Gestion des analyses médicales',
    permissions: {
      'module_laboratoire': ['read', 'write', 'validate']
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isSystem: true
  },
  {
    id: 'role_radiologue',
    name: 'Radiologue',
    description: 'Gestion de l\'imagerie médicale',
    permissions: {
      'module_imagerie': ['read', 'write', 'validate']
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isSystem: true
  },
  {
    id: 'role_chef_service',
    name: 'Chef de Service',
    description: 'Supervision d\'un service médical',
    permissions: {
      'module_consultation': ['read', 'write', 'validate'],
      'module_hospitalisation': ['read', 'write', 'validate'],
      'global': ['access_reports', 'view_sensitive_data']
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isSystem: true
  },
  {
    id: 'role_comptable',
    name: 'Comptable',
    description: 'Gestion de la trésorerie, des dépenses et de la comptabilité',
    permissions: {
      'module_comptabilite': ['read', 'write', 'validate'],
      'global': ['access_reports', 'manage_billing']
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isSystem: true
  }
];

export interface PermissionModule {
  id: string;
  label: string;
  serviceId?: string;
}

export const PERMISSION_MODULES: PermissionModule[] = [
  { id: 'module_accueil', label: 'Accueil', serviceId: 'SRV-ACCUEIL' },
  { id: 'module_consultation', label: 'Consultation', serviceId: 'SRV-CONSULTATION' },
  { id: 'module_soins_infirmiers', label: 'Soins Infirmiers', serviceId: 'SRV-INFIRMIER' },
  { id: 'module_hospitalisation', label: 'Hospitalisation', serviceId: 'SRV-HOSPITALISATION' },
  { id: 'module_pharmacie', label: 'Pharmacie', serviceId: 'SRV-PHARMACIE' },
  { id: 'module_caisse', label: 'Caisse', serviceId: 'SRV-CAISSE' },
  { id: 'module_comptabilite', label: 'Comptabilité', serviceId: 'SRV-COMPTABILITE' },
  { id: 'module_urgence', label: 'Urgence', serviceId: 'SRV-URGENCES' },
  { id: 'module_laboratoire', label: 'Laboratoire', serviceId: 'SRV-LABO' },
  { id: 'module_imagerie', label: 'Imagerie', serviceId: 'SRV-IMAGERIE' },
  { id: 'module_maternite', label: 'Maternité', serviceId: 'SRV-MATERNITE' },
  { id: 'module_bloc', label: 'Bloc opératoire', serviceId: 'SRV-BLOC' }
];

export const MODULE_ACTIONS = [
  { id: 'read', label: 'Lecture seule' },
  { id: 'write', label: 'Créer/Modifier' },
  { id: 'delete', label: 'Supprimer' },
  { id: 'validate', label: 'Valider/Exporter' }
];

export const GLOBAL_PERMISSIONS = [
  { id: 'view_sensitive_data', label: 'Voir dossiers patients sensibles' },
  { id: 'prescribe_meds', label: 'Prescrire médicaments' },
  { id: 'manage_billing', label: 'Gérer facturation' },
  { id: 'access_reports', label: 'Accès rapports' },
  { id: 'full_admin', label: 'Administration complète' }
];
