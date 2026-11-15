import type { Config } from '../core/config.js';
import { createMlxProvider } from './mlx.js';
import { createOpenAiAsrProvider } from './openai.js';
import type { AsrProvider } from './types.js';

export interface ResolveAsrOptions {
  /** Explicit provider request from the CLI. */
  requested?: 'mlx' | 'openai' | undefined;
  /** Whether MLX can run here (macOS on Apple Silicon). */
  mlxSupported: boolean;
}

/**
 * Chooses an ASR provider. An explicit request wins; otherwise MLX is used
 * where it can run, and the remote provider everywhere else.
 */
export function resolveAsrProvider(
  config: Config,
  options: ResolveAsrOptions,
): AsrProvider {
  const wantMlx = options.requested === 'mlx' || (options.requested === undefined && options.mlxSupported);

  if (wantMlx && options.mlxSupported) {
    return createMlxProvider();
  }
  return createOpenAiAsrProvider({
    baseUrl: config.asr.baseUrl,
    apiKey: config.asr.apiKey,
  });
}

/** True when MLX is usable on this platform/architecture. */
export function mlxSupported(platform = process.platform, arch = process.arch): boolean {
  return platform === 'darwin' && arch === 'arm64';
}
