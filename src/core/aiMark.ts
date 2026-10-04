/** Marks text that Claude phrased (CLAUDE.md: "von der KI formulierte … mit „(Claude)“"). */
export const AI_MARK = '(Claude)';

export function withAiMark(text: string): string {
  return text.endsWith(AI_MARK) ? text : `${text} ${AI_MARK}`;
}

export function withoutAiMark(text: string): string {
  return text.endsWith(AI_MARK) ? text.slice(0, -AI_MARK.length).trimEnd() : text;
}
