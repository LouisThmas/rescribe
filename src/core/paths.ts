import { basename, dirname, extname, join } from 'node:path';

/** Strips the final extension from a path. */
export function stem(path: string): string {
  return basename(path, extname(path));
}

/** Directory containing the given file. */
export function dirOf(path: string): string {
  return dirname(path);
}

/**
 * Output path for a derived artifact. Defaults to sitting next to the input
 * file, which keeps a run's outputs together.
 */
export function resolveOutputPath(input: string, suffix: string, outDir?: string): string {
  const dir = outDir ?? dirOf(input);
  return join(dir, `${stem(input)}${suffix}`);
}

/** Default output directory for a run: the directory containing the audio. */
export function defaultRunDir(audio: string): string {
  return dirOf(audio);
}
