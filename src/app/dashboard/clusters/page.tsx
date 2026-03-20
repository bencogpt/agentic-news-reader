'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface ClusterQuery {
  id: string;
  title: string;
  status: string;
  sources: number;
  createdAt: string | null;
}

interface Cluster {
  id: number;
  name: string;
  description: string;
  color: string;
  count: number;
  queries: ClusterQuery[];
}

interface ClustersData {
  clusters: Cluster[];
  totalTasks: number;
  k: number;
}

const STATUS_STYLES: Record<string, string> = {
  COMPLETED: 'bg-green-100 text-green-700',
  ACTIVE: 'bg-orange-100 text-orange-700',
  RESEARCHING: 'bg-orange-100 text-orange-700',
  WAITING_ANALYST: 'bg-yellow-100 text-yellow-700',
  FAILED: 'bg-red-100 text-red-700',
  DRAFT: 'bg-gray-100 text-gray-600',
};

const STATUS_LABELS: Record<string, string> = {
  COMPLETED: 'Done',
  ACTIVE: 'Running',
  RESEARCHING: 'Running',
  WAITING_ANALYST: 'Waiting',
  FAILED: 'Failed',
  DRAFT: 'Queued',
};

const COLOR_CLASSES: Record<string, { header: string; badge: string; dot: string }> = {
  orange:  { header: 'bg-orange-50 dark:bg-orange-900/20',  badge: 'bg-orange-100 text-orange-700',  dot: 'bg-orange-400' },
  blue:    { header: 'bg-blue-50 dark:bg-blue-900/20',      badge: 'bg-blue-100 text-blue-700',      dot: 'bg-blue-400' },
  green:   { header: 'bg-green-50 dark:bg-green-900/20',    badge: 'bg-green-100 text-green-700',    dot: 'bg-green-400' },
  purple:  { header: 'bg-purple-50 dark:bg-purple-900/20',  badge: 'bg-purple-100 text-purple-700',  dot: 'bg-purple-400' },
  rose:    { header: 'bg-rose-50 dark:bg-rose-900/20',      badge: 'bg-rose-100 text-rose-700',      dot: 'bg-rose-400' },
  teal:    { header: 'bg-teal-50 dark:bg-teal-900/20',      badge: 'bg-teal-100 text-teal-700',      dot: 'bg-teal-400' },
  amber:   { header: 'bg-amber-50 dark:bg-amber-900/20',    badge: 'bg-amber-100 text-amber-700',    dot: 'bg-amber-400' },
  indigo:  { header: 'bg-indigo-50 dark:bg-indigo-900/20',  badge: 'bg-indigo-100 text-indigo-700',  dot: 'bg-indigo-400' },
};

export default function ClustersPage() {
  const [data, setData] = useState<ClustersData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/queries/clusters');
        if (!res.ok) throw new Error(await res.text());
        setData(await res.json());
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load clusters');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-500">
        <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm">Clustering queries with AI…</p>
      </div>
    );
  }

  if (error) {
    return <div className="p-8 text-red-500">{error}</div>;
  }

  if (!data || data.clusters.length === 0) {
    return (
      <div className="p-8 max-w-4xl mx-auto">
        <div className="text-center py-20 text-gray-400">
          <svg className="w-12 h-12 mx-auto mb-4 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
          <p className="text-lg font-medium mb-1">No clusters yet</p>
          <p className="text-sm">Run some research queries first, then come back to see them clustered.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/dashboard" className="hover:text-orange-500 transition-colors">Dashboard</Link>
        <span>/</span>
        <span className="text-gray-900 dark:text-white font-medium">Query Clusters</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Query Clusters</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {data.totalTasks} queries automatically grouped into {data.clusters.length} topic clusters using AI embeddings
          </p>
        </div>
        <button
          onClick={() => {
            setLoading(true);
            setError(null);
            setData(null);
            fetch('/api/queries/clusters')
              .then((r) => r.json())
              .then(setData)
              .catch((e) => setError(e.message))
              .finally(() => setLoading(false));
          }}
          className="flex items-center gap-2 px-4 py-2 border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-600 dark:text-gray-400 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Re-cluster
        </button>
      </div>

      {/* Cluster overview */}
      <div className="flex gap-2 flex-wrap">
        {data.clusters.map((cluster) => {
          const colors = COLOR_CLASSES[cluster.color] ?? COLOR_CLASSES.orange;
          return (
            <a
              key={cluster.id}
              href={`#cluster-${cluster.id}`}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${colors.badge}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${colors.dot}`} />
              {cluster.name}
              <span className="opacity-60">({cluster.count})</span>
            </a>
          );
        })}
      </div>

      {/* Cluster cards grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {data.clusters.map((cluster) => {
          const colors = COLOR_CLASSES[cluster.color] ?? COLOR_CLASSES.orange;
          return (
            <div
              id={`cluster-${cluster.id}`}
              key={cluster.id}
              className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden"
            >
              {/* Card header */}
              <div className={`px-5 py-4 ${colors.header}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${colors.dot}`} />
                    <h3 className="text-sm font-bold text-gray-900 dark:text-white">{cluster.name}</h3>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colors.badge}`}>
                    {cluster.count} {cluster.count === 1 ? 'query' : 'queries'}
                  </span>
                </div>
                {cluster.description && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5 leading-relaxed">
                    {cluster.description}
                  </p>
                )}
              </div>

              {/* Query list */}
              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {cluster.queries.map((q) => (
                  <div key={q.id} className="px-5 py-3 flex items-center justify-between gap-3 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-800 dark:text-gray-200 truncate">{q.title}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${STATUS_STYLES[q.status] ?? STATUS_STYLES.DRAFT}`}>
                          {STATUS_LABELS[q.status] ?? q.status}
                        </span>
                        <span className="text-xs text-gray-400">{q.sources} sources</span>
                      </div>
                    </div>
                    <Link
                      href={`/dashboard/similar?q=${encodeURIComponent(q.title)}`}
                      className="flex-shrink-0 text-xs text-gray-400 hover:text-orange-500 transition-colors"
                      title="Find similar"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    </Link>
                  </div>
                ))}

                {cluster.count > cluster.queries.length && (
                  <div className="px-5 py-2.5 text-xs text-gray-400 bg-gray-50 dark:bg-gray-800/50">
                    +{cluster.count - cluster.queries.length} more queries in this cluster
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
