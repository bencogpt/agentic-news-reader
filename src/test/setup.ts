// Test setup file
import { beforeAll, afterAll, vi } from 'vitest';

// Mock environment variables
beforeAll(() => {
  process.env.NEWS_API_KEY = 'test-api-key';
  process.env.OPENAI_API_KEY = 'test-openai-key';
  process.env.FIREBASE_PROJECT_ID = 'test-project';
  process.env.FIREBASE_CLIENT_EMAIL = 'test@test.iam.gserviceaccount.com';
  process.env.FIREBASE_PRIVATE_KEY = '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----\n';
});

afterAll(() => {
  vi.restoreAllMocks();
});

// Mock firebase-admin globally
const makeChain = () => {
  const chain: Record<string, unknown> = {};
  const methods = ['where', 'orderBy', 'limit', 'collection', 'doc'];
  methods.forEach((m) => {
    chain[m] = vi.fn().mockReturnValue(chain);
  });
  chain['get'] = vi.fn().mockResolvedValue({ docs: [], empty: true });
  chain['add'] = vi.fn().mockResolvedValue({ id: 'new-doc-id' });
  chain['update'] = vi.fn().mockResolvedValue(undefined);
  chain['set'] = vi.fn().mockResolvedValue(undefined);
  chain['delete'] = vi.fn().mockResolvedValue(undefined);
  return chain;
};

vi.mock('@/lib/firebase-admin', () => ({
  db: {
    collection: vi.fn().mockImplementation(() => makeChain()),
    collectionGroup: vi.fn().mockImplementation(() => makeChain()),
    recursiveDelete: vi.fn().mockResolvedValue(undefined),
  },
  admin: {},
}));

vi.mock('firebase-admin/firestore', () => ({
  FieldValue: {
    serverTimestamp: vi.fn().mockReturnValue('SERVER_TIMESTAMP'),
    increment: vi.fn().mockImplementation((n: number) => ({ _increment: n })),
  },
}));
