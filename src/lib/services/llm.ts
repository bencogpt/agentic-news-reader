import OpenAI from 'openai';

let openaiClient: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!openaiClient) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is not configured');
    }
    openaiClient = new OpenAI({ apiKey, timeout: 30000 });
  }
  return openaiClient;
}

interface CompletionOptions {
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
}

export async function generateCompletion(options: CompletionOptions): Promise<string> {
  const openai = getOpenAI();

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: options.systemPrompt },
      { role: 'user', content: options.userPrompt },
    ],
    temperature: options.temperature ?? 0.3,
    max_tokens: options.maxTokens ?? 2048,
    response_format: options.jsonMode ? { type: 'json_object' } : undefined,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('No content in LLM response');
  }

  return content;
}

interface ConversationMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export async function generateConversation(
  messages: ConversationMessage[],
  options?: { temperature?: number; maxTokens?: number; jsonMode?: boolean }
): Promise<string> {
  const openai = getOpenAI();

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages,
    temperature: options?.temperature ?? 0.3,
    max_tokens: options?.maxTokens ?? 2048,
    response_format: options?.jsonMode ? { type: 'json_object' } : undefined,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('No content in LLM response');
  }

  return content;
}

export async function parseJsonResponse<T>(response: string): Promise<T> {
  try {
    // Try to extract JSON from the response if it's wrapped in markdown
    let jsonStr = response;
    const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    }
    return JSON.parse(jsonStr) as T;
  } catch {
    throw new Error(`Failed to parse JSON response: ${response.substring(0, 200)}`);
  }
}
