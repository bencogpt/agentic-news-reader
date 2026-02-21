import { ArticleMeta } from '../types';

// Note: Mediastack free tier requires HTTP (not HTTPS)
const MEDIASTACK_API_BASE_URL = 'http://api.mediastack.com/v1/news';

interface MediastackArticle {
  author: string | null;
  title: string;
  description: string | null;
  url: string;
  source: string;
  image: string | null;
  category: string;
  language: string;
  country: string;
  published_at: string;
}

interface MediastackResponse {
  pagination: {
    limit: number;
    offset: number;
    count: number;
    total: number;
  };
  data: MediastackArticle[];
}

interface SearchParams {
  query: string;
  pageSize?: number;
}

export interface MediastackResult {
  articles: ArticleMeta[];
  requestUrl: string;
}

export async function searchMediastack(params: SearchParams): Promise<MediastackResult> {
  const apiKey = process.env.MEDIASTACK_API_KEY;
  if (!apiKey) {
    throw new Error('MEDIASTACK_API_KEY is not configured. Get a free key at https://mediastack.com/');
  }

  const url = new URL(MEDIASTACK_API_BASE_URL);
  url.searchParams.set('access_key', apiKey);
  url.searchParams.set('keywords', params.query);
  url.searchParams.set('languages', 'en');
  url.searchParams.set('sort', 'published_desc');

  // Mediastack uses 'limit', max 100, default 25
  if (params.pageSize) {
    url.searchParams.set('limit', String(Math.min(params.pageSize, 100)));
  }

  // Create display URL (with key for debugging - POC)
  const displayUrl = url.toString();

  console.log(`[Mediastack] Request URL: ${displayUrl}`);

  try {
    const response = await fetch(url.toString(), {
      headers: {
        'User-Agent': 'AgenticNewsReader/1.0',
      },
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Mediastack API error ${response.status}: ${errorBody}`);
    }

    const data: MediastackResponse = await response.json();

    // Check for API error in response body (Mediastack returns 200 even for errors)
    if ('error' in data) {
      const error = data as unknown as { error: { code: string; message: string } };
      throw new Error(`Mediastack API error: ${error.error.message} (${error.error.code})`);
    }

    console.log(`[Mediastack] Query: "${params.query}" returned ${data.pagination?.total || 0} total, ${data.data?.length || 0} articles`);

    if (!data.data || data.data.length === 0) {
      console.log('[Mediastack] No articles returned');
      return {
        articles: [],
        requestUrl: displayUrl,
      };
    }

    // Normalize response to ArticleMeta
    const articles: ArticleMeta[] = data.data.map((article) => ({
      title: article.title || 'Untitled',
      url: article.url,
      source: article.source || 'Unknown',
      publishedAt: article.published_at,
      description: article.description,
    }));

    return {
      articles,
      requestUrl: displayUrl,
    };
  } catch (error) {
    console.error('[Mediastack] Request failed:', error);
    throw error;
  }
}
