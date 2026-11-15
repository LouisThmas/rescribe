import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { formatTranscript } from '../src/core/formatter.js';
import { parseTranscript } from '../src/core/transcript.js';

const fixture = (name: string): string =>
  fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));

const load = (name: string) => parseTranscript(JSON.parse(readFileSync(fixture(name), 'utf8')));
const expected = (name: string) => readFileSync(fixture(name), 'utf8');

describe('formatTranscript', () => {
  it('reproduces format-transcript byte-for-byte on real data', () => {
    const out = formatTranscript(load('javad-trimmed.json'));
    expect(out).toBe(expected('javad-trimmed.expected.txt'));
  });

  it('absorbs a 1-word flicker turn between the same speaker', () => {
    const out = formatTranscript(load('edge-flicker-absorbed.json'));
    expect(out).toBe(expected('edge-flicker-absorbed.expected.txt'));
  });

  it('absorbs a 2-word flicker turn (boundary of the <=2 rule)', () => {
    const out = formatTranscript(load('edge-flicker-two-words.json'));
    expect(out).toBe(expected('edge-flicker-two-words.expected.txt'));
  });

  it('keeps a 3-word turn (just outside the rule)', () => {
    const out = formatTranscript(load('edge-three-words-kept.json'));
    expect(out).toBe(expected('edge-three-words-kept.expected.txt'));
  });

  it('cannot absorb a flicker at index 0', () => {
    const out = formatTranscript(load('edge-flicker-first-turn.json'));
    expect(out).toBe(expected('edge-flicker-first-turn.expected.txt'));
  });

  it('handles consecutive absorbs', () => {
    const out = formatTranscript(load('edge-consecutive-absorbs.json'));
    expect(out).toBe(expected('edge-consecutive-absorbs.expected.txt'));
  });

  it('labels segments with no speaker as UNKNOWN', () => {
    const out = formatTranscript(load('edge-unknown-speaker.json'));
    expect(out).toBe(expected('edge-unknown-speaker.expected.txt'));
  });

  it('formats timestamps past one hour as HH:MM:SS', () => {
    const out = formatTranscript(load('edge-hour-rollover.json'));
    expect(out).toBe(expected('edge-hour-rollover.expected.txt'));
  });

  it('applies speaker name overrides', () => {
    const out = formatTranscript(load('edge-flicker-absorbed.json'), {
      SPEAKER_00: 'Louis',
    });
    expect(out).toContain('Louis:');
    expect(out).not.toContain('SPEAKER_00');
  });

  it('leaves unmapped speakers untouched when overrides are partial', () => {
    const out = formatTranscript(load('edge-three-words-kept.json'), {
      SPEAKER_00: 'Louis',
    });
    expect(out).toContain('Louis:');
    expect(out).toContain('SPEAKER_01:');
  });

  it('separates turns with a blank line and no trailing newline', () => {
    const out = formatTranscript(load('edge-three-words-kept.json'));
    expect(out.endsWith('\n')).toBe(false);
    expect(out.split('\n\n')).toHaveLength(3);
  });

  it('returns an empty string for a transcript with no segments', () => {
    expect(formatTranscript(parseTranscript({ segments: [] }))).toBe('');
  });
});
