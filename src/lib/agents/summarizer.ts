import { prisma } from '../prisma';
import { searchNews } from '../services/news';
import { extractArticle } from '../services/article-extractor';
import { generateCompletion, parseJsonResponse } from '../services/llm';
import { emitEvent } from '../services/events';
import { ArticleMeta, ArticleNotes, IntentSlots } from '../types';

const NOTES_SYSTEM_PROMPT = `You are a news article analyst. Your job is to extract structured notes from news articles.

For each article, extract:
1. What happened: Key events described in the article
2. Who involved: Names of people, organizations, countries mentioned
3. Where: Locations mentioned
4. When: Dates and times mentioned
5. Key facts: Important factual statements that can be verified
6. Uncertainties: Things that are alleged, disputed, or unconfirmed

Be precise and factual. Include direct quotes when relevant.
Do not add speculation or interpretation.

Respond with a JSON object:
{
  "whatHappened": ["event 1", "event 2"],
  "whoInvolved": ["person 1", "organization 1"],
  "where": ["location 1"],
  "when": ["date/time 1"],
  "keyFacts": ["fact 1", "fact 2"],
  "uncertainties": ["uncertain claim 1"]
}`;

const SUMMARY_SYSTEM_PROMPT = `You are a news summarizer. Your job is to synthesize notes from multiple news articles into a coherent summary.

Given notes from several articles, create a summary that:
1. Answers the user's original question
2. Presents information chronologically when relevant
3. Notes consensus across sources
4. Highlights any contradictions or uncertainties
5. Is factual and avoids speculation

The summary should be comprehensive but concise, typically 2-4 paragraphs.`;

interface NotesResponse {
  whatHappened: string[];
  whoInvolved: string[];
  where: string[];
  when: string[];
  keyFacts: string[];
  uncertainties: string[];
}

export async function runSummarizer(iterationId: string): Promise<void> {
  // Get the iteration with task context
  const iteration = await prisma.searchIteration.findUnique({
    where: { id: iterationId },
    include: {
      task: true,
    },
  });

  if (!iteration) {
    throw new Error(`Iteration ${iterationId} not found`);
  }

  const task = iteration.task;
  type NewsProvider = 'gnews' | 'newsapi' | 'newsdata' | 'guardian';
  const context = (task.context as IntentSlots & { freeTierMode?: boolean; provider?: NewsProvider }) || {};
  const slots: IntentSlots = {
    topic: context.topic,
    timeWindow: context.timeWindow,
    outputType: context.outputType,
  };
  const freeTierMode = context.freeTierMode !== false; // Default to true
  const provider: NewsProvider = context.provider || 'gnews';

  try {
    // Update iteration status
    await prisma.searchIteration.update({
      where: { id: iterationId },
      data: { status: 'RUNNING' },
    });

    // Emit search started event
    await emitEvent(task.id, 'SUMMARIZER', 'SEARCH_STARTED', {
      query: iteration.query,
    }, iterationId);

    // Search for articles - fetch many sources for comprehensive research
    const searchResult = await searchNews({
      query: iteration.query,
      from: slots.timeWindow?.start,
      to: slots.timeWindow?.end,
      pageSize: 30,
      freeTierMode,
      provider,
    });
    const articles = searchResult.articles;

    // Emit search results event with request URL for debugging
    await emitEvent(task.id, 'SUMMARIZER', 'SEARCH_RESULTS', {
      count: articles.length,
      requestUrl: searchResult.requestUrl,
      dateRange: searchResult.dateRange,
      articles: articles.map((a) => ({
        title: a.title,
        source: a.source,
        url: a.url,
      })),
    }, iterationId);

    // Update iteration with results count
    await prisma.searchIteration.update({
      where: { id: iterationId },
      data: {
        resultsCount: articles.length,
        selectedArticles: articles as object[],
      },
    });

    if (articles.length === 0) {
      // No articles found
      await prisma.searchIteration.update({
        where: { id: iterationId },
        data: {
          status: 'DONE',
          error: 'No articles found for query',
        },
      });

      await prisma.task.update({
        where: { id: task.id },
        data: { status: 'WAITING_ANALYST' },
      });

      return;
    }

    // Process articles in parallel batches for speed
    const BATCH_SIZE = 5; // Process 5 articles concurrently
    const allNotes: ArticleNotes[] = [];
    const successfulSources: Array<{ title: string; url: string; source: string }> = [];

    // Helper to process a single article
    const processArticle = async (article: ArticleMeta): Promise<{ notes: ArticleNotes; source: { title: string; url: string; source: string } } | null> => {
      try {
        // Emit article reading started
        await emitEvent(task.id, 'SUMMARIZER', 'ARTICLE_READING_STARTED', {
          articleUrl: article.url,
          articleTitle: article.title,
        }, iterationId);

        // Extract article content
        const extracted = await extractArticle(article);

        if (!extracted) {
          console.log(`Skipping article "${article.title}" - could not extract content`);
          return null;
        }

        // Generate notes from the article
        const notes = await generateArticleNotes(article, extracted.content);

        // Emit article reading done
        await emitEvent(task.id, 'SUMMARIZER', 'ARTICLE_READING_DONE', {
          articleUrl: article.url,
          articleTitle: article.title,
        }, iterationId);

        // Emit notes updated
        await emitEvent(task.id, 'SUMMARIZER', 'NOTES_UPDATED', {
          articleTitle: article.title,
          notes: notes,
        }, iterationId);

        return {
          notes: {
            articleUrl: article.url,
            articleTitle: article.title,
            notes,
          },
          source: {
            title: article.title,
            url: article.url,
            source: article.source,
          },
        };
      } catch (error) {
        console.error(`Error processing article "${article.title}":`, error);
        return null;
      }
    };

    // Process in batches
    for (let i = 0; i < articles.length; i += BATCH_SIZE) {
      const batch = articles.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(batch.map(processArticle));

      for (const result of results) {
        if (result.status === 'fulfilled' && result.value) {
          allNotes.push(result.value.notes);
          successfulSources.push(result.value.source);
        }
      }
    }

    console.log(`[Summarizer] Processed ${successfulSources.length}/${articles.length} articles successfully`);

    // Combine notes with existing task notes
    const existingNotes = task.notes || '';
    const newNotesText = formatNotes(allNotes);
    const combinedNotes = existingNotes
      ? `${existingNotes}\n\n---\n\n${newNotesText}`
      : newNotesText;

    // Combine sources
    const existingSources = (task.sources as Array<{ title: string; url: string; source: string }>) || [];
    const combinedSources = [...existingSources, ...successfulSources];

    // Generate updated summary
    const summary = await generateSummary(
      task.currentRequest || '',
      slots,
      combinedNotes
    );

    // Update task with notes and summary
    await prisma.task.update({
      where: { id: task.id },
      data: {
        notes: combinedNotes,
        summary,
        sources: combinedSources as object[],
        status: 'WAITING_ANALYST',
      },
    });

    // Emit summary updated
    await emitEvent(task.id, 'SUMMARIZER', 'SUMMARY_UPDATED', {
      summary,
    }, iterationId);

    // Mark iteration as done
    await prisma.searchIteration.update({
      where: { id: iterationId },
      data: { status: 'DONE' },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Mark iteration as failed
    await prisma.searchIteration.update({
      where: { id: iterationId },
      data: {
        status: 'FAILED',
        error: errorMessage,
      },
    });

    // Emit error event
    await emitEvent(task.id, 'SUMMARIZER', 'ERROR', {
      error: 'Summarizer processing failed',
      details: errorMessage,
    }, iterationId);

    // Set task back to waiting analyst so it can retry or fail
    await prisma.task.update({
      where: { id: task.id },
      data: { status: 'WAITING_ANALYST' },
    });

    throw error;
  }
}

async function generateArticleNotes(
  article: ArticleMeta,
  content: string
): Promise<NotesResponse> {
  const prompt = `Article: "${article.title}"
Source: ${article.source}
Published: ${article.publishedAt}

Content:
${content.substring(0, 8000)}

Extract structured notes from this article.`;

  const response = await generateCompletion({
    systemPrompt: NOTES_SYSTEM_PROMPT,
    userPrompt: prompt,
    jsonMode: true,
    temperature: 0.1,
  });

  return parseJsonResponse<NotesResponse>(response);
}

async function generateSummary(
  request: string,
  slots: IntentSlots,
  notes: string
): Promise<string> {
  const prompt = `User's question: ${request}

Topic: ${slots.topic || 'Not specified'}
Time period: ${slots.timeWindow ? `${slots.timeWindow.start} to ${slots.timeWindow.end}` : 'Not specified'}
Output type: ${slots.outputType || 'summary'}

Notes from articles:
${notes}

Based on these notes, create a synthesized summary that answers the user's question.`;

  return generateCompletion({
    systemPrompt: SUMMARY_SYSTEM_PROMPT,
    userPrompt: prompt,
    temperature: 0.3,
    maxTokens: 1500,
  });
}

function formatNotes(notesList: ArticleNotes[]): string {
  return notesList
    .map((item) => {
      const { articleTitle, notes } = item;
      let text = `### ${articleTitle}\n\n`;

      if (notes.whatHappened.length > 0) {
        text += `**What happened:**\n${notes.whatHappened.map((n) => `- ${n}`).join('\n')}\n\n`;
      }
      if (notes.whoInvolved.length > 0) {
        text += `**Who involved:**\n${notes.whoInvolved.map((n) => `- ${n}`).join('\n')}\n\n`;
      }
      if (notes.where.length > 0) {
        text += `**Where:**\n${notes.where.map((n) => `- ${n}`).join('\n')}\n\n`;
      }
      if (notes.when.length > 0) {
        text += `**When:**\n${notes.when.map((n) => `- ${n}`).join('\n')}\n\n`;
      }
      if (notes.keyFacts.length > 0) {
        text += `**Key facts:**\n${notes.keyFacts.map((n) => `- ${n}`).join('\n')}\n\n`;
      }
      if (notes.uncertainties.length > 0) {
        text += `**Uncertainties:**\n${notes.uncertainties.map((n) => `- ${n}`).join('\n')}\n\n`;
      }

      return text;
    })
    .join('\n---\n\n');
}

export async function processPendingIterations(): Promise<void> {
  // Find all pending iterations
  const pendingIterations = await prisma.searchIteration.findMany({
    where: { status: 'PENDING' },
    orderBy: { createdAt: 'asc' },
    take: 5, // Process up to 5 at a time
  });

  for (const iteration of pendingIterations) {
    try {
      await runSummarizer(iteration.id);
    } catch (error) {
      console.error(`Error processing iteration ${iteration.id}:`, error);
    }
  }
}
