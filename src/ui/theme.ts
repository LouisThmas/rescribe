/** ANSI helpers. Colour is opt-out via NO_COLOR, per the informal standard. */
const useColor = (): boolean => !process.env['NO_COLOR'] && process.stdout.isTTY !== false;

const wrap = (code: number, text: string): string =>
  useColor() ? `\u001b[${code}m${text}\u001b[0m` : text;

export const dim = (t: string): string => wrap(2, t);
export const bold = (t: string): string => wrap(1, t);
export const green = (t: string): string => wrap(32, t);
export const yellow = (t: string): string => wrap(33, t);
export const red = (t: string): string => wrap(31, t);
export const cyan = (t: string): string => wrap(36, t);
export const magenta = (t: string): string => wrap(35, t);

const WIDTH = 46;

/** Length of a string ignoring ANSI escape sequences. */
const visibleLength = (text: string): number => text.replace(/\u001b\[[0-9;]*m/g, '').length;

/** Box-drawing banner shown once at startup. */
export function banner(): string {
  const subtitle = 'interview → transcript → report';
  const inner = WIDTH - 2;
  const center = (text: string): string => {
    const pad = Math.max(0, inner - visibleLength(text));
    const left = Math.floor(pad / 2);
    return `${' '.repeat(left)}${text}${' '.repeat(pad - left)}`;
  };
  const row = (content: string): string => `${dim('│')}${content}${dim('│')}`;

  return [
    dim(`┌${'─'.repeat(inner)}┐`),
    row(center(bold(cyan(' interview-rescribe ')))),
    row(center(dim(subtitle))),
    dim(`└${'─'.repeat(inner)}┘`),
  ].join('\n');
}

/** `1/4  Transcribe   mlx · Qwen3-ASR-1.7B` */
export function stepHeader(
  current: number,
  total: number,
  label: string,
  detail?: string,
): string {
  const counter = dim(`${current}/${total}`);
  const name = bold(label);
  return detail ? `${counter}  ${name}   ${dim(detail)}` : `${counter}  ${name}`;
}

/** `1/3  uv                    missing` */
export function stepLine(
  current: number,
  total: number,
  label: string,
  status: string,
): string {
  const counter = dim(`${current}/${total}`);
  const padded = label.padEnd(22);
  return `${counter}  ${padded}${dim(status)}`;
}

export type Status = 'ok' | 'warn' | 'miss' | 'skip';

const BADGE_WIDTH = 6;

/** Compact status marker for doctor output, padded to a uniform width. */
export function statusBadge(status: Status): string {
  const pad = (text: string): string => text.padEnd(BADGE_WIDTH);
  switch (status) {
    case 'ok':
      return green(pad('[OK]'));
    case 'warn':
      return yellow(pad('[WARN]'));
    case 'miss':
      return red(pad('[MISS]'));
    case 'skip':
      return dim(pad('[SKIP]'));
  }
}

/** Human-readable byte size. */
export function formatBytes(bytes: number): string {
  if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
  if (bytes >= 1_000_000) return `${Math.round(bytes / 1_000_000)} MB`;
  if (bytes >= 1_000) return `${Math.round(bytes / 1_000)} KB`;
  return `${bytes} B`;
}

/** A simple progress bar for long downloads. */
export function progressBar(fraction: number, width = 28): string {
  const clamped = Math.min(1, Math.max(0, fraction));
  const filled = Math.round(clamped * width);
  return `${green('█'.repeat(filled))}${dim('░'.repeat(width - filled))} ${String(
    Math.round(clamped * 100),
  ).padStart(3)}%`;
}
