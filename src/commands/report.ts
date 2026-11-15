import { readFileSync, writeFileSync } from 'node:fs';
import { resolveOutputPath } from '../core/paths.js';
import { buildReportUserMessage, shouldWarnAboutLength } from '../core/report.js';
import type { LlmProvider } from '../llm/index.js';

export interface ReportOptions {
  input: string;
  output?: string | undefined;
  prompt: string;
  provider: LlmProvider;
  onWarn?: ((message: string) => void) | undefined;
}

export interface ReportResult {
  outputPath: string;
  markdown: string;
}

/** Sends a formatted transcript to an LLM and writes the Markdown report. */
export async function generateReport(options: ReportOptions): Promise<ReportResult> {
  const transcript = readFileSync(options.input, 'utf8');

  if (shouldWarnAboutLength(transcript)) {
    options.onWarn?.(
      'This transcript is long; the model may truncate it. Consider splitting the interview.',
    );
  }

  const markdown = await options.provider.complete({
    system: options.prompt,
    user: buildReportUserMessage(transcript),
  });

  const outputPath = options.output ?? resolveOutputPath(options.input, '.report.md');
  writeFileSync(outputPath, `${markdown.trimEnd()}\n`, 'utf8');
  return { outputPath, markdown };
}
