import { Router, IRouter, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { createError } from '../middleware/errorHandler';

const router: IRouter = Router();

// ─── Validation Schemas ───────────────────────────────────────────────────────

const registerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email format'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters'),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function signToken(userId: string, email: string): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is not configured');
  return jwt.sign({ userId, email }, secret, { expiresIn: '7d' });
}

// ─── POST /api/auth/register ──────────────────────────────────────────────────

router.post('/register', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = registerSchema.safeParse(req.body);
    if (!result.success) {
      return next(createError(result.error.errors[0].message, 400, 'VALIDATION_ERROR'));
    }

    const { name, email, password } = result.data;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return next(createError('Email is already registered', 409, 'EMAIL_EXISTS'));
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: { name, email, passwordHash },
      select: { id: true, name: true, email: true, createdAt: true },
    });

    const token = signToken(user.id, user.email);

    res.status(201).json({
      success: true,
      data: { user, token },
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/auth/login ─────────────────────────────────────────────────────

router.post('/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = loginSchema.safeParse(req.body);
    if (!result.success) {
      return next(createError(result.error.errors[0].message, 400, 'VALIDATION_ERROR'));
    }

    const { email, password } = result.data;

    const user = await prisma.user.findUnique({ where: { email } });

    // Intentionally vague error — don't reveal whether email exists
    if (!user || !user.passwordHash) {
      return next(createError('Invalid email or password', 401, 'INVALID_CREDENTIALS'));
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return next(createError('Invalid email or password', 401, 'INVALID_CREDENTIALS'));
    }

    const token = signToken(user.id, user.email);

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          createdAt: user.createdAt,
        },
        token,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/auth/oauth ─────────────────────────────────────────────────────
// Called by NextAuth after Google sign-in. Finds or creates the user and
// returns a backend JWT so frontend API calls can be authenticated.

router.post('/oauth', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, name } = req.body;
    if (!email || typeof email !== 'string') {
      return next(createError('Email is required', 400, 'VALIDATION_ERROR'));
    }

    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      user = await prisma.user.create({
        data: { email, name: name || email.split('@')[0] },
      });
    }

    const token = signToken(user.id, user.email);
    res.json({
      success: true,
      data: {
        user:  { id: user.id, name: user.name, email: user.email },
        token,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/auth/me ─────────────────────────────────────────────────────────

router.get('/me', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { id: true, name: true, email: true, image: true, createdAt: true, passwordHash: true },
    });

    if (!user) {
      return next(createError('User not found', 404, 'NOT_FOUND'));
    }

    const { passwordHash: _ph, ...userData } = user;
    res.json({
      success: true,
      data: { user: { ...userData, hasPassword: Boolean(user.passwordHash) } },
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/auth/change-password ───────────────────────────────────────────

router.post('/change-password', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = changePasswordSchema.safeParse(req.body);
    if (!result.success) {
      return next(createError(result.error.errors[0].message, 400, 'VALIDATION_ERROR'));
    }

    const { currentPassword, newPassword } = result.data;
    const userId = req.user!.userId;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true },
    });

    if (!user) {
      return next(createError('User not found', 404, 'NOT_FOUND'));
    }

    if (!user.passwordHash) {
      return next(createError('Account uses Google sign-in; password cannot be changed here', 400, 'OAUTH_ONLY'));
    }

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) {
      return next(createError('Current password is incorrect', 401, 'INVALID_PASSWORD'));
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });

    res.json({ success: true, data: { message: 'Password updated successfully' } });
  } catch (err) {
    next(err);
  }
});

export default router;
