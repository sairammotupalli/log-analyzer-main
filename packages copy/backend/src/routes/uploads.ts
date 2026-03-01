import { Router, IRouter, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import prisma from '../lib/prisma';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { createError } from '../middleware/errorHandler';
import { parseAndProcess } from '../services/logParser';
import { runAiAnalysis } from '../services/aiAnalysis';

const router: IRouter = Router();

// ─── Multer Configuration ─────────────────────────────────────────────────────

const defaultUploadDir =
  process.env.VERCEL
    ? '/tmp/uploads'
    : path.join(process.cwd(), 'uploads');

const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || defaultUploadDir);

// Ensure upload directory exists (serverless functions only allow writing to /tmp)
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const MAX_SIZE_MB = parseInt(process.env.MAX_FILE_SIZE_MB || '50', 10);
const ALLOWED_EXTENSIONS = new Set(['.log', '.txt', '.csv']);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename:    (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

const fileFilter = (
  _req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback,
) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ALLOWED_EXTENSIONS.has(ext)) {
    cb(null, true);
  } else {
    cb(new Error('INVALID_FILE_TYPE'));
  }
};

const uploader = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_SIZE_MB * 1024 * 1024 },
});

// ─── Multer Error Wrapper ─────────────────────────────────────────────────────
// Wraps multer middleware to convert its errors into our AppError format.

function uploadMiddleware(req: Request, res: Response, next: NextFunction) {
  uploader.single('file')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return next(createError(`File exceeds maximum size of ${MAX_SIZE_MB}MB`, 413, 'FILE_TOO_LARGE'));
      }
      return next(createError(err.message, 400, 'UPLOAD_ERROR'));
    }
    if (err) {
      if (err.message === 'INVALID_FILE_TYPE') {
        return next(createError('Only .log, .txt, and .csv files are accepted', 415, 'INVALID_FILE_TYPE'));
      }
      return next(err);
    }
    next();
  });
}

// ─── POST /api/uploads ────────────────────────────────────────────────────────

router.post('/', requireAuth, uploadMiddleware, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.file) {
      return next(createError('No file provided', 400, 'NO_FILE'));
    }

    const logUpload = await prisma.logUpload.create({
      data: {
        userId:       req.user!.userId,
        filename:     req.file.filename,
        originalName: req.file.originalname,
        fileSize:     req.file.size,
        status:       'PENDING',
      },
    });

    // On traditional servers we can "fire-and-forget" and let the client poll.
    // On serverless (e.g. Vercel) the process may freeze after the response,
    // so we process inline to ensure the upload reaches COMPLETE.
    if (process.env.VERCEL) {
      await parseAndProcess(logUpload.id, req.file.path);
    } else {
      parseAndProcess(logUpload.id, req.file.path).catch(console.error);
    }

    res.status(202).json({
      success: true,
      data: {
        id:      logUpload.id,
        status:  'PENDING',
        message: process.env.VERCEL
          ? 'File received. Processing completed.'
          : 'File received. Processing started.',
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/uploads ─────────────────────────────────────────────────────────

router.get('/', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const page  = Math.max(1, parseInt(String(req.query.page  || '1'),  10));
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || '20'), 10)));
    const skip  = (page - 1) * limit;

    const [uploads, total] = await Promise.all([
      prisma.logUpload.findMany({
        where:   { userId: req.user!.userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          id:           true,
          originalName: true,
          fileSize:     true,
          status:       true,
          totalEntries: true,
          errorMessage: true,
          createdAt:    true,
        },
      }),
      prisma.logUpload.count({ where: { userId: req.user!.userId } }),
    ]);

    res.json({
      success: true,
      data: {
        uploads,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/uploads/:id ─────────────────────────────────────────────────────

router.get('/:id', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const upload = await prisma.logUpload.findUnique({
      where:  { id: String(req.params.id) },
      select: {
        id:           true,
        originalName: true,
        fileSize:     true,
        status:       true,
        totalEntries: true,
        errorMessage: true,
        createdAt:    true,
        updatedAt:    true,
        userId:       true,
      },
    });

    if (!upload) {
      return next(createError('Upload not found', 404, 'NOT_FOUND'));
    }

    if (upload.userId !== req.user!.userId) {
      return next(createError('Access denied', 403, 'FORBIDDEN'));
    }

    const { userId: _userId, ...uploadData } = upload;

    // Fetch current analysis, history, and anomalies in parallel (only when COMPLETE)
    const [analysis, history, anomalies] = await Promise.all([
      upload.status === 'COMPLETE'
        ? prisma.analysisResult.findUnique({ where: { uploadId: upload.id } })
        : Promise.resolve(null),
      upload.status === 'COMPLETE'
        ? prisma.analysisHistory.findMany({
            where:   { uploadId: upload.id },
            orderBy: { createdAt: 'desc' },
            select: {
              id: true, provider: true, executiveSummary: true,
              totalRequests: true, blockedRequests: true,
              threatCount: true, anomalyCount: true,
              createdAt: true,
            },
          })
        : Promise.resolve([]),
      upload.status === 'COMPLETE'
        ? prisma.anomaly.findMany({
            where:   { uploadId: upload.id },
            orderBy: [{ severity: 'desc' }, { confidenceScore: 'desc' }],
            select: {
              id:              true,
              type:            true,
              severity:        true,
              description:     true,
              confidenceScore: true,
              affectedIp:      true,
              affectedUser:    true,
              details:         true,
              logEntryId:      true,
              createdAt:       true,
            },
          })
        : Promise.resolve([]),
    ]);

    res.json({
      success: true,
      data: { upload: uploadData, analysis, history, anomalies },
    });
  } catch (err) {
    next(err);
  }
});

// ─── DELETE /api/uploads/:id ──────────────────────────────────────────────────

router.delete('/:id', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const upload = await prisma.logUpload.findUnique({
      where:  { id: String(req.params.id) },
      select: { id: true, userId: true, filename: true },
    });

    if (!upload) {
      return next(createError('Upload not found', 404, 'NOT_FOUND'));
    }

    if (upload.userId !== req.user!.userId) {
      return next(createError('Access denied', 403, 'FORBIDDEN'));
    }

    // Delete DB record — cascades to log_entries, analysis_results, anomalies
    await prisma.logUpload.delete({ where: { id: upload.id } });

    // Delete physical file (best-effort, don't fail if already missing)
    const filePath = path.join(UPLOAD_DIR, upload.filename);
    fs.unlink(filePath, (err) => {
      if (err) console.warn(`[DELETE] Could not remove file ${filePath}:`, err.message);
    });

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/uploads/:id/reanalyze ─────────────────────────────────────────
// Re-runs the AI analysis for a completed upload using the user's current LLM.
// Useful when the user switches providers and wants fresh output without re-uploading.

router.post('/:id/reanalyze', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const uploadId = String(req.params.id);

    const upload = await prisma.logUpload.findUnique({
      where:  { id: uploadId },
      select: { userId: true, status: true },
    });

    if (!upload) return next(createError('Upload not found', 404, 'NOT_FOUND'));
    if (upload.userId !== req.user!.userId) return next(createError('Access denied', 403, 'FORBIDDEN'));
    if (upload.status !== 'COMPLETE') return next(createError('Upload is not complete yet', 400, 'NOT_READY'));

    // Fire-and-forget so the response returns immediately while analysis runs.
    runAiAnalysis(uploadId, req.user!.userId).catch(console.error);

    res.json({ success: true, data: { message: 'Re-analysis started. Results will update shortly.' } });
  } catch (err) {
    next(err);
  }
});

export default router;
