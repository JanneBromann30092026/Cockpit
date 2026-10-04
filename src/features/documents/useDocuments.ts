import { useMemo } from 'react';
import {
  Car,
  FileText,
  House,
  Landmark,
  Repeat,
  ShieldCheck,
  Smartphone,
  Wifi,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import type { DeadlineKind } from '@/core/documents/contracts';
import type { DocumentCategory } from '@/data/domain';
import type { DocumentRecord } from '@/data/schemas';
import { useDataStore } from '@/data/store';
import { de } from '@/i18n/de';

const t = de.documents;

/** All decrypted contracts (empty while locked), by name. */
export function useDocuments(): DocumentRecord[] {
  const documents = useDataStore((state) => state.documents);
  return useMemo(
    () => Object.values(documents).sort((a, b) => a.name.localeCompare(b.name, 'de')),
    [documents],
  );
}

export const CATEGORY_ICONS: Record<DocumentCategory, LucideIcon> = {
  housing: House,
  insurance: ShieldCheck,
  mobile: Smartphone,
  internet: Wifi,
  energy: Zap,
  subscription: Repeat,
  mobility: Car,
  finance: Landmark,
  other: FileText,
};

/** "heute", "morgen", "in 5 Tagen". */
export function whenLabel(days: number): string {
  if (days === 0) return t.when.today;
  if (days === 1) return t.when.tomorrow;
  return t.when.inDays(days);
}

/** Cancelling needs attention, the term end a look, payments are information. */
export const DEADLINE_TONES: Record<DeadlineKind, 'warning' | 'signal' | 'neutral'> = {
  cancel: 'warning',
  termEnd: 'signal',
  payment: 'neutral',
};
