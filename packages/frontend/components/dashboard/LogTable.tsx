'use client';

import { useState, useCallback, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { LogEntry, Pagination } from '@/types';

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000';

interface LogsResponse {
  success: boolean;
  data: {
    entries:    LogEntry[];
    pagination: Pagination;
  };
}

export function LogTable({ uploadId }: { uploadId: string }) {
  const { data: session } = useSession();

  const [logs,       setLogs]       = useState<LogEntry[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [page,       setPage]       = useState(1);
  const [anomalous,  setAnomalous]  = useState(false);
  const [loading,    setLoading]    = useState(true);

  const fetchLogs = useCallback(async () => {
    if (!session?.backendToken) return;

    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (anomalous) params.set('anomalous', 'true');

      const res = await fetch(`${BACKEND}/api/analysis/${uploadId}/entries?${params}`, {
        headers: { Authorization: `Bearer ${session.backendToken}` },
      });
      const body: LogsResponse = await res.json();
      if (body.success) {
        setLogs(body.data.entries);
        setPagination(body.data.pagination);
      }
    } finally {
      setLoading(false);
    }
  }, [uploadId, session, page, anomalous]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  // Reset to page 1 when filter changes
  const handleAnomalousToggle = () => {
    setPage(1);
    setAnomalous((v) => !v);
  };

  return (
    <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
      {/* Header */}
      <div className="flex flex-col gap-3 border-b border-gray-200 p-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-sm font-semibold text-gray-800">
          Log Entries
          {pagination && (
            <span className="ml-2 text-xs font-normal text-gray-500">
              ({pagination.total.toLocaleString()} total)
            </span>
          )}
        </h2>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={anomalous}
            onChange={handleAnomalousToggle}
            className="h-4 w-4 rounded border-gray-300 text-blue-600"
          />
          Show anomalous only
        </label>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-700">
              <th className="whitespace-nowrap px-4 py-2.5 text-left font-medium">Time</th>
              <th className="whitespace-nowrap px-4 py-2.5 text-left font-medium">User</th>
              <th className="whitespace-nowrap px-4 py-2.5 text-left font-medium">Src IP</th>
              <th className="whitespace-nowrap px-4 py-2.5 text-left font-medium">Action</th>
              <th className="whitespace-nowrap px-4 py-2.5 text-left font-medium">Category</th>
              <th className="whitespace-nowrap px-4 py-2.5 text-left font-medium">Threat</th>
              <th className="whitespace-nowrap px-4 py-2.5 text-left font-medium">Risk</th>
              <th className="whitespace-nowrap px-4 py-2.5 text-left font-medium">URL</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-sm text-gray-600">
                  Loading…
                </td>
              </tr>
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-sm text-gray-600">
                  No log entries found.
                </td>
              </tr>
            ) : (
              logs.map((log) => (
                <tr
                  key={log.id}
                  className={cn(
                    'hover:bg-gray-50',
                    log.isAnomalous && 'bg-red-50/50 hover:bg-red-50',
                  )}
                >
                  <td className="whitespace-nowrap px-4 py-2 text-xs text-gray-800">
                    {log.timestamp
                      ? new Date(log.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                      : '—'}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-xs text-gray-900">{log.login ?? '—'}</td>
                  <td className="whitespace-nowrap px-4 py-2 font-mono text-xs text-gray-900">{log.cip ?? '—'}</td>
                  <td className="whitespace-nowrap px-4 py-2 text-xs">
                    <span className={cn(
                      'rounded px-1.5 py-0.5 text-xs font-medium',
                      log.action === 'Blocked' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700',
                    )}>
                      {log.action ?? '—'}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-xs text-gray-800">{log.urlsupercat ?? '—'}</td>
                  <td className="px-4 py-2 text-xs">
                    {log.threatname ? (
                      <span className="inline-flex items-center gap-1 text-red-600 whitespace-nowrap">
                        <AlertTriangle className="h-3 w-3 shrink-0" />
                        {log.threatname}
                      </span>
                    ) : log.anomalyTypes?.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {log.anomalyTypes.map((t) => (
                          <span key={t} className="rounded bg-orange-100 px-1.5 py-0.5 text-xs font-medium text-orange-700 whitespace-nowrap">
                            {t.replace(/_/g, ' ')}
                          </span>
                        ))}
                      </div>
                    ) : '—'}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-xs">
                    {log.riskscore !== null && log.riskscore !== undefined ? (
                      <span className={cn(
                        'font-medium',
                        log.riskscore >= 80 ? 'text-red-700' : log.riskscore >= 50 ? 'text-orange-700' : 'text-gray-800',
                      )}>
                        {log.riskscore}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="max-w-[200px] truncate px-4 py-2 text-xs text-gray-800" title={log.url ?? ''}>
                    {log.url ?? '—'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3">
          <p className="text-xs text-gray-500">
            Page {pagination.page} of {pagination.totalPages}
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="rounded p-1 text-gray-500 hover:bg-gray-100 disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
              disabled={page >= pagination.totalPages}
              className="rounded p-1 text-gray-500 hover:bg-gray-100 disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
