import { useCallback, useEffect, useState } from 'react';
import { LEVEL_LABELS } from '../domain/consent';
import { formatDateLong } from '../domain/dates';
import { useApp } from '../state/AppContext';
import { Icon, Toast } from './components/common';
import { ExplanationDialog } from './components/Recommendations';
import { Advisor } from './pages/Advisor';
import { Demo, DemoJourneyProvider } from './pages/Demo';
import { Documents } from './pages/Documents';
import { Evaluation } from './pages/Evaluation';
import { Home } from './pages/Home';
import { Personalization } from './pages/Personalization';
import { Projects } from './pages/Projects';
import { PAGES, UiContext, type Page } from './ui';
import type { DetectorId, IntentionType } from '../domain/types';

function pageFromHash(): Page {
  const h = typeof window !== 'undefined' ? window.location.hash.replace('#', '') : '';
  return (PAGES.find((p) => p.id === h)?.id ?? 'accueil') as Page;
}

export function App() {
  const { state } = useApp();
  const [page, setPage] = useState<Page>(pageFromHash);
  const [explain, setExplain] = useState<DetectorId | null>(null);
  const [intentPreset, setIntentPreset] = useState<IntentionType | null>(null);

  const navigate = useCallback((p: Page) => {
    setPage(p);
    if (window.location.hash !== `#${p}`) window.history.replaceState(null, '', `#${p}`);
    window.scrollTo?.({ top: 0 });
    requestAnimationFrame(() => document.getElementById('main')?.focus({ preventScroll: true }));
  }, []);

  useEffect(() => {
    const onHash = () => setPage(pageFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const enabled = state.consent.anticipationEnabled;

  return (
    <UiContext.Provider value={{ page, navigate, explain, openExplanation: setExplain, intentPreset, setIntentPreset }}>
      <DemoJourneyProvider>
      <div className="app">
        <a href="#main" className="skip-link">Aller au contenu</a>
        <header className="topbar">
          <div className="topbar-inner">
            <button className="brand" onClick={() => navigate('accueil')} aria-label="Anticipe — accueil">
              <span className="brand-mark" aria-hidden="true">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 17l6-9 4 5 2-3 6 7" />
                </svg>
              </span>
              <span>
                <span className="brand-name">Anticipe</span>
                <span className="brand-tag">Plus vous nous faites confiance, mieux on vous aide, et c’est vous qui décidez.</span>
              </span>
            </button>
            <div className="topbar-right">
              <span className="badge" title="Horloge de démo">Démo · {formatDateLong(state.demoDate)}</span>
              <button className={`consent-pill ${enabled ? '' : 'off'}`} onClick={() => navigate('personnalisation')} aria-label={`Niveau de personnalisation : ${enabled ? LEVEL_LABELS[state.consent.level] : 'anticipation désactivée'}. Modifier`}>
                <span className="dot" aria-hidden="true" />
                {enabled ? LEVEL_LABELS[state.consent.level] : 'Désactivée'}
              </button>
            </div>
          </div>
          <div className="demo-banner">
            Prototype de démonstration indépendant — données 100 % synthétiques, aucune connexion bancaire réelle, aucune certification réglementaire.
          </div>
        </header>

        <div className="layout">
          <nav className="sidenav" aria-label="Navigation principale">
            {PAGES.map((p) => (
              <button key={p.id} type="button" className="navbtn" aria-current={page === p.id ? 'page' : undefined} onClick={() => navigate(p.id)}>
                <Icon name={p.icon} />
                {p.label}
              </button>
            ))}
          </nav>
          <main id="main" className="main" tabIndex={-1} style={{ outline: 'none' }}>
            {page === 'accueil' && <Home />}
            {page === 'personnalisation' && <Personalization />}
            {page === 'projets' && <Projects />}
            {page === 'documents' && <Documents />}
            {page === 'conseiller' && <Advisor />}
            {page === 'demo' && <Demo />}
            {page === 'evaluation' && <Evaluation />}
          </main>
        </div>
        <ExplanationDialog />
        <Toast />
      </div>
      </DemoJourneyProvider>
    </UiContext.Provider>
  );
}
