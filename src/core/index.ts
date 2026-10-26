export type { Align, Cell, Grid, Slot, MergeMode, DateMode, Options } from './model';
export { DEFAULT_OPTIONS, FREE_OPTIONS, applyTier, expand, gridHasSpans } from './model';
export { parseHtmlTable } from './html';
export { parseDelimited } from './delimited';
export { toMarkdown, parseMarkdownTable } from './render';

import type { Grid } from './model';
import { parseHtmlTable } from './html';
import { parseDelimited } from './delimited';
export function parseClipboard(html: string | null, text: string | null): Grid | null {
  return (html ? parseHtmlTable(html) : null) ?? (text ? parseDelimited(text) : null);
}
