import { describe, expect, it } from 'vitest';
import { parseHtmlTable, toMarkdown, type Grid, type Options } from '../src/core/index';
import { cell } from '../src/core/model';
import { isDateFormat } from '../src/core/dates';
const table = (values: string[][]): Grid => ({ rows: values.map(row => row.map(value => cell(value))) });
const render = (value: string, opts: Partial<Options> = {}) => toMarkdown(table([['Date'], [value]]), { dates: 'iso', pad: false, autoNumberAlign: false, ...opts }).split('\n')[2];

describe('date conversion', () => {
  it('keeps date text by default', () => expect(toMarkdown(table([['Date'], ['3/4/2025']]), { pad: false })).toContain('| 3/4/2025 |'));
  it('leaves ambiguous columns unchanged', () => {
    const md = toMarkdown(table([['Date'], ['3/4/2025'], ['5/6/2025']]), { dates: 'iso', pad: false });
    expect(md).toContain('| 3/4/2025 |'); expect(md).toContain('| 5/6/2025 |');
  });
  it('infers DMY from another value in the column', () => {
    const md = toMarkdown(table([['Date'], ['3/4/2025'], ['23/4/2025']]), { dates: 'iso', pad: false });
    expect(md).toContain('| 2025-04-03 |'); expect(md).toContain('| 2025-04-23 |');
  });
  it('infers MDY from another value in the column', () => expect(toMarkdown(table([['Date'], ['3/4/2025'], ['4/23/2025']]), { dates: 'iso', pad: false })).toContain('| 2025-03-04 |'));
  it('infers date order independently per expanded column', () => {
    const md = toMarkdown(table([['EU', 'US', 'Unknown'], ['3/4/2025', '3/4/2025', '3/4/2025'], ['23/4/2025', '4/23/2025', '5/6/2025']]), { dates: 'iso', pad: false });
    expect(md).toContain('| 2025-04-03 | 2025-03-04 | 3/4/2025 |');
  });
  it('does not infer from conflicting evidence', () => expect(toMarkdown(table([['Date'], ['23/4/2025'], ['4/23/2025'], ['3/4/2025']]), { dates: 'iso', pad: false })).toContain('| 3/4/2025 |'));
  it('ignores invalid dates as evidence', () => expect(toMarkdown(table([['Date'], ['31/2/2025'], ['3/4/2025']]), { dates: 'iso', pad: false })).toContain('| 3/4/2025 |'));
  it('obeys explicit DMY', () => expect(render('3/4/2025', { dateOrder: 'DMY' })).toBe('| 2025-04-03 |'));
  it('obeys explicit MDY', () => expect(render('3/4/2025', { dateOrder: 'MDY' })).toBe('| 2025-03-04 |'));
  it('supports YMD', () => expect(render('2025/4/3', { dateOrder: 'YMD' })).toBe('| 2025-04-03 |'));
  it('converts custom tokens', () => expect(render('2025-04-03', { dates: 'custom', dateFormat: 'D.M.YYYY / DD-MM-YYYY' })).toBe('| 3.4.2025 / 03-04-2025 |'));
  it.each(['3-Apr-2025', 'April 3, 2025', '3 Apr 2025', '3 avr. 2025', '3 abril 2025', '3 aprile 2025'])('reads month names %s', value => expect(render(value)).toBe('| 2025-04-03 |'));
  it.each([
    ['3 Mär 2025', '2025-03-03'], ['3 févr. 2025', '2025-02-03'], ['3 dic 2025', '2025-12-03'],
    ['3 giu 2025', '2025-06-03'], ['3 okt 2025', '2025-10-03'], ['3 fev 2025', '2025-02-03'],
  ])('reads locale month %s', (value, expected) => expect(render(value)).toBe(`| ${expected} |`));
  it('reads dotted dates', () => expect(render('03.04.2025', { dateOrder: 'DMY' })).toBe('| 2025-04-03 |'));
  it('keeps an existing time suffix unchanged', () => expect(render('3/4/2025 14:30:05', { dateOrder: 'DMY' })).toBe('| 2025-04-03 14:30:05 |'));
  it('keeps ISO timezone and fractional seconds', () => expect(render('2025/4/3T14:30:05.123+02:00')).toBe('| 2025-04-03T14:30:05.123+02:00 |'));
  it('keeps AM/PM time', () => expect(render('April 3, 2025 2:30 PM')).toBe('| 2025-04-03 2:30 PM |'));
  it.each(['14:30', '31/2/2025', '2025-02-29', 'not a date', '12345', '3/4/25'])('preserves non-date or invalid input %s', value => expect(render(value)).toBe(`| ${value} |`));
  it('accepts a valid leap date', () => expect(render('29/2/2024')).toBe('| 2024-02-29 |'));
  it.each([[1, '1900-01-01'], [59, '1900-02-28'], [60, '1900-02-29'], [61, '1900-03-01'], [45123, '2023-07-16']])('converts Excel serial %i including the leap-year bug', (serial, expected) => {
    const grid = parseHtmlTable(`<table><tr><th>Date</th></tr><tr><td x:num="${serial}" style='mso-number-format:"Short Date"'>${serial}</td></tr></table>`)!;
    expect(toMarkdown(grid, { dates: 'iso', pad: false })).toContain(`| ${expected} |`);
  });
  it('preserves displayed serial date/time suffix', () => {
    const grid: Grid = { rows: [[cell('Date')], [{ ...cell('7/16/2023 2:30 PM'), rawNumber: 45123.6041666667, numberFormat: 'yyyy-mm-dd hh:mm' }]] };
    expect(toMarkdown(grid, { dates: 'iso', pad: false })).toContain('| 2023-07-16 2:30 PM |');
  });
  it('uses fractional serial time when no displayed time exists', () => {
    const grid: Grid = { rows: [[cell('Date')], [{ ...cell('45123.5'), rawNumber: 45123.5, numberFormat: 'yyyy-mm-dd hh:mm' }]] };
    expect(toMarkdown(grid, { dates: 'iso', pad: false })).toContain('| 2023-07-16 12:00 |');
  });
  it('never treats ordinary numeric formats as dates', () => {
    const grid: Grid = { rows: [[cell('Amount')], [{ ...cell('45123'), rawNumber: 45123, numberFormat: '0.00' }]] };
    expect(toMarkdown(grid, { dates: 'iso', pad: false })).toContain('| 45123 |');
  });
  it.each(['0.00', '0 "days"', '[Red]0', 'hh:mm', '[h]:mm'])('rejects non-date format %s', format => expect(isDateFormat(format)).toBe(false));
  it.each(['Short Date', 'yyyy-mm-dd', 'dd/mm/yyyy', 'DATE_TIME', '[$-409]d-mmm-yy'])('recognizes date format %s', format => expect(isDateFormat(format)).toBe(true));
});

describe('additional localized short months', () => {
  it.each([['3 mrt 2025', '2025-03-03'], ['3 Mrz 2025', '2025-03-03'], ['3 abr 2025', '2025-04-03'], ['3 déc. 2025', '2025-12-03']])('reads %s', (value, expected) => expect(render(value)).toBe(`| ${expected} |`));
});
