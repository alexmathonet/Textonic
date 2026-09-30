import { useEffect, useRef, useState } from 'react';
import { izimiVault } from '../../data/izimi';
import { planFor, planItemIds, type Plan } from '../../data/plans';
import { LEVEL_LABELS } from '../../domain/consent';
import { formatDateLong } from '../../domain/dates';
import { eur, formatEUR } from '../../domain/money';
import type { DeclaredIntention, IntentionType } from '../../domain/types';
import { stamp } from '../../state/appState';
import { useApp } from '../../state/AppContext';
import { Empty, Modal, Spinner } from '../components/common';
import { useUi } from '../ui';

const INTENTION_LABELS: Record<IntentionType, string> = {
  demenagement: 'Déménagement',
  vehicule: 'Achat d’un véhicule',
  logement: 'Projet immobilier',
  emploi: 'Changement professionnel',
  expatriation: 'Expatriation (départ à l’étranger)',
  naissance: 'Naissance attendue',
  premier_emploi: 'Premier emploi',
  separation: 'Séparation',
};

const DESTINATIONS = ['États-Unis', 'Canada', 'Royaume-Uni', 'Suisse', 'Autre pays'];
const HORIZON_LABELS: Record<DeclaredIntention['horizon'], string> = {
  moins_3_mois: 'Moins de 3 mois',
  '3_12_mois': 'Entre 3 et 12 mois',
  plus_12_mois: 'Plus de 12 mois',
};

export function Projects() {
  const { state, dispatch, allowed, data } = useApp();
  const { navigate, intentPreset, setIntentPreset } = useUi();
  const [type, setType] = useState<IntentionType>(intentPreset ?? 'demenagement');
  const [destination, setDestination] = useState(DESTINATIONS[0]);
  useEffect(() => {
    if (intentPreset) {
      setType(intentPreset);
      setIntentPreset(null);
    }
  }, [intentPreset, setIntentPreset]);
  const [horizon, setHorizon] = useState<DeclaredIntention['horizon']>('moins_3_mois');
  const [goalLabel, setGoalLabel] = useState('');
  const [goalTarget, setGoalTarget] = useState('');
  const [goalDeadline, setGoalDeadline] = useState('');
  const [goalError, setGoalError] = useState<string | null>(null);
  const [connectOpen, setConnectOpen] = useState(false);

  const intentionsUsed = allowed.has('intentions.declared');
  const goalsUsed = allowed.has('goals.declared');
  const c = state.consent;

  const submitGoal = (e: React.FormEvent) => {
    e.preventDefault();
    const target = Number(goalTarget.replace(',', '.'));
    if (!goalLabel.trim()) return setGoalError('Donnez un nom à votre objectif.');
    if (!Number.isFinite(target) || target <= 0) return setGoalError('Indiquez un montant positif.');
    if (!goalDeadline || goalDeadline <= state.demoDate) return setGoalError('Choisissez une échéance future.');
    setGoalError(null);
    dispatch({ type: 'goal/add', goal: { label: goalLabel.trim().slice(0, 60), target: eur(target), deadline: goalDeadline } });
    setGoalLabel('');
    setGoalTarget('');
    setGoalDeadline('');
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Mes projets</h1>
          <p>Ce que vous déclarez ici n’est utilisé que si votre niveau de personnalisation l’autorise.</p>
        </div>
      </div>

      <div className="grid grid-2">
        <section className="card" aria-labelledby="int-titre">
          <div className="card-head">
            <div>
              <h2 id="int-titre">Intentions déclarées</h2>
              <p className="card-sub">Une intention explicite est un signal fort : elle suffit à vous proposer un accompagnement.</p>
            </div>
            <span className={`badge ${intentionsUsed ? 'badge-teal' : ''}`}>{intentionsUsed ? 'Utilisées (Conseils)' : 'Non utilisées à votre niveau'}</span>
          </div>
          {state.intentions.length === 0 ? (
            <Empty title="Aucune intention déclarée" />
          ) : (
            <ul className="list">
              {state.intentions.map((i) => (
                <li key={i.id}>
                  <div>
                    <div className="strong small">{INTENTION_LABELS[i.type]}{i.destination ? ` — ${i.destination}` : ''}</div>
                    <div className="xsmall muted">{HORIZON_LABELS[i.horizon]} · déclarée le {formatDateLong(i.declaredOn)}</div>
                  </div>
                  <button className="btn btn-sm btn-danger" onClick={() => dispatch({ type: 'intention/remove', id: i.id })}>
                    Retirer
                  </button>
                </li>
              ))}
            </ul>
          )}
          <form
            className="form-row"
            style={{ marginTop: 14 }}
            onSubmit={(e) => {
              e.preventDefault();
              dispatch({ type: 'intention/add', intention: { type, horizon, ...(type === 'expatriation' ? { destination } : {}) } });
            }}
          >
            <div className="field">
              <label htmlFor="int-type">Projet</label>
              <select id="int-type" className="select" value={type} onChange={(e) => setType(e.target.value as IntentionType)}>
                {Object.entries(INTENTION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            {type === 'expatriation' && (
              <div className="field">
                <label htmlFor="int-destination">Destination</label>
                <select id="int-destination" className="select" value={destination} onChange={(e) => setDestination(e.target.value)}>
                  {DESTINATIONS.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
            )}
            <div className="field">
              <label htmlFor="int-horizon">Horizon</label>
              <select id="int-horizon" className="select" value={horizon} onChange={(e) => setHorizon(e.target.value as DeclaredIntention['horizon'])}>
                {Object.entries(HORIZON_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <button type="submit" className="btn btn-primary">Déclarer</button>
          </form>
        </section>

        <section className="card" aria-labelledby="goal-titre">
          <div className="card-head">
            <div>
              <h2 id="goal-titre">Objectifs d’épargne</h2>
              <p className="card-sub">Projetés uniquement au niveau Vue complète, avec un compte externe autorisé.</p>
            </div>
            <span className={`badge ${goalsUsed ? 'badge-teal' : ''}`}>{goalsUsed ? 'Utilisés (Vue complète)' : 'Non utilisés à votre niveau'}</span>
          </div>
          {state.goals.length === 0 ? (
            <Empty title="Aucun objectif" />
          ) : (
            <ul className="list">
              {state.goals.map((g) => (
                <li key={g.id}>
                  <div>
                    <div className="strong small">{g.label}</div>
                    <div className="xsmall muted">{formatEUR(g.target)} avant le {formatDateLong(g.deadline)}</div>
                  </div>
                  <button className="btn btn-sm btn-danger" onClick={() => dispatch({ type: 'goal/remove', id: g.id })}>Retirer</button>
                </li>
              ))}
            </ul>
          )}
          <form className="stack" style={{ marginTop: 14 }} onSubmit={submitGoal} noValidate>
            <div className="form-row">
              <div className="field">
                <label htmlFor="goal-label">Nom</label>
                <input id="goal-label" className="input" value={goalLabel} maxLength={60} onChange={(e) => setGoalLabel(e.target.value)} placeholder="Ex. Apport" />
              </div>
              <div className="field">
                <label htmlFor="goal-target">Montant (€)</label>
                <input id="goal-target" className="input" inputMode="decimal" value={goalTarget} onChange={(e) => setGoalTarget(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="goal-deadline">Échéance</label>
                <input id="goal-deadline" type="date" className="input" value={goalDeadline} onChange={(e) => setGoalDeadline(e.target.value)} />
              </div>
            </div>
            {goalError && <p className="error-text" role="alert">{goalError}</p>}
            <div><button type="submit" className="btn btn-primary">Ajouter l’objectif</button></div>
          </form>
        </section>
      </div>

      {state.intentions.map((i) => {
        const plan = planFor(i);
        return plan ? <PlanCard key={i.id} intention={i} plan={plan} /> : null;
      })}

      <section className="card" aria-labelledby="ext-titre">
        <div className="card-head">
          <div>
            <h2 id="ext-titre">Comptes externes (connexion simulée)</h2>
            <p className="card-sub">Démonstration : aucun établissement réel n’est contacté. Les soldes sont fictifs et seulement agrégés.</p>
          </div>
          <span className={`badge ${c.externalAuthorization ? 'badge-success' : ''}`}>
            {c.externalAuthorization ? `Autorisé le ${c.externalAuthorization.grantedAt.replace('T', ' ').slice(0, 16)}` : 'Non autorisé'}
          </span>
        </div>
        {c.level !== 'complete' ? (
          <div className="alert alert-warn">
            <span>
              La connexion de comptes externes nécessite le niveau <strong>Vue complète</strong> (actuel : {LEVEL_LABELS[c.level]}). Le choix du niveau
              ne connecte rien automatiquement.{' '}
              <button className="btn btn-sm btn-ghost" onClick={() => navigate('personnalisation')}>Changer de niveau</button>
            </span>
          </div>
        ) : c.externalAuthorization ? (
          <div className="stack">
            <ul className="list">
              {state.consent.externalAuthorization!.accountIds.map((id) => {
                const a = data.customer.externalAccounts.find((x) => x.id === id);
                return (
                  <li key={id}>
                    <span className="small strong">{a?.institution ?? id}</span>
                    <span className="small muted">Agrégé : {a ? formatEUR(a.balance) : '—'}</span>
                  </li>
                );
              })}
            </ul>
            <div>
              <button className="btn btn-danger" onClick={() => dispatch({ type: 'consent', change: { type: 'external_revoke' } })}>
                Révoquer l’autorisation
              </button>
            </div>
          </div>
        ) : (
          <button className="btn btn-teal" onClick={() => setConnectOpen(true)}>
            Autoriser un compte externe (simulation)
          </button>
        )}
      </section>

      {connectOpen && (
        <ConnectDialog
          onClose={() => setConnectOpen(false)}
          onDone={(ids) => {
            dispatch({
              type: 'consent',
              change: { type: 'external_authorize', authorization: { simulated: true, accountIds: ids, grantedAt: stamp(state.demoDate, state.clock + 1) } },
            });
            setConnectOpen(false);
          }}
        />
      )}
    </>
  );
}

function ConnectDialog({ onClose, onDone }: { onClose: () => void; onDone: (ids: string[]) => void }) {
  const { data } = useApp();
  const accounts = data.customer.externalAccounts;
  const [selected, setSelected] = useState<string[]>([]);
  const [agree, setAgree] = useState(false);
  const [phase, setPhase] = useState<'form' | 'loading' | 'error' | 'success'>('form');
  const [error, setError] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const connect = () => {
    setPhase('loading');
    timer.current = setTimeout(() => {
      const unavailable = accounts.filter((a) => selected.includes(a.id) && !a.available);
      if (unavailable.length) {
        setError(`${unavailable.map((a) => a.institution).join(', ')} : service indisponible (erreur simulée). Aucune donnée n’a été lue.`);
        setPhase('error');
        return;
      }
      setPhase('success');
      timer.current = setTimeout(() => onDone(selected), 700);
    }, 900);
  };

  return (
    <Modal
      title="Autoriser un compte externe"
      onClose={onClose}
      footer={
        phase === 'form' || phase === 'error' ? (
          <>
            <button className="btn" onClick={onClose}>Annuler</button>
            <button className="btn btn-teal" disabled={!agree || selected.length === 0} onClick={connect}>
              {phase === 'error' ? 'Réessayer' : 'Autoriser (simulation)'}
            </button>
          </>
        ) : undefined
      }
    >
      <div className="alert alert-info" style={{ marginBottom: 12 }}>
        <span>Connexion SIMULÉE : aucun identifiant n’est demandé et aucun établissement réel n’est contacté.</span>
      </div>
      {phase === 'loading' && <Spinner label="Connexion simulée en cours…" />}
      {phase === 'success' && <div className="alert alert-success"><span>Autorisation enregistrée.</span></div>}
      {(phase === 'form' || phase === 'error') && (
        <div className="stack">
          {phase === 'error' && <div className="alert alert-danger" role="alert"><span>{error}</span></div>}
          <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="strong small" style={{ marginBottom: 6 }}>Établissements fictifs</legend>
            {accounts.map((a) => (
              <label key={a.id} className="checkbox">
                <input
                  type="checkbox"
                  checked={selected.includes(a.id)}
                  onChange={(e) => setSelected((s) => (e.target.checked ? [...s, a.id] : s.filter((x) => x !== a.id)))}
                />
                <span>
                  <span className="strong">{a.institution}</span>
                  <span className="xsmall muted" style={{ display: 'block' }}>Compte {a.kind === 'epargne' ? 'd’épargne' : 'courant'}{a.available ? '' : ' — indisponible (démontre l’état d’erreur)'}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <label className="checkbox">
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
            <span className="small">
              J’autorise, à titre de démonstration, la lecture du solde agrégé et de l’épargne mensuelle nette de ces comptes, pour la seule finalité de
              personnalisation. Je peux révoquer cette autorisation à tout moment.
            </span>
          </label>
        </div>
      )}
    </Modal>
  );
}

/** Plan d'accompagnement d'un projet déclaré : liste à cocher, documents via izimi (simulé), conseils. */
function PlanCard({ intention, plan }: { intention: DeclaredIntention; plan: Plan }) {
  const { state, dispatch } = useApp();
  const { navigate } = useUi();
  const vault = izimiVault(state.personaId);
  const linked = !!state.izimi.linkedAt;
  const checked = state.planProgress[intention.id] ?? [];
  const importedDoc = (key?: string) => {
    const d = key ? vault.find((v) => v.docKey === key) : undefined;
    return d ? { doc: d, done: state.izimi.imported.some((x) => x.izimiDocId === d.id) } : null;
  };
  const isDone = (itemId: string, docKey?: string) => checked.includes(itemId) || !!importedDoc(docKey)?.done;
  const ids = planItemIds(plan);
  const doneCount = plan.sections.flatMap((s) => s.items).filter((it) => isDone(it.id, it.docKey)).length;
  const pct = Math.round((doneCount / ids.length) * 100);

  return (
    <section className="card" id={`plan-${intention.type}`} aria-labelledby={`plan-titre-${intention.id}`} data-testid={`plan-${intention.type}`}>
      <div className="card-head">
        <div>
          <h2 id={`plan-titre-${intention.id}`}>{plan.title}</h2>
          <p className="card-sub">{plan.intro}</p>
        </div>
        <span className="badge badge-teal">{doneCount}/{ids.length} fait{doneCount > 1 ? 's' : ''}</span>
      </div>
      <div role="progressbar" aria-label="Avancement du plan" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}
        style={{ height: 8, background: '#e3e9f2', borderRadius: 999, marginBottom: 14 }}>
        <div style={{ width: `${pct}%`, height: '100%', background: 'var(--teal)', borderRadius: 999 }} />
      </div>
      <div className="stack-lg">
        {plan.sections.map((sec) => (
          <div key={sec.title}>
            <h3 className="section-title" style={{ marginTop: 0 }}>{sec.title}</h3>
            <ul className="list">
              {sec.items.map((it) => {
                const iz = importedDoc(it.docKey);
                const done = isDone(it.id, it.docKey);
                return (
                  <li key={it.id} style={{ alignItems: 'flex-start' }}>
                    <label className="checkbox" style={{ flex: 1 }}>
                      <input type="checkbox" checked={done} disabled={!!iz?.done} onChange={() => dispatch({ type: 'plan/toggle', intentionId: intention.id, itemId: it.id })} />
                      <span>
                        <span className="small strong" style={{ textDecoration: done ? 'line-through' : undefined }}>{it.label}</span>
                        {it.detail && <span className="xsmall muted" style={{ display: 'block' }}>{it.detail}</span>}
                      </span>
                    </label>
                    {iz && (iz.done ? (
                      <span className="badge badge-success">Transmis via izimi</span>
                    ) : linked ? (
                      <button className="btn btn-sm btn-teal" onClick={() => dispatch({ type: 'izimi/import', izimiDocId: iz.doc.id })}
                        aria-label={`Transmettre depuis izimi : ${iz.doc.name}`}>
                        Transmettre depuis izimi
                      </button>
                    ) : (
                      <button className="btn btn-sm" onClick={() => navigate('documents')}>Relier izimi</button>
                    ))}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
        {plan.advice && (
          <div className="alert alert-success" style={{ display: 'block' }}>
            <strong>{plan.advice.title}</strong>
            <ul className="bullets small" style={{ marginTop: 6 }}>
              {plan.advice.points.map((p) => <li key={p}>{p}</li>)}
            </ul>
          </div>
        )}
        <div className="row">
          <button className="btn" onClick={() => dispatch({ type: 'notice', tone: 'info', text: 'Action simulée : demande de rendez-vous transmise à votre conseiller (démonstration).' })}>
            Prendre rendez-vous avec un conseiller
          </button>
        </div>
        <p className="xsmall muted">{plan.disclaimer}</p>
      </div>
    </section>
  );
}
