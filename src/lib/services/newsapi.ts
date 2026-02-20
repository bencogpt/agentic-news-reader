import { ArticleMeta } from '../types';

const NEWS_API_BASE_URL = 'https://newsapi.org/v2/everything';
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

interface NewsAPIResponse {
  status: string;
  totalResults: number;
  articles: Array<{
    source: { id: string | null; name: string };
    author: string | null;
    title: string;
    description: string | null;
    url: string;
    urlToImage: string | null;
    publishedAt: string;
    content: string | null;
  }>;
}

interface SearchParams {
  query: string;
  from?: string;
  to?: string;
  pageSize?: number;
  sortBy?: 'publishedAt' | 'relevancy' | 'popularity';
}

class RateLimiter {
  private lastRequestTime = 0;
  private minInterval = 1000; // 1 second between requests (NewsAPI free tier limit)

  async waitForSlot(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.minInterval) {
      await new Promise((resolve) =>
        setTimeout(resolve, this.minInterval - timeSinceLastRequest)
      );
    }
    this.lastRequestTime = Date.now();
  }
}

const rateLimiter = new RateLimiter();

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function searchNews(params: SearchParams): Promise<ArticleMeta[]> {
  const apiKey = process.env.NEWS_API_KEY;
  if (!apiKey) {
    throw new Error('NEWS_API_KEY is not configured');
  }

  const url = new URL(NEWS_API_BASE_URL);
  url.searchParams.set('q', params.query);
  url.searchParams.set('language', 'en');
  url.searchParams.set('sortBy', params.sortBy || 'publishedAt');
  url.searchParams.set('pageSize', String(params.pageSize || 10));
  url.searchParams.set('apiKey', apiKey);

  if (params.from) {
    url.searchParams.set('from', params.from);
  }
  if (params.to) {
    url.searchParams.set('to', params.to);
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      await rateLimiter.waitForSlot();

      const response = await fetch(url.toString(), {
        headers: {
          'User-Agent': 'AgenticNewsReader/1.0',
        },
      });

      if (response.status === 429) {
        // Rate limited - wait longer and retry
        console.log(`Rate limited, waiting ${(attempt + 1) * 2000}ms before retry`);
        await sleep((attempt + 1) * 2000);
        continue;
      }

      if (response.status >= 500) {
        // Server error - retry
        console.log(`Server error ${response.status}, retrying...`);
        await sleep(RETRY_DELAY_MS * (attempt + 1));
        continue;
      }

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`NewsAPI error ${response.status}: ${errorBody}`);
      }

      const data: NewsAPIResponse = await response.json();

      if (data.status !== 'ok') {
        throw new Error(`NewsAPI returned status: ${data.status}`);
      }

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
      console.error(`NewsAPI request failed (attempt ${attempt + 1}):`, lastError.message);

      if (attempt < MAX_RETRIES - 1) {
        await sleep(RETRY_DELAY_MS * (attempt + 1));
      }
    }
  }

  throw lastError || new Error('NewsAPI request failed after retries');
}

export function normalizeArticle(raw: NewsAPIResponse['articles'][0]): ArticleMeta {
  return {
    title: raw.title || 'Untitled',
    url: raw.url,
    source: raw.source.name || 'Unknown',
    publishedAt: raw.publishedAt,
    description: raw.description,
  };
}
