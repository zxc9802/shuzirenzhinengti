"use client";

import React, { useState, useEffect } from "react";
import {
  Play,
  RotateCcw,
  RefreshCw,
  Sliders,
  FileText,
  Volume2,
  AlertCircle,
  CheckCircle2,
  Zap,
  ArrowRight,
  Film,
  Video,
} from "lucide-react";
import {
  VideoUploader,
  PipelineVisualizer,
  TaskTerminal,
  PlayerComparison,
  VoiceSelector,
} from "@/components";
import { TaskItem } from "@/lib/store/task-store";
import { VoiceItem } from "@/lib/store/voice-store";
import { LipsyncProvider } from "@/lib/lipsync-provider";

const ACTIVE_TASK_KEY = "active_lipsync_task_id";

export default function StudioPage() {
  const [videoData, setVideoData] = useState<{
    name: string;
    path: string;
    url: string;
    probe: any;
  } | null>(null);

  const [scriptText, setScriptText] = useState("");
  const [toneProfile, setToneProfile] = useState<"low" | "high">("low");
  const [videoFit, setVideoFit] = useState<"smart" | "preserve">("smart");
  const [emotionIntensity, setEmotionIntensity] = useState(0.8);
  const [selectedVoice, setSelectedVoice] = useState<VoiceItem | null>(null);
  const [lipsyncProvider, setLipsyncProvider] = useState<LipsyncProvider>("veed");

  const [currentTask, setCurrentTask] = useState<TaskItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userSession, setUserSession] = useState<{ user?: any; billing?: any } | null>(null);

  // 1. Initial restore on mount
  useEffect(() => {
    // Fetch SSO Session info
    fetch(`/api/sso/session?t=${Date.now()}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.data) setUserSession(d.data);
      })
      .catch(() => {});

    // 1.1 Fast immediate restore from local storage cache
    const cachedTaskStr = localStorage.getItem("cached_active_task");
    if (cachedTaskStr) {
      try {
        const cachedTask: TaskItem = JSON.parse(cachedTaskStr);
        if (cachedTask && cachedTask.id) {
          setCurrentTask(cachedTask);
          if (cachedTask.inputs) {
            setScriptText(cachedTask.inputs.scriptText || "");
            setToneProfile(cachedTask.inputs.toneProfile || "low");
            setVideoFit(cachedTask.inputs.videoFit || "smart");
            setEmotionIntensity(cachedTask.inputs.emotionIntensity ?? 0.8);
            if (cachedTask.inputs.lipsyncProvider) {
              setLipsyncProvider(cachedTask.inputs.lipsyncProvider);
            }
            if (cachedTask.inputs.videoPath || cachedTask.inputs.videoUrl) {
              setVideoData({
                name: cachedTask.inputs.videoName || "口播素材.mp4",
                path: cachedTask.inputs.videoPath || "",
                url: cachedTask.inputs.videoUrl || "",
                probe: null,
              });
            }
          }
        }
      } catch (e) {
        // ignore cache parse error
      }
    }

    // 1.2 Network sync from API
    const restoreTask = async () => {
      const savedTaskId = localStorage.getItem(ACTIVE_TASK_KEY);
      let taskToLoad: TaskItem | null = null;

      if (savedTaskId) {
        try {
          const resp = await fetch(`/api/tasks/${savedTaskId}?t=${Date.now()}`);
          if (resp.ok) {
            const data = await resp.json();
            if (data.task) taskToLoad = data.task;
          }
        } catch {
          // ignore
        }
      }

      if (taskToLoad) {
        setCurrentTask(taskToLoad);
        localStorage.setItem(ACTIVE_TASK_KEY, taskToLoad.id);
        localStorage.setItem("cached_active_task", JSON.stringify(taskToLoad));

        if (taskToLoad.inputs) {
          setScriptText(taskToLoad.inputs.scriptText || "");
          setToneProfile(taskToLoad.inputs.toneProfile || "low");
          setVideoFit(taskToLoad.inputs.videoFit || "smart");
            setEmotionIntensity(taskToLoad.inputs.emotionIntensity ?? 0.8);
            if (taskToLoad.inputs.lipsyncProvider) {
              setLipsyncProvider(taskToLoad.inputs.lipsyncProvider);
            }
          if (taskToLoad.inputs.videoPath || taskToLoad.inputs.videoUrl) {
            setVideoData({
              name: taskToLoad.inputs.videoName || "口播素材.mp4",
              path: taskToLoad.inputs.videoPath || "",
              url: taskToLoad.inputs.videoUrl || "",
              probe: null,
            });
          }
        }
      }
    };

    // Check preselected avatar from /avatars
    const savedPreselectedAvatar = localStorage.getItem("preselected_avatar");
    if (savedPreselectedAvatar) {
      try {
        const parsed = JSON.parse(savedPreselectedAvatar);
        setVideoData(parsed);
        localStorage.removeItem("preselected_avatar");
      } catch (e) {
        // ignore
      }
    }

    // Check preselected voice from /voices
    const savedPreselectedVoice = localStorage.getItem("preselected_voice");
    if (savedPreselectedVoice) {
      try {
        const parsed = JSON.parse(savedPreselectedVoice);
        setSelectedVoice(parsed);
        localStorage.removeItem("preselected_voice");
      } catch (e) {
        // ignore
      }
    }

    restoreTask();
  }, []);

  // 2. Continuous real-time status poller
  useEffect(() => {
    const activeId = currentTask?.id || localStorage.getItem(ACTIVE_TASK_KEY);
    if (!activeId) return;

    let isSubscribed = true;

    const checkStatus = async () => {
      try {
        const resp = await fetch(`/api/tasks/${activeId}?t=${Date.now()}`);
        if (resp.ok) {
          const data = await resp.json();
          if (data.task && isSubscribed) {
            setCurrentTask(data.task);
            localStorage.setItem(ACTIVE_TASK_KEY, data.task.id);
            localStorage.setItem("cached_active_task", JSON.stringify(data.task));
          }
        }
      } catch (err) {
        console.error("Poller error:", err);
      }
    };

    const isTaskRunning =
      currentTask?.status === "processing" || currentTask?.status === "pending";

    const pollTimer = setInterval(
      checkStatus,
      isTaskRunning ? 1200 : 4000
    );

    return () => {
      isSubscribed = false;
      clearInterval(pollTimer);
    };
  }, [currentTask?.id, currentTask?.status]);

  const handleStartPipeline = async () => {
    if (!videoData) {
      setError("请先上传口播视频");
      return;
    }
    if (!scriptText.trim()) {
      setError("请输入已批准的口播文案");
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const resp = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoName: videoData.name,
          videoPath: videoData.path,
          videoUrl: videoData.url,
          scriptText: scriptText.trim(),
          toneProfile,
          videoFit,
          emotionIntensity,
          speakerVoiceId: selectedVoice?.id,
          speakerAudioUrl: selectedVoice?.audioUrl,
          lipsyncProvider,
        }),
      });

      if (!resp.ok) {
        const errJson = await resp.json();
        throw new Error(errJson.error || "创建任务失败");
      }

      const json = await resp.json();
      setCurrentTask(json.task);
      localStorage.setItem(ACTIVE_TASK_KEY, json.task.id);
      localStorage.setItem("cached_active_task", JSON.stringify(json.task));
    } catch (err: any) {
      setError(err.message || "任务启动失败");
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    localStorage.removeItem(ACTIVE_TASK_KEY);
    localStorage.removeItem("cached_active_task");
    setCurrentTask(null);
    setError(null);
  };

  const isRunning =
    currentTask?.status === "processing" || currentTask?.status === "pending";

  const canRecoverPaidJob = Boolean(
    currentTask &&
      currentTask.status !== "completed" &&
      ((currentTask.results?.heygenLipsyncId &&
        currentTask.results.heygenLipsyncId.length > 0) ||
        currentTask.results?.pixverseResultUrl ||
        currentTask.results?.veedResultUrl ||
        (currentTask.logs || []).some(
          (entry) =>
            entry.message.includes("任务已建立 (ID:") ||
            entry.message.includes("正在下载成片")
        ))
  );

  const handleRecoverPaidJob = async () => {
    if (!currentTask?.id || recovering) return;
    setRecovering(true);
    setError(null);
    try {
      const resp = await fetch(`/api/tasks/${currentTask.id}/recover`, {
        method: "POST",
      });
      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.error || "恢复失败");
      }
      if (data.task) {
        setCurrentTask(data.task);
        localStorage.setItem(ACTIVE_TASK_KEY, data.task.id);
        localStorage.setItem("cached_active_task", JSON.stringify(data.task));
      }
    } catch (err: any) {
      setError(err.message || "恢复已扣费成片失败");
    } finally {
      setRecovering(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Hero Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-white/[0.08] pb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white flex items-center gap-3">
            <span>数字人制作台</span>
          </h1>
          <p className="mt-1.5 text-xs sm:text-sm text-zinc-400 max-w-2xl leading-relaxed">
            上传口播视频与文案，选用专属克隆音色，一键生成唇形自然匹配的高清数字人视频。
          </p>
        </div>

        {currentTask && (
          <button
            onClick={handleReset}
            className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-zinc-800/80 px-4 py-2 text-xs font-semibold text-zinc-300 hover:bg-zinc-700 hover:text-white transition-all shadow-sm active:scale-[0.98] cursor-pointer"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            新建制作任务
          </button>
        )}
      </div>

      {/* Main Studio Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-7">
        {/* Left Column: Inputs & Settings */}
        <div className="lg:col-span-6 space-y-6">
          {/* Card 1: Video Input */}
          <div className="rounded-2xl border border-white/[0.08] bg-[#10121a]/80 p-5 backdrop-blur-xl shadow-xl">
            <h2 className="text-xs font-bold text-zinc-100 uppercase tracking-wider mb-3.5 flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-md bg-zinc-800 text-zinc-300 text-[11px] font-bold border border-white/[0.1]">
                1
              </span>
              口播视频素材 (MP4 / MOV)
            </h2>
            <VideoUploader
              onVideoUploaded={setVideoData}
              disabled={isRunning}
            />
          </div>

          {/* Card 2: Script Input */}
          <div className="rounded-2xl border border-white/[0.08] bg-[#10121a]/80 p-5 backdrop-blur-xl shadow-xl">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-bold text-zinc-100 uppercase tracking-wider flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-md bg-zinc-800 text-zinc-300 text-[11px] font-bold border border-white/[0.1]">
                  2
                </span>
                口播配音文案 (逐字合成)
              </h2>
              <span className="text-xs font-mono font-medium text-zinc-400 bg-black/40 px-2 py-0.5 rounded-md border border-white/[0.06]">
                {scriptText.length} 字
              </span>
            </div>

            <textarea
              rows={5}
              value={scriptText}
              onChange={(e) => setScriptText(e.target.value)}
              disabled={isRunning}
              placeholder="请输入需要进行语音合成与口型匹配的完整中文文案... (例如：大家好，今天给大家分享一款超好用的 AI 数字人智能工具)"
              className="w-full rounded-xl border border-white/[0.08] bg-black/40 p-3.5 text-xs sm:text-sm text-zinc-100 placeholder-zinc-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all disabled:opacity-50 font-normal leading-relaxed"
            />

            {/* Dynamic Duration & Points Estimation */}
            {scriptText.trim().length > 0 && (() => {
              const estDuration = Math.max(3, Math.ceil(scriptText.trim().length / 4.4));
              const estPoints = Math.ceil(estDuration * (userSession?.billing?.ratePerSecond ?? 20));
              const estCny = (estDuration * 0.2).toFixed(2);
              const isExternal =
                userSession?.billing?.isExternal ??
                (userSession?.user?.role !== "admin" &&
                  userSession?.user?.billingAudience !== "internal");
              const userBalance = userSession?.user?.pointsBalance;
              const isInsufficient =
                isExternal &&
                typeof userBalance === "number" &&
                userBalance < estPoints;

              return (
                <div className="mt-2.5 space-y-2">
                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-black/30 border border-white/[0.06] text-xs">
                    <div className="flex items-center gap-1.5 text-zinc-300">
                      <span className="text-zinc-400">预计生成时长:</span>
                      <span className="font-mono font-bold text-zinc-200">
                        ~{estDuration} 秒
                      </span>
                    </div>
                    <div>
                      {isExternal ? (
                        <div className="flex items-center gap-1.5 font-mono">
                          <span
                            className={`font-bold ${
                              isInsufficient ? "text-rose-400" : "text-amber-300"
                            }`}
                          >
                            预计消耗: {estPoints.toLocaleString()} 积分
                          </span>
                          <span className="text-[10px] text-zinc-400">
                            (¥{estCny} · {userSession?.billing?.ratePerSecond ?? 20}分/秒)
                          </span>
                        </div>
                      ) : (
                        <span className="text-emerald-400 font-semibold text-[11px]">
                          内部账号 · 免积分
                        </span>
                      )}
                    </div>
                  </div>

                  {isInsufficient && (
                    <div className="flex items-center gap-2 p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300">
                      <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
                      <span>
                        当前账户积分余额 (
                        {typeof userBalance === "number"
                          ? userBalance.toLocaleString()
                          : 0}{" "}
                        积分) 不足，本次需要 {estPoints.toLocaleString()}{" "}
                        积分，请先前往主站充值。
                      </span>
                    </div>
                  )}
                </div>
              );
            })()}

            {scriptText.trim().length >= 400 && (
              <p className="mt-2 text-[11px] leading-relaxed text-amber-300/90">
                文案约 {scriptText.trim().length} 字，口播大概 {Math.max(1, Math.round(scriptText.trim().length / 4.4 / 60))} 分钟。超过 90 秒会自动分段对口型再拼接，不会因为单次轮询超时整段失败。
              </p>
            )}
          </div>

          {/* Card 3: Lipsync engine */}
          <div className="rounded-2xl border border-white/[0.08] bg-[#10121a]/80 p-5 backdrop-blur-xl shadow-xl">
            <h2 className="text-xs font-bold text-zinc-100 uppercase tracking-wider mb-3.5 flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-md bg-zinc-800 text-zinc-300 text-[11px] font-bold border border-white/[0.1]">
                3
              </span>
              对口型引擎
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <button
                type="button"
                onClick={() => setLipsyncProvider("pixverse")}
                disabled={isRunning}
                className={`rounded-xl border p-3 text-left transition-all ${
                  lipsyncProvider === "pixverse"
                    ? "border-blue-500/80 bg-blue-500/15 text-blue-100 ring-1 ring-blue-500/30"
                    : "border-white/[0.06] bg-black/30 text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
                }`}
              >
                <div className="text-xs font-bold text-zinc-100">A</div>
                <div className="text-[11px] text-zinc-400 mt-0.5 leading-relaxed">
                  稳定对口型，按生成时长计费
                </div>
              </button>
              <button
                type="button"
                onClick={() => setLipsyncProvider("veed")}
                disabled={isRunning}
                className={`rounded-xl border p-3 text-left transition-all ${
                  lipsyncProvider === "veed"
                    ? "border-blue-500/80 bg-blue-500/15 text-blue-100 ring-1 ring-blue-500/30"
                    : "border-white/[0.06] bg-black/30 text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
                }`}
              >
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs font-bold text-zinc-100">B</span>
                  <span className="rounded-md bg-blue-500/20 px-1.5 py-0.5 text-[10px] font-bold text-blue-300 border border-blue-400/30">
                    （默认，推荐）
                  </span>
                </div>
                <div className="text-[11px] text-zinc-400 mt-0.5 leading-relaxed">
                  默认推荐，适合公网视频和音频素材
                </div>
              </button>
              <button
                type="button"
                onClick={() => setLipsyncProvider("heygen")}
                disabled={isRunning}
                className={`rounded-xl border p-3 text-left transition-all ${
                  lipsyncProvider === "heygen"
                    ? "border-blue-500/80 bg-blue-500/15 text-blue-100 ring-1 ring-blue-500/30"
                    : "border-white/[0.06] bg-black/30 text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
                }`}
              >
                <div className="text-xs font-bold text-zinc-100">C</div>
                <div className="text-[11px] text-zinc-400 mt-0.5 leading-relaxed">
                  高精度对口型，使用套餐额度
                </div>
              </button>
            </div>
          </div>

          {/* Card 4: Voice Selection & Fit Options */}
          <div className="rounded-2xl border border-white/[0.08] bg-[#10121a]/80 p-5 backdrop-blur-xl shadow-xl space-y-5">
            {/* Voice Library Selector */}
            <VoiceSelector
              selectedVoiceId={selectedVoice?.id}
              onSelectVoice={setSelectedVoice}
              disabled={isRunning}
            />

            <div className="border-t border-white/[0.06] pt-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Tone profile */}
                <div>
                  <label className="text-xs font-medium text-zinc-300 mb-1.5 block">
                    音调 / 语速配置 (Tone Profile)
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setToneProfile("low")}
                      disabled={isRunning}
                      className={`rounded-xl border p-2.5 text-xs font-semibold transition-all text-center ${
                        toneProfile === "low"
                          ? "border-blue-500/80 bg-blue-500/15 text-blue-200"
                          : "border-white/[0.06] bg-black/30 text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
                      }`}
                    >
                      标准音调 (1.0×)
                    </button>
                    <button
                      type="button"
                      onClick={() => setToneProfile("high")}
                      disabled={isRunning}
                      className={`rounded-xl border p-2.5 text-xs font-semibold transition-all text-center ${
                        toneProfile === "high"
                          ? "border-blue-500/80 bg-blue-500/15 text-blue-200"
                          : "border-white/[0.06] bg-black/30 text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
                      }`}
                    >
                      高音调提速 (1.2×)
                    </button>
                  </div>
                </div>

                {/* Video Fit */}
                <div>
                  <label className="text-xs font-medium text-zinc-300 mb-1.5 block">
                    画面对齐策略 (Video Fit)
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setVideoFit("smart")}
                      disabled={isRunning}
                      className={`rounded-xl border p-2.5 text-xs font-semibold transition-all text-center ${
                        videoFit === "smart"
                          ? "border-blue-500/80 bg-blue-500/15 text-blue-200"
                          : "border-white/[0.06] bg-black/30 text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
                      }`}
                    >
                      智能适配 (循环/裁剪)
                    </button>
                    <button
                      type="button"
                      onClick={() => setVideoFit("preserve")}
                      disabled={isRunning}
                      className={`rounded-xl border p-2.5 text-xs font-semibold transition-all text-center ${
                        videoFit === "preserve"
                          ? "border-blue-500/80 bg-blue-500/15 text-blue-200"
                          : "border-white/[0.06] bg-black/30 text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
                      }`}
                    >
                      严格保持原长
                    </button>
                  </div>
                </div>
              </div>

              {/* Emotion slider */}
              <div className="bg-black/30 p-3 rounded-xl border border-white/[0.06]">
                <div className="flex justify-between text-xs text-zinc-300 mb-1.5 font-medium">
                  <span>情绪与能量强度 (保持优质情绪参考)</span>
                  <span className="font-mono font-bold text-blue-400">{emotionIntensity}</span>
                </div>
                <input
                  type="range"
                  min="0.1"
                  max="0.85"
                  step="0.05"
                  value={emotionIntensity}
                  onChange={(e) => setEmotionIntensity(parseFloat(e.target.value))}
                  disabled={isRunning}
                  className="w-full accent-blue-500 bg-zinc-800 h-1.5 rounded-lg cursor-pointer"
                />
              </div>
            </div>
          </div>

          {/* Error display */}
          {error && (
            <div className="flex items-center gap-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 p-3.5 text-xs text-rose-300">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {/* Action Trigger */}
          {(() => {
            const estDuration = Math.max(3, Math.ceil(scriptText.trim().length / 4.4));
            const estPoints = Math.ceil(estDuration * (userSession?.billing?.ratePerSecond ?? 20));
            const isExternal =
              userSession?.billing?.isExternal ??
              (userSession?.user?.role !== "admin" &&
                userSession?.user?.billingAudience !== "internal");

            return (
              <button
                onClick={handleStartPipeline}
                disabled={loading || isRunning || !videoData || !scriptText.trim()}
                className="w-full flex items-center justify-center gap-2 rounded-2xl bg-blue-600 hover:bg-blue-500 p-4 text-sm font-bold text-white shadow-lg shadow-blue-600/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer active:scale-[0.99] border border-blue-400/30"
              >
                <Play className="h-4 w-4 fill-white" />
                <span>
                  {isRunning
                    ? "流水线正在运行中..."
                    : isExternal && scriptText.trim()
                    ? `开始执行数字人对口型流水线 (预估 ${estPoints.toLocaleString()} 积分)`
                    : "开始执行数字人对口型流水线"}
                </span>
                <ArrowRight className="h-4 w-4 text-blue-200 opacity-80 ml-1" />
              </button>
            );
          })()}
        </div>

        {/* Right Column: Pipeline, Logs & Results */}
        <div className="lg:col-span-6 space-y-6">
          {/* Pipeline Visualizer */}
          <PipelineVisualizer
            step={currentTask?.step || "idle"}
            failedStep={currentTask?.failedStep}
            progress={currentTask?.progress || 0}
            status={currentTask ? currentTask.status : "idle"}
          />

          {canRecoverPaidJob && (
            <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4">
              <p className="text-xs leading-relaxed text-amber-100">
                对口型已经渲染完成并扣过费。如果卡在「下载成片」，点下面按钮取回成片，不会再扣一次钱。
              </p>
              <button
                onClick={handleRecoverPaidJob}
                disabled={recovering}
                className="mt-3 inline-flex items-center gap-2 rounded-xl bg-amber-400 px-4 py-2 text-xs font-bold text-zinc-950 hover:bg-amber-300 disabled:opacity-60"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${recovering ? "animate-spin" : ""}`} />
                {recovering ? "正在取回成片..." : "取回已扣费成片"}
              </button>
            </div>
          )}

          {/* Result Player if completed */}
          {currentTask?.status === "completed" && (
            <PlayerComparison
              taskId={currentTask.id}
              originalVideoUrl={currentTask.results.originalVideoUrl}
              finalVideoUrl={currentTask.results.finalVideoUrl}
              exactAudioUrl={currentTask.results.exactAudioUrl}
              evidenceJsonUrl={currentTask.results.evidenceJsonUrl}
              metadata={currentTask.results}
            />
          )}

          {/* Live Terminal Logs */}
          <TaskTerminal logs={currentTask?.logs || []} />
        </div>
      </div>
    </div>
  );
}
