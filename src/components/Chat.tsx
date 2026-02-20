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

  const sendMessage = useCallback(async (text: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/chat/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId,
          message: text,
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

      // Add user message
      setMessages((prev) => [
        ...prev,
        {
          id: `user-${Date.now()}`,
          role: 'user',
          text,
          createdAt: new Date().toISOString(),
        },
      ]);

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

  return (
    <div className="flex flex-col h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
            Agentic News Reader
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            AI-powered news research assistant
          </p>
        </div>
        <button
          onClick={startNewConversation}
          className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
        >
          New Chat
        </button>
      </header>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Chat area */}
        <div className="flex-1 flex flex-col">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto">
            <MessageList
              messages={messages}
              tasks={tasks}
            />
          </div>

          {/* Research progress */}
          {displayTask && taskEvents.length > 0 && (
            <ResearchProgress
              task={displayTask}
              events={taskEvents}
            />
          )}

          {/* Error display */}
          {error && (
            <div className="mx-6 mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          {/* Input */}
          <ChatInput
            onSend={sendMessage}
            isLoading={isLoading}
            placeholder={messages.length === 0
              ? "Ask about news... e.g., 'Where was Trump yesterday?'"
              : "Send a message..."
            }
          />
        </div>
      </div>
    </div>
  );
}
