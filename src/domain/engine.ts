import { allowedScopes, SCOPE_LABELS } from './consent';
import { DEFAULT_CONFIG, type EngineConfig } from './config';
import { DETECTORS, type Detector } from './detectors';
import { FeatureExtractor, gatedFeatures } from './features';
import { sanitizeLedger } from './sensitive';
import type { AnticipationStore, Conclusion, ConsentRecord, CustomerData, DetectorId, ISODate, RunAudit, Scope } from './types';

export interface EngineInput {
  data: CustomerData;
  consent: ConsentRecord;
  asOf: ISODate;
  previous?: AnticipationStore;
  config?: EngineConfig;
  detectors?: Detector[];
}

export interface EngineResult {
  store: AnticipationStore;
  audit: RunAudit;
}

/** Raison pour laquelle un détecteur ne peut pas s'exécuter, ou null s'il est autorisé. */
export function blockReason(detector: Detector, consent: ConsentRecord, allowed: Set<Scope>): string | null {
  if (!consent.anticipationEnabled) return 'Anticipation optionnelle désactivée';
  if (!consent.detectorToggles[detector.id]) return 'Signal désactivé par le client';
  const missing = detector.requiredScopes.filter((s) => !allowed.has(s));
  if (missing.length) return `Périmètre non autorisé : ${missing.map((s) => SCOPE_LABELS[s]).join(', ')}`;
  return null;
}

/**
 * Pipeline d'anticipation.
 *
 * 1. Le consentement est converti en périmètres autorisés AVANT toute lecture de données.
 * 2. Les conclusions en cache qui dépendent d'un périmètre désormais retiré sont invalidées.
 * 3. Le registre est filtré (catégories protégées et non classées exclues).
 * 4. Chaque détecteur autorisé reçoit une vue restreinte à ses périmètres ; les autres
 *    ne s'exécutent pas et aucune caractéristique n'est extraite pour eux.
 * 5. Seules des conclusions agrégées sont conservées dans le magasin d'anticipation.
 */
export function runAnticipation(input: EngineInput): EngineResult {
  const config = input.config ?? DEFAULT_CONFIG;
  const detectors = input.detectors ?? DETECTORS;
  const { consent, asOf, data } = input;
  const allowed = allowedScopes(consent);

  const audit: RunAudit = {
    allowedScopes: [...allowed],
    executed: [],
    skipped: [],
    extractedScopes: [],
    forbiddenAccess: [],
    invalidated: [],
    excludedTransactions: 0,
  };

  // Invalidation du cache : toute conclusion dont le détecteur n'est plus autorisé,
  // ou qui a utilisé un périmètre retiré, est supprimée.
  const previous = input.previous?.conclusions ?? {};
  for (const [id, c] of Object.entries(previous) as [DetectorId, Conclusion][]) {
    const det = detectors.find((d) => d.id === id);
    const revoked = !det || blockReason(det, consent, allowed) !== null || c.scopesUsed.some((s) => !allowed.has(s));
    if (revoked) audit.invalidated.push(id);
  }

  const conclusions: Partial<Record<DetectorId, Conclusion>> = {};
  const runnable = detectors.filter((d) => {
    const reason = blockReason(d, consent, allowed);
    if (reason) audit.skipped.push({ detectorId: d.id, reason });
    return reason === null;
  });

  if (runnable.length > 0) {
    const { allowed: sanitized, excludedCount } = sanitizeLedger(data.ledger);
    audit.excludedTransactions = excludedCount;
    const extractor = new FeatureExtractor({ data, sanitized, asOf, consent, config }, allowed);

    for (const d of runnable) {
      const granted = new Set<Scope>([...d.requiredScopes, ...d.optionalScopes.filter((s) => allowed.has(s))]);
      const features = gatedFeatures(d.id, granted, extractor, (e) => audit.forbiddenAccess.push(e));
      audit.executed.push(d.id);
      const out = d.run(features, { asOf, config });
      conclusions[d.id] = {
        ...out,
        detectorId: d.id,
        scopesUsed: [...granted],
        consentVersion: consent.version,
        createdAt: asOf,
      };
    }
    audit.extractedScopes = [...extractor.extracted];
  }

  return { store: { conclusions }, audit };
}
