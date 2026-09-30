import type { EngineConfig } from './config';
import { DEFAULT_CONFIG } from './config';
import { ALL_DETECTORS } from './consent';
import { addDays, diffDays } from './dates';
import { templateAdapter, type MessageAdapter } from './messages';
import type { AnticipationStore, DetectorId, FeedbackEntry, ISODate, Recommendation } from './types';
import { DETECTOR_BY_ID } from './detectors';

export type FeedbackState =
  | { state: 'none' }
  | { state: 'confirmed' }
  | { state: 'suppressed'; until: ISODate; reason: 'rejet' | 'plus_tard' };

/**
 * Effet du dernier retour client sur un détecteur.
 * « Non » supprime pendant `rejectCooldownDays`, « Plus tard » pendant `snoozeDays`.
 * Ceci n'entraîne AUCUN réentraînement : le retour est seulement enregistré pour l'évaluation.
 */
export function feedbackState(
  detectorId: DetectorId,
  feedback: FeedbackEntry[],
  asOf: ISODate,
  config: EngineConfig = DEFAULT_CONFIG,
): FeedbackState {
  const last = [...feedback].reverse().find((f) => f.detectorId === detectorId);
  if (!last) return { state: 'none' };
  const elapsed = diffDays(last.at, asOf);
  if (last.response === 'non' && elapsed < config.feedback.rejectCooldownDays) {
    return { state: 'suppressed', until: addDays(last.at, config.feedback.rejectCooldownDays), reason: 'rejet' };
  }
  if (last.response === 'plus_tard' && elapsed < config.feedback.snoozeDays) {
    return { state: 'suppressed', until: addDays(last.at, config.feedback.snoozeDays), reason: 'plus_tard' };
  }
  if (last.response === 'pertinent') return { state: 'confirmed' };
  return { state: 'none' };
}

export function buildRecommendations(
  store: AnticipationStore,
  feedback: FeedbackEntry[],
  asOf: ISODate,
  config: EngineConfig = DEFAULT_CONFIG,
  adapter: MessageAdapter = templateAdapter,
): Recommendation[] {
  const out: Recommendation[] = [];
  for (const id of ALL_DETECTORS) {
    const c = store.conclusions[id];
    if (!c || c.status !== 'detected') continue;
    const fb = feedbackState(id, feedback, asOf, config);
    if (fb.state === 'suppressed') continue;
    const confirmed = fb.state === 'confirmed';
    const msg = adapter.phrase(c, { confirmed });
    out.push({
      id: `${id}-v${c.consentVersion}`,
      detectorId: id,
      type: id,
      kind: msg.kind,
      title: msg.title,
      body: msg.body,
      requiredScopes: DETECTOR_BY_ID[id].requiredScopes,
      score: c.score,
      threshold: c.threshold,
      explanation: msg.explanation,
      signalCategories: c.signals.filter((s) => s.state === 'present').map((s) => s.categoryLabel),
      evidence: c.evidence,
      assumptions: c.assumptions,
      createdAt: c.createdAt,
      consentVersion: c.consentVersion,
      status: confirmed ? 'confirmee' : 'nouvelle',
      nextActions: msg.nextActions,
    });
  }
  const order = { alerte: 0, question: 1, etape_suivante: 2, projection: 3 } as const;
  return out.sort((a, b) => order[a.kind] - order[b.kind]);
}
