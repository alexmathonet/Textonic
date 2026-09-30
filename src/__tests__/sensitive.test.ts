import { describe, expect, it } from 'vitest';
import { runAnticipation } from '../domain/engine';
import { EXTRACTORS, forecastFor } from '../domain/features';
import { DEFAULT_CONFIG } from '../domain/config';
import { redactFreeText, sanitizeLedger } from '../domain/sensitive';
import { ASOF, camilleData, consentAt, tx, withExternal } from './helpers';

describe('exclusion des catégories sensibles', () => {
  it('bloque santé, religion, syndicat, politique et les catégories inconnues avant analyse', () => {
    const ledger = [
      tx('2026-09-01', -2000, 'sante', 'pharma'),
      tx('2026-09-02', -2000, 'religion', 'culte'),
      tx('2026-09-03', -2000, 'syndicat', 'union'),
      tx('2026-09-04', -2000, 'politique', 'parti'),
      tx('2026-09-05', -2000, 'inconnu', 'x'),
      tx('2026-09-06', -2000, 'categorie_inventee', 'y'),
      tx('2026-09-07', -2000, 'courses', 'shop'),
    ];
    const { allowed, excludedCount } = sanitizeLedger(ledger);
    expect(allowed.map((t) => t.category)).toEqual(['courses']);
    expect(excludedCount).toBe(6);
  });

  it('les extracteurs ne voient jamais d’opération protégée', () => {
    const data = camilleData();
    const { allowed } = sanitizeLedger(data.ledger);
    const f = EXTRACTORS['internal.recurring']({ data, sanitized: allowed, asOf: ASOF, consent: consentAt('conseils'), config: DEFAULT_CONFIG });
    // La cotisation syndicale mensuelle est récurrente, mais n'est pas analysée.
    expect(f.flows.some((fl) => fl.category === 'syndicat')).toBe(false);
    expect(forecastFor(f, undefined, ASOF, 30).events.some((e) => e.category === 'syndicat')).toBe(false);
  });

  it('le magasin d’anticipation ne contient ni donnée protégée, ni libellé, ni contrepartie brute', () => {
    const data = camilleData();
    const { store } = runAnticipation({ data, consent: withExternal(consentAt('complete')), asOf: ASOF });
    const json = JSON.stringify(store);
    for (const cat of ['sante', 'religion', 'syndicat', 'politique', 'inconnu']) expect(json).not.toContain(`"${cat}"`);
    for (const t of data.ledger) {
      expect(json).not.toContain(t.label);
      expect(json).not.toContain(t.counterpartyId);
    }
  });

  it('masque un libellé libre qui évoque une catégorie protégée', () => {
    expect(redactFreeText('Traitement médical')).toBe('Objectif personnel');
    expect(redactFreeText('Voyage en Italie')).toBe('Voyage en Italie');
    expect(redactFreeText('Partir en vacances')).toBe('Partir en vacances');
  });
});
