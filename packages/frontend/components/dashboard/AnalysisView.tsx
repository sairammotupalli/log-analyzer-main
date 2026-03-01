'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { StatusBadge }        from './StatusBadge';
import { StatsCards }          from './StatsCards';
import { AiSummary }           from './AiSummary';
import { AnomalyPanel }        from './AnomalyPanel';
import { Charts }              from './Charts';
import { SocRecommendations }  from './SocRecommendations';
import { LogTable }            from './LogTable';
import { IpRiskTable }         from './IpRiskTable';
import { BlockedDestinations } from './BlockedDestinations';
import { Timeline }            from './Timeline';
import { formatDate, formatBytes } from '@/lib/utils';
import type { LogUpload, Anomaly, AnalysisResult, UploadStatus, TimelineEvent } from '@/types';

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000';
const POLL_INTERVAL_MS = 3000;
const TERMINAL_STATUSES: UploadStatus[] = ['COMPLETE', 'FAILED'];

const PROVIDER_LABELS: Record<string, string> = {
  anthropic: 'Claude (Anthropic)',
  openai:    'GPT (OpenAI)',
  deepseek:  'DeepSeek',
  llama:     'Llama / Ollama',
  custom:    'Custom LLM',
};

const PROVIDER_COLORS: Record<string, string> = {
  anthropic: 'bg-purple-100 text-purple-700 border-purple-200',
  openai:    'bg-blue-100 text-blue-700 border-blue-200',
  deepseek:  'bg-orange-100 text-orange-700 border-orange-200',
  llama:     'bg-green-100 text-green-700 border-green-200',
  custom:    'bg-gray-100 text-gray-700 border-gray-200',
};

interface UploadDetailResponse {
  success: boolean;
  data: {
    upload:    LogUpload;
    analysis:  AnalysisResult | null;
    anomalies: Anomaly[];
  };
}

// Only strip events where BOTH time and event are obvious template placeholders.
const PLACEHOLDER_EXACT = new Set(['timestamp', 'time', 'event', 'specific event']);

function isPlaceholder(str: string): boolean {
  const s = str.trim().toLowerCase();
  return PLACEHOLDER_EXACT.has(s) || /^<[^>]+>$/.test(s);
}

function filterTimeline(events: unknown): TimelineEvent[] {
  if (!Array.isArray(events)) return [];
  return events.filter(
    (ev): ev is TimelineEvent =>
      ev !== null &&
      typeof ev === 'object' &&
      typeof (ev as TimelineEvent).time  === 'string' &&
      typeof (ev as TimelineEvent).event === 'string' &&
      (ev as TimelineEvent).time.trim()  !== '' &&
      (ev as TimelineEvent).event.trim() !== '' &&
      // Only drop events where BOTH fields are placeholders — partial real data is kept
      !(isPlaceholder((ev as TimelineEvent).time) && isPlaceholder((ev as TimelineEvent).event)),
  );
}

export function AnalysisView({ uploadId }: { uploadId: string }) {
  const { data: session } = useSession();

  const [upload,    setUpload]    = useState<LogUpload | null>(null);
  const [analysis,  setAnalysis]  = useState<AnalysisResult | null>(null);
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [error,     setError]     = useState<string | null>(null);

  const consolidatedTodos = (() => {
    const fromAnomalies = anomalies
      .flatMap((a) => {
        const actions = (a.details as { recommendedActions?: unknown }).recommendedActions;
        return Array.isArray(actions) ? actions : [];
      })
      .filter((x): x is string => typeof x === 'string')
      .map((s) => s.trim())
      .filter(Boolean);

    const deduped = Array.from(new Set(fromAnomalies));
    if (deduped.length > 0) return deduped;
    return analysis?.socRecommendations ?? [];
  })();

  const socRecommendationsTop10 = (() => {
    const top = consolidatedTodos.slice(0, 10);
    const finalLine = 'Check all the anomalies for each reference.';
    return top.includes(finalLine) ? top : [...top, finalLine];
  })();

  const fetchData = useCallback(async () => {
    if (!session?.backendToken) return;

    try {
      const res  = await fetch(`${BACKEND}/api/uploads/${uploadId}`, {
        headers: { Authorization: `Bearer ${session.backendToken}` },
      });
      const body: UploadDetailResponse = await res.json();
      if (!body.success) throw new Error('Failed to load upload');

      setUpload(body.data.upload);
      setAnalysis(body.data.analysis);
      setAnomalies(body.data.anomalies ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    }
  }, [uploadId, session]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Poll while status is non-terminal
  useEffect(() => {
    if (!upload) return;
    if (TERMINAL_STATUSES.includes(upload.status)) return;

    const id = setInterval(fetchData, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [upload, fetchData]);

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (!upload && !error) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-gray-500">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        <p className="text-sm">Loading analysis…</p>
      </div>
    );
  }

  // ── Error ────────────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-red-600">
        <AlertCircle className="h-8 w-8" />
        <p className="text-sm font-medium">{error}</p>
      </div>
    );
  }

  // ── Processing ───────────────────────────────────────────────────────────────
  if (upload && !TERMINAL_STATUSES.includes(upload.status)) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-gray-600">
        <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
        <div className="text-center">
          <p className="text-base font-medium">Processing your log file…</p>
          <p className="mt-1 text-sm text-gray-400">
            <StatusBadge status={upload.status} /> — this may take a minute
          </p>
        </div>
        <button
          onClick={fetchData}
          className="flex items-center gap-1.5 rounded-md border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </button>
      </div>
    );
  }

  // ── Failed ───────────────────────────────────────────────────────────────────
  if (upload?.status === 'FAILED') {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-red-600">
        <AlertCircle className="h-8 w-8" />
        <p className="text-sm font-medium">Analysis failed</p>
        {upload.errorMessage && (
          <p className="max-w-md text-center text-xs text-gray-500">{upload.errorMessage}</p>
        )}
      </div>
    );
  }

  // ── Complete ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* File meta header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">{upload!.originalName}</h1>
          <p className="text-xs text-gray-500">
            {formatBytes(upload!.fileSize)} · {upload!.totalEntries.toLocaleString()} entries · uploaded {formatDate(upload!.createdAt)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {analysis?.provider && (
            <span
              className={[
                'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium',
                PROVIDER_COLORS[analysis.provider] ?? 'bg-gray-100 text-gray-700 border-gray-200',
              ].join(' ')}
              title="AI model used for this analysis"
            >
              Analyzed by {PROVIDER_LABELS[analysis.provider] ?? analysis.provider}
            </span>
          )}
          <StatusBadge status={upload!.status} />
        </div>
      </div>

      {/* Stats */}
      {analysis && <StatsCards result={analysis} />}

      {/* AI Summary */}
      {analysis?.executiveSummary && <AiSummary summary={analysis.executiveSummary} />}

      {/* Charts */}
      {analysis?.stats && <Charts stats={analysis.stats} />}

      {/* IP Risk Summary */}
      {analysis?.stats?.ipRiskSummary?.length ? (
        <IpRiskTable rows={analysis.stats.ipRiskSummary} />
      ) : null}

      {/* Top Blocked Destinations */}
      {analysis?.stats?.topBlockedDests?.length ? (
        <BlockedDestinations destinations={analysis.stats.topBlockedDests} />
      ) : null}

      {/* Timeline */}
      {(() => {
        const events = filterTimeline(analysis?.timeline ?? []);
        return events.length ? <Timeline events={events} /> : null;
      })()}

      {/* Anomalies */}
      <AnomalyPanel anomalies={anomalies} />

      {/* SOC Recommendations */}
      {socRecommendationsTop10.length ? (
        <SocRecommendations recommendations={socRecommendationsTop10} />
      ) : null}

      {/* Log Table */}
      <LogTable uploadId={uploadId} />
    </div>
  );
}
