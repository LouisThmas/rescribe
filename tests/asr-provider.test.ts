import { describe, expect, it } from 'vitest';
import { mlxSupported, resolveAsrProvider } from '../src/asr/index.js';

describe('transcription platform support', () => {
  it('supports macOS on Apple Silicon', () => {
    expect(mlxSupported('darwin', 'arm64')).toBe(true);
    expect(resolveAsrProvider('darwin', 'arm64').name).toBe('mlx');
  });

  it('rejects platforms without local MLX support', () => {
    expect(mlxSupported('win32', 'x64')).toBe(false);
    expect(() => resolveAsrProvider('win32', 'x64')).toThrow(
      'Transcription is supported only on macOS with Apple Silicon.',
    );
  });
});
