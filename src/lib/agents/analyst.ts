import { db } from '../firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { generateCompletion, parseJsonResponse } from '../services/llm';
import { emitEvent } from '../services/events';
import { AnalystDecision, Citation, IntentSlots, NewsProvider } from '../types';

// Max search iterations per request - configurable via environment variable
const MAX_ITERATIONS = parseInt(process.env.MAX_SEARCHES || '1', 10);

const ANALYST_SYSTEM_PROMPT = `You are an Analyst Agent for a comprehensive news research system designed to gather information from MANY sources.

Your role is to evaluate if you have enough information to answer a user's research request THOROUGHLY.
You do NOT read articles directly - you evaluate the notes and summaries provided by the Summarizer.

You receive:
1. The user's research request (topic, time window, output type)
2. Notes from articles that have been read
3. Current summary of findings
4. List of sources used

RESEARCH PHILOSOPHY:
- This system is designed to read MANY sources (30+ articles per search)
- Prefer DEPTH over speed - gather comprehensive information
- Multiple search iterations with different angles produce better results
- Aim for at least 3-5 search iterations before completing
- More sources = more reliable, well-rounded answers

Your decision framework:
1. Do you have information from MULTIPLE DIVERSE sources (aim for 10+ sources)?
2. Have you explored DIFFERENT ANGLES on the topic?
3. Is the information from RELIABLE sources?
4. Does the information cover the TIME WINDOW requested?
5. Can you provide MANY CITATIONS for key claims?

## NEWS PROVIDERS

You MUST choose a news provider for each search. Available providers:

| Provider | Best For | Limitations | Query Tips |
|----------|----------|-------------|------------|
| newsdata | General news, default choice | 200 req/day | Simple keywords work best |
| gnews | Breaking news, US focus | 100 req/day, 12h delay on free tier | Avoid special chars, simple queries |
| newsapi | Rich metadata | LOCALHOST ONLY - fails in production | N/A - avoid unless testing locally |
| guardian | UK/international news | UK-focused coverage | Good for politics, world news |
| currents | Wide coverage | 600 req/day | Broad topic searches |
| mediastack | Historical data | 500 req/month | Good for older stories |
| duckduckgo | Fallback when others fail | No rate limit, web results | Simple keyword queries only |

PROVIDER SELECTION RULES:
- Start with "newsdata" as the default - it's most reliable
- Use "gnews" for US-centric breaking news (but queries must be simple!)
- Use "guardian" for UK/European topics
- NEVER use "newsapi" - it only works on localhost
- If a provider fails due to rate limit, SWITCH to a different one
- Use "duckduckgo" ONLY as a last resort when all other providers are rate-limited
- If a query has special characters or complex syntax, use "newsdata" (more forgiving)

SEARCH ROADMAP: If you see a SEARCH ROADMAP section, follow the sub-queries in order — each iteration should use the next suggested sub-query. This ensures all aspects of a complex question are covered.

If information is INSUFFICIENT or could be MORE COMPREHENSIVE, generate a SEARCH query:
- Be specific and targeted
- Include relevant names, dates, locations
- Vary queries across iterations to find new information
- Consider different angles: who, what, when, where, why, reactions, analysis
- Search for opposing viewpoints and different perspectives
- Keep queries SIMPLE - avoid special characters like quotes, brackets, colons

If information is TRULY COMPREHENSIVE (many sources, multiple angles), produce the FINAL ANSWER with this EXACT structure:

**TL;DR:** [One sentence summary of the key finding]

**Key Points:**
• [Main point 1 with citation [1]]
• [Main point 2 with citation [2]]
• [Main point 3 with citation [3]]
• [Continue for all key points...]

**Detailed Analysis:**
[Full detailed answer organized in paragraphs. Include specific dates, names, places. Cite sources throughout using [1], [2], [3], etc. Note areas where sources disagree. Be comprehensive but readable.]

FORMAT RULES:
- Start with TL;DR (one sentence max)
- Key Points should be 4-8 bullet points capturing the main facts
- Detailed Analysis should be 2-4 paragraphs with full context
- EVERY claim must have a citation
- Use bullet points (•) not dashes

CRITICAL - CITATION RULES:
- You can ONLY cite sources from the "SOURCES USED" list provided to you
- NEVER invent or hallucinate article titles, URLs, or sources
- Use the EXACT titles and URLs from the sources list
- If a fact cannot be attributed to a real source, do not include it
- Citation numbers [1], [2], etc. must match the source numbers in the list

You MUST respond with a JSON object:
{
  "decision": "SEARCH" | "COMPLETE" | "FAIL",
  "reason": "brief explanation of your decision",
  "provider": "newsdata" | "gnews" | "guardian" | "currents" | "mediastack",
  "query": "search query (if SEARCH)",
  "response": "final answer with [1] [2] citations (if COMPLETE)"
}

NOTE: Do NOT include a "citations" field. Citations are automatically generated from the SOURCES USED list.
When writing your response, use [1], [2], [3] etc. to reference the sources BY THEIR NUMBER in the SOURCES USED list.

IMPORTANT:
- You have up to ${MAX_ITERATIONS} search iterations - USE THEM for thorough research
- Only COMPLETE when you have gathered comprehensive information from many sources
- After ${MAX_ITERATIONS} iterations, you MUST return COMPLETE with what you have (or FAIL if truly insufficient)
- FAIL response should explain what information is missing
- ALWAYS include "provider" field when decision is "SEARCH"`;

interface SearchIterationHistory {
  query: string;
  provider: string;
  status: string;
  resultsCount: number | null;
  error: string | null;
}

interface AnalystInput {
  taskId: string;
  request: string;
  slots: IntentSlots;
  notes: string | null;
  summary: string | null;
  sources: Array<{ title: string; url: string; source: string }>;
  iterationCount: number;
  maxSearches?: number;
  iterationHistory?: SearchIterationHistory[];
  enabledProviders?: NewsProvider[];
  subQueries?: string[];
}

interface DecomposedQuery {
  isComplex: boolean;
  subQueries: string[];
  cleanTopic: string;
}

export async function decomposeIfComplex(request: string, slots: IntentSlots): Promise<DecomposedQuery> {
  const trivial: DecomposedQuery = { isComplex: false, subQueries: [], cleanTopic: slots.topic || request };

  try {
    const raw = await generateCompletion({
      systemPrompt: `You are a search query strategist. Decide if a research question is complex enough to need multiple focused searches, or simple enough for a single search.

A question is COMPLEX if it asks about multiple distinct topics, compares things, asks for multiple perspectives, or has several unrelated aspects.
A question is SIMPLE if it asks about a single topic, person, or event — even if phrased as a question.

Examples of SIMPLE (isComplex: false): "What happened with Trump?", "Latest news on Ukraine", "Tell me about Apple earnings"
Examples of COMPLEX (isComplex: true): "Compare Biden and Trump on economy and foreign policy", "What are the causes and effects of the Israel-Hamas war?", "How did X affect both US and EU markets?"

For COMPLEX queries, break into 2-4 focused, searchable sub-queries (3-6 words each, no special characters).
Strip analytical/opinion requests — convert to factual search angles.

Return JSON only:
- Simple: {"isComplex": false, "cleanTopic": "short topic", "subQueries": []}
- Complex: {"isComplex": true, "cleanTopic": "short topic", "subQueries": ["query 1", "query 2", ...]}`,
      userPrompt: `Request: "${request}"\nTopic slot: "${slots.topic || 'not set'}"`,
      jsonMode: true,
      temperature: 0.2,
      maxTokens: 300,
    });
    const parsed = await parseJsonResponse<DecomposedQuery>(raw);
    if (parsed.isComplex && Array.isArray(parsed.subQueries) && parsed.subQueries.length > 0) {
      return parsed;
    }
  } catch {
    // fallback to trivial
  }
  return trivial;
}

interface AnalystResponse {
  decision: 'SEARCH' | 'COMPLETE' | 'FAIL';
  reason: string;
  provider?: NewsProvider;
  query?: string;
  response?: string;
}

// Valid providers (excluding newsapi which only works on localhost)
// duckduckgo is a rate-limit-free fallback of last resort
const VALID_PROVIDERS: NewsProvider[] = ['newsdata', 'gnews', 'guardian', 'currents', 'mediastack', 'duckduckgo'];

// Provider info for building prompts
const PROVIDER_INFO: Record<NewsProvider, { name: string; description: string }> = {
  newsdata: { name: 'NewsData.io', description: '200/day, most reliable' },
  gnews: { name: 'GNews', description: '100/day, US-focused, simple queries only' },
  guardian: { name: 'The Guardian', description: 'Unlimited, UK/international' },
  currents: { name: 'Currents', description: '600/day, wide coverage' },
  mediastack: { name: 'Mediastack', description: '500/month, historical data' },
  newsapi: { name: 'NewsAPI', description: 'Localhost only' },
  duckduckgo: { name: 'DuckDuckGo', description: 'Unlimited, fallback when APIs are rate-limited' },
};

// Rate-limit error signals
const RATE_LIMIT_SIGNALS = ['rate limit', '429', 'quota', 'exceeded', 'too many requests', 'daily limit', 'limit reached', 'upgrade'];

function isRateLimitError(error: string): boolean {
  const lower = error.toLowerCase();
  return RATE_LIMIT_SIGNALS.some((s) => lower.includes(s));
}

function isValidProviderForList(provider: string | undefined, enabledList: NewsProvider[]): provider is NewsProvider {
  return enabledList.includes(provider as NewsProvider);
}

function getAlternateProvider(failedProvider: NewsProvider, recentlyFailedProviders: NewsProvider[], enabledList: NewsProvider[]): NewsProvider {
  // Regular providers first, duckduckgo is always last resort
  const priority: NewsProvider[] = ['newsdata', 'gnews', 'currents', 'guardian', 'mediastack'];

  for (const provider of priority) {
    if (enabledList.includes(provider) && provider !== failedProvider && !recentlyFailedProviders.includes(provider)) {
      return provider;
    }
  }

  // All regular providers exhausted → fall back to DuckDuckGo
  return 'duckduckgo';
}

export async function runAnalyst(input: AnalystInput): Promise<AnalystDecision> {
  const { taskId, request, slots, notes, summary, sources, iterationCount, maxSearches, iterationHistory, enabledProviders } = input;

  const maxIterations = maxSearches || MAX_ITERATIONS;

  function isProviderConfigured(p: NewsProvider): boolean {
    switch (p) {
      case 'newsdata':  return !!process.env.NEWSDATA_API_KEY;
      case 'gnews':     return !!process.env.GNEWS_API_KEY;
      case 'guardian':  return !!process.env.GUARDIAN_API_KEY;
      case 'currents':  return !!process.env.CURRENTS_API_KEY;
      case 'mediastack': return !!process.env.MEDIASTACK_API_KEY;
      case 'newsapi':   return !!process.env.NEWS_API_KEY;
      case 'duckduckgo': return true; // no key needed
      default:          return false;
    }
  }

  const activeProviders: NewsProvider[] = (
    enabledProviders && enabledProviders.length > 0
      ? enabledProviders.filter((p): p is NewsProvider => VALID_PROVIDERS.includes(p))
      : [...VALID_PROVIDERS]
  ).filter(isProviderConfigured);

  // Always keep duckduckgo as the unconditional last resort
  if (!activeProviders.includes('duckduckgo')) {
    activeProviders.push('duckduckgo');
  }

  // On first iteration: decompose complex queries and store sub-queries on the task
  let subQueries = input.subQueries ?? [];
  if (iterationCount === 0 && subQueries.length === 0) {
    const decomposed = await decomposeIfComplex(request, slots);
    if (decomposed.isComplex && decomposed.subQueries.length > 0) {
      subQueries = decomposed.subQueries;
      await db.collection('tasks').doc(taskId).update({ subQueries });
      console.log(`[Analyst] Decomposed complex query into ${subQueries.length} sub-queries:`, subQueries);
      await emitEvent(taskId, 'ANALYST', 'TASK_UPDATED', {
        changes: `Query decomposed into ${subQueries.length} sub-queries: ${subQueries.join(' | ')}`,
      });
    }
  }

  // Detect if ALL regular providers are rate-limited — force duckduckgo
  const rateLimitedProviders = (iterationHistory ?? [])
    .filter((h) => h.status === 'FAILED' && h.error && isRateLimitError(h.error))
    .map((h) => h.provider as NewsProvider);

  const regularProviders: NewsProvider[] = ['newsdata', 'gnews', 'guardian', 'currents', 'mediastack'];
  const availableRegular = regularProviders.filter(
    (p) => activeProviders.includes(p) && !rateLimitedProviders.includes(p)
  );
  const allRateLimited = availableRegular.length === 0 && rateLimitedProviders.length > 0;

  // Compute forceComplete BEFORE any early-return paths so they all respect the limit
  const forceComplete = iterationCount >= maxIterations;

  // Check for failed iterations
  const failedSnapshot = await db
    .collection('tasks').doc(taskId)
    .collection('searchIterations')
    .where('status', '==', 'FAILED')
    .orderBy('createdAt', 'desc')
    .limit(3)
    .get();

  const failedIterations = failedSnapshot.docs.map((d) => ({ id: d.id, ...d.data() } as {
    id: string;
    query: string;
    provider: string;
    status: string;
    error?: string;
    createdAt: FirebaseFirestore.Timestamp;
  }));

  // Only enter failure-retry path if we haven't hit the search limit
  if (failedIterations.length > 0 && !forceComplete) {
    const failedIteration = failedIterations[0];
    const errorMsg = failedIteration.error || '';
    const failedProvider = (failedIteration.provider as NewsProvider) || 'gnews';

    if (errorMsg.includes('NewsAPI') || errorMsg.includes('localhost only')) {
      const failDecision: AnalystDecision = {
        type: 'FAIL',
        reason: `Unable to search news: ${errorMsg}`,
      };

      await emitEvent(taskId, 'ANALYST', 'ANALYST_DECISION', {
        decision: 'FAIL',
        reason: failDecision.reason,
      });

      return failDecision;
    }

    const oneMinuteAgo = new Date(Date.now() - 60000);
    const recentFailures = failedIterations.filter(
      (f) => f.createdAt?.toDate() > oneMinuteAgo
    );

    if (recentFailures.length >= 3) {
      const failDecision: AnalystDecision = {
        type: 'FAIL',
        reason: `Multiple query failures: ${errorMsg}. Please try a different search or check your API configuration.`,
      };

      await emitEvent(taskId, 'ANALYST', 'ANALYST_DECISION', {
        decision: 'FAIL',
        reason: failDecision.reason,
      });

      return failDecision;
    }

    const alternateProvider = getAlternateProvider(failedProvider, recentFailures.map((f) => f.provider as NewsProvider), activeProviders);

    console.log(`[Analyst] Previous query failed on ${failedProvider}: "${failedIteration.query}" - Error: ${errorMsg}`);

    await emitEvent(taskId, 'ANALYST', 'QUERY_ERROR_RETRY', {
      failedQuery: failedIteration.query,
      failedProvider,
      suggestedProvider: alternateProvider,
      error: errorMsg,
    });

    const errorContext = `\n\n## PREVIOUS QUERY FAILED
Provider: ${failedProvider}
Query: "${failedIteration.query}"
Error: ${errorMsg}

INSTRUCTIONS FOR RETRY:
1. Choose a DIFFERENT provider (suggested: ${alternateProvider})
2. Simplify the query - remove special characters, quotes, and complex syntax
3. If the error mentions "syntax", the query format is wrong for that provider
4. If the error mentions "rate limit", switch to a different provider`;

    const userPromptWithError = buildAnalystPrompt(request, slots, notes, summary, sources, iterationCount, maxIterations, false, iterationHistory, activeProviders, subQueries) + errorContext;

    try {
      const response = await generateCompletion({
        systemPrompt: ANALYST_SYSTEM_PROMPT,
        userPrompt: userPromptWithError,
        jsonMode: true,
        temperature: 0.3,
      });

      const parsed = await parseJsonResponse<AnalystResponse>(response);

      if (parsed.decision === 'SEARCH' && parsed.query) {
        const newProvider = isValidProviderForList(parsed.provider, activeProviders) ? parsed.provider : alternateProvider;

        if (parsed.query.toLowerCase() === failedIteration.query.toLowerCase() && newProvider === failedProvider) {
          const simplifiedQuery = buildSimplifiedQuery(request, slots);

          await emitEvent(taskId, 'ANALYST', 'ANALYST_DECISION', {
            decision: 'SEARCH',
            reason: 'Auto-simplified query after repeated failure',
            query: simplifiedQuery,
            provider: alternateProvider,
          });

          return {
            type: 'SEARCH',
            query: simplifiedQuery,
            provider: alternateProvider,
            reason: 'Auto-simplified query after repeated failure',
          };
        }

        await emitEvent(taskId, 'ANALYST', 'ANALYST_DECISION', {
          decision: 'SEARCH',
          reason: parsed.reason || 'Retrying with fixed query',
          query: parsed.query,
          provider: newProvider,
        });

        return {
          type: 'SEARCH',
          query: parsed.query,
          provider: newProvider,
          reason: parsed.reason || 'Retrying with fixed query',
        };
      }
    } catch (llmError) {
      console.error('[Analyst] Failed to generate fixed query:', llmError);
    }
  }

  await emitEvent(taskId, 'ANALYST', 'ANALYST_STARTED', {
    iterationCount,
    hasNotes: !!notes,
    hasSummary: !!summary,
    sourceCount: sources.length,
  });

  // If all regular APIs are rate-limited, force-use duckduckgo immediately (unless at limit)
  if (allRateLimited && !forceComplete) {
    const ddgQuery = subQueries[iterationCount] ?? buildFallbackQuery(request, slots);
    console.log(`[Analyst] All APIs rate-limited — falling back to DuckDuckGo: "${ddgQuery}"`);
    await emitEvent(taskId, 'ANALYST', 'ANALYST_DECISION', {
      decision: 'SEARCH',
      reason: 'All news APIs rate-limited — using DuckDuckGo as unlimited fallback',
      query: ddgQuery,
      provider: 'duckduckgo',
    });
    await emitEvent(taskId, 'ANALYST', 'SEARCH_QUERY_CREATED', { query: ddgQuery, provider: 'duckduckgo' });
    return { type: 'SEARCH', query: ddgQuery, provider: 'duckduckgo', reason: 'All APIs rate-limited — DuckDuckGo fallback' };
  }

  if (forceComplete) {
    await emitEvent(taskId, 'ANALYST', 'SEARCH_LIMIT_REACHED', {
      maxSearches: maxIterations,
      iterationCount,
    });
  }

  const userPrompt = buildAnalystPrompt(request, slots, notes, summary, sources, iterationCount, maxIterations, forceComplete, iterationHistory, activeProviders, subQueries);

  try {
    const response = await generateCompletion({
      systemPrompt: ANALYST_SYSTEM_PROMPT,
      userPrompt,
      jsonMode: true,
      temperature: 0.2,
    });

    const parsed = await parseJsonResponse<AnalystResponse>(response);

    if (forceComplete && (parsed.decision === 'SEARCH' || parsed.decision === 'FAIL')) {
      console.log('[Analyst] Force completing due to search limit');

      const forceResponse = summary
        ? `Based on the available research:\n\n${summary}\n\n*Note: Research was limited to ${maxIterations} search${maxIterations > 1 ? 'es' : ''} as configured.*`
        : `Unable to find sufficient information within the search limit (${maxIterations}). Please try increasing the max searches in settings or refining your query.`;

      const forcedCitations: Citation[] = sources.slice(0, 10).map((s, idx) => ({
        number: idx + 1,
        title: s.title,
        url: s.url,
        source: s.source,
      }));

      const completeDecision: AnalystDecision = {
        type: 'COMPLETE',
        response: forceResponse,
        citations: forcedCitations,
      };

      await emitEvent(taskId, 'ANALYST', 'ANALYST_DECISION', {
        decision: 'COMPLETE',
        reason: 'Search limit reached - completing with available information',
      });

      await emitEvent(taskId, 'ANALYST', 'RESPONSE_FINALIZED', {
        response: forceResponse,
        citations: forcedCitations,
      });

      return completeDecision;
    }

    switch (parsed.decision) {
      case 'SEARCH': {
        if (!parsed.query) {
          throw new Error('SEARCH decision requires a query');
        }

        const selectedProvider = isValidProviderForList(parsed.provider, activeProviders) ? parsed.provider : activeProviders[0];

        const searchDecision: AnalystDecision = {
          type: 'SEARCH',
          query: parsed.query,
          provider: selectedProvider,
          reason: parsed.reason,
        };

        await emitEvent(taskId, 'ANALYST', 'ANALYST_DECISION', {
          decision: 'SEARCH',
          reason: parsed.reason,
          query: parsed.query,
          provider: selectedProvider,
        });

        await emitEvent(taskId, 'ANALYST', 'SEARCH_QUERY_CREATED', {
          query: parsed.query,
          provider: selectedProvider,
        });

        return searchDecision;
      }

      case 'COMPLETE': {
        if (!parsed.response) {
          throw new Error('COMPLETE decision requires a response');
        }

        const responseText = typeof parsed.response === 'string'
          ? parsed.response
          : JSON.stringify(parsed.response);

        const citationMatches = responseText.match(/\[(\d+)\]/g) || [];
        const usedNumbers = new Set(citationMatches.map(m => parseInt(m.replace(/[\[\]]/g, ''))));

        const citations: Citation[] = [];

        for (const num of usedNumbers) {
          const sourceIndex = num - 1;
          if (sourceIndex >= 0 && sourceIndex < sources.length) {
            const source = sources[sourceIndex];
            citations.push({
              number: num,
              title: source.title,
              url: source.url,
              source: source.source,
            });
          }
        }

        citations.sort((a, b) => a.number - b.number);

        if (citations.length === 0 && sources.length > 0) {
          console.log('[Analyst] No citation numbers found in response - adding top sources');
          sources.slice(0, Math.min(5, sources.length)).forEach((s, idx) => {
            citations.push({
              number: idx + 1,
              title: s.title,
              url: s.url,
              source: s.source,
            });
          });
        }

        console.log(`[Analyst] Built ${citations.length} citations from ${sources.length} real sources`);

        const completeDecision: AnalystDecision = {
          type: 'COMPLETE',
          response: responseText,
          citations,
        };

        await emitEvent(taskId, 'ANALYST', 'ANALYST_DECISION', {
          decision: 'COMPLETE',
          reason: parsed.reason,
        });

        await emitEvent(taskId, 'ANALYST', 'RESPONSE_FINALIZED', {
          response: responseText,
          citations,
        });

        return completeDecision;
      }

      case 'FAIL': {
        const failDecision: AnalystDecision = {
          type: 'FAIL',
          reason: parsed.reason,
        };

        await emitEvent(taskId, 'ANALYST', 'ANALYST_DECISION', {
          decision: 'FAIL',
          reason: parsed.reason,
        });

        return failDecision;
      }

      default:
        throw new Error(`Unknown decision: ${parsed.decision}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[Analyst] Error:', errorMessage);

    await emitEvent(taskId, 'ANALYST', 'ERROR', {
      error: 'Analyst processing failed',
      details: errorMessage,
    });

    if (iterationCount === 0 || !summary) {
      const fallbackQuery = buildFallbackQuery(request, slots);
      const fallbackProvider = activeProviders[0] || 'newsdata';

      await emitEvent(taskId, 'ANALYST', 'ANALYST_DECISION', {
        decision: 'SEARCH',
        reason: 'Recovering from error - trying simple search',
        query: fallbackQuery,
        provider: fallbackProvider,
      });

      await emitEvent(taskId, 'ANALYST', 'SEARCH_QUERY_CREATED', {
        query: fallbackQuery,
        provider: fallbackProvider,
      });

      return {
        type: 'SEARCH',
        query: fallbackQuery,
        provider: fallbackProvider,
        reason: 'Recovering from error - trying simple search',
      };
    } else {
      const fallbackResponse = `Based on available research:\n\n${summary}\n\n*Note: Research ended early due to an error.*`;
      const fallbackCitations: Citation[] = sources.slice(0, 10).map((s, idx) => ({
        number: idx + 1,
        title: s.title,
        url: s.url,
        source: s.source,
      }));

      await emitEvent(taskId, 'ANALYST', 'ANALYST_DECISION', {
        decision: 'COMPLETE',
        reason: 'Completing with available information after error',
      });

      await emitEvent(taskId, 'ANALYST', 'RESPONSE_FINALIZED', {
        response: fallbackResponse,
        citations: fallbackCitations,
      });

      return {
        type: 'COMPLETE',
        response: fallbackResponse,
        citations: fallbackCitations,
      };
    }
  }
}

function buildAnalystPrompt(
  request: string,
  slots: IntentSlots,
  notes: string | null,
  summary: string | null,
  sources: Array<{ title: string; url: string; source: string }>,
  iterationCount: number,
  maxIterations: number,
  forceComplete: boolean,
  iterationHistory?: SearchIterationHistory[],
  enabledProviders?: NewsProvider[],
  subQueries?: string[]
): string {
  let prompt = `## USER REQUEST\n${request}\n\n`;

  prompt += `## INTENT SLOTS\n`;
  prompt += `- Topic: ${slots.topic || 'Not specified'}\n`;
  if (slots.timeWindow) {
    prompt += `- Time Window: ${slots.timeWindow.start} to ${slots.timeWindow.end}\n`;
  } else {
    prompt += `- Time Window: Not specified\n`;
  }
  prompt += `- Output Type: ${slots.outputType || 'summary'}\n\n`;

  // Inject sub-queries as a guided search roadmap
  if (subQueries && subQueries.length > 0) {
    const nextSubQuery = subQueries[iterationCount] ?? null;
    prompt += `## SEARCH ROADMAP (from query decomposition)\n`;
    prompt += `This complex query was broken into ${subQueries.length} focused sub-queries:\n`;
    subQueries.forEach((q, i) => {
      const marker = i < iterationCount ? '✓' : i === iterationCount ? '→' : ' ';
      prompt += `  ${marker} ${i + 1}. "${q}"\n`;
    });
    if (nextSubQuery && iterationCount < subQueries.length) {
      prompt += `\nYour NEXT search should cover: "${nextSubQuery}"\n`;
    }
    prompt += '\n';
  }

  if (enabledProviders && enabledProviders.length > 0) {
    prompt += `## ENABLED NEWS SOURCES\n`;
    prompt += `You can ONLY use these providers:\n`;
    enabledProviders.forEach((p) => {
      const info = PROVIDER_INFO[p];
      prompt += `- ${p}: ${info.name} (${info.description})\n`;
    });
    prompt += `\nChoose the best provider for your query. If one fails, try another from this list.\n\n`;
  }

  prompt += `## CURRENT ITERATION: ${iterationCount + 1} of ${maxIterations}\n\n`;

  if (iterationHistory && iterationHistory.length > 0) {
    prompt += `## SEARCH HISTORY\n`;
    prompt += `Previous searches and their results:\n\n`;
    iterationHistory.forEach((iter, idx) => {
      prompt += `${idx + 1}. Provider: ${iter.provider} | Query: "${iter.query}"\n`;
      prompt += `   Status: ${iter.status}`;
      if (iter.status === 'DONE' && iter.resultsCount !== null) {
        prompt += ` | Found ${iter.resultsCount} articles`;
      }
      if (iter.status === 'FAILED' && iter.error) {
        prompt += ` | ERROR: ${iter.error}`;
      }
      prompt += '\n';
    });
    prompt += '\n';
    prompt += `Use this history to:\n`;
    prompt += `- Avoid repeating failed queries or providers\n`;
    prompt += `- Try different providers if one fails\n`;
    prompt += `- Adjust query syntax based on what worked\n\n`;
  }

  if (notes) {
    prompt += `## NOTES FROM ARTICLES\n${notes}\n\n`;
  } else {
    prompt += `## NOTES FROM ARTICLES\nNo notes yet - need to search for articles.\n\n`;
  }

  if (summary) {
    prompt += `## CURRENT SUMMARY\n${summary}\n\n`;
  }

  if (sources.length > 0) {
    prompt += `## SOURCES USED\n`;
    sources.forEach((s, idx) => {
      prompt += `[${idx + 1}] ${s.title} (${s.source}) - ${s.url}\n`;
    });
    prompt += '\n';
  } else {
    prompt += `## SOURCES USED\nNone yet.\n\n`;
  }

  if (forceComplete) {
    prompt += `\n## IMPORTANT: You have reached the maximum number of search iterations (${maxIterations}). You MUST return COMPLETE with the best answer possible based on the information gathered. Do NOT return SEARCH or FAIL.\n\n`;
  }

  prompt += `Based on the above, decide: SEARCH for more information, COMPLETE with a final answer, or FAIL if unable to answer after sufficient attempts.`;

  return prompt;
}

function buildFallbackQuery(request: string, slots: IntentSlots): string {
  const parts: string[] = [];

  if (slots.topic) {
    parts.push(slots.topic);
  }

  const words = request.toLowerCase().split(/\s+/);
  const skipWords = new Set(['what', 'where', 'when', 'who', 'why', 'how', 'is', 'was', 'the', 'a', 'an', 'about', 'tell', 'me']);

  for (const word of words) {
    if (!skipWords.has(word) && word.length > 3 && parts.length < 4) {
      if (!parts.some((p) => p.toLowerCase().includes(word))) {
        if (word[0] === word[0].toUpperCase()) {
          parts.push(word);
        }
      }
    }
  }

  return parts.join(' ') || request.substring(0, 50);
}

function buildSimplifiedQuery(request: string, slots: IntentSlots): string {
  if (slots.topic) {
    const cleanTopic = slots.topic
      .replace(/[^a-zA-Z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (cleanTopic.length > 2) {
      return cleanTopic;
    }
  }

  const words = request
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 3);

  const skipWords = new Set([
    'what', 'where', 'when', 'who', 'why', 'how', 'is', 'was', 'were', 'are',
    'the', 'a', 'an', 'about', 'tell', 'me', 'give', 'find', 'search', 'look',
    'news', 'article', 'articles', 'recent', 'latest', 'current', 'today',
  ]);

  const keywords = words
    .filter((w) => !skipWords.has(w.toLowerCase()))
    .slice(0, 3);

  return keywords.join(' ') || 'latest news';
}

export async function processAnalystDecision(
  taskId: string,
  decision: AnalystDecision
): Promise<void> {
  const taskRef = db.collection('tasks').doc(taskId);

  switch (decision.type) {
    case 'SEARCH': {
      await taskRef.collection('searchIterations').add({
        taskId,
        query: decision.query,
        provider: decision.provider,
        status: 'PENDING',
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      await taskRef.update({
        status: 'RESEARCHING',
        iterationCount: FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp(),
      });
      break;
    }

    case 'COMPLETE': {
      await taskRef.update({
        status: 'COMPLETED',
        response: decision.response,
        sources: decision.citations ?? [],
        updatedAt: FieldValue.serverTimestamp(),
      });
      break;
    }

    case 'FAIL': {
      await taskRef.update({
        status: 'FAILED',
        response: `Unable to complete research: ${decision.reason}`,
        updatedAt: FieldValue.serverTimestamp(),
      });
      break;
    }
  }
}
