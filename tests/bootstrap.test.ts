import { describe, expect, it } from 'vitest';
import { planRepairs, type Probe } from '../src/bootstrap/plan.js';

const healthy: Probe = {
  platform: 'darwin',
  arch: 'arm64',
  nodeMajor: 26,
  uv: { present: true },
  ffmpeg: { present: true },
  mlxAsr: { present: true },
  diarizeExtras: { present: true },
  hfToken: { present: true },
  model: { repoId: 'Qwen/Qwen3-ASR-1.7B', cached: true, bytes: 4_400_000_000 },
};

describe('planRepairs', () => {
  it('plans nothing when the environment is healthy', () => {
    expect(planRepairs(healthy)).toEqual([]);
  });

  it('plans a uv install when uv is missing', () => {
    const repairs = planRepairs({ ...healthy, uv: { present: false } });
    expect(repairs.map((r) => r.id)).toContain('install-uv');
  });

  it('plans an ffmpeg install when ffmpeg is missing', () => {
    const repairs = planRepairs({ ...healthy, ffmpeg: { present: false } });
    expect(repairs.map((r) => r.id)).toContain('install-ffmpeg');
  });

  it('uses brew for ffmpeg on macOS', () => {
    const mac = planRepairs({ ...healthy, ffmpeg: { present: false } });
    expect(mac.find((r) => r.id === 'install-ffmpeg')?.command).toContain('brew');
  });

  it('does not offer platform-specific installs on unsupported systems', () => {
    const repairs = planRepairs(
      {
        ...healthy,
        platform: 'other',
        arch: 'x64',
        uv: { present: false },
        ffmpeg: { present: false },
        mlxAsr: { present: false },
        diarizeExtras: { present: false },
        model: { repoId: 'Qwen/Qwen3-ASR-1.7B', cached: false, bytes: 4_400_000_000 },
      },
      { diarize: true },
    );
    expect(repairs.map((r) => r.id)).toEqual([]);
  });

  it('plans the mlx tool install when it is missing', () => {
    const repairs = planRepairs({ ...healthy, mlxAsr: { present: false } });
    const repair = repairs.find((r) => r.id === 'install-mlx-asr');
    expect(repair?.command.join(' ')).toContain('uv tool install mlx-qwen3-asr');
  });

  it('includes the diarize extra when diarization is wanted', () => {
    const repairs = planRepairs({ ...healthy, mlxAsr: { present: false } }, { diarize: true });
    const repair = repairs.find((r) => r.id === 'install-mlx-asr');
    expect(repair?.command.join(' ')).toContain('[diarize]');
  });

  it('omits the diarize extra when diarization is not wanted', () => {
    const repairs = planRepairs({ ...healthy, mlxAsr: { present: false } }, { diarize: false });
    const repair = repairs.find((r) => r.id === 'install-mlx-asr');
    expect(repair?.command.join(' ')).not.toContain('[diarize]');
  });

  it('plans a model download when the model is not cached', () => {
    const repairs = planRepairs({
      ...healthy,
      model: { repoId: 'Qwen/Qwen3-ASR-1.7B', cached: false, bytes: 4_400_000_000 },
    });
    const repair = repairs.find((r) => r.id === 'download-model');
    expect(repair?.sizeBytes).toBe(4_400_000_000);
  });

  it('never plans a model download when the model is already cached', () => {
    const repairs = planRepairs(healthy);
    expect(repairs.map((r) => r.id)).not.toContain('download-model');
  });

  it('plans a manual step for the gated diarization token', () => {
    const repairs = planRepairs({ ...healthy, hfToken: { present: false } }, { diarize: true });
    const repair = repairs.find((r) => r.id === 'hf-token');
    expect(repair?.kind).toBe('manual');
    expect(repair?.url).toContain('huggingface.co');
  });

  it('does not plan a token step when diarization is not wanted', () => {
    const repairs = planRepairs({ ...healthy, hfToken: { present: false } }, { diarize: false });
    expect(repairs.map((r) => r.id)).not.toContain('hf-token');
  });

  it('never offers MLX on unsupported systems', () => {
    const repairs = planRepairs({
      ...healthy,
      platform: 'other',
      mlxAsr: { present: false },
    });
    expect(repairs.map((r) => r.id)).not.toContain('install-mlx-asr');
  });

  it('flags an unsupported Node version as unfixable', () => {
    const repairs = planRepairs({ ...healthy, nodeMajor: 18 });
    const repair = repairs.find((r) => r.id === 'upgrade-node');
    expect(repair?.kind).toBe('manual');
    expect(repair?.required).toBe(true);
  });

  it('orders installs before downloads', () => {
    const repairs = planRepairs({
      ...healthy,
      uv: { present: false },
      mlxAsr: { present: false },
      model: { repoId: 'm', cached: false, bytes: 1 },
    });
    const ids = repairs.map((r) => r.id);
    expect(ids.indexOf('install-uv')).toBeLessThan(ids.indexOf('install-mlx-asr'));
    expect(ids.indexOf('install-mlx-asr')).toBeLessThan(ids.indexOf('download-model'));
  });

  it('marks every repair with a human-readable title and detail', () => {
    const repairs = planRepairs({
      ...healthy,
      uv: { present: false },
      ffmpeg: { present: false },
      mlxAsr: { present: false },
      model: { repoId: 'm', cached: false, bytes: 1 },
    });
    for (const r of repairs) {
      expect(r.title.length).toBeGreaterThan(0);
      expect(r.detail.length).toBeGreaterThan(0);
    }
  });
});
