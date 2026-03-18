'use client';

import { useMemo, useState } from 'react';
import { useAuth } from './AuthProvider';

interface AgentEvent {
  id: string;
  taskId: string;
  iterationId?: string;
  createdAt: string;
  agent: string;
  type: string;
  payload: Record<string, unknown>;
}

interface Task {
  id: string;
  status: string;
  title: string | null;
  summary: string | null;
  iterationCount: number;
}

interface ResearchProgressProps {
  task: Task;
  events: AgentEvent[];
  debugMode?: boolean;
}

interface Phase {
  id: string;
  type: 'search' | 'reading' | 'analysis' | 'complete' | 'error';
  title: string;
  details: string[];
  status: 'pending' | 'running' | 'done' | 'error';
  url?: string;
  source?: string;
  articles?: Array<{ title: string; url: string; source: string }>;
  requestUrl?: string; // API request URL for debugging
  dateRange?: { from: string; to: string }; // Date range used for search
  notes?: Record<string, string[]>; // Notes extracted from article
  summary?: string; // Summary text
  provider?: string; // News provider used for search
}

const PROVIDER_NAMES: Record<string, string> = {
  newsdata: 'NewsData.io',
  currents: 'Currents',
  gnews: 'GNews',
  guardian: 'The Guardian',
  mediastack: 'Mediastack',
};

export function ResearchProgress({ task, events, debugMode = false }: ResearchProgressProps) {
  const { user } = useAuth();
  const [pinState, setPinState] = useState<'idle' | 'pinning' | 'pinned' | 'error'>('idle');
  const [pinnedCaseId, setPinnedCaseId] = useState<string | null>(null);

  const handlePin = async () => {
    if (!user || !task.id) return;
    setPinState('pinning');
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/cases', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ taskId: task.id }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setPinnedCaseId(data.id);
      setPinState('pinned');
    } catch {
      setPinState('error');
    }
  };

  // Group events by phase
  const phases = useMemo(() => {
    const result: Phase[] = [];
    let currentSearch: Phase | null = null;

    for (const event of events) {
      switch (event.type) {
        case 'TASK_CREATED':
          result.push({
            id: event.id,
            type: 'analysis',
            title: 'Task created',
            details: [(event.payload as { request?: string })?.request || 'Unknown'],
            status: 'done',
          });
          break;

        case 'ANALYST_STARTED':
          result.push({
            id: event.id,
            type: 'analysis',
            title: 'Analyst evaluating',
            details: ['Reviewing available information...'],
            status: 'running',
          });
          break;

        case 'ANALYST_DECISION': {
          const payload = event.payload as { decision?: string; reason?: string; query?: string };
          const lastAnalystPhase = result.find((p) => p.type === 'analysis' && p.status === 'running');
          if (lastAnalystPhase) {
            lastAnalystPhase.status = 'done';
            if (payload.decision === 'SEARCH' && payload.query) {
              lastAnalystPhase.details = [`Next search: "${payload.query}"`];
            } else if (payload.decision === 'COMPLETE') {
              lastAnalystPhase.details = ['Research complete - generating response'];
            } else {
              lastAnalystPhase.details = [payload.reason || `Decision: ${payload.decision}`];
            }
          }
          break;
        }

        case 'SEARCH_QUERY_CREATED': {
          const payload = event.payload as { query?: string };
          currentSearch = {
            id: event.id,
            type: 'search',
            title: payload.query || 'Searching...',
            details: [],
            status: 'running',
            articles: [],
          };
          result.push(currentSearch);
          break;
        }

        case 'SEARCH_STARTED': {
          // Capture the provider from SEARCH_STARTED event
          const payload = event.payload as { provider?: string };
          if (currentSearch && payload.provider) {
            currentSearch.provider = payload.provider;
          }
          break;
        }

        case 'SEARCH_RESULTS': {
          const payload = event.payload as {
            count?: number;
            requestUrl?: string;
            dateRange?: { from: string; to: string };
            articles?: Array<{ title: string; url: string; source: string }>;
          };
          if (currentSearch) {
            currentSearch.details = [`Found ${payload.count || 0} articles`];
            if (payload.dateRange) {
              currentSearch.details.push(`Searching: ${payload.dateRange.from} to ${payload.dateRange.to}`);
            }
            currentSearch.articles = payload.articles || [];
            currentSearch.requestUrl = payload.requestUrl;
            currentSearch.dateRange = payload.dateRange;
            currentSearch.status = 'done';
          }
          break;
        }

        case 'ARTICLE_READING_STARTED': {
          const payload = event.payload as { articleTitle?: string; articleUrl?: string };
          result.push({
            id: event.id,
            type: 'reading',
            title: payload.articleTitle || 'Unknown article',
            details: [],
            status: 'running',
            url: payload.articleUrl,
          });
          break;
        }

        case 'ARTICLE_READING_DONE': {
          const payload = event.payload as { articleUrl?: string };
          const lastReading = [...result].reverse().find((p) => p.type === 'reading' && p.status === 'running');
          if (lastReading) {
            lastReading.status = 'done';
            if (payload.articleUrl) {
              lastReading.url = payload.articleUrl;
            }
          }
          break;
        }

        case 'NOTES_UPDATED': {
          const payload = event.payload as { articleTitle?: string; notes?: Record<string, string[]> };
          // Find the reading phase that matches this article by title
          const matchingReading = [...result].reverse().find(
            (p) => p.type === 'reading' && p.title === payload.articleTitle
          );
          if (matchingReading && payload.notes) {
            const noteCount = Object.values(payload.notes).flat().length;
            matchingReading.details.push(`Extracted ${noteCount} notes`);
            matchingReading.notes = payload.notes;
          }
          break;
        }

        case 'ARTICLES_PROCESSED': {
          const payload = event.payload as { totalFound?: number; successfullyProcessed?: number; articles?: string[] };
          result.push({
            id: event.id,
            type: 'analysis',
            title: `Processed ${payload.successfullyProcessed || 0}/${payload.totalFound || 0} articles`,
            details: ['All articles read, generating summary...'],
            status: 'done',
          });
          break;
        }

        case 'SUMMARY_UPDATED': {
          const payload = event.payload as { summary?: string; articlesUsed?: string[]; articleCount?: number };
          const articleCount = payload.articleCount || payload.articlesUsed?.length || 0;
          result.push({
            id: event.id,
            type: 'analysis',
            title: 'Summary updated',
            details: [
              `Based on ${articleCount} article${articleCount !== 1 ? 's' : ''}`,
              ...(payload.articlesUsed?.slice(0, 3).map(title => `• ${title.length > 50 ? title.substring(0, 50) + '...' : title}`) || []),
              ...(payload.articlesUsed && payload.articlesUsed.length > 3 ? [`• ...and ${payload.articlesUsed.length - 3} more`] : []),
            ],
            status: 'done',
            summary: payload.summary,
          });
          break;
        }

        case 'RESPONSE_FINALIZED':
          result.push({
            id: event.id,
            type: 'complete',
            title: 'Research complete',
            details: ['Final answer with citations ready'],
            status: 'done',
          });
          break;

        case 'SEARCH_LIMIT_REACHED': {
          const payload = event.payload as { maxSearches?: number };
          result.push({
            id: event.id,
            type: 'analysis',
            title: `Search limit reached (${payload.maxSearches || 1})`,
            details: ['Completing with available information', 'Tip: Adjust max searches in settings ⚙️'],
            status: 'done',
          });
          break;
        }

        case 'ERROR': {
          const payload = event.payload as { error?: string; details?: string };
          result.push({
            id: event.id,
            type: 'error',
            title: 'Error occurred',
            details: [payload.error || 'Unknown error', payload.details || ''].filter(Boolean),
            status: 'error',
          });
          break;
        }
      }
    }

    return result;
  }, [events]);

  const isActive = ['ACTIVE', 'RESEARCHING', 'WAITING_ANALYST'].includes(task.status);

  return (
    <div className="h-full bg-white dark:bg-gray-800 flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center gap-3">
        {isActive ? (
          <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
        ) : task.status === 'COMPLETED' ? (
          <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        ) : task.status === 'FAILED' ? (
          <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        )}
        <div className="flex-1">
          <span className="font-medium text-gray-900 dark:text-white block">
            {isActive ? 'Researching...' : task.status === 'COMPLETED' ? 'Complete' : task.status === 'FAILED' ? 'Failed' : 'Research'}
          </span>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {task.iterationCount} iteration{task.iterationCount !== 1 ? 's' : ''} · {phases.filter(p => p.type === 'reading').length} articles
          </span>
        </div>

        {/* Pin as Case button — shown when completed and user is signed in */}
        {task.status === 'COMPLETED' && user && (
          <div className="flex-shrink-0">
            {pinState === 'pinned' && pinnedCaseId ? (
              <a
                href={`/cases/${pinnedCaseId}`}
                className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
              >
                ✓ View Case
              </a>
            ) : (
              <button
                onClick={handlePin}
                disabled={pinState === 'pinning'}
                className="flex items-center gap-1 text-xs px-2.5 py-1.5 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/50 disabled:opacity-50 transition-colors"
              >
                {pinState === 'pinning' ? (
                  <div className="w-3 h-3 border border-blue-600 border-t-transparent rounded-full animate-spin" />
                ) : (
                  '📌'
                )}
                {pinState === 'error' ? 'Error' : 'Pin as Case'}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Progress phases - scrollable */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {phases.map((phase) => (
          <PhaseItem key={phase.id} phase={phase} debugMode={debugMode} />
        ))}
        {phases.length === 0 && (
          <p className="text-sm text-gray-500 dark:text-gray-400 italic">Initializing...</p>
        )}
      </div>
    </div>
  );
}

function PhaseItem({ phase, debugMode = false }: { phase: Phase; debugMode?: boolean }) {
  const [expanded, setExpanded] = useState(false);

  const iconClass = {
    search: 'text-purple-500',
    reading: 'text-blue-500',
    analysis: 'text-amber-500',
    complete: 'text-green-500',
    error: 'text-red-500',
  }[phase.type] || 'text-gray-500';

  const icon = {
    search: (
      <svg className={`w-4 h-4 ${iconClass}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
    ),
    reading: (
      <svg className={`w-4 h-4 ${iconClass}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
    analysis: (
      <svg className={`w-4 h-4 ${iconClass}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
      </svg>
    ),
    complete: (
      <svg className={`w-4 h-4 ${iconClass}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    error: (
      <svg className={`w-4 h-4 ${iconClass}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    ),
  }[phase.type];

  // For reading phases, show as a compact link with expandable notes
  if (phase.type === 'reading') {
    const hasNotes = phase.notes && Object.values(phase.notes).flat().length > 0;
    return (
      <div className="border-b border-gray-100 dark:border-gray-700/50 last:border-0">
        <div className="flex items-center gap-2 py-1.5">
          <div className="flex-shrink-0">
            {phase.status === 'running' ? (
              <div className={`w-3 h-3 border-2 border-current ${iconClass} border-t-transparent rounded-full animate-spin`} />
            ) : (
              <svg className={`w-3 h-3 ${iconClass}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            )}
          </div>
          <div className="flex-1 min-w-0">
            {phase.url ? (
              <a
                href={phase.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 hover:underline truncate block"
                title={phase.title}
              >
                {phase.title}
              </a>
            ) : (
              <span className="text-xs text-gray-700 dark:text-gray-300 truncate block">{phase.title}</span>
            )}
          </div>
          {hasNotes && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-xs text-blue-500 hover:text-blue-600 hover:underline flex-shrink-0"
            >
              {expanded ? 'hide' : `${Object.values(phase.notes!).flat().length} notes`}
            </button>
          )}
        </div>
        {expanded && phase.notes && (
          <div className="pl-5 pb-2 text-xs space-y-1">
            {Object.entries(phase.notes).map(([key, values]) => (
              values.length > 0 && (
                <div key={key}>
                  <span className="text-gray-500 dark:text-gray-400 capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}:</span>
                  <ul className="ml-2 text-gray-600 dark:text-gray-300">
                    {values.map((v, i) => <li key={i}>• {v}</li>)}
                  </ul>
                </div>
              )
            ))}
          </div>
        )}
      </div>
    );
  }

  // For search phases, show articles list (or empty state with API link)
  if (phase.type === 'search') {
    const hasArticles = phase.articles && phase.articles.length > 0;
    return (
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden bg-white dark:bg-gray-800/50">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100 dark:border-gray-700">
          <div className="flex-shrink-0">
            {phase.status === 'running' ? (
              <div className={`w-4 h-4 border-2 border-current ${iconClass} border-t-transparent rounded-full animate-spin`} />
            ) : (
              icon
            )}
          </div>
          <span className="text-sm font-medium text-gray-900 dark:text-white truncate flex-1">{phase.title}</span>
          {phase.provider && (
            <span className="text-xs px-1.5 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded font-medium">
              {PROVIDER_NAMES[phase.provider] || phase.provider}
            </span>
          )}
          {debugMode && phase.requestUrl && (
            <a
              href={phase.requestUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-purple-500 hover:text-purple-600 hover:underline flex-shrink-0 flex items-center gap-1"
              title={`View ${PROVIDER_NAMES[phase.provider || ''] || 'API'} request (Debug Mode)`}
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              API
            </a>
          )}
          <span className={`text-xs ${hasArticles ? 'text-gray-400' : 'text-red-400'}`}>
            {phase.articles?.length || 0} found
          </span>
          {phase.dateRange && (
            <span className="text-xs text-blue-400" title="Free tier date range">
              ({phase.dateRange.from} → {phase.dateRange.to})
            </span>
          )}
        </div>
        {hasArticles ? (
          <div className="px-3 py-2 space-y-0.5 max-h-32 overflow-y-auto bg-gray-50 dark:bg-gray-900/30">
            {phase.articles!.map((article, idx) => (
              <a
                key={idx}
                href={article.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-xs hover:bg-white dark:hover:bg-gray-800 rounded px-1.5 py-1 -mx-1.5 group"
              >
                <span className="text-gray-300 dark:text-gray-600 w-4 text-right">{idx + 1}</span>
                <span className="text-gray-600 dark:text-gray-400 group-hover:text-gray-900 dark:group-hover:text-white truncate flex-1">{article.title}</span>
                <span className="text-gray-300 dark:text-gray-600 flex-shrink-0 text-[10px]">{article.source}</span>
              </a>
            ))}
          </div>
        ) : phase.status === 'done' && (
          <div className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/30">
            No articles found.{debugMode ? ' Click API link to debug the request.' : ' Enable Debug Mode in settings to see the API request.'}
          </div>
        )}
      </div>
    );
  }

  // Default rendering for other phases
  const hasSummary = phase.summary && phase.summary.length > 0;

  return (
    <div className="py-2">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5">
          {phase.status === 'running' ? (
            <div className={`w-4 h-4 border-2 border-current ${iconClass} border-t-transparent rounded-full animate-spin`} />
          ) : (
            icon
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className={`text-sm ${phase.status === 'error' ? 'text-red-600 dark:text-red-400' : 'text-gray-700 dark:text-gray-300'}`}>
              {phase.title}
            </p>
            {hasSummary && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="text-xs text-amber-500 hover:text-amber-600 hover:underline"
              >
                {expanded ? 'hide' : 'show'}
              </button>
            )}
          </div>
          {phase.details.length > 0 && !expanded && (
            <ul className="mt-0.5 space-y-0.5">
              {phase.details.map((detail, idx) => (
                <li key={idx} className="text-xs text-gray-400 dark:text-gray-500">
                  {detail}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      {expanded && phase.summary && (
        <div className="mt-2 ml-7 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap max-h-48 overflow-y-auto">
          {phase.summary}
        </div>
      )}
    </div>
  );
}
