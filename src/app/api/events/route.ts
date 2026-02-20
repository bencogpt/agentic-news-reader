import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  const conversationId = request.nextUrl.searchParams.get('conversationId');
  const taskId = request.nextUrl.searchParams.get('taskId');
  const afterTimestamp = request.nextUrl.searchParams.get('after');

  if (!conversationId && !taskId) {
    return NextResponse.json(
      { error: 'conversationId or taskId is required' },
      { status: 400 }
    );
  }

  try {
    const afterDate = afterTimestamp ? new Date(afterTimestamp) : new Date(0);

    let events;

    if (taskId) {
      // Get events for specific task
      events = await prisma.agentEvent.findMany({
        where: {
          taskId,
          createdAt: { gt: afterDate },
        },
        orderBy: { createdAt: 'asc' },
        take: 100,
      });
    } else if (conversationId) {
      // Get events for all tasks in conversation
      const tasks = await prisma.task.findMany({
        where: { conversationId },
        select: { id: true },
      });

      const taskIds = tasks.map((t: { id: string }) => t.id);

      if (taskIds.length === 0) {
        events = [];
      } else {
        events = await prisma.agentEvent.findMany({
          where: {
            taskId: { in: taskIds },
            createdAt: { gt: afterDate },
          },
          orderBy: { createdAt: 'asc' },
          take: 100,
        });
      }
    }

    return NextResponse.json({
      events: events?.map((e: { id: string; taskId: string; iterationId: string | null; createdAt: Date; agent: string; type: string; payload: unknown }) => ({
        id: e.id,
        taskId: e.taskId,
        iterationId: e.iterationId,
        createdAt: e.createdAt.toISOString(),
        agent: e.agent,
        type: e.type,
        payload: e.payload,
      })) || [],
    });
  } catch (error) {
    console.error('Error fetching events:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
