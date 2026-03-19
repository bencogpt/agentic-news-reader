import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';
import { runAnalyst, processAnalystDecision } from '@/lib/agents/analyst';
import { IntentSlots } from '@/lib/types';

interface RunRequest {
  taskId: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: RunRequest = await request.json();

    if (!body.taskId) {
      return NextResponse.json(
        { error: 'taskId is required' },
        { status: 400 }
      );
    }

    const taskDoc = await db.collection('tasks').doc(body.taskId).get();

    if (!taskDoc.exists) {
      return NextResponse.json(
        { error: 'Task not found' },
        { status: 404 }
      );
    }

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

    if (!['ACTIVE', 'WAITING_ANALYST'].includes(task.status)) {
      return NextResponse.json({
        message: `Task is in ${task.status} state, skipping analyst run`,
        skipped: true,
      });
    }

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

    await processAnalystDecision(body.taskId, decision);

    return NextResponse.json({
      decision: decision.type,
      taskId: body.taskId,
    });
  } catch (error) {
    console.error('Error running analyst:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
