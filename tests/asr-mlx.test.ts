import { describe, expect, it } from 'vitest';
import { buildMlxArgs, createMlxProvider, resolveMlxOutputPath } from '../src/asr/mlx.js';

const base = {
  audio: '/tmp/interview.m4a',
  model: 'Qwen/Qwen3-ASR-1.7B',
  language: 'French',
  diarize: true,
  timestamps: true,
  outputDir: '/tmp/out',
};

describe('buildMlxArgs', () => {
  it('always requests json output so speaker labels survive', () => {
    const args = buildMlxArgs(base);
    expect(args).toContain('-f');
    expect(args[args.indexOf('-f') + 1]).toBe('json');
  });

  it('passes the audio path as the positional argument', () => {
    expect(buildMlxArgs(base)).toContain('/tmp/interview.m4a');
  });

  it('passes the model', () => {
    const args = buildMlxArgs(base);
    expect(args[args.indexOf('--model') + 1]).toBe('Qwen/Qwen3-ASR-1.7B');
  });

  it('passes the language', () => {
    const args = buildMlxArgs(base);
    expect(args[args.indexOf('--language') + 1]).toBe('French');
  });

  it('omits --language when set to auto', () => {
    expect(buildMlxArgs({ ...base, language: 'auto' })).not.toContain('--language');
  });

  it('includes --diarize when enabled', () => {
    expect(buildMlxArgs(base)).toContain('--diarize');
  });

  it('omits --diarize when disabled', () => {
    expect(buildMlxArgs({ ...base, diarize: false })).not.toContain('--diarize');
  });

  it('includes --timestamps when enabled', () => {
    expect(buildMlxArgs(base)).toContain('--timestamps');
  });

  it('passes --num-speakers when a count is given', () => {
    const args = buildMlxArgs({ ...base, speakers: 3 });
    expect(args[args.indexOf('--num-speakers') + 1]).toBe('3');
  });

  it('omits --num-speakers when no count is given', () => {
    expect(buildMlxArgs(base)).not.toContain('--num-speakers');
  });

  it('passes the output directory', () => {
    const args = buildMlxArgs(base);
    expect(args[args.indexOf('-o') + 1]).toBe('/tmp/out');
  });

  it('allows the tool to show its transcription progress', () => {
    expect(buildMlxArgs(base)).not.toContain('--no-progress');
  });

  it('never emits an empty-string argument', () => {
    expect(buildMlxArgs(base).every((a) => a !== '')).toBe(true);
  });
});

describe('resolveMlxOutputPath', () => {
  it('derives the json path from the audio stem and output dir', () => {
    expect(resolveMlxOutputPath('/tmp/out', '/tmp/interview.m4a')).toBe(
      '/tmp/out/interview.json',
    );
  });

  it('strips only the final extension', () => {
    expect(resolveMlxOutputPath('/tmp/out', '/tmp/a.b.m4a')).toBe('/tmp/out/a.b.json');
  });

  it('handles a relative audio path', () => {
    expect(resolveMlxOutputPath('/tmp/out', 'interview.mp3')).toBe('/tmp/out/interview.json');
  });
});

describe('createMlxProvider', () => {
  it('passes a configured Hugging Face token to the transcription process', async () => {
    let childEnv: NodeJS.ProcessEnv | undefined;
    const provider = createMlxProvider({
      run: async (_args, _signal, env) => {
        childEnv = env;
      },
      readFile: () => JSON.stringify({ segments: [] }),
    });

    await provider.transcribe({
      ...base,
      hfToken: 'hf-test-token',
    });

    expect(childEnv?.HF_TOKEN).toBe('hf-test-token');
  });
});
