import { describe, expect, it } from 'vitest';
import { EVALUATION_CASES } from '../data/evaluationCases';
import { PERSONAS } from '../data/personas';
import { DEFAULT_CONFIG } from '../domain/config';
import { addDays } from '../domain/dates';
import { runAnticipation } from '../domain/engine';
import { ratio, runEvaluation } from '../domain/evaluation';
import { buildRecommendations, feedbackState } from '../domain/recommendations';
import type { FeedbackEntry } from '../domain/types';
import { ASOF, camilleData, consentAt } from './helpers';

describe('retours client et période de repos', () => {
  const store = runAnticipation({ data: camilleData(), consent: consentAt('conseils'), asOf: ASOF }).store;
  const fb = (response: FeedbackEntry['response'], at = ASOF): FeedbackEntry[] => [{ detectorId: 'relocation', response, at, consentVersion: 2 }];
  const ids = (f: FeedbackEntry[], d = ASOF) => buildRecommendations(store, f, d).map((r) => r.detectorId);

  it('« Non » supprime la suggestion pendant la période de repos configurée', () => {
    expect(ids(fb('non'))).not.toContain('relocation');
    const cooldown = DEFAULT_CONFIG.feedback.rejectCooldownDays;
    expect(ids(fb('non'), addDays(ASOF, cooldown - 1))).not.toContain('relocation');
    expect(ids(fb('non'), addDays(ASOF, cooldown))).toContain('relocation');
  });

  it('« Plus tard » reporte de quelques jours seulement', () => {
    const snooze = DEFAULT_CONFIG.feedback.snoozeDays;
    expect(ids(fb('plus_tard'), addDays(ASOF, snooze - 1))).not.toContain('relocation');
    expect(ids(fb('plus_tard'), addDays(ASOF, snooze))).toContain('relocation');
  });

  it('« Oui » transforme la question en étape suivante (assurance habitation)', () => {
    const rec = buildRecommendations(store, fb('pertinent'), ASOF).find((r) => r.detectorId === 'relocation')!;
    expect(rec.kind).toBe('etape_suivante');
    expect(rec.status).toBe('confirmee');
    expect(rec.nextActions.map((a) => a.id)).toContain('review_home_insurance');
    expect(feedbackState('relocation', fb('pertinent'), ASOF)).toEqual({ state: 'confirmed' });
  });

  it('une recommandation porte les champs exigés et formule une hypothèse, pas un fait', () => {
    const rec = buildRecommendations(store, [], ASOF).find((r) => r.detectorId === 'relocation')!;
    expect(rec.title).toBe('Un déménagement en vue ?');
    expect(rec.body).toMatch(/hypothèse/);
    expect(rec).toMatchObject({ type: 'relocation', kind: 'question', status: 'nouvelle', consentVersion: 1 });
    expect(rec.requiredScopes).toEqual(['habits.nonsensitive']);
    expect(rec.score).toBeGreaterThanOrEqual(rec.threshold);
    expect(rec.signalCategories.length).toBeGreaterThanOrEqual(2);
    expect(rec.evidence.length).toBeGreaterThan(0);
  });
});

describe('métriques d’évaluation', () => {
  it('gère les dénominateurs nuls', () => {
    expect(ratio(0, 0)).toEqual({ num: 0, den: 0, value: null });
    expect(ratio(2, 3).value).toBeCloseTo(0.667, 3);
  });

  it('le jeu d’évaluation est distinct des fixtures de démo', () => {
    const devSeeds = new Set(PERSONAS.map((p) => p.ledgerSpec.seed));
    for (const c of EVALUATION_CASES) expect(devSeeds.has(c.persona.ledgerSpec.seed)).toBe(false);
  });

  it('couvre les catégories de cas demandées', () => {
    const tags = new Set(EVALUATION_CASES.flatMap((c) => c.tags));
    for (const t of ['positif', 'negatif', 'ambigu', 'historique_insuffisant', 'categorie_sensible', 'consentement_revoque']) expect(tags.has(t as never)).toBe(true);
  });

  const report = runEvaluation(EVALUATION_CASES);

  it('aucune exécution non autorisée, aucun accès interdit, aucune fuite', () => {
    expect(report.unauthorizedExecutions).toBe(0);
    expect(report.forbiddenAccess).toBe(0);
    expect(report.forbiddenExtractions).toBe(0);
    expect(report.staleAfterRevocation).toBe(0);
    expect(report.sensitiveLeaks).toBe(0);
    expect(report.rawDataInStore).toBe(0);
  });

  it('les compteurs sont cohérents avec la taille de l’échantillon', () => {
    for (const row of report.rowsOverall) {
      expect(row.tp + row.fp + row.fn + row.tn).toBe(row.n);
      expect(row.n + row.notExecuted).toBe(report.sampleSize);
      expect(row.precision.den).toBe(row.tp + row.fp);
      expect(row.recall.den).toBe(row.tp + row.fn);
    }
  });

  it('les cas restreints par le consentement ne sont pas comptés comme faux négatifs', () => {
    const e20 = report.cases.find((c) => c.id === 'E20')!;
    expect(e20.outcomes.find((o) => o.detectorId === 'relocation')!.status).toBe('non_execute');
  });

  it('un historique insuffisant renvoie « preuves insuffisantes »', () => {
    const e21 = report.cases.find((c) => c.id === 'E21')!;
    expect(e21.outcomes.find((o) => o.detectorId === 'relocation')!.status).toBe('insufficient_evidence');
  });
});
