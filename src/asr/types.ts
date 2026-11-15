import type { Transcript } from '../core/transcript.js';

export interface TranscribeOptions {
  audio: string;
  model: string;
  language: string;
  diarize: boolean;
  timestamps: boolean;
  speakers?: number | undefined;
  hfToken?: string | undefined;
  outputDir: string;
  signal?: AbortSignal | undefined;
}

export interface TranscribeResult {
  transcript: Transcript;
  /** Path of the JSON file written to disk. */
  jsonPath: string;
}

export interface AsrProvider {
  readonly name: string;
  /** Whether this provider can run on the current machine. */
  isAvailable(): Promise<boolean>;
  transcribe(options: TranscribeOptions): Promise<TranscribeResult>;
}
