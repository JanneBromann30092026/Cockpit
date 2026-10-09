import { useMemo } from 'react';
import { BookOpen, CirclePlay, Headphones, Mail, Newspaper, type LucideIcon } from 'lucide-react';
import { formatDate } from '@/core/format';
import { sortEntries } from '@/core/library/library';
import type { LibraryType } from '@/data/domain';
import type { LibraryEntry } from '@/data/schemas';
import { useDataStore } from '@/data/store';
import { de } from '@/i18n/de';

/** All decrypted library entries (empty while locked), newest first. */
export function useLibraryEntries(): LibraryEntry[] {
  const library = useDataStore((state) => state.library);
  return useMemo(() => sortEntries(Object.values(library)), [library]);
}

export const TYPE_ICONS: Record<LibraryType, LucideIcon> = {
  book: BookOpen,
  article: Newspaper,
  newsletter: Mail,
  video: CirclePlay,
  podcast: Headphones,
};

/** "Autor · Typ · Datum" – the source line of an entry. */
export function sourceLine(entry: LibraryEntry): string {
  return [
    entry.author,
    de.library.types[entry.type],
    entry.consumedAt ? formatDate(entry.consumedAt) : undefined,
  ]
    .filter(Boolean)
    .join(' · ');
}
