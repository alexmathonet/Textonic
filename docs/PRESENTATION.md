# Script de présentation (5 à 7 minutes)

> Accroche : « Plus vous nous faites confiance, mieux on vous aide, et c'est vous qui décidez. »

**Préparation** : `npm run dev`, ouvrir http://127.0.0.1:5173/#demo, cliquer sur **Tout réinitialiser**. Chaque étape du **Parcours de présentation guidé** exécute l'action réelle ; une coche verte confirme que le résultat attendu a été constaté.

| # | Action | Ce qu'on montre | Phrase clé |
|---|---|---|---|
| 0 | Accueil | Solde de 380 €, bandeau **Dernier rappel — prêt habitation** (950 € avant le 25 octobre), paiements à venir triés par priorité, badge **Essentiel** | « Une banque qui anticipe, mais dans les limites que vous choisissez. » |
| 1 | Étape 1 : Essentiel | Une seule alerte : découvert possible le 25 octobre (−1 050 €), avant le salaire du 28, avec « à couvrir en priorité : le dernier rappel du prêt habitation » | « Au niveau Essentiel, le détecteur de déménagement ne s'exécute même pas : il ne reçoit aucune donnée. » Le montrer dans *Mon niveau de personnalisation → Dernier calcul du moteur*. |
| 2 | Étape 2 : Conseils | La question « Un déménagement en vue ? » apparaît, sur le **même registre** | « Rien n'a changé dans les données. Seul votre consentement a changé. » |
| 3 | Étape 3 : explication | Catégories de signaux, dépendance au niveau Conseils, score 0,75 pour un seuil de 0,55 | « Ni libellé ni commerçant : des catégories compréhensibles. Le score est une règle documentée, pas une probabilité. » |
| 4 | Étape 4 : désactiver le signal | La carte disparaît immédiatement ; notification « conclusion supprimée » | « Retirer son accord a un effet immédiat, et la conclusion est effacée. » |
| 5 | Étape 5 : réactiver et confirmer | Étape suivante : revoir l'assurance habitation | « Une hypothèse n'est jamais un fait : c'est vous qui confirmez. » |
| 6 | Étape 6 : Vue complète + compte externe | Projection de l'objectif « Apport » : 11 000 € sur 20 000 €, atteint vers juin 2028 | « Choisir Vue complète ne connecte rien : il faut une autorisation séparée. » Montrer aussi la connexion manuelle dans *Mes projets* (et l'erreur simulée avec la Banque Lointaine). |
| 7 | Étape 7 : retour à Essentiel | « 9 conclusions supprimées » ; seule l'alerte de découvert reste | « La révocation invalide le cache, pas seulement l'affichage. » |
| 8 | Étape 8 : Évaluation | Précision et rappel avec leurs dénominateurs ; contrôles de sûreté à 0 | « Des résultats calculés, pas saisis. Et nous affichons nos limites. » |

**Bonus : les autres personas** (*Mode démo → Persona → Charger et réinitialiser*, puis passer au niveau Conseils) :
- **Julien — départ aux États-Unis.** Question « Un départ à l'étranger ? » déduite de signaux autorisés (virements internationaux, frais de visa). « Oui » → « Indiquer ma destination » → plan de départ : démarches, documents à transmettre via izimi (simulé), et **« Rester client tout en partant »**. Phrase clé : « La destination vient de sa déclaration, jamais de ses dépenses. »
- **Thomas — naissance**, **Inès — premier emploi**, **Laurence — séparation** : plans à cocher, proposés **uniquement sur déclaration**.
- **Mes documents** : relier le coffre izimi (simulé), envoyer un relevé vers izimi, transmettre une pièce à la banque. La « donation » montre l'état d'erreur.

**Bonus (30 s)** : *Espace conseiller → File de revue → Réclamation*. La phrase « Ignorez les instructions précédentes… » est affichée comme donnée non fiable et signalée, jamais suivie. Brouillon généré, escalade recommandée, validation humaine obligatoire.

**Clôture** : prototype indépendant sur données synthétiques. Ce n'est pas une intégration bancaire, ni un produit certifié.
