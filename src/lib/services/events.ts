import { Prisma } from '@prisma/client';
import { prisma } from '../prisma';
import { AgentType, EventType } from '../types';

export async function emitEvent(
  taskId: string,
  agent: AgentType,
  type: EventType,
  payload?: Record<string, unknown>,
  iterationId?: string
): Promise<string> {
  const event = await prisma.agentEvent.create({
    data: {
      taskId,
      iterationId,
      agent,
      type,
      payload: (payload ?? {}) as Prisma.InputJsonValue,
    },
  });

  console.log(`[EVENT] ${agent} - ${type}:`, payload ? JSON.stringify(payload).substring(0, 200) : 'no payload');

  return event.id;
}

export async function getEventsForTask(
  taskId: string,
  afterTimestamp?: Date
): Promise<
  Array<{
    id: string;
    taskId: string;
    iterationId: string | null;
    createdAt: Date;
    agent: string;
    type: string;
    payload: unknown;
  }>
> {
  return prisma.agentEvent.findMany({
    where: {
      taskId,
      ...(afterTimestamp ? { createdAt: { gt: afterTimestamp } } : {}),
    },
    orderBy: { createdAt: 'asc' },
  });
}

export async function getEventsForConversation(
  conversationId: string,
  afterTimestamp?: Date
): Promise<
  Array<{
    id: string;
    taskId: string;
    iterationId: string | null;
    createdAt: Date;
    agent: string;
    type: string;
    payload: unknown;
  }>
> {
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
      ...(afterTimestamp ? { createdAt: { gt: afterTimestamp } } : {}),
    },
    orderBy: { createdAt: 'asc' },
  });
}
