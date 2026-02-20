'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { MessageList } from './MessageList';
import { ResearchProgress } from './ResearchProgress';
import { ChatInput } from './ChatInput';

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
  summary: string | null;
  response: string | null;
  sources: Array<{ number: number; title: string; url: string; source: string }> | null;
  iterationCount: number;
}

interface AgentEvent {
  id: string;
  taskId: string;
  iterationId?: string;
  createdAt: string;
  agent: string;
  type: string;
  payload: Record<string, unknown>;
}

export function Chat() {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isResearchOpen, setIsResearchOpen] = useState(true);
  const [debugMode, setDebugModeState] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const lastEventTimestampRef = useRef<string | null>(null);

  // Set up SSE connection when we have a conversation
  useEffect(() => {
    if (!conversationId) return;

    const setupEventSource = () => {
      const url = new URL('/api/stream', window.location.origin);
      url.searchParams.set('conversationId', conversationId);
      if (lastEventTimestampRef.current) {
        url.searchParams.set('lastEventId', lastEventTimestampRef.current);
      }

      const eventSource = new EventSource(url.toString());
      eventSourceRef.current = eventSource;

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as AgentEvent;
          setEvents((prev) => {
            // Avoid duplicates
            if (prev.some((e) => e.id === data.id)) return prev;
            return [...prev, data];
          });
          lastEventTimestampRef.current = data.createdAt;

          // Refresh conversation data when important events happen
          if (['RESPONSE_FINALIZED', 'TASK_CREATED', 'TASK_UPDATED'].includes(data.type)) {
            refreshConversation(conversationId);
          }
        } catch {
          // Ignore parsing errors (keepalive messages)
        }
      };

      eventSource.onerror = () => {
        eventSource.close();
        // Reconnect after a delay
        setTimeout(setupEventSource, 3000);
      };
    };

    setupEventSource();

    return () => {
      eventSourceRef.current?.close();
    };
  }, [conversationId]);

  const refreshConversation = async (convId: string) => {
    try {
      const response = await fetch(`/api/conversations/${convId}`);
      if (response.ok) {
        const data = await response.json();
        setMessages(data.messages);
        setTasks(data.tasks);
      }
    } catch (err) {
      console.error('Error refreshing conversation:', err);
    }
  };

  const sendMessage = useCallback(async (text: string, maxSearches: number = 1, freeTierMode: boolean = true, debugModeParam: boolean = false) => {
    setIsLoading(true);
    setError(null);
    setDebugModeState(debugModeParam);

    // Optimistic update: Add user message immediately
    const tempUserMessageId = `user-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      {
        id: tempUserMessageId,
        role: 'user',
        text,
        createdAt: new Date().toISOString(),
      },
    ]);

    try {
      const response = await fetch('/api/chat/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId,
          message: text,
          maxSearches,
          freeTierMode,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to send message');
      }

      const data = await response.json();

      // Update conversation ID if this is a new conversation
      if (!conversationId) {
        setConversationId(data.conversationId);
      }

      // Add assistant response
      setMessages((prev) => [
        ...prev,
        {
          id: data.message.id,
          role: 'assistant',
          text: data.message.text,
          createdAt: data.message.createdAt,
          taskId: data.taskId,
        },
      ]);

      // Refresh to get full data
      if (data.conversationId) {
        await refreshConversation(data.conversationId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      // Remove the optimistic message on error
      setMessages((prev) => prev.filter((m) => m.id !== tempUserMessageId));
    } finally {
      setIsLoading(false);
    }
  }, [conversationId]);

  const startNewConversation = useCallback(() => {
    setConversationId(null);
    setMessages([]);
    setTasks([]);
    setEvents([]);
    lastEventTimestampRef.current = null;
    eventSourceRef.current?.close();
  }, []);

  // Get the active task
  const activeTask = tasks.find((t) => ['ACTIVE', 'RESEARCHING', 'WAITING_ANALYST'].includes(t.status));
  const completedTask = tasks.find((t) => t.status === 'COMPLETED');
  const displayTask = activeTask || completedTask;

  // Filter events for the display task
  const taskEvents = displayTask
    ? events.filter((e) => e.taskId === displayTask.id)
    : [];

  const hasResearch = displayTask && taskEvents.length > 0;
  const isActive = displayTask && ['ACTIVE', 'RESEARCHING', 'WAITING_ANALYST'].includes(displayTask.status);

  return (
    <div className="flex flex-col h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="flex items-center justify-between px-4 md:px-6 py-3 md:py-4 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div>
          <h1 className="text-lg md:text-xl font-semibold text-gray-900 dark:text-white">
            Agentic News Reader
          </h1>
          <p className="text-xs md:text-sm text-gray-500 dark:text-gray-400 hidden sm:block">
            AI-powered news research assistant
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Mobile research toggle */}
          {hasResearch && (
            <button
              onClick={() => setIsResearchOpen(!isResearchOpen)}
              className="md:hidden flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 rounded-lg"
            >
              {isActive && (
                <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
              )}
              <span>Research</span>
              <svg
                className={`w-4 h-4 transition-transform ${isResearchOpen ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          )}
          <button
            onClick={startNewConversation}
            className="px-3 md:px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
            New Chat
          </button>
        </div>
      </header>

      {/* Mobile research panel (collapsible, above chat) */}
      {hasResearch && (
        <div className={`md:hidden border-b border-gray-200 dark:border-gray-700 overflow-hidden transition-all duration-300 ${isResearchOpen ? 'max-h-[50vh]' : 'max-h-0'}`}>
          <ResearchProgress
            task={displayTask}
            events={taskEvents}
            debugMode={debugMode}
          />
        </div>
      )}

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Chat area - full width on mobile, 1/3 on desktop when research active */}
        <div className={`flex flex-col w-full ${hasResearch ? 'md:w-1/3' : 'md:flex-1'}`}>
          {/* Messages */}
          <div className="flex-1 overflow-y-auto">
            <MessageList
              messages={messages}
              tasks={tasks}
              onSendMessage={sendMessage}
              isLoading={isLoading}
            />
          </div>

          {/* Error display */}
          {error && (
            <div className="mx-4 mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          {/* Input */}
          <ChatInput
            onSend={sendMessage}
            isLoading={isLoading}
            placeholder={messages.length === 0
              ? "Ask about news..."
              : "Send a message..."
            }
          />
        </div>

        {/* Desktop research progress - 2/3 width, hidden on mobile */}
        {hasResearch && (
          <div className="hidden md:block w-2/3 border-l border-gray-200 dark:border-gray-700 overflow-hidden">
            <ResearchProgress
              task={displayTask}
              events={taskEvents}
              debugMode={debugMode}
            />
          </div>
        )}
      </div>
    </div>
  );
}
