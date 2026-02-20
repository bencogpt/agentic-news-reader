import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getToday,
  getYesterday,
  getDaysAgo,
  resolveTimeWindow,
  formatDate,
  describeTimeWindow,
} from './dates';

describe('Date Utilities', () => {
  // Mock the current date
  const mockDate = new Date('2024-03-15T12:00:00Z');

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(mockDate);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('getToday', () => {
    it('returns today in ISO format', () => {
      expect(getToday()).toBe('2024-03-15');
    });
  });

  describe('getYesterday', () => {
    it('returns yesterday in ISO format', () => {
      expect(getYesterday()).toBe('2024-03-14');
    });
  });

  describe('getDaysAgo', () => {
    it('returns date N days ago', () => {
      expect(getDaysAgo(0)).toBe('2024-03-15');
      expect(getDaysAgo(1)).toBe('2024-03-14');
      expect(getDaysAgo(7)).toBe('2024-03-08');
      expect(getDaysAgo(30)).toBe('2024-02-14');
    });
  });

  describe('resolveTimeWindow', () => {
    it('resolves "today"', () => {
      const result = resolveTimeWindow('today');
      expect(result).toEqual({
        start: '2024-03-15',
        end: '2024-03-15',
      });
    });

    it('resolves "yesterday"', () => {
      const result = resolveTimeWindow('yesterday');
      expect(result).toEqual({
        start: '2024-03-14',
        end: '2024-03-14',
      });
    });

    it('resolves "X days ago"', () => {
      const result = resolveTimeWindow('3 days ago');
      expect(result).toEqual({
        start: '2024-03-12',
        end: '2024-03-12',
      });
    });

    it('resolves "last X days"', () => {
      const result = resolveTimeWindow('last 7 days');
      expect(result).toEqual({
        start: '2024-03-08',
        end: '2024-03-15',
      });
    });

    it('resolves "past X days"', () => {
      const result = resolveTimeWindow('past 5 days');
      expect(result).toEqual({
        start: '2024-03-10',
        end: '2024-03-15',
      });
    });

    it('returns null for unrecognized expressions', () => {
      const result = resolveTimeWindow('some random text');
      expect(result).toBeNull();
    });

    it('is case insensitive', () => {
      expect(resolveTimeWindow('TODAY')).toEqual({
        start: '2024-03-15',
        end: '2024-03-15',
      });
      expect(resolveTimeWindow('Yesterday')).toEqual({
        start: '2024-03-14',
        end: '2024-03-14',
      });
    });
  });

  describe('formatDate', () => {
    it('formats date for display', () => {
      const formatted = formatDate('2024-03-15');
      expect(formatted).toContain('Mar');
      expect(formatted).toContain('15');
      expect(formatted).toContain('2024');
    });
  });

  describe('describeTimeWindow', () => {
    it('returns "today" for today\'s date', () => {
      expect(describeTimeWindow('2024-03-15', '2024-03-15')).toBe('today');
    });

    it('returns "yesterday" for yesterday\'s date', () => {
      expect(describeTimeWindow('2024-03-14', '2024-03-14')).toBe('yesterday');
    });

    it('returns formatted date for other single days', () => {
      const result = describeTimeWindow('2024-03-10', '2024-03-10');
      expect(result).toContain('Mar');
      expect(result).toContain('10');
    });

    it('returns date range for different start and end', () => {
      const result = describeTimeWindow('2024-03-10', '2024-03-15');
      expect(result).toContain('to');
    });
  });
});
