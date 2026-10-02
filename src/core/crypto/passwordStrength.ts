/** Rough password strength estimate for the setup form (a hint, not a security guarantee). */

export const MIN_PASSWORD_LENGTH = 8;

/** 0 = too short, 1 = weak, 2 = fair, 3 = good, 4 = strong. */
export type PasswordScore = 0 | 1 | 2 | 3 | 4;

const COMMON_PARTS = [
  'passwort',
  'password',
  'cockpit',
  'qwertz',
  'qwerty',
  'asdf',
  'hallo',
  'geheim',
  'sommer',
  'winter',
  '123456',
  '000000',
  'abcdef',
];

function poolSize(password: string): number {
  let pool = 0;
  if (/[a-zäöüß]/.test(password)) pool += 26;
  if (/[A-ZÄÖÜ]/.test(password)) pool += 26;
  if (/\d/.test(password)) pool += 10;
  if (/[^\p{L}\p{N}]/u.test(password)) pool += 33;
  // Characters beyond Latin (emoji, other scripts) enlarge the pool a lot.
  if (Array.from(password).some((char) => (char.codePointAt(0) ?? 0) > 0x24f)) pool += 100;
  return Math.max(pool, 1);
}

/** Number of characters after collapsing runs ("aaaa" → "a") and simple sequences. */
function effectiveLength(password: string): number {
  const chars = Array.from(password.toLowerCase());
  let length = 0;
  for (let i = 0; i < chars.length; i += 1) {
    const current = chars[i]?.codePointAt(0) ?? 0;
    const previous = i > 0 ? (chars[i - 1]?.codePointAt(0) ?? 0) : Number.NaN;
    // Repeated characters and +1/-1 sequences ("abcd", "4321") add little.
    length += current === previous || Math.abs(current - previous) === 1 ? 0.25 : 1;
  }
  return length;
}

/** Estimated entropy in bits with penalties for common words and patterns. */
export function estimateEntropyBits(password: string): number {
  const lower = password.toLowerCase();
  let bits = effectiveLength(password) * Math.log2(poolSize(password));
  for (const part of COMMON_PARTS) {
    if (lower.includes(part)) bits -= part.length * 3;
  }
  return Math.max(0, bits);
}

export function passwordScore(password: string): PasswordScore {
  if (Array.from(password).length < MIN_PASSWORD_LENGTH) return 0;
  const bits = estimateEntropyBits(password);
  if (bits < 36) return 1;
  if (bits < 56) return 2;
  if (bits < 76) return 3;
  return 4;
}
