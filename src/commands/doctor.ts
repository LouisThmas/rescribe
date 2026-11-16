import { detect } from '../bootstrap/detect.js';
import { planRepairs, type Probe, type Repair } from '../bootstrap/plan.js';
import { dim, statusBadge, type Status } from '../ui/theme.js';
import type { ReportConfig } from '../core/config.js';

export interface DoctorRow {
  label: string;
  status: Status;
  detail: string;
  muted?: boolean;
}

/** Turns a probe into the rows shown by `interview-rescribe doctor`. */
export function buildDoctorRows(
  probe: Probe,
  diarize: boolean,
  reportConfig?: ReportConfig,
): DoctorRow[] {
  const mlxOk = probe.platform === 'darwin' && probe.arch === 'arm64';
  const rows: DoctorRow[] = [
    {
      label: 'Platform',
      status: mlxOk ? 'ok' : 'miss',
      detail: mlxOk ? 'macOS Apple Silicon' : `unsupported (${probe.platform}/${probe.arch})`,
    },
    {
      label: 'Node',
      status: probe.nodeMajor >= 20 ? 'ok' : 'miss',
      detail: `v${probe.nodeMajor}`,
    },
    {
      label: 'uv',
      status: probe.uv.present ? 'ok' : 'miss',
      detail: probe.uv.present ? 'installed' : 'not found',
    },
    {
      label: 'ffmpeg',
      status: probe.ffmpeg.present ? 'ok' : 'miss',
      detail: probe.ffmpeg.present ? 'installed' : 'not found',
    },
  ];

  rows.push({
    label: 'mlx-qwen3-asr',
    status: !mlxOk ? 'skip' : probe.mlxAsr.present ? 'ok' : 'miss',
    detail: !mlxOk
      ? `not supported on ${probe.platform}/${probe.arch}`
      : probe.mlxAsr.present
        ? 'installed'
        : 'not found',
  });

  rows.push({
    label: 'diarization',
    status: !diarize ? 'skip' : probe.hfToken.present ? 'ok' : 'warn',
    detail: !diarize
      ? 'disabled'
      : probe.hfToken.present
        ? 'token present'
        : 'no HF token — speaker labels unavailable',
  });

  rows.push({
    label: 'model',
    status: probe.model.cached ? 'ok' : 'warn',
    detail: `${probe.model.cached ? 'cached' : 'not downloaded yet'} (${probe.model.repoId})`,
    muted: true,
  });

  if (reportConfig) {
    const activeProvider = reportConfig.apiKey ? 'openrouter' : 'lmstudio';
    const openRouterConfigured = Boolean(reportConfig.apiKey);
    rows.push({
      label: 'OpenRouter setup',
      status: activeProvider === 'openrouter' ? 'ok' : 'skip',
      detail: openRouterConfigured
        ? `${activeProvider === 'openrouter' ? 'active' : 'configured, not selected'} · ${reportConfig.openrouterModel}`
        : `not configured · ${reportConfig.openrouterModel}`,
      muted: true,
    });
    rows.push({
      label: 'LM Studio setup',
      status: activeProvider === 'lmstudio' ? 'ok' : 'skip',
      detail: `${activeProvider === 'lmstudio' ? 'active' : 'configured, not selected'} · ${reportConfig.lmstudioModel}`,
      muted: true,
    });
  }

  return rows;
}

export interface DoctorReport {
  rows: DoctorRow[];
  repairs: Repair[];
  healthy: boolean;
}

/** Full diagnostic: probe, rows, and the repairs that would fix any gaps. */
export async function diagnose(
  modelRepoId: string,
  diarize: boolean,
  hfToken?: string,
  reportConfig?: ReportConfig,
): Promise<DoctorReport> {
  const probe = await detect(
    modelRepoId,
    hfToken ? { env: { ...process.env, HF_TOKEN: hfToken } } : {},
  );
  const rows = buildDoctorRows(probe, diarize, reportConfig);
  const repairs = planRepairs(probe, { diarize });
  return {
    rows,
    repairs,
    healthy: rows.every((r) => r.status === 'ok' || r.status === 'skip'),
  };
}

/** Renders the doctor rows as plain text. */
export function renderDoctor(report: DoctorReport): string {
  return report.rows
    .map(
      (row) =>
        `${statusBadge(row.status)} ${row.label.padEnd(18)}${row.muted ? dim(row.detail) : row.detail}`,
    )
    .join('\n');
}
