import { buildChatRequest, extractChatContent } from './openai-compat.js';

export interface LlmConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  providerName?: string | undefined;
}

export interface CompleteInput {
  system: string;
  user: string;
  temperature?: number | undefined;
  signal?: AbortSignal | undefined;
}

export interface LlmProvider {
  readonly name: string;
  complete(input: CompleteInput): Promise<string>;
}

export interface LlmDeps {
  fetch?: typeof globalThis.fetch;
}

function endpointForDisplay(baseUrl: string): string {
  try {
    const url = new URL(baseUrl);
    url.username = '';
    url.password = '';
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return baseUrl;
  }
}

function fetchErrorDetails(error: unknown): string {
  const messages: string[] = [];
  const seen = new Set<unknown>();
  let current: unknown = error;

  while (current !== undefined && !seen.has(current) && messages.length < 5) {
    seen.add(current);
    if (current instanceof Error) {
      if (current.message && !messages.includes(current.message)) messages.push(current.message);
      const cause = current.cause;
      if (cause !== undefined) {
        current = cause;
        continue;
      }
    } else if (typeof current === 'string') {
      messages.push(current);
    }
    break;
  }

  return messages.join(': ') || 'unknown network error';
}

function connectionHint(baseUrl: string, error: unknown): string {
  const details = fetchErrorDetails(error);
  let isLocal = false;
  try {
    const hostname = new URL(baseUrl).hostname;
    isLocal = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
  } catch {
    return ' Check the configured provider URL and network connection.';
  }

  if (isLocal && details.includes('ECONNREFUSED')) {
    return ' Start the LM Studio local server, check its port, and make sure a model is loaded.';
  }
  return ' Check that the provider is running and that this machine can reach it.';
}

/** Chat completion against any OpenAI-compatible endpoint. */
export function createLlmProvider(config: LlmConfig, deps: LlmDeps = {}): LlmProvider {
  const doFetch = deps.fetch ?? globalThis.fetch;

  return {
    name: config.baseUrl,

    async complete(input: CompleteInput): Promise<string> {
      const body = buildChatRequest({
        model: config.model,
        system: input.system,
        user: input.user,
        temperature: input.temperature,
      });

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (config.apiKey) headers['Authorization'] = `Bearer ${config.apiKey}`;

      const endpoint = `${config.baseUrl.replace(/\/$/, '')}/chat/completions`;
      let res: Response;
      try {
        res = await doFetch(endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          ...(input.signal ? { signal: input.signal } : {}),
        });
      } catch (error) {
        if (input.signal?.aborted || (error instanceof Error && error.name === 'AbortError')) {
          throw error;
        }
        const provider = config.providerName ?? endpointForDisplay(config.baseUrl);
        const baseUrl = endpointForDisplay(config.baseUrl);
        throw new Error(
          `Report request failed: could not reach ${provider} at ${baseUrl} for model "${config.model}". ${fetchErrorDetails(error)}.${connectionHint(config.baseUrl, error)}`,
          { cause: error },
        );
      }

      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        const provider = config.providerName ?? endpointForDisplay(config.baseUrl);
        throw new Error(
          `Report request failed: ${provider} returned HTTP ${res.status} for model "${config.model}" at ${endpointForDisplay(config.baseUrl)}.${detail ? ` ${detail.slice(0, 300)}` : ''}`,
        );
      }

      return extractChatContent(await res.json());
    },
  };
}
