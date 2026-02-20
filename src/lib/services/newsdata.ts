import { ArticleMeta } from '../types';

const NEWSDATA_API_BASE_URL = 'https://newsdata.io/api/1/news';

interface NewsDataArticle {
  title: string;
  link: string;
  description: string | null;
  pubDate: string;
  source_id: string;
  source_name?: string;
  image_url: string | null;
}

interface NewsDataResponse {
  status: string;
  totalResults: number;
  results: NewsDataArticle[];
  nextPage?: string;
}

interface SearchParams {
  query: string;
  pageSize?: number;
}

export interface NewsDataResult {
  articles: ArticleMeta[];
  requestUrl: string;
}

export async function searchNewsData(params: SearchParams): Promise<NewsDataResult> {
  const apiKey = process.env.NEWSDATA_API_KEY;
  if (!apiKey) {
    throw new Error('NEWSDATA_API_KEY is not configured');
  }

  const url = new URL(NEWSDATA_API_BASE_URL);
  url.searchParams.set('apikey', apiKey);
  url.searchParams.set('q', params.query);
  url.searchParams.set('language', 'en');

  // NewsData uses 'size' for page size, max 10 on free tier
  const pageSize = Math.min(params.pageSize || 10, 10);
  url.searchParams.set('size', String(pageSize));

  // Create display URL (with key for debugging - POC)
  const displayUrl = url.toString();

  console.log(`[NewsData] Request URL: ${displayUrl}`);

  try {
    const response = await fetch(url.toString(), {
      headers: {
        'User-Agent': 'AgenticNewsReader/1.0',
      },
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`NewsData API error ${response.status}: ${errorBody}`);
    }

    const data: NewsDataResponse = await response.json();

    console.log(`[NewsData] Query: "${params.query}" returned ${data.totalResults} total, ${data.results?.length || 0} articles`);

    if (!data.results || data.results.length === 0) {
      console.log('[NewsData] No articles returned');
      return {
        articles: [],
        requestUrl: displayUrl,
      };
    }

    // Normalize response to ArticleMeta
    const articles: ArticleMeta[] = data.results.map((article) => ({
      title: article.title || 'Untitled',
      url: article.link,
      source: article.source_name || article.source_id || 'Unknown',
      publishedAt: article.pubDate,
      description: article.description,
    }));

    return {
      articles,
      requestUrl: displayUrl,
    };
  } catch (error) {
    console.error('[NewsData] Request failed:', error);
    throw error;
  }
}
