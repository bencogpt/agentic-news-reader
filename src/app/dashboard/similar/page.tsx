'use client';

import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

interface SimilarResult {
  id: string;
  title: string;
  query: string;
  status: string;
  sources: number;
  createdAt: string | null;
  similarity: number;
  sharedTopics: string[];
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
  COMPLETED: 'Completed',
  ACTIVE: 'Running',
  RESEARCHING: 'Running',
  WAITING_ANALYST: 'Waiting',
  FAILED: 'Failed',
  DRAFT: 'Queued',
};

function SimilarityBadge({ value }: { value: number }) {
  const color =
    value >= 70
      ? 'bg-green-100 text-green-700 border-green-200'
      : value >= 40
      ? 'bg-orange-100 text-orange-700 border-orange-200'
      : 'bg-gray-100 text-gray-600 border-gray-200';
  return (
    <div className={`w-14 h-14 rounded-full border-2 flex flex-col items-center justify-center flex-shrink-0 ${color}`}>
      <span className="text-base font-bold leading-none">{value}</span>
      <span className="text-xs leading-none mt-0.5">%</span>
    </div>
  );
}

function FindSimilarPage() {
  const searchParams = useSearchParams();
  const [inputQuery, setInputQuery] = useState(searchParams.get('q') ?? '');
  const [results, setResults] = useState<SimilarResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-search if ?q= param provided
  useEffect(() => {
    const q = searchParams.get('q');
    if (q) {
      setInputQuery(q);
      void (async () => {
        setLoading(true);
        try {
          const res = await fetch('/api/queries/similar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: q }),
          });
          const data = await res.json() as { results: SimilarResult[] };
          setResults(data.results);
        } catch { /* ignore */ }
        finally { setLoading(false); }
      })();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSearch() {
    if (!inputQuery.trim()) return;
    setLoading(true);
    setError(null);
    setResults(null);
    try {
      const res = await fetch('/api/queries/similar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: inputQuery.trim() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `Request failed: ${res.status}`);
      }
      const data = await res.json() as { results: SimilarResult[] };
      setResults(data.results);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/dashboard" className="hover:text-orange-500 transition-colors">Dashboard</Link>
        <span>/</span>
        <span className="text-gray-900 dark:text-white font-medium">Find Similar Queries</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Find Similar Queries</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Discover related research queries and avoid duplication
          </p>
        </div>
        <Link
          href="/dashboard"
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          ← Back to Dashboard
        </Link>
      </div>

      {/* Search Card */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
          Search for a query to find similar ones
        </p>
        <div className="flex gap-3">
          <div className="relative flex-1">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="e.g. Impact of quantum computing on cryptography"
              value={inputQuery}
              onChange={(e) => setInputQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="w-full pl-10 pr-4 py-2.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-400"
            />
          </div>
          <button
            onClick={handleSearch}
            disabled={loading || !inputQuery.trim()}
            className="flex items-center gap-2 px-5 py-2.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            )}
            Find Similar
          </button>
        </div>

        {/* Selected query preview */}
        {inputQuery.trim() && (
          <div className="mt-3 flex items-center gap-2 text-xs text-gray-500 bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
            <svg className="w-3.5 h-3.5 text-orange-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <span className="truncate">{inputQuery}</span>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Results */}
      {results !== null && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                {results.length} Similar {results.length === 1 ? 'Query' : 'Queries'} Found
              </span>
            </div>
            <span className="text-xs text-gray-400">Sorted by similarity</span>
          </div>

          {results.length === 0 ? (
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-10 text-center text-gray-400">
              <svg className="w-10 h-10 mx-auto mb-3 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm">No similar queries found in history</p>
            </div>
          ) : (
            <div className="space-y-4">
              {results.map((result) => (
                <div
                  key={result.id}
                  className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5"
                >
                  <div className="flex items-start gap-4">
                    {/* Circular similarity badge */}
                    <SimilarityBadge value={result.similarity} />

                    {/* Content */}
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-sm font-semibold text-gray-900 dark:text-white leading-snug">
                          {result.title}
                        </p>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[result.status] ?? STATUS_STYLES.DRAFT}`}>
                            {STATUS_LABELS[result.status] ?? result.status}
                          </span>
                          <Link
                            href="/chat"
                            className="text-xs px-3 py-1 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                          >
                            View
                          </Link>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 text-xs text-gray-500">
                        <span>{result.sources} sources</span>
                        {result.createdAt && (
                          <span>
                            {new Date(result.createdAt).toLocaleDateString('en-US', {
                              month: 'short', day: 'numeric', year: 'numeric',
                            })}
                          </span>
                        )}
                      </div>

                      {/* Source overlap bar */}
                      <div>
                        <div className="flex justify-between text-xs text-gray-400 mb-1">
                          <span>Source overlap</span>
                          <span>{Math.round(result.similarity * 0.8)}%</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-gray-100 dark:bg-gray-800">
                          <div
                            className="h-1.5 rounded-full bg-orange-400 transition-all"
                            style={{ width: `${Math.round(result.similarity * 0.8)}%` }}
                          />
                        </div>
                      </div>

                      {/* Shared topics */}
                      {result.sharedTopics.length > 0 && (
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs text-gray-400">Shared topics:</span>
                          {result.sharedTopics.map((topic) => (
                            <span
                              key={topic}
                              className="text-xs px-2 py-0.5 rounded-full bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 font-medium"
                            >
                              {topic}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function FindSimilarPageWrapper() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <FindSimilarPage />
    </Suspense>
  );
}
