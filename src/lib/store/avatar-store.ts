import fs from "fs";
import path from "path";

export interface AvatarItem {
  id: string;
  name: string;
  videoUrl: string;
  videoPath?: string;
  durationSeconds: number;
  width: number;
  height: number;
  fps?: number;
  fileSize: number;
  createdAt: number;
  isCos?: boolean;
}

const AVATARS_FILE_PATH = path.join(process.cwd(), ".avatars.json");
let memoryAvatars: AvatarItem[] = [];

function reloadFromDisk() {
  try {
    if (fs.existsSync(AVATARS_FILE_PATH)) {
      const raw = fs.readFileSync(AVATARS_FILE_PATH, "utf-8");
      memoryAvatars = JSON.parse(raw);
    } else {
      memoryAvatars = [];
      persistStore();
    }
  } catch (e) {
    memoryAvatars = [];
  }
}

function persistStore() {
  try {
    fs.writeFileSync(
      AVATARS_FILE_PATH,
      JSON.stringify(memoryAvatars, null, 2),
      "utf-8"
    );
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
