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
import { HeyGenMcpAdapter } from "../mcp/heygen-adapter";
import { OpenLuxLipsyncAdapter } from "./openlux-lipsync";
import { CosService } from "../cos";

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

    // 0. Ensure source video exists locally (auto-download from videoUrl / COS if missing from local disk)
    let localVideoPath = task.inputs.videoPath;
    const needDownload = !localVideoPath || !fs.existsSync(localVideoPath);

    if (needDownload) {
      const sourceUrl = task.inputs.videoUrl;
      if (!sourceUrl) {
        throw new Error(`未找到可用视频文件，本地路径不存在且无云端直链: ${localVideoPath || "空"}`);
      }
      log(`⬇️ 正在从云端存储同步视频素材至当前实例...`);
      const downloadsDir = path.join(process.cwd(), "public", "uploads", "videos");
      fs.mkdirSync(downloadsDir, { recursive: true });
      const targetFileName = localVideoPath ? path.basename(localVideoPath) : `${Date.now()}_source.mp4`;
      localVideoPath = path.join(downloadsDir, targetFileName);

      // Download file to localVideoPath
      const resp = await fetch(sourceUrl);
      if (!resp.ok) {
        throw new Error(`从云端下载视频素材失败 (HTTP ${resp.status}): ${sourceUrl}`);
      }
      const buffer = Buffer.from(await resp.arrayBuffer());
      fs.writeFileSync(localVideoPath, buffer);
      log(`✅ 视频素材已成功同步至本地 (${(buffer.length / 1024 / 1024).toFixed(2)} MB)`, "success");
    }

    // 1. Probe source video
    log("📹 正在探测原始口播视频参数...");
    const originalProbe = await probeMedia(localVideoPath);
    log(
      `原始视频信息: 分辨率 ${originalProbe.width}x${originalProbe.height} | 时长 ${originalProbe.durationSeconds.toFixed(
        2
      )}s | 帧率 ${originalProbe.fps}fps | 含音频轨: ${originalProbe.hasAudio ? "是" : "否"}`
    );

    // 2. Step: Speech Synthesis
    log("🗣️ 第一步: 正在合成定制原声配音 (根据字数可能需要 1~3 分钟)...");
    const speakerUrl =
      task.inputs.speakerAudioUrl ||
      config.indexttsSpeakerAudioUrl ||
      "https://file.302.ai/gpt/imgs/20260819/9312a23901fa7f214037fa88513a64b3.mp3";
    const emotionAudioUrl =
      task.inputs.emotionAudioUrl ||
      config.indexttsEmotionAudioUrl ||
      "https://file.302.ai/gpt/imgs/20260820/d9b8f707580993f36fe037e7e9540938.wav";

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
    log(
      `专属原声音轨已就绪，时长 ${ttsResult.selectedDuration.toFixed(1)}s，音频指纹: ${sha256Audio.slice(0, 16)}...`,
      "success"
    );

    // 3. Step: Media Preparation & Normalization
    currentStep = "media_prep";
    TaskStore.update(taskId, {
      step: "media_prep",
      progress: 35,
    });
    log("🎞️ 第二步: 正在进行 FFmpeg 画面归一化与音画对齐...");

    const preparedVideoPath = path.join(jobDir, "heygen-source-video.mp4");
    const prepResult = await prepareSourceVideo(
      localVideoPath,
      ttsResult.selectedDuration,
      preparedVideoPath,
      task.inputs.videoFit
    );

    const sha256Video = await sha256File(preparedVideoPath);
    log(
      `画面适配完成: 分辨率 ${prepResult.width}x${prepResult.height}, 时长 ${prepResult.duration.toFixed(
        2
      )}s, 视频指纹: ${sha256Video.slice(0, 16)}...`,
      "success"
    );

    // 4. Step: Lip-sync submission (HeyGen MCP or PixVerse / OpenLux)
    const lipsyncProvider =
      task.inputs.lipsyncProvider || config.lipsyncProvider || "heygen";

    currentStep = "mcp_preflight";
    TaskStore.update(taskId, {
      step: "mcp_preflight",
      progress: 50,
    });

    // Submission title based on hashes for idempotency
    const submissionTitle = `lipsync_${sha256Video.slice(0, 8)}_${sha256Audio.slice(
      0,
      8
    )}`;

    // Prepare public URLs for media
    const baseUrl = config.publicBaseUrl.replace(/\/$/, "");
    let publicVideoUrl = `${baseUrl}/jobs/${taskId}/heygen-source-video.mp4`;
    let publicAudioUrl = `${baseUrl}/jobs/${taskId}/exact-final-indextts.wav`;

    // If Tencent Cloud COS is configured, upload prepared video & audio to COS for 100% reachable public access
    if (CosService.isConfigured()) {
      try {
        log("☁️ 正在将预处理音画直链同步至腾讯云 COS 高速分发...", "info");
        publicVideoUrl = await CosService.uploadFile(
          preparedVideoPath,
          `jobs/${taskId}/heygen-source-video.mp4`
        );
        publicAudioUrl = await CosService.uploadFile(
          ttsResult.finalWavPath,
          `jobs/${taskId}/exact-final-indextts.wav`
        );
        log("✅ 预处理音视频直链已就绪 (腾讯云 COS)", "success");
      } catch (cosErr: any) {
        console.warn("COS sync for inputs failed, fallback to baseUrl:", cosErr.message);
      }
    }

    let heygenResult: {
      lipsyncId: string;
      status: "completed" | "failed";
      downloadUrl?: string;
      creditsUsed?: number;
    };

    if (lipsyncProvider === "pixverse") {
      log("🛡️ 第三步: 校验 PixVerse 对口型素材...");
      if (!fs.existsSync(preparedVideoPath) || !fs.existsSync(ttsResult.finalWavPath)) {
        throw new Error("预处理视频或原声音轨不存在，无法提交 PixVerse 对口型");
      }
      log("素材校验通过，准备上传至 OpenLux / PixVerse", "success");

      currentStep = "mcp_lipsync_submit";
      TaskStore.update(taskId, {
        step: "mcp_lipsync_submit",
        progress: 65,
      });
      log("🔌 第四步: 正在调度 PixVerse (pixverse-lipsync) 对口型...");

      heygenResult = await OpenLuxLipsyncAdapter.execute(
        {
          videoPath: preparedVideoPath,
          audioPath: ttsResult.finalWavPath,
          videoUrl: publicVideoUrl,
          audioUrl: publicAudioUrl,
          onLog: (m) => log(m),
          onJobCreated: ({ lipsyncId, creditsUsed }) => {
            TaskStore.update(taskId, {
              results: {
                heygenLipsyncId: lipsyncId,
                lipsyncProvider: "pixverse",
                lipsyncCredits: creditsUsed,
              },
            });
          },
          onResultReady: ({ lipsyncId, downloadUrl, creditsUsed }) => {
            TaskStore.update(taskId, {
              results: {
                heygenLipsyncId: lipsyncId,
                lipsyncProvider: "pixverse",
                lipsyncCredits: creditsUsed,
                pixverseResultUrl: downloadUrl,
              },
            });
          },
        },
        jobDir
      );
    } else {
      log("🛡️ 第三步: 零计费门禁校验媒体直链...");

      currentStep = "mcp_lipsync_submit";
      TaskStore.update(taskId, {
        step: "mcp_lipsync_submit",
        progress: 65,
      });
      log("🔌 第四步: 正在调度 AI 高精度唇形驱动引擎...");

      heygenResult = await HeyGenMcpAdapter.executeLipsync(
        {
          videoUrl: publicVideoUrl,
          audioUrl: publicAudioUrl,
          submissionTitle,
          onLog: (m) => log(m),
        },
        jobDir
      );
    }

    // 5. Step: Finalize and Remux with exact audio
    currentStep = "finalize";
    TaskStore.update(taskId, {
      step: "finalize",
      progress: 85,
    });
    log("🎧 第五步: 正在将生成的对口型视频与原声 WAV 音轨无损混流封装...");

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
      lipsync: {
        provider: lipsyncProvider,
        lipsync_id: heygenResult.lipsyncId,
        submission_title: submissionTitle,
        model: lipsyncProvider === "pixverse" ? "pixverse-lipsync" : "heygen-precision",
        credits: heygenResult.creditsUsed,
      },
      heygen: {
        lipsync_id: heygenResult.lipsyncId,
        submission_title: submissionTitle,
        mode: lipsyncProvider === "pixverse" ? "pixverse-lipsync" : "precision",
      },
    };

    const evidencePath = path.join(jobDir, "evidence.json");
    fs.writeFileSync(
      evidencePath,
      JSON.stringify(evidencePayload, null, 2),
      "utf-8"
    );

    // Upload final video, audio, evidence to Tencent Cloud COS if configured
    let finalVideoUrl = `/jobs/${taskId}/final.mp4`;
    let exactAudioUrl = `/jobs/${taskId}/exact-final-indextts.wav`;
    let evidenceJsonUrl = `/jobs/${taskId}/evidence.json`;

    if (CosService.isConfigured()) {
      try {
        log("☁️ 正在将合成的数字人成片上传至腾讯云 COS 永久存储...", "info");
        const cosVideoKey = `jobs/${taskId}/final.mp4`;
        finalVideoUrl = await CosService.uploadFile(finalVideoPath, cosVideoKey);
        log(`✅ 成片已成功存储至腾讯云 COS: ${finalVideoUrl}`, "success");

        const cosAudioKey = `jobs/${taskId}/exact-final-indextts.wav`;
        exactAudioUrl = await CosService.uploadFile(ttsResult.finalWavPath, cosAudioKey);

        const cosEvidenceKey = `jobs/${taskId}/evidence.json`;
        evidenceJsonUrl = await CosService.uploadFile(evidencePath, cosEvidenceKey);
      } catch (cosErr: any) {
        log(`⚠️ 腾讯云 COS 上传警告: ${cosErr.message}，降级使用本地直链`, "warn");
      }
    }

    // Done!
    currentStep = "done";
    TaskStore.update(taskId, {
      status: "completed",
      step: "done",
      progress: 100,
      results: {
        originalVideoUrl: task.inputs.videoUrl || `/jobs/${taskId}/${path.basename(task.inputs.videoPath)}`,
        finalVideoUrl,
        exactAudioUrl,
        evidenceJsonUrl,
        heygenLipsyncId: heygenResult.lipsyncId,
        lipsyncProvider,
        lipsyncCredits: heygenResult.creditsUsed,
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
