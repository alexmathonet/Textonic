import { describe, expect, it } from 'vitest';
import { compareToBaseline } from '../domain/baseline';
import { detectRecurringFlows } from '../domain/ledger';
import { projectBalance } from '../domain/forecast';
import { combineSignals } from '../domain/scoring';
import { formatEUR } from '../domain/money';
import type { SignalResult } from '../domain/types';
import { tx } from './helpers';

describe('méthode 1 — projection des flux récurrents', () => {
  const history = [
    // Salaire le 28, loyer le 1er, abonnement le 21 : 3 mois d'historique.
    ...['2026-07', '2026-08', '2026-09'].flatMap((m) => [
      tx(`${m}-28`, 200000, 'salaire', 'emp'),
      tx(`${m}-01`, -90000, 'loyer', 'rent'),
      tx(`${m}-21`, -5000, 'abonnement_sport', 'gym'),
    ]),
    tx('2026-10-01', -90000, 'loyer', 'rent'),
  ];

  it('détecte les flux récurrents stables', () => {
    const flows = detectRecurringFlows(history, '2026-10-18');
    expect(flows.map((f) => f.counterpartyId).sort()).toEqual(['emp', 'gym', 'rent']);
  });

  it('calcule le solde jour par jour et le point bas, sans double comptage', () => {
    const ledger = [...history, tx('2026-10-21', -5000, 'abonnement_sport', 'gym', 'scheduled')];
    const flows = detectRecurringFlows(ledger, '2026-10-18');
    const fc = projectBalance({ openingBalance: 3000, flows, ledger, asOf: '2026-10-18', horizonDays: 30 });

    // 30 € − 50 € (abonnement programmé, compté une seule fois) = −20 € le 21/10,
    // + 2 000 € le 28/10 = 1 980 €, − 900 € le 01/11 = 1 080 €.
    const at = (d: string) => fc.points.find((p) => p.date === d)!.balance;
    expect(at('2026-10-20')).toBe(3000);
    expect(at('2026-10-21')).toBe(-2000);
    expect(at('2026-10-28')).toBe(198000);
    expect(at('2026-11-01')).toBe(108000);
    expect(fc.minBalance).toBe(-2000);
    expect(fc.minDate).toBe('2026-10-21');
    expect(fc.firstNegativeDate).toBe('2026-10-21');
    expect(fc.skippedAlreadyBooked).toBe(1);
    expect(fc.events.filter((e) => e.category === 'abonnement_sport')).toHaveLength(1);
    expect(fc.points).toHaveLength(31);
    expect(Number.isInteger(fc.minBalance)).toBe(true);
  });

  it('formate les montants en euros à partir des centimes', () => {
    expect(formatEUR(-2000).replace(/\s/g, ' ')).toMatch(/-20,00 €/);
  });
});

describe('méthode 2 — comparaison à la référence du client', () => {
  it('répond « insuffisant » quand l’historique ne couvre pas la référence', () => {
    const r = compareToBaseline([tx('2026-10-10', -5000, 'bricolage', 'b')], ['bricolage'], 'debit', '2026-10-18', '2026-09-01');
    expect(r.status).toBe('insufficient');
    expect(r.ratio).toBeNull();
  });

  it('mensualise la période récente et la référence', () => {
    const txs = [
      // Référence : 120 jours avant la fenêtre récente de 60 jours, 4 × 30 €.
      tx('2026-05-01', -3000, 'bricolage', 'b'),
      tx('2026-06-01', -3000, 'bricolage', 'b'),
      tx('2026-07-01', -3000, 'bricolage', 'b'),
      tx('2026-08-01', -3000, 'bricolage', 'b'),
      // Récent : 2 × 150 €.
      tx('2026-09-10', -15000, 'bricolage', 'b'),
      tx('2026-10-10', -15000, 'bricolage', 'b'),
    ];
    const r = compareToBaseline(txs, ['bricolage'], 'debit', '2026-10-18', '2026-01-01');
    expect(r.status).toBe('ok');
    expect(r.recentMonthly).toBe(15000);
    expect(r.baselineMonthly).toBe(3000);
    expect(r.ratio).toBe(5);
  });
});

describe('méthode 3 — combinaison de signaux et seuils', () => {
  const s = (id: string, weight: number, state: SignalResult['state'], strong = false): SignalResult => ({
    id, categoryLabel: id, scope: 'habits.nonsensitive', weight, state, strong,
  });
  const rule = { threshold: 0.55, minIndependentSignals: 2 };

  it('un signal isolé ambigu ne suffit jamais', () => {
    expect(combineSignals([s('achat', 0.6, 'present')], rule).status).toBe('not_detected');
  });

  it('une intention déclarée explicite suffit', () => {
    expect(combineSignals([s('declared', 0.6, 'present', true)], rule).status).toBe('detected');
  });

  it('plusieurs signaux indépendants au-dessus du seuil sont détectés', () => {
    const r = combineSignals([s('a', 0.3, 'present'), s('b', 0.25, 'present')], rule);
    expect(r).toEqual({ score: 0.55, status: 'detected' });
  });

  it('juste sous le seuil : non détecté', () => {
    expect(combineSignals([s('a', 0.3, 'present'), s('b', 0.2, 'present')], rule).status).toBe('not_detected');
  });

  it('le seuil est configurable par détecteur', () => {
    const sig = [s('a', 0.3, 'present'), s('b', 0.2, 'present')];
    expect(combineSignals(sig, { threshold: 0.5, minIndependentSignals: 2 }).status).toBe('detected');
  });

  it('historique insuffisant sous le seuil : « preuves insuffisantes », pas une supposition', () => {
    expect(combineSignals([s('a', 0.3, 'present'), s('b', 0.25, 'insufficient')], rule).status).toBe('insufficient_evidence');
  });

  it('le score est plafonné à 1', () => {
    expect(combineSignals([s('a', 0.8, 'present', true), s('b', 0.8, 'present')], rule).score).toBe(1);
  });
});
