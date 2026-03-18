'use client';

import { TimelineEntry } from '@/lib/types';

interface CaseTimelineProps {
  entries: TimelineEntry[];
  latestAddedAt?: string; // ISO timestamp of the latest refresh — entries after this are "new"
}

function groupByMonth(entries: TimelineEntry[]): Record<string, TimelineEntry[]> {
  const groups: Record<string, TimelineEntry[]> = {};
  for (const entry of entries) {
    const month = entry.date.slice(0, 7); // YYYY-MM
    if (!groups[month]) groups[month] = [];
    groups[month].push(entry);
  }
  return groups;
}

function formatMonth(yyyyMm: string): string {
  const [year, month] = yyyyMm.split('-');
  return new Date(Number(year), Number(month) - 1, 1).toLocaleString('default', {
    month: 'long',
    year: 'numeric',
  });
}

export function CaseTimeline({ entries, latestAddedAt }: CaseTimelineProps) {
  if (entries.length === 0) {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400 italic">
        No timeline entries yet. Refresh the case to populate the timeline.
      </p>
    );
  }

  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const groups = groupByMonth(sorted);

  return (
    <div className="space-y-8">
      {Object.entries(groups).map(([month, monthEntries]) => (
        <div key={month}>
          <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4">
            {formatMonth(month)}
          </h3>
          <div className="relative">
            {/* Vertical line */}
            <div className="absolute left-3 top-0 bottom-0 w-0.5 bg-gray-200 dark:bg-gray-700" />

            <div className="space-y-6">
              {monthEntries.map((entry) => {
                const isNew = latestAddedAt && entry.addedAt >= latestAddedAt;
                return (
                  <div key={entry.id} className="relative flex gap-4 pl-10">
                    {/* Dot */}
                    <div
                      className={`absolute left-1.5 w-3 h-3 rounded-full border-2 mt-1 ${
                        isNew
                          ? 'bg-blue-500 border-blue-500'
                          : 'bg-white dark:bg-gray-800 border-gray-400 dark:border-gray-500'
                      }`}
                    />
                    <div className="flex-1">
                      {/* Date */}
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-mono text-gray-500 dark:text-gray-400">
                          {entry.date}
                        </span>
                        {isNew && (
                          <span className="text-xs px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded font-medium">
                            new
                          </span>
                        )}
                      </div>
                      {/* Fact */}
                      <p className="text-sm text-gray-800 dark:text-gray-200 leading-relaxed">
                        {entry.fact}
                      </p>
                      {/* Source chips */}
                      {entry.sources && entry.sources.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {entry.sources.map((source, idx) => (
                            <a
                              key={idx}
                              href={source.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                            >
                              {source.source || source.title.substring(0, 30)}
                              <svg className="w-3 h-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                              </svg>
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
