import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { llmText, getEffectiveProvider } from '../lib/llm';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TimelineEvent {
  time:  string;
  event: string;
}

interface ThreatEntry {
  name:        string;
  count:       number;
  severity:    string;
  description: string;
}

interface IpRiskRow {
  ip:           string;
  requests:     number;
  blocked:      number;
  threats:      number;
  anomalyTypes: string[];
}

interface BlockedDestination {
  url:      string;
  category: string;
  count:    number;
}

interface AggregatedStats {
  totalRequests:        number;
  blockedRequests:      number;
  threatCount:          number;
  anomalyCount:         number;
  uniqueUsers:          number;
  uniqueIPs:            number;
  blockRate:            number;
  topIPs:               { ip: string; count: number }[];
  topCategories:        { category: string; count: number }[];
  ipRiskSummary:        IpRiskRow[];
  topBlockedDests:      BlockedDestination[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function countBy<T>(arr: T[], key: (item: T) => string | null): { label: string; count: number }[] {
  const map = new Map<string, number>();
  for (const item of arr) {
    const k = key(item);
    if (k == null) continue;
    map.set(k, (map.get(k) ?? 0) + 1);
  }
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([label, count]) => ({ label, count }));
}

// ─── Aggregate Stats ──────────────────────────────────────────────────────────

async function buildStats(uploadId: string): Promise<{
  stats:         AggregatedStats;
  timeRangeStart: Date | null;
  timeRangeEnd:   Date | null;
  anomalyCount:   number;
}> {
  const [entries, anomalies, anomalyRows] = await Promise.all([
    prisma.logEntry.findMany({
      where:  { uploadId },
      select: {
        timestamp: true, cip: true, login: true, action: true,
        url: true, urlsupercat: true, urlcat: true,
        threatname: true, riskscore: true, isAnomalous: true,
      },
    }),
    prisma.anomaly.count({ where: { uploadId } }),
    prisma.anomaly.findMany({
      where:  { uploadId },
      select: { affectedIp: true, type: true },
    }),
  ]);

  const totalRequests   = entries.length;
  const blockedRequests = entries.filter(e => e.action?.toLowerCase() === 'blocked').length;
  const threatCount     = entries.filter(e => e.threatname && e.threatname !== 'None').length;
  const uniqueUsers     = new Set(entries.map(e => e.login).filter(Boolean)).size;
  const uniqueIPs       = new Set(entries.map(e => e.cip).filter(Boolean)).size;

  const timestamps = entries.map(e => e.timestamp).sort((a, b) => a.getTime() - b.getTime());
  const timeRangeStart = timestamps[0] ?? null;
  const timeRangeEnd   = timestamps[timestamps.length - 1] ?? null;

  const ipCounts  = countBy(entries, e => e.cip);
  const catCounts = countBy(entries, e => e.urlsupercat);

  // ── IP Risk Summary ──────────────────────────────────────────────────────────
  // Build a per-IP breakdown: request count, blocked count, threat count, anomaly types.
  const ipAnomalyTypes = new Map<string, Set<string>>();
  for (const a of anomalyRows) {
    if (!a.affectedIp) continue;
    if (!ipAnomalyTypes.has(a.affectedIp)) ipAnomalyTypes.set(a.affectedIp, new Set());
    ipAnomalyTypes.get(a.affectedIp)!.add(a.type);
  }

  const ipMap = new Map<string, { requests: number; blocked: number; threats: number }>();
  for (const e of entries) {
    const ip = e.cip;
    if (!ip) continue;
    if (!ipMap.has(ip)) ipMap.set(ip, { requests: 0, blocked: 0, threats: 0 });
    const row = ipMap.get(ip)!;
    row.requests++;
    if (e.action?.toLowerCase() === 'blocked') row.blocked++;
    if (e.threatname && e.threatname !== 'None') row.threats++;
  }

  const ipRiskSummary: IpRiskRow[] = [...ipMap.entries()]
    .sort((a, b) => {
      // Sort by threats first, then blocked, then total requests
      const aScore = a[1].threats * 100 + a[1].blocked * 10 + a[1].requests;
      const bScore = b[1].threats * 100 + b[1].blocked * 10 + b[1].requests;
      return bScore - aScore;
    })
    .slice(0, 10)
    .map(([ip, row]) => ({
      ip,
      requests:     row.requests,
      blocked:      row.blocked,
      threats:      row.threats,
      anomalyTypes: [...(ipAnomalyTypes.get(ip) ?? [])],
    }));

  // ── Top Blocked Destinations ─────────────────────────────────────────────────
  const blockedEntries = entries.filter(e => e.action?.toLowerCase() === 'blocked' && e.url);
  const destMap = new Map<string, { category: string; count: number }>();
  for (const e of blockedEntries) {
    const url = e.url!;
    // Normalise to domain only for grouping
    let domain = url;
    try { domain = new URL(url).hostname; } catch { /* keep raw */ }
    if (!destMap.has(domain)) destMap.set(domain, { category: e.urlsupercat ?? e.urlcat ?? 'Unknown', count: 0 });
    destMap.get(domain)!.count++;
  }

  const topBlockedDests: BlockedDestination[] = [...destMap.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 10)
    .map(([url, { category, count }]) => ({ url, category, count }));

  const stats: AggregatedStats = {
    totalRequests,
    blockedRequests,
    threatCount,
    anomalyCount:    anomalies,
    uniqueUsers,
    uniqueIPs,
    blockRate:       totalRequests > 0 ? +(blockedRequests / totalRequests).toFixed(4) : 0,
    topIPs:          ipCounts.map(x => ({ ip: x.label, count: x.count })),
    topCategories:   catCounts.map(x => ({ category: x.label, count: x.count })),
    ipRiskSummary,
    topBlockedDests,
  };

  return { stats, timeRangeStart, timeRangeEnd, anomalyCount: anomalies };
}

// ─── Fallback SOC Recommendations (log-specific when LLM fails) ───────────────

function buildLogSpecificFallbackRecommendations(
  stats: AggregatedStats,
  anomalySamples: { type: string; severity: string; description: string; affectedIp: string | null }[],
  highRiskSample: { timestamp: Date; cip: string | null; url: string | null; action: string | null; threatname: string | null; riskscore: number | null }[],
): string[] {
  const out: string[] = [];

  for (const ip of stats.topIPs.slice(0, 3)) {
    out.push(`Investigate IP ${ip.ip} (${ip.count} requests) for scanning or policy violations.`);
  }
  for (const cat of stats.topCategories.slice(0, 2)) {
    if (cat.category && cat.category !== 'None') {
      out.push(`Review traffic to category "${cat.category}" (${cat.count} requests) for policy alignment.`);
    }
  }
  for (const a of anomalySamples.slice(0, 3)) {
    const ipPart = a.affectedIp ? ` from IP ${a.affectedIp}` : '';
    out.push(`Address ${a.type}${ipPart}: ${a.description}`);
  }
  for (const e of highRiskSample.slice(0, 3)) {
    if (e.cip && e.threatname) {
      out.push(`Isolate/quarantine IP ${e.cip} — threat "${e.threatname}" detected.`);
    } else if (e.cip && e.riskscore && e.riskscore > 70) {
      out.push(`Triage high-risk session from IP ${e.cip} (risk ${e.riskscore}).`);
    }
  }
  if (stats.blockedRequests > 0) {
    out.push(`Review ${stats.blockedRequests} blocked requests for bypass attempts and blocked destinations.`);
  }
  return [...new Set(out)].slice(0, 10);
}

// ─── LLM Summary ──────────────────────────────────────────────────────────────

async function generateSummary(
  stats:    AggregatedStats,
  timeRangeStart: Date | null,
  timeRangeEnd:   Date | null,
  anomalySamples: { type: string; severity: string; description: string; affectedIp: string | null }[],
  highRiskSample: { timestamp: Date; cip: string | null; url: string | null; action: string | null; threatname: string | null; riskscore: number | null }[],
  userId: string,
): Promise<{
  executiveSummary:   string;
  timeline:           TimelineEvent[];
  topThreats:         ThreatEntry[];
  socRecommendations: string[];
}> {
  const blockPct = (stats.blockRate * 100).toFixed(1);
  const timeRange = timeRangeStart && timeRangeEnd
    ? `${timeRangeStart.toISOString()} to ${timeRangeEnd.toISOString()}`
    : 'unknown';

  const effectiveProvider = await getEffectiveProvider(userId);
  const isLocalModel = effectiveProvider === 'llama';

  // Llama runs locally at ~10-15 tok/s. Reduce input size and output budget to stay fast.
  // Claude, OpenAI, DeepSeek are untouched — full prompt and 2048 output tokens.
  const prompt = isLocalModel
    ? `You are a SOC analyst. Analyze the ZScaler proxy log data below and respond ONLY with a valid JSON object. No markdown, no explanation outside the JSON.

Stats: ${stats.totalRequests} requests, ${stats.blockedRequests} blocked (${blockPct}%), ${stats.threatCount} threats, ${stats.anomalyCount} anomalies, ${stats.uniqueIPs} unique IPs.
Top IPs by volume: ${JSON.stringify(stats.topIPs.slice(0, 3))}
Top URL categories: ${JSON.stringify(stats.topCategories.slice(0, 3))}
Detected anomalies: ${JSON.stringify(anomalySamples.slice(0, 3))}

Respond with EXACTLY this JSON structure (no extra keys, no markdown):
{
  "executiveSummary": "2-3 sentences describing overall risk and key findings",
  "timeline": [],
  "topThreats": [
    { "name": "<threat name>", "count": 1, "severity": "HIGH", "description": "<what it means>" }
  ],
  "socRecommendations": [
    "<concrete action referencing a specific IP or threat from the data>"
  ]
}`
    : `You are a senior SOC analyst. Generate a concise, actionable security analysis report based on the following ZScaler web proxy log statistics.

=== LOG STATISTICS ===
Time Range: ${timeRange}
Total Requests:   ${stats.totalRequests}
Blocked Requests: ${stats.blockedRequests} (${blockPct}%)
Threat Detections: ${stats.threatCount}
Anomalies Detected: ${stats.anomalyCount}
Unique Users: ${stats.uniqueUsers}
Unique IPs:   ${stats.uniqueIPs}

=== TOP IPs BY VOLUME ===
${JSON.stringify(stats.topIPs.slice(0, 8), null, 2)}

=== TOP URL CATEGORIES ===
${JSON.stringify(stats.topCategories.slice(0, 8), null, 2)}

=== DETECTED ANOMALIES (sample) ===
${JSON.stringify(anomalySamples.slice(0, 10), null, 2)}

=== HIGH-RISK LOG ENTRIES (sample) ===
${JSON.stringify(highRiskSample.slice(0, 10), null, 2)}

CRITICAL REQUIREMENTS — YOU MUST FOLLOW THESE EXACTLY:
1. timeline MUST have 5-8 entries. Use real ISO timestamps from the HIGH-RISK LOG ENTRIES above. NEVER leave timeline empty or with fewer than 5 entries.
2. topThreats: 3-5 distinct threat types actually seen in the data.
3. socRecommendations: up to 10 items, each referencing a specific IP, URL, category, or threat name from the data above. No generic advice.
4. Respond ONLY with valid JSON — no markdown fences, no text before or after the JSON object.

{
  "executiveSummary": "2-3 paragraph executive summary covering overall security posture, key findings, and risk level",
  "timeline": [
    { "time": "<ISO timestamp from the log data above>", "event": "<specific security event that happened at this time>" },
    { "time": "<ISO timestamp>", "event": "<event>" },
    { "time": "<ISO timestamp>", "event": "<event>" },
    { "time": "<ISO timestamp>", "event": "<event>" },
    { "time": "<ISO timestamp>", "event": "<event>" }
  ],
  "topThreats": [
    { "name": "threat name", "count": 1, "severity": "CRITICAL", "description": "brief SOC-focused description" }
  ],
  "socRecommendations": [
    "Concrete to-do referencing specific IP, URL, category, or threat name from the data"
  ]
}`;

  const maxTokens = isLocalModel ? 600 : 2048;

  try {
    const text = await llmText({ prompt, maxTokens, userId });
    // Extract JSON: handle ```json ... ``` or raw {...}
    let raw = text.trim();
    const codeBlock = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlock) raw = codeBlock[1].trim();
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON block in AI response');

    const parsed = JSON.parse(jsonMatch[0]);

    let timeline: TimelineEvent[] = Array.isArray(parsed.timeline) ? parsed.timeline : [];

    // If the AI returned fewer than 3 timeline events, supplement with data-driven events
    // built from the actual high-risk log entries (which have real timestamps).
    if (timeline.length < 3 && highRiskSample.length > 0) {
      const dataEvents: TimelineEvent[] = highRiskSample
        .filter(e => e.timestamp)
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
        .map(e => ({
          time: new Date(e.timestamp).toISOString(),
          event: e.threatname
            ? `Threat "${e.threatname}" detected from IP ${e.cip ?? 'unknown'}`
            : `High-risk ${e.action?.toLowerCase() ?? 'request'} from IP ${e.cip ?? 'unknown'} (risk score: ${e.riskscore ?? 'N/A'})`,
        }));
      // Deduplicate by exact time+event, keep up to 8
      const seen = new Set<string>();
      const merged = [...timeline, ...dataEvents].filter(ev => {
        const key = `${ev.time}|${ev.event}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }).slice(0, 8);
      timeline = merged;
    }

    return {
      executiveSummary:   typeof parsed.executiveSummary === 'string' ? parsed.executiveSummary : '',
      timeline,
      topThreats:         Array.isArray(parsed.topThreats)         ? parsed.topThreats         : [],
      socRecommendations: Array.isArray(parsed.socRecommendations) ? parsed.socRecommendations : [],
    };
  } catch (err) {
    console.warn('[aiAnalysis] LLM summary failed, using fallback:', err);

    const summary = stats.totalRequests === 0
      ? 'No log entries were found in this upload.'
      : `Analysis of ${stats.totalRequests.toLocaleString()} web proxy requests detected ` +
        `${stats.blockedRequests} blocked requests (${blockPct}%), ` +
        `${stats.threatCount} threat signatures, and ${stats.anomalyCount} anomalies. ` +
        `${stats.uniqueIPs} unique IPs and ${stats.uniqueUsers} users were observed.`;

    // Build timeline from actual log data as fallback
    const dataTimeline: TimelineEvent[] = highRiskSample
      .filter(e => e.timestamp)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      .slice(0, 8)
      .map(e => ({
        time: new Date(e.timestamp).toISOString(),
        event: e.threatname
          ? `Threat "${e.threatname}" detected from IP ${e.cip ?? 'unknown'}`
          : `High-risk ${e.action?.toLowerCase() ?? 'request'} from IP ${e.cip ?? 'unknown'} (risk score: ${e.riskscore ?? 'N/A'})`,
      }));

    const fallbackSoc = buildLogSpecificFallbackRecommendations(stats, anomalySamples, highRiskSample);
    return {
      executiveSummary:   summary,
      timeline:           dataTimeline,
      topThreats:         [],
      socRecommendations: fallbackSoc,
    };
  }
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export async function runAiAnalysis(uploadId: string, userId: string): Promise<void> {
  const provider = await getEffectiveProvider(userId);
  const { stats, timeRangeStart, timeRangeEnd, anomalyCount } = await buildStats(uploadId);

  // Fetch anomaly and high-risk samples for the prompt
  const [anomalySamples, highRiskEntries] = await Promise.all([
    prisma.anomaly.findMany({
      where:   { uploadId },
      select:  { type: true, severity: true, description: true, affectedIp: true },
      orderBy: { severity: 'desc' },
      take:    10,
    }),
    prisma.logEntry.findMany({
      where:   { uploadId, OR: [{ isAnomalous: true }, { riskscore: { gt: 60 } }] },
      select:  { timestamp: true, cip: true, url: true, action: true, threatname: true, riskscore: true },
      orderBy: { riskscore: 'desc' },
      take:    15,
    }),
  ]);

  const { executiveSummary, timeline, topThreats, socRecommendations } =
    await generateSummary(stats, timeRangeStart, timeRangeEnd, anomalySamples, highRiskEntries, userId);

  const toJson = (v: unknown): Prisma.InputJsonValue => v as Prisma.InputJsonValue;

  const resultData = {
    provider,
    executiveSummary,
    timeline:           toJson(timeline),
    stats:              toJson(stats),
    topThreats:         toJson(topThreats),
    socRecommendations: toJson(socRecommendations),
    totalRequests:      stats.totalRequests,
    blockedRequests:    stats.blockedRequests,
    threatCount:        stats.threatCount,
    anomalyCount,
    uniqueUsers:        stats.uniqueUsers,
    uniqueIPs:          stats.uniqueIPs,
    timeRangeStart,
    timeRangeEnd,
  };

  // Always update the current result (one per upload — latest run wins for display).
  await prisma.analysisResult.upsert({
    where:  { uploadId },
    create: { uploadId, ...resultData },
    update: resultData,
  });

  // Always append to history so every past run is accessible.
  await prisma.analysisHistory.create({
    data: { uploadId, ...resultData },
  });

  console.log(`[aiAnalysis] Analysis result saved for upload ${uploadId}`);
}
