import type { ReactNode } from 'react';
import { BottomSheet, SidePanel } from '@/components/ui';
import { useMediaQuery, WIDE_LAYOUT_QUERY } from '../hooks/useMediaQuery';

export interface EditPanelProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
}

/** Editing beside the content from 900 px (side panel), below as a bottom sheet. */
export function EditPanel(props: EditPanelProps) {
  const wide = useMediaQuery(WIDE_LAYOUT_QUERY);
  return wide ? <SidePanel {...props} /> : <BottomSheet {...props} />;
}
