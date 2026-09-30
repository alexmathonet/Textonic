import { render, screen, within, waitFor, act, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProvider } from '../state/AppContext';
import { App } from '../ui/App';

function setup() {
  window.location.hash = '';
  const user = userEvent.setup();
  render(
    <AppProvider persist={false}>
      <App />
    </AppProvider>,
  );
  return user;
}

const recos = () => within(screen.getByTestId('recommendations'));
const nav = (name: RegExp) => within(screen.getByRole('navigation', { name: 'Navigation principale' })).getByRole('button', { name });

beforeEach(() => {
  window.scrollTo = vi.fn() as never;
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(cleanup);

describe('parcours de démonstration du consentement (bout en bout, même registre)', () => {
  it('Essentiel → Conseils → explication → désactivation → confirmation → Vue complète → Essentiel', async () => {
    const user = setup();

    // 1. Essentiel : seule l'alerte de découvert.
    expect(screen.getByTestId('consent-level')).toHaveTextContent('Essentiel');
    expect(recos().getByTestId('reco-overdraft')).toBeInTheDocument();
    expect(recos().queryByTestId('reco-relocation')).toBeNull();
    const balanceBefore = screen.getByTestId('balance').textContent;

    // 2. Conseils.
    await user.click(nav(/Mon niveau de personnalisation/));
    await user.click(screen.getByRole('button', { name: 'Choisir Conseils' }));
    expect(screen.getByTestId('executed')).toHaveTextContent('Déménagement possible');
    await user.click(nav(/Accueil/));
    expect(recos().getByText('Un déménagement en vue ?')).toBeInTheDocument();
    expect(recos().getByTestId('reco-overdraft')).toBeInTheDocument();
    expect(screen.getByTestId('balance').textContent).toBe(balanceBefore);

    // 3. Explication (et fermeture au clavier).
    const reloc = recos().getByTestId('reco-relocation');
    await user.click(within(reloc).getByRole('button', { name: 'Pourquoi je vois ceci ?' }));
    const dialog = screen.getByRole('dialog', { name: 'Pourquoi je vois ceci ?' });
    expect(within(dialog).getByText('Recours récent à un service de déménagement')).toBeInTheDocument();
    expect(within(dialog).getByText(/Évolution de vos habitudes non sensibles/)).toBeInTheDocument();
    expect(within(dialog).getByText(/pas une probabilité calibrée/)).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();

    // 4. Désactiver le signal : disparition immédiate.
    await user.click(within(recos().getByTestId('reco-relocation')).getByRole('button', { name: 'Désactiver ce signal' }));
    expect(recos().queryByTestId('reco-relocation')).toBeNull();
    expect(recos().getByTestId('reco-overdraft')).toBeInTheDocument();

    // 5. Réactiver puis confirmer.
    await user.click(nav(/Mon niveau de personnalisation/));
    await user.click(screen.getByRole('switch', { name: 'Signal Déménagement possible' }));
    await user.click(nav(/Accueil/));
    await user.click(within(recos().getByTestId('reco-relocation')).getByRole('button', { name: 'Oui, c’est pertinent' }));
    expect(recos().getByText('Déménagement : pensez à votre assurance habitation')).toBeInTheDocument();
    expect(recos().getByRole('button', { name: 'Revoir mon assurance habitation' })).toBeInTheDocument();

    // 6. Vue complète : pas de projection tant que le compte externe n'est pas autorisé.
    await user.click(nav(/Mon niveau de personnalisation/));
    await user.click(screen.getByRole('button', { name: 'Choisir Vue complète' }));
    await user.click(nav(/Accueil/));
    expect(recos().queryByTestId('reco-savings_goal')).toBeNull();

    await user.click(nav(/Mes projets/));
    await user.click(screen.getByRole('button', { name: /Autoriser un compte externe/ }));
    const connect = screen.getByRole('dialog', { name: 'Autoriser un compte externe' });
    await user.click(within(connect).getByRole('checkbox', { name: /Banque Horizon/ }));
    await user.click(within(connect).getByRole('checkbox', { name: /J’autorise/ }));
    await user.click(within(connect).getByRole('button', { name: 'Autoriser (simulation)' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull(), { timeout: 3000 });
    await user.click(nav(/Accueil/));
    expect(recos().getByTestId('reco-savings_goal')).toHaveTextContent('Apport pour un futur logement');

    // 7. Retour à Essentiel : les recommandations supplémentaires disparaissent.
    await user.click(nav(/Mon niveau de personnalisation/));
    await user.click(screen.getByRole('button', { name: 'Choisir Essentiel' }));
    expect(screen.getByText(/9 conclusions supprimées/)).toBeInTheDocument();
    await user.click(nav(/Accueil/));
    expect(recos().queryByTestId('reco-relocation')).toBeNull();
    expect(recos().queryByTestId('reco-savings_goal')).toBeNull();
    expect(recos().getByTestId('reco-overdraft')).toBeInTheDocument();

    // 8. Évaluation : résultats réels.
    await user.click(nav(/Évaluation/));
    await user.click(screen.getByRole('button', { name: 'Lancer l’évaluation' }));
    await waitFor(() => expect(screen.getByTestId('sample-size')).toHaveTextContent('49'));
    for (const el of screen.getAllByTestId('safety-value')) expect(el).toHaveTextContent('0');
  }, 20000);

  it('état d’erreur de la connexion externe simulée', async () => {
    const user = setup();
    await user.click(nav(/Mon niveau de personnalisation/));
    await user.click(screen.getByRole('button', { name: 'Choisir Vue complète' }));
    await user.click(nav(/Mes projets/));
    await user.click(screen.getByRole('button', { name: /Autoriser un compte externe/ }));
    const connect = screen.getByRole('dialog');
    await user.click(within(connect).getByRole('checkbox', { name: /Banque Lointaine/ }));
    await user.click(within(connect).getByRole('checkbox', { name: /J’autorise/ }));
    await user.click(within(connect).getByRole('button', { name: 'Autoriser (simulation)' }));
    await waitFor(() => expect(within(connect).getByRole('alert')).toHaveTextContent(/indisponible/), { timeout: 3000 });
  });
});

describe('utilisation au clavier', () => {
  it('navigation et interrupteurs utilisables au clavier', async () => {
    const user = setup();
    const personalization = nav(/Mon niveau de personnalisation/);
    personalization.focus();
    await user.keyboard('{Enter}');
    expect(personalization).toHaveAttribute('aria-current', 'page');
    // Laisse passer le déplacement de focus vers le contenu principal après navigation.
    await act(() => new Promise((r) => requestAnimationFrame(() => r(undefined))));
    expect(document.activeElement).toBe(screen.getByRole('main'));

    const global = screen.getByRole('switch', { name: 'Anticipation optionnelle' });
    global.focus();
    await user.keyboard(' ');
    expect(global).toHaveAttribute('aria-checked', 'false');
    await user.click(nav(/Accueil/));
    expect(screen.getByText('Anticipation désactivée', { selector: 'strong' })).toBeInTheDocument();
  });

  it('le dialogue d’explication garde le focus et se ferme avec Échap', async () => {
    const user = setup();
    await user.click(within(recos().getByTestId('reco-overdraft')).getByRole('button', { name: 'Pourquoi je vois ceci ?' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog.contains(document.activeElement)).toBe(true);
    for (let i = 0; i < 5; i++) await user.tab();
    expect(dialog.contains(document.activeElement)).toBe(true);
    await act(async () => {
      await user.keyboard('{Escape}');
    });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
