export interface ChatMessage {
  role: 'system' | 'user';
  content: string;
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  temperature: number;
  stream: boolean;
}

export interface ChatRequestInput {
  model: string;
  system: string;
  user: string;
  temperature?: number | undefined;
}

/**
 * Builds an OpenAI-compatible chat completion body. Both OpenRouter and LM
 * Studio speak this dialect, so one builder serves both.
 */
export function buildChatRequest(input: ChatRequestInput): ChatRequest {
  const messages: ChatMessage[] = [];
  if (input.system.trim() !== '') {
    messages.push({ role: 'system', content: input.system });
  }
  messages.push({ role: 'user', content: input.user });

  return {
    model: input.model,
    messages,
    temperature: input.temperature ?? 0.2,
    stream: false,
  };
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Pulls the assistant text out of a chat completion response. */
export function extractChatContent(raw: unknown): string {
  if (!isRecord(raw)) {
    throw new Error('Invalid chat response: expected an object');
  }
  const error = raw['error'];
  if (isRecord(error)) {
    const message = typeof error['message'] === 'string' ? error['message'] : 'unknown error';
    throw new Error(`Provider error: ${message}`);
  }
  const choices = raw['choices'];
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new Error('Invalid chat response: no choices returned');
  }
  const first = choices[0];
  if (!isRecord(first) || !isRecord(first['message'])) {
    throw new Error('Invalid chat response: choice has no message');
  }
  const content = first['message']['content'];
  if (typeof content !== 'string') {
    throw new Error('Invalid chat response: message has no content');
  }
  return content;
}
