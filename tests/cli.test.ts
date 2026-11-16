import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseNameFlags } from '../src/commands/format.js';
import { collectSpeakers, reportFlagPatch, resolveDiarization, runPipeline, speakerNameQuestions } from '../src/commands/run.js';
import { buildDoctorRows } from '../src/commands/doctor.js';
import { initDefaults } from '../src/commands/init.js';
import type { AsrProvider } from '../src/asr/types.js';
import type { LlmProvider } from '../src/llm/index.js';
import type { Probe } from '../src/bootstrap/plan.js';
import type { Transcript } from '../src/core/transcript.js';

describe('parseNameFlags', () => {
  it('parses SPEAKER_00=Louis pairs', () => {
    expect(parseNameFlags(['SPEAKER_00=Louis', 'SPEAKER_01=Javad'])).toEqual({
      SPEAKER_00: 'Louis',
      SPEAKER_01: 'Javad',
    });
  });

  it('returns an empty map for undefined', () => {
    expect(parseNameFlags(undefined)).toEqual({});
  });

  it('ignores entries without a key', () => {
    expect(parseNameFlags(['=Louis', 'nope'])).toEqual({});
  });

  it('keeps equals signs inside the name', () => {
    expect(parseNameFlags(['SPEAKER_00=a=b'])).toEqual({ SPEAKER_00: 'a=b' });
  });
});

describe('collectSpeakers', () => {
  it('returns distinct speakers in first-appearance order', () => {
    expect(
      collectSpeakers([{ speaker: 'B' }, { speaker: 'A' }, { speaker: 'B' }, { speaker: 'C' }]),
    ).toEqual(['B', 'A', 'C']);
  });

  it('returns an empty list for no segments', () => {
    expect(collectSpeakers([])).toEqual([]);
  });
});

describe('speakerNameQuestions', () => {
  it('shows each speaker first turn and makes naming optional', () => {
    expect(
      speakerNameQuestions(
        ['SPEAKER_00', 'SPEAKER_01'],
        [
          { speaker: 'SPEAKER_00', text: 'Hello' },
          { speaker: 'SPEAKER_00', text: 'there.' },
          { speaker: 'SPEAKER_01', text: 'Hi!' },
          { speaker: 'SPEAKER_00', text: 'Another turn.' },
        ],
      ),
    ).toEqual([
      {
        speaker: 'SPEAKER_00',
        message: 'Name for SPEAKER_00 (press Enter to keep this label)',
        defaultValue: 'SPEAKER_00',
        example: 'Hello there.',
      },
      {
        speaker: 'SPEAKER_01',
        message: 'Name for SPEAKER_01 (press Enter to keep this label)',
        defaultValue: 'SPEAKER_01',
        example: 'Hi!',
      },
    ]);
  });

  it('returns nothing when there are no speakers', () => {
    expect(speakerNameQuestions([])).toEqual([]);
  });
});

describe('reportFlagPatch', () => {
  it('maps --provider and --report-model onto a config patch', () => {
    expect(reportFlagPatch({ provider: 'lmstudio', reportModel: 'qwen2.5' })).toEqual({
      report: { provider: 'lmstudio', model: 'qwen2.5' },
    });
  });

  it('omits fields that were not passed', () => {
    expect(reportFlagPatch({ provider: 'openrouter' })).toEqual({
      report: { provider: 'openrouter' },
    });
  });

  it('returns an empty patch when nothing was passed', () => {
    expect(reportFlagPatch({})).toEqual({});
  });

  it('ignores an unknown provider name', () => {
    expect(reportFlagPatch({ provider: 'nope' })).toEqual({});
  });
});

describe('resolveDiarization', () => {
  it('keeps diarization when the token is present', () => {
    expect(resolveDiarization({ requested: true, hfTokenPresent: true })).toEqual({
      diarize: true,
      reason: undefined,
    });
  });

  it('drops diarization when the token is missing', () => {
    const result = resolveDiarization({ requested: true, hfTokenPresent: false });
    expect(result.diarize).toBe(false);
    expect(result.reason).toContain('Hugging Face');
  });

  it('never enables diarization that was not requested', () => {
    expect(resolveDiarization({ requested: false, hfTokenPresent: true }).diarize).toBe(false);
  });

  it('stays off when neither is true', () => {
    expect(resolveDiarization({ requested: false, hfTokenPresent: false }).diarize).toBe(false);
  });
});

describe('buildDoctorRows', () => {
  const baseProbe: Probe = {
    platform: 'darwin',
    arch: 'arm64',
    nodeMajor: 22,
    uv: { present: true },
    ffmpeg: { present: true },
    mlxAsr: { present: true },
    hfToken: { present: true },
    model: { repoId: 'Qwen/Qwen3-ASR-1.7B', cached: true, bytes: 4_400_000_000 },
  };

  it('reports everything ok on a healthy machine', () => {
    const rows = buildDoctorRows(baseProbe, true);
    expect(rows.every((r) => r.status === 'ok')).toBe(true);
  });

  it('flags a missing model as a warning, not a failure', () => {
    const rows = buildDoctorRows(
      {
        ...baseProbe,
        model: { repoId: 'Qwen/Qwen3-ASR-0.6B', cached: false, bytes: 1_500_000_000 },
      },
      true,
    );
    expect(rows.find((r) => r.label === 'model')?.status).toBe('warn');
    expect(rows.find((r) => r.label === 'model')?.detail).toContain('Qwen/Qwen3-ASR-0.6B');
  });

  it('shows both configured report provider models and marks the active provider', () => {
    const rows = buildDoctorRows(baseProbe, true, {
      provider: 'lmstudio',
      openrouterModel: 'openai/gpt-6-luna',
      lmstudioModel: 'local-qwen',
      apiKey: '',
      baseUrl: 'https://openrouter.ai/api/v1',
      lmstudioUrl: 'http://localhost:1234/v1',
    });
    expect(rows.find((r) => r.label === 'OpenRouter setup')).toMatchObject({
      status: 'skip',
      detail: 'not configured · openai/gpt-6-luna',
      muted: true,
    });
    expect(rows.find((r) => r.label === 'LM Studio setup')).toMatchObject({
      status: 'ok',
      detail: 'active · local-qwen',
      muted: true,
    });
  });

  it('shows OpenRouter active with its configured model when a key is available', () => {
    const rows = buildDoctorRows(baseProbe, true, {
      provider: 'openrouter',
      openrouterModel: 'openai/gpt-6-luna',
      lmstudioModel: 'local-model',
      apiKey: 'secret',
      baseUrl: 'https://openrouter.ai/api/v1',
      lmstudioUrl: 'http://localhost:1234/v1',
    });
    expect(rows.find((r) => r.label === 'OpenRouter setup')).toMatchObject({
      status: 'ok',
      detail: 'active · openai/gpt-6-luna',
    });
    expect(rows.find((r) => r.label === 'LM Studio setup')?.status).toBe('skip');
  });

  it('skips mlx on non-Apple-Silicon platforms', () => {
    const rows = buildDoctorRows(
      { ...baseProbe, platform: 'other', arch: 'x64', mlxAsr: { present: false } },
      true,
    );
    expect(rows.find((r) => r.label === 'mlx-qwen3-asr')?.status).toBe('skip');
    expect(rows.find((r) => r.label === 'Platform')?.status).toBe('miss');
  });

  it('skips diarization when it is disabled', () => {
    const rows = buildDoctorRows({ ...baseProbe, hfToken: { present: false } }, false);
    expect(rows.find((r) => r.label === 'diarization')?.status).toBe('skip');
  });

  it('warns about diarization without an HF token', () => {
    const rows = buildDoctorRows({ ...baseProbe, hfToken: { present: false } }, true);
    expect(rows.find((r) => r.label === 'diarization')?.status).toBe('warn');
  });

  it('fails Node below 20', () => {
    const rows = buildDoctorRows({ ...baseProbe, nodeMajor: 18 }, true);
    expect(rows.find((r) => r.label === 'Node')?.status).toBe('miss');
  });
});

const transcript: Transcript = {
  text: 'hello there',
  language: 'en',
  finishReason: 'stop',
  truncated: false,
  segments: [
    { text: 'hello', start: 0, end: 1, speaker: 'SPEAKER_00' },
    { text: 'there', start: 1, end: 2, speaker: 'SPEAKER_01' },
  ],
  speakerSegments: [],
  chunks: [],
};

function fakeAsr(): AsrProvider {
  return {
    name: 'fake',
    isAvailable: async () => true,
    transcribe: async (options) => {
      const jsonPath = join(options.outputDir, 'interview.json');
      writeFileSync(jsonPath, JSON.stringify(transcript), 'utf8');
      return { transcript, jsonPath };
    },
  };
}

function fakeLlm(): LlmProvider {
  return { name: 'fake-llm', complete: async () => '# Report\n\nBody.' };
}

describe('runPipeline', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rescribe-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const audio = () => join(dir, 'interview.m4a');

  it('writes the formatted transcript and reports each step', async () => {
    writeFileSync(audio(), 'audio', 'utf8');
    const steps: string[] = [];

    const result = await runPipeline({
      audio: audio(),
      outputDir: dir,
      asr: fakeAsr(),
      asrOptions: { model: 'm', language: 'en', diarize: false, timestamps: true },
      onStep: (s) => steps.push(s),
    });

    expect(steps).toEqual(['Transcribe', 'Format']);
    expect(result.txtPath).toBe(join(dir, 'interview.txt'));
    expect(readFileSync(result.txtPath, 'utf8')).toBe(
      '[00:00:00] SPEAKER_00: hello\n\n[00:00:01] SPEAKER_01: there',
    );
    expect(result.reportPath).toBeUndefined();
  });

  it('stops after formatting when no report provider is given', async () => {
    writeFileSync(audio(), 'audio', 'utf8');
    const result = await runPipeline({
      audio: audio(),
      outputDir: dir,
      asr: fakeAsr(),
      asrOptions: { model: 'm', language: 'en', diarize: false, timestamps: true },
    });
    expect(result.reportPath).toBeUndefined();
  });

  it('writes a Markdown report when a provider is given', async () => {
    writeFileSync(audio(), 'audio', 'utf8');
    const result = await runPipeline({
      audio: audio(),
      outputDir: dir,
      asr: fakeAsr(),
      asrOptions: { model: 'm', language: 'en', diarize: false, timestamps: true },
      report: { provider: fakeLlm(), prompt: 'be brief' },
    });

    expect(result.reportPath).toBe(join(dir, 'interview.report.md'));
    expect(readFileSync(result.reportPath!, 'utf8')).toBe('# Report\n\nBody.\n');
  });

  it('applies explicit speaker names', async () => {
    writeFileSync(audio(), 'audio', 'utf8');
    const result = await runPipeline({
      audio: audio(),
      outputDir: dir,
      asr: fakeAsr(),
      asrOptions: { model: 'm', language: 'en', diarize: false, timestamps: true },
      names: { SPEAKER_00: 'Louis', SPEAKER_01: 'Javad' },
    });

    expect(readFileSync(result.txtPath, 'utf8')).toContain('Louis: hello');
    expect(readFileSync(result.txtPath, 'utf8')).toContain('Javad: there');
  });

  it('emits a naming step when resolveNames is provided', async () => {
    writeFileSync(audio(), 'audio', 'utf8');
    const steps: string[] = [];

    await runPipeline({
      audio: audio(),
      outputDir: dir,
      asr: fakeAsr(),
      asrOptions: { model: 'm', language: 'en', diarize: false, timestamps: true },
      resolveNames: async () => ({}),
      report: { provider: fakeLlm(), prompt: 'p' },
      onStep: (s) => steps.push(s),
    });

    expect(steps).toEqual(['Transcribe', 'Format', 'Name speakers', 'Report']);
  });

  it('omits the naming step when resolveNames is absent', async () => {
    writeFileSync(audio(), 'audio', 'utf8');
    const steps: string[] = [];

    await runPipeline({
      audio: audio(),
      outputDir: dir,
      asr: fakeAsr(),
      asrOptions: { model: 'm', language: 'en', diarize: false, timestamps: true },
      report: { provider: fakeLlm(), prompt: 'p' },
      onStep: (s) => steps.push(s),
    });

    expect(steps).toEqual(['Transcribe', 'Format', 'Report']);
  });

  it('lets resolveNames override the discovered speakers', async () => {
    writeFileSync(audio(), 'audio', 'utf8');
    const seen: string[][] = [];

    const result = await runPipeline({
      audio: audio(),
      outputDir: dir,
      asr: fakeAsr(),
      asrOptions: { model: 'm', language: 'en', diarize: false, timestamps: true },
      resolveNames: async (speakers) => {
        seen.push(speakers);
        return { SPEAKER_00: 'Interviewer', SPEAKER_01: 'Guest' };
      },
    });

    expect(seen).toEqual([['SPEAKER_00', 'SPEAKER_01']]);
    expect(readFileSync(result.txtPath, 'utf8')).toContain('Interviewer: hello');
    expect(result.speakers).toEqual(['SPEAKER_00', 'SPEAKER_01']);
  });

  it('prefers resolveNames over static names', async () => {
    writeFileSync(audio(), 'audio', 'utf8');
    const result = await runPipeline({
      audio: audio(),
      outputDir: dir,
      asr: fakeAsr(),
      asrOptions: { model: 'm', language: 'en', diarize: false, timestamps: true },
      names: { SPEAKER_00: 'Ignored' },
      resolveNames: async () => ({ SPEAKER_00: 'Chosen' }),
    });

    expect(readFileSync(result.txtPath, 'utf8')).toContain('Chosen: hello');
  });

  it('creates the output directory when it does not exist', async () => {
    writeFileSync(audio(), 'audio', 'utf8');
    const nested = join(dir, 'deep', 'nested');
    const result = await runPipeline({
      audio: audio(),
      outputDir: nested,
      asr: fakeAsr(),
      asrOptions: { model: 'm', language: 'en', diarize: false, timestamps: true },
    });
    expect(readFileSync(result.txtPath, 'utf8')).toContain('hello');
  });

  it('propagates ASR failures', async () => {
    writeFileSync(audio(), 'audio', 'utf8');
    const failing: AsrProvider = {
      name: 'boom',
      isAvailable: async () => true,
      transcribe: async () => {
        throw new Error('asr exploded');
      },
    };

    await expect(
      runPipeline({
        audio: audio(),
        outputDir: dir,
        asr: failing,
        asrOptions: { model: 'm', language: 'en', diarize: false, timestamps: true },
      }),
    ).rejects.toThrow('asr exploded');
  });

  it('does not write a report when the provider fails', async () => {
    writeFileSync(audio(), 'audio', 'utf8');
    const failing: LlmProvider = {
      name: 'boom',
      complete: async () => {
        throw new Error('llm exploded');
      },
    };

    await expect(
      runPipeline({
        audio: audio(),
        outputDir: dir,
        asr: fakeAsr(),
        asrOptions: { model: 'm', language: 'en', diarize: false, timestamps: true },
        report: { provider: failing, prompt: 'p' },
      }),
    ).rejects.toThrow('llm exploded');
  });
});

describe('initDefaults', () => {
  it('produces a complete config patch without prompting', () => {
    expect(initDefaults()).toEqual({
      asr: { model: 'Qwen/Qwen3-ASR-1.7B', language: 'auto' },
      report: { provider: 'lmstudio', lmstudioModel: 'local-model' },
      defaults: { speakers: 2 },
    });
  });

  it('never defaults to a provider that needs a key', () => {
    expect(initDefaults().report?.provider).toBe('lmstudio');
  });
});
