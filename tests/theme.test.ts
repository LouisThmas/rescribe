import { describe, expect, it } from 'vitest';
import { banner, stepHeader, stepLine, statusBadge, formatBytes } from '../src/ui/theme.js';

describe('banner', () => {
  it('includes the product name', () => {
    expect(banner()).toContain('interview-rescribe');
  });

  it('is multi-line', () => {
    expect(banner().split('\n').length).toBeGreaterThan(1);
  });

  it('draws every line the same visible width', () => {
    const widths = banner()
      .split('\n')
      .map((line) => line.replace(/\u001b\[[0-9;]*m/g, '').length);
    expect(new Set(widths).size).toBe(1);
  });

  it('closes the box with corners on the first and last line', () => {
    const lines = banner()
      .split('\n')
      .map((line) => line.replace(/\u001b\[[0-9;]*m/g, ''));
    expect(lines[0]?.startsWith('┌')).toBe(true);
    expect(lines[0]?.endsWith('┐')).toBe(true);
    expect(lines.at(-1)?.startsWith('└')).toBe(true);
    expect(lines.at(-1)?.endsWith('┘')).toBe(true);
  });

  it('borders the middle rows with vertical bars', () => {
    const lines = banner()
      .split('\n')
      .slice(1, -1)
      .map((line) => line.replace(/\u001b\[[0-9;]*m/g, ''));
    expect(lines.every((line) => line.startsWith('│') && line.endsWith('│'))).toBe(true);
  });
});

describe('stepHeader', () => {
  it('shows the current step out of the total', () => {
    expect(stepHeader(2, 4, 'Format')).toContain('2/4');
  });

  it('shows the step label', () => {
    expect(stepHeader(1, 4, 'Transcribe')).toContain('Transcribe');
  });

  it('shows the detail when provided', () => {
    expect(stepHeader(1, 4, 'Transcribe', 'mlx · 1.7B')).toContain('mlx · 1.7B');
  });

  it('omits the separator when there is no detail', () => {
    expect(stepHeader(1, 4, 'Transcribe')).not.toContain('·');
  });
});

describe('stepLine', () => {
  it('renders an index, label and status', () => {
    const line = stepLine(1, 3, 'uv', 'missing');
    expect(line).toContain('1/3');
    expect(line).toContain('uv');
    expect(line).toContain('missing');
  });
});

describe('statusBadge', () => {
  it('renders each status distinctly', () => {
    const badges = (['ok', 'warn', 'miss', 'skip'] as const).map(statusBadge);
    expect(new Set(badges).size).toBe(4);
  });

  it('renders ok as OK', () => {
    expect(statusBadge('ok')).toContain('OK');
  });

  it('pads every badge to the same visible width', () => {
    const widths = (['ok', 'warn', 'miss', 'skip'] as const).map(
      (s) => statusBadge(s).replace(/\u001b\[[0-9;]*m/g, '').length,
    );
    expect(new Set(widths).size).toBe(1);
  });
});

describe('formatBytes', () => {
  it('formats gigabytes', () => {
    expect(formatBytes(4_400_000_000)).toBe('4.4 GB');
  });

  it('formats megabytes', () => {
    expect(formatBytes(32_000_000)).toBe('32 MB');
  });

  it('formats kilobytes', () => {
    expect(formatBytes(2048)).toBe('2 KB');
  });

  it('formats bytes', () => {
    expect(formatBytes(512)).toBe('512 B');
  });
});
