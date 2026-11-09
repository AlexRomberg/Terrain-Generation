import { DBSchema, IDBPDatabase, openDB } from 'idb';
import { LayerImage } from '../models/layerImage';
import { PipelineConfig } from '../models/pipelineConfig';

export interface LibraryEntry {
  id: string;
  name: string;
  createdAt: number;
  config: PipelineConfig;
  thumbnail?: string;
}

export interface StoredResult {
  id: string;
  key: string;
  result: LayerImage;
}

interface LibrarySchema extends DBSchema {
  entries: { key: string; value: LibraryEntry };
  results: { key: string; value: StoredResult };
}

const DATABASE_NAME = 'terrain-simulator';
const DATABASE_VERSION = 1;

export class LibraryStore {
  private database?: Promise<IDBPDatabase<LibrarySchema>>;

  async list() {
    const database = await this.open();
    return database.getAll('entries');
  }

  async loadResult(id: string) {
    const database = await this.open();
    return database.get('results', id);
  }

  async save(entry: LibraryEntry, result?: StoredResult) {
    const database = await this.open();
    const transaction = database.transaction(['entries', 'results'], 'readwrite');
    const requests: Promise<unknown>[] = [transaction.objectStore('entries').put(entry)];
    if (result) {
      requests.push(transaction.objectStore('results').put(result));
    }
    await Promise.all([...requests, transaction.done]);
  }

  async delete(id: string) {
    const database = await this.open();
    const transaction = database.transaction(['entries', 'results'], 'readwrite');
    await Promise.all([
      transaction.objectStore('entries').delete(id),
      transaction.objectStore('results').delete(id),
      transaction.done,
    ]);
  }

  private open() {
    this.database ??= openDB<LibrarySchema>(DATABASE_NAME, DATABASE_VERSION, {
      upgrade(database) {
        database.createObjectStore('entries', { keyPath: 'id' });
        database.createObjectStore('results', { keyPath: 'id' });
      },
    });
    return this.database;
  }
}
