import { describe, expect, it } from 'vitest';
import { DEFAULT_OPTIONS, FREE_OPTIONS, applyTier, expand, gridHasSpans, parseHtmlTable, parseMarkdownTable, toMarkdown, type Cell, type Grid, type Options } from '../src/core/index';
import { cell } from '../src/core/model';
import { displayWidth } from '../src/core/align';
const grid = (values: string[][]): Grid => ({ rows: values.map(row => row.map(value => cell(value))) });
const simple: Partial<Options> = { pad: false, autoNumberAlign: false };
const merged = (): Grid => ({ rows: [
  [cell('A'), cell('B'), cell('C')],
  [{ ...cell('group'), colSpan: 2, rowSpan: 2 }, cell('one')],
  [cell('two')],
] });

describe('span expansion', () => {
  it('resolves rectangular merges, with vertical origin taking precedence', () => {
    const matrix = expand(merged());
    expect(matrix.map(row => row.map(c => c.text))).toEqual([['A','B','C'], ['group','group','one'], ['group','group','two']]);
    expect(matrix.map(row => row.map(c => c.origin))).toEqual([['self','self','self'], ['self','left','self'], ['up','up','self']]);
  });
  it('pads ragged rows', () => expect(expand(grid([['a','b'], ['c']]))[1][1]).toEqual({ text: '', align: null, origin: 'self', header: false }));
  it('extends past source rows for rowspans', () => expect(expand({ rows: [[{ ...cell('x'), rowSpan: 3 }]] })).toHaveLength(3));
  it('does not overwrite a preceding rowspan with a colspan', () => {
    const source: Grid = { rows: [[cell('a'), { ...cell('b'), rowSpan: 2 }], [{ ...cell('c'), colSpan: 2 }]] };
    expect(expand(source)[1].map(c => c.text)).toEqual(['', 'b', 'c', 'c']);
  });
  it('normalizes invalid spans', () => expect(expand({ rows: [[{ ...cell('x'), rowSpan: -2, colSpan: NaN }]] })).toHaveLength(1));
  it('detects spans', () => { expect(gridHasSpans(merged())).toBe(true); expect(gridHasSpans(grid([['a']]))).toBe(false); });
});
describe('rendering', () => {
  it('renders blank merges', () => expect(toMarkdown(merged(), simple)).toBe('| A | B | C |\n| --- | --- | --- |\n| group |  | one |\n|  |  | two |'));
  it('renders repeated merges', () => expect(toMarkdown(merged(), { ...simple, merge: 'repeat' })).toContain('| group | group | two |'));
  it('renders Sheets Extended markers', () => expect(toMarkdown(merged(), { ...simple, merge: 'sheets' })).toContain('| group | < | one |\n| ^ | ^ | two |'));
  it('renders clean HTML with span attributes and thead', () => {
    const result = toMarkdown(merged(), { merge: 'html' });
    expect(result).toContain('<thead>'); expect(result).toContain('<td colspan="2" rowspan="2">group</td>');
    expect(result).toContain('<tr><td>two</td></tr>'); expect(result).not.toContain('class=');
    expect(expand(parseHtmlTable(result)!).map(row => row.map(c => c.text))).toEqual(expand(merged()).map(row => row.map(c => c.text)));
  });
  it('uses Markdown for html mode without spans', () => expect(toMarkdown(grid([['a','b']]), { ...simple, merge: 'html' })).toBe('| a | b |\n| --- | --- |'));
  it('escapes HTML content, allows only safe attributes, and honors inline', () => {
    const source: Grid = { rows: [[{ ...cell('<&>'), colSpan: 2, bold: true, italic: true, href: 'https://example.com/?a=1&b=2', align: 'right' }]] };
    const output = toMarkdown(source, { merge: 'html' });
    expect(output).toContain('style="text-align: right"');
    expect(output).toContain('<a href="https://example.com/?a=1&amp;b=2"><em><strong>&lt;&amp;&gt;</strong></em></a>');
    expect(toMarkdown(source, { merge: 'html', inline: false, keepAlign: false })).not.toMatch(/style=|<strong>|<a /);
  });
  it('escapes pipes and renders line breaks with trailing spaces stripped', () => expect(toMarkdown(grid([['Name','Value'], ['a|b  ', 'one  \ntwo  ']]), simple)).toContain('| a\\|b | one<br>two |'));
  it('preserves backslashes and pipes through reformatting', () => {
    const source = grid([['A','B'], ['x\\|y', 'C:\\notes']]);
    expect(parseMarkdownTable(toMarkdown(source, simple))!.rows[1].map(c => c.text)).toEqual(['x\\|y', 'C:\\notes']);
  });
  it('wraps inline bold, italic and links', () => {
    const source: Grid = { rows: [[cell('H')], [{ ...cell('Text'), bold: true, italic: true, href: 'https://example.com/a(b)' }]] };
    expect(toMarkdown(source, simple)).toContain('| [***Text***](https://example.com/a%28b%29) |');
    expect(toMarkdown(source, { ...simple, inline: false })).toContain('| Text |');
  });
  it('never wraps empty text', () => expect(toMarkdown({ rows: [[{ ...cell(''), bold: true, italic: true, href: 'https://example.com' }]] }, { ...simple, trimEmpty: false })).not.toMatch(/\*|\]\(/));
  it('defaults auto and first to the same header row', () => expect(toMarkdown(grid([['a','b'], ['c','d']]), { headerRow: 'auto' })).toBe(toMarkdown(grid([['a','b'], ['c','d']]), { headerRow: 'first' })));
  it('inserts an empty header for none', () => expect(toMarkdown(grid([['a','b']]), { ...simple, headerRow: 'none' })).toBe('|  |  |\n| --- | --- |\n| a | b |'));
  it('inserts an empty HTML header for none', () => expect(toMarkdown(merged(), { merge: 'html', headerRow: 'none' })).toContain('<tr><th></th><th></th><th></th></tr>'));
  it('trims only empty trailing rows and columns', () => expect(toMarkdown(grid([['A','',''], ['','',''], ['B','',''], ['','','']]), simple)).toBe('| A |\n| --- |\n|  |\n| B |'));
  it('keeps empty trailing rows and columns when requested', () => expect(toMarkdown(grid([['A',''], ['','']]), { ...simple, trimEmpty: false })).toBe('| A |  |\n| --- | --- |\n|  |  |'));
  it('pads ragged output', () => expect(toMarkdown(grid([['a','b'], ['c']]), simple)).toContain('| c |  |'));
  it('keeps a nonempty merged trailing column even in blank mode', () => expect(toMarkdown({ rows: [[{ ...cell('title'), colSpan: 2 }]] }, simple)).toBe('| title |  |\n| --- | --- |'));
  it('has no trailing newline', () => expect(toMarkdown(grid([['a']]))).not.toMatch(/\n$/));
  it.each([{ rows: [] }, { rows: [[]] }, grid([['','']])])('renders an empty grid as an empty string', source => expect(toMarkdown(source)).toBe(''));
  it('does not mutate source grids or options', () => {
    const source = merged(), original = JSON.stringify(source), opts = { merge: 'sheets' as const };
    toMarkdown(source, opts); expand(source);
    expect(JSON.stringify(source)).toBe(original); expect(opts).toEqual({ merge: 'sheets' });
  });
});
describe('alignment and display width', () => {
  it('uses body source alignment majority, not header alignment', () => {
    const source: Grid = { rows: [[{ ...cell('H'), align: 'center' }], [{ ...cell('a'), align: 'right' }], [{ ...cell('b'), align: 'left' }], [{ ...cell('c'), align: 'right' }]] };
    expect(toMarkdown(source, simple).split('\n')[1]).toBe('| ---: |');
  });
  it('renders all alignment types', () => {
    const cells: Cell[] = ['left','center','right',null].map(align => ({ ...cell('text'), align: align as Cell['align'] }));
    expect(toMarkdown({ rows: [cells.map(() => cell('H')), cells] }, simple).split('\n')[1]).toBe('| :--- | :---: | ---: | --- |');
  });
  it('can disable source and numeric alignment', () => expect(toMarkdown({ rows: [[cell('H')], [{ ...cell('123'), align: 'right' }]] }, { ...simple, keepAlign: false }).split('\n')[1]).toBe('| --- |'));
  it('right-aligns at the 80% numeric threshold', () => expect(toMarkdown(grid([['N'], ['1'], ['$2.00'], ['(3)'], ['4%'], ['n/a']]), { pad: false }).split('\n')[1]).toBe('| ---: |'));
  it('does not right-align below the threshold', () => expect(toMarkdown(grid([['N'], ['1'], ['2'], ['3'], ['x'], ['y']]), { pad: false }).split('\n')[1]).toBe('| --- |'));
  it('ignores empty values when calculating numeric ratios', () => expect(toMarkdown(grid([['N'], [''], ['1']]), { pad: false }).split('\n')[1]).toBe('| ---: |'));
  it('prefers source alignment over automatic numeric alignment', () => expect(toMarkdown({ rows: [[cell('N')], [{ ...cell('1'), align: 'left' }]] }, { pad: false }).split('\n')[1]).toBe('| :--- |'));
  it('does not treat dates as numeric', () => expect(toMarkdown(grid([['N'], ['2025-04-03']]), { pad: false }).split('\n')[1]).toBe('| --- |'));
  it.each([['中文',4], ['😀',2], ['👩‍💻',2], ['👨‍👩‍👧‍👦',2], ['👍🏽',2], ['🇫🇷',2], ['é',1], ['❤️',2], ['1️⃣',2]])('measures %s as width %i', (text, expected) => expect(displayWidth(text)).toBe(expected));
  it('pads CJK and emoji columns to equal display widths including separator', () => {
    const output = toMarkdown(grid([['名称','Icon'], ['中文测试','👩‍💻'], ['A','😀']]), { autoNumberAlign: false });
    const widths = output.split('\n').map(displayWidth);
    expect(new Set(widths).size).toBe(1);
    expect(output).toContain('| 名称     | Icon |');
  });
  it('makes alignment marker width match padded data width', () => {
    const source: Grid = { rows: [[cell('a')], [{ ...cell('b'), align: 'center' }]] };
    expect(toMarkdown(source).split('\n').map(displayWidth)).toEqual([9,9,9]);
  });
});
describe('Markdown parsing and tier options', () => {
  it('round-trips escaped pipes, line breaks, alignment and inline formatting', () => {
    const md = '| Name | Notes |\n| :--- | ---: |\n| **A\\|B** | [*one<br>two*](https://example.com) |';
    const parsed = parseMarkdownTable(md)!;
    expect(parsed.rows[1][0]).toMatchObject({ text: 'A|B', bold: true, align: 'left' });
    expect(parsed.rows[1][1]).toMatchObject({ text: 'one\ntwo', italic: true, align: 'right', href: 'https://example.com' });
    expect(toMarkdown(parsed, simple)).toBe(md);
  });
  it('supports tables without boundary pipes', () => expect(parseMarkdownTable('a | b\n--- | :---:\nc | d')!.rows[1][1]).toMatchObject({ text: 'd', align: 'center' }));
  it('supports <br /> and CRLF', () => expect(parseMarkdownTable('| A | B |\r\n| --- | --- |\r\n| one<br />two | x |')!.rows[1][0].text).toBe('one\ntwo'));
  it('supports escaped trailing pipes without a closing boundary pipe', () => expect(parseMarkdownTable('a | b\n--- | ---\nx | y\\|')!.rows[1][1].text).toBe('y|'));
  it.each(['', 'garbage', '| A | B |\n| --- |','| A | B |\n| x | y |'])('rejects invalid Markdown %j', input => expect(parseMarkdownTable(input)).toBeNull());
  it('applies exact free overrides after user preferences', () => {
    const opts = applyTier({ merge: 'repeat', dates: 'iso', keepAlign: true, inline: true, pad: false }, false);
    expect(opts).toMatchObject({ ...FREE_OPTIONS, pad: false }); expect(opts.autoNumberAlign).toBe(true);
  });
  it('preserves Pro preferences and fills defaults', () => expect(applyTier({ merge: 'repeat', dates: 'iso' }, true)).toEqual({ ...DEFAULT_OPTIONS, merge: 'repeat', dates: 'iso' }));
  it('does not mutate default or supplied tier options', () => { const opts = { inline: true }; applyTier(opts, false); expect(opts.inline).toBe(true); expect(DEFAULT_OPTIONS.inline).toBe(true); });
});

describe('numeric punctuation regression', () => {
  it('does not classify dotted dates as numbers', () => expect(toMarkdown(grid([['Date'], ['03.04.2025']]), { pad: false }).split('\n')[1]).toBe('| --- |'));
  it('recognizes grouped numbers with either decimal convention', () => expect(toMarkdown(grid([['N'], ['1,234,567.89'], ['1.234.567,89']]), { pad: false }).split('\n')[1]).toBe('| ---: |'));
});
