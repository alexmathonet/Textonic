/**
 * Modèles typés du prototype Anticipe.
 *
 * Conventions :
 *  - Les montants sont des entiers en unités mineures (centimes d'euro) : type `Minor`.
 *  - Les dates sont des chaînes ISO `YYYY-MM-DD` interprétées en UTC : type `ISODate`.
 */

export type Minor = number;
export type ISODate = string;

/* ------------------------------------------------------------------ */
/* Registre bancaire source (synthétique)                              */
/* ------------------------------------------------------------------ */

/** Catégories connues du registre. Certaines sont protégées et bloquées avant analyse. */
export type Category =
  | 'salaire'
  | 'loyer'
  | 'energie'
  | 'telecom'
  | 'assurance'
  | 'credit_auto'
  | 'credit_immo'
  | 'abonnement_sport'
  | 'abonnement_media'
  | 'courses'
  | 'restauration'
  | 'transport'
  | 'carburant'
  | 'bricolage'
  | 'ameublement'
  | 'services_demenagement'
  | 'automobile'
  | 'immobilier_frais'
  | 'epargne_virement'
  | 'loisirs'
  | 'virement_international'
  | 'frais_consulaires'
  // Catégories protégées (bloquées avant toute extraction de caractéristiques)
  | 'sante'
  | 'religion'
  | 'syndicat'
  | 'politique'
  // Catégorie non classée (exclue du profilage comportemental)
  | 'inconnu';

export interface Transaction {
  id: string;
  date: ISODate;
  /** Montant signé : négatif = débit, positif = crédit. */
  amount: Minor;
  /** Catégorie telle que fournie par le registre. Chaîne libre : une valeur inconnue est traitée comme non classée. */
  category: string;
  /** Libellé affiché dans le registre. Jamais copié dans le magasin d'anticipation. */
  label: string;
  /** Identifiant de contrepartie. Jamais copié dans le magasin d'anticipation. */
  counterpartyId: string;
  status: 'booked' | 'scheduled';
}

export interface Contract {
  id: string;
  kind: 'assurance_habitation' | 'assurance_auto' | 'credit_auto' | 'credit_immo' | 'forfait_telecom';
  label: string;
  endDate: ISODate;
  /** Échéancier connu de la banque (crédits internes) : montant signé, jour du mois, contrepartie des prélèvements. */
  installment?: { amount: Minor; day: number; counterpartyId: string };
}

/** Rappel de paiement émis par la banque sur l'un de ses propres contrats. */
export interface PaymentNotice {
  id: string;
  contractId: string;
  level: 'premier_rappel' | 'dernier_rappel';
  label: string;
  /** Montant à régulariser (positif). */
  amountDue: Minor;
  dueDate: ISODate;
  issuedOn: ISODate;
  /** Échéance impayée à l'origine du rappel. */
  missedDate: ISODate;
}

export interface ExternalAccount {
  id: string;
  /** Établissement fictif. */
  institution: string;
  kind: 'epargne' | 'courant';
  balance: Minor;
  monthlyNetInflow: Minor;
  /** Un établissement « indisponible » permet de montrer l'état d'erreur de la connexion simulée. */
  available: boolean;
}

export type IntentionType = 'demenagement' | 'vehicule' | 'logement' | 'emploi' | 'expatriation' | 'naissance' | 'premier_emploi' | 'separation';

export interface DeclaredIntention {
  id: string;
  type: IntentionType;
  horizon: 'moins_3_mois' | '3_12_mois' | 'plus_12_mois';
  declaredOn: ISODate;
  note?: string;
  /** Pays de destination (expatriation uniquement). */
  destination?: string;
}

export interface SavingsGoal {
  id: string;
  label: string;
  target: Minor;
  deadline: ISODate;
  createdOn: ISODate;
}

export interface Customer {
  id: string;
  displayName: string;
  accountLabel: string;
  clientSince: ISODate;
  /** Solde d'épargne interne (compte d'épargne de la banque). */
  savingsBalance: Minor;
  contracts: Contract[];
  /** Rappels de paiement en cours (absents pour la plupart des profils). */
  notices?: PaymentNotice[];
  externalAccounts: ExternalAccount[];
}

/** Données client complètes : registre + déclarations. Seul le registre est « source ». */
export interface CustomerData {
  customer: Customer;
  initialBalance: Minor;
  ledger: Transaction[];
  intentions: DeclaredIntention[];
  goals: SavingsGoal[];
}

/* ------------------------------------------------------------------ */
/* Consentement                                                        */
/* ------------------------------------------------------------------ */

export type ConsentLevel = 'essentiel' | 'conseils' | 'complete';

export type Scope =
  | 'internal.recurring'
  | 'internal.deadlines'
  | 'habits.nonsensitive'
  | 'intentions.declared'
  | 'goals.declared'
  | 'external.accounts';

export type DetectorId =
  | 'overdraft'
  | 'contract_expiry'
  | 'recurring_increase'
  | 'relocation'
  | 'job_change'
  | 'vehicle'
  | 'housing'
  | 'savings_goal'
  | 'expatriation'
  | 'birth'
  | 'first_job'
  | 'separation';

/** Finalité de traitement. La personnalisation optionnelle est distincte des obligations légales. */
export type ProcessingPurpose = 'personnalisation_optionnelle';
export type LegalBasis = 'obligation_legale' | 'execution_contrat' | 'interet_legitime_controle';

export interface ExternalAuthorization {
  simulated: true;
  accountIds: string[];
  grantedAt: string;
}

export interface ConsentRecord {
  version: number;
  level: ConsentLevel;
  /** Interrupteur global : désactive toute anticipation optionnelle (le registre n'est pas supprimé). */
  anticipationEnabled: boolean;
  /** Restrictions par catégorie de données (ne peuvent qu'affiner le niveau, jamais l'élargir). */
  scopeToggles: Record<Scope, boolean>;
  /** Restrictions par signal/sujet (détecteur). */
  detectorToggles: Record<DetectorId, boolean>;
  /** Autorisation séparée, explicite et simulée des comptes externes. */
  externalAuthorization: ExternalAuthorization | null;
  timestamp: string;
  purpose: ProcessingPurpose;
}

/** Historique minimal : aucune donnée transactionnelle. */
export interface ConsentHistoryEntry {
  version: number;
  timestamp: string;
  level: ConsentLevel;
  changes: string[];
  purpose: ProcessingPurpose;
}

/* ------------------------------------------------------------------ */
/* Détection                                                           */
/* ------------------------------------------------------------------ */

export type DetectionStatus = 'detected' | 'not_detected' | 'insufficient_evidence';

export interface SignalResult {
  id: string;
  /** Catégorie de signal compréhensible, sans détail transactionnel. */
  categoryLabel: string;
  scope: Scope;
  weight: number;
  state: 'present' | 'absent' | 'insufficient';
  /** Signal explicite fort (intention déclarée). */
  strong?: boolean;
}

/** Élément de preuve agrégé et non sensible. */
export interface Evidence {
  label: string;
  value: string;
}

export interface DetectorOutput {
  status: DetectionStatus;
  score: number;
  threshold: number;
  signals: SignalResult[];
  evidence: Evidence[];
  assumptions: string[];
  /** Paramètres structurés approuvés pour la formulation du message (agrégats uniquement). */
  facts: Record<string, string | number>;
}

/** Conclusion conservée dans le magasin d'anticipation. Ne contient jamais de transaction brute. */
export interface Conclusion extends DetectorOutput {
  detectorId: DetectorId;
  scopesUsed: Scope[];
  consentVersion: number;
  createdAt: ISODate;
}

export interface AnticipationStore {
  conclusions: Partial<Record<DetectorId, Conclusion>>;
}

export interface RunAudit {
  allowedScopes: Scope[];
  executed: DetectorId[];
  skipped: { detectorId: DetectorId; reason: string }[];
  extractedScopes: Scope[];
  forbiddenAccess: { detectorId: DetectorId; scope: Scope }[];
  invalidated: DetectorId[];
  /** Nombre total d'opérations exclues (protégées ou non classées), sans ventilation. */
  excludedTransactions: number;
}

/* ------------------------------------------------------------------ */
/* Recommandations et retours                                          */
/* ------------------------------------------------------------------ */

export type RecommendationKind = 'alerte' | 'question' | 'projection' | 'etape_suivante';
export type RecommendationStatus = 'nouvelle' | 'confirmee' | 'vue';

export interface NextAction {
  id: string;
  label: string;
}

export interface Recommendation {
  id: string;
  detectorId: DetectorId;
  type: DetectorId;
  kind: RecommendationKind;
  title: string;
  body: string;
  requiredScopes: Scope[];
  score: number;
  threshold: number;
  explanation: string;
  signalCategories: string[];
  evidence: Evidence[];
  assumptions: string[];
  createdAt: ISODate;
  consentVersion: number;
  status: RecommendationStatus;
  nextActions: NextAction[];
}

export type FeedbackResponse = 'pertinent' | 'non' | 'plus_tard';

export interface FeedbackEntry {
  detectorId: DetectorId;
  response: FeedbackResponse;
  at: ISODate;
  consentVersion: number;
}
