import { createMlxProvider } from './mlx.js';
import type { AsrProvider } from './types.js';

/** True when MLX is usable on this platform/architecture. */
export function mlxSupported(platform: string = process.platform, arch = process.arch): boolean {
  return platform === 'darwin' && arch === 'arm64';
}

/** Creates the only supported transcription provider, failing on other platforms. */
export function resolveAsrProvider(platform = process.platform, arch = process.arch): AsrProvider {
  if (!mlxSupported(platform, arch)) {
    throw new Error('Transcription is supported only on macOS with Apple Silicon.');
  }
  return createMlxProvider();
}
