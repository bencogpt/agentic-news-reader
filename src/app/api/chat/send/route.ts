import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { runUFA } from '@/lib/agents/ufa';
import { runAnalyst, processAnalystDecision } from '@/lib/agents/analyst';
import { IntentSlots } from '@/lib/types';

type NewsProvider = 'gnews' | 'newsapi' | 'newsdata' | 'guardian' | 'currents' | 'mediastack' | 'duckduckgo';

const ALL_PROVIDERS: NewsProvider[] = ['newsdata', 'currents', 'gnews', 'guardian', 'mediastack', 'duckduckgo'];

interface SendRequest {
  conversationId?: string;
  message: string;
  maxSearches?: number;
  enabledProviders?: NewsProvider[];
  resultsPerSearch?: number;
}

export async function POST(request: NextRequest) {
  try {
    const body: SendRequest = await request.json();

    if (!body.message || typeof body.message !== 'string') {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      );
    }

    // Get or create conversation
    let conversationId = body.conversationId;
    if (!conversationId) {
      const convRef = await db.collection('conversations').add({
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        activeTaskId: null,
      });
      conversationId = convRef.id;
    } else {
      const convDoc = await db.collection('conversations').doc(conversationId).get();
      if (!convDoc.exists) {
        return NextResponse.json(
          { error: 'Conversation not found' },
          { status: 404 }
        );
      }
    }

    // Save user message
    await db.collection('conversations').doc(conversationId)
      .collection('messages')
      .add({
        conversationId,
        role: 'user',
        text: body.message,
        createdAt: FieldValue.serverTimestamp(),
      });

    // Get conversation history
    const historySnapshot = await db
      .collection('conversations').doc(conversationId)
      .collection('messages')
      .orderBy('createdAt', 'asc')
      .limit(20)
      .get();

    const history = historySnapshot.docs.map((d) => ({
      role: d.data().role as string,
      text: d.data().text as string,
    }));

    // Run UFA
    const ufaResult = await runUFA(
      conversationId,
      body.message,
      history
    );

    // Save assistant message
    const assistantRef = await db
      .collection('conversations').doc(conversationId)
      .collection('messages')
      .add({
        conversationId,
        role: 'assistant',
        text: ufaResult.response,
        taskId: ufaResult.taskId ?? null,
        createdAt: FieldValue.serverTimestamp(),
      });

    // Re-fetch to get resolved timestamp
    const assistantDoc = await assistantRef.get();
    const assistantData = assistantDoc.data()!;

    // Update conversation updatedAt
    await db.collection('conversations').doc(conversationId).update({
      updatedAt: FieldValue.serverTimestamp(),
    });

    // If a task was created or updated, trigger the analyst asynchronously
    if (ufaResult.taskId && (ufaResult.action.type === 'CREATE_TASK' || ufaResult.action.type === 'UPDATE_TASK')) {
      const taskDoc = await db.collection('tasks').doc(ufaResult.taskId).get();

      if (taskDoc.exists) {
        const taskStatus = taskDoc.data()!.status;
        if (taskStatus === 'ACTIVE' || taskStatus === 'WAITING_ANALYST') {
          const enabledProviders = body.enabledProviders || ALL_PROVIDERS;
          const resultsPerSearch = body.resultsPerSearch || 10;
          triggerAnalyst(ufaResult.taskId, body.maxSearches || 1, enabledProviders, 0, resultsPerSearch).catch((error) => {
            console.error('Error triggering analyst:', error);
          });
        }
      }
    }

    return NextResponse.json({
      conversationId,
      message: {
        id: assistantRef.id,
        role: 'assistant',
        text: assistantData.text,
        createdAt: assistantData.createdAt?.toDate().toISOString() ?? new Date().toISOString(),
      },
      taskId: ufaResult.taskId,
      action: ufaResult.action.type,
    });
  } catch (error) {
    console.error('Error in chat send:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

async function triggerAnalyst(
  taskId: string,
  maxSearches: number = 1,
  enabledProviders: NewsProvider[] = ALL_PROVIDERS,
  depth: number = 0,
  resultsPerSearch: number = 10
): Promise<void> {
  const MAX_DEPTH = 10;
  if (depth >= MAX_DEPTH) {
    console.error(`[triggerAnalyst] Max recursion depth (${MAX_DEPTH}) reached for task ${taskId}`);
    return;
  }

  try {
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
      subQueries?: string[];
    };

    if (task.status === 'COMPLETED' || task.status === 'FAILED') {
      console.log(`[triggerAnalyst] Task ${taskId} already ${task.status}, skipping`);
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
      maxSearches,
      iterationHistory,
      enabledProviders,
      subQueries: task.subQueries ?? [],
    });

    await processAnalystDecision(taskId, decision);

    if (decision.type === 'SEARCH') {
      // Find the latest pending iteration
      const pendingSnapshot = await db
        .collection('tasks').doc(taskId)
        .collection('searchIterations')
        .where('status', '==', 'PENDING')
        .orderBy('createdAt', 'desc')
        .limit(1)
        .get();

      if (!pendingSnapshot.empty) {
        const pendingIterationId = pendingSnapshot.docs[0].id;
        const { runSummarizer } = await import('@/lib/agents/summarizer');
        await runSummarizer(taskId, pendingIterationId, resultsPerSearch);

        const updatedTaskDoc = await db.collection('tasks').doc(taskId).get();
        if (updatedTaskDoc.exists && updatedTaskDoc.data()!.status === 'WAITING_ANALYST') {
          await triggerAnalyst(taskId, maxSearches, enabledProviders, depth + 1, resultsPerSearch);
        }
      }
    }
  } catch (error) {
    console.error(`[triggerAnalyst] Error for task ${taskId}:`, error);
    try {
      await db.collection('tasks').doc(taskId).update({
        status: 'FAILED',
        response: `Research failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    } catch {
      // Ignore update errors
    }
  }
}
