import type { BaselineComparison } from './baseline';
import type { EngineConfig, LifeEventConfig } from './config';
import { addMonths, diffDays, formatDateLong } from './dates';
import { forecastFor, type ScopedFeatures } from './features';
import { paymentPriority, PRIORITY_LABELS, PRIORITY_RANK } from './priority';
import { formatEUR, formatPct } from './money';
import { combineSignals } from './scoring';
import { categoryLabel, redactFreeText } from './sensitive';
import type { DetectorId, DetectorOutput, Evidence, ISODate, IntentionType, Scope, SignalResult } from './types';

export interface DetectorContext {
  asOf: ISODate;
  config: EngineConfig;
}

export interface Detector {
  id: DetectorId;
  label: string;
  description: string;
  /** Tous ces périmètres doivent être autorisés, sinon le détecteur ne s'exécute pas. */
  requiredScopes: Scope[];
  /** Utilisés uniquement s'ils sont autorisés. */
  optionalScopes: Scope[];
  run(f: ScopedFeatures, ctx: DetectorContext): DetectorOutput;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function insufficient(threshold: number, signals: SignalResult[], reason: string): DetectorOutput {
  return {
    status: 'insufficient_evidence',
    score: 0,
    threshold,
    signals,
    evidence: [{ label: 'Historique', value: reason }],
    assumptions: ['Sans historique suffisant, aucune conclusion n’est tirée.'],
    facts: {},
  };
}

function comparisonEvidence(label: string, c: BaselineComparison): Evidence {
  if (c.status === 'insufficient') return { label, value: 'historique insuffisant' };
  return { label, value: `${formatEUR(c.recentMonthly)}/mois récemment, contre ${formatEUR(c.baselineMonthly)}/mois auparavant` };
}

/** Signal fondé sur une hausse relative par rapport à la référence du client. */
function increaseSignal(
  id: string,
  categoryLabelText: string,
  c: BaselineComparison,
  weight: number,
  minRatio: number,
  minMonthly = 0,
): SignalResult {
  const base = { id, categoryLabel: categoryLabelText, scope: 'habits.nonsensitive' as Scope, weight };
  if (c.status === 'insufficient') return { ...base, state: 'insufficient' };
  const rises = c.baselineMonthly === 0 ? c.recentMonthly > 0 : (c.ratio ?? 0) >= minRatio;
  return { ...base, state: rises && c.recentMonthly >= minMonthly ? 'present' : 'absent' };
}

function declaredSignal(f: ScopedFeatures, type: IntentionType, weight: number): SignalResult | null {
  // `in` ne déclenche pas de lecture : on vérifie l'autorisation sans accéder aux données.
  if (!('intentions.declared' in f)) return null;
  const has = f['intentions.declared']!.intentions.some((i) => i.type === type);
  return {
    id: 'declared',
    categoryLabel: 'Intention déclarée dans l’application',
    scope: 'intentions.declared',
    weight,
    strong: true,
    state: has ? 'present' : 'absent',
  };
}

function lifeEventOutput(
  signals: (SignalResult | null)[],
  rule: LifeEventConfig,
  evidence: Evidence[],
  assumptions: string[],
): DetectorOutput {
  const s = signals.filter((x): x is SignalResult => x !== null);
  const { score, status } = combineSignals(s, rule);
  return {
    status,
    score,
    threshold: rule.threshold,
    signals: s,
    evidence: [
      { label: 'Signaux concordants', value: `${s.filter((x) => x.state === 'present').length} sur ${s.length} évalués` },
      ...evidence,
    ],
    assumptions: [
      'Score indicatif = somme des poids des signaux présents (non calibré statistiquement).',
      `Seuil : ${rule.threshold.toFixed(2).replace('.', ',')} et au moins ${rule.minIndependentSignals} signaux indépendants, sauf intention déclarée.`,
      'Il s’agit d’une hypothèse à confirmer, jamais d’un fait établi.',
      ...assumptions,
    ],
    facts: {},
  };
}

export const DETECTORS: Detector[] = [
  {
    id: 'overdraft',
    label: 'Découvert à venir',
    description: 'Projette votre solde sur 30 jours à partir de vos flux récurrents.',
    requiredScopes: ['internal.recurring'],
    optionalScopes: ['internal.deadlines'],
    run(f, { asOf, config }): DetectorOutput {
      const c = config.detectors.overdraft;
      const r = f['internal.recurring']!;
      const deadlines = 'internal.deadlines' in f ? f['internal.deadlines'] : undefined;
      const signal: SignalResult = {
        id: 'forecast',
        categoryLabel: 'Flux récurrents internes (revenus et prélèvements habituels)',
        scope: 'internal.recurring',
        weight: 1,
        state: 'present',
      };
      if (r.historyDays < c.minHistoryDays) {
        return insufficient(c.threshold, [{ ...signal, state: 'insufficient' }], `${r.historyDays} jours d’historique (minimum ${c.minHistoryDays})`);
      }
      const fc = forecastFor(r, deadlines, asOf, c.horizonDays);
      let score = 0;
      if (fc.minBalance < 0) score = round2(0.6 + 0.4 * Math.min(1, -fc.minBalance / c.severityScaleMinor));
      else if (fc.minBalance < c.bufferMinor) score = 0.3;
      const nextIncome = fc.events.find((e) => e.amount > 0 && e.category === 'salaire');
      // Ordre de priorité des paiements qui précèdent le point bas.
      const beforeLow = fc.events.filter((e) => e.date <= fc.minDate && e.amount < 0);
      const ranked = [...beforeLow].sort(
        (a, b) => PRIORITY_RANK[paymentPriority(a)!] - PRIORITY_RANK[paymentPriority(b)!] || a.date.localeCompare(b.date),
      );
      const first = ranked[0];
      const deferrable = beforeLow.filter((e) => paymentPriority(e) === 'basse').reduce((a, e) => a - e.amount, 0);
      const firstLabel = first ? (first.label ?? categoryLabel(first.category)) : '';
      return {
        status: score >= c.threshold ? 'detected' : 'not_detected',
        score,
        threshold: c.threshold,
        signals: [{ ...signal, state: score > 0 ? 'present' : 'absent' }],
        evidence: [
          { label: 'Solde actuel', value: formatEUR(fc.openingBalance) },
          { label: 'Point bas projeté', value: `${formatEUR(fc.minBalance)} le ${formatDateLong(fc.minDate)}` },
          { label: 'Prochain revenu récurrent attendu', value: nextIncome ? formatDateLong(nextIncome.date) : 'aucun dans la fenêtre' },
          { label: 'Flux récurrents pris en compte', value: String(r.flows.length) },
          { label: 'Occurrences déjà programmées (non dupliquées)', value: String(fc.skippedAlreadyBooked) },
          ...(first
            ? [{ label: 'À couvrir en priorité', value: `${firstLabel} — ${formatEUR(-first.amount)} le ${formatDateLong(first.date)} (priorité ${PRIORITY_LABELS[paymentPriority(first)!].toLowerCase()})` }]
            : []),
        ],
        assumptions: [
          ...fc.assumptions,
          'Priorité : rappels, puis logement et crédits, puis assurances et énergie, puis abonnements et épargne. Suggestion d’ordre, pas un conseil juridique.',
        ],
        facts: {
          minBalance: fc.minBalance,
          minDate: fc.minDate,
          openingBalance: fc.openingBalance,
          nextIncomeDate: nextIncome?.date ?? '',
          priorityLabel: firstLabel,
          priorityAmount: first ? -first.amount : 0,
          priorityDate: first?.date ?? '',
          priorityLevel: first ? paymentPriority(first)! : '',
          deferrableAmount: deferrable,
        },
      };
    },
  },
  {
    id: 'contract_expiry',
    label: 'Contrat arrivant à échéance',
    description: 'Repère les contrats connus de la banque qui arrivent à échéance.',
    requiredScopes: ['internal.deadlines'],
    optionalScopes: [],
    run(f, { asOf, config }): DetectorOutput {
      const c = config.detectors.contract_expiry;
      const contracts = f['internal.deadlines']!.contracts
        .map((k) => ({ k, daysLeft: diffDays(asOf, k.endDate) }))
        .filter((x) => x.daysLeft >= 0)
        .sort((a, b) => a.daysLeft - b.daysLeft);
      const next = contracts[0];
      const within = next && next.daysLeft <= c.horizonDays;
      const score = within ? round2(1 - (0.4 * next.daysLeft) / c.horizonDays) : 0;
      return {
        status: score >= c.threshold ? 'detected' : 'not_detected',
        score,
        threshold: c.threshold,
        signals: [
          {
            id: 'deadline',
            categoryLabel: 'Échéances connues de vos contrats',
            scope: 'internal.deadlines',
            weight: 1,
            state: within ? 'present' : 'absent',
          },
        ],
        evidence: next
          ? [
              { label: 'Contrat', value: next.k.label },
              { label: 'Échéance', value: `${formatDateLong(next.k.endDate)} (dans ${next.daysLeft} jours)` },
            ]
          : [{ label: 'Contrats', value: 'aucune échéance future connue' }],
        assumptions: [`Fenêtre d’alerte : ${c.horizonDays} jours avant l’échéance.`],
        facts: next ? { contractLabel: next.k.label, endDate: next.k.endDate, daysLeft: next.daysLeft } : {},
      };
    },
  },
  {
    id: 'recurring_increase',
    label: 'Hausse d’un prélèvement récurrent',
    description: 'Compare le dernier montant d’un prélèvement récurrent à ses montants habituels.',
    requiredScopes: ['internal.recurring'],
    optionalScopes: [],
    run(f, { config }): DetectorOutput {
      const c = config.detectors.recurring_increase;
      const r = f['internal.recurring']!;
      const debits = r.flows.filter((fl) => fl.direction === 'debit' && fl.amounts.length >= c.minOccurrences);
      const signal: SignalResult = {
        id: 'increase',
        categoryLabel: 'Flux récurrents internes (prélèvements habituels)',
        scope: 'internal.recurring',
        weight: 1,
        state: 'absent',
      };
      if (debits.length === 0) {
        return insufficient(c.threshold, [{ ...signal, state: 'insufficient' }], `aucun prélèvement avec ${c.minOccurrences} occurrences ou plus`);
      }
      let best: { cat: string; prior: number; last: number; pct: number } | null = null;
      for (const fl of debits) {
        const prior = Math.abs(fl.priorMedian);
        const last = Math.abs(fl.lastAmount);
        const pct = prior > 0 ? (last - prior) / prior : 0;
        if (pct >= c.minIncreasePct && last - prior >= c.minIncreaseMinor && (!best || pct > best.pct)) {
          best = { cat: fl.category, prior, last, pct };
        }
      }
      const score = best ? round2(Math.min(1, 0.5 + best.pct)) : 0;
      return {
        status: score >= c.threshold ? 'detected' : 'not_detected',
        score,
        threshold: c.threshold,
        signals: [{ ...signal, state: best ? 'present' : 'absent' }],
        evidence: best
          ? [
              { label: 'Catégorie', value: categoryLabel(best.cat) },
              { label: 'Montant habituel', value: formatEUR(best.prior) },
              { label: 'Dernier montant', value: `${formatEUR(best.last)} (+${formatPct(best.pct)})` },
            ]
          : [{ label: 'Prélèvements analysés', value: String(debits.length) }],
        assumptions: [
          `Hausse signalée à partir de +${formatPct(c.minIncreasePct)} et +${formatEUR(c.minIncreaseMinor)}.`,
          'Une hausse inhabituelle n’est pas une preuve de fraude : ce peut être une révision tarifaire.',
        ],
        facts: best ? { category: categoryLabel(best.cat), prior: best.prior, last: best.last, pct: round2(best.pct) } : {},
      };
    },
  },
  {
    id: 'relocation',
    label: 'Déménagement possible',
    description: 'Combine intention déclarée et évolutions d’habitudes liées au logement.',
    requiredScopes: ['habits.nonsensitive'],
    optionalScopes: ['intentions.declared'],
    run(f, { config }): DetectorOutput {
      const c = config.detectors.relocation;
      const h = f['habits.nonsensitive']!;
      const w = c.weights;
      const signals = [
        declaredSignal(f, 'demenagement', w.declared),
        {
          id: 'moving_service',
          categoryLabel: 'Recours récent à un service de déménagement',
          scope: 'habits.nonsensitive' as Scope,
          weight: w.moving_service,
          state: h.movingServiceRecent ? 'present' : 'absent',
        } satisfies SignalResult,
        increaseSignal('home_activity', 'Hausse des dépenses d’équipement du logement', h.home, w.home_activity, c.minHomeRatio, c.minHomeMonthlyMinor),
        {
          id: 'new_utility',
          categoryLabel: 'Nouveau fournisseur d’énergie ou de télécom',
          scope: 'habits.nonsensitive' as Scope,
          weight: w.new_utility,
          state: h.newUtilityPayeeRecent === null ? 'insufficient' : h.newUtilityPayeeRecent ? 'present' : 'absent',
        } satisfies SignalResult,
      ];
      return lifeEventOutput(signals, c, [comparisonEvidence('Équipement du logement', h.home)], []);
    },
  },
  {
    id: 'job_change',
    label: 'Changement professionnel possible',
    description: 'Combine intention déclarée et évolutions de revenus et de mobilité.',
    requiredScopes: ['habits.nonsensitive'],
    optionalScopes: ['intentions.declared'],
    run(f, { config }): DetectorOutput {
      const c = config.detectors.job_change;
      const h = f['habits.nonsensitive']!;
      const w = c.weights;
      const inc = h.income;
      const mob = h.mobility;
      const scope = 'habits.nonsensitive' as Scope;
      const signals: (SignalResult | null)[] = [
        declaredSignal(f, 'emploi', w.declared),
        {
          id: 'new_income_source',
          categoryLabel: 'Nouvelle source de revenus professionnels',
          scope,
          weight: w.new_income_source,
          state: h.newIncomeSourceRecent === null ? 'insufficient' : h.newIncomeSourceRecent ? 'present' : 'absent',
        },
        {
          id: 'income_level',
          categoryLabel: 'Évolution du niveau des revenus professionnels',
          scope,
          weight: w.income_level,
          state:
            inc.status === 'insufficient'
              ? 'insufficient'
              : inc.ratio !== null && Math.abs(inc.ratio - 1) >= c.minIncomeChangePct
                ? 'present'
                : 'absent',
        },
        {
          id: 'mobility',
          categoryLabel: 'Évolution des dépenses de déplacement',
          scope,
          weight: w.mobility,
          state:
            mob.status === 'insufficient'
              ? 'insufficient'
              : mob.ratio !== null && (mob.ratio >= c.mobilityRatioHigh || mob.ratio <= c.mobilityRatioLow)
                ? 'present'
                : 'absent',
        },
      ];
      return lifeEventOutput(signals, c, [comparisonEvidence('Revenus professionnels', inc), comparisonEvidence('Déplacements', mob)], []);
    },
  },
  {
    id: 'vehicle',
    label: 'Projet de véhicule possible',
    description: 'Combine intention déclarée, dépenses automobiles et effort d’épargne.',
    requiredScopes: ['habits.nonsensitive'],
    optionalScopes: ['intentions.declared'],
    run(f, { config }): DetectorOutput {
      const c = config.detectors.vehicle;
      const h = f['habits.nonsensitive']!;
      const signals = [
        declaredSignal(f, 'vehicule', c.weights.declared),
        increaseSignal('auto_activity', 'Hausse des dépenses automobiles', h.auto, c.weights.auto_activity, c.minAutoRatio, c.minAutoMonthlyMinor),
        increaseSignal('savings_increase', 'Hausse de l’effort d’épargne', h.savings, c.weights.savings_increase, c.minSavingsRatio),
      ];
      return lifeEventOutput(signals, c, [comparisonEvidence('Automobile', h.auto), comparisonEvidence('Épargne', h.savings)], [
        'Aucune décision de crédit n’est prise ou suggérée automatiquement.',
      ]);
    },
  },
  {
    id: 'housing',
    label: 'Projet immobilier possible',
    description: 'Combine intention déclarée, frais immobiliers et effort d’épargne.',
    requiredScopes: ['habits.nonsensitive'],
    optionalScopes: ['intentions.declared'],
    run(f, { config }): DetectorOutput {
      const c = config.detectors.housing;
      const h = f['habits.nonsensitive']!;
      const signals = [
        declaredSignal(f, 'logement', c.weights.declared),
        {
          id: 'real_estate_fees',
          categoryLabel: 'Frais immobiliers récents (agence, diagnostic)',
          scope: 'habits.nonsensitive' as Scope,
          weight: c.weights.real_estate_fees,
          state: h.realEstateFeesRecent ? 'present' : 'absent',
        } satisfies SignalResult,
        increaseSignal('savings_increase', 'Hausse de l’effort d’épargne', h.savings, c.weights.savings_increase, c.minSavingsRatio),
      ];
      return lifeEventOutput(signals, c, [comparisonEvidence('Épargne', h.savings)], [
        'Aucune décision de crédit n’est prise ou suggérée automatiquement.',
      ]);
    },
  },
  {
    id: 'savings_goal',
    label: 'Projection d’objectif d’épargne',
    description: 'Projette l’atteinte de vos objectifs avec vos comptes internes et externes autorisés.',
    requiredScopes: ['internal.recurring', 'goals.declared', 'external.accounts'],
    optionalScopes: [],
    run(f, { asOf, config }): DetectorOutput {
      const c = config.detectors.savings_goal;
      const r = f['internal.recurring']!;
      const goals = f['goals.declared']!.goals;
      const ext = f['external.accounts']!;
      const signals: SignalResult[] = [
        { id: 'goal', categoryLabel: 'Objectif d’épargne déclaré', scope: 'goals.declared', weight: 0, state: goals.length ? 'present' : 'absent' },
        { id: 'external', categoryLabel: 'Comptes externes autorisés (agrégés)', scope: 'external.accounts', weight: 0, state: ext.accountCount ? 'present' : 'absent' },
        { id: 'internal_savings', categoryLabel: 'Virements d’épargne récurrents internes', scope: 'internal.recurring', weight: 0, state: 'present' },
      ];
      const goal = [...goals].sort((a, b) => a.deadline.localeCompare(b.deadline))[0];
      if (!goal) {
        return { status: 'not_detected', score: 0, threshold: c.threshold, signals, evidence: [], assumptions: [], facts: {} };
      }
      const internalMonthly = r.flows
        .filter((fl) => fl.category === 'epargne_virement' && fl.direction === 'debit')
        .reduce((a, fl) => a + Math.abs(fl.lastAmount), 0);
      const monthly = internalMonthly + ext.aggregateMonthlyInflow;
      const current = r.savingsBalance + ext.aggregateBalance;
      const remaining = Math.max(0, goal.target - current);
      const months = remaining === 0 ? 0 : monthly > 0 ? Math.ceil(remaining / monthly) : null;
      const projectedDate = months === null ? '' : addMonths(asOf, months);
      const onTrack = months !== null && projectedDate <= goal.deadline;
      return {
        status: 'detected',
        score: 1,
        threshold: c.threshold,
        signals,
        evidence: [
          { label: 'Épargne actuelle (interne + externe agrégée)', value: formatEUR(current) },
          { label: 'Effort mensuel estimé', value: formatEUR(monthly) },
          { label: 'Objectif', value: `${formatEUR(goal.target)} avant le ${formatDateLong(goal.deadline)}` },
          { label: 'Atteinte projetée', value: months === null ? 'non atteignable au rythme actuel' : formatDateLong(projectedDate) },
          { label: 'Comptes externes pris en compte', value: String(ext.accountCount) },
        ],
        assumptions: [
          'Projection linéaire : l’effort mensuel actuel est supposé constant, sans rendement.',
          'Les comptes externes sont agrégés : aucun détail de leurs opérations n’est lu.',
          'Ceci n’est pas un conseil en investissement.',
        ],
        facts: {
          goalLabel: redactFreeText(goal.label),
          target: goal.target,
          current,
          monthly,
          months: months ?? -1,
          projectedDate,
          deadline: goal.deadline,
          onTrack: onTrack ? 1 : 0,
        },
      };
    },
  },
];

/** Détecteur « sur déclaration uniquement » : aucune inférence à partir des opérations. */
function declaredOnly(id: DetectorId, type: IntentionType, label: string, description: string): Detector {
  return {
    id,
    label,
    description,
    requiredScopes: ['intentions.declared'],
    optionalScopes: [],
    run(f, { config }): DetectorOutput {
      const threshold = (config.detectors as unknown as Record<string, { threshold: number }>)[id].threshold;
      const intention = f['intentions.declared']!.intentions.find((i) => i.type === type);
      return {
        status: intention ? 'detected' : 'not_detected',
        score: intention ? 1 : 0,
        threshold,
        signals: [
          {
            id: 'declared',
            categoryLabel: 'Intention déclarée dans l’application',
            scope: 'intentions.declared',
            weight: 1,
            strong: true,
            state: intention ? 'present' : 'absent',
          },
        ],
        evidence: intention ? [{ label: 'Déclaré le', value: formatDateLong(intention.declaredOn) }] : [],
        assumptions: ['Uniquement sur votre déclaration : cette situation n’est jamais déduite de vos opérations.'],
        facts: intention ? { declared: 1, intentionId: intention.id } : { declared: 0 },
      };
    },
  };
}

DETECTORS.push(
  {
    id: 'expatriation',
    label: 'Départ à l’étranger possible',
    description: 'Combine intention déclarée, virements internationaux et frais consulaires.',
    requiredScopes: ['habits.nonsensitive'],
    optionalScopes: ['intentions.declared'],
    run(f, { config }): DetectorOutput {
      const c = config.detectors.expatriation;
      const h = f['habits.nonsensitive']!;
      const declared = 'intentions.declared' in f ? f['intentions.declared']!.intentions.find((i) => i.type === 'expatriation') : undefined;
      const signals = [
        declaredSignal(f, 'expatriation', c.weights.declared),
        increaseSignal('intl_transfers', 'Hausse des virements internationaux', h.international, c.weights.intl_transfers, 2, c.minIntlMonthlyMinor),
        {
          id: 'consular_fees',
          categoryLabel: 'Frais consulaires ou de visa récents',
          scope: 'habits.nonsensitive' as Scope,
          weight: c.weights.consular_fees,
          state: h.consularFeesRecent ? 'present' : 'absent',
        } satisfies SignalResult,
      ];
      const out = lifeEventOutput(signals, c, [comparisonEvidence('Virements internationaux', h.international)], [
        'La destination n’est jamais déduite des opérations : elle ne provient que de votre déclaration.',
      ]);
      return { ...out, facts: declared ? { declared: 1, destination: declared.destination ?? 'l’étranger', intentionId: declared.id } : { declared: 0 } };
    },
  },
  declaredOnly('birth', 'naissance', 'Naissance attendue', 'Accompagnement d’une naissance, uniquement sur déclaration.'),
  declaredOnly('first_job', 'premier_emploi', 'Premier emploi', 'Premiers pas budgétaires, uniquement sur déclaration.'),
  declaredOnly('separation', 'separation', 'Séparation', 'Démarches bancaires liées à une séparation, uniquement sur déclaration.'),
);

export const DETECTOR_BY_ID = Object.fromEntries(DETECTORS.map((d) => [d.id, d])) as Record<DetectorId, Detector>;

export const DETECTOR_LABELS = Object.fromEntries(DETECTORS.map((d) => [d.id, d.label])) as Record<DetectorId, string>;
