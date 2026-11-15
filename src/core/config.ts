import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export type ReportProvider = 'openrouter' | 'lmstudio';
export type AsrProvider = 'mlx' | 'openai';

export interface AsrConfig {
  provider: AsrProvider;
  model: string;
  language: string;
  diarize: boolean;
  timestamps: boolean;
  /** Base URL for the `openai` ASR provider. */
  baseUrl: string;
  apiKey: string;
  hfToken: string;
}

export interface ReportConfig {
  provider: ReportProvider;
  openrouterModel: string;
  lmstudioModel: string;
  /** Per-invocation model override from --report-model. */
  model?: string | undefined;
  baseUrl: string;
  lmstudioUrl: string;
  apiKey: string;
}

export interface DefaultsConfig {
  speakers: number;
  prompt: string;
}

export interface Config {
  asr: AsrConfig;
  report: ReportConfig;
  defaults: DefaultsConfig;
}

export const DEFAULT_CONFIG: Config = {
  asr: {
    provider: 'mlx',
    model: 'Qwen/Qwen3-ASR-1.7B',
    language: 'auto',
    diarize: true,
    timestamps: true,
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    hfToken: '',
  },
  report: {
    provider: 'openrouter',
    openrouterModel: 'openai/gpt-5.2',
    lmstudioModel: 'local-model',
    baseUrl: 'https://openrouter.ai/api/v1',
    lmstudioUrl: 'http://localhost:1234/v1',
    apiKey: '',
  },
  defaults: {
    speakers: 2,
    prompt: 'mom-test',
  },
};

export interface ConfigEnv {
  RESCRIBE_OPENROUTER_API_KEY?: string | undefined;
  RESCRIBE_LMSTUDIO_URL?: string | undefined;
  RESCRIBE_ASR_API_KEY?: string | undefined;
  RESCRIBE_ASR_BASE_URL?: string | undefined;
  HF_TOKEN?: string | undefined;
  PYANNOTE_AUTH_TOKEN?: string | undefined;
}

/** A partial config tree; every level is optional and undefined values are ignored. */
export type ConfigPatch = {
  [K in keyof Config]?: Partial<Config[K]>;
};

export interface MergeInput {
  file?: ConfigPatch | undefined;
  env?: ConfigEnv | undefined;
  flags?: ConfigPatch | undefined;
}

function applyPatch(base: Config, patch: ConfigPatch | undefined): Config {
  if (!patch) return base;
  const next = structuredClone(base);
  for (const key of Object.keys(patch) as (keyof Config)[]) {
    const section = patch[key];
    if (!section) continue;
    for (const [field, value] of Object.entries(section)) {
      if (value === undefined) continue;
      (next[key] as unknown as Record<string, unknown>)[field] = value;
    }
  }
  return next;
}

/**
 * Resolves configuration with the precedence: defaults < file < env < flags.
 * Undefined values at any level are ignored so they never clobber a lower layer.
 */
export function mergeConfig({ file, env, flags }: MergeInput = {}): Config {
  let filePatch = file;
  const legacyReport = file?.report as (Partial<ReportConfig> & { model?: string }) | undefined;
  if (legacyReport?.model !== undefined) {
    const report: Partial<ReportConfig> = { ...legacyReport };
    if (legacyReport.provider === 'lmstudio') {
      report.lmstudioModel ??= legacyReport.model;
    } else {
      report.openrouterModel ??= legacyReport.model;
    }
    delete report.model;
    filePatch = { ...file, report };
  }
  let cfg = applyPatch(DEFAULT_CONFIG, filePatch);

  if (env) {
    const envPatch: ConfigPatch = {};
    if (env.RESCRIBE_OPENROUTER_API_KEY !== undefined) {
      envPatch.report = { ...envPatch.report, apiKey: env.RESCRIBE_OPENROUTER_API_KEY };
    }
    if (env.RESCRIBE_LMSTUDIO_URL !== undefined) {
      envPatch.report = { ...envPatch.report, lmstudioUrl: env.RESCRIBE_LMSTUDIO_URL };
    }
    if (env.RESCRIBE_ASR_API_KEY !== undefined) {
      envPatch.asr = { ...envPatch.asr, apiKey: env.RESCRIBE_ASR_API_KEY };
    }
    if (env.RESCRIBE_ASR_BASE_URL !== undefined) {
      envPatch.asr = { ...envPatch.asr, baseUrl: env.RESCRIBE_ASR_BASE_URL };
    }
    if (env.HF_TOKEN !== undefined) {
      envPatch.asr = { ...envPatch.asr, hfToken: env.HF_TOKEN };
    } else if (env.PYANNOTE_AUTH_TOKEN !== undefined) {
      envPatch.asr = { ...envPatch.asr, hfToken: env.PYANNOTE_AUTH_TOKEN };
    }
    cfg = applyPatch(cfg, envPatch);
  }

  return applyPatch(cfg, flags);
}

/** An explicit request wins; otherwise prefer OpenRouter whenever a key exists. */
export function resolveProvider(
  cfg: Config,
  requested?: ReportProvider | undefined,
): ReportProvider {
  if (requested) return requested;
  return cfg.report.apiKey ? 'openrouter' : 'lmstudio';
}

/** Model ID for the resolved provider, honoring a per-invocation override. */
export function reportModel(
  cfg: Config,
  provider = resolveProvider(cfg),
): string {
  if (cfg.report.model) return cfg.report.model;
  return provider === 'openrouter'
    ? cfg.report.openrouterModel
    : cfg.report.lmstudioModel;
}

/** Base URL actually used for the resolved provider. */
export function reportBaseUrl(cfg: Config, provider = resolveProvider(cfg)): string {
  return provider === 'lmstudio' ? cfg.report.lmstudioUrl : cfg.report.baseUrl;
}

export function configDir(): string {
  return join(homedir(), '.config', 'rescribe');
}

export function configPath(): string {
  return join(configDir(), 'config.json');
}

export function promptsDir(): string {
  return join(configDir(), 'prompts');
}

/** Reads the config file, returning an empty patch when it is absent or unreadable. */
export function readConfigFile(path = configPath()): ConfigPatch {
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    return parsed as ConfigPatch;
  } catch {
    return {};
  }
}

/** Writes the config file with 0600 permissions, creating the directory if needed. */
export function writeConfigFile(cfg: Config, path = configPath()): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, `${JSON.stringify(cfg, null, 2)}\n`, { mode: 0o600 });
  chmodSync(path, 0o600);
}

/** Loads config from disk plus the process environment. */
export function loadConfig(env: ConfigEnv = process.env): Config {
  return mergeConfig({ file: readConfigFile(), env });
}
