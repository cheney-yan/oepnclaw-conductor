import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

export interface Topic {
  id: string;
  title: string;
  channel_id: string;
  thread_id: string;
  status: 'open' | 'closed';
  created_at: number;
  closed_at: number | null;
  summary: string | null;
  created_by: string;
}

function topicsDir(): string {
  return path.resolve(process.env.TOPICS_PATH ?? './data/topics');
}

function topicFile(threadId: string): string {
  return path.join(topicsDir(), `${threadId}.json`);
}

function readTopic(threadId: string): Topic | undefined {
  const file = topicFile(threadId);
  if (!fs.existsSync(file)) return undefined;
  return JSON.parse(fs.readFileSync(file, 'utf-8')) as Topic;
}

function writeTopic(topic: Topic): void {
  fs.mkdirSync(topicsDir(), { recursive: true });
  fs.writeFileSync(topicFile(topic.thread_id), JSON.stringify(topic, null, 2) + '\n', 'utf-8');
}

export function createTopic(
  title: string,
  channelId: string,
  threadId: string,
  createdBy: string
): Topic {
  const topic: Topic = {
    id: randomUUID(),
    title,
    channel_id: channelId,
    thread_id: threadId,
    status: 'open',
    created_at: Date.now(),
    closed_at: null,
    summary: null,
    created_by: createdBy,
  };
  writeTopic(topic);
  return topic;
}

export function getTopicByThread(threadId: string): Topic | undefined {
  return readTopic(threadId);
}

export function getTopicById(id: string): Topic | undefined {
  const dir = topicsDir();
  if (!fs.existsSync(dir)) return undefined;
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith('.json')) continue;
    const t = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8')) as Topic;
    if (t.id === id) return t;
  }
  return undefined;
}

export function getAllOpenTopics(): Topic[] {
  const dir = topicsDir();
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .map(f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8')) as Topic)
    .filter(t => t.status === 'open')
    .sort((a, b) => b.created_at - a.created_at);
}

export function getLastClosedTopicByChannel(channelId: string): Topic | undefined {
  const dir = topicsDir();
  if (!fs.existsSync(dir)) return undefined;
  return fs
    .readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .map(f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8')) as Topic)
    .filter(t => t.channel_id === channelId && t.status === 'closed')
    .sort((a, b) => (b.closed_at ?? 0) - (a.closed_at ?? 0))[0];
}

export function closeTopic(id: string, summary: string): void {
  const dir = topicsDir();
  if (!fs.existsSync(dir)) return;
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith('.json')) continue;
    const filePath = path.join(dir, file);
    const t = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Topic;
    if (t.id === id) {
      writeTopic({ ...t, status: 'closed', closed_at: Date.now(), summary });
      return;
    }
  }
}
