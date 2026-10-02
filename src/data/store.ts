import { create } from 'zustand';
import type { DataTable } from './db';
import type { BrandProfile, DocumentRecord, LibraryEntry, Review, Task } from './schemas';

/** Decrypted record type per data table. */
export interface DataRecords {
  tasks: Task;
  documents: DocumentRecord;
  reviews: Review;
  library: LibraryEntry;
  brand: BrandProfile;
}

export type DataMaps = { [T in DataTable]: Record<string, DataRecords[T]> };

interface DataState extends DataMaps {
  /** All tables are decrypted and loaded (only while unlocked). */
  ready: boolean;
  /** Rows that could not be decrypted or validated while loading (damaged data). */
  unreadable: number;
}

const EMPTY: DataMaps = {
  tasks: {},
  documents: {},
  reviews: {},
  library: {},
  brand: {},
};

/**
 * Decrypted data of the unlocked session, in memory only. Repositories write encrypted
 * rows and update this store; locking clears it. Components read it through hooks.
 */
export const useDataStore = create<DataState>(() => ({ ...EMPTY, ready: false, unreadable: 0 }));

export const dataStore = {
  replaceAll(maps: DataMaps, unreadable: number): void {
    useDataStore.setState({ ...maps, ready: true, unreadable });
  },
  upsert<T extends DataTable>(table: T, records: readonly DataRecords[T][]): void {
    if (records.length === 0) return;
    useDataStore.setState((state) => {
      const next = { ...state[table] } as Record<string, DataRecords[T]>;
      for (const record of records) next[record.id] = record;
      return { [table]: next };
    });
  },
  remove(table: DataTable, ids: readonly string[]): void {
    if (ids.length === 0) return;
    useDataStore.setState((state) => {
      const next = { ...state[table] };
      for (const id of ids) delete next[id];
      return { [table]: next };
    });
  },
  /** Locking: drop every decrypted record. */
  clear(): void {
    useDataStore.setState({ ...EMPTY, ready: false, unreadable: 0 });
  },
  get<T extends DataTable>(table: T, id: string): DataRecords[T] | undefined {
    return (useDataStore.getState()[table] as Record<string, DataRecords[T]>)[id];
  },
};
