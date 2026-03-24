import { ArticleMeta } from '../types';

/**
 * Search DuckDuckGo as a rate-limit-free fallback.
 * No API key required. Uses the public HTML endpoint.
 */
export async function searchDuckDuckGo(params: {
  query: string;
  pageSize?: number;
}): Promise<{ articles: ArticleMeta[] }> {
  const limit = params.pageSize ?? 10;
  const q = encodeURIComponent(params.query);
  const url = `https://html.duckduckgo.com/html/?q=${q}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    throw new Error(`DuckDuckGo search failed with status ${response.status}`);
  }

  const html = await response.text();
  const articles: ArticleMeta[] = [];

  // Extract result titles + destination URLs from DDG redirect links.
  // Only match result__a (title) anchors — ignore result__url display links.
  // Href format: //duckduckgo.com/l/?uddg=... or /l/?uddg=...
  const linkRe = /<a[^>]+class="result__a"[^>]*href="(?:\/\/duckduckgo\.com)?\/l\/[^"]*uddg=([^"&\s]+)[^"]*"[^>]*>\s*([\s\S]*?)\s*<\/a>|<a[^>]+href="(?:\/\/duckduckgo\.com)?\/l\/[^"]*uddg=([^"&\s]+)[^"]*"[^>]*class="result__a"[^>]*>\s*([\s\S]*?)\s*<\/a>/g;
  // Extract snippets from result__snippet anchors
  const snippetRe = /class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
  // Extract domain labels
  const domainRe = /class="[^"]*result__url[^"]*"[^>]*>([\s\S]*?)<\/a>/g;

  const snippets: string[] = [];
  let sm: RegExpExecArray | null;
  while ((sm = snippetRe.exec(html)) !== null) {
    snippets.push(sm[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim());
  }

  const domains: string[] = [];
  let dm: RegExpExecArray | null;
  while ((dm = domainRe.exec(html)) !== null) {
    domains.push(dm[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim());
  }

  let m: RegExpExecArray | null;
  let idx = 0;
  while ((m = linkRe.exec(html)) !== null && articles.length < limit) {
    // Groups 1+2 for first alternate (class before href), 3+4 for second (href before class)
    const rawUrl = m[1] ?? m[3];
    const rawTitle = m[2] ?? m[4];
    if (!rawUrl || !rawTitle) continue;

    let destUrl: string;
    try {
      destUrl = decodeURIComponent(rawUrl);
    } catch {
      continue;
    }

    // Skip DuckDuckGo-internal and JavaScript links
    if (!destUrl.startsWith('http') || destUrl.includes('duckduckgo.com')) continue;

    const title = rawTitle.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    if (!title) continue;

    let hostname = domains[idx] || '';
    if (!hostname) {
      try {
        hostname = new URL(destUrl).hostname.replace(/^www\./, '');
      } catch {
        hostname = destUrl;
      }
    }

    articles.push({
      title,
      url: destUrl,
      source: hostname,
      publishedAt: new Date().toISOString(),
      description: snippets[idx] || null,
    });
    idx++;
  }

  console.log(`[DuckDuckGo] Found ${articles.length} results for: "${params.query}"`);
  return { articles };
}
