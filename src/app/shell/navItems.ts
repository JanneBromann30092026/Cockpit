import {
  BookOpen,
  FileText,
  ListChecks,
  NotebookPen,
  Settings,
  Sparkles,
  Sun,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { de } from '@/i18n/de';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

/** Main sections in navigation order; hardware keys 1–7 open them (see Shell). */
export const MAIN_NAV_ITEMS: readonly NavItem[] = [
  { to: '/today', label: de.nav.today, icon: Sun },
  { to: '/tasks', label: de.nav.tasks, icon: ListChecks },
  { to: '/documents', label: de.nav.documents, icon: FileText },
  { to: '/reviews', label: de.nav.reviews, icon: NotebookPen },
  { to: '/library', label: de.nav.library, icon: BookOpen },
  { to: '/brand', label: de.nav.brand, icon: Sparkles },
  { to: '/settings', label: de.nav.settings, icon: Settings },
];

export function navItems(devMode: boolean): NavItem[] {
  const items = [...MAIN_NAV_ITEMS];
  if (devMode) items.push({ to: '/dev/ui', label: de.nav.dev, icon: Wrench });
  return items;
}
