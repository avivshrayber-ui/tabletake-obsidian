import type { Align, Options, Placement } from './model';

export function isNumeric(text: string): boolean {
  let value = text.trim().replace(/[\s\u00a0]/g, '');
  if (/^\(.*\)$/.test(value)) value = '-' + value.slice(1, -1);
  value = value.replace(/^([+-]?)[\p{Sc}]/u, '$1').replace(/[\p{Sc}%]$/u, '');
  return /^[+-]?(?:\d+(?:[.,]\d+)?|[.,]\d+)(?:e[+-]?\d+)?$/i.test(value)
    || /^[+-]?\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(value)
    || /^[+-]?\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(value);
}
export function columnAlignments(matrix: (Placement | null)[][], opts: Options): Align[] {
  const body = opts.headerRow === 'none' ? matrix : matrix.slice(1);
  return Array.from({ length: matrix[0]?.length ?? 0 }, (_, col) => {
    const sources = body.map(row => row[col]).filter((p): p is Placement => p !== null && p !== undefined);
    if (opts.keepAlign) {
      const counts: Record<Exclude<Align, null>, number> = { left: 0, center: 0, right: 0 };
      for (const p of sources) if (p.cell.align) counts[p.cell.align]++;
      const ordered: Exclude<Align, null>[] = ['left', 'center', 'right'];
      ordered.sort((a, b) => counts[b] - counts[a]);
      if (counts[ordered[0]] > 0 && counts[ordered[0]] > counts[ordered[1]]) return ordered[0];
    }
    const nonempty = sources.filter(p => p.cell.text.trim());
    return opts.autoNumberAlign && nonempty.length > 0 && nonempty.filter(p => isNumeric(p.cell.text)).length / nonempty.length >= 0.8 ? 'right' : null;
  });
}

function codePointWidth(code: number): number {
  if (code < 32 || (code >= 0x7f && code < 0xa0) || code === 0x200d || code === 0xfe0f || code === 0xfe0e) return 0;
  return code >= 0x1100 && (
    code <= 0x115f || code === 0x2329 || code === 0x232a ||
    (code >= 0x2e80 && code <= 0xa4cf && code !== 0x303f) ||
    (code >= 0xac00 && code <= 0xd7a3) || (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe10 && code <= 0xfe19) || (code >= 0xfe30 && code <= 0xfe6f) ||
    (code >= 0xff01 && code <= 0xff60) || (code >= 0xffe0 && code <= 0xffe6) ||
    (code >= 0x1f000 && code <= 0x1faff) || (code >= 0x20000 && code <= 0x3fffd)
  ) ? 2 : 1;
}
/** Small grapheme scanner: combining marks, emoji modifiers, flags, and ZWJ sequences. */
export function displayWidth(text: string): number {
  let width = 0, previousWidth = 0, join = false, regional = false;
  for (const char of text) {
    const code = char.codePointAt(0)!;
    if (code === 0x200d) { join = true; continue; }
    if (code === 0xfe0f || code === 0x20e3) {
      if (previousWidth === 1) { width++; previousWidth = 2; }
      continue;
    }
    if (/\p{Mark}/u.test(char) || (code >= 0x1f3fb && code <= 0x1f3ff)) continue;
    const current = /\p{Emoji_Presentation}/u.test(char) ? 2 : codePointWidth(code);
    if (join) { width += Math.max(0, current - previousWidth); previousWidth = Math.max(current, previousWidth); join = false; }
    else if (code >= 0x1f1e6 && code <= 0x1f1ff && regional) { regional = false; }
    else { width += current; previousWidth = current; regional = code >= 0x1f1e6 && code <= 0x1f1ff; }
  }
  return width;
}
