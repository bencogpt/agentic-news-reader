import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { runAnalyst, processAnalystDecision } from '@/lib/agents/analyst';
import { runSummarizer } from '@/lib/agents/summarizer';
import { IntentSlots } from '@/lib/types';

export const maxDuration = 300; // 5 minutes max

// Verify cron secret to prevent unauthorized access
const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(request: NextRequest) {
  // Verify authorization for cron jobs
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
    const pendingIterations = await prisma.searchIteration.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      take: 3, // Process a few at a time to stay within timeout
    });

    for (const iteration of pendingIterations) {
      try {
        await runSummarizer(iteration.id);
        results.processedIterations++;
      } catch (error) {
        const msg = `Error processing iteration ${iteration.id}: ${error instanceof Error ? error.message : String(error)}`;
        console.error(msg);
        results.errors.push(msg);
      }
    }

    // 2. Process tasks waiting for analyst
    const waitingTasks = await prisma.task.findMany({
      where: { status: 'WAITING_ANALYST' },
      orderBy: { updatedAt: 'asc' },
      take: 3,
    });

    for (const task of waitingTasks) {
      try {
        const slots = (task.context as IntentSlots) || {};
        const sources = (task.sources as Array<{ title: string; url: string; source: string }>) || [];

        const decision = await runAnalyst({
          taskId: task.id,
          request: task.currentRequest || '',
          slots,
          notes: task.notes,
          summary: task.summary,
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

    // 3. Handle stuck tasks (RESEARCHING status for too long)
    const stuckTasks = await prisma.task.findMany({
      where: {
        status: 'RESEARCHING',
        updatedAt: {
          lt: new Date(Date.now() - 10 * 60 * 1000), // More than 10 minutes old
        },
      },
    });

    for (const task of stuckTasks) {
      // Check if there are any running iterations
      const runningIterations = await prisma.searchIteration.count({
        where: { taskId: task.id, status: 'RUNNING' },
      });

      if (runningIterations === 0) {
        // Reset to WAITING_ANALYST so it can be picked up
        await prisma.task.update({
          where: { id: task.id },
          data: { status: 'WAITING_ANALYST' },
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
