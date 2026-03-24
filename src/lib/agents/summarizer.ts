import { db } from '../firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { searchNews } from '../services/news';
import { extractArticle } from '../services/article-extractor';
import { generateCompletion, parseJsonResponse } from '../services/llm';
import { emitEvent } from '../services/events';
import { ArticleMeta, ArticleNotes, IntentSlots, NewsProvider } from '../types';

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

export async function runSummarizer(taskId: string, iterationId: string, resultsPerSearch: number = 10): Promise<void> {
  const iterationRef = db.collection('tasks').doc(taskId).collection('searchIterations').doc(iterationId);
  const iterationDoc = await iterationRef.get();

  if (!iterationDoc.exists) {
    throw new Error(`Iteration ${iterationId} not found`);
  }

  const iteration = { id: iterationDoc.id, ...iterationDoc.data() } as {
    id: string;
    taskId: string;
    query: string;
    provider: string;
    status: string;
    resultsCount?: number;
    selectedArticles?: unknown[];
    error?: string;
    createdAt: FirebaseFirestore.Timestamp;
    updatedAt: FirebaseFirestore.Timestamp;
  };

  const taskDoc = await db.collection('tasks').doc(taskId).get();
  if (!taskDoc.exists) {
    throw new Error(`Task ${taskId} not found`);
  }

  const task = { id: taskDoc.id, ...taskDoc.data() } as {
    id: string;
    conversationId: string;
    status: string;
    currentRequest?: string;
    notes?: string;
    summary?: string;
    sources?: Array<{ title: string; url: string; source: string }>;
    context?: IntentSlots;
    iterationCount: number;
  };

  const taskRef = db.collection('tasks').doc(taskId);
  const context = (task.context as IntentSlots) || {};
  const slots: IntentSlots = {
    topic: context.topic,
    timeWindow: context.timeWindow,
    outputType: context.outputType,
  };
  const provider: NewsProvider = (iteration.provider as NewsProvider) || 'newsdata';

  try {
    await iterationRef.update({ status: 'RUNNING', updatedAt: FieldValue.serverTimestamp() });

    await emitEvent(taskId, 'SUMMARIZER', 'SEARCH_STARTED', {
      query: iteration.query,
      provider,
    }, iterationId);

    const searchResult = await searchNews({
      query: iteration.query,
      from: slots.timeWindow?.start,
      to: slots.timeWindow?.end,
      pageSize: resultsPerSearch,
      provider,
    });
    const articles = searchResult.articles;

    await emitEvent(taskId, 'SUMMARIZER', 'SEARCH_RESULTS', {
      count: articles.length,
      requestUrl: searchResult.requestUrl,
      dateRange: searchResult.dateRange,
      articles: articles.map((a) => ({
        title: a.title,
        source: a.source,
        url: a.url,
      })),
    }, iterationId);

    await iterationRef.update({
      resultsCount: articles.length,
      selectedArticles: articles,
      updatedAt: FieldValue.serverTimestamp(),
    });

    if (articles.length === 0) {
      // Mark as FAILED so the analyst retries with a different provider/query
      await iterationRef.update({
        status: 'FAILED',
        error: 'No articles found for query',
        updatedAt: FieldValue.serverTimestamp(),
      });

      await taskRef.update({ status: 'WAITING_ANALYST', updatedAt: FieldValue.serverTimestamp() });
      return;
    }

    const MAX_ARTICLES = 5;
    const BATCH_SIZE = 5;
    const articlesToProcess = articles.slice(0, MAX_ARTICLES);
    const allNotes: ArticleNotes[] = [];
    const successfulSources: Array<{ title: string; url: string; source: string }> = [];

    const withTimeout = <T>(promise: Promise<T>, timeoutMs: number, articleTitle: string): Promise<T | null> => {
      return Promise.race([
        promise,
        new Promise<null>((resolve) => {
          setTimeout(() => {
            console.log(`[Summarizer] Timeout processing article "${articleTitle}" after ${timeoutMs}ms`);
            resolve(null);
          }, timeoutMs);
        }),
      ]);
    };

    const processArticle = async (article: ArticleMeta): Promise<{ notes: ArticleNotes; source: { title: string; url: string; source: string } } | null> => {
      try {
        await emitEvent(taskId, 'SUMMARIZER', 'ARTICLE_READING_STARTED', {
          articleUrl: article.url,
          articleTitle: article.title,
        }, iterationId);

        const extracted = await withTimeout(extractArticle(article), 15000, article.title);

        if (!extracted) {
          console.log(`Skipping article "${article.title}" - could not extract content or timeout`);
          return null;
        }

        const notes = await withTimeout(generateArticleNotes(article, extracted.content), 20000, article.title);

        if (!notes) {
          console.log(`Skipping article "${article.title}" - note generation timeout`);
          return null;
        }

        await emitEvent(taskId, 'SUMMARIZER', 'ARTICLE_READING_DONE', {
          articleUrl: article.url,
          articleTitle: article.title,
        }, iterationId);

        await emitEvent(taskId, 'SUMMARIZER', 'NOTES_UPDATED', {
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

    for (let i = 0; i < articlesToProcess.length; i += BATCH_SIZE) {
      const batch = articlesToProcess.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(batch.map(processArticle));

      for (const result of results) {
        if (result.status === 'fulfilled' && result.value) {
          allNotes.push(result.value.notes);
          successfulSources.push(result.value.source);
        }
      }
    }

    console.log(`[Summarizer] Processed ${successfulSources.length}/${articlesToProcess.length} articles successfully (capped at ${MAX_ARTICLES} of ${articles.length} found)`);

    await emitEvent(taskId, 'SUMMARIZER', 'ARTICLES_PROCESSED', {
      totalFound: articles.length,
      successfullyProcessed: successfulSources.length,
      articles: successfulSources.map(s => s.title),
    }, iterationId);

    const existingNotes = task.notes || '';
    const newNotesText = formatNotes(allNotes);
    const combinedNotes = existingNotes
      ? `${existingNotes}\n\n---\n\n${newNotesText}`
      : newNotesText;

    const existingSources = task.sources || [];
    const combinedSources = [...existingSources, ...successfulSources];

    const summary = await generateSummary(
      task.currentRequest || '',
      slots,
      combinedNotes
    );

    await taskRef.update({
      notes: combinedNotes,
      summary,
      sources: combinedSources,
      status: 'WAITING_ANALYST',
      updatedAt: FieldValue.serverTimestamp(),
    });

    await emitEvent(taskId, 'SUMMARIZER', 'SUMMARY_UPDATED', {
      summary,
      articlesUsed: successfulSources.map(s => s.title),
      articleCount: successfulSources.length,
    }, iterationId);

    await iterationRef.update({ status: 'DONE', updatedAt: FieldValue.serverTimestamp() });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    await iterationRef.update({
      status: 'FAILED',
      error: errorMessage,
      updatedAt: FieldValue.serverTimestamp(),
    });

    await emitEvent(taskId, 'SUMMARIZER', 'ERROR', {
      error: 'Summarizer processing failed',
      details: errorMessage,
      provider,
      query: iteration.query,
    }, iterationId);

    await taskRef.update({ status: 'WAITING_ANALYST', updatedAt: FieldValue.serverTimestamp() });

    console.error(`[Summarizer] Failed on ${provider}: ${errorMessage}`);
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
  const snapshot = await db
    .collectionGroup('searchIterations')
    .where('status', '==', 'PENDING')
    .orderBy('createdAt', 'asc')
    .limit(5)
    .get();

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const iterationTaskId = data.taskId as string;
    const iterationId = doc.id;
    try {
      await runSummarizer(iterationTaskId, iterationId);
    } catch (error) {
      console.error(`Error processing iteration ${iterationId}:`, error);
    }
  }
}
