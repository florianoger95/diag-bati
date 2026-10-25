// Sauvegarde / restauration d'un dossier ou des réglages dans une archive .diag.zip (docs/SPEC.md §2, Lot 4).
// Le contenu reste lisible : data.json + les images et PDF tels quels.
import { strFromU8, strToU8, unzipSync, Unzipped, zipSync, Zippable } from 'fflate';
import { AssetKey, AssetMeta, DiagRepository } from '../db/diag-repository';
import { Answer, Photo, Project, StoredBlob, Visit } from '../model/data';
import { FirmInfo } from '../report/report-model';

const FORMAT = 'diag-bati';
const VERSION = 1;
const ASSET_KEYS: AssetKey[] = ['logo', 'font', 'annex'];

export class BackupConflictError extends Error {
  constructor(readonly reference: string) {
    super(`Le dossier ${reference} existe déjà sur cet iPad.`);
    this.name = 'BackupConflictError';
  }
}

interface Manifest {
  format: string;
  version: number;
  kind: 'project' | 'settings';
  exportedAt: string;
  reference?: string;
  name?: string;
  visits?: number;
  photos?: number;
}

interface BlobEntry {
  id: string;
  width: number;
  height: number;
  byteSize: number;
  files: { image: string; thumb: string; vector?: string };
  types: { image: string; thumb: string; vector?: string };
}

interface ProjectData {
  project: Project;
  visits: Visit[];
  answers: Answer[];
  photos: Photo[];
  blobs: BlobEntry[];
}

interface SettingsData {
  firm?: FirmInfo;
  assets: { key: AssetKey; meta: AssetMeta; file: string; type: string }[];
}

export interface BackupFile {
  bytes: Uint8Array;
  fileName: string;
}

export type BackupSummary = Pick<Manifest, 'kind' | 'exportedAt' | 'reference' | 'name' | 'visits' | 'photos'>;

const ext = (type: string) => (type === 'application/pdf' ? 'pdf' : type === 'image/png' ? 'png' : type.startsWith('font/') ? 'ttf' : 'jpg');
const bytes = async (blob: Blob) => new Uint8Array(await blob.arrayBuffer());
const safeName = (s: string) => s.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();

function zip(manifest: Manifest, data: unknown, files: Zippable): Uint8Array {
  return zipSync({
    'manifest.json': strToU8(JSON.stringify(manifest, null, 2)),
    'data.json': [strToU8(JSON.stringify(data)), { level: 6 }],
    ...files,
  }, { level: 0 }); // images et PDF sont déjà compressés
}

export async function exportProject(repo: DiagRepository, projectId: string): Promise<BackupFile> {
  const { db } = repo;
  const project = await repo.getProject(projectId);
  if (!project) throw new Error('Dossier introuvable.');
  const visits = await repo.getVisitsOfProject(projectId);
  const answers = await db.answers.where('visitId').anyOf(visits.map((v) => v.id)).toArray();
  const photos = await db.photos.where('projectId').equals(projectId).toArray();
  const files: Zippable = {};
  const blobs: BlobEntry[] = [];
  for (const blobId of new Set(photos.map((p) => p.blobId))) {
    const blob = await repo.getBlob(blobId);
    if (!blob) continue;
    const entry: BlobEntry = {
      id: blob.id, width: blob.width, height: blob.height, byteSize: blob.byteSize,
      files: { image: `images/${blob.id}/image.${ext(blob.image.type)}`, thumb: `images/${blob.id}/vignette.jpg` },
      types: { image: blob.image.type || 'image/jpeg', thumb: blob.thumb.type || 'image/jpeg' },
    };
    files[entry.files.image] = await bytes(blob.image);
    files[entry.files.thumb] = await bytes(blob.thumb);
    if (blob.vector) {
      entry.files.vector = `images/${blob.id}/plan.pdf`;
      entry.types.vector = blob.vector.type || 'application/pdf';
      files[entry.files.vector] = await bytes(blob.vector);
    }
    blobs.push(entry);
  }
  const name = String(project.fields['projet'] ?? '').trim();
  const manifest: Manifest = {
    format: FORMAT, version: VERSION, kind: 'project', exportedAt: new Date().toISOString(),
    reference: project.reference, name, visits: visits.length, photos: photos.filter((p) => p.removedInRevision === undefined).length,
  };
  const data: ProjectData = { project, visits, answers, photos, blobs };
  return { bytes: zip(manifest, data, files), fileName: `${safeName(`${project.reference} ${name}`)}.diag.zip` };
}

export async function exportSettings(repo: DiagRepository): Promise<BackupFile> {
  const files: Zippable = {};
  const assets: SettingsData['assets'] = [];
  for (const key of ASSET_KEYS) {
    const asset = await repo.getAsset(key);
    if (!asset) continue;
    const { blob, size: _size, updatedAt: _updatedAt, ...meta } = asset;
    const file = `reglages/${key}.${ext(blob.type)}`;
    files[file] = await bytes(blob);
    assets.push({ key, meta, file, type: blob.type });
  }
  const manifest: Manifest = { format: FORMAT, version: VERSION, kind: 'settings', exportedAt: new Date().toISOString() };
  const data: SettingsData = { firm: await repo.getFirm(), assets };
  return { bytes: zip(manifest, data, files), fileName: 'Réglages Diag bâti.diag.zip' };
}

function open(archive: Uint8Array): { manifest: Manifest; files: Unzipped } {
  let files: Unzipped;
  let manifest: Manifest;
  try {
    files = unzipSync(archive);
    manifest = JSON.parse(strFromU8(files['manifest.json']));
  } catch {
    throw new Error("Ce fichier n'est pas une sauvegarde Diag bâti (.diag.zip).");
  }
  if (manifest?.format !== FORMAT) throw new Error("Ce fichier n'est pas une sauvegarde Diag bâti (.diag.zip).");
  if (manifest.version > VERSION) throw new Error('Cette sauvegarde vient d’une version plus récente de l’app : mettez l’app à jour.');
  return { manifest, files };
}

export function inspectBackup(archive: Uint8Array): BackupSummary {
  const { manifest } = open(archive);
  const { kind, exportedAt, reference, name, visits, photos } = manifest;
  return { kind, exportedAt, reference, name, visits, photos };
}

/**
 * Restaure une sauvegarde. Pour un dossier déjà présent : `replace` l'écrase, `copy` l'importe
 * sous de nouveaux identifiants ; sans choix, une BackupConflictError est levée.
 */
export async function importBackup(
  repo: DiagRepository, archive: Uint8Array, mode?: 'replace' | 'copy',
): Promise<{ kind: 'project' | 'settings'; projectId: string }> {
  const { manifest, files } = open(archive);
  const read = (path: string, type: string) => {
    const content = files[path];
    if (!content) throw new Error(`Sauvegarde incomplète : ${path} manquant.`);
    return new Blob([content.slice().buffer as ArrayBuffer], { type });
  };
  const data = JSON.parse(strFromU8(files['data.json']));

  if (manifest.kind === 'settings') {
    const settings = data as SettingsData;
    if (settings.firm) await repo.setFirm(settings.firm);
    for (const a of settings.assets) await repo.setAsset(a.key, read(a.file, a.type), a.meta);
    return { kind: 'settings', projectId: '' };
  }

  const d = data as ProjectData;
  const exists = await repo.getProject(d.project.id);
  if (exists && !mode) throw new BackupConflictError(d.project.reference);

  // identifiants : conservés, ou renouvelés pour une copie
  const copy = !!exists && mode === 'copy';
  const ids = new Map<string, string>();
  const id = (old: string) => {
    if (!copy) return old;
    if (!ids.has(old)) ids.set(old, crypto.randomUUID());
    return ids.get(old)!;
  };
  const project: Project = { ...d.project, id: id(d.project.id), reference: copy ? `${d.project.reference} (copie)` : d.project.reference };
  const visits = d.visits.map((v) => ({ ...v, id: id(v.id), projectId: project.id }));
  const answers = d.answers.map((a) => ({ ...a, visitId: id(a.visitId) }));
  const photos = d.photos.map((p) => ({ ...p, id: id(p.id), projectId: project.id, blobId: id(p.blobId) }));
  // binaires convertis hors transaction (navigation privée : ArrayBuffer)
  const blobs: StoredBlob[] = [];
  for (const b of d.blobs) {
    const stored = {
      id: id(b.id), width: b.width, height: b.height, byteSize: b.byteSize,
      image: await repo.toStorable(read(b.files.image, b.types.image)),
      thumb: await repo.toStorable(read(b.files.thumb, b.types.thumb)),
      ...(b.files.vector ? { vector: await repo.toStorable(read(b.files.vector, b.types.vector ?? 'application/pdf')) } : {}),
    };
    blobs.push(stored as StoredBlob);
  }

  if (exists && mode === 'replace') await repo.deleteProject(project.id);
  const { db } = repo;
  await db.transaction('rw', [db.projects, db.visits, db.answers, db.photos, db.blobs], async () => {
    await db.projects.add(project);
    await db.visits.bulkAdd(visits);
    await db.answers.bulkAdd(answers);
    await db.blobs.bulkPut(blobs);
    await db.photos.bulkAdd(photos);
  });
  return { kind: 'project', projectId: project.id };
}
