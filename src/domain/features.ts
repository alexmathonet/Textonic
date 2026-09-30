import { ALL_SCOPES } from './consent';
import { compareToBaseline, type BaselineComparison } from './baseline';
import type { EngineConfig } from './config';
import { addDays, diffDays } from './dates';
import { projectBalance, type ForecastResult, type KnownDeadlines } from './forecast';
import { balanceAt, detectRecurringFlows, type RecurringFlow } from './ledger';
import { median, sum } from './money';
import type {
  ConsentRecord,
  Contract,
  CustomerData,
  DeclaredIntention,
  DetectorId,
  ISODate,
  Minor,
  PaymentNotice,
  SavingsGoal,
  Scope,
  Transaction,
} from './types';

/* Paquets de caractéristiques, un par périmètre de consentement. */

export interface RecurringFeatures {
  historyDays: number;
  openingBalance: Minor;
  savingsBalance: Minor;
  flows: RecurringFlow[];
  /** Opérations filtrées (non sensibles) utiles au rapprochement de la projection. */
  forecastLedger: Transaction[];
}

export interface DeadlineFeatures {
  contracts: Contract[];
  /** Rappels en cours (échéance dans le futur ou depuis moins de 30 jours). */
  notices: PaymentNotice[];
}

export interface HabitsFeatures {
  historyDays: number;
  home: BaselineComparison;
  auto: BaselineComparison;
  savings: BaselineComparison;
  mobility: BaselineComparison;
  income: BaselineComparison;
  /** Virements internationaux (montants agrégés mensualisés). */
  international: BaselineComparison;
  consularFeesRecent: boolean;
  movingServiceRecent: boolean;
  realEstateFeesRecent: boolean;
  /** null = historique insuffisant pour juger de la nouveauté. */
  newUtilityPayeeRecent: boolean | null;
  newIncomeSourceRecent: boolean | null;
}

export interface IntentionFeatures {
  intentions: DeclaredIntention[];
}

export interface GoalFeatures {
  goals: SavingsGoal[];
}

export interface ExternalFeatures {
  accountCount: number;
  aggregateBalance: Minor;
  aggregateMonthlyInflow: Minor;
}

export interface FeatureMap {
  'internal.recurring': RecurringFeatures;
  'internal.deadlines': DeadlineFeatures;
  'habits.nonsensitive': HabitsFeatures;
  'intentions.declared': IntentionFeatures;
  'goals.declared': GoalFeatures;
  'external.accounts': ExternalFeatures;
}

export type ScopedFeatures = Partial<FeatureMap>;

export interface ExtractionContext {
  data: CustomerData;
  /** Registre DÉJÀ filtré : aucune catégorie protégée ou non classée. */
  sanitized: Transaction[];
  asOf: ISODate;
  consent: ConsentRecord;
  config: EngineConfig;
}

function historyDays(ctx: ExtractionContext): number {
  return Math.max(0, diffDays(ctx.data.customer.clientSince, ctx.asOf));
}

function firstSeen(txs: Transaction[], predicate: (t: Transaction) => boolean): Map<string, ISODate> {
  const out = new Map<string, ISODate>();
  for (const t of txs) {
    if (!predicate(t)) continue;
    const prev = out.get(t.counterpartyId);
    if (!prev || t.date < prev) out.set(t.counterpartyId, t.date);
  }
  return out;
}

/**
 * Revenus professionnels : comparaison par occurrence (médiane des 2 derniers versements
 * contre médiane des précédents), ce qui évite l'effet de fenêtre des versements mensuels.
 */
function incomeComparison(booked: Transaction[]): BaselineComparison {
  const credits = booked.filter((t) => t.category === 'salaire' && t.amount > 0).map((t) => t.amount);
  if (credits.length < 4) return { status: 'insufficient', recentMonthly: 0, baselineMonthly: 0, ratio: null };
  const recent = median(credits.slice(-2));
  const prior = median(credits.slice(0, -2));
  return { status: 'ok', recentMonthly: recent, baselineMonthly: prior, ratio: prior > 0 ? recent / prior : null };
}

/** Extracteurs : chacun ne lit que ce que son périmètre autorise. */
export const EXTRACTORS: { [S in Scope]: (ctx: ExtractionContext) => FeatureMap[S] } = {
  'internal.recurring': (ctx) => {
    const booked = ctx.sanitized.filter((t) => t.date <= ctx.asOf || t.status === 'scheduled');
    const flows = detectRecurringFlows(booked, ctx.asOf);
    const openingBalance = balanceAt(ctx.data.initialBalance, ctx.data.ledger, ctx.asOf);
    return {
      historyDays: historyDays(ctx),
      openingBalance,
      savingsBalance: ctx.data.customer.savingsBalance,
      flows,
      forecastLedger: booked,
    };
  },
  'internal.deadlines': (ctx) => ({
    contracts: ctx.data.customer.contracts.map((c) => ({ ...c })),
    notices: (ctx.data.customer.notices ?? []).filter((n) => n.dueDate >= addDays(ctx.asOf, -30)).map((n) => ({ ...n })),
  }),
  'habits.nonsensitive': (ctx) => {
    const booked = ctx.sanitized.filter((t) => t.status === 'booked' && t.date <= ctx.asOf);
    const start = ctx.data.customer.clientSince;
    const cmp = (cats: string[], dir: 'debit' | 'credit') => compareToBaseline(booked, cats, dir, ctx.asOf, start);
    const recentFrom = addDays(ctx.asOf, -ctx.config.recentEventDays);
    const hist = historyDays(ctx);
    const noveltyKnown = hist >= ctx.config.minHistoryForNoveltyDays;

    const utilityFirst = firstSeen(booked, (t) => (t.category === 'energie' || t.category === 'telecom') && t.amount < 0);
    const incomeFirst = firstSeen(booked, (t) => t.category === 'salaire' && t.amount > 0);

    return {
      historyDays: hist,
      home: cmp(['bricolage', 'ameublement'], 'debit'),
      auto: cmp(['automobile'], 'debit'),
      savings: cmp(['epargne_virement'], 'debit'),
      mobility: cmp(['transport', 'carburant'], 'debit'),
      income: incomeComparison(booked),
      international: cmp(['virement_international'], 'debit'),
      consularFeesRecent: booked.some(
        (t) => t.category === 'frais_consulaires' && t.date >= addDays(ctx.asOf, -ctx.config.detectors.expatriation.consularWindowDays),
      ),
      movingServiceRecent: booked.some((t) => t.category === 'services_demenagement' && t.date >= recentFrom),
      realEstateFeesRecent: booked.some((t) => t.category === 'immobilier_frais' && t.date >= addDays(ctx.asOf, -90)),
      newUtilityPayeeRecent: noveltyKnown ? [...utilityFirst.values()].some((d) => d >= recentFrom) : null,
      newIncomeSourceRecent: noveltyKnown ? [...incomeFirst.values()].some((d) => d >= recentFrom) : null,
    };
  },
  'intentions.declared': (ctx) => ({ intentions: ctx.data.intentions.map((i) => ({ ...i })) }),
  'goals.declared': (ctx) => ({ goals: ctx.data.goals.map((g) => ({ ...g })) }),
  'external.accounts': (ctx) => {
    const ids = new Set(ctx.consent.externalAuthorization?.accountIds ?? []);
    const accounts = ctx.data.customer.externalAccounts.filter((a) => ids.has(a.id) && a.available);
    return {
      accountCount: accounts.length,
      aggregateBalance: sum(accounts.map((a) => a.balance)),
      aggregateMonthlyInflow: sum(accounts.map((a) => a.monthlyNetInflow)),
    };
  },
};

/** Échéancier et rappels des contrats de la banque, au format attendu par la projection. */
export function knownDeadlines(d: DeadlineFeatures | undefined): KnownDeadlines {
  if (!d) return { installments: [], notices: [] };
  const byId = new Map(d.contracts.map((c) => [c.id, c]));
  return {
    installments: d.contracts
      .filter((c) => c.installment)
      .map((c) => ({ ...c.installment!, category: c.kind, label: c.label })),
    notices: d.notices.map((n) => ({ date: n.dueDate, amount: -n.amountDue, label: n.label, category: byId.get(n.contractId)?.kind ?? 'credit_immo' })),
  };
}

/**
 * Projection du solde : flux récurrents (obligatoire) et, si ce périmètre est autorisé,
 * échéances connues des contrats de la banque.
 */
export function forecastFor(r: RecurringFeatures, d: DeadlineFeatures | undefined, asOf: ISODate, horizonDays: number): ForecastResult {
  return projectBalance({ openingBalance: r.openingBalance, flows: r.flows, ledger: r.forecastLedger, asOf, horizonDays, known: knownDeadlines(d) });
}

/**
 * Cache d'extraction pour une exécution : un périmètre n'est extrait qu'au premier accès
 * autorisé. Un périmètre non autorisé n'est JAMAIS extrait.
 */
export class FeatureExtractor {
  readonly extracted = new Set<Scope>();
  private cache = new Map<Scope, unknown>();
  constructor(
    private ctx: ExtractionContext,
    private permitted: Set<Scope>,
  ) {}

  get<S extends Scope>(scope: S): FeatureMap[S] {
    if (!this.permitted.has(scope)) {
      throw new Error(`Extraction refusée : périmètre ${scope} non autorisé.`);
    }
    if (!this.cache.has(scope)) {
      this.cache.set(scope, EXTRACTORS[scope](this.ctx));
      this.extracted.add(scope);
    }
    return this.cache.get(scope) as FeatureMap[S];
  }
}

/**
 * Vue restreinte remise à un détecteur : seuls les périmètres accordés sont lisibles.
 * Toute tentative de lecture d'un autre périmètre est journalisée et renvoie undefined.
 */
export function gatedFeatures(
  detectorId: DetectorId,
  granted: Set<Scope>,
  extractor: FeatureExtractor,
  onForbidden: (e: { detectorId: DetectorId; scope: Scope }) => void,
): ScopedFeatures {
  return new Proxy({} as ScopedFeatures, {
    get(_t, prop) {
      if (typeof prop !== 'string' || !(ALL_SCOPES as string[]).includes(prop)) return undefined;
      const scope = prop as Scope;
      if (!granted.has(scope)) {
        onForbidden({ detectorId, scope });
        return undefined;
      }
      return extractor.get(scope);
    },
    has(_t, prop) {
      return typeof prop === 'string' && granted.has(prop as Scope);
    },
    ownKeys() {
      return [...granted];
    },
    getOwnPropertyDescriptor(_t, prop) {
      if (typeof prop === 'string' && granted.has(prop as Scope)) {
        return { enumerable: true, configurable: true, value: extractor.get(prop as Scope) };
      }
      return undefined;
    },
  });
}
