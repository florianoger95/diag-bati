import Dexie, { Table } from 'dexie';
import { Answer, Photo, Project, Setting, StoredBlob, Visit } from '../model/data';

export const DB_NAME = 'diag-bati';

/** Base IndexedDB de l'app. Toute migration passe par une nouvelle db.version(n). */
export class DiagDb extends Dexie {
  projects!: Table<Project, string>;
  visits!: Table<Visit, string>;
  answers!: Table<Answer, [string, string, string]>;
  photos!: Table<Photo, string>;
  blobs!: Table<StoredBlob, string>;
  settings!: Table<Setting, string>;

  constructor(name = DB_NAME) {
    super(name);
    this.version(1).stores({
      projects: 'id, reference, updatedAt',
      visits: 'id, projectId, [projectId+revision], status',
      answers: '[visitId+instanceId+itemId], visitId, [visitId+instanceId]',
      photos: 'id, projectId, blobId, [projectId+number]',
      blobs: 'id',
      settings: 'key',
    });
  }
}
