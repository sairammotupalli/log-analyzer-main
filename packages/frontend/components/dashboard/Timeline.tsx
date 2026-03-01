import { Clock } from 'lucide-react';
import type { TimelineEvent } from '@/types';

export function Timeline({ events }: { events: TimelineEvent[] }) {
  if (!events?.length) return null;

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <Clock className="h-4 w-4 text-gray-500" />
        <h2 className="text-sm font-semibold text-gray-800">Event Timeline</h2>
      </div>

      <ol className="relative ml-3 border-l border-gray-200">
        {events.map((ev, i) => (
          <li key={i} className="mb-5 ml-6 last:mb-0">
            <span className="absolute -left-2 flex h-4 w-4 items-center justify-center rounded-full border border-white bg-blue-200" />
            <time className="mb-1 block text-xs text-gray-400">{ev.time}</time>
            <p className="text-sm text-gray-700">{ev.event}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
