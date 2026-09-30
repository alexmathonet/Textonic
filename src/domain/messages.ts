import { formatDateLong } from './dates';
import { formatEUR, formatPct } from './money';
import type { Conclusion, NextAction, RecommendationKind } from './types';

export interface PhrasedMessage {
  kind: RecommendationKind;
  title: string;
  body: string;
  explanation: string;
  nextActions: NextAction[];
}

/**
 * Adaptateur de formulation.
 *
 * Il ne reçoit QUE des conclusions structurées déjà approuvées (agrégats, sans transaction brute).
 * Il ne décide ni du consentement, ni du score, ni de l'éligibilité, ni d'aucune inférence.
 * Un fournisseur d'IA générative pourrait implémenter cette interface pour reformuler le texte ;
 * par défaut, des gabarits français déterministes sont utilisés.
 */
export interface MessageAdapter {
  readonly name: string;
  phrase(c: Conclusion, opts: { confirmed: boolean }): PhrasedMessage;
}

const s = (v: string | number | undefined) => String(v ?? '');
const n = (v: string | number | undefined) => Number(v ?? 0);

export const templateAdapter: MessageAdapter = {
  name: 'Gabarits français déterministes',
  phrase(c, { confirmed }) {
    const f = c.facts;
    switch (c.detectorId) {
      case 'overdraft':
        return {
          kind: 'alerte',
          title: `Risque de découvert autour du ${formatDateLong(s(f.minDate))}`,
          body: `D’après vos revenus et prélèvements habituels, votre solde pourrait descendre à ${formatEUR(n(f.minBalance))} le ${formatDateLong(s(f.minDate))}${f.nextIncomeDate ? `, avant votre prochain revenu attendu le ${formatDateLong(s(f.nextIncomeDate))}` : ''}.${
            f.priorityLabel
              ? ` À couvrir en priorité : ${s(f.priorityLabel)} (${formatEUR(n(f.priorityAmount))} avant le ${formatDateLong(s(f.priorityDate))}).`
              : ''
          }${n(f.deferrableAmount) > 0 ? ` Des paiements moins prioritaires (${formatEUR(n(f.deferrableAmount))}) pourraient, si possible, être décalés.` : ''}`,
          explanation: 'Projection calculée uniquement à partir de vos flux récurrents internes et de vos opérations programmées.',
          nextActions: [
            { id: 'transfer', label: 'Préparer un virement depuis l’épargne' },
            { id: 'view_payments', label: 'Voir les paiements par priorité' },
            { id: 'view_forecast', label: 'Voir la projection' },
          ],
        };
      case 'contract_expiry':
        return {
          kind: 'alerte',
          title: `${s(f.contractLabel)} : échéance le ${formatDateLong(s(f.endDate))}`,
          body: `Votre contrat arrive à échéance dans ${n(f.daysLeft)} jours. C’est le bon moment pour vérifier qu’il correspond toujours à votre situation.`,
          explanation: 'Basé uniquement sur la date d’échéance d’un contrat connu de la banque.',
          nextActions: [{ id: 'review_contract', label: 'Revoir mon contrat' }],
        };
      case 'recurring_increase':
        return {
          kind: 'alerte',
          title: `Un prélèvement « ${s(f.category)} » a augmenté`,
          body: `Il est passé de ${formatEUR(n(f.prior))} à ${formatEUR(n(f.last))} (+${formatPct(n(f.pct))}). Ce n’est pas forcément anormal : il peut s’agir d’une révision tarifaire.`,
          explanation: 'Comparaison du dernier montant avec les montants habituels de ce prélèvement récurrent.',
          nextActions: [{ id: 'check_debit', label: 'Vérifier ce prélèvement' }],
        };
      case 'relocation':
        return confirmed
          ? {
              kind: 'etape_suivante',
              title: 'Déménagement : pensez à votre assurance habitation',
              body: 'Vous nous avez confirmé un déménagement. Votre assurance habitation doit couvrir votre nouveau logement dès l’emménagement.',
              explanation: 'Étape proposée parce que vous avez confirmé le déménagement.',
              nextActions: [
                { id: 'review_home_insurance', label: 'Revoir mon assurance habitation' },
                { id: 'update_address', label: 'Mettre à jour mon adresse' },
              ],
            }
          : {
              kind: 'question',
              title: 'Un déménagement en vue ?',
              body: 'Plusieurs signaux que vous nous avez autorisé à analyser pourraient indiquer un déménagement. Ce n’est qu’une hypothèse : est-ce le cas ?',
              explanation: 'Combinaison de signaux autorisés au niveau Conseils ; aucune conclusion n’est tenue pour acquise.',
              nextActions: [],
            };
      case 'job_change':
        return confirmed
          ? {
              kind: 'etape_suivante',
              title: 'Nouvelle situation professionnelle',
              body: 'Merci pour votre confirmation. Vous pouvez mettre à jour votre situation et revoir votre budget mensuel.',
              explanation: 'Étape proposée parce que vous avez confirmé un changement professionnel.',
              nextActions: [
                { id: 'update_employment', label: 'Mettre à jour ma situation' },
                { id: 'review_budget', label: 'Revoir mon budget' },
              ],
            }
          : {
              kind: 'question',
              title: 'Un changement professionnel ?',
              body: 'Certains signaux autorisés pourraient indiquer un changement d’emploi. Ce n’est qu’une hypothèse : est-ce le cas ?',
              explanation: 'Combinaison de signaux autorisés ; aucune conclusion n’est tenue pour acquise.',
              nextActions: [],
            };
      case 'vehicle':
        return confirmed
          ? {
              kind: 'etape_suivante',
              title: 'Préparer votre projet de véhicule',
              body: 'Vous pouvez estimer un budget mensuel. Toute demande de financement serait étudiée par un conseiller : aucune décision automatique.',
              explanation: 'Étape proposée parce que vous avez confirmé ce projet.',
              nextActions: [
                { id: 'budget_vehicle', label: 'Estimer un budget véhicule' },
                { id: 'meet_advisor', label: 'Prendre rendez-vous avec un conseiller' },
              ],
            }
          : {
              kind: 'question',
              title: 'Un projet de véhicule ?',
              body: 'Certains signaux autorisés pourraient indiquer un projet de véhicule. Ce n’est qu’une hypothèse : est-ce le cas ?',
              explanation: 'Combinaison de signaux autorisés ; aucune conclusion n’est tenue pour acquise.',
              nextActions: [],
            };
      case 'housing':
        return confirmed
          ? {
              kind: 'etape_suivante',
              title: 'Préparer votre projet immobilier',
              body: 'Un conseiller peut vous aider à structurer votre projet. Aucune décision de crédit n’est prise automatiquement.',
              explanation: 'Étape proposée parce que vous avez confirmé ce projet.',
              nextActions: [{ id: 'meet_advisor', label: 'Prendre rendez-vous avec un conseiller' }],
            }
          : {
              kind: 'question',
              title: 'Un projet immobilier ?',
              body: 'Certains signaux autorisés pourraient indiquer un projet immobilier. Ce n’est qu’une hypothèse : est-ce le cas ?',
              explanation: 'Combinaison de signaux autorisés ; aucune conclusion n’est tenue pour acquise.',
              nextActions: [],
            };
      case 'expatriation':
        if (n(f.declared)) {
          return {
            kind: 'etape_suivante',
            title: `Départ vers ${s(f.destination)} : votre plan de préparation`,
            body: 'Démarches bancaires, documents à envoyer et conseils pour garder vos comptes actifs depuis l’étranger : une liste à cocher, à votre rythme.',
            explanation: 'Proposé parce que vous avez déclaré ce projet d’expatriation.',
            nextActions: [
              { id: 'open_plan:expatriation', label: 'Ouvrir mon plan de départ' },
              { id: 'meet_advisor', label: 'Prendre rendez-vous avec un conseiller' },
            ],
          };
        }
        return confirmed
          ? {
              kind: 'etape_suivante',
              title: 'Préparer votre départ à l’étranger',
              body: 'Merci pour votre confirmation. Indiquez votre destination pour obtenir un plan de départ adapté.',
              explanation: 'Étape proposée parce que vous avez confirmé ce projet.',
              nextActions: [{ id: 'declare:expatriation', label: 'Indiquer ma destination' }],
            }
          : {
              kind: 'question',
              title: 'Un départ à l’étranger ?',
              body: 'Certains signaux que vous nous autorisez à analyser (virements internationaux, frais consulaires) pourraient indiquer un projet d’installation à l’étranger. Ce n’est qu’une hypothèse : est-ce le cas ?',
              explanation: 'Combinaison de signaux autorisés au niveau Conseils ; la destination n’est jamais déduite.',
              nextActions: [],
            };
      case 'birth':
        return {
          kind: 'etape_suivante',
          title: 'Naissance attendue : votre plan',
          body: 'Budget, épargne de précaution, assurances et démarches : une liste à cocher, à votre rythme.',
          explanation: 'Proposé uniquement parce que vous l’avez déclaré.',
          nextActions: [{ id: 'open_plan:naissance', label: 'Ouvrir mon plan' }],
        };
      case 'first_job':
        return {
          kind: 'etape_suivante',
          title: 'Premier emploi : bien démarrer',
          body: 'Premier salaire, premier budget, épargne de précaution : les bons réflexes, étape par étape.',
          explanation: 'Proposé uniquement parce que vous l’avez déclaré.',
          nextActions: [{ id: 'open_plan:premier_emploi', label: 'Ouvrir mon plan' }],
        };
      case 'separation':
        return {
          kind: 'etape_suivante',
          title: 'Séparation : les démarches bancaires',
          body: 'Comptes joints, crédits communs, procurations : les points à revoir, avec l’aide d’un conseiller. Ces informations restent confidentielles.',
          explanation: 'Proposé uniquement parce que vous l’avez déclaré.',
          nextActions: [
            { id: 'open_plan:separation', label: 'Ouvrir mon plan' },
            { id: 'meet_advisor', label: 'Prendre rendez-vous avec un conseiller' },
          ],
        };
      case 'savings_goal': {
        const months = n(f.months);
        const reach =
          months < 0
            ? 'Au rythme actuel, l’objectif ne serait pas atteint.'
            : months === 0
              ? 'Votre épargne agrégée couvre déjà cet objectif.'
              : `Au rythme actuel (${formatEUR(n(f.monthly))} par mois), vous l’atteindriez vers ${formatDateLong(s(f.projectedDate))}, ${n(f.onTrack) ? 'avant' : 'après'} votre échéance du ${formatDateLong(s(f.deadline))}.`;
        return {
          kind: 'projection',
          title: `Objectif « ${s(f.goalLabel)} » : ${formatEUR(n(f.current))} sur ${formatEUR(n(f.target))}`,
          body: `${reach} Projection agrégée incluant vos comptes externes autorisés.`,
          explanation: 'Projection linéaire ; ce n’est pas un conseil en investissement.',
          nextActions: [{ id: 'adjust_goal', label: 'Ajuster mon objectif' }],
        };
      }
    }
  },
};
