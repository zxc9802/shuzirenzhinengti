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
const LEGACY_AVATAR_PREFIX = "uploads/videos/";
const LEGACY_AVATAR_VIDEO_KEY = /^uploads\/videos\/[^/]+\.(?:mp4|mov|webm|m4v)$/i;

let memoryAvatars: AvatarItem[] = [];
let hasLoadedFromCloud = false;
let legacyReconciliationPromise: Promise<void> | null = null;

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

function legacyAvatarKeyFromUrl(source: string): string | null {
  try {
    const key = decodeURIComponent(new URL(source).pathname).replace(/^\/+/, "");
    return LEGACY_AVATAR_VIDEO_KEY.test(key) ? key : null;
  } catch {
    return null;
  }
}

async function recoverLegacyAvatar(
  file: { key: string; size: number; lastModified: string },
  index: number,
  ownerUserId: string,
): Promise<AvatarItem> {
  const fileName = path.basename(file.key);
  const cleanName = fileName
    .replace(/^\d+_/, "")
    .replace(/\.[^/.]+$/, "")
    .replace(/_/g, " ") || `形象素材 ${index + 1}`;
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
    id: `cos_recovered_${index}_${Date.now()}`,
    userId: ownerUserId,
    name: cleanName,
    videoUrl: CosService.getPublicUrl(file.key),
    coverUrl: thumbKey ? CosService.getPublicUrl(thumbKey) : undefined,
    durationSeconds: 86,
    width: 1080,
    height: 1920,
    fps: 30,
    fileSize: file.size,
    createdAt: file.lastModified ? new Date(file.lastModified).getTime() : Date.now(),
    isCos: true,
  };
}

async function reconcileLegacyAvatars(ownerUserId: string): Promise<void> {
  const indexedKeys = new Set(
    memoryAvatars
      .map((avatar) => legacyAvatarKeyFromUrl(avatar.videoUrl))
      .filter((key): key is string => Boolean(key)),
  );
  const files = await CosService.listFiles(LEGACY_AVATAR_PREFIX);
  const missingFiles = files.filter(
    (file) => LEGACY_AVATAR_VIDEO_KEY.test(file.key) && !indexedKeys.has(file.key),
  );
  if (missingFiles.length === 0) return;

  const recovered = await Promise.all(
    missingFiles.map((file, index) => recoverLegacyAvatar(file, index, ownerUserId)),
  );
  memoryAvatars = [...memoryAvatars, ...recovered];
  persistStore();
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
          persistStore();
        }
        hasLoadedFromCloud = true;
      } catch (err: any) {
        console.warn("Failed to load avatars from cloud:", err.message);
      }
    }

    if (legacyOwnerUserId && CosService.isConfigured()) {
      legacyReconciliationPromise ||= reconcileLegacyAvatars(legacyOwnerUserId).catch((err: any) => {
        console.warn("Failed to reconcile legacy avatars from cloud:", err.message);
      });
      await legacyReconciliationPromise;
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
