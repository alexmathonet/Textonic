import { buildCustomerData } from '../data/builder';
import type { EvalCase, EvalLabel, EvalTag } from '../data/evaluationCases';
import { ALL_DETECTORS, applyConsentChange, defaultConsent, LEVEL_SCOPES } from './consent';
import { DEFAULT_CONFIG, type EngineConfig } from './config';
import { DETECTOR_BY_ID, DETECTOR_LABELS } from './detectors';
import { runAnticipation } from './engine';
import { isAllowedForAnalysis, PROTECTED_CATEGORIES } from './sensitive';
import type { ConsentLevel, ConsentRecord, CustomerData, DetectionStatus, DetectorId, Scope } from './types';

export interface Ratio {
  num: number;
  den: number;
  /** null si le dénominateur est nul (non défini). */
  value: number | null;
}

export const ratio = (num: number, den: number): Ratio => ({ num, den, value: den === 0 ? null : num / den });

export interface MetricRow {
  detectorId: DetectorId;
  level: ConsentLevel | 'tous';
  /** Nombre de cas évalués (détecteur autorisé et exécuté). */
  n: number;
  tp: number;
  fp: number;
  fn: number;
  tn: number;
  precision: Ratio;
  recall: Ratio;
  /** Cas où le détecteur n'a pas été exécuté faute de consentement. */
  notExecuted: number;
  insufficientReturned: number;
}

export interface CaseResult {
  id: string;
  description: string;
  tags: EvalTag[];
  level: ConsentLevel;
  outcomes: { detectorId: DetectorId; label: EvalLabel; status: DetectionStatus | 'non_execute' }[];
}

export interface EvaluationReport {
  sampleSize: number;
  tagCounts: Record<string, number>;
  rowsByLevel: MetricRow[];
  rowsOverall: MetricRow[];
  insufficient: { expected: number; returned: number };
  /** Exécutions de détecteurs non autorisés, vérifiées indépendamment du moteur. Attendu : 0. */
  unauthorizedExecutions: number;
  /** Tentatives d'accès à un périmètre non accordé, journalisées par la vue restreinte. Attendu : 0. */
  forbiddenAccess: number;
  /** Périmètres extraits alors qu'ils n'étaient pas autorisés. Attendu : 0. */
  forbiddenExtractions: number;
  /** Conclusions restantes dépendant d'un périmètre retiré. Attendu : 0. */
  staleAfterRevocation: number;
  /** Traces de données protégées/non classées dans le magasin d'anticipation. Attendu : 0. */
  sensitiveLeaks: number;
  /** Libellés ou contreparties bruts copiés dans le magasin d'anticipation. Attendu : 0. */
  rawDataInStore: number;
  cases: CaseResult[];
}

/**
 * Contrôle indépendant de l'autorisation : recalcule à partir de la matrice des permissions
 * sans passer par `allowedScopes` du moteur.
 */
function independentlyAuthorized(detectorId: DetectorId, c: ConsentRecord): boolean {
  if (!c.anticipationEnabled || !c.detectorToggles[detectorId]) return false;
  const ok = (s: Scope) =>
    LEVEL_SCOPES[c.level].includes(s) && c.scopeToggles[s] && (s !== 'external.accounts' || c.externalAuthorization !== null);
  return DETECTOR_BY_ID[detectorId].requiredScopes.every(ok);
}

function leakChecks(storeJson: string, data: CustomerData): { sensitive: number; raw: number } {
  let sensitive = 0;
  let raw = 0;
  const lower = storeJson.toLowerCase();
  for (const cat of PROTECTED_CATEGORIES) if (lower.includes(`"${cat}"`)) sensitive++;
  for (const t of data.ledger) {
    const hit = storeJson.includes(t.label) || storeJson.includes(t.counterpartyId);
    if (!hit) continue;
    if (!isAllowedForAnalysis(t.category)) sensitive++;
    else raw++;
  }
  return { sensitive, raw };
}

export function runEvaluation(cases: EvalCase[], config: EngineConfig = DEFAULT_CONFIG): EvaluationReport {
  const report: EvaluationReport = {
    sampleSize: cases.length,
    tagCounts: {},
    rowsByLevel: [],
    rowsOverall: [],
    insufficient: { expected: 0, returned: 0 },
    unauthorizedExecutions: 0,
    forbiddenAccess: 0,
    forbiddenExtractions: 0,
    staleAfterRevocation: 0,
    sensitiveLeaks: 0,
    rawDataInStore: 0,
    cases: [],
  };

  for (const ec of cases) {
    for (const t of ec.tags) report.tagCounts[t] = (report.tagCounts[t] ?? 0) + 1;
    const data = buildCustomerData(ec.persona, ec.asOf);
    const patch = ec.consentPatch ?? ((c: ConsentRecord) => c);

    let consent: ConsentRecord;
    let previous;
    if (ec.previousLevel) {
      const first = patch({ ...defaultConsent('eval'), level: ec.previousLevel });
      previous = runAnticipation({ data, consent: first, asOf: ec.asOf, config }).store;
      const changed = applyConsentChange(first, { type: 'level', level: ec.level }, 'eval', DETECTOR_LABELS);
      if ('error' in changed) throw new Error(changed.error);
      consent = changed.record;
    } else {
      consent = patch({ ...defaultConsent('eval'), level: ec.level });
    }

    const { store, audit } = runAnticipation({ data, consent, asOf: ec.asOf, previous, config });

    report.forbiddenAccess += audit.forbiddenAccess.length;
    const allowed = new Set(audit.allowedScopes);
    report.forbiddenExtractions += audit.extractedScopes.filter((s) => !LEVEL_SCOPES[consent.level].includes(s) || !allowed.has(s)).length;
    for (const id of audit.executed) if (!independentlyAuthorized(id, consent)) report.unauthorizedExecutions++;
    for (const c of Object.values(store.conclusions)) {
      if (c && c.scopesUsed.some((s) => !allowed.has(s))) report.staleAfterRevocation++;
    }
    if (previous) {
      for (const id of Object.keys(previous.conclusions) as DetectorId[]) {
        if (!independentlyAuthorized(id, consent) && store.conclusions[id]) report.staleAfterRevocation++;
      }
    }
    const leaks = leakChecks(JSON.stringify(store), data);
    report.sensitiveLeaks += leaks.sensitive;
    report.rawDataInStore += leaks.raw;

    const outcomes: CaseResult['outcomes'] = ALL_DETECTORS.map((id) => ({
      detectorId: id,
      label: ec.labels[id] ?? 'negative',
      status: audit.executed.includes(id) ? store.conclusions[id]!.status : 'non_execute',
    }));
    report.cases.push({ id: ec.id, description: ec.description, tags: ec.tags, level: ec.level, outcomes });
  }

  const rows = (level: ConsentLevel | 'tous') =>
    ALL_DETECTORS.map((detectorId) => {
      const row: MetricRow = {
        detectorId, level, n: 0, tp: 0, fp: 0, fn: 0, tn: 0,
        precision: ratio(0, 0), recall: ratio(0, 0), notExecuted: 0, insufficientReturned: 0,
      };
      for (const c of report.cases) {
        if (level !== 'tous' && c.level !== level) continue;
        const o = c.outcomes.find((x) => x.detectorId === detectorId)!;
        if (o.status === 'non_execute') {
          row.notExecuted++;
          continue;
        }
        row.n++;
        if (o.status === 'insufficient_evidence') row.insufficientReturned++;
        const predicted = o.status === 'detected';
        const actual = o.label === 'positive';
        if (predicted && actual) row.tp++;
        else if (predicted && !actual) row.fp++;
        else if (!predicted && actual) row.fn++;
        else row.tn++;
      }
      row.precision = ratio(row.tp, row.tp + row.fp);
      row.recall = ratio(row.tp, row.tp + row.fn);
      return row;
    });

  report.rowsByLevel = (['essentiel', 'conseils', 'complete'] as ConsentLevel[]).flatMap((l) => rows(l)).filter((r) => r.n + r.notExecuted > 0);
  report.rowsOverall = rows('tous');

  for (const c of report.cases) {
    for (const o of c.outcomes) {
      if (o.label === 'insufficient') {
        report.insufficient.expected++;
        if (o.status === 'insufficient_evidence') report.insufficient.returned++;
      }
    }
  }
  return report;
}
