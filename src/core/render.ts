import { DEFAULT_OPTIONS, cell, gridHasSpans, place, span, type Cell, type Grid, type Options, type Placement } from './model';
import { columnAlignments, displayWidth } from './align';
import { convertDate, inferColumnOrders } from './dates';
import { safeHref } from './html';

function trimmed(matrix: (Placement | null)[][], enabled: boolean): (Placement | null)[][] {
  if (!enabled) return matrix;
  const rows = matrix.slice();
  const empty = (p: Placement | null) => !p?.cell.text.trim();
  while (rows.length && rows[rows.length - 1].every(empty)) rows.pop();
  let width = rows[0]?.length ?? 0;
  while (width && rows.every(row => empty(row[width - 1]))) width--;
  return width ? rows.map(row => row.slice(0, width)) : [];
}
function markdownText(text: string): string {
  return text.replace(/\r\n?/g, '\n').split('\n').map(line => line.trimEnd()).join('<br>')
    .replace(/\\/g, '\\\\').replace(/\|/g, '\\|');
}
function decorated(text: string, source: Cell, inline: boolean): string {
  if (!text || !inline) return text;
  if (source.bold) text = `**${text}**`;
  if (source.italic) text = `*${text}*`;
  const href = source.href && safeHref(source.href);
  if (href) text = `[${text}](${href.replace(/\\/g, '%5C').replace(/\(/g, '%28').replace(/\)/g, '%29').replace(/\|/g, '%7C')})`;
  return text;
}
function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function htmlTable(matrix: (Placement | null)[][], opts: Options, textFor: (p: Placement) => string): string {
  const width = matrix[0]?.length ?? 0;
  const renderRow = (row: (Placement | null)[], r: number, header: boolean) => {
    const cells = row.flatMap((p, col) => {
      if (p && p.origin !== 'self') return [];
      const tag = header || p?.cell.header ? 'th' : 'td';
      let attrs = '', text = p ? escapeHtml(textFor(p)).replace(/\r\n?/g, '\n').split('\n').map(line => line.trimEnd()).join('<br>') : '';
      if (p) {
        const colspan = Math.min(span(p.cell.colSpan), width - col), rowspan = Math.min(span(p.cell.rowSpan), matrix.length - r);
        if (colspan > 1) attrs += ` colspan="${colspan}"`;
        if (rowspan > 1) attrs += ` rowspan="${rowspan}"`;
        if (opts.keepAlign && p.cell.align) attrs += ` style="text-align: ${p.cell.align}"`;
        if (opts.inline && text) {
          if (p.cell.bold) text = `<strong>${text}</strong>`;
          if (p.cell.italic) text = `<em>${text}</em>`;
          const href = p.cell.href && safeHref(p.cell.href);
          if (href) text = `<a href="${escapeHtml(href)}">${text}</a>`;
        }
      }
      return [`<${tag}${attrs}>${text}</${tag}>`];
    });
    return `    <tr>${cells.join('')}</tr>`;
  };
  const header = opts.headerRow === 'none'
    ? renderRow(Array.from({ length: width }, () => null), -1, true)
    : renderRow(matrix[0], 0, true);
  const start = opts.headerRow === 'none' ? 0 : 1;
  const body = matrix.slice(start).map((row, i) => renderRow(row, i + start, false));
  return ['<table>', '  <thead>', header, '  </thead>', '  <tbody>', ...body, '  </tbody>', '</table>'].join('\n');
}
export function toMarkdown(grid: Grid, partial: Partial<Options> = {}): string {
  const opts = { ...DEFAULT_OPTIONS, ...partial };
  const matrix = trimmed(place(grid), opts.trimEmpty);
  if (!matrix.length || !matrix[0].length) return '';
  const orders = inferColumnOrders(matrix);
  const textFor = (p: Placement) => convertDate(p.cell, opts, orders[p.sourceCol]);
  if (opts.merge === 'html' && gridHasSpans(grid)) return htmlTable(matrix, opts, textFor);
  const aligns = columnAlignments(matrix, opts);
  const rows = matrix.map(row => row.map(p => {
    if (!p) return '';
    if (p.origin !== 'self') {
      if (opts.merge === 'sheets') return p.origin === 'left' ? '<' : '^';
      if (opts.merge !== 'repeat') return '';
    }
    return decorated(markdownText(textFor(p)), p.cell, opts.inline);
  }));
  if (opts.headerRow === 'none') rows.unshift(aligns.map(() => ''));
  const colons = aligns.map(align => align === 'center' ? 2 : align ? 1 : 0);
  const widths = aligns.map((_, c) => Math.max(3 + colons[c], ...rows.map(row => displayWidth(row[c]))));
  const separators = aligns.map((align, c) => {
    const dashes = '-'.repeat(opts.pad ? widths[c] - colons[c] : 3);
    return (align === 'left' || align === 'center' ? ':' : '') + dashes + (align === 'right' || align === 'center' ? ':' : '');
  });
  const format = (row: string[]) => '| ' + row.map((value, c) => value + (opts.pad ? ' '.repeat(Math.max(0, widths[c] - displayWidth(value))) : '')).join(' | ') + ' |';
  return [format(rows[0]), format(separators), ...rows.slice(1).map(format)].join('\n');
}
function splitMarkdownRow(line: string): string[] {
  line = line.trim();
  if (line.startsWith('|')) line = line.slice(1);
  if (/(?<!\\)(?:\\\\)*\|$/.test(line)) line = line.slice(0, -1);
  const result: string[] = [];
  let value = '';
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '\\' && i + 1 < line.length) { value += line[i] + line[++i]; }
    else if (line[i] === '|') { result.push(value.trim()); value = ''; }
    else value += line[i];
  }
  result.push(value.trim());
  return result;
}
function markdownCell(value: string): Cell {
  const result = cell();
  const link = value.match(/^\[([\s\S]*)\]\(([^\s]*)\)$/);
  if (link && safeHref(link[2])) { result.href = link[2]; value = link[1]; }
  if (value.startsWith('***') && value.endsWith('***') && value.length > 6) { result.bold = true; result.italic = true; value = value.slice(3, -3); }
  else {
    if (value.startsWith('**') && value.endsWith('**') && value.length > 4) { result.bold = true; value = value.slice(2, -2); }
    if (value.startsWith('*') && value.endsWith('*') && value.length > 2) { result.italic = true; value = value.slice(1, -1); }
  }
  result.text = value.replace(/<br\s*\/?\s*>/gi, '\n').replace(/\\([\\|])/g, '$1');
  return result;
}
export function parseMarkdownTable(md: string): Grid | null {
  const lines = md.trim().split(/\r?\n/);
  if (lines.length < 2 || !lines[0].includes('|')) return null;
  const header = splitMarkdownRow(lines[0]), separators = splitMarkdownRow(lines[1]);
  if (header.length !== separators.length || !separators.every(value => /^:?-+:?$/.test(value))) return null;
  const aligns = separators.map(value => value.startsWith(':') ? value.endsWith(':') ? 'center' : 'left' : value.endsWith(':') ? 'right' : null);
  const source = [header, ...lines.slice(2).filter(line => line.trim()).map(splitMarkdownRow)];
  return { rows: source.map((row, r) => row.map((value, c) => ({ ...markdownCell(value), align: aligns[c] ?? null, header: r === 0 }))) };
}
