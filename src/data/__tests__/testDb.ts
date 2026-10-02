import { db } from '../db';

/** Empties every table of the shared test database (fake-indexeddb). */
export async function resetDb(): Promise<void> {
  await db.open();
  await db.transaction('rw', db.tables, () => Promise.all(db.tables.map((table) => table.clear())));
}

/** Everything stored, as text (byte arrays decoded), to search for plaintext. */
export async function rawDump(): Promise<string> {
  const parts: string[] = [];
  for (const table of db.tables) {
    for (const row of await table.toArray()) {
      parts.push(
        JSON.stringify(row, (_key, value: unknown) =>
          value instanceof Uint8Array ? new TextDecoder('latin1').decode(value) : value,
        ),
      );
    }
  }
  return parts.join('\n');
}
