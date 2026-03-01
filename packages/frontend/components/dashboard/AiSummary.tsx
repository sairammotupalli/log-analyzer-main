import { Sparkles } from 'lucide-react';

export function AiSummary({ summary }: { summary: string }) {
  return (
    <section className="rounded-xl border border-blue-100 bg-gradient-to-br from-blue-50 to-indigo-50 p-5 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-blue-600" />
        <h2 className="text-sm font-semibold text-blue-800">AI Executive Summary</h2>
      </div>
      <p className="text-sm leading-relaxed text-gray-700 whitespace-pre-wrap">{summary}</p>
    </section>
  );
}
