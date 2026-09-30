/**
 * JEU D'ÉVALUATION synthétique étiqueté — distinct des fixtures de développement.
 *
 * Graines, montants, dates et contreparties différents des personas de démo.
 * Les étiquettes décrivent la « vérité terrain » de la situation simulée (l'événement
 * a-t-il réellement lieu ?), pas la sortie attendue du moteur : certains cas sont
 * volontairement difficiles (faux négatifs attendus) pour ne pas embellir les résultats.
 *
 * Limite : ce jeu a été écrit par la même équipe que les détecteurs. Il ne constitue pas
 * une validation indépendante et ne dit rien de la précision en conditions réelles.
 */
import { addDays } from '../domain/dates';
import { eur } from '../domain/money';
import type { ConsentLevel, ConsentRecord, Contract, DeclaredIntention, DetectorId, ExternalAccount, ISODate, SavingsGoal } from '../domain/types';
import type { OneOffSpec, PersonaFixture, RecurringSpec, VariableSpec } from './builder';

export type EvalLabel = 'positive' | 'negative' | 'insufficient';
export type EvalTag = 'positif' | 'negatif' | 'ambigu' | 'historique_insuffisant' | 'categorie_sensible' | 'consentement_revoque' | 'consentement_restreint';

export interface EvalCase {
  id: string;
  description: string;
  tags: EvalTag[];
  level: ConsentLevel;
  /** Ajustements du consentement (signal désactivé, anticipation coupée, autorisation externe…). */
  consentPatch?: (c: ConsentRecord) => ConsentRecord;
  /** Si défini : exécution préalable à ce niveau, puis rétrogradation (test d'invalidation). */
  previousLevel?: ConsentLevel;
  persona: PersonaFixture;
  asOf: ISODate;
  /** Détecteurs non listés : étiquette « negative ». */
  labels: Partial<Record<DetectorId, EvalLabel>>;
}

interface BaseOpts {
  id: string;
  asOf?: ISODate;
  historyDays?: number;
  balance?: number;
  salary?: number;
  salaryDay?: number;
  salaryTo?: ISODate;
  salaryOverrides?: Record<string, number>;
  recurring?: RecurringSpec[];
  variable?: VariableSpec[];
  oneOffs?: OneOffSpec[];
  contracts?: Contract[];
  intentions?: DeclaredIntention[];
  goals?: SavingsGoal[];
  external?: ExternalAccount[];
  savings?: number;
}

const DEFAULT_AS_OF = '2026-06-15';

function base(o: BaseOpts): PersonaFixture {
  const asOf = o.asOf ?? DEFAULT_AS_OF;
  const start = addDays(asOf, -(o.historyDays ?? 210));
  return {
    id: o.id,
    name: `Cas ${o.id}`,
    tagline: '',
    description: '',
    referenceDate: asOf,
    customer: {
      id: o.id,
      displayName: `Cas ${o.id}`,
      accountLabel: 'Compte d’évaluation',
      clientSince: start,
      savingsBalance: eur(o.savings ?? 3000),
      contracts: o.contracts ?? [],
      externalAccounts: o.external ?? [],
    },
    ledgerSpec: {
      customerId: o.id,
      seed: `eval-${o.id}`,
      start,
      anchorDate: asOf,
      anchorBalance: eur(o.balance ?? 2600),
      recurring: [
        { counterpartyId: `ev_emp_${o.id}`, label: 'Rémunération — Employeur E (fictif)', category: 'salaire', amount: eur(o.salary ?? 2300), day: o.salaryDay ?? 27, to: o.salaryTo, overrides: o.salaryOverrides },
        { counterpartyId: `ev_rent_${o.id}`, label: 'Loyer — Bailleur E (fictif)', category: 'loyer', amount: eur(-820), day: 3 },
        { counterpartyId: `ev_nrj_${o.id}`, label: 'Fourniture énergie E (fictif)', category: 'energie', amount: eur(-70), day: 8 },
        ...(o.recurring ?? []),
      ],
      variable: [
        { category: 'courses', label: 'Alimentation E', counterpartyPrefix: 'ev_food', perMonth: 7, min: eur(20), max: eur(70) },
        { category: 'transport', label: 'Mobilité E', counterpartyPrefix: 'ev_mob', perMonth: 5, min: eur(3), max: eur(12) },
        { category: 'loisirs', label: 'Sorties E', counterpartyPrefix: 'ev_fun', perMonth: 2, min: eur(12), max: eur(45) },
        ...(o.variable ?? []),
      ],
      oneOffs: o.oneOffs ?? [],
    },
    intentions: o.intentions ?? [],
    goals: o.goals ?? [],
  };
}

const d = (offset: number, asOf: ISODate = DEFAULT_AS_OF) => addDays(asOf, offset);
const ext = (id: string): ExternalAccount => ({ id, institution: 'Établissement E (fictif)', kind: 'epargne', balance: eur(5200), monthlyNetInflow: eur(120), available: true });
const authorize = (ids: string[]) => (c: ConsentRecord): ConsentRecord => ({ ...c, externalAuthorization: { simulated: true, accountIds: ids, grantedAt: 'eval' } });

const relocationSignals = (asOf: ISODate = DEFAULT_AS_OF): Pick<BaseOpts, 'variable' | 'oneOffs'> => ({
  variable: [
    { category: 'bricolage', label: 'Bricolage E', counterpartyPrefix: 'ev_diy', perMonth: 1, min: eur(10), max: eur(30), to: d(-50, asOf) },
    { category: 'bricolage', label: 'Bricolage E', counterpartyPrefix: 'ev_diy', perMonth: 5, min: eur(35), max: eur(110), from: d(-49, asOf) },
  ],
  oneOffs: [
    { date: d(-12, asOf), amount: eur(-620), category: 'services_demenagement', label: 'Transport de mobilier E (fictif)', counterpartyId: 'ev_mover' },
    { date: d(-20, asOf), amount: eur(-30), category: 'telecom', label: 'Ouverture ligne E (fictif)', counterpartyId: 'ev_newtel' },
  ],
});

export const EVALUATION_CASES: EvalCase[] = [
  /* ---------------- Découvert ---------------- */
  {
    id: 'E01', description: 'Solde bas, deux prélèvements avant le salaire', tags: ['positif'], level: 'essentiel', asOf: DEFAULT_AS_OF,
    persona: base({ id: 'E01', balance: 150, recurring: [
      { counterpartyId: 'ev_loan', label: 'Échéance prêt E (fictif)', category: 'credit_auto', amount: eur(-280), day: 18 },
      { counterpartyId: 'ev_ins', label: 'Prime E (fictif)', category: 'assurance', amount: eur(-70), day: 20 },
    ] }),
    labels: { overdraft: 'positive' },
  },
  {
    id: 'E02', description: 'Loyer prélevé avant le salaire du 5', tags: ['positif'], level: 'conseils', asOf: '2026-06-25',
    persona: base({ id: 'E02', asOf: '2026-06-25', balance: 600, salaryDay: 5 }),
    labels: { overdraft: 'positive' },
  },
  {
    id: 'E03', description: 'Solde confortable', tags: ['negatif'], level: 'essentiel', asOf: DEFAULT_AS_OF,
    persona: base({ id: 'E03', balance: 3100 }),
    labels: { overdraft: 'negative' },
  },
  {
    id: 'E04', description: 'Point bas positif mais sous le coussin de sécurité', tags: ['ambigu'], level: 'essentiel', asOf: DEFAULT_AS_OF,
    persona: base({ id: 'E04', balance: 420, recurring: [{ counterpartyId: 'ev_loan4', label: 'Échéance prêt E4 (fictif)', category: 'credit_auto', amount: eur(-330), day: 19 }] }),
    labels: { overdraft: 'negative' },
  },
  {
    id: 'E05', description: 'Découvert réel causé par des dépenses variables non projetées', tags: ['ambigu', 'positif'], level: 'essentiel', asOf: DEFAULT_AS_OF,
    persona: base({ id: 'E05', balance: 260, recurring: [{ counterpartyId: 'ev_loan5', label: 'Échéance prêt E5 (fictif)', category: 'credit_auto', amount: eur(-110), day: 20 }] }),
    labels: { overdraft: 'positive' },
  },
  {
    id: 'E06', description: 'Nouveau client (40 jours)', tags: ['historique_insuffisant'], level: 'essentiel', asOf: DEFAULT_AS_OF,
    persona: base({ id: 'E06', historyDays: 40, balance: 90 }),
    labels: { overdraft: 'insufficient', recurring_increase: 'insufficient' },
  },
  /* ---------------- Échéances ---------------- */
  {
    id: 'E07', description: 'Contrat à 25 jours de l’échéance', tags: ['positif'], level: 'essentiel', asOf: DEFAULT_AS_OF,
    persona: base({ id: 'E07', contracts: [{ id: 'k7', kind: 'assurance_auto', label: 'Contrat auto E7', endDate: d(25) }] }),
    labels: { contract_expiry: 'positive' },
  },
  {
    id: 'E08', description: 'Contrat à 55 jours de l’échéance', tags: ['positif'], level: 'conseils', asOf: DEFAULT_AS_OF,
    persona: base({ id: 'E08', contracts: [{ id: 'k8', kind: 'forfait_telecom', label: 'Forfait E8', endDate: d(55) }] }),
    labels: { contract_expiry: 'positive' },
  },
  {
    id: 'E09', description: 'Contrat à 120 jours', tags: ['negatif'], level: 'essentiel', asOf: DEFAULT_AS_OF,
    persona: base({ id: 'E09', contracts: [{ id: 'k9', kind: 'assurance_habitation', label: 'Habitation E9', endDate: d(120) }] }),
    labels: { contract_expiry: 'negative' },
  },
  {
    id: 'E10', description: 'Contrat déjà échu depuis 10 jours', tags: ['ambigu'], level: 'essentiel', asOf: DEFAULT_AS_OF,
    persona: base({ id: 'E10', contracts: [{ id: 'k10', kind: 'assurance_auto', label: 'Contrat E10', endDate: d(-10) }] }),
    labels: { contract_expiry: 'negative' },
  },
  /* ---------------- Hausse de prélèvement ---------------- */
  {
    id: 'E11', description: 'Télécom de 35 € à 45 €', tags: ['positif'], level: 'essentiel', asOf: DEFAULT_AS_OF,
    persona: base({ id: 'E11', recurring: [{ counterpartyId: 'ev_tel11', label: 'Opérateur E11 (fictif)', category: 'telecom', amount: eur(-35), day: 12, overrides: { '2026-06': eur(-45) } }] }),
    labels: { recurring_increase: 'positive' },
  },
  {
    id: 'E12', description: 'Hausse de 4 % seulement', tags: ['negatif'], level: 'essentiel', asOf: DEFAULT_AS_OF,
    persona: base({ id: 'E12', recurring: [{ counterpartyId: 'ev_tel12', label: 'Opérateur E12 (fictif)', category: 'telecom', amount: eur(-50), day: 11, overrides: { '2026-06': eur(-52) } }] }),
    labels: { recurring_increase: 'negative' },
  },
  {
    id: 'E13', description: 'Assurance de 60 € à 72 €', tags: ['positif'], level: 'conseils', asOf: DEFAULT_AS_OF,
    persona: base({ id: 'E13', recurring: [{ counterpartyId: 'ev_ins13', label: 'Assureur E13 (fictif)', category: 'assurance', amount: eur(-60), day: 6, overrides: { '2026-06': eur(-72) } }] }),
    labels: { recurring_increase: 'positive' },
  },
  {
    id: 'E14', description: '+20 % mais seulement +4 €', tags: ['ambigu'], level: 'essentiel', asOf: DEFAULT_AS_OF,
    persona: base({ id: 'E14', recurring: [{ counterpartyId: 'ev_med14', label: 'Streaming E14 (fictif)', category: 'abonnement_media', amount: eur(-20), day: 9, overrides: { '2026-06': eur(-24) } }] }),
    labels: { recurring_increase: 'negative' },
  },
  {
    id: 'E15', description: 'Deux occurrences seulement', tags: ['historique_insuffisant'], level: 'essentiel', asOf: DEFAULT_AS_OF,
    persona: base({ id: 'E15', historyDays: 50, recurring: [{ counterpartyId: 'ev_tel15', label: 'Opérateur E15 (fictif)', category: 'telecom', amount: eur(-30), day: 10, overrides: { '2026-06': eur(-40) } }] }),
    labels: { recurring_increase: 'insufficient', overdraft: 'insufficient' },
  },
  /* ---------------- Déménagement ---------------- */
  {
    id: 'E16', description: 'Déménageur, équipement du logement, nouvelle ligne', tags: ['positif'], level: 'conseils', asOf: DEFAULT_AS_OF,
    persona: base({ id: 'E16', ...relocationSignals() }),
    labels: { relocation: 'positive' },
  },
  {
    id: 'E17', description: 'Déménagement déclaré, aucun autre signal', tags: ['positif'], level: 'conseils', asOf: DEFAULT_AS_OF,
    persona: base({ id: 'E17', intentions: [{ id: 'i17', type: 'demenagement', horizon: 'moins_3_mois', declaredOn: d(-5) }] }),
    labels: { relocation: 'positive' },
  },
  {
    id: 'E18', description: 'Un seul gros achat de mobilier', tags: ['ambigu'], level: 'conseils', asOf: DEFAULT_AS_OF,
    persona: base({ id: 'E18', oneOffs: [{ date: d(-9), amount: eur(-900), category: 'ameublement', label: 'Canapé E18 (fictif)', counterpartyId: 'ev_sofa' }] }),
    labels: { relocation: 'negative' },
  },
  {
    id: 'E19', description: 'Déménagement réel avec peu de signaux (déménageur + ligne)', tags: ['ambigu', 'positif'], level: 'conseils', asOf: DEFAULT_AS_OF,
    persona: base({ id: 'E19', oneOffs: relocationSignals().oneOffs }),
    labels: { relocation: 'positive' },
  },
  {
    id: 'E20', description: 'Signaux de déménagement mais niveau Essentiel', tags: ['consentement_restreint'], level: 'essentiel', asOf: DEFAULT_AS_OF,
    persona: base({ id: 'E20', ...relocationSignals() }),
    labels: { relocation: 'positive' },
  },
  {
    id: 'E21', description: 'Nouveau client (50 jours) avec déménageur', tags: ['historique_insuffisant'], level: 'conseils', asOf: DEFAULT_AS_OF,
    persona: base({ id: 'E21', historyDays: 50, oneOffs: [relocationSignals().oneOffs![0]] }),
    labels: { relocation: 'insufficient', overdraft: 'insufficient', recurring_increase: 'insufficient', job_change: 'insufficient' },
  },
  {
    id: 'E22', description: 'Indices uniquement dans des catégories protégées ou non classées', tags: ['categorie_sensible'], level: 'conseils', asOf: DEFAULT_AS_OF,
    persona: base({
      id: 'E22',
      variable: [{ category: 'sante', label: 'Soins E22', counterpartyPrefix: 'ev_care', perMonth: 6, min: eur(40), max: eur(160), from: d(-40) }],
      oneOffs: [
        { date: d(-8), amount: eur(-640), category: 'inconnu', label: 'VIR DEM 5521 E22', counterpartyId: 'ev_unk22' },
        { date: d(-15), amount: eur(-45), category: 'religion', label: 'Offrande E22', counterpartyId: 'ev_rel22' },
      ],
    }),
    labels: { relocation: 'negative' },
  },
  {
    id: 'E23', description: 'Signaux présents mais signal « déménagement » désactivé', tags: ['consentement_revoque'], level: 'conseils', asOf: DEFAULT_AS_OF,
    consentPatch: (c) => ({ ...c, detectorToggles: { ...c.detectorToggles, relocation: false } }),
    persona: base({ id: 'E23', ...relocationSignals() }),
    labels: { relocation: 'positive' },
  },
  /* ---------------- Emploi ---------------- */
  {
    id: 'E24', description: 'Nouvel employeur, salaire en hausse, déplacements accrus', tags: ['positif'], level: 'conseils', asOf: DEFAULT_AS_OF,
    persona: base({
      id: 'E24', salaryTo: '2026-04-30',
      recurring: [{ counterpartyId: 'ev_emp24b', label: 'Rémunération — Employeur F (fictif)', category: 'salaire', amount: eur(2650), day: 2, from: '2026-05-01' }],
      variable: [{ category: 'carburant', label: 'Carburant E24', counterpartyPrefix: 'ev_fuel', perMonth: 5, min: eur(40), max: eur(65), from: d(-60) }],
    }),
    labels: { job_change: 'positive' },
  },
  {
    id: 'E25', description: 'Augmentation chez le même employeur', tags: ['ambigu'], level: 'conseils', asOf: DEFAULT_AS_OF,
    persona: base({ id: 'E25', salaryOverrides: { '2026-05': eur(2580), '2026-06': eur(2580) } }),
    labels: { job_change: 'negative' },
  },
  {
    id: 'E26', description: 'Changement d’emploi déclaré', tags: ['positif'], level: 'conseils', asOf: DEFAULT_AS_OF,
    persona: base({ id: 'E26', intentions: [{ id: 'i26', type: 'emploi', horizon: 'moins_3_mois', declaredOn: d(-3) }] }),
    labels: { job_change: 'positive' },
  },
  {
    id: 'E27', description: 'Changement d’employeur possible, 60 jours d’historique', tags: ['historique_insuffisant'], level: 'conseils', asOf: DEFAULT_AS_OF,
    persona: base({ id: 'E27', historyDays: 60, salaryTo: d(-25),
      recurring: [{ counterpartyId: 'ev_emp27b', label: 'Rémunération — Employeur G (fictif)', category: 'salaire', amount: eur(2500), day: 1, from: d(-20) }] }),
    labels: { job_change: 'insufficient', relocation: 'insufficient', recurring_increase: 'insufficient' },
  },
  /* ---------------- Véhicule ---------------- */
  {
    id: 'E28', description: 'Projet de véhicule déclaré', tags: ['positif'], level: 'conseils', asOf: DEFAULT_AS_OF,
    persona: base({ id: 'E28', intentions: [{ id: 'i28', type: 'vehicule', horizon: '3_12_mois', declaredOn: d(-20) }] }),
    labels: { vehicle: 'positive' },
  },
  {
    id: 'E29', description: 'Acompte concession, essais, épargne renforcée', tags: ['positif'], level: 'conseils', asOf: DEFAULT_AS_OF,
    persona: base({
      id: 'E29',
      recurring: [
        { counterpartyId: 'ev_sav29', label: 'Épargne E29', category: 'epargne_virement', amount: eur(-150), day: 4, to: d(-61) },
        { counterpartyId: 'ev_sav29b', label: 'Épargne E29 bis', category: 'epargne_virement', amount: eur(-450), day: 5, from: d(-60) },
      ],
      oneOffs: [
        { date: d(-18), amount: eur(-500), category: 'automobile', label: 'Acompte concession E29 (fictive)', counterpartyId: 'ev_dealer' },
        { date: d(-30), amount: eur(-90), category: 'automobile', label: 'Location essai E29', counterpartyId: 'ev_trial' },
      ],
    }),
    labels: { vehicle: 'positive' },
  },
  {
    id: 'E30', description: 'Une réparation de garage isolée', tags: ['ambigu'], level: 'conseils', asOf: DEFAULT_AS_OF,
    persona: base({ id: 'E30', oneOffs: [{ date: d(-14), amount: eur(-650), category: 'automobile', label: 'Réparation E30', counterpartyId: 'ev_garage30' }] }),
    labels: { vehicle: 'negative' },
  },
  {
    id: 'E31', description: 'Achat réel sans aucun signal observable', tags: ['ambigu', 'positif'], level: 'conseils', asOf: DEFAULT_AS_OF,
    persona: base({ id: 'E31' }),
    labels: { vehicle: 'positive' },
  },
  /* ---------------- Immobilier ---------------- */
  {
    id: 'E32', description: 'Projet immobilier déclaré', tags: ['positif'], level: 'conseils', asOf: DEFAULT_AS_OF,
    persona: base({ id: 'E32', intentions: [{ id: 'i32', type: 'logement', horizon: 'plus_12_mois', declaredOn: d(-40) }] }),
    labels: { housing: 'positive' },
  },
  {
    id: 'E33', description: 'Frais d’agence et épargne renforcée', tags: ['positif'], level: 'conseils', asOf: DEFAULT_AS_OF,
    persona: base({
      id: 'E33',
      recurring: [
        { counterpartyId: 'ev_sav33', label: 'Épargne E33', category: 'epargne_virement', amount: eur(-200), day: 4, to: d(-61) },
        { counterpartyId: 'ev_sav33b', label: 'Épargne E33 bis', category: 'epargne_virement', amount: eur(-700), day: 5, from: d(-60) },
      ],
      oneOffs: [{ date: d(-25), amount: eur(-350), category: 'immobilier_frais', label: 'Diagnostic E33 (fictif)', counterpartyId: 'ev_diag' }],
    }),
    labels: { housing: 'positive' },
  },
  {
    id: 'E34', description: 'Un frais immobilier isolé (aide à un proche)', tags: ['ambigu'], level: 'conseils', asOf: DEFAULT_AS_OF,
    persona: base({ id: 'E34', oneOffs: [{ date: d(-25), amount: eur(-200), category: 'immobilier_frais', label: 'Frais E34', counterpartyId: 'ev_fee34' }] }),
    labels: { housing: 'negative' },
  },
  /* ---------------- Épargne ---------------- */
  {
    id: 'E35', description: 'Vue complète, compte externe autorisé, objectif déclaré', tags: ['positif'], level: 'complete', asOf: DEFAULT_AS_OF,
    consentPatch: authorize(['ev_ext35']),
    persona: base({ id: 'E35', external: [ext('ev_ext35')], goals: [{ id: 'g35', label: 'Voyage', target: eur(9000), deadline: '2027-12-31', createdOn: d(-30) }],
      recurring: [{ counterpartyId: 'ev_sav35', label: 'Épargne E35', category: 'epargne_virement', amount: eur(-250), day: 4 }] }),
    labels: { savings_goal: 'positive' },
  },
  {
    id: 'E36', description: 'Vue complète sans autorisation externe', tags: ['consentement_restreint'], level: 'complete', asOf: DEFAULT_AS_OF,
    persona: base({ id: 'E36', external: [ext('ev_ext36')], goals: [{ id: 'g36', label: 'Apport', target: eur(15000), deadline: '2028-06-30', createdOn: d(-30) }] }),
    labels: { savings_goal: 'positive' },
  },
  {
    id: 'E37', description: 'Objectif déclaré au niveau Conseils', tags: ['consentement_restreint'], level: 'conseils', asOf: DEFAULT_AS_OF,
    persona: base({ id: 'E37', goals: [{ id: 'g37', label: 'Réserve', target: eur(5000), deadline: '2027-06-30', createdOn: d(-30) }] }),
    labels: { savings_goal: 'positive' },
  },
  /* ---------------- Catégories sensibles ---------------- */
  {
    id: 'E38', description: 'Forte hausse de dépenses de santé, dons religieux et politiques, cotisation syndicale', tags: ['categorie_sensible', 'negatif'], level: 'conseils', asOf: DEFAULT_AS_OF,
    persona: base({
      id: 'E38',
      recurring: [{ counterpartyId: 'ev_union38', label: 'Cotisation E38', category: 'syndicat', amount: eur(-18), day: 6 }],
      variable: [{ category: 'sante', label: 'Soins E38', counterpartyPrefix: 'ev_care38', perMonth: 8, min: eur(60), max: eur(220), from: d(-45) }],
      oneOffs: [
        { date: d(-11), amount: eur(-100), category: 'politique', label: 'Soutien E38', counterpartyId: 'ev_pol38' },
        { date: d(-33), amount: eur(-60), category: 'religion', label: 'Don E38', counterpartyId: 'ev_rel38' },
      ],
    }),
    labels: {},
  },
  /* ---------------- Expatriation et événements sur déclaration ---------------- */
  {
    id: 'E42', description: 'Expatriation déclarée (Canada)', tags: ['positif'], level: 'conseils', asOf: DEFAULT_AS_OF,
    persona: base({ id: 'E42', intentions: [{ id: 'i42', type: 'expatriation', horizon: '3_12_mois', declaredOn: d(-10), destination: 'Canada' }] }),
    labels: { expatriation: 'positive' },
  },
  {
    id: 'E43', description: 'Virements internationaux répétés et frais de visa', tags: ['positif'], level: 'conseils', asOf: DEFAULT_AS_OF,
    persona: base({ id: 'E43', oneOffs: [
      { date: d(-40), amount: eur(-1500), category: 'virement_international', label: 'Transfert devises E43', counterpartyId: 'ev_fx43' },
      { date: d(-12), amount: eur(-700), category: 'virement_international', label: 'Transfert devises E43 bis', counterpartyId: 'ev_fx43' },
      { date: d(-30), amount: eur(-160), category: 'frais_consulaires', label: 'Visa E43', counterpartyId: 'ev_visa43' },
    ] }),
    labels: { expatriation: 'positive' },
  },
  {
    id: 'E44', description: 'Un seul virement international (vacances)', tags: ['ambigu'], level: 'conseils', asOf: DEFAULT_AS_OF,
    persona: base({ id: 'E44', oneOffs: [{ date: d(-20), amount: eur(-600), category: 'virement_international', label: 'Location vacances E44', counterpartyId: 'ev_fx44' }] }),
    labels: { expatriation: 'negative' },
  },
  {
    id: 'E45', description: 'Signaux d’expatriation au niveau Essentiel', tags: ['consentement_restreint'], level: 'essentiel', asOf: DEFAULT_AS_OF,
    persona: base({ id: 'E45', oneOffs: [
      { date: d(-40), amount: eur(-1500), category: 'virement_international', label: 'Transfert devises E45', counterpartyId: 'ev_fx45' },
      { date: d(-30), amount: eur(-160), category: 'frais_consulaires', label: 'Visa E45', counterpartyId: 'ev_visa45' },
    ] }),
    labels: { expatriation: 'positive' },
  },
  {
    id: 'E46', description: 'Naissance déclarée', tags: ['positif'], level: 'conseils', asOf: DEFAULT_AS_OF,
    persona: base({ id: 'E46', intentions: [{ id: 'i46', type: 'naissance', horizon: '3_12_mois', declaredOn: d(-8) }] }),
    labels: { birth: 'positive' },
  },
  {
    id: 'E47', description: 'Naissance réelle non déclarée : jamais déduite (faux négatif assumé)', tags: ['ambigu', 'positif'], level: 'conseils', asOf: DEFAULT_AS_OF,
    persona: base({ id: 'E47' }),
    labels: { birth: 'positive' },
  },
  {
    id: 'E48', description: 'Séparation déclarée', tags: ['positif'], level: 'conseils', asOf: DEFAULT_AS_OF,
    persona: base({ id: 'E48', intentions: [{ id: 'i48', type: 'separation', horizon: 'moins_3_mois', declaredOn: d(-4) }] }),
    labels: { separation: 'positive' },
  },
  {
    id: 'E49', description: 'Premier emploi déclaré', tags: ['positif'], level: 'conseils', asOf: DEFAULT_AS_OF,
    persona: base({ id: 'E49', intentions: [{ id: 'i49', type: 'premier_emploi', horizon: 'moins_3_mois', declaredOn: d(-15) }] }),
    labels: { first_job: 'positive' },
  },
  /* ---------------- Consentement révoqué ---------------- */
  {
    id: 'E39', description: 'Anticipation optionnelle désactivée, découvert imminent', tags: ['consentement_revoque'], level: 'essentiel', asOf: DEFAULT_AS_OF,
    consentPatch: (c) => ({ ...c, anticipationEnabled: false }),
    persona: base({ id: 'E39', balance: 100, recurring: [{ counterpartyId: 'ev_loan39', label: 'Prêt E39', category: 'credit_auto', amount: eur(-300), day: 18 }] }),
    labels: { overdraft: 'positive' },
  },
  {
    id: 'E40', description: 'Rétrogradation de Vue complète à Essentiel', tags: ['consentement_revoque'], level: 'essentiel', previousLevel: 'complete', asOf: DEFAULT_AS_OF,
    consentPatch: authorize(['ev_ext40']),
    persona: base({ id: 'E40', ...relocationSignals(), external: [ext('ev_ext40')], goals: [{ id: 'g40', label: 'Projet', target: eur(8000), deadline: '2027-12-31', createdOn: d(-30) }] }),
    labels: { relocation: 'positive', savings_goal: 'positive' },
  },
  {
    id: 'E41', description: 'Conseils avec habitudes non sensibles désactivées', tags: ['consentement_revoque'], level: 'conseils', asOf: DEFAULT_AS_OF,
    consentPatch: (c) => ({ ...c, scopeToggles: { ...c.scopeToggles, 'habits.nonsensitive': false } }),
    persona: base({ id: 'E41', ...relocationSignals() }),
    labels: { relocation: 'positive' },
  },
];
