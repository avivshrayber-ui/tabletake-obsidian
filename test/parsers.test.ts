import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { expand, parseClipboard, parseDelimited, parseHtmlTable } from '../src/core/index';
const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
const texts = (html: string) => parseHtmlTable(html)?.rows.map(row => row.map(c => c.text));

describe('clipboard HTML', () => {
  it('reads Excel Windows styles, fragment wrappers, dates and a merged heading', () => {
    const grid = parseHtmlTable(fixture('excel-windows.html'))!;
    expect(grid.rows).toHaveLength(3);
    expect(grid.rows[0][0]).toMatchObject({ text: 'Quarterly report', colSpan: 2, align: 'center', header: true });
    expect(grid.rows[1][1]).toMatchObject({ rawNumber: 45123, numberFormat: 'Short Date', bold: true, align: 'right' });
    expect(grid.rows[1][2]).toMatchObject({ text: '1,234.50', rawNumber: 1234.5, align: 'right' });
  });
  it('reads Excel Mac styles and inline spans', () => {
    const grid = parseHtmlTable(fixture('excel-mac.html'))!;
    expect(grid.rows[1][0].bold).toBe(true);
    expect(grid.rows[1][1]).toMatchObject({ rawNumber: 45123, align: 'right' });
  });
  it('reads Google Sheets numeric values and format JSON', () => {
    const grid = parseHtmlTable(fixture('google-sheets.html'))!;
    expect(grid.rows[0][0].colSpan).toBe(2);
    expect(grid.rows[1][1]).toMatchObject({ rawNumber: 45123, numberFormat: 'yyyy-mm-dd' });
    expect(grid.rows[2][1].rawNumber).toBe(45124.5);
  });
  it('reads LibreOffice font tags, paragraphs and column fallback', () => {
    const grid = parseHtmlTable(fixture('libreoffice.html'))!;
    expect(grid.rows[1][0]).toMatchObject({ text: 'Crème brûlée', bold: true });
    expect(grid.rows[2][0]).toMatchObject({ text: 'First paragraph\nSecond paragraph', italic: true });
    expect(grid.rows[2][1].align).toBe('right');
  });
  it('reads web thead/tbody/tfoot, footnotes, links and rowspans', () => {
    const grid = parseHtmlTable(fixture('wikipedia.html'))!;
    expect(grid.rows).toHaveLength(4);
    expect(grid.rows[1][0]).toMatchObject({ rowSpan: 2, header: true });
    expect(grid.rows[1][1]).toMatchObject({ text: 'Paris[1]', href: 'https://en.wikipedia.org/wiki/Paris' });
    expect(expand(grid)[2].map(c => c.text)).toEqual(['Europe', 'Rome', '2,746,984']);
  });
  it('reads Apple Numbers classes and div line breaks', () => {
    const grid = parseHtmlTable(fixture('apple-numbers.html'))!;
    expect(grid.rows[1][0]).toMatchObject({ italic: true, align: 'center' });
    expect(grid.rows[1][1].text).toBe('Line one\nLine two © 2025');
  });
  it('returns only the first table', () => expect(texts('<table><tr><td>one</td></tr></table><table><tr><td>two</td></tr></table>')).toEqual([['one']]));
  it('flattens nested tables into their outer cell', () => expect(texts('<table><tr><td>A<table><tr><td>B</td><td>C</td></tr></table>D</td><td>E</td></tr></table>')).toEqual([['A\nB\nC\nD', 'E']]));
  it('tolerates missing cell/row/table closing tags', () => expect(texts('<TABLE><TR><TD>one<TD>two<TR><TD>three<TD>four')).toEqual([['one', 'two'], ['three', 'four']]));
  it('ignores comments, scripts and styles', () => expect(texts('<table><tr><td>a<!-- hidden --><script>bad <table></script><style>.a{}</style>b</td></tr></table>')).toEqual([['ab']]));
  it('decodes common, decimal and hex entities and collapses whitespace', () => expect(texts('<table><tr><td>  A &amp; B&nbsp; &#169; &#x1F600; &eacute;  </td></tr></table>')).toEqual([['A & B © 😀 é']]));
  it('keeps unknown entities and handles invalid codepoints without throwing', () => expect(texts('<table><tr><td>&unknown; &#99999999;</td></tr></table>')).toEqual([['&unknown; �']]));
  it('keeps hard breaks', () => expect(texts('<table><tr><td>one<br>two<br/>three</td></tr></table>')).toEqual([['one\ntwo\nthree']]));
  it('uses inline > attribute > row > column alignment precedence', () => {
    const g = parseHtmlTable('<table><col span=4 align=left><tr align=right><td style="text-align:center" align=left>a</td><td align=left>b</td><td>c</td><td>d</td></tr></table>')!;
    expect(g.rows[0].map(c => c.align)).toEqual(['center', 'left', 'right', 'right']);
  });
  it('handles quoted > within attributes', () => expect(texts('<table><tr><td title="a > b">value</td></tr></table>')).toEqual([['value']]));
  it('retains bold, italic, and the first safe link', () => {
    const c = parseHtmlTable('<table><tr><td><strong>A</strong><em>B</em><a href="mailto:a@example.com">C</a><a href="https://example.com">D</a></td></tr></table>')!.rows[0][0];
    expect(c).toMatchObject({ text: 'ABCD', bold: true, italic: true, href: 'mailto:a@example.com' });
  });
  it.each(['javascript:alert(1)', 'data:text/html,evil', '//example.com', 'java&#x73;cript:alert(1)'])('rejects unsafe href %s', href => {
    expect(parseHtmlTable(`<table><tr><td><a href="${href}">link</a></td></tr></table>`)!.rows[0][0].href).toBeUndefined();
  });
  it('accepts Obsidian links', () => expect(parseHtmlTable('<table><tr><td><a href="obsidian://open?vault=Notes">note</a></td></tr></table>')!.rows[0][0].href).toBe('obsidian://open?vault=Notes'));
  it('ignores invalid vendor metadata', () => expect(parseHtmlTable('<table><tr><td x:num="NaN" data-sheets-value="broken">shown</td></tr></table>')!.rows[0][0].rawNumber).toBeUndefined());
  it.each(['', 'garbage', '<div>not a table</div>', '<table></table>'])('returns null for empty/non-table HTML %s', html => expect(parseHtmlTable(html)).toBeNull());
  it('prefers an HTML table to plaintext', () => expect(parseClipboard('<table><tr><td>HTML</td></tr></table>', 'a\tb')!.rows[0][0].text).toBe('HTML'));
  it('falls back to TSV if HTML contains no table', () => expect(parseClipboard('<p>content</p>', 'a\tb')!.rows[0].map(c => c.text)).toEqual(['a', 'b']));
  it('returns null for absent clipboard input', () => expect(parseClipboard(null, null)).toBeNull());
});
describe('delimited text', () => {
  it('reads quoted multiline TSV', () => expect(parseDelimited(fixture('multiline.tsv'))!.rows[1][1].text).toBe('first line\nsecond line'));
  it('reads CSV commas and doubled quotes', () => {
    const grid = parseDelimited(fixture('quoted.csv'))!;
    expect(grid.rows[1][1].text).toBe('hello, world');
    expect(grid.rows[2][1].text).toBe('He said "hi"');
  });
  it('auto-detects semicolon CSV', () => expect(parseDelimited(fixture('semicolon.csv'))!.rows[1].map(c => c.text)).toEqual(['Alice', 'Paris', '12,50']));
  it('supports explicit delimiters', () => expect(parseDelimited('a;b\nc;d', ';')!.rows).toHaveLength(2));
  it('allows one-row TSV', () => expect(parseDelimited('a\tb')!.rows).toHaveLength(1));
  it('keeps ragged TSV and empty fields', () => expect(parseDelimited('a\tb\tc\nx\t')!.rows[1].map(c => c.text)).toEqual(['x', '']));
  it('normalizes CRLF and strips BOM', () => expect(parseDelimited('\ufeffa\tb\r\nc\td\r\n')!.rows).toHaveLength(2));
  it('does not mistake a quoted tab for the delimiter', () => expect(parseDelimited('a,b\n"x\ty",z')!.rows[1][0].text).toBe('x\ty'));
  it.each(['', 'plain text', 'a,b', 'a,b\nc,d,e', 'a\nsecond', 'a,b\n"unterminated,c', 'a,b\n"x"junk,y'])('rejects non-table or broken input %j', input => expect(parseDelimited(input)).toBeNull());
});

describe('HTML source whitespace and styles', () => {
  it('collapses formatting whitespace without losing explicit breaks', () => expect(texts('<table><tr><td>one\n  two<br>three\n four</td></tr></table>')).toEqual([['one two\nthree four']]));
  it('decodes entities only once', () => expect(texts('<table><tr><td>&amp;lt; &amp;amp;</td></tr></table>')).toEqual([['&lt; &amp;']]));
  it('reads Excel style rules inside HTML and CSS comments', () => expect(parseHtmlTable('<style><!-- /* Excel */ .xl65 {text-align:right} --></style><table><tr><td class=xl65>2</td></tr></table>')!.rows[0][0].align).toBe('right'));
});
