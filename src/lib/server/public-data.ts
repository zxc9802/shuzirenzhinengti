import "server-only";

import type { LipsyncProvider } from "@/lib/lipsync-provider";
import type { AvatarItem } from "@/lib/store/avatar-store";
import type { TaskItem, TaskStep } from "@/lib/store/task-store";
import type { VoiceItem } from "@/lib/store/voice-store";
import type {
  PublicAvatarItem,
  PublicEngine,
  PublicTaskItem,
  PublicTaskStep,
  PublicVoiceItem,
} from "@/lib/public-contract";
import { sanitizePublicText } from "@/lib/server/public-sanitizer";

export { sanitizePublicText } from "@/lib/server/public-sanitizer";

export function isTaskOutputDeliverable(task: TaskItem): boolean {
  if (task.status !== "completed") return false;
  return !task.billing?.isExternalUser || task.billing.status === "settled";
}

export function resolvePrivateEngine(engine: unknown): LipsyncProvider {
  if (engine === "a") return "pixverse";
  if (engine === "c") return "heygen";
  return "veed";
}

function toPublicEngine(provider?: LipsyncProvider): PublicEngine {
  if (provider === "pixverse") return "a";
  if (provider === "heygen") return "c";
  return "b";
}

function toPublicStep(step?: TaskStep): PublicTaskStep {
  if (step === "tts") return "voice";
  if (step === "media_prep") return "prepare";
  if (step === "mcp_preflight") return "check";
  if (step === "mcp_lipsync_submit" || step === "mcp_lipsync_polling") return "render";
  if (step === "finalize") return "finalize";
  if (step === "done") return "done";
  if (step === "error") return "error";
  return "idle";
}

export function toPublicTask(task: TaskItem): PublicTaskItem {
  const resultBase = `/api/tasks/${encodeURIComponent(task.id)}/media`;
  const provider = task.inputs.lipsyncProvider || task.results.lipsyncProvider;
  const deliverable = isTaskOutputDeliverable(task);
  const recoverable = Boolean(
    !deliverable &&
      task.billing?.status !== "released" &&
      (task.results.finalVideoUrl ||
        task.results.heygenLipsyncId ||
        task.results.pixverseResultUrl ||
        task.results.veedResultUrl ||
        task.results.lipsyncChunks?.length)
  );

  return {
    id: task.id,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    status: task.status,
    step: toPublicStep(task.step),
    failedStep: task.failedStep ? toPublicStep(task.failedStep) : undefined,
    progress: task.progress,
    logs: (task.logs || []).map((entry) => ({
      timestamp: entry.timestamp,
      level: entry.level,
      message: sanitizePublicText(entry.message, "任务状态已更新"),
    })),
    billing: task.billing
      ? {
          isExternalUser: task.billing.isExternalUser,
          estimatedDuration: task.billing.estimatedDuration,
          estimatedPoints: task.billing.estimatedPoints,
          actualDuration: task.billing.actualDuration,
          chargedPoints: task.billing.chargedPoints,
          costCny: task.billing.costCny,
          status: task.billing.status,
        }
      : undefined,
    inputs: {
      videoName: sanitizePublicText(task.inputs.videoName, "口播素材.mp4"),
      scriptText: task.inputs.scriptText,
      toneProfile: task.inputs.toneProfile,
      videoFit: task.inputs.videoFit,
      emotionIntensity: task.inputs.emotionIntensity,
      speakerVoiceId: task.inputs.speakerVoiceId,
      engine: toPublicEngine(provider),
    },
    results: {
      originalVideoUrl:
        task.inputs.videoPath || task.inputs.videoUrl || task.results.originalVideoUrl
          ? `${resultBase}/original`
          : undefined,
      finalVideoUrl: deliverable && task.results.finalVideoUrl ? `${resultBase}/final` : undefined,
      exactAudioUrl: deliverable && task.results.exactAudioUrl ? `${resultBase}/voice` : undefined,
      evidenceJsonUrl: deliverable && task.results.evidenceJsonUrl
        ? `/api/tasks/${encodeURIComponent(task.id)}/download/production-report.json`
        : undefined,
      chargedPoints: task.results.chargedPoints,
      costCny: task.results.costCny,
      billingDuration: task.results.billingDuration,
      videoDuration: task.results.videoDuration,
      audioDuration: task.results.audioDuration,
      resolution: task.results.resolution,
      fps: task.results.fps,
      sha256Video: task.results.sha256Video,
      sha256Audio: task.results.sha256Audio,
    },
    recoverable,
    error: task.error ? sanitizePublicText(task.error) : undefined,
  };
}

export function toPublicVoice(voice: VoiceItem, canManage?: boolean): PublicVoiceItem {
  return {
    id: voice.id,
    name: sanitizePublicText(voice.name, "自定义音色"),
    description: voice.description
      ? sanitizePublicText(voice.description, "专属音色")
      : undefined,
    audioUrl: `/api/voices/${encodeURIComponent(voice.id)}/audio`,
    createdAt: voice.createdAt,
    isDefault: voice.isDefault,
    canManage,
  };
}

export function toPublicAvatar(avatar: AvatarItem, canManage?: boolean): PublicAvatarItem {
  const base = `/api/avatars/${encodeURIComponent(avatar.id)}/media`;
  return {
    id: avatar.id,
    name: sanitizePublicText(avatar.name, "口播形象"),
    videoUrl: `${base}?kind=video`,
    coverUrl: avatar.coverUrl ? `${base}?kind=cover` : undefined,
    durationSeconds: avatar.durationSeconds,
    width: avatar.width,
    height: avatar.height,
    fps: avatar.fps,
    fileSize: avatar.fileSize,
    createdAt: avatar.createdAt,
    storedRemotely: avatar.isCos,
    canManage,
  };
}
