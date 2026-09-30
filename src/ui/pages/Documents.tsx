import { useEffect, useRef, useState } from 'react';
import { bankDocuments, izimiVault } from '../../data/izimi';
import { formatDateShort } from '../../domain/dates';
import { useApp } from '../../state/AppContext';
import { Empty, Spinner } from '../components/common';

/** Petite temporisation simulant un échange réseau, sans aucun appel réel. */
function useSimulatedAction() {
  const [busy, setBusy] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const run = (key: string, fn: () => void, ms = 700) => {
    setBusy(key);
    timer.current = setTimeout(() => {
      fn();
      setBusy(null);
    }, ms);
  };
  return { busy, run };
}

export function Documents() {
  const { state, dispatch, data } = useApp();
  const iz = state.izimi;
  const linked = !!iz.linkedAt;
  const [agree, setAgree] = useState(false);
  const { busy, run } = useSimulatedAction();
  const docs = bankDocuments(data, state.demoDate);
  const vault = izimiVault(state.personaId);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Mes documents</h1>
          <p>Vos documents bancaires, et le partage avec votre coffre-fort numérique izimi.</p>
        </div>
      </div>

      <div className="alert alert-info">
        <span>
          <strong>Simulation.</strong> izimi est un service réel (coffre-fort numérique des notaires belges). Ce prototype n’a aucune intégration avec lui :
          aucun compte n’est utilisé, aucune donnée ne quitte votre navigateur, et tous les documents sont fictifs.
        </span>
      </div>

      <section className="card" aria-labelledby="izimi-link-titre">
        <div className="card-head">
          <div>
            <h2 id="izimi-link-titre">Coffre izimi</h2>
            <p className="card-sub">Autorisation distincte du niveau de personnalisation : finalité « partage de documents ».</p>
          </div>
          <span className={`badge ${linked ? 'badge-success' : ''}`} data-testid="izimi-status">
            {linked ? `Relié le ${iz.linkedAt!.replace('T', ' ').slice(0, 16)}` : 'Non relié'}
          </span>
        </div>
        {linked ? (
          <button className="btn btn-danger" onClick={() => dispatch({ type: 'izimi/unlink' })}>Retirer l’accès à mon coffre</button>
        ) : (
          <div className="stack">
            <label className="checkbox">
              <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
              <span className="small">
                J’autorise, à titre de démonstration, l’échange des documents que je choisis entre ma banque et mon coffre izimi. Chaque envoi est
                déclenché par moi, document par document. Les documents reçus ne sont pas analysés par l’anticipation.
              </span>
            </label>
            <div className="row">
              <button className="btn btn-teal" disabled={!agree || busy === 'link'} onClick={() => run('link', () => dispatch({ type: 'izimi/link' }), 900)}>
                Relier mon coffre izimi (simulation)
              </button>
              {busy === 'link' && <Spinner label="Connexion simulée…" />}
            </div>
          </div>
        )}
      </section>

      <div className="grid grid-2">
        <section className="card" aria-labelledby="bank-docs-titre">
          <h2 id="bank-docs-titre">Mes documents bancaires</h2>
          <p className="card-sub">Envoyer une copie vers votre coffre izimi.</p>
          <ul className="list" style={{ marginTop: 8 }}>
            {docs.map((d) => {
              const shared = iz.shared.find((x) => x.docId === d.id);
              return (
                <li key={d.id}>
                  <div style={{ minWidth: 0 }}>
                    <div className="small strong">{d.name}</div>
                    <div className="xsmall muted">{shared ? `Dans izimi depuis le ${shared.at.slice(0, 10)}` : formatDateShort(d.date)}</div>
                  </div>
                  {shared ? (
                    <span className="badge badge-success">Envoyé</span>
                  ) : busy === d.id ? (
                    <Spinner label="Envoi…" />
                  ) : (
                    <button
                      className="btn btn-sm"
                      disabled={!linked || busy !== null}
                      aria-label={`Envoyer vers izimi : ${d.name}`}
                      onClick={() => run(d.id, () => dispatch({ type: 'izimi/share', docId: d.id, name: d.name }))}
                    >
                      Envoyer vers izimi
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        <section className="card" aria-labelledby="vault-titre">
          <h2 id="vault-titre">Depuis mon coffre izimi</h2>
          <p className="card-sub">Transmettre un document de votre coffre à votre banque.</p>
          {!linked ? (
            <div style={{ marginTop: 8 }}><Empty title="Coffre non relié"><p className="small">Reliez votre coffre pour voir vos documents.</p></Empty></div>
          ) : vault.length === 0 ? (
            <div style={{ marginTop: 8 }}><Empty title="Aucun document dans ce coffre simulé" /></div>
          ) : (
            <ul className="list" style={{ marginTop: 8 }}>
              {vault.map((d) => {
                const imported = iz.imported.find((x) => x.izimiDocId === d.id);
                return (
                  <li key={d.id}>
                    <div style={{ minWidth: 0 }}>
                      <div className="small strong">{d.name}</div>
                      <div className="xsmall muted">{d.kind} · {d.size}{imported ? ` · transmis le ${imported.at.slice(0, 10)}` : ''}</div>
                    </div>
                    {imported ? (
                      <span className="badge badge-success">Transmis</span>
                    ) : busy === d.id ? (
                      <Spinner label="Transmission…" />
                    ) : (
                      <button
                        className="btn btn-sm btn-teal"
                        disabled={busy !== null}
                        aria-label={`Transmettre à la banque : ${d.name}`}
                        onClick={() => run(d.id, () => dispatch({ type: 'izimi/import', izimiDocId: d.id }))}
                      >
                        Transmettre à la banque
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <section className="card" aria-labelledby="izimi-log-titre">
        <h2 id="izimi-log-titre">Journal de partage</h2>
        {iz.log.length === 0 ? (
          <p className="small muted" style={{ marginTop: 6 }}>Aucun échange pour l’instant.</p>
        ) : (
          <ol className="list" style={{ marginTop: 8 }}>
            {iz.log.map((l, i) => (
              <li key={i}>
                <span className="small">{l.text}</span>
                <span className="xsmall muted">{l.at.replace('T', ' ').slice(0, 16)}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </>
  );
}
