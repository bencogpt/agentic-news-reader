import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { runUFA } from '@/lib/agents/ufa';
import { decomposeIfComplex } from '@/lib/agents/analyst';
import { IntentSlots } from '@/lib/types';

type NewsProvider = 'gnews' | 'newsapi' | 'newsdata' | 'guardian' | 'currents' | 'mediastack' | 'duckduckgo';

const ALL_PROVIDERS: NewsProvider[] = ['newsdata', 'currents', 'gnews', 'guardian', 'mediastack', 'duckduckgo'];

interface SendRequest {
  conversationId?: string;
  message: string;
  maxSearches?: number;
  enabledProviders?: NewsProvider[];
  resultsPerSearch?: number;
  pendingApprovalTaskId?: string;
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

    // Determine the task to process:
    // - Normally it's the task UFA created/updated
    // - If UFA returned RESPOND (no task) but the user was refining a pending plan,
    //   update the pending task's request and use it instead.
    const ufaTaskAction = ufaResult.action.type === 'CREATE_TASK' || ufaResult.action.type === 'UPDATE_TASK';
    const effectiveTaskId: string | undefined = ufaResult.taskId
      ?? (body.pendingApprovalTaskId ?? undefined);

    if (!ufaResult.taskId && body.pendingApprovalTaskId) {
      // Refinement case: UFA didn't touch the task — update it manually.
      // Combine the original request with the user's refinement so the analyst has full context.
      const existingTaskDoc = await db.collection('tasks').doc(body.pendingApprovalTaskId).get();
      const originalRequest = (existingTaskDoc.data()?.currentRequest as string) || body.message;
      const combinedRequest = `${originalRequest}. User refinement: ${body.message}`;
      await db.collection('tasks').doc(body.pendingApprovalTaskId).update({
        currentRequest: combinedRequest,
        subQueries: [],   // clear old sub-queries; analyst will re-decompose with full context
        status: 'ACTIVE',
        maxSearches: body.maxSearches || 3,
        enabledProviders: body.enabledProviders || ALL_PROVIDERS,
        resultsPerSearch: body.resultsPerSearch || 10,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    // Store search settings on the task and check for query decomposition
    let approvalPlan: { subQueries: string[]; taskId: string } | null = null;
    if (effectiveTaskId && (ufaTaskAction || body.pendingApprovalTaskId)) {
      // Only update settings here for the normal UFA task path;
      // the refinement path already stored settings in the block above.
      if (ufaTaskAction) {
        await db.collection('tasks').doc(effectiveTaskId).update({
          maxSearches: body.maxSearches || 3,
          enabledProviders: body.enabledProviders || ALL_PROVIDERS,
          resultsPerSearch: body.resultsPerSearch || 10,
        });
      }

      // Check if the query is complex and needs decomposition approval
      const slots: IntentSlots = ufaResult.action.type === 'CREATE_TASK'
        ? (ufaResult.action.slots as IntentSlots)
        : {};
      try {
        const decomposed = await decomposeIfComplex(body.message, slots);
        console.log('[chat/send] Decomposition result:', JSON.stringify(decomposed));
        if (decomposed.isComplex && decomposed.subQueries.length > 0) {
          await db.collection('tasks').doc(effectiveTaskId).update({
            subQueries: decomposed.subQueries,
            status: 'PENDING_APPROVAL',
            updatedAt: FieldValue.serverTimestamp(),
          });
          approvalPlan = { subQueries: decomposed.subQueries, taskId: effectiveTaskId };
          console.log('[chat/send] Approval plan set:', JSON.stringify(approvalPlan));
        } else {
          console.log('[chat/send] Query classified as simple — no approval needed');
        }
      } catch (err) {
        console.error('[chat/send] Decomposition failed, proceeding without approval:', err);
      }
      // If not complex, pipeline is triggered client-side after this response is received.
    }

    return NextResponse.json({
      conversationId,
      message: {
        id: assistantRef.id,
        role: 'assistant',
        text: assistantData.text,
        createdAt: assistantData.createdAt?.toDate().toISOString() ?? new Date().toISOString(),
      },
      taskId: effectiveTaskId,
      action: ufaResult.action.type,
      approvalPlan,
    });
  } catch (error) {
    console.error('Error in chat send:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
