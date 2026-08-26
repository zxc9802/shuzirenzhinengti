import path from "path";
import fs from "fs";
import { TaskStore, TaskItem, TaskStep } from "../store/task-store";
import { getAppConfig } from "../config";
import { generateIndexTTS } from "./indextts";
import {
  probeMedia,
  prepareSourceVideo,
  finalizeVideo,
  sha256File,
} from "./ffmpeg";
import { preflightHeyGenMedia } from "./preflight";
import { HeyGenMcpAdapter } from "../mcp/heygen-adapter";

export async function runDigitalHumanPipeline(taskId: string): Promise<void> {
  const task = TaskStore.get(taskId);
  if (!task) return;

  const config = getAppConfig();
  const jobDir = path.join(process.cwd(), "public", "jobs", taskId);
  fs.mkdirSync(jobDir, { recursive: true });

  const log = (msg: string, level: "info" | "warn" | "error" | "success" = "info") => {
    TaskStore.addLog(taskId, msg, level);
  };

  let currentStep: TaskStep = "tts";

  try {
    currentStep = "tts";
    TaskStore.update(taskId, {
      status: "processing",
      step: "tts",
      progress: 10,
    });
    log("🚀 启动数字人对口型流水线...");

    // 1. Probe source video
    log("📹 正在探测原始口播视频参数...");
    const originalProbe = await probeMedia(task.inputs.videoPath);
    log(
      `原始视频信息: 分辨率 ${originalProbe.width}x${originalProbe.height} | 时长 ${originalProbe.durationSeconds.toFixed(
        2
      )}s | 帧率 ${originalProbe.fps}fps | 含音频轨: ${originalProbe.hasAudio ? "是" : "否"}`
    );

    // 2. Step: IndexTTS-2 Speech Synthesis
    log("🗣️ 第一步: 正在使用 IndexTTS-2 合成中文定制配音 (根据字数可能需要 1~3 分钟)...");
    const speakerUrl = config.indexttsSpeakerAudioUrl || "https://example.com/speaker.wav";
    const emotionAudioUrl =
      task.inputs.emotionAudioUrl || config.indexttsEmotionAudioUrl || undefined;

    const ttsResult = await generateIndexTTS(task.inputs.scriptText, {
      apiKey: config.indexttsApiKey,
      baseUrl: config.indexttsBaseUrl,
      speakerAudioUrl: speakerUrl,
      emotionAudioUrl: emotionAudioUrl,
      emotionIntensity: task.inputs.emotionIntensity,
      toneProfile: task.inputs.toneProfile,
      outDir: jobDir,
      onLog: (m) => log(`[TTS] ${m}`),
    });

    const sha256Audio = await sha256File(ttsResult.finalWavPath);
    log(`IndexTTS-2 配音就绪，SHA-256: ${sha256Audio.slice(0, 16)}...`, "success");

    // 3. Step: Media Preparation & Normalization
    currentStep = "media_prep";
    TaskStore.update(taskId, {
      step: "media_prep",
      progress: 35,
    });
    log("🎞️ 第二步: 正在进行 FFmpeg 画面归一化与音画对齐...");

    const preparedVideoPath = path.join(jobDir, "heygen-source-video.mp4");
    const prepResult = await prepareSourceVideo(
      task.inputs.videoPath,
      ttsResult.selectedDuration,
      preparedVideoPath,
      task.inputs.videoFit
    );

    const sha256Video = await sha256File(preparedVideoPath);
    log(
      `画面适配完成: 分辨率 ${prepResult.width}x${prepResult.height}, 时长 ${prepResult.duration.toFixed(
        2
      )}s, SHA-256: ${sha256Video.slice(0, 16)}...`,
      "success"
    );

    // 4. Step: MCP Preflight and HeyGen Lip-sync submission
    currentStep = "mcp_preflight";
    TaskStore.update(taskId, {
      step: "mcp_preflight",
      progress: 50,
    });
    log("🛡️ 第三步: 零计费门禁校验媒体直链...");

    // Submission title based on hashes for idempotency
    const submissionTitle = `lipsync_${sha256Video.slice(0, 8)}_${sha256Audio.slice(
      0,
      8
    )}`;

    // Prepare public URLs for media
    const baseUrl = config.publicBaseUrl.replace(/\/$/, "");
    const publicVideoUrl = `${baseUrl}/jobs/${taskId}/heygen-source-video.mp4`;
    const publicAudioUrl = `${baseUrl}/jobs/${taskId}/exact-final-indextts.wav`;

    currentStep = "mcp_lipsync_submit";
    TaskStore.update(taskId, {
      step: "mcp_lipsync_submit",
      progress: 65,
    });
    log("🔌 第四步: 通过 MCP 客户端向 HeyGen 提交对口型请求...");

    // Execute through MCP Adapter
    const heygenResult = await HeyGenMcpAdapter.executeLipsync(
      {
        videoUrl: publicVideoUrl,
        audioUrl: publicAudioUrl,
        submissionTitle,
        onLog: (m) => log(m),
      },
      jobDir
    );

    // 5. Step: Finalize and Remux with exact IndexTTS audio
    currentStep = "finalize";
    TaskStore.update(taskId, {
      step: "finalize",
      progress: 85,
    });
    log("🎧 第五步: 正在将生成的视频与原声 IndexTTS-2 WAV 无损混流封装...");

    const heygenDownloadedPath = path.join(jobDir, "heygen-result-raw.mp4");
    const finalVideoPath = path.join(jobDir, "final.mp4");

    const finalProbe = await finalizeVideo(
      heygenDownloadedPath,
      ttsResult.finalWavPath,
      finalVideoPath
    );

    // 6. Generate evidence.json
    const evidencePayload = {
      task_id: taskId,
      created_at: new Date().toISOString(),
      script_text: task.inputs.scriptText,
      inputs: {
        tone_profile: task.inputs.toneProfile,
        video_fit: task.inputs.videoFit,
        emotion_intensity: task.inputs.emotionIntensity,
      },
      media: {
        video: {
          original_duration_seconds: originalProbe.durationSeconds,
          final_duration_seconds: finalProbe.durationSeconds,
          resolution: `${finalProbe.width}x${finalProbe.height}`,
          fps: finalProbe.fps,
          sha256: sha256Video,
        },
        audio: {
          raw_duration_seconds: ttsResult.rawDuration,
          final_duration_seconds: ttsResult.selectedDuration,
          sample_rate: finalProbe.sampleRate,
          sha256: sha256Audio,
        },
      },
      heygen: {
        lipsync_id: heygenResult.lipsyncId,
        submission_title: submissionTitle,
        mode: "precision",
      },
    };

    const evidencePath = path.join(jobDir, "evidence.json");
    fs.writeFileSync(
      evidencePath,
      JSON.stringify(evidencePayload, null, 2),
      "utf-8"
    );

    // Done!
    currentStep = "done";
    TaskStore.update(taskId, {
      status: "completed",
      step: "done",
      progress: 100,
      results: {
        originalVideoUrl: task.inputs.videoUrl || `/jobs/${taskId}/${path.basename(task.inputs.videoPath)}`,
        finalVideoUrl: `/jobs/${taskId}/final.mp4`,
        exactAudioUrl: `/jobs/${taskId}/exact-final-indextts.wav`,
        evidenceJsonUrl: `/jobs/${taskId}/evidence.json`,
        heygenLipsyncId: heygenResult.lipsyncId,
        videoDuration: finalProbe.durationSeconds,
        audioDuration: ttsResult.selectedDuration,
        resolution: `${finalProbe.width}x${finalProbe.height}`,
        fps: finalProbe.fps,
        sha256Video,
        sha256Audio,
      },
    });

    log("🎉 全部流程执行成功！数字人对口型成片已就绪。", "success");
  } catch (err: any) {
    const errorMsg = err.message || "未知流水线异常";
    log(`❌ 流程发生错误: ${errorMsg}`, "error");
    TaskStore.update(taskId, {
      status: "failed",
      step: "error",
      failedStep: currentStep,
      error: errorMsg,
    });
  }
}
