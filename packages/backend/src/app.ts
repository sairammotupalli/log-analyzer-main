import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';

// Load env: try repo root .env first (monorepo), then local .env as fallback
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();

import authRoutes from './routes/auth';
import uploadRoutes from './routes/uploads';
import analysisRoutes from './routes/analysis';
import llmConfigRoutes from './routes/llmConfig';
import { errorHandler } from './middleware/errorHandler';

export function createApp() {
  const app = express();

  app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  }));

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Routes
  app.use('/api/auth', authRoutes);
  app.use('/api/uploads', uploadRoutes);
  app.use('/api/analysis', analysisRoutes);
  app.use('/api/llm-config', llmConfigRoutes);

  // Global error handler — must be last
  app.use(errorHandler);

  return app;
}

const app = createApp();
export default app;

