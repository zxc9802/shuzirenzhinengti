import fs from "fs";
import path from "path";
import { CosService } from "../cos";

export interface AvatarItem {
  id: string;
  userId?: string;
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
  canManage?: boolean;
}

const STATE_DIR = path.join(process.cwd(), ".runtime", "state");
const AVATARS_FILE_PATH = path.join(STATE_DIR, "avatars.json");
const BACKUP_AVATARS_PATH = path.join(STATE_DIR, "avatars.backup.json");
const LEGACY_AVATARS_PATH = path.join(process.cwd(), ".avatars.json");
const LEGACY_ROOT_BACKUP_AVATARS_PATH = path.join(process.cwd(), ".avatars.backup.json");
const LEGACY_BACKUP_AVATARS_PATH = path.join(process.cwd(), "public", "jobs", ".backup", ".avatars.json");
const COS_AVATARS_KEY = "_system/avatars.json";

let memoryAvatars: AvatarItem[] = [];
let hasLoadedFromCloud = false;

function reloadFromDisk() {
  try {
    let raw = "";
    let migrateLegacy = false;
    if (fs.existsSync(AVATARS_FILE_PATH)) {
      raw = fs.readFileSync(AVATARS_FILE_PATH, "utf-8");
    } else if (fs.existsSync(BACKUP_AVATARS_PATH)) {
      raw = fs.readFileSync(BACKUP_AVATARS_PATH, "utf-8");
      migrateLegacy = true;
    } else if (fs.existsSync(LEGACY_AVATARS_PATH)) {
      raw = fs.readFileSync(LEGACY_AVATARS_PATH, "utf-8");
      migrateLegacy = true;
    } else if (fs.existsSync(LEGACY_ROOT_BACKUP_AVATARS_PATH)) {
      raw = fs.readFileSync(LEGACY_ROOT_BACKUP_AVATARS_PATH, "utf-8");
      migrateLegacy = true;
    } else if (fs.existsSync(LEGACY_BACKUP_AVATARS_PATH)) {
      raw = fs.readFileSync(LEGACY_BACKUP_AVATARS_PATH, "utf-8");
      migrateLegacy = true;
    }

    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        memoryAvatars = parsed;
      }
      if (migrateLegacy) {
        try {
          fs.mkdirSync(STATE_DIR, { recursive: true });
          fs.writeFileSync(AVATARS_FILE_PATH, raw, "utf-8");
          fs.writeFileSync(BACKUP_AVATARS_PATH, raw, "utf-8");
        } catch {}
      }
    }
  } catch (e) {
    // ignore
  }
}

function persistStore() {
  try {
    const content = JSON.stringify(memoryAvatars, null, 2);
    fs.mkdirSync(STATE_DIR, { recursive: true });
    fs.writeFileSync(AVATARS_FILE_PATH, content, "utf-8");

    // Mirror to persistent mounted volume
    try {
      fs.writeFileSync(BACKUP_AVATARS_PATH, content, "utf-8");
    } catch {}

    // Mirror to cloud object storage for 100% persistent cloud recovery
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
  async getAllAsync(legacyOwnerUserId?: string): Promise<AvatarItem[]> {
    reloadFromDisk();

    // If local memory is empty or not yet synced with cloud, fetch from cloud object storage
    if ((memoryAvatars.length === 0 || !hasLoadedFromCloud) && CosService.isConfigured()) {
      try {
        const cloudAvatars = await CosService.getJsonFromCos<AvatarItem[]>(COS_AVATARS_KEY);
        if (cloudAvatars && Array.isArray(cloudAvatars) && cloudAvatars.length > 0) {
          memoryAvatars = cloudAvatars;
          hasLoadedFromCloud = true;
          persistStore();
        } else if (memoryAvatars.length === 0) {
          // If no cloud JSON, scan existing videos in COS to auto-recover!
          const files = await CosService.listFiles("uploads/videos/");
          if (files.length > 0) {
            const recovered: AvatarItem[] = await Promise.all(files.map(async (f, idx) => {
              const url = CosService.getPublicUrl(f.key);
              const fileName = path.basename(f.key);
              const cleanName = fileName
                .replace(/^\d+_/, "")
                .replace(/\.[^/.]+$/, "")
                .replace(/_/g, " ") || `形象素材 ${idx + 1}`;

              const thumbCandidates = [
                `uploads/thumbnails/${fileName}.jpg`,
                `uploads/thumbnails/${fileName.replace(/\.[^/.]+$/, "")}.jpg`,
              ];
              let thumbKey = "";
              for (const candidate of thumbCandidates) {
                if (await CosService.objectExists(candidate)) {
                  thumbKey = candidate;
                  break;
                }
              }

              return {
                id: `cos_recovered_${idx}_${Date.now()}`,
                userId: legacyOwnerUserId,
                name: cleanName,
                videoUrl: url,
                coverUrl: thumbKey ? CosService.getPublicUrl(thumbKey) : undefined,
                durationSeconds: 86,
                width: 1080,
                height: 1920,
                fps: 30,
                fileSize: f.size,
                createdAt: f.lastModified ? new Date(f.lastModified).getTime() : Date.now(),
                isCos: true,
              };
            }));

            if (recovered.length > 0) {
              memoryAvatars = recovered;
              hasLoadedFromCloud = true;
              persistStore();
            }
          }
          hasLoadedFromCloud = true;
        }
      } catch (err: any) {
        console.warn("Failed to load avatars from cloud:", err.message);
      }
    }

    let assignedLegacyOwner = false;
    memoryAvatars = memoryAvatars.map((avatar) => {
      if (avatar.userId || !legacyOwnerUserId) return avatar;
      assignedLegacyOwner = true;
      return { ...avatar, userId: legacyOwnerUserId };
    });
    if (assignedLegacyOwner) persistStore();

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

  update(id: string, updates: Partial<AvatarItem>): AvatarItem | null {
    reloadFromDisk();
    const index = memoryAvatars.findIndex((a) => a.id === id);
    if (index !== -1) {
      memoryAvatars[index] = {
        ...memoryAvatars[index],
        ...updates,
      };
      persistStore();
      return memoryAvatars[index];
    }
    return null;
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
