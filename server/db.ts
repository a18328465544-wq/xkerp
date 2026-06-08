import { access, copyFile, mkdir, readdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { createInitialState, type AppState } from "./store.ts";

const DATA_DIR = path.resolve(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "app-state.json");
const BACKUP_DIR = path.join(DATA_DIR, "backups");
// Keep at most this many daily/manual backups; older ones are pruned automatically.
const BACKUP_RETENTION = Number(process.env.BACKUP_RETENTION || 30);
let saveQueue = Promise.resolve();

export async function loadState(): Promise<AppState> {
  try {
    const raw = await readFile(DATA_FILE, "utf8");
    const persisted = JSON.parse(raw) as Partial<AppState>;
    return {
      ...createInitialState(),
      ...persisted,
      currentUserId: undefined,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      await backupCorruptDataFile();
    }
    const initial = createInitialState();
    await saveState(initial);
    return initial;
  }
}

export async function saveState(state: AppState) {
  const persistentState = { ...state, currentUserId: undefined };
  const content = `${JSON.stringify(persistentState, null, 2)}\n`;
  saveQueue = saveQueue.then(() => writeStateContent(content));
  return saveQueue;
}

async function writeStateContent(content: string) {
  await mkdir(DATA_DIR, { recursive: true });
  await ensureDailyBackup();
  const tempFile = path.join(DATA_DIR, `.app-state.${process.pid}.${Date.now()}.tmp`);
  await writeFile(tempFile, content, "utf8");
  await rename(tempFile, DATA_FILE);
}

async function ensureDailyBackup() {
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const backupFile = path.join(BACKUP_DIR, `app-state-${day}.json`);
  try {
    await access(backupFile);
  } catch {
    try {
      await mkdir(BACKUP_DIR, { recursive: true });
      await copyFile(DATA_FILE, backupFile);
      await pruneBackups();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
}

// Remove the oldest auto/daily backups beyond the retention window. Corrupt-file snapshots
// (app-state-corrupt-*) and manual backups are kept for forensics and are not pruned here.
async function pruneBackups() {
  try {
    const entries = await readdir(BACKUP_DIR);
    const dailies = entries
      .filter((name) => /^app-state-\d{8}\.json$/.test(name))
      .sort();
    const excess = dailies.length - BACKUP_RETENTION;
    for (let i = 0; i < excess; i += 1) {
      await unlink(path.join(BACKUP_DIR, dailies[i]));
    }
  } catch {
    // Pruning is best-effort; never let it block a save.
  }
}

export async function createManualBackup(): Promise<{ file: string }> {
  await mkdir(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupFile = path.join(BACKUP_DIR, `app-state-manual-${stamp}.json`);
  await copyFile(DATA_FILE, backupFile);
  return { file: backupFile };
}

export async function listBackups(): Promise<Array<{ name: string; size: number; createdAt: string }>> {
  try {
    const { stat } = await import("node:fs/promises");
    const entries = await readdir(BACKUP_DIR);
    const files = entries.filter((name) => name.endsWith(".json"));
    const detailed = await Promise.all(
      files.map(async (name) => {
        const info = await stat(path.join(BACKUP_DIR, name));
        return { name, size: info.size, createdAt: info.mtime.toISOString() };
      }),
    );
    return detailed.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    return [];
  }
}

async function backupCorruptDataFile() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupFile = path.join(BACKUP_DIR, `app-state-corrupt-${stamp}.json`);
  try {
    await mkdir(BACKUP_DIR, { recursive: true });
    await copyFile(DATA_FILE, backupFile);
  } catch {
    // If the damaged file cannot be copied, still allow the app to recover with initial state.
  }
}

export const dataFilePath = DATA_FILE;
