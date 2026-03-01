import { Shield, AlertTriangle, Ban } from 'lucide-react';
import type { IpRiskRow } from '@/types';

const ANOMALY_LABEL: Record<string, string> = {
  HIGH_REQUEST_RATE:  'High Rate',
  REPEATED_BLOCK:     'Repeat Block',
  THREAT_DETECTED:    'Threat',
  HIGH_RISK_SCORE:    'High Risk',
  SUSPICIOUS_UA:      'Suspicious UA',
  OFF_HOURS_ACCESS:   'Off Hours',
  LARGE_TRANSFER:     'Large Transfer',
  MALICIOUS_CATEGORY: 'Malicious Cat',
};

function RiskBadge({ row }: { row: IpRiskRow }) {
  if (row.threats > 0)  return <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700"><AlertTriangle className="h-3 w-3" />Critical</span>;
  if (row.blocked > 0)  return <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700"><Ban className="h-3 w-3" />High</span>;
  if (row.anomalyTypes.length > 0) return <span className="inline-flex items-center gap-1 rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700"><Shield className="h-3 w-3" />Medium</span>;
  return <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">Low</span>;
}

export function IpRiskTable({ rows }: { rows: IpRiskRow[] }) {
  if (!rows?.length) return null;

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <Shield className="h-4 w-4 text-gray-500" />
        <h2 className="text-sm font-semibold text-gray-800">IP Risk Summary</h2>
        <span className="ml-auto text-xs text-gray-400">Top {rows.length} IPs by risk</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs font-medium text-gray-500">
              <th className="pb-2 pr-4">IP Address</th>
              <th className="pb-2 pr-4 text-right">Requests</th>
              <th className="pb-2 pr-4 text-right">Blocked</th>
              <th className="pb-2 pr-4 text-right">Threats</th>
              <th className="pb-2 pr-4">Anomaly Types</th>
              <th className="pb-2">Risk Level</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {rows.map((row) => (
              <tr key={row.ip} className="hover:bg-gray-50">
                <td className="py-2 pr-4 font-mono text-xs text-gray-800">{row.ip}</td>
                <td className="py-2 pr-4 text-right text-gray-600">{row.requests.toLocaleString()}</td>
                <td className="py-2 pr-4 text-right">
                  <span className={row.blocked > 0 ? 'font-medium text-orange-600' : 'text-gray-400'}>
                    {row.blocked.toLocaleString()}
                  </span>
                </td>
                <td className="py-2 pr-4 text-right">
                  <span className={row.threats > 0 ? 'font-medium text-red-600' : 'text-gray-400'}>
                    {row.threats.toLocaleString()}
                  </span>
                </td>
                <td className="py-2 pr-4">
                  <div className="flex flex-wrap gap-1">
                    {row.anomalyTypes.length > 0
                      ? row.anomalyTypes.map((t) => (
                          <span key={t} className="rounded bg-amber-50 px-1.5 py-0.5 text-xs text-amber-700">
                            {ANOMALY_LABEL[t] ?? t}
                          </span>
                        ))
                      : <span className="text-xs text-gray-400">—</span>}
                  </div>
                </td>
                <td className="py-2"><RiskBadge row={row} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
