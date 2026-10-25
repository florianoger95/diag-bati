# Diag bâti — diagnostic du bâti ancien, hors ligne sur iPad

PWA Angular 20 pour saisir les diagnostics terrain sans connexion, puis produire le rapport.
Spécification complète : [docs/SPEC.md](docs/SPEC.md).

État : **Lot 1** (socle, dossiers, fiches pilotées par JSON, synthèse et clôture).
Photos et plans : Lot 2 · rapports PDF/DOCX : Lot 3 · mises à jour et sauvegarde : Lot 4.

## Installer sur l'iPad

1. Ouvrir l'adresse GitHub Pages dans **Safari**, connecté à Internet, et attendre l'affichage de la liste des dossiers.
2. Bouton Partager → **Sur l'écran d'accueil** → Ajouter.
3. Ouvrir l'app une fois depuis l'icône : elle est ensuite utilisable **en mode avion**.

Les mises à jour de l'app se téléchargent quand l'iPad est en ligne ; un bandeau propose de les appliquer.
L'app ne se recharge jamais d'elle-même pendant une saisie.

## Où sont les données, et le risque de purge par Safari

- Tout est stocké **sur l'iPad**, dans IndexedDB (base `diag-bati`). Rien n'est envoyé sur Internet.
- Chaque modification est enregistrée immédiatement : il n'y a pas de bouton « Enregistrer ».
  Les frappes des 300 dernières millisecondes sont aussi notées dans un petit journal `localStorage`,
  rejoué à la réouverture si Safari a été fermé brutalement.
- **Safari peut effacer ces données** quand l'iPad manque d'espace, ou pour un site non installé et inutilisé
  pendant plusieurs semaines. Une app installée sur l'écran d'accueil et utilisée régulièrement est protégée,
  et l'app demande le **stockage persistant** au premier lancement (statut affiché en bas de l'accueil).
  Ce n'est pourtant pas une garantie absolue : **tant qu'un dossier n'est pas exporté, un bandeau rouge
  le rappelle**. L'export et la restauration arrivent au Lot 4.
- Supprimer l'app de l'écran d'accueil, ou effacer les données de Safari, supprime les dossiers.

## Modifier les fiches (rules-as-data)

Les modèles sont dans `public/templates/` :

- `index.json` liste les modèles chargés ;
- `diagnostic-bati-ancien.json` reprend les 8 fiches terrain ;
- `preparation-visite.json` reprend la check-list matériel et les études préalables ;
- `checklist-template.schema.json` décrit le format (complétion automatique dans VS Code).

Après une modification : changer `version`, lancer `npm test` (vérifie les modèles livrés), puis pousser sur `main`.
Un dossier garde toujours la copie du modèle avec laquelle il a été créé.

## Développement

```bash
npm install
npm start                 # serveur de dev (sans service worker) sur http://localhost:4200
npm test                  # tests unitaires (Vitest)
npx ng build && npm run e2e   # tests E2E WebKit format iPad (mode avion, reprise après fermeture)
npm run build:pages       # build GitHub Pages (base /diag-bati/, 404.html, .nojekyll)
```

Le workflow `.github/workflows/deploy.yml` lance les tests puis publie sur GitHub Pages à chaque push sur `main`
(Settings → Pages → Source : **GitHub Actions**).
