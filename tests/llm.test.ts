import { describe, expect, it } from 'vitest';
import { createLlmProvider } from '../src/llm/index.js';
import { buildChatRequest, extractChatContent } from '../src/llm/openai-compat.js';

describe('createLlmProvider', () => {
  it('explains local connection failures and how to fix them', async () => {
    const cause = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:1234'), {
      code: 'ECONNREFUSED',
    });
    const fetch = async () => {
      throw new TypeError('fetch failed', { cause });
    };
    const provider = createLlmProvider(
      {
        baseUrl: 'http://localhost:1234/v1',
        apiKey: '',
        model: 'local-model',
        providerName: 'LM Studio',
      },
      { fetch },
    );

    await expect(provider.complete({ system: '', user: 'transcript' })).rejects.toThrow(
      /LM Studio.*local-model.*ECONNREFUSED.*Start the LM Studio local server/,
    );
  });

  it('does not expose credentials embedded in a configured endpoint', async () => {
    const fetch = async () => {
      throw new TypeError('fetch failed');
    };
    const provider = createLlmProvider(
      {
        baseUrl: 'https://user:password@example.com/v1?secret=hidden',
        apiKey: '',
        model: 'model',
      },
      { fetch },
    );

    let message = '';
    try {
      await provider.complete({ system: '', user: 'transcript' });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toContain('https://example.com/v1');
    expect(message).not.toContain('password');
    expect(message).not.toContain('secret=hidden');
  });

  it('includes the provider, status and model when the server rejects the request', async () => {
    const fetch = async () => new Response('model not found', { status: 404 });
    const provider = createLlmProvider(
      {
        baseUrl: 'http://localhost:1234/v1',
        apiKey: '',
        model: 'missing-model',
        providerName: 'LM Studio',
      },
      { fetch },
    );

    await expect(provider.complete({ system: '', user: 'transcript' })).rejects.toThrow(
      /LM Studio returned HTTP 404 for model "missing-model".*model not found/,
    );
  });
});

describe('buildChatRequest', () => {
  it('builds an OpenAI-compatible chat body', () => {
    const body = buildChatRequest({
      model: 'openai/gpt-5.2',
      system: 'You are an analyst.',
      user: 'Transcript here',
    });
    expect(body.model).toBe('openai/gpt-5.2');
    expect(body.messages).toHaveLength(2);
    expect(body.messages[0]?.role).toBe('system');
    expect(body.messages[1]?.role).toBe('user');
  });

  it('puts the system prompt first and the transcript second', () => {
    const body = buildChatRequest({ model: 'm', system: 'SYS', user: 'USER' });
    expect(body.messages[0]?.content).toBe('SYS');
    expect(body.messages[1]?.content).toBe('USER');
  });

  it('omits the system message when the prompt is empty', () => {
    const body = buildChatRequest({ model: 'm', system: '', user: 'USER' });
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0]?.role).toBe('user');
  });

  it('defaults to a low temperature for analytical output', () => {
    expect(buildChatRequest({ model: 'm', system: 's', user: 'u' }).temperature).toBe(0.2);
  });

  it('honours an explicit temperature', () => {
    expect(
      buildChatRequest({ model: 'm', system: 's', user: 'u', temperature: 0.9 }).temperature,
    ).toBe(0.9);
  });

  it('does not request streaming', () => {
    expect(buildChatRequest({ model: 'm', system: 's', user: 'u' }).stream).toBe(false);
  });
});

describe('extractChatContent', () => {
  it('reads the first choice message content', () => {
    const res = { choices: [{ message: { content: 'the report' } }] };
    expect(extractChatContent(res)).toBe('the report');
  });

  it('throws a useful error when the API returns an error object', () => {
    expect(() => extractChatContent({ error: { message: 'bad key' } })).toThrow(/bad key/);
  });

  it('throws when there are no choices', () => {
    expect(() => extractChatContent({ choices: [] })).toThrow(/no choices/i);
  });

  it('throws when content is missing', () => {
    expect(() => extractChatContent({ choices: [{ message: {} }] })).toThrow(/content/i);
  });

  it('rejects a non-object response', () => {
    expect(() => extractChatContent('nope')).toThrow(/expected an object/i);
  });
});
