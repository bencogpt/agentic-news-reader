import { prisma } from '../prisma';
import { generateCompletion, parseJsonResponse } from '../services/llm';
import { emitEvent } from '../services/events';
import { AnalystDecision, Citation, IntentSlots } from '../types';

const MAX_ITERATIONS = 5;

const ANALYST_SYSTEM_PROMPT = `You are an Analyst Agent for a news research system.

Your role is to evaluate if you have enough information to answer a user's research request.
You do NOT read articles directly - you evaluate the notes and summaries provided by the Summarizer.

You receive:
1. The user's research request (topic, time window, output type)
2. Notes from articles that have been read
3. Current summary of findings
4. List of sources used

Your decision framework:
1. Is the information SUFFICIENT to answer the user's question confidently?
2. Is the information from RELIABLE sources?
3. Does the information cover the TIME WINDOW requested?
4. Can you provide CITATIONS for key claims?

If information is INSUFFICIENT, generate a SEARCH query:
- Be specific and targeted
- Include relevant names, dates, locations
- Vary queries across iterations to find new information
- Consider different angles on the topic

If information is SUFFICIENT, produce the FINAL ANSWER:
- Directly answer what the user asked
- Include specific dates, names, places
- Cite sources using [1], [2], etc.
- Match the requested output type (summary, timeline, etc.)
- Be factual and avoid speculation

You MUST respond with a JSON object:
{
  "decision": "SEARCH" | "COMPLETE" | "FAIL",
  "reason": "brief explanation of your decision",
  "query": "search query (if SEARCH)",
  "response": "final answer with [1] [2] citations (if COMPLETE)",
  "citations": [
    { "number": 1, "title": "Article Title", "url": "https://...", "source": "Source Name" }
  ]
}

IMPORTANT:
- After ${MAX_ITERATIONS} unsuccessful search iterations, you MUST return FAIL
- FAIL response should explain what information is missing`;

interface AnalystInput {
  taskId: string;
  request: string;
  slots: IntentSlots;
  notes: string | null;
  summary: string | null;
  sources: Array<{ title: string; url: string; source: string }>;
  iterationCount: number;
}

interface AnalystResponse {
  decision: 'SEARCH' | 'COMPLETE' | 'FAIL';
  reason: string;
  query?: string;
  response?: string;
  citations?: Array<{ number: number; title: string; url: string; source: string }>;
}

export async function runAnalyst(input: AnalystInput): Promise<AnalystDecision> {
  const { taskId, request, slots, notes, summary, sources, iterationCount } = input;

  // Emit analyst started event
  await emitEvent(taskId, 'ANALYST', 'ANALYST_STARTED', {
    iterationCount,
    hasNotes: !!notes,
    hasSummary: !!summary,
    sourceCount: sources.length,
  });

  // Check if we've exceeded max iterations
  if (iterationCount >= MAX_ITERATIONS) {
    const failDecision: AnalystDecision = {
      type: 'FAIL',
      reason: `Research limit reached after ${MAX_ITERATIONS} search iterations. Could not gather sufficient information to answer the question confidently.`,
    };

    await emitEvent(taskId, 'ANALYST', 'ANALYST_DECISION', {
      decision: 'FAIL',
      reason: failDecision.reason,
    });

    return failDecision;
  }

  // Build prompt with current state
  const userPrompt = buildAnalystPrompt(request, slots, notes, summary, sources, iterationCount);

  try {
    const response = await generateCompletion({
      systemPrompt: ANALYST_SYSTEM_PROMPT,
      userPrompt,
      jsonMode: true,
      temperature: 0.2,
    });

    const parsed = await parseJsonResponse<AnalystResponse>(response);

    // Handle decisions
    switch (parsed.decision) {
      case 'SEARCH': {
        if (!parsed.query) {
          throw new Error('SEARCH decision requires a query');
        }

        const searchDecision: AnalystDecision = {
          type: 'SEARCH',
          query: parsed.query,
          reason: parsed.reason,
        };

        await emitEvent(taskId, 'ANALYST', 'ANALYST_DECISION', {
          decision: 'SEARCH',
          reason: parsed.reason,
          query: parsed.query,
        });

        await emitEvent(taskId, 'ANALYST', 'SEARCH_QUERY_CREATED', {
          query: parsed.query,
        });

        return searchDecision;
      }

      case 'COMPLETE': {
        if (!parsed.response) {
          throw new Error('COMPLETE decision requires a response');
        }

        const citations: Citation[] = (parsed.citations || []).map((c, idx) => ({
          number: c.number || idx + 1,
          title: c.title,
          url: c.url,
          source: c.source,
        }));

        const completeDecision: AnalystDecision = {
          type: 'COMPLETE',
          response: parsed.response,
          citations,
        };

        await emitEvent(taskId, 'ANALYST', 'ANALYST_DECISION', {
          decision: 'COMPLETE',
          reason: parsed.reason,
        });

        await emitEvent(taskId, 'ANALYST', 'RESPONSE_FINALIZED', {
          response: parsed.response,
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

    await emitEvent(taskId, 'ANALYST', 'ERROR', {
      error: 'Analyst processing failed',
      details: errorMessage,
    });

    // On first iteration error, try a simple search
    if (iterationCount === 0) {
      const fallbackQuery = buildFallbackQuery(request, slots);
      return {
        type: 'SEARCH',
        query: fallbackQuery,
        reason: 'Initial search based on request',
      };
    }

    throw error;
  }
}

function buildAnalystPrompt(
  request: string,
  slots: IntentSlots,
  notes: string | null,
  summary: string | null,
  sources: Array<{ title: string; url: string; source: string }>,
  iterationCount: number
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

  prompt += `## CURRENT ITERATION: ${iterationCount + 1} of ${MAX_ITERATIONS}\n\n`;

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

  prompt += `Based on the above, decide: SEARCH for more information, COMPLETE with a final answer, or FAIL if unable to answer after sufficient attempts.`;

  return prompt;
}

function buildFallbackQuery(request: string, slots: IntentSlots): string {
  const parts: string[] = [];

  if (slots.topic) {
    parts.push(slots.topic);
  }

  // Extract key terms from request
  const words = request.toLowerCase().split(/\s+/);
  const skipWords = new Set(['what', 'where', 'when', 'who', 'why', 'how', 'is', 'was', 'the', 'a', 'an', 'about', 'tell', 'me']);

  for (const word of words) {
    if (!skipWords.has(word) && word.length > 3 && parts.length < 4) {
      if (!parts.some((p) => p.toLowerCase().includes(word))) {
        // Capitalize proper nouns
        if (word[0] === word[0].toUpperCase()) {
          parts.push(word);
        }
      }
    }
  }

  return parts.join(' ') || request.substring(0, 50);
}

export async function processAnalystDecision(
  taskId: string,
  decision: AnalystDecision
): Promise<void> {
  switch (decision.type) {
    case 'SEARCH': {
      // Create a new search iteration
      await prisma.searchIteration.create({
        data: {
          taskId,
          query: decision.query,
          status: 'PENDING',
        },
      });

      // Update task status
      await prisma.task.update({
        where: { id: taskId },
        data: {
          status: 'RESEARCHING',
          iterationCount: { increment: 1 },
        },
      });
      break;
    }

    case 'COMPLETE': {
      // Update task with final response
      await prisma.task.update({
        where: { id: taskId },
        data: {
          status: 'COMPLETED',
          response: decision.response,
          sources: decision.citations as object[],
        },
      });
      break;
    }

    case 'FAIL': {
      // Mark task as failed
      await prisma.task.update({
        where: { id: taskId },
        data: {
          status: 'FAILED',
          response: `Unable to complete research: ${decision.reason}`,
        },
      });
      break;
    }
  }
}
