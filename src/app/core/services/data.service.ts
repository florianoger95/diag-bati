import { Injectable } from '@angular/core';
import { DiagDb } from '../db/diag-db';
import { DiagRepository } from '../db/diag-repository';

/** Instance unique de la base et du repository pour toute l'app. */
@Injectable({ providedIn: 'root' })
export class DataService {
  readonly db = new DiagDb();
  readonly repo = new DiagRepository(this.db);

  async getSetting<T>(key: string): Promise<T | undefined> {
    return (await this.db.settings.get(key))?.value as T | undefined;
  }

  async setSetting(key: string, value: unknown): Promise<void> {
    await this.db.settings.put({ key, value });
  }
}
