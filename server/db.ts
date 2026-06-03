import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createInitialState, type AppState } from "./store.ts";

const DATA_DIR = path.resolve(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "app-state.json");

export async function loadState(): Promise<AppState> {
  try {
    const raw = await readFile(DATA_FILE, "utf8");
    const persisted = JSON.parse(raw) as Partial<AppState>;
    return {
      ...createInitialState(),
      ...persisted,
    };
  } catch {
    const initial = createInitialState();
    await saveState(initial);
    return initial;
  }
}

export async function saveState(state: AppState) {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(DATA_FILE, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

export const dataFilePath = DATA_FILE;
