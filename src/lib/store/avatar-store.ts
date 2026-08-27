import fs from "fs";
import path from "path";

export interface AvatarItem {
  id: string;
  name: string;
  videoUrl: string;
  videoPath?: string;
  coverUrl?: string;
  durationSeconds: number;
  width: number;
  height: number;
  fps?: number;
  fileSize: number;
  createdAt: number;
  isCos?: boolean;
}

const AVATARS_FILE_PATH = path.join(process.cwd(), ".avatars.json");
const BACKUP_AVATARS_PATH = path.join(process.cwd(), "public", "jobs", ".backup", ".avatars.json");
let memoryAvatars: AvatarItem[] = [];

function reloadFromDisk() {
  try {
    let raw = "";
    if (fs.existsSync(AVATARS_FILE_PATH)) {
      raw = fs.readFileSync(AVATARS_FILE_PATH, "utf-8");
    } else if (fs.existsSync(BACKUP_AVATARS_PATH)) {
      raw = fs.readFileSync(BACKUP_AVATARS_PATH, "utf-8");
      try { fs.writeFileSync(AVATARS_FILE_PATH, raw, "utf-8"); } catch {}
    }

    if (raw) {
      memoryAvatars = JSON.parse(raw);
    } else {
      memoryAvatars = [];
    }
  } catch (e) {
    memoryAvatars = [];
  }
}

function persistStore() {
  try {
    const content = JSON.stringify(memoryAvatars, null, 2);
    fs.writeFileSync(AVATARS_FILE_PATH, content, "utf-8");

    // Mirror to persistent mounted volume
    try {
      const backupDir = path.join(process.cwd(), "public", "jobs", ".backup");
      fs.mkdirSync(backupDir, { recursive: true });
      fs.writeFileSync(BACKUP_AVATARS_PATH, content, "utf-8");
    } catch {}
  } catch (e) {
    console.error("Failed to persist avatars store", e);
  }
}

reloadFromDisk();

export const AvatarStore = {
  getAll(): AvatarItem[] {
    reloadFromDisk();
    return [...memoryAvatars].sort((a, b) => b.createdAt - a.createdAt);
  },

  get(id: string): AvatarItem | undefined {
    reloadFromDisk();
    return memoryAvatars.find((a) => a.id === id);
  },

  create(avatar: Omit<AvatarItem, "id" | "createdAt">): AvatarItem {
    reloadFromDisk();
    const id = "avatar_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6);
    const newAvatar: AvatarItem = {
      ...avatar,
      id,
      createdAt: Date.now(),
    };
    memoryAvatars.unshift(newAvatar);
    persistStore();
    return newAvatar;
  },

  delete(id: string): boolean {
    reloadFromDisk();
    const idx = memoryAvatars.findIndex((a) => a.id === id);
    if (idx !== -1) {
      memoryAvatars.splice(idx, 1);
      persistStore();
      return true;
    }
    return false;
  },

  update(id: string, partial: Partial<AvatarItem>): AvatarItem | undefined {
    reloadFromDisk();
    const item = memoryAvatars.find((a) => a.id === id);
    if (!item) return undefined;
    Object.assign(item, partial);
    persistStore();
    return item;
  },
};
