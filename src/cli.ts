#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { Command } from 'commander';
import { loadConfig, mergeConfig, readConfigFile, writeConfigFile, resolveProvider, reportBaseUrl, reportModel, type Config, type ConfigPatch } from './core/config.js';
import { defaultRunDir } from './core/paths.js';
import { createLlmProvider } from './llm/index.js';
import { resolveAsrProvider, mlxSupported } from './asr/index.js';
import { formatFile, parseNameFlags } from './commands/format.js';
import { generateReport } from './commands/report.js';
import { resolvePrompt, installPrompt } from './commands/prompt.js';
import { runPipeline, reportFlagPatch, resolveDiarization, speakerNameQuestions } from './commands/run.js';
import { diagnose, renderDoctor } from './commands/doctor.js';
import { initDefaults } from './commands/init.js';
import { detect } from './bootstrap/detect.js';
import { planRepairs, repairSize } from './bootstrap/plan.js';
import { executeRepairs } from './bootstrap/install.js';
import { ensureModel } from './bootstrap/models.js';
import * as ui from './ui/prompts.js';
import { banner, stepHeader, stepLine, dim, green, red, yellow } from './ui/theme.js';

const VERSION = '0.1.0';

interface GlobalFlags {
  yes?: boolean;
  json?: boolean;
}

/** Runs the bootstrap flow, asking before each repair. Returns false if blocked. */
async function bootstrap(
  config: Config,
  flags: GlobalFlags,
  diarize: boolean,
): Promise<boolean> {
  const probe = await detect(config.asr.model, {
    env: { ...process.env, ...(config.asr.hfToken ? { HF_TOKEN: config.asr.hfToken } : {}) },
  });
  const repairs = planRepairs(probe, { diarize });

  if (repairs.length === 0) return true;

  const blocking = repairs.filter((r) => r.required);
  if (blocking.length > 0) {
    for (const repair of blocking) {
      ui.fail(`${repair.title}: ${repair.detail}`);
      if (repair.url) ui.log(dim(repair.url));
    }
    return false;
  }

  ui.log('Some things are missing. interview-rescribe can set them up for you.');

  repairs.forEach((repair, i) => {
    const size = repairSize(repair);
    const status = repair.kind === 'manual' ? 'needs you' : size ? `${size} to download` : 'missing';
    console.log(stepLine(i + 1, repairs.length, repair.title, status));
  });

  const approved = [];
  for (const repair of repairs) {
    if (repair.kind === 'manual') {
      ui.warn(`${repair.title}: ${repair.detail}`);
      if (repair.url) ui.log(dim(repair.url));
      continue;
    }
    const size = repairSize(repair);
    const label = size ? `${repair.title} (${size})` : repair.title;
    const ok = flags.yes === true || (await ui.confirm({ message: `Install ${label}?`, initialValue: true }));
    if (ok) approved.push(repair);
  }

  if (approved.length === 0) return true;

  const results = await executeRepairs(approved, {
    onStart: (repair) => ui.log(`Running ${repair.title} setup...`),
    onLine: (line) => ui.log(dim(line)),
  });

  const failed = results.find((r) => !r.ok);
  if (failed) {
    ui.fail(`${failed.repair.title} failed: ${failed.error ?? 'unknown error'}`);
    return false;
  }

  const modelRepair = approved.find((r) => r.id === 'download-model');
  if (modelRepair) {
    ui.log(`Downloading ${config.asr.model} (~${repairSize(modelRepair) ?? 'model files'}). Progress will appear below.`);
    const result = await ensureModel({
      repoId: config.asr.model,
      token: config.asr.hfToken,
      onLine: (line) => ui.log(dim(line)),
    });
    if (!result.ok) {
      ui.fail(`Model download failed: ${result.error ?? 'unknown error'}`);
      return false;
    }
  }

  ui.success('Setup complete.');
  return true;
}

function buildLlm(config: Config, requestedProvider?: 'openrouter' | 'lmstudio') {
  const provider = resolveProvider(config, requestedProvider);
  if (provider === 'openrouter' && !config.report.apiKey) {
    throw new Error(
      'OpenRouter was selected but no API key is configured. Run `interview-rescribe setup openrouter`.',
    );
  }
  return createLlmProvider({
    baseUrl: reportBaseUrl(config, provider),
    apiKey: provider === 'openrouter' ? config.report.apiKey : '',
    model: reportModel(config, provider),
    providerName: provider === 'lmstudio' ? 'LM Studio' : 'OpenRouter',
  });
}

function reportProviderDescription(
  config: Config,
  requestedProvider?: 'openrouter' | 'lmstudio',
): string {
  const provider = resolveProvider(config, requestedProvider);
  const label = provider === 'lmstudio' ? 'LM Studio' : 'OpenRouter';
  const fallback =
    provider === 'lmstudio' && !config.report.apiKey && !requestedProvider
      ? ' (no OpenRouter API key; falling back locally)'
      : '';
  const selected =
    requestedProvider && requestedProvider !== (config.report.apiKey ? 'openrouter' : 'lmstudio')
      ? ' (--provider override)'
      : '';
  return `${label} · ${reportModel(config, provider)} · ${reportBaseUrl(config, provider)}${fallback}${selected}`;
}

function saveConfigPatch(flags: ConfigPatch): Config {
  const config = mergeConfig({ file: readConfigFile(), flags });
  writeConfigFile(config);
  return config;
}

async function configureReportProvider(
  config: Config,
  enabled: boolean,
  requestedProvider?: 'openrouter' | 'lmstudio',
): Promise<Config> {
  if (
    !enabled ||
    config.report.apiKey ||
    !ui.isInteractive() ||
    requestedProvider === 'lmstudio'
  ) {
    return config;
  }

  const provider =
    requestedProvider ??
    (await ui.select({
      message: 'Choose a report provider (no OpenRouter key is configured)',
      options: [
        { value: 'lmstudio', label: 'LM Studio', hint: 'local, no API key' },
        { value: 'openrouter', label: 'Set up OpenRouter', hint: 'cloud, requires an API key' },
      ],
      initialValue: 'lmstudio',
    }));

  if (provider === 'openrouter') {
    const apiKey = await ui.password({
      message: 'OpenRouter API key',
      placeholder: 'sk-or-...',
    });
    if (!apiKey) {
      ui.warn('No key entered; using LM Studio instead.');
      saveConfigPatch({
        report: { provider: 'lmstudio', lmstudioModel: config.report.lmstudioModel },
      });
      return loadConfig();
    }
    const model = await ui.text({
      message: 'OpenRouter model',
      defaultValue: config.report.openrouterModel,
    });
    saveConfigPatch({
      report: { provider: 'openrouter', apiKey, openrouterModel: model },
    });
  } else {
    const model = await ui.text({
      message: 'LM Studio model identifier',
      defaultValue: config.report.lmstudioModel,
      placeholder: 'Use the model identifier shown in LM Studio',
    });
    saveConfigPatch({ report: { provider: 'lmstudio', lmstudioModel: model } });
  }
  return loadConfig();
}

async function configureHfToken(config: Config, enabled: boolean): Promise<Config> {
  if (!enabled || config.asr.hfToken || !ui.isInteractive()) return config;
  const configure = await ui.confirm({
    message: 'Set up a Hugging Face token for speaker labels?',
    initialValue: false,
  });
  if (!configure) return config;

  ui.note(
    'Accept the model terms before using your token:\nhttps://huggingface.co/pyannote/speaker-diarization-community-1',
    'Hugging Face speaker diarization',
  );
  const hfToken = await ui.password({ message: 'Hugging Face token', placeholder: 'hf_...' });
  if (!hfToken) {
    ui.warn('No token entered; continuing without speaker labels.');
    return config;
  }
  saveConfigPatch({ asr: { hfToken } });
  return loadConfig();
}

const program = new Command();

program
  .name('interview-rescribe')
  .description('Interview transcription and Mom Test report generation')
  .version(VERSION)
  .option('-y, --yes', 'accept all setup prompts and use defaults')
  .option('--json', 'emit machine-readable output');

program
  .command('init')
  .description('configure providers, keys, model and prompt')
  .action(async () => {
    console.log(banner());
    ui.intro('Setup');

    if (program.opts().yes) {
      const config = mergeConfig({ file: readConfigFile(), flags: initDefaults() });
      writeConfigFile(config);
      const promptPath = installPrompt();
      ui.success(`Config written to ~/.config/rescribe/config.json`);
      ui.log(`Prompt copied to ${promptPath} — edit it to change the report style.`);
      ui.outro('Ready. Run `interview-rescribe run <audio>` to transcribe an interview.');
      return;
    }

    let provider = await ui.select({
      message: 'Where should reports be generated?',
      options: [
        { value: 'openrouter', label: 'OpenRouter', hint: 'cloud, needs an API key' },
        { value: 'lmstudio', label: 'LM Studio', hint: 'local, no key needed' },
      ],
      initialValue: 'openrouter',
    });

    let apiKey = '';
    if (provider === 'openrouter') {
      apiKey = await ui.password({
        message: 'OpenRouter API key',
        placeholder: 'sk-or-...',
      });
      if (!apiKey) {
        ui.warn('No OpenRouter key entered; using LM Studio instead.');
        provider = 'lmstudio';
      }
    }

    const model = await ui.text({
      message: 'Report model',
      defaultValue: provider === 'openrouter' ? 'openai/gpt-5.2' : 'local-model',
    });

    const asrModel = await ui.select({
      message: 'Transcription model',
      options: [
        { value: 'Qwen/Qwen3-ASR-1.7B', label: 'Qwen3-ASR-1.7B', hint: 'best quality, 4.4 GB' },
        { value: 'Qwen/Qwen3-ASR-0.6B', label: 'Qwen3-ASR-0.6B', hint: 'fast, ~1.5 GB' },
      ],
      initialValue: 'Qwen/Qwen3-ASR-1.7B',
    });

    const language = await ui.text({
      message: 'Interview language',
      defaultValue: 'auto',
      placeholder: 'auto, French, English...',
    });

    let hfToken = '';
    const configureHf = await ui.confirm({
      message: 'Set up a Hugging Face token for speaker labels?',
      initialValue: false,
    });
    if (configureHf) {
      ui.note(
        'Accept the model terms before using your token:\nhttps://huggingface.co/pyannote/speaker-diarization-community-1',
        'Hugging Face speaker diarization',
      );
      hfToken = await ui.password({ message: 'Hugging Face token', placeholder: 'hf_...' });
    }

    const speakers = await ui.text({
      message: 'Typical number of speakers',
      defaultValue: '2',
    });

    const config = mergeConfig({
      file: readConfigFile(),
      flags: {
        asr: { model: asrModel, language, ...(hfToken ? { hfToken } : {}) },
        report: {
          provider,
          ...(provider === 'openrouter'
            ? { apiKey, openrouterModel: model }
            : { lmstudioModel: model }),
        },
        defaults: { speakers: Number.parseInt(speakers, 10) || 2 },
      },
    });

    writeConfigFile(config);
    const promptPath = installPrompt();
    ui.success(`Config written to ~/.config/rescribe/config.json`);
    ui.log(`Prompt copied to ${promptPath} — edit it to change the report style.`);
    ui.outro('Ready. Run `interview-rescribe run <audio>` to transcribe an interview.');
  });

program
  .command('setup')
  .argument('<provider>', 'openrouter, huggingface, or lmstudio')
  .description('add or update a provider credential or local model setting')
  .action(async (provider: string) => {
    if (provider === 'openrouter') {
      const apiKey = await ui.password({
        message: 'OpenRouter API key',
        placeholder: 'sk-or-...',
      });
      if (!apiKey) {
        ui.fail('An OpenRouter API key is required; no settings were changed.');
        process.exitCode = 1;
        return;
      }
      const current = loadConfig();
      const model = await ui.text({
        message: 'OpenRouter model',
        defaultValue: current.report.openrouterModel,
      });
      saveConfigPatch({ report: { apiKey, openrouterModel: model } });
      ui.success('OpenRouter settings saved. It will be used automatically when a key is configured.');
      return;
    }

    if (provider === 'huggingface') {
      ui.note(
        'Accept the model terms before using your token:\nhttps://huggingface.co/pyannote/speaker-diarization-community-1',
        'Hugging Face speaker diarization',
      );
      const hfToken = await ui.password({ message: 'Hugging Face token', placeholder: 'hf_...' });
      if (!hfToken) {
        ui.fail('A Hugging Face token is required; no settings were changed.');
        process.exitCode = 1;
        return;
      }
      saveConfigPatch({ asr: { hfToken } });
      ui.success('Hugging Face token saved in ~/.config/rescribe/config.json (mode 0600).');
      return;
    }

    if (provider === 'lmstudio') {
      const current = loadConfig();
      const model = await ui.text({
        message: 'LM Studio model identifier',
        defaultValue: current.report.lmstudioModel,
        placeholder: 'Use the model identifier shown in LM Studio',
      });
      saveConfigPatch({ report: { lmstudioModel: model } });
      ui.success('LM Studio settings saved. It is the default when no OpenRouter key is configured.');
      return;
    }

    ui.fail(`Unknown provider "${provider}". Choose openrouter, huggingface, or lmstudio.`);
    process.exitCode = 1;
  });

program
  .command('doctor')
  .description('check the environment and offer to fix anything missing')
  .action(async () => {
    const config = loadConfig();
    console.log(banner());
    const report = await diagnose(
      config.asr.model,
      config.asr.diarize,
      config.asr.hfToken,
      config.report,
    );
    console.log(renderDoctor(report));

    if (!mlxSupported()) {
      ui.outro(red('Transcription is supported only on macOS with Apple Silicon.'));
      process.exitCode = 1;
      return;
    }

    if (report.healthy) {
      ui.outro(green('Everything looks good.'));
      return;
    }

    const flags = program.opts<GlobalFlags>();
    const ok = await bootstrap(config, flags, config.asr.diarize);
    ui.outro(ok ? green('Environment ready.') : red('Some issues remain.'));
  });

program
  .command('format')
  .description('convert a transcript JSON file to TXT')
  .argument('<file>', 'transcript JSON file')
  .option('-o, --output <path>', 'output path')
  .option('--names <pair...>', 'speaker overrides, e.g. SPEAKER_00=Louis')
  .action(async (file: string, opts: { output?: string; names?: string[] }) => {
    if (!existsSync(file)) {
      ui.fail(`No such file: ${file}`);
      process.exitCode = 1;
      return;
    }
    const result = formatFile({
      input: file,
      output: opts.output,
      names: parseNameFlags(opts.names),
    });
    ui.success(`${result.turns} turns written to ${result.outputPath}`);
  });

program
  .command('report')
  .description('generate a Mom Test report from a formatted transcript')
  .argument('<file>', 'formatted transcript TXT file')
  .option('-o, --output <path>', 'output path')
  .option('--prompt <file>', 'custom prompt file')
  .option('--provider <name>', 'openrouter or lmstudio')
  .option('--report-model <id>', 'report model')
  .action(async (file: string, opts: { output?: string; prompt?: string; provider?: string; reportModel?: string }) => {
    if (!existsSync(file)) {
      ui.fail(`No such file: ${file}`);
      process.exitCode = 1;
      return;
    }
    const reportOverrides = reportFlagPatch({ provider: opts.provider, reportModel: opts.reportModel });
    const config = mergeConfig({
      file: readConfigFile(),
      env: process.env,
      flags: reportOverrides,
    });
    const requestedProvider = reportOverrides.report?.provider;
    ui.log(dim(`Report provider: ${reportProviderDescription(config, requestedProvider)}`));
    const result = await generateReport({
      input: file,
      output: opts.output,
      prompt: resolvePrompt(opts.prompt),
      provider: buildLlm(config, requestedProvider),
      onWarn: (m) => ui.warn(m),
    });
    ui.success(`Report written to ${result.outputPath}`);
  });

program
  .command('run')
  .description('transcribe an interview and generate a report')
  .argument('<audio>', 'audio file (m4a, mp3, wav, ...)')
  .option('--language <lang>', 'interview language')
  .option('--speakers <n>', 'number of speakers')
  .option('--model <id>', 'transcription model')
  .option('--report-model <id>', 'report model')
  .option('--provider <name>', 'openrouter or lmstudio')
  .option('--prompt <file>', 'custom prompt file')
  .option('--names <pair...>', 'speaker overrides, e.g. SPEAKER_00=Louis')
  .option('--no-report', 'stop after formatting the transcript')
  .option('--no-diarize', 'skip speaker diarization')
  .action(async (audio: string, opts: Record<string, unknown>) => {
    const flags = program.opts<GlobalFlags>();

    if (!existsSync(audio)) {
      ui.fail(`No such file: ${audio}`);
      process.exitCode = 1;
      return;
    }

    const reportOverrides = reportFlagPatch({
      provider: opts['provider'] as string | undefined,
      reportModel: opts['reportModel'] as string | undefined,
    });
    let config = mergeConfig({
      file: readConfigFile(),
      env: process.env,
      flags: reportOverrides,
    });
    const requestedProvider = reportOverrides.report?.provider;
    const requestedDiarize = opts['diarize'] !== false && config.asr.diarize;
    const language = (opts['language'] as string | undefined) ?? config.asr.language;
    const model = (opts['model'] as string | undefined) ?? config.asr.model;
    const speakersRaw = opts['speakers'] as string | undefined;
    const speakers = speakersRaw ? Number.parseInt(speakersRaw, 10) : config.defaults.speakers;

    console.log(banner());

    if (!mlxSupported()) {
      ui.fail('Transcription is supported only on macOS with Apple Silicon.');
      process.exitCode = 1;
      ui.outro(red('Unsupported platform.'));
      return;
    }

    config = await configureHfToken(config, requestedDiarize);
    const ready = await bootstrap(config, flags, requestedDiarize);
    if (!ready) {
      ui.outro(red('Setup could not be completed.'));
      process.exitCode = 1;
      return;
    }

    const probe = await detect(model, {
      env: { ...process.env, ...(config.asr.hfToken ? { HF_TOKEN: config.asr.hfToken } : {}) },
    });
    const decision = resolveDiarization({
      requested: requestedDiarize,
      hfTokenPresent: probe.hfToken.present,
    });
    if (decision.reason) ui.warn(decision.reason);
    const diarize = decision.diarize;

    const outputDir = defaultRunDir(audio);
    const asr = resolveAsrProvider();

    const wantReport = opts['report'] !== false;
    config = await configureReportProvider(config, wantReport, requestedProvider);
    if (wantReport) {
      ui.log(dim(`Report provider: ${reportProviderDescription(config, requestedProvider)}`));
    }
    const report = wantReport
      ? {
          provider: buildLlm(config, requestedProvider),
          prompt: resolvePrompt(opts['prompt'] as string | undefined),
        }
      : undefined;

    const nameFlags = parseNameFlags(opts['names'] as string[] | undefined);
    const canPrompt = ui.isInteractive() && flags.yes !== true && Object.keys(nameFlags).length === 0;

    const total = 2 + (canPrompt ? 1 : 0) + (wantReport ? 1 : 0);
    let step = 0;
    const result = await runPipeline({
      audio,
      outputDir,
      asr,
      asrOptions: {
        model,
        language,
        diarize,
        timestamps: config.asr.timestamps,
        speakers: diarize ? speakers : undefined,
        hfToken: config.asr.hfToken,
      },
      names: nameFlags,
      ...(canPrompt
        ? {
            resolveNames: async (
              found: string[],
              segments: { speaker: string; text: string }[],
            ) => {
              if (found.length === 0) return {};
              const names: Record<string, string> = {};
              const questions = speakerNameQuestions(found, segments);
              const examples = questions
                .filter((question) => question.example)
                .map((question) => `${question.speaker}: "${question.example}"`)
                .join('\n');
              if (examples) ui.note(examples, 'First turn from each speaker');
              for (const question of questions) {
                const answer = await ui.text({
                  message: question.message,
                  defaultValue: question.defaultValue,
                });
                names[question.speaker] = answer.trim() || question.defaultValue;
              }
              return names;
            },
          }
        : {}),
      report,
      onStep: (label) => {
        step += 1;
        const detail = label === 'Transcribe' ? `${asr.name} · ${model}` : undefined;
        console.log(stepHeader(step, total, label, detail));
      },
    });

    ui.success(`Transcript: ${result.txtPath}`);
    if (result.reportPath) ui.success(`Report:     ${result.reportPath}`);
    if (result.speakers.length > 0) {
      ui.log(dim(`Speakers: ${result.speakers.join(', ')}`));
    }
    ui.outro(green('Done.'));
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  ui.fail(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
