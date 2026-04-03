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
