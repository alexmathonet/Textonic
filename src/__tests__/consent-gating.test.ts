import { describe, expect, it, vi } from 'vitest';
import { allowedScopes, applyConsentChange, defaultConsent } from '../domain/consent';
import { DETECTOR_LABELS, DETECTORS, type Detector } from '../domain/detectors';
import { runAnticipation } from '../domain/engine';
import * as features from '../domain/features';
import { ASOF, camilleData, consentAt, withExternal } from './helpers';

describe('matrice de consentement', () => {
  it('démarre au niveau Essentiel avec seulement les flux internes et les échéances', () => {
    const c = defaultConsent('t');
    expect(c.level).toBe('essentiel');
    expect([...allowedScopes(c)].sort()).toEqual(['internal.deadlines', 'internal.recurring']);
  });

  it('Vue complète n’autorise pas les comptes externes sans autorisation séparée', () => {
    expect(allowedScopes(consentAt('complete')).has('external.accounts')).toBe(false);
    expect(allowedScopes(withExternal(consentAt('complete'))).has('external.accounts')).toBe(true);
  });

  it('un interrupteur de périmètre restreint le niveau, sans jamais l’élargir', () => {
    const c = consentAt('conseils', { scopeToggles: { ...defaultConsent('t').scopeToggles, 'habits.nonsensitive': false } });
    expect(allowedScopes(c).has('habits.nonsensitive')).toBe(false);
    // Activer un périmètre au-dessus du niveau n'a aucun effet.
    expect(allowedScopes(consentAt('essentiel')).has('goals.declared')).toBe(false);
  });

  it('l’interrupteur global retire tous les périmètres', () => {
    expect(allowedScopes(consentAt('complete', { anticipationEnabled: false })).size).toBe(0);
  });

  it('refuse d’autoriser les comptes externes hors Vue complète et révoque à la rétrogradation', () => {
    const auth = { simulated: true as const, accountIds: ['ext-horizon'], grantedAt: 't' };
    const refused = applyConsentChange(consentAt('conseils'), { type: 'external_authorize', authorization: auth }, 't', DETECTOR_LABELS);
    expect('error' in refused).toBe(true);

    const granted = applyConsentChange(consentAt('complete'), { type: 'external_authorize', authorization: auth }, 't', DETECTOR_LABELS);
    if ('error' in granted) throw new Error(granted.error);
    const down = applyConsentChange(granted.record, { type: 'level', level: 'conseils' }, 't', DETECTOR_LABELS);
    if ('error' in down) throw new Error(down.error);
    expect(down.record.externalAuthorization).toBeNull();
    expect(down.record.version).toBe(granted.record.version + 1);
    // Historique minimal : pas de donnée transactionnelle.
    expect(JSON.stringify(down.entry)).not.toMatch(/€|Salaire|counterparty/);
  });
});

describe('contrôle du consentement AVANT exécution des détecteurs', () => {
  it('au niveau Essentiel, le détecteur de déménagement ne s’exécute pas et les habitudes ne sont jamais extraites', () => {
    const spy = vi.spyOn(features.EXTRACTORS, 'habits.nonsensitive');
    const { store, audit } = runAnticipation({ data: camilleData(), consent: consentAt('essentiel'), asOf: ASOF });
    expect(audit.executed).toEqual(['overdraft', 'contract_expiry', 'recurring_increase']);
    expect(audit.executed).not.toContain('relocation');
    expect(audit.extractedScopes).not.toContain('habits.nonsensitive');
    expect(audit.extractedScopes).not.toContain('intentions.declared');
    expect(spy).not.toHaveBeenCalled();
    expect(store.conclusions.relocation).toBeUndefined();
    expect(store.conclusions.overdraft?.status).toBe('detected');
    spy.mockRestore();
  });

  it('au niveau Conseils, le même registre produit la question de déménagement', () => {
    const { store, audit } = runAnticipation({ data: camilleData(), consent: consentAt('conseils'), asOf: ASOF });
    expect(audit.executed).toContain('relocation');
    expect(store.conclusions.relocation?.status).toBe('detected');
    expect(store.conclusions.overdraft?.status).toBe('detected');
  });

  it('un détecteur ne reçoit pas les périmètres qu’il n’a pas déclarés (accès journalisé)', () => {
    const sneaky: Detector = {
      id: 'overdraft',
      label: 'test',
      description: 'détecteur qui tente de lire un périmètre non déclaré',
      requiredScopes: ['internal.recurring'],
      optionalScopes: [],
      run(f) {
        const leaked = f['habits.nonsensitive'];
        expect(leaked).toBeUndefined();
        return { status: 'not_detected', score: 0, threshold: 1, signals: [], evidence: [], assumptions: [], facts: {} };
      },
    };
    const { audit } = runAnticipation({ data: camilleData(), consent: consentAt('complete'), asOf: ASOF, detectors: [sneaky] });
    expect(audit.forbiddenAccess).toEqual([{ detectorId: 'overdraft', scope: 'habits.nonsensitive' }]);
  });

  it('les détecteurs réels ne tentent jamais d’accès interdit, quel que soit le niveau', () => {
    for (const level of ['essentiel', 'conseils', 'complete'] as const) {
      const { audit } = runAnticipation({ data: camilleData(), consent: withExternal(consentAt(level)), asOf: ASOF });
      expect(audit.forbiddenAccess).toEqual([]);
    }
  });

  it('un signal désactivé n’est pas exécuté', () => {
    const c = consentAt('conseils', { detectorToggles: { ...defaultConsent('t').detectorToggles, relocation: false } });
    const { store, audit } = runAnticipation({ data: camilleData(), consent: c, asOf: ASOF });
    expect(audit.executed).not.toContain('relocation');
    expect(audit.skipped.find((s) => s.detectorId === 'relocation')?.reason).toMatch(/désactivé/);
    expect(store.conclusions.relocation).toBeUndefined();
  });

  it('la projection d’épargne exige Vue complète ET une autorisation externe explicite', () => {
    const without = runAnticipation({ data: camilleData(), consent: consentAt('complete'), asOf: ASOF });
    expect(without.audit.executed).not.toContain('savings_goal');
    expect(without.audit.extractedScopes).not.toContain('external.accounts');

    const withAuth = runAnticipation({ data: camilleData(), consent: withExternal(consentAt('complete')), asOf: ASOF });
    expect(withAuth.store.conclusions.savings_goal?.status).toBe('detected');
    // Seuls des agrégats sont conservés.
    expect(withAuth.store.conclusions.savings_goal?.facts.current).toBe(620000 + 480000);
  });

  it('un compte externe indisponible n’est pas lu, même autorisé', () => {
    const r = runAnticipation({ data: camilleData(), consent: withExternal(consentAt('complete'), ['ext-lointaine']), asOf: ASOF });
    expect(r.store.conclusions.savings_goal?.facts.current).toBe(620000);
  });

  it('rétrograder invalide immédiatement les conclusions restreintes en cache', () => {
    const data = camilleData();
    const full = runAnticipation({ data, consent: withExternal(consentAt('complete')), asOf: ASOF });
    expect(full.store.conclusions.relocation).toBeDefined();
    expect(full.store.conclusions.savings_goal).toBeDefined();

    const down = applyConsentChange(withExternal(consentAt('complete')), { type: 'level', level: 'essentiel' }, 't', DETECTOR_LABELS);
    if ('error' in down) throw new Error(down.error);
    const after = runAnticipation({ data, consent: down.record, asOf: ASOF, previous: full.store });
    expect(after.audit.invalidated.sort()).toEqual(['birth', 'expatriation', 'first_job', 'housing', 'job_change', 'relocation', 'savings_goal', 'separation', 'vehicle']);
    expect(Object.keys(after.store.conclusions).sort()).toEqual(['contract_expiry', 'overdraft', 'recurring_increase']);
    for (const c of Object.values(after.store.conclusions)) {
      expect(c!.scopesUsed.every((s) => ['internal.recurring', 'internal.deadlines'].includes(s))).toBe(true);
    }
  });

  it('désactiver l’anticipation n’exécute rien mais ne touche pas au registre', () => {
    const data = camilleData();
    const before = data.ledger.length;
    const { store, audit } = runAnticipation({ data, consent: consentAt('complete', { anticipationEnabled: false }), asOf: ASOF });
    expect(audit.executed).toEqual([]);
    expect(audit.extractedScopes).toEqual([]);
    expect(store.conclusions).toEqual({});
    expect(data.ledger.length).toBe(before);
  });

  it('chaque détecteur déclare des périmètres requis non vides', () => {
    for (const d of DETECTORS) expect(d.requiredScopes.length).toBeGreaterThan(0);
  });
});
