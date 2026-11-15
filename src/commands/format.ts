import { readFileSync, writeFileSync } from 'node:fs';
import { parseTranscript } from '../core/transcript.js';
import { formatTranscript } from '../core/formatter.js';
import { resolveOutputPath } from '../core/paths.js';
import type { SpeakerNames } from '../core/transcript.js';

export interface FormatOptions {
  input: string;
  output?: string | undefined;
  names?: SpeakerNames | undefined;
}

export interface FormatResult {
  outputPath: string;
  turns: number;
  text: string;
}

/** Reads a transcript JSON file and writes the formatted TXT beside it. */
export function formatFile(options: FormatOptions): FormatResult {
  const transcript = parseTranscript(JSON.parse(readFileSync(options.input, 'utf8')));
  const text = formatTranscript(transcript, options.names ?? {});
  const outputPath = options.output ?? resolveOutputPath(options.input, '.txt');
  writeFileSync(outputPath, text, 'utf8');
  return { outputPath, turns: text === '' ? 0 : text.split('\n\n').length, text };
}

/** Parses `SPEAKER_00=Louis` style overrides. */
export function parseNameFlags(values: string[] | undefined): SpeakerNames {
  const names: SpeakerNames = {};
  for (const entry of values ?? []) {
    const idx = entry.indexOf('=');
    if (idx <= 0) continue;
    names[entry.slice(0, idx)] = entry.slice(idx + 1);
  }
  return names;
}
