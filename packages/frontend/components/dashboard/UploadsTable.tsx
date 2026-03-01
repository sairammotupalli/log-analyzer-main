'use client';

import Link from 'next/link';
import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2, ChevronRight, ChevronDown, Loader2 } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { makeClientApi } from '@/lib/api';
import { StatusBadge } from '@/components/dashboard/StatusBadge';
import { formatBytes, formatDate } from '@/lib/utils';
import type { LogUpload } from '@/types';

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000';

const PROVIDER_LABELS: Record<string, string> = {
  anthropic: 'Claude',
  openai: 'GPT',
  deepseek: 'DeepSeek',
  llama: 'Llama',
  custom: 'Custom',
};

const PROVIDER_COLORS: Record<string, string> = {
  anthropic: 'bg-purple-100 text-purple-700',
  openai: 'bg-blue-100 text-blue-700',
  deepseek: 'bg-orange-100 text-orange-700',
  llama: 'bg-green-100 text-green-700',
};

interface HistoryEntry {
  id: string;
  provider: string;
  executiveSummary: string;
  totalRequests: number;
  blockedRequests: number;
  threatCount: number;
  anomalyCount: number;
  createdAt: string;
}

export function UploadsTable({ uploads: initial }: { uploads: LogUpload[] }) {
  const [uploads, setUploads] = useState<LogUpload[]>(initial);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [historyMap, setHistoryMap] = useState<Record<string, HistoryEntry[]>>({});
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const router = useRouter();
  const { data: session } = useSession();
  const token = session?.backendToken || '';
  const api = useMemo(() => makeClientApi(token), [token]);

  async function onDelete(id: string) {
    if (!token) return;
    const ok = window.confirm('Delete this upload and all associated analysis?');
    if (!ok) return;

    setDeletingId(id);
    try {
      await api.delete(`/api/uploads/${id}`);
      setUploads((prev) => prev.filter((u) => u.id !== id));
      if (expandedId === id) setExpandedId(null);
      router.refresh();
    } finally {
      setDeletingId(null);
    }
  }

  async function toggleHistory(id: string) {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    if (historyMap[id] !== undefined) return;

    setLoadingId(id);
    try {
      const res = await fetch(`${BACKEND}/api/uploads/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await res.json();
      setHistoryMap((prev) => ({ ...prev, [id]: body.data?.history ?? [] }));
    } catch {
      setHistoryMap((prev) => ({ ...prev, [id]: [] }));
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <table className="min-w-full divide-y divide-gray-100 text-sm">
        <thead className="bg-gray-50 text-xs text-gray-500">
          <tr>
            <th className="px-4 py-2.5 text-left font-medium">File</th>
            <th className="px-4 py-2.5 text-left font-medium">Size</th>
            <th className="px-4 py-2.5 text-left font-medium">Entries</th>
            <th className="px-4 py-2.5 text-left font-medium">Status</th>
            <th className="px-4 py-2.5 text-left font-medium">Uploaded</th>
            <th className="px-4 py-2.5 text-left font-medium">Runs</th>
            <th className="px-4 py-2.5 text-right font-medium">Delete</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {uploads.map((u) => (
            <React.Fragment key={u.id}>
              <tr className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <Link
                    href={`/dashboard/${u.id}`}
                    className="font-medium text-blue-600 hover:underline"
                  >
                    {u.originalName}
                  </Link>
                </td>
                <td className="px-4 py-3 text-gray-500">{formatBytes(u.fileSize)}</td>
                <td className="px-4 py-3 text-gray-500">
                  {u.totalEntries > 0 ? u.totalEntries.toLocaleString() : '--'}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={u.status} />
                </td>
                <td className="px-4 py-3 text-gray-500">{formatDate(u.createdAt)}</td>
                <td className="px-4 py-3">
                  {u.status === 'COMPLETE' && (
                    <button
                      type="button"
                      onClick={() => toggleHistory(u.id)}
                      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-gray-500 hover:bg-gray-100 hover:text-gray-800"
                    >
                      {expandedId === u.id ? (
                        <ChevronDown className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5" />
                      )}
                      History
                    </button>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => onDelete(u.id)}
                    disabled={!token || deletingId === u.id}
                    className="inline-flex items-center justify-center rounded-md p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-900 disabled:opacity-50"
                    aria-label="Delete upload"
                    title="Delete upload"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>

              {expandedId === u.id && (
                <tr className="bg-gray-50">
                  <td colSpan={7} className="px-8 py-3">
                    {loadingId === u.id ? (
                      <div className="flex items-center gap-2 text-xs text-gray-400">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Loading history...
                      </div>
                    ) : !historyMap[u.id] || historyMap[u.id].length === 0 ? (
                      <p className="text-xs text-gray-400">No analysis runs yet.</p>
                    ) : (
                      <div className="space-y-1.5">
                        {historyMap[u.id].map((h, i) => (
                          <div
                            key={h.id}
                            className="flex flex-wrap items-center gap-2 rounded-md border border-gray-100 bg-white px-3 py-2 text-xs"
                          >
                            <span
                              className={[
                                'inline-flex rounded-full px-2 py-0.5 font-medium',
                                PROVIDER_COLORS[h.provider] ?? 'bg-gray-100 text-gray-700',
                              ].join(' ')}
                            >
                              {PROVIDER_LABELS[h.provider] ?? h.provider}
                            </span>
                            {i === 0 && (
                              <span className="rounded-full bg-blue-50 px-2 py-0.5 font-medium text-blue-600">
                                Latest
                              </span>
                            )}
                            <span className="tabular-nums text-gray-400">
                              {new Date(h.createdAt).toLocaleString()}
                            </span>
                            <span className="text-gray-500">
                              {h.totalRequests.toLocaleString()} reqs
                            </span>
                            <span className="text-gray-500">{h.threatCount} threats</span>
                            <span className="text-gray-500">{h.anomalyCount} anomalies</span>
                            {h.executiveSummary && (
                              <span className="max-w-xs truncate text-gray-400">
                                {h.executiveSummary}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              )}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
