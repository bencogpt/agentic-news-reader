import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import { ArticleMeta, ArticleWithContent } from '../types';

const FETCH_TIMEOUT_MS = 15000;
const MAX_CONTENT_LENGTH = 50000; // Characters

interface ExtractResult {
  success: boolean;
  content?: string;
  error?: string;
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function extractArticleContent(
  article: ArticleMeta
): Promise<ExtractResult> {
  try {
    const response = await fetchWithTimeout(article.url, FETCH_TIMEOUT_MS);

    if (!response.ok) {
      return {
        success: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
      return {
        success: false,
        error: `Unsupported content type: ${contentType}`,
      };
    }

    const html = await response.text();
    if (html.length > 1000000) {
      // Very large page - truncate
      return {
        success: false,
        error: 'Page too large',
      };
    }

    // Use JSDOM and Readability to extract content
    const dom = new JSDOM(html, { url: article.url });
    const reader = new Readability(dom.window.document);
    const parsed = reader.parse();

    if (!parsed || !parsed.textContent) {
      // Fallback: try to get basic text content
      const body = dom.window.document.body;
      if (body) {
        // Remove scripts and styles
        body.querySelectorAll('script, style, nav, header, footer, aside').forEach((el) => el.remove());
        const text = body.textContent || '';
        if (text.trim().length > 100) {
          return {
            success: true,
            content: text.slice(0, MAX_CONTENT_LENGTH).trim(),
          };
        }
      }

      return {
        success: false,
        error: 'Could not extract readable content',
      };
    }

    let content = parsed.textContent.trim();

    // Truncate if too long
    if (content.length > MAX_CONTENT_LENGTH) {
      content = content.slice(0, MAX_CONTENT_LENGTH) + '...';
    }

    return {
      success: true,
      content,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('aborted')) {
      return { success: false, error: 'Request timed out' };
    }
    return { success: false, error: message };
  }
}

export async function extractArticle(
  article: ArticleMeta
): Promise<ArticleWithContent | null> {
  const result = await extractArticleContent(article);

  if (!result.success || !result.content) {
    console.log(`Failed to extract article "${article.title}": ${result.error}`);
    return null;
  }

  return {
    ...article,
    content: result.content,
  };
}
