import { addDays, diffDays } from './dates';
import { sum } from './money';
import type { ISODate, Minor, Transaction } from './types';

export interface BaselineOptions {
  /** Période récente analysée. */
  recentDays: number;
  /** Période de référence, immédiatement antérieure. */
  baselineDays: number;
  /** Couverture minimale de la période de référence par l'historique client. */
  minBaselineCoverageDays: number;
}

export const DEFAULT_BASELINE: BaselineOptions = { recentDays: 60, baselineDays: 120, minBaselineCoverageDays: 90 };

export interface BaselineComparison {
  status: 'ok' | 'insufficient';
  /** Montant mensualisé (valeur absolue) sur la période récente. */
  recentMonthly: Minor;
  /** Montant mensualisé (valeur absolue) sur la période de référence. */
  baselineMonthly: Minor;
  /** Rapport récent / référence ; null si la référence est nulle. */
  ratio: number | null;
}

/**
 * Méthode 2 — Comparaison avec la référence propre au client.
 * Un historique insuffisant produit « insufficient », jamais une estimation confiante.
 */
export function compareToBaseline(
  sanitized: Transaction[],
  categories: string[],
  direction: 'debit' | 'credit',
  asOf: ISODate,
  historyStart: ISODate,
  opts: BaselineOptions = DEFAULT_BASELINE,
): BaselineComparison {
  const recentStart = addDays(asOf, -opts.recentDays + 1);
  const baselineEnd = addDays(recentStart, -1);
  const baselineStart = addDays(recentStart, -opts.baselineDays);
  const coveredDays = diffDays(historyStart < baselineStart ? baselineStart : historyStart, baselineEnd) + 1;

  const pick = (from: ISODate, to: ISODate) =>
    Math.abs(
      sum(
        sanitized
          .filter(
            (t) =>
              t.status === 'booked' &&
              t.date >= from &&
              t.date <= to &&
              categories.includes(t.category) &&
              (direction === 'debit' ? t.amount < 0 : t.amount > 0),
          )
          .map((t) => t.amount),
      ),
    );

  const recentMonthly = Math.round((pick(recentStart, asOf) * 30) / opts.recentDays);
  if (coveredDays < opts.minBaselineCoverageDays) {
    return { status: 'insufficient', recentMonthly, baselineMonthly: 0, ratio: null };
  }
  const baselineMonthly = Math.round((pick(baselineStart, baselineEnd) * 30) / Math.min(coveredDays, opts.baselineDays));
  return {
    status: 'ok',
    recentMonthly,
    baselineMonthly,
    ratio: baselineMonthly > 0 ? recentMonthly / baselineMonthly : null,
  };
}
