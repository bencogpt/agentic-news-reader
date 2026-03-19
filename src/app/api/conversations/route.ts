import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

// Create a new conversation
export async function POST() {
  try {
    const ref = await db.collection('conversations').add({
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      activeTaskId: null,
    });

    // Re-fetch to get resolved timestamps
    const doc = await ref.get();
    const data = doc.data()!;

    return NextResponse.json({
      id: ref.id,
      createdAt: data.createdAt?.toDate().toISOString() ?? new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error creating conversation:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Get conversations list
export async function GET(request: NextRequest) {
  const limit = parseInt(request.nextUrl.searchParams.get('limit') || '10', 10);
  const offset = parseInt(request.nextUrl.searchParams.get('offset') || '0', 10);

  try {
    const snapshot = await db
      .collection('conversations')
      .orderBy('updatedAt', 'desc')
      .limit(limit + offset)
      .get();

    const docs = snapshot.docs.slice(offset);

    const conversations = await Promise.all(
      docs.map(async (doc) => {
        const data = doc.data();

        const [lastMessageSnapshot, lastTaskSnapshot] = await Promise.all([
          db.collection('conversations').doc(doc.id)
            .collection('messages')
            .orderBy('createdAt', 'desc')
            .limit(1)
            .get(),
          db.collection('tasks')
            .where('conversationId', '==', doc.id)
            .orderBy('createdAt', 'desc')
            .limit(1)
            .get(),
        ]);

        const lastMessage = lastMessageSnapshot.empty ? null : lastMessageSnapshot.docs[0].data().text;
        const lastTask = lastTaskSnapshot.empty ? null : {
          id: lastTaskSnapshot.docs[0].id,
          title: lastTaskSnapshot.docs[0].data().title ?? null,
          status: lastTaskSnapshot.docs[0].data().status,
        };

        return {
          id: doc.id,
          createdAt: data.createdAt?.toDate().toISOString() ?? new Date().toISOString(),
          updatedAt: data.updatedAt?.toDate().toISOString() ?? new Date().toISOString(),
          lastMessage,
          lastTask,
        };
      })
    );

    return NextResponse.json({ conversations });
  } catch (error) {
    console.error('Error fetching conversations:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
