import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { runAnalyst, processAnalystDecision } from '@/lib/agents/analyst';
import { runSummarizer } from '@/lib/agents/summarizer';
import { IntentSlots, NewsProvider } from '@/lib/types';

// Verify cron secret to prevent unauthorized access
const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const results = {
      processedIterations: 0,
      processedTasks: 0,
      errors: [] as string[],
    };

    // 1. Process pending search iterations (summarizer)
    const pendingIterSnapshot = await db
      .collectionGroup('searchIterations')
      .where('status', '==', 'PENDING')
      .orderBy('createdAt', 'asc')
      .limit(1)
      .get();

    for (const iterDoc of pendingIterSnapshot.docs) {
      const data = iterDoc.data();
      const iterTaskId = data.taskId as string;
      try {
        // Read resultsPerSearch from the task document
        const iterTaskDoc = await db.collection('tasks').doc(iterTaskId).get();
        const resultsPerSearch = (iterTaskDoc.data()?.resultsPerSearch as number) || 10;
        await runSummarizer(iterTaskId, iterDoc.id, resultsPerSearch);
        results.processedIterations++;
      } catch (error) {
        const msg = `Error processing iteration ${iterDoc.id}: ${error instanceof Error ? error.message : String(error)}`;
        console.error(msg);
        results.errors.push(msg);
      }
    }

    // 2. Process tasks waiting for analyst
    const waitingSnapshot = await db
      .collection('tasks')
      .where('status', 'in', ['WAITING_ANALYST', 'ACTIVE'])
      .orderBy('updatedAt', 'asc')
      .limit(3)
      .get();

    for (const taskDoc of waitingSnapshot.docs) {
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
      };

      try {
        const slots = (task.context as IntentSlots) || {};
        const sources = (task.sources as Array<{ title: string; url: string; source: string }>) || [];

        // Fetch iteration history from subcollection
        const iterSnapshot = await db
          .collection('tasks').doc(task.id)
          .collection('searchIterations')
          .orderBy('createdAt', 'asc')
          .get();

        const iterationHistory = iterSnapshot.docs.map((d) => {
          const d2 = d.data();
          return {
            query: d2.query as string,
            provider: d2.provider as string,
            status: d2.status as string,
            resultsCount: d2.resultsCount ?? null,
            error: d2.error ?? null,
          };
        });

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

        await processAnalystDecision(task.id, decision);
        results.processedTasks++;
      } catch (error) {
        const msg = `Error processing task ${task.id} (status=${task.status}): ${error instanceof Error ? error.message : String(error)}`;
        console.error(msg);
        results.errors.push(msg);
        // Mark task as failed so it doesn't loop forever
        try {
          await db.collection('tasks').doc(task.id).update({
            status: 'FAILED',
            response: `Research failed: ${error instanceof Error ? error.message : String(error)}`,
            updatedAt: FieldValue.serverTimestamp(),
          });
        } catch { /* ignore */ }
      }
    }

    // 3. Handle stuck RUNNING iterations (running for more than 3 minutes)
    const threeMinutesAgo = new Date(Date.now() - 3 * 60 * 1000);
    const stuckIterSnapshot = await db
      .collectionGroup('searchIterations')
      .where('status', '==', 'RUNNING')
      .where('updatedAt', '<', threeMinutesAgo)
      .get();

    for (const iterDoc of stuckIterSnapshot.docs) {
      const iterData = iterDoc.data();
      const stuckTaskId = iterData.taskId as string;
      try {
        await iterDoc.ref.update({
          status: 'FAILED',
          error: 'Iteration timed out (exceeded 3 minutes)',
          updatedAt: FieldValue.serverTimestamp(),
        });
        await db.collection('tasks').doc(stuckTaskId).update({
          status: 'WAITING_ANALYST',
          updatedAt: FieldValue.serverTimestamp(),
        });
        console.log(`[Cron] Rescued stuck iteration ${iterDoc.id} for task ${stuckTaskId}`);
      } catch (error) {
        const msg = `Error rescuing stuck iteration ${iterDoc.id}: ${error instanceof Error ? error.message : String(error)}`;
        console.error(msg);
        results.errors.push(msg);
      }
    }

    // 5. Handle stuck tasks (RESEARCHING for more than 10 minutes)
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    const stuckSnapshot = await db
      .collection('tasks')
      .where('status', '==', 'RESEARCHING')
      .where('updatedAt', '<', tenMinutesAgo)
      .get();

    for (const taskDoc of stuckSnapshot.docs) {
      const runningSnapshot = await db
        .collection('tasks').doc(taskDoc.id)
        .collection('searchIterations')
        .where('status', '==', 'RUNNING')
        .limit(1)
        .get();

      if (runningSnapshot.empty) {
        await db.collection('tasks').doc(taskDoc.id).update({
          status: 'WAITING_ANALYST',
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
    }

    return NextResponse.json({
      success: true,
      ...results,
    });
  } catch (error) {
    console.error('Error in cron job:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
