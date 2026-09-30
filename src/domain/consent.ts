import type {
  ConsentHistoryEntry,
  ConsentLevel,
  ConsentRecord,
  DetectorId,
  ExternalAuthorization,
  Scope,
} from './types';

export const ALL_SCOPES: Scope[] = [
  'internal.recurring',
  'internal.deadlines',
  'habits.nonsensitive',
  'intentions.declared',
  'goals.declared',
  'external.accounts',
];

export const ALL_DETECTORS: DetectorId[] = [
  'overdraft',
  'contract_expiry',
  'recurring_increase',
  'relocation',
  'job_change',
  'vehicle',
  'housing',
  'savings_goal',
  'expatriation',
  'birth',
  'first_job',
  'separation',
];

export const LEVEL_ORDER: ConsentLevel[] = ['essentiel', 'conseils', 'complete'];

/** Matrice des permissions : périmètre maximal de chaque niveau (cumulatif). */
export const LEVEL_SCOPES: Record<ConsentLevel, Scope[]> = {
  essentiel: ['internal.recurring', 'internal.deadlines'],
  conseils: ['internal.recurring', 'internal.deadlines', 'habits.nonsensitive', 'intentions.declared'],
  complete: [
    'internal.recurring',
    'internal.deadlines',
    'habits.nonsensitive',
    'intentions.declared',
    'goals.declared',
    'external.accounts',
  ],
};

export const LEVEL_LABELS: Record<ConsentLevel, string> = {
  essentiel: 'Essentiel',
  conseils: 'Conseils',
  complete: 'Vue complète',
};

export const SCOPE_LABELS: Record<Scope, string> = {
  'internal.recurring': 'Flux récurrents internes (revenus, prélèvements)',
  'internal.deadlines': 'Échéances connues de vos contrats',
  'habits.nonsensitive': 'Évolution de vos habitudes non sensibles',
  'intentions.declared': 'Intentions déclarées dans l’application',
  'goals.declared': 'Objectifs d’épargne déclarés',
  'external.accounts': 'Comptes externes autorisés (simulés)',
};

export const SCOPE_MIN_LEVEL: Record<Scope, ConsentLevel> = {
  'internal.recurring': 'essentiel',
  'internal.deadlines': 'essentiel',
  'habits.nonsensitive': 'conseils',
  'intentions.declared': 'conseils',
  'goals.declared': 'complete',
  'external.accounts': 'complete',
};

export function allTrue<K extends string>(keys: K[]): Record<K, boolean> {
  return Object.fromEntries(keys.map((k) => [k, true])) as Record<K, boolean>;
}

export function defaultConsent(timestamp: string): ConsentRecord {
  return {
    version: 1,
    level: 'essentiel',
    anticipationEnabled: true,
    scopeToggles: allTrue(ALL_SCOPES),
    detectorToggles: allTrue(ALL_DETECTORS),
    externalAuthorization: null,
    timestamp,
    purpose: 'personnalisation_optionnelle',
  };
}

export function levelRank(level: ConsentLevel): number {
  return LEVEL_ORDER.indexOf(level);
}

/**
 * Calcule les périmètres effectivement autorisés.
 * Point d'entrée unique utilisé par le moteur AVANT toute extraction de caractéristiques.
 */
export function allowedScopes(consent: ConsentRecord): Set<Scope> {
  const out = new Set<Scope>();
  if (!consent.anticipationEnabled) return out;
  for (const scope of LEVEL_SCOPES[consent.level]) {
    if (!consent.scopeToggles[scope]) continue;
    if (scope === 'external.accounts' && !consent.externalAuthorization) continue;
    out.add(scope);
  }
  return out;
}

export type ConsentChange =
  | { type: 'level'; level: ConsentLevel }
  | { type: 'scope'; scope: Scope; enabled: boolean }
  | { type: 'detector'; detectorId: DetectorId; enabled: boolean }
  | { type: 'anticipation'; enabled: boolean }
  | { type: 'external_authorize'; authorization: ExternalAuthorization }
  | { type: 'external_revoke' };

/**
 * Applique un changement de consentement et retourne un nouvel enregistrement versionné
 * accompagné d'une entrée d'historique minimale (aucune donnée transactionnelle).
 */
export function applyConsentChange(
  current: ConsentRecord,
  change: ConsentChange,
  timestamp: string,
  detectorLabels: Record<DetectorId, string>,
): { record: ConsentRecord; entry: ConsentHistoryEntry } | { error: string } {
  const next: ConsentRecord = {
    ...current,
    scopeToggles: { ...current.scopeToggles },
    detectorToggles: { ...current.detectorToggles },
    version: current.version + 1,
    timestamp,
  };
  const changes: string[] = [];

  switch (change.type) {
    case 'level': {
      if (change.level === current.level) return { error: 'Niveau inchangé.' };
      next.level = change.level;
      changes.push(`Niveau : ${LEVEL_LABELS[current.level]} → ${LEVEL_LABELS[change.level]}`);
      // Rétrograder sous « Vue complète » révoque l'autorisation des comptes externes :
      // une nouvelle autorisation explicite sera nécessaire.
      if (levelRank(change.level) < levelRank('complete') && current.externalAuthorization) {
        next.externalAuthorization = null;
        changes.push('Autorisation des comptes externes (simulés) révoquée');
      }
      break;
    }
    case 'scope':
      if (current.scopeToggles[change.scope] === change.enabled) return { error: 'Signal inchangé.' };
      next.scopeToggles[change.scope] = change.enabled;
      changes.push(`${SCOPE_LABELS[change.scope]} : ${change.enabled ? 'réactivé' : 'désactivé'}`);
      break;
    case 'detector':
      if (current.detectorToggles[change.detectorId] === change.enabled) return { error: 'Signal inchangé.' };
      next.detectorToggles[change.detectorId] = change.enabled;
      changes.push(`Signal « ${detectorLabels[change.detectorId]} » : ${change.enabled ? 'réactivé' : 'désactivé'}`);
      break;
    case 'anticipation':
      if (current.anticipationEnabled === change.enabled) return { error: 'Réglage inchangé.' };
      next.anticipationEnabled = change.enabled;
      changes.push(`Anticipation optionnelle : ${change.enabled ? 'activée' : 'désactivée'}`);
      break;
    case 'external_authorize':
      if (current.level !== 'complete') {
        return { error: 'L’autorisation des comptes externes nécessite le niveau Vue complète.' };
      }
      next.externalAuthorization = change.authorization;
      changes.push(`Comptes externes (simulés) autorisés : ${change.authorization.accountIds.length}`);
      break;
    case 'external_revoke':
      if (!current.externalAuthorization) return { error: 'Aucune autorisation active.' };
      next.externalAuthorization = null;
      changes.push('Autorisation des comptes externes (simulés) révoquée');
      break;
  }

  return {
    record: next,
    entry: { version: next.version, timestamp, level: next.level, changes, purpose: next.purpose },
  };
}
