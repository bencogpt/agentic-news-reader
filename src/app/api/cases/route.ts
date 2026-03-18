import { NextRequest, NextResponse } from 'next/server';
import { db, admin } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { IntentSlots, Citation, TimelineEntry } from '@/lib/types';
import { v4 as uuidv4 } from 'uuid';

// POST /api/cases — pin a completed task as a Case
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { taskId } = body as { taskId: string };

    if (!taskId) {
      return NextResponse.json({ error: 'taskId is required' }, { status: 400 });
    }

    // Get userId from Authorization header (Firebase ID token)
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const idToken = authHeader.slice(7);

    let uid: string;
    try {
      const decoded = await admin.auth().verifyIdToken(idToken);
      uid = decoded.uid;
    } catch {
      return NextResponse.json({ error: 'Invalid auth token' }, { status: 401 });
    }

    // Fetch the task
    const taskDoc = await db.collection('tasks').doc(taskId).get();
    if (!taskDoc.exists) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    const task = taskDoc.data()!;
    if (task.status !== 'COMPLETED') {
      return NextResponse.json({ error: 'Task must be COMPLETED to pin as a Case' }, { status: 400 });
    }

    const slots = (task.context as IntentSlots) || {};
    const now = new Date().toISOString();
    const nextRefresh = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    // Build initial timeline from task notes (empty for now — refresher will populate)
    const timeline: TimelineEntry[] = [];

    const sources = (task.sources as Citation[]) || [];
    const knownUrls = sources.map((s) => s.url).filter(Boolean);

    const caseData = {
      userId: uid,
      title: task.title || task.currentRequest || 'Untitled Case',
      query: task.currentRequest || '',
      slots,
      status: 'active',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      lastRefreshedAt: FieldValue.serverTimestamp(),
      nextRefreshAt: admin.firestore.Timestamp.fromDate(new Date(nextRefresh)),
      refreshIntervalHours: 1,
      summary: task.summary || task.response || '',
      timeline,
      knownArticleUrls: knownUrls,
      sources,
      originalTaskId: taskId,
    };

    const caseRef = await db.collection('cases').add(caseData);

    return NextResponse.json({
      id: caseRef.id,
      title: caseData.title,
      createdAt: now,
    });
  } catch (error) {
    console.error('Error creating case:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

// GET /api/cases?userId=<uid>
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const idToken = authHeader.slice(7);

    let uid: string;
    try {
      const decoded = await admin.auth().verifyIdToken(idToken);
      uid = decoded.uid;
    } catch {
      return NextResponse.json({ error: 'Invalid auth token' }, { status: 401 });
    }

    const snapshot = await db
      .collection('cases')
      .where('userId', '==', uid)
      .orderBy('updatedAt', 'desc')
      .limit(50)
      .get();

    const cases = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        userId: data.userId,
        title: data.title,
        query: data.query,
        status: data.status,
        createdAt: data.createdAt?.toDate?.()?.toISOString() ?? null,
        updatedAt: data.updatedAt?.toDate?.()?.toISOString() ?? null,
        lastRefreshedAt: data.lastRefreshedAt?.toDate?.()?.toISOString() ?? null,
        nextRefreshAt: data.nextRefreshAt?.toDate?.()?.toISOString() ?? null,
        refreshIntervalHours: data.refreshIntervalHours ?? 1,
        summary: data.summary ?? '',
        sourceCount: (data.sources ?? []).length,
        timelineCount: (data.timeline ?? []).length,
      };
    });

    return NextResponse.json({ cases });
  } catch (error) {
    console.error('Error fetching cases:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
