import fs from "fs";
import path from "path";
import { CosService } from "../cos";

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
const COS_AVATARS_KEY = "_system/avatars.json";

let memoryAvatars: AvatarItem[] = [];
let hasLoadedFromCloud = false;

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
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        memoryAvatars = parsed;
      }
    }
  } catch (e) {
    // ignore
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

    // Mirror to Tencent Cloud COS for 100% persistent cloud recovery
    if (CosService.isConfigured()) {
      CosService.saveJsonToCos(COS_AVATARS_KEY, memoryAvatars).catch((err) => {
        console.warn("AvatarStore COS sync error:", err.message);
      });
    }
  } catch (e) {
    console.error("Failed to persist avatars store", e);
  }
}

reloadFromDisk();

export const AvatarStore = {
  async getAllAsync(): Promise<AvatarItem[]> {
    reloadFromDisk();

    // If local memory is empty or not yet synced with cloud, fetch from Tencent Cloud COS
    if ((memoryAvatars.length === 0 || !hasLoadedFromCloud) && CosService.isConfigured()) {
      try {
        const cloudAvatars = await CosService.getJsonFromCos<AvatarItem[]>(COS_AVATARS_KEY);
        if (cloudAvatars && Array.isArray(cloudAvatars) && cloudAvatars.length > 0) {
          memoryAvatars = cloudAvatars;
          hasLoadedFromCloud = true;
          persistStore();
        } else {
          // If no cloud JSON, scan existing videos in COS to auto-recover!
          const files = await CosService.listFiles("uploads/videos/");
          if (files.length > 0) {
            const recovered: AvatarItem[] = files.map((f, idx) => {
              const url = CosService.getPublicUrl(f.key);
              const fileName = path.basename(f.key);
              const cleanName = fileName
                .replace(/^\d+_/, "")
                .replace(/\.[^/.]+$/, "")
                .replace(/_/g, " ") || `形象素材 ${idx + 1}`;

              const thumbKey = `uploads/thumbnails/${fileName.replace(/\.[^/.]+$/, "")}.jpg`;
              const thumbUrl = CosService.getPublicUrl(thumbKey);

              return {
                id: `cos_recovered_${idx}_${Date.now()}`,
                name: cleanName,
                videoUrl: url,
                coverUrl: thumbUrl,
                durationSeconds: 86,
                width: 1080,
                height: 1920,
                fps: 30,
                fileSize: f.size,
                createdAt: f.lastModified ? new Date(f.lastModified).getTime() : Date.now(),
                isCos: true,
              };
            });

            if (recovered.length > 0) {
              memoryAvatars = recovered;
              hasLoadedFromCloud = true;
              persistStore();
            }
          }
        }
      } catch (err: any) {
        console.warn("Failed to load avatars from cloud:", err.message);
      }
    }

    return [...memoryAvatars].sort((a, b) => b.createdAt - a.createdAt);
  },

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
    const index = memoryAvatars.findIndex((a) => a.id === id);
    if (index !== -1) {
      memoryAvatars.splice(index, 1);
      persistStore();
      return true;
    }
    return false;
  },
};
