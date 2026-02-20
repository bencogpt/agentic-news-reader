'use client';

import Link from 'next/link';

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white dark:from-gray-900 dark:to-gray-800">
      {/* Hero Section */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-16">
        <div className="text-center">
          {/* Logo */}
          <div className="flex justify-center mb-8">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg">
              <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
              </svg>
            </div>
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 dark:text-white mb-6">
            Agentic News Reader
          </h1>

          <p className="text-xl sm:text-2xl text-gray-600 dark:text-gray-300 mb-4 max-w-3xl mx-auto">
            AI-powered research assistant that reads <span className="text-blue-600 dark:text-blue-400 font-semibold">hundreds of articles</span> to answer your questions
          </p>

          <p className="text-lg text-gray-500 dark:text-gray-400 mb-10 max-w-2xl mx-auto">
            Ask any question about current events and watch as multiple AI agents search, read, and synthesize information from dozens of news sources in real-time.
          </p>

          <Link
            href="/chat"
            className="inline-flex items-center gap-2 px-8 py-4 text-lg font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl hover:from-blue-700 hover:to-indigo-700 transition-all shadow-lg hover:shadow-xl"
          >
            Get Started
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </Link>
        </div>
      </div>

      {/* Multi-Agent Architecture */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <h2 className="text-2xl sm:text-3xl font-bold text-center text-gray-900 dark:text-white mb-4">
          Multi-Agent Architecture
        </h2>
        <p className="text-center text-gray-600 dark:text-gray-400 mb-12 max-w-2xl mx-auto">
          Three specialized AI agents work together, each with a distinct role in the research process.
        </p>

        <div className="grid md:grid-cols-3 gap-8">
          {/* UFA Agent */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
            <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center mb-4">
              <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <div className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 mb-1">AGENT 1</div>
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">UFA</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">User-Facing Agent</p>
            <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed">
              The conversational interface that understands your questions. It extracts intent, identifies topics, time windows, and output preferences, then coordinates the other agents to fulfill your request.
            </p>
            <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
              <div className="text-xs text-gray-500 dark:text-gray-500">Responsibilities:</div>
              <ul className="mt-2 space-y-1 text-xs text-gray-600 dark:text-gray-400">
                <li className="flex items-center gap-2">
                  <span className="w-1 h-1 rounded-full bg-indigo-500" />
                  Parse natural language queries
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1 h-1 rounded-full bg-indigo-500" />
                  Extract topic & time constraints
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1 h-1 rounded-full bg-indigo-500" />
                  Manage conversation flow
                </li>
              </ul>
            </div>
          </div>

          {/* Analyst Agent */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
            <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center mb-4">
              <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <div className="text-xs font-semibold text-amber-600 dark:text-amber-400 mb-1">AGENT 2</div>
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Analyst</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">Research Strategist</p>
            <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed">
              The brain of the operation. It evaluates gathered information, decides if more research is needed, generates targeted search queries, and ultimately synthesizes the final comprehensive answer.
            </p>
            <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
              <div className="text-xs text-gray-500 dark:text-gray-500">Responsibilities:</div>
              <ul className="mt-2 space-y-1 text-xs text-gray-600 dark:text-gray-400">
                <li className="flex items-center gap-2">
                  <span className="w-1 h-1 rounded-full bg-amber-500" />
                  Generate search queries
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1 h-1 rounded-full bg-amber-500" />
                  Evaluate information completeness
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1 h-1 rounded-full bg-amber-500" />
                  Synthesize final answer
                </li>
              </ul>
            </div>
          </div>

          {/* Summarizer Agent */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
            <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center mb-4">
              <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div className="text-xs font-semibold text-blue-600 dark:text-blue-400 mb-1">AGENT 3</div>
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Summarizer</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">Content Processor</p>
            <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed">
              The workhorse that processes articles in parallel. It fetches full article content, extracts structured notes (who, what, when, where), and builds a knowledge base for the Analyst.
            </p>
            <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
              <div className="text-xs text-gray-500 dark:text-gray-500">Responsibilities:</div>
              <ul className="mt-2 space-y-1 text-xs text-gray-600 dark:text-gray-400">
                <li className="flex items-center gap-2">
                  <span className="w-1 h-1 rounded-full bg-blue-500" />
                  Fetch & parse articles
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1 h-1 rounded-full bg-blue-500" />
                  Extract structured facts
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1 h-1 rounded-full bg-blue-500" />
                  Process 30 articles in parallel
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Agent Flow Diagram */}
        <div className="mt-12 bg-gray-100 dark:bg-gray-800/50 rounded-2xl p-6 md:p-8">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-6 text-center">How They Work Together</h3>
          <div className="flex flex-col md:flex-row items-center justify-center gap-4 md:gap-2 text-sm">
            <div className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 rounded-lg shadow-sm">
              <span className="w-3 h-3 rounded-full bg-indigo-500" />
              <span className="text-gray-700 dark:text-gray-300">You ask a question</span>
            </div>
            <svg className="w-6 h-6 text-gray-400 rotate-90 md:rotate-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
            <div className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 rounded-lg shadow-sm">
              <span className="w-3 h-3 rounded-full bg-indigo-500" />
              <span className="text-gray-700 dark:text-gray-300">UFA parses intent</span>
            </div>
            <svg className="w-6 h-6 text-gray-400 rotate-90 md:rotate-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
            <div className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 rounded-lg shadow-sm">
              <span className="w-3 h-3 rounded-full bg-amber-500" />
              <span className="text-gray-700 dark:text-gray-300">Analyst searches</span>
            </div>
            <svg className="w-6 h-6 text-gray-400 rotate-90 md:rotate-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
            <div className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 rounded-lg shadow-sm">
              <span className="w-3 h-3 rounded-full bg-blue-500" />
              <span className="text-gray-700 dark:text-gray-300">Summarizer reads</span>
            </div>
            <svg className="w-6 h-6 text-gray-400 rotate-90 md:rotate-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
            <div className="flex items-center gap-2 px-4 py-2 bg-green-100 dark:bg-green-900/30 rounded-lg shadow-sm">
              <span className="w-3 h-3 rounded-full bg-green-500" />
              <span className="text-gray-700 dark:text-gray-300">Answer with citations</span>
            </div>
          </div>
          <p className="text-center text-xs text-gray-500 dark:text-gray-400 mt-4">
            This loop repeats up to 10 times until the Analyst decides it has enough information
          </p>
        </div>
      </div>

      {/* Features */}
      <div className="bg-gray-100 dark:bg-gray-800/50 py-16">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl sm:text-3xl font-bold text-center text-gray-900 dark:text-white mb-12">
            Features
          </h2>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <FeatureCard
              icon={<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />}
              title="Real-time Research"
              description="Watch the agents work in real-time as they search and read articles"
            />
            <FeatureCard
              icon={<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />}
              title="30+ Articles/Search"
              description="Each search iteration processes up to 30 articles for comprehensive coverage"
            />
            <FeatureCard
              icon={<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />}
              title="Full Citations"
              description="Every fact is linked to its source with clickable references"
            />
            <FeatureCard
              icon={<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />}
              title="Multi-iteration"
              description="Up to 10 search iterations to explore different angles"
            />
          </div>
        </div>
      </div>

      {/* CTA */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center">
        <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-4">
          Ready to try it?
        </h2>
        <p className="text-gray-600 dark:text-gray-400 mb-8">
          Ask about any current event and get a comprehensive, well-sourced answer.
        </p>
        <Link
          href="/chat"
          className="inline-flex items-center gap-2 px-6 py-3 text-base font-semibold text-white bg-gray-900 dark:bg-white dark:text-gray-900 rounded-lg hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors"
        >
          Start Researching
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
        </Link>
      </div>

      {/* Footer */}
      <footer className="border-t border-gray-200 dark:border-gray-700 py-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-sm text-gray-500 dark:text-gray-400">
          <p>Built with Next.js, OpenAI, and GNews API</p>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm">
      <div className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center mb-4">
        <svg className="w-5 h-5 text-gray-600 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          {icon}
        </svg>
      </div>
      <h3 className="font-semibold text-gray-900 dark:text-white mb-1">{title}</h3>
      <p className="text-sm text-gray-600 dark:text-gray-400">{description}</p>
    </div>
  );
}
