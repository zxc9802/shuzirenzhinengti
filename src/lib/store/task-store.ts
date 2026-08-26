import fs from "fs";
import path from "path";

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
  };
  results: {
    originalVideoUrl?: string;
    finalVideoUrl?: string;
    exactAudioUrl?: string;
    evidenceJsonUrl?: string;
    heygenLipsyncId?: string;
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
const memoryTasks = new Map<string, TaskItem>();
const subscribers = new Map<string, Set<(task: TaskItem) => void>>();

function reloadFromDisk() {
  try {
    if (fs.existsSync(STORE_PATH)) {
      const raw = fs.readFileSync(STORE_PATH, "utf-8");
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
    fs.writeFileSync(STORE_PATH, JSON.stringify(arr, null, 2), "utf-8");
  } catch (e) {
    console.error("Failed to persist tasks store", e);
  }
}

export const TaskStore = {
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
