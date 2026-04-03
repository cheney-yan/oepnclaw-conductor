import OpenAI from 'openai';

export interface MemoryArtifact {
  decisions: string[];
  tasks_done: string[];
  open_items: string[];
  key_info: string[];
}

export interface SummaryResult {
  summary: string;
  memory: MemoryArtifact;
}

function createClient(): OpenAI {
  // OpenAI SDK automatically reads OPENAI_API_KEY and OPENAI_BASE_URL from env
  return new OpenAI();
}

const MODEL = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';

const SUMMARY_PROMPT = `You are a helpful assistant summarizing a work thread from a Discord channel.

Analyze the conversation and return a JSON object with this exact structure:
{
  "summary": "A 2-4 sentence prose summary of what happened in this thread",
  "memory": {
    "decisions": ["list of decisions made"],
    "tasks_done": ["list of tasks completed"],
    "open_items": ["list of unresolved items or follow-ups"],
    "key_info": ["list of key facts, links, or reference info worth remembering"]
  }
}

Return ONLY valid JSON. No markdown, no code fences, no extra text.`;

export async function summarizeThread(messages: { author: string; content: string }[]): Promise<SummaryResult> {
  if (messages.length === 0) {
    return {
      summary: 'No messages to summarize.',
      memory: { decisions: [], tasks_done: [], open_items: [], key_info: [] },
    };
  }

  const transcript = messages
    .map((m) => `${m.author}: ${m.content}`)
    .join('\n');

  const client = createClient();
  const response = await client.chat.completions.create({
    model: MODEL,
    max_tokens: 1024,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SUMMARY_PROMPT },
      { role: 'user', content: `Thread transcript:\n${transcript}` },
    ],
  });

  const text = response.choices[0]?.message?.content ?? '{}';
  return JSON.parse(text) as SummaryResult;
}
