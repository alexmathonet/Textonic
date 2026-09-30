import { useState } from 'react';
import { EVALUATION_CASES } from '../../data/evaluationCases';
import { DEFAULT_CONFIG } from '../../domain/config';
import { LEVEL_LABELS } from '../../domain/consent';
import { DETECTOR_LABELS } from '../../domain/detectors';
import { runEvaluation, type EvaluationReport, type MetricRow, type Ratio } from '../../domain/evaluation';
import type { ConsentLevel } from '../../domain/types';
import { Empty, Spinner } from '../components/common';

const TAG_LABELS: Record<string, string> = {
  positif: 'Positif',
  negatif: 'Négatif',
  ambigu: 'Ambigu',
  historique_insuffisant: 'Historique insuffisant',
  categorie_sensible: 'Catégorie sensible',
  consentement_revoque: 'Consentement révoqué',
  consentement_restreint: 'Consentement restreint',
};

const fmt = (r: Ratio) => (r.value === null ? `non défini (${r.num}/${r.den})` : `${(r.value * 100).toFixed(0)} % (${r.num}/${r.den})`);

function MetricsTable({ rows, showLevel }: { rows: MetricRow[]; showLevel?: boolean }) {
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Détecteur</th>
            {showLevel && <th>Niveau</th>}
            <th className="num">n évalués</th>
            <th className="num">VP</th>
            <th className="num">FP</th>
            <th className="num">FN</th>
            <th className="num">VN</th>
            <th className="num">Précision</th>
            <th className="num">Rappel</th>
            <th className="num">Non exécuté (consentement)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.detectorId}-${r.level}`}>
              <td>{DETECTOR_LABELS[r.detectorId]}</td>
              {showLevel && <td>{r.level === 'tous' ? 'Tous' : LEVEL_LABELS[r.level as ConsentLevel]}</td>}
              <td className="num">{r.n}</td>
              <td className="num">{r.tp}</td>
              <td className="num">{r.fp}</td>
              <td className="num">{r.fn}</td>
              <td className="num">{r.tn}</td>
              <td className="num">{fmt(r.precision)}</td>
              <td className="num">{fmt(r.recall)}</td>
              <td className="num">{r.notExecuted}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Evaluation() {
  const [phase, setPhase] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [report, setReport] = useState<EvaluationReport | null>(null);
  const [error, setError] = useState('');

  const run = () => {
    setPhase('loading');
    setTimeout(() => {
      try {
        setReport(runEvaluation(EVALUATION_CASES));
        setPhase('done');
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setPhase('error');
      }
    }, 50);
  };

  const safety = report
    ? [
        { label: 'Exécutions de détecteurs non autorisés', value: report.unauthorizedExecutions, help: 'Contrôle indépendant à partir de la matrice des permissions.' },
        { label: 'Accès à un périmètre non accordé', value: report.forbiddenAccess, help: 'Journalisé par la vue restreinte remise à chaque détecteur.' },
        { label: 'Extractions de caractéristiques non autorisées', value: report.forbiddenExtractions, help: 'Périmètres extraits hors consentement.' },
        { label: 'Conclusions restantes après révocation', value: report.staleAfterRevocation, help: 'Dont le cas de rétrogradation Vue complète → Essentiel.' },
        { label: 'Traces de données protégées dans le magasin', value: report.sensitiveLeaks, help: 'Recherche des libellés, contreparties et catégories protégées.' },
        { label: 'Données brutes copiées dans le magasin', value: report.rawDataInStore, help: 'Libellés ou contreparties de transactions.' },
      ]
    : [];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Évaluation</h1>
          <p>Résultats calculés à l’instant sur le jeu synthétique étiqueté (distinct des fixtures de démo). Aucun pourcentage n’est saisi à la main.</p>
        </div>
        <button className="btn btn-primary" onClick={run} disabled={phase === 'loading'}>
          {report ? 'Relancer l’évaluation' : 'Lancer l’évaluation'}
        </button>
      </div>

      <section className="card alert-warn" style={{ background: 'var(--warn-50)', borderColor: '#f5d7a8' }} aria-labelledby="limits-titre">
        <h2 id="limits-titre" style={{ color: 'var(--warn)' }}>Limites méthodologiques</h2>
        <ul className="bullets small" style={{ marginTop: 8 }}>
          <li>Données entièrement synthétiques : ces résultats n’établissent pas la précision en conditions réelles.</li>
          <li>Le jeu d’évaluation a été écrit par l’équipe qui a conçu les détecteurs : ce n’est pas une validation indépendante.</li>
          <li>Les seuils ont été fixés sur les fixtures de développement, pas ajustés sur ce jeu. Un cas d’évaluation (E15) a été corrigé car ses données ne correspondaient pas à sa description ; aucun seuil n’a été modifié.</li>
          <li>Petits effectifs : une seule erreur change fortement un pourcentage. Les dénominateurs sont affichés ; « non défini » signifie dénominateur nul.</li>
          <li>Les scores sont indicatifs et non calibrés : ils ne s’interprètent pas comme des probabilités.</li>
          <li>Les étiquettes décrivent la situation simulée ; des cas difficiles (faux négatifs attendus) sont inclus volontairement.</li>
          <li>« Historique insuffisant » compte comme une prédiction négative dans la précision et le rappel.</li>
        </ul>
      </section>

      {phase === 'idle' && <Empty title="Évaluation non lancée"><p className="small">Cliquez sur « Lancer l’évaluation » pour exécuter les {EVALUATION_CASES.length} cas.</p></Empty>}
      {phase === 'loading' && <section className="card"><Spinner label={`Exécution des ${EVALUATION_CASES.length} cas…`} /></section>}
      {phase === 'error' && <div className="alert alert-danger" role="alert"><span>Échec de l’évaluation : {error}</span></div>}

      {phase === 'done' && report && (
        <>
          <div className="grid grid-3">
            <section className="card">
              <p className="card-sub">Taille de l’échantillon</p>
              <p className="balance-amount" style={{ color: 'var(--ink)' }} data-testid="sample-size">{report.sampleSize}</p>
              <p className="small muted">cas synthétiques étiquetés</p>
            </section>
            <section className="card">
              <p className="card-sub">Répartition des cas (étiquettes multiples possibles)</p>
              <div className="chips" style={{ marginTop: 8 }}>
                {Object.entries(report.tagCounts).map(([k, v]) => <span className="chip" key={k}>{TAG_LABELS[k] ?? k} : {v}</span>)}
              </div>
            </section>
            <section className="card">
              <p className="card-sub">« Preuves insuffisantes » attendues</p>
              <p className="balance-amount" style={{ color: 'var(--ink)' }}>{report.insufficient.returned}/{report.insufficient.expected}</p>
              <p className="small muted">cas où le moteur a bien refusé de conclure</p>
            </section>
          </div>

          <section className="card" aria-labelledby="safety-titre">
            <h2 id="safety-titre">Garanties de consentement et de confidentialité (attendu : 0)</h2>
            <div className="table-wrap" style={{ marginTop: 10 }}>
              <table className="table">
                <thead><tr><th>Contrôle</th><th>Méthode</th><th className="num">Résultat</th></tr></thead>
                <tbody>
                  {safety.map((s) => (
                    <tr key={s.label}>
                      <td>{s.label}</td>
                      <td className="small muted">{s.help}</td>
                      <td className="num"><span className={`badge ${s.value === 0 ? 'badge-success' : 'badge-danger'}`} data-testid="safety-value">{s.value}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="card" aria-labelledby="overall-titre">
            <h2 id="overall-titre">Par détecteur (tous niveaux)</h2>
            <p className="card-sub">VP/FP/FN/VN calculés uniquement quand le détecteur est autorisé et exécuté.</p>
            <div style={{ marginTop: 10 }}><MetricsTable rows={report.rowsOverall} /></div>
          </section>

          <section className="card" aria-labelledby="level-titre">
            <h2 id="level-titre">Par détecteur et niveau de consentement</h2>
            <div style={{ marginTop: 10 }}><MetricsTable rows={report.rowsByLevel} showLevel /></div>
          </section>

          <section className="card" aria-labelledby="cases-titre">
            <details>
              <summary style={{ cursor: 'pointer' }}><h2 id="cases-titre" style={{ display: 'inline' }}>Détail des {report.cases.length} cas</h2></summary>
              <div className="table-wrap" style={{ marginTop: 10 }}>
                <table className="table">
                  <thead><tr><th>Cas</th><th>Description</th><th>Niveau</th><th>Écarts ou points notables</th></tr></thead>
                  <tbody>
                    {report.cases.map((c) => {
                      const notable = c.outcomes.filter((o) => o.label !== 'negative' || o.status === 'detected');
                      return (
                        <tr key={c.id}>
                          <td className="mono">{c.id}</td>
                          <td>{c.description}<div className="xsmall muted">{c.tags.map((t) => TAG_LABELS[t] ?? t).join(', ')}</div></td>
                          <td>{LEVEL_LABELS[c.level]}</td>
                          <td className="small">
                            {notable.length === 0 ? 'Aucune détection (attendu)' : notable.map((o) => (
                              <div key={o.detectorId}>
                                {DETECTOR_LABELS[o.detectorId]} : attendu <strong>{o.label}</strong>, obtenu <strong>{o.status}</strong>
                              </div>
                            ))}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </details>
          </section>

          <section className="card" aria-labelledby="thr-titre">
            <h2 id="thr-titre">Seuils configurés</h2>
            <div className="table-wrap" style={{ marginTop: 10 }}>
              <table className="table">
                <thead><tr><th>Détecteur</th><th className="num">Seuil</th><th>Paramètres</th></tr></thead>
                <tbody>
                  {Object.entries(DEFAULT_CONFIG.detectors).map(([id, cfg]) => {
                    const { threshold, ...rest } = cfg as { threshold: number } & Record<string, unknown>;
                    return (
                      <tr key={id}>
                        <td>{DETECTOR_LABELS[id as keyof typeof DETECTOR_LABELS]}</td>
                        <td className="num">{threshold}</td>
                        <td className="mono xsmall">{JSON.stringify(rest)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </>
  );
}
