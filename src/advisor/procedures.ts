/**
 * Fiches de procédure de DÉMONSTRATION associées aux constats de l'espace conseiller.
 * Elles illustrent un guidage pas à pas ; elles ne reflètent pas une procédure bancaire réelle.
 */

export interface Procedure {
  id: string;
  title: string;
  why: string;
  steps: string[];
  /** Documents acceptés (le cas échéant). */
  accepted?: string[];
  /** Points de contrôle pour le conseiller. */
  checks?: string[];
  /** Une demande au client (brouillon) peut-elle être préparée ? */
  clientRequest: boolean;
  /** Type proposé pour l'import simulé du document. */
  uploadKind?: string;
}

export const PROCEDURES: Record<string, Procedure> = {
  piece_identite: {
    id: 'piece_identite',
    title: 'Obtenir une pièce d’identité valide',
    why: 'L’identité du client doit être établie à partir d’un document officiel en cours de validité.',
    steps: [
      'Demander au client une copie recto verso lisible de sa pièce.',
      'Importer le document dans le dossier (import simulé).',
      'Comparer les champs extraits avec les informations déclarées.',
      'Effectuer le contrôle visuel et marquer la pièce « Reçu ».',
    ],
    accepted: ['Carte d’identité', 'Passeport', 'Titre de séjour'],
    checks: ['Document non expiré', 'Nom, prénom et date de naissance identiques au formulaire', 'Photo et mentions lisibles'],
    clientRequest: true,
    uploadKind: 'Pièce d’identité',
  },
  justificatif_domicile: {
    id: 'justificatif_domicile',
    title: 'Obtenir un justificatif de domicile',
    why: 'L’adresse déclarée doit être confirmée par un document récent.',
    steps: [
      'Demander au client un justificatif de moins de 3 mois à son nom.',
      'Importer le document (import simulé).',
      'Vérifier que l’adresse correspond au formulaire.',
      'Marquer la pièce « Reçu ».',
    ],
    accepted: ['Facture d’énergie ou de télécom', 'Avis d’imposition', 'Contrat de bail ou quittance de loyer', 'Attestation d’hébergement accompagnée de la pièce d’identité de l’hébergeant'],
    checks: ['Moins de 3 mois', 'Nom du client ou de l’hébergeant', 'Adresse identique au formulaire'],
    clientRequest: true,
    uploadKind: 'Justificatif de domicile',
  },
  formulaire_signe: {
    id: 'formulaire_signe',
    title: 'Faire signer le formulaire client',
    why: 'L’ouverture ne peut être finalisée sans le formulaire complété et signé par le client.',
    steps: [
      'Vérifier que tous les champs du formulaire sont remplis.',
      'Envoyer le formulaire pour signature (en agence ou signature électronique).',
      'Importer le formulaire signé et marquer la pièce « Reçu ».',
    ],
    checks: ['Signature et date présentes', 'Tous les champs obligatoires complétés'],
    clientRequest: true,
    uploadKind: 'Contrat',
  },
  auto_certification_fiscale: {
    id: 'auto_certification_fiscale',
    title: 'Recueillir l’auto-certification fiscale',
    why: 'La résidence fiscale du client doit être déclarée à l’ouverture.',
    steps: ['Demander au client de compléter l’auto-certification.', 'Vérifier la présence d’un identifiant fiscal par pays de résidence.', 'Marquer la pièce « Reçu ».'],
    checks: ['Pays de résidence fiscale', 'Identifiant fiscal', 'Signature'],
    clientRequest: true,
    uploadKind: 'Autre',
  },
  controle_visuel: {
    id: 'controle_visuel',
    title: 'Contrôle visuel par un conseiller',
    why: 'L’assistant ne détecte ni falsification ni authenticité : un humain doit examiner la pièce.',
    steps: [
      'Ouvrir la pièce importée et vérifier sa cohérence visuelle (photo, police, mentions).',
      'En cas de doute, demander l’original en agence.',
      'Consigner le résultat dans les notes, puis marquer l’élément « Reçu ».',
    ],
    checks: ['Photo conforme', 'Aucune altération visible', 'Numéro de document cohérent'],
    clientRequest: false,
  },
  champ_manquant: {
    id: 'champ_manquant',
    title: 'Compléter un champ du formulaire',
    why: 'Le dossier ne peut pas être finalisé avec des informations obligatoires manquantes.',
    steps: ['Contacter le client pour obtenir l’information.', 'Mettre à jour le formulaire.', 'Vérifier le format (e-mail, téléphone international…).'],
    clientRequest: true,
  },
  incoherence_identite: {
    id: 'incoherence_identite',
    title: 'Résoudre une incohérence d’identité',
    why: 'Une différence entre le déclaré et le document peut être une erreur de saisie ou un signal à approfondir.',
    steps: [
      'Comparer la valeur déclarée et la valeur lue sur le document.',
      'Vérifier s’il s’agit d’une faute de frappe manifeste.',
      'Sinon, demander au client de confirmer l’information ou de fournir un justificatif.',
      'Consigner la résolution dans les notes du dossier.',
    ],
    checks: ['Erreur de saisie évidente ?', 'Autres champs cohérents ?'],
    clientRequest: true,
    uploadKind: 'Pièce d’identité',
  },
  document_expire: {
    id: 'document_expire',
    title: 'Remplacer un document expiré ou bientôt expiré',
    why: 'Le dossier doit contenir des documents en cours de validité.',
    steps: ['Demander au client la version renouvelée du document.', 'Importer le nouveau document (import simulé).', 'Mettre à jour la date d’expiration au dossier.'],
    accepted: ['Carte d’identité', 'Passeport', 'Titre de séjour'],
    clientRequest: true,
    uploadKind: 'Pièce d’identité',
  },
  situation_pro: {
    id: 'situation_pro',
    title: 'Mettre à jour la situation professionnelle',
    why: 'Les informations professionnelles datant de plus de 3 ans doivent être actualisées lors de la revue du dossier.',
    steps: ['Demander au client sa situation actuelle (employeur, fonction, type de contrat).', 'Joindre un justificatif si nécessaire.', 'Mettre à jour le dossier.'],
    accepted: ['Fiche de paie récente', 'Attestation d’employeur', 'Justificatif d’activité indépendante'],
    clientRequest: true,
    uploadKind: 'Fiche de paie',
  },
  verification_telephone: {
    id: 'verification_telephone',
    title: 'Revérifier le numéro de téléphone',
    why: 'Un numéro non vérifié depuis longtemps peut être obsolète.',
    steps: ['Proposer au client une vérification par code dans son espace (simulé).', 'Mettre à jour la date de vérification.'],
    clientRequest: true,
  },
  fiches_paie: {
    id: 'fiches_paie',
    title: 'Vérifier les fiches de paie',
    why: 'Les revenus déclarés doivent être justifiés.',
    steps: ['Vérifier la présence des 3 derniers mois.', 'Comparer le net avec le revenu déclaré et les relevés.', 'Marquer la pièce « Reçu » ou demander les mois manquants.'],
    checks: ['3 mois consécutifs', 'Net cohérent avec les virements sur les relevés', 'Nom de l’employeur'],
    clientRequest: true,
    uploadKind: 'Fiche de paie',
  },
  releves: {
    id: 'releves',
    title: 'Obtenir les relevés de compte',
    why: 'Les relevés confirment les revenus, les charges et les dettes en cours.',
    steps: ['Demander les 3 derniers relevés de tous les comptes du client.', 'Repérer les charges récurrentes et les crédits en cours.', 'Marquer la pièce « Reçu ».'],
    clientRequest: true,
    uploadKind: 'Relevé',
  },
  avis_imposition: {
    id: 'avis_imposition',
    title: 'Obtenir le dernier avis d’imposition',
    why: 'Il confirme les revenus annuels déclarés.',
    steps: ['Demander le dernier avertissement-extrait de rôle.', 'Comparer le revenu annuel au revenu mensuel déclaré.'],
    clientRequest: true,
    uploadKind: 'Autre',
  },
  compromis: {
    id: 'compromis',
    title: 'Obtenir le compromis de vente',
    why: 'Le compromis fixe le prix, le bien et les conditions suspensives du financement.',
    steps: ['Demander le compromis signé au client ou au notaire (avec l’accord du client).', 'Vérifier le prix et la condition suspensive de financement.', 'Importer et marquer « Reçu ».'],
    checks: ['Prix identique à la demande', 'Condition suspensive d’obtention de crédit', 'Date limite'],
    clientRequest: true,
    uploadKind: 'Contrat',
  },
  estimation_bien: {
    id: 'estimation_bien',
    title: 'Vérifier l’estimation du bien',
    why: 'La valeur du bien sert au calcul de la quotité.',
    steps: ['Vérifier l’auteur et la date de l’estimation.', 'Comparer avec le prix du compromis.'],
    clientRequest: true,
    uploadKind: 'Autre',
  },
  repere_credit: {
    id: 'repere_credit',
    title: 'Analyser un repère de crédit dépassé',
    why: 'Un repère de démonstration dépassé n’est pas un refus : il signale un point à analyser.',
    steps: [
      'Vérifier les données saisies (revenus, charges, dettes).',
      'Examiner les éléments compensatoires (épargne, apport, stabilité des revenus).',
      'Documenter l’analyse dans les notes ; la décision revient à un analyste crédit.',
    ],
    clientRequest: false,
  },
  decision_credit: {
    id: 'decision_credit',
    title: 'Décision de crédit : revue humaine',
    why: 'L’assistant calcule des ratios définis mais ne formule aucune décision.',
    steps: ['Compléter les pièces manquantes.', 'Générer la synthèse analyste (brouillon).', 'Transmettre à un analyste crédit pour décision.'],
    clientRequest: false,
  },
  classement_reclamation: {
    id: 'classement_reclamation',
    title: 'Confirmer le classement de la réclamation',
    why: 'Le classement proposé par mots-clés doit être confirmé par un conseiller.',
    steps: ['Relire les messages du client dans la chronologie.', 'Confirmer ou corriger les motifs.', 'Rassembler les pièces (contrat, tarifs, opérations).'],
    clientRequest: false,
  },
  escalade_reclamation: {
    id: 'escalade_reclamation',
    title: 'Escalader la réclamation',
    why: 'Les réclamations complexes, contestées ou mentionnant une médiation doivent être revues par un responsable.',
    steps: [
      'Passer le dossier en « À vérifier ».',
      'Résumer le litige dans les notes (motifs, montant, dates).',
      'Transmettre au service réclamations (simulé) et accuser réception auprès du client.',
    ],
    clientRequest: true,
  },
  texte_non_fiable: {
    id: 'texte_non_fiable',
    title: 'Contenu externe ressemblant à des instructions',
    why: 'Un texte fourni par un tiers peut contenir des instructions ; l’assistant ne les suit jamais.',
    steps: ['Ne pas donner suite à l’instruction contenue dans le texte.', 'Traiter la demande selon la procédure normale.', 'Signaler le cas si le contenu paraît malveillant.'],
    clientRequest: false,
  },
  extraction_manuelle: {
    id: 'extraction_manuelle',
    title: 'Saisir manuellement les champs',
    why: 'L’extraction simulée n’a reconnu aucun champ « Champ : valeur ».',
    steps: ['Ouvrir le document.', 'Saisir les champs utiles dans les notes du dossier.'],
    clientRequest: false,
  },
  filtrage_sanctions: {
    id: 'filtrage_sanctions',
    title: 'Filtrage sans correspondance',
    why: 'Aucun nom n’atteint le seuil de similarité avec la liste fictive.',
    steps: ['Vérifier que la liste de filtrage est à jour.', 'Consigner le résultat et valider le dossier.'],
    clientRequest: false,
  },
  correspondance_sanctions: {
    id: 'correspondance_sanctions',
    title: 'Désambiguïser une correspondance possible',
    why: 'Une similarité de nom n’établit pas une correspondance : une analyse humaine est requise.',
    steps: [
      'Comparer les éléments d’identification (date de naissance, nationalité, adresse).',
      'Passer le dossier en « À vérifier » et suspendre l’opération concernée.',
      'Transmettre au service conformité (simulé) si le doute persiste.',
      'Ne pas informer le client du filtrage en cours.',
    ],
    clientRequest: false,
  },
  messages_client: {
    id: 'messages_client',
    title: 'Rassembler les échanges avec le client',
    why: 'La chronologie doit être complète avant de répondre.',
    steps: ['Retrouver les échanges antérieurs (messagerie, appels, agence).', 'Les ajouter au dossier et marquer « Reçu ».'],
    clientRequest: false,
    uploadKind: 'Autre',
  },
  conditions_tarifaires: {
    id: 'conditions_tarifaires',
    title: 'Joindre les conditions tarifaires applicables',
    why: 'La réponse doit s’appuyer sur les conditions en vigueur à la date des faits.',
    steps: ['Retrouver la brochure tarifaire applicable (document fictif).', 'Joindre la page concernée au dossier.'],
    clientRequest: false,
    uploadKind: 'Contrat',
  },
  liste_filtrage: {
    id: 'liste_filtrage',
    title: 'Mettre à jour la liste de filtrage',
    why: 'Le filtrage doit utiliser la version la plus récente de la liste (ici fictive).',
    steps: ['Vérifier la date de la liste.', 'Relancer le filtrage si nécessaire.'],
    clientRequest: false,
  },
  piece_generique: {
    id: 'piece_generique',
    title: 'Obtenir une pièce du dossier',
    why: 'Cette pièce figure dans la liste de contrôle de la formalité.',
    steps: ['Identifier la source de la pièce (client, service interne, tiers).', 'La demander ou la récupérer.', 'L’importer (simulation) et marquer « Reçu ».'],
    clientRequest: true,
    uploadKind: 'Autre',
  },
  modele_demo: {
    id: 'modele_demo',
    title: 'Utiliser le modèle de démonstration',
    why: 'Cette formalité utilise une liste de contrôle et un brouillon génériques.',
    steps: ['Compléter chaque élément de la liste de contrôle.', 'Ajouter vos notes.', 'Générer le brouillon et le faire relire.'],
    clientRequest: false,
  },
};

/** Procédure associée à un élément de liste de contrôle, d'après son libellé. */
export function procedureForItem(label: string): string {
  const l = label.toLowerCase();
  if (/contrôle visuel/.test(l)) return 'controle_visuel';
  if (/identit/.test(l)) return 'piece_identite';
  if (/domicile/.test(l)) return 'justificatif_domicile';
  if (/formulaire/.test(l)) return 'formulaire_signe';
  if (/auto-certification|fiscale/.test(l)) return 'auto_certification_fiscale';
  if (/situation professionnelle/.test(l)) return 'situation_pro';
  if (/fiches? de paie/.test(l)) return 'fiches_paie';
  if (/relevés?/.test(l)) return 'releves';
  if (/avertissement|imposition/.test(l)) return 'avis_imposition';
  if (/compromis/.test(l)) return 'compromis';
  if (/estimation/.test(l)) return 'estimation_bien';
  if (/message|échanges/.test(l)) return 'messages_client';
  if (/tarifaires/.test(l)) return 'conditions_tarifaires';
  if (/liste de filtrage/.test(l)) return 'liste_filtrage';
  return 'piece_generique';
}
