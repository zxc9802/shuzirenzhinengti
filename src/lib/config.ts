import path from "path";
import fs from "fs";

export interface AppConfig {
  indexttsApiKey: string;
  indexttsBaseUrl: string;
  indexttsSpeakerAudioUrl: string;
  indexttsEmotionAudioPath: string;
  indexttsEmotionAudioUrl: string;
  heygenMcpServerUrl: string;
  heygenMcpServerCommand: string;
  heygenMcpServerArgs: string[];
  heygenMcpTransport: "sse" | "stdio" | "direct";
  storageDir: string;
  publicBaseUrl: string;
}

function loadSkillEnvFallback(): Partial<AppConfig> {
  const home = process.env.HOME || "/Users/a123";
  const skillEnvPath = path.join(
    home,
    ".gemini/antigravity/skills/数字人对口型版/.env"
  );
  const result: Partial<AppConfig> = {};

  if (fs.existsSync(skillEnvPath)) {
    const lines = fs.readFileSync(skillEnvPath, "utf-8").split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const [k, ...v] = trimmed.split("=");
      const key = k.trim();
      const val = v.join("=").trim().replace(/^["']|["']$/g, "");

      if (key === "INDEXTTS_302_API_KEY") result.indexttsApiKey = val;
      if (key === "INDEXTTS_302_BASE_URL" || key === "INDEXTTS_BASE_URL")
        result.indexttsBaseUrl = val;
      if (key === "INDEXTTS_SPEAKER_AUDIO_URL")
        result.indexttsSpeakerAudioUrl = val;
      if (key === "INDEXTTS_EMOTION_AUDIO_PATH")
        result.indexttsEmotionAudioPath = val;
      if (key === "INDEXTTS_EMOTION_AUDIO_URL")
        result.indexttsEmotionAudioUrl = val;
    }
  }

  return result;
}

const skillDefaults = loadSkillEnvFallback();

const defaultMcpScriptPath = path.join(process.cwd(), "scripts", "heygen_mcp_server.mjs");

const DEFAULT_CONFIG: AppConfig = {
  indexttsApiKey:
    process.env.INDEXTTS_302_API_KEY ||
    skillDefaults.indexttsApiKey ||
    "sk-S7v4U3VrOrsr5tmw0wAIPtsmiaOgUmF1Cx3RRCObrblxQJIx",
  indexttsBaseUrl:
    process.env.INDEXTTS_BASE_URL ||
    skillDefaults.indexttsBaseUrl ||
    "https://api.302.ai",
  indexttsSpeakerAudioUrl:
    process.env.INDEXTTS_SPEAKER_AUDIO_URL ||
    skillDefaults.indexttsSpeakerAudioUrl ||
    "https://file.302.ai/gpt/imgs/20260819/9312a23901fa7f214037fa88513a64b3.mp3",
  indexttsEmotionAudioPath:
    process.env.INDEXTTS_EMOTION_AUDIO_PATH ||
    skillDefaults.indexttsEmotionAudioPath ||
    "",
  indexttsEmotionAudioUrl:
    process.env.INDEXTTS_EMOTION_AUDIO_URL ||
    skillDefaults.indexttsEmotionAudioUrl ||
    "https://file.302.ai/gpt/imgs/20260820/d9b8f707580993f36fe037e7e9540938.wav",
  heygenMcpServerUrl:
    process.env.HEYGEN_MCP_SERVER_URL || "http://localhost:8000/sse",
  heygenMcpServerCommand:
    process.env.HEYGEN_MCP_SERVER_COMMAND || "node",
  heygenMcpServerArgs: process.env.HEYGEN_MCP_SERVER_ARGS
    ? JSON.parse(process.env.HEYGEN_MCP_SERVER_ARGS)
    : [defaultMcpScriptPath],
  heygenMcpTransport:
    (process.env.HEYGEN_MCP_TRANSPORT as "sse" | "stdio" | "direct") || "stdio",
  storageDir: path.join(process.cwd(), "public", "jobs"),
  publicBaseUrl:
    process.env.PUBLIC_BASE_URL ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    "http://localhost:3000",
};

const CONFIG_FILE_PATH = path.join(process.cwd(), ".settings.json");

export function getAppConfig(): AppConfig {
  try {
    if (fs.existsSync(CONFIG_FILE_PATH)) {
      const saved = JSON.parse(fs.readFileSync(CONFIG_FILE_PATH, "utf-8"));
      // Ensure args is properly formatted and points to local script if default
      if (
        saved.heygenMcpServerCommand === "node" &&
        (!saved.heygenMcpServerArgs || saved.heygenMcpServerArgs.length === 0 || saved.heygenMcpServerArgs[0].includes("@heygen"))
      ) {
        saved.heygenMcpServerArgs = [defaultMcpScriptPath];
      }
      return { ...DEFAULT_CONFIG, ...saved };
    }
  } catch (err) {
    console.error("Failed to read settings from file, using env/defaults", err);
  }
  return { ...DEFAULT_CONFIG };
}

export function saveAppConfig(newConfig: Partial<AppConfig>): AppConfig {
  const current = getAppConfig();
  const updated = { ...current, ...newConfig };
  try {
    fs.writeFileSync(CONFIG_FILE_PATH, JSON.stringify(updated, null, 2), "utf-8");
  } catch (err) {
    console.error("Failed to save settings to file", err);
  }
  return updated;
}
