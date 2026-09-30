import { createTemplateCase, seedAdvisorCases } from '../advisor/seed';
import { simulateExtraction } from '../advisor/logic';
import { procedureForItem } from '../advisor/procedures';
import { izimiVault } from '../data/izimi';
import type { AdvisorCase, CaseStatus, ChecklistItem } from '../advisor/types';
import { CASE_STATUS_LABELS } from '../advisor/types';
import { buildCustomerData } from '../data/builder';
import { PERSONA_BY_ID, camille } from '../data/personas';
import { ALL_DETECTORS, allTrue, applyConsentChange, defaultConsent, type ConsentChange } from '../domain/consent';
import { DETECTOR_LABELS } from '../domain/detectors';
import { runAnticipation } from '../domain/engine';
import { isValidISODate } from '../domain/dates';
import type {
  AnticipationStore,
  ConsentHistoryEntry,
  ConsentRecord,
  CustomerData,
  DeclaredIntention,
  DetectorId,
  FeedbackEntry,
  FeedbackResponse,
  ISODate,
  RunAudit,
  SavingsGoal,
} from '../domain/types';

export interface Notice {
  id: number;
  tone: 'info' | 'success' | 'warning' | 'error';
  text: string;
}

/** Partage de documents avec le coffre izimi SIMULÉ : finalité distincte de la personnalisation. */
export interface IzimiState {
  linkedAt: string | null;
  shared: { docId: string; name: string; at: string }[];
  imported: { izimiDocId: string; name: string; at: string }[];
  log: { at: string; text: string }[];
}

export const emptyIzimi = (): IzimiState => ({ linkedAt: null, shared: [], imported: [], log: [] });

export interface AppState {
  schema: 1;
  personaId: string;
  demoDate: ISODate;
  clock: number;
  intentions: DeclaredIntention[];
  goals: SavingsGoal[];
  consent: ConsentRecord;
  consentHistory: ConsentHistoryEntry[];
  store: AnticipationStore;
  lastAudit: RunAudit | null;
  feedback: FeedbackEntry[];
  advisorCases: AdvisorCase[];
  izimi: IzimiState;
  /** Éléments cochés de chaque plan, par identifiant d'intention déclarée. */
  planProgress: Record<string, string[]>;
  notice: Notice | null;
}

export type Action =
  | { type: 'consent'; change: ConsentChange }
  | { type: 'feedback'; detectorId: DetectorId; response: FeedbackResponse }
  | { type: 'intention/add'; intention: Omit<DeclaredIntention, 'id' | 'declaredOn'> }
  | { type: 'intention/remove'; id: string }
  | { type: 'goal/add'; goal: Omit<SavingsGoal, 'id' | 'createdOn'> }
  | { type: 'goal/remove'; id: string }
  | { type: 'demo/reset'; personaId?: string }
  | { type: 'demo/date'; date: ISODate }
  | { type: 'notice'; tone: Notice['tone']; text: string }
  | { type: 'notice/dismiss' }
  | { type: 'case/open-template'; formalityId: number }
  | { type: 'case/checklist'; caseId: string; itemId: string; state: ChecklistItem['state'] }
  | { type: 'case/status'; caseId: string; status: CaseStatus }
  | { type: 'case/notes'; caseId: string; notes: string }
  | { type: 'case/draft'; caseId: string; draft: string }
  | { type: 'case/document'; caseId: string; name: string; kind: string; text: string }
  | { type: 'case/request'; caseId: string; subject: string; body: string }
  | { type: 'case/request-remove'; caseId: string; requestId: string }
  | { type: 'plan/toggle'; intentionId: string; itemId: string }
  | { type: 'izimi/link' }
  | { type: 'izimi/unlink' }
  | { type: 'izimi/share'; docId: string; name: string }
  | { type: 'izimi/import'; izimiDocId: string }
  | { type: 'case/izimi-import'; caseId: string; izimiDocId: string };

/* Horodatage déterministe piloté par l'horloge de démo. */
export function stamp(date: ISODate, clock: number): string {
  const minutes = 9 * 60 + clock;
  const hh = String(Math.floor(minutes / 60) % 24).padStart(2, '0');
  const mm = String(minutes % 60).padStart(2, '0');
  return `${date}T${hh}:${mm}:00`;
}

const dataCache = new Map<string, CustomerData>();

/** Données client dérivées (registre synthétique + déclarations courantes). */
export function customerData(s: Pick<AppState, 'personaId' | 'demoDate' | 'intentions' | 'goals'>): CustomerData {
  const key = `${s.personaId}|${s.demoDate}`;
  let base = dataCache.get(key);
  if (!base) {
    base = buildCustomerData(PERSONA_BY_ID[s.personaId] ?? camille, s.demoDate);
    dataCache.set(key, base);
  }
  return { ...base, intentions: s.intentions, goals: s.goals };
}

function recompute(s: AppState): AppState {
  const { store, audit } = runAnticipation({ data: customerData(s), consent: s.consent, asOf: s.demoDate, previous: s.store });
  return { ...s, store, lastAudit: audit };
}

let noticeSeq = 1;
const notice = (tone: Notice['tone'], text: string): Notice => ({ id: noticeSeq++, tone, text });

export function initialState(personaId = 'camille', demoDate?: ISODate): AppState {
  const persona = PERSONA_BY_ID[personaId] ?? camille;
  const date = demoDate ?? persona.referenceDate;
  const ts = stamp(date, 0);
  const consent = defaultConsent(ts);
  return recompute({
    schema: 1,
    personaId: persona.id,
    demoDate: date,
    clock: 0,
    intentions: persona.intentions.map((i) => ({ ...i })),
    goals: persona.goals.map((g) => ({ ...g })),
    consent,
    consentHistory: [{ version: 1, timestamp: ts, level: consent.level, changes: ['Réglage par défaut : Essentiel'], purpose: consent.purpose }],
    store: { conclusions: {} },
    lastAudit: null,
    feedback: [],
    advisorCases: seedAdvisorCases(ts),
    izimi: emptyIzimi(),
    planProgress: {},
    notice: null,
  });
}

function updateCase(s: AppState, caseId: string, fn: (c: AdvisorCase, at: string) => AdvisorCase | { error: string }): AppState {
  const at = stamp(s.demoDate, s.clock + 1);
  const target = s.advisorCases.find((c) => c.id === caseId);
  if (!target) return { ...s, notice: notice('error', 'Dossier introuvable.') };
  const res = fn(target, at);
  if ('error' in res) return { ...s, notice: notice('error', res.error) };
  return { ...s, clock: s.clock + 1, advisorCases: s.advisorCases.map((c) => (c.id === caseId ? res : c)) };
}

const audit = (c: AdvisorCase, at: string, action: string) => [...c.audit, { at, actor: 'Conseiller (démo)', action }];

const FEEDBACK_TEXT: Record<FeedbackResponse, string> = {
  pertinent: 'Merci : retour enregistré comme pertinent.',
  non: 'Compris : cette suggestion ne sera plus proposée pendant la période de repos.',
  plus_tard: 'D’accord : nous vous le reproposerons plus tard.',
};

export function reducer(s: AppState, a: Action): AppState {
  switch (a.type) {
    case 'consent': {
      const ts = stamp(s.demoDate, s.clock + 1);
      const res = applyConsentChange(s.consent, a.change, ts, DETECTOR_LABELS);
      if ('error' in res) return { ...s, notice: notice('warning', res.error) };
      const next = recompute({ ...s, clock: s.clock + 1, consent: res.record, consentHistory: [res.entry, ...s.consentHistory] });
      const removed = next.lastAudit?.invalidated.length ?? 0;
      const text = `Consentement mis à jour (version ${res.record.version}). ${
        removed ? `${removed} conclusion${removed > 1 ? 's' : ''} supprimée${removed > 1 ? 's' : ''} du magasin d’anticipation.` : 'Analyse recalculée.'
      }`;
      return { ...next, notice: notice('success', text) };
    }
    case 'feedback': {
      const entry: FeedbackEntry = { detectorId: a.detectorId, response: a.response, at: s.demoDate, consentVersion: s.consent.version };
      return { ...s, feedback: [...s.feedback, entry], notice: notice('info', FEEDBACK_TEXT[a.response]) };
    }
    case 'intention/add': {
      const intention: DeclaredIntention = { ...a.intention, id: `int-${s.clock + 1}`, declaredOn: s.demoDate };
      return { ...recompute({ ...s, clock: s.clock + 1, intentions: [...s.intentions, intention] }), notice: notice('success', 'Intention enregistrée.') };
    }
    case 'intention/remove':
      return { ...recompute({ ...s, intentions: s.intentions.filter((i) => i.id !== a.id) }), notice: notice('info', 'Intention supprimée.') };
    case 'goal/add': {
      if (a.goal.target <= 0) return { ...s, notice: notice('error', 'Le montant de l’objectif doit être positif.') };
      if (!isValidISODate(a.goal.deadline) || a.goal.deadline <= s.demoDate) return { ...s, notice: notice('error', 'L’échéance doit être une date future.') };
      const goal: SavingsGoal = { ...a.goal, id: `goal-${s.clock + 1}`, createdOn: s.demoDate };
      return { ...recompute({ ...s, clock: s.clock + 1, goals: [...s.goals, goal] }), notice: notice('success', 'Objectif enregistré.') };
    }
    case 'goal/remove':
      return { ...recompute({ ...s, goals: s.goals.filter((g) => g.id !== a.id) }), notice: notice('info', 'Objectif supprimé.') };
    case 'demo/reset': {
      const next = initialState(a.personaId ?? s.personaId);
      return { ...next, notice: notice('success', `Démo réinitialisée : ${PERSONA_BY_ID[next.personaId].name}, niveau Essentiel.`) };
    }
    case 'demo/date': {
      if (!isValidISODate(a.date)) return { ...s, notice: notice('error', 'Date invalide.') };
      return { ...recompute({ ...s, demoDate: a.date }), notice: notice('info', `Horloge de démo réglée au ${a.date}.`) };
    }
    case 'notice':
      return { ...s, notice: notice(a.tone, a.text) };
    case 'notice/dismiss':
      return { ...s, notice: null };
    case 'case/open-template': {
      if (s.advisorCases.some((c) => c.formalityId === a.formalityId)) return s;
      const id = `DOS-${String(100 + a.formalityId)}`;
      const c = createTemplateCase(a.formalityId, id, stamp(s.demoDate, s.clock + 1));
      return { ...s, clock: s.clock + 1, advisorCases: [...s.advisorCases, c] };
    }
    case 'case/checklist':
      return updateCase(s, a.caseId, (c, at) => {
        const it = c.checklist.find((i) => i.id === a.itemId);
        if (!it) return { error: 'Élément introuvable.' };
        const labels = { recu: 'reçu', manquant: 'manquant', a_verifier: 'à vérifier' } as const;
        return {
          ...c,
          checklist: c.checklist.map((i) => (i.id === a.itemId ? { ...i, state: a.state } : i)),
          audit: audit(c, at, `« ${it.label} » marqué ${labels[a.state]}`),
        };
      });
    case 'case/status':
      return updateCase(s, a.caseId, (c, at) => {
        if (a.status === 'valide' && c.checklist.some((i) => i.state !== 'recu')) {
          return { error: 'Validation impossible : toutes les pièces doivent être marquées « reçu ».' };
        }
        return { ...c, status: a.status, audit: audit(c, at, `Statut changé : ${CASE_STATUS_LABELS[c.status]} → ${CASE_STATUS_LABELS[a.status]}`) };
      });
    case 'case/notes':
      return updateCase(s, a.caseId, (c, at) => ({ ...c, notes: a.notes, audit: audit(c, at, 'Note du conseiller mise à jour') }));
    case 'case/draft':
      return updateCase(s, a.caseId, (c, at) => ({ ...c, draft: a.draft, audit: audit(c, at, 'Brouillon généré (à relire)') }));
    case 'case/request':
      return updateCase(s, a.caseId, (c, at) => {
        const existing = c.clientRequests ?? [];
        if (existing.some((r) => r.subject === a.subject)) return { error: 'Une demande identique existe déjà dans ce dossier.' };
        const request = { id: `req-${existing.length + 1}-${at}`, at, subject: a.subject, body: a.body };
        return {
          ...c,
          clientRequests: [...existing, request],
          audit: audit(c, at, `Demande au client préparée (brouillon non envoyé) : ${a.subject}`),
        };
      });
    case 'case/request-remove':
      return updateCase(s, a.caseId, (c, at) => {
        const r = (c.clientRequests ?? []).find((x) => x.id === a.requestId);
        if (!r) return { error: 'Demande introuvable.' };
        return {
          ...c,
          clientRequests: (c.clientRequests ?? []).filter((x) => x.id !== a.requestId),
          audit: audit(c, at, `Brouillon de demande supprimé : ${r.subject}`),
        };
      });
    case 'plan/toggle': {
      const done = s.planProgress[a.intentionId] ?? [];
      const next = done.includes(a.itemId) ? done.filter((x) => x !== a.itemId) : [...done, a.itemId];
      return { ...s, planProgress: { ...s.planProgress, [a.intentionId]: next } };
    }
    case 'izimi/link': {
      if (s.izimi.linkedAt) return { ...s, notice: notice('warning', 'Votre coffre izimi (simulé) est déjà relié.') };
      const at = stamp(s.demoDate, s.clock + 1);
      return {
        ...s,
        clock: s.clock + 1,
        izimi: { ...s.izimi, linkedAt: at, log: [{ at, text: 'Coffre izimi relié (simulation) — finalité : partage de documents' }, ...s.izimi.log] },
        notice: notice('success', 'Coffre izimi relié (simulation). Aucune donnée n’est échangée avec le service réel.'),
      };
    }
    case 'izimi/unlink': {
      if (!s.izimi.linkedAt) return s;
      const at = stamp(s.demoDate, s.clock + 1);
      return {
        ...s,
        clock: s.clock + 1,
        izimi: { ...s.izimi, linkedAt: null, log: [{ at, text: 'Accès au coffre izimi retiré' }, ...s.izimi.log] },
        notice: notice('info', 'Accès retiré. Les documents déjà transmis restent dans leur dossier respectif.'),
      };
    }
    case 'izimi/share': {
      if (!s.izimi.linkedAt) return { ...s, notice: notice('error', 'Reliez d’abord votre coffre izimi (simulé).') };
      if (s.izimi.shared.some((d) => d.docId === a.docId)) return { ...s, notice: notice('warning', 'Ce document est déjà dans votre coffre izimi.') };
      const at = stamp(s.demoDate, s.clock + 1);
      return {
        ...s,
        clock: s.clock + 1,
        izimi: { ...s.izimi, shared: [...s.izimi.shared, { docId: a.docId, name: a.name, at }], log: [{ at, text: `Envoyé vers izimi : ${a.name}` }, ...s.izimi.log] },
        notice: notice('success', `« ${a.name} » copié dans votre coffre izimi (simulation).`),
      };
    }
    case 'izimi/import': {
      if (!s.izimi.linkedAt) return { ...s, notice: notice('error', 'Reliez d’abord votre coffre izimi (simulé).') };
      const doc = izimiVault(s.personaId).find((d) => d.id === a.izimiDocId);
      if (!doc) return { ...s, notice: notice('error', 'Document introuvable dans le coffre.') };
      if (!doc.available) return { ...s, notice: notice('error', `« ${doc.name} » n’a pas pu être récupéré (erreur simulée : fichier trop volumineux).`) };
      if (s.izimi.imported.some((d) => d.izimiDocId === doc.id)) return { ...s, notice: notice('warning', 'Ce document a déjà été transmis à la banque.') };
      const at = stamp(s.demoDate, s.clock + 1);
      return {
        ...s,
        clock: s.clock + 1,
        izimi: { ...s.izimi, imported: [...s.izimi.imported, { izimiDocId: doc.id, name: doc.name, at }], log: [{ at, text: `Transmis à la banque depuis izimi : ${doc.name}` }, ...s.izimi.log] },
        notice: notice('success', `« ${doc.name} » transmis à votre banque. Il n’est pas utilisé par l’anticipation.`),
      };
    }
    case 'case/izimi-import':
      return updateCase(s, a.caseId, (c, at) => {
        const doc = izimiVault(c.clientRef).find((d) => d.id === a.izimiDocId);
        if (!doc) return { error: 'Document introuvable dans le coffre izimi du client.' };
        if (!doc.available) return { error: `« ${doc.name} » n’a pas pu être récupéré (erreur simulée).` };
        if (c.documents.some((d) => d.id === `izimi-${doc.id}`)) return { error: 'Ce document est déjà dans le dossier.' };
        const { extracted, flags } = simulateExtraction(doc.text);
        // La pièce correspondante passe « à vérifier » : un humain doit la contrôler.
        const checklist = c.checklist.map((i) => (i.state === 'manquant' && procedureForItem(i.label) === doc.procedureId ? { ...i, state: 'a_verifier' as const } : i));
        return {
          ...c,
          checklist,
          documents: [...c.documents, { id: `izimi-${doc.id}`, name: doc.name, kind: `${doc.kind} (via izimi)`, text: doc.text, addedAt: at, extracted, flags }],
          audit: audit(c, at, `Document importé depuis le coffre izimi du client (simulation, autorisation simulée) : ${doc.name}`),
        };
      });
    case 'case/document':
      return updateCase(s, a.caseId, (c, at) => {
        if (!a.text.trim()) return { error: 'Le texte du document simulé est vide.' };
        const { extracted, flags } = simulateExtraction(a.text);
        const doc = { id: `doc-${c.documents.length + 1}-${at}`, name: a.name.trim() || 'document_simule.txt', kind: a.kind, text: a.text, addedAt: at, extracted, flags };
        return {
          ...c,
          documents: [...c.documents, doc],
          audit: audit(c, at, `Document simulé importé : ${doc.name} (${Object.keys(extracted).length} champ(s) extrait(s))`),
        };
      });
  }
}

const STORAGE_KEY = 'anticipe:state:v1';

export function loadState(): AppState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AppState;
    if (parsed?.schema !== 1 || !PERSONA_BY_ID[parsed.personaId]) return null;
    // Recalcul systématique : le magasin est dérivé et soumis au consentement courant.
    // Compatibilité avec les états enregistrés par une version antérieure.
    const consent = { ...parsed.consent, detectorToggles: { ...allTrue(ALL_DETECTORS), ...parsed.consent.detectorToggles } };
    return recompute({ ...parsed, consent, izimi: parsed.izimi ?? emptyIzimi(), planProgress: parsed.planProgress ?? {}, notice: null });
  } catch {
    return null;
  }
}

export function saveState(s: AppState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...s, notice: null, lastAudit: null }));
  } catch {
    /* stockage indisponible : la démo fonctionne sans persistance */
  }
}
