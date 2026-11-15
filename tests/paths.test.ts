import { describe, expect, it } from 'vitest';
import { defaultRunDir, resolveOutputPath, stem } from '../src/core/paths.js';

describe('stem', () => {
  it('strips the extension', () => {
    expect(stem('/a/b/interview.m4a')).toBe('interview');
  });

  it('strips only the final extension', () => {
    expect(stem('/a/b/interview.v2.m4a')).toBe('interview.v2');
  });

  it('handles a path with no extension', () => {
    expect(stem('/a/b/interview')).toBe('interview');
  });
});

describe('resolveOutputPath', () => {
  it('places output next to the input by default', () => {
    expect(resolveOutputPath('/a/b/interview.m4a', '.txt')).toBe('/a/b/interview.txt');
  });

  it('honours an explicit output directory', () => {
    expect(resolveOutputPath('/a/b/interview.m4a', '.txt', '/out')).toBe('/out/interview.txt');
  });

  it('supports multi-part suffixes', () => {
    expect(resolveOutputPath('/a/b/i.m4a', '.report.md')).toBe('/a/b/i.report.md');
  });
});

describe('defaultRunDir', () => {
  it('uses the directory containing the audio', () => {
    expect(defaultRunDir('/a/b/interview.m4a')).toBe('/a/b');
  });
});
