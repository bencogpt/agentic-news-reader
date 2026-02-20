import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// Create a new conversation
export async function POST() {
  try {
    const conversation = await prisma.conversation.create({
      data: {},
    });

    return NextResponse.json({
      id: conversation.id,
      createdAt: conversation.createdAt.toISOString(),
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
    const conversations = await prisma.conversation.findMany({
      orderBy: { updatedAt: 'desc' },
      take: limit,
      skip: offset,
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        tasks: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            id: true,
            title: true,
            status: true,
          },
        },
      },
    });

    return NextResponse.json({
      conversations: conversations.map((c: { id: string; createdAt: Date; updatedAt: Date; messages: Array<{ text: string }>; tasks: Array<{ id: string; title: string | null; status: string }> }) => ({
        id: c.id,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
        lastMessage: c.messages[0]?.text || null,
        lastTask: c.tasks[0] || null,
      })),
    });
  } catch (error) {
    console.error('Error fetching conversations:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
