import { ALL_SCOPES, LEVEL_LABELS, LEVEL_ORDER, LEVEL_SCOPES, SCOPE_LABELS, SCOPE_MIN_LEVEL, levelRank } from '../../domain/consent';
import { DETECTORS } from '../../domain/detectors';
import { blockReason } from '../../domain/engine';
import type { ConsentLevel } from '../../domain/types';
import { useApp } from '../../state/AppContext';
import { Switch } from '../components/common';
import { useUi } from '../ui';

const LEVEL_INFO: Record<ConsentLevel, { inputs: string[]; outputs: string[] }> = {
  essentiel: {
    inputs: ['Vos revenus et prélèvements récurrents', 'Les échéances connues de vos contrats'],
    outputs: ['Découvert à venir', 'Contrat arrivant à échéance', 'Prélèvement récurrent inhabituel'],
  },
  conseils: {
    inputs: ['Tout le niveau Essentiel', 'Évolution de vos habitudes non sensibles', 'Intentions déclarées dans l’application'],
    outputs: ['Déménagement possible', 'Départ à l’étranger', 'Nouvel emploi', 'Projet de véhicule', 'Projet immobilier', 'Plans sur déclaration : naissance, premier emploi, séparation'],
  },
  complete: {
    inputs: ['Tout le niveau Conseils', 'Comptes externes autorisés séparément (simulés)', 'Objectifs d’épargne déclarés'],
    outputs: ['Projection de vos objectifs d’épargne', 'Planification de projets à long terme'],
  },
};

export function Personalization() {
  const { state, dispatch, allowed } = useApp();
  const { navigate } = useUi();
  const c = state.consent;
  const audit = state.lastAudit;

  const setLevel = (level: ConsentLevel) => dispatch({ type: 'consent', change: { type: 'level', level } });

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Mon niveau de personnalisation</h1>
          <p>« Plus vous nous faites confiance, mieux on vous aide, et c’est vous qui décidez. » Chaque réglage s’applique immédiatement, avant toute analyse.</p>
        </div>
      </div>

      <section className="card" aria-labelledby="global-titre">
        <div className="toggle-row" style={{ padding: 0 }}>
          <div>
            <h2 id="global-titre">Anticipation optionnelle</h2>
            <p className="card-sub" id="global-desc">
              Désactivée, aucune analyse d’anticipation n’est effectuée et les conclusions sont supprimées. Votre registre bancaire n’est pas effacé.
            </p>
          </div>
          <Switch
            checked={c.anticipationEnabled}
            label="Anticipation optionnelle"
            describedBy="global-desc"
            onChange={(v) => dispatch({ type: 'consent', change: { type: 'anticipation', enabled: v } })}
          />
        </div>
      </section>

      <section aria-labelledby="levels-titre" className="stack">
        <h2 id="levels-titre">Choisir un niveau</h2>
        <ul className="levels" style={{ listStyle: 'none', padding: 0, margin: 0 }} aria-label="Niveaux de personnalisation">
          {LEVEL_ORDER.map((level) => {
            const selected = c.level === level;
            return (
              <li key={level} className={`level${selected ? ' selected' : ''}`} aria-labelledby={`lvl-${level}`} aria-current={selected ? 'true' : undefined}>
                <div className="spread">
                  <h3 id={`lvl-${level}`}>{LEVEL_LABELS[level]}</h3>
                  {level === 'essentiel' && <span className="badge">Par défaut</span>}
                  {selected && <span className="badge badge-teal">Actuel</span>}
                </div>
                <p className="section-label">Informations analysées</p>
                <ul className="bullets small">{LEVEL_INFO[level].inputs.map((i) => <li key={i}>{i}</li>)}</ul>
                <p className="section-label">Ce que vous obtenez</p>
                <ul className="bullets small">{LEVEL_INFO[level].outputs.map((i) => <li key={i}>{i}</li>)}</ul>
                <div style={{ marginTop: 'auto', paddingTop: 8 }}>
                  <button
                    type="button"
                    className={`btn ${selected ? '' : 'btn-teal'}`}
                    style={{ width: '100%' }}
                    disabled={selected || !c.anticipationEnabled}
                    onClick={() => setLevel(level)}
                  >
                    {selected ? 'Niveau actuel' : `Choisir ${LEVEL_LABELS[level]}`}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
        {c.level === 'complete' && !c.externalAuthorization && (
          <div className="alert alert-info">
            <span>
              Vue complète n’ouvre pas l’accès à vos comptes externes : une autorisation séparée est nécessaire.{' '}
              <button className="btn btn-sm btn-ghost" onClick={() => navigate('projets')}>Connecter un compte (simulé)</button>
            </span>
          </div>
        )}
      </section>

      <div className="grid grid-2">
        <section className="card" aria-labelledby="scopes-titre">
          <div className="card-head">
            <div>
              <h2 id="scopes-titre">Informations analysées</h2>
              <p className="card-sub">Vous pouvez restreindre votre niveau, catégorie par catégorie.</p>
            </div>
          </div>
          {ALL_SCOPES.map((s) => {
            const inLevel = LEVEL_SCOPES[c.level].includes(s);
            const active = allowed.has(s);
            const note = !inLevel
              ? `Requiert le niveau ${LEVEL_LABELS[SCOPE_MIN_LEVEL[s]]}`
              : s === 'external.accounts' && !c.externalAuthorization
                ? 'Autorisation séparée requise (Mes projets)'
                : active
                  ? 'Analysé'
                  : 'Désactivé par vous';
            return (
              <div className="toggle-row" key={s}>
                <div>
                  <div className="label">{SCOPE_LABELS[s]}</div>
                  <div className="xsmall muted">{note}</div>
                </div>
                <Switch
                  checked={inLevel && c.scopeToggles[s]}
                  disabled={!inLevel || !c.anticipationEnabled}
                  label={SCOPE_LABELS[s]}
                  onChange={(v) => dispatch({ type: 'consent', change: { type: 'scope', scope: s, enabled: v } })}
                />
              </div>
            );
          })}
        </section>

        <section className="card" aria-labelledby="signals-titre">
          <div className="card-head">
            <div>
              <h2 id="signals-titre">Signaux</h2>
              <p className="card-sub">Chaque signal déclare les informations dont il a besoin. Sans elles, il ne s’exécute pas.</p>
            </div>
          </div>
          {DETECTORS.map((d) => {
            const reason = blockReason(d, c, allowed);
            return (
              <div className="toggle-row" key={d.id}>
                <div>
                  <div className="label">{d.label}</div>
                  <div className="xsmall muted">{reason ?? 'Actif'}</div>
                </div>
                <Switch
                  checked={c.detectorToggles[d.id]}
                  disabled={!c.anticipationEnabled}
                  label={`Signal ${d.label}`}
                  onChange={(v) => dispatch({ type: 'consent', change: { type: 'detector', detectorId: d.id, enabled: v } })}
                />
              </div>
            );
          })}
        </section>
      </div>

      <div className="grid grid-2">
        <section className="card" aria-labelledby="record-titre">
          <h2 id="record-titre">Enregistrement de consentement</h2>
          <dl className="kv" style={{ marginTop: 12 }}>
            <dt>Version</dt><dd data-testid="consent-version">{c.version}</dd>
            <dt>Horodatage (horloge de démo)</dt><dd>{c.timestamp.replace('T', ' ')}</dd>
            <dt>Finalité</dt><dd>Personnalisation optionnelle</dd>
            <dt>Niveau</dt><dd>{LEVEL_LABELS[c.level]}</dd>
            <dt>Comptes externes</dt><dd>{c.externalAuthorization ? `${c.externalAuthorization.accountIds.length} autorisé(s), simulé` : 'non autorisés'}</dd>
          </dl>
          <div className="alert alert-info" style={{ marginTop: 14 }}>
            <span>
              Ce consentement ne concerne que la personnalisation. Les traitements imposés par la loi (identification du client, lutte contre le
              blanchiment…) reposent sur une autre base juridique et sont gérés séparément dans l’espace conseiller.
            </span>
          </div>
        </section>

        <section className="card" aria-labelledby="history-titre">
          <h2 id="history-titre">Historique des changements</h2>
          <p className="card-sub">Historique minimal : aucune donnée de transaction n’y figure.</p>
          <ol className="list" style={{ marginTop: 8, maxHeight: 280, overflow: 'auto' }}>
            {state.consentHistory.map((h) => (
              <li key={h.version} style={{ alignItems: 'flex-start' }}>
                <div>
                  <div className="small strong">v{h.version} · {LEVEL_LABELS[h.level]}</div>
                  <div className="xsmall muted">{h.changes.join(' · ')}</div>
                </div>
                <span className="xsmall muted">{h.timestamp.replace('T', ' ').slice(0, 16)}</span>
              </li>
            ))}
          </ol>
        </section>
      </div>

      {audit && (
        <section className="card" aria-labelledby="audit-titre">
          <h2 id="audit-titre">Dernier calcul du moteur (transparence)</h2>
          <p className="card-sub">Ce que le moteur a réellement fait avec votre réglage actuel.</p>
          <div className="grid grid-2" style={{ marginTop: 12 }}>
            <div>
              <p className="section-title" style={{ marginTop: 0 }}>Signaux exécutés ({audit.executed.length})</p>
              <div className="chips" data-testid="executed">
                {audit.executed.length ? audit.executed.map((id) => <span className="chip" key={id}>{DETECTORS.find((d) => d.id === id)?.label}</span>) : <span className="small muted">Aucun</span>}
              </div>
              <p className="section-title">Informations extraites</p>
              <div className="chips">
                {audit.extractedScopes.length ? audit.extractedScopes.map((s) => <span className="chip" key={s}>{SCOPE_LABELS[s]}</span>) : <span className="small muted">Aucune</span>}
              </div>
              <p className="small muted" style={{ marginTop: 10 }}>
                Opérations exclues avant analyse (catégories protégées ou non classées) : <strong>{audit.excludedTransactions}</strong>
              </p>
            </div>
            <div>
              <p className="section-title" style={{ marginTop: 0 }}>Signaux non exécutés</p>
              <ul className="bullets small">
                {audit.skipped.length ? audit.skipped.map((s) => <li key={s.detectorId}>{DETECTORS.find((d) => d.id === s.detectorId)?.label} — {s.reason}</li>) : <li>Aucun</li>}
              </ul>
              {audit.invalidated.length > 0 && (
                <p className="small" style={{ marginTop: 10 }}>
                  Conclusions supprimées au dernier changement : <strong>{audit.invalidated.map((id) => DETECTORS.find((d) => d.id === id)?.label).join(', ')}</strong>
                </p>
              )}
            </div>
          </div>
        </section>
      )}
      <p className="xsmall muted">Niveaux cumulatifs : {LEVEL_ORDER.map((l) => `${LEVEL_LABELS[l]} (${levelRank(l) + 1})`).join(' ⊂ ')}.</p>
    </>
  );
}
