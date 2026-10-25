# Spécification — App de diagnostic du bâti sur iPad (PWA hors ligne)

Version 0.3 — 25/10/2026 — statut : **à valider avant Lot 1**
v0.2 : refonte après lecture du dossier `DIAG`. v0.3 : intégration des réponses Q1–Q8.

---

## 0. Sources et décisions

### Ce que disent les documents

| Document | Ce que j'en retiens |
|---|---|
| `00 DIAG - PROCEDURE ET MEMO.docx` | Check-list matériel, préparation, études préalables ; légende des plans (6 catégories) ; rappels normatifs (rejingot ≥ 25 mm, pente d'appui ≥ 8 %, larmier ≥ 3 cm, détalonnage 1–3 cm, garde-corps 0,8/1 m…) ; sommaire standard du rapport. |
| `01`→`08 DIAG *.pages` | Les 8 fiches terrain. Chacune se termine par *Commentaires, préconisations* et *Mesures de sécurité à court terme*. |
| Rapport de diagnostic d'exemple `.docx` (54 p., 119 images) | Page de garde (logo, projet, conditions de visite, plan de masse) ; prose par item (« - Nature et état des appuis : … ») ; photos 2 colonnes dans le texte ; plans annotés ; *Mesures d'entretien* ; Conclusion ; Annexe lexique ; en-tête logo, pied « n / N ». Texte violet `#7030A0` = mise à jour après curage. Police : Maiandra GD. Styles Word : `Corps`, `Lgende`, `Titre4`, `Pieddepage`. |

### Décisions (réponses du 25/10/2026)

| # | Question | Décision | Effet sur la spec |
|---|---|---|---|
| Q1 | Rôle du rapport | **DOCX + PDF** | Un modèle de rapport intermédiaire unique, avec deux moteurs de rendu (§6). Le DOCX reprend les styles de ton Word. |
| Q2 | Mises à jour | **Oui, plusieurs successives** | Un dossier regroupe une visite initiale et N mises à jour (§2). Les ajouts et modifications apparaissent en violet. Les témoins de fissure gardent l'historique de leurs relevés. |
| Q3 | Plans | **PDF issu d'un logiciel de dessin** | pdf.js est embarqué. Le plan est gardé en vectoriel pour le PDF et en image pour l'annotation et le DOCX (§5). |
| Q4 | Désordres | **4 urgences : oui · auto-proposition : non · échéance par préconisation : oui** | Les désordres sont uniquement manuels. Les préconisations sont structurées (texte + échéance), ce qui produit le récapitulatif des travaux automatiquement. |
| Q5 | Couleurs de légende | **Choisies au moment de l'annotation** | Sélecteur de couleur libre ; chaque couleur utilisée reçoit un libellé de légende (§5). |
| Q6 | Volume | **≈ 100 photos / 15 Mo : ok** | Photos réduites à 1200 px dans le rapport. |
| Q7 | Police | **Maiandra GD** | Intégration PDF autorisée par la licence (`fsType = 8`). Le fichier n'est **pas** publié sur le site : tu l'importes une fois dans l'app. Repli sur Overlock (§6). |
| Q8 | Cible | **GitHub Pages · iPad Pro · iPadOS 26.5 · sans Pencil** | `base-href` + `404.html` ; annotation pensée pour le doigt (§5) ; tests sur WebKit actuel. |
| R1 | Lexique | **Annexe lexique toujours présente ; astérisque à chaque emploi d'un terme** | Lexique décrit en données ; astérisques posés automatiquement à la génération ; annexe ajoutée à chaque rapport (§6 bis). |

Choix appliqués par défaut (pas d'objection) :
- s'il manque des réponses obligatoires, la clôture avertit sans bloquer ;
- les modèles se modifient dans le code, avec un redéploiement ;
- l'import d'un modèle depuis l'iPad est une option au Lot 4.

---

## 1. Principes et choix techniques

| Principe | Conséquence |
|---|---|
| 100 % hors ligne après 1re ouverture | App-shell, modèles JSON, config rapport, police de repli, worker pdf.js et annexes précachés par `@angular/service-worker`. |
| Rien ne sort de l'iPad | Pas de backend, d'analytics ni de CDN. L'export est manuel. |
| **Pas de données personnelles dans le dépôt public** | Logo, coordonnées du cabinet et police Maiandra sont importés dans l'app (Réglages), stockés dans IndexedDB et inclus dans la sauvegarde. Le dépôt ne contient que la mise en page. |
| Rules-as-data | Fiches en JSON versionné, un seul `DynamicForm`. |
| Sauvegarde continue | Chaque modification est écrite immédiatement dans IndexedDB. |
| Dossier figé | Le dossier embarque une copie du modèle ; toutes ses visites l'utilisent. |

Stack :
- Angular 20 standalone + signals, TypeScript strict ;
- `@angular/pwa` ;
- Dexie 4 ;
- **pdf-lib** + `@pdf-lib/fontkit` pour le PDF ;
- **docx** pour le DOCX ;
- **pdfjs-dist** pour lire les plans PDF ;
- **fflate** pour l'archive de sauvegarde.

Tout est bundlé : aucune requête au runtime.
Tests : Vitest (Node + `fake-indexeddb` pour les données ; mode navigateur **Playwright WebKit** pour l'image, le canvas et les rendus) et E2E Playwright WebKit (`setOffline(true)`).

---

## 2. Modèle de données (Dexie)

```ts
// projects — un dossier = un bâtiment diagnostiqué
interface Project {
  id: string;
  reference: string;                  // "2026-10-007", auto, modifiable
  fields: Record<string, unknown>;    // projectFields : projet, adresse, client/contact
  templateId: string; templateVersion: string;
  templateSnapshot: ChecklistTemplate;
  legend: LegendEntry[];              // couleurs nommées au fil des annotations (§5)
  createdAt: number; updatedAt: number;
}

// visits — révision 0 = visite initiale, 1..n = mises à jour
interface Visit {
  id: string; projectId: string;
  revision: number;
  reason?: string;                    // "suite à curage"
  fields: Record<string, unknown>;    // visitFields : date-heure, T° ext, HR ext, temps
  instances: SectionInstance[];
  conclusion: string;
  status: 'draft' | 'closed' | 'exported';
  cursor: { instanceId: string; scrollY: number } | null;
  createdAt: number; updatedAt: number; closedAt?: number; exportedAt?: number;
}
interface SectionInstance { id: string; sectionId: string; label: string; order: number; }

// answers — clé [visitId+instanceId+itemId] ; copiées intégralement à chaque mise à jour
interface Answer {
  visitId: string; instanceId: string; itemId: string;
  value: AnswerValue;
  other?: string;                     // « Autre : … »
  observation: string;
  defect?: { urgency: Urgency };      // désordre signalé manuellement
  changedInRevision: number;          // dernière révision qui a modifié la réponse
  inherited?: { value: AnswerValue; other?: string; observation: string }; // état hérité → diff, annulation
  updatedAt: number;
}
type Urgency = 'immediate' | 'short' | 'medium' | 'monitor';
  // Immédiat · Court terme · Moyen terme · À surveiller
type AnswerValue = boolean | string | string[] | number | MeasureRow[] | ActionRow[] | null;
interface MeasureRow { id: string; point: string; values: (number | null)[]; note?: string; }
interface ActionRow  { id: string; text: string; urgency: Urgency; detail?: string; }

// photos — rattachées au dossier, visibles de la révision addedIn à removedIn (exclue)
interface Photo {
  id: string; projectId: string; blobId: string;
  instanceId: string | null; itemId: string | null;
  kind: 'photo' | 'plan' | 'sketch';
  number: number;                     // stable dans le dossier
  caption: string; order: number;
  annotations: Shape[];
  addedInRevision: number; removedInRevision?: number;
  createdAt: number; updatedAt: number;
}

// blobs — binaires partagés entre révisions (jamais dupliqués)
interface StoredBlob {
  id: string;
  image: Blob;                        // JPEG ≤ 1600 px (photo) / ≤ 2400 px (plan)
  thumb: Blob;                        // JPEG 320 px
  vector?: Blob;                      // plan : PDF d'une seule page, conservé pour le rapport
  width: number; height: number; byteSize: number;
}

// settings — clé/valeur : identité du cabinet, logo (Blob), police (Blob), compteur, dernier export…
interface Setting { key: string; value: unknown; }
```

```ts
db.version(1).stores({
  projects: 'id, reference, updatedAt',
  visits:   'id, projectId, [projectId+revision], status',
  answers:  '[visitId+instanceId+itemId], visitId, [visitId+instanceId]',
  photos:   'id, projectId, blobId, [projectId+number]',
  blobs:    'id',
  settings: 'key',
});
```

### Mises à jour (révisions)

- « Nouvelle mise à jour » n'est possible que si la dernière visite est clôturée. Elle crée la révision n+1 et y copie instances, réponses (avec `inherited`) et conclusion. Les visites précédentes passent en lecture seule.
- Modifier une réponse met `changedInRevision = n`. « Annuler la modification » restaure `inherited`.
- Photos en **copie à l'écriture** :
  - une photo ajoutée en révision n a `addedInRevision = n` ;
  - la supprimer depuis une mise à jour lui donne `removedInRevision = n` ;
  - modifier sa légende ou ses annotations crée une nouvelle ligne sur le **même blob**, avec le même numéro.
  Chaque révision reste ainsi reproductible à l'identique sans doubler le stockage.
- Supprimer un dossier supprime visites, réponses, photos et blobs orphelins en **une transaction**.

---

## 3. Schéma JSON des modèles

`src/assets/templates/index.json` + `<templateId>.json` + `checklist-template.schema.json` (JSON Schema 2020-12, validé au chargement ; un modèle invalide est écarté avec un message).

```ts
interface ChecklistTemplate {
  templateId: string; version: string; label: string;
  optionSets?: Record<string, EnumOption[]>;   // "etat" → bon / moyen / mauvais
  projectFields: Item[];              // page de garde : projet, adresse, client
  visitFields: Item[];                // par visite : date-heure, T°, HR, temps
  sectionFooter?: Item[];             // ajouté à chaque instance de section
  sections: Section[];
}

interface Section {
  id: string; label: string; helpText?: string;
  repeatable?: { noun: string; suggestions?: string[]; min?: number };
  footer?: boolean;                   // défaut true
  items: Item[];
}

interface Item {
  id: string;                         // unique dans tout le modèle
  label: string;
  type: 'heading' | 'boolean' | 'enum' | 'multi' | 'text' | 'number'
      | 'measures' | 'actions' | 'date' | 'datetime' | 'photo';
  required: boolean;
  helpText?: string;                  // rappel du mémo
  snippets?: string[];                // phrases types
  role?: 'comment' | 'recommendation' | 'safety' | 'maintenance';
  options?: EnumOption[] | string;    // liste ou nom d'optionSet
  allowOther?: boolean;
  unit?: string; min?: number; max?: number;   // number : repère visuel « hors norme », sans désordre auto
  measures?: { points?: string[]; columns: { label: string; unit?: string }[] };
      // humidité : points ["0 m","1 m","2 m"], columns [{label:"Humidité", unit:"%"}]
      // témoins  : points libres,           columns [{label:"H", unit:"mm"},{label:"V", unit:"mm"}]
  history?: boolean;                  // le rapport affiche l'historique des valeurs entre révisions
  photoKind?: 'photo' | 'plan';
  observation?: boolean;              // défaut true (sauf heading)
}

interface EnumOption { value: string; label: string; warn?: boolean; } // warn = style visuel seulement
```

| type | valeur | Rendu dans le rapport |
|---|---|---|
| `heading` | — | sous-titre (« Fenêtres », « Parois ») |
| `boolean` | `true / false / null` | « Oui » / « Non » |
| `enum` / `multi` | `string` / `string[]` (+ `other`) | libellés séparés par des virgules |
| `text` | `string` | paragraphe |
| `number` | `number` | `12 %` |
| `measures` | `MeasureRow[]` | « 0 m : 7,5 % – 1 m : 6,5 % – 2 m : 3,8 % » ; avec `history`, « État initial 0 ; −3 (05/10/2026) → 2 ; −1 (21/10/2026) » |
| `actions` | `ActionRow[]` | liste à puces avec échéance → alimente le **récapitulatif des travaux** |
| `date` / `datetime` | ISO | `17/09/2026 à 13h30` |
| `photo` | — (table `photos`) | grille de photos / plan pleine largeur |

Les **désordres** sont manuels (Q4). Le bouton « ⚠ Désordre » est présent sur chaque item ; son urgence est obligatoire, et l'observation de l'item sert de description.

### Modèles livrés au Lot 1

1. **`diagnostic-bati-ancien`** — les 8 fiches Pages :
   - `projectFields` : projet, adresse, client/contact.
   - `visitFields` : date et heure, T° extérieure (°C), hygrométrie extérieure (% HR), temps.
   - `sectionFooter` : Commentaires (`comment`, texte) · Préconisations (`recommendation`, `actions`) · Mesures de sécurité à court terme (`safety`, `actions`) · Mesures d'entretien (`maintenance`, `actions`).
   - Répétables : Couverture (par bâtiment), Façades (par façade), Intérieur (par pièce).
   - Rappels normatifs en `helpText`, relevés d'humidité et témoins de fissure en `measures`.
2. **`preparation-visite`** — check-list matériel, préparation du dossier, études préalables (`boolean` + `text`).

```json
{
  "id": "couv-tuiles-etat", "label": "État des tuiles", "type": "enum", "options": "etat",
  "required": true, "snippets": ["Présence de mousse en quantité", "Tuiles poreuses", "Tuiles cassées ou déplacées"]
}
```

---

## 4. Écrans

```
/                                   Dossiers : En cours / Terminés / Exportés · stockage        Lot 1
 │                                  · bandeau « non exporté »
 ├─ /dossiers/nouveau               Modèle + champs projet                                      Lot 1
 └─ /dossiers/:pid                  Fiche dossier : visites (initiale, MAJ 1, MAJ 2…)           Lot 1
     │                              · « Nouvelle mise à jour »                                  Lot 4
     └─ /v/:vid                     Saisie de la visite (conditions de visite en tête)          Lot 1
         ├─ /i/:instanceId          Items ; navigation sections → instances ; + ajouter,
         │                          dupliquer, renommer, réordonner
         ├─ /synthese               Désordres par urgence · mesures de sécurité ·
         │                          récap travaux · obligatoires manquants → Clôturer
         ├─ /conclusion             Texte libre + plans de conclusion                           Lot 2
         ├─ /plans                  Import PDF (choix de la page) · croquis vierge             Lot 2
         ├─ /photos[/:photoId]      Galerie · annotation plein écran                            Lot 2
         └─ /rapport                Générer PDF / DOCX · partager                               Lot 3
/reglages                           Cabinet (logo, coordonnées) · police · sauvegarde ·        Lot 3–4
                                    stockage · version
```

Dans une mise à jour, chaque item modifié porte un repère violet avec « Voir l'original » et « Annuler la modification ». Un filtre « Modifiés dans cette mise à jour » est disponible.

Ergonomie :
- cibles ≥ 48 px ;
- états en boutons segmentés pleine largeur ;
- observation qui s'agrandit avec le texte, compatible avec la dictée ;
- bouton photo sur chaque item ;
- contraste ≥ 7:1 ;
- en portrait, navigation en tiroir ; en paysage, colonne fixe.

---

## 5. Photos, plans, annotation

**Photo** : `<input type="file" accept="image/*" capture="environment">`
→ `createImageBitmap`
→ côté long ≤ 1600 px
→ `OffscreenCanvas`
→ JPEG q 0,8 + vignette de 320 px
→ libération (`close()`, canvas remis à 0×0, `revokeObjectURL`).

Une photo à la fois. L'original n'est jamais stocké.

**Plan PDF** (Q3) : `<input type="file" accept="application/pdf">` ouvre l'app Fichiers.
1. pdf.js affiche les pages en miniatures et tu choisis la page.
2. pdf-lib extrait **cette page seule** dans un petit PDF vectoriel (`blobs.vector`).
3. pdf.js en fait un rendu 2400 px, JPEG q 0,9 (`blobs.image`), qui sert à annoter et au DOCX.

Le worker pdf.js est servi localement et précaché.

**Croquis** : fond blanc A4 2400 × 1697 px.

**Formes** (coordonnées normalisées 0–1, épaisseurs en fraction de la largeur) :

```ts
type Shape =
  | { id; kind: 'arrow';   x1; y1; x2; y2; color; width }
  | { id; kind: 'rect';    x; y; w; h; color; width }
  | { id; kind: 'ellipse'; cx; cy; rx; ry; color; width }
  | { id; kind: 'free';    points: [x, y][]; color; width }
  | { id; kind: 'zone';    points: [x, y][]; color; fill: 'hatch' | 'tint' }
  | { id; kind: 'text';    x; y; text; color; size }
  | { id; kind: 'badge';   x; y; n; color; size; photoId?: string };
interface LegendEntry { color: string; label: string; }
```

**Couleurs (Q5)** : 6 couleurs récentes + un sélecteur libre (`<input type="color">`). La première utilisation d'une couleur dans le dossier propose de la nommer, avec les catégories du mémo en suggestion. Le PDF imprime sous chaque plan la légende des seules couleurs utilisées.

**Au doigt (Q8, pas de Pencil)** :
- un doigt dessine, deux doigts déplacent et zooment (jusqu'à ×4) ;
- les formes sont saisies par glisser, avec poignées de 44 px pour les ajuster ;
- le texte se saisit au clavier dans une boîte de dialogue ;
- annuler / rétablir jusqu'à 100 étapes ;
- appui long sur une forme pour la sélectionner.

**Rendu** : une seule description des formes, avec deux moteurs de rendu derrière une interface `ShapeSink` :
- **Canvas 2D** pour l'écran, le DOCX et les photos du PDF ;
- **pdf-lib vectoriel**, dessiné par-dessus la page de plan vectorielle, pour des plans nets et légers dans le PDF.

---

## 6. Rapports PDF et DOCX

```
buildReport(project, visit, answers, photos, config) → ReportModel   (pur, testé)
                    ├─ layoutPdf(model) → PageModel[] → renderPdf() → Uint8Array   (pdf-lib)
                    └─ renderDocx(model) → Blob                                    (docx)
```

`ReportModel` est un arbre sémantique : titre de section, titre d'instance, ligne d'item, paragraphe, grille de photos, plan, liste d'actions, saut de page. Les passages révisés y portent une marque `revised`.

| Bloc | Contenu |
|---|---|
| `cover` | Logo + coordonnées du cabinet · « PROJET {nom} » + adresse · « ÉTAT ET DIAGNOSTIC DE L'EXISTANT » · dates : « 01/10/2026 – Mise à jour suite à curage le 23/10/2026 – Mise à jour … » · conditions de la visite · plan de masse · note sur les astérisques |
| `body` | Section → instance → `- Libellé : valeur. Observation.` → photos 2 colonnes, numérotées, légende → Commentaires / Préconisations / Mesures de sécurité / Mesures d'entretien |
| `conclusion` | Texte libre + plans annotés |
| `defects` | Désordres par urgence, avec renvois section et photo |
| `works` | **Récapitulatif des travaux et échéances**, agrégé depuis toutes les préconisations (Q4) |
| `lexicon` | **ANNEXE – LEXIQUE**, voir §6 bis |

**Révisions dans le rapport** :
- Une observation modifiée est comparée mot à mot à `inherited` : seul le texte ajouté ou changé passe en violet `#7030A0`, comme dans ton Word.
- `revisionHighlight` en config : `latest` (seule la dernière mise à jour) ou `all` (tout ce qui a changé depuis la visite initiale).
- Un item avec `history` affiche tous les relevés datés.

**Police (Q7)** :
- **PDF** : Maiandra GD importée une fois (Réglages → choisir `MAIAN.TTF` depuis Fichiers), stockée dans IndexedDB et intégrée en sous-ensemble dans le PDF. La police n'existe qu'en Regular : le gras est simulé (contour du texte) et l'italique aussi (inclinaison de 12°), comme le fait Word. Si la police n'est pas importée, repli sur Overlock (licence libre, bundlée).
- **DOCX** : la police est référencée par son nom, sans intégration ; Word sur ton ordinateur l'affiche.

**DOCX (Q1)** :
- Les styles reprennent ceux de ton rapport (`Corps`, `Lgende`, `Titre4`…), extraits de son `styles.xml` puis passés à la bibliothèque `docx` par `externalStyles`.
- En-tête avec le logo, pied de page avec `PAGE / NUMPAGES`.
- Grilles de photos en tableaux sans bordure ; plans en image.

```json
{
  "page": { "size": "A4", "margins": [18, 20, 18, 20] },
  "title": "ÉTAT ET DIAGNOSTIC DE L'EXISTANT",
  "font": { "family": "Maiandra GD", "fallback": "assets/fonts/Overlock-Regular.ttf", "size": 10.5 },
  "colors": { "text": "#000000", "revision": "#7030A0", "defect": "#C00000", "accent": "#1F4E79" },
  "blocks": ["cover", "body", "conclusion", "defects", "works", "lexicon"],
  "revisionHighlight": "all",
  "photos": { "columns": 2, "maxLongSide": 1200, "jpegQuality": 0.72 },
  "emptyInstance": "omit",
  "lexicon": { "file": "assets/config/lexicon.json", "mark": "every", "annex": "all" },
  "docx": { "styles": "assets/config/styles-cabinet.xml" },
  "footer": { "center": "{page} / {pages}" }
}
```

La pagination « n / N » est calculée à la génération. Ton Word affiche « 54 / 50 », car le total de pages n'y avait pas été mis à jour.

Budget : ~150 Ko par photo, soit environ 100 photos pour 15 Mo (Q6). Les plans vectoriels pèsent généralement moins de 300 Ko chacun. Un rapport se génère en quelques dizaines de secondes, avec une barre de progression : photos aplaties une par une, avec une pause entre chaque pour garder l'interface réactive.

---

## 6 bis. Lexique et astérisques

Ce qu'on observe dans le rapport d'exemple :
- l'annexe (p. 50–54) est faite de **schémas légendés groupés par thème** : Fenêtres, Charpente, Fermes traditionnelles, Types de lucarnes, Lucarne, Types de combles, Planchers / Types de planchers, Types d'escaliers ;
- un mot suivi de `*` dans le texte renvoie à une étiquette de ces schémas : abouts de pannes*, chevrons*, chéneau*, souche*, solin*, appuis*, rejingots*, larmiers*, tableaux*, liteau sablier*, panne sablière*, entrait*, retroussé*, quart tournant bas*, limon français*, contremarches*… ;
- la page de garde porte la note « * Les mots signalés d'une astérisque présentent une définition en annexe du présent rapport ».

Les astérisques sont aujourd'hui posés à la main, ce qui laisse passer des oublis : « Le chêneau » apparaît sans astérisque, puis « chéneau* » avec. L'app les pose **automatiquement à la génération** du PDF et du DOCX. Tu écris normalement sur le terrain, sans astérisque.

**Données** : `src/assets/config/lexicon.json` (texte seul, versionné, modifiable comme les modèles) :

```json
{
  "version": "1.0.0",
  "note": "* Les mots signalés d'une astérisque présentent une définition en annexe du présent rapport",
  "groups": [
    { "id": "fenetres",  "label": "Fenêtres",           "annexPages": [1] },
    { "id": "charpente", "label": "Charpente",          "annexPages": [1, 2] },
    { "id": "lucarnes",  "label": "Types de lucarnes",  "annexPages": [2, 3] },
    { "id": "planchers", "label": "Planchers",          "annexPages": [4] },
    { "id": "escaliers", "label": "Types d'escaliers",  "annexPages": [5] }
  ],
  "terms": [
    { "id": "rejingot",       "group": "fenetres",  "forms": ["rejingot", "rejingots"] },
    { "id": "chenau",         "group": "charpente", "forms": ["chéneau", "chêneau", "chéneaux", "chêneaux"] },
    { "id": "panne-sabliere", "group": "charpente", "forms": ["panne sablière", "pannes sablières"] },
    { "id": "panne",          "group": "charpente", "forms": ["panne", "pannes"] },
    { "id": "souche",         "group": "charpente", "forms": ["souche", "souches"] },
    { "id": "quart-tournant-bas", "group": "escaliers", "forms": ["quart tournant bas"] }
  ]
}
```

Le lexique initial est rempli à partir des étiquettes des schémas de l'annexe et des termes marqués dans le rapport d'exemple, soit une centaine de termes à relire avec toi.

**Règles de marquage** (`applyLexicon`, fonction pure) :
- recherche par mot entier, sans tenir compte de la casse. La casse d'origine est conservée : « Chevrons* » ;
- **la forme la plus longue l'emporte** : « panne sablière* », et non « panne* sablière » ;
- les variantes d'accent et les pluriels sont listés explicitement dans `forms`. Il n'y a pas de pluriel deviné, pour éviter les faux positifs ;
- `mark: "every"` (ton usage) met un astérisque à chaque occurrence ; `"first"` seulement à la première occurrence du rapport ;
- textes concernés : observations, valeurs, préconisations, conclusion, légendes de photos. Ne sont pas concernés : les titres, la page de garde et la synthèse des désordres (option) ;
- un mot déjà suivi de `*` n'en reçoit pas un deuxième ;
- un astérisque dans un passage révisé reste violet.

**Homonymes**. « Souche » désigne la souche de cheminée (lexique) mais aussi la souche d'arbre : « Retirer les souches » ne doit pas être marqué.
- Pendant la saisie, les termes du lexique détectés sont **soulignés en pointillé** sous la zone d'observation.
- Un appui long sur l'un d'eux propose « Ne pas marquer ici ». L'app ajoute alors un caractère invisible (U+2060) juste après le mot ; le marquage l'ignore et il est retiré à l'export. Comme ce caractère est attaché au mot, il suit les modifications du texte.

**Annexe** :
- les schémas sont des images tierces, dont certaines portent la mention « reproduction interdite ». Comme la police, ils ne sont **pas publiés sur le site** : tu exportes une fois l'annexe de ton Word en PDF et tu l'importes dans Réglages → Lexique ;
- **PDF** : les pages de l'annexe sont fusionnées en vectoriel, sous le titre « ANNEXE – LEXIQUE », avec l'en-tête logo et la pagination de l'app ;
- **DOCX** : les pages sont converties en images par pdf.js, à pleine largeur ;
- `annex: "all"` (ton usage) joint l'annexe complète. `"used"` ne garde que les pages (`annexPages`) des groupes dont un terme apparaît ;
- la note de page de garde n'est imprimée que si au moins un terme est marqué.

---

## 7. Cas limites

**Stockage** :
- `navigator.storage.persist()` est appelé au 1er lancement (supporté par iPadOS 26) et son résultat est affiché ;
- un bandeau rouge reste visible tant qu'une visite n'a jamais été exportée, avec une page « Pourquoi ? » qui explique la purge Safari ;
- une `QuotaExceededError` donne un message explicite, sans perte silencieuse ;
- si la base ne s'ouvre pas, un écran d'erreur dédié s'affiche.

Ordre de grandeur : 120 photos ≈ 60 Mo par dossier.

**Saisie** :
- l'observation est écrite 300 ms après la dernière frappe, et immédiatement sur `visibilitychange` / `pagehide` ;
- *(Lot 1)* chaque modification en attente est d'abord notée de façon synchrone dans un **journal `localStorage`** (quelques octets), effacé dès que l'écriture dans IndexedDB a réussi, et rejoué à la réouverture. Les données restent dans IndexedDB : le journal protège seulement les frappes des 300 dernières millisecondes si Safari est tué. Un test E2E vérifie ce cas ;
- la position (instance + défilement) est restaurée ;
- les textes longs restent fluides ;
- supprimer une instance demande une confirmation avec le nombre de photos ;
- une visite précédente est en lecture seule et ne peut pas être modifiée par erreur.

**Révisions** :
- une mise à jour d'une mise à jour (n ≥ 2) fonctionne ;
- une instance ajoutée en mise à jour (nouvelle pièce visitée après curage) apparaît entièrement en violet ;
- une instance supprimée en mise à jour disparaît du rapport de cette révision uniquement ;
- annuler une modification retire le violet.

**Plans PDF** :
- un PDF protégé ou corrompu donne un message clair ;
- un très grand format (A0) est rendu à 2400 px maximum, sous la limite des canvas iPad (≈ 16,7 Mpx) ;
- pour un PDF de plusieurs pages, l'app demande laquelle importer.

**Mémoire** : jamais plus d'un canvas pleine taille ouvert à la fois. pdf.js est détruit après chaque import (`destroy()`).

**Rapport (choix de réalisation, Lot 3)** :
- **Plans dans le PDF** : la page vectorielle du plan est posée telle quelle. Les annotations sont posées par-dessus en calque PNG transparent, plutôt qu'en tracés vectoriels pdf-lib : le rendu reste identique à l'écran, avec un seul moteur de dessin.
- **Annexe** : aucun titre n'est ajouté, puisque la première page de l'annexe importée porte déjà « ANNEXE – LEXIQUE ». L'app ajoute le logo et la pagination sur ces pages.
- **Renvoi des photos** : « (État des tuiles) » sous la légende. La flèche « → » est absente de la police de repli.

**Binaires en navigation privée** *(constaté au Lot 2)* : WebKit refuse d'enregistrer des `Blob` dans IndexedDB dans une session éphémère (navigation privée de Safari, contextes de test). L'app le détecte une fois par session ; dans ce cas, elle stocke le même binaire en `ArrayBuffer` (jamais en base64) et le relit en `Blob`. En usage normal, les images restent des `Blob`.

**Service worker / GitHub Pages** :
- `ng build --base-href /<repo>/` ;
- `404.html` = `index.html` ;
- une nouvelle version déclenche un bandeau, et l'app ne se recharge que sur action de l'utilisateur.

**Rapport** :
- une observation trop longue est coupée sur plusieurs pages ;
- une photo n'est jamais séparée de sa légende ;
- une instance vide est omise ;
- sans désordre, le bloc affiche « Aucun désordre relevé » ;
- si Maiandra n'est pas importée, un avertissement s'affiche et Overlock est utilisée.

**Lexique** :
- une annexe non importée affiche un avertissement : le rapport est généré sans annexe et sans astérisques, et la note de couverture est omise ;
- un terme collé à de la ponctuation (« chevrons*, » ou « (solin*) ») est bien marqué ;
- les apostrophes droites et typographiques sont équivalentes (« l'entrait* », « l’entrait* ») ;
- un terme inclus dans un autre mot n'est pas marqué (« panne » dans « dépanner ») ;
- le caractère d'exclusion n'apparaît jamais dans les fichiers exportés.

---

## 8. Plan de tests (écrits avant le code)

| Domaine | Lot | Exemples |
|---|---|---|
| Repository Dexie | 1 | création dossier + snapshot ; visite ; instances (ajout/duplication/suppression en cascade) ; upsert réponse ; progression ; suppression dossier atomique |
| Moteur de modèle | 1 | validation (ids dupliqués, optionSet inconnu) ; résolution optionSets ; sectionFooter injecté ; `actions` et `measures` ; désordre manuel |
| Compression image | 2 | 4000×3000 → 1600×1200 ; portrait ; pas d'agrandissement ; JPEG ; ressources libérées |
| Import plan PDF | 2 | extraction d'une page en PDF autonome ; rendu 2400 px ; PDF multi-pages |
| Annotations | 2 | pixels attendus par forme (Canvas) ; mêmes formes en opérateurs PDF (pdf-lib) ; annuler/rétablir |
| `buildReport` | 3 | ordre des blocs ; structure section/instance/item ; récap travaux par échéance ; diff mot à mot → segments `revised` ; historique des témoins |
| `applyLexicon` | 3 | mot entier ; casse conservée ; forme la plus longue ; variantes d'accent ; ponctuation ; apostrophes ; `every` / `first` ; pas de double `*` ; exclusion U+2060 ; segments violets conservés |
| PDF | 3 | rechargeable ; pagination « n / N » ; police importée vs repli ; plan vectoriel ; annexe lexique fusionnée (`all` / `used`) ; note de couverture conditionnelle ; 100 photos < 15 Mo |
| DOCX | 3 | archive valide ; `document.xml` contient titres, texte violet, images ; styles appliqués |
| Révisions | 4 | copie avec `inherited` ; copie à l'écriture des photos ; lecture seule des anciennes visites ; MAJ de MAJ |
| E2E WebKit | 1→4 | mode avion de bout en bout ; fermeture en pleine saisie puis réouverture |

---

## 9. Lots

| Lot | Contenu | Démo de validation |
|---|---|---|
| 1 | Squelette Angular 20 + PWA (GitHub Pages) + Dexie (modèle complet, révisions comprises) · dossiers et visites · moteur de formulaire (répétables, optionSets, observations, mesures, actions, désordres manuels) · synthèse / clôture · 2 modèles | Remplir Couverture pour 2 bâtiments en mode avion, tuer Safari, retrouver l'état |
| 2 | Photos par item · plans PDF · croquis · annotation au doigt · légende nommée · conclusion | Plan de couverture PDF annoté avec repères photos |
| 3 | `buildReport` + PDF + DOCX · lexique (astérisques automatiques, soulignement à la saisie, annexe) · Réglages cabinet (logo, coordonnées) · import de la police et de l'annexe | PDF et DOCX façon rapport d'exemple en mode avion, astérisques et annexe compris |
| 4 | Mises à jour successives (diff violet, historique des témoins) · sauvegarde / restauration `.diag.zip` · finitions | 2 mises à jour sur un dossier, puis restauration sur un iPad vierge |

```
src/app/
  core/db/            dexie.ts, project.repository.ts, revision.service.ts
  core/templates/     loader, validator, option-sets
  features/projects/  accueil, nouveau dossier, fiche dossier
  features/checklist/ dynamic-form, renderers/*, instances, synthese
  features/photos/    capture, image-compress, gallery, plans (pdfjs), annotator/ (shapes, canvas-sink, pdf-sink)
  features/report/    build-report.ts (pur), layout-pdf.ts, render-pdf.ts, render-docx.ts, text-diff.ts, lexicon.ts (pur)
  features/settings/
  shared/ui/
src/assets/templates/ index.json, diagnostic-bati-ancien.json, preparation-visite.json, schema
src/assets/config/    report.config.json, lexicon.json, styles-cabinet.xml
src/assets/fonts/     Overlock-*.ttf (OFL)
                      (police Maiandra, logo, annexe lexique : importés dans l'app, jamais dans le dépôt)
```
