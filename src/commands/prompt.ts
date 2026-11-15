import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { promptsDir } from '../core/config.js';

/** Absolute path to the bundled Mom Test prompt. */
export function bundledPromptPath(): string {
  return fileURLToPath(new URL('../prompts/mom-test.md', import.meta.url));
}

/** Reads the bundled default prompt. */
export function readBundledPrompt(): string {
  return readFileSync(bundledPromptPath(), 'utf8');
}

/**
 * Copies the bundled prompt into the config directory so it can be edited in
 * place. Never overwrites an existing file.
 */
export function installPrompt(name = 'mom-test'): string {
  const dir = promptsDir();
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const target = join(dir, `${name}.md`);
  if (!existsSync(target)) {
    writeFileSync(target, readBundledPrompt(), { mode: 0o600 });
  }
  return target;
}

/**
 * Resolves the prompt text: an explicit file wins, then the user's copy in the
 * config directory, then the bundled default.
 */
export function resolvePrompt(explicitPath?: string | undefined, name = 'mom-test'): string {
  if (explicitPath) {
    return readFileSync(explicitPath, 'utf8');
  }
  const userCopy = join(promptsDir(), `${name}.md`);
  if (existsSync(userCopy)) {
    return readFileSync(userCopy, 'utf8');
  }
  return readBundledPrompt();
}
