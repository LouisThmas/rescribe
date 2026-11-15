import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, mergeConfig, reportModel, resolveProvider } from '../src/core/config.js';

describe('mergeConfig', () => {
  it('returns defaults when nothing else is supplied', () => {
    expect(mergeConfig({})).toEqual(DEFAULT_CONFIG);
  });

  it('lets file values override defaults', () => {
    const cfg = mergeConfig({ file: { asr: { language: 'French' } } });
    expect(cfg.asr.language).toBe('French');
    expect(cfg.asr.model).toBe(DEFAULT_CONFIG.asr.model);
  });

  it('lets env override file', () => {
    const cfg = mergeConfig({
      file: { report: { apiKey: 'from-file' } },
      env: { RESCRIBE_OPENROUTER_API_KEY: 'from-env' },
    });
    expect(cfg.report.apiKey).toBe('from-env');
  });

  it('lets flags override env', () => {
    const cfg = mergeConfig({
      env: { RESCRIBE_OPENROUTER_API_KEY: 'from-env' },
      flags: { report: { apiKey: 'from-flag' } },
    });
    expect(cfg.report.apiKey).toBe('from-flag');
  });

  it('ignores undefined flag values so they do not clobber config', () => {
    const cfg = mergeConfig({
      file: { asr: { language: 'French' } },
      flags: { asr: { language: undefined } },
    });
    expect(cfg.asr.language).toBe('French');
  });

  it('applies the LM Studio URL env override', () => {
    const cfg = mergeConfig({ env: { RESCRIBE_LMSTUDIO_URL: 'http://box:9999/v1' } });
    expect(cfg.report.lmstudioUrl).toBe('http://box:9999/v1');
  });

  it('loads the Hugging Face token from the environment', () => {
    const cfg = mergeConfig({ env: { HF_TOKEN: 'hf-from-env' } });
    expect(cfg.asr.hfToken).toBe('hf-from-env');
  });

  it('accepts PYANNOTE_AUTH_TOKEN as a Hugging Face token alias', () => {
    const cfg = mergeConfig({ env: { PYANNOTE_AUTH_TOKEN: 'hf-from-pyannote-env' } });
    expect(cfg.asr.hfToken).toBe('hf-from-pyannote-env');
  });

  it('does not mutate the defaults object', () => {
    const before = structuredClone(DEFAULT_CONFIG);
    mergeConfig({ file: { asr: { language: 'German' } } });
    expect(DEFAULT_CONFIG).toEqual(before);
  });

  it('deep-merges nested objects rather than replacing them', () => {
    const cfg = mergeConfig({ file: { report: { openrouterModel: 'x' } } });
    expect(cfg.report.baseUrl).toBe(DEFAULT_CONFIG.report.baseUrl);
    expect(cfg.report.openrouterModel).toBe('x');
  });

  it('migrates a legacy report model to the previously selected provider', () => {
    const openRouterConfig = mergeConfig({
      file: { report: { provider: 'openrouter', model: 'openai/gpt-6-luna' } },
    });
    const lmStudioConfig = mergeConfig({
      file: { report: { provider: 'lmstudio', model: 'qwen/qwen3.8-27b' } },
    });

    expect(reportModel(openRouterConfig, 'openrouter')).toBe('openai/gpt-6-luna');
    expect(reportModel(lmStudioConfig, 'lmstudio')).toBe('qwen/qwen3.8-27b');
  });

  it('keeps provider model settings independent when switching providers', () => {
    const cfg = mergeConfig({
      file: {
        report: {
          provider: 'openrouter',
          apiKey: 'key',
          openrouterModel: 'openai/gpt-6-luna',
          lmstudioModel: 'qwen/qwen3.8-27b',
        },
      },
    });
    expect(reportModel(cfg)).toBe('openai/gpt-6-luna');
    expect(reportModel(cfg, 'lmstudio')).toBe('qwen/qwen3.8-27b');
  });
});

describe('resolveProvider', () => {
  it('prefers OpenRouter whenever a key is configured', () => {
    const cfg = mergeConfig({ file: { report: { provider: 'lmstudio', apiKey: 'k' } } });
    expect(resolveProvider(cfg)).toBe('openrouter');
  });

  it('uses LM Studio when there is no OpenRouter key', () => {
    const cfg = mergeConfig({ file: { report: { provider: 'openrouter', apiKey: '' } } });
    expect(resolveProvider(cfg)).toBe('lmstudio');
  });

  it('honours an explicit provider override', () => {
    const cfg = mergeConfig({ file: { report: { apiKey: 'k' } } });
    expect(resolveProvider(cfg, 'lmstudio')).toBe('lmstudio');
    expect(resolveProvider(cfg, 'openrouter')).toBe('openrouter');
  });

  it('uses the OpenRouter setting automatically after LM Studio was configured', () => {
    const cfg = mergeConfig({
      file: {
        report: {
          provider: 'lmstudio',
          apiKey: 'key',
          lmstudioModel: 'qwen/qwen3.8-27b',
          openrouterModel: 'openai/gpt-6-luna',
        },
      },
    });
    expect(resolveProvider(cfg)).toBe('openrouter');
    expect(reportModel(cfg)).toBe('openai/gpt-6-luna');
  });
});
