import { describe, expect, it } from 'vitest';
import { parseTranscript } from '../src/core/transcript.js';

const minimal = {
  text: 'hello',
  language: 'en',
  finish_reason: 'stop',
  truncated: false,
  segments: [{ text: 'hello', start: 0, end: 1, speaker: 'SPEAKER_00' }],
  speaker_segments: [],
  chunks: [],
};

describe('parseTranscript', () => {
  it('accepts a well-formed transcript', () => {
    const t = parseTranscript(minimal);
    expect(t.segments).toHaveLength(1);
    expect(t.segments[0]?.speaker).toBe('SPEAKER_00');
  });

  it('defaults a missing speaker to UNKNOWN', () => {
    const t = parseTranscript({
      ...minimal,
      segments: [{ text: 'hi', start: 0, end: 1 }],
    });
    expect(t.segments[0]?.speaker).toBe('UNKNOWN');
  });

  it('treats a null speaker as UNKNOWN', () => {
    const t = parseTranscript({
      ...minimal,
      segments: [{ text: 'hi', start: 0, end: 1, speaker: null }],
    });
    expect(t.segments[0]?.speaker).toBe('UNKNOWN');
  });

  it('tolerates absent optional top-level fields', () => {
    const t = parseTranscript({ segments: [{ text: 'hi', start: 0, end: 1 }] });
    expect(t.segments).toHaveLength(1);
    expect(t.language).toBe('');
    expect(t.truncated).toBe(false);
  });

  it('rejects a non-object payload', () => {
    expect(() => parseTranscript('nope')).toThrow(/expected an object/i);
  });

  it('rejects a payload with no segments array', () => {
    expect(() => parseTranscript({ text: 'x' })).toThrow(/segments/i);
  });

  it('rejects a segment missing text', () => {
    expect(() =>
      parseTranscript({ segments: [{ start: 0, end: 1 }] }),
    ).toThrow(/text/i);
  });

  it('rejects a segment with non-numeric timing', () => {
    expect(() =>
      parseTranscript({ segments: [{ text: 'a', start: '0', end: 1 }] }),
    ).toThrow(/start/i);
  });

  it('reports the offending segment index', () => {
    expect(() =>
      parseTranscript({
        segments: [
          { text: 'ok', start: 0, end: 1 },
          { text: 'bad', start: 1, end: 'x' },
        ],
      }),
    ).toThrow(/segments\[1\]/);
  });
});
