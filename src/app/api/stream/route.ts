import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const conversationId = request.nextUrl.searchParams.get('conversationId');
  const lastEventId = request.nextUrl.searchParams.get('lastEventId');

  if (!conversationId) {
    return new Response('conversationId is required', { status: 400 });
  }

  // Verify conversation exists
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
  });

  if (!conversation) {
    return new Response('Conversation not found', { status: 404 });
  }

  // Create a readable stream for SSE
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let lastTimestamp = lastEventId
        ? new Date(lastEventId)
        : new Date(0);

      const sendEvent = (data: object) => {
        const message = `data: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(message));
      };

      const sendKeepAlive = () => {
        controller.enqueue(encoder.encode(': keepalive\n\n'));
      };

      // Initial fetch of events
      const initialEvents = await getEventsForConversation(conversationId, lastTimestamp);
      for (const event of initialEvents) {
        sendEvent({
          id: event.id,
          taskId: event.taskId,
          iterationId: event.iterationId,
          createdAt: event.createdAt.toISOString(),
          agent: event.agent,
          type: event.type,
          payload: event.payload,
        });
        lastTimestamp = event.createdAt;
      }

      // Poll for new events
      let isActive = true;
      const pollInterval = setInterval(async () => {
        if (!isActive) return;

        try {
          const newEvents = await getEventsForConversation(conversationId, lastTimestamp);

          for (const event of newEvents) {
            sendEvent({
              id: event.id,
              taskId: event.taskId,
              iterationId: event.iterationId,
              createdAt: event.createdAt.toISOString(),
              agent: event.agent,
              type: event.type,
              payload: event.payload,
            });
            lastTimestamp = event.createdAt;
          }

          // Send keep-alive if no events
          if (newEvents.length === 0) {
            sendKeepAlive();
          }
        } catch (error) {
          console.error('Error polling events:', error);
        }
      }, 1000); // Poll every second

      // Clean up when the connection closes
      request.signal.addEventListener('abort', () => {
        isActive = false;
        clearInterval(pollInterval);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    },
  });
}

async function getEventsForConversation(
  conversationId: string,
  afterTimestamp: Date
) {
  // Get all tasks for this conversation
  const tasks = await prisma.task.findMany({
    where: { conversationId },
    select: { id: true },
  });

  const taskIds = tasks.map((t: { id: string }) => t.id);

  if (taskIds.length === 0) {
    return [];
  }

  return prisma.agentEvent.findMany({
    where: {
      taskId: { in: taskIds },
      createdAt: { gt: afterTimestamp },
    },
    orderBy: { createdAt: 'asc' },
    take: 100, // Limit to prevent memory issues
  });
}
