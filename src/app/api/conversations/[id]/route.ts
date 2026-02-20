import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// Get a specific conversation with messages and tasks
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;

  try {
    const conversation = await prisma.conversation.findUnique({
      where: { id },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
        },
        tasks: {
          orderBy: { createdAt: 'desc' },
          include: {
            iterations: {
              orderBy: { createdAt: 'desc' },
              take: 5,
            },
          },
        },
      },
    });

    if (!conversation) {
      return NextResponse.json(
        { error: 'Conversation not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      id: conversation.id,
      createdAt: conversation.createdAt.toISOString(),
      updatedAt: conversation.updatedAt.toISOString(),
      activeTaskId: conversation.activeTaskId,
      messages: conversation.messages.map((m: { id: string; role: string; text: string; createdAt: Date; taskId: string | null }) => ({
        id: m.id,
        role: m.role,
        text: m.text,
        createdAt: m.createdAt.toISOString(),
        taskId: m.taskId,
      })),
      tasks: conversation.tasks.map((t: { id: string; status: string; title: string | null; currentRequest: string | null; summary: string | null; response: string | null; sources: unknown; iterationCount: number; createdAt: Date; iterations: Array<{ id: string; status: string; query: string; resultsCount: number | null; createdAt: Date }> }) => ({
        id: t.id,
        status: t.status,
        title: t.title,
        currentRequest: t.currentRequest,
        summary: t.summary,
        response: t.response,
        sources: t.sources,
        iterationCount: t.iterationCount,
        createdAt: t.createdAt.toISOString(),
        iterations: t.iterations.map((i: { id: string; status: string; query: string; resultsCount: number | null; createdAt: Date }) => ({
          id: i.id,
          status: i.status,
          query: i.query,
          resultsCount: i.resultsCount,
          createdAt: i.createdAt.toISOString(),
        })),
      })),
    });
  } catch (error) {
    console.error('Error fetching conversation:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Delete a conversation
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;

  try {
    await prisma.conversation.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting conversation:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
