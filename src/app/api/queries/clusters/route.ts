import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { db } from '@/lib/firebase-admin';
import { generateCompletion, parseJsonResponse } from '@/lib/services/llm';

function euclideanDistSq(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += (a[i] - b[i]) ** 2;
  return sum;
}

function kMeans(vectors: number[][], k: number, maxIter = 25): number[] {
  if (vectors.length <= k) return vectors.map((_, i) => i);

  // k-means++ initialization
  const centroids: number[][] = [vectors[Math.floor(Math.random() * vectors.length)]];
  for (let c = 1; c < k; c++) {
    const dists = vectors.map((v) =>
      Math.min(...centroids.map((cen) => euclideanDistSq(v, cen)))
    );
    const total = dists.reduce((a, b) => a + b, 0);
    let rand = Math.random() * total;
    let pick = 0;
    for (let i = 0; i < dists.length; i++) {
      rand -= dists[i];
      if (rand <= 0) { pick = i; break; }
    }
    centroids.push([...vectors[pick]]);
  }

  let assignments = new Array(vectors.length).fill(0);
  const dim = vectors[0].length;

  for (let iter = 0; iter < maxIter; iter++) {
    const next = vectors.map((v) => {
      let best = 0, bestDist = Infinity;
      for (let j = 0; j < k; j++) {
        const d = euclideanDistSq(v, centroids[j]);
        if (d < bestDist) { bestDist = d; best = j; }
      }
      return best;
    });

    if (next.every((a, i) => a === assignments[i])) break;
    assignments = next;

    for (let j = 0; j < k; j++) {
      const members = vectors.filter((_, i) => assignments[i] === j);
      if (!members.length) continue;
      for (let d = 0; d < dim; d++) {
        centroids[j][d] = members.reduce((s, v) => s + v[d], 0) / members.length;
      }
    }
  }

  return assignments;
}

export async function GET() {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'OPENAI_API_KEY not configured' }, { status: 500 });
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
      .filter((t) => t.query.trim().length > 0);

    if (tasks.length < 2) {
      return NextResponse.json({ clusters: [] });
    }

    const openai = new OpenAI({ apiKey });

    const embedResponse = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: tasks.map((t) => t.query),
    });
    const vectors = embedResponse.data.map((e) => e.embedding);

    const k = Math.min(Math.max(Math.round(Math.sqrt(tasks.length / 2)), 3), 8);
    const assignments = kMeans(vectors, k);

    // Group tasks by cluster
    const groups: Map<number, typeof tasks> = new Map();
    for (let i = 0; i < tasks.length; i++) {
      const c = assignments[i];
      if (!groups.has(c)) groups.set(c, []);
      groups.get(c)!.push(tasks[i]);
    }

    // Sort clusters by size, take top 8
    const sorted = [...groups.entries()]
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 8);

    // Name each cluster with LLM
    const clusterDescriptions = await generateCompletion({
      systemPrompt:
        'You are a research topic analyst. Given groups of research queries, produce a short name (2-4 words) and one-sentence description for each group. Return only JSON.',
      userPrompt: `Name these query clusters:\n\n${sorted
        .map(
          ([id, members], i) =>
            `Cluster ${i + 1}:\n${members
              .slice(0, 6)
              .map((m) => `- ${m.query}`)
              .join('\n')}`
        )
        .join('\n\n')}\n\nReturn: {"clusters": [{"name": "...", "description": "..."}, ...]} — in the same order.`,
      jsonMode: true,
      maxTokens: 800,
    });

    let namesData: { clusters: { name: string; description: string }[] } = { clusters: [] };
    try {
      namesData = await parseJsonResponse(clusterDescriptions);
    } catch {
      // fallback
    }

    const CLUSTER_COLORS = [
      'orange', 'blue', 'green', 'purple', 'rose', 'teal', 'amber', 'indigo',
    ];

    const clusters = sorted.map(([, members], i) => ({
      id: i,
      name: namesData.clusters[i]?.name ?? `Cluster ${i + 1}`,
      description: namesData.clusters[i]?.description ?? '',
      color: CLUSTER_COLORS[i % CLUSTER_COLORS.length],
      count: members.length,
      queries: members.slice(0, 8).map((m) => ({
        id: m.id,
        title: m.title,
        status: m.status,
        sources: m.sources,
        createdAt: m.createdAt,
      })),
    }));

    return NextResponse.json({ clusters, totalTasks: tasks.length, k });
  } catch (error) {
    console.error('Clusters error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
