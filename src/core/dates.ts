import type { Cell, Options, Placement } from './model';

type Order = 'DMY' | 'MDY' | 'YMD';
interface DateParts { year: number; month: number; day: number; time: string }
const monthGroups = [
  'jan january januar janvier janv enero ene gennaio januari janeiro',
  'feb february februar février fevrier févr fevr febrero febbraio februari fevereiro fev',
  'mar march mär märz mrz maerz mars marzo maart mrt março marco',
  'apr april avril avr abril abr aprile',
  'may mai mayo maggio mag mei maio',
  'jun june juni juin junio giugno giu junho',
  'jul july juli juillet juil juill julio luglio lug julho',
  'aug august août aout agosto ago augustus',
  'sep sept september septembre septiembre set settembre setembro',
  'oct october oktober okt octobre octubre ottobre ott outubro out',
  'nov november novembre noviembre novembro',
  'dec déc december dez dezember décembre decembre dic diciembre dicembre dezembro',
];
const months = new Map<string, number>();
monthGroups.forEach((group, index) => group.split(' ').forEach(name => months.set(name, index + 1)));

export function isDateFormat(format: string): boolean {
  if (/^(?:short date|long date|date|date_time|datetime)$/i.test(format.trim())) return true;
  // Remove literal strings, escapes, colors, locales, and conditions before checking tokens.
  const tokens = format.replace(/"[^"]*"|'[^']*'|\\.|\[[^\]]*\]/g, '').toLowerCase();
  return /[dy]/.test(tokens) || (/m/.test(tokens) && /[\/-]/.test(tokens));
}
function valid(year: number, month: number, day: number): boolean {
  if (year < 1 || year > 9999 || month < 1 || month > 12 || day < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  return day <= [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}
function splitTime(text: string): { date: string; time: string } {
  const match = text.match(/^(.*?)([T ]+\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:\s*[AP]M)?(?:Z|[+-]\d{2}:?\d{2})?)$/i);
  return match ? { date: match[1].trim(), time: match[2] } : { date: text, time: '' };
}
function numericParts(text: string): RegExpMatchArray | null {
  return splitTime(text.trim()).date.match(/^(\d{1,4})([/.\-])(\d{1,2})\2(\d{1,4})$/);
}
/** Conflicting evidence also leaves ambiguous dates alone. */
export function inferColumnOrders(matrix: (Placement | null)[][]): (Order | undefined)[] {
  const width = matrix[0]?.length ?? 0;
  return Array.from({ length: width }, (_, col) => {
    const evidence = new Set<Order>();
    for (const row of matrix) {
      const p = row[col];
      if (!p || p.origin !== 'self') continue;
      const match = numericParts(p.cell.text);
      if (!match || match[1].length === 4 || match[4].length !== 4) continue;
      const a = Number(match[1]), b = Number(match[3]), year = Number(match[4]);
      if (a > 12 && valid(year, b, a)) evidence.add('DMY');
      if (b > 12 && valid(year, a, b)) evidence.add('MDY');
    }
    return evidence.size === 1 ? [...evidence][0] : undefined;
  });
}
function parseText(text: string, order?: Order): DateParts | null {
  const { date, time } = splitTime(text.trim());
  const match = numericParts(date);
  let year: number, month: number, day: number;
  if (match) {
    const a = Number(match[1]), b = Number(match[3]), c = Number(match[4]);
    if (match[1].length === 4) { year = a; month = b; day = c; }
    else {
      if (match[4].length !== 4 || order === 'YMD') return null;
      const resolved = order ?? (a > 12 ? 'DMY' : b > 12 ? 'MDY' : a === b ? 'DMY' : undefined);
      if (!resolved) return null;
      year = c; month = resolved === 'DMY' ? b : a; day = resolved === 'DMY' ? a : b;
    }
  } else {
    const dayFirst = date.match(/^(\d{1,2})[\s-]+([\p{L}.]+)[\s,-]+(\d{4})$/u);
    const monthFirst = date.match(/^([\p{L}.]+)[\s-]+(\d{1,2})(?:,)?[\s-]+(\d{4})$/u);
    if (!dayFirst && !monthFirst) return null;
    const name = (dayFirst?.[2] ?? monthFirst![1]).toLowerCase().replace(/\.$/, '');
    month = months.get(name) ?? 0;
    day = Number(dayFirst?.[1] ?? monthFirst![2]); year = Number(dayFirst?.[3] ?? monthFirst![3]);
  }
  return valid(year, month, day) ? { year, month, day, time } : null;
}
function serialDate(value: number, text: string): DateParts | null {
  if (!Number.isFinite(value) || value < 0 || value > 2958465) return null;
  const days = Math.floor(value);
  let parts: DateParts;
  if (days === 60) parts = { year: 1900, month: 2, day: 29, time: '' };
  else {
    const date = new Date(Date.UTC(1899, 11, 31) + (days > 60 ? days - 1 : days) * 86400000);
    parts = { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate(), time: '' };
  }
  parts.time = splitTime(text.trim()).time;
  if (!parts.time && value !== days) {
    const seconds = Math.min(86399, Math.round((value - days) * 86400));
    const hh = String(Math.floor(seconds / 3600)).padStart(2, '0');
    const mm = String(Math.floor(seconds / 60) % 60).padStart(2, '0');
    const ss = seconds % 60;
    parts.time = ` ${hh}:${mm}${ss ? ':' + String(ss).padStart(2, '0') : ''}`;
  }
  return parts;
}
export function convertDate(cell: Cell, opts: Options, inferred?: Order): string {
  if (opts.dates === 'keep') return cell.text;
  const parts = cell.rawNumber !== undefined && cell.numberFormat && isDateFormat(cell.numberFormat)
    ? serialDate(cell.rawNumber, cell.text)
    : parseText(cell.text, opts.dateOrder === 'auto' ? inferred : opts.dateOrder);
  if (!parts) return cell.text;
  const values: Record<string, string> = {
    YYYY: String(parts.year).padStart(4, '0'), MM: String(parts.month).padStart(2, '0'),
    DD: String(parts.day).padStart(2, '0'), M: String(parts.month), D: String(parts.day),
  };
  return (opts.dates === 'iso' ? 'YYYY-MM-DD' : opts.dateFormat).replace(/YYYY|MM|DD|M|D/g, token => values[token]) + parts.time;
}
