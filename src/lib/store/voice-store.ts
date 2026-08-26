import fs from "fs";
import path from "path";

export interface VoiceItem {
  id: string;
  name: string;
  audioUrl: string;
  audioPath?: string;
  description?: string;
  createdAt: number;
  isDefault?: boolean;
}

const VOICES_FILE_PATH = path.join(process.cwd(), ".voices.json");

const DEFAULT_VOICES: VoiceItem[] = [
  {
    id: "default_speaker_1",
    name: "默认推荐音色 (深沉口播)",
    audioUrl: "https://file.302.ai/gpt/imgs/20260819/9312a23901fa7f214037fa88513a64b3.mp3",
    description: "稳重大气，适合企业宣讲、商业洞察与深度口播",
    createdAt: 1787700000000,
    isDefault: true,
  },
];

let memoryVoices: VoiceItem[] = [];

function reloadFromDisk() {
  try {
    if (fs.existsSync(VOICES_FILE_PATH)) {
      const raw = fs.readFileSync(VOICES_FILE_PATH, "utf-8");
      memoryVoices = JSON.parse(raw);
    } else {
      memoryVoices = [...DEFAULT_VOICES];
      persistStore();
    }
  } catch (e) {
    memoryVoices = [...DEFAULT_VOICES];
  }
}

function persistStore() {
  try {
    fs.writeFileSync(
      VOICES_FILE_PATH,
      JSON.stringify(memoryVoices, null, 2),
      "utf-8"
    );
  } catch (e) {
    console.error("Failed to persist voices store", e);
  }
}

reloadFromDisk();

export const VoiceStore = {
  getAll(): VoiceItem[] {
    reloadFromDisk();
    return [...memoryVoices];
  },

  get(id: string): VoiceItem | undefined {
    reloadFromDisk();
    return memoryVoices.find((v) => v.id === id);
  },

  getDefault(): VoiceItem {
    reloadFromDisk();
    return memoryVoices.find((v) => v.isDefault) || memoryVoices[0] || DEFAULT_VOICES[0];
  },

  create(voice: Omit<VoiceItem, "id" | "createdAt">): VoiceItem {
    reloadFromDisk();
    const id = "voice_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6);
    const newVoice: VoiceItem = {
      ...voice,
      id,
      createdAt: Date.now(),
    };
    memoryVoices.unshift(newVoice);
    persistStore();
    return newVoice;
  },

  delete(id: string): boolean {
    reloadFromDisk();
    const idx = memoryVoices.findIndex((v) => v.id === id);
    if (idx !== -1) {
      if (memoryVoices[idx].isDefault) {
        throw new Error("默认音色不可删除");
      }
      memoryVoices.splice(idx, 1);
      persistStore();
      return true;
    }
    return false;
  },

  setDefault(id: string): boolean {
    reloadFromDisk();
    let found = false;
    for (const v of memoryVoices) {
      if (v.id === id) {
        v.isDefault = true;
        found = true;
      } else {
        v.isDefault = false;
      }
    }
    if (found) persistStore();
    return found;
  },
};
