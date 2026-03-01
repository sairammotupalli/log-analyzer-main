'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import type { AggregatedStats } from '@/types';

const PIE_COLORS = ['#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#ec4899', '#f43f5e', '#f97316', '#eab308'];

export function Charts({ stats }: { stats: AggregatedStats }) {
  const topIPs = (stats.topIPs ?? []).slice(0, 10);
  const categories = (stats.topCategories ?? []).slice(0, 8);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* Top Source IPs bar chart */}
      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-gray-800">Top Source IPs by Request Volume</h2>
        {topIPs.length === 0 ? (
          <p className="text-sm text-gray-500">No data available.</p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={topIPs} layout="vertical" margin={{ left: 8, right: 16 }}>
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="ip" tick={{ fontSize: 11 }} width={110} />
              <Tooltip
                contentStyle={{ fontSize: 12 }}
                formatter={(value) => [
                  typeof value === 'number' ? value.toLocaleString() : (value ?? '').toString(),
                  'Requests',
                ]}
              />
              <Bar dataKey="count" fill="#3b82f6" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </section>

      {/* URL categories pie chart */}
      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-gray-800">Top URL Categories</h2>
        {categories.length === 0 ? (
          <p className="text-sm text-gray-500">No data available.</p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={categories}
                dataKey="count"
                nameKey="category"
                cx="50%"
                cy="50%"
                outerRadius={80}
                // Labels can overlap for long category names; rely on legend + tooltip instead.
                label={false}
                labelLine={false}
              >
                {categories.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
  contentStyle={{ fontSize: 12 }}
  formatter={(value) => [
    typeof value === 'number' ? value.toLocaleString() : (value ?? '').toString(),
    'Requests',
  ]}
/>
              <Legend
                iconSize={10}
                wrapperStyle={{ fontSize: 11, lineHeight: '14px' }}
                formatter={(value) => {
                  const name = String(value ?? '');
                  const entry = categories.find((c) => c.category === name);
                  return entry ? `${name} (${entry.count.toLocaleString()})` : name;
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        )}
      </section>
    </div>
  );
}
