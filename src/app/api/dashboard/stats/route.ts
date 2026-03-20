import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';

export async function GET() {
  try {
    const snapshot = await db.collection('tasks').orderBy('createdAt', 'desc').limit(500).get();

    const tasks = snapshot.docs.map((doc) => {
      const data = doc.data();
      const createdAt = data.createdAt?.toDate?.() ?? null;
      const updatedAt = data.updatedAt?.toDate?.() ?? null;
      const durationMs =
        createdAt && updatedAt ? updatedAt.getTime() - createdAt.getTime() : null;
      return {
        id: doc.id,
        title: (data.title || data.currentRequest || 'Untitled') as string,
        query: (data.currentRequest || '') as string,
        status: (data.status || '') as string,
        sources: ((data.sources ?? []) as unknown[]).length,
        iterationCount: (data.iterationCount ?? 0) as number,
        createdAt: createdAt?.toISOString() ?? null,
        updatedAt: updatedAt?.toISOString() ?? null,
        durationMs,
        topic: (data.context as Record<string, unknown>)?.topic ?? null,
      };
    });

    const total = tasks.length;
    const inProgress = tasks.filter((t) =>
      ['ACTIVE', 'RESEARCHING', 'WAITING_ANALYST'].includes(t.status)
    ).length;
    const completed = tasks.filter((t) => t.status === 'COMPLETED').length;
    const failed = tasks.filter((t) => t.status === 'FAILED').length;
    const successRate =
      completed + failed > 0 ? Math.round((completed / (completed + failed)) * 100) : 0;

    const completedWithDuration = tasks.filter(
      (t) => t.status === 'COMPLETED' && t.durationMs !== null
    );
    const avgDurationMs =
      completedWithDuration.length > 0
        ? completedWithDuration.reduce((sum, t) => sum + t.durationMs!, 0) /
          completedWithDuration.length
        : 0;

    const avgSources =
      total > 0 ? Math.round(tasks.reduce((sum, t) => sum + t.sources, 0) / total) : 0;

    // Topic counts for top categories
    const topicCounts: Record<string, number> = {};
    for (const t of tasks) {
      if (t.topic && typeof t.topic === 'string') {
        topicCounts[t.topic] = (topicCounts[t.topic] || 0) + 1;
      }
    }
    const topCategories = Object.entries(topicCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));

    const topCategory = topCategories[0]?.name ?? null;

    // Query volume — last 7 days with submitted + completed breakdown
    const queryVolume = Array.from({ length: 7 }, (_, i) => {
      const day = new Date();
      day.setDate(day.getDate() - (6 - i));
      day.setHours(0, 0, 0, 0);
      const nextDay = new Date(day.getTime() + 86_400_000);
      const dayTasks = tasks.filter((t) => {
        if (!t.createdAt) return false;
        const d = new Date(t.createdAt);
        return d >= day && d < nextDay;
      });
      return {
        day: day.toLocaleDateString('en-US', { weekday: 'short' }),
        date: day.toISOString().split('T')[0],
        count: dayTasks.length,
        submitted: dayTasks.length,
        completed: dayTasks.filter((t) => t.status === 'COMPLETED').length,
      };
    });

    const maxSources = Math.max(...tasks.map((t) => t.sources), 1);

    const recentTasks = tasks.slice(0, 20).map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      sources: t.sources,
      maxSources,
      iterationCount: t.iterationCount,
      createdAt: t.createdAt,
      durationMs: t.durationMs,
    }));

    return NextResponse.json({
      stats: { total, inProgress, completed, failed, successRate, avgDurationMs, avgSources, topCategory },
      queryVolume,
      topCategories,
      recentTasks,
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
