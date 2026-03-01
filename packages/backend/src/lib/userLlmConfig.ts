import prisma from './prisma';
import { decryptSecret, encryptSecret } from './crypto';

export type UserLlmConfigPublic = {
  provider: string;
  model: string | null;
  baseUrl: string | null;
  hasApiKey: boolean;
};

export type UserLlmConfigResolved = {
  provider: string;
  model: string | null;
  baseUrl: string | null;
  apiKey: string | null;
};

export async function getUserLlmConfigPublic(userId: string, provider?: string): Promise<UserLlmConfigPublic | null> {
  if (provider) {
    const p = provider.toLowerCase();
    const cfg = await prisma.userLlmConfig.findFirst({
      where: { userId, provider: p },
      select: { provider: true, model: true, baseUrl: true, apiKeyEnc: true },
    });
    if (!cfg) return null;
    return { provider: cfg.provider, model: cfg.model, baseUrl: cfg.baseUrl, hasApiKey: Boolean(cfg.apiKeyEnc) };
  }
  // No provider: return most recently updated (active) config
  const cfg = await prisma.userLlmConfig.findFirst({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
    select: { provider: true, model: true, baseUrl: true, apiKeyEnc: true },
  });
  if (!cfg) return null;
  return { provider: cfg.provider, model: cfg.model, baseUrl: cfg.baseUrl, hasApiKey: Boolean(cfg.apiKeyEnc) };
}

export async function upsertUserLlmConfig(userId: string, input: {
  provider: string;
  model?: string | null;
  baseUrl?: string | null;
  apiKey?: string | null;
}): Promise<UserLlmConfigPublic> {
  const provider = (input.provider || 'anthropic').toLowerCase();

  const existing = await prisma.userLlmConfig.findFirst({
    where: { userId, provider },
    select: { id: true, model: true, baseUrl: true, apiKeyEnc: true },
  });

  const updateData: Record<string, unknown> = {};
  if (input.model !== undefined) updateData.model = input.model;
  if (input.baseUrl !== undefined) updateData.baseUrl = input.baseUrl;
  if (input.apiKey !== undefined) {
    updateData.apiKeyEnc = input.apiKey ? encryptSecret(input.apiKey) : null;
  }

  let cfg;
  if (existing) {
    cfg = await prisma.userLlmConfig.update({
      where: { id: existing.id },
      data: updateData,
      select: { provider: true, model: true, baseUrl: true, apiKeyEnc: true },
    });
  } else {
    cfg = await prisma.userLlmConfig.create({
      data: {
        userId,
        provider,
        model: input.model ?? null,
        baseUrl: input.baseUrl ?? null,
        apiKeyEnc: input.apiKey ? encryptSecret(input.apiKey) : null,
      },
      select: { provider: true, model: true, baseUrl: true, apiKeyEnc: true },
    });
  }

  // Always update the user's active provider to the one they just saved.
  await prisma.user.update({
    where: { id: userId },
    data:  { activeProvider: provider },
  });

  return {
    provider: cfg.provider,
    model: cfg.model,
    baseUrl: cfg.baseUrl,
    hasApiKey: Boolean(cfg.apiKeyEnc),
  };
}

/** Clear only the API key for the given provider; keep model and baseUrl. */
export async function clearApiKeyOnly(userId: string, provider: string): Promise<UserLlmConfigPublic | null> {
  const p = (provider || 'anthropic').toLowerCase();
  const cfg = await prisma.userLlmConfig.findFirst({
    where: { userId, provider: p },
  });
  if (!cfg || !cfg.apiKeyEnc) return cfg ? { provider: cfg.provider, model: cfg.model, baseUrl: cfg.baseUrl, hasApiKey: false } : null;

  const updated = await prisma.userLlmConfig.update({
    where: { id: cfg.id },
    data: { apiKeyEnc: null },
    select: { provider: true, model: true, baseUrl: true, apiKeyEnc: true },
  });
  return {
    provider: updated.provider,
    model: updated.model,
    baseUrl: updated.baseUrl,
    hasApiKey: false,
  };
}

export async function getUserLlmConfigResolved(userId: string): Promise<UserLlmConfigResolved | null> {
  // Look up the user's explicitly selected active provider first.
  const user = await prisma.user.findUnique({
    where:  { id: userId },
    select: { activeProvider: true },
  });

  const activeProvider = user?.activeProvider ?? null;

  // Fetch the config for the active provider. If none found, fall back to the
  // most recently updated config (legacy behaviour for existing users).
  const cfg = activeProvider
    ? await prisma.userLlmConfig.findFirst({
        where:  { userId, provider: activeProvider },
        select: { provider: true, model: true, baseUrl: true, apiKeyEnc: true },
      })
    : await prisma.userLlmConfig.findFirst({
        where:   { userId },
        orderBy: { updatedAt: 'desc' },
        select:  { provider: true, model: true, baseUrl: true, apiKeyEnc: true },
      });

  if (!cfg) return null;

  let apiKey: string | null = null;
  if (cfg.apiKeyEnc) {
    try {
      apiKey = decryptSecret(cfg.apiKeyEnc);
    } catch (err) {
      console.warn('[userLlmConfig] Failed to decrypt API key, falling back to env:', err);
    }
  }

  return {
    provider: cfg.provider,
    model: cfg.model,
    baseUrl: cfg.baseUrl,
    apiKey,
  };
}

