import { describe, it, expect } from 'vitest';
import { normalizeArticle } from './newsapi';

describe('NewsAPI Service', () => {
  describe('normalizeArticle', () => {
    it('normalizes a complete article response', () => {
      const rawArticle = {
        source: { id: 'bbc', name: 'BBC News' },
        author: 'John Doe',
        title: 'Breaking News: Something Happened',
        description: 'A brief description of what happened',
        url: 'https://bbc.com/article/123',
        urlToImage: 'https://bbc.com/image.jpg',
        publishedAt: '2024-03-15T10:00:00Z',
        content: 'Full article content...',
      };

      const result = normalizeArticle(rawArticle);

      expect(result).toEqual({
        title: 'Breaking News: Something Happened',
        url: 'https://bbc.com/article/123',
        source: 'BBC News',
        publishedAt: '2024-03-15T10:00:00Z',
        description: 'A brief description of what happened',
      });
    });

    it('handles missing title with default', () => {
      const rawArticle = {
        source: { id: null, name: 'Unknown Source' },
        author: null,
        title: '',
        description: null,
        url: 'https://example.com/article',
        urlToImage: null,
        publishedAt: '2024-03-15T10:00:00Z',
        content: null,
      };

      const result = normalizeArticle(rawArticle);
      expect(result.title).toBe('Untitled');
    });

    it('handles missing source name', () => {
      const rawArticle = {
        source: { id: null, name: '' },
        author: null,
        title: 'Article Title',
        description: null,
        url: 'https://example.com/article',
        urlToImage: null,
        publishedAt: '2024-03-15T10:00:00Z',
        content: null,
      };

      const result = normalizeArticle(rawArticle);
      expect(result.source).toBe('Unknown');
    });

    it('preserves null description', () => {
      const rawArticle = {
        source: { id: null, name: 'Source' },
        author: null,
        title: 'Title',
        description: null,
        url: 'https://example.com/article',
        urlToImage: null,
        publishedAt: '2024-03-15T10:00:00Z',
        content: null,
      };

      const result = normalizeArticle(rawArticle);
      expect(result.description).toBeNull();
    });
  });
});
