/**
 * Every number in the READMEs must come from running the code.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { exampleMarkdown, extractBlock, README_FILES, replaceBlock } from '../scripts/readme-example.ts';

const docs = {
  en: readFileSync(README_FILES.en, 'utf8'),
  es: readFileSync(README_FILES.es, 'utf8'),
};

describe('README', () => {
  it.each(['en', 'es'] as const)('the %s worked example matches the code output', (lang) => {
    expect(extractBlock(docs[lang])).toBe(exampleMarkdown(lang));
  });

  it('shows the hand-checked numbers of the worked example', () => {
    for (const doc of Object.values(docs)) {
      for (const n of ['141.708', '147.026', '1.037528', '$12,450.33', '$12,443.03', '$12,960.00', '$12,368.55', '$12,449.24']) {
        expect(doc).toContain(n);
      }
    }
  });

  it('carries the disclaimer and cross-links both languages', () => {
    expect(docs.en).toContain('This is not a legal opinion; check with a lawyer or the competent authority.');
    expect(docs.es).toContain('No constituye opinión legal; valida con un abogado o la autoridad competente.');
    expect(docs.en).toContain('href="README.es.md"');
    expect(docs.es).toContain('href="README.md"');
  });

  it('replaceBlock only touches the generated region', () => {
    const doc = docs.en;
    expect(replaceBlock(doc, exampleMarkdown('en'))).toBe(doc);
    expect(() => replaceBlock('no markers', 'x')).toThrow();
    expect(extractBlock('no markers')).toBeNull();
  });
});
