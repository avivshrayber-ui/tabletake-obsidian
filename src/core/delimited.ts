import { cell, type Grid } from './model';
/** RFC 4180 quoting, also used by spreadsheet TSV (including quoted newlines). */
function tokenize(text: string, delimiter: string): string[][] | null {
  const rows: string[][] = [];
  let row: string[] = [], field = '', quoted = false, closed = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else { quoted = false; closed = true; }
      } else field += ch;
    } else if (ch === delimiter || ch === '\n') {
      row.push(field); field = ''; closed = false;
      if (ch === '\n') { rows.push(row); row = []; }
    } else if (ch === '"' && field === '' && !closed) quoted = true;
    else if (closed) { if (!/[ \t]/.test(ch)) return null; }
    else field += ch;
  }
  if (quoted) return null;
  if (field !== '' || row.length > 0 || closed) { row.push(field); rows.push(row); }
  return rows;
}
export function parseDelimited(text: string, delimiter?: '\t' | ',' | ';'): Grid | null {
  text = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  if (!text.trim()) return null;
  for (const candidate of delimiter ? [delimiter] : ['\t', ',', ';']) {
    const rows = tokenize(text, candidate);
    if (!rows?.length) continue;
    const table = candidate === '\t' ? rows.some(row => row.length >= 2)
      : rows.length >= 2 && rows[0].length >= 2 && rows.every(row => row.length === rows[0].length);
    if (table) return { rows: rows.map(row => row.map(value => cell(value))) };
  }
  return null;
}
