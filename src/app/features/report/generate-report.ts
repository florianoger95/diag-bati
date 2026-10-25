// Génération du rapport dans l'app : données de la visite + fichiers du cabinet → PDF ou DOCX.
import { StoredAsset } from '../../core/db/diag-repository';
import { fitSize } from '../../core/media/image-compress';
import { openPdf } from '../../core/media/pdf-plan';
import { Answer, Photo, Project, StoredBlob, Visit } from '../../core/model/data';
import { ResolvedTemplate } from '../../core/model/template';
import { buildReport } from '../../core/report/build-report';
import { CompiledLexicon } from '../../core/report/lexicon';
import { annotationOverlay, flattenImage } from '../../core/report/report-images';
import { FirmInfo, ReportConfig, ReportModel } from '../../core/report/report-model';

export interface GenerateContext {
  project: Project;
  visit: Visit;
  template: ResolvedTemplate;
  answers: Answer[];
  photos: Photo[];
  getBlob(blobId: string): Promise<StoredBlob | undefined>;
  config: ReportConfig;
  lexicon: CompiledLexicon | null;
  firm: FirmInfo;
  logo?: StoredAsset;
  font?: StoredAsset;
  annex?: StoredAsset;
  /** Visites précédentes (rapport d'une mise à jour). */
  history?: { visit: Visit; answers: Answer[] }[];
  onProgress?(label: string, done: number, total: number): void;
}

export interface GeneratedReport {
  blob: Blob;
  fileName: string;
  model: ReportModel;
}

const bytesOf = async (blob: Blob) => new Uint8Array(await blob.arrayBuffer());

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function fallbackFonts() {
  const load = async (name: string) => {
    const response = await fetch(new URL(`fonts/${name}.ttf`, document.baseURI));
    if (!response.ok) throw new Error('Police du rapport indisponible hors ligne : ouvrez l’app une fois connecté.');
    return new Uint8Array(await response.arrayBuffer());
  };
  const [regular, bold, italic, boldItalic] = await Promise.all(
    ['Overlock-Regular', 'Overlock-Bold', 'Overlock-Italic', 'Overlock-BoldItalic'].map(load),
  );
  return { regular, bold, italic, boldItalic };
}

async function logoOf(logo?: StoredAsset) {
  if (!logo || !logo.width || !logo.height) return undefined;
  return { bytes: await bytesOf(logo.blob), type: logo.blob.type === 'image/png' ? 'png' as const : 'jpg' as const, width: logo.width, height: logo.height };
}

export async function generateReport(format: 'pdf' | 'docx', ctx: GenerateContext): Promise<GeneratedReport> {
  const progress = ctx.onProgress ?? (() => undefined);
  progress('Rédaction du rapport', 0, 1);
  const model = buildReport({
    project: ctx.project, visit: ctx.visit, template: ctx.template, answers: ctx.answers, photos: ctx.photos,
    config: ctx.config, lexicon: ctx.lexicon ?? undefined, hasAnnex: !!ctx.annex, firm: ctx.firm, reportDate: today(),
    history: ctx.history,
  });

  // dimensions et binaires des images utilisées (les Blob ne sont lus qu'au moment du rendu)
  const photos = new Map(ctx.photos.map((p) => [p.id, p]));
  const blobs = new Map<string, StoredBlob>();
  for (const id of model.photoIds) {
    const photo = photos.get(id);
    const blob = photo ? await ctx.getBlob(photo.blobId) : undefined;
    if (blob) blobs.set(id, blob);
  }
  const imageSize = (id: string) => {
    const b = blobs.get(id);
    return b ? { width: b.width, height: b.height } : { width: 4, height: 3 };
  };
  const target = (photo: Photo) => (photo.kind === 'photo' ? ctx.config.photos.maxLongSide : ctx.config.photos.planMaxLongSide);
  const quality = (photo: Photo) => (photo.kind === 'photo' ? ctx.config.photos.jpegQuality : 0.85);
  const raster = async (id: string) => {
    const photo = photos.get(id)!;
    const blob = blobs.get(id);
    if (!blob) throw new Error(`Image n° ${photo?.number ?? '?'} introuvable.`);
    return flattenImage(blob.image, photo.annotations, target(photo), quality(photo));
  };
  const logo = await logoOf(ctx.logo);
  const fileName = `${model.fileBaseName}.${format}`;

  if (format === 'pdf') {
    const { renderPdf } = await import('../../core/report/render-pdf');
    const fonts = ctx.font ? { regular: await bytesOf(ctx.font.blob) } : await fallbackFonts();
    const bytes = await renderPdf(model, ctx.config, {
      fonts, logo, imageSize,
      annex: ctx.annex ? await bytesOf(ctx.annex.blob) : undefined,
      onProgress: (done, total) => progress('Préparation des images', done, total),
      loadImage: async (id) => {
        const photo = photos.get(id)!;
        const blob = blobs.get(id);
        if (photo.kind !== 'photo' && blob?.vector) {
          const size = fitSize(blob.width, blob.height, ctx.config.photos.planMaxLongSide);
          return {
            kind: 'pdf',
            bytes: await bytesOf(blob.vector),
            overlay: photo.annotations.length ? await annotationOverlay(photo.annotations, size.width, size.height) : undefined,
          };
        }
        return { kind: 'jpeg', bytes: (await raster(id)).bytes };
      },
    });
    progress('Enregistrement', 1, 1);
    return { blob: new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' }), fileName, model };
  }

  const { renderDocx } = await import('../../core/report/render-docx');
  const blob = await renderDocx(model, ctx.config, {
    imageSize, logo,
    loadRaster: raster,
    onProgress: (done, total) => progress('Préparation des images', done, total),
    annexPages: async (pages) => {
      if (!ctx.annex) return [];
      const pdf = await openPdf(ctx.annex.blob);
      try {
        const indices = (pages === 'all' ? Array.from({ length: pdf.pageCount }, (_, i) => i + 1) : pages)
          .map((n) => n - 1).filter((i) => i >= 0 && i < pdf.pageCount);
        const out = [];
        for (const i of indices) {
          progress('Annexe lexique', out.length, indices.length);
          const page = await pdf.importPage(i, 1600);
          out.push({ bytes: await bytesOf(page.image), width: page.width, height: page.height });
        }
        return out;
      } finally {
        await pdf.close();
      }
    },
  });
  progress('Enregistrement', 1, 1);
  return { blob, fileName, model };
}
