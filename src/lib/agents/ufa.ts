import { db } from '../firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { generateCompletion, parseJsonResponse } from '../services/llm';
import { emitEvent } from '../services/events';
import { IntentSlots, UFAAction } from '../types';
import { getToday, getYesterday, resolveTimeWindow } from '../utils/dates';

const UFA_SYSTEM_PROMPT = `You are a User-Facing Agent (UFA) for an agentic news research assistant.

Your job is to understand user requests about news and convert them into structured research tasks.
You do NOT research news yourself. You extract the user's intent and create tasks for research agents.

For each user message, you must determine if you have enough information to create a research task.

A complete research task requires these INTENT SLOTS:
1. TOPIC/ENTITY: Who or what the user is asking about (e.g., "Trump", "Apple", "climate change") - REQUIRED
2. TIME WINDOW: When they want information from - OPTIONAL (system auto-applies last 20 days)
3. OUTPUT TYPE: What kind of answer they want - OPTIONAL (defaults to summary):
   - summary: A concise overview
   - timeline: Chronological events
   - comparison: Contrasting different aspects
   - location_tracking: Where someone/something was
   - explanation: Why something happened
   - what_happened: Detailed event description
   - current_status: Latest state of affairs

IMPORTANT - NEVER ASK ABOUT TIME:
- The system automatically searches the last 20 days of news
- Do NOT ask the user to specify a time frame
- Do NOT ask "when" or "what time period"
- Just proceed with the research using the topic provided

CONVERSATION RULES:
- If the TOPIC is clear, CREATE THE TASK IMMEDIATELY - do not ask clarifying questions
- Only ask clarification if the topic itself is completely unclear
- Be conversational but brief
- If the user modifies their request, update the existing task
- If the user asks about something completely new, create a new task
- When in doubt, just start the research - don't ask questions

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
→ topic=Trump, outputType=location_tracking
→ CREATE_TASK immediately

User: "What happened?"
→ Topic unclear
→ ASK_CLARIFICATION: "What topic would you like to know about?"

User: "Tell me about Apple"
→ topic=Apple, outputType=summary
→ CREATE_TASK immediately (system will search last 20 days)

User: "What's the latest on the war in Ukraine?"
→ topic=Ukraine war, outputType=current_status
→ CREATE_TASK immediately

User: "What new evidence has emerged in Trump's legal cases?"
→ topic=Trump legal cases, outputType=what_happened
→ CREATE_TASK immediately (do NOT ask about timeframe)`;

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
  const messages: Message[] = [
    { role: 'system', content: UFA_SYSTEM_PROMPT },
  ];

  for (const msg of conversationHistory.slice(-10)) {
    messages.push({
      role: msg.role === 'user' ? 'user' : 'assistant',
      content: msg.text,
    });
  }

  messages.push({ role: 'user', content: userMessage });

  // Get conversation and most recent task
  const [convDoc, tasksSnapshot] = await Promise.all([
    db.collection('conversations').doc(conversationId).get(),
    db.collection('tasks')
      .where('conversationId', '==', conversationId)
      .orderBy('createdAt', 'desc')
      .limit(1)
      .get(),
  ]);

  const activeTask = tasksSnapshot.empty ? null : { id: tasksSnapshot.docs[0].id, ...tasksSnapshot.docs[0].data() } as {
    id: string;
    title?: string;
    status: string;
    currentRequest?: string;
  };

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

  // Suppress unused variable warning
  void convDoc;

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

  switch (parsed.action) {
    case 'CREATE_TASK': {
      const slots: IntentSlots = {
        topic: parsed.slots?.topic,
        timeWindow: parsed.slots?.timeWindow,
        outputType: parsed.slots?.outputType as IntentSlots['outputType'],
      };

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
        await db.collection('conversations').doc(conversationId).update({
          activeTaskId: parsed.taskId,
          updatedAt: FieldValue.serverTimestamp(),
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
  const taskData = {
    conversationId,
    status: 'ACTIVE',
    title,
    currentRequest: userMessage,
    context: slots,
    lastUserMessageAt: FieldValue.serverTimestamp(),
    iterationCount: 0,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };

  const taskRef = await db.collection('tasks').add(taskData);

  await taskRef.collection('taskRequests').add({
    taskId: taskRef.id,
    text: userMessage,
    createdAt: FieldValue.serverTimestamp(),
  });

  await db.collection('conversations').doc(conversationId).update({
    activeTaskId: taskRef.id,
    updatedAt: FieldValue.serverTimestamp(),
  });

  await emitEvent(taskRef.id, 'UFA', 'TASK_CREATED', {
    title,
    request: userMessage,
    slots,
  });

  return { id: taskRef.id };
}

async function updateTask(
  taskId: string,
  slots: Partial<IntentSlots>,
  userMessage: string
) {
  const taskDoc = await db.collection('tasks').doc(taskId).get();

  if (!taskDoc.exists) {
    throw new Error(`Task ${taskId} not found`);
  }

  const existingContext = (taskDoc.data()?.context as IntentSlots) || {};
  const newContext = { ...existingContext, ...slots };

  const taskRef = db.collection('tasks').doc(taskId);

  await taskRef.update({
    currentRequest: userMessage,
    context: newContext,
    lastUserMessageAt: FieldValue.serverTimestamp(),
    status: 'ACTIVE',
    updatedAt: FieldValue.serverTimestamp(),
  });

  await taskRef.collection('taskRequests').add({
    taskId,
    text: userMessage,
    createdAt: FieldValue.serverTimestamp(),
  });

  await emitEvent(taskId, 'UFA', 'TASK_UPDATED', {
    changes: JSON.stringify(slots),
    newRequest: userMessage,
  });
}

export function parseIntentFromMessage(message: string): Partial<IntentSlots> {
  const lower = message.toLowerCase();
  const slots: Partial<IntentSlots> = {};

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
