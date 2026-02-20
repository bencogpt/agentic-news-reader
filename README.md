# Agentic News Reader

An AI-powered news research assistant that searches, reads, and synthesizes news articles to answer your questions. Watch the research process happen live in a transparent chat interface.

## Features

- **Multi-agent architecture**: Three specialized agents work together
  - **UFA (User-Facing Agent)**: Understands your intent and creates research tasks
  - **Analyst**: Decides if enough information is gathered or more research is needed
  - **Summarizer**: Searches news, reads articles, and extracts structured notes

- **Real-time research visibility**: See every step of the research process
  - Search queries being executed
  - Articles being read
  - Notes being extracted
  - Summary evolving

- **Smart intent understanding**: Handles relative dates and various question types
  - "Where was Trump yesterday?" → location tracking
  - "What happened last week?" → timeline
  - "Compare Apple and Google" → comparison

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Language**: TypeScript
- **Database**: Vercel Postgres via Prisma ORM
- **AI**: OpenAI GPT-4o-mini
- **News Source**: NewsAPI.org
- **Real-time**: Server-Sent Events (SSE)
- **Styling**: Tailwind CSS

## Setup

### Prerequisites

- Node.js 18+
- A Vercel account (for database)
- OpenAI API key
- NewsAPI.org API key

### 1. Clone and Install

```bash
git clone <your-repo>
cd agentic-news-reader
npm install
```

### 2. Set up Vercel Postgres

1. Go to [vercel.com](https://vercel.com) and create a new project
2. In your project, go to **Storage** → **Create Database** → **Postgres**
3. Once created, go to the **Quickstart** tab
4. Copy the `DATABASE_URL` from the `.env.local` section

### 3. Configure Environment

Create/update `.env.local`:

```env
# Database - paste from Vercel Postgres
DATABASE_URL="postgres://..."

# OpenAI API key
OPENAI_API_KEY="sk-..."

# NewsAPI key (get from newsapi.org)
NEWS_API_KEY="..."
```

### 4. Initialize Database

```bash
npm run db:push
```

### 5. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Usage

1. Type a question about news, e.g., "Where was Trump yesterday?"
2. Watch as the system:
   - Creates a research task
   - Generates search queries
   - Finds relevant articles
   - Reads and extracts information
   - Synthesizes a final answer with citations

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/chat/send` | POST | Send a message and get response |
| `/api/stream` | GET | SSE endpoint for real-time events |
| `/api/events` | GET | Polling endpoint for events |
| `/api/conversations` | GET/POST | List or create conversations |
| `/api/conversations/[id]` | GET/DELETE | Get or delete a conversation |
| `/api/agents/analyst/run` | POST | Manually trigger analyst |
| `/api/agents/summarizer/run` | POST | Manually trigger summarizer |
| `/api/cron` | GET | Background worker (runs every minute) |

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         Chat UI                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Messages + Research Progress + Final Response      │   │
│  └─────────────────────────────────────────────────────┘   │
└───────────────────────────┬─────────────────────────────────┘
                            │ SSE
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    POST /api/chat/send                       │
│                            │                                 │
│                            ▼                                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │           User-Facing Agent (UFA)                    │   │
│  │  - Understands intent                                │   │
│  │  - Asks clarifications                               │   │
│  │  - Creates/updates tasks                             │   │
│  └────────────────────────┬────────────────────────────┘   │
│                            │                                 │
│                            ▼                                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Analyst Agent                           │   │
│  │  - Evaluates information sufficiency                 │   │
│  │  - Generates search queries                          │   │
│  │  - Produces final answers with citations            │   │
│  └────────────────────────┬────────────────────────────┘   │
│                            │                                 │
│                            ▼                                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │            Summarizer Agent                          │   │
│  │  - Searches NewsAPI                                  │   │
│  │  - Downloads & extracts articles                     │   │
│  │  - Generates structured notes                        │   │
│  │  - Creates synthesized summary                       │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## Database Schema

- **Conversation**: Chat sessions
- **Message**: User and assistant messages
- **Task**: Research tasks with status tracking
- **TaskRequest**: History of user requests per task
- **SearchIteration**: Individual search cycles
- **AgentEvent**: All events for real-time tracking

## Testing

```bash
npm test           # Run all tests
npm run test:watch # Watch mode
```

## Deployment

### Vercel (Recommended)

1. Push to GitHub
2. Import project in Vercel
3. Add environment variables in Vercel dashboard
4. Deploy

The cron job will run automatically every minute to process pending work.

### Manual Deployment

```bash
npm run build
npm start
```

## Configuration

### Max Iterations

The analyst limits research to 5 iterations to prevent infinite loops. Adjust in `src/lib/agents/analyst.ts`:

```typescript
const MAX_ITERATIONS = 5;
```

### Rate Limiting

NewsAPI free tier: 1 request/second. Adjust in `src/lib/services/newsapi.ts`.

## License

MIT
