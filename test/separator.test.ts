import { describe, expect, it } from 'vitest';
import { parseMarkdownTable } from '../src/core/index';

describe('short separator rows', () => {
  it('parses separators with fewer than three dashes', () => {
    for (const sep of ['|--|--|', '|-|-|', '--|--', '|:-|-:|']) {
      expect(parseMarkdownTable(`| a | bb |\n${sep}\n| 1 | 2 |`)?.rows.length).toBe(2);
    }
  });
});
