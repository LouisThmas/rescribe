import { describe, expect, it, vi } from 'vitest';
import { executeRepair, executeRepairs } from '../src/bootstrap/install.js';
import { buildDownloadCommand, buildDownloadScript, ensureModel } from '../src/bootstrap/models.js';
import type { Repair } from '../src/bootstrap/plan.js';

const installRepair: Repair = {
  id: 'install-uv',
  kind: 'install',
  title: 'uv',
  detail: 'runner',
  command: ['uv', '--version'],
};

const manualRepair: Repair = {
  id: 'hf-token',
  kind: 'manual',
  title: 'token',
  detail: 'manual step',
  command: [],
};

describe('executeRepair', () => {
  it('reports success on exit code 0', async () => {
    const runner = vi.fn().mockResolvedValue({ code: 0, stdout: '', stderr: '' });
    const result = await executeRepair(installRepair, { runner });
    expect(result.ok).toBe(true);
    expect(runner).toHaveBeenCalledWith(['uv', '--version'], undefined, undefined);
  });

  it('reports failure with the tail of stderr', async () => {
    const runner = vi.fn().mockResolvedValue({
      code: 1,
      stdout: '',
      stderr: 'line1\nline2\nreal problem here',
    });
    const result = await executeRepair(installRepair, { runner });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('real problem here');
  });

  it('treats a manual repair as a no-op success', async () => {
    const runner = vi.fn();
    const result = await executeRepair(manualRepair, { runner });
    expect(result.ok).toBe(true);
    expect(runner).not.toHaveBeenCalled();
  });

  it('surfaces a spawn error instead of throwing', async () => {
    const runner = vi.fn().mockRejectedValue(new Error('ENOENT'));
    const result = await executeRepair(installRepair, { runner });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('ENOENT');
  });

  it('fails cleanly when an install repair has no command', async () => {
    const result = await executeRepair({ ...installRepair, command: [] });
    expect(result.ok).toBe(false);
  });
});

describe('executeRepairs', () => {
  it('runs repairs in order', async () => {
    const seen: string[] = [];
    const runner = vi.fn(async (cmd: string[]) => {
      seen.push(cmd[0] ?? '');
      return { code: 0, stdout: '', stderr: '' };
    });
    await executeRepairs(
      [installRepair, { ...installRepair, id: 'b', command: ['brew', 'x'] }],
      { runner },
    );
    expect(seen).toEqual(['uv', 'brew']);
  });

  it('stops at the first failure', async () => {
    const runner = vi.fn(async (cmd: string[]) =>
      cmd[0] === 'uv'
        ? { code: 1, stdout: '', stderr: 'boom' }
        : { code: 0, stdout: '', stderr: '' },
    );
    const results = await executeRepairs(
      [installRepair, { ...installRepair, id: 'b', command: ['brew', 'x'] }],
      { runner },
    );
    expect(results).toHaveLength(1);
    expect(runner).toHaveBeenCalledTimes(1);
  });
});

describe('buildDownloadScript', () => {
  it('uses snapshot_download with the repo id', () => {
    expect(buildDownloadScript('Qwen/Qwen3-ASR-1.7B')).toContain(
      'snapshot_download(repo_id="Qwen/Qwen3-ASR-1.7B"',
    );
  });

  it('restricts patterns to model files', () => {
    const script = buildDownloadScript('m');
    expect(script).toContain('*.safetensors');
    expect(script).toContain('*.json');
  });
});

describe('buildDownloadCommand', () => {
  it('runs python through uv with huggingface_hub available', () => {
    const cmd = buildDownloadCommand('m');
    expect(cmd.slice(0, 5)).toEqual(['uv', 'run', '--quiet', '--with', 'huggingface_hub']);
  });

  it('includes the script as the final argument', () => {
    const cmd = buildDownloadCommand('m');
    expect(cmd.at(-1)).toContain('snapshot_download');
  });
});

describe('ensureModel', () => {
  it('skips the download when the model is already cached', async () => {
    const runner = vi.fn();
    const result = await ensureModel({
      repoId: 'Qwen/Qwen3-ASR-1.7B',
      runner,
      cacheDir: '/tmp/rescribe-nonexistent-cache',
    });
    expect(result.skipped).toBe(false);
    expect(runner).toHaveBeenCalled();
  });

  it('reports failure with the tail of stderr', async () => {
    const runner = vi.fn().mockResolvedValue({ code: 1, stdout: '', stderr: 'gated repo' });
    const result = await ensureModel({
      repoId: 'm',
      runner,
      cacheDir: '/tmp/rescribe-nonexistent-cache',
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('gated repo');
  });

  it('passes the token through the environment', async () => {
    const runner = vi.fn().mockResolvedValue({ code: 0, stdout: '', stderr: '' });
    await ensureModel({
      repoId: 'm',
      token: 'hf_secret',
      runner,
      cacheDir: '/tmp/rescribe-nonexistent-cache',
    });
    const env = runner.mock.calls[0]?.[2] as NodeJS.ProcessEnv | undefined;
    expect(env?.['HF_TOKEN']).toBe('hf_secret');
  });

  it('lets the model downloader render progress directly to the terminal', async () => {
    const runner = vi.fn().mockResolvedValue({ code: 0, stdout: '', stderr: '' });
    await ensureModel({
      repoId: 'm',
      runner,
      cacheDir: '/tmp/rescribe-nonexistent-cache',
    });
    expect(runner.mock.calls[0]?.[3]).toEqual({ stderr: 'inherit' });
  });
});
