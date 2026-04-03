import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { logger } from '../logger';

const execFileAsync = promisify(execFile);

function snapshotDir(): string {
  return path.resolve(process.env.SNAPSHOT_PATH ?? './data/snapshots');
}

function openclawRoot(): string {
  return path.resolve(
    process.env.OPENCLAW_ROOT ?? path.join(process.env.HOME ?? '~', '.openclaw')
  );
}

async function git(args: string[]): Promise<string> {
  const { stdout, stderr } = await execFileAsync('git', args, {
    cwd: snapshotDir(),
    env: { ...process.env, GIT_AUTHOR_NAME: 'Conductor', GIT_AUTHOR_EMAIL: 'conductor@local',
           GIT_COMMITTER_NAME: 'Conductor', GIT_COMMITTER_EMAIL: 'conductor@local' },
    timeout: 15000,
  });
  return [stdout, stderr].filter(Boolean).join('\n').trim();
}

/** Ensure the snapshot git repo exists and is initialized. */
export function ensureSnapshotRepo(): void {
  const dir = snapshotDir();
  fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(path.join(dir, '.git'))) {
    // Init synchronously on first run
    const { execFileSync } = require('child_process');
    execFileSync('git', ['init'], { cwd: dir });
    execFileSync('git', ['config', 'user.email', 'conductor@local'], { cwd: dir });
    execFileSync('git', ['config', 'user.name', 'Conductor'], { cwd: dir });
    // Write a .gitignore to exclude nothing (we want full visibility)
    fs.writeFileSync(path.join(dir, '.gitignore'), '# openclaw snapshots\n');
    logger.info(`Snapshot repo initialized at ${dir}`);
  }
}

/** Copy key openclaw files into the snapshot directory. */
function syncToSnapshot(): void {
  const root = openclawRoot();
  const dest = snapshotDir();

  // Copy openclaw.json
  const configSrc = path.join(root, 'openclaw.json');
  if (fs.existsSync(configSrc)) {
    fs.copyFileSync(configSrc, path.join(dest, 'openclaw.json'));
  }

  // Copy agents/ directory (SOUL.md, hooks, skills — skip large/binary files)
  const agentsSrc = path.join(root, 'agents');
  const agentsDest = path.join(dest, 'agents');
  if (fs.existsSync(agentsSrc)) {
    copyDirFiltered(agentsSrc, agentsDest);
  }
}

function copyDirFiltered(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src)) {
    const srcPath = path.join(src, entry);
    const destPath = path.join(dest, entry);
    const stat = fs.statSync(srcPath);
    if (stat.isDirectory()) {
      copyDirFiltered(srcPath, destPath);
    } else if (stat.size < 500_000 && isTextFile(entry)) {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function isTextFile(name: string): boolean {
  const textExts = ['.json', '.md', '.txt', '.yaml', '.yml', '.toml', '.env',
                    '.js', '.ts', '.sh', '.py', '.rb', '', '.lock'];
  const ext = path.extname(name).toLowerCase();
  return textExts.includes(ext) || !ext; // include extensionless files (like SOUL)
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Take a snapshot of the current openclaw state before an operation.
 * Returns the commit hash, or null if nothing changed.
 */
export async function snapshotBefore(operationDesc: string): Promise<string | null> {
  try {
    ensureSnapshotRepo();
    syncToSnapshot();

    await git(['add', '-A']);

    // Check if there are staged changes
    const status = await git(['status', '--porcelain']);
    if (!status) {
      logger.debug('Snapshot: no changes to commit');
      return null;
    }

    await git(['commit', '-m', `pre: ${operationDesc}`]);
    const hash = await git(['rev-parse', '--short', 'HEAD']);
    logger.info(`Snapshot committed: ${hash} — pre: ${operationDesc}`);
    return hash;
  } catch (err) {
    logger.warn(`Snapshot failed (non-fatal): ${(err as Error).message}`);
    return null;
  }
}

/** List recent snapshots. Returns formatted log string. */
export async function listSnapshots(limit = 20): Promise<string> {
  try {
    ensureSnapshotRepo();
    const log = await git(['log', `--max-count=${limit}`, '--pretty=format:%h %ai %s']);
    return log || 'No snapshots yet.';
  } catch {
    return 'No snapshots yet.';
  }
}

/** Show diff for a specific commit (what changed vs its parent). */
export async function diffSnapshot(hash: string): Promise<string> {
  ensureSnapshotRepo();
  const out = await git(['show', '--stat', hash]);
  return out || 'No diff available.';
}

/** Show full diff of a specific file at a commit vs its parent. */
export async function diffSnapshotFile(hash: string, filePath: string): Promise<string> {
  ensureSnapshotRepo();
  const out = await git(['show', `${hash}:${filePath}`]);
  return out || 'File not found in that snapshot.';
}

/**
 * Restore openclaw files from a snapshot commit back to the openclaw root.
 * Returns a description of what was restored.
 */
export async function restoreSnapshot(hash: string): Promise<string> {
  ensureSnapshotRepo();

  // First take a snapshot of current state so restore itself is undoable
  await snapshotBefore(`before-restore-${hash}`);

  // Checkout the snapshot's files into the snapshot dir
  await git(['checkout', hash, '--', '.']);

  const root = openclawRoot();
  const dir = snapshotDir();
  const restored: string[] = [];

  // Restore openclaw.json
  const configSnap = path.join(dir, 'openclaw.json');
  if (fs.existsSync(configSnap)) {
    const dest = path.join(root, 'openclaw.json');
    fs.copyFileSync(configSnap, dest);
    restored.push('openclaw.json');
  }

  // Restore agents/
  const agentsSnap = path.join(dir, 'agents');
  if (fs.existsSync(agentsSnap)) {
    copyDirFiltered(agentsSnap, path.join(root, 'agents'));
    restored.push('agents/');
  }

  // Reset snapshot dir back to HEAD so it stays in sync
  await git(['checkout', 'HEAD', '--', '.']);

  return `Restored from snapshot ${hash}: ${restored.join(', ')}`;
}
