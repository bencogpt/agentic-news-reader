import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { db } from '@/lib/firebase-admin';
import { generateCompletion, parseJsonResponse } from '@/lib/services/llm';

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  return magA && magB ? dot / (Math.sqrt(magA) * Math.sqrt(magB)) : 0;
}

export async function POST(request: NextRequest) {
  try {
    const { query } = (await request.json()) as { query: string };
    if (!query?.trim()) {
      return NextResponse.json({ error: 'query is required' }, { status: 400 });
    }

    const snapshot = await db.collection('tasks').limit(300).get();
    const tasks = snapshot.docs
      .map((doc) => ({
        id: doc.id,
        title: (doc.data().title || doc.data().currentRequest || '') as string,
        query: (doc.data().currentRequest || '') as string,
        status: (doc.data().status || '') as string,
        sources: ((doc.data().sources ?? []) as unknown[]).length,
        createdAt: doc.data().createdAt?.toDate?.()?.toISOString() ?? null,
      }))
      .filter((t) => t.query && t.query.trim() !== query.trim());

    if (tasks.length === 0) {
      return NextResponse.json({ results: [] });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'OPENAI_API_KEY not configured' }, { status: 500 });
    }
    const openai = new OpenAI({ apiKey });

    const allTexts = [query, ...tasks.map((t) => t.query)];
    const embedResponse = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: allTexts,
    });

    const queryVec = embedResponse.data[0].embedding;
    const taskVecs = embedResponse.data.slice(1).map((e) => e.embedding);

    const withSimilarity = tasks
      .map((task, i) => ({ ...task, similarity: cosineSimilarity(queryVec, taskVecs[i]) }))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 5);

    // Extract shared topics via LLM
    const raw = await generateCompletion({
      systemPrompt:
        'You are a topic extraction assistant. Given a main query and similar queries, extract 1-3 concise shared topic tags for each pair. Return only JSON.',
      userPrompt: `Main query: "${query}"\n\nSimilar queries:\n${withSimilarity.map((t, i) => `${i + 1}. "${t.query}"`).join('\n')}\n\nReturn: {"topics": [["tag1", "tag2"], ...]} — one array per similar query, in order.`,
      jsonMode: true,
      maxTokens: 512,
    });

    let topicsData: { topics: string[][] } = { topics: [] };
    try {
      topicsData = await parseJsonResponse<{ topics: string[][] }>(raw);
    } catch {
      // fall back to empty topics
    }

    const results = withSimilarity.map((task, i) => ({
      id: task.id,
      title: task.title,
      query: task.query,
      status: task.status,
      sources: task.sources,
      createdAt: task.createdAt,
      similarity: Math.round(task.similarity * 100),
      sharedTopics: topicsData.topics[i] ?? [],
    }));

    return NextResponse.json({ results });
  } catch (error) {
    console.error('Similar queries error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
