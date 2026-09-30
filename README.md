# Anticipe : assistant bancaire proactif piloté par le consentement

> « Plus vous nous faites confiance, mieux on vous aide, et c'est vous qui décidez. »

Prototype de hackathon. Une banque anticipe des moments utiles de la vie du client, mais c'est le **niveau de consentement choisi qui gouverne le moteur de détection** : il ne se contente pas de masquer des recommandations dans l'interface.

**Avertissement** : démonstration indépendante, inspirée par la démarche d'assistance proactive de KBC. Il n'existe **aucune intégration officielle KBC**, aucune certification réglementaire, et le produit n'est pas prêt pour la production. Toutes les données, personnes, contreparties et établissements sont **synthétiques ou fictifs**. Aucun service payant, aucune clé d'API, aucun identifiant bancaire, aucun appel réseau.

## Démarrage

Prérequis : Node.js 20 ou plus récent (testé avec Node 26 et npm 11).

```bash
cd anticipe
npm install
npm run dev          # http://127.0.0.1:5173
```

| Commande | Effet |
|---|---|
| `npm run dev` | Serveur de développement Vite |
| `npm run build` | Vérification TypeScript + build de production dans `dist/` |
| `npm run preview` | Sert le build de production |
| `npm test` | Tests automatisés (Vitest + Testing Library, jsdom) |
| `npm run typecheck` | Vérification des types seule |
| `npm run evaluate` | Rapport d'évaluation en console sur le jeu étiqueté |
| `npm run inspect` | Conclusions du moteur pour chaque persona et chaque niveau (outil de développement) |

L'état de la démo est conservé dans le `localStorage` du navigateur. **Mode démo → Tout réinitialiser** le remet à zéro, de façon reproductible.

## Écrans

1. **Accueil** : solde, paiements à venir, projection du solde sur 30 jours (SVG), recommandations, indicateur du niveau de consentement.
2. **Mon niveau de personnalisation** : comparaison des trois niveaux, interrupteurs par catégorie de données et par signal, interrupteur global, enregistrement versionné, historique minimal, et « Dernier calcul du moteur » (détecteurs exécutés ou bloqués, périmètres extraits, conclusions invalidées).
3. **Mes projets** : intentions déclarées (dont expatriation avec destination, naissance, premier emploi, séparation), **plans à cocher** pour ces projets, objectifs d'épargne, connexion **simulée** de comptes externes (avec un état d'erreur démontrable).
4. **Mes documents** : documents bancaires du client et partage **simulé** avec le coffre-fort izimi (voir plus bas).
5. **Pourquoi je vois ceci ?** : panneau d'explication accessible depuis chaque recommandation.
6. **Espace conseiller** : catalogue des 20 formalités (recherche), file de revue, dossiers avec listes de contrôle, import simulé, brouillons et traçabilité.
7. **Mode démo** : choix de persona, horloge de démo, réinitialisation, parcours guidé en 8 étapes avec vérification.
8. **Évaluation** : métriques calculées en direct sur le jeu étiqueté, contrôles de sûreté, limites méthodologiques.

## Architecture

```
src/
  domain/           logique pure, sans React
    types.ts        modèles typés (montants en centimes entiers, dates ISO)
    consent.ts      niveaux, périmètres, matrice des permissions, changements versionnés
    sensitive.ts    exclusion des catégories protégées et non classées
    ledger.ts       détection des flux récurrents
    forecast.ts     méthode 1 : projection du solde
    baseline.ts     méthode 2 : comparaison avec la référence du client
    scoring.ts      méthode 3 : combinaison de signaux
    features.ts     extraction paresseuse par périmètre + vue restreinte (Proxy)
    detectors.ts    8 détecteurs, chacun avec ses périmètres requis et facultatifs
    engine.ts       pipeline : consentement → invalidation → filtrage → détecteurs
    recommendations.ts  retours client, période de repos, construction des recommandations
    messages.ts     adaptateur de formulation (gabarits français déterministes par défaut)
    evaluation.ts   précision, rappel, contrôles de sûreté
    config.ts       seuils et paramètres configurables
  data/             fixtures de démo (personas.ts), jeu d'évaluation (evaluationCases.ts), générateur déterministe
  advisor/          catalogue des formalités, logique des dossiers, dossiers d'exemple
  state/            réducteur de l'application, persistance locale
  ui/               composants React et pages
docs/
  SCORING.md        règles de scoring et matrice des permissions
  PRESENTATION.md   script de présentation
```

Voir **[docs/SCORING.md](docs/SCORING.md)** pour les règles, les seuils et la matrice des permissions.

### Principes clés

- **Le consentement est appliqué avant les données.** `allowedScopes()` est calculé en premier. Un détecteur dont un périmètre requis n'est pas autorisé ne s'exécute pas, et ses caractéristiques ne sont jamais extraites. Chaque détecteur reçoit une vue restreinte : toute tentative de lecture hors périmètre est journalisée, et l'évaluation vérifie qu'il n'y en a aucune.
- **Révocation immédiate.** Rétrograder, désactiver un signal ou couper l'anticipation déclenche un recalcul synchrone. Les conclusions en cache qui dépendaient d'un périmètre retiré sont supprimées.
- **Vue complète ≠ comptes externes.** Une autorisation séparée, explicite et simulée est nécessaire. Elle est révoquée si l'on redescend sous Vue complète.
- **Registre source et magasin d'anticipation sont séparés.** Le registre synthétique contient les opérations complètes (affichage et tests). Le magasin d'anticipation ne garde que des conclusions et des métadonnées agrégées non sensibles, sans libellé, contrepartie ni historique. Un test et l'évaluation le vérifient.
- **Catégories protégées** (santé, religion, syndicat, politique) et **non classées** : exclues avant toute extraction de caractéristiques. Les libellés libres saisis par le client qui évoquent ces catégories sont neutralisés.
- **Deux finalités distinctes.** Le consentement de personnalisation (`personnalisation_optionnelle`) et les bases juridiques des formalités bancaires (`LegalBasis`) sont modélisés séparément.
- **Temps déterministe.** Une horloge de démo pilote projections, échéances et périodes de repos. Le registre est régénéré de façon déterministe (PRNG à graine) jusqu'à la date choisie.
- **IA générative optionnelle.** L'interface `MessageAdapter` ne reçoit que des conclusions structurées déjà approuvées. Elle ne décide ni du consentement, ni des scores, ni de l'éligibilité, ni d'aucune inférence sensible. Par défaut, des gabarits français déterministes sont utilisés, et aucun fournisseur n'est branché.
- **Aucune décision automatique.** Pas de recommandation d'investissement personnalisée, pas d'octroi de crédit : toute sortie crédit, juridique ou de conformité reste un brouillon soumis à un humain.

## Données

- **5 personas de démo, 5 cas** (`src/data/personas.ts`) :
  - **Camille** (persona principale) : propriétaire, échéance d'octobre du prêt habitation impayée → **dernier rappel**, découvert à venir, déménagement possible.
  - **Thomas** : **naissance attendue** (déclarée), nouvel emploi, contrat à échéance, hausse de prélèvement.
  - **Inès** : **premier emploi**, nouvelle cliente à l'historique insuffisant, projet de véhicule déclaré.
  - **Julien** : **départ aux États-Unis**. La question vient de signaux autorisés ; le plan de départ est proposé une fois la destination déclarée.
  - **Laurence** : **séparation** (déclarée), compte joint et prêt en co-emprunt.
- **Jeu d'évaluation** (`src/data/evaluationCases.ts`) : 49 cas distincts, avec des graines, montants et dates différents. Il contient des cas positifs, négatifs, ambigus, à historique insuffisant, à catégorie sensible, à consentement révoqué et à consentement restreint, dont des cas difficiles où un faux négatif est attendu.

## Paiements à venir et priorités

Sur l'accueil, les paiements à venir sont triés par **priorité** (règle fixe, documentée dans `src/domain/priority.ts`) ou par date :

| Priorité | Paiements |
|---|---|
| Critique | Rappels de paiement (ex. **dernier rappel du prêt habitation**) |
| Haute | Logement et crédits |
| Normale | Assurances, énergie, télécoms |
| Basse | Abonnements, épargne volontaire |

Les échéances des crédits de la banque suivent leur échéancier contractuel (périmètre « échéances connues », niveau Essentiel), sans double comptage avec les flux inférés. L'alerte de découvert indique quoi couvrir en priorité et quels paiements pourraient être décalés. Le bandeau de rappel est une information de la banque sur son propre contrat : il s'affiche même si l'anticipation est désactivée. C'est une suggestion d'ordre, pas un conseil juridique.

## Plans de projet

Pour quatre projets déclarés, *Mes projets* affiche un plan à cocher avec sa progression : expatriation, naissance, premier emploi, séparation. Les documents du plan peuvent être transmis depuis izimi (simulé).

Le **plan de départ à l'étranger** couvre :
- les démarches avant et après le départ ;
- les documents à envoyer ;
- une section **« Rester client tout en partant »** : garder son compte pour les paiements en Belgique, garder son épargne et son accès en ligne, virements vers un compte local, coordonnées à jour, conseiller à distance.

Pour les États-Unis, le plan mentionne que **FATCA** peut limiter certains services et qu'un formulaire **W-9** peut être demandé. C'est à confirmer avec un conseiller : ce n'est ni un conseil fiscal ni un conseil juridique.

Origine de chaque cas :
- **Naissance, premier emploi et séparation** : uniquement sur déclaration, jamais déduits des opérations.
- **Départ à l'étranger** : peut aussi être suggéré à partir de signaux autorisés au niveau Conseils (virements internationaux, frais consulaires). La destination vient toujours de la déclaration.

## Partage de documents avec izimi (simulation)

izimi est un service réel : le coffre-fort numérique des notaires belges. **Ce prototype n'a aucune intégration avec lui.** Il n'utilise ni son logo ni son interface, n'utilise aucun compte, et aucune donnée ne quitte le navigateur. Tous les documents sont fictifs (`src/data/izimi.ts`).

- **Côté client** (*Mes documents*) :
  - relier son coffre, avec une autorisation distincte de la personnalisation (finalité « partage de documents ») ;
  - envoyer ses documents bancaires vers izimi ;
  - transmettre à la banque des documents de son coffre ;
  - consulter un journal de partage.

  Un document trop volumineux montre l'état d'erreur. Les documents reçus **ne sont pas analysés** par l'anticipation.
- **Côté conseiller** : « Importer depuis izimi » dans un dossier, y compris depuis la fiche « Que faire ? » d'une pièce manquante. La pièce correspondante passe « À vérifier » : un humain la contrôle.

## Espace conseiller

Catalogue des 20 formalités. Logique synthétique réelle pour :
- 1 ouverture de compte ;
- 2 KYC ;
- 3 mise à jour du dossier ;
- 7 filtrage sur une liste **fictive** ;
- 9 demande de crédit, avec ratios définis explicitement ;
- 12 réclamations.

Les autres formalités utilisent le modèle partagé (liste de contrôle et brouillon), clairement étiqueté « Modèle de démonstration ». Statuts de revue : Brouillon, À vérifier, Informations manquantes, Validé par un conseiller. La validation exige que toutes les pièces soient reçues, puis une confirmation. Chaque action est tracée.

Chaque constat (pièce manquante ou à vérifier, champ à compléter, incohérence, document expiré, repère crédit, escalade, correspondance sanctions…) a un bouton **« Que faire ? »**. Il ouvre une fiche de procédure de démonstration (`src/advisor/procedures.ts`) : pourquoi, étapes, documents acceptés, points de contrôle. La fiche propose aussi des raccourcis : aller à l'élément concerné (défilement et surbrillance), préparer l'import avec le bon type de document, passer le dossier « À vérifier ». Quand c'est pertinent, elle permet aussi de préparer une **demande au client**. Cette demande est un brouillon non envoyé, ajouté au dossier et tracé. Il n'y a jamais de demande au client pour un filtrage sanctions ni pour un contrôle interne.

L'import de document est **simulé** : on colle un texte, et les lignes « Champ : valeur » sont extraites. Il n'y a ni OCR, ni détection de falsification, ni accès à un registre. Le texte importé est traité comme une donnée non fiable : les formulations qui ressemblent à des instructions sont signalées, jamais suivies.

## Tests

`npm test` exécute 73 tests :

- gating du consentement avant exécution (espion sur l'extracteur, vue restreinte), signaux désactivés, autorisation externe, invalidation à la rétrogradation, interrupteur global ;
- exclusion des catégories sensibles et absence de données brutes dans le magasin ;
- arithmétique de la projection (valeurs calculées à la main, sans double comptage), comparaison à la référence, seuils et combinaison de signaux ;
- période de repos des retours, champs des recommandations ;
- métriques d'évaluation (dénominateurs nuls, cohérence des compteurs, contrôles de sûreté à 0) ;
- logique conseiller : mensualité, ratios, KYC, injection, sanctions, garde de validation ; guidage de chaque constat (procédure existante, cible, demande au client et parcours dans l'interface) ;
- priorités (règle, rappel et échéance comptés une seule fois, rappel exclu sans le périmètre « échéances »), partage izimi (autorisation, journal, erreur, import conseiller), 5 personas et leur cas principal, naissance et séparation jamais déduites, plan États-Unis ; parcours Julien complet dans l'interface ;
- **parcours de bout en bout** dans l'interface (jsdom) : Essentiel → Conseils → explication → désactivation → confirmation → Vue complète avec autorisation → Essentiel → évaluation. Plus l'état d'erreur de connexion et l'usage clavier (navigation, interrupteurs, dialogue avec focus piégé et fermeture par Échap).

## Limites connues

- **Données synthétiques uniquement.** Les métriques n'établissent pas la précision en conditions réelles. Le jeu d'évaluation a été écrit par la même équipe que les détecteurs : ce n'est pas une validation indépendante, et les effectifs sont petits.
- Scores **indicatifs**, non calibrés. Heuristiques simples, sans apprentissage automatique. Les retours client ne réentraînent rien.
- La projection ignore les dépenses variables (un découvert causé par elles est manqué, cf. cas E05) et les opérations des catégories protégées, y compris lorsqu'elles sont récurrentes.
- Détection de flux récurrents mensuels uniquement (pas de fréquence hebdomadaire ou trimestrielle).
- Les catégories des opérations sont supposées fournies. Aucune classification automatique des libellés n'est faite : une opération non classée est simplement exclue.
- Persistance locale au navigateur, mono-utilisateur, sans authentification ni serveur.
- L'horloge de démo peut aller au-delà de la date de référence : le registre est alors prolongé avec les mêmes règles synthétiques.
- Le partage izimi est entièrement simulé ; les plans de projet sont des contenus de démonstration (non exhaustifs, sans valeur fiscale ou juridique).
- L'espace conseiller est une maquette fonctionnelle : l'extraction est simulée, la liste de sanctions est fictive, et les règles fiscales ou réglementaires ne sont pas réelles.
- Vérifications faites : tests automatisés (jsdom), et contrôle manuel dans un navigateur de bureau, dont l'absence de défilement horizontal à 375 px de large. Aucun test sur appareil mobile réel ni audit d'accessibilité complet (lecteur d'écran) n'a été réalisé.
