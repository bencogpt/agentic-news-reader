import { ArticleMeta } from '../types';

const GNEWS_API_BASE_URL = 'https://gnews.io/api/v4/search';
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

interface GNewsArticle {
  title: string;
  description: string;
  content: string;
  url: string;
  image: string | null;
  publishedAt: string;
  source: {
    name: string;
    url: string;
  };
}

interface GNewsResponse {
  totalArticles: number;
  articles: GNewsArticle[];
}

interface SearchParams {
  query: string;
  from?: string;
  to?: string;
  pageSize?: number;
  sortBy?: 'publishedAt' | 'relevancy' | 'popularity';
  freeTierMode?: boolean;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface GNewsResult {
  articles: ArticleMeta[];
  requestUrl: string; // URL for debugging
  dateRange?: { from: string; to: string }; // Date range used (for free tier)
}

export async function searchGNews(params: SearchParams): Promise<GNewsResult> {
  const apiKey = process.env.GNEWS_API_KEY;
  if (!apiKey) {
    throw new Error('GNEWS_API_KEY is not configured');
  }

  const url = new URL(GNEWS_API_BASE_URL);
  url.searchParams.set('q', params.query);
  url.searchParams.set('lang', 'en');
  url.searchParams.set('country', 'us');
  url.searchParams.set('max', String(params.pageSize || 10));

  // GNews uses sortby (lowercase)
  if (params.sortBy) {
    url.searchParams.set('sortby', params.sortBy);
  }

  // GNews date format: YYYY-MM-DDTHH:MM:SSZ
  // For free tier: do NOT use date filters - GNews will return available articles
  // (Free tier automatically excludes real-time data and limits to 30 days)
  let dateRange: { from: string; to: string } | undefined;

  if (params.freeTierMode === false && (params.from || params.to)) {
    // Only use date filters if NOT in free tier mode
    if (params.from) {
      url.searchParams.set('from', params.from);
    }
    if (params.to) {
      url.searchParams.set('to', params.to);
    }
    dateRange = { from: params.from || 'any', to: params.to || 'any' };
  } else if (params.freeTierMode !== false) {
    console.log('[GNews] Free tier mode: no date filters (GNews manages availability)');
  }

  // Add API key last
  url.searchParams.set('apikey', apiKey);

  // Create a display URL for debugging (POC: keeping API key visible for troubleshooting)
  const displayUrl = new URL(url.toString());

  console.log(`[GNews] Request URL (with key for POC debugging): ${displayUrl.toString()}`);

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url.toString(), {
        headers: {
          'User-Agent': 'AgenticNewsReader/1.0',
        },
      });

      if (response.status === 429) {
        console.log(`GNews rate limited, waiting ${(attempt + 1) * 2000}ms before retry`);
        await sleep((attempt + 1) * 2000);
        continue;
      }

      if (response.status >= 500) {
        console.log(`GNews server error ${response.status}, retrying...`);
        await sleep(RETRY_DELAY_MS * (attempt + 1));
        continue;
      }

      if (response.status === 401) {
        throw new Error('GNews API key is invalid: ' + url.toString());
      }

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`GNews API error ${response.status}: ${errorBody}`);
      }

      const data: GNewsResponse = await response.json();

      console.log(`[GNews] Query: "${params.query}" returned ${data.totalArticles} total, ${data.articles?.length || 0} articles`);

      // Handle case where articles might be undefined or null
      if (!data.articles || data.articles.length === 0) {
        console.log('[GNews] No articles returned');
        return {
          articles: [],
          requestUrl: displayUrl.toString(),
          dateRange,
        };
      }

      // Normalize response to ArticleMeta
      const articles = data.articles.map((article) => ({
        title: article.title || 'Untitled',
        url: article.url,
        source: article.source.name || 'Unknown',
        publishedAt: article.publishedAt,
        description: article.description,
      }));

      return {
        articles,
        requestUrl: displayUrl.toString(),
        dateRange,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.error(`GNews request failed (attempt ${attempt + 1}):`, lastError.message);

      if (attempt < MAX_RETRIES - 1) {
        await sleep(RETRY_DELAY_MS * (attempt + 1));
      }
    }
  }

  throw lastError || new Error('GNews request failed after retries');
}
