import { diffDays, monthKey, parts } from './dates';
import { median, sum } from './money';
import type { ISODate, Minor, Transaction } from './types';

export interface RecurringFlow {
  /** Clé interne opaque (utilisée uniquement pendant le calcul, jamais stockée). */
  key: string;
  counterpartyId: string;
  category: string;
  direction: 'credit' | 'debit';
  typicalDay: number;
  /** Montants signés, du plus ancien au plus récent. */
  amounts: Minor[];
  dates: ISODate[];
  lastAmount: Minor;
  /** Médiane des occurrences précédant la dernière. */
  priorMedian: Minor;
}

export interface RecurringDetectionOptions {
  minMonths: number;
  maxDaySpread: number;
  /** Tolérance d'écart des montants antérieurs autour de leur médiane. */
  amountTolerance: number;
  /** La dernière occurrence doit dater de moins de N jours pour que le flux soit actif. */
  activeWithinDays: number;
}

export const DEFAULT_RECURRING_OPTIONS: RecurringDetectionOptions = {
  minMonths: 3,
  maxDaySpread: 4,
  amountTolerance: 0.1,
  activeWithinDays: 40,
};

/** Solde du compte à une date (registre complet, y compris opérations exclues de l'analyse). */
export function balanceAt(initialBalance: Minor, ledger: Transaction[], date: ISODate): Minor {
  return initialBalance + sum(ledger.filter((t) => t.status === 'booked' && t.date <= date).map((t) => t.amount));
}

/**
 * Détecte les flux récurrents mensuels à partir d'opérations DÉJÀ filtrées (non sensibles).
 * Critères : même contrepartie et même sens, au moins `minMonths` mois distincts,
 * jours du mois proches, montants antérieurs stables.
 */
export function detectRecurringFlows(
  sanitized: Transaction[],
  asOf: ISODate,
  opts: RecurringDetectionOptions = DEFAULT_RECURRING_OPTIONS,
): RecurringFlow[] {
  const groups = new Map<string, Transaction[]>();
  for (const t of sanitized) {
    if (t.status !== 'booked' || t.date > asOf) continue;
    const key = `${t.counterpartyId}|${t.amount < 0 ? 'D' : 'C'}`;
    const g = groups.get(key) ?? [];
    g.push(t);
    groups.set(key, g);
  }

  const flows: RecurringFlow[] = [];
  for (const [key, txs] of groups) {
    txs.sort((a, b) => a.date.localeCompare(b.date));
    const months = new Set(txs.map((t) => monthKey(t.date)));
    if (months.size < opts.minMonths || months.size !== txs.length) continue;
    const days = txs.map((t) => parts(t.date).d);
    if (Math.max(...days) - Math.min(...days) > opts.maxDaySpread) continue;
    const last = txs[txs.length - 1];
    if (diffDays(last.date, asOf) > opts.activeWithinDays) continue;
    const prior = txs.slice(0, -1).map((t) => t.amount);
    const priorMedian = median(prior);
    const stable = prior.every((a) => Math.abs(a - priorMedian) <= Math.abs(priorMedian) * opts.amountTolerance);
    if (!stable) continue;
    flows.push({
      key,
      counterpartyId: last.counterpartyId,
      category: last.category,
      direction: last.amount < 0 ? 'debit' : 'credit',
      typicalDay: median(days),
      amounts: txs.map((t) => t.amount),
      dates: txs.map((t) => t.date),
      lastAmount: last.amount,
      priorMedian,
    });
  }
  return flows.sort((a, b) => a.typicalDay - b.typicalDay);
}
