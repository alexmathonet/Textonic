import { allowedScopes } from './consent';
import { DEFAULT_CONFIG } from './config';
import { FeatureExtractor, forecastFor } from './features';
import type { ForecastResult } from './forecast';
import { sanitizeLedger } from './sensitive';
import type { ConsentRecord, CustomerData, ISODate } from './types';

/**
 * Projection affichée sur l'accueil. Elle passe par le même contrôle de consentement
 * que les détecteurs : sans le périmètre « flux récurrents internes », rien n'est calculé.
 */
export function forecastForDisplay(data: CustomerData, consent: ConsentRecord, asOf: ISODate): ForecastResult | null {
  const allowed = allowedScopes(consent);
  if (!allowed.has('internal.recurring')) return null;
  const { allowed: sanitized } = sanitizeLedger(data.ledger);
  const extractor = new FeatureExtractor({ data, sanitized, asOf, consent, config: DEFAULT_CONFIG }, allowed);
  const deadlines = allowed.has('internal.deadlines') ? extractor.get('internal.deadlines') : undefined;
  return forecastFor(extractor.get('internal.recurring'), deadlines, asOf, DEFAULT_CONFIG.detectors.overdraft.horizonDays);
}
