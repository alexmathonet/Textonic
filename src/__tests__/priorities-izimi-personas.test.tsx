import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildCustomerData } from '../data/builder';
import { PERSONAS, PERSONA_BY_ID } from '../data/personas';
import { planFor } from '../data/plans';
import { defaultConsent } from '../domain/consent';
import { forecastForDisplay } from '../domain/display';
import { runAnticipation } from '../domain/engine';
import { paymentPriority, sortByPriority } from '../domain/priority';
import { buildRecommendations } from '../domain/recommendations';
import { initialState, reducer } from '../state/appState';
import { AppProvider } from '../state/AppContext';
import { App } from '../ui/App';
import { ASOF, camilleData, consentAt } from './helpers';

describe('priorité des paiements et dernier rappel du prêt maison', () => {
  it('règle de priorité', () => {
    expect(paymentPriority({ amount: -100, category: 'credit_immo', source: 'rappel' })).toBe('critique');
    expect(paymentPriority({ amount: -100, category: 'credit_immo', source: 'echeance_contrat' })).toBe('haute');
    expect(paymentPriority({ amount: -100, category: 'energie', source: 'recurrent_projete' })).toBe('normale');
    expect(paymentPriority({ amount: -100, category: 'abonnement_sport', source: 'deja_programme' })).toBe('basse');
    expect(paymentPriority({ amount: 100, category: 'salaire', source: 'recurrent_projete' })).toBeNull();
  });

  it('la projection inclut le rappel et l’échéance de novembre une seule fois', () => {
    const fc = forecastForDisplay(camilleData(), defaultConsent('t'), ASOF)!;
    const loan = fc.events.filter((e) => e.category === 'credit_immo');
    expect(loan.map((e) => [e.date, e.amount, e.source])).toEqual([
      ['2026-10-25', -95000, 'rappel'],
      ['2026-11-01', -95000, 'echeance_contrat'],
    ]);
    expect(fc.minBalance).toBe(-105000);
    expect(fc.minDate).toBe('2026-10-25');
    expect(sortByPriority(fc.events)[0].source).toBe('rappel');
  });

  it('sans le périmètre « échéances », le rappel n’entre pas dans la projection', () => {
    const c = { ...defaultConsent('t'), scopeToggles: { ...defaultConsent('t').scopeToggles, 'internal.deadlines': false } };
    const fc = forecastForDisplay(camilleData(), c, ASOF)!;
    expect(fc.events.some((e) => e.source === 'rappel')).toBe(false);
  });

  it('l’alerte de découvert indique quoi couvrir en priorité', () => {
    const { store } = runAnticipation({ data: camilleData(), consent: consentAt('essentiel'), asOf: ASOF });
    const rec = buildRecommendations(store, [], ASOF).find((r) => r.detectorId === 'overdraft')!;
    expect(rec.body).toMatch(/À couvrir en priorité : Dernier rappel — prêt habitation/);
    expect(rec.nextActions.map((a) => a.id)).toContain('view_payments');
  });
});

describe('partage izimi (simulé)', () => {
  it('exige une autorisation, trace chaque échange et gère l’erreur simulée', () => {
    let s = initialState();
    s = reducer(s, { type: 'izimi/share', docId: 'ctr-c-pret', name: 'Contrat — Prêt habitation' });
    expect(s.notice?.tone).toBe('error');
    s = reducer(s, { type: 'izimi/link' });
    s = reducer(s, { type: 'izimi/share', docId: 'ctr-c-pret', name: 'Contrat — Prêt habitation' });
    s = reducer(s, { type: 'izimi/import', izimiDocId: 'iz-cam-energie' });
    s = reducer(s, { type: 'izimi/import', izimiDocId: 'iz-cam-donation' });
    expect(s.notice?.text).toMatch(/erreur simulée/);
    expect(s.izimi.shared).toHaveLength(1);
    expect(s.izimi.imported.map((d) => d.izimiDocId)).toEqual(['iz-cam-energie']);
    expect(s.izimi.log).toHaveLength(3);
    s = reducer(s, { type: 'izimi/unlink' });
    s = reducer(s, { type: 'izimi/import', izimiDocId: 'iz-cam-id' });
    expect(s.notice?.tone).toBe('error');
  });

  it('les documents izimi n’entrent pas dans l’anticipation', () => {
    let s = reducer(initialState(), { type: 'izimi/link' });
    s = reducer(s, { type: 'izimi/import', izimiDocId: 'iz-cam-id' });
    expect(JSON.stringify(s.store)).not.toMatch(/SIM-114|izimi/i);
  });

  it('import conseiller : le document arrive dans le dossier et la pièce passe « à vérifier »', () => {
    let s = initialState();
    s = reducer(s, { type: 'case/izimi-import', caseId: 'DOS-001', izimiDocId: 'iz-luc-domicile' });
    const c = s.advisorCases.find((x) => x.id === 'DOS-001')!;
    expect(c.documents.at(-1)!.kind).toMatch(/via izimi/);
    expect(c.checklist.find((i) => i.id === 'addr')!.state).toBe('a_verifier');
    expect(c.audit.at(-1)!.action).toMatch(/izimi/);
  });
});

describe('cinq personas, cinq cas', () => {
  it('chaque persona produit son cas principal au niveau Conseils', () => {
    const expected: Record<string, string> = { camille: 'relocation', thomas: 'birth', ines: 'first_job', julien: 'expatriation', laurence: 'separation' };
    expect(PERSONAS.map((p) => p.id).sort()).toEqual(Object.keys(expected).sort());
    for (const p of PERSONAS) {
      const { store } = runAnticipation({ data: buildCustomerData(p, p.referenceDate), consent: consentAt('conseils'), asOf: p.referenceDate });
      expect(store.conclusions[expected[p.id] as keyof typeof store.conclusions]?.status, p.id).toBe('detected');
    }
  });

  it('naissance et séparation ne sont jamais déduites sans déclaration', () => {
    for (const p of PERSONAS) {
      const data = { ...buildCustomerData(p, p.referenceDate), intentions: [] };
      const { store } = runAnticipation({ data, consent: consentAt('complete'), asOf: p.referenceDate });
      expect(store.conclusions.birth?.status).toBe('not_detected');
      expect(store.conclusions.separation?.status).toBe('not_detected');
    }
  });

  it('Julien : question à partir des signaux, aucune analyse au niveau Essentiel', () => {
    const data = buildCustomerData(PERSONA_BY_ID.julien, '2026-10-18');
    const ess = runAnticipation({ data, consent: consentAt('essentiel'), asOf: '2026-10-18' });
    expect(ess.audit.executed).not.toContain('expatriation');
    const { store } = runAnticipation({ data, consent: consentAt('conseils'), asOf: '2026-10-18' });
    expect(buildRecommendations(store, [], '2026-10-18').find((r) => r.detectorId === 'expatriation')!.title).toBe('Un départ à l’étranger ?');
  });

  it('plan États-Unis : FATCA, documents et conseils pour rester client', () => {
    const plan = planFor({ id: 'x', type: 'expatriation', horizon: '3_12_mois', declaredOn: ASOF, destination: 'États-Unis' })!;
    const text = JSON.stringify(plan);
    expect(text).toMatch(/FATCA/);
    expect(text).toMatch(/W-9/);
    expect(plan.advice!.title).toBe('Rester client tout en partant');
    expect(plan.sections.flatMap((s) => s.items).filter((i) => i.docKey).length).toBeGreaterThanOrEqual(4);
    expect(JSON.stringify(planFor({ id: 'y', type: 'expatriation', horizon: '3_12_mois', declaredOn: ASOF, destination: 'Canada' }))).not.toMatch(/FATCA/);
  });
});

describe('parcours Julien dans l’interface', () => {
  beforeEach(() => {
    window.location.hash = '';
    window.scrollTo = vi.fn() as never;
    Element.prototype.scrollIntoView = vi.fn();
  });
  afterEach(cleanup);

  it('question → confirmation → destination → plan → documents via izimi', async () => {
    const user = userEvent.setup();
    render(<AppProvider persist={false}><App /></AppProvider>);
    const nav = (name: RegExp) => within(screen.getByRole('navigation', { name: 'Navigation principale' })).getByRole('button', { name });

    await user.click(nav(/Mode démo/));
    await user.click(screen.getByRole('radio', { name: /Julien Vermeulen/ }));
    await user.click(screen.getByRole('button', { name: 'Charger et réinitialiser' }));
    await user.click(nav(/Mon niveau de personnalisation/));
    await user.click(screen.getByRole('button', { name: 'Choisir Conseils' }));
    await user.click(nav(/Accueil/));

    const reco = screen.getByTestId('reco-expatriation');
    expect(reco).toHaveTextContent('Un départ à l’étranger ?');
    await user.click(within(reco).getByRole('button', { name: 'Oui, c’est pertinent' }));
    await user.click(screen.getByRole('button', { name: 'Indiquer ma destination' }));
    expect(screen.getByLabelText('Projet')).toHaveProperty('value', 'expatriation');
    await user.selectOptions(screen.getByLabelText('Destination'), 'États-Unis');
    await user.click(screen.getByRole('button', { name: 'Déclarer' }));

    const plan = screen.getByTestId('plan-expatriation');
    expect(plan).toHaveTextContent('Plan de départ — États-Unis');
    expect(plan).toHaveTextContent('Rester client tout en partant');
    expect(plan).toHaveTextContent('0/17');

    await user.click(within(plan).getByRole('checkbox', { name: /Prévenir votre conseiller/ }));
    expect(plan).toHaveTextContent('1/17');

    await user.click(nav(/Mes documents/));
    await user.click(screen.getByRole('checkbox', { name: /J’autorise/ }));
    await user.click(screen.getByRole('button', { name: 'Relier mon coffre izimi (simulation)' }));
    await vi.waitFor(() => expect(screen.getByTestId('izimi-status')).toHaveTextContent('Relié'), { timeout: 3000 });

    await user.click(nav(/Mes projets/));
    await user.click(within(screen.getByTestId('plan-expatriation')).getByRole('button', { name: /Transmettre depuis izimi : Passeport/ }));
    expect(screen.getByTestId('plan-expatriation')).toHaveTextContent('2/17');
    expect(screen.getByTestId('plan-expatriation')).toHaveTextContent('Transmis via izimi');

    await user.click(nav(/Accueil/));
    expect(screen.getByTestId('reco-expatriation')).toHaveTextContent('Départ vers États-Unis : votre plan de préparation');
  }, 20000);

  it('accueil de Camille : dernier rappel en tête des paiements par priorité', async () => {
    const user = userEvent.setup();
    render(<AppProvider persist={false}><App /></AppProvider>);
    expect(screen.getByRole('alert')).toHaveTextContent('Dernier rappel');
    const first = within(screen.getByTestId('upcoming')).getAllByRole('listitem')[0];
    expect(first).toHaveTextContent('Dernier rappel — prêt habitation');
    expect(within(first).getByTestId('priority')).toHaveTextContent('Critique');
    await user.click(screen.getByRole('button', { name: 'Date' }));
    expect(within(screen.getByTestId('upcoming')).getAllByRole('listitem')[0]).toHaveTextContent('Télécommunications');
  });
});
