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
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function searchGNews(params: SearchParams): Promise<ArticleMeta[]> {
  const apiKey = process.env.GNEWS_API_KEY;
  if (!apiKey) {
    throw new Error('GNEWS_API_KEY is not configured');
  }

  const url = new URL(GNEWS_API_BASE_URL);
  url.searchParams.set('q', params.query);
  url.searchParams.set('lang', 'en');
  url.searchParams.set('max', String(params.pageSize || 10));
  url.searchParams.set('apikey', apiKey);

  // GNews uses sortby (lowercase)
  if (params.sortBy) {
    url.searchParams.set('sortby', params.sortBy);
  }

  // GNews date format: YYYY-MM-DDTHH:MM:SSZ
  if (params.from) {
    url.searchParams.set('from', params.from);
  }
  if (params.to) {
    url.searchParams.set('to', params.to);
  }

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

      // Normalize response to ArticleMeta
      return data.articles.map((article) => ({
        title: article.title || 'Untitled',
        url: article.url,
        source: article.source.name || 'Unknown',
        publishedAt: article.publishedAt,
        description: article.description,
      }));
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
