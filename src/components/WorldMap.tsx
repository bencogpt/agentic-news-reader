'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ComposableMap,
  Geographies,
  Geography,
  Marker,
  ZoomableGroup,
} from 'react-simple-maps';
import {
  NEWS_HOTSPOTS,
  CATEGORY_COLORS,
  type HotspotCategory,
  type NewsHotspot,
} from '@/lib/constants/news-hotspots';

const GEO_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';

export interface QueryMarker {
  id: string;
  label: string;
  query: string;
  coordinates: [number, number];
  category: HotspotCategory;
  location: string;
  createdAt: string | null;
  status: string;
}

interface TooltipData {
  type: 'hotspot' | 'query';
  hotspot?: NewsHotspot;
  queryMarker?: QueryMarker;
}

interface WorldMapProps {
  activeCategories: Set<HotspotCategory>;
  queryMarkers?: QueryMarker[];
}

export function WorldMap({ activeCategories, queryMarkers = [] }: WorldMapProps) {
  const router = useRouter();
  const [hovered, setHovered] = useState<TooltipData | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  const visibleHotspots = NEWS_HOTSPOTS.filter((h) =>
    activeCategories.size === 0 || activeCategories.has(h.category)
  );

  const visibleQueryMarkers = queryMarkers.filter((q) =>
    activeCategories.size === 0 || activeCategories.has(q.category)
  );

  const updateTooltip = (e: React.MouseEvent) => {
    setTooltipPos({ x: e.clientX, y: e.clientY });
  };

  return (
    <div className="relative w-full h-full">
      <ComposableMap
        projection="geoMercator"
        projectionConfig={{ scale: 140, center: [0, 20] }}
        width={980}
        height={551}
        style={{ width: '100%', height: '100%' }}
      >
        <ZoomableGroup>
          <Geographies geography={GEO_URL}>
            {({ geographies }) =>
              geographies.map((geo) => (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  style={{
                    default: { fill: '#1e293b', stroke: '#334155', strokeWidth: 0.5, outline: 'none' },
                    hover:   { fill: '#334155', stroke: '#475569', strokeWidth: 0.5, outline: 'none' },
                    pressed: { outline: 'none' },
                  }}
                />
              ))
            }
          </Geographies>

          {/* Static editorial hotspots */}
          {visibleHotspots.map((hotspot) => (
            <Marker
              key={hotspot.id}
              coordinates={hotspot.coordinates}
              onMouseEnter={(e: React.MouseEvent) => {
                setHovered({ type: 'hotspot', hotspot });
                updateTooltip(e);
              }}
              onMouseLeave={() => setHovered(null)}
              onMouseMove={updateTooltip}
              onClick={() => router.push(`/chat?q=${encodeURIComponent(hotspot.query)}`)}
              style={{ cursor: 'pointer' }}
            >
              {/* Pulse ring */}
              <circle r={10} fill={CATEGORY_COLORS[hotspot.category]} fillOpacity={0.15} stroke="none" />
              {/* Solid dot */}
              <circle r={5} fill={CATEGORY_COLORS[hotspot.category]} stroke="white" strokeWidth={1} />
            </Marker>
          ))}

          {/* Dynamic user query markers */}
          {visibleQueryMarkers.map((qm) => {
            const color = CATEGORY_COLORS[qm.category];
            return (
              <Marker
                key={`q-${qm.id}`}
                coordinates={qm.coordinates}
                onMouseEnter={(e: React.MouseEvent) => {
                  setHovered({ type: 'query', queryMarker: qm });
                  updateTooltip(e);
                }}
                onMouseLeave={() => setHovered(null)}
                onMouseMove={updateTooltip}
                onClick={() => router.push(`/chat?q=${encodeURIComponent(qm.query)}`)}
                style={{ cursor: 'pointer' }}
              >
                {/* Outer pulse ring — slightly larger than hotspots for visibility */}
                <circle r={12} fill={color} fillOpacity={0.08} stroke={color} strokeWidth={0.5} strokeOpacity={0.3} />
                {/* Hollow marker: white fill with colored border — visually distinct from solid hotspots */}
                <circle r={4} fill="white" stroke={color} strokeWidth={2} />
                {/* Center dot */}
                <circle r={1.5} fill={color} />
              </Marker>
            );
          })}
        </ZoomableGroup>
      </ComposableMap>

      {/* Tooltip */}
      {hovered && (
        <div
          className="fixed z-50 pointer-events-none bg-gray-900 text-white text-sm rounded-lg px-3 py-2 shadow-xl border border-gray-700 max-w-xs"
          style={{
            left: tooltipPos.x + 12,
            top: tooltipPos.y - 40,
            transform: 'translateY(-50%)',
          }}
        >
          {hovered.type === 'hotspot' && hovered.hotspot && (
            <>
              <div className="font-semibold mb-0.5">{hovered.hotspot.label}</div>
              <div className="text-xs text-gray-300 leading-tight">{hovered.hotspot.query}</div>
              <div className="text-xs mt-1 font-medium capitalize" style={{ color: CATEGORY_COLORS[hovered.hotspot.category] }}>
                {hovered.hotspot.category}
              </div>
            </>
          )}
          {hovered.type === 'query' && hovered.queryMarker && (
            <>
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-xs px-1.5 py-0.5 rounded bg-white/10 text-gray-300">User query</span>
                <span
                  className="text-xs font-medium capitalize"
                  style={{ color: CATEGORY_COLORS[hovered.queryMarker.category] }}
                >
                  {hovered.queryMarker.category}
                </span>
              </div>
              <div className="font-semibold leading-snug">{hovered.queryMarker.label}</div>
              <div className="text-xs text-gray-400 mt-0.5">{hovered.queryMarker.location}</div>
            </>
          )}
        </div>
      )}

      {/* Legend */}
      {visibleQueryMarkers.length > 0 && (
        <div className="absolute bottom-4 right-4 flex items-center gap-4 bg-slate-900/80 backdrop-blur border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-400">
          <span className="flex items-center gap-1.5">
            <svg width="14" height="14" viewBox="0 0 14 14">
              <circle cx="7" cy="7" r="5" fill="#64748b" stroke="white" strokeWidth="1" />
            </svg>
            Editorial hotspot
          </span>
          <span className="flex items-center gap-1.5">
            <svg width="14" height="14" viewBox="0 0 14 14">
              <circle cx="7" cy="7" r="4" fill="white" stroke="#64748b" strokeWidth="2" />
              <circle cx="7" cy="7" r="1.5" fill="#64748b" />
            </svg>
            User query ({visibleQueryMarkers.length})
          </span>
        </div>
      )}
    </div>
  );
}
