import { Router, IRouter, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { createError } from '../middleware/errorHandler';

const router: IRouter = Router();

// ─── GET /api/analysis/:uploadId ──────────────────────────────────────────────
// Returns the AnalysisResult + Anomaly list for a completed upload.
// Ownership is verified against the authenticated user.

router.get('/:uploadId', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const uploadId = String(req.params.uploadId);

    // Verify upload exists and belongs to the user
    const upload = await prisma.logUpload.findUnique({
      where:  { id: uploadId },
      select: { userId: true, status: true },
    });

    if (!upload) {
      return next(createError('Upload not found', 404, 'NOT_FOUND'));
    }

    if (upload.userId !== req.user!.userId) {
      return next(createError('Access denied', 403, 'FORBIDDEN'));
    }

    if (upload.status !== 'COMPLETE') {
      return res.json({
        success: true,
        data: {
          status:    upload.status,
          analysis:  null,
          anomalies: [],
          message:   `Analysis not ready — upload status is ${upload.status}`,
        },
      });
    }

    // Fetch current analysis, history, and anomalies in parallel
    const [analysis, history, anomalies] = await Promise.all([
      prisma.analysisResult.findUnique({ where: { uploadId } }),
      prisma.analysisHistory.findMany({
        where:   { uploadId },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, provider: true, executiveSummary: true,
          totalRequests: true, blockedRequests: true,
          threatCount: true, anomalyCount: true,
          createdAt: true,
        },
      }),
      prisma.anomaly.findMany({
        where:   { uploadId },
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
      }),
    ]);

    res.json({
      success: true,
      data: {
        status: upload.status,
        analysis,
        history,
        anomalies,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/analysis/:uploadId/entries ──────────────────────────────────────
// Paginated list of LogEntries for an upload (supports ?anomalous=true filter).

router.get('/:uploadId/entries', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const uploadId      = String(req.params.uploadId);
    const anomalousOnly = req.query.anomalous === 'true';
    const page  = Math.max(1, parseInt(String(req.query.page  || '1'),  10));
    const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit || '50'), 10)));
    const skip  = (page - 1) * limit;

    // Verify ownership
    const upload = await prisma.logUpload.findUnique({
      where:  { id: uploadId },
      select: { userId: true },
    });

    if (!upload) {
      return next(createError('Upload not found', 404, 'NOT_FOUND'));
    }

    if (upload.userId !== req.user!.userId) {
      return next(createError('Access denied', 403, 'FORBIDDEN'));
    }

    const entrySelect = {
      id:             true,
      timestamp:      true,
      login:          true,
      cip:            true,
      sip:            true,
      action:         true,
      url:            true,
      urlsupercat:    true,
      urlcat:         true,
      threatname:     true,
      riskscore:      true,
      threatseverity: true,
      reqmethod:      true,
      respcode:       true,
      ua:             true,
      appname:        true,
      isAnomalous:    true,
      respdatasize:   true,
      dept:           true,
      location:       true,
      anomalies:      { select: { type: true, severity: true } },
    };

    let entries: any[];
    let total: number;

    if (anomalousOnly) {
      // When filtering anomalies, show one representative entry per anomaly
      // (the logEntryId linked directly to each anomaly record).
      // This avoids flooding the view with hundreds of rows from one aggregate anomaly.
      const anomalyRecords = await prisma.anomaly.findMany({
        where:   { uploadId, logEntryId: { not: null } },
        select:  { logEntryId: true, type: true, severity: true },
        orderBy: [{ severity: 'desc' }, { createdAt: 'asc' }],
      });

      // Deduplicate — one row per logEntryId
      const seen = new Set<string>();
      const uniqueEntryIds: string[] = [];
      for (const a of anomalyRecords) {
        if (a.logEntryId && !seen.has(a.logEntryId)) {
          seen.add(a.logEntryId);
          uniqueEntryIds.push(a.logEntryId);
        }
      }

      total = uniqueEntryIds.length;
      const pageIds = uniqueEntryIds.slice(skip, skip + limit);

      entries = pageIds.length > 0
        ? await prisma.logEntry.findMany({
            where:   { id: { in: pageIds } },
            orderBy: { timestamp: 'desc' },
            select:  entrySelect,
          })
        : [];
    } else {
      const where = { uploadId };
      [entries, total] = await Promise.all([
        prisma.logEntry.findMany({
          where,
          orderBy: { timestamp: 'desc' },
          skip,
          take: limit,
          select: entrySelect,
        }),
        prisma.logEntry.count({ where }),
      ]);
    }

    // Flatten anomaly types onto each entry for convenience
    const entriesWithFlags = entries.map((e: any) => ({
      ...e,
      anomalyTypes: (e.anomalies ?? []).map((a: { type: string }) => a.type),
      anomalies: undefined,
    }));

    res.json({
      success: true,
      data: {
        entries: entriesWithFlags,
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

export default router;
