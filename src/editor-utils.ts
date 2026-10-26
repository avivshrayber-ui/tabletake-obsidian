export interface Position { line: number; ch: number }
export function tableRange(lines: readonly string[], cursorLine: number): { from: Position; to: Position } | null {
  if (!lines[cursorLine]?.startsWith('|')) return null;
  let start = cursorLine, end = cursorLine;
  while (start > 0 && lines[start - 1].startsWith('|')) start--;
  while (end + 1 < lines.length && lines[end + 1].startsWith('|')) end++;
  return { from: { line: start, ch: 0 }, to: { line: end, ch: lines[end].length } };
}

/** Supply only the missing newlines, preserving text on either side of the selection. */
export function padTable(markdown: string, before: string, after: string): string {
  const trailing = before.match(/\n*$/)?.[0].length ?? 0;
  const leading = after.match(/^\n*/)?.[0].length ?? 0;
  return (before ? '\n'.repeat(Math.max(0, 2 - trailing)) : '') + markdown.trim() +
    (after ? '\n'.repeat(Math.max(0, 2 - leading)) : '');
}
