import fs from 'fs';
import path from 'path';

const IS_DEV = process.env.NODE_ENV !== 'production';
const LOG_FILE = process.env.LOG_FILE ?? './logs/conductor.log';

let logStream: fs.WriteStream | null = null;

if (!IS_DEV) {
  const logDir = path.dirname(path.resolve(LOG_FILE));
  fs.mkdirSync(logDir, { recursive: true });
  logStream = fs.createWriteStream(path.resolve(LOG_FILE), { flags: 'a' });
}

function timestamp(): string {
  return new Date().toISOString();
}

function write(level: string, msg: string): void {
  const line = `[${timestamp()}] [${level}] ${msg}`;
  if (IS_DEV) {
    // Console with color
    const color = level === 'ERROR' ? '\x1b[31m' : level === 'WARN' ? '\x1b[33m' : '\x1b[0m';
    console.log(`${color}${line}\x1b[0m`);
  } else {
    // File only in production — tail the log yourself with: tail -f logs/conductor.log
    logStream!.write(line + '\n');
  }
}

export const logger = {
  info: (msg: string) => write('INFO', msg),
  warn: (msg: string) => write('WARN', msg),
  error: (msg: string) => write('ERROR', msg),
  debug: (msg: string) => { if (IS_DEV) write('DEBUG', msg); },
};
