import { ArticleMeta } from '../types';
import { searchNews as searchNewsAPI } from './newsapi';
import { searchGNews } from './gnews';
import { searchNewsData } from './newsdata';
import { searchCurrents } from './currents';
import { searchMediastack } from './mediastack';
import { searchGuardian } from './guardian';
import { searchDuckDuckGo } from './duckduckgo';

export type NewsProvider = 'gnews' | 'newsapi' | 'newsdata' | 'guardian' | 'currents' | 'mediastack' | 'duckduckgo';

interface SearchParams {
  query: string;
  from?: string;
  to?: string;
  pageSize?: number;
  sortBy?: 'publishedAt' | 'relevancy' | 'popularity';
  provider?: NewsProvider;
}

export interface NewsSearchResult {
  articles: ArticleMeta[];
  requestUrl?: string; // URL for debugging
  dateRange?: { from: string; to: string }; // Date range used (for free tier)
  provider?: NewsProvider; // Which provider was used
}

// Check if we're running on localhost
function isLocalhost(): boolean {
  if (process.env.NODE_ENV === 'development') return true;
  if (process.env.VERCEL_ENV === 'production') return false;
  if (process.env.VERCEL_ENV === 'preview') return false;
  return true;
}

/**
 * Search for news articles using the specified provider.
 */
export async function searchNews(params: SearchParams): Promise<NewsSearchResult> {
  const provider = params.provider || 'gnews';

  switch (provider) {
    case 'newsapi': {
      if (!process.env.NEWS_API_KEY) {
        throw new Error('NEWS_API_KEY is not configured');
      }
      if (!isLocalhost()) {
        throw new Error('NewsAPI free tier only works on localhost. Choose a different provider.');
      }
      console.log('[News] Using NewsAPI');
      const articles = await searchNewsAPI(params);
      return { articles, provider: 'newsapi' };
    }

    case 'newsdata': {
      if (!process.env.NEWSDATA_API_KEY) {
        throw new Error('NEWSDATA_API_KEY is not configured. Get a free key at https://newsdata.io/');
      }
      console.log('[News] Using NewsData.io');
      const result = await searchNewsData(params);
      return {
        articles: result.articles,
        requestUrl: result.requestUrl,
        provider: 'newsdata',
      };
    }

    case 'guardian': {
      if (!process.env.GUARDIAN_API_KEY) {
        throw new Error('GUARDIAN_API_KEY is not configured. Get a free key at https://open-platform.theguardian.com/');
      }
      console.log('[News] Using The Guardian');
      const result = await searchGuardian(params);
      return {
        articles: result.articles,
        requestUrl: result.requestUrl,
        provider: 'guardian',
      };
    }

    case 'currents': {
      if (!process.env.CURRENTS_API_KEY) {
        throw new Error('CURRENTS_API_KEY is not configured. Get a free key at https://currentsapi.services/');
      }
      console.log('[News] Using Currents API');
      const result = await searchCurrents(params);
      return {
        articles: result.articles,
        requestUrl: result.requestUrl,
        provider: 'currents',
      };
    }

    case 'mediastack': {
      if (!process.env.MEDIASTACK_API_KEY) {
        throw new Error('MEDIASTACK_API_KEY is not configured. Get a free key at https://mediastack.com/');
      }
      console.log('[News] Using Mediastack');
      const result = await searchMediastack(params);
      return {
        articles: result.articles,
        requestUrl: result.requestUrl,
        provider: 'mediastack',
      };
    }

    case 'duckduckgo': {
      console.log('[News] Using DuckDuckGo (rate-limit fallback)');
      const result = await searchDuckDuckGo({ query: params.query, pageSize: params.pageSize });
      return { articles: result.articles, provider: 'duckduckgo' };
    }

    case 'gnews':
    default: {
      if (!process.env.GNEWS_API_KEY) {
        throw new Error('GNEWS_API_KEY is not configured. Get a free key at https://gnews.io/');
      }
      console.log('[News] Using GNews');
      const result = await searchGNews(params);
      return {
        articles: result.articles,
        requestUrl: result.requestUrl,
        dateRange: result.dateRange,
        provider: 'gnews',
      };
    }
  }
}
