import type { Category, Transaction } from './types';

/** Catégories protégées : bloquées AVANT toute extraction de caractéristiques ou analyse. */
export const PROTECTED_CATEGORIES: ReadonlySet<string> = new Set<Category>(['sante', 'religion', 'syndicat', 'politique']);

/**
 * Liste blanche des catégories classées comme non sensibles.
 * Toute catégorie absente (dont « inconnu ») est exclue du profilage comportemental.
 */
export const NONSENSITIVE_CATEGORIES: ReadonlySet<string> = new Set<Category>([
  'salaire',
  'loyer',
  'energie',
  'telecom',
  'assurance',
  'credit_auto',
  'credit_immo',
  'abonnement_sport',
  'abonnement_media',
  'courses',
  'restauration',
  'transport',
  'carburant',
  'bricolage',
  'ameublement',
  'services_demenagement',
  'automobile',
  'immobilier_frais',
  'epargne_virement',
  'loisirs',
  'virement_international',
  'frais_consulaires',
]);

export const CATEGORY_LABELS: Record<string, string> = {
  salaire: 'Revenus professionnels',
  loyer: 'Loyer',
  energie: 'Énergie',
  telecom: 'Télécommunications',
  assurance: 'Assurance',
  credit_auto: 'Crédit auto',
  credit_immo: 'Crédit immobilier',
  abonnement_sport: 'Abonnement sport',
  abonnement_media: 'Abonnement médias',
  courses: 'Courses',
  restauration: 'Restauration',
  transport: 'Transport',
  carburant: 'Carburant',
  bricolage: 'Bricolage',
  ameublement: 'Ameublement',
  services_demenagement: 'Services de déménagement',
  automobile: 'Automobile',
  immobilier_frais: 'Frais immobiliers',
  epargne_virement: 'Virement d’épargne',
  loisirs: 'Loisirs',
  virement_international: 'Virement international',
  frais_consulaires: 'Frais consulaires et de visa',
};

export function isAllowedForAnalysis(category: string): boolean {
  return NONSENSITIVE_CATEGORIES.has(category) && !PROTECTED_CATEGORIES.has(category);
}

/**
 * Filtre le registre avant analyse. Retourne uniquement les opérations classées non sensibles
 * et le NOMBRE total d'exclusions (sans ventilation par catégorie, pour ne rien révéler).
 */
export function sanitizeLedger(ledger: Transaction[]): { allowed: Transaction[]; excludedCount: number } {
  const allowed = ledger.filter((t) => isAllowedForAnalysis(t.category));
  return { allowed, excludedCount: ledger.length - allowed.length };
}

export function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? 'Autre';
}

/** Termes indiquant une catégorie protégée dans un texte libre saisi par le client. */
const PROTECTED_TERMS = [
  'sante', 'santé', 'medical', 'médical', 'hopital', 'hôpital', 'clinique', 'traitement', 'maladie',
  'eglise', 'église', 'mosquee', 'mosquée', 'synagogue', 'temple', 'religion', 'pelerinage', 'pèlerinage',
  'syndicat', 'syndical', 'parti', 'politique', 'campagne electorale', 'campagne électorale',
];

/** Remplace un libellé libre par une mention neutre s'il évoque une catégorie protégée. */
export function redactFreeText(text: string): string {
  const lower = text.toLowerCase();
  return PROTECTED_TERMS.some((t) => new RegExp(`(?<!\\p{L})${t}(?!\\p{L})`, 'u').test(lower)) ? 'Objectif personnel' : text;
}
