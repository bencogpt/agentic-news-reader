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
        <div className="grid gap-3 text-left">
          <ExampleQuery text="Where was Trump yesterday?" onClick={onSendMessage} />
          <ExampleQuery text="What's the latest on AI regulations?" onClick={onSendMessage} />
          <ExampleQuery text="Summarize tech news from last week" onClick={onSendMessage} />
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

function ThinkingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-gray-800 dark:to-gray-750 border border-blue-100 dark:border-gray-700 rounded-2xl px-5 py-4 shadow-sm">
        <div className="flex items-center gap-4">
          {/* Animated brain/thinking icon */}
          <div className="relative">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center animate-pulse">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            {/* Ripple effect */}
            <div className="absolute inset-0 rounded-full bg-blue-400 animate-ping opacity-20" />
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-200">Analyzing your request</span>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-[pulse_1s_ease-in-out_infinite]" />
              <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-[pulse_1s_ease-in-out_0.2s_infinite]" />
              <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-[pulse_1s_ease-in-out_0.4s_infinite]" />
              <span className="text-xs text-gray-400 dark:text-gray-500 ml-1">preparing research...</span>
            </div>
          </div>
        </div>
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
