import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';
import { generateCompletion, parseJsonResponse } from '@/lib/services/llm';
import type { HotspotCategory } from '@/lib/constants/news-hotspots';

interface GeoMarker {
  location: string;
  coordinates: [number, number]; // [lon, lat]
  category: HotspotCategory;
}

interface GeoResult {
  location: string | null;
  coordinates: [number, number] | null;
  category: HotspotCategory;
}

export async function GET() {
  try {
    const snapshot = await db
      .collection('tasks')
      .orderBy('createdAt', 'desc')
      .limit(60)
      .get();

    const tasks = snapshot.docs.map((doc) => ({
      id: doc.id,
      title: (doc.data().title || doc.data().currentRequest || '') as string,
      query: (doc.data().currentRequest || '') as string,
      status: (doc.data().status || '') as string,
      createdAt: doc.data().createdAt?.toDate?.()?.toISOString() ?? null,
      geoMarker: doc.data().geoMarker as GeoMarker | null | undefined,
      geoChecked: (doc.data().geoChecked ?? false) as boolean,
    })).filter((t) => t.query.trim().length > 3);

    // Tasks not yet geocoded
    const needsGeo = tasks.filter((t) => !t.geoChecked);

    if (needsGeo.length > 0) {
      const batch = needsGeo.slice(0, 25); // geocode up to 25 at once

      const raw = await generateCompletion({
        systemPrompt: `You are a geographic information extractor for a news research assistant.
Given a list of research query titles, for each one:
1. Identify the PRIMARY geographic location (country, city, region) — or null if the query has no geographic focus (e.g. pure tech/science topics with no location)
2. Return the longitude and latitude of that location as [lon, lat]
3. Classify the category: "conflict" | "politics" | "economy" | "climate" | "technology"

Return ONLY JSON: {"results": [{"location": "string or null", "coordinates": [lon, lat] or null, "category": "..."}, ...]}
One result per input query, in the same order.`,
        userPrompt: `Queries:\n${batch.map((t, i) => `${i + 1}. "${t.query}"`).join('\n')}`,
        jsonMode: true,
        maxTokens: 1200,
        temperature: 0.1,
      });

      let geoResults: GeoResult[] = [];
      try {
        const parsed = await parseJsonResponse<{ results: GeoResult[] }>(raw);
        geoResults = parsed.results ?? [];
      } catch {
        geoResults = batch.map(() => ({ location: null, coordinates: null, category: 'politics' as HotspotCategory }));
      }

      // Persist results back to tasks (caching)
      const firestoreBatch = db.batch();
      for (let i = 0; i < batch.length; i++) {
        const result = geoResults[i];
        const ref = db.collection('tasks').doc(batch[i].id);
        const hasLocation = result?.location && result?.coordinates;
        firestoreBatch.update(ref, {
          geoChecked: true,
          geoMarker: hasLocation
            ? ({ location: result.location, coordinates: result.coordinates, category: result.category || 'politics' } as GeoMarker)
            : null,
        });
        // Add to in-memory list for this response
        if (hasLocation) {
          (batch[i] as typeof batch[0] & { geoMarker: GeoMarker }).geoMarker = {
            location: result.location!,
            coordinates: result.coordinates!,
            category: result.category || 'politics',
          };
        }
      }
      await firestoreBatch.commit();
    }

    // Build marker list from all tasks with valid geoMarkers
    const markers = tasks
      .filter((t) => t.geoMarker)
      .map((t) => ({
        id: t.id,
        label: t.title.length > 45 ? t.title.slice(0, 45) + '…' : t.title,
        query: t.query,
        coordinates: t.geoMarker!.coordinates,
        category: t.geoMarker!.category,
        location: t.geoMarker!.location,
        createdAt: t.createdAt,
        status: t.status,
      }));

    return NextResponse.json({ markers, total: tasks.length });
  } catch (error) {
    console.error('Query markers error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
