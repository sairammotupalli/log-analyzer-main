import { parse } from 'csv-parse/sync';
import fs from 'fs';
import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { runAnomalyDetection } from './anomalyDetection';
import { runAiAnalysis } from './aiAnalysis';

// ─── Constants ────────────────────────────────────────────────────────────────

const BATCH_SIZE = 500;

// Values treated as null when stored
const NULL_VALUES = new Set(['None', 'N/A', 'NA', '--', 'none', 'n/a', '']);

// Day-of-week prefixes used in ZScaler timestamps e.g. "Mon Jun 20 15:29:11 2022"
const DOW_PREFIXES = new Set(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function nullify(value: string): string | null {
  const trimmed = value.trim();
  return NULL_VALUES.has(trimmed) ? null : trimmed || null;
}

function toInt(value: string): number | null {
  const n = parseInt(value.trim(), 10);
  return isNaN(n) ? null : n;
}

function toTimestamp(value: string): Date {
  const d = new Date(value.trim());
  return isNaN(d.getTime()) ? new Date() : d;
}

function isHeaderRow(row: string[]): boolean {
  // ZScaler data rows start with a day-of-week abbreviation
  // Header rows start with field names like "time" or "Time"
  const first = (row[0] || '').trim();
  return !DOW_PREFIXES.has(first.substring(0, 3));
}

// ─── Row Mapper ───────────────────────────────────────────────────────────────
// Maps a raw CSV row (string[]) to a LogEntry DB shape.
// Field positions match the ZScaler NSS Web Log Feed format (34 fields from PDF).

function mapRow(uploadId: string, row: string[]): Prisma.LogEntryCreateManyInput | null {
  if (row.length < 4) return null; // skip malformed/empty rows

  const get = (i: number): string => (row[i] ?? '').trim();

  return {
    uploadId,

    // ── Core Transaction ──────────────────────
    timestamp:  toTimestamp(get(0)),    // time
    login:      nullify(get(1)),        // login
    proto:      nullify(get(2)),        // proto
    url:        nullify(get(3)),        // url
    action:     nullify(get(4)),        // action
    appname:    nullify(get(5)),        // appname
    appclass:   nullify(get(6)),        // appclass

    // ── Size ──────────────────────────────────
    reqsize:      toInt(get(7)),        // reqsize
    respsize:     toInt(get(8)),        // respsize
    reqdatasize:  toInt(get(9)),        // reqdatasize
    respdatasize: toInt(get(10)),       // respdatasize

    // ── URL Categories ────────────────────────
    urlsupercat:  nullify(get(11)),     // urlsupercat
    urlcat:       nullify(get(12)),     // urlcat
    urlsubcat:    nullify(get(13)),     // urlsubcat

    // ── Threat & Risk ─────────────────────────
    threatname:    nullify(get(14)),    // threatname
    malwarecat:    nullify(get(15)),    // malwarecat
    riskscore:     toInt(get(16)),      // riskscore
    dlpeng:        nullify(get(17)),    // dlpeng
    dlpdict:       nullify(get(18)),    // dlpdict

    // ── User & Network ────────────────────────
    location:  nullify(get(19)),        // location
    dept:      nullify(get(20)),        // dept
    cip:       nullify(get(21)),        // cip (client IP)
    sip:       nullify(get(22)),        // sip (server IP)

    // ── Request ───────────────────────────────
    reqmethod: nullify(get(23)),        // reqmethod
    respcode:  nullify(get(24)),        // respcode
    ua:        nullify(get(25)),        // ua (user agent)

    // ── Policy ────────────────────────────────
    keyprotectiontype: nullify(get(26)), // keyprotectiontype
    ruletype:          nullify(get(27)), // ruletype
    rulelabel:         nullify(get(28)), // rulelabel
    unscannabletype:   nullify(get(29)), // unscannabletype
    ssldecrypted:      nullify(get(30)), // ssldecrypted
    reason:            nullify(get(31)), // reason
    threatseverity:    nullify(get(32)), // threatseverity
    contenttype:       nullify(get(33)), // contenttype

    isAnomalous: false,
    rawData:     { row },               // raw backup for debugging
  };
}

// ─── Main Parse Function ──────────────────────────────────────────────────────

export async function parseLogFile(uploadId: string, filePath: string): Promise<number> {
  const fileContent = fs.readFileSync(filePath, 'utf-8');

  const records = parse(fileContent, {
    columns: false,           // treat as positional array, not named columns
    skip_empty_lines: true,
    relax_column_count: true, // allow rows with fewer/more columns
    trim: true,
  }) as string[][];

  // Skip header row if present
  const startIndex = records.length > 0 && isHeaderRow(records[0]) ? 1 : 0;
  const dataRows = records.slice(startIndex);

  let totalInserted = 0;

  // Process in batches of BATCH_SIZE to avoid DB overload
  for (let i = 0; i < dataRows.length; i += BATCH_SIZE) {
    const batch = dataRows
      .slice(i, i + BATCH_SIZE)
      .map(row => mapRow(uploadId, row))
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

    if (batch.length > 0) {
      await prisma.logEntry.createMany({ data: batch });
      totalInserted += batch.length;
    }
  }

  return totalInserted;
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────
// Called asynchronously after upload. Drives the full processing pipeline.
// Phase 5 will inject anomaly detection + AI analysis between PARSING and COMPLETE.

export async function parseAndProcess(uploadId: string, filePath: string): Promise<void> {
  try {
    const upload = await prisma.logUpload.findUnique({
      where: { id: uploadId },
      select: { userId: true },
    });
    if (!upload) throw new Error('Upload not found');

    // 1. Parse
    await prisma.logUpload.update({
      where: { id: uploadId },
      data: { status: 'PARSING' },
    });

    const totalEntries = await parseLogFile(uploadId, filePath);

    await prisma.logUpload.update({
      where: { id: uploadId },
      data: { totalEntries, status: 'ANALYZING' },
    });

    // 2. Anomaly detection + AI analysis
    const anomalyCount = await runAnomalyDetection(uploadId, upload.userId);
    await runAiAnalysis(uploadId, upload.userId);
    console.log(`[parseAndProcess] Anomaly detection complete — ${anomalyCount} anomalies found`);

    // 3. Complete
    await prisma.logUpload.update({
      where: { id: uploadId },
      data: { status: 'COMPLETE' },
    });

    console.log(`[parseAndProcess] Upload ${uploadId} complete — ${totalEntries} entries`);
  } catch (err) {
    console.error(`[parseAndProcess] Failed for upload ${uploadId}:`, err);

    await prisma.logUpload.update({
      where: { id: uploadId },
      data: {
        status: 'FAILED',
        errorMessage: err instanceof Error ? err.message : 'Unknown error during processing',
      },
    });
  }
}
