import { Ban } from 'lucide-react';
import type { BlockedDestination } from '@/types';

export function BlockedDestinations({ destinations }: { destinations: BlockedDestination[] }) {
  if (!destinations?.length) return null;

  const max = destinations[0]?.count ?? 1;

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <Ban className="h-4 w-4 text-gray-500" />
        <h2 className="text-sm font-semibold text-gray-800">Top Blocked Destinations</h2>
        <span className="ml-auto text-xs text-gray-400">By block count</span>
      </div>

      <div className="space-y-2.5">
        {destinations.map((dest) => (
          <div key={dest.url} className="group">
            <div className="mb-1 flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <span className="block truncate font-mono text-xs text-gray-800" title={dest.url}>
                  {dest.url}
                </span>
                <span className="text-xs text-gray-400">{dest.category}</span>
              </div>
              <span className="shrink-0 text-xs font-medium text-red-600">
                {dest.count.toLocaleString()} blocked
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full rounded-full bg-red-400 transition-all"
                style={{ width: `${Math.max(4, (dest.count / max) * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
