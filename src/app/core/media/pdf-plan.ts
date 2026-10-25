// Import d'un plan PDF issu d'un logiciel de dessin (docs/SPEC.md §5).
// - la page choisie est extraite seule dans un PDF vectoriel (pdf-lib) : plans nets dans le rapport ;
// - pdf.js en fait une image de 2400 px pour l'annotation et pour le DOCX.
// pdf.js est chargé à la demande et détruit après usage (mémoire).
import { CompressedImage, fitSize } from './image-compress';

export interface ImportedPlan extends CompressedImage {
  /** PDF d'une seule page ; absent si le PDF source ne peut pas être découpé (chiffré…). */
  vector?: Blob;
}

export interface PdfHandle {
  pageCount: number;
  thumbnail(pageIndex: number, maxSide: number): Promise<Blob>;
  importPage(pageIndex: number, maxLongSide?: number): Promise<ImportedPlan>;
  close(): Promise<void>;
}

let workerSrc: string | undefined;

/** URL du worker pdf.js (par défaut : copie locale précachée par le service worker). */
export function configurePdfWorker(url: string): void {
  workerSrc = url;
}

async function loadPdfjs() {
  const lib = await import('pdfjs-dist');
  lib.GlobalWorkerOptions.workerSrc = workerSrc ?? new URL('pdfjs/pdf.worker.min.mjs', document.baseURI).href;
  return lib;
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Encodage JPEG impossible.'))), 'image/jpeg', quality),
  );
}

export async function openPdf(file: Blob): Promise<PdfHandle> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const pdfjs = await loadPdfjs();
  // pdf.js peut transférer le tampon au worker : on lui en donne une copie
  const task = pdfjs.getDocument({ data: bytes.slice() });
  let doc: Awaited<typeof task.promise>;
  try {
    doc = await task.promise;
  } catch (error) {
    await task.destroy();
    const name = (error as Error)?.name;
    if (name === 'PasswordException') throw new Error('Ce PDF est protégé par un mot de passe : exportez-le sans protection.');
    throw new Error("Ce fichier n'est pas un PDF lisible.");
  }

  /** Rendu d'une page dans un canvas temporaire, encodé en JPEG puis libéré. */
  async function render(pageIndex: number, maxSide: number, quality: number) {
    const page = await doc.getPage(pageIndex + 1);
    const base = page.getViewport({ scale: 1 });
    const size = fitSize(base.width, base.height, maxSide);
    // on accepte d'agrandir : un plan A4 à 72 dpi doit être net à l'écran
    const scale = maxSide / Math.max(base.width, base.height);
    const viewport = page.getViewport({ scale: Math.max(scale, size.width / base.width) });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    try {
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas indisponible (mémoire insuffisante ?).');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvas, canvasContext: ctx, viewport }).promise;
      const image = await toBlob(canvas, quality);
      return { canvas, image, width: canvas.width, height: canvas.height, release: () => page.cleanup() };
    } catch (error) {
      canvas.width = canvas.height = 0;
      page.cleanup();
      throw error;
    }
  }

  return {
    pageCount: doc.numPages,

    async thumbnail(pageIndex, maxSide) {
      const r = await render(pageIndex, maxSide, 0.7);
      r.canvas.width = r.canvas.height = 0;
      r.release();
      return r.image;
    },

    async importPage(pageIndex, maxLongSide = 2400) {
      const r = await render(pageIndex, maxLongSide, 0.9);
      let thumb: Blob;
      try {
        const t = fitSize(r.width, r.height, 320);
        const small = document.createElement('canvas');
        small.width = t.width;
        small.height = t.height;
        small.getContext('2d')!.drawImage(r.canvas, 0, 0, t.width, t.height);
        thumb = await toBlob(small, 0.7);
        small.width = small.height = 0;
      } finally {
        r.canvas.width = r.canvas.height = 0;
        r.release();
      }
      return { image: r.image, thumb, width: r.width, height: r.height, vector: await extractPage(bytes, pageIndex) };
    },

    async close() {
      await doc.destroy();
    },
  };
}

/** Copie une page du PDF dans un nouveau PDF (vectoriel). Undefined si impossible. */
async function extractPage(bytes: Uint8Array, pageIndex: number): Promise<Blob | undefined> {
  try {
    const { PDFDocument } = await import('pdf-lib');
    const source = await PDFDocument.load(bytes);
    const target = await PDFDocument.create();
    const [page] = await target.copyPages(source, [pageIndex]);
    target.addPage(page);
    const saved = await target.save();
    return new Blob([saved.buffer as ArrayBuffer], { type: 'application/pdf' });
  } catch {
    return undefined;
  }
}
