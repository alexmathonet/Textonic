import type { ForecastEvent } from './forecast';

/**
 * Priorité des paiements à venir : règle d'affichage déterministe et documentée,
 * fondée uniquement sur la nature du paiement (pas sur une inférence).
 * C'est une suggestion d'ordre, pas un conseil juridique.
 */
export type Priority = 'critique' | 'haute' | 'normale' | 'basse';

export const PRIORITY_RANK: Record<Priority, number> = { critique: 0, haute: 1, normale: 2, basse: 3 };

export const PRIORITY_LABELS: Record<Priority, string> = {
  critique: 'Critique',
  haute: 'Haute',
  normale: 'Normale',
  basse: 'Basse',
};

export const PRIORITY_REASONS: Record<Priority, string> = {
  critique: 'Dernier rappel : un nouvel impayé peut entraîner des frais et une procédure de recouvrement.',
  haute: 'Logement et crédits : un retard a des conséquences importantes.',
  normale: 'Assurances, énergie et télécoms : services essentiels à maintenir.',
  basse: 'Abonnements et épargne volontaire : souvent décalables en cas de tension.',
};

const HIGH = new Set(['credit_immo', 'loyer', 'credit_auto']);
const NORMAL = new Set(['assurance', 'energie', 'telecom']);

/** Priorité d'un paiement, ou null pour un revenu. */
export function paymentPriority(e: Pick<ForecastEvent, 'amount' | 'category' | 'source'>): Priority | null {
  if (e.amount >= 0) return null;
  if (e.source === 'rappel') return 'critique';
  if (HIGH.has(e.category)) return 'haute';
  if (NORMAL.has(e.category)) return 'normale';
  return 'basse';
}

/** Débits triés par priorité puis par date ; les revenus sont placés à la fin. */
export function sortByPriority<T extends Pick<ForecastEvent, 'amount' | 'category' | 'source' | 'date'>>(events: T[]): T[] {
  const rank = (e: T) => {
    const p = paymentPriority(e);
    return p === null ? 99 : PRIORITY_RANK[p];
  };
  return [...events].sort((a, b) => rank(a) - rank(b) || a.date.localeCompare(b.date));
}
