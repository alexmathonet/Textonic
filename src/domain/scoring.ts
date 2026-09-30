import type { DetectionStatus, SignalResult } from './types';

export interface CombinationRule {
  threshold: number;
  /** Nombre minimal de signaux comportementaux indépendants en l'absence d'intention déclarée. */
  minIndependentSignals: number;
}

/**
 * Méthode 3 — Combinaison de signaux autorisés.
 *
 * Score indicatif = somme des poids des signaux présents, plafonnée à 1.
 * Ce n'est PAS une probabilité calibrée statistiquement.
 *
 * Règle d'événement de vie : détecté si score ≥ seuil ET (intention déclarée forte OU
 * au moins `minIndependentSignals` signaux présents). Un achat isolé ne suffit jamais.
 * Si le seuil n'est pas atteint et qu'un signal de référence manque d'historique,
 * le statut est « preuves insuffisantes ».
 */
export function combineSignals(signals: SignalResult[], rule: CombinationRule): { score: number; status: DetectionStatus } {
  const present = signals.filter((s) => s.state === 'present');
  const score = Math.min(1, Math.round(present.reduce((a, s) => a + s.weight, 0) * 100) / 100);
  const strong = present.some((s) => s.strong);
  const enoughSignals = strong || present.length >= rule.minIndependentSignals;
  if (score >= rule.threshold && enoughSignals) return { score, status: 'detected' };
  if (signals.some((s) => s.state === 'insufficient')) return { score, status: 'insufficient_evidence' };
  return { score, status: 'not_detected' };
}
