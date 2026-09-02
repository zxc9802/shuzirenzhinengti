"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Settings,
  Save,
  CheckCircle2,
  AlertCircle,
  Mic,
  Cpu,
  Server,
  Terminal,
  Volume2,
  Play,
  Pause,
  Plus,
  Trash2,
  UploadCloud,
  X,
  RefreshCw,
  Check,
  Cloud,
  Layers,
  Zap,
  Film,
  Eye,
  EyeOff,
} from "lucide-react";
import { VoiceItem } from "@/lib/store/voice-store";
import { cn } from "@/lib/utils";
import HeyGenConnectButton from "@/components/HeyGenConnectButton";

export default function SettingsPage() {
  const [config, setConfig] = useState<any>({
    indexttsApiKey: "",
    indexttsBaseUrl: "https://api.302.ai",
    indexttsSpeakerAudioUrl: "",
    indexttsEmotionAudioUrl: "",
    heygenMcpTransport: "stdio",
    heygenMcpServerUrl: "http://localhost:8000/sse",
    heygenMcpServerCommand: "node",
    heygenMcpServerArgs: ["scripts/heygen_mcp_server.mjs"],
    lipsyncProvider: "heygen",
    openluxApiKey: "",
    openluxBaseUrl: "https://api.openlux.ai",
    openluxLipsyncModel: "pixverse-lipsync",
    pixverseIngestUrl: "",
    pixverseIngestToken: "",
    falApiKey: "",
    falVeedModel: "veed/lipsync",

    // cloud object storage
    cosSecretId: "",
    cosSecretKey: "",
    cosBucket: "",
    cosRegion: "ap-guangzhou",
    cosCustomDomain: "",
    cosEnabled: true,
  });

  const [voices, setVoices] = useState<VoiceItem[]>([]);
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const [isVoiceModalOpen, setIsVoiceModalOpen] = useState(false);

  // New Voice Modal State
  const [voiceName, setVoiceName] = useState("");
  const [voiceDesc, setVoiceDesc] = useState("");
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [customAudioUrl, setCustomAudioUrl] = useState("");
  const [inputMode, setInputMode] = useState<"file" | "url">("file");
  const [uploadingVoice, setUploadingVoice] = useState(false);
  const [voiceModalError, setVoiceModalError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleSelectFile = (file: File) => {
    if (!file) return;
    setAudioFile(file);
    setVoiceModalError(null);
    if (!voiceName) {
      setVoiceName(file.name.replace(/\.[^/.]+$/, ""));
    }
  };

  // COS Test State
  const [testingCos, setTestingCos] = useState(false);
  const [cosTestResult, setCosTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showHeyGenKey, setShowHeyGenKey] = useState(false);
  const [showOpenluxKey, setShowOpenluxKey] = useState(false);
  const [showFalKey, setShowFalKey] = useState(false);
  const [testingHeyGen, setTestingHeyGen] = useState(false);
  const [heygenTestResult, setHeygenTestResult] = useState<{
    success: boolean;
    quota?: number;
    remainingQuota?: number;
    planName?: string;
    error?: string;
  } | null>(null);

  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchData = async () => {
    try {
      const [settingsResp, voicesResp] = await Promise.all([
        fetch("/api/settings"),
        fetch("/api/voices"),
      ]);
      const settingsData = await settingsResp.json();
      if (settingsData.config) setConfig(settingsData.config);

      const voicesData = await voicesResp.json();
      if (voicesData.voices) setVoices(voicesData.voices);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handlePlayVoice = (voice: VoiceItem, e: React.MouseEvent) => {
    e.stopPropagation();
    if (playingAudioId === voice.id) {
      audioPlayerRef.current?.pause();
      setPlayingAudioId(null);
    } else {
      if (!audioPlayerRef.current) {
        audioPlayerRef.current = new Audio();
      }
      audioPlayerRef.current.src = voice.audioUrl;
      audioPlayerRef.current.play().catch((err) => console.warn("Audio play error", err));
      setPlayingAudioId(voice.id);
      audioPlayerRef.current.onended = () => setPlayingAudioId(null);
    }
  };

  const handleCreateVoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!voiceName.trim()) {
      setVoiceModalError("请输入音色名称");
      return;
    }

    setUploadingVoice(true);
    setVoiceModalError(null);

    try {
      if (inputMode === "file") {
        if (!audioFile) throw new Error("请选择参考音频文件 (MP3/WAV/M4A)");
        const formData = new FormData();
        formData.append("file", audioFile);
        formData.append("name", voiceName.trim());
        formData.append("description", voiceDesc.trim() || "用户自定义录制原声");

        const resp = await fetch("/api/voices", { method: "POST", body: formData });
        const data = await resp.json();
        if (!data.success) throw new Error(data.error || "上传失败");
        setVoices((prev) => [data.voice, ...prev]);
      } else {
        if (!customAudioUrl.trim()) throw new Error("请输入音频文件的公网直链 URL");
        const resp = await fetch("/api/voices", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: voiceName.trim(),
            description: voiceDesc.trim() || "自定义音频直链",
            audioUrl: customAudioUrl.trim(),
          }),
        });
        const data = await resp.json();
        if (!data.success) throw new Error(data.error || "添加失败");
        setVoices((prev) => [data.voice, ...prev]);
      }

      setIsVoiceModalOpen(false);
      setVoiceName("");
      setVoiceDesc("");
      setAudioFile(null);
      setCustomAudioUrl("");
    } catch (err: any) {
      setVoiceModalError(err.message || "创建音色失败");
    } finally {
      setUploadingVoice(false);
    }
  };

  const handleDeleteVoice = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("确定要从声音库中删除此音色吗？")) return;
    try {
      const resp = await fetch(`/api/voices?id=${id}`, { method: "DELETE" });
      const data = await resp.json();
      if (data.success) {
        setVoices((prev) => prev.filter((v) => v.id !== id));
      }
    } catch (err) {
      console.error("Delete voice error", err);
    }
  };

  const handleTestHeyGen = async () => {
    if (!config.heygenApiKey?.trim()) {
      setHeygenTestResult({ success: false, error: "请先输入 HeyGen 套餐 Token" });
      return;
    }
    setTestingHeyGen(true);
    setHeygenTestResult(null);
    try {
      const resp = await fetch("/api/mcp/heygen/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: config.heygenApiKey.trim(),
          baseUrl: config.heygenApiBaseUrl || "https://api.heygen.com",
        }),
      });
      const data = await resp.json();
      setHeygenTestResult(data);
    } catch (err: any) {
      setHeygenTestResult({ success: false, error: err.message || "请求异常" });
    } finally {
      setTestingHeyGen(false);
    }
  };

  const handleTestCos = async () => {
    setTestingCos(true);
    setCosTestResult(null);
    try {
      const resp = await fetch("/api/cos/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cosSecretId: config.cosSecretId,
          cosSecretKey: config.cosSecretKey,
          cosBucket: config.cosBucket,
          cosRegion: config.cosRegion,
          cosCustomDomain: config.cosCustomDomain,
        }),
      });
      const data = await resp.json();
      setCosTestResult(data);
    } catch (err: any) {
      setCosTestResult({ success: false, message: err.message || "网络异常" });
    } finally {
      setTestingCos(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    setError(null);

    try {
      const resp = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });

      if (!resp.ok) throw new Error("保存配置失败");
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="border-b border-white/[0.08] pb-6">
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white flex items-center gap-3">
          <Settings className="h-7 w-7 text-blue-400" />
          <span>系统参数与对象存储配置</span>
        </h1>
        <p className="mt-1.5 text-xs sm:text-sm text-zinc-400">
          管理云端对象存储、发音人声音库、HeyGen MCP 客户端与 302.AI 接口凭据。
        </p>
      </div>

      {/* Section 0: cloud object storage Storage Configuration */}
      <div className="rounded-2xl border border-white/[0.08] bg-[#10121a]/80 p-6 backdrop-blur-xl shadow-xl space-y-5">
        <div className="flex items-center justify-between border-b border-white/[0.08] pb-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400">
              <Cloud className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-zinc-100 uppercase tracking-wider">
                云端对象存储 (Object Storage) 配置
              </h2>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                口播形象视频与媒体素材将自动存入云端存储，实现公网高速分发与持久化
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleTestCos}
            disabled={testingCos || !config.cosSecretId || !config.cosSecretKey}
            className="flex items-center gap-1.5 rounded-xl border border-white/[0.1] bg-white/[0.05] hover:bg-white/[0.1] px-3 py-1.5 text-xs font-semibold text-zinc-200 transition-all disabled:opacity-40 cursor-pointer"
          >
            {testingCos ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin text-blue-400" />
            ) : (
              <Zap className="h-3.5 w-3.5 text-blue-400" />
            )}
            <span>{testingCos ? "正在校验密钥..." : "测试存储连接"}</span>
          </button>
        </div>

        {cosTestResult && (
          <div
            className={cn(
              "flex items-center gap-2 rounded-xl p-3 text-xs font-medium",
              cosTestResult.success
                ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-300"
                : "bg-rose-500/10 border border-rose-500/20 text-rose-300"
            )}
          >
            {cosTestResult.success ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
            )}
            <span>{cosTestResult.message}</span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-300">
              SecretId (COS_SECRET_ID)
            </label>
            <input
              type="text"
              value={config.cosSecretId || ""}
              onChange={(e) => setConfig({ ...config, cosSecretId: e.target.value })}
              placeholder="AKID..."
              className="w-full rounded-xl border border-white/[0.08] bg-black/40 p-3 text-xs font-mono text-zinc-200 focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-300">
              SecretKey (COS_SECRET_KEY)
            </label>
            <input
              type="password"
              value={config.cosSecretKey || ""}
              onChange={(e) => setConfig({ ...config, cosSecretKey: e.target.value })}
              placeholder="••••••••••••••••••••"
              className="w-full rounded-xl border border-white/[0.08] bg-black/40 p-3 text-xs font-mono text-zinc-200 focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-300">
              存储桶名称 Bucket (COS_BUCKET)
            </label>
            <input
              type="text"
              value={config.cosBucket || ""}
              onChange={(e) => setConfig({ ...config, cosBucket: e.target.value })}
              placeholder="例如: digital-human-1250000000"
              className="w-full rounded-xl border border-white/[0.08] bg-black/40 p-3 text-xs font-mono text-zinc-200 focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-300">
              所属地域 Region (COS_REGION)
            </label>
            <input
              type="text"
              value={config.cosRegion || "ap-guangzhou"}
              onChange={(e) => setConfig({ ...config, cosRegion: e.target.value })}
              placeholder="例如: ap-guangzhou / ap-shanghai / ap-beijing"
              className="w-full rounded-xl border border-white/[0.08] bg-black/40 p-3 text-xs font-mono text-zinc-200 focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div className="sm:col-span-2 space-y-1.5">
            <label className="text-xs font-medium text-zinc-300">
              自定义 CDN 加速域名 (可选，留空则使用默认对象存储域名)
            </label>
            <input
              type="text"
              value={config.cosCustomDomain || ""}
              onChange={(e) => setConfig({ ...config, cosCustomDomain: e.target.value })}
              placeholder="例如: https://cdn.your-domain.com"
              className="w-full rounded-xl border border-white/[0.08] bg-black/40 p-3 text-xs font-mono text-zinc-200 focus:border-blue-500 focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* Voice Library Management Section */}
      <div className="rounded-2xl border border-white/[0.08] bg-[#10121a]/80 p-6 backdrop-blur-xl shadow-xl space-y-5">
        <div className="flex items-center justify-between border-b border-white/[0.08] pb-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400">
              <Mic className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-zinc-100 uppercase tracking-wider">
                发音人声音库管理 (Voice Library)
              </h2>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                支持上传自定义参考人声进行即时声音克隆，生成数字人时可随时选用
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsVoiceModalOpen(true)}
            className="flex items-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 px-3.5 py-1.5 text-xs font-bold text-white shadow-sm transition-all cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>+ 新增克隆音色</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {voices.map((voice) => {
            const isPlaying = playingAudioId === voice.id;
            return (
              <div
                key={voice.id}
                className="group flex items-center justify-between p-3.5 rounded-xl border border-white/[0.08] bg-black/40 hover:border-white/[0.16] transition-all"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1 mr-2">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.05] border border-white/[0.08] text-zinc-400">
                    <Volume2 className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-zinc-100 truncate">
                        {voice.name}
                      </span>
                      {voice.isDefault && (
                        <span className="rounded-md bg-white/[0.08] border border-white/[0.1] px-1.5 py-0.2 text-[9px] font-mono text-zinc-400">
                          默认预设
                        </span>
                      )}
                    </div>
                    {voice.description && (
                      <p className="text-[10px] text-zinc-400 truncate mt-0.5">
                        {voice.description}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    title="试听音色"
                    onClick={(e) => handlePlayVoice(voice, e)}
                    className={cn(
                      "h-7 w-7 flex items-center justify-center rounded-lg border text-xs transition-all",
                      isPlaying
                        ? "bg-blue-600 text-white border-blue-500 animate-pulse"
                        : "bg-white/[0.06] hover:bg-white/[0.12] text-zinc-300 border-white/[0.08]"
                    )}
                  >
                    {isPlaying ? <Pause className="h-3 w-3 fill-white" /> : <Play className="h-3 w-3 fill-zinc-300 ml-0.5" />}
                  </button>

                  {!voice.isDefault && voice.canManage !== false && (
                    <button
                      type="button"
                      title="删除此音色"
                      onClick={(e) => handleDeleteVoice(voice.id, e)}
                      className="h-7 w-7 flex items-center justify-center rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 transition-all"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Main Settings Form */}
      <form onSubmit={handleSave} className="space-y-7">
        {/* Section 1: HeyGen MCP Client Configuration */}
        <div className="rounded-2xl border border-white/[0.08] bg-[#10121a]/80 p-6 backdrop-blur-xl shadow-xl space-y-5">
          <div className="flex items-center justify-between border-b border-white/[0.08] pb-3.5">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400">
                <Cpu className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-zinc-100 uppercase tracking-wider">
                  HeyGen MCP 套餐调度与通信配置
                </h2>
                <p className="text-[11px] text-zinc-400 mt-0.5">
                  通过 Model Context Protocol 协议直接调度 HeyGen 订阅套餐，扣除账号 Premium Credits 额度
                </p>
              </div>
            </div>
            <span className="flex items-center gap-1 text-[11px] text-zinc-400 bg-white/[0.04] border border-white/[0.08] px-2.5 py-0.5 rounded-lg font-semibold">
              官方 OAuth / 备用 Token
            </span>
          </div>

          <HeyGenConnectButton />

          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-300 flex items-center justify-between">
                  <span>HeyGen 账号套餐 Token / 凭证</span>
                  <span className="text-[10px] text-blue-400 font-mono">用于挂接 HeyGen 订阅套餐</span>
                </label>
                <div className="relative">
                  <input
                    type={showHeyGenKey ? "text" : "password"}
                    value={config.heygenApiKey || ""}
                    onChange={(e) => setConfig({ ...config, heygenApiKey: e.target.value })}
                    placeholder="输入您的 HeyGen 账号授权 Token / Key..."
                    className="w-full rounded-xl border border-white/[0.08] bg-black/40 p-3 pr-10 text-xs font-mono text-zinc-200 placeholder-zinc-600 focus:border-blue-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowHeyGenKey(!showHeyGenKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                  >
                    {showHeyGenKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-300">
                  HeyGen API Base URL
                </label>
                <input
                  type="text"
                  value={config.heygenApiBaseUrl || "https://api.heygen.com"}
                  onChange={(e) => setConfig({ ...config, heygenApiBaseUrl: e.target.value })}
                  placeholder="https://api.heygen.com"
                  className="w-full rounded-xl border border-white/[0.08] bg-black/40 p-3 text-xs font-mono text-zinc-200 placeholder-zinc-600 focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Test HeyGen Subscription Button & Result */}
            <div className="pt-1">
              <button
                type="button"
                onClick={handleTestHeyGen}
                disabled={testingHeyGen || !config.heygenApiKey}
                className="flex items-center gap-2 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 px-4 py-2 text-xs font-bold text-blue-300 transition-all cursor-pointer disabled:opacity-40"
              >
                {testingHeyGen ? (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Zap className="h-3.5 w-3.5 text-blue-400" />
                )}
                <span>验证 HeyGen 套餐授权与剩余点数</span>
              </button>

              {heygenTestResult && (
                <div
                  className={`mt-2.5 flex items-center gap-2 rounded-xl p-3 text-xs ${
                    heygenTestResult.success
                      ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-300"
                      : "bg-rose-500/10 border border-rose-500/30 text-rose-300"
                  }`}
                >
                  {heygenTestResult.success ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                  ) : (
                    <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
                  )}
                  <span>
                    {heygenTestResult.success
                      ? `验证成功！当前套餐: ${heygenTestResult.planName || "标准套餐"} | 剩余额度: ${heygenTestResult.remainingQuota ?? 0} Credits`
                      : `验证未通过: ${heygenTestResult.error || "鉴权失败"}`}
                  </span>
                </div>
              )}
            </div>

            <div>
              <label className="text-xs font-medium text-zinc-300 mb-2 block">
                MCP 传输模式 (Transport)
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={() =>
                    setConfig({
                      ...config,
                      heygenMcpTransport: "remote",
                      heygenMcpServerUrl: "https://mcp.heygen.com/mcp/v1",
                    })
                  }
                  className={`rounded-xl border p-3.5 text-xs font-semibold transition-all text-left flex items-start gap-3 ${
                    config.heygenMcpTransport === "remote"
                      ? "border-blue-500/80 bg-blue-500/15 text-blue-200 shadow-sm ring-1 ring-blue-500/30"
                      : "border-white/[0.06] bg-black/30 text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
                  }`}
                >
                  <Cpu className="h-4 w-4 mt-0.5 shrink-0 text-blue-400" />
                  <div>
                    <div className="font-bold text-zinc-100">官方 Remote MCP</div>
                    <div className="text-[11px] text-zinc-400 font-normal mt-0.5">
                      OAuth 授权后直连 mcp.heygen.com
                    </div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setConfig({ ...config, heygenMcpTransport: "stdio" })}
                  className={`rounded-xl border p-3.5 text-xs font-semibold transition-all text-left flex items-start gap-3 ${
                    config.heygenMcpTransport === "stdio"
                      ? "border-blue-500/80 bg-blue-500/15 text-blue-200 shadow-sm ring-1 ring-blue-500/30"
                      : "border-white/[0.06] bg-black/30 text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
                  }`}
                >
                  <Terminal className="h-4 w-4 mt-0.5 shrink-0 text-blue-400" />
                  <div>
                    <div className="font-bold text-zinc-100">Stdio (本地子进程)</div>
                    <div className="text-[11px] text-zinc-400 font-normal mt-0.5">
                      标准进程管道启动本地 MCP Server（开箱即用）
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setConfig({ ...config, heygenMcpTransport: "sse" })}
                  className={`rounded-xl border p-3.5 text-xs font-semibold transition-all text-left flex items-start gap-3 ${
                    config.heygenMcpTransport === "sse"
                      ? "border-blue-500/80 bg-blue-500/15 text-blue-200 shadow-sm ring-1 ring-blue-500/30"
                      : "border-white/[0.06] bg-black/30 text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
                  }`}
                >
                  <Server className="h-4 w-4 mt-0.5 shrink-0 text-zinc-400" />
                  <div>
                    <div className="font-bold text-zinc-100">SSE / HTTP (远程模式)</div>
                    <div className="text-[11px] text-zinc-400 font-normal mt-0.5">
                      连接外部运行的 HeyGen MCP SSE 服务端
                    </div>
                  </div>
                </button>
              </div>
            </div>

            {config.heygenMcpTransport === "remote" ? (
              <p className="text-[11px] text-zinc-400">
                使用官方 Remote MCP。请先点击上方「授权连接 HeyGen MCP」完成登录。
              </p>
            ) : config.heygenMcpTransport === "stdio" ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-zinc-300">
                    Stdio 启动程序 (Command)
                  </label>
                  <input
                    type="text"
                    value={config.heygenMcpServerCommand || "node"}
                    onChange={(e) =>
                      setConfig({ ...config, heygenMcpServerCommand: e.target.value })
                    }
                    className="w-full rounded-xl border border-white/[0.08] bg-black/40 p-3 text-xs font-mono text-zinc-200 focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-zinc-300">
                    Stdio 参数 (Args, 空格分隔)
                  </label>
                  <input
                    type="text"
                    value={
                      Array.isArray(config.heygenMcpServerArgs)
                        ? config.heygenMcpServerArgs.join(" ")
                        : config.heygenMcpServerArgs || "scripts/heygen_mcp_server.mjs"
                    }
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        heygenMcpServerArgs: e.target.value.split(" ").filter(Boolean),
                      })
                    }
                    className="w-full rounded-xl border border-white/[0.08] bg-black/40 p-3 text-xs font-mono text-zinc-200 focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-300">
                  HeyGen MCP Server SSE 端点 URL
                </label>
                <input
                  type="text"
                  value={config.heygenMcpServerUrl || ""}
                  onChange={(e) =>
                    setConfig({ ...config, heygenMcpServerUrl: e.target.value })
                  }
                  placeholder="http://localhost:8000/sse"
                  className="w-full rounded-xl border border-white/[0.08] bg-black/40 p-3 text-xs font-mono text-zinc-200 focus:border-blue-500 focus:outline-none"
                />
              </div>
            )}
          </div>
        </div>

        {/* Section 1b: OpenLux / PixVerse lipsync */}
        <div className="rounded-2xl border border-white/[0.08] bg-[#10121a]/80 p-6 backdrop-blur-xl shadow-xl space-y-5">
          <div className="flex items-center justify-between border-b border-white/[0.08] pb-3.5">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400">
                <Zap className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-zinc-100 uppercase tracking-wider">
                  PixVerse 对口型 (OpenLux)
                </h2>
                <p className="text-[11px] text-zinc-400 mt-0.5">
                  直连 pixverse-lipsync，制作台可与 VEED、HeyGen 三选一
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-xs font-medium text-zinc-300">OpenLux API Key</label>
              <div className="relative">
                <input
                  type={showOpenluxKey ? "text" : "password"}
                  value={config.openluxApiKey || ""}
                  onChange={(e) => setConfig({ ...config, openluxApiKey: e.target.value })}
                  placeholder="sk-..."
                  className="w-full rounded-xl border border-white/[0.08] bg-black/40 p-3 pr-10 text-xs font-mono text-zinc-200 placeholder-zinc-600 focus:border-blue-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowOpenluxKey(!showOpenluxKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                >
                  {showOpenluxKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-300">接口地址</label>
              <input
                type="text"
                value={config.openluxBaseUrl || "https://api.openlux.ai"}
                onChange={(e) => setConfig({ ...config, openluxBaseUrl: e.target.value })}
                className="w-full rounded-xl border border-white/[0.08] bg-black/40 p-3 text-xs font-mono text-zinc-200 focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-300">模型名</label>
              <input
                type="text"
                value={config.openluxLipsyncModel || "pixverse-lipsync"}
                onChange={(e) => setConfig({ ...config, openluxLipsyncModel: e.target.value })}
                className="w-full rounded-xl border border-white/[0.08] bg-black/40 p-3 text-xs font-mono text-zinc-200 focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-300">默认对口型引擎</label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setConfig({ ...config, lipsyncProvider: "pixverse" })}
                className={`rounded-xl border p-2.5 text-xs font-semibold ${
                  config.lipsyncProvider === "pixverse"
                    ? "border-blue-500/80 bg-blue-500/15 text-blue-200"
                    : "border-white/[0.06] bg-black/30 text-zinc-400"
                }`}
              >
                PixVerse
              </button>
              <button
                type="button"
                onClick={() => setConfig({ ...config, lipsyncProvider: "veed" })}
                className={`rounded-xl border p-2.5 text-xs font-semibold ${
                  config.lipsyncProvider === "veed"
                    ? "border-blue-500/80 bg-blue-500/15 text-blue-200"
                    : "border-white/[0.06] bg-black/30 text-zinc-400"
                }`}
              >
                VEED (默认，推荐)
              </button>
              <button
                type="button"
                onClick={() => setConfig({ ...config, lipsyncProvider: "heygen" })}
                className={`rounded-xl border p-2.5 text-xs font-semibold ${
                  config.lipsyncProvider === "heygen"
                    ? "border-blue-500/80 bg-blue-500/15 text-blue-200"
                    : "border-white/[0.06] bg-black/30 text-zinc-400"
                }`}
              >
                HeyGen
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-xs font-medium text-zinc-300">广州云函数中转地址</label>
              <input
                type="text"
                value={config.pixverseIngestUrl || ""}
                onChange={(e) => setConfig({ ...config, pixverseIngestUrl: e.target.value })}
                placeholder="https://xxxxx.example.com"
                className="w-full rounded-xl border border-white/[0.08] bg-black/40 p-3 text-xs font-mono text-zinc-200 placeholder-zinc-600 focus:border-blue-500 focus:outline-none"
              />
              <p className="text-[11px] leading-relaxed text-zinc-500">
                新加坡服务器先让广州函数去拉 PixVerse，再从新加坡云端存储取片。不填则仍直连。
              </p>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-xs font-medium text-zinc-300">中转令牌</label>
              <input
                type="password"
                value={config.pixverseIngestToken || ""}
                onChange={(e) => setConfig({ ...config, pixverseIngestToken: e.target.value })}
                placeholder="与云函数 INGEST_TOKEN 一致"
                className="w-full rounded-xl border border-white/[0.08] bg-black/40 p-3 text-xs font-mono text-zinc-200 placeholder-zinc-600 focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Section 1c: VEED / fal.ai lipsync */}
        <div className="rounded-2xl border border-white/[0.08] bg-[#10121a]/80 p-6 backdrop-blur-xl shadow-xl space-y-5">
          <div className="flex items-center justify-between border-b border-white/[0.08] pb-3.5">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400">
                <Film className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-zinc-100 uppercase tracking-wider">
                  VEED 对口型 (fal.ai)
                </h2>
                <p className="text-[11px] text-zinc-400 mt-0.5">
                  队列接口 queue.fal.run，制作台可与 PixVerse、HeyGen 三选一
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-xs font-medium text-zinc-300">fal API Key</label>
              <div className="relative">
                <input
                  type={showFalKey ? "text" : "password"}
                  value={config.falApiKey || ""}
                  onChange={(e) => setConfig({ ...config, falApiKey: e.target.value })}
                  placeholder="key_id:key_secret"
                  className="w-full rounded-xl border border-white/[0.08] bg-black/40 p-3 pr-10 text-xs font-mono text-zinc-200 placeholder-zinc-600 focus:border-blue-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowFalKey(!showFalKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                >
                  {showFalKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-xs font-medium text-zinc-300">模型 ID</label>
              <input
                type="text"
                value={config.falVeedModel || "veed/lipsync"}
                onChange={(e) => setConfig({ ...config, falVeedModel: e.target.value })}
                placeholder="veed/lipsync"
                className="w-full rounded-xl border border-white/[0.08] bg-black/40 p-3 text-xs font-mono text-zinc-200 focus:border-blue-500 focus:outline-none"
              />
              <p className="text-[11px] leading-relaxed text-zinc-500">
                默认 `veed/lipsync`。若要换 fal 上的 Lipsync v2，可改成 `veed/lipsync/v2`。
              </p>
            </div>
          </div>
        </div>

        {/* Section 2: IndexTTS 302.AI Configuration */}
        <div className="rounded-2xl border border-white/[0.08] bg-[#10121a]/80 p-6 backdrop-blur-xl shadow-xl space-y-5">
          <div className="flex items-center gap-2.5 border-b border-white/[0.08] pb-3.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400">
              <Mic className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-zinc-100 uppercase tracking-wider">
                302.AI IndexTTS-2 接口凭据与情绪参考
              </h2>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                配置 API Key 与基准情绪参考音频
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-300">
                302.AI API Key (INDEXTTS_302_API_KEY)
              </label>
              <input
                type="text"
                value={config.indexttsApiKey || ""}
                onChange={(e) =>
                  setConfig({ ...config, indexttsApiKey: e.target.value })
                }
                placeholder="sk-..."
                className="w-full rounded-xl border border-white/[0.08] bg-black/40 p-3 text-xs font-mono text-zinc-200 focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-300">
                语气与情绪参考音频 URL (INDEXTTS_EMOTION_AUDIO_URL)
              </label>
              <input
                type="text"
                value={config.indexttsEmotionAudioUrl || ""}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    indexttsEmotionAudioUrl: e.target.value,
                  })
                }
                placeholder="https://.../emotion_reference.wav"
                className="w-full rounded-xl border border-white/[0.08] bg-black/40 p-3 text-xs font-mono text-zinc-200 focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Status messages */}
        {saved && (
          <div className="flex items-center gap-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-3.5 text-xs text-emerald-300 font-semibold">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
            <span>系统配置已成功保存！</span>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 p-3.5 text-xs text-rose-300">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        {/* Save button */}
        <button
          type="submit"
          disabled={saving || loading}
          className="flex items-center justify-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-500 px-6 py-3.5 text-xs font-bold text-white shadow-lg shadow-blue-600/25 transition-all active:scale-[0.98] cursor-pointer"
        >
          <Save className="h-4 w-4" />
          <span>{saving ? "正在保存中..." : "保存系统配置"}</span>
        </button>
      </form>

      {/* Voice Upload Modal */}
      {isVoiceModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4 animate-in fade-in duration-150">
          <div className="relative w-full max-w-md rounded-2xl border border-white/[0.12] bg-[#10121a] p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-3.5">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/15 text-blue-400 border border-blue-500/25">
                  <Mic className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-zinc-100">
                    录制 / 上传克隆声音
                  </h3>
                  <p className="text-[11px] text-zinc-400">
                    上传 5~15 秒干净清晰口播原声，即可克隆属于你的专属音色
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsVoiceModalOpen(false)}
                className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/[0.08] hover:text-white transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateVoice} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-300">
                  音色名称 (自定义标识) <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  value={voiceName}
                  onChange={(e) => setVoiceName(e.target.value)}
                  placeholder="例如: 我的原声音色 / 科技解说男声 / 清晰女播音"
                  className="w-full rounded-xl border border-white/[0.08] bg-black/40 p-3 text-xs text-zinc-100 placeholder-zinc-500 focus:border-blue-500 focus:outline-none"
                  required
                />
              </div>

              <div className="flex items-center gap-2 border-b border-white/[0.06] pb-2">
                <button
                  type="button"
                  onClick={() => setInputMode("file")}
                  className={cn(
                    "text-xs font-semibold pb-1 border-b-2 transition-colors",
                    inputMode === "file"
                      ? "border-blue-500 text-blue-300"
                      : "border-transparent text-zinc-500 hover:text-zinc-300"
                  )}
                >
                  本地音频上传 (MP3/WAV/M4A)
                </button>
                <button
                  type="button"
                  onClick={() => setInputMode("url")}
                  className={cn(
                    "text-xs font-semibold pb-1 border-b-2 transition-colors",
                    inputMode === "url"
                      ? "border-blue-500 text-blue-300"
                      : "border-transparent text-zinc-500 hover:text-zinc-300"
                  )}
                >
                  远程音频 URL 直链
                </button>
              </div>

              {inputMode === "file" ? (
                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="audio/*,video/*,.mp4,.mov,.m4a,.mp3,.wav,.webm,.mkv"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        handleSelectFile(e.target.files[0]);
                      }
                    }}
                  />
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragOver(true);
                    }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragOver(false);
                      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                        handleSelectFile(e.dataTransfer.files[0]);
                      }
                    }}
                    onClick={() => fileInputRef.current?.click()}
                    className={cn(
                      "flex flex-col items-center justify-center p-5 rounded-xl border border-dashed transition-all cursor-pointer",
                      dragOver
                        ? "border-blue-500 bg-blue-500/15 ring-1 ring-blue-500/30"
                        : audioFile
                        ? "border-emerald-500/50 bg-emerald-500/[0.06] text-emerald-300"
                        : "border-white/[0.12] bg-black/30 hover:border-blue-500/50 text-zinc-400"
                    )}
                  >
                    <UploadCloud className="h-7 w-7 text-blue-400 mb-2" />
                    {audioFile ? (
                      <div className="text-center">
                        <span className="text-xs font-semibold text-emerald-300 block truncate max-w-[240px]">
                          已选: {audioFile.name}
                        </span>
                        <span className="text-[10px] text-zinc-400">
                          {audioFile.type.startsWith("video/") || audioFile.name.match(/\.(mp4|mov|mkv)$/i)
                            ? "✨ 检测到视频文件，将自动提取音频"
                            : "点击或拖拽可更换其他文件"}
                        </span>
                      </div>
                    ) : (
                      <div className="text-center">
                        <span className="text-xs font-semibold text-zinc-200 block">
                          {dragOver ? "释放文件即可上传" : "点击或拖拽录音/视频文件至此处"}
                        </span>
                        <span className="text-[10px] text-zinc-400 block mt-0.5">
                          支持 MP3/WAV 录音，或直接拖入 MP4/MOV 视频（自动提取人声）
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-zinc-300">
                    音频公网 URL (HTTP/HTTPS)
                  </label>
                  <input
                    type="text"
                    value={customAudioUrl}
                    onChange={(e) => setCustomAudioUrl(e.target.value)}
                    placeholder="https://your-domain.com/speaker.wav"
                    className="w-full rounded-xl border border-white/[0.08] bg-black/40 p-3 text-xs font-mono text-zinc-200 placeholder-zinc-600 focus:border-blue-500 focus:outline-none"
                  />
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-300">
                  音色风格说明 (可选)
                </label>
                <input
                  type="text"
                  value={voiceDesc}
                  onChange={(e) => setVoiceDesc(e.target.value)}
                  placeholder="例如: 沉稳专业男声"
                  className="w-full rounded-xl border border-white/[0.08] bg-black/40 p-3 text-xs text-zinc-100 placeholder-zinc-500 focus:border-blue-500 focus:outline-none"
                />
              </div>

              {voiceModalError && (
                <div className="flex items-center gap-2 rounded-xl bg-rose-500/10 border border-rose-500/20 p-3 text-xs text-rose-300">
                  <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
                  <span>{voiceModalError}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setIsVoiceModalOpen(false)}
                  className="rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-2.5 text-xs font-semibold text-zinc-400 hover:text-white"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={uploadingVoice}
                  className="flex items-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 px-5 py-2.5 text-xs font-bold text-white shadow-md transition-all active:scale-[0.98] cursor-pointer"
                >
                  {uploadingVoice ? (
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Check className="h-3.5 w-3.5" />
                  )}
                  <span>{uploadingVoice ? "正在保存音色..." : "确认添加至声音库"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
