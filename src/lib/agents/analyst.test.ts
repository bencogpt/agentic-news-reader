import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the dependencies
vi.mock('@/lib/services/llm', () => ({
  generateCompletion: vi.fn(),
  parseJsonResponse: vi.fn(),
}));

vi.mock('@/lib/services/events', () => ({
  emitEvent: vi.fn().mockResolvedValue('event-id'),
}));

describe('Analyst Agent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Decision Logic', () => {
    it('should fail after MAX_ITERATIONS', async () => {
      const { runAnalyst } = await import('./analyst');

      const result = await runAnalyst({
        taskId: 'task-123',
        request: 'Where was Trump yesterday?',
        slots: { topic: 'Trump' },
        notes: 'Some notes...',
        summary: 'Some summary...',
        sources: [],
        iterationCount: 5, // At max iterations
      });

      expect(result.type).toBe('FAIL');
      expect(result.reason).toContain('Research limit reached');
    });

    it('should search when no notes available on first iteration', async () => {
      const { generateCompletion, parseJsonResponse } = await import('@/lib/services/llm');
      const { runAnalyst } = await import('./analyst');

      vi.mocked(generateCompletion).mockResolvedValue('{"decision":"SEARCH","query":"Trump location yesterday","reason":"Need initial search"}');
      vi.mocked(parseJsonResponse).mockResolvedValue({
        decision: 'SEARCH',
        query: 'Trump location yesterday',
        reason: 'Need initial search',
      });

      const result = await runAnalyst({
        taskId: 'task-123',
        request: 'Where was Trump yesterday?',
        slots: { topic: 'Trump' },
        notes: null,
        summary: null,
        sources: [],
        iterationCount: 0,
      });

      expect(result.type).toBe('SEARCH');
      if (result.type === 'SEARCH') {
        expect(result.query).toBe('Trump location yesterday');
      }
    });

    it('should complete when sufficient information is available', async () => {
      const { generateCompletion, parseJsonResponse } = await import('@/lib/services/llm');
      const { runAnalyst } = await import('./analyst');

      vi.mocked(generateCompletion).mockResolvedValue(JSON.stringify({
        decision: 'COMPLETE',
        reason: 'Sufficient information gathered',
        response: 'Trump was at the White House yesterday [1].',
        citations: [
          { number: 1, title: 'Trump White House Visit', url: 'https://news.com/1', source: 'News' }
        ],
      }));
      vi.mocked(parseJsonResponse).mockResolvedValue({
        decision: 'COMPLETE',
        reason: 'Sufficient information gathered',
        response: 'Trump was at the White House yesterday [1].',
        citations: [
          { number: 1, title: 'Trump White House Visit', url: 'https://news.com/1', source: 'News' }
        ],
      });

      const result = await runAnalyst({
        taskId: 'task-123',
        request: 'Where was Trump yesterday?',
        slots: { topic: 'Trump', timeWindow: { start: '2024-03-14', end: '2024-03-14' } },
        notes: 'Trump visited the White House...',
        summary: 'Trump was at the White House for meetings...',
        sources: [{ title: 'Trump White House Visit', url: 'https://news.com/1', source: 'News' }],
        iterationCount: 1,
      });

      expect(result.type).toBe('COMPLETE');
      if (result.type === 'COMPLETE') {
        expect(result.response).toContain('White House');
        expect(result.citations).toHaveLength(1);
      }
    });
  });

  describe('processAnalystDecision', () => {
    it('creates a search iteration for SEARCH decision', async () => {
      const { prisma } = await import('@/lib/prisma');
      const { processAnalystDecision } = await import('./analyst');

      vi.mocked(prisma.searchIteration.create).mockResolvedValue({
        id: 'iteration-1',
        taskId: 'task-123',
        query: 'Trump yesterday',
        status: 'PENDING',
        createdAt: new Date(),
        updatedAt: new Date(),
        resultsCount: null,
        selectedArticles: null,
        error: null,
      });

      vi.mocked(prisma.task.update).mockResolvedValue({
        id: 'task-123',
        conversationId: 'conv-1',
        status: 'RESEARCHING',
        iterationCount: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        title: null,
        currentRequest: null,
        notes: null,
        summary: null,
        response: null,
        context: null,
        sources: null,
        lastUserMessageAt: null,
      });

      await processAnalystDecision('task-123', {
        type: 'SEARCH',
        query: 'Trump yesterday',
        reason: 'Need more information',
      });

      expect(prisma.searchIteration.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          taskId: 'task-123',
          query: 'Trump yesterday',
          status: 'PENDING',
        }),
      });

      expect(prisma.task.update).toHaveBeenCalledWith({
        where: { id: 'task-123' },
        data: expect.objectContaining({
          status: 'RESEARCHING',
        }),
      });
    });

    it('marks task as COMPLETED for COMPLETE decision', async () => {
      const { prisma } = await import('@/lib/prisma');
      const { processAnalystDecision } = await import('./analyst');

      vi.mocked(prisma.task.update).mockResolvedValue({
        id: 'task-123',
        conversationId: 'conv-1',
        status: 'COMPLETED',
        response: 'Final answer',
        iterationCount: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        title: null,
        currentRequest: null,
        notes: null,
        summary: null,
        context: null,
        sources: [],
        lastUserMessageAt: null,
      });

      await processAnalystDecision('task-123', {
        type: 'COMPLETE',
        response: 'Final answer',
        citations: [],
      });

      expect(prisma.task.update).toHaveBeenCalledWith({
        where: { id: 'task-123' },
        data: expect.objectContaining({
          status: 'COMPLETED',
          response: 'Final answer',
        }),
      });
    });

    it('marks task as FAILED for FAIL decision', async () => {
      const { prisma } = await import('@/lib/prisma');
      const { processAnalystDecision } = await import('./analyst');

      vi.mocked(prisma.task.update).mockResolvedValue({
        id: 'task-123',
        conversationId: 'conv-1',
        status: 'FAILED',
        response: 'Unable to complete research: Not enough information',
        iterationCount: 5,
        createdAt: new Date(),
        updatedAt: new Date(),
        title: null,
        currentRequest: null,
        notes: null,
        summary: null,
        context: null,
        sources: null,
        lastUserMessageAt: null,
      });

      await processAnalystDecision('task-123', {
        type: 'FAIL',
        reason: 'Not enough information',
      });

      expect(prisma.task.update).toHaveBeenCalledWith({
        where: { id: 'task-123' },
        data: expect.objectContaining({
          status: 'FAILED',
        }),
      });
    });
  });
});
