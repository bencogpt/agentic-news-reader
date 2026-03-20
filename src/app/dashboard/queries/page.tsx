'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface StatsData {
  successRate: number;
  avgDurationMs: number;
  avgSources: number;
  topCategory: string | null;
}

interface VolumeDay {
  day: string;
  date: string;
  submitted: number;
  completed: number;
}

interface CategoryItem {
  name: string;
  count: number;
}

interface QueryAnalysisData {
  stats: StatsData;
  queryVolume: VolumeDay[];
  topCategories: CategoryItem[];
}

function formatDuration(ms: number): string {
  if (!ms || ms <= 0) return '—';
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return `${h}h ${m}m`;
}

function DualBarChart({ data }: { data: VolumeDay[] }) {
  const max = Math.max(...data.map((d) => d.submitted), 1);
  return (
    <div className="flex items-end gap-3 h-40 w-full">
      {data.map((d) => (
        <div key={d.date} className="flex-1 flex flex-col items-center gap-1">
          <div className="w-full flex items-end justify-center gap-1" style={{ height: '140px' }}>
            <div
              className="flex-1 rounded-t bg-orange-400 transition-all"
              style={{ height: `${Math.max((d.submitted / max) * 100, d.submitted > 0 ? 4 : 0)}%` }}
              title={`${d.submitted} submitted`}
            />
            <div
              className="flex-1 rounded-t bg-gray-300 dark:bg-gray-600 transition-all"
              style={{ height: `${Math.max((d.completed / max) * 100, d.completed > 0 ? 4 : 0)}%` }}
              title={`${d.completed} completed`}
            />
          </div>
          <span className="text-xs text-gray-500">{d.day}</span>
        </div>
      ))}
    </div>
  );
}

export default function QueryAnalysisPage() {
  const [data, setData] = useState<QueryAnalysisData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/dashboard/stats');
        if (!res.ok) throw new Error(await res.text());
        setData(await res.json());
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return <div className="p-8 text-red-500">{error ?? 'Unknown error'}</div>;
  }

  const { stats, queryVolume, topCategories } = data;
  const totalSubmitted = queryVolume.reduce((s, d) => s + d.submitted, 0);
  const totalCompleted = queryVolume.reduce((s, d) => s + d.completed, 0);

  const statCards = [
    { label: 'Avg. Duration', value: formatDuration(stats.avgDurationMs) },
    { label: 'Success Rate', value: `${stats.successRate}%` },
    { label: 'Avg. Sources', value: stats.avgSources.toString() },
    { label: 'Top Category', value: stats.topCategory ?? '—' },
  ];

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/dashboard" className="hover:text-orange-500 transition-colors">Dashboard</Link>
        <span>/</span>
        <span className="text-gray-900 dark:text-white font-medium">Query Analysis</span>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Query Analysis</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Performance metrics and trends for the last 7 days
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2">
            Last 7 Days
          </span>
          <button
            onClick={() => {
              const rows = [
                ['Day', 'Submitted', 'Completed'],
                ...queryVolume.map((d) => [d.day, d.submitted, d.completed]),
              ];
              const csv = rows.map((r) => r.join(',')).join('\n');
              const blob = new Blob([csv], { type: 'text/csv' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = 'query-analysis.csv';
              a.click();
            }}
            className="flex items-center gap-2 px-4 py-2 border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-600 dark:text-gray-400 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export
          </button>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {statCards.map((card) => (
          <div
            key={card.label}
            className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5"
          >
            <p className="text-xs text-gray-500 mb-2">{card.label}</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white truncate">{card.value}</p>
          </div>
        ))}
      </div>

      {/* Chart + Categories */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Dual bar chart */}
        <div className="lg:col-span-2 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
          <div className="flex items-start justify-between mb-1">
            <div>
              <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                Query Volume — Last 7 Days
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">
                Filter query to show query submissions
              </p>
            </div>
            <div className="text-right text-xs text-gray-500">
              <div>{totalSubmitted} submitted</div>
              <div>{totalCompleted} completed</div>
            </div>
          </div>
          <div className="mt-4">
            <DualBarChart data={queryVolume} />
          </div>
          <div className="flex items-center gap-4 mt-3">
            <span className="flex items-center gap-1.5 text-xs text-gray-500">
              <span className="w-2.5 h-2.5 rounded-sm bg-orange-400 inline-block" /> Submitted
            </span>
            <span className="flex items-center gap-1.5 text-xs text-gray-500">
              <span className="w-2.5 h-2.5 rounded-sm bg-gray-300 dark:bg-gray-600 inline-block" /> Completed
            </span>
          </div>
        </div>

        {/* Top Categories */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Top Categories</h2>
          {topCategories.length === 0 ? (
            <div className="text-sm text-gray-400 text-center py-8">
              <p>No category data yet.</p>
              <p className="text-xs mt-1">Categories come from research query topics.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {topCategories.map((cat, i) => {
                const total = topCategories.reduce((s, c) => s + c.count, 0);
                const pct = total > 0 ? Math.round((cat.count / total) * 100) : 0;
                return (
                  <div key={cat.name}>
                    <div className="flex justify-between text-xs mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className={`w-1.5 h-1.5 rounded-full ${i === 0 ? 'bg-orange-500' : 'bg-gray-400'}`} />
                        <span className="text-gray-700 dark:text-gray-300 font-medium truncate max-w-28">
                          {cat.name}
                        </span>
                      </div>
                      <span className="text-gray-500 ml-1">{pct}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-800">
                      <div
                        className={`h-2 rounded-full transition-all ${i === 0 ? 'bg-orange-400' : 'bg-gray-400'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link
          href="/dashboard/clusters"
          className="flex items-center gap-4 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 hover:border-orange-300 dark:hover:border-orange-700 transition-colors group"
        >
          <div className="w-10 h-10 rounded-lg bg-orange-50 dark:bg-orange-900/20 flex items-center justify-center">
            <svg className="w-5 h-5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-white group-hover:text-orange-500 transition-colors">
              View Query Clusters
            </p>
            <p className="text-xs text-gray-500 mt-0.5">AI-grouped topics using embeddings</p>
          </div>
          <svg className="w-4 h-4 text-gray-400 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </Link>

        <Link
          href="/dashboard/similar"
          className="flex items-center gap-4 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 hover:border-orange-300 dark:hover:border-orange-700 transition-colors group"
        >
          <div className="w-10 h-10 rounded-lg bg-orange-50 dark:bg-orange-900/20 flex items-center justify-center">
            <svg className="w-5 h-5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-white group-hover:text-orange-500 transition-colors">
              Find Similar Queries
            </p>
            <p className="text-xs text-gray-500 mt-0.5">Semantic search across query history</p>
          </div>
          <svg className="w-4 h-4 text-gray-400 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </Link>
      </div>
    </div>
  );
}
