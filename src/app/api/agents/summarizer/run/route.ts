import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { runSummarizer } from '@/lib/agents/summarizer';

export const maxDuration = 300; // 5 minutes max for article processing

interface RunRequest {
  iterationId: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: RunRequest = await request.json();

    if (!body.iterationId) {
      return NextResponse.json(
        { error: 'iterationId is required' },
        { status: 400 }
      );
    }

    const iteration = await prisma.searchIteration.findUnique({
      where: { id: body.iterationId },
    });

    if (!iteration) {
      return NextResponse.json(
        { error: 'Iteration not found' },
        { status: 404 }
      );
    }

    // Only run if iteration is pending
    if (iteration.status !== 'PENDING') {
      return NextResponse.json({
        message: `Iteration is in ${iteration.status} state, skipping`,
        skipped: true,
      });
    }

    await runSummarizer(body.iterationId);

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
