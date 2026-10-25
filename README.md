# Diag bâti — diagnostic du bâti ancien, hors ligne sur iPad

PWA Angular 20 pour saisir les diagnostics terrain sans connexion, puis produire le rapport.
Spécification complète : [docs/SPEC.md](docs/SPEC.md).

État :
- **Lot 1** : socle, dossiers, fiches pilotées par JSON, synthèse et clôture.
- **Lot 2** : photos sur chaque item, plans PDF, croquis, annotation au doigt, légende, conclusion.

À venir : rapports PDF/DOCX au Lot 3, mises à jour et sauvegarde au Lot 4.

## Photos, plans et annotation

- Chaque item a ses boutons 📷 (appareil photo) et 🖼 (photothèque, plusieurs photos à la fois).
  Les photos sont réduites à 1600 px en JPEG dès la prise de vue, une à la fois ; l'original n'est pas conservé.
- **Plans et croquis** (menu de la visite, ou items « plan » des fiches) : 📄 page d'un plan PDF (choix de la page),
  📷 photo d'un plan papier, ✏️ croquis sur fond blanc. La page de PDF est aussi gardée en vectoriel pour le rapport.
- **Annotation** : touchez une vignette.
  - Un doigt dessine, deux doigts zooment et déplacent ; les boutons ＋ / － / Ajuster permettent aussi de zoomer.
  - Outils : flèche, rectangle, ellipse, trait libre, zone (touchez les angles, puis « Terminer la zone »), texte, pastille numérotée (numéro suivant, ou numéro d'une autre photo).
  - Annuler / rétablir. L'outil ☝ sélectionne une forme pour la déplacer, la recolorer ou la supprimer.
  - À la première utilisation d'une couleur, l'app propose de la nommer : ce nom alimente la légende des plans.

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
