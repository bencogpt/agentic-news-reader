import { prisma } from '../prisma';
import { generateCompletion, parseJsonResponse } from '../services/llm';
import { emitEvent } from '../services/events';
import { IntentSlots, UFAAction } from '../types';
import { getToday, getYesterday, resolveTimeWindow } from '../utils/dates';

const UFA_SYSTEM_PROMPT = `You are a User-Facing Agent (UFA) for an agentic news research assistant.

Your job is to understand user requests about news and convert them into structured research tasks.
You do NOT research news yourself. You extract the user's intent and create tasks for research agents.

For each user message, you must determine if you have enough information to create a research task.

A complete research task requires these INTENT SLOTS:
1. TOPIC/ENTITY: Who or what the user is asking about (e.g., "Trump", "Apple", "climate change")
2. TIME WINDOW: When they want information from (e.g., "yesterday", "last week", "2024-01-15")
3. OUTPUT TYPE: What kind of answer they want:
   - summary: A concise overview
   - timeline: Chronological events
   - comparison: Contrasting different aspects
   - location_tracking: Where someone/something was
   - explanation: Why something happened
   - what_happened: Detailed event description
   - current_status: Latest state of affairs

IMPORTANT TIME HANDLING:
- Today's date is: ${getToday()}
- Yesterday's date is: ${getYesterday()}
- Convert relative times to absolute dates:
  - "yesterday" → specific date
  - "today" → specific date
  - "last week" → date range
  - "3 days ago" → specific date

CONVERSATION RULES:
- If all slots are clear, create the task immediately
- If any slot is missing or ambiguous, ask ONE clarification question
- Be conversational but brief
- If the user modifies their request, update the existing task
- If the user asks about something completely new, create a new task

You must respond with a JSON object with this structure:
{
  "action": "CREATE_TASK" | "UPDATE_TASK" | "SET_ACTIVE_TASK" | "ASK_CLARIFICATION" | "RESPOND",
  "taskId": "string or null (for UPDATE_TASK/SET_ACTIVE_TASK)",
  "slots": {
    "topic": "string or null",
    "timeWindow": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" } | null,
    "outputType": "summary|timeline|comparison|location_tracking|explanation|what_happened|current_status" | null
  },
  "title": "short task title (for CREATE_TASK)",
  "message": "response message to user"
}

Examples:

User: "Where was Trump yesterday?"
→ All slots present: topic=Trump, timeWindow=yesterday, outputType=location_tracking
→ CREATE_TASK

User: "What happened?"
→ Missing: topic, timeWindow
→ ASK_CLARIFICATION: "What topic would you like to know about, and when?"

User: "Tell me about Apple"
→ Missing: timeWindow, outputType unclear
→ ASK_CLARIFICATION: "When would you like news about Apple from? (e.g., today, yesterday, this week)"

User: "What's the latest on the war in Ukraine?"
→ topic=Ukraine war, timeWindow=recent (use last 3 days), outputType=current_status
→ CREATE_TASK`;

interface UFAResponse {
  action: 'CREATE_TASK' | 'UPDATE_TASK' | 'SET_ACTIVE_TASK' | 'ASK_CLARIFICATION' | 'RESPOND';
  taskId?: string;
  slots?: {
    topic?: string;
    timeWindow?: { start: string; end: string };
    outputType?: string;
  };
  title?: string;
  message: string;
}

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export async function runUFA(
  conversationId: string,
  userMessage: string,
  conversationHistory: Array<{ role: string; text: string }>
): Promise<{
  action: UFAAction;
  response: string;
  taskId?: string;
}> {
  // Build conversation context for LLM
  const messages: Message[] = [
    { role: 'system', content: UFA_SYSTEM_PROMPT },
  ];

  // Add conversation history
  for (const msg of conversationHistory.slice(-10)) {
    messages.push({
      role: msg.role === 'user' ? 'user' : 'assistant',
      content: msg.text,
    });
  }

  // Add current message
  messages.push({ role: 'user', content: userMessage });

  // Get active task for context
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      tasks: {
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  });

  const activeTask = conversation?.tasks[0];

  // Add context about active task if exists
  if (activeTask) {
    messages.push({
      role: 'system',
      content: `CONTEXT: There is an active task with ID "${activeTask.id}":
- Title: ${activeTask.title || 'untitled'}
- Status: ${activeTask.status}
- Current request: ${activeTask.currentRequest || 'none'}
If the user is modifying this request, use UPDATE_TASK with this taskId.`,
    });
  }

  // Generate response
  const responseText = await generateCompletion({
    systemPrompt: messages.find((m) => m.role === 'system')!.content,
    userPrompt: messages
      .filter((m) => m.role !== 'system')
      .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
      .join('\n\n'),
    jsonMode: true,
    temperature: 0.3,
  });

  const parsed = await parseJsonResponse<UFAResponse>(responseText);

  // Handle different actions
  switch (parsed.action) {
    case 'CREATE_TASK': {
      const slots: IntentSlots = {
        topic: parsed.slots?.topic,
        timeWindow: parsed.slots?.timeWindow,
        outputType: parsed.slots?.outputType as IntentSlots['outputType'],
      };

      // Resolve time window if it's a relative expression
      if (!slots.timeWindow && parsed.slots?.timeWindow) {
        const resolved = resolveTimeWindow(
          `${parsed.slots.timeWindow.start} to ${parsed.slots.timeWindow.end}`
        );
        if (resolved) {
          slots.timeWindow = resolved;
        }
      }

      const task = await createTask(
        conversationId,
        slots,
        parsed.title || `Research: ${slots.topic || 'News'}`,
        userMessage
      );

      return {
        action: { type: 'CREATE_TASK', slots, title: parsed.title || '' },
        response: parsed.message,
        taskId: task.id,
      };
    }

    case 'UPDATE_TASK': {
      const updateSlots: Partial<IntentSlots> = {
        topic: parsed.slots?.topic,
        timeWindow: parsed.slots?.timeWindow,
        outputType: parsed.slots?.outputType as IntentSlots['outputType'],
      };
      if (parsed.taskId && parsed.slots) {
        await updateTask(parsed.taskId, updateSlots, userMessage);
      }
      return {
        action: {
          type: 'UPDATE_TASK',
          taskId: parsed.taskId || '',
          slots: updateSlots,
        },
        response: parsed.message,
        taskId: parsed.taskId,
      };
    }

    case 'SET_ACTIVE_TASK': {
      if (parsed.taskId) {
        await prisma.conversation.update({
          where: { id: conversationId },
          data: { activeTaskId: parsed.taskId },
        });
      }
      return {
        action: { type: 'SET_ACTIVE_TASK', taskId: parsed.taskId || '' },
        response: parsed.message,
        taskId: parsed.taskId,
      };
    }

    case 'ASK_CLARIFICATION': {
      return {
        action: { type: 'ASK_CLARIFICATION', question: parsed.message },
        response: parsed.message,
      };
    }

    case 'RESPOND':
    default: {
      return {
        action: { type: 'RESPOND', message: parsed.message },
        response: parsed.message,
      };
    }
  }
}

async function createTask(
  conversationId: string,
  slots: IntentSlots,
  title: string,
  userMessage: string
) {
  const task = await prisma.task.create({
    data: {
      conversationId,
      status: 'ACTIVE',
      title,
      currentRequest: userMessage,
      context: slots as object,
      lastUserMessageAt: new Date(),
      requests: {
        create: {
          text: userMessage,
        },
      },
    },
  });

  // Update conversation active task
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { activeTaskId: task.id },
  });

  // Emit event
  await emitEvent(task.id, 'UFA', 'TASK_CREATED', {
    title,
    request: userMessage,
    slots,
  });

  return task;
}

async function updateTask(
  taskId: string,
  slots: Partial<IntentSlots>,
  userMessage: string
) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
  });

  if (!task) {
    throw new Error(`Task ${taskId} not found`);
  }

  // Merge slots with existing context
  const existingContext = (task.context as IntentSlots) || {};
  const newContext = { ...existingContext, ...slots };

  await prisma.task.update({
    where: { id: taskId },
    data: {
      currentRequest: userMessage,
      context: newContext as object,
      lastUserMessageAt: new Date(),
      status: 'ACTIVE', // Reset to ACTIVE for new processing
      requests: {
        create: {
          text: userMessage,
        },
      },
    },
  });

  // Emit event
  await emitEvent(taskId, 'UFA', 'TASK_UPDATED', {
    changes: JSON.stringify(slots),
    newRequest: userMessage,
  });
}

export function parseIntentFromMessage(message: string): Partial<IntentSlots> {
  const lower = message.toLowerCase();
  const slots: Partial<IntentSlots> = {};

  // Time patterns
  if (lower.includes('yesterday')) {
    const yesterday = getYesterday();
    slots.timeWindow = { start: yesterday, end: yesterday };
  } else if (lower.includes('today')) {
    const today = getToday();
    slots.timeWindow = { start: today, end: today };
  } else if (lower.includes('last week')) {
    const resolved = resolveTimeWindow('last week');
    if (resolved) slots.timeWindow = resolved;
  } else if (lower.includes('this week')) {
    const resolved = resolveTimeWindow('this week');
    if (resolved) slots.timeWindow = resolved;
  }

  // Output type patterns
  if (lower.includes('where was') || lower.includes('location')) {
    slots.outputType = 'location_tracking';
  } else if (lower.includes('what happened') || lower.includes('what\'s happening')) {
    slots.outputType = 'what_happened';
  } else if (lower.includes('timeline') || lower.includes('chronolog')) {
    slots.outputType = 'timeline';
  } else if (lower.includes('compare') || lower.includes('vs') || lower.includes('versus')) {
    slots.outputType = 'comparison';
  } else if (lower.includes('explain') || lower.includes('why')) {
    slots.outputType = 'explanation';
  } else if (lower.includes('latest') || lower.includes('current') || lower.includes('status')) {
    slots.outputType = 'current_status';
  } else if (lower.includes('summary') || lower.includes('summarize')) {
    slots.outputType = 'summary';
  }

  return slots;
}
