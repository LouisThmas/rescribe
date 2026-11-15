import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { detect, hfCacheDir, isModelCached, modelSize } from '../src/bootstrap/detect.js';

function fakeCache(repoId: string, files: string[]): string {
  const root = mkdtempSync(join(tmpdir(), 'rescribe-cache-'));
  const snap = join(root, `models--${repoId.replace('/', '--')}`, 'snapshots', 'abc123');
  mkdirSync(snap, { recursive: true });
  for (const f of files) writeFileSync(join(snap, f), 'x');
  return root;
}

describe('isModelCached', () => {
  it('is true when a snapshot holds weights', () => {
    const root = fakeCache('Qwen/Qwen3-ASR-1.7B', ['config.json', 'model.safetensors']);
    expect(isModelCached(root, 'Qwen/Qwen3-ASR-1.7B')).toBe(true);
  });

  it('is false when the repo directory is absent', () => {
    const root = fakeCache('Qwen/Qwen3-ASR-1.7B', ['model.safetensors']);
    expect(isModelCached(root, 'Qwen/Qwen3-ASR-0.6B')).toBe(false);
  });

  it('is false when a snapshot has no weights yet', () => {
    const root = fakeCache('Qwen/Qwen3-ASR-1.7B', ['config.json']);
    expect(isModelCached(root, 'Qwen/Qwen3-ASR-1.7B')).toBe(false);
  });

  it('is false for a nonexistent cache root', () => {
    expect(isModelCached('/nope/not/here', 'Qwen/Qwen3-ASR-1.7B')).toBe(false);
  });
});

describe('hfCacheDir', () => {
  it('honours HF_HOME', () => {
    expect(hfCacheDir({ HF_HOME: '/custom' })).toBe('/custom/hub');
  });

  it('honours HUGGINGFACE_HUB_CACHE', () => {
    expect(hfCacheDir({ HUGGINGFACE_HUB_CACHE: '/direct' })).toBe('/direct');
  });

  it('falls back to the default cache location', () => {
    expect(hfCacheDir({})).toContain('.cache/huggingface/hub');
  });
});

describe('modelSize', () => {
  it('knows the 1.7B size', () => {
    expect(modelSize('Qwen/Qwen3-ASR-1.7B')).toBeGreaterThan(4_000_000_000);
  });

  it('knows the 0.6B size', () => {
    expect(modelSize('Qwen/Qwen3-ASR-0.6B')).toBeGreaterThan(1_000_000_000);
  });

  it('returns zero for an unknown model', () => {
    expect(modelSize('someone/unknown')).toBe(0);
  });
});

describe('detect', () => {
  it('reports a fully healthy machine', async () => {
    const probe = await detect('Qwen/Qwen3-ASR-1.7B', {
      which: async () => true,
      env: { HF_TOKEN: 'x' },
      platform: 'darwin',
      arch: 'arm64',
      nodeVersion: '26.12.0',
      hfCacheDir: fakeCache('Qwen/Qwen3-ASR-1.7B', ['model.safetensors']),
    });
    expect(probe.uv.present).toBe(true);
    expect(probe.ffmpeg.present).toBe(true);
    expect(probe.mlxAsr.present).toBe(true);
    expect(probe.hfToken.present).toBe(true);
    expect(probe.model.cached).toBe(true);
    expect(probe.nodeMajor).toBe(26);
  });

  it('reports missing tools', async () => {
    const probe = await detect('Qwen/Qwen3-ASR-1.7B', {
      which: async () => false,
      env: {},
      platform: 'linux',
      arch: 'x64',
      nodeVersion: '18.0.0',
      hfCacheDir: '/nope',
    });
    expect(probe.uv.present).toBe(false);
    expect(probe.ffmpeg.present).toBe(false);
    expect(probe.mlxAsr.present).toBe(false);
    expect(probe.hfToken.present).toBe(false);
    expect(probe.model.cached).toBe(false);
    expect(probe.nodeMajor).toBe(18);
  });

  it('parses a v-prefixed node version', async () => {
    const probe = await detect('m', {
      which: async () => true,
      env: {},
      platform: 'darwin',
      arch: 'arm64',
      nodeVersion: 'v22.11.0',
      hfCacheDir: '/nope',
    });
    expect(probe.nodeMajor).toBe(22);
  });

  it('falls back to 0 for an unparseable node version', async () => {
    const probe = await detect('m', {
      which: async () => true,
      env: {},
      platform: 'darwin',
      arch: 'arm64',
      nodeVersion: 'unknown',
      hfCacheDir: '/nope',
    });
    expect(probe.nodeMajor).toBe(0);
  });

  it('accepts PYANNOTE_AUTH_TOKEN as a token source', async () => {    const probe = await detect('m', {
      which: async () => true,
      env: { PYANNOTE_AUTH_TOKEN: 'x' },
      hfCacheDir: '/nope',
    });
    expect(probe.hfToken.present).toBe(true);
  });
});
