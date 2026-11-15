import { spawn } from 'node:child_process';
import type { Repair } from './plan.js';

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

export type Runner = (
  command: string[],
  onLine?: ((line: string) => void) | undefined,
  env?: NodeJS.ProcessEnv | undefined,
  options?: { stderr?: 'pipe' | 'inherit' } | undefined,
) => Promise<RunResult>;

/** Spawns a command, streaming output line by line. */
export const defaultRunner: Runner = (command, onLine, env, options) =>
  new Promise((resolve, reject) => {
    const [bin, ...args] = command;
    if (!bin) {
      reject(new Error('Empty command'));
      return;
    }
    const child = spawn(bin, args, {
      stdio: ['ignore', 'pipe', options?.stderr === 'inherit' ? 'inherit' : 'pipe'],
      ...(env ? { env } : {}),
    });
    let stdout = '';
    let stderr = '';

    const consume = (chunk: Buffer, sink: 'out' | 'err'): void => {
      const text = chunk.toString();
      if (sink === 'out') stdout += text;
      else stderr += text;
      if (onLine) {
        for (const line of text.split('\n')) {
          if (line.trim() !== '') onLine(line);
        }
      }
    };

    child.stdout?.on('data', (c: Buffer) => consume(c, 'out'));
    child.stderr?.on('data', (c: Buffer) => consume(c, 'err'));
    child.on('error', reject);
    child.on('close', (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });

export interface ExecuteOptions {
  runner?: Runner;
  onLine?: ((line: string) => void) | undefined;
  onStart?: ((repair: Repair) => void) | undefined;
  env?: NodeJS.ProcessEnv | undefined;
}

export interface ExecuteResult {
  repair: Repair;
  ok: boolean;
  error?: string;
}

/**
 * Runs a single approved repair. Only `install` repairs carry a command;
 * `manual` repairs are the caller's responsibility to guide.
 */
export async function executeRepair(
  repair: Repair,
  options: ExecuteOptions = {},
): Promise<ExecuteResult> {
  if (repair.kind === 'manual') {
    return { repair, ok: true };
  }
  if (repair.command.length === 0) {
    return { repair, ok: false, error: 'No command to run' };
  }

  const runner = options.runner ?? defaultRunner;
  try {
    options.onStart?.(repair);
    const result = await runner(repair.command, options.onLine, options.env);
    if (result.code !== 0) {
      const detail = result.stderr.trim().split('\n').slice(-3).join('\n');
      return { repair, ok: false, error: detail || `exited with code ${result.code}` };
    }
    return { repair, ok: true };
  } catch (err) {
    return { repair, ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Runs repairs in order, stopping at the first failure. */
export async function executeRepairs(
  repairs: Repair[],
  options: ExecuteOptions = {},
): Promise<ExecuteResult[]> {
  const results: ExecuteResult[] = [];
  for (const repair of repairs) {
    const result = await executeRepair(repair, options);
    results.push(result);
    if (!result.ok) break;
  }
  return results;
}
