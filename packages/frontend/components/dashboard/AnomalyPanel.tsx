import { AlertTriangle, AlertCircle, Info, Zap, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Anomaly, Severity } from '@/types';

const severityConfig: Record<Severity, { icon: React.ReactNode; badge: string }> = {
  LOW:      { icon: <Info          className="h-4 w-4" />, badge: 'bg-gray-100  text-gray-700'   },
  MEDIUM:   { icon: <AlertCircle   className="h-4 w-4" />, badge: 'bg-yellow-100 text-yellow-700' },
  HIGH:     { icon: <AlertTriangle className="h-4 w-4" />, badge: 'bg-orange-100 text-orange-700' },
  CRITICAL: { icon: <Zap           className="h-4 w-4" />, badge: 'bg-red-100   text-red-700'    },
};

function AnomalyCard({ anomaly }: { anomaly: Anomaly }) {
  const cfg = severityConfig[anomaly.severity] ?? severityConfig.LOW;
  const confidence = Math.round(anomaly.confidenceScore * 100);

  const details = anomaly.details as Record<string, unknown>;

  const flagReason =
    typeof details.flagReason === 'string' && details.flagReason.trim()
      ? details.flagReason.trim()
      : anomaly.description;

  const recommendedActions: string[] = Array.isArray(details.recommendedActions)
    ? (details.recommendedActions as unknown[])
        .filter((x): x is string => typeof x === 'string')
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 5)
    : [];

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm space-y-3">
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium', cfg.badge)}>
            {cfg.icon}
            {anomaly.severity}
          </span>
          <span className="text-xs font-medium text-gray-700">
            {anomaly.type.replace(/_/g, ' ')}
          </span>
        </div>
        <span className="shrink-0 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
          {confidence}% confidence
        </span>
      </div>

      {/* Why flagged */}
      <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2">
        <p className="text-xs font-semibold text-amber-800 mb-0.5">Why flagged</p>
        <p className="text-xs text-amber-900 leading-relaxed">{flagReason}</p>
      </div>

      {/* Affected entity */}
      {(anomaly.affectedIp || anomaly.affectedUser) && (
        <p className="text-xs text-gray-500">
          {anomaly.affectedIp && <span>IP: <strong className="text-gray-700">{anomaly.affectedIp}</strong>{' '}</span>}
          {anomaly.affectedUser && <span>User: <strong className="text-gray-700">{anomaly.affectedUser}</strong></span>}
        </p>
      )}

      {/* To-dos */}
      <details className="rounded-md border border-gray-200 bg-gray-50 group">
        <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2 text-xs font-semibold text-gray-800">
          <span>Recommended actions</span>
          <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
        </summary>
        <ol className="px-3 pb-3 pt-1 space-y-1.5">
          {recommendedActions.length > 0 ? recommendedActions.map((action, idx) => (
            <li key={idx} className="flex gap-2 text-xs text-gray-700">
              <span className="shrink-0 font-semibold text-gray-500">{idx + 1}.</span>
              <span>{action}</span>
            </li>
          )) : (
            <li className="text-xs text-gray-500">No actions available.</li>
          )}
        </ol>
      </details>
    </div>
  );
}

export function AnomalyPanel({ anomalies }: { anomalies: Anomaly[] }) {
  if (!anomalies?.length) {
    return (
      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-gray-800">Anomalies Detected</h2>
        <p className="text-sm text-gray-500">No anomalies detected.</p>
      </section>
    );
  }

  const sorted = [...anomalies].sort((a, b) => {
    const order: Record<Severity, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    return (order[a.severity] ?? 3) - (order[b.severity] ?? 3);
  });

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-gray-800">
          Anomalies Detected{' '}
          <span className="ml-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
            {anomalies.length}
          </span>
        </h2>
        <span className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-0.5 text-xs text-gray-400">
          Rule-based -- same results for the same file across all AI providers
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {sorted.map((a) => <AnomalyCard key={a.id} anomaly={a} />)}
      </div>
    </section>
  );
}
