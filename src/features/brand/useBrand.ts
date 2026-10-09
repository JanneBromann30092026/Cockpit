import { useMemo } from 'react';
import { currentBrand } from '@/data/repositories';
import type { BrandProfile } from '@/data/schemas';
import { useDataStore } from '@/data/store';

/** The decrypted brand profile (undefined while locked or before the interview). */
export function useBrand(): BrandProfile | undefined {
  const brand = useDataStore((state) => state.brand);
  return useMemo(() => currentBrand(brand), [brand]);
}
