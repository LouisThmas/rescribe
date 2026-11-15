import type { ConfigPatch } from '../core/config.js';

/**
 * The config `init -y` writes without asking anything. It deliberately picks
 * LM Studio, because that provider needs no API key and therefore cannot
 * produce a config that fails on the first run.
 */
export function initDefaults(): ConfigPatch {
  return {
    asr: { model: 'Qwen/Qwen3-ASR-1.7B', language: 'auto' },
    report: { provider: 'lmstudio', lmstudioModel: 'local-model' },
    defaults: { speakers: 2 },
  };
}
