import { describe, expect, it } from 'vitest';
import { buildTranscriptionForm, mapTranscriptionResponse } from '../src/asr/openai.js';

describe('buildTranscriptionForm', () => {
  it('requests json so we can parse segments', () => {
    const form = buildTranscriptionForm({
      model: 'whisper-1',
      language: 'French',
      diarize: true,
      timestamps: true,
    });
    expect(form.get('response_format')).toBe('verbose_json');
  });

  it('passes the model', () => {
    const form = buildTranscriptionForm({
      model: 'whisper-1',
      language: 'auto',
      diarize: false,
      timestamps: false,
    });
    expect(form.get('model')).toBe('whisper-1');
  });

  it('omits language when auto', () => {
    const form = buildTranscriptionForm({
      model: 'm',
      language: 'auto',
      diarize: false,
      timestamps: false,
    });
    expect(form.has('language')).toBe(false);
  });

  it('passes language when set', () => {
    const form = buildTranscriptionForm({
      model: 'm',
      language: 'French',
      diarize: false,
      timestamps: false,
    });
    expect(form.get('language')).toBe('French');
  });

  it('requests diarization when supported', () => {
    const form = buildTranscriptionForm({
      model: 'm',
      language: 'auto',
      diarize: true,
      timestamps: false,
    });
    expect(form.get('diarize')).toBe('true');
  });

  it('omits diarize when disabled', () => {
    const form = buildTranscriptionForm({
      model: 'm',
      language: 'auto',
      diarize: false,
      timestamps: false,
    });
    expect(form.has('diarize')).toBe(false);
  });

  it('requests word timestamps when enabled', () => {
    const form = buildTranscriptionForm({
      model: 'm',
      language: 'auto',
      diarize: false,
      timestamps: true,
    });
    expect(form.get('timestamp_granularities[]')).toBe('word');
  });
});

describe('mapTranscriptionResponse', () => {
  it('maps verbose_json segments into our transcript shape', () => {
    const t = mapTranscriptionResponse({
      text: 'hello world',
      language: 'english',
      segments: [
        { text: 'hello', start: 0, end: 1, speaker: 'SPEAKER_00' },
        { text: 'world', start: 1, end: 2 },
      ],
    });
    expect(t.segments).toHaveLength(2);
    expect(t.segments[0]?.speaker).toBe('SPEAKER_00');
    expect(t.segments[1]?.speaker).toBe('UNKNOWN');
    expect(t.language).toBe('english');
  });

  it('synthesises a single segment when the server returns only text', () => {
    const t = mapTranscriptionResponse({ text: 'just text' });
    expect(t.segments).toHaveLength(1);
    expect(t.segments[0]?.text).toBe('just text');
    expect(t.segments[0]?.speaker).toBe('UNKNOWN');
  });

  it('returns no segments for an empty response', () => {
    expect(mapTranscriptionResponse({ text: '' }).segments).toHaveLength(0);
  });

  it('rejects a response that is not an object', () => {
    expect(() => mapTranscriptionResponse('nope')).toThrow(/expected an object/i);
  });
});
