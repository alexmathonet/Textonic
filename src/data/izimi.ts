/**
 * Coffre-fort izimi SIMULÉ. izimi est un service réel (coffre-fort numérique des notaires belges) :
 * ce prototype n'a aucune intégration avec lui, n'utilise ni son logo ni son interface, et
 * aucune donnée ne quitte le navigateur. Tous les documents ci-dessous sont fictifs.
 */
import { formatMonth, monthsBetween, addDays } from '../domain/dates';
import type { CustomerData, ISODate } from '../domain/types';

export interface IzimiDoc {
  id: string;
  name: string;
  /** Type proposé à l'import dans un dossier. */
  kind: string;
  /** Procédure (liste de contrôle) que ce document permet de compléter. */
  procedureId: string;
  /** Clé reliant ce document à un élément de plan (ex. « passeport »). */
  docKey?: string;
  /** Contenu simulé : lignes « Champ : valeur ». */
  text: string;
  size: string;
  /** Un document indisponible permet de montrer l'état d'erreur. */
  available: boolean;
}

const id = (nom: string, prenom: string, naissance: string, expiration: string, numero: string) =>
  `CARTE D'IDENTITÉ (SIMULÉE — COFFRE IZIMI)\nNom : ${nom}\nPrénom : ${prenom}\nDate de naissance : ${naissance}\nNationalité : Belge\nN° document : ${numero}\nDate d'expiration : ${expiration}`;
const domicile = (nom: string, adresse: string) =>
  `FACTURE D'ÉNERGIE (SIMULÉE — COFFRE IZIMI)\nNom : ${nom}\nAdresse : ${adresse}\nDate : 2026-09-30`;

/** Coffres simulés, indexés par identifiant client (espace client) ou référence de dossier (conseiller). */
export const IZIMI_VAULTS: Record<string, IzimiDoc[]> = {
  camille: [
    { id: 'iz-cam-acte', name: 'Acte d’achat de la maison (simulé)', kind: 'Contrat', procedureId: 'piece_generique', text: 'ACTE DE VENTE (SIMULÉ)\nAdresse : 8 allée des Érables, 1300 Wavre (fictive)\nDate : 2021-06-14', size: '1,2 Mo', available: true },
    { id: 'iz-cam-id', name: 'Carte d’identité (simulée)', kind: 'Pièce d’identité', procedureId: 'piece_identite', text: id('Martin', 'Camille', '1993-02-08', '2032-05-19', 'SIM-114-220-81'), size: '640 Ko', available: true },
    { id: 'iz-cam-energie', name: 'Facture d’énergie — septembre 2026 (simulée)', kind: 'Justificatif de domicile', procedureId: 'justificatif_domicile', text: domicile('Martin', '8 allée des Érables, 1300 Wavre (fictive)'), size: '310 Ko', available: true },
    { id: 'iz-cam-donation', name: 'Acte de donation (simulé)', kind: 'Contrat', procedureId: 'piece_generique', text: '', size: '48 Mo', available: false },
  ],
  thomas: [
    { id: 'iz-tho-id', name: 'Passeport (simulé)', kind: 'Pièce d’identité', procedureId: 'piece_identite', text: id('Leroy', 'Thomas', '1988-11-30', '2030-01-12', 'SIM-PS-55120'), size: '720 Ko', available: true },
  ],
  ines: [
    { id: 'iz-ine-id', name: 'Carte d’identité (simulée)', kind: 'Pièce d’identité', procedureId: 'piece_identite', docKey: 'identite', text: id('Benali', 'Inès', '1997-07-03', '2033-09-01', 'SIM-301-778-02'), size: '600 Ko', available: true },
  ],
  julien: [
    { id: 'iz-jul-passeport', name: 'Passeport (simulé)', kind: 'Pièce d’identité', procedureId: 'piece_identite', docKey: 'passeport', text: id('Vermeulen', 'Julien', '1990-03-17', '2034-06-30', 'SIM-PS-90317'), size: '700 Ko', available: true },
    { id: 'iz-jul-visa', name: 'Visa de travail — copie (simulée)', kind: 'Autre', procedureId: 'piece_generique', docKey: 'visa', text: 'VISA (SIMULÉ)\nNom : Vermeulen\nDate d\'expiration : 2029-09-30', size: '380 Ko', available: true },
    { id: 'iz-jul-contrat', name: 'Lettre d’embauche — employeur américain (simulée)', kind: 'Contrat', procedureId: 'piece_generique', docKey: 'contrat_travail', text: 'LETTRE D\'EMBAUCHE (SIMULÉE)\nNom : Vermeulen\nDate : 2026-08-28', size: '210 Ko', available: true },
    { id: 'iz-jul-naissance', name: 'Acte de naissance — copie certifiée (simulée)', kind: 'Autre', procedureId: 'piece_generique', docKey: 'acte_naissance', text: 'ACTE DE NAISSANCE (SIMULÉ)\nNom : Vermeulen\nPrénom : Julien\nDate de naissance : 1990-03-17', size: '450 Ko', available: true },
  ],
  laurence: [
    { id: 'iz-lau-id', name: 'Carte d’identité (simulée)', kind: 'Pièce d’identité', procedureId: 'piece_identite', docKey: 'identite', text: id('Maes', 'Laurence', '1985-05-22', '2031-03-11', 'SIM-522-118-09'), size: '620 Ko', available: true },
    { id: 'iz-lau-convention', name: 'Projet de convention (simulé)', kind: 'Contrat', procedureId: 'piece_generique', docKey: 'convention', text: 'CONVENTION (PROJET SIMULÉ)\nDate : 2026-10-10', size: '1,1 Mo', available: true },
  ],
  // Dossiers conseiller (référence client).
  'CLI-SIM-0412': [
    { id: 'iz-luc-domicile', name: 'Facture d’énergie — septembre 2026 (simulée)', kind: 'Justificatif de domicile', procedureId: 'justificatif_domicile', text: domicile('Fontaine', '12 rue des Tilleuls, 1000 Bruxelles (fictive)'), size: '290 Ko', available: true },
    { id: 'iz-luc-id', name: 'Carte d’identité (simulée)', kind: 'Pièce d’identité', procedureId: 'piece_identite', text: id('Fontaine', 'Lucas', '1991-04-12', '2031-02-14', 'SIM-592-004-77'), size: '650 Ko', available: true },
  ],
  'CLI-SIM-0877': [
    { id: 'iz-nad-id', name: 'Nouvelle carte d’identité (simulée)', kind: 'Pièce d’identité', procedureId: 'piece_identite', text: id('Colin', 'Nadia', '1979-12-01', '2036-10-02', 'SIM-778-310-45'), size: '610 Ko', available: true },
  ],
  'CLI-SIM-1203': [
    { id: 'iz-pet-compromis', name: 'Compromis de vente (simulé)', kind: 'Contrat', procedureId: 'compromis', text: 'COMPROMIS DE VENTE (SIMULÉ)\nPrix : 285 000 €\nCondition suspensive : obtention du crédit\nDate : 2026-09-20', size: '2,4 Mo', available: true },
  ],
};

export function izimiVault(key: string): IzimiDoc[] {
  return IZIMI_VAULTS[key] ?? [];
}

export interface BankDocument {
  id: string;
  name: string;
  date: ISODate;
}

/** Documents bancaires du client (fictifs), dérivés de ses contrats, rappels et relevés. */
export function bankDocuments(data: CustomerData, asOf: ISODate): BankDocument[] {
  const docs: BankDocument[] = [];
  const months = monthsBetween(addDays(asOf, -62), addDays(asOf, -31)).slice(-2);
  for (const { y, m } of months.reverse()) {
    const d = `${y}-${String(m).padStart(2, '0')}-01`;
    docs.push({ id: `stmt-${d.slice(0, 7)}`, name: `Relevé de compte — ${formatMonth(d)}`, date: d });
  }
  for (const n of data.customer.notices ?? []) docs.push({ id: `notice-${n.id}`, name: n.label, date: n.issuedOn });
  for (const c of data.customer.contracts) {
    docs.push({ id: `ctr-${c.id}`, name: `Contrat — ${c.label}`, date: data.customer.clientSince });
    if (c.kind === 'credit_immo') docs.push({ id: `fisc-${c.id}`, name: `Attestation fiscale 2025 — ${c.label}`, date: '2026-02-15' });
  }
  return docs;
}
