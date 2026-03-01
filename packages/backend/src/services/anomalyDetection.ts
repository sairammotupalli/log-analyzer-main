import { AnomalyType, Severity, Prisma } from '@prisma/client';
import prisma from '../lib/prisma';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DetectedAnomaly {
  type:         AnomalyType;
  severity:     Severity;
  description:  string;
  affectedIp?:  string;
  affectedUser?: string;
  logEntryId?:  string;
  details:      Record<string, unknown>;
}

// Subset of LogEntry fields we select for rule evaluation
type EntrySlice = {
  id:            string;
  timestamp:     Date;
  cip:           string | null;
  sip:           string | null;
  login:         string | null;
  action:        string | null;
  threatname:    string | null;
  malwarecat:    string | null;
  riskscore:     number | null;
  threatseverity: string | null;
  url:           string | null;
  urlsupercat:   string | null;
  urlcat:        string | null;
  ua:            string | null;
  respdatasize:  number | null;
};

// ─── Rule Thresholds ──────────────────────────────────────────────────────────

const RATE_WINDOW_MS        = 5 * 60 * 1000;  // 5 minutes
const RATE_THRESHOLD        = 100;
const BLOCK_THRESHOLD       = 10;
const RISK_THRESHOLD        = 75;
const LARGE_TRANSFER_BYTES  = 50 * 1024 * 1024; // 50 MB
const OFF_HOURS_START_UTC   = 7;
const OFF_HOURS_END_UTC     = 20;
const OFF_HOURS_MIN_REQS    = 5;
const MAX_ANOMALIES = 15;

const SUSPICIOUS_UA_RE = /curl|python|wget|scrapy|httpie|go-http-client|masscan|nmap/i;

const MALICIOUS_SUPERCATS = new Set([
  'Malicious Content', 'Spyware/Adware', 'Privacy', 'Security',
  'Botnet', 'Phishing', 'Command and Control',
]);

// ─── Utility ──────────────────────────────────────────────────────────────────

function groupBy<T>(arr: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of arr) {
    const k = key(item);
    const group = map.get(k);
    if (group) group.push(item);
    else map.set(k, [item]);
  }
  return map;
}

// ─── Rule Runners ─────────────────────────────────────────────────────────────

// R1 — Same IP > 100 requests within any 5-minute window
function ruleHighRequestRate(entries: EntrySlice[]): DetectedAnomaly[] {
  const anomalies: DetectedAnomaly[] = [];
  const withIp = entries.filter(e => e.cip != null) as (EntrySlice & { cip: string })[];
  const byIp = groupBy(withIp, e => e.cip);

  for (const [ip, ipEntries] of byIp) {
    const sorted = ipEntries.slice().sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    let windowStart = 0;

    for (let i = 0; i < sorted.length; i++) {
      const windowEnd = sorted[i].timestamp.getTime();
      while (sorted[windowStart].timestamp.getTime() < windowEnd - RATE_WINDOW_MS) windowStart++;
      const count = i - windowStart + 1;

      if (count >= RATE_THRESHOLD) {
        // Collect the IDs of entries within the spike window
        const windowEntryIds = sorted.slice(windowStart, i + 1).map(e => e.id);
        anomalies.push({
          type:        'HIGH_REQUEST_RATE',
          severity:    'HIGH',
          description: `IP ${ip} made ${count} requests within a 5-minute window`,
          affectedIp:  ip,
          logEntryId:  windowEntryIds[0], // primary entry for the anomaly record
          details: {
            requestCount:   count,
            windowStart:    sorted[windowStart].timestamp.toISOString(),
            windowEnd:      sorted[i].timestamp.toISOString(),
            windowEntryIds, // all IDs in spike — used to mark isAnomalous
          },
        });
        break; // one anomaly per IP
      }
    }
  }
  return anomalies;
}

// R2 — Same IP with > 10 blocked requests
function ruleRepeatedBlock(entries: EntrySlice[]): DetectedAnomaly[] {
  const anomalies: DetectedAnomaly[] = [];
  const blocked = entries.filter(e => e.action?.toLowerCase() === 'blocked' && e.cip != null) as (EntrySlice & { cip: string })[];
  const byIp = groupBy(blocked, e => e.cip);

  for (const [ip, ipEntries] of byIp) {
    if (ipEntries.length >= BLOCK_THRESHOLD) {
      const blockedEntryIds = ipEntries.map(e => e.id);
      anomalies.push({
        type:        'REPEATED_BLOCK',
        severity:    'HIGH',
        description: `IP ${ip} triggered ${ipEntries.length} blocked requests`,
        affectedIp:  ip,
        logEntryId:  blockedEntryIds[0],
        details: {
          blockedCount:   ipEntries.length,
          sampleUrls:     ipEntries.slice(0, 5).map(e => e.url),
          blockedEntryIds, // all blocked IDs — used to mark isAnomalous
        },
      });
    }
  }
  return anomalies;
}

// R3 — Any entry with a non-null threatname (one anomaly per unique ip+threat pair)
function ruleThreatDetected(entries: EntrySlice[]): DetectedAnomaly[] {
  const seen = new Set<string>();
  const anomalies: DetectedAnomaly[] = [];

  for (const e of entries) {
    if (!e.threatname || e.threatname === 'None') continue;
    const key = `${e.cip ?? ''}:${e.threatname}`;
    if (seen.has(key)) continue;
    seen.add(key);

    anomalies.push({
      type:         'THREAT_DETECTED',
      severity:     'CRITICAL',
      description:  `Threat "${e.threatname}" detected from IP ${e.cip ?? 'unknown'}`,
      affectedIp:   e.cip ?? undefined,
      affectedUser: e.login ?? undefined,
      logEntryId:   e.id,
      details: {
        threatname:     e.threatname,
        malwarecat:     e.malwarecat,
        url:            e.url,
        threatseverity: e.threatseverity,
      },
    });
  }
  return anomalies;
}

// R4 — riskscore > 75 (one anomaly per IP, highest score entry)
function ruleHighRiskScore(entries: EntrySlice[]): DetectedAnomaly[] {
  const worstByIp = new Map<string, EntrySlice>();

  for (const e of entries) {
    if (e.riskscore == null || e.riskscore <= RISK_THRESHOLD) continue;
    const ip = e.cip ?? '_unknown';
    const current = worstByIp.get(ip);
    if (!current || e.riskscore > (current.riskscore ?? 0)) worstByIp.set(ip, e);
  }

  return Array.from(worstByIp.values()).map(e => ({
    type:         'HIGH_RISK_SCORE' as AnomalyType,
    severity:     'HIGH'           as Severity,
    description:  `High risk score ${e.riskscore} from IP ${e.cip ?? 'unknown'} accessing ${e.url ?? 'unknown URL'}`,
    affectedIp:   e.cip  ?? undefined,
    affectedUser: e.login ?? undefined,
    logEntryId:   e.id,
    details: {
      riskscore: e.riskscore,
      url:       e.url,
      urlcat:    e.urlcat,
    },
  }));
}

// R5 — Suspicious user-agent (one anomaly per unique IP+UA pattern)
function ruleSuspiciousUA(entries: EntrySlice[]): DetectedAnomaly[] {
  const seen = new Set<string>();
  const anomalies: DetectedAnomaly[] = [];

  for (const e of entries) {
    if (!e.ua || !SUSPICIOUS_UA_RE.test(e.ua)) continue;
    const key = `${e.cip ?? ''}:${e.ua.substring(0, 40)}`;
    if (seen.has(key)) continue;
    seen.add(key);

    anomalies.push({
      type:         'SUSPICIOUS_UA',
      severity:     'MEDIUM',
      description:  `Suspicious user-agent from IP ${e.cip ?? 'unknown'}: "${e.ua.substring(0, 80)}"`,
      affectedIp:   e.cip  ?? undefined,
      affectedUser: e.login ?? undefined,
      logEntryId:   e.id,
      details: { ua: e.ua, url: e.url },
    });
  }
  return anomalies;
}

// R6 — Off-hours access: requests outside 07:00–20:00 UTC, grouped by IP
function ruleOffHoursAccess(entries: EntrySlice[]): DetectedAnomaly[] {
  const anomalies: DetectedAnomaly[] = [];
  const offHours = entries.filter(e => {
    const h = e.timestamp.getUTCHours();
    return (h < OFF_HOURS_START_UTC || h >= OFF_HOURS_END_UTC) && e.cip != null;
  }) as (EntrySlice & { cip: string })[];

  const byIp = groupBy(offHours, e => e.cip);

  for (const [ip, ipEntries] of byIp) {
    if (ipEntries.length >= OFF_HOURS_MIN_REQS) {
      const offHoursEntryIds = ipEntries.map(e => e.id);
      anomalies.push({
        type:        'OFF_HOURS_ACCESS',
        severity:    'MEDIUM',
        description: `IP ${ip} made ${ipEntries.length} requests outside business hours (07:00–20:00 UTC)`,
        affectedIp:  ip,
        logEntryId:  offHoursEntryIds[0],
        details: {
          requestCount:     ipEntries.length,
          sampleTimes:      ipEntries.slice(0, 5).map(e => e.timestamp.toISOString()),
          offHoursEntryIds, // all off-hours IDs — used to mark isAnomalous
        },
      });
    }
  }
  return anomalies;
}

// R7 — Response data size > 50 MB (one anomaly per log entry, unique per IP)
function ruleLargeTransfer(entries: EntrySlice[]): DetectedAnomaly[] {
  const seen = new Set<string>();
  const anomalies: DetectedAnomaly[] = [];

  for (const e of entries) {
    if (e.respdatasize == null || e.respdatasize <= LARGE_TRANSFER_BYTES) continue;
    const key = e.cip ?? e.id;
    if (seen.has(key)) continue;
    seen.add(key);

    const mb = (e.respdatasize / (1024 * 1024)).toFixed(1);
    anomalies.push({
      type:         'LARGE_TRANSFER',
      severity:     'HIGH',
      description:  `${mb}MB data transfer from ${e.sip ?? 'unknown'} to IP ${e.cip ?? 'unknown'}`,
      affectedIp:   e.cip  ?? undefined,
      affectedUser: e.login ?? undefined,
      logEntryId:   e.id,
      details: {
        respdatasize: e.respdatasize,
        url:          e.url,
        sip:          e.sip,
      },
    });
  }
  return anomalies;
}

// R8 — Malicious URL category that was blocked (one per unique IP+category)
function ruleMaliciousCategory(entries: EntrySlice[]): DetectedAnomaly[] {
  const seen = new Set<string>();
  const anomalies: DetectedAnomaly[] = [];

  for (const e of entries) {
    if (!e.urlsupercat || !MALICIOUS_SUPERCATS.has(e.urlsupercat)) continue;
    if (e.action?.toLowerCase() !== 'blocked') continue;
    const key = `${e.cip ?? ''}:${e.urlsupercat}`;
    if (seen.has(key)) continue;
    seen.add(key);

    anomalies.push({
      type:         'MALICIOUS_CATEGORY',
      severity:     'CRITICAL',
      description:  `Access to "${e.urlsupercat}" category blocked for IP ${e.cip ?? 'unknown'}`,
      affectedIp:   e.cip  ?? undefined,
      affectedUser: e.login ?? undefined,
      logEntryId:   e.id,
      details: {
        urlsupercat: e.urlsupercat,
        urlcat:      e.urlcat,
        url:         e.url,
      },
    });
  }
  return anomalies;
}


function fallbackFlagReason(anomaly: DetectedAnomaly): string {
  const d = anomaly.details as Record<string, unknown>;
  const ip = anomaly.affectedIp ?? null;

  switch (anomaly.type) {
    case 'HIGH_REQUEST_RATE': {
      const count = d.requestCount ?? '100+';
      const start = d.windowStart ? ` starting at ${d.windowStart}` : '';
      return ip
        ? `IP ${ip} made ${count} requests within a 5-minute window${start}, exceeding the high-request-rate threshold.`
        : `A source IP made ${count} requests within a 5-minute window, exceeding the high-request-rate threshold.`;
    }
    case 'REPEATED_BLOCK': {
      const count = d.blockCount ?? 'multiple';
      return ip
        ? `IP ${ip} triggered ${count} blocked requests, indicating repeated attempts to reach prohibited or malicious destinations.`
        : `A source IP triggered ${count} blocked requests in a short period, indicating repeated policy violations.`;
    }
    case 'THREAT_DETECTED': {
      const threat = d.threatname ?? anomaly.description;
      return ip
        ? `A known threat "${threat}" was detected in traffic from IP ${ip}, triggering this anomaly.`
        : `A known threat indicator "${threat}" was found in the log, triggering this anomaly.`;
    }
    case 'HIGH_RISK_SCORE': {
      const score = d.riskscore ?? d.maxRiskScore ?? 'high';
      return ip
        ? `IP ${ip} has a risk score of ${score}, which exceeds the accepted threshold and signals high-risk activity.`
        : `A request with risk score ${score} exceeded the accepted threshold, flagging it as high-risk.`;
    }
    case 'SUSPICIOUS_UA': {
      const ua = d.ua ?? 'non-browser user agent';
      return ip
        ? `IP ${ip} used a suspicious user agent ("${ua}") consistent with scripted tools, scanners, or automation.`
        : `A suspicious user agent ("${ua}") was detected, consistent with automated tooling or scanning.`;
    }
    case 'OFF_HOURS_ACCESS': {
      const count = d.requestCount ?? 'multiple';
      return ip
        ? `IP ${ip} made ${count} requests during off-hours (outside 07:00–20:00 UTC), which is outside normal operating hours.`
        : `${count} requests were made during off-hours (outside 07:00–20:00 UTC), which is outside normal operating hours.`;
    }
    case 'LARGE_TRANSFER': {
      const mb = typeof d.bytes === 'number' ? `${(d.bytes / 1048576).toFixed(1)} MB` : 'large volume';
      return ip
        ? `IP ${ip} transferred ${mb} of data, far exceeding the 50 MB threshold for a single session.`
        : `A transfer of ${mb} was detected, far exceeding the 50 MB anomaly threshold.`;
    }
    case 'MALICIOUS_CATEGORY': {
      const cat = d.urlsupercat ?? d.category ?? 'malicious category';
      return ip
        ? `IP ${ip} attempted to access URLs classified under "${cat}", a category associated with malware, phishing, or C2 activity.`
        : `Requests to URLs in the "${cat}" category were detected, which is associated with malware, phishing, or C2 activity.`;
    }
    default:
      return anomaly.description;
  }
}

function fallbackActions(anomaly: DetectedAnomaly, sampleEntries: EntrySlice[]): string[] {
  const ip = anomaly.affectedIp ?? sampleEntries[0]?.cip ?? null;
  const url = sampleEntries[0]?.url ?? (anomaly.details as { url?: string })?.url ?? null;
  const threat = sampleEntries.find(e => e.threatname)?.threatname ?? null;
  const cat = (anomaly.details as { urlsupercat?: string })?.urlsupercat ?? sampleEntries[0]?.urlsupercat ?? null;

  switch (anomaly.type) {
    case 'HIGH_REQUEST_RATE':
      return [
        ip ? `Rate-limit or block IP ${ip} at the proxy/firewall.` : 'Rate-limit the source IP at the proxy/firewall.',
        ip ? `Review requests from IP ${ip} in the 5-minute spike window.` : 'Review requests in the 5-minute spike window.',
        ip ? `Correlate IP ${ip} with threat intel and prior incidents.` : 'Correlate the IP with threat intel.',
      ];
    case 'REPEATED_BLOCK':
      return [
        ip ? `Investigate blocked destinations for IP ${ip} — possible malware beaconing.` : 'Investigate repeated blocked destinations for malware beaconing.',
        ip ? `Check endpoint telemetry for IP ${ip} and associated user account.` : 'Check endpoint telemetry for the affected host.',
        'Escalate to incident response if blocked attempts continue.',
      ];
    case 'THREAT_DETECTED':
      return [
        ip ? `Isolate endpoint at IP ${ip} — threat "${threat || 'detected'}" suspected.` : 'Isolate the affected endpoint if malicious payload is suspected.',
        url || ip ? `Collect IOCs: ${[url, ip].filter(Boolean).join(', ')} — add to detections.` : 'Collect IOC artifacts and add to detections.',
        threat ? `Run targeted sweep for threat "${threat}" across logs.` : 'Run targeted sweep for same threat indicators across logs.',
      ];
    case 'HIGH_RISK_SCORE':
      return [
        ip ? `Triage high-risk sessions from IP ${ip} and validate user intent.` : 'Prioritize triage of high-risk sessions.',
        url ? `Review destination ${url} for reputation and category.` : 'Review destination reputation and category for involved URLs.',
        ip ? `Increase monitoring for IP ${ip}.` : 'Increase monitoring for the affected source IP.',
      ];
    case 'SUSPICIOUS_UA':
      return [
        ip ? `Confirm command-line/automation usage is expected for IP ${ip}.` : 'Confirm whether automation usage is expected for this host.',
        'Inspect request cadence for automation, scraping, or reconnaissance.',
        'Apply stricter controls for non-browser user agents if policy requires.',
      ];
    case 'OFF_HOURS_ACCESS':
      return [
        ip ? `Validate off-hours activity from IP ${ip} aligns with approved operations.` : 'Validate whether off-hours activity aligns with approved operations.',
        'Check for impossible travel or unusual login behavior.',
        'Trigger additional MFA/challenge for after-hours access.',
      ];
    case 'LARGE_TRANSFER':
      return [
        ip ? `Validate transfer from IP ${ip} was business-approved and data-safe.` : 'Validate whether the transfer was business-approved.',
        'Investigate destination and protocol for potential data exfiltration.',
        ip ? `Enable DLP follow-up for IP ${ip}.` : 'Enable DLP follow-up for the affected host.',
      ];
    case 'MALICIOUS_CATEGORY':
      return [
        cat ? `Review blocked attempts to category "${cat}" for compromise indicators.` : 'Review blocked malicious-category attempts.',
        ip ? `Hunt for related access from IP ${ip} across all users.` : 'Hunt for related domain/IP access across all users.',
        'Apply endpoint scan and containment for impacted assets.',
      ];
    default:
      return ip
        ? [`Review logs for IP ${ip} and validate anomaly context.`, 'Escalate to SOC lead if suspicious behavior persists.']
        : ['Review related logs and validate anomaly context.', 'Escalate to SOC lead if suspicious behavior persists.'];
  }
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export async function runAnomalyDetection(uploadId: string, userId: string): Promise<number> {
  const entries = await prisma.logEntry.findMany({
    where:  { uploadId },
    select: {
      id: true, timestamp: true, cip: true, sip: true, login: true,
      action: true, threatname: true, malwarecat: true, riskscore: true,
      threatseverity: true, url: true, urlsupercat: true, urlcat: true,
      ua: true, respdatasize: true,
    },
  });

  if (entries.length === 0) return 0;

  // Run all 8 rules — order determines priority when capping
  const raw: DetectedAnomaly[] = [
    ...ruleThreatDetected(entries),       // R3 CRITICAL first
    ...ruleMaliciousCategory(entries),    // R8 CRITICAL
    ...ruleHighRequestRate(entries),      // R1 HIGH
    ...ruleRepeatedBlock(entries),        // R2 HIGH
    ...ruleHighRiskScore(entries),        // R4 HIGH
    ...ruleLargeTransfer(entries),        // R7 HIGH
    ...ruleSuspiciousUA(entries),         // R5 MEDIUM
    ...ruleOffHoursAccess(entries),       // R6 MEDIUM
  ];

  if (raw.length === 0) return 0;

  const toEnrich = raw.slice(0, MAX_ANOMALIES);
  const anomalyRows: Prisma.AnomalyCreateManyInput[] = [];
  const anomalousEntryIds = new Set<string>();

  // Use rule-based results directly — no per-anomaly LLM calls.
  // The single aiAnalysis LLM call (executive summary) covers the overall assessment.
  for (const a of toEnrich) {
    const sampleEntries = a.logEntryId
      ? entries.filter((e) => e.id === a.logEntryId)
      : entries.filter((e) => e.cip === a.affectedIp).slice(0, 3);
    anomalyRows.push({
      uploadId,
      logEntryId:      a.logEntryId ?? null,
      type:            a.type,
      severity:        a.severity,
      description:     a.description,
      confidenceScore: 0.75,
      affectedIp:      a.affectedIp ?? null,
      affectedUser:    a.affectedUser ?? null,
      details:         {
        ...a.details,
        flagReason:         fallbackFlagReason(a),
        recommendedActions: fallbackActions(a, sampleEntries),
      } as Prisma.InputJsonValue,
    });
    if (a.logEntryId) anomalousEntryIds.add(a.logEntryId);
  }

  await prisma.anomaly.createMany({ data: anomalyRows });

  // Collect extra entry IDs stored inside aggregate anomaly details (R1/R2/R6).
  for (const a of toEnrich) {
    const d = a.details as Record<string, unknown>;
    for (const key of ['windowEntryIds', 'blockedEntryIds', 'offHoursEntryIds']) {
      if (Array.isArray(d[key])) {
        for (const id of d[key] as string[]) anomalousEntryIds.add(id);
      }
    }
  }

  const idsToMark = Array.from(anomalousEntryIds);
  if (idsToMark.length > 0) {
    await prisma.logEntry.updateMany({
      where: { id: { in: idsToMark } },
      data:  { isAnomalous: true },
    });
  }

  console.log(`[anomalyDetection] ${anomalyRows.length} anomalies saved for upload ${uploadId}`);
  return anomalyRows.length;
}
