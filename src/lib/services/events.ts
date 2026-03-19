import { db } from '../firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { AgentType, EventType } from '../types';

export async function emitEvent(
  taskId: string,
  agent: AgentType,
  type: EventType,
  payload?: Record<string, unknown>,
  iterationId?: string
): Promise<string> {
  const data: Record<string, unknown> = {
    taskId,
    agent,
    type,
    payload: payload ?? {},
    createdAt: FieldValue.serverTimestamp(),
  };

  if (iterationId) {
    data.iterationId = iterationId;
  }

  const ref = await db.collection('tasks').doc(taskId).collection('agentEvents').add(data);

  console.log(`[EVENT] ${agent} - ${type}:`, payload ? JSON.stringify(payload).substring(0, 200) : 'no payload');

  return ref.id;
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
  let query = db
    .collection('tasks')
    .doc(taskId)
    .collection('agentEvents')
    .orderBy('createdAt', 'asc');

  if (afterTimestamp) {
    query = query.where('createdAt', '>', afterTimestamp) as typeof query;
  }

  const snapshot = await query.get();

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      taskId: data.taskId,
      iterationId: data.iterationId ?? null,
      createdAt: data.createdAt?.toDate() ?? new Date(),
      agent: data.agent,
      type: data.type,
      payload: data.payload ?? {},
    };
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
  const tasksSnapshot = await db
    .collection('tasks')
    .where('conversationId', '==', conversationId)
    .get();

  const taskIds = tasksSnapshot.docs.map((d) => d.id);

  if (taskIds.length === 0) return [];

  const allEvents: Array<{
    id: string;
    taskId: string;
    iterationId: string | null;
    createdAt: Date;
    agent: string;
    type: string;
    payload: unknown;
  }> = [];

  await Promise.all(
    taskIds.map(async (tid) => {
      const events = await getEventsForTask(tid, afterTimestamp);
      allEvents.push(...events);
    })
  );

  allEvents.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  return allEvents;
}
