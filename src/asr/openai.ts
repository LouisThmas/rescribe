import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import type { Transcript } from '../core/transcript.js';
import type { AsrProvider, TranscribeOptions, TranscribeResult } from './types.js';

export interface TranscriptionFormInput {
  model: string;
  language: string;
  diarize: boolean;
  timestamps: boolean;
}

/**
 * Builds the multipart form for an OpenAI-compatible `/audio/transcriptions`
 * endpoint. `verbose_json` is required to get segment timings.
 */
export function buildTranscriptionForm(input: TranscriptionFormInput): FormData {
  const form = new FormData();
  form.set('model', input.model);
  form.set('response_format', 'verbose_json');
  if (input.language && input.language !== 'auto') {
    form.set('language', input.language);
  }
  if (input.diarize) {
    form.set('diarize', 'true');
  }
  if (input.timestamps) {
    form.set('timestamp_granularities[]', 'word');
  }
  return form;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Normalises a `verbose_json` transcription response into our transcript shape.
 * Servers vary: some return segments, some only text, some include speakers.
 */
export function mapTranscriptionResponse(raw: unknown): Transcript {
  if (!isRecord(raw)) {
    throw new Error('Invalid transcription response: expected an object');
  }
  const text = typeof raw['text'] === 'string' ? raw['text'] : '';
  const language = typeof raw['language'] === 'string' ? raw['language'] : '';
  const rawSegments = Array.isArray(raw['segments']) ? raw['segments'] : [];

  const segments = rawSegments.filter(isRecord).map((seg) => ({
    text: typeof seg['text'] === 'string' ? seg['text'] : '',
    start: typeof seg['start'] === 'number' ? seg['start'] : 0,
    end: typeof seg['end'] === 'number' ? seg['end'] : 0,
    speaker:
      typeof seg['speaker'] === 'string' && seg['speaker'] !== '' ? seg['speaker'] : 'UNKNOWN',
  }));

  if (segments.length === 0 && text.trim() !== '') {
    segments.push({ text, start: 0, end: 0, speaker: 'UNKNOWN' });
  }

  return {
    text,
    language,
    finishReason: 'stop',
    truncated: false,
    segments,
    speakerSegments: [],
    chunks: [],
  };
}

export interface OpenAiAsrConfig {
  baseUrl: string;
  apiKey: string;
}

export interface OpenAiAsrDeps {
  fetch?: typeof globalThis.fetch;
  readFile?: (path: string) => Uint8Array;
}

/** Remote ASR via any OpenAI-compatible `/audio/transcriptions` endpoint. */
export function createOpenAiAsrProvider(
  config: OpenAiAsrConfig,
  deps: OpenAiAsrDeps = {},
): AsrProvider {
  const doFetch = deps.fetch ?? globalThis.fetch;
  const readFile = deps.readFile ?? ((p: string) => readFileSync(p));

  return {
    name: 'openai',

    async isAvailable(): Promise<boolean> {
      return config.baseUrl !== '';
    },

    async transcribe(options: TranscribeOptions): Promise<TranscribeResult> {
      const form = buildTranscriptionForm({
        model: options.model,
        language: options.language,
        diarize: options.diarize,
        timestamps: options.timestamps,
      });
      const bytes = readFile(options.audio);
      form.set('file', new Blob([new Uint8Array(bytes)]), basename(options.audio));

      const headers: Record<string, string> = {};
      if (config.apiKey) headers['Authorization'] = `Bearer ${config.apiKey}`;

      const res = await doFetch(`${config.baseUrl.replace(/\/$/, '')}/audio/transcriptions`, {
        method: 'POST',
        headers,
        body: form,
        ...(options.signal ? { signal: options.signal } : {}),
      });

      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        throw new Error(`Transcription failed (${res.status}): ${detail.slice(0, 300)}`);
      }

      const transcript = mapTranscriptionResponse(await res.json());
      return { transcript, jsonPath: '' };
    },
  };
}
