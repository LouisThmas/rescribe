import { execFile } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { Platform, Probe } from './plan.js';

const execFileAsync = promisify(execFile);

export interface DetectDeps {
  which?: (bin: string) => Promise<boolean>;
  env?: NodeJS.ProcessEnv;
  platform?: Platform;
  arch?: string;
  nodeVersion?: string;
  hfCacheDir?: string;
}

async function defaultWhich(bin: string): Promise<boolean> {
  try {
    await execFileAsync('which', [bin]);
    return true;
  } catch {
    return false;
  }
}

function toPlatform(p: string): Platform {
  if (p === 'darwin') return p;
  return 'other';
}

/** Hugging Face cache directory, honouring HF_HOME when set. */
export function hfCacheDir(env: NodeJS.ProcessEnv = process.env): string {
  if (env['HF_HOME']) return join(env['HF_HOME'], 'hub');
  if (env['HUGGINGFACE_HUB_CACHE']) return env['HUGGINGFACE_HUB_CACHE'];
  return join(homedir(), '.cache', 'huggingface', 'hub');
}

/**
 * True when a model snapshot exists in the HF cache with at least one weight
 * file. Checks the filesystem only — never the network.
 */
export function isModelCached(cacheDir: string, repoId: string): boolean {
  const dirName = `models--${repoId.replace('/', '--')}`;
  const snapshots = join(cacheDir, dirName, 'snapshots');
  if (!existsSync(snapshots)) return false;
  try {
    for (const rev of readdirSync(snapshots)) {
      const files = readdirSync(join(snapshots, rev));
      if (files.some((f) => f.endsWith('.safetensors'))) return true;
    }
  } catch {
    return false;
  }
  return false;
}

/** Approximate download size per model, in bytes. */
export const MODEL_SIZES: Record<string, number> = {
  'Qwen/Qwen3-ASR-1.7B': 4_400_000_000,
  'Qwen/Qwen3-ASR-0.6B': 1_500_000_000,
};

export function modelSize(repoId: string): number {
  return MODEL_SIZES[repoId] ?? 0;
}

/** Parses the major version out of `22.11.0` or `v22.11.0`. */
export function parseNodeMajor(version: string): number {
  const major = Number.parseInt(version.replace(/^v/, '').split('.')[0] ?? '', 10);
  return Number.isFinite(major) ? major : 0;
}

/** Probes the machine for everything the pipeline needs. Read-only. */
export async function detect(
  modelRepoId: string,
  deps: DetectDeps = {},
): Promise<Probe> {
  const which = deps.which ?? defaultWhich;
  const env = deps.env ?? process.env;
  const platform = deps.platform ?? toPlatform(process.platform);
  const arch = deps.arch ?? process.arch;
  const nodeVersion = deps.nodeVersion ?? process.versions.node;
  const cacheDir = deps.hfCacheDir ?? hfCacheDir(env);

  const [uvPresent, ffmpegPresent, mlxPresent] = await Promise.all([
    which('uv'),
    which('ffmpeg'),
    which('mlx-qwen3-asr'),
  ]);

  const hfTokenPresent = Boolean(env['HF_TOKEN'] || env['PYANNOTE_AUTH_TOKEN']);

  return {
    platform,
    arch,
    nodeMajor: parseNodeMajor(nodeVersion),
    uv: { present: uvPresent },
    ffmpeg: { present: ffmpegPresent },
    mlxAsr: { present: mlxPresent },
    // The extras live inside the tool's own environment; the tool's `doctor`
    // command is the authority. Assume present when the tool is installed and
    // let a failed run surface the real answer.
    diarizeExtras: { present: mlxPresent },
    hfToken: { present: hfTokenPresent },
    model: {
      repoId: modelRepoId,
      cached: isModelCached(cacheDir, modelRepoId),
      bytes: modelSize(modelRepoId),
    },
  };
}
