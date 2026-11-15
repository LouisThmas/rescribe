import { describe, expect, it } from 'vitest';
import { buildReportUserMessage, estimateTokens, shouldWarnAboutLength } from '../src/core/report.js';

describe('buildReportUserMessage', () => {
  it('includes the transcript verbatim', () => {
    const msg = buildReportUserMessage('[00:00:01] A: hello');
    expect(msg).toContain('[00:00:01] A: hello');
  });

  it('labels the transcript so the model knows what follows', () => {
    const msg = buildReportUserMessage('body');
    expect(msg).toMatch(/transcript/i);
    expect(msg).toContain('body');
  });

  it('does not alter the transcript content', () => {
    const transcript = 'line one\n\nline two';
    expect(buildReportUserMessage(transcript)).toContain(transcript);
  });
});

describe('estimateTokens', () => {
  it('approximates four characters per token', () => {
    expect(estimateTokens('a'.repeat(400))).toBe(100);
  });

  it('returns zero for empty input', () => {
    expect(estimateTokens('')).toBe(0);
  });
});

describe('shouldWarnAboutLength', () => {
  it('does not warn for a short transcript', () => {
    expect(shouldWarnAboutLength('short')).toBe(false);
  });

  it('warns once the estimate exceeds the threshold', () => {
    expect(shouldWarnAboutLength('a'.repeat(400_000))).toBe(true);
  });

  it('honours a custom threshold', () => {
    expect(shouldWarnAboutLength('a'.repeat(400), 50)).toBe(true);
  });
});
