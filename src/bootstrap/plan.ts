export type Platform = 'darwin' | 'other';

export interface Probe {
  platform: Platform;
  arch: string;
  nodeMajor: number;
  uv: { present: boolean };
  ffmpeg: { present: boolean };
  mlxAsr: { present: boolean };
  diarizeExtras: { present: boolean };
  hfToken: { present: boolean };
  model: { repoId: string; cached: boolean; bytes: number };
}

export type RepairKind = 'install' | 'download' | 'manual';

export interface Repair {
  id: string;
  kind: RepairKind;
  title: string;
  detail: string;
  /** argv to run, for `install` and `download` kinds. */
  command: string[];
  /** Download size, when known. */
  sizeBytes?: number;
  /** Link the user must open themselves, for `manual` kinds. */
  url?: string;
  /** When true, the run cannot proceed without this. */
  required?: boolean;
}

export interface PlanOptions {
  diarize: boolean;
}

export const MIN_NODE_MAJOR = 20;

const PYANNOTE_URL = 'https://huggingface.co/pyannote/speaker-diarization-community-1';

function formatBytes(bytes: number): string {
  const gb = bytes / 1_000_000_000;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  return `${Math.round(bytes / 1_000_000)} MB`;
}

function ffmpegRepair(): Repair {
  return {
    id: 'install-ffmpeg',
    kind: 'install',
    title: 'ffmpeg',
    detail: 'Required to decode M4A/MP3 audio before transcription.',
    command: ['brew', 'install', 'ffmpeg'],
  };
}

/**
 * Turns an environment probe into an ordered list of repairs.
 *
 * Pure: no I/O, no side effects. Ordering matters — tooling installs come
 * before model downloads, and uv comes before anything installed through it.
 */
export function planRepairs(probe: Probe, options: PlanOptions = { diarize: true }): Repair[] {
  const repairs: Repair[] = [];

  if (probe.nodeMajor < MIN_NODE_MAJOR) {
    repairs.push({
      id: 'upgrade-node',
      kind: 'manual',
      title: `Node ${MIN_NODE_MAJOR}+ required`,
      detail: `You are running Node ${probe.nodeMajor}. Upgrade Node, then re-run.`,
      command: [],
      url: 'https://nodejs.org/en/download',
      required: true,
    });
  }

  // Local transcription is supported only on macOS with Apple Silicon.
  const mlxSupported = probe.platform === 'darwin' && probe.arch === 'arm64';
  if (!mlxSupported) return repairs;

  if (!probe.uv.present) {
    repairs.push({
      id: 'install-uv',
      kind: 'install',
      title: 'uv',
      detail: 'Python tool runner used to install and run the transcription engine.',
      command: ['sh', '-c', 'curl -LsSf https://astral.sh/uv/install.sh | sh'],
    });
  }

  if (!probe.ffmpeg.present) {
    repairs.push(ffmpegRepair());
  }

  // MLX is Apple-Silicon-only; never offer it elsewhere.
  if (!probe.mlxAsr.present) {
    const extra = options.diarize ? '[diarize]' : '';
    repairs.push({
      id: 'install-mlx-asr',
      kind: 'install',
      title: 'mlx-qwen3-asr',
      detail: options.diarize
        ? 'Local transcription engine, with speaker diarization support.'
        : 'Local transcription engine.',
      command: ['uv', 'tool', 'install', `mlx-qwen3-asr${extra}`],
    });
  }

  if (probe.mlxAsr.present && options.diarize && !probe.diarizeExtras.present) {
    repairs.push({
      id: 'install-diarize-extras',
      kind: 'install',
      title: 'diarization extras',
      detail: 'Adds pyannote.audio, torch and torchcodec for speaker labels.',
      command: ['uv', 'tool', 'install', 'mlx-qwen3-asr[diarize]', '--force'],
    });
  }

  if (options.diarize && !probe.hfToken.present) {
    repairs.push({
      id: 'hf-token',
      kind: 'manual',
      title: 'Hugging Face token',
      detail:
        'Speaker diarization uses a gated model. Accept its terms in the browser, then paste a token. Without it, interview-rescribe continues without speaker labels.',
      command: [],
      url: PYANNOTE_URL,
    });
  }

  if (!probe.model.cached) {
    repairs.push({
      id: 'download-model',
      kind: 'download',
      title: probe.model.repoId,
      detail: `Speech model weights, downloaded once to the Hugging Face cache.`,
      command: [],
      sizeBytes: probe.model.bytes,
    });
  }

  return repairs;
}

/** Human-readable size for a repair, or undefined when it has none. */
export function repairSize(repair: Repair): string | undefined {
  return repair.sizeBytes === undefined ? undefined : formatBytes(repair.sizeBytes);
}
