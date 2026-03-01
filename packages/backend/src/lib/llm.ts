import Anthropic from '@anthropic-ai/sdk';
import { getUserLlmConfigResolved } from './userLlmConfig';

type LlmProvider = 'anthropic' | 'openai' | 'deepseek' | 'llama' | 'custom';

function getProvider(): LlmProvider {
  const raw = (process.env.LLM_PROVIDER || 'anthropic').toLowerCase();
  if (raw === 'anthropic' || raw === 'openai' || raw === 'deepseek' || raw === 'llama' || raw === 'custom') return raw;
  return 'anthropic';
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

function stripKnownCompletionSuffixes(baseUrl: string): string {
  // Users often paste the full endpoint. We want a base like ".../v1".
  // Examples we normalize:
  // - https://api.openai.com/v1/chat/completions -> https://api.openai.com/v1
  // - http://localhost:11434/v1/chat/completions -> http://localhost:11434/v1
  // - https://api.deepseek.com/chat/completions -> https://api.deepseek.com
  const trimmed = normalizeBaseUrl(baseUrl);
  return trimmed
    .replace(/\/v1\/chat\/completions$/i, '/v1')
    .replace(/\/chat\/completions$/i, '')
    .replace(/\/v1\/completions$/i, '/v1')
    .replace(/\/completions$/i, '');
}

function normalizeOpenAiBaseUrl(baseUrl: string): string {
  const trimmed = stripKnownCompletionSuffixes(baseUrl);
  // Accept either ".../v1" or the domain root and normalize to ".../v1".
  // Prevent double-appending if a caller already provided a /v1 segment.
  if (/\/v1(\/|$)/.test(trimmed)) return trimmed;
  return `${trimmed}/v1`;
}

function getConfigForProvider(provider: LlmProvider): { provider: LlmProvider; apiKey?: string; model: string; baseUrl: string } {
  const genericKey     = process.env.LLM_API_KEY;
  const genericModel   = process.env.LLM_MODEL;
  const genericBaseUrl = process.env.LLM_BASE_URL;

  if (provider === 'anthropic') {
    return {
      provider,
      apiKey:   genericKey ?? process.env.ANTHROPIC_API_KEY,
      model:    genericModel ?? process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6',
      baseUrl:  genericBaseUrl ?? '',
    };
  }

  if (provider === 'openai') {
    return {
      provider,
      apiKey:   genericKey ?? process.env.OPENAI_API_KEY,
      model:    genericModel ?? process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
      baseUrl:  normalizeOpenAiBaseUrl(genericBaseUrl ?? process.env.OPENAI_BASE_URL ?? 'https://api.openai.com'),
    };
  }

  if (provider === 'deepseek') {
    return {
      provider,
      apiKey:   genericKey ?? process.env.DEEPSEEK_API_KEY,
      model:    genericModel ?? process.env.DEEPSEEK_MODEL ?? 'deepseek-reasoner',
      baseUrl:  normalizeOpenAiBaseUrl(genericBaseUrl ?? process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com'),
    };
  }

  if (provider === 'llama') {
    return {
      provider,
      apiKey:   genericKey ?? process.env.LLAMA_API_KEY ?? '',
      model:    genericModel ?? process.env.LLAMA_MODEL ?? 'llama3.1',
      baseUrl:  stripKnownCompletionSuffixes(genericBaseUrl ?? process.env.LLAMA_BASE_URL ?? 'http://localhost:11434'),
    };
  }

  // custom: no defaults — user must provide model, baseUrl, apiKey
  return {
    provider: 'custom',
    apiKey:   genericKey ?? '',
    model:    genericModel ?? '',
    baseUrl:  genericBaseUrl ?? '',
  };
}

function getConfig() {
  return getConfigForProvider(getProvider());
}

function normalizeUserBaseUrl(provider: LlmProvider, baseUrl: string): string {
  const raw = baseUrl.trim();
  if (!raw) return raw;

  if (provider === 'anthropic') return normalizeBaseUrl(raw);

  if (provider === 'llama') {
    // Preserve Ollama native forms like /api or /api/chat.
    const stripped = stripKnownCompletionSuffixes(raw);
    return normalizeBaseUrl(stripped);
  }

  // OpenAI / DeepSeek / custom style
  return normalizeOpenAiBaseUrl(raw);
}

async function openAiCompatibleChatComplete(params: {
  baseUrl: string;
  apiKey?: string;
  model: string;
  prompt: string;
  maxTokens: number;
  timeoutMs?: number;
}): Promise<string> {
  const base = normalizeOpenAiBaseUrl(params.baseUrl);
  const url = `${base}/chat/completions`;

  // DeepSeek R1 and other reasoning models reject the `temperature` parameter.
  const isReasoningModel = /reasoner|deepseek-r1/i.test(params.model);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (params.apiKey) headers.Authorization = `Bearer ${params.apiKey}`;

  const body: Record<string, unknown> = {
    model: params.model,
    messages: [{ role: 'user', content: params.prompt }],
    max_tokens: params.maxTokens,
  };
  if (!isReasoningModel) body.temperature = 0.1;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), params.timeoutMs ?? 120_000);

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: controller.signal,
  }).finally(() => clearTimeout(timeout));

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const hint = params.baseUrl.includes('localhost') || params.baseUrl.includes('host.docker.internal')
      ? ' Ensure Ollama is running (ollama serve) and the model is pulled (ollama pull llama3.2).'
      : '';
    throw new Error(`LLM request failed (${res.status}): ${text}${hint}`);
  }

  const json = await res.json() as any;
  const content = json?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') throw new Error('LLM response missing message.content');
  return content;
}

async function ollamaNativeChat(params: {
  baseUrl: string; // may include /api or /api/chat
  model: string;
  prompt: string;
  timeoutMs?: number;
}): Promise<string> {
  const raw = stripKnownCompletionSuffixes(params.baseUrl);
  const base = normalizeBaseUrl(raw);

  const url = base.endsWith('/api/chat')
    ? base
    : base.endsWith('/api')
      ? `${base}/chat`
      : `${base}/api/chat`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), params.timeoutMs ?? 120_000);

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: params.model,
      stream: false,
      messages: [{ role: 'user', content: params.prompt }],
    }),
    signal: controller.signal,
  }).finally(() => clearTimeout(timeout));

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const hint = params.baseUrl.includes('localhost') ? ' Ensure ollama serve is running. For Docker, use http://host.docker.internal:11434.' : '';
    throw new Error(`Ollama request failed (${res.status}): ${text}${hint}`);
  }

  const json = await res.json() as any;
  const content = json?.message?.content;
  if (typeof content !== 'string') throw new Error('LLM response missing message.content');
  return content;
}

/** Returns the effective LLM provider for a given user (user config takes precedence over env var). */
export async function getEffectiveProvider(userId?: string): Promise<LlmProvider> {
  if (userId) {
    const userCfg = await getUserLlmConfigResolved(userId);
    if (userCfg?.provider) {
      const p = userCfg.provider.toLowerCase() as LlmProvider;
      if (['anthropic', 'openai', 'deepseek', 'llama', 'custom'].includes(p)) return p;
    }
  }
  return getProvider();
}

export async function llmText(params: {
  prompt: string;
  maxTokens: number;
  userId?: string;
}): Promise<string> {
  const cfg = getConfig();

  // Per-user override (stored in DB). If user config exists, it takes precedence.
  if (params.userId) {
    const userCfg = await getUserLlmConfigResolved(params.userId);
    if (userCfg) {
      const provider = (userCfg.provider || cfg.provider).toLowerCase() as LlmProvider;
      const defaults = getConfigForProvider(provider);
      const model = userCfg.model || defaults.model;
      const baseUrl = userCfg.baseUrl
        ? normalizeUserBaseUrl(provider, userCfg.baseUrl)
        : defaults.baseUrl;

      const merged = {
        ...defaults,
        provider: provider as LlmProvider,
        model,
        baseUrl,
        apiKey: userCfg.apiKey || defaults.apiKey || (provider === 'anthropic' ? process.env.ANTHROPIC_API_KEY : undefined),
      };

      return await llmTextWithResolvedConfig(merged, params.prompt, params.maxTokens);
    }
  }

  return await llmTextWithResolvedConfig(cfg, params.prompt, params.maxTokens);
}

async function llmTextWithResolvedConfig(
  cfg: { provider: LlmProvider; apiKey?: string; model: string; baseUrl: string },
  prompt: string,
  maxTokens: number,
): Promise<string> {
  // Local Llama/Ollama: allow up to 2048 tokens so the full JSON analysis fits.
  const effectiveMaxTokens =
    cfg.provider === 'llama'
      ? Math.min(maxTokens, 2048)
      : maxTokens;

  if (cfg.provider === 'anthropic') {
    const apiKey = (cfg.apiKey || process.env.ANTHROPIC_API_KEY || '').trim();
    if (!apiKey) throw new Error('Claude API key required. Add it in Settings (LLM Settings) or set ANTHROPIC_API_KEY in .env');

    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: cfg.model,
      max_tokens: effectiveMaxTokens,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content[0]?.type === 'text' ? response.content[0].text : '';
    if (!text) throw new Error('LLM response empty');
    return text;
  }

  if (!cfg.baseUrl) throw new Error('LLM base URL is not configured');
  if (cfg.provider === 'custom' && !cfg.model?.trim()) {
    throw new Error('Custom provider requires a model name');
  }
  if (!cfg.apiKey && (cfg.provider === 'openai' || cfg.provider === 'deepseek')) {
    throw new Error('LLM API key is not configured');
  }

  // Llama: support either OpenAI-compatible (/v1/chat/completions) OR Ollama native (/api/chat).
  // Local models are slow — give them 5 minutes before aborting.
  if (cfg.provider === 'llama') {
    const base = normalizeBaseUrl(cfg.baseUrl);
    const looksNative = /\/api(\/|$)/i.test(base);
    if (looksNative) {
      return await ollamaNativeChat({ baseUrl: base, model: cfg.model, prompt, timeoutMs: 300_000 });
    }
    return await openAiCompatibleChatComplete({
      baseUrl: base,
      apiKey: cfg.apiKey,
      model: cfg.model,
      prompt,
      maxTokens: effectiveMaxTokens,
      timeoutMs: 300_000,
    });
  }

  return await openAiCompatibleChatComplete({
    baseUrl: cfg.baseUrl,
    apiKey: cfg.apiKey,
    model: cfg.model,
    prompt,
    maxTokens: effectiveMaxTokens,
  });
}

