'use client';

import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/AuthProvider';
import { AuthGuard } from '@/components/AuthGuard';
import { CaseTimeline } from '@/components/CaseTimeline';
import { Case } from '@/lib/types';

interface CaseDetailProps {
  params: Promise<{ id: string }>;
}

function CaseDetailContent({ caseId }: { caseId: string }) {
  const { user } = useAuth();
  const [caseData, setCaseData] = useState<Case | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);
  const [intervalHours, setIntervalHours] = useState(1);

  const fetchCase = async () => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/cases/${caseId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setCaseData(data);
      setIntervalHours(data.refreshIntervalHours ?? 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load case');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCase();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, caseId]);

  const handleRefresh = async () => {
    if (!user || refreshing) return;
    setRefreshing(true);
    setRefreshMessage(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/cases/${caseId}/refresh`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(await res.text());
      setRefreshMessage('Refresh complete!');
      await fetchCase();
    } catch (err) {
      setRefreshMessage(err instanceof Error ? err.message : 'Refresh failed');
    } finally {
      setRefreshing(false);
    }
  };

  const handleIntervalChange = async (hours: number) => {
    if (!user) return;
    setIntervalHours(hours);
    try {
      const token = await user.getIdToken();
      await fetch(`/api/cases/${caseId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ refreshIntervalHours: hours }),
      });
    } catch (err) {
      console.error('Failed to update interval:', err);
    }
  };

  const handleArchive = async () => {
    if (!user || !caseData) return;
    const newStatus = caseData.status === 'active' ? 'archived' : 'active';
    try {
      const token = await user.getIdToken();
      await fetch(`/api/cases/${caseId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: newStatus }),
      });
      setCaseData((prev) => prev ? { ...prev, status: newStatus } : null);
    } catch (err) {
      console.error('Failed to update status:', err);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 rounded-lg text-red-600 dark:text-red-400">
          {error}
        </div>
        <Link href="/cases" className="mt-4 inline-block text-sm text-blue-600 hover:underline">
          ← Back to Cases
        </Link>
      </div>
    );
  }

  if (!caseData) return null;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="mb-6">
        <Link href="/cases" className="text-sm text-blue-600 dark:text-blue-400 hover:underline mb-3 inline-block">
          ← Back to Cases
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">{caseData.title}</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">{caseData.query}</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span
              className={`text-xs px-2 py-1 rounded-full font-medium ${
                caseData.status === 'active'
                  ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-500'
              }`}
            >
              {caseData.status}
            </span>
            <button
              onClick={handleArchive}
              className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
            >
              {caseData.status === 'active' ? 'Archive' : 'Reactivate'}
            </button>
          </div>
        </div>

        {/* Meta row */}
        <div className="flex flex-wrap gap-4 mt-3 text-xs text-gray-500 dark:text-gray-400">
          {caseData.lastRefreshedAt && (
            <span>Last refreshed: {new Date(caseData.lastRefreshedAt).toLocaleString()}</span>
          )}
          {caseData.nextRefreshAt && (
            <span>Next refresh: {new Date(caseData.nextRefreshAt).toLocaleString()}</span>
          )}
          <span>{caseData.sources?.length ?? 0} sources</span>
          <span>{caseData.timeline?.length ?? 0} timeline events</span>
        </div>
      </div>

      {/* Refresh controls */}
      <div className="flex items-center gap-3 mb-8 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700">
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {refreshing ? (
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          )}
          {refreshing ? 'Refreshing...' : 'Refresh Now'}
        </button>

        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600 dark:text-gray-400">Auto-refresh every</label>
          <select
            value={intervalHours}
            onChange={(e) => handleIntervalChange(Number(e.target.value))}
            className="text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          >
            <option value={1}>1 hour</option>
            <option value={6}>6 hours</option>
            <option value={12}>12 hours</option>
            <option value={24}>1 day</option>
            <option value={72}>3 days</option>
            <option value={168}>7 days</option>
          </select>
        </div>

        {refreshMessage && (
          <span className="text-sm text-green-600 dark:text-green-400">{refreshMessage}</span>
        )}
      </div>

      {/* Summary */}
      {caseData.summary && (
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Summary</h2>
          <div className="prose dark:prose-invert prose-sm max-w-none bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
            <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap text-sm leading-relaxed">
              {caseData.summary}
            </p>
          </div>
        </section>
      )}

      {/* Timeline */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Timeline</h2>
        <CaseTimeline
          entries={caseData.timeline ?? []}
          latestAddedAt={caseData.lastRefreshedAt ?? undefined}
        />
      </section>

      {/* Sources */}
      {caseData.sources && caseData.sources.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
            Sources ({caseData.sources.length})
          </h2>
          <div className="space-y-1">
            {caseData.sources.map((source, idx) => (
              <a
                key={idx}
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 hover:underline py-1"
              >
                <span className="text-gray-400 dark:text-gray-500 text-xs w-5 text-right">[{source.number}]</span>
                <span className="truncate">{source.title}</span>
                <span className="text-gray-400 text-xs flex-shrink-0">{source.source}</span>
              </a>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

export default function CaseDetailPage({ params }: CaseDetailProps) {
  const { id } = use(params);
  return (
    <AuthGuard>
      <CaseDetailContent caseId={id} />
    </AuthGuard>
  );
}
