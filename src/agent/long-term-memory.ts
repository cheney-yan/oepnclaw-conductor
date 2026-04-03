import fs from 'fs';
import path from 'path';

function memoryDir(): string {
  return path.resolve(process.env.MEMORY_PATH ?? './data/memory');
}

function summaryFile(): string {
  return path.join(memoryDir(), 'SUMMARY.md');
}

function blockFile(ts: string): string {
  return path.join(memoryDir(), `${ts}.md`);
}

function ensureDir(): void {
  fs.mkdirSync(memoryDir(), { recursive: true });
}

// ── Summary (index of all memory blocks) ─────────────────────────────────────

/** Load one-line memory summary. Loaded into system prompt as cache BP 2. */
export function loadMemorySummary(): string {
  const file = summaryFile();
  if (!fs.existsSync(file)) return '';
  return fs.readFileSync(file, 'utf-8').trim();
}

/** Append one line to SUMMARY.md. */
export function appendMemorySummary(line: string): void {
  ensureDir();
  const ts = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const entry = `- [${ts}] ${line.trim()}\n`;
  fs.appendFileSync(summaryFile(), entry, 'utf-8');
}

// ── Memory blocks (detailed, read on demand) ──────────────────────────────────

/** Write a new memory block file. Returns the filename (without path). */
export function writeMemoryBlock(content: string): string {
  ensureDir();
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${ts}.md`;
  fs.writeFileSync(path.join(memoryDir(), filename), content.trim() + '\n', 'utf-8');
  return filename;
}

/** List all memory block filenames (sorted oldest first). */
export function listMemoryBlocks(): string[] {
  const dir = memoryDir();
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.md') && f !== 'SUMMARY.md')
    .sort();
}

/** Read a specific memory block by filename. */
export function readMemoryBlock(filename: string): string {
  const safe = path.basename(filename); // prevent path traversal
  const file = path.join(memoryDir(), safe);
  if (!fs.existsSync(file)) return `(block "${safe}" not found)`;
  return fs.readFileSync(file, 'utf-8');
}

// ── Legacy shims (used by tools + interaction handler) ────────────────────────

/** @deprecated Use loadMemorySummary() + readMemoryBlock() instead. */
export function loadLongTermMemory(): string {
  return loadMemorySummary();
}

/** @deprecated Use writeMemoryBlock() + appendMemorySummary() instead. */
export function writeLongTermMemory(content: string): void {
  ensureDir();
  // Treat as a manual memory block write — extract first line as summary
  const lines = content.trim().split('\n').filter(Boolean);
  const summary = lines[0]?.replace(/^#+\s*/, '').slice(0, 120) ?? 'manual memory update';
  const filename = writeMemoryBlock(content);
  appendMemorySummary(`${summary} (→ ${filename})`);
}
