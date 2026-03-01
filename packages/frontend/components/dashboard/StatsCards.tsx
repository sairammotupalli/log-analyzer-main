import { Shield, AlertTriangle, Users, Globe, Ban, Activity } from 'lucide-react';
import type { AnalysisResult } from '@/types';

interface Card {
  label: string;
  value: string | number;
  icon:  React.ReactNode;
  color: string;
}

export function StatsCards({ result }: { result: AnalysisResult }) {
  const blockRate =
    result.totalRequests > 0
      ? ((result.blockedRequests / result.totalRequests) * 100).toFixed(1)
      : '0.0';

  const cards: Card[] = [
    {
      label: 'Total Requests',
      value: result.totalRequests.toLocaleString(),
      icon:  <Activity className="h-5 w-5" />,
      color: 'text-blue-600 bg-blue-50',
    },
    {
      label: 'Blocked Requests',
      value: result.blockedRequests.toLocaleString(),
      icon:  <Ban className="h-5 w-5" />,
      color: 'text-red-600 bg-red-50',
    },
    {
      label: 'Block Rate',
      value: `${blockRate}%`,
      icon:  <Shield className="h-5 w-5" />,
      color: 'text-orange-600 bg-orange-50',
    },
    {
      label: 'Anomalies Detected',
      value: result.anomalyCount,
      icon:  <AlertTriangle className="h-5 w-5" />,
      color: 'text-yellow-600 bg-yellow-50',
    },
    {
      label: 'Unique Users',
      value: result.uniqueUsers.toLocaleString(),
      icon:  <Users className="h-5 w-5" />,
      color: 'text-purple-600 bg-purple-50',
    },
    {
      label: 'Unique IPs',
      value: result.uniqueIPs.toLocaleString(),
      icon:  <Globe className="h-5 w-5" />,
      color: 'text-teal-600 bg-teal-50',
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
      {cards.map((card) => (
        <div key={card.label} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className={`mb-3 inline-flex rounded-lg p-2 ${card.color}`}>{card.icon}</div>
          <p className="text-2xl font-bold text-gray-900">{card.value}</p>
          <p className="mt-0.5 text-xs text-gray-500">{card.label}</p>
        </div>
      ))}
    </div>
  );
}
