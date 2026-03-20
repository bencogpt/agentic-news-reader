'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface StatsData {
  total: number;
  inProgress: number;
  completed: number;
  failed: number;
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

interface RecentTask {
  id: string;
  title: string;
  status: string;
  sources: number;
  maxSources: number;
  createdAt: string | null;
  durationMs: number | null;
}

interface DashboardData {
  stats: StatsData;
  queryVolume: VolumeDay[];
  topCategories: CategoryItem[];
  recentTasks: RecentTask[];
}

function formatDuration(ms: number | null): string {
  if (!ms || ms <= 0) return '—';
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return `${h}h ${m}m`;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

const STATUS_STYLES: Record<string, string> = {
  COMPLETED: 'bg-green-100 text-green-700',
  ACTIVE: 'bg-orange-100 text-orange-700',
  RESEARCHING: 'bg-orange-100 text-orange-700',
  WAITING_ANALYST: 'bg-yellow-100 text-yellow-700',
  FAILED: 'bg-red-100 text-red-700',
  DRAFT: 'bg-gray-100 text-gray-600',
  CANCELLED: 'bg-gray-100 text-gray-500',
};

const STATUS_LABELS: Record<string, string> = {
  COMPLETED: 'Done',
  ACTIVE: 'Running',
  RESEARCHING: 'Running',
  WAITING_ANALYST: 'Waiting',
  FAILED: 'Failed',
  DRAFT: 'Queued',
  CANCELLED: 'Cancelled',
};

function DualBarChart({ data }: { data: VolumeDay[] }) {
  const max = Math.max(...data.map((d) => d.submitted), 1);
  return (
    <div className="flex items-end gap-3 h-32 w-full">
      {data.map((d) => (
        <div key={d.date} className="flex-1 flex flex-col items-center gap-1">
          <div className="w-full flex items-end justify-center gap-0.5" style={{ height: '100px' }}>
            <div
              className="flex-1 rounded-t-sm bg-orange-400 transition-all"
              style={{ height: `${Math.max((d.submitted / max) * 100, d.submitted > 0 ? 4 : 0)}%` }}
              title={`${d.submitted} submitted`}
            />
            <div
              className="flex-1 rounded-t-sm bg-gray-300 dark:bg-gray-600 transition-all"
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

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/dashboard/stats');
        if (!res.ok) throw new Error(await res.text());
        setData(await res.json());
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load dashboard');
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

  const { stats, queryVolume, topCategories, recentTasks } = data;
  const filtered = recentTasks.filter((t) =>
    t.title.toLowerCase().includes(search.toLowerCase())
  );

  const statCards = [
    { label: 'Total Queries', value: stats.total.toLocaleString(), sub: null },
    { label: 'In Progress', value: stats.inProgress.toString(), sub: null },
    { label: 'Completed', value: stats.completed.toLocaleString(), sub: null },
    { label: 'Failed', value: stats.failed.toString(), sub: null },
  ];

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Active Queries</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Monitor and manage your research queries in real-time
          </p>
        </div>
        <Link
          href="/chat"
          className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Query
        </Link>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {statCards.map((card) => (
          <div
            key={card.label}
            className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5"
          >
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">{card.label}</p>
            <p className="text-3xl font-bold text-gray-900 dark:text-white">{card.value}</p>
          </div>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              Query Volume — Last 7 Days
            </h2>
            <Link href="/dashboard/queries" className="text-xs text-orange-500 hover:underline">
              Full analysis →
            </Link>
          </div>
          <p className="text-xs text-gray-400 mb-4">Daily query submissions and completions</p>
          <DualBarChart data={queryVolume} />
          <div className="flex items-center gap-4 mt-3">
            <span className="flex items-center gap-1.5 text-xs text-gray-500">
              <span className="w-2.5 h-2.5 rounded-sm bg-orange-400 inline-block" /> Submitted
            </span>
            <span className="flex items-center gap-1.5 text-xs text-gray-500">
              <span className="w-2.5 h-2.5 rounded-sm bg-gray-300 dark:bg-gray-600 inline-block" /> Completed
            </span>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Top Categories</h2>
          {topCategories.length === 0 ? (
            <p className="text-sm text-gray-400">No category data yet</p>
          ) : (
            <div className="space-y-3">
              {topCategories.map((cat) => (
                <div key={cat.name}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-600 dark:text-gray-400 truncate">{cat.name}</span>
                    <span className="text-gray-500 ml-2 flex-shrink-0">{cat.count}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-gray-100 dark:bg-gray-800">
                    <div
                      className="h-1.5 rounded-full bg-orange-400"
                      style={{ width: `${Math.min((cat.count / (topCategories[0]?.count || 1)) * 100, 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-800">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search queries..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-4 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-400 w-72"
            />
          </div>
          <Link
            href="/dashboard/similar"
            className="text-sm text-orange-500 hover:underline font-medium"
          >
            Find Similar →
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider w-2/5">Query</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider w-32">Progress</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Sources</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Started</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Duration</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-400 text-sm">
                    No queries found
                  </td>
                </tr>
              ) : (
                filtered.map((task) => (
                  <tr key={task.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                    <td className="px-4 py-3">
                      <span className="text-gray-900 dark:text-white font-medium line-clamp-1">
                        {task.title}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[task.status] ?? STATUS_STYLES.DRAFT}`}>
                        {STATUS_LABELS[task.status] ?? task.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-full bg-gray-100 dark:bg-gray-800">
                          <div
                            className="h-1.5 rounded-full bg-orange-400 transition-all"
                            style={{ width: `${task.maxSources > 0 ? Math.min((task.sources / task.maxSources) * 100, 100) : 0}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{task.sources}</td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{formatDate(task.createdAt)}</td>
                    <td className="px-4 py-3 text-gray-500">{formatDuration(task.durationMs)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-800 text-xs text-gray-500">
          Showing {filtered.length} of {recentTasks.length} recent queries
        </div>
      </div>
    </div>
  );
}
