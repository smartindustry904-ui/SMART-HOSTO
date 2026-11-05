/**
 * Laboratoire Module - Lifecycle Status Helpers
 * Enforces strict stage-to-status isolation across the lab workflow.
 * 
 * Stage 1: Prélèvements -> 'EN_ATTENTE' (Waiting for sample)
 * Stage 2: Saisie & Analyse -> 'PRELEVEMENT_FAIT' (Sample drawn, awaiting result entry)
 * Stage 3: Résultats Publiés / Historique -> 'TERMINE' (Completed & Published)
 */

export type LabLifecycleStage = 'EN_ATTENTE' | 'PRELEVEMENT_FAIT' | 'TERMINE';

/**
 * Checks whether an analysis is currently at Stage 3: Résultats Publiés / Historique
 * Strictly matching 'TERMINE' / 'terminé' / 'validé' / 'publié'.
 */
export const isStatusTermine = (status?: string | null, statut?: string | null): boolean => {
  const s = (status || statut || '').toLowerCase().trim().replace(/_/g, ' ');
  return s === 'terminé' || s === 'termine' || s === 'validé' || s === 'valide' || s === 'publié' || s === 'publie' || s === 'completed';
};

/**
 * Checks whether an analysis is currently at Stage 2: Saisie & Analyse
 * Strictly matching 'PRELEVEMENT_FAIT' / 'prélèvement fait' (or legacy 'en cours' / 'patient appelé').
 * The instant it is marked finished/published, it must NOT match.
 */
export const isStatusPrelevementFait = (status?: string | null, statut?: string | null): boolean => {
  if (isStatusTermine(status, statut)) return false;
  const s = (status || statut || '').toLowerCase().trim().replace(/_/g, ' ');
  return s === 'prélèvement fait' || s === 'prelevement fait' || s === 'en cours' || s === 'patient appelé';
};

/**
 * Checks whether an analysis is currently at Stage 1: Prélèvements
 * Strictly matching 'EN_ATTENTE' / 'en attente'.
 * The instant a sample is marked drawn or completed, it must NOT match.
 */
export const isStatusEnAttente = (status?: string | null, statut?: string | null): boolean => {
  if (isStatusTermine(status, statut) || isStatusPrelevementFait(status, statut)) return false;
  const s = (status || statut || '').toLowerCase().trim().replace(/_/g, ' ');
  return s === 'en attente' || s === 'pending' || s === '';
};
