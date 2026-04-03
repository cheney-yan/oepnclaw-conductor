import fs from 'fs';
import path from 'path';

const SESSION_GAP_MS = 4 * 60 * 60 * 1000; // 4 hours

function contextsDir(): string {
  return path.resolve(process.env.CONTEXTS_PATH ?? './data/contexts');
}

function contextFile(sessionId: string): string {
  return path.join(contextsDir(), `${sessionId}.md`);
}

// ── DM session management ────────────────────────────────────────────────────
// DM context files: data/contexts/dm_<channelId>_<timestamp>.md
// Thread context files: data/contexts/<threadId>.md (unchanged)

function dmSessionPrefix(channelId: string): string {
  return `dm_${channelId}_`;
}

/** Find the most recent DM session file for a channel, if any. */
function latestDmSession(channelId: string): { sessionId: string; mtime: Date } | null {
  const dir = contextsDir();
  if (!fs.existsSync(dir)) return null;

  const prefix = dmSessionPrefix(channelId);
  const matches = fs.readdirSync(dir)
    .filter(f => f.startsWith(prefix) && f.endsWith('.md'))
    .map(f => {
      const sessionId = f.slice(0, -3); // strip .md
      const mtime = fs.statSync(path.join(dir, f)).mtime;
      return { sessionId, mtime };
    })
    .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

  return matches[0] ?? null;
}

/** Create a new DM session ID (timestamp-based). */
function newDmSessionId(channelId: string): string {
  return `${dmSessionPrefix(channelId)}${Date.now()}`;
}

/**
 * Resolve the session ID for a DM channel.
 * - If no prior session or last activity >4h ago → new session
 * - Otherwise → reuse existing session
 */
export function resolveDmSession(channelId: string): string {
  const latest = latestDmSession(channelId);
  if (!latest) return newDmSessionId(channelId);

  const ageMs = Date.now() - latest.mtime.getTime();
  if (ageMs > SESSION_GAP_MS) return newDmSessionId(channelId);

  return latest.sessionId;
}

/**
 * Force a new DM session, regardless of age.
 * Returns the new session ID.
 */
export function forceNewDmSession(channelId: string): string {
  return newDmSessionId(channelId);
}

// ── Core context operations ──────────────────────────────────────────────────

export interface ContextMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

/**
 * Parse a context file into structured messages for use as initialState.messages.
 * Handles the "**User** [ts]: ..." / "**Conductor**: ..." Markdown format.
 */
export function parseContextMessages(sessionId: string): ContextMessage[] {
  const file = contextFile(sessionId);
  if (!fs.existsSync(file)) return [];
  const raw = fs.readFileSync(file, 'utf-8');
  const messages: ContextMessage[] = [];

  // Split on separator lines, each block is a user+assistant pair
  const userRe = /^\*\*User\*\*\s*\[([^\]]+)\]:\s*([\s\S]*?)(?=\n\n\*\*Conductor\*\*:)/m;
  const conductorRe = /^\*\*Conductor\*\*:\s*([\s\S]*?)$/m;

  // Walk through blocks separated by ---
  const blocks = raw.split(/^---$/m).map(b => b.trim()).filter(Boolean);
  for (const block of blocks) {
    if (block.startsWith('# Session:')) continue; // header block
    const uMatch = userRe.exec(block);
    const cMatch = conductorRe.exec(block);
    if (uMatch) {
      messages.push({
        role: 'user',
        content: uMatch[2].trim(),
        timestamp: new Date(uMatch[1]).getTime() || Date.now(),
      });
    }
    if (cMatch) {
      messages.push({
        role: 'assistant',
        content: cMatch[1].trim(),
        timestamp: Date.now(),
      });
    }
  }
  return messages;
}

export function loadContext(sessionId: string): string {
  const file = contextFile(sessionId);
  if (!fs.existsSync(file)) return '';
  return fs.readFileSync(file, 'utf-8');
}

export function appendContext(sessionId: string, userMsg: string, assistantMsg: string): void {
  const dir = contextsDir();
  fs.mkdirSync(dir, { recursive: true });

  const file = contextFile(sessionId);
  const ts = new Date().toISOString();

  let content: string;
  if (!fs.existsSync(file)) {
    content = `# Session: ${sessionId}\nStarted: ${ts}\n\n`;
  } else {
    content = fs.readFileSync(file, 'utf-8');
  }

  content += `---\n\n**User** [${ts}]: ${userMsg}\n\n**Conductor**: ${assistantMsg}\n\n`;
  fs.writeFileSync(file, content, 'utf-8');
}
