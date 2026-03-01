import { Router, IRouter, Response, NextFunction } from 'express';
import { z } from 'zod';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { createError } from '../middleware/errorHandler';
import { getUserLlmConfigPublic, upsertUserLlmConfig, clearApiKeyOnly } from '../lib/userLlmConfig';
import { llmText } from '../lib/llm';

const router: IRouter = Router();

const upsertSchema = z.object({
  provider: z.enum(['anthropic', 'openai', 'deepseek', 'llama', 'custom']).default('anthropic'),
  model: z.string().min(1).optional().nullable(),
  baseUrl: z.string().min(1).optional().nullable(),
  apiKey: z.string().optional().nullable(),
  clearKeyOnly: z.boolean().optional(),
});

// GET /api/llm-config?provider=anthropic
router.get('/', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const provider = typeof req.query.provider === 'string' ? req.query.provider : undefined;
    const cfg = await getUserLlmConfigPublic(req.user!.userId, provider);
    res.json({ success: true, data: { config: cfg } });
  } catch (err) {
    next(err);
  }
});

// POST /api/llm-config/test
// Sends a minimal prompt to the currently configured LLM and returns success/failure.
router.post('/test', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const text = await llmText({
      userId: req.user!.userId,
      prompt: 'Reply with exactly one word: OK',
      maxTokens: 16,
    });
    res.json({ success: true, data: { reply: text.trim() } });
  } catch (err: any) {
    // Return 200 with success:false so the frontend can show the error message
    res.json({ success: false, error: { message: err?.message || 'Connection failed' } });
  }
});

// GET /api/llm-config/ollama-models?baseUrl=http://localhost:11434
// Proxies to Ollama /api/tags so the frontend can list pulled models.
router.get('/ollama-models', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const rawBase = typeof req.query.baseUrl === 'string' ? req.query.baseUrl.trim() : 'http://localhost:11434';
    const base = rawBase.replace(/\/+$/, '').replace(/\/api(\/.*)?$/, '');
    const url = `${base}/api/tags`;

    const resp = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!resp.ok) {
      return next(createError(`Ollama responded with ${resp.status}`, 502, 'OLLAMA_ERROR'));
    }
    const json = await resp.json() as any;
    const models: string[] = (json?.models ?? []).map((m: any) => m.name as string).filter(Boolean);
    res.json({ success: true, data: { models } });
  } catch (err: any) {
    next(createError(err?.message || 'Failed to reach Ollama', 502, 'OLLAMA_ERROR'));
  }
});

// PUT /api/llm-config
router.put('/', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const parsed = upsertSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(createError(parsed.error.errors[0].message, 400, 'VALIDATION_ERROR'));
    }

    let cfg;
    if (parsed.data.clearKeyOnly) {
      cfg = await clearApiKeyOnly(req.user!.userId, parsed.data.provider);
      if (!cfg) {
        return next(createError('No config found for this provider', 404, 'NOT_FOUND'));
      }
    } else {
      cfg = await upsertUserLlmConfig(req.user!.userId, {
        provider: parsed.data.provider,
        model: parsed.data.model,
        baseUrl: parsed.data.baseUrl,
        apiKey: parsed.data.apiKey, // undefined keeps existing; null clears
      });
    }

    res.json({ success: true, data: { config: cfg } });
  } catch (err) {
    next(err);
  }
});

export default router;

