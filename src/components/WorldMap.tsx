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

interface WorldMapProps {
  activeCategories: Set<HotspotCategory>;
}

export function WorldMap({ activeCategories }: WorldMapProps) {
  const router = useRouter();
  const [hoveredHotspot, setHoveredHotspot] = useState<NewsHotspot | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  const visibleHotspots = NEWS_HOTSPOTS.filter((h) =>
    activeCategories.size === 0 || activeCategories.has(h.category)
  );

  const handleMarkerClick = (hotspot: NewsHotspot) => {
    router.push(`/chat?q=${encodeURIComponent(hotspot.query)}`);
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
                    default: {
                      fill: '#1e293b',
                      stroke: '#334155',
                      strokeWidth: 0.5,
                      outline: 'none',
                    },
                    hover: {
                      fill: '#334155',
                      stroke: '#475569',
                      strokeWidth: 0.5,
                      outline: 'none',
                    },
                    pressed: { outline: 'none' },
                  }}
                />
              ))
            }
          </Geographies>

          {visibleHotspots.map((hotspot) => (
            <Marker
              key={hotspot.id}
              coordinates={hotspot.coordinates}
              onMouseEnter={(e: React.MouseEvent) => {
                setHoveredHotspot(hotspot);
                setTooltipPos({ x: e.clientX, y: e.clientY });
              }}
              onMouseLeave={() => setHoveredHotspot(null)}
              onMouseMove={(e: React.MouseEvent) => {
                setTooltipPos({ x: e.clientX, y: e.clientY });
              }}
              onClick={() => handleMarkerClick(hotspot)}
              style={{ cursor: 'pointer' }}
            >
              {/* Outer pulse ring */}
              <circle
                r={10}
                fill={CATEGORY_COLORS[hotspot.category]}
                fillOpacity={0.15}
                stroke="none"
              />
              {/* Inner dot */}
              <circle
                r={5}
                fill={CATEGORY_COLORS[hotspot.category]}
                stroke="white"
                strokeWidth={1}
              />
            </Marker>
          ))}
        </ZoomableGroup>
      </ComposableMap>

      {/* Tooltip */}
      {hoveredHotspot && (
        <div
          className="fixed z-50 pointer-events-none bg-gray-900 text-white text-sm rounded-lg px-3 py-2 shadow-xl border border-gray-700 max-w-xs"
          style={{
            left: tooltipPos.x + 12,
            top: tooltipPos.y - 40,
            transform: 'translateY(-50%)',
          }}
        >
          <div className="font-semibold mb-0.5">{hoveredHotspot.label}</div>
          <div className="text-xs text-gray-300 leading-tight">{hoveredHotspot.query}</div>
          <div
            className="text-xs mt-1 font-medium capitalize"
            style={{ color: CATEGORY_COLORS[hoveredHotspot.category] }}
          >
            {hoveredHotspot.category}
          </div>
        </div>
      )}
    </div>
  );
}
