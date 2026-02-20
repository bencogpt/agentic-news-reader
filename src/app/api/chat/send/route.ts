import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { runUFA } from '@/lib/agents/ufa';
import { runAnalyst, processAnalystDecision } from '@/lib/agents/analyst';
import { IntentSlots } from '@/lib/types';

export const maxDuration = 60; // 60 seconds max for Vercel

type NewsProvider = 'gnews' | 'newsapi' | 'newsdata' | 'guardian';

interface SendRequest {
  conversationId?: string;
  message: string;
  maxSearches?: number;
  freeTierMode?: boolean;
  provider?: NewsProvider;
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
      const conversation = await prisma.conversation.create({
        data: {},
      });
      conversationId = conversation.id;
    } else {
      // Verify conversation exists
      const conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
      });
      if (!conversation) {
        return NextResponse.json(
          { error: 'Conversation not found' },
          { status: 404 }
        );
      }
    }

    // Save user message
    await prisma.message.create({
      data: {
        conversationId,
        role: 'user',
        text: body.message,
      },
    });

    // Get conversation history for UFA context
    const history = await prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      take: 20,
    });

    // Run UFA to understand intent and potentially create/update task
    const ufaResult = await runUFA(
      conversationId,
      body.message,
      history.map((m: { role: string; text: string }) => ({ role: m.role, text: m.text }))
    );

    // Save assistant response
    const assistantMessage = await prisma.message.create({
      data: {
        conversationId,
        role: 'assistant',
        text: ufaResult.response,
        taskId: ufaResult.taskId,
      },
    });

    // If a task was created or updated, trigger the analyst
    if (ufaResult.taskId && (ufaResult.action.type === 'CREATE_TASK' || ufaResult.action.type === 'UPDATE_TASK')) {
      // Get the task
      const task = await prisma.task.findUnique({
        where: { id: ufaResult.taskId },
        include: {
          iterations: {
            orderBy: { createdAt: 'desc' },
          },
        },
      });

      if (task && (task.status === 'ACTIVE' || task.status === 'WAITING_ANALYST')) {
        // Run analyst asynchronously (don't await to return quickly)
        triggerAnalyst(task.id, body.maxSearches || 1, body.freeTierMode !== false, body.provider || 'gnews').catch((error) => {
          console.error('Error triggering analyst:', error);
        });
      }
    }

    return NextResponse.json({
      conversationId,
      message: {
        id: assistantMessage.id,
        role: assistantMessage.role,
        text: assistantMessage.text,
        createdAt: assistantMessage.createdAt.toISOString(),
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

async function triggerAnalyst(taskId: string, maxSearches: number = 1, freeTierMode: boolean = true, provider: NewsProvider = 'gnews'): Promise<void> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
  });

  if (!task) return;

  const slots = (task.context as IntentSlots) || {};
  const sources = (task.sources as Array<{ title: string; url: string; source: string }>) || [];

  // Store freeTierMode and provider in task context for the summarizer to use
  await prisma.task.update({
    where: { id: taskId },
    data: {
      context: { ...slots, freeTierMode, provider },
    },
  });

  const decision = await runAnalyst({
    taskId: task.id,
    request: task.currentRequest || '',
    slots,
    notes: task.notes,
    summary: task.summary,
    sources,
    iterationCount: task.iterationCount,
    maxSearches,
    freeTierMode,
  });

  await processAnalystDecision(taskId, decision);

  // If analyst decided to search, the summarizer will be triggered by the cron
  // or we can trigger it here for faster response
  if (decision.type === 'SEARCH') {
    // Get the latest pending iteration
    const pendingIteration = await prisma.searchIteration.findFirst({
      where: { taskId, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
    });

    if (pendingIteration) {
      // Import and run summarizer
      const { runSummarizer } = await import('@/lib/agents/summarizer');
      try {
        await runSummarizer(pendingIteration.id);

        // After summarizer completes, check if we need another analyst pass
        const updatedTask = await prisma.task.findUnique({
          where: { id: taskId },
        });

        if (updatedTask && updatedTask.status === 'WAITING_ANALYST') {
          await triggerAnalyst(taskId, maxSearches, freeTierMode, provider);
        }
      } catch (error) {
        console.error('Error in summarizer:', error);
      }
    }
  }
}
