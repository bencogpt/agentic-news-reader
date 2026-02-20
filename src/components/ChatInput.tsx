'use client';

import { useState, useRef, useEffect, KeyboardEvent, FormEvent } from 'react';

type NewsProvider = 'gnews' | 'newsapi' | 'newsdata' | 'guardian' | 'currents' | 'mediastack';

interface ChatInputProps {
  onSend: (message: string, maxSearches: number, debugMode: boolean, provider: NewsProvider) => void;
  isLoading: boolean;
  placeholder?: string;
}

// Load settings from localStorage
function loadSettings() {
  if (typeof window === 'undefined') {
    return { maxSearches: 1, debugMode: false, provider: 'gnews' as NewsProvider };
  }
  try {
    const saved = localStorage.getItem('newsReaderSettings');
    if (saved) {
      return JSON.parse(saved);
    }
  } catch {
    // Ignore parse errors
  }
  return { maxSearches: 1, debugMode: false, provider: 'gnews' as NewsProvider };
}

export function ChatInput({ onSend, isLoading, placeholder }: ChatInputProps) {
  const [message, setMessage] = useState('');
  const [maxSearches, setMaxSearches] = useState(1);
  const [debugMode, setDebugMode] = useState(false);
  const [provider, setProvider] = useState<NewsProvider>('gnews');
  const [showSettings, setShowSettings] = useState(true);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load settings from localStorage on mount
  useEffect(() => {
    const settings = loadSettings();
    setMaxSearches(settings.maxSearches || 1);
    setDebugMode(settings.debugMode || false);
    setProvider(settings.provider || 'gnews');
    setSettingsLoaded(true);
  }, []);

  // Save settings to localStorage when they change
  useEffect(() => {
    if (!settingsLoaded) return;
    try {
      localStorage.setItem('newsReaderSettings', JSON.stringify({
        maxSearches,
        debugMode,
        provider,
      }));
    } catch {
      // Ignore storage errors
    }
  }, [maxSearches, debugMode, provider, settingsLoaded]);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
    }
  }, [message]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (message.trim() && !isLoading) {
      onSend(message.trim(), maxSearches, debugMode, provider);
      setMessage('');
      setShowSettings(false); // Close settings after first message
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="p-4 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-end gap-3 bg-gray-100 dark:bg-gray-700 rounded-xl p-2">
          {/* Settings button */}
          <button
            type="button"
            onClick={() => setShowSettings(!showSettings)}
            className={`flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-lg transition-colors ${
              showSettings ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-600' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
            }`}
            title="Search settings"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
          <textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder || 'Send a message...'}
            disabled={isLoading}
            rows={1}
            className="flex-1 bg-transparent border-none outline-none resize-none text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 px-2 py-1.5 min-h-[40px] max-h-[200px]"
          />
          <button
            type="submit"
            disabled={!message.trim() || isLoading}
            className="flex-shrink-0 w-10 h-10 flex items-center justify-center bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
          >
            {isLoading ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            )}
          </button>
        </div>
        {/* Settings panel */}
        {showSettings && (
          <div className="mt-2 p-3 bg-gray-100 dark:bg-gray-700 rounded-lg space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm text-gray-700 dark:text-gray-300">
                News Provider
              </label>
              <select
                value={provider}
                onChange={(e) => setProvider(e.target.value as NewsProvider)}
                className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-sm text-gray-900 dark:text-white"
              >
                <option value="newsdata">NewsData.io (recommended)</option>
                <option value="gnews">GNews</option>
                <option value="currents">Currents API</option>
                <option value="mediastack">Mediastack</option>
                <option value="guardian">The Guardian</option>
                <option value="newsapi">NewsAPI (localhost only)</option>
              </select>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {provider === 'newsdata' && '200 req/day, no restrictions'}
              {provider === 'gnews' && '100 req/day, 12h delay, 30-day history'}
              {provider === 'currents' && '600 req/day, good coverage'}
              {provider === 'mediastack' && '500 req/month, historical data'}
              {provider === 'guardian' && '500 req/day, UK-focused'}
              {provider === 'newsapi' && 'Localhost only (free tier blocked in production)'}
            </p>

            <div className="border-t border-gray-200 dark:border-gray-600 pt-3 flex items-center justify-between">
              <label className="text-sm text-gray-700 dark:text-gray-300">
                Max searches per request
              </label>
              <select
                value={maxSearches}
                onChange={(e) => setMaxSearches(Number(e.target.value))}
                className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-sm text-gray-900 dark:text-white"
              >
                <option value={1}>1 (fast)</option>
                <option value={3}>3</option>
                <option value={5}>5</option>
                <option value={10}>10 (thorough)</option>
              </select>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              More searches = more sources but uses more API quota
            </p>

            <div className="border-t border-gray-200 dark:border-gray-600 pt-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={debugMode}
                  onChange={(e) => setDebugMode(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  Debug Mode
                </span>
              </label>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Shows full API URL with key in research pane for troubleshooting.
              </p>
            </div>
          </div>
        )}
        <p className="mt-2 text-xs text-center text-gray-500 dark:text-gray-400">
          Press Enter to send, Shift+Enter for new line
        </p>
      </div>
    </form>
  );
}
