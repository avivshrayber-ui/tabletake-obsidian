import { describe, expect, it } from 'vitest';
import { padTable, tableRange } from '../src/editor-utils';

describe('tableRange', () => {
  const lines = ['Intro', '| A | B |', '| --- | --- |', '| 1 | 2 |', '', '| C | D |'];
  it.each([1, 2, 3])('finds the complete table from line %i', line => {
    expect(tableRange(lines, line)).toEqual({ from: { line: 1, ch: 0 }, to: { line: 3, ch: 9 } });
  });
  it('does not cross empty lines or accept ordinary prose', () => {
    expect(tableRange(lines, 0)).toBeNull();
    expect(tableRange(lines, 4)).toBeNull();
    expect(tableRange(lines, 5)?.from.line).toBe(5);
  });
  it('handles boundaries and absent lines', () => {
    expect(tableRange(['|a|'], 0)).toEqual({ from: { line: 0, ch: 0 }, to: { line: 0, ch: 3 } });
    expect(tableRange([], 0)).toBeNull();
    expect(tableRange(['  |a|'], 0)).toBeNull();
  });
});
describe('padTable', () => {
  it('separates a mid-line insertion from both fragments', () => {
    expect(padTable('|a|', 'before', 'after')).toBe('\n\n|a|\n\n');
  });
  it('adds only missing blank lines', () => {
    expect(padTable('|a|\n', 'before\n', '\nafter')).toBe('\n|a|\n');
    expect(padTable('|a|', 'before\n\n', '\n\nafter')).toBe('|a|');
  });
  it('keeps document boundaries clean', () => {
    expect(padTable('|a|', '', '')).toBe('|a|');
    expect(padTable('|a|', '', 'after')).toBe('|a|\n\n');
    expect(padTable('|a|', 'before', '')).toBe('\n\n|a|');
  });
  it('preserves existing extra whitespace outside the replacement', () => {
    expect(padTable('|a|', 'before\n\n\n', '\n\n\nafter')).toBe('|a|');
  });
});
