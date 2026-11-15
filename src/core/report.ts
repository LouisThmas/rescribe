/** Rough token estimate: ~4 characters per token for English prose. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Default warning threshold, in estimated tokens. */
export const DEFAULT_TOKEN_WARNING = 60_000;

/**
 * Wraps the transcript in a labelled user message. The transcript is passed
 * through untouched so verbatim quotes in the report stay accurate.
 */
export function buildReportUserMessage(transcript: string): string {
  return `Here is the interview transcript:\n\n${transcript}`;
}

/** True when the transcript is long enough to risk exceeding a model's context. */
export function shouldWarnAboutLength(
  transcript: string,
  threshold = DEFAULT_TOKEN_WARNING,
): boolean {
  return estimateTokens(transcript) > threshold;
}
