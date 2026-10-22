# CAMPUS DIGITAL — Apprendre • Se former • Réussir

Site statique (HTML / CSS / JavaScript modules) + Firebase (projet existant `campus-digital-25e40`) : Authentication et Cloud Firestore. Aucun serveur, aucune Cloud Function, compatible avec le forfait gratuit (Spark).

## Installation pas à pas
1. **Fichiers** : gardez l'arborescence (pages à la racine, `css/`, `js/`). Aucune clé secrète n'est dans le code ; la config web de `js/firebase.js` est publique par conception.
2. **Firebase** : vérifiez `js/firebase.js` (projet `campus-digital-25e40`). Base Cloud Firestore créée en mode production.
3. **Authentification** (Console Firebase › Authentication) :
   - Méthode de connexion › **E-mail/Mot de passe** : activée.
   - Méthode de connexion › **Google** : activer, choisir l'e-mail d'assistance, enregistrer.
   - Paramètres › **Domaines autorisés** : ajouter `localhost`, votre domaine Firebase Hosting et/ou `clean-pro-service.github.io` (GitHub Pages).
4. **Règles Firestore (OBLIGATOIRE, manuel)** : Console › Firestore Database › Règles › collez tout `firestore.rules` › **Publier**. Modifier le fichier local ne change PAS les règles actives. (Ou : `firebase deploy --only firestore:rules`.)
5. **Administrateurs** : `tameclor@gmail.com` et `rtameclo@gmail.com`. Les règles exigent un **e-mail vérifié** (ou connexion Google). Connectez-vous, ouvrez le lien reçu par e-mail, puis reconnectez-vous.
6. **Migration des anciennes données** : après publication des règles, ouvrez `admin.html` › **Diagnostic** › « Migrer les contenus existants ». Sans cela, les formations/ressources déjà enregistrées restent invisibles aux étudiants (elles n'ont pas encore `published = true`).
7. **Lancer en local** : `python3 -m http.server 8000` puis http://localhost:8000 (pas `file://`).
8. **Tester l'administration** : `admin.html` › Diagnostic › « Tester l'écriture Firestore » doit répondre ✔. Puis ajoutez une faculté, une formation, une ressource.
9. **Publier** : `firebase deploy --only hosting` ou GitHub Pages (racine du dépôt).

## Fonctionnement
- **Après connexion** : l'étudiant arrive directement sur `formations.html`, où les formations sont regroupées par domaine (sa faculté en premier). Les formations qu'il ouvre sont enregistrées dans `users/{uid}/vues` et affichées dans son profil.
- **Profil** : page catalogue (fiche étudiant, points, formations consultées, recommandations, documents débloqués), informations modifiables.
- **Rappel Premium** : un bandeau (fermable) apparaît 5 jours avant l'expiration et après expiration, avec « Renouveler » et un message WhatsApp de paiement prêt.
- **Partage** : bouton « Partager sur WhatsApp » sur chaque formation, ressource et fiche payante (lien interne vers la page).
- **Avis et notes** (collection `avis`, id `uid_formationId`) : 1 à 5 étoiles + commentaire (500 car.), possible seulement après avoir consulté la formation ; l'étudiant peut modifier/supprimer son avis ; modération admin (Administration › Avis : masquer / supprimer).
- **Tableau de bord admin** : inscrits, abonnés, éléments à traiter (cliquables), formations/ressources publiées, formations les plus consultées, ventes validées (estimation).
- **Parcours** : Accueil → Facultés → Formations → Détail (`formation.html?id=`) → Ressources associées.
- **Bibliothèque** : catégories Cours, PDF, Livres, Fiches, Exercices, Annales… Mode d'accès par ressource : **Gratuit**, **Achat à l'unité** (prix FCFA), **Inclus Premium**. Admin : ajouter, modifier, publier/dépublier, supprimer.
- **Premium** : 3 000 FCFA / 30 jours. L'étudiant enregistre une demande (`abonnement.html`) puis écrit sur WhatsApp ; l'admin vérifie le paiement et active (Admin › Demandes Premium). Une prolongation part de la date d'expiration si l'abonnement est encore actif. L'expiration est vérifiée **dans les règles** (`subscriptionExpiresAt > request.time`).
- **Achats à l'unité** : demande en attente → message WhatsApp → l'admin valide/refuse (Admin › Achats). L'accès est accordé à l'étudiant et à la ressource concernés (`achats/{uid}_{resourceId}`).
- **Missions** : titre, description, instructions, date limite, points, bonus, document bonus. Une soumission par étudiant et par mission (`mission_submissions/{uid}_{missionId}`) ; la validation admin se fait dans une **transaction** (points + bonus attribués une seule fois). Refusée → l'étudiant peut corriger et renvoyer.
- **Recherche** : interne (facultés, formations, ressources, produits, bourses) et Web (liens Google / Scholar / DuckDuckGo, clairement séparés ; aucune clé API).
- **WhatsApp** : moyen de contact (+228 98 20 72 31) avec messages pré-remplis ; ce n'est pas une connexion WhatsApp.

## Obligation de suivre les réseaux (accès aux formations)
- Pages à suivre : TikTok `@campus.digital7`, YouTube `@campusdigital-l1t`, chaîne WhatsApp (liens dans `js/social.js`, constante `SOCIAL`).
- Un étudiant connecté voit, sur `formations.html` et `formation.html`, un écran « Dernière étape » : il ouvre chaque page, la suit, puis envoie **une capture d'écran par page**. Les captures sont réduites dans le navigateur (JPEG) et stockées dans `suivi_reseaux/{uid}` (pas de Firebase Storage).
- L'admin les valide ou les refuse dans **Administration › Abonnements réseaux** ; les images sont supprimées après la décision (le statut seul reste). Refus : l'étudiant voit le motif et peut renvoyer.
- **Appliqué par les règles** : `formations` n'est lisible que si `suivi_reseaux/{uid}.statut == 'valide'` (ou admin). Les étudiants déjà inscrits devront donc envoyer leurs captures. La bibliothèque, les missions et Premium ne sont pas concernées.
- Vérification manuelle : TikTok, YouTube et WhatsApp ne permettent pas de vérifier un abonnement automatiquement. Un étudiant peut se désabonner après validation.
- **À faire après mise à jour** : republier `firestore.rules` (Console › Firestore › Règles › Publier).

## Collections Firestore
`users`, `facultes` (nouveau), `formations`, `ressources`, `produits` (catalogue public, sans URL de fichier), `achats`, `demandes_activation`, `missions`, `mission_submissions`, `suivi_reseaux`, `bourses`, `avis`, `diagnostics`, sous-collection `users/{uid}/vues`. Les noms existants sont conservés ; champs ajoutés : `published`, `formationId`, `auteur`, `couvertureUrl`, `duree`, `conditions`, `matieres`, `instructions`, `dateLimiteTs`, `prenom`, `nomFamille`, `universite`, `faculte`, `formation`, `niveau`, `ville`, `subscriptionStartedAt`.

## Limites (forfait gratuit) et sécurité
- Pas de custom claims : les définir demande le SDK Admin (serveur). Les droits admin reposent sur la liste d'e-mails **vérifiés** dans les règles.
- Pas de paiement en ligne automatique : activation manuelle (un prestataire de paiement exigerait un serveur/Cloud Functions, donc Blaze).
- Pas de téléversement de fichiers (Firebase Storage non configuré) : collez des liens https. **Un lien public peut être partagé** après transmission ; la protection concerne l'accès au lien dans Firestore, pas un DRM.
- Les actions sur réseaux sociaux ne sont pas vérifiables automatiquement : preuve + validation admin.
- Pas de limitation de débit anti-spam (App Check / Cloud Functions recommandés si nécessaire).
- `mentions.html` est un texte générique à faire relire par l'éditeur.

## Tester les permissions (à faire après publication des règles)
Étudiant : `admin.html` refusé ; modifier `points`/`subscriptionStatus` refusé ; ressource Premium illisible sans abonnement ; document à l'unité illisible avant validation. Admin : gestion des contenus, missions, validations et achats.
