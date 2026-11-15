import { isModelCached, hfCacheDir } from './detect.js';
import { defaultRunner, type Runner } from './install.js';

/**
 * Python one-liner that downloads a model snapshot into the standard Hugging
 * Face cache. Reusing `snapshot_download` keeps the cache layout identical to
 * what `mlx-qwen3-asr` expects, so nothing is downloaded twice.
 */
export function buildDownloadScript(repoId: string): string {
  return [
    'from huggingface_hub import snapshot_download',
    `snapshot_download(repo_id=${JSON.stringify(repoId)},`,
    ' allow_patterns=["*.json", "*.safetensors", "*.txt", "*.model"])',
  ].join('');
}

/** argv that runs the download script through uv, with an optional HF token. */
export function buildDownloadCommand(repoId: string, token?: string | undefined): string[] {
  const args = ['uv', 'run', '--quiet', '--with', 'huggingface_hub', 'python', '-c'];
  args.push(buildDownloadScript(repoId));
  return token ? [...args] : args;
}

export interface DownloadOptions {
  repoId: string;
  token?: string | undefined;
  runner?: Runner;
  onLine?: ((line: string) => void) | undefined;
  cacheDir?: string;
}

export interface DownloadResult {
  ok: boolean;
  skipped: boolean;
  error?: string;
}

/**
 * Ensures the model is present locally. Skips entirely when the cache already
 * holds a complete snapshot, so repeat runs never re-download 4.4 GB.
 */
export async function ensureModel(options: DownloadOptions): Promise<DownloadResult> {
  const cacheDir = options.cacheDir ?? hfCacheDir();
  if (isModelCached(cacheDir, options.repoId)) {
    return { ok: true, skipped: true };
  }

  const runner = options.runner ?? defaultRunner;
  const env = options.token ? { ...process.env, HF_TOKEN: options.token } : undefined;
  const command = buildDownloadCommand(options.repoId, options.token);

  try {
    const result = await runner(command, options.onLine, env, { stderr: 'inherit' });
    if (result.code !== 0) {
      const detail = result.stderr.trim().split('\n').slice(-3).join('\n');
      return { ok: false, skipped: false, error: detail || `exited with code ${result.code}` };
    }
    return { ok: true, skipped: false };
  } catch (err) {
    return {
      ok: false,
      skipped: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
