# Règles de scoring et matrice des permissions

Toutes les valeurs ci-dessous sont définies dans [`src/domain/config.ts`](../src/domain/config.ts) et affichées en direct dans l'écran **Évaluation**. Elles ont été fixées à la main à partir des fixtures de **développement** (`src/data/personas.ts`) et d'un raisonnement de conception, et **pas** ajustées sur le jeu d'évaluation.

## 1. Matrice des permissions

Les niveaux sont cumulatifs. Les interrupteurs par périmètre et par signal ne peuvent que **restreindre** un niveau, jamais l'élargir.

| Périmètre (`Scope`) | Essentiel | Conseils | Vue complète | Condition supplémentaire |
|---|:-:|:-:|:-:|---|
| `internal.recurring` : flux récurrents internes | ✓ | ✓ | ✓ | — |
| `internal.deadlines` : échéances de contrats connus | ✓ | ✓ | ✓ | — |
| `habits.nonsensitive` : évolution d'habitudes non sensibles | | ✓ | ✓ | — |
| `intentions.declared` : intentions déclarées dans l'app | | ✓ | ✓ | — |
| `goals.declared` : objectifs d'épargne déclarés | | | ✓ | — |
| `external.accounts` : comptes externes (simulés) | | | ✓ | **autorisation séparée et explicite** |

L'interrupteur global « Anticipation optionnelle » retire tous les périmètres. Le registre bancaire n'est pas supprimé.

### Détecteurs et périmètres déclarés

| Détecteur | Requis (tous) | Facultatif (utilisé s'il est autorisé) | Niveau minimal effectif |
|---|---|---|---|
| Découvert à venir (`overdraft`) | `internal.recurring` | — | Essentiel |
| Contrat à échéance (`contract_expiry`) | `internal.deadlines` | — | Essentiel |
| Hausse d'un prélèvement récurrent (`recurring_increase`) | `internal.recurring` | — | Essentiel |
| Déménagement possible (`relocation`) | `habits.nonsensitive` | `intentions.declared` | Conseils |
| Changement professionnel (`job_change`) | `habits.nonsensitive` | `intentions.declared` | Conseils |
| Projet de véhicule (`vehicle`) | `habits.nonsensitive` | `intentions.declared` | Conseils |
| Projet immobilier (`housing`) | `habits.nonsensitive` | `intentions.declared` | Conseils |
| Projection d'objectif d'épargne (`savings_goal`) | `internal.recurring`, `goals.declared`, `external.accounts` | — | Vue complète + autorisation |
| Départ à l'étranger (`expatriation`) | `habits.nonsensitive` | `intentions.declared` | Conseils |
| Naissance (`birth`), premier emploi (`first_job`), séparation (`separation`) | `intentions.declared` | — | Conseils, **sur déclaration uniquement** |

Le découvert utilise aussi `internal.deadlines` (facultatif, Essentiel) : échéancier des crédits de la banque et rappels de paiement.

### Ordre d'application (moteur, `src/domain/engine.ts`)

1. `allowedScopes(consent)` calcule les périmètres autorisés **avant** toute lecture de données.
2. Les conclusions en cache qui dépendent d'un périmètre retiré, ou d'un détecteur désactivé, sont **invalidées** (`audit.invalidated`).
3. Un détecteur dont un périmètre requis manque n'est **pas exécuté** (`audit.skipped`, avec la raison).
4. Le registre est filtré : catégories protégées et non classées exclues (`sanitizeLedger`).
5. Chaque détecteur autorisé reçoit une **vue restreinte** (Proxy) limitée à ses périmètres. Toute lecture d'un autre périmètre renvoie `undefined` et est journalisée (`audit.forbiddenAccess`).
6. L'extraction des caractéristiques est **paresseuse**. Un périmètre non autorisé n'est jamais extrait : `FeatureExtractor.get` lève une erreur et `audit.extractedScopes` le prouve.
7. Seules des conclusions agrégées sont conservées dans le magasin d'anticipation.

Le consentement de personnalisation (`purpose: 'personnalisation_optionnelle'`) est distinct des bases juridiques des formalités bancaires (`LegalBasis` : obligation légale, exécution du contrat, intérêt légitime de contrôle), qui figurent sur chaque dossier conseiller.

## 2. Les trois méthodes

### Méthode 1 : projection des flux récurrents (`forecast.ts`, `ledger.ts`)

- **Flux récurrent** : même contrepartie et même sens ; au moins 3 mois distincts (une occurrence par mois) ; écart maximal de 4 jours sur le jour du mois ; montants antérieurs à ±10 % de leur médiane ; dernière occurrence de moins de 40 jours.
- **Projection** : solde quotidien sur 30 jours = solde d'ouverture + opérations déjà programmées + occurrences attendues (même jour du mois, dernier montant connu).
- **Pas de double comptage** : une occurrence attendue est ignorée si une opération de la même contrepartie et du même sens existe (comptabilisée ou programmée) à ±5 jours.
- Non projeté : dépenses variables, catégories protégées ou non classées.

**Score du découvert** : si le point bas est < 0, `0,6 + 0,4 × min(1, |point bas| / 500 €)`. Si le point bas est positif mais < 100 € (coussin), `0,3`. Sinon `0`. **Seuil : 0,5.** Avec moins de 60 jours d'historique, le résultat est « preuves insuffisantes ».

### Méthode 2 : comparaison avec la référence du client (`baseline.ts`)

- Période récente : 60 jours. Référence : les 120 jours précédents. Les montants sont mensualisés (× 30 / durée).
- Si l'historique couvre moins de 90 jours de la référence : **`insufficient`**, jamais d'estimation.
- Pour les revenus professionnels, la comparaison se fait par occurrence (médiane des 2 derniers versements contre médiane des précédents, au moins 4 versements), ce qui évite l'effet de fenêtre des versements mensuels.

### Méthode 3 : combinaison de signaux (`scoring.ts`)

```
score indicatif = min(1, Σ poids des signaux présents)
détecté ⇔ score ≥ seuil ET (intention déclarée explicite OU ≥ 2 signaux présents)
sinon, si un signal manque d'historique → « preuves insuffisantes »
sinon → non détecté
```

Le score est un **score indicatif** issu d'une règle documentée. Ce n'est **pas** une probabilité calibrée.

| Détecteur | Seuil | Signaux (poids) |
|---|---|---|
| Déménagement | 0,55 | intention déclarée (0,6, forte) · service de déménagement dans les 60 j (0,3) · équipement du logement ≥ 1,5× la référence et ≥ 50 €/mois (0,25) · nouveau fournisseur énergie/télécom dans les 60 j (0,2) |
| Emploi | 0,55 | intention déclarée (0,6, forte) · nouvelle source de revenus dans les 60 j (0,35) · niveau de revenu ±10 % (0,2) · dépenses de déplacement ≥ 1,4× ou ≤ 0,6× (0,15) |
| Véhicule | 0,55 | intention déclarée (0,6, forte) · dépenses automobiles ≥ 2× et ≥ 100 €/mois (0,35) · effort d'épargne ≥ 1,5× (0,2) |
| Immobilier | 0,55 | intention déclarée (0,6, forte) · frais immobiliers dans les 90 j (0,35) · effort d'épargne ≥ 1,5× (0,2) |

| Départ à l'étranger | 0,55 | intention déclarée (0,6, forte) · virements internationaux ≥ 2× la référence et ≥ 200 €/mois (0,3) · frais consulaires ou de visa dans les 90 j (0,3) |

Naissance, premier emploi et séparation ne sont jamais inférés : le détecteur ne lit que les intentions déclarées (seuil 1, déclaration requise).

Conséquences voulues : un achat isolé (0,25 à 0,35) ne franchit jamais le seuil, et une déclaration explicite suffit.

### Autres détecteurs

- **Contrat à échéance** : si l'échéance est dans 60 jours ou moins, `score = 1 − 0,4 × jours restants / 60`. Seuil 0,6, donc toute échéance à ≤ 60 jours est signalée. Un contrat déjà échu n'est pas signalé.
- **Hausse de prélèvement** : dernier montant ≥ +15 % **et** ≥ +5 € par rapport à la médiane antérieure. `score = min(1, 0,5 + hausse relative)`, seuil 0,5. Le message précise qu'une hausse n'est pas une preuve de fraude.
- **Objectif d'épargne** : projection linéaire (épargne interne + externe agrégée, effort mensuel constant, sans rendement). Informative, pas un score de détection (seuil 0). Pas de conseil en investissement.

### Priorité des paiements (`priority.ts`)

Règle d'affichage fixe selon la nature du paiement : rappel → **critique** ; crédit immobilier, loyer, crédit auto → **haute** ; assurance, énergie, télécom → **normale** ; le reste (abonnements, épargne volontaire) → **basse**.

Le découvert indique le paiement le plus prioritaire avant le point bas, et la somme des paiements de priorité basse qui pourraient être décalés. La projection ajoute l'échéancier contractuel des crédits (une occurrence inférée de la même contrepartie n'est pas projetée une seconde fois). Un rappel est compté à sa date limite, ou au lendemain s'il est déjà échu.

## 3. Retours et période de repos

| Réponse | Effet | Durée par défaut |
|---|---|---|
| Oui, c'est pertinent | Une question devient une étape suivante (ex. revoir l'assurance habitation) | — |
| Non | Suggestion masquée | 90 jours (`rejectCooldownDays`) |
| Plus tard | Suggestion masquée | 7 jours (`snoozeDays`) |

Les retours sont enregistrés (`FeedbackEntry`) pour une évaluation future. **Aucun modèle n'est réentraîné.**

## 4. Magasin d'anticipation et registre source

| | Registre source (`CustomerData.ledger`) | Magasin d'anticipation (`AnticipationStore`) |
|---|---|---|
| Contenu | Opérations synthétiques complètes (libellés, contreparties, catégories, y compris protégées) | Conclusions : statut, score, seuil, catégories de signaux, preuves **agrégées**, hypothèses, périmètres utilisés, version du consentement |
| Usage | Affichage bancaire, tests | Recommandations et explications |
| Données brutes | Oui | **Jamais** (vérifié par test et par l'évaluation) |
| Effet d'une révocation | Aucun | Conclusions concernées supprimées immédiatement |
