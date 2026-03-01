import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { createError } from './errorHandler';

export interface AuthRequest extends Request {
  user?: {
    userId: string;
    email: string;
  };
}

export function requireAuth(req: AuthRequest, _res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next(createError('Authorization token required', 401, 'UNAUTHORIZED'));
    }

    const token = authHeader.split(' ')[1];
    const secret = process.env.JWT_SECRET;

    if (!secret) {
      return next(createError('JWT secret not configured', 500, 'INTERNAL_ERROR'));
    }

    const decoded = jwt.verify(token, secret) as { userId: string; email: string };
    req.user = decoded;
    next();
  } catch {
    next(createError('Invalid or expired token', 401, 'UNAUTHORIZED'));
  }
}
