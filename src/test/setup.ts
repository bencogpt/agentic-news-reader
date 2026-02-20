// Test setup file
import { beforeAll, afterAll, vi } from 'vitest';

// Mock environment variables
beforeAll(() => {
  process.env.NEWS_API_KEY = 'test-api-key';
  process.env.OPENAI_API_KEY = 'test-openai-key';
  process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
});

afterAll(() => {
  vi.restoreAllMocks();
});

// Mock Prisma globally
vi.mock('@/lib/prisma', () => ({
  prisma: {
    conversation: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    message: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    task: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    taskRequest: {
      create: vi.fn(),
    },
    searchIteration: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    agentEvent: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));
