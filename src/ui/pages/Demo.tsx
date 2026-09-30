import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { PERSONAS, PERSONA_BY_ID } from '../../data/personas';
import { DEFAULT_CONFIG } from '../../domain/config';
import { LEVEL_LABELS } from '../../domain/consent';
import { isValidISODate } from '../../domain/dates';
import { stamp } from '../../state/appState';
import { useApp } from '../../state/AppContext';
import { useUi } from '../ui';

interface Step {
  title: string;
  expected: string;
  run: () => void;
  check: () => boolean;
}

interface Journey {
  steps: Step[];
  done: number[];
  runStep: (i: number) => void;
  clear: () => void;
}

const JourneyContext = createContext<Journey | null>(null);

/**
 * Parcours guidé. Monté au niveau de l'application pour que la vérification d'une étape
 * survive à la navigation (chaque étape ouvre l'écran où le résultat est visible).
 */
export function DemoJourneyProvider({ children }: { children: ReactNode }) {
  const { state, dispatch, recommendations } = useApp();
  const { navigate, openExplanation, explain } = useUi();
  const [pending, setPending] = useState<number | null>(null);
  const [done, setDone] = useState<number[]>([]);

  const has = (id: string) => recommendations.some((r) => r.detectorId === id);
  const reloc = recommendations.find((r) => r.detectorId === 'relocation');

  const steps: Step[] = [
    {
      title: 'Réinitialiser à Essentiel',
      expected: 'Seule l’alerte de découvert apparaît. L’analyse de déménagement ne s’exécute pas.',
      run: () => {
        dispatch({ type: 'demo/reset', personaId: 'camille' });
        navigate('accueil');
      },
      check: () =>
        state.personaId === 'camille' &&
        state.consent.level === 'essentiel' &&
        state.consent.version === 1 &&
        has('overdraft') &&
        !has('relocation') &&
        !state.lastAudit?.executed.includes('relocation'),
    },
    {
      title: 'Passer au niveau Conseils',
      expected: 'La question « Un déménagement en vue ? » apparaît à côté de l’alerte de découvert.',
      run: () => {
        dispatch({ type: 'consent', change: { type: 'level', level: 'conseils' } });
        navigate('accueil');
      },
      check: () => state.consent.level === 'conseils' && has('overdraft') && reloc?.kind === 'question',
    },
    {
      title: 'Ouvrir son explication',
      expected: 'Signaux autorisés, dépendance au niveau Conseils, score indicatif et seuil.',
      run: () => {
        navigate('accueil');
        openExplanation('relocation');
      },
      check: () => explain === 'relocation' && has('relocation'),
    },
    {
      title: 'Désactiver le signal « déménagement »',
      expected: 'La recommandation disparaît immédiatement et sa conclusion est supprimée.',
      run: () => {
        openExplanation(null);
        dispatch({ type: 'consent', change: { type: 'detector', detectorId: 'relocation', enabled: false } });
        navigate('accueil');
      },
      check: () => !state.consent.detectorToggles.relocation && !has('relocation') && !state.store.conclusions.relocation,
    },
    {
      title: 'Réactiver et confirmer le déménagement',
      expected: 'Étape suivante proposée : revoir l’assurance habitation.',
      run: () => {
        dispatch({ type: 'consent', change: { type: 'detector', detectorId: 'relocation', enabled: true } });
        dispatch({ type: 'feedback', detectorId: 'relocation', response: 'pertinent' });
        navigate('accueil');
      },
      check: () => reloc?.kind === 'etape_suivante' && reloc.nextActions.some((a) => a.id === 'review_home_insurance'),
    },
    {
      title: 'Vue complète + autorisation séparée d’un compte externe',
      expected: 'Projection d’épargne agrégée (comptes internes + compte externe fictif autorisé).',
      run: () => {
        dispatch({ type: 'consent', change: { type: 'level', level: 'complete' } });
        dispatch({
          type: 'consent',
          change: { type: 'external_authorize', authorization: { simulated: true, accountIds: ['ext-horizon'], grantedAt: stamp(state.demoDate, state.clock + 2) } },
        });
        navigate('accueil');
      },
      check: () => state.consent.level === 'complete' && !!state.consent.externalAuthorization && has('savings_goal'),
    },
    {
      title: 'Revenir à Essentiel',
      expected: 'Les recommandations supplémentaires et les conclusions restreintes disparaissent.',
      run: () => {
        dispatch({ type: 'consent', change: { type: 'level', level: 'essentiel' } });
        navigate('accueil');
      },
      check: () =>
        state.consent.level === 'essentiel' &&
        state.consent.version > 1 &&
        !has('relocation') &&
        !has('savings_goal') &&
        !state.store.conclusions.relocation &&
        !state.store.conclusions.savings_goal,
    },
    {
      title: 'Ouvrir les résultats d’évaluation',
      expected: 'Métriques réelles calculées sur le jeu synthétique étiqueté, avec leurs limites.',
      run: () => navigate('evaluation'),
      check: () => true,
    },
  ];

  const pendingOk = pending !== null && steps[pending].check();
  useEffect(() => {
    if (pending !== null && pendingOk) {
      setDone((d) => (d.includes(pending) ? d : [...d, pending]));
      setPending(null);
    }
  }, [pending, pendingOk]);

  const runStep = (i: number) => {
    if (i === 0) setDone([]);
    setPending(i);
    steps[i].run();
  };

  return <JourneyContext.Provider value={{ steps, done, runStep, clear: () => setDone([]) }}>{children}</JourneyContext.Provider>;
}

function useJourney(): Journey {
  const ctx = useContext(JourneyContext);
  if (!ctx) throw new Error('useJourney doit être utilisé dans DemoJourneyProvider');
  return ctx;
}

export function Demo() {
  const { state, dispatch } = useApp();
  const { steps, done, runStep, clear } = useJourney();
  const [personaId, setPersonaId] = useState(state.personaId);
  const [date, setDate] = useState(state.demoDate);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Mode démo</h1>
          <p>Même registre synthétique à chaque étape : seul le consentement change. Chaque étape peut être rejouée.</p>
        </div>
        <button className="btn btn-primary" onClick={() => runStep(0)}>Tout réinitialiser</button>
      </div>

      <div className="grid grid-2">
        <section className="card" aria-labelledby="persona-titre">
          <h2 id="persona-titre">Persona et scénario</h2>
          <div className="stack" style={{ marginTop: 12 }}>
            {PERSONAS.map((p) => (
              <label key={p.id} className="checkbox">
                <input type="radio" name="persona" value={p.id} checked={personaId === p.id} onChange={() => setPersonaId(p.id)} />
                <span>
                  <span className="strong">{p.name}</span> — {p.tagline}
                  <span className="xsmall muted" style={{ display: 'block' }}>{p.description}</span>
                </span>
              </label>
            ))}
            <div>
              <button
                className="btn btn-teal"
                onClick={() => {
                  dispatch({ type: 'demo/reset', personaId });
                  setDate(PERSONA_BY_ID[personaId].referenceDate);
                  clear();
                }}
              >
                Charger et réinitialiser
              </button>
            </div>
          </div>
        </section>

        <section className="card" aria-labelledby="clock-titre">
          <h2 id="clock-titre">Horloge de démo</h2>
          <p className="card-sub">Toutes les projections, échéances et périodes de repos utilisent cette date.</p>
          <form
            className="form-row"
            style={{ marginTop: 12 }}
            onSubmit={(e) => {
              e.preventDefault();
              if (isValidISODate(date)) dispatch({ type: 'demo/date', date });
            }}
          >
            <div className="field">
              <label htmlFor="demo-date">Date</label>
              <input id="demo-date" type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <button type="submit" className="btn" disabled={!isValidISODate(date) || date === state.demoDate}>Appliquer</button>
          </form>
          <ul className="bullets small" style={{ marginTop: 12 }}>
            <li>Actuel : <strong>{state.demoDate}</strong>, persona <strong>{PERSONA_BY_ID[state.personaId].name}</strong>, niveau <strong>{LEVEL_LABELS[state.consent.level]}</strong>.</li>
            <li>« Non » masque une suggestion {DEFAULT_CONFIG.feedback.rejectCooldownDays} jours ; « Plus tard », {DEFAULT_CONFIG.feedback.snoozeDays} jours. Avancez l’horloge pour le vérifier.</li>
            <li>Le registre est régénéré de façon déterministe jusqu’à cette date (aucune donnée réelle).</li>
          </ul>
        </section>
      </div>

      <section className="card" aria-labelledby="journey-titre">
        <h2 id="journey-titre">Parcours de présentation guidé</h2>
        <p className="card-sub">Chaque étape effectue l’action réelle dans l’application ; la coche indique que le résultat attendu a été constaté après l’étape.</p>
        <ol style={{ listStyle: 'none', padding: 0, margin: '8px 0 0' }}>
          {steps.map((s, i) => {
            const ok = done.includes(i);
            return (
              <li className="step" key={s.title}>
                <span className={`step-num ${ok ? 'done' : ''}`} aria-hidden="true">{ok ? '✓' : i + 1}</span>
                <div>
                  <div className="strong">{s.title}</div>
                  <div className="small muted">{s.expected}</div>
                  {ok && <span className="sr-only">Résultat constaté.</span>}
                </div>
                <button className="btn btn-sm" onClick={() => runStep(i)}>Exécuter l’étape {i + 1}</button>
              </li>
            );
          })}
        </ol>
      </section>
    </>
  );
}
