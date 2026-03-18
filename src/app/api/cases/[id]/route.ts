import { NextRequest, NextResponse } from 'next/server';
import { db, admin } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

type RouteParams = { params: Promise<{ id: string }> };

// GET /api/cases/[id]
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let uid: string;
    try {
      const decoded = await admin.auth().verifyIdToken(authHeader.slice(7));
      uid = decoded.uid;
    } catch {
      return NextResponse.json({ error: 'Invalid auth token' }, { status: 401 });
    }

    const doc = await db.collection('cases').doc(id).get();
    if (!doc.exists) {
      return NextResponse.json({ error: 'Case not found' }, { status: 404 });
    }

    const data = doc.data()!;
    if (data.userId !== uid) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return NextResponse.json({
      id: doc.id,
      ...data,
      createdAt: data.createdAt?.toDate?.()?.toISOString() ?? null,
      updatedAt: data.updatedAt?.toDate?.()?.toISOString() ?? null,
      lastRefreshedAt: data.lastRefreshedAt?.toDate?.()?.toISOString() ?? null,
      nextRefreshAt: data.nextRefreshAt?.toDate?.()?.toISOString() ?? null,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

// PATCH /api/cases/[id]
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let uid: string;
    try {
      const decoded = await admin.auth().verifyIdToken(authHeader.slice(7));
      uid = decoded.uid;
    } catch {
      return NextResponse.json({ error: 'Invalid auth token' }, { status: 401 });
    }

    const doc = await db.collection('cases').doc(id).get();
    if (!doc.exists) return NextResponse.json({ error: 'Case not found' }, { status: 404 });
    if (doc.data()!.userId !== uid) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const body = await request.json();
    const allowed: Record<string, unknown> = {};
    if (typeof body.refreshIntervalHours === 'number') allowed.refreshIntervalHours = body.refreshIntervalHours;
    if (body.status === 'active' || body.status === 'archived') allowed.status = body.status;

    await db.collection('cases').doc(id).update({ ...allowed, updatedAt: FieldValue.serverTimestamp() });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

// DELETE /api/cases/[id]
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let uid: string;
    try {
      const decoded = await admin.auth().verifyIdToken(authHeader.slice(7));
      uid = decoded.uid;
    } catch {
      return NextResponse.json({ error: 'Invalid auth token' }, { status: 401 });
    }

    const doc = await db.collection('cases').doc(id).get();
    if (!doc.exists) return NextResponse.json({ error: 'Case not found' }, { status: 404 });
    if (doc.data()!.userId !== uid) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    await db.collection('cases').doc(id).delete();
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
