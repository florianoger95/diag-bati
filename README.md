# Diag bâti — diagnostic du bâti ancien, hors ligne sur iPad

PWA Angular 20 pour saisir les diagnostics terrain sans connexion, puis produire le rapport.
Spécification complète : [docs/SPEC.md](docs/SPEC.md).

État :
- **Lot 1** : socle, dossiers, fiches pilotées par JSON, synthèse et clôture.
- **Lot 2** : photos sur chaque item, plans PDF, croquis, annotation au doigt, légende, conclusion.
- **Lot 3** : rapports PDF et Word, lexique avec astérisques automatiques, réglages du cabinet.
- **Lot 4** : mises à jour successives, sauvegarde et restauration, modèles importés, indicateur « Prête hors ligne ».
- **Lot 5a** : retours terrain sur l'annotation, les plans et les définitions des urgences.
- **Lot 5b** : repère « À sonder », liste des sondages, numéros des photos dans l'ordre du rapport.
- **Lot 5c** : plusieurs observations par item, photos situées sur le plan de référence de la fiche.
- **Lot 6a** : charte 3DE (couleurs, polices, monogramme, pictogrammes), accueil en cartes de dossier.
- **Lot 6b** : visite en liste de questions + détail d'une question, barre d'actions, plan de visite, mode portrait.
- **Lot 6c** : annotateur aux outils libellés, « Situer » en deux étapes, synthèse en liste + détail, pages Photos / Plans / Conclusion en cartes.

## Charte 3DE (lot 6a)

- Design system issu de Claude Design, direction « Atelier » : jetons et composants dans `src/styles.scss`.
- Polices Raleway (titres) et Open Sans (texte) embarquées dans `src/fonts/` (licence OFL), aucun CDN.
- Pictogrammes SVG en ligne : `<app-icon name="…">`, liste dans `src/app/shared/ui/icons.ts`.
  Un test interdit les emoji et symboles servant d'icône dans les écrans.
- Le rouge est réservé aux désordres ; l'urgence se lit aussi par le nombre de barres (`<app-urgency>`).
- Le monogramme 3DE de l'interface est dans `public/brand/`. Le logo du rapport reste importé dans les Réglages.

## Visite en liste + détail (lot 6b)

- Une seule barre en haut. Le **sélecteur de fiche** (« Couverture · Bâtiment 1 ») ouvre le plan de visite.
  Le plan montre toutes les fiches, avec leur avancement, les filtres et les outils.
- À gauche, la **liste des questions** de la fiche, avec la réponse résumée, les désordres et les vignettes.
  En pied de liste : **Synthèse de la fiche** (commentaires, préconisations, sécurité, entretien), puis la fiche précédente ou suivante.
- À droite, **une question à la fois**. Toucher une vignette la sélectionne ; la toucher à nouveau l'ouvre pour l'annoter.
- La **barre d'actions** en bas agit sur l'observation sélectionnée.
  Elle contient Photo, Photothèque, Désordre (choix de l'urgence), À sonder, + Observation et Situer photo n.
- La question ouverte est dans l'adresse (`?q=…`). Un rechargement ou un retour de l'annotateur rouvre la même question.
- **En portrait**, « Questions n/N » ouvre la liste en tiroir. La question précédente ou suivante est nommée en bas de l'écran.
  Les outils, Réglages et le dossier passent par le menu « … ».

## Plusieurs observations par item

- Le bouton **Observation** de la barre d'actions ajoute une observation à l'item. Chacune a son « À sonder » et son « Désordre ».
  À partir de la deuxième, chacune peut aussi être retirée (« Retirer »). Les photos restent rattachées à l'item.
- Dans le rapport, la première observation reste sur la ligne de l'item ; les suivantes forment des paragraphes en retrait.
  La synthèse des désordres et la liste des sondages ont une entrée par observation.
- Les dossiers existants n'ont rien à convertir : leur observation devient la première.

## Situer une photo sur le plan

- Chaque fiche a un **plan de référence**, défini dans le modèle (`referencePlan`).
  - Couverture : son propre plan, sinon le plan de toiture ou de masse.
  - Façades : les plans de façades.
  - Pièces : le plan du niveau, à **choisir en tête de la liste des questions** s'il y en a plusieurs.
- Après une photo, le bouton **Situer photo n** de la barre d'actions ouvre le plan. Dans l'annotateur d'une photo, c'est « Situer sur le plan ».
  1. Touchez l'endroit de la prise de vue.
  2. Glissez vers ce que la photo montre. La vignette de la photo reste visible en bas à gauche.
  3. Au lever du doigt, une pastille fléchée au numéro de la photo est enregistrée sur le plan.
     Vérifiez, puis touchez **Terminé** pour revenir à la question. **Recommencer** retire la pastille posée ; **Annuler** laisse le plan tel quel.
- Situer à nouveau une photo déplace sa pastille. Une photo située porte un repère d'épingle sur sa vignette.
- Les dossiers créés avant ce lot utilisent les plans de référence du modèle livré.

## Synthèse et clôture (lot 6c)

- À gauche, les rubriques avec leur compte : Désordres, Sondages à réaliser, Mesures de sécurité, Travaux et échéances, Entretien, Réponses obligatoires.
- À droite, le détail de la rubrique choisie (`?r=…`). Les désordres sont groupés par urgence, avec la jauge et la couleur de chaque niveau.
- Chaque ligne mène à sa question (« Voir »). « Clôturer la visite » est en bas à gauche.

## Repère « À sonder »

- Le bouton **À sonder**, à côté de « Désordre », marque l'observation d'un item. Il se cumule avec un désordre.
- Le filtre **« À sonder seulement »** de la fiche n'affiche que ces items. La synthèse les liste sous « Sondages à réaliser ».
- Dans le rapport :
  - « — À sonder » s'ajoute à la ligne de l'item ;
  - la liste **SONDAGES À RÉALISER** suit le récapitulatif des travaux.
- Dans une mise à jour, le repère est repris. Une fois le sondage fait, retirez-le : l'item affiche « Était à sonder » et la synthèse le marque « Levé ».

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

- **Exporter**, sur l'accueil ou dans la fiche du dossier, produit une archive `.diag.zip`.
  - Elle contient toutes les visites, réponses, photos, plans et annotations.
  - Sur l'iPad, elle s'enregistre via la feuille de partage : iCloud Drive, AirDrop, Mail.
  - Le dossier passe alors en « exporté » et le bandeau rouge disparaît.
- **Restaurer une sauvegarde** sur l'accueil. Si le dossier existe déjà, l'app propose de le remplacer ou d'en importer une copie.
- **Réglages → Sauvegarde des réglages** : cabinet, logo, police et annexe, pour préparer un autre iPad.
- L'archive se lit sur un ordinateur : `data.json` et les images ou PDF tels quels.

## Modèles importés

Réglages → Modèles de fiches → **Importer un modèle (.json)**.
- Le modèle est vérifié, puis remplace le modèle livré de même `templateId`.
- On peut ainsi ajuster une fiche sans redéployer l'app.
- Les dossiers existants gardent leur version.

## Avant de partir sur le terrain

Ouvrir l'app connecté jusqu'à voir **« Prête hors ligne »** en bas de l'accueil : tous les fichiers sont alors en cache.

## Rapports PDF et Word

- **Réglages** (roue dentée en haut à droite), à faire une fois :
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

- Chaque item a ses boutons « Appareil photo » et « Photothèque » (plusieurs photos à la fois).
  Les photos sont réduites à 1600 px en JPEG dès la prise de vue, une à la fois ; l'original n'est pas conservé.
- **Plans et croquis** (menu de la visite, ou items « plan » des fiches) : « Plan PDF » (choix de la page),
  « Image du plan », « Photo d'un plan » papier, « Croquis » sur fond blanc. La page de PDF est aussi gardée en vectoriel pour le rapport.
- **Annotation** : touchez une vignette.
  - Un doigt dessine, deux doigts zooment et déplacent ; les boutons zoomer / dézoomer / Ajuster permettent aussi de zoomer.
  - Outils libellés, par famille : Sélection · Formes (flèche, trait, rectangle, ellipse) · Tracés (libre, zone, texte) · Repères (pastille, tampon).
    Zone : touchez les angles, puis « Terminer la zone ». Pastille : 1-2-3, A-B-C ou numéro d'une autre photo. Tampon : « À SONDER », « TÉMOIN », « VOIR PHOTO ».
  - Les réglages de l'outil actif (épaisseur, taille, remplissage, mode de pastille) sont en bas à droite.
  - Couleurs nommées ; le bouton à côté rappelle la légende de la couleur courante (« Rouge = … ») et permet de la renommer.
  - Annuler / Rétablir à droite des outils. « Sélection » prend une forme pour la déplacer, la dupliquer, la recolorer ou la supprimer.
  - L'état d'enregistrement est affiché en haut ; « Supprimer la photo » est dans le menu « … ».
  - **Pivoter et recadrer un plan** : à l'import, tant qu'il n'est pas annoté (« Pivoter à gauche », « Pivoter à droite », « Recadrer » au-dessus des outils).
    L'image et la page PDF vectorielle sont transformées ensemble.
  - Les vignettes des fiches montrent les annotations (croquis compris).
- **Numéros** : chaque nature a sa suite (Photo 1…, Plan 1…, Croquis 1…), dans l'ordre où les images paraissent dans le rapport.
  - Déplacer une fiche, ajouter ou supprimer une photo renumérote aussitôt.
  - Les pastilles reliées à une photo suivent son numéro.
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
