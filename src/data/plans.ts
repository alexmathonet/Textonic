/**
 * Plans d'accompagnement (listes à cocher) associés aux projets DÉCLARÉS par le client.
 * Contenu de démonstration : ni conseil fiscal, ni conseil juridique, ni recommandation de produit.
 */
import type { DeclaredIntention, IntentionType } from '../domain/types';

export interface PlanItem {
  id: string;
  label: string;
  detail?: string;
  /** Document pouvant être transmis depuis le coffre izimi (simulé) s'il y figure. */
  docKey?: string;
}

export interface PlanSection {
  title: string;
  items: PlanItem[];
}

export interface Plan {
  title: string;
  intro: string;
  sections: PlanSection[];
  /** Conseils non cochables (ex. rester client tout en partant). */
  advice?: { title: string; points: string[] };
  disclaimer: string;
}

const US_NAMES = ['états-unis', 'etats-unis', 'usa', 'us'];
export const isUnitedStates = (dest?: string) => !!dest && US_NAMES.includes(dest.trim().toLowerCase());

function expatriationPlan(destination: string): Plan {
  const us = isUnitedStates(destination);
  return {
    title: `Plan de départ — ${destination}`,
    intro: `Tout ce qu’il faut préparer côté banque avant et après votre installation (${destination}), en gardant vos comptes actifs ici.`,
    sections: [
      {
        title: 'Avant le départ (3 à 6 mois avant)',
        items: [
          { id: 'inform', label: 'Prévenir votre conseiller de votre date de départ et de votre destination' },
          {
            id: 'nonresident',
            label: 'Vérifier les conditions de maintien de vos comptes en tant que non-résident',
            detail: us
              ? 'Certaines banques européennes limitent les services aux résidents fiscaux américains (réglementation FATCA). Votre conseiller vérifiera ce qui reste possible dans votre cas.'
              : 'Les services disponibles pour les non-résidents dépendent du pays : votre conseiller vérifiera votre cas.',
          },
          {
            id: 'tax',
            label: 'Mettre à jour votre résidence fiscale (auto-certification)',
            detail: us ? 'Si vous devenez résident fiscal américain, un formulaire W-9 pourra vous être demandé.' : undefined,
          },
          { id: 'card', label: 'Activer l’usage international de votre carte et vérifier vos plafonds' },
          { id: 'auth', label: 'Passer à une authentification par application plutôt que par SMS sur un numéro belge' },
          { id: 'poa', label: 'Désigner un mandataire (procuration) en Belgique si nécessaire' },
          { id: 'contracts', label: 'Revoir vos contrats : assurances, crédits en cours, domiciliations' },
        ],
      },
      {
        title: 'Documents à préparer et à envoyer',
        items: [
          { id: 'doc-passport', label: 'Passeport valide pendant tout le séjour', docKey: 'passeport' },
          { id: 'doc-visa', label: 'Copie du visa', docKey: 'visa' },
          { id: 'doc-work', label: 'Contrat de travail ou lettre d’embauche', docKey: 'contrat_travail' },
          { id: 'doc-birth', label: 'Acte de naissance (une traduction ou une apostille peut être exigée)', docKey: 'acte_naissance' },
          { id: 'doc-selfcert', label: 'Auto-certification fiscale signée' },
          { id: 'doc-address', label: 'Justificatif de votre nouvelle adresse (après l’arrivée)' },
        ],
      },
      {
        title: 'Après l’arrivée',
        items: [
          { id: 'address', label: 'Communiquer votre nouvelle adresse à la banque' },
          { id: 'residence', label: 'Confirmer votre résidence fiscale' },
          { id: 'orders', label: 'Revoir vos ordres permanents et domiciliations en Belgique' },
          { id: 'local', label: 'Organiser les virements entre votre compte local et votre compte belge' },
        ],
      },
    ],
    advice: {
      title: 'Rester client tout en partant',
      points: [
        'Inutile de tout clôturer : gardez votre compte courant pour vos paiements en Belgique (crédits, assurances, impôts, famille).',
        'Conservez votre épargne et votre accès en ligne : vous suivez vos comptes depuis l’étranger.',
        'Un compte dans votre pays d’arrivée est souvent nécessaire pour le salaire local ; les virements entre les deux restent possibles (comparez frais et taux de change).',
        'Gardez vos coordonnées à jour : c’est ce qui permet à votre banque de maintenir la relation.',
        'Votre conseiller reste joignable à distance, y compris pour préparer un éventuel retour.',
      ],
    },
    disclaimer:
      'Ni conseil fiscal ni conseil juridique : les règles dépendent de votre situation. Faites-les confirmer par votre conseiller et, si besoin, par un conseiller fiscal.',
  };
}

export function planFor(i: DeclaredIntention): Plan | null {
  const plans: Partial<Record<IntentionType, () => Plan>> = {
    expatriation: () => expatriationPlan(i.destination?.trim() || 'l’étranger'),
    naissance: () => ({
      title: 'Plan — naissance attendue',
      intro: 'Les points à anticiper côté budget et démarches, à votre rythme.',
      sections: [
        {
          title: 'Budget et épargne',
          items: [
            { id: 'budget', label: 'Estimer les nouvelles dépenses mensuelles (garde, équipement)' },
            { id: 'buffer', label: 'Revoir votre épargne de précaution' },
            { id: 'leave', label: 'Anticiper l’éventuelle baisse de revenus pendant un congé' },
          ],
        },
        {
          title: 'Démarches',
          items: [
            { id: 'insurance', label: 'Mettre à jour vos assurances et leurs bénéficiaires' },
            { id: 'allowance', label: 'Allocations familiales : démarche auprès de la caisse compétente de votre région' },
            { id: 'after', label: 'Après la naissance : ajouter l’enfant à votre dossier' },
          ],
        },
      ],
      disclaimer: 'Proposé uniquement sur votre déclaration : l’assistant ne déduit jamais une naissance ou une grossesse de vos achats.',
    }),
    premier_emploi: () => ({
      title: 'Plan — premier emploi',
      intro: 'Les bons réflexes pour votre premier salaire.',
      sections: [
        {
          title: 'Bien démarrer',
          items: [
            { id: 'salary', label: 'Faire verser votre salaire sur votre compte' },
            { id: 'budget', label: 'Établir un premier budget : charges fixes, dépenses courantes, épargne' },
            { id: 'buffer', label: 'Constituer une épargne de précaution (repère courant : 3 à 6 mois de dépenses)' },
            { id: 'insurance', label: 'Vérifier votre couverture d’assurance (responsabilité civile, habitation)' },
            { id: 'tax', label: 'Préparer votre première déclaration d’impôts l’an prochain' },
            { id: 'id', label: 'Transmettre une pièce d’identité à jour', docKey: 'identite' },
          ],
        },
      ],
      disclaimer: 'Repères généraux, pas une recommandation de produit.',
    }),
    separation: () => ({
      title: 'Plan — séparation',
      intro: 'Les démarches bancaires à revoir. Ces informations restent confidentielles.',
      sections: [
        {
          title: 'Comptes et crédits',
          items: [
            { id: 'joint', label: 'Faire le point sur les comptes joints', detail: 'Leur modification nécessite en principe l’accord des deux titulaires.' },
            { id: 'loans', label: 'Crédits communs : rencontrer un conseiller', detail: 'Aucune décision n’est prise automatiquement.' },
            { id: 'poa', label: 'Revoir les procurations et les cartes liées' },
            { id: 'salary', label: 'Faire verser votre salaire sur un compte à votre nom' },
          ],
        },
        {
          title: 'Démarches',
          items: [
            { id: 'address', label: 'Mettre à jour votre adresse et vos bénéficiaires d’assurance' },
            { id: 'budget', label: 'Préparer un budget séparé' },
            { id: 'legal', label: 'Vous faire accompagner (notaire, avocat, médiateur) pour les aspects juridiques' },
            { id: 'convention', label: 'Transmettre la convention ou le jugement quand il est disponible', docKey: 'convention' },
          ],
        },
      ],
      disclaimer: 'Proposé uniquement sur votre déclaration. Ni conseil juridique ni décision automatique sur les crédits.',
    }),
  };
  return plans[i.type]?.() ?? null;
}

export function planItemIds(plan: Plan): string[] {
  return plan.sections.flatMap((s) => s.items.map((i) => i.id));
}
