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
}

export function MessageList({ messages, tasks }: MessageListProps) {
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
        <div className="grid gap-3 text-left">
          <ExampleQuery text="Where was Trump yesterday?" />
          <ExampleQuery text="What's the latest on AI regulations?" />
          <ExampleQuery text="Summarize tech news from last week" />
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
      <div ref={bottomRef} />
    </div>
  );
}

function ExampleQuery({ text }: { text: string }) {
  return (
    <div className="px-4 py-2 bg-gray-100 dark:bg-gray-800 rounded-lg text-sm text-gray-700 dark:text-gray-300">
      &quot;{text}&quot;
    </div>
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

  return (
    <div className="mt-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <svg className="w-5 h-5 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span className="font-medium text-green-800 dark:text-green-200">Research Complete</span>
      </div>
      <div className="prose prose-sm dark:prose-invert max-w-none">
        <p className="text-gray-800 dark:text-gray-200 whitespace-pre-wrap">{task.response}</p>
      </div>
      {task.sources && task.sources.length > 0 && (
        <div className="mt-4 pt-4 border-t border-green-200 dark:border-green-800">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Sources</h4>
          <ul className="space-y-1">
            {task.sources.map((source, idx) => (
              <li key={idx} className="text-sm">
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 dark:text-blue-400 hover:underline"
                >
                  [{source.number || idx + 1}] {source.title}
                </a>
                <span className="text-gray-500 dark:text-gray-400"> - {source.source}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
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
