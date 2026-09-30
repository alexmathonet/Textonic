import { addDays, dateInMonth, daysInMonth, monthsBetween } from '../domain/dates';
import { sum } from '../domain/money';
import type { CustomerData, Customer, DeclaredIntention, ISODate, Minor, SavingsGoal, Transaction } from '../domain/types';

/** PRNG déterministe (mulberry32) : les fixtures sont reproductibles à l'identique. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export interface RecurringSpec {
  counterpartyId: string;
  label: string;
  category: string;
  /** Montant signé en centimes. */
  amount: Minor;
  day: number;
  from?: ISODate;
  to?: ISODate;
  /** Montant spécifique pour un mois donné (clé `YYYY-MM`). */
  overrides?: Record<string, Minor>;
  /** Mois (`YYYY-MM`) sans prélèvement, par exemple une échéance impayée. */
  skip?: string[];
  /** Ordre permanent : les occurrences des N prochains jours apparaissent déjà comme programmées. */
  scheduledAheadDays?: number;
}

export interface VariableSpec {
  category: string;
  label: string;
  counterpartyPrefix: string;
  /** Nombre moyen d'opérations par mois (la partie fractionnaire est tirée au sort). */
  perMonth: number;
  /** Bornes du montant en centimes (valeurs positives ; débit par défaut). */
  min: Minor;
  max: Minor;
  from?: ISODate;
  to?: ISODate;
  credit?: boolean;
  pool?: number;
}

export interface OneOffSpec {
  date: ISODate;
  amount: Minor;
  category: string;
  label: string;
  counterpartyId: string;
}

export interface LedgerSpec {
  customerId: string;
  seed: string;
  start: ISODate;
  /** Solde connu à la date d'ancrage : fixe le solde initial quelle que soit la date de démo. */
  anchorDate: ISODate;
  anchorBalance: Minor;
  recurring: RecurringSpec[];
  variable: VariableSpec[];
  oneOffs: OneOffSpec[];
}

/**
 * Génère le registre jusqu'à `asOf` (opérations comptabilisées) et les ordres permanents
 * des jours suivants (opérations programmées). Déterministe : chaque mois a sa propre graine,
 * donc avancer l'horloge de démo n'altère pas le passé.
 */
export function buildLedger(spec: LedgerSpec, asOf: ISODate): { transactions: Transaction[]; initialBalance: Minor } {
  const until = asOf > spec.anchorDate ? asOf : spec.anchorDate;
  const raw: Omit<Transaction, 'id' | 'status'>[] = [];
  const scheduled: Omit<Transaction, 'id' | 'status'>[] = [];
  const months = monthsBetween(spec.start, addDays(until, 45));

  for (const r of spec.recurring) {
    for (const { y, m } of months) {
      const date = dateInMonth(y, m, r.day);
      if (date < spec.start || (r.from && date < r.from) || (r.to && date > r.to)) continue;
      if (r.skip?.includes(date.slice(0, 7))) continue;
      const amount = r.overrides?.[date.slice(0, 7)] ?? r.amount;
      const tx = { date, amount, category: r.category, label: r.label, counterpartyId: r.counterpartyId };
      if (date <= until) raw.push(tx);
      else if (r.scheduledAheadDays && date <= addDays(asOf, r.scheduledAheadDays)) scheduled.push(tx);
    }
  }

  spec.variable.forEach((v, idx) => {
    for (const { y, m } of months) {
      const key = `${y}-${String(m).padStart(2, '0')}`;
      const rng = mulberry32(hash(`${spec.seed}:${idx}:${key}`));
      const whole = Math.floor(v.perMonth);
      const count = whole + (rng() < v.perMonth - whole ? 1 : 0);
      for (let i = 0; i < count; i++) {
        const date = dateInMonth(y, m, 1 + Math.floor(rng() * daysInMonth(y, m)));
        const magnitude = v.min + Math.floor(rng() * (v.max - v.min + 1));
        const cp = `${v.counterpartyPrefix}_${1 + Math.floor(rng() * (v.pool ?? 6))}`;
        if (date < spec.start || date > until || (v.from && date < v.from) || (v.to && date > v.to)) continue;
        raw.push({ date, amount: v.credit ? magnitude : -magnitude, category: v.category, label: v.label, counterpartyId: cp });
      }
    }
  });

  for (const o of spec.oneOffs) {
    if (o.date < spec.start) continue;
    if (o.date <= until) raw.push({ ...o });
  }

  const initialBalance = spec.anchorBalance - sum(raw.filter((t) => t.date <= spec.anchorDate).map((t) => t.amount));

  const sortTx = (a: Omit<Transaction, 'id' | 'status'>, b: Omit<Transaction, 'id' | 'status'>) =>
    a.date.localeCompare(b.date) || a.label.localeCompare(b.label) || a.amount - b.amount;

  const booked = raw.filter((t) => t.date <= asOf).sort(sortTx);
  // Les opérations futures au-delà de `asOf` générées pour l'ancrage ne sont pas exposées.
  const upcoming = [
    ...scheduled,
    ...raw.filter((t) => t.date > asOf && spec.recurring.some((r) => r.scheduledAheadDays && r.counterpartyId === t.counterpartyId && t.date <= addDays(asOf, r.scheduledAheadDays))),
  ].sort(sortTx);

  const transactions: Transaction[] = [
    ...booked.map((t, i) => ({ ...t, id: `${spec.customerId}-b${i}`, status: 'booked' as const })),
    ...dedupe(upcoming).map((t, i) => ({ ...t, id: `${spec.customerId}-s${i}`, status: 'scheduled' as const })),
  ];
  return { transactions, initialBalance };
}

function dedupe<T extends { date: string; counterpartyId: string }>(txs: T[]): T[] {
  const seen = new Set<string>();
  return txs.filter((t) => {
    const k = `${t.date}|${t.counterpartyId}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export interface PersonaFixture {
  id: string;
  name: string;
  tagline: string;
  description: string;
  referenceDate: ISODate;
  customer: Customer;
  ledgerSpec: LedgerSpec;
  intentions: DeclaredIntention[];
  goals: SavingsGoal[];
}

export function buildCustomerData(p: PersonaFixture, asOf: ISODate, overrides?: Partial<Pick<CustomerData, 'intentions' | 'goals'>>): CustomerData {
  const { transactions, initialBalance } = buildLedger(p.ledgerSpec, asOf);
  return {
    customer: p.customer,
    initialBalance,
    ledger: transactions,
    intentions: overrides?.intentions ?? p.intentions,
    goals: overrides?.goals ?? p.goals,
  };
}
