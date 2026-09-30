import type { ISODate, LegalBasis, Minor } from '../domain/types';

export type CaseStatus = 'brouillon' | 'a_verifier' | 'informations_manquantes' | 'valide';

export const CASE_STATUS_LABELS: Record<CaseStatus, string> = {
  brouillon: 'Brouillon',
  a_verifier: 'À vérifier',
  informations_manquantes: 'Informations manquantes',
  valide: 'Validé par un conseiller',
};

export interface ChecklistItem {
  id: string;
  label: string;
  state: 'recu' | 'manquant' | 'a_verifier';
}

export interface SimDocument {
  id: string;
  name: string;
  kind: string;
  /** Texte non fiable : traité comme donnée, jamais comme instruction. */
  text: string;
  addedAt: string;
  extracted: Record<string, string>;
  flags: string[];
}

export interface AuditEntry {
  at: string;
  actor: string;
  action: string;
}

/** Section du dossier vers laquelle un raccourci peut conduire. */
export type GuideSection = 'checklist' | 'payload' | 'documents' | 'timeline';

export interface FindingGuide {
  procedureId: string;
  /** Endroit du dossier concerné (défilement et surbrillance). */
  target?: { section: GuideSection; key?: string };
  /** Objet de la demande au client, si une demande est pertinente. */
  requestSubject?: string;
  /** Raccourci : passer le dossier « À vérifier ». */
  suggestReview?: boolean;
}

export interface Finding {
  severity: 'info' | 'attention' | 'bloquant';
  text: string;
  guide?: FindingGuide;
}

/** Demande au client préparée par le conseiller : brouillon jamais envoyé. */
export interface ClientRequest {
  id: string;
  at: string;
  subject: string;
  body: string;
}

export interface DeclaredIdentity {
  nom: string;
  prenom: string;
  dateNaissance: ISODate;
  nationalite: string;
  adresse: string;
  email: string;
  telephone: string;
}

export type CasePayload =
  | { kind: 'ouverture'; declared: DeclaredIdentity }
  | { kind: 'kyc'; declared: DeclaredIdentity }
  | { kind: 'mise_a_jour'; idExpiry: ISODate; employmentUpdatedOn: ISODate; employment: string; email: string; phoneVerifiedOn: ISODate }
  | {
      kind: 'credit';
      netIncomeMonthly: Minor;
      fixedExpensesMonthly: Minor;
      existingDebtMonthly: Minor;
      loanAmount: Minor;
      annualRatePct: number;
      termMonths: number;
      propertyValue: Minor;
    }
  | {
      kind: 'reclamation';
      contractRef: string;
      messages: { date: ISODate; from: 'client' | 'banque'; text: string }[];
      transactions: { date: ISODate; amount: Minor; label: string }[];
    }
  | { kind: 'sanctions'; subjects: string[] }
  | { kind: 'modele' };

export interface AdvisorCase {
  id: string;
  formalityId: number;
  title: string;
  clientRef: string;
  legalBasis: LegalBasis;
  status: CaseStatus;
  checklist: ChecklistItem[];
  documents: SimDocument[];
  notes: string;
  draft: string;
  /** Absent dans les états enregistrés avant cette fonctionnalité. */
  clientRequests?: ClientRequest[];
  audit: AuditEntry[];
  payload: CasePayload;
}
