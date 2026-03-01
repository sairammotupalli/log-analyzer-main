import { CheckCircle2, ListChecks } from 'lucide-react';

export function SocRecommendations({ recommendations }: { recommendations: string[] }) {
  if (!recommendations?.length) return null;

  return (
    <section className="rounded-xl border border-green-100 bg-green-50 p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <ListChecks className="h-5 w-5 text-green-700" />
        <h2 className="text-sm font-semibold text-green-800">SOC Recommendations (Consolidated To-dos)</h2>
      </div>
      <ul className="space-y-2">
        {recommendations.map((rec, i) => (
          <li key={i} className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
            <span className="text-sm text-gray-900">{rec}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
