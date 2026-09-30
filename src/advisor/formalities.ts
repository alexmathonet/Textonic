import type { LegalBasis } from '../domain/types';

export interface Formality {
  id: number;
  title: string;
  inputs: string[];
  assistantAction: string;
  /** « complet » : logique synthétique réelle ; « modele » : liste de contrôle et brouillon partagés. */
  mode: 'complet' | 'modele';
  legalBasis: LegalBasis;
}

export const LEGAL_BASIS_LABELS: Record<LegalBasis, string> = {
  obligation_legale: 'Obligation légale',
  execution_contrat: 'Exécution du contrat',
  interet_legitime_controle: 'Intérêt légitime (contrôle interne)',
};

export const FORMALITIES: Formality[] = [
  { id: 1, title: 'Ouverture de compte', mode: 'complet', legalBasis: 'execution_contrat',
    inputs: ['Identité', 'Coordonnées', 'Justificatifs', 'Formulaire client'],
    assistantAction: 'Pré-remplir le dossier et lister les documents manquants.' },
  { id: 2, title: 'Vérification d’identité (KYC)', mode: 'complet', legalBasis: 'obligation_legale',
    inputs: ['Pièces d’identité', 'Informations déclarées'],
    assistantAction: 'Extraire des champs structurés simulés et signaler les incohérences pour revue. Aucune détection de falsification.' },
  { id: 3, title: 'Mise à jour du dossier client', mode: 'complet', legalBasis: 'obligation_legale',
    inputs: ['Validité des documents', 'Coordonnées', 'Situation professionnelle'],
    assistantAction: 'Repérer les documents expirés et rédiger des demandes de mise à jour.' },
  { id: 4, title: 'Bénéficiaires effectifs', mode: 'modele', legalBasis: 'obligation_legale',
    inputs: ['Statuts', 'Actionnaires', 'Organigramme de détention', 'Registres disponibles'],
    assistantAction: 'Afficher une chaîne de détention synthétique et les points de vérification ouverts.' },
  { id: 5, title: 'Origine des fonds', mode: 'modele', legalBasis: 'obligation_legale',
    inputs: ['Transactions', 'Revenus connus', 'Justificatifs de vente ou succession'],
    assistantAction: 'Comparer les montants fournis et signaler les écarts inexpliqués.' },
  { id: 6, title: 'Surveillance des transactions', mode: 'modele', legalBasis: 'obligation_legale',
    inputs: ['Historique des transactions', 'Bénéficiaires', 'Pays', 'Profil client'],
    assistantAction: 'Prioriser des alertes synthétiques avec explications.' },
  { id: 7, title: 'Filtrage sanctions', mode: 'complet', legalBasis: 'obligation_legale',
    inputs: ['Identité client/bénéficiaire', 'Listes applicables'],
    assistantAction: 'Montrer des correspondances de noms possibles avec une liste FICTIVE, à désambiguïser par un humain.' },
  { id: 8, title: 'Déclaration de soupçon', mode: 'modele', legalBasis: 'obligation_legale',
    inputs: ['Alertes', 'Transactions', 'Éléments de preuve', 'Historique des vérifications'],
    assistantAction: 'Préparer une chronologie et un brouillon à relire. Jamais transmis.' },
  { id: 9, title: 'Demande de crédit', mode: 'complet', legalBasis: 'execution_contrat',
    inputs: ['Revenus', 'Charges', 'Dettes', 'Relevés', 'Garanties'],
    assistantAction: 'Contrôler la complétude, calculer des ratios définis, rédiger une synthèse analyste. Aucune décision automatique.' },
  { id: 10, title: 'Préparation de contrat', mode: 'modele', legalBasis: 'execution_contrat',
    inputs: ['Informations client', 'Conditions du produit', 'Modèles approuvés'],
    assistantAction: 'Pré-remplir et vérifier dates, montants, signatures et annexes.' },
  { id: 11, title: 'Information client', mode: 'modele', legalBasis: 'execution_contrat',
    inputs: ['Contrats approuvés', 'Tarifs', 'Documentation produit'],
    assistantAction: 'Expliquer les conditions en citant les documents fictifs fournis.' },
  { id: 12, title: 'Réclamations', mode: 'complet', legalBasis: 'obligation_legale',
    inputs: ['Messages', 'Contrats', 'Transactions', 'Échanges antérieurs'],
    assistantAction: 'Classer, établir une chronologie, rédiger une réponse et escalader les cas complexes.' },
  { id: 13, title: 'Reporting réglementaire', mode: 'modele', legalBasis: 'obligation_legale',
    inputs: ['Comptabilité', 'Crédit', 'Liquidité', 'Données de risque'],
    assistantAction: 'Contrôles de complétude et de cohérence, commentaires en brouillon.' },
  { id: 14, title: 'Comptabilité et rapprochement', mode: 'modele', legalBasis: 'obligation_legale',
    inputs: ['Écritures', 'Paiements', 'Relevés'],
    assistantAction: 'Proposer des rapprochements et montrer les éléments non rapprochés.' },
  { id: 15, title: 'Déclarations fiscales', mode: 'modele', legalBasis: 'obligation_legale',
    inputs: ['Résidence fiscale', 'Identifiants', 'Comptes et revenus concernés'],
    assistantAction: 'Signaler les champs manquants selon des règles de démonstration explicites.' },
  { id: 16, title: 'Audit et contrôle interne', mode: 'modele', legalBasis: 'interet_legitime_controle',
    inputs: ['Procédures', 'Dossiers', 'Journaux d’activité', 'Rapports antérieurs'],
    assistantAction: 'Organiser les preuves et rédiger des constats en brouillon.' },
  { id: 17, title: 'Demandes relatives aux données personnelles', mode: 'modele', legalBasis: 'obligation_legale',
    inputs: ['Dossier client', 'Sources internes', 'Historique de consentement'],
    assistantAction: 'Localiser les enregistrements synthétiques et préparer une réponse ou une correction.' },
  { id: 18, title: 'Successions, procurations, saisies', mode: 'modele', legalBasis: 'obligation_legale',
    inputs: ['Actes', 'Mandats', 'Documents officiels', 'Comptes'],
    assistantAction: 'Contrôler la complétude et orienter vers une revue juridique.' },
  { id: 19, title: 'Gestion des prestataires', mode: 'modele', legalBasis: 'obligation_legale',
    inputs: ['Contrats', 'Audits', 'Engagements de service', 'Incidents'],
    assistantAction: 'Signaler les clauses manquantes et les revues à venir.' },
  { id: 20, title: 'Dossiers d’agrément et changements structurels', mode: 'modele', legalBasis: 'obligation_legale',
    inputs: ['Gouvernance', 'Actionnariat', 'Données financières', 'Procédures'],
    assistantAction: 'Organiser les preuves et rédiger des sections descriptives.' },
];

export const FORMALITY_BY_ID = Object.fromEntries(FORMALITIES.map((f) => [f.id, f])) as Record<number, Formality>;
