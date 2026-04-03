import fs from 'fs';
import path from 'path';
import { SummaryResult } from './summarizer';
import { Topic } from './topic-manager';

function formatList(items: string[]): string {
  return items.length > 0 ? items.map(i => `- ${i}`).join('\n') : '_none_';
}

export function writeMemoryArtifact(
  artifactsDir: string,
  topic: Topic,
  result: SummaryResult
): string {
  fs.mkdirSync(path.resolve(artifactsDir), { recursive: true });

  const closedAt = new Date().toISOString();
  const content = `# ${topic.title}

**Topic ID:** ${topic.id}
**Thread:** ${topic.thread_id}
**Channel:** ${topic.channel_id}
**Opened by:** ${topic.created_by}
**Closed at:** ${closedAt}

## Summary

${result.summary}

## Decisions

${formatList(result.memory.decisions)}

## Tasks Completed

${formatList(result.memory.tasks_done)}

## Open Items

${formatList(result.memory.open_items)}

## Key Information

${formatList(result.memory.key_info)}
`;

  const filePath = path.resolve(artifactsDir, `${topic.id}.md`);
  fs.writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

export function readMemoryArtifact(artifactsDir: string, topicId: string): string | null {
  const filePath = path.resolve(artifactsDir, `${topicId}.md`);
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, 'utf-8');
}
