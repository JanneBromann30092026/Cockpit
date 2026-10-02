/** Pure helpers for free-text tags (chip inputs): parsing and merging without duplicates. */

export const TAG_MAX_LENGTH = 40;

/**
 * Parses tag input like "Seminar, #Altersvorsorge; Azubis" into clean tags: split at comma,
 * semicolon or line break, leading "#" removed, inner whitespace collapsed, case-insensitive
 * duplicates dropped (first spelling wins), overly long tags cut.
 */
export function parseTags(input: string): string[] {
  return mergeTags([], input.split(/[,;\n]/));
}

/** Adds new tags to existing ones with the same cleanup rules as parseTags. */
export function mergeTags(existing: readonly string[], additions: readonly string[]): string[] {
  const result = [...existing];
  const seen = new Set(existing.map((tag) => tag.toLocaleLowerCase('de-DE')));
  for (const raw of additions) {
    const tag = raw
      .trim()
      .replace(/^#+/, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, TAG_MAX_LENGTH)
      .trim();
    const key = tag.toLocaleLowerCase('de-DE');
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    result.push(tag);
  }
  return result;
}
