import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';
import { refreshCase } from '@/lib/agents/case-refresher';

const CRON_SECRET = process.env.CRON_SECRET;

// GET /api/cases/refresh — called by Cloud Scheduler
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const now = new Date();
    const snapshot = await db
      .collection('cases')
      .where('status', '==', 'active')
      .where('nextRefreshAt', '<=', now)
      .limit(10)
      .get();

    const results = {
      processed: 0,
      errors: [] as string[],
    };

    for (const doc of snapshot.docs) {
      try {
        await refreshCase(doc.id);
        results.processed++;
      } catch (error) {
        const msg = `Error refreshing case ${doc.id}: ${error instanceof Error ? error.message : String(error)}`;
        console.error(msg);
        results.errors.push(msg);
      }
    }

    return NextResponse.json({ success: true, ...results });
  } catch (error) {
    console.error('Error in case refresh cron:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
