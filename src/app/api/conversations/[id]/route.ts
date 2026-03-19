import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// Get a specific conversation with messages and tasks
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;

  try {
    const [convDoc, messagesSnapshot, tasksSnapshot] = await Promise.all([
      db.collection('conversations').doc(id).get(),
      db.collection('conversations').doc(id)
        .collection('messages')
        .orderBy('createdAt', 'asc')
        .get(),
      db.collection('tasks')
        .where('conversationId', '==', id)
        .orderBy('createdAt', 'desc')
        .get(),
    ]);

    if (!convDoc.exists) {
      return NextResponse.json(
        { error: 'Conversation not found' },
        { status: 404 }
      );
    }

    const convData = convDoc.data()!;

    // For each task, fetch latest 5 iterations
    const tasksWithIterations = await Promise.all(
      tasksSnapshot.docs.map(async (taskDoc) => {
        const tData = taskDoc.data();
        const iterSnapshot = await db
          .collection('tasks').doc(taskDoc.id)
          .collection('searchIterations')
          .orderBy('createdAt', 'desc')
          .limit(5)
          .get();

        return {
          id: taskDoc.id,
          status: tData.status,
          title: tData.title ?? null,
          currentRequest: tData.currentRequest ?? null,
          summary: tData.summary ?? null,
          response: tData.response ?? null,
          sources: tData.sources ?? null,
          iterationCount: tData.iterationCount ?? 0,
          createdAt: tData.createdAt?.toDate().toISOString() ?? new Date().toISOString(),
          iterations: iterSnapshot.docs.map((iDoc) => {
            const iData = iDoc.data();
            return {
              id: iDoc.id,
              status: iData.status,
              query: iData.query,
              resultsCount: iData.resultsCount ?? null,
              createdAt: iData.createdAt?.toDate().toISOString() ?? new Date().toISOString(),
            };
          }),
        };
      })
    );

    return NextResponse.json({
      id: convDoc.id,
      createdAt: convData.createdAt?.toDate().toISOString() ?? new Date().toISOString(),
      updatedAt: convData.updatedAt?.toDate().toISOString() ?? new Date().toISOString(),
      activeTaskId: convData.activeTaskId ?? null,
      messages: messagesSnapshot.docs.map((mDoc) => {
        const mData = mDoc.data();
        return {
          id: mDoc.id,
          role: mData.role,
          text: mData.text,
          createdAt: mData.createdAt?.toDate().toISOString() ?? new Date().toISOString(),
          taskId: mData.taskId ?? null,
        };
      }),
      tasks: tasksWithIterations,
    });
  } catch (error) {
    console.error('Error fetching conversation:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Delete a conversation and all subcollections
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;

  try {
    // Delete all tasks for this conversation (and their subcollections)
    const tasksSnapshot = await db
      .collection('tasks')
      .where('conversationId', '==', id)
      .get();

    await Promise.all(
      tasksSnapshot.docs.map((taskDoc) =>
        db.recursiveDelete(db.collection('tasks').doc(taskDoc.id))
      )
    );

    // Delete conversation and its subcollections (messages)
    await db.recursiveDelete(db.collection('conversations').doc(id));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting conversation:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
