import fs from "fs";
import path from "path";
import { CosService } from "../cos";

export type TaskStep =
  | "idle"
  | "tts"
  | "media_prep"
  | "mcp_preflight"
  | "mcp_lipsync_submit"
  | "mcp_lipsync_polling"
  | "finalize"
  | "done"
  | "error";

export interface LogEntry {
  timestamp: number;
  level: "info" | "warn" | "error" | "success";
  message: string;
}

export interface TaskItem {
  id: string;
  createdAt: number;
  updatedAt: number;
  status: "pending" | "processing" | "completed" | "failed";
  step: TaskStep;
  failedStep?: TaskStep;
  progress: number;
  logs: LogEntry[];
  inputs: {
    videoName: string;
    videoPath: string;
    videoUrl: string;
    scriptText: string;
    toneProfile: "low" | "high";
    videoFit: "smart" | "preserve";
    emotionIntensity: number;
    speakerVoiceId?: string;
    speakerAudioUrl?: string;
    emotionAudioUrl?: string;
    lipsyncProvider?: "heygen" | "pixverse";
  };
  results: {
    originalVideoUrl?: string;
    finalVideoUrl?: string;
    exactAudioUrl?: string;
    evidenceJsonUrl?: string;
    heygenLipsyncId?: string;
    lipsyncProvider?: "heygen" | "pixverse";
    lipsyncCredits?: number;
    pixverseResultUrl?: string;
    creditsBefore?: number;
    creditsAfter?: number;
    videoDuration?: number;
    audioDuration?: number;
    resolution?: string;
    fps?: number;
    sha256Video?: string;
    sha256Audio?: string;
  };
  error?: string;
}

const STORE_PATH = path.join(process.cwd(), ".tasks.json");
const BACKUP_STORE_PATH = path.join(process.cwd(), "public", "jobs", ".backup", ".tasks.json");
const COS_TASKS_KEY = "_system/tasks.json";
const memoryTasks = new Map<string, TaskItem>();
const subscribers = new Map<string, Set<(task: TaskItem) => void>>();
let hasLoadedFromCloud = false;

function reloadFromDisk() {
  try {
    let raw = "";
    if (fs.existsSync(STORE_PATH)) {
      raw = fs.readFileSync(STORE_PATH, "utf-8");
    } else if (fs.existsSync(BACKUP_STORE_PATH)) {
      raw = fs.readFileSync(BACKUP_STORE_PATH, "utf-8");
      try { fs.writeFileSync(STORE_PATH, raw, "utf-8"); } catch {}
    }

    if (raw) {
      const arr: TaskItem[] = JSON.parse(raw);
      for (const t of arr) {
        memoryTasks.set(t.id, t);
      }
    }
  } catch (e) {
    // ignore read error
  }
}

reloadFromDisk();

function persistStore() {
  try {
    const arr = Array.from(memoryTasks.values()).sort(
      (a, b) => b.createdAt - a.createdAt
    );
    const content = JSON.stringify(arr, null, 2);
    fs.writeFileSync(STORE_PATH, content, "utf-8");

    // Mirror to persistent mounted volume
    try {
      const backupDir = path.join(process.cwd(), "public", "jobs", ".backup");
      fs.mkdirSync(backupDir, { recursive: true });
      fs.writeFileSync(BACKUP_STORE_PATH, content, "utf-8");
    } catch {}

    // Mirror to Tencent Cloud COS for 100% persistent cloud recovery across container restarts
    if (CosService.isConfigured()) {
      CosService.saveJsonToCos(COS_TASKS_KEY, arr).catch((err) => {
        console.warn("TaskStore COS sync error:", err.message);
      });
    }
  } catch (e) {
    console.error("Failed to persist tasks store", e);
  }
}

export const TaskStore = {
  async getAllAsync(): Promise<TaskItem[]> {
    reloadFromDisk();

    // If local memory is empty or not yet synced with cloud, fetch from Tencent Cloud COS
    if ((memoryTasks.size === 0 || !hasLoadedFromCloud) && CosService.isConfigured()) {
      try {
        const cloudTasks = await CosService.getJsonFromCos<TaskItem[]>(COS_TASKS_KEY);
        if (cloudTasks && Array.isArray(cloudTasks) && cloudTasks.length > 0) {
          for (const t of cloudTasks) {
            const existing = memoryTasks.get(t.id);
            if (!existing || (t.updatedAt || 0) > (existing.updatedAt || 0)) {
              memoryTasks.set(t.id, t);
            }
          }
          hasLoadedFromCloud = true;
          persistStore();
        }
      } catch (err: any) {
        console.warn("Failed to load tasks from cloud:", err.message);
      }
    }

    return Array.from(memoryTasks.values()).sort(
      (a, b) => b.createdAt - a.createdAt
    );
  },

  async getAsync(id: string): Promise<TaskItem | undefined> {
    reloadFromDisk();
    const local = memoryTasks.get(id);
    if (local) return local;

    await this.getAllAsync();
    return memoryTasks.get(id);
  },

  get(id: string): TaskItem | undefined {
    reloadFromDisk();
    return memoryTasks.get(id);
  },

  getAll(): TaskItem[] {
    reloadFromDisk();
    return Array.from(memoryTasks.values()).sort(
      (a, b) => b.createdAt - a.createdAt
    );
  },

  getLatest(): TaskItem | undefined {
    const all = this.getAll();
    return all.length > 0 ? all[0] : undefined;
  },

  create(data: Omit<TaskItem, "id" | "createdAt" | "updatedAt" | "logs">): TaskItem {
    reloadFromDisk();
    const id = "task_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7);
    const now = Date.now();
    const task: TaskItem = {
      ...data,
      id,
      createdAt: now,
      updatedAt: now,
      logs: [
        {
          timestamp: now,
          level: "info",
          message: `任务已创建 (${data.inputs.videoName})`,
        },
      ],
    };
    memoryTasks.set(id, task);
    persistStore();
    this.notify(task);
    return task;
  },

  update(id: string, partial: Partial<TaskItem>): TaskItem | undefined {
    reloadFromDisk();
    const existing = memoryTasks.get(id);
    if (!existing) return undefined;
    const updated: TaskItem = {
      ...existing,
      ...partial,
      inputs: partial.inputs
        ? { ...existing.inputs, ...partial.inputs }
        : existing.inputs,
      results: partial.results
        ? { ...existing.results, ...partial.results }
        : existing.results,
      updatedAt: Date.now(),
    };
    memoryTasks.set(id, updated);
    persistStore();
    this.notify(updated);
    return updated;
  },

  addLog(
    id: string,
    message: string,
    level: LogEntry["level"] = "info"
  ): void {
    reloadFromDisk();
    const task = memoryTasks.get(id);
    if (!task) return;
    task.logs.push({
      timestamp: Date.now(),
      level,
      message,
    });
    task.updatedAt = Date.now();
    persistStore();
    this.notify(task);
  },

  delete(id: string): boolean {
    reloadFromDisk();
    const res = memoryTasks.delete(id);
    if (res) persistStore();
    return res;
  },

  subscribe(id: string, callback: (task: TaskItem) => void): () => void {
    if (!subscribers.has(id)) {
      subscribers.set(id, new Set());
    }
    subscribers.get(id)!.add(callback);
    return () => {
      subscribers.get(id)?.delete(callback);
    };
  },

  notify(task: TaskItem): void {
    const set = subscribers.get(task.id);
    if (set) {
      for (const cb of set) {
        try {
          cb(task);
        } catch (e) {
          console.error("Task subscriber callback error", e);
        }
      }
    }
  },
};
