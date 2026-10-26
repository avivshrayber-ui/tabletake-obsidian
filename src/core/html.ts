import { cell, span, type Align, type Cell, type Grid } from './model';

const entities: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ensp: ' ', emsp: ' ',
  ndash: '–', mdash: '—', hellip: '…', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”',
  copy: '©', reg: '®', trade: '™', euro: '€', pound: '£', yen: '¥', cent: '¢',
  bull: '•', middot: '·', times: '×', divide: '÷', plusmn: '±', deg: '°', micro: 'µ',
  laquo: '«', raquo: '»', eacute: 'é', Eacute: 'É', egrave: 'è', agrave: 'à',
  aacute: 'á', oacute: 'ó', uacute: 'ú', iacute: 'í', ntilde: 'ñ', ccedil: 'ç',
  auml: 'ä', ouml: 'ö', uuml: 'ü', Auml: 'Ä', Ouml: 'Ö', Uuml: 'Ü', szlig: 'ß',
};
export function decodeEntities(text: string): string {
  return text.replace(/&(#x[\da-f]+|#\d+|[a-z][a-z\d]+);/gi, (original, name: string) => {
    if (name[0] !== '#') return entities[name] ?? original;
    const code = name[1].toLowerCase() === 'x' ? parseInt(name.slice(2), 16) : Number(name.slice(1));
    return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff)
      ? String.fromCodePoint(code) : '�';
  });
}
export function safeHref(value: string): string | undefined {
  const href = value.trim();
  return /^(?:https?:\/\/|mailto:|obsidian:\/\/)/i.test(href) && !/[\u0000-\u0020\u007f]/.test(href) ? href : undefined;
}
function attributes(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const source = tag.replace(/^<\/?[\w:-]+/, '').replace(/\/?\s*>$/, '');
  const pattern = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  for (const match of source.matchAll(pattern)) attrs[match[1].toLowerCase()] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? '');
  return attrs;
}
function declarations(source: string): Record<string, string> {
  const style: Record<string, string> = {};
  for (const part of source.match(/(?:[^;"']|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')+/g) ?? []) {
    const colon = part.indexOf(':');
    if (colon < 0) continue;
    style[part.slice(0, colon).trim().toLowerCase()] = part.slice(colon + 1).trim()
      .replace(/\s*!important\s*$/i, '').replace(/\\([\da-f]{1,6})\s?/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
      .replace(/\\(["'\\])/g, '$1');
  }
  return style;
}
function alignment(value?: string): Align {
  const normalized = value?.toLowerCase();
  return normalized === 'left' || normalized === 'center' || normalized === 'right' ? normalized : null;
}
function numeric(value: string | undefined): number | undefined {
  if (value === undefined || !value.trim()) return undefined;
  const result = Number(value);
  return Number.isFinite(result) ? result : undefined;
}

export function parseHtmlTable(html: string): Grid | null {
  const classes = new Map<string, Record<string, string>>();
  for (const block of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi)) {
    const css = block[1].replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--|-->/g, '');
    for (const rule of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      for (const selector of rule[1].split(',')) {
        const name = selector.trim().match(/^(?:[a-z][\w-]*)?\.([\w-]+)$/i)?.[1];
        if (name) classes.set(name, { ...classes.get(name), ...declarations(rule[2]) });
      }
    }
  }
  const styled = (attrs: Record<string, string>): Record<string, string> => Object.assign({},
    ...(attrs.class ?? '').split(/\s+/).map(name => classes.get(name) ?? {}), declarations(attrs.style ?? ''));
  html = html.replace(/<!--([\s\S]*?)-->/g, '').replace(/<(style|script)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)/gi, '');
  const tokens = html.match(/<(?:"[^"]*"|'[^']*'|[^'">])*>|[^<]+|</g) ?? [];
  const rows: Cell[][] = [];
  const columns: Record<string, string>[] = [];
  let depth = 0, found = false, row: Cell[] | null = null, current: Cell | null = null;
  let content = '', rowStyle: Record<string, string> = {}, column = 0, rowIndex = 0;
  const occupied: number[] = [];
  const finishCell = () => {
    if (!current) return;
    current.text = content.replace(/\r\n?/g, '\n').replace(/[^\S\n]+/g, ' ')
      .split('\n').map(line => line.trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim();
    (row ??= []).push(current);
    current = null; content = '';
  };
  const finishRow = () => {
    finishCell();
    if (row) { rows.push(row); rowIndex++; }
    row = null; column = 0; rowStyle = {};
  };
  const lineBreak = () => { if (current && content && !content.endsWith('\n')) content += '\n'; };
  for (const token of tokens) {
    if (!token.startsWith('<') || token === '<') { if (current) content += decodeEntities(token).replace(/\s+/g, ' '); continue; }
    const match = token.match(/^<\s*(\/?)\s*([\w:-]+)/);
    if (!match) continue;
    const closing = !!match[1], name = match[2].toLowerCase();
    if (name === 'table') {
      if (!closing) { depth++; found = true; if (depth > 1) lineBreak(); }
      else if (depth > 0) {
        depth--;
        if (depth === 0) { finishRow(); break; }
        lineBreak();
      }
      continue;
    }
    if (!found || depth === 0) continue;
    if (depth > 1) {
      if (['tr', 'td', 'th', 'br', 'p', 'div'].includes(name)) lineBreak();
      // Inline text inside nested tables still goes into the enclosing cell.
      continue;
    }
    if (name === 'tr') {
      if (closing) finishRow();
      else { finishRow(); row = []; const attrs = attributes(token); rowStyle = styled(attrs); rowStyle['text-align'] ??= attrs.align; }
      continue;
    }
    if (name === 'td' || name === 'th') {
      finishCell();
      if (closing) continue;
      const attrs = attributes(token), style = styled(attrs);
      while ((occupied[column] ?? 0) > rowIndex) column++;
      current = cell(); current.header = name === 'th';
      current.colSpan = span(Number(attrs.colspan ?? 1)); current.rowSpan = span(Number(attrs.rowspan ?? 1));
      const colStyle = columns[column] ?? {};
      current.align = alignment(style['text-align']) ?? alignment(attrs.align) ?? alignment(rowStyle['text-align']) ?? alignment(colStyle['text-align']);
      const inherited = { ...colStyle, ...rowStyle, ...style };
      if (/^(bold|[7-9]00)$/i.test(inherited['font-weight'] ?? '')) current.bold = true;
      if (/^(italic|oblique)$/i.test(inherited['font-style'] ?? '')) current.italic = true;
      const format = inherited['mso-number-format'];
      if (format) current.numberFormat = format.replace(/^["']|["']$/g, '');
      const raw = numeric(attrs['x:num']);
      if (raw !== undefined) current.rawNumber = raw;
      try {
        const value: unknown = JSON.parse(attrs['data-sheets-value'] ?? 'null');
        if (value && typeof value === 'object' && '1' in value && value['1'] === 3 && '3' in value) {
          const number = numeric(String(value['3']));
          if (number !== undefined) current.rawNumber = number;
        }
        const nf: unknown = JSON.parse(attrs['data-sheets-numberformat'] ?? 'null');
        if (nf && typeof nf === 'object') {
          const record = nf as Record<string, unknown>;
          if (typeof record['2'] === 'string') current.numberFormat = record['2'];
          else if (typeof record['1'] === 'string') current.numberFormat = record['1'];
        }
      } catch { /* Broken vendor metadata must not discard the displayed cell. */ }
      for (let i = 0; i < current.colSpan; i++) occupied[column + i] = rowIndex + current.rowSpan;
      column += current.colSpan;
      continue;
    }
    if (name === 'col' && !closing) {
      const attrs = attributes(token), style = styled(attrs);
      style['text-align'] ??= attrs.align;
      for (let i = 0; i < span(Number(attrs.span ?? 1)); i++) columns.push(style);
      continue;
    }
    if (!current) continue;
    if (name === 'br') content += '\n';
    else if (name === 'p' || name === 'div') lineBreak();
    if (!closing) {
      const attrs = attributes(token), style = styled(attrs);
      if (name === 'b' || name === 'strong' || /^(bold|[7-9]00)$/i.test(style['font-weight'] ?? '')) current.bold = true;
      if (name === 'i' || name === 'em' || /^(italic|oblique)$/i.test(style['font-style'] ?? '')) current.italic = true;
      if (name === 'a' && !current.href && attrs.href) current.href = safeHref(attrs.href);
    }
  }
  finishRow();
  return rows.some(r => r.length > 0) ? { rows } : null;
}
