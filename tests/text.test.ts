import { describe, expect, it } from 'vitest';
import { extractHeadings, extractLinks, extractSummary, extractTitle, findDashes, slugify } from '../src/shared/text';

describe('slugify', () => {
  it('matches the GitHub style anchor', () => {
    expect(slugify('Trade offs and when to use it')).toBe('trade-offs-and-when-to-use-it');
    expect(slugify('Holland (RIASEC): six types')).toBe('holland-riasec-six-types');
    expect(slugify('The `GROW` model')).toBe('the-grow-model');
  });
});

describe('extractHeadings', () => {
  it('ignores headings inside fenced code and numbers duplicates', () => {
    const md = '# Title\n\n```md\n# not a heading\n```\n\n## Example\n\n## Example\n';
    expect(extractHeadings(md).map((h) => h.slug)).toEqual(['title', 'example', 'example-1']);
    expect(extractTitle(md)).toBe('Title');
  });
});

describe('extractLinks', () => {
  it('skips code and keeps images', () => {
    const md = 'See [a](a.md#x) and `[no](b.md)` and ![alt](img.png "t").\n```\n[c](c.md)\n```\n';
    expect(extractLinks(md).map((l) => l.href)).toEqual(['a.md#x', 'img.png']);
  });
});

describe('extractSummary', () => {
  it('takes the first paragraph of the Summary section', () => {
    const md = '# T\n\n## Summary\nOne **bold** idea.\nSecond line.\n\nOther.\n\n## Next\nx\n';
    expect(extractSummary(md)).toBe('One bold idea. Second line.');
  });
});

describe('findDashes', () => {
  it('reports em and en dashes with positions', () => {
    const text = `a ${String.fromCharCode(0x2014)} b\nc ${String.fromCharCode(0x2013)} d\nplain - hyphen`;
    expect(findDashes(text)).toEqual([
      { line: 1, column: 3, char: 'em dash' },
      { line: 2, column: 3, char: 'en dash' },
    ]);
  });
});
