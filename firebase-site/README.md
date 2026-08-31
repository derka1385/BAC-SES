# SES Révision — version Firebase

Cette version remplace Supabase par Firebase Authentication et Cloud Firestore.

La page d’entrée impose une connexion et propose deux parcours :

- **Élève** : connexion, inscription et mot de passe oublié.
- **Professeur** : connexion réservée à un UID possédant `roles/{uid}.role = "teacher"`.

## Structure

- `../index.html` : copie de la page Firebase protégée utilisée comme page principale du projet.
- `../legacy/index-supabase.html` : sauvegarde de l’ancienne version, à ne pas publier.
- `public/` : fichiers à déployer sur Firebase Hosting.
- `tools/import-content.html` : outil local d'import initial, jamais déployé.
- `tools/chapters-data.mjs` : contenu source des neuf chapitres, jamais déployé.
- `firestore.rules` : règles de sécurité à conserver identiques à celles publiées dans la console.

## Import initial

1. Ajouter `localhost` dans Firebase Authentication > Settings > Authorized domains si nécessaire.
2. Depuis ce dossier, lancer un serveur local : `python3 -m http.server 4173`.
3. Ouvrir `http://localhost:4173/tools/import-content.html`.
4. Se connecter avec le compte professeur et lancer l'import.

## Aperçu local sans Firestore

Lancer le même serveur puis ouvrir :

`http://localhost:4173/public/index.html?preview=1`

Le mode aperçu n'est actif que sur `localhost` ou `127.0.0.1`.

## Déploiement

Depuis ce dossier, après installation et connexion de la CLI Firebase :

```sh
firebase deploy --only hosting,firestore
```

Un push GitHub ne publie pas les règles Firestore. Après toute modification de
`firestore.rules`, exécuter la commande ci-dessus depuis `firebase-site/`.
