'use client';

import { useState, useEffect, useMemo } from 'react';

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
}

export function ResearchProgress({ task, events }: ResearchProgressProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  // Group events by phase
  const phases = useMemo(() => {
    const result: Array<{
      id: string;
      type: 'search' | 'reading' | 'analysis' | 'complete' | 'error';
      title: string;
      details: string[];
      status: 'pending' | 'running' | 'done' | 'error';
    }> = [];

    let currentSearch: typeof result[0] | null = null;

    for (const event of events) {
      switch (event.type) {
        case 'TASK_CREATED':
          result.push({
            id: event.id,
            type: 'analysis',
            title: 'Task created',
            details: [`Request: ${(event.payload as { request?: string })?.request || 'Unknown'}`],
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
          const payload = event.payload as { decision?: string; reason?: string };
          const lastAnalystPhase = result.find((p) => p.type === 'analysis' && p.status === 'running');
          if (lastAnalystPhase) {
            lastAnalystPhase.status = 'done';
            lastAnalystPhase.details.push(`Decision: ${payload.decision}`);
            if (payload.reason) {
              lastAnalystPhase.details.push(`Reason: ${payload.reason}`);
            }
          }
          break;
        }

        case 'SEARCH_QUERY_CREATED': {
          const payload = event.payload as { query?: string };
          currentSearch = {
            id: event.id,
            type: 'search',
            title: `Searching: "${payload.query}"`,
            details: [],
            status: 'running',
          };
          result.push(currentSearch);
          break;
        }

        case 'SEARCH_STARTED':
          if (currentSearch) {
            currentSearch.details.push('Querying NewsAPI...');
          }
          break;

        case 'SEARCH_RESULTS': {
          const payload = event.payload as { count?: number };
          if (currentSearch) {
            currentSearch.details.push(`Found ${payload.count || 0} articles`);
            currentSearch.status = 'done';
          }
          break;
        }

        case 'ARTICLE_READING_STARTED': {
          const payload = event.payload as { articleTitle?: string };
          result.push({
            id: event.id,
            type: 'reading',
            title: `Reading: ${truncate(payload.articleTitle || 'Unknown', 50)}`,
            details: [],
            status: 'running',
          });
          break;
        }

        case 'ARTICLE_READING_DONE': {
          const lastReading = [...result].reverse().find((p) => p.type === 'reading' && p.status === 'running');
          if (lastReading) {
            lastReading.status = 'done';
          }
          break;
        }

        case 'NOTES_UPDATED': {
          const payload = event.payload as { articleTitle?: string; notes?: Record<string, string[]> };
          const lastReading = [...result].reverse().find((p) => p.type === 'reading');
          if (lastReading && payload.notes) {
            const noteCount = Object.values(payload.notes).flat().length;
            lastReading.details.push(`Extracted ${noteCount} notes`);
          }
          break;
        }

        case 'SUMMARY_UPDATED':
          result.push({
            id: event.id,
            type: 'analysis',
            title: 'Summary updated',
            details: ['Synthesizing information from all sources'],
            status: 'done',
          });
          break;

        case 'RESPONSE_FINALIZED':
          result.push({
            id: event.id,
            type: 'complete',
            title: 'Research complete',
            details: ['Final answer with citations ready'],
            status: 'done',
          });
          break;

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

  // Auto-collapse when complete
  useEffect(() => {
    if (task.status === 'COMPLETED' || task.status === 'FAILED') {
      const timer = setTimeout(() => setIsExpanded(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [task.status]);

  const isActive = ['ACTIVE', 'RESEARCHING', 'WAITING_ANALYST'].includes(task.status);

  return (
    <div className="mx-6 mb-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors"
      >
        <div className="flex items-center gap-3">
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
          <span className="font-medium text-gray-900 dark:text-white">
            {isActive ? 'Researching...' : task.status === 'COMPLETED' ? 'Research Complete' : task.status === 'FAILED' ? 'Research Failed' : 'Research'}
          </span>
          <span className="text-sm text-gray-500 dark:text-gray-400">
            ({task.iterationCount} iteration{task.iterationCount !== 1 ? 's' : ''})
          </span>
        </div>
        <svg
          className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Progress phases */}
      {isExpanded && (
        <div className="px-4 pb-4 space-y-2">
          {phases.map((phase) => (
            <PhaseItem key={phase.id} phase={phase} />
          ))}
          {phases.length === 0 && (
            <p className="text-sm text-gray-500 dark:text-gray-400 italic">Initializing...</p>
          )}
        </div>
      )}
    </div>
  );
}

function PhaseItem({ phase }: { phase: { type: string; title: string; details: string[]; status: string } }) {
  const iconClass = {
    search: 'text-purple-500',
    reading: 'text-blue-500',
    analysis: 'text-orange-500',
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

  return (
    <div className="flex items-start gap-3 py-2 border-l-2 border-gray-200 dark:border-gray-700 pl-3 ml-2">
      <div className="flex-shrink-0 mt-0.5">
        {phase.status === 'running' ? (
          <div className={`w-4 h-4 border-2 border-current ${iconClass} border-t-transparent rounded-full animate-spin`} />
        ) : (
          icon
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${phase.status === 'error' ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white'}`}>
          {phase.title}
        </p>
        {phase.details.length > 0 && (
          <ul className="mt-1 space-y-0.5">
            {phase.details.map((detail, idx) => (
              <li key={idx} className="text-xs text-gray-500 dark:text-gray-400">
                {detail}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + '...';
}
