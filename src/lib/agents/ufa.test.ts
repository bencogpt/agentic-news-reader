import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseIntentFromMessage } from './ufa';

describe('UFA Intent Parsing', () => {
  // Mock the current date
  const mockDate = new Date('2024-03-15T12:00:00Z');

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(mockDate);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('parseIntentFromMessage', () => {
    describe('time window extraction', () => {
      it('extracts "yesterday" time window', () => {
        const result = parseIntentFromMessage('What happened yesterday?');
        expect(result.timeWindow).toEqual({
          start: '2024-03-14',
          end: '2024-03-14',
        });
      });

      it('extracts "today" time window', () => {
        const result = parseIntentFromMessage('News from today');
        expect(result.timeWindow).toEqual({
          start: '2024-03-15',
          end: '2024-03-15',
        });
      });

      it('extracts "last week" time window', () => {
        const result = parseIntentFromMessage('Summary of last week');
        expect(result.timeWindow).toBeDefined();
        expect(result.timeWindow?.start).toBeDefined();
        expect(result.timeWindow?.end).toBeDefined();
      });

      it('extracts "this week" time window', () => {
        const result = parseIntentFromMessage('What happened this week?');
        expect(result.timeWindow).toBeDefined();
      });
    });

    describe('output type extraction', () => {
      it('identifies location_tracking from "where was"', () => {
        const result = parseIntentFromMessage('Where was Trump yesterday?');
        expect(result.outputType).toBe('location_tracking');
      });

      it('identifies what_happened from "what happened"', () => {
        const result = parseIntentFromMessage('What happened with Apple?');
        expect(result.outputType).toBe('what_happened');
      });

      it('identifies timeline from "timeline"', () => {
        const result = parseIntentFromMessage('Give me a timeline of events');
        expect(result.outputType).toBe('timeline');
      });

      it('identifies comparison from "compare"', () => {
        const result = parseIntentFromMessage('Compare Apple and Google');
        expect(result.outputType).toBe('comparison');
      });

      it('identifies explanation from "why"', () => {
        const result = parseIntentFromMessage('Why did the market crash?');
        expect(result.outputType).toBe('explanation');
      });

      it('identifies current_status from "latest"', () => {
        const result = parseIntentFromMessage("What's the latest on AI?");
        expect(result.outputType).toBe('current_status');
      });

      it('identifies summary from "summary"', () => {
        const result = parseIntentFromMessage('Give me a summary of tech news');
        expect(result.outputType).toBe('summary');
      });
    });

    describe('combined extraction', () => {
      it('extracts both time and output type', () => {
        const result = parseIntentFromMessage('Where was Trump yesterday?');
        expect(result.timeWindow).toEqual({
          start: '2024-03-14',
          end: '2024-03-14',
        });
        expect(result.outputType).toBe('location_tracking');
      });
    });
  });
});
