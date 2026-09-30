import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FORMALITIES } from '../advisor/formalities';
import { analyzeCase, buildClientRequest } from '../advisor/logic';
import { PROCEDURES } from '../advisor/procedures';
import { createTemplateCase, seedAdvisorCases } from '../advisor/seed';
import { initialState, reducer } from '../state/appState';
import { AppProvider } from '../state/AppContext';
import { App } from '../ui/App';

const ASOF = '2026-10-18';
const allCases = () => [
  ...seedAdvisorCases('t'),
  ...FORMALITIES.filter((f) => f.mode === 'modele').map((f) => createTemplateCase(f.id, `T-${f.id}`, 't')),
];

describe('guidage des constats', () => {
  it('chaque constat de chaque dossier a une procédure existante', () => {
    for (const c of allCases()) {
      for (const f of analyzeCase(c, ASOF)) {
        expect(f.guide, `${c.id} : ${f.text}`).toBeDefined();
        expect(PROCEDURES[f.guide!.procedureId], f.guide!.procedureId).toBeDefined();
      }
    }
  });

  it('un constat par pièce manquante, chacun pointant vers son élément de liste', () => {
    const c = seedAdvisorCases('t').find((x) => x.id === 'DOS-001')!;
    const missing = analyzeCase(c, ASOF).filter((f) => f.text.startsWith('Pièce manquante'));
    expect(missing.map((f) => f.guide!.procedureId)).toEqual(['justificatif_domicile', 'formulaire_signe']);
    expect(missing.map((f) => f.guide!.target)).toEqual([
      { section: 'checklist', key: 'addr' },
      { section: 'checklist', key: 'form' },
    ]);
    const phone = analyzeCase(c, ASOF).find((f) => f.text.includes('téléphone'))!;
    expect(phone.guide!.target).toEqual({ section: 'payload', key: 'telephone' });
  });

  it('la demande au client reprend les documents acceptés et reste un brouillon', () => {
    const c = seedAdvisorCases('t').find((x) => x.id === 'DOS-001')!;
    const f = analyzeCase(c, ASOF).find((x) => x.guide?.procedureId === 'justificatif_domicile')!;
    const req = buildClientRequest(c, f.guide!)!;
    expect(req.body).toMatch(/Bonjour Lucas Fontaine/);
    expect(req.body).toMatch(/Facture d’énergie/);
    expect(req.body).toMatch(/non envoyé/);
  });

  it('aucune demande au client pour une correspondance sanctions ni pour un contrôle interne', () => {
    for (const c of seedAdvisorCases('t')) {
      for (const f of analyzeCase(c, ASOF)) {
        if (['correspondance_sanctions', 'controle_visuel', 'repere_credit', 'texte_non_fiable'].includes(f.guide!.procedureId)) {
          expect(buildClientRequest(c, f.guide!)).toBeNull();
        }
      }
    }
  });

  it('préparer une demande est tracé et ne se duplique pas', () => {
    let s = initialState();
    s = reducer(s, { type: 'case/request', caseId: 'DOS-001', subject: 'Demande : x', body: 'corps' });
    s = reducer(s, { type: 'case/request', caseId: 'DOS-001', subject: 'Demande : x', body: 'corps' });
    const c = s.advisorCases.find((x) => x.id === 'DOS-001')!;
    expect(c.clientRequests).toHaveLength(1);
    expect(s.notice?.tone).toBe('error');
    expect(c.audit.at(-1)!.action).toMatch(/brouillon non envoyé/);
    s = reducer(s, { type: 'case/request-remove', caseId: 'DOS-001', requestId: c.clientRequests![0].id });
    expect(s.advisorCases.find((x) => x.id === 'DOS-001')!.clientRequests).toHaveLength(0);
  });
});

describe('guidage dans l’interface', () => {
  beforeEach(() => {
    window.location.hash = 'conseiller';
    window.scrollTo = vi.fn() as never;
    Element.prototype.scrollIntoView = vi.fn();
  });
  afterEach(cleanup);

  it('« Que faire ? » ouvre la procédure, prépare la demande et conduit à la pièce', async () => {
    const user = userEvent.setup();
    render(<AppProvider persist={false}><App /></AppProvider>);
    await user.click(screen.getByRole('button', { name: /Ouverture de compte — Lucas Fontaine/ }));

    await user.click(screen.getByRole('button', { name: 'Que faire ? Pièce manquante : Justificatif de domicile.' }));
    const dialog = screen.getByRole('dialog', { name: 'Obtenir un justificatif de domicile' });
    expect(within(dialog).getByText('Avis d’imposition')).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Préparer une demande au client (brouillon)' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    const req = await screen.findByTestId('client-request');
    expect(req).toHaveTextContent('Demande : justificatif de domicile');
    expect(req).toHaveTextContent('non envoyé');

    await user.click(screen.getByRole('button', { name: 'Que faire ? Pièce manquante : Justificatif de domicile.' }));
    expect(screen.getByRole('button', { name: 'Demande au client déjà préparée' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Aller à la pièce dans la liste de contrôle' }));
    const item = document.getElementById('chk-DOS-001-addr')!;
    await vi.waitFor(() => expect(document.activeElement).toBe(item));
    expect(item).toHaveClass('flash');

    await user.click(screen.getByRole('button', { name: 'Que faire ? Pièce manquante : Formulaire client signé.' }));
    await user.click(screen.getByRole('button', { name: /Préparer l’import du document/ }));
    await vi.waitFor(() => expect(document.activeElement).toBe(document.getElementById('doc-text-DOS-001')));
    // `.value` (valeur réellement soumise) : jsdom garde aussi l'option initiale marquée « selected ».
    await vi.waitFor(() => expect((screen.getByLabelText('Type') as HTMLSelectElement).value).toBe('Contrat'));
  });
});
