import { useEffect, useMemo, useRef, useState } from 'react';
import { FORMALITIES, FORMALITY_BY_ID, LEGAL_BASIS_LABELS } from '../../advisor/formalities';
import {
  analyzeCase,
  buildClientRequest,
  classifyComplaint,
  CREDIT_DEMO_MARKERS,
  creditRatios,
  EXTRACTABLE_FIELDS,
  FICTIONAL_WATCHLIST,
  generateDraft,
  screenNames,
  suggestedStatus,
} from '../../advisor/logic';
import { PROCEDURES } from '../../advisor/procedures';
import { izimiVault, type IzimiDoc } from '../../data/izimi';
import { CASE_STATUS_LABELS, type AdvisorCase, type CaseStatus, type ChecklistItem, type Finding, type FindingGuide, type GuideSection } from '../../advisor/types';
import { formatDateShort } from '../../domain/dates';
import { formatEUR, formatPct } from '../../domain/money';
import { useApp } from '../../state/AppContext';
import { Empty, Modal, Spinner } from '../components/common';

const STATUS_BADGE: Record<CaseStatus, string> = {
  brouillon: '',
  a_verifier: 'badge-warn',
  informations_manquantes: 'badge-danger',
  valide: 'badge-success',
};

export function Advisor() {
  const { state, dispatch } = useApp();
  const [query, setQuery] = useState('');
  const [selectedFormality, setSelectedFormality] = useState<number>(1);
  const [tab, setTab] = useState<'file' | 'catalogue'>('file');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return FORMALITIES;
    return FORMALITIES.filter((f) => [f.title, f.assistantAction, ...f.inputs].join(' ').toLowerCase().includes(q) || String(f.id) === q);
  }, [query]);

  const current = state.advisorCases.find((c) => c.formalityId === selectedFormality) ?? null;
  const byStatus = (s: CaseStatus) => state.advisorCases.filter((c) => c.status === s);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Espace conseiller</h1>
          <p>
            Formalités bancaires simplifiées, sur données fictives. L’assistant prépare, vérifie et rédige ; chaque résultat reste un brouillon soumis à
            un conseiller. Ces traitements relèvent de leur propre base juridique, indépendante du consentement de personnalisation.
          </p>
        </div>
      </div>

      <div className="advisor-grid">
        <div className="stack">
          <div className="segmented" role="group" aria-label="Affichage">
            <button type="button" aria-pressed={tab === 'file'} onClick={() => setTab('file')}>File de revue</button>
            <button type="button" aria-pressed={tab === 'catalogue'} onClick={() => setTab('catalogue')}>Catalogue (20)</button>
          </div>

          {tab === 'file' ? (
            <section className="card" aria-labelledby="queue-titre">
              <h2 id="queue-titre" style={{ marginBottom: 10 }}>File de revue</h2>
              {(['informations_manquantes', 'a_verifier', 'brouillon', 'valide'] as CaseStatus[]).map((s) => (
                <div key={s} style={{ marginBottom: 12 }}>
                  <div className="spread">
                    <span className="small strong">{CASE_STATUS_LABELS[s]}</span>
                    <span className={`badge ${STATUS_BADGE[s]}`}>{byStatus(s).length}</span>
                  </div>
                  <div className="stack" style={{ gap: 6, marginTop: 6 }}>
                    {byStatus(s).map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        className="catalog-item"
                        aria-current={current?.id === c.id}
                        onClick={() => setSelectedFormality(c.formalityId)}
                      >
                        <span className="small strong">{c.title}</span>
                        <span className="xsmall muted">{c.id} · {FORMALITY_BY_ID[c.formalityId].title}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </section>
          ) : (
            <section className="card" aria-labelledby="cat-titre">
              <h2 id="cat-titre">Catalogue des formalités</h2>
              <div className="field" style={{ margin: '10px 0' }}>
                <label htmlFor="cat-search" className="sr-only">Rechercher une formalité</label>
                <input id="cat-search" className="input" type="search" placeholder="Rechercher (ex. crédit, identité, sanctions)…" value={query} onChange={(e) => setQuery(e.target.value)} />
              </div>
              <p className="xsmall muted" aria-live="polite">{filtered.length} formalité(s)</p>
              <div className="stack" style={{ gap: 8, marginTop: 6, maxHeight: 640, overflow: 'auto' }}>
                {filtered.length === 0 && <Empty title="Aucune formalité ne correspond" />}
                {filtered.map((f) => (
                  <button key={f.id} type="button" className="catalog-item" aria-current={selectedFormality === f.id} onClick={() => setSelectedFormality(f.id)}>
                    <span className="spread">
                      <span className="small strong">{f.id}. {f.title}</span>
                      <span className={`badge ${f.mode === 'complet' ? 'badge-teal' : ''}`}>{f.mode === 'complet' ? 'Cas complet' : 'Modèle'}</span>
                    </span>
                    <span className="chips">{f.inputs.map((i) => <span className="chip" key={i}>{i}</span>)}</span>
                    <span className="xsmall muted">{f.assistantAction}</span>
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>

        <div>
          {current ? (
            <CaseView key={current.id} c={current} />
          ) : (
            <section className="card">
              <h2>{FORMALITY_BY_ID[selectedFormality].title}</h2>
              <p className="card-sub" style={{ marginTop: 4 }}>{FORMALITY_BY_ID[selectedFormality].assistantAction}</p>
              <div className="alert alert-info" style={{ margin: '14px 0' }}>
                <span>Modèle de démonstration : liste de contrôle et brouillon génériques construits à partir des entrées de la formalité.</span>
              </div>
              <button className="btn btn-primary" onClick={() => dispatch({ type: 'case/open-template', formalityId: selectedFormality })}>
                Ouvrir un dossier de démonstration
              </button>
            </section>
          )}
        </div>
      </div>
    </>
  );
}

const ITEM_STATES: { v: ChecklistItem['state']; label: string }[] = [
  { v: 'recu', label: 'Reçu' },
  { v: 'a_verifier', label: 'À vérifier' },
  { v: 'manquant', label: 'Manquant' },
];

const SECTION_PREFIX: Record<GuideSection, string> = { checklist: 'chk', payload: 'pl', documents: 'docs', timeline: 'tl' };
const SECTION_LABEL: Record<GuideSection, string> = {
  checklist: 'Aller à la pièce dans la liste de contrôle',
  payload: 'Aller à la donnée concernée',
  documents: 'Aller aux documents',
  timeline: 'Aller à la chronologie',
};

const slug = (k: string) => k.replace(/[^a-zA-Z0-9]/g, '_');
/** Identifiant DOM d'une cible de guidage (section, ou élément précis dans la section). */
export const targetId = (caseId: string, section: GuideSection, key?: string) =>
  key ? `${SECTION_PREFIX[section]}-${caseId}-${slug(key)}` : `${SECTION_PREFIX[section]}-${caseId}`;

/** Fait défiler jusqu'à la cible, lui donne le focus et la met brièvement en surbrillance. */
function goTo(caseId: string, target: NonNullable<FindingGuide['target']>) {
  const el = document.getElementById(targetId(caseId, target.section, target.key)) ?? document.getElementById(targetId(caseId, target.section));
  if (!el) return;
  el.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
  if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
  el.focus({ preventScroll: true });
  el.classList.remove('flash');
  void el.offsetWidth;
  el.classList.add('flash');
  window.setTimeout(() => el.classList.remove('flash'), 2400);
}

function GuideDialog({ c, finding, onClose, onUpload }: { c: AdvisorCase; finding: Finding; onClose: () => void; onUpload: (kind: string) => void }) {
  const { dispatch } = useApp();
  const guide = finding.guide!;
  const proc = PROCEDURES[guide.procedureId];
  const request = buildClientRequest(c, guide);
  const alreadyRequested = !!request && (c.clientRequests ?? []).some((r) => r.subject === request.subject);
  const canUpload = !!proc.uploadKind && (guide.target?.section === 'checklist' || guide.target?.section === 'documents');
  const fromIzimi = izimiVault(c.clientRef).find((d) => d.procedureId === guide.procedureId && !c.documents.some((x) => x.id === `izimi-${d.id}`));
  const then = (fn: () => void) => () => {
    onClose();
    window.setTimeout(fn, 0);
  };

  return (
    <Modal title={proc.title} onClose={onClose}>
      <p className={`alert ${finding.severity === 'bloquant' ? 'alert-danger' : finding.severity === 'attention' ? 'alert-warn' : 'alert-info'}`} style={{ margin: 0 }}>
        <span>{finding.text}</span>
      </p>
      <h3 className="section-title">Pourquoi</h3>
      <p className="small">{proc.why}</p>
      <h3 className="section-title">Procédure</h3>
      <ol className="bullets small" style={{ paddingLeft: 20 }}>
        {proc.steps.map((st) => <li key={st}>{st}</li>)}
      </ol>
      {proc.accepted && (
        <>
          <h3 className="section-title">Documents acceptés</h3>
          <ul className="bullets small">{proc.accepted.map((a) => <li key={a}>{a}</li>)}</ul>
        </>
      )}
      {proc.checks && (
        <>
          <h3 className="section-title">Points de contrôle</h3>
          <ul className="bullets small">{proc.checks.map((a) => <li key={a}>{a}</li>)}</ul>
        </>
      )}
      <h3 className="section-title">Raccourcis</h3>
      <div className="stack" style={{ gap: 8 }}>
        {guide.target && (
          <button className="btn btn-primary" onClick={then(() => goTo(c.id, guide.target!))}>{SECTION_LABEL[guide.target.section]}</button>
        )}
        {canUpload && (
          <button className="btn" onClick={then(() => onUpload(proc.uploadKind!))}>Préparer l’import du document ({proc.uploadKind})</button>
        )}
        {fromIzimi && (
          <button
            className="btn"
            onClick={then(() => {
              dispatch({ type: 'case/izimi-import', caseId: c.id, izimiDocId: fromIzimi.id });
              window.setTimeout(() => goTo(c.id, { section: 'documents' }), 50);
            })}
          >
            Importer depuis le coffre izimi du client : {fromIzimi.name}
          </button>
        )}
        {request && (
          <button
            className="btn btn-teal"
            disabled={alreadyRequested}
            onClick={then(() => {
              dispatch({ type: 'case/request', caseId: c.id, subject: request.subject, body: request.body });
              window.setTimeout(() => goTo(c.id, { section: 'checklist', key: '__requests' }), 50);
            })}
          >
            {alreadyRequested ? 'Demande au client déjà préparée' : 'Préparer une demande au client (brouillon)'}
          </button>
        )}
        {guide.suggestReview && c.status !== 'a_verifier' && c.status !== 'valide' && (
          <button className="btn" onClick={then(() => dispatch({ type: 'case/status', caseId: c.id, status: 'a_verifier' }))}>
            Passer le dossier en « À vérifier »
          </button>
        )}
        {!request && guide.procedureId === 'correspondance_sanctions' && (
          <p className="xsmall muted">Aucune demande au client : il ne doit pas être informé d’un filtrage en cours.</p>
        )}
      </div>
      <p className="xsmall muted" style={{ marginTop: 14 }}>Fiche de démonstration : elle ne reflète pas une procédure bancaire réelle.</p>
    </Modal>
  );
}

function CaseView({ c }: { c: AdvisorCase }) {
  const { state, dispatch } = useApp();
  const formality = FORMALITY_BY_ID[c.formalityId];
  const findings = analyzeCase(c, state.demoDate);
  const suggestion = suggestedStatus(c, findings);
  const [notes, setNotes] = useState(c.notes);
  const [drafting, setDrafting] = useState(false);
  const [confirmValidate, setConfirmValidate] = useState(false);
  const [guideFor, setGuideFor] = useState<Finding | null>(null);
  const [uploadPreset, setUploadPreset] = useState<{ kind: string; nonce: number } | null>(null);
  const requests = c.clientRequests ?? [];
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const draft = () => {
    setDrafting(true);
    timer.current = setTimeout(() => {
      dispatch({ type: 'case/draft', caseId: c.id, draft: generateDraft(c, state.demoDate) });
      setDrafting(false);
    }, 450);
  };

  return (
    <div className="stack-lg">
      <section className="card" aria-labelledby="case-titre">
        <div className="card-head">
          <div>
            <h2 id="case-titre">{c.title}</h2>
            <p className="card-sub">{c.id} · {c.clientRef} · {formality.id}. {formality.title}</p>
          </div>
          <span className={`badge ${STATUS_BADGE[c.status]}`} data-testid="case-status">{CASE_STATUS_LABELS[c.status]}</span>
        </div>
        <div className="row small" style={{ marginBottom: 12 }}>
          <span className="badge badge-primary">Base : {LEGAL_BASIS_LABELS[c.legalBasis]}</span>
          <span className={`badge ${formality.mode === 'complet' ? 'badge-teal' : ''}`}>{formality.mode === 'complet' ? 'Cas synthétique complet' : 'Modèle de démonstration'}</span>
        </div>
        <p className="small"><strong>Action de l’assistant :</strong> {formality.assistantAction}</p>

        <h3 className="section-title">Constats</h3>
        <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0, gap: 6 }}>
          {findings.map((f, i) => (
            <li key={i} className={`alert finding ${f.severity === 'bloquant' ? 'alert-danger' : f.severity === 'attention' ? 'alert-warn' : 'alert-info'}`}>
              <span>{f.text}</span>
              {f.guide && (
                <button type="button" className="btn btn-sm finding-btn" aria-label={`Que faire ? ${f.text}`} onClick={() => setGuideFor(f)}>
                  Que faire ? →
                </button>
              )}
            </li>
          ))}
        </ul>

        <h3 className="section-title">Statut de revue</h3>
        <div className="btn-group">
          {(['brouillon', 'a_verifier', 'informations_manquantes'] as CaseStatus[]).map((s) => (
            <button key={s} className="btn btn-sm" disabled={c.status === s} onClick={() => dispatch({ type: 'case/status', caseId: c.id, status: s })}>
              {CASE_STATUS_LABELS[s]}
            </button>
          ))}
          {!confirmValidate ? (
            <button className="btn btn-sm btn-teal" disabled={c.status === 'valide'} onClick={() => setConfirmValidate(true)}>
              Valider (conseiller)
            </button>
          ) : (
            <span className="row">
              <span className="small">Confirmer la validation humaine ?</span>
              <button
                className="btn btn-sm btn-teal"
                onClick={() => {
                  dispatch({ type: 'case/status', caseId: c.id, status: 'valide' });
                  setConfirmValidate(false);
                }}
              >
                Confirmer
              </button>
              <button className="btn btn-sm" onClick={() => setConfirmValidate(false)}>Annuler</button>
            </span>
          )}
        </div>
        {suggestion !== c.status && (
          <p className="small muted" style={{ marginTop: 8 }}>
            Statut suggéré d’après les constats : <strong>{CASE_STATUS_LABELS[suggestion]}</strong>.{' '}
            <button className="btn btn-sm btn-ghost" onClick={() => dispatch({ type: 'case/status', caseId: c.id, status: suggestion })}>Appliquer</button>
          </p>
        )}
      </section>

      <PayloadPanel c={c} />

      <section className="card" id={targetId(c.id, 'checklist')} aria-labelledby="check-titre">
        <h2 id="check-titre">Liste de contrôle</h2>
        <ul className="list" style={{ marginTop: 8 }}>
          {c.checklist.map((i) => (
            <li key={i.id} id={targetId(c.id, 'checklist', i.id)}>
              <span className="small strong">{i.label}</span>
              <div className="segmented" role="group" aria-label={`État : ${i.label}`}>
                {ITEM_STATES.map((s) => (
                  <button
                    key={s.v}
                    type="button"
                    aria-pressed={i.state === s.v}
                    onClick={() => i.state !== s.v && dispatch({ type: 'case/checklist', caseId: c.id, itemId: i.id, state: s.v })}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </section>

      {requests.length > 0 && (
        <section className="card" id={targetId(c.id, 'checklist', '__requests')} aria-labelledby={`req-${c.id}`}>
          <h2 id={`req-${c.id}`}>Demandes au client (brouillons)</h2>
          <p className="card-sub">Non envoyées : à relire, puis à transmettre par le canal habituel.</p>
          <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: '12px 0 0', gap: 10 }}>
            {requests.map((r) => (
              <li key={r.id} className="card" style={{ padding: 12, boxShadow: 'none' }} data-testid="client-request">
                <div className="spread">
                  <span className="small strong">{r.subject}</span>
                  <span className="badge badge-warn">Brouillon · non envoyé</span>
                </div>
                <pre className="draft" style={{ marginTop: 8 }}>{r.body}</pre>
                <div style={{ marginTop: 8 }}>
                  <button className="btn btn-sm btn-danger" onClick={() => dispatch({ type: 'case/request-remove', caseId: c.id, requestId: r.id })}>
                    Supprimer le brouillon
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <DocumentsPanel c={c} preset={uploadPreset} />

      <section className="card" aria-labelledby="draft-titre">
        <div className="card-head">
          <div>
            <h2 id="draft-titre">Brouillon</h2>
            <p className="card-sub">Toujours soumis à relecture humaine. Rien n’est envoyé, déposé ni décidé automatiquement.</p>
          </div>
          <button className="btn btn-primary" onClick={draft} disabled={drafting}>{c.draft ? 'Régénérer le brouillon' : 'Générer le brouillon'}</button>
        </div>
        <div className="field" style={{ marginBottom: 12 }}>
          <label htmlFor={`notes-${c.id}`}>Notes du conseiller</label>
          <textarea id={`notes-${c.id}`} className="textarea" style={{ minHeight: 70 }} value={notes} onChange={(e) => setNotes(e.target.value)} />
          <div>
            <button className="btn btn-sm" disabled={notes === c.notes} onClick={() => dispatch({ type: 'case/notes', caseId: c.id, notes })}>Enregistrer la note</button>
          </div>
        </div>
        {drafting ? <Spinner label="Rédaction du brouillon…" /> : c.draft ? <pre className="draft" data-testid="draft">{c.draft}</pre> : <Empty title="Aucun brouillon pour l’instant" />}
      </section>

      <section className="card" aria-labelledby="audit-c-titre">
        <h2 id="audit-c-titre">Traçabilité</h2>
        <ol className="timeline" style={{ marginTop: 12 }}>
          {[...c.audit].reverse().map((a, i) => (
            <li key={i}>
              <span className="strong">{a.action}</span>
              <span className="xsmall muted" style={{ display: 'block' }}>{a.at.replace('T', ' ').slice(0, 16)} · {a.actor}</span>
            </li>
          ))}
        </ol>
      </section>
      {guideFor && (
        <GuideDialog
          c={c}
          finding={guideFor}
          onClose={() => setGuideFor(null)}
          onUpload={(kind) => setUploadPreset({ kind, nonce: Date.now() })}
        />
      )}
    </div>
  );
}

function PayloadPanel({ c }: { c: AdvisorCase }) {
  const p = c.payload;
  switch (p.kind) {
    case 'ouverture':
    case 'kyc':
      return (
        <section className="card" id={targetId(c.id, 'payload')} aria-labelledby="pl-titre">
          <h2 id="pl-titre">{p.kind === 'kyc' ? 'Déclaré vs extrait (simulation)' : 'Dossier pré-rempli'}</h2>
          <div className="table-wrap" style={{ marginTop: 10 }}>
            <table className="table">
              <thead><tr><th>Champ</th><th>Déclaré</th>{p.kind === 'kyc' && <th>Extrait du document</th>}</tr></thead>
              <tbody>
                {(['nom', 'prenom', 'dateNaissance', 'nationalite', 'adresse', 'email', 'telephone'] as const).map((k) => {
                  const ex = c.documents.map((d) => d.extracted[k]).find(Boolean);
                  const mismatch = p.kind === 'kyc' && ex && ex.toLowerCase() !== p.declared[k].toLowerCase();
                  return (
                    <tr key={k} id={targetId(c.id, 'payload', k)}>
                      <td>{EXTRACTABLE_FIELDS[k] ?? (k === 'email' ? 'E-mail' : 'Téléphone')}</td>
                      <td>{p.declared[k] || <span className="badge badge-danger">manquant</span>}</td>
                      {p.kind === 'kyc' && <td>{ex ?? '—'} {mismatch && <span className="badge badge-warn">incohérence</span>}</td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      );
    case 'mise_a_jour':
      return (
        <section className="card" id={targetId(c.id, 'payload')}>
          <h2>Données du dossier</h2>
          <div className="table-wrap" style={{ marginTop: 10 }}>
            <table className="table">
              <tbody>
                <tr id={targetId(c.id, 'payload', 'idExpiry')}><td>Expiration de la pièce d’identité</td><td className="num">{p.idExpiry}</td></tr>
                <tr id={targetId(c.id, 'payload', 'employment')}><td>Situation professionnelle</td><td className="num">{p.employment} (mise à jour le {p.employmentUpdatedOn})</td></tr>
                <tr id={targetId(c.id, 'payload', 'phone')}><td>Téléphone vérifié le</td><td className="num">{p.phoneVerifiedOn}</td></tr>
              </tbody>
            </table>
          </div>
        </section>
      );
    case 'credit': {
      const r = creditRatios(p);
      return (
        <section className="card" id={targetId(c.id, 'payload')} aria-labelledby="ratios-titre">
          <h2 id="ratios-titre">Ratios (définitions explicites)</h2>
          <div className="table-wrap" style={{ marginTop: 10 }}>
            <table className="table">
              <thead><tr><th>Indicateur</th><th>Définition</th><th className="num">Valeur</th><th className="num">Repère démo</th></tr></thead>
              <tbody>
                <tr id={targetId(c.id, 'payload', 'payment')}><td>Mensualité</td><td>P·r / (1 − (1+r)^−n), r = taux/12</td><td className="num">{formatEUR(r.payment)}</td><td className="num">—</td></tr>
                <tr id={targetId(c.id, 'payload', 'dti')}><td>Taux d’endettement</td><td>(dettes + mensualité) / revenu net</td><td className="num">{r.debtToIncome === null ? 'n/d' : formatPct(r.debtToIncome, 1)}</td><td className="num">≤ {formatPct(CREDIT_DEMO_MARKERS.debtToIncome)}</td></tr>
                <tr id={targetId(c.id, 'payload', 'residual')}><td>Reste à vivre</td><td>revenu − charges − dettes − mensualité</td><td className="num">{formatEUR(r.residualIncome)}</td><td className="num">≥ {formatEUR(CREDIT_DEMO_MARKERS.residualIncomeMin)}</td></tr>
                <tr id={targetId(c.id, 'payload', 'ltv')}><td>Quotité</td><td>montant / valeur du bien</td><td className="num">{r.loanToValue === null ? 'n/d' : formatPct(r.loanToValue, 1)}</td><td className="num">≤ {formatPct(CREDIT_DEMO_MARKERS.loanToValue)}</td></tr>
              </tbody>
            </table>
          </div>
          <p className="xsmall muted" style={{ marginTop: 8 }}>Les repères sont des paramètres de démonstration, pas des critères d’octroi. Aucune approbation automatique.</p>
        </section>
      );
    }
    case 'reclamation': {
      const cl = classifyComplaint(p.messages.filter((m) => m.from === 'client').map((m) => m.text));
      const events = [
        ...p.messages.map((m) => ({ date: m.date, label: m.from === 'client' ? 'Message client' : 'Réponse banque', text: m.text })),
        ...p.transactions.map((t) => ({ date: t.date, label: 'Opération', text: `${t.label} : ${formatEUR(t.amount)}` })),
      ].sort((a, b) => a.date.localeCompare(b.date));
      return (
        <section className="card" id={targetId(c.id, 'timeline')} aria-labelledby="tl-titre">
          <div className="card-head">
            <h2 id="tl-titre">Chronologie</h2>
            <div className="chips">{cl.categories.map((x) => <span key={x} className="badge badge-primary">{x}</span>)}{cl.escalate && <span className="badge badge-danger">Escalade</span>}</div>
          </div>
          <ol className="timeline">
            {events.map((e, i) => (
              <li key={i}>
                <span className="strong">{formatDateShort(e.date)} — {e.label}</span>
                <div className="untrusted" style={{ marginTop: 4 }}>{e.text}</div>
              </li>
            ))}
          </ol>
          <p className="xsmall muted" style={{ marginTop: 8 }}>Encadré jaune : contenu externe non fiable, affiché comme donnée et jamais interprété comme une instruction.</p>
        </section>
      );
    }
    case 'sanctions': {
      const hits = screenNames(p.subjects);
      return (
        <section className="card" id={targetId(c.id, 'payload')} aria-labelledby="sanc-titre">
          <h2 id="sanc-titre">Filtrage (liste fictive)</h2>
          <p className="small muted" style={{ marginTop: 4 }}>Liste de démonstration entièrement fictive : {FICTIONAL_WATCHLIST.join(', ')}.</p>
          <div className="table-wrap" style={{ marginTop: 10 }}>
            <table className="table">
              <thead><tr><th>Personne ou entité filtrée</th><th>Entrée fictive</th><th className="num">Similarité</th></tr></thead>
              <tbody>
                {p.subjects.map((s) => {
                  const h = hits.filter((x) => x.subject === s);
                  return h.length ? (
                    h.map((x) => <tr key={s + x.entry} id={targetId(c.id, 'payload', s)}><td>{s}</td><td>{x.entry} <span className="badge badge-warn">à désambiguïser</span></td><td className="num">{x.similarity.toFixed(2)}</td></tr>)
                  ) : (
                    <tr key={s}><td>{s}</td><td className="muted">aucune correspondance</td><td className="num">—</td></tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      );
    }
    case 'modele':
      return null;
  }
}

function DocumentsPanel({ c, preset }: { c: AdvisorCase; preset: { kind: string; nonce: number } | null }) {
  const { dispatch } = useApp();
  const [name, setName] = useState('');
  const [kind, setKind] = useState('Pièce d’identité');
  const [izimiOpen, setIzimiOpen] = useState(false);
  // Raccourci depuis un guide : présélectionne le type et place le focus sur le texte.
  useEffect(() => {
    if (!preset) return;
    setKind(preset.kind);
    const area = document.getElementById(`doc-text-${c.id}`);
    area?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
    area?.focus({ preventScroll: true });
  }, [preset, c.id]);
  const [text, setText] = useState('');
  const [phase, setPhase] = useState<'idle' | 'loading' | 'error'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return setPhase('error');
    setPhase('loading');
    timer.current = setTimeout(() => {
      dispatch({ type: 'case/document', caseId: c.id, name, kind, text });
      setName('');
      setText('');
      setPhase('idle');
    }, 600);
  };

  return (
    <section className="card" aria-labelledby={`docs-${c.id}`}>
      <h2 id={`docs-${c.id}`}>Documents (import simulé)</h2>
      <p className="card-sub">Pas d’OCR ni d’accès à un registre : collez le texte d’un document fictif. Les lignes « Champ : valeur » sont extraites ; le reste est ignoré.</p>
      {c.documents.length > 0 && (
        <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: '12px 0', gap: 10 }}>
          {c.documents.map((d) => (
            <li key={d.id} className="card" style={{ padding: 12, boxShadow: 'none' }}>
              <div className="spread"><span className="small strong">{d.name}</span><span className="badge">{d.kind}</span></div>
              <div className="chips" style={{ marginTop: 6 }}>
                {Object.entries(d.extracted).map(([k, v]) => <span className="chip" key={k}>{EXTRACTABLE_FIELDS[k] ?? k} : {v}</span>)}
              </div>
              {d.flags.map((f) => <p key={f} className="xsmall" style={{ color: 'var(--warn)', marginTop: 6 }}>{f}</p>)}
            </li>
          ))}
        </ul>
      )}
      <div className="row" style={{ marginTop: 12 }}>
        <button type="button" className="btn btn-teal" onClick={() => setIzimiOpen(true)}>Importer depuis izimi (simulation)</button>
        <span className="xsmall muted">Coffre-fort numérique du client, avec son autorisation (simulée).</span>
      </div>
      {izimiOpen && <IzimiImportDialog c={c} onClose={() => setIzimiOpen(false)} />}
      <form className="stack" onSubmit={submit} style={{ marginTop: 12 }}>
        <div className="form-row">
          <div className="field">
            <label htmlFor={`doc-name-${c.id}`}>Nom du fichier</label>
            <input id={`doc-name-${c.id}`} className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="document_simule.txt" />
          </div>
          <div className="field">
            <label htmlFor={`doc-kind-${c.id}`}>Type</label>
            <select id={`doc-kind-${c.id}`} className="select" value={kind} onChange={(e) => setKind(e.target.value)}>
              {['Pièce d’identité', 'Justificatif de domicile', 'Fiche de paie', 'Relevé', 'Contrat', 'Autre'].map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>
        </div>
        <div className="field">
          <label htmlFor={`doc-text-${c.id}`}>Texte du document (fictif, non fiable)</label>
          <textarea id={`doc-text-${c.id}`} className="textarea" value={text} onChange={(e) => { setText(e.target.value); if (phase === 'error') setPhase('idle'); }} placeholder={'Nom : Dupont\nPrénom : Alex\nDate de naissance : 1990-01-31\nDate d’expiration : 2030-05-01'} />
        </div>
        {phase === 'error' && <p className="error-text" role="alert">Collez un texte avant de lancer l’extraction simulée.</p>}
        <div className="row">
          <button type="submit" className="btn btn-primary" disabled={phase === 'loading'}>Simuler l’import et l’extraction</button>
          {phase === 'loading' && <Spinner label="Extraction simulée…" />}
        </div>
      </form>
    </section>
  );
}

function IzimiImportDialog({ c, onClose }: { c: AdvisorCase; onClose: () => void }) {
  const { dispatch } = useApp();
  const vault = izimiVault(c.clientRef);
  const [busy, setBusy] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const importDoc = (d: IzimiDoc) => {
    setBusy(d.id);
    timer.current = setTimeout(() => {
      dispatch({ type: 'case/izimi-import', caseId: c.id, izimiDocId: d.id });
      setBusy(null);
    }, 600);
  };
  return (
    <Modal title="Importer depuis izimi (simulation)" onClose={onClose} footer={<button className="btn btn-primary" onClick={onClose}>Fermer</button>}>
      <div className="alert alert-info" style={{ marginBottom: 12 }}>
        <span>Simulation : aucune connexion au service izimi réel. L’autorisation du client est simulée ; le document importé passe « À vérifier ».</span>
      </div>
      {vault.length === 0 ? (
        <Empty title="Aucun coffre izimi relié pour ce client (simulation)" />
      ) : (
        <ul className="list">
          {vault.map((d) => {
            const done = c.documents.some((x) => x.id === `izimi-${d.id}`);
            return (
              <li key={d.id}>
                <div>
                  <div className="small strong">{d.name}</div>
                  <div className="xsmall muted">{d.kind} · {d.size}</div>
                </div>
                {done ? (
                  <span className="badge badge-success">Importé</span>
                ) : busy === d.id ? (
                  <Spinner label="Import…" />
                ) : (
                  <button className="btn btn-sm" disabled={busy !== null} onClick={() => importDoc(d)} aria-label={`Importer ${d.name}`}>Importer</button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}
