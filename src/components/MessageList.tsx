'use client';

import { useRef, useEffect } from 'react';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  createdAt: string;
  taskId?: string;
}

interface Task {
  id: string;
  status: string;
  title: string | null;
  response: string | null;
  sources: Array<{ number: number; title: string; url: string; source: string }> | null;
}

interface MessageListProps {
  messages: Message[];
  tasks: Task[];
  onSendMessage?: (text: string) => void;
  isLoading?: boolean;
}

export function MessageList({ messages, tasks, onSendMessage, isLoading }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <div className="w-16 h-16 mb-4 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
          <svg className="w-8 h-8 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
          Welcome to Agentic News Reader
        </h2>
        <p className="text-gray-600 dark:text-gray-400 max-w-md mb-6">
          Ask me about news and I&apos;ll research it for you. I&apos;ll search multiple sources,
          read articles, and synthesize the information into a comprehensive answer.
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-500 max-w-md mb-4">
          Note: Using GNews free tier (12-hour delay). Best for general topics, not breaking news.
        </p>
        <div className="grid gap-3 text-left">
          <ExampleQuery text="Which politicians received donations from FTX before its collapse?" onClick={onSendMessage} />
          <ExampleQuery text="Which celebrities were seen at Diddy's parties now under investigation?" onClick={onSendMessage} />
          <ExampleQuery text="Who sold their stocks right before major tech layoffs were announced?" onClick={onSendMessage} />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      {messages.map((message) => {
        const relatedTask = message.taskId
          ? tasks.find((t) => t.id === message.taskId)
          : null;

        return (
          <div key={message.id}>
            <MessageBubble message={message} />
            {relatedTask?.status === 'COMPLETED' && relatedTask.response && (
              <FinalResponse task={relatedTask} />
            )}
          </div>
        );
      })}
      {isLoading && <ThinkingIndicator />}
      <div ref={bottomRef} />
    </div>
  );
}

function ExampleQuery({ text, onClick }: { text: string; onClick?: (text: string) => void }) {
  return (
    <button
      onClick={() => onClick?.(text)}
      className="w-full text-left px-4 py-2 bg-gray-100 dark:bg-gray-800 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors cursor-pointer"
    >
      &quot;{text}&quot;
    </button>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-3 ${
          isUser
            ? 'bg-blue-600 text-white'
            : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white border border-gray-200 dark:border-gray-700'
        }`}
      >
        <p className="whitespace-pre-wrap">{message.text}</p>
        <p className={`text-xs mt-1 ${isUser ? 'text-blue-200' : 'text-gray-500 dark:text-gray-400'}`}>
          {formatTime(message.createdAt)}
        </p>
      </div>
    </div>
  );
}

function FinalResponse({ task }: { task: Task }) {
  if (!task.response) return null;

  // Parse the structured response
  const sections = parseResponse(task.response);

  return (
    <div className="mt-4 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border border-green-200 dark:border-green-800 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 bg-green-100/50 dark:bg-green-900/30 border-b border-green-200 dark:border-green-800">
        <svg className="w-5 h-5 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span className="font-medium text-green-800 dark:text-green-200">Research Complete</span>
        {task.sources && (
          <span className="text-xs text-green-600 dark:text-green-400 ml-auto">{task.sources.length} sources</span>
        )}
      </div>

      <div className="p-4 space-y-4">
        {/* TL;DR */}
        {sections.tldr && (
          <div className="bg-white/60 dark:bg-gray-800/60 rounded-lg p-3 border border-green-100 dark:border-green-900">
            <div className="text-xs font-semibold text-green-700 dark:text-green-400 mb-1">TL;DR</div>
            <p className="text-gray-800 dark:text-gray-200 font-medium">{sections.tldr}</p>
          </div>
        )}

        {/* Key Points */}
        {sections.keyPoints.length > 0 && (
          <div>
            <div className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2">KEY POINTS</div>
            <ul className="space-y-2">
              {sections.keyPoints.map((point, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className="text-green-500 mt-1">•</span>
                  <span className="text-gray-700 dark:text-gray-300 text-sm">{point}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Detailed Analysis */}
        {sections.detailed && (
          <div>
            <div className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2">DETAILED ANALYSIS</div>
            <div className="text-gray-700 dark:text-gray-300 text-sm space-y-2 leading-relaxed">
              {sections.detailed.split('\n\n').map((para, idx) => (
                <p key={idx}>{para}</p>
              ))}
            </div>
          </div>
        )}

        {/* Fallback for unstructured responses */}
        {!sections.tldr && sections.keyPoints.length === 0 && !sections.detailed && (
          <div className="text-gray-700 dark:text-gray-300 text-sm whitespace-pre-wrap leading-relaxed">
            {task.response}
          </div>
        )}
      </div>

      {/* Sources */}
      {task.sources && task.sources.length > 0 && (
        <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800/50 border-t border-green-200 dark:border-green-800">
          <div className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2">SOURCES</div>
          <div className="grid gap-1">
            {task.sources.map((source, idx) => (
              <a
                key={idx}
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-xs hover:bg-white/50 dark:hover:bg-gray-700/50 rounded px-2 py-1 -mx-2 group"
              >
                <span className="text-green-600 dark:text-green-400 font-medium">[{source.number || idx + 1}]</span>
                <span className="text-blue-600 dark:text-blue-400 group-hover:underline truncate flex-1">{source.title}</span>
                <span className="text-gray-400 flex-shrink-0">{source.source}</span>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function parseResponse(response: string): { tldr: string | null; keyPoints: string[]; detailed: string | null } {
  const result = { tldr: null as string | null, keyPoints: [] as string[], detailed: null as string | null };

  // Extract TL;DR (first line after **TL;DR:**)
  const tldrMatch = response.match(/\*\*TL;DR:\*\*\s*([^\n]+)/i);
  if (tldrMatch) {
    result.tldr = tldrMatch[1].trim();
  }

  // Extract Key Points section
  const keyPointsStart = response.search(/\*\*Key Points:\*\*/i);
  const detailedStart = response.search(/\*\*Detailed Analysis:\*\*/i);

  if (keyPointsStart !== -1) {
    const endIndex = detailedStart !== -1 ? detailedStart : response.length;
    const keyPointsSection = response.slice(keyPointsStart, endIndex);
    const points = keyPointsSection.match(/[•\-\*]\s*([^\n]+)/g);
    if (points) {
      result.keyPoints = points.map(p => p.replace(/^[•\-\*]\s*/, '').trim());
    }
  }

  // Extract Detailed Analysis
  if (detailedStart !== -1) {
    let detailed = response.slice(detailedStart).replace(/\*\*Detailed Analysis:\*\*/i, '').trim();
    // Remove any trailing sections
    const nextSection = detailed.search(/\*\*[A-Z]/);
    if (nextSection !== -1) {
      detailed = detailed.slice(0, nextSection);
    }
    result.detailed = detailed.trim();
  }

  return result;
}

function ThinkingIndicator() {
  return (
    <div className="flex justify-start pl-2">
      <div className="relative w-8 h-8">
        {/* Outer ring */}
        <div className="absolute inset-0 rounded-full border-2 border-blue-200 dark:border-blue-900" />
        {/* Spinning arc */}
        <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-blue-500 animate-spin" />
        {/* Center dot */}
        <div className="absolute inset-2 rounded-full bg-blue-500 animate-pulse" />
      </div>
    </div>
  );
}

function formatTime(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
}
