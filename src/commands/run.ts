import { mkdirSync, writeFileSync } from 'node:fs';
import { formatTranscript } from '../core/formatter.js';
import { resolveOutputPath } from '../core/paths.js';
import type { SpeakerNames } from '../core/transcript.js';
import type { AsrProvider } from '../asr/types.js';
import type { LlmProvider } from '../llm/index.js';
import { buildReportUserMessage } from '../core/report.js';

export interface RunPipelineOptions {
  audio: string;
  outputDir: string;
  asr: AsrProvider;
  asrOptions: {
    model: string;
    language: string;
    diarize: boolean;
    timestamps: boolean;
    speakers?: number | undefined;
    hfToken?: string | undefined;
  };
  names?: SpeakerNames | undefined;
  /**
   * Called after transcription with the discovered speaker labels, so the UI can
   * ask the user who each one is. Takes precedence over `names`.
   */
  resolveNames?:
    | ((speakers: string[], segments: { speaker: string; text: string }[]) => Promise<SpeakerNames>)
    | undefined;
  /** When omitted, the pipeline stops after formatting. */
  report?: { provider: LlmProvider; prompt: string } | undefined;
  onStep?: ((step: string) => void) | undefined;
}

export interface RunPipelineResult {
  jsonPath: string;
  txtPath: string;
  reportPath?: string;
  speakers: string[];
}

/** Distinct speaker labels present in a transcript, in first-appearance order. */
export function collectSpeakers(segments: { speaker: string }[]): string[] {
  const seen: string[] = [];
  for (const seg of segments) {
    if (!seen.includes(seg.speaker)) seen.push(seg.speaker);
  }
  return seen;
}

export interface SpeakerNameQuestion {
  speaker: string;
  message: string;
  defaultValue: string;
  example?: string | undefined;
}

/** One optional naming question per speaker, with that speaker's first turn. */
export function speakerNameQuestions(
  speakers: string[],
  segments: { speaker: string; text: string }[] = [],
): SpeakerNameQuestion[] {
  const examples = new Map<string, string>();
  let firstTurnSpeaker: string | undefined;
  for (const segment of segments) {
    if (segment.speaker !== firstTurnSpeaker) {
      firstTurnSpeaker = segment.speaker;
      if (!examples.has(segment.speaker)) examples.set(segment.speaker, segment.text.trim());
    } else if (examples.has(segment.speaker)) {
      examples.set(segment.speaker, `${examples.get(segment.speaker)} ${segment.text.trim()}`.trim());
    }
  }

  return speakers.map((speaker) => {
    const turn = examples.get(speaker);
    const example = turn && turn.length > 120 ? `${turn.slice(0, 117).trimEnd()}...` : turn;
    return {
      speaker,
      message: `Name for ${speaker} (press Enter to keep this label)`,
      defaultValue: speaker,
      ...(example ? { example } : {}),
    };
  });
}

export interface DiarizationDecision {
  diarize: boolean;
  reason: string | undefined;
}

export interface ReportFlagInput {
  provider?: string | undefined;
  reportModel?: string | undefined;
}

/**
 * Maps the `--provider` and `--report-model` flags onto a config patch.
 * Unknown provider names are ignored so a typo cannot silently switch providers.
 */
export function reportFlagPatch(flags: ReportFlagInput): {
  report?: { provider?: 'openrouter' | 'lmstudio'; model?: string };
} {
  const report: { provider?: 'openrouter' | 'lmstudio'; model?: string } = {};
  if (flags.provider === 'openrouter' || flags.provider === 'lmstudio') {
    report.provider = flags.provider;
  }
  if (flags.reportModel !== undefined && flags.reportModel !== '') {
    report.model = flags.reportModel;
  }
  return Object.keys(report).length > 0 ? { report } : {};
}

/**
 * Diarization needs a gated Hugging Face token. When it is missing we continue
 * without speaker labels rather than failing the run.
 */
export function resolveDiarization(input: {
  requested: boolean;
  hfTokenPresent: boolean;
}): DiarizationDecision {
  if (!input.requested) return { diarize: false, reason: undefined };
  if (!input.hfTokenPresent) {
    return {
      diarize: false,
      reason:
        'Speaker diarization needs a Hugging Face token. Continuing without speaker labels.',
    };
  }
  return { diarize: true, reason: undefined };
}

/**
 * The full chain: audio → JSON → TXT → (optional) Markdown report.
 * Each stage is reported through `onStep` so the UI can render progress.
 */
export async function runPipeline(options: RunPipelineOptions): Promise<RunPipelineResult> {
  mkdirSync(options.outputDir, { recursive: true });

  options.onStep?.('Transcribe');
  const { transcript, jsonPath } = await options.asr.transcribe({
    audio: options.audio,
    outputDir: options.outputDir,
    ...options.asrOptions,
  });

  options.onStep?.('Format');
  const speakers = collectSpeakers(transcript.segments);
  if (options.resolveNames) options.onStep?.('Name speakers');
  const names = options.resolveNames
    ? await options.resolveNames(speakers, transcript.segments)
    : (options.names ?? {});
  const text = formatTranscript(transcript, names);
  const txtPath = resolveOutputPath(options.audio, '.txt', options.outputDir);
  writeFileSync(txtPath, text, 'utf8');

  if (!options.report) {
    return { jsonPath, txtPath, speakers };
  }

  options.onStep?.('Report');
  const markdown = await options.report.provider.complete({
    system: options.report.prompt,
    user: buildReportUserMessage(text),
  });
  const reportPath = resolveOutputPath(options.audio, '.report.md', options.outputDir);
  writeFileSync(reportPath, `${markdown.trimEnd()}\n`, 'utf8');

  return { jsonPath, txtPath, reportPath, speakers };
}
