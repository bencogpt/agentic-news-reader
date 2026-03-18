export type HotspotCategory = 'conflict' | 'politics' | 'economy' | 'climate' | 'technology';

export interface NewsHotspot {
  id: string;
  label: string;
  coordinates: [number, number]; // [longitude, latitude]
  query: string;
  category: HotspotCategory;
}

export const NEWS_HOTSPOTS: NewsHotspot[] = [
  {
    id: 'us-politics',
    label: 'US Politics',
    coordinates: [-98.5795, 39.8283],
    query: 'United States politics latest news',
    category: 'politics',
  },
  {
    id: 'russia-ukraine',
    label: 'Russia–Ukraine',
    coordinates: [32.0, 50.0],
    query: 'Russia Ukraine war latest developments',
    category: 'conflict',
  },
  {
    id: 'middle-east',
    label: 'Middle East',
    coordinates: [35.0, 31.5],
    query: 'Middle East conflict Gaza Israel latest news',
    category: 'conflict',
  },
  {
    id: 'iran-war',
    label: 'Iran War',
    coordinates: [53.6880, 32.4279],
    query: 'Iran Israel war strikes military conflict 2025',
    category: 'conflict',
  },
  {
    id: 'china-taiwan',
    label: 'China–Taiwan',
    coordinates: [120.9605, 23.6978],
    query: 'China Taiwan tensions latest news',
    category: 'conflict',
  },
  {
    id: 'eu-economy',
    label: 'EU Economy',
    coordinates: [10.4515, 51.1657],
    query: 'European Union economy latest news',
    category: 'economy',
  },
  {
    id: 'amazon-climate',
    label: 'Amazon / Climate',
    coordinates: [-60.0, -3.0],
    query: 'Amazon rainforest deforestation climate crisis',
    category: 'climate',
  },
  {
    id: 'india-pakistan',
    label: 'India–Pakistan',
    coordinates: [74.3587, 31.5204],
    query: 'India Pakistan border tensions news',
    category: 'conflict',
  },
  {
    id: 'china-economy',
    label: 'China Economy',
    coordinates: [104.1954, 35.8617],
    query: 'China economy trade GDP latest news',
    category: 'economy',
  },
  {
    id: 'africa-sahel',
    label: 'Africa Sahel',
    coordinates: [2.0, 14.0],
    query: 'Sahel Africa security crisis latest news',
    category: 'conflict',
  },
  {
    id: 'north-korea',
    label: 'North Korea',
    coordinates: [127.5101, 40.3399],
    query: 'North Korea nuclear missiles latest news',
    category: 'politics',
  },
  {
    id: 'arctic-climate',
    label: 'Arctic Climate',
    coordinates: [0.0, 85.0],
    query: 'Arctic sea ice melting climate change',
    category: 'climate',
  },
  {
    id: 'venezuela',
    label: 'Venezuela',
    coordinates: [-66.5897, 6.4238],
    query: 'Venezuela political crisis economy news',
    category: 'politics',
  },
  {
    id: 'myanmar',
    label: 'Myanmar',
    coordinates: [95.9560, 21.9162],
    query: 'Myanmar coup military junta latest news',
    category: 'conflict',
  },
  {
    id: 'uk-politics',
    label: 'UK Politics',
    coordinates: [-3.4359, 55.3781],
    query: 'United Kingdom politics latest news',
    category: 'politics',
  },
  {
    id: 'japan-economy',
    label: 'Japan Economy',
    coordinates: [138.2529, 36.2048],
    query: 'Japan economy yen interest rates news',
    category: 'economy',
  },
  {
    id: 'brazil-climate',
    label: 'Brazil',
    coordinates: [-51.9253, -14.2350],
    query: 'Brazil climate environment politics news',
    category: 'climate',
  },
  {
    id: 'south-china-sea',
    label: 'South China Sea',
    coordinates: [113.0, 14.0],
    query: 'South China Sea disputes Philippines latest news',
    category: 'conflict',
  },
  {
    id: 'us-economy',
    label: 'US Economy',
    coordinates: [-87.6298, 41.8781],
    query: 'United States economy inflation Federal Reserve news',
    category: 'economy',
  },
  {
    id: 'india-economy',
    label: 'India Economy',
    coordinates: [78.9629, 20.5937],
    query: 'India economy growth technology investment news',
    category: 'economy',
  },
  {
    id: 'silicon-valley',
    label: 'Silicon Valley',
    coordinates: [-122.0, 37.4],
    query: 'Silicon Valley AI tech companies latest news',
    category: 'technology',
  },
  {
    id: 'ai-race',
    label: 'AI Race',
    coordinates: [-77.0369, 38.9072],
    query: 'artificial intelligence regulation policy OpenAI Google latest news',
    category: 'technology',
  },
  {
    id: 'china-tech',
    label: 'China Tech',
    coordinates: [121.4737, 31.2304],
    query: 'China technology semiconductor DeepSeek AI latest news',
    category: 'technology',
  },
  {
    id: 'crypto',
    label: 'Crypto',
    coordinates: [-80.1918, 25.7617],
    query: 'cryptocurrency Bitcoin Ethereum latest news 2025',
    category: 'technology',
  },
];

export const CATEGORY_COLORS: Record<HotspotCategory, string> = {
  conflict: '#ef4444',
  politics: '#8b5cf6',
  economy: '#f59e0b',
  climate: '#22c55e',
  technology: '#06b6d4',
};
