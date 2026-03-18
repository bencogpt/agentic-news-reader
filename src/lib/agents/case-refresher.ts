import { db, admin } from '../firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { searchNews } from '../services/news';
import { extractArticle } from '../services/article-extractor';
import { generateCompletion, parseJsonResponse } from '../services/llm';
import { Case, Citation, TimelineEntry, ArticleMeta, ArticleNotes } from '../types';
import { v4 as uuidv4 } from 'uuid';

const TIMELINE_EXTRACTOR_SYSTEM_PROMPT = `You are a timeline extractor. Given notes from new news articles and an existing timeline, extract discrete dated facts that are NOT already covered by the existing timeline.

Each fact must:
- Have a specific date (YYYY-MM-DD format)
- Be a single sentence describing one concrete event or development
- Reference the source by index number from the provided sources list

Return ONLY a JSON object:
{
  "entries": [
    { "date": "YYYY-MM-DD", "fact": "one sentence description", "sourceIndices": [0, 1] }
  ]
}

If no new facts are found, return { "entries": [] }`;

const NOTES_SYSTEM_PROMPT = `You are a news article analyst. Extract structured notes from news articles.

For each article extract:
1. What happened: Key events
2. Who involved: People, organizations, countries
3. Where: Locations
4. When: Dates and times
5. Key facts: Important factual statements
6. Uncertainties: Things alleged, disputed, or unconfirmed

Respond with JSON:
{
  "whatHappened": ["event 1"],
  "whoInvolved": ["person 1"],
  "where": ["location 1"],
  "when": ["date 1"],
  "keyFacts": ["fact 1"],
  "uncertainties": ["claim 1"]
}`;

interface NotesResponse {
  whatHappened: string[];
  whoInvolved: string[];
  where: string[];
  when: string[];
  keyFacts: string[];
  uncertainties: string[];
}

interface TimelineExtractorResponse {
  entries: Array<{ date: string; fact: string; sourceIndices: number[] }>;
}

async function generateArticleNotes(article: ArticleMeta, content: string): Promise<NotesResponse> {
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

function formatNotesAsText(article: ArticleMeta, notes: NotesResponse): string {
  const lines: string[] = [`### ${article.title}\nSource: ${article.source}\n`];
  if (notes.whatHappened.length) lines.push(`**What happened:**\n${notes.whatHappened.map(n => `- ${n}`).join('\n')}`);
  if (notes.keyFacts.length) lines.push(`**Key facts:**\n${notes.keyFacts.map(n => `- ${n}`).join('\n')}`);
  if (notes.when.length) lines.push(`**When:**\n${notes.when.map(n => `- ${n}`).join('\n')}`);
  return lines.join('\n\n');
}

export async function refreshCase(caseId: string): Promise<void> {
  // 1. Load case from Firestore
  const caseDoc = await db.collection('cases').doc(caseId).get();
  if (!caseDoc.exists) throw new Error(`Case ${caseId} not found`);

  const rawData = caseDoc.data()!;
  const caseData = { id: caseDoc.id, ...rawData } as Case;

  // 2. Build focused search query via LLM
  const lastEntries = (caseData.timeline ?? []).slice(-5);
  const lastEntriesText = lastEntries.map(e => `${e.date}: ${e.fact}`).join('\n');

  const searchQueryPrompt = `Given the research topic "${caseData.query}" and these recent timeline entries:
${lastEntriesText || '(none yet)'}

Write one short, focused search query to find NEW developments on this topic. Return only the search query string, nothing else.`;

  const focusedQuery = await generateCompletion({
    systemPrompt: 'You generate search queries for news research. Respond with only the search query, no explanation.',
    userPrompt: searchQueryPrompt,
    temperature: 0.3,
    maxTokens: 100,
  });

  const query = focusedQuery.trim().replace(/^["']|["']$/g, '');

  // 3. Search for new articles
  // lastRefreshedAt may be a Firestore Timestamp or ISO string
  const rawRefreshedAt = rawData.lastRefreshedAt;
  const fromDate = rawRefreshedAt
    ? (typeof rawRefreshedAt.toDate === 'function'
        ? rawRefreshedAt.toDate().toISOString().split('T')[0]
        : String(rawRefreshedAt).split('T')[0])
    : undefined;

  const searchResult = await searchNews({
    query,
    from: fromDate,
    pageSize: 10,
    provider: 'newsdata',
  });

  const knownUrls = new Set(caseData.knownArticleUrls ?? []);

  // 4. Filter out already-known articles
  const newArticles = searchResult.articles.filter(a => !knownUrls.has(a.url));

  const now = new Date();
  const nextRefreshAt = new Date(now.getTime() + (caseData.refreshIntervalHours ?? 1) * 60 * 60 * 1000);

  // 5. No new articles — just update timestamps
  if (newArticles.length === 0) {
    await db.collection('cases').doc(caseId).update({
      lastRefreshedAt: FieldValue.serverTimestamp(),
      nextRefreshAt: admin.firestore.Timestamp.fromDate(nextRefreshAt),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return;
  }

  // 6. Process new articles: extract content and generate notes
  const BATCH_SIZE = 5;
  const processedArticles: Array<{ article: ArticleMeta; notes: NotesResponse }> = [];
  const newSources: Citation[] = [];

  const processArticle = async (article: ArticleMeta) => {
    try {
      const extracted = await extractArticle(article);
      if (!extracted) return;
      const notes = await generateArticleNotes(article, extracted.content);
      processedArticles.push({ article, notes });
      newSources.push({
        number: (caseData.sources?.length ?? 0) + processedArticles.length,
        title: article.title,
        url: article.url,
        source: article.source,
      });
    } catch (err) {
      console.error(`[CaseRefresher] Error processing "${article.title}":`, err);
    }
  };

  for (let i = 0; i < newArticles.length; i += BATCH_SIZE) {
    const batch = newArticles.slice(i, i + BATCH_SIZE);
    await Promise.allSettled(batch.map(processArticle));
  }

  if (processedArticles.length === 0) {
    await db.collection('cases').doc(caseId).update({
      lastRefreshedAt: FieldValue.serverTimestamp(),
      nextRefreshAt: admin.firestore.Timestamp.fromDate(nextRefreshAt),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return;
  }

  // 7. Run TIMELINE_EXTRACTOR_PROMPT against new notes + existing timeline
  const existingTimeline = caseData.timeline ?? [];
  const existingTimelineText = existingTimeline.slice(-10).map(e => `${e.date}: ${e.fact}`).join('\n');
  const newNotesText = processedArticles.map((p, i) =>
    `[Source ${i}] ${formatNotesAsText(p.article, p.notes)}`
  ).join('\n\n---\n\n');

  const timelinePrompt = `Existing timeline entries (do NOT repeat these):
${existingTimelineText || '(none)'}

New article notes:
${newNotesText}

Sources list:
${processedArticles.map((p, i) => `[${i}] ${p.article.title} (${p.article.source})`).join('\n')}

Extract new timeline entries not already in the existing timeline.`;

  let newEntries: TimelineEntry[] = [];
  try {
    const timelineResponse = await generateCompletion({
      systemPrompt: TIMELINE_EXTRACTOR_SYSTEM_PROMPT,
      userPrompt: timelinePrompt,
      jsonMode: true,
      temperature: 0.1,
      maxTokens: 2000,
    });

    const parsed = await parseJsonResponse<TimelineExtractorResponse>(timelineResponse);
    const addedAt = new Date().toISOString();

    newEntries = (parsed.entries ?? []).map(entry => ({
      id: uuidv4(),
      date: entry.date,
      fact: entry.fact,
      sources: (entry.sourceIndices ?? []).map(idx => newSources[idx]).filter(Boolean),
      addedAt,
    }));
  } catch (err) {
    console.error('[CaseRefresher] Timeline extraction failed:', err);
  }

  // 8. Merge new entries into timeline sorted by date
  const mergedTimeline = [...existingTimeline, ...newEntries].sort((a, b) =>
    a.date.localeCompare(b.date)
  );

  // 9. Re-generate summary
  let updatedSummary = caseData.summary ?? '';
  if (newNotesText) {
    const summaryPrompt = `Existing summary:
${updatedSummary}

New article notes:
${newNotesText}

Update the summary to incorporate the new information. Keep it concise (2-4 paragraphs).`;

    try {
      updatedSummary = await generateCompletion({
        systemPrompt: 'You update research summaries with new information. Be factual and concise.',
        userPrompt: summaryPrompt,
        temperature: 0.3,
        maxTokens: 1500,
      });
    } catch (err) {
      console.error('[CaseRefresher] Summary update failed:', err);
    }
  }

  // 10-12. Write back to Firestore
  const updatedKnownUrls = [...(caseData.knownArticleUrls ?? []), ...newArticles.map(a => a.url)];
  const updatedSources = [...(caseData.sources ?? []), ...newSources];

  await db.collection('cases').doc(caseId).update({
    timeline: mergedTimeline,
    summary: updatedSummary,
    knownArticleUrls: updatedKnownUrls,
    sources: updatedSources,
    lastRefreshedAt: FieldValue.serverTimestamp(),
    nextRefreshAt: admin.firestore.Timestamp.fromDate(nextRefreshAt),
    updatedAt: FieldValue.serverTimestamp(),
  });
}
