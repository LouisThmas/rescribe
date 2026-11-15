import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { parseTranscript } from '../core/transcript.js';
import type { AsrProvider, TranscribeOptions, TranscribeResult } from './types.js';

export const MLX_BIN = 'mlx-qwen3-asr';

export interface MlxArgsInput {
  audio: string;
  model: string;
  language: string;
  diarize: boolean;
  timestamps: boolean;
  speakers?: number | undefined;
  outputDir: string;
}

/**
 * Builds the argv for `mlx-qwen3-asr`.
 *
 * Always requests `json`: the tool only writes speaker labels in that format.
 */
export function buildMlxArgs(input: MlxArgsInput): string[] {
  const args = [
    input.audio,
    '--model',
    input.model,
    '-o',
    input.outputDir,
    '-f',
    'json',
  ];

  if (input.language && input.language !== 'auto') {
    args.push('--language', input.language);
  }
  if (input.diarize) {
    args.push('--diarize');
  }
  if (input.timestamps) {
    args.push('--timestamps');
  }
  if (input.speakers !== undefined) {
    args.push('--num-speakers', String(input.speakers));
  }

  return args;
}

/** The tool writes `<outputDir>/<audioStem>.json` — the path is deterministic. */
export function resolveMlxOutputPath(outputDir: string, audio: string): string {
  const stem = basename(audio, extname(audio));
  return join(outputDir, `${stem}.json`);
}

export interface MlxProviderDeps {
  run?: (
    args: string[],
    signal?: AbortSignal | undefined,
    env?: NodeJS.ProcessEnv | undefined,
  ) => Promise<void>;
  readFile?: (path: string) => string;
}

function defaultRun(
  args: string[],
  signal?: AbortSignal | undefined,
  env?: NodeJS.ProcessEnv | undefined,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const showProgress = process.stderr.isTTY === true;
    const child = spawn(MLX_BIN, args, {
      stdio: ['ignore', 'pipe', showProgress ? 'inherit' : 'pipe'],
      ...(env ? { env } : {}),
    });
    let stderr = '';
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', (err: NodeJS.ErrnoException) => {
      reject(
        err.code === 'ENOENT'
          ? new Error(`${MLX_BIN} not found on PATH`)
          : err,
      );
    });
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${MLX_BIN} exited with code ${code}\n${stderr.trim()}`));
    });
    signal?.addEventListener('abort', () => child.kill('SIGTERM'), { once: true });
  });
}

/** Local, Apple-Silicon-only ASR via the `mlx-qwen3-asr` Python tool. */
export function createMlxProvider(deps: MlxProviderDeps = {}): AsrProvider {
  const run = deps.run ?? defaultRun;
  const readFile = deps.readFile ?? ((p: string) => readFileSync(p, 'utf8'));

  return {
    name: 'mlx',

    async isAvailable(): Promise<boolean> {
      return new Promise((resolve) => {
        const child = spawn(MLX_BIN, ['--help'], { stdio: 'ignore' });
        child.on('error', () => resolve(false));
        child.on('close', (code) => resolve(code === 0));
      });
    },

    async transcribe(options: TranscribeOptions): Promise<TranscribeResult> {
      const args = buildMlxArgs(options);
      const env = options.hfToken
        ? { ...process.env, HF_TOKEN: options.hfToken }
        : undefined;
      await run(args, options.signal, env);
      const jsonPath = resolveMlxOutputPath(options.outputDir, options.audio);
      const transcript = parseTranscript(JSON.parse(readFile(jsonPath)));
      return { transcript, jsonPath };
    },
  };
}
