import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { runAnalyst, processAnalystDecision } from '@/lib/agents/analyst';
import { runSummarizer } from '@/lib/agents/summarizer';
import { IntentSlots, NewsProvider } from '@/lib/types';

export async function POST(request: NextRequest) {
  let taskId: string;
  try {
    const body = await request.json();
    taskId = body.taskId;
    if (!taskId) return NextResponse.json({ error: 'taskId required' }, { status: 400 });
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  try {
    await runPipeline(taskId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(`[Pipeline] Fatal error for task ${taskId}:`, error);
    try {
      await db.collection('tasks').doc(taskId).update({
        status: 'FAILED',
        response: `Research failed: ${error instanceof Error ? error.message : String(error)}`,
        updatedAt: FieldValue.serverTimestamp(),
      });
    } catch { /* ignore */ }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

async function runPipeline(taskId: string): Promise<void> {
  const MAX_DEPTH = 10;

  for (let depth = 0; depth < MAX_DEPTH; depth++) {
    const taskDoc = await db.collection('tasks').doc(taskId).get();
    if (!taskDoc.exists) return;

    const task = { id: taskDoc.id, ...taskDoc.data() } as {
      id: string;
      status: string;
      currentRequest?: string;
      notes?: string;
      summary?: string;
      sources?: Array<{ title: string; url: string; source: string }>;
      context?: IntentSlots;
      iterationCount: number;
      maxSearches?: number;
      enabledProviders?: string[];
      subQueries?: string[];
      resultsPerSearch?: number;
    };

    if (task.status === 'COMPLETED' || task.status === 'FAILED') {
      console.log(`[Pipeline] Task ${taskId} is ${task.status}, stopping`);
      return;
    }

    // Fetch iteration history
    const iterSnapshot = await db
      .collection('tasks').doc(taskId)
      .collection('searchIterations')
      .orderBy('createdAt', 'asc')
      .get();

    const iterationHistory = iterSnapshot.docs.map((d) => {
      const data = d.data();
      return {
        query: data.query as string,
        provider: data.provider as string,
        status: data.status as string,
        resultsCount: data.resultsCount ?? null,
        error: data.error ?? null,
      };
    });

    const slots = (task.context as IntentSlots) || {};
    const sources = (task.sources as Array<{ title: string; url: string; source: string }>) || [];

    const decision = await runAnalyst({
      taskId: task.id,
      request: task.currentRequest || '',
      slots,
      notes: task.notes ?? null,
      summary: task.summary ?? null,
      sources,
      iterationCount: task.iterationCount,
      maxSearches: task.maxSearches || 1,
      enabledProviders: (task.enabledProviders ?? []) as NewsProvider[],
      iterationHistory,
      subQueries: task.subQueries ?? [],
    });

    await processAnalystDecision(taskId, decision);

    if (decision.type !== 'SEARCH') {
      // COMPLETE or FAIL — done
      return;
    }

    // Find the pending iteration just created and run the summarizer
    const pendingSnapshot = await db
      .collection('tasks').doc(taskId)
      .collection('searchIterations')
      .where('status', '==', 'PENDING')
      .orderBy('createdAt', 'desc')
      .limit(1)
      .get();

    if (pendingSnapshot.empty) return;

    const pendingIterationId = pendingSnapshot.docs[0].id;
    const resultsPerSearch = task.resultsPerSearch || 10;
    await runSummarizer(taskId, pendingIterationId, resultsPerSearch);

    // Loop back — analyst will evaluate the new notes and decide next step
  }

  console.warn(`[Pipeline] Max depth (${MAX_DEPTH}) reached for task ${taskId}`);
}
