/**
 * Fixtures de DÉVELOPPEMENT (démo). Les seuils ont été réglés en regardant ces personas.
 * Le jeu d'évaluation (evaluationCases.ts) est distinct et n'a pas servi au réglage.
 * Toutes les personnes, contreparties et établissements sont fictifs.
 */
import { eur } from '../domain/money';
import type { PersonaFixture } from './builder';

const commonVariable = [
  { category: 'courses', label: 'Supermarché', counterpartyPrefix: 'courses', perMonth: 8, min: eur(25), max: eur(85) },
  { category: 'restauration', label: 'Restaurant', counterpartyPrefix: 'resto', perMonth: 3, min: eur(14), max: eur(42) },
  { category: 'loisirs', label: 'Loisirs', counterpartyPrefix: 'loisirs', perMonth: 2, min: eur(10), max: eur(40) },
];

export const camille: PersonaFixture = {
  id: 'camille',
  name: 'Camille Martin',
  tagline: 'Dernier rappel du prêt maison, découvert à venir, déménagement possible',
  description:
    'Salariée propriétaire, solde tendu : l’échéance d’octobre du prêt habitation est impayée (dernier rappel). Depuis septembre : acompte de déménageur, achats d’équipement du logement, nouveau fournisseur d’énergie.',
  referenceDate: '2026-10-18',
  customer: {
    id: 'camille',
    displayName: 'Camille Martin',
    accountLabel: 'Compte à vue ···· 4821',
    clientSince: '2026-04-01',
    savingsBalance: eur(6200),
    contracts: [
      { id: 'c-hab', kind: 'assurance_habitation', label: 'Assurance habitation', endDate: '2027-03-01' },
      { id: 'c-auto', kind: 'credit_auto', label: 'Crédit auto', endDate: '2027-06-22' },
      {
        id: 'c-pret',
        kind: 'credit_immo',
        label: 'Prêt habitation',
        endDate: '2046-09-01',
        installment: { amount: eur(-950), day: 1, counterpartyId: 'pret_hab_1' },
      },
    ],
    notices: [
      {
        id: 'n-pret-oct',
        contractId: 'c-pret',
        level: 'dernier_rappel',
        label: 'Dernier rappel — prêt habitation',
        amountDue: eur(950),
        dueDate: '2026-10-25',
        issuedOn: '2026-10-15',
        missedDate: '2026-10-01',
      },
    ],
    externalAccounts: [
      { id: 'ext-horizon', institution: 'Banque Horizon (fictive)', kind: 'epargne', balance: eur(4800), monthlyNetInflow: eur(150), available: true },
      { id: 'ext-lointaine', institution: 'Banque Lointaine (fictive)', kind: 'courant', balance: eur(900), monthlyNetInflow: 0, available: false },
    ],
  },
  ledgerSpec: {
    customerId: 'camille',
    seed: 'dev-camille',
    start: '2026-04-01',
    anchorDate: '2026-10-18',
    anchorBalance: eur(380),
    recurring: [
      { counterpartyId: 'emp_atelier_nord', label: 'Salaire — Atelier Nord (fictif)', category: 'salaire', amount: eur(2450), day: 28 },
      // Échéance d'octobre impayée : à l'origine du dernier rappel.
      { counterpartyId: 'pret_hab_1', label: 'Mensualité crédit logement n° SIM-7781', category: 'credit_immo', amount: eur(-950), day: 1, skip: ['2026-10'] },
      { counterpartyId: 'epargne_interne', label: 'Virement vers épargne', category: 'epargne_virement', amount: eur(-300), day: 2 },
      { counterpartyId: 'energie_a', label: 'Énergie — Volta (fictif)', category: 'energie', amount: eur(-95), day: 5 },
      { counterpartyId: 'media_1', label: 'Abonnement streaming', category: 'abonnement_media', amount: eur(-14), day: 12 },
      { counterpartyId: 'telecom_1', label: 'Forfait mobile — Onde (fictif)', category: 'telecom', amount: eur(-25), day: 20 },
      { counterpartyId: 'sport_1', label: 'Salle de sport — Forme+ (fictif)', category: 'abonnement_sport', amount: eur(-60), day: 21, scheduledAheadDays: 5 },
      { counterpartyId: 'credit_auto_1', label: 'Échéance crédit auto', category: 'credit_auto', amount: eur(-310), day: 22 },
      { counterpartyId: 'assur_hab_1', label: 'Prime habitation — Assureur Lys (fictif)', category: 'assurance', amount: eur(-85), day: 24 },
      // Catégories protégées : présentes dans le registre, bloquées avant toute analyse.
      { counterpartyId: 'syndicat_1', label: 'Cotisation syndicale', category: 'syndicat', amount: eur(-15), day: 3 },
    ],
    variable: [
      ...commonVariable,
      { category: 'transport', label: 'Transport en commun', counterpartyPrefix: 'transport', perMonth: 6, min: eur(2), max: eur(9) },
      { category: 'carburant', label: 'Station-service', counterpartyPrefix: 'carbu', perMonth: 2, min: eur(45), max: eur(70) },
      { category: 'bricolage', label: 'Magasin de bricolage', counterpartyPrefix: 'brico', perMonth: 1, min: eur(15), max: eur(35), to: '2026-09-04' },
      { category: 'bricolage', label: 'Magasin de bricolage', counterpartyPrefix: 'brico', perMonth: 4, min: eur(40), max: eur(120), from: '2026-09-05' },
      { category: 'ameublement', label: 'Magasin d’ameublement', counterpartyPrefix: 'meuble', perMonth: 1.5, min: eur(150), max: eur(400), from: '2026-09-05' },
      { category: 'sante', label: 'Pharmacie', counterpartyPrefix: 'pharma', perMonth: 1, min: eur(10), max: eur(40) },
    ],
    oneOffs: [
      { date: '2026-10-10', amount: eur(-480), category: 'services_demenagement', label: 'Acompte — Déménagements Express (fictif)', counterpartyId: 'demenageur_1' },
      { date: '2026-10-09', amount: eur(-45), category: 'energie', label: 'Mise en service — Énergie Claire (fictif)', counterpartyId: 'energie_b' },
      { date: '2026-06-14', amount: eur(-20), category: 'religion', label: 'Don — association cultuelle (fictive)', counterpartyId: 'culte_1' },
      { date: '2026-05-09', amount: eur(-50), category: 'politique', label: 'Don — parti (fictif)', counterpartyId: 'parti_1' },
      { date: '2026-08-19', amount: eur(-37), category: 'inconnu', label: 'VIR 88321 REF X7', counterpartyId: 'inconnu_1' },
    ],
  },
  intentions: [],
  goals: [{ id: 'g-apport', label: 'Apport pour un futur logement', target: eur(20000), deadline: '2029-06-30', createdOn: '2026-05-02' }],
};

export const thomas: PersonaFixture = {
  id: 'thomas',
  name: 'Thomas Leroy',
  tagline: 'Naissance attendue (déclarée), nouvel emploi, contrat à échéance',
  description: 'A déclaré une naissance attendue. Nouvel employeur depuis septembre, forfait télécom en hausse, assurance auto à renouveler.',
  referenceDate: '2026-10-18',
  customer: {
    id: 'thomas',
    displayName: 'Thomas Leroy',
    accountLabel: 'Compte à vue ···· 7730',
    clientSince: '2026-03-01',
    savingsBalance: eur(12400),
    contracts: [
      { id: 't-auto', kind: 'assurance_auto', label: 'Assurance auto', endDate: '2026-11-20' },
      { id: 't-hab', kind: 'assurance_habitation', label: 'Assurance habitation', endDate: '2027-09-01' },
    ],
    externalAccounts: [
      { id: 'ext-horizon', institution: 'Banque Horizon (fictive)', kind: 'epargne', balance: eur(2500), monthlyNetInflow: eur(100), available: true },
    ],
  },
  ledgerSpec: {
    customerId: 'thomas',
    seed: 'dev-thomas',
    start: '2026-03-01',
    anchorDate: '2026-10-18',
    anchorBalance: eur(2900),
    recurring: [
      { counterpartyId: 'emp_ancien', label: 'Salaire — Logistique Sud (fictif)', category: 'salaire', amount: eur(2800), day: 28, to: '2026-08-31' },
      { counterpartyId: 'emp_nouveau', label: 'Salaire — Studio Delta (fictif)', category: 'salaire', amount: eur(3250), day: 1, from: '2026-09-01' },
      { counterpartyId: 'bailleur_2', label: 'Loyer', category: 'loyer', amount: eur(-1100), day: 3 },
      { counterpartyId: 'telecom_2', label: 'Forfait mobile + box', category: 'telecom', amount: eur(-30), day: 15, overrides: { '2026-10': eur(-42) } },
      { counterpartyId: 'assur_auto_2', label: 'Prime auto — Assureur Delta (fictif)', category: 'assurance', amount: eur(-64), day: 10 },
      { counterpartyId: 'energie_2', label: 'Énergie', category: 'energie', amount: eur(-80), day: 6 },
      { counterpartyId: 'epargne_2', label: 'Virement vers épargne', category: 'epargne_virement', amount: eur(-400), day: 4 },
    ],
    variable: [
      ...commonVariable,
      { category: 'transport', label: 'Transport en commun', counterpartyPrefix: 'transport', perMonth: 4, min: eur(2), max: eur(8), to: '2026-08-31' },
      { category: 'transport', label: 'Transport en commun', counterpartyPrefix: 'transport', perMonth: 20, min: eur(3), max: eur(8), from: '2026-09-01' },
    ],
    oneOffs: [],
  },
  intentions: [{ id: 'i-naissance', type: 'naissance', horizon: '3_12_mois', declaredOn: '2026-09-20' }],
  goals: [],
};

export const ines: PersonaFixture = {
  id: 'ines',
  name: 'Inès Benali',
  tagline: 'Premier emploi, historique insuffisant',
  description: 'Premier emploi depuis septembre et nouvelle cliente. Peu d’historique : l’assistant répond « preuves insuffisantes » plutôt que deviner. Premier emploi et projet de véhicule déclarés.',
  referenceDate: '2026-10-18',
  customer: {
    id: 'ines',
    displayName: 'Inès Benali',
    accountLabel: 'Compte à vue ···· 1094',
    clientSince: '2026-09-10',
    savingsBalance: eur(800),
    contracts: [],
    externalAccounts: [
      { id: 'ext-horizon', institution: 'Banque Horizon (fictive)', kind: 'epargne', balance: eur(3100), monthlyNetInflow: eur(200), available: true },
    ],
  },
  ledgerSpec: {
    customerId: 'ines',
    seed: 'dev-ines',
    start: '2026-09-10',
    anchorDate: '2026-10-18',
    anchorBalance: eur(1150),
    recurring: [
      { counterpartyId: 'emp_3', label: 'Salaire — Clinique vétérinaire Azur (fictive)', category: 'salaire', amount: eur(2100), day: 30 },
      { counterpartyId: 'bailleur_3', label: 'Loyer', category: 'loyer', amount: eur(-780), day: 2 },
    ],
    variable: [...commonVariable, { category: 'automobile', label: 'Garage', counterpartyPrefix: 'garage', perMonth: 0.5, min: eur(60), max: eur(180) }],
    oneOffs: [],
  },
  intentions: [
    { id: 'i-premier', type: 'premier_emploi', horizon: 'moins_3_mois', declaredOn: '2026-09-12' },
    { id: 'i-veh', type: 'vehicule', horizon: '3_12_mois', declaredOn: '2026-10-02', note: 'Voiture d’occasion' },
  ],
  goals: [],
};

export const julien: PersonaFixture = {
  id: 'julien',
  name: 'Julien Vermeulen',
  tagline: 'Départ vers les États-Unis',
  description:
    'Ingénieur. Depuis septembre : virements internationaux (dépôt de garantie d’un logement) et frais de visa. Au niveau Conseils, la banque pose la question ; une fois la destination déclarée, un plan de départ complet est proposé.',
  referenceDate: '2026-10-18',
  customer: {
    id: 'julien',
    displayName: 'Julien Vermeulen',
    accountLabel: 'Compte à vue ···· 5507',
    clientSince: '2026-04-01',
    savingsBalance: eur(18500),
    contracts: [{ id: 'j-hab', kind: 'assurance_habitation', label: 'Assurance habitation', endDate: '2027-04-01' }],
    externalAccounts: [],
  },
  ledgerSpec: {
    customerId: 'julien',
    seed: 'dev-julien',
    start: '2026-04-01',
    anchorDate: '2026-10-18',
    anchorBalance: eur(4200),
    recurring: [
      { counterpartyId: 'emp_julien', label: 'Salaire — Bureau d’études Nord (fictif)', category: 'salaire', amount: eur(3400), day: 25 },
      { counterpartyId: 'bailleur_j', label: 'Loyer — appartement (fictif)', category: 'loyer', amount: eur(-1050), day: 3 },
      { counterpartyId: 'energie_j', label: 'Énergie — Volta (fictif)', category: 'energie', amount: eur(-80), day: 7 },
      { counterpartyId: 'telecom_j', label: 'Forfait mobile (fictif)', category: 'telecom', amount: eur(-35), day: 15 },
      { counterpartyId: 'epargne_j', label: 'Virement vers épargne', category: 'epargne_virement', amount: eur(-500), day: 5 },
    ],
    variable: [
      ...commonVariable,
      { category: 'transport', label: 'Transport en commun', counterpartyPrefix: 'transport', perMonth: 8, min: eur(2), max: eur(9) },
    ],
    oneOffs: [
      { date: '2026-09-05', amount: eur(-1800), category: 'virement_international', label: 'Virement international USD — dépôt de garantie (fictif)', counterpartyId: 'intl_usd_1' },
      { date: '2026-10-02', amount: eur(-950), category: 'virement_international', label: 'Virement international USD (fictif)', counterpartyId: 'intl_usd_1' },
      { date: '2026-09-18', amount: eur(-170), category: 'frais_consulaires', label: 'Frais de visa — dossier consulaire (fictif)', counterpartyId: 'consulat_1' },
    ],
  },
  intentions: [],
  goals: [],
};

export const laurence: PersonaFixture = {
  id: 'laurence',
  name: 'Laurence Maes',
  tagline: 'Séparation (déclarée)',
  description:
    'A déclaré une séparation. Compte joint et prêt habitation en co-emprunt. L’assistant ne déduit jamais cette situation : il répond uniquement à la déclaration, avec un plan confidentiel.',
  referenceDate: '2026-10-18',
  customer: {
    id: 'laurence',
    displayName: 'Laurence Maes',
    accountLabel: 'Compte joint ···· 3312',
    clientSince: '2026-03-01',
    savingsBalance: eur(4100),
    contracts: [
      {
        id: 'l-pret',
        kind: 'credit_immo',
        label: 'Prêt habitation (co-emprunteurs)',
        endDate: '2041-05-05',
        installment: { amount: eur(-1200), day: 5, counterpartyId: 'pret_l' },
      },
      { id: 'l-hab', kind: 'assurance_habitation', label: 'Assurance habitation', endDate: '2027-01-10' },
    ],
    externalAccounts: [],
  },
  ledgerSpec: {
    customerId: 'laurence',
    seed: 'dev-laurence',
    start: '2026-03-01',
    anchorDate: '2026-10-18',
    anchorBalance: eur(1650),
    recurring: [
      { counterpartyId: 'emp_laurence', label: 'Salaire — Cabinet Horizon (fictif)', category: 'salaire', amount: eur(2900), day: 26 },
      { counterpartyId: 'pret_l', label: 'Mensualité crédit logement n° SIM-4410', category: 'credit_immo', amount: eur(-1200), day: 5 },
      { counterpartyId: 'energie_l', label: 'Énergie (fictif)', category: 'energie', amount: eur(-110), day: 9 },
      { counterpartyId: 'assur_l', label: 'Prime habitation — Assureur Delta (fictif)', category: 'assurance', amount: eur(-70), day: 12 },
    ],
    variable: [...commonVariable],
    oneOffs: [],
  },
  intentions: [{ id: 'i-separation', type: 'separation', horizon: 'moins_3_mois', declaredOn: '2026-10-06' }],
  goals: [],
};

export const PERSONAS: PersonaFixture[] = [camille, thomas, ines, julien, laurence];
export const PERSONA_BY_ID = Object.fromEntries(PERSONAS.map((p) => [p.id, p])) as Record<string, PersonaFixture>;
