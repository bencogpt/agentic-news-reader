import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';
import { runSummarizer } from '@/lib/agents/summarizer';

interface RunRequest {
  taskId: string;
  iterationId: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: RunRequest = await request.json();

    if (!body.taskId || !body.iterationId) {
      return NextResponse.json(
        { error: 'taskId and iterationId are required' },
        { status: 400 }
      );
    }

    const iterationDoc = await db
      .collection('tasks').doc(body.taskId)
      .collection('searchIterations').doc(body.iterationId)
      .get();

    if (!iterationDoc.exists) {
      return NextResponse.json(
        { error: 'Iteration not found' },
        { status: 404 }
      );
    }

    if (iterationDoc.data()!.status !== 'PENDING') {
      return NextResponse.json({
        message: `Iteration is in ${iterationDoc.data()!.status} state, skipping`,
        skipped: true,
      });
    }

    await runSummarizer(body.taskId, body.iterationId);

    return NextResponse.json({
      success: true,
      iterationId: body.iterationId,
    });
  } catch (error) {
    console.error('Error running summarizer:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
