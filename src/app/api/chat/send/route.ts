import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { runUFA } from '@/lib/agents/ufa';

type NewsProvider = 'gnews' | 'newsapi' | 'newsdata' | 'guardian' | 'currents' | 'mediastack' | 'duckduckgo';

const ALL_PROVIDERS: NewsProvider[] = ['newsdata', 'currents', 'gnews', 'guardian', 'mediastack', 'duckduckgo'];

interface SendRequest {
  conversationId?: string;
  message: string;
  maxSearches?: number;
  enabledProviders?: NewsProvider[];
  resultsPerSearch?: number;
}

export async function POST(request: NextRequest) {
  try {
    const body: SendRequest = await request.json();

    if (!body.message || typeof body.message !== 'string') {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      );
    }

    // Get or create conversation
    let conversationId = body.conversationId;
    if (!conversationId) {
      const convRef = await db.collection('conversations').add({
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        activeTaskId: null,
      });
      conversationId = convRef.id;
    } else {
      const convDoc = await db.collection('conversations').doc(conversationId).get();
      if (!convDoc.exists) {
        return NextResponse.json(
          { error: 'Conversation not found' },
          { status: 404 }
        );
      }
    }

    // Save user message
    await db.collection('conversations').doc(conversationId)
      .collection('messages')
      .add({
        conversationId,
        role: 'user',
        text: body.message,
        createdAt: FieldValue.serverTimestamp(),
      });

    // Get conversation history
    const historySnapshot = await db
      .collection('conversations').doc(conversationId)
      .collection('messages')
      .orderBy('createdAt', 'asc')
      .limit(20)
      .get();

    const history = historySnapshot.docs.map((d) => ({
      role: d.data().role as string,
      text: d.data().text as string,
    }));

    // Run UFA
    const ufaResult = await runUFA(
      conversationId,
      body.message,
      history
    );

    // Save assistant message
    const assistantRef = await db
      .collection('conversations').doc(conversationId)
      .collection('messages')
      .add({
        conversationId,
        role: 'assistant',
        text: ufaResult.response,
        taskId: ufaResult.taskId ?? null,
        createdAt: FieldValue.serverTimestamp(),
      });

    // Re-fetch to get resolved timestamp
    const assistantDoc = await assistantRef.get();
    const assistantData = assistantDoc.data()!;

    // Update conversation updatedAt
    await db.collection('conversations').doc(conversationId).update({
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Store search settings on the task so the pipeline can read them
    if (ufaResult.taskId && (ufaResult.action.type === 'CREATE_TASK' || ufaResult.action.type === 'UPDATE_TASK')) {
      await db.collection('tasks').doc(ufaResult.taskId).update({
        maxSearches: body.maxSearches || 1,
        enabledProviders: body.enabledProviders || ALL_PROVIDERS,
        resultsPerSearch: body.resultsPerSearch || 10,
      });
      // Pipeline is triggered client-side after this response is received.
      // Browser fetch is never killed by Cloud Run — unlike server-side fire-and-forget.
    }

    return NextResponse.json({
      conversationId,
      message: {
        id: assistantRef.id,
        role: 'assistant',
        text: assistantData.text,
        createdAt: assistantData.createdAt?.toDate().toISOString() ?? new Date().toISOString(),
      },
      taskId: ufaResult.taskId,
      action: ufaResult.action.type,
    });
  } catch (error) {
    console.error('Error in chat send:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
