import fs from 'fs';
import path from 'path';

function memoryFile(): string {
  return path.resolve(process.env.MEMORY_PATH ?? './data/memory/MEMORY.md');
}

export function loadLongTermMemory(): string {
  const file = memoryFile();
  if (!fs.existsSync(file)) return '';
  return fs.readFileSync(file, 'utf-8').trim();
}

export function writeLongTermMemory(content: string): void {
  const file = memoryFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content.trim() + '\n', 'utf-8');
}
