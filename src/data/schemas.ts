import { z } from 'zod';

export const LIMITS = {
  settingKey: 100,
} as const;

const requiredText = (max: number) => z.string().trim().min(1).max(max);

// --- Settings -------------------------------------------------------------

export const settingKeySchema = requiredText(LIMITS.settingKey);
