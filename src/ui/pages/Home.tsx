import { useMemo, useState } from 'react';
import { LEVEL_LABELS } from '../../domain/consent';
import { formatDateLong, formatDateShort } from '../../domain/dates';
import { forecastForDisplay } from '../../domain/display';
import type { ForecastEvent, ForecastResult } from '../../domain/forecast';
import { paymentPriority, PRIORITY_LABELS, PRIORITY_REASONS, sortByPriority, type Priority } from '../../domain/priority';
import type { CustomerData } from '../../domain/types';
import { balanceAt } from '../../domain/ledger';
import { formatEUR } from '../../domain/money';
import { categoryLabel } from '../../domain/sensitive';
import { useApp } from '../../state/AppContext';
import { BalanceChart } from '../components/BalanceChart';
import { Empty } from '../components/common';
import { RecommendationCard } from '../components/Recommendations';
import { useUi } from '../ui';

function labelOfContract(data: CustomerData, id: string): string {
  return (data.customer.contracts.find((c) => c.id === id)?.label ?? 'contrat').toLowerCase();
}

interface UpcomingItem {
  date: string;
  amount: number;
  category: string;
  source: ForecastEvent['source'];
  label?: string;
}

const SOURCE_LABELS: Record<ForecastEvent['source'], string> = {
  recurrent_projete: 'récurrent attendu',
  deja_programme: 'déjà programmé',
  echeance_contrat: 'échéance du contrat',
  rappel: 'rappel de paiement',
};

const PRIORITY_BADGE: Record<Priority, string> = { critique: 'badge-danger', haute: 'badge-warn', normale: 'badge-primary', basse: '' };

/**
 * Paiements à venir triés par priorité (règle d'affichage documentée) ou par date.
 * Sans consentement pour la projection, seuls les ordres programmés et les rappels de la banque sont listés.
 */
function UpcomingPayments({ forecast }: { forecast: ForecastResult | null }) {
  const { state, data } = useApp();
  const [order, setOrder] = useState<'priorite' | 'date'>('priorite');
  const byId = new Map(data.customer.contracts.map((c) => [c.id, c]));
  const items: UpcomingItem[] = forecast
    ? forecast.events
    : [
        ...data.ledger.filter((t) => t.status === 'scheduled').map((t) => ({ date: t.date, amount: t.amount, category: t.category, source: 'deja_programme' as const })),
        ...(data.customer.notices ?? [])
          .filter((n) => n.dueDate >= state.demoDate)
          .map((n) => ({ date: n.dueDate, amount: -n.amountDue, category: byId.get(n.contractId)?.kind ?? 'credit_immo', source: 'rappel' as const, label: n.label })),
      ];
  const sorted = order === 'priorite' ? sortByPriority(items) : [...items].sort((a, b) => a.date.localeCompare(b.date));
  const shown = sorted.slice(0, 10);

  return (
    <section className="card" id="paiements" aria-labelledby="avenir-titre">
      <div className="card-head">
        <div>
          <h2 id="avenir-titre">Paiements à venir</h2>
          <p className="card-sub">{order === 'priorite' ? 'Du plus au moins prioritaire.' : 'Par date.'}</p>
        </div>
        <div className="segmented" role="group" aria-label="Trier les paiements">
          <button type="button" aria-pressed={order === 'priorite'} onClick={() => setOrder('priorite')}>Priorité</button>
          <button type="button" aria-pressed={order === 'date'} onClick={() => setOrder('date')}>Date</button>
        </div>
      </div>
      {shown.length === 0 ? (
        <Empty title="Aucun paiement à afficher" />
      ) : (
        <ul className="list" data-testid="upcoming">
          {shown.map((e, i) => {
            const p = paymentPriority(e);
            return (
              <li key={`${e.date}-${e.source}-${i}`} className={e.source === 'rappel' ? 'upcoming-critical' : undefined}>
                <div style={{ minWidth: 0 }}>
                  <div className="strong small">{e.label ?? categoryLabel(e.category)}</div>
                  <div className="xsmall muted">
                    {formatDateShort(e.date)} · {SOURCE_LABELS[e.source]}
                  </div>
                </div>
                <div className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
                  {p ? (
                    <span className={`badge ${PRIORITY_BADGE[p]}`} title={PRIORITY_REASONS[p]} data-testid="priority">
                      {PRIORITY_LABELS[p]}
                    </span>
                  ) : (
                    <span className="badge badge-success">Revenu</span>
                  )}
                  <span className={e.amount < 0 ? 'amount-neg' : 'amount-pos'}>{formatEUR(e.amount)}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <details style={{ marginTop: 10 }}>
        <summary className="small strong" style={{ cursor: 'pointer' }}>Comment la priorité est-elle fixée ?</summary>
        <ul className="bullets small" style={{ marginTop: 8 }}>
          {(Object.keys(PRIORITY_LABELS) as Priority[]).map((p) => (
            <li key={p}><strong>{PRIORITY_LABELS[p]}</strong> : {PRIORITY_REASONS[p]}</li>
          ))}
          <li>Règle fixe selon la nature du paiement : suggestion d’ordre, pas un conseil juridique.</li>
        </ul>
      </details>
      {!forecast && <p className="xsmall muted" style={{ marginTop: 8 }}>Sans analyse des flux récurrents, seuls les ordres programmés et les rappels de la banque sont listés.</p>}
    </section>
  );
}

export function Home() {
  const { state, data, recommendations } = useApp();
  const { navigate } = useUi();
  const balance = balanceAt(data.initialBalance, data.ledger, state.demoDate);
  const forecast = useMemo(() => forecastForDisplay(data, state.consent, state.demoDate), [data, state.consent, state.demoDate]);
  const scheduled = data.ledger.filter((t) => t.status === 'scheduled');
  const notices = (data.customer.notices ?? []).filter((n) => n.dueDate >= state.demoDate);
  const recent = data.ledger.filter((t) => t.status === 'booked').slice(-8).reverse();
  const enabled = state.consent.anticipationEnabled;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Bonjour {data.customer.displayName.split(' ')[0]}</h1>
          <p>Situation au {formatDateLong(state.demoDate)} (horloge de démo).</p>
        </div>
      </div>

      {notices.map((n) => (
        <div key={n.id} className="alert alert-danger notice-banner" role="alert">
          <span>
            <strong>{n.level === 'dernier_rappel' ? 'Dernier rappel' : 'Rappel'} — {formatEUR(n.amountDue)} à régulariser avant le {formatDateLong(n.dueDate)}.</strong>{' '}
            L’échéance du {formatDateLong(n.missedDate)} de votre {labelOfContract(data, n.contractId)} n’a pas été prélevée. Priorité critique.
          </span>
          <button className="btn btn-sm" onClick={() => document.getElementById('paiements')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
            Voir les paiements par priorité
          </button>
        </div>
      ))}

      <div className="home-grid">
        <div className="stack-lg">
          <section className="card balance-card" aria-labelledby="solde-titre">
            <div className="spread">
              <h2 id="solde-titre" className="card-sub" style={{ fontWeight: 600 }}>{data.customer.accountLabel}</h2>
              <span className="xsmall muted">Données synthétiques</span>
            </div>
            <p className="balance-amount" data-testid="balance">{formatEUR(balance)}</p>
            <p className="card-sub">Solde disponible</p>
            <div className="balance-meta">
              <span>Épargne interne : <strong>{formatEUR(data.customer.savingsBalance)}</strong></span>
              <span>Opérations programmées : <strong>{scheduled.length}</strong></span>
            </div>
          </section>

          <section className="card" aria-labelledby="reco-titre">
            <div className="card-head">
              <div>
                <h2 id="reco-titre">Pour vous</h2>
                <p className="card-sub">Uniquement à partir des informations que vous nous autorisez à analyser.</p>
              </div>
              <span className="badge badge-primary">{recommendations.length} suggestion{recommendations.length > 1 ? 's' : ''}</span>
            </div>
            <div className="stack" data-testid="recommendations">
              {!enabled ? (
                <Empty title="Anticipation désactivée">
                  <p className="small">Vous avez désactivé l’anticipation optionnelle. Vos comptes restent disponibles normalement.</p>
                  <button className="btn btn-sm" style={{ marginTop: 10 }} onClick={() => navigate('personnalisation')}>
                    Gérer ma personnalisation
                  </button>
                </Empty>
              ) : recommendations.length === 0 ? (
                <Empty title="Rien à signaler pour le moment">
                  <p className="small">Aucune situation ne dépasse les seuils avec les informations autorisées.</p>
                </Empty>
              ) : (
                recommendations.map((r) => <RecommendationCard key={r.id} rec={r} />)
              )}
            </div>
          </section>

          <section className="card" id="projection" aria-labelledby="proj-titre">
            <div className="card-head">
              <div>
                <h2 id="proj-titre">Projection de solde sur 30 jours</h2>
                <p className="card-sub">Flux récurrents internes et opérations programmées. Les dépenses variables ne sont pas projetées.</p>
              </div>
            </div>
            {forecast ? (
              <>
                <BalanceChart forecast={forecast} />
                <details style={{ marginTop: 10 }}>
                  <summary className="small strong" style={{ cursor: 'pointer' }}>Hypothèses de calcul</summary>
                  <ul className="bullets small" style={{ marginTop: 8 }}>
                    {forecast.assumptions.map((a) => <li key={a}>{a}</li>)}
                    <li>{forecast.skippedAlreadyBooked} occurrence(s) récurrente(s) déjà programmée(s), non comptée(s) deux fois.</li>
                  </ul>
                </details>
              </>
            ) : (
              <Empty title="Projection non disponible">
                <p className="small">Elle nécessite l’anticipation optionnelle et les flux récurrents internes (niveau Essentiel).</p>
              </Empty>
            )}
          </section>
        </div>

        <div className="stack-lg">
          <section className="card" aria-labelledby="niveau-titre">
            <div className="card-head">
              <div>
                <h2 id="niveau-titre">Votre niveau de personnalisation</h2>
                <p className="card-sub">Plus vous nous faites confiance, mieux on vous aide, et c’est vous qui décidez.</p>
              </div>
            </div>
            <div className="spread">
              <span className={`consent-pill ${enabled ? '' : 'off'}`} data-testid="consent-level">
                <span className="dot" aria-hidden="true" />
                {enabled ? LEVEL_LABELS[state.consent.level] : 'Anticipation désactivée'}
              </span>
              <button className="btn btn-sm" onClick={() => navigate('personnalisation')}>Modifier</button>
            </div>
            <p className="small muted" style={{ marginTop: 10 }}>
              Version {state.consent.version} · {state.consent.externalAuthorization ? 'comptes externes autorisés (simulés)' : 'aucun compte externe connecté'}
            </p>
          </section>

          <UpcomingPayments forecast={forecast} />

          <section className="card" aria-labelledby="ops-titre">
            <div className="card-head">
              <div>
                <h2 id="ops-titre">Dernières opérations</h2>
                <p className="card-sub">Registre bancaire (affichage), distinct du moteur d’anticipation.</p>
              </div>
            </div>
            <ul className="list">
              {recent.map((t) => (
                <li key={t.id}>
                  <div style={{ minWidth: 0 }}>
                    <div className="small strong" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.label}</div>
                    <div className="xsmall muted">{formatDateShort(t.date)}</div>
                  </div>
                  <span className={t.amount < 0 ? 'amount-neg' : 'amount-pos'}>{formatEUR(t.amount)}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </>
  );
}
