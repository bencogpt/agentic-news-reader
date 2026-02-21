// Task status enum
export type TaskStatus =
  | 'DRAFT'
  | 'ACTIVE'
  | 'RESEARCHING'
  | 'WAITING_ANALYST'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

// Search iteration status
export type IterationStatus = 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED';

// Agent types
export type AgentType = 'UFA' | 'ANALYST' | 'SUMMARIZER' | 'SYSTEM';

// Event types
export type EventType =
  | 'TASK_CREATED'
  | 'TASK_UPDATED'
  | 'ANALYST_STARTED'
  | 'ANALYST_DECISION'
  | 'SEARCH_QUERY_CREATED'
  | 'SEARCH_STARTED'
  | 'SEARCH_RESULTS'
  | 'ARTICLE_READING_STARTED'
  | 'ARTICLE_READING_DONE'
  | 'ARTICLES_PROCESSED'
  | 'NOTES_UPDATED'
  | 'SUMMARY_UPDATED'
  | 'SEARCH_LIMIT_REACHED'
  | 'RESPONSE_FINALIZED'
  | 'QUERY_ERROR_RETRY'
  | 'ERROR';

// Message role
export type MessageRole = 'user' | 'assistant' | 'system';

// UFA Intent Slots
export interface IntentSlots {
  topic?: string;
  timeWindow?: {
    start: string; // ISO date
    end: string;   // ISO date
  };
  outputType?: 'summary' | 'timeline' | 'comparison' | 'location_tracking' | 'explanation' | 'what_happened' | 'current_status';
}

// UFA Actions
export type UFAAction =
  | { type: 'CREATE_TASK'; slots: IntentSlots; title: string }
  | { type: 'UPDATE_TASK'; taskId: string; slots: Partial<IntentSlots> }
  | { type: 'SET_ACTIVE_TASK'; taskId: string }
  | { type: 'ASK_CLARIFICATION'; question: string }
  | { type: 'RESPOND'; message: string };

// News provider types
export type NewsProvider = 'gnews' | 'newsapi' | 'newsdata' | 'guardian' | 'currents' | 'mediastack';

// Analyst Decision
export type AnalystDecision =
  | { type: 'SEARCH'; query: string; provider: NewsProvider; reason: string }
  | { type: 'COMPLETE'; response: string; citations: Citation[] }
  | { type: 'FAIL'; reason: string };

// Citation
export interface Citation {
  number: number;
  title: string;
  url: string;
  source: string;
}

// Article metadata from NewsAPI
export interface ArticleMeta {
  title: string;
  url: string;
  source: string;
  publishedAt: string;
  description: string | null;
}

// Article with extracted content
export interface ArticleWithContent extends ArticleMeta {
  content: string;
}

// Article notes
export interface ArticleNotes {
  articleUrl: string;
  articleTitle: string;
  notes: {
    whatHappened: string[];
    whoInvolved: string[];
    where: string[];
    when: string[];
    keyFacts: string[];
    uncertainties: string[];
  };
}

// Event payload types
export interface TaskCreatedPayload {
  title: string;
  request: string;
}

export interface TaskUpdatedPayload {
  changes: string;
}

export interface AnalystDecisionPayload {
  decision: string;
  reason?: string;
}

export interface SearchQueryPayload {
  query: string;
}

export interface SearchResultsPayload {
  count: number;
  articles: ArticleMeta[];
}

export interface ArticleReadingPayload {
  articleUrl: string;
  articleTitle: string;
}

export interface NotesUpdatedPayload {
  articleTitle: string;
  notes: ArticleNotes['notes'];
}

export interface SummaryUpdatedPayload {
  summary: string;
}

export interface ResponseFinalizedPayload {
  response: string;
  citations: Citation[];
}

export interface ErrorPayload {
  error: string;
  details?: string;
}

// SSE Event structure for the client
export interface SSEEvent {
  id: string;
  taskId: string;
  iterationId?: string;
  createdAt: string;
  agent: AgentType;
  type: EventType;
  payload: Record<string, unknown>;
}
