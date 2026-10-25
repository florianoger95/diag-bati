# Diag bâti — diagnostic du bâti ancien, hors ligne sur iPad

PWA Angular 20 pour saisir les diagnostics terrain sans connexion, puis produire le rapport.
Spécification complète : [docs/SPEC.md](docs/SPEC.md).

État :
- **Lot 1** : socle, dossiers, fiches pilotées par JSON, synthèse et clôture.
- **Lot 2** : photos sur chaque item, plans PDF, croquis, annotation au doigt, légende, conclusion.

- **Lot 3** : rapports PDF et Word, lexique avec astérisques automatiques, réglages du cabinet.
- **Lot 4** : mises à jour successives, sauvegarde et restauration, modèles importés, indicateur « Prête hors ligne ».

## Mises à jour (après curage, sondages…)

1. Clôturer la visite (« Synthèse et clôture »), puis, dans la fiche du dossier, choisir **+ Nouvelle mise à jour** et indiquer le motif.
2. La mise à jour reprend toutes les fiches, réponses, photos et la conclusion. La visite précédente passe en lecture seule.
3. Chaque item modifié porte un repère violet, avec deux boutons : « Voir l'original » et « Annuler la modification ».
   Le filtre « Modifiés seulement » n'affiche que les items changés.
4. Dans le rapport :
   - seuls les mots ajoutés ou changés passent en violet ;
   - la page de garde indique « … – Mise à jour suite à curage le … » ;
   - les témoins de fissure affichent l'historique de leurs relevés datés.

   `revisionHighlight` (dans `report.config.json`) vaut `all` (tout ce qui a changé depuis la visite initiale) ou `latest` (seulement la dernière mise à jour).

## Sauvegarde et restauration

- **⇪ Exporter**, sur l'accueil ou dans la fiche du dossier, produit une archive `.diag.zip`.
  - Elle contient toutes les visites, réponses, photos, plans et annotations.
  - Sur l'iPad, elle s'enregistre via la feuille de partage : iCloud Drive, AirDrop, Mail.
  - Le dossier passe alors en « exporté » et le bandeau rouge disparaît.
- **⇩ Restaurer une sauvegarde** sur l'accueil. Si le dossier existe déjà, l'app propose de le remplacer ou d'en importer une copie.
- **Réglages → Sauvegarde des réglages** : cabinet, logo, police et annexe, pour préparer un autre iPad.
- L'archive se lit sur un ordinateur : `data.json` et les images ou PDF tels quels.

## Modèles importés

Réglages → Modèles de fiches → **Importer un modèle (.json)**.
- Le modèle est vérifié, puis remplace le modèle livré de même `templateId`.
- On peut ainsi ajuster une fiche sans redéployer l'app.
- Les dossiers existants gardent leur version.

## Avant de partir sur le terrain

Ouvrir l'app connecté jusqu'à voir **« Prête hors ligne ✓ »** en bas de l'accueil : tous les fichiers sont alors en cache.

## Rapports PDF et Word

- **Réglages** (⚙ en haut à droite), à faire une fois :
  - nom et coordonnées du cabinet, logo ;
  - police Maiandra GD : copier `C:\Windows\Fonts\MAIAN.TTF` dans iCloud Drive, puis l'importer ;
  - annexe lexique : PDF exporté de Word, depuis un document sans en-tête ni pied de page.

  Ces fichiers restent sur l'iPad et ne sont jamais publiés.
- **Rapport** (menu de la visite) : « Générer le PDF » ou « Générer le Word ». Les deux se font hors ligne, et le fichier se partage vers Fichiers, AirDrop ou Mail.
- Le rapport suit `public/config/report.config.json` : ordre des blocs, titres, couleurs, marges, taille des photos.
- **Lexique** : `public/config/lexicon.json` liste les termes, avec leurs pluriels et variantes, ainsi que les exceptions comme « tableau électrique ».
  - Les astérisques sont posés à la génération, seulement si l'annexe est importée.
  - Pendant la saisie, les termes détectés s'affichent sous l'observation ; touchez-en un pour ne pas le marquer à cet endroit.

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
  le rappelle**. Exportez chaque dossier en fin de visite (voir « Sauvegarde et restauration »).
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
