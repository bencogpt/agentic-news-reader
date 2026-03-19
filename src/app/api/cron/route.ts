import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { runAnalyst, processAnalystDecision } from '@/lib/agents/analyst';
import { runSummarizer } from '@/lib/agents/summarizer';
import { IntentSlots } from '@/lib/types';

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
      .limit(3)
      .get();

    for (const iterDoc of pendingIterSnapshot.docs) {
      const data = iterDoc.data();
      const iterTaskId = data.taskId as string;
      try {
        await runSummarizer(iterTaskId, iterDoc.id);
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
      };

      try {
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
        });

        await processAnalystDecision(task.id, decision);
        results.processedTasks++;
      } catch (error) {
        const msg = `Error processing task ${task.id}: ${error instanceof Error ? error.message : String(error)}`;
        console.error(msg);
        results.errors.push(msg);
      }
    }

    // 3. Handle stuck tasks (RESEARCHING for more than 10 minutes)
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
