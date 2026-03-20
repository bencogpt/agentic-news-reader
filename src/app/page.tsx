'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { SignInButton } from '@/components/SignInButton';
import { useAuth } from '@/components/AuthProvider';
import { type HotspotCategory, CATEGORY_COLORS } from '@/lib/constants/news-hotspots';
import type { QueryMarker } from '@/components/WorldMap';

const WorldMap = dynamic(() => import('@/components/WorldMap').then(m => m.WorldMap), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-slate-950">
      <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  ),
});

const CATEGORIES: { id: HotspotCategory; label: string }[] = [
  { id: 'conflict', label: 'Conflict' },
  { id: 'politics', label: 'Politics' },
  { id: 'economy', label: 'Economy' },
  { id: 'climate', label: 'Climate' },
  { id: 'technology', label: 'Technology' },
];

export default function Home() {
  const { user } = useAuth();
  const [activeCategories, setActiveCategories] = useState<Set<HotspotCategory>>(
    new Set(['conflict', 'politics', 'economy', 'climate', 'technology'])
  );
  const [queryMarkers, setQueryMarkers] = useState<QueryMarker[]>([]);
  const [markersLoading, setMarkersLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/dashboard/query-markers');
        if (res.ok) {
          const data = await res.json() as { markers: QueryMarker[] };
          setQueryMarkers(data.markers ?? []);
        }
      } catch {
        // silently fail — map still works with editorial hotspots only
      } finally {
        setMarkersLoading(false);
      }
    })();
  }, []);

  const toggleCategory = (cat: HotspotCategory) => {
    setActiveCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) {
        next.delete(cat);
      } else {
        next.add(cat);
      }
      if (next.size === 0) {
        return new Set(['conflict', 'politics', 'economy', 'climate', 'technology']);
      }
      return next;
    });
  };

  return (
    <div className="flex flex-col h-screen bg-slate-950 overflow-hidden">
      {/* Sticky header */}
      <header className="flex items-center justify-between px-4 sm:px-6 py-3 bg-slate-900/80 backdrop-blur border-b border-slate-800 z-10">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
            </svg>
          </div>
          <span className="text-white font-semibold text-sm sm:text-base">Agentic News Reader</span>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {/* Live query count badge */}
          {!markersLoading && queryMarkers.length > 0 && (
            <span className="hidden sm:flex items-center gap-1.5 text-xs text-slate-400 bg-slate-800 px-2.5 py-1 rounded-full border border-slate-700">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              {queryMarkers.length} live {queryMarkers.length === 1 ? 'query' : 'queries'}
            </span>
          )}
          {user && (
            <Link
              href="/cases"
              className="text-sm text-slate-300 hover:text-white transition-colors hidden sm:block"
            >
              My Cases
            </Link>
          )}
          <Link
            href="/dashboard"
            className="text-sm text-slate-300 hover:text-white transition-colors hidden sm:block"
          >
            Dashboard
          </Link>
          <Link
            href="/chat"
            className="px-3 sm:px-4 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Start Researching
          </Link>
          <SignInButton />
        </div>
      </header>

      {/* Map — fills remaining height */}
      <div className="relative flex-1 overflow-hidden">
        <WorldMap activeCategories={activeCategories} queryMarkers={queryMarkers} />

        {/* Overlay hint */}
        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-slate-900/80 backdrop-blur text-slate-300 text-xs px-3 py-1.5 rounded-full border border-slate-700 pointer-events-none">
          Click any marker to research that topic
        </div>

        {/* Loading indicator while fetching query markers */}
        {markersLoading && (
          <div className="absolute top-4 right-4 flex items-center gap-2 bg-slate-900/80 backdrop-blur text-slate-400 text-xs px-3 py-1.5 rounded-full border border-slate-700">
            <div className="w-3 h-3 border border-slate-400 border-t-transparent rounded-full animate-spin" />
            Loading queries…
          </div>
        )}
      </div>

      {/* Bottom category filter bar */}
      <div className="flex items-center justify-center gap-2 sm:gap-3 px-4 py-3 bg-slate-900/80 backdrop-blur border-t border-slate-800">
        <span className="text-xs text-slate-500 hidden sm:block">Filter:</span>
        {CATEGORIES.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => toggleCategory(id)}
            className={`flex items-center gap-1.5 px-3 py-1 text-xs rounded-full border transition-all ${
              activeCategories.has(id)
                ? 'border-transparent text-white'
                : 'border-slate-700 text-slate-500 bg-transparent hover:border-slate-500'
            }`}
            style={
              activeCategories.has(id)
                ? { backgroundColor: CATEGORY_COLORS[id] + '33', borderColor: CATEGORY_COLORS[id], color: CATEGORY_COLORS[id] }
                : {}
            }
          >
            <span
              className="w-2 h-2 rounded-full"
              style={activeCategories.has(id) ? { backgroundColor: CATEGORY_COLORS[id] } : { backgroundColor: '#64748b' }}
            />
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
