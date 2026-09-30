import { LEVEL_LABELS, SCOPE_LABELS, SCOPE_MIN_LEVEL } from '../../domain/consent';
import { formatDateLong } from '../../domain/dates';
import { DETECTOR_BY_ID } from '../../domain/detectors';
import { templateAdapter } from '../../domain/messages';
import type { IntentionType, Recommendation, SignalResult } from '../../domain/types';
import { useApp } from '../../state/AppContext';
import { useUi } from '../ui';
import { Modal } from './common';

const KIND_LABEL: Record<Recommendation['kind'], { text: string; cls: string }> = {
  alerte: { text: 'Alerte', cls: 'badge-warn' },
  question: { text: 'Question', cls: 'badge-teal' },
  etape_suivante: { text: 'Étape suivante', cls: 'badge-success' },
  projection: { text: 'Projection', cls: 'badge-primary' },
};

export function RecommendationCard({ rec }: { rec: Recommendation }) {
  const { dispatch } = useApp();
  const { openExplanation, navigate, setIntentPreset } = useUi();
  const kind = KIND_LABEL[rec.kind];

  const onAction = (id: string, label: string) => {
    if (id === 'adjust_goal') return navigate('projets');
    if (id.startsWith('open_plan:')) {
      navigate('projets');
      window.setTimeout(() => document.getElementById(`plan-${id.slice('open_plan:'.length)}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
      return;
    }
    if (id.startsWith('declare:')) {
      setIntentPreset(id.slice('declare:'.length) as IntentionType);
      navigate('projets');
      window.setTimeout(() => document.getElementById('int-type')?.focus(), 60);
      return;
    }
    if (id === 'view_payments') {
      document.getElementById('paiements')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    if (id === 'view_forecast') {
      document.getElementById('projection')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    dispatch({ type: 'notice', tone: 'info', text: `Action simulée : « ${label} ». Aucune opération réelle n’est effectuée.` });
  };

  return (
    <article className={`reco ${rec.kind}`} aria-labelledby={`reco-${rec.id}`} data-testid={`reco-${rec.detectorId}`}>
      <div className="spread">
        <span className={`badge ${kind.cls}`}>{kind.text}</span>
        {rec.status === 'confirmee' && <span className="badge badge-success">Confirmé par vous</span>}
      </div>
      <h3 className="reco-title" id={`reco-${rec.id}`}>{rec.title}</h3>
      <p className="reco-body">{rec.body}</p>
      {rec.nextActions.length > 0 && (
        <div className="reco-actions">
          {rec.nextActions.map((a) => (
            <button key={a.id} type="button" className="btn btn-sm btn-primary" onClick={() => onAction(a.id, a.label)}>
              {a.label}
            </button>
          ))}
        </div>
      )}
      <div className="reco-foot">
        <div className="row">
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => openExplanation(rec.detectorId)}>
            Pourquoi je vois ceci ?
          </button>
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={() => dispatch({ type: 'consent', change: { type: 'detector', detectorId: rec.detectorId, enabled: false } })}
          >
            Désactiver ce signal
          </button>
        </div>
        <div className="feedback" role="group" aria-label="Votre avis sur cette suggestion">
          {rec.status !== 'confirmee' && (
            <button type="button" className="btn btn-sm" onClick={() => dispatch({ type: 'feedback', detectorId: rec.detectorId, response: 'pertinent' })}>
              Oui, c’est pertinent
            </button>
          )}
          <button type="button" className="btn btn-sm" onClick={() => dispatch({ type: 'feedback', detectorId: rec.detectorId, response: 'non' })}>
            Non
          </button>
          <button type="button" className="btn btn-sm" onClick={() => dispatch({ type: 'feedback', detectorId: rec.detectorId, response: 'plus_tard' })}>
            Plus tard
          </button>
        </div>
      </div>
    </article>
  );
}

const STATE_BADGE: Record<SignalResult['state'], { text: string; cls: string }> = {
  present: { text: 'présent', cls: 'badge-teal' },
  absent: { text: 'absent', cls: '' },
  insufficient: { text: 'historique insuffisant', cls: 'badge-warn' },
};

export function ExplanationDialog() {
  const { state, recommendations, dispatch } = useApp();
  const { explain, openExplanation } = useUi();
  if (!explain) return null;
  const close = () => openExplanation(null);
  const rec = recommendations.find((r) => r.detectorId === explain);
  const conclusion = state.store.conclusions[explain];
  const detector = DETECTOR_BY_ID[explain];

  if (!rec || !conclusion) {
    return (
      <Modal title="Pourquoi je vois ceci ?" onClose={close} footer={<button className="btn btn-primary" onClick={close}>Fermer</button>}>
        <p>
          Cette recommandation n’est plus affichée : le signal « {detector.label} » a été désactivé, n’est plus autorisé par votre niveau de
          personnalisation, ou a été mis en pause suite à votre retour. Les conclusions correspondantes ont été retirées.
        </p>
      </Modal>
    );
  }

  const pct = Math.round(Math.min(1, rec.score) * 100);
  const thr = Math.round(rec.threshold * 100);
  const isProjection = rec.kind === 'projection';

  return (
    <Modal
      title="Pourquoi je vois ceci ?"
      onClose={close}
      footer={
        <>
          <button
            className="btn btn-danger"
            onClick={() => {
              dispatch({ type: 'consent', change: { type: 'detector', detectorId: explain, enabled: false } });
              close();
            }}
          >
            Désactiver ce signal
          </button>
          <button className="btn btn-primary" onClick={close}>Fermer</button>
        </>
      }
    >
      <p className="strong">{rec.title}</p>
      <p className="muted small" style={{ marginTop: 4 }}>{rec.explanation}</p>

      <h3 className="section-title">Signaux évalués (catégories autorisées uniquement)</h3>
      <ul className="list">
        {conclusion.signals.map((s) => (
          <li key={s.id}>
            <span>{s.categoryLabel}{s.strong ? ' (déclaration explicite)' : ''}</span>
            <span className={`badge ${STATE_BADGE[s.state].cls}`}>{STATE_BADGE[s.state].text}</span>
          </li>
        ))}
      </ul>

      <h3 className="section-title">Ce qui dépend de votre consentement</h3>
      <ul className="bullets small">
        {conclusion.scopesUsed.map((s) => (
          <li key={s}>
            {SCOPE_LABELS[s]} — niveau <strong>{LEVEL_LABELS[SCOPE_MIN_LEVEL[s]]}</strong> ou supérieur
            {detector.optionalScopes.includes(s) ? ' (facultatif)' : ''}
          </li>
        ))}
      </ul>
      <p className="small muted" style={{ marginTop: 6 }}>
        Votre niveau actuel : <strong>{LEVEL_LABELS[state.consent.level]}</strong> (version {rec.consentVersion} du consentement). Si vous retirez l’un de
        ces périmètres, cette conclusion est supprimée immédiatement.
      </p>

      {!isProjection && (
        <>
          <h3 className="section-title">Score indicatif</h3>
          <div className="stack" style={{ gap: 6 }}>
            <div
              role="meter"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={pct}
              aria-label="Score indicatif"
              style={{ position: 'relative', height: 10, background: '#e3e9f2', borderRadius: 999 }}
            >
              <div style={{ width: `${pct}%`, height: '100%', background: 'var(--teal)', borderRadius: 999 }} />
              <div title="Seuil" style={{ position: 'absolute', left: `${thr}%`, top: -4, bottom: -4, width: 2, background: 'var(--ink)' }} />
            </div>
            <p className="small">
              Score {rec.score.toFixed(2).replace('.', ',')} — seuil {rec.threshold.toFixed(2).replace('.', ',')}. Ce score est une règle documentée, pas une
              probabilité calibrée.
            </p>
          </div>
        </>
      )}

      <h3 className="section-title">Éléments agrégés</h3>
      <dl className="kv">
        {rec.evidence.map((e) => (
          <div key={e.label} style={{ display: 'contents' }}>
            <dt>{e.label}</dt>
            <dd>{e.value}</dd>
          </div>
        ))}
      </dl>

      <h3 className="section-title">Hypothèses</h3>
      <ul className="bullets small">
        {rec.assumptions.map((a) => (
          <li key={a}>{a}</li>
        ))}
      </ul>

      <h3 className="section-title">Jamais utilisé</h3>
      <p className="small">
        Les opérations liées à la santé, la religion, l’appartenance syndicale ou les opinions politiques, ainsi que les opérations non classées, sont
        exclues avant toute analyse. Aucun libellé ni contrepartie de transaction n’est conservé dans cette explication.
      </p>
      <p className="xsmall muted" style={{ marginTop: 10 }}>
        Calculé le {formatDateLong(rec.createdAt)} · Formulation : {templateAdapter.name}
      </p>
    </Modal>
  );
}
