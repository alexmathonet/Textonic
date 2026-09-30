import { diffDays, formatDateLong, isValidISODate } from '../domain/dates';
import { formatEUR, formatPct } from '../domain/money';
import type { ISODate, Minor } from '../domain/types';
import { FORMALITY_BY_ID } from './formalities';
import { PROCEDURES, procedureForItem } from './procedures';
import { CASE_STATUS_LABELS, type AdvisorCase, type DeclaredIdentity, type Finding, type FindingGuide } from './types';

/* ------------------------------------------------------------------ */
/* Texte non fiable                                                    */
/* ------------------------------------------------------------------ */

const INJECTION_PATTERNS = [
  /ignore[rz]?\s+(les|toutes|previous|all|the)/i,
  /instructions?\s+(précédentes|previous|système|system)/i,
  /\b(approuve[rz]?|valide[rz]?|accorde[rz]?)\s+(automatiquement|immédiatement|ce dossier|le remboursement|la demande)/i,
  /\byou are\b|\btu es (maintenant|désormais)\b/i,
  /\bsystem prompt\b|\bprompt\b/i,
];

/**
 * Détecte des formulations ressemblant à des instructions dans un texte importé.
 * Le texte n'est JAMAIS exécuté ni suivi : il est seulement signalé pour revue.
 */
export function detectInstructionLikeText(text: string): boolean {
  return INJECTION_PATTERNS.some((p) => p.test(text));
}

/* ------------------------------------------------------------------ */
/* Extraction simulée                                                  */
/* ------------------------------------------------------------------ */

const FIELD_PATTERNS: Record<string, RegExp> = {
  nom: /^\s*nom\s*:\s*(.+)$/im,
  prenom: /^\s*pr[ée]nom\s*:\s*(.+)$/im,
  dateNaissance: /^\s*date de naissance\s*:\s*(\d{4}-\d{2}-\d{2})\s*$/im,
  nationalite: /^\s*nationalit[ée]\s*:\s*(.+)$/im,
  numeroDocument: /^\s*n[°o]\s*(?:de\s*)?document\s*:\s*(.+)$/im,
  dateExpiration: /^\s*date d['’]expiration\s*:\s*(\d{4}-\d{2}-\d{2})\s*$/im,
  adresse: /^\s*adresse\s*:\s*(.+)$/im,
};

export const EXTRACTABLE_FIELDS: Record<string, string> = {
  nom: 'Nom',
  prenom: 'Prénom',
  dateNaissance: 'Date de naissance',
  nationalite: 'Nationalité',
  numeroDocument: 'N° de document',
  dateExpiration: 'Date d’expiration',
  adresse: 'Adresse',
};

/**
 * Extraction SIMULÉE : lecture de lignes « Champ : valeur » dans un texte fourni.
 * Il ne s'agit ni d'OCR ni d'une vérification d'authenticité.
 */
export function simulateExtraction(text: string): { extracted: Record<string, string>; flags: string[] } {
  const extracted: Record<string, string> = {};
  for (const [key, re] of Object.entries(FIELD_PATTERNS)) {
    const m = text.match(re);
    if (m) extracted[key] = m[1].trim().slice(0, 120);
  }
  const flags: string[] = [];
  if (Object.keys(extracted).length === 0) flags.push('Aucun champ reconnu : saisie manuelle nécessaire.');
  if (detectInstructionLikeText(text)) {
    flags.push('Le document contient des formulations ressemblant à des instructions : elles ont été ignorées et traitées comme de simples données.');
  }
  return { extracted, flags };
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export function compareIdentity(declared: DeclaredIdentity, extracted: Record<string, string>): Finding[] {
  const out: Finding[] = [];
  const pairs: [keyof DeclaredIdentity, string][] = [
    ['nom', 'Nom'],
    ['prenom', 'Prénom'],
    ['dateNaissance', 'Date de naissance'],
    ['nationalite', 'Nationalité'],
  ];
  for (const [k, label] of pairs) {
    const e = extracted[k];
    if (!e) continue;
    if (norm(e) !== norm(declared[k])) {
      out.push({
        severity: 'attention',
        text: `Incohérence à vérifier — ${label} : déclaré « ${declared[k]} », document « ${e} ».`,
        guide: {
          procedureId: 'incoherence_identite',
          target: { section: 'payload', key: k },
          requestSubject: `confirmation de votre ${label.toLowerCase()}`,
        },
      });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Crédit : ratios définis explicitement                               */
/* ------------------------------------------------------------------ */

/** Mensualité d'un prêt amortissable à taux fixe : M = P·r / (1 − (1 + r)^−n), r = taux annuel / 12. */
export function monthlyPayment(principal: Minor, annualRatePct: number, termMonths: number): Minor {
  if (termMonths <= 0) return 0;
  const r = annualRatePct / 100 / 12;
  if (r === 0) return Math.round(principal / termMonths);
  return Math.round((principal * r) / (1 - Math.pow(1 + r, -termMonths)));
}

export interface CreditRatios {
  payment: Minor;
  /** (dettes existantes + nouvelle mensualité) / revenu net mensuel. */
  debtToIncome: number | null;
  /** Revenu net − charges fixes − dettes existantes − nouvelle mensualité. */
  residualIncome: Minor;
  /** Montant emprunté / valeur du bien. */
  loanToValue: number | null;
}

export function creditRatios(p: Extract<AdvisorCase['payload'], { kind: 'credit' }>): CreditRatios {
  const payment = monthlyPayment(p.loanAmount, p.annualRatePct, p.termMonths);
  return {
    payment,
    debtToIncome: p.netIncomeMonthly > 0 ? (p.existingDebtMonthly + payment) / p.netIncomeMonthly : null,
    residualIncome: p.netIncomeMonthly - p.fixedExpensesMonthly - p.existingDebtMonthly - payment,
    loanToValue: p.propertyValue > 0 ? p.loanAmount / p.propertyValue : null,
  };
}

/** Repères de démonstration configurables : ce ne sont pas des critères d'octroi. */
export const CREDIT_DEMO_MARKERS = { debtToIncome: 0.35, loanToValue: 0.9, residualIncomeMin: 80_000 };

/* ------------------------------------------------------------------ */
/* Réclamations                                                        */
/* ------------------------------------------------------------------ */

const COMPLAINT_RULES: { category: string; re: RegExp }[] = [
  { category: 'Frais et facturation', re: /\bfrais\b|factur|commission|prélev[ée]/i },
  { category: 'Carte et paiements', re: /\bcarte\b|paiement|terminal|retrait/i },
  { category: 'Virements', re: /virement|iban|bénéficiaire/i },
  { category: 'Opération contestée', re: /pas moi|non autoris|je n'ai pas|je n’ai pas|inconnu|fraude/i },
  { category: 'Qualité de service', re: /attente|accueil|personne ne|aucune réponse|injoignable/i },
];

export function classifyComplaint(texts: string[]): { categories: string[]; escalate: boolean; reasons: string[] } {
  const all = texts.join('\n');
  const categories = COMPLAINT_RULES.filter((r) => r.re.test(all)).map((r) => r.category);
  const reasons: string[] = [];
  if (categories.length >= 3) reasons.push('Plusieurs motifs combinés');
  if (categories.includes('Opération contestée')) reasons.push('Opération contestée : procédure dédiée');
  if (/avocat|médiat|tribunal|plainte/i.test(all)) reasons.push('Mention d’une voie juridique ou de médiation');
  return { categories: categories.length ? categories : ['Autre'], escalate: reasons.length > 0, reasons };
}

/* ------------------------------------------------------------------ */
/* Filtrage sanctions (liste fictive)                                  */
/* ------------------------------------------------------------------ */

/** Liste ENTIÈREMENT FICTIVE, sans lien avec une liste de sanctions réelle. */
export const FICTIONAL_WATCHLIST = ['Orlan Veskovitch', 'Kestrel Maritime Holdings', 'Ilya Brandomir', 'Société Nordvale Trading'];

function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}

export function nameSimilarity(a: string, b: string): number {
  const x = norm(a);
  const y = norm(b);
  const max = Math.max(x.length, y.length);
  return max === 0 ? 1 : 1 - levenshtein(x, y) / max;
}

export const SANCTIONS_MATCH_THRESHOLD = 0.75;

export function screenNames(subjects: string[]): { subject: string; entry: string; similarity: number }[] {
  const out: { subject: string; entry: string; similarity: number }[] = [];
  for (const s of subjects) {
    for (const e of FICTIONAL_WATCHLIST) {
      const sim = nameSimilarity(s, e);
      if (sim >= SANCTIONS_MATCH_THRESHOLD) out.push({ subject: s, entry: e, similarity: Math.round(sim * 100) / 100 });
    }
  }
  return out.sort((a, b) => b.similarity - a.similarity);
}

/* ------------------------------------------------------------------ */
/* Analyse et brouillons                                               */
/* ------------------------------------------------------------------ */

function declaredMissing(d: DeclaredIdentity): string[] {
  const labels: Record<keyof DeclaredIdentity, string> = {
    nom: 'nom', prenom: 'prénom', dateNaissance: 'date de naissance', nationalite: 'nationalité',
    adresse: 'adresse', email: 'e-mail', telephone: 'téléphone',
  };
  return (Object.keys(labels) as (keyof DeclaredIdentity)[]).filter((k) => !d[k]?.trim()).map((k) => labels[k]);
}

const FIELD_KEYS: Record<string, keyof DeclaredIdentity> = {
  nom: 'nom', prénom: 'prenom', 'date de naissance': 'dateNaissance', nationalité: 'nationalite',
  adresse: 'adresse', 'e-mail': 'email', téléphone: 'telephone',
};

export function analyzeCase(c: AdvisorCase, asOf: ISODate): Finding[] {
  const f: Finding[] = [];
  // Un constat par pièce, pour pouvoir guider vers chacune.
  for (const item of c.checklist) {
    if (item.state === 'recu') continue;
    const procedureId = procedureForItem(item.label);
    const missing = item.state === 'manquant';
    f.push({
      severity: missing ? 'bloquant' : 'attention',
      text: `${missing ? 'Pièce manquante' : 'Pièce à vérifier'} : ${item.label}.`,
      guide: {
        procedureId,
        target: { section: 'checklist', key: item.id },
        requestSubject: missing && PROCEDURES[procedureId].clientRequest ? item.label.toLowerCase() : undefined,
      },
    });
  }

  for (const doc of c.documents) {
    for (const flag of doc.flags) {
      const instruction = /instructions/.test(flag);
      f.push({
        severity: 'attention',
        text: `${doc.name} : ${flag}`,
        guide: { procedureId: instruction ? 'texte_non_fiable' : 'extraction_manuelle', target: { section: 'documents' } },
      });
    }
    const exp = doc.extracted.dateExpiration;
    if (exp && isValidISODate(exp) && exp < asOf) {
      f.push({
        severity: 'bloquant',
        text: `${doc.name} : document expiré le ${formatDateLong(exp)}.`,
        guide: { procedureId: 'document_expire', target: { section: 'documents' }, requestSubject: 'une pièce d’identité en cours de validité' },
      });
    }
  }

  const p = c.payload;
  switch (p.kind) {
    case 'ouverture': {
      for (const field of declaredMissing(p.declared)) {
        f.push({
          severity: 'bloquant',
          text: `Champ du formulaire à compléter : ${field}.`,
          guide: { procedureId: 'champ_manquant', target: { section: 'payload', key: FIELD_KEYS[field] }, requestSubject: `votre ${field}` },
        });
      }
      break;
    }
    case 'kyc': {
      for (const doc of c.documents) f.push(...compareIdentity(p.declared, doc.extracted));
      if (c.documents.length === 0) {
        f.push({
          severity: 'bloquant',
          text: 'Aucune pièce d’identité importée.',
          guide: { procedureId: 'piece_identite', target: { section: 'documents' }, requestSubject: 'une copie de votre pièce d’identité' },
        });
      }
      f.push({
        severity: 'info',
        text: 'Aucune détection d’authenticité ou de falsification n’est effectuée : contrôle visuel humain requis.',
        guide: { procedureId: 'controle_visuel', target: { section: 'documents' } },
      });
      break;
    }
    case 'mise_a_jour': {
      const days = diffDays(asOf, p.idExpiry);
      const idGuide = { procedureId: 'document_expire', target: { section: 'payload' as const, key: 'idExpiry' }, requestSubject: 'votre pièce d’identité renouvelée' };
      if (days < 0) f.push({ severity: 'bloquant', text: `Pièce d’identité expirée depuis le ${formatDateLong(p.idExpiry)}.`, guide: idGuide });
      else if (days <= 60) f.push({ severity: 'attention', text: `Pièce d’identité expirant le ${formatDateLong(p.idExpiry)} (dans ${days} jours).`, guide: idGuide });
      if (diffDays(p.employmentUpdatedOn, asOf) > 3 * 365) {
        f.push({
          severity: 'attention',
          text: `Situation professionnelle non mise à jour depuis le ${formatDateLong(p.employmentUpdatedOn)}.`,
          guide: { procedureId: 'situation_pro', target: { section: 'payload', key: 'employment' }, requestSubject: 'votre situation professionnelle actuelle' },
        });
      }
      if (diffDays(p.phoneVerifiedOn, asOf) > 2 * 365) {
        f.push({
          severity: 'info',
          text: 'Téléphone non vérifié depuis plus de 2 ans.',
          guide: { procedureId: 'verification_telephone', target: { section: 'payload', key: 'phone' }, requestSubject: 'la confirmation de votre numéro de téléphone' },
        });
      }
      break;
    }
    case 'credit': {
      const r = creditRatios(p);
      const m = CREDIT_DEMO_MARKERS;
      const marker = (key: string) => ({ procedureId: 'repere_credit', target: { section: 'payload' as const, key } });
      if (r.debtToIncome !== null && r.debtToIncome > m.debtToIncome)
        f.push({ severity: 'attention', text: `Taux d’endettement ${formatPct(r.debtToIncome, 1)} au-dessus du repère de démonstration (${formatPct(m.debtToIncome)}).`, guide: marker('dti') });
      if (r.loanToValue !== null && r.loanToValue > m.loanToValue)
        f.push({ severity: 'attention', text: `Quotité ${formatPct(r.loanToValue, 1)} au-dessus du repère de démonstration (${formatPct(m.loanToValue)}).`, guide: marker('ltv') });
      if (r.residualIncome < m.residualIncomeMin)
        f.push({ severity: 'attention', text: `Reste à vivre ${formatEUR(r.residualIncome)} sous le repère de démonstration (${formatEUR(m.residualIncomeMin)}).`, guide: marker('residual') });
      f.push({ severity: 'info', text: 'Aucune décision automatique : l’analyse revient à un analyste crédit.', guide: { procedureId: 'decision_credit', target: { section: 'payload', key: 'payment' } } });
      break;
    }
    case 'reclamation': {
      const cl = classifyComplaint(p.messages.filter((x) => x.from === 'client').map((x) => x.text));
      f.push({ severity: 'info', text: `Classement proposé : ${cl.categories.join(', ')}.`, guide: { procedureId: 'classement_reclamation', target: { section: 'timeline' } } });
      if (cl.escalate) {
        f.push({
          severity: 'attention',
          text: `Escalade recommandée : ${cl.reasons.join(' ; ')}.`,
          guide: { procedureId: 'escalade_reclamation', target: { section: 'timeline' }, requestSubject: 'le suivi de votre réclamation', suggestReview: true },
        });
      }
      if (p.messages.some((x) => detectInstructionLikeText(x.text)))
        f.push({
          severity: 'attention',
          text: 'Un message contient des formulations ressemblant à des instructions : ignorées, traitées comme données.',
          guide: { procedureId: 'texte_non_fiable', target: { section: 'timeline' } },
        });
      break;
    }
    case 'sanctions': {
      const hits = screenNames(p.subjects);
      if (hits.length === 0) f.push({ severity: 'info', text: 'Aucune correspondance au-dessus du seuil avec la liste fictive.', guide: { procedureId: 'filtrage_sanctions', target: { section: 'payload' } } });
      for (const h of hits)
        f.push({
          severity: 'attention',
          text: `Correspondance possible : « ${h.subject} » ~ « ${h.entry} » (similarité ${h.similarity.toFixed(2)}). Désambiguïsation humaine requise.`,
          // Jamais de demande au client : il ne doit pas être informé d'un filtrage en cours.
          guide: { procedureId: 'correspondance_sanctions', target: { section: 'payload', key: h.subject }, suggestReview: true },
        });
      break;
    }
    case 'modele':
      f.push({ severity: 'info', text: 'Modèle de démonstration : liste de contrôle et brouillon génériques.', guide: { procedureId: 'modele_demo', target: { section: 'checklist' } } });
      break;
  }
  return f;
}

/** Nom de politesse pour les brouillons adressés au client. */
function salutation(c: AdvisorCase): string {
  const p = c.payload;
  if (p.kind === 'ouverture' || p.kind === 'kyc') return `Bonjour ${p.declared.prenom} ${p.declared.nom},`;
  return 'Madame, Monsieur,';
}

/**
 * Brouillon de demande au client pour un constat. Jamais envoyé : il est ajouté au dossier
 * pour relecture. Retourne null si aucune demande au client n'est pertinente.
 */
export function buildClientRequest(c: AdvisorCase, guide: FindingGuide): { subject: string; body: string } | null {
  const proc = PROCEDURES[guide.procedureId];
  if (!guide.requestSubject || !proc?.clientRequest) return null;
  const lines = [
    salutation(c),
    '',
    `Dans le cadre de votre dossier ${c.clientRef}, pourriez-vous nous transmettre ${guide.requestSubject} ?`,
  ];
  if (proc.accepted?.length) lines.push('', 'Documents acceptés :', ...proc.accepted.map((a) => `  • ${a}`));
  if (proc.checks?.length) lines.push('', 'Merci de vérifier que :', ...proc.checks.map((x) => `  • ${x}`));
  lines.push(
    '',
    'Vous pouvez nous le transmettre depuis votre espace client, depuis votre coffre-fort izimi, ou en agence.',
    '',
    'Cordialement,',
    'Votre conseiller',
    '',
    '— Brouillon de démonstration : non envoyé, à relire par un conseiller.',
  );
  return { subject: `Demande : ${guide.requestSubject}`, body: lines.join('\n') };
}

export function suggestedStatus(c: AdvisorCase, findings: Finding[]): AdvisorCase['status'] {
  if (c.status === 'valide') return 'valide';
  if (findings.some((f) => f.severity === 'bloquant')) return 'informations_manquantes';
  if (findings.some((f) => f.severity === 'attention')) return 'a_verifier';
  return c.status;
}

export function generateDraft(c: AdvisorCase, asOf: ISODate): string {
  const formality = FORMALITY_BY_ID[c.formalityId];
  const findings = analyzeCase(c, asOf);
  const lines: string[] = [
    `BROUILLON — À RELIRE ET VALIDER PAR UN CONSEILLER`,
    `Dossier : ${c.title} (${c.clientRef})`,
    `Formalité : ${formality.title}`,
    `Date : ${formatDateLong(asOf)} — Statut : ${CASE_STATUS_LABELS[c.status]}`,
    '',
  ];
  const p = c.payload;
  switch (p.kind) {
    case 'ouverture':
      lines.push(
        'Dossier pré-rempli à partir du formulaire client :',
        `  ${p.declared.prenom} ${p.declared.nom}, né(e) le ${p.declared.dateNaissance}, ${p.declared.adresse || 'adresse non renseignée'}.`,
        '',
        'Pièces à demander au client :',
        ...c.checklist.filter((i) => i.state === 'manquant').map((i) => `  • ${i.label}`),
      );
      break;
    case 'kyc':
      lines.push('Champs extraits (simulation) :');
      for (const doc of c.documents)
        for (const [k, v] of Object.entries(doc.extracted)) lines.push(`  • ${EXTRACTABLE_FIELDS[k] ?? k} : ${v}`);
      lines.push('', 'Contrôle visuel de la pièce et de son authenticité : à effectuer par un conseiller.');
      break;
    case 'mise_a_jour':
      lines.push(
        'Projet de demande de mise à jour au client :',
        '',
        '  Madame, Monsieur,',
        '  Afin de maintenir votre dossier à jour, nous vous remercions de nous transmettre :',
        ...findings.filter((x) => x.severity !== 'info').map((x) => `  • ${x.text}`),
        '  Vous pouvez le faire depuis votre espace client ou en agence.',
      );
      break;
    case 'credit': {
      const r = creditRatios(p);
      lines.push(
        'Synthèse analyste (données déclarées, non vérifiées) :',
        `  • Montant demandé : ${formatEUR(p.loanAmount)} sur ${p.termMonths} mois à ${p.annualRatePct.toString().replace('.', ',')} %`,
        `  • Mensualité calculée : ${formatEUR(r.payment)}`,
        `  • Taux d’endettement = (dettes + mensualité) / revenu net : ${r.debtToIncome === null ? 'n/d' : formatPct(r.debtToIncome, 1)}`,
        `  • Reste à vivre = revenu − charges − dettes − mensualité : ${formatEUR(r.residualIncome)}`,
        `  • Quotité = montant / valeur du bien : ${r.loanToValue === null ? 'n/d' : formatPct(r.loanToValue, 1)}`,
        '',
        'Aucune recommandation d’octroi ou de refus n’est formulée par l’assistant.',
      );
      break;
    }
    case 'reclamation': {
      const cl = classifyComplaint(p.messages.filter((x) => x.from === 'client').map((x) => x.text));
      lines.push('Chronologie :');
      const events = [
        ...p.messages.map((m) => ({ date: m.date, text: `${m.from === 'client' ? 'Message client' : 'Réponse banque'}` })),
        ...p.transactions.map((t) => ({ date: t.date, text: `Opération ${t.label} : ${formatEUR(t.amount)}` })),
      ].sort((a, b) => a.date.localeCompare(b.date));
      for (const e of events) lines.push(`  ${e.date} — ${e.text}`);
      lines.push(
        '',
        `Classement proposé : ${cl.categories.join(', ')}${cl.escalate ? ' — ESCALADE RECOMMANDÉE' : ''}`,
        '',
        'Projet de réponse :',
        '  Madame, Monsieur,',
        `  Nous accusons réception de votre réclamation concernant le contrat ${p.contractRef}.`,
        '  Un conseiller examine les éléments transmis et reviendra vers vous dans les meilleurs délais.',
      );
      break;
    }
    case 'sanctions':
      lines.push('Résultat du filtrage (liste FICTIVE) :', ...findings.map((x) => `  • ${x.text}`));
      break;
    case 'modele':
      lines.push(
        'Synthèse de la liste de contrôle :',
        ...c.checklist.map((i) => `  • ${i.label} : ${i.state === 'recu' ? 'reçu' : i.state === 'manquant' ? 'manquant' : 'à vérifier'}`),
      );
      break;
  }
  if (c.notes.trim()) lines.push('', 'Notes du conseiller :', `  ${c.notes.trim()}`);
  lines.push('', 'Ce document est un brouillon de démonstration. Il n’est ni transmis ni déposé.');
  return lines.join('\n');
}
