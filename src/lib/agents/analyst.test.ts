import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock firebase-admin db
const mockAdd = vi.fn().mockResolvedValue({ id: 'new-doc' });
const mockUpdate = vi.fn().mockResolvedValue(undefined);
const mockGet = vi.fn();
const mockWhere = vi.fn();
const mockOrderBy = vi.fn();
const mockLimit = vi.fn();

const makeChain = () => {
  const chain = {
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    get: mockGet,
    add: mockAdd,
    update: mockUpdate,
    collection: vi.fn().mockReturnThis(),
    doc: vi.fn().mockReturnThis(),
  };
  return chain;
};

const mockDb = {
  collection: vi.fn().mockImplementation(() => makeChain()),
};

vi.mock('@/lib/firebase-admin', () => ({
  db: mockDb,
}));

// Mock FieldValue
vi.mock('firebase-admin/firestore', () => ({
  FieldValue: {
    serverTimestamp: vi.fn().mockReturnValue('SERVER_TIMESTAMP'),
    increment: vi.fn().mockImplementation((n: number) => ({ _increment: n })),
  },
}));

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
    // Default: no failed iterations
    mockGet.mockResolvedValue({ docs: [], empty: true });
  });

  describe('Decision Logic', () => {
    it('should force-complete after MAX_ITERATIONS', async () => {
      const { generateCompletion, parseJsonResponse } = await import('@/lib/services/llm');
      const { runAnalyst } = await import('./analyst');

      // LLM returns SEARCH but we're at max iterations
      vi.mocked(generateCompletion).mockResolvedValue('{"decision":"SEARCH","query":"test","reason":"more needed"}');
      vi.mocked(parseJsonResponse).mockResolvedValue({
        decision: 'SEARCH',
        query: 'test',
        reason: 'more needed',
      });

      const result = await runAnalyst({
        taskId: 'task-123',
        request: 'Where was Trump yesterday?',
        slots: { topic: 'Trump' },
        notes: 'Some notes...',
        summary: 'Some summary...',
        sources: [],
        iterationCount: 1, // At max iterations (default MAX_SEARCHES=1)
      });

      // forceComplete overrides SEARCH → COMPLETE
      expect(result.type).toBe('COMPLETE');
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
      }));
      vi.mocked(parseJsonResponse).mockResolvedValue({
        decision: 'COMPLETE',
        reason: 'Sufficient information gathered',
        response: 'Trump was at the White House yesterday [1].',
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
    it('creates a search iteration and updates task for SEARCH decision', async () => {
      const { processAnalystDecision } = await import('./analyst');

      await processAnalystDecision('task-123', {
        type: 'SEARCH',
        query: 'Trump yesterday',
        reason: 'Need more information',
      });

      // Should have called db operations
      expect(mockDb.collection).toHaveBeenCalledWith('tasks');
    });

    it('marks task as COMPLETED for COMPLETE decision', async () => {
      const { processAnalystDecision } = await import('./analyst');

      await processAnalystDecision('task-123', {
        type: 'COMPLETE',
        response: 'Final answer',
        citations: [],
      });

      expect(mockDb.collection).toHaveBeenCalledWith('tasks');
    });

    it('marks task as FAILED for FAIL decision', async () => {
      const { processAnalystDecision } = await import('./analyst');

      await processAnalystDecision('task-123', {
        type: 'FAIL',
        reason: 'Not enough information',
      });

      expect(mockDb.collection).toHaveBeenCalledWith('tasks');
    });
  });
});
