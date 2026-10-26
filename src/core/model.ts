export type Align = 'left' | 'center' | 'right' | null;
export interface Cell {
  text: string; colSpan: number; rowSpan: number; align: Align; header: boolean;
  bold?: boolean; italic?: boolean; href?: string; rawNumber?: number; numberFormat?: string;
}
export interface Grid { rows: Cell[][] }
export interface Slot { text: string; align: Align; origin: 'self' | 'left' | 'up'; header: boolean }
export type MergeMode = 'repeat' | 'blank' | 'sheets' | 'html';
export type DateMode = 'keep' | 'iso' | 'custom';
export interface Options {
  merge: MergeMode; dates: DateMode; dateFormat: string; dateOrder: 'auto' | 'DMY' | 'MDY' | 'YMD';
  keepAlign: boolean; autoNumberAlign: boolean; inline: boolean;
  /** auto currently uses the first row, like first; reserved for future detection. */
  headerRow: 'auto' | 'first' | 'none';
  pad: boolean; trimEmpty: boolean;
}
export const DEFAULT_OPTIONS: Options = Object.freeze({
  merge: 'blank', dates: 'keep', dateFormat: 'YYYY-MM-DD', dateOrder: 'auto',
  keepAlign: true, autoNumberAlign: true, inline: true, headerRow: 'auto', pad: true, trimEmpty: true,
});
export const FREE_OPTIONS: Partial<Options> = Object.freeze({ merge: 'blank', dates: 'keep', keepAlign: false, inline: false });
export function applyTier(opts: Partial<Options>, pro: boolean): Options {
  return { ...DEFAULT_OPTIONS, ...opts, ...(!pro ? FREE_OPTIONS : {}) };
}
export function cell(text = ''): Cell { return { text, colSpan: 1, rowSpan: 1, align: null, header: false }; }
export function gridHasSpans(grid: Grid): boolean { return grid.rows.some(row => row.some(c => c.colSpan > 1 || c.rowSpan > 1)); }
/** Internal provenance lets conversion happen once at the source column. */
export interface Placement { cell: Cell; origin: Slot['origin']; sourceRow: number; sourceCol: number }
export function span(value: number): number { return Number.isFinite(value) ? Math.max(1, Math.min(1000, Math.floor(value))) : 1; }
export function place(grid: Grid): (Placement | null)[][] {
  const rows: (Placement | null)[][] = [];
  grid.rows.forEach((row, r) => {
    rows[r] ??= [];
    let c = 0;
    for (const source of row) {
      const width = span(source.colSpan), height = span(source.rowSpan);
      // A malformed colspan must not overwrite an earlier rowspan.
      while (Array.from({ length: width }, (_, offset) => rows[r][c + offset]).some(Boolean)) c++;
      for (let dy = 0; dy < height; dy++) {
        rows[r + dy] ??= [];
        for (let dx = 0; dx < width; dx++) rows[r + dy][c + dx] = {
          cell: source, origin: dy ? 'up' : dx ? 'left' : 'self', sourceRow: r, sourceCol: c,
        };
      }
      c += width;
    }
  });
  const width = rows.reduce((max, row) => Math.max(max, row.length), 0);
  return rows.map(row => Array.from({ length: width }, (_, c) => row[c] ?? null));
}
export function expand(grid: Grid): Slot[][] {
  return place(grid).map(row => row.map(p => ({ text: p?.cell.text ?? '', align: p?.cell.align ?? null, origin: p?.origin ?? 'self', header: p?.cell.header ?? false })));
}
