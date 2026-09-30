import { addDays, dateInMonth, diffDays, formatDateLong, parts } from './dates';
import type { RecurringFlow } from './ledger';
import { formatEUR } from './money';
import type { ISODate, Minor, Transaction } from './types';

export interface ForecastEvent {
  date: ISODate;
  amount: Minor;
  category: string;
  source: 'recurrent_projete' | 'deja_programme' | 'echeance_contrat' | 'rappel';
  /** Libellé agrégé non sensible (contrat ou rappel de la banque), si disponible. */
  label?: string;
}

/** Échéances connues de la banque (ses propres contrats), fournies par le périmètre « échéances ». */
export interface KnownDeadlines {
  installments: { counterpartyId: string; amount: Minor; day: number; category: string; label: string }[];
  /** Montants à régulariser suite à un rappel (négatifs), à leur date limite. */
  notices: { date: ISODate; amount: Minor; label: string; category: string }[];
}

export interface ForecastResult {
  asOf: ISODate;
  horizonEnd: ISODate;
  openingBalance: Minor;
  points: { date: ISODate; balance: Minor }[];
  events: ForecastEvent[];
  minBalance: Minor;
  minDate: ISODate;
  firstNegativeDate: ISODate | null;
  /** Occurrences récurrentes non projetées car déjà comptabilisées ou programmées. */
  skippedAlreadyBooked: number;
  assumptions: string[];
}

/** Fenêtre (en jours) pour rapprocher une occurrence projetée d'une opération existante. */
export const MATCH_WINDOW_DAYS = 5;

/**
 * Méthode 1 — Projection des flux récurrents.
 * Solde quotidien sur `horizonDays` jours = solde d'ouverture + opérations programmées
 * + occurrences attendues des flux récurrents, sans double comptage.
 */
export function projectBalance(params: {
  openingBalance: Minor;
  flows: RecurringFlow[];
  /** Registre filtré (non sensible) servant au rapprochement et aux opérations programmées. */
  ledger: Transaction[];
  asOf: ISODate;
  horizonDays?: number;
  /** Échéancier des contrats et rappels : prioritaires sur les flux inférés de même contrepartie. */
  known?: KnownDeadlines;
}): ForecastResult {
  const { openingBalance, ledger, asOf } = params;
  const known = params.known ?? { installments: [], notices: [] };
  const contractCounterparties = new Set(known.installments.map((i) => i.counterpartyId));
  // Un flux inféré couvert par un échéancier contractuel n'est pas projeté une seconde fois.
  const flows = params.flows.filter((f) => !contractCounterparties.has(f.counterpartyId));
  const horizonDays = params.horizonDays ?? 30;
  const horizonEnd = addDays(asOf, horizonDays);
  const events: ForecastEvent[] = [];

  // Opérations déjà programmées dans la fenêtre : comptées une seule fois.
  for (const t of ledger) {
    if (t.status === 'scheduled' && t.date > asOf && t.date <= horizonEnd) {
      events.push({ date: t.date, amount: t.amount, category: t.category, source: 'deja_programme' });
    }
  }

  let skipped = 0;
  const start = parts(asOf);
  const monthly = (
    day: number,
    counterpartyId: string,
    amount: Minor,
    category: string,
    source: ForecastEvent['source'],
    label?: string,
  ) => {
    for (let offset = 0; offset <= Math.ceil(horizonDays / 28); offset++) {
      const total = start.y * 12 + (start.m - 1) + offset;
      const date = dateInMonth(Math.floor(total / 12), (total % 12) + 1, day);
      if (date <= asOf || date > horizonEnd) continue;
      // Évite le double comptage : une opération de la même contrepartie (comptabilisée ou
      // programmée) proche de la date attendue remplace l'occurrence projetée.
      const alreadyThere = ledger.some(
        (t) =>
          t.counterpartyId === counterpartyId &&
          Math.sign(t.amount) === Math.sign(amount) &&
          Math.abs(diffDays(t.date, date)) <= MATCH_WINDOW_DAYS,
      );
      if (alreadyThere) {
        skipped++;
        continue;
      }
      events.push({ date, amount, category, source, ...(label ? { label } : {}) });
    }
  };
  for (const flow of flows) monthly(flow.typicalDay, flow.counterpartyId, flow.lastAmount, flow.category, 'recurrent_projete');
  for (const i of known.installments) monthly(i.day, i.counterpartyId, i.amount, i.category, 'echeance_contrat', i.label);
  // Un rappel déjà échu est placé au lendemain : il reste dû.
  for (const n of known.notices) {
    const date = n.date > asOf ? n.date : addDays(asOf, 1);
    if (date <= horizonEnd) events.push({ date, amount: n.amount, category: n.category, source: 'rappel', label: n.label });
  }

  events.sort((a, b) => a.date.localeCompare(b.date) || a.amount - b.amount);

  const points: { date: ISODate; balance: Minor }[] = [];
  let balance = openingBalance;
  let minBalance = openingBalance;
  let minDate = asOf;
  let firstNegativeDate: ISODate | null = openingBalance < 0 ? asOf : null;
  points.push({ date: asOf, balance });
  for (let i = 1; i <= horizonDays; i++) {
    const day = addDays(asOf, i);
    for (const e of events) if (e.date === day) balance += e.amount;
    points.push({ date: day, balance });
    if (balance < minBalance) {
      minBalance = balance;
      minDate = day;
    }
    if (balance < 0 && firstNegativeDate === null) firstNegativeDate = day;
  }

  const assumptions = [
    `Solde de départ : ${formatEUR(openingBalance)} au ${formatDateLong(asOf)}.`,
    'Chaque flux récurrent est reconduit au même jour du mois avec son dernier montant connu.',
    `Une occurrence déjà comptabilisée ou programmée à ± ${MATCH_WINDOW_DAYS} jours n’est pas comptée deux fois.`,
    'Les échéances des crédits de la banque suivent leur échéancier contractuel ; un rappel est compté à sa date limite.',
    'Les dépenses variables (courses, loisirs…) ne sont pas projetées.',
    'Les opérations de catégories protégées ou non classées sont exclues de la projection.',
  ];

  return {
    asOf,
    horizonEnd,
    openingBalance,
    points,
    events,
    minBalance,
    minDate,
    firstNegativeDate,
    skippedAlreadyBooked: skipped,
    assumptions,
  };
}
