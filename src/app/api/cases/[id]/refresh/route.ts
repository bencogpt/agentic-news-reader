import { NextRequest, NextResponse } from 'next/server';
import { db, admin } from '@/lib/firebase-admin';
import { refreshCase } from '@/lib/agents/case-refresher';

type RouteParams = { params: Promise<{ id: string }> };

// POST /api/cases/[id]/refresh — manual refresh button
export async function POST(request: NextRequest, { params }: RouteParams) {
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

    await refreshCase(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(`Error manually refreshing case:`, error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
