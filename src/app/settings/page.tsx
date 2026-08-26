"use client";

import React, { useState, useEffect } from "react";
import { Settings, Save, CheckCircle2, AlertCircle, Mic, Cpu, Server, Terminal, Sparkles } from "lucide-react";

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
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings")
      .then((res) => res.json())
      .then((data) => {
        if (data.config) setConfig(data.config);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

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
          <Settings className="h-8 w-8 text-indigo-400" />
          <span>系统参数与 MCP 配置</span>
        </h1>
        <p className="mt-1.5 text-xs sm:text-sm text-zinc-400">
          HeyGen 对口型完全通过 **MCP (Model Context Protocol)** 客户端调用；配置 302.AI IndexTTS-2 凭据用于声音克隆。
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-7">
        {/* Section 1: HeyGen MCP Client Configuration */}
        <div className="rounded-2xl border border-white/[0.08] bg-[#0f111a]/80 p-6 backdrop-blur-xl shadow-xl space-y-5">
          <div className="flex items-center justify-between border-b border-white/[0.08] pb-3.5">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
                <Cpu className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-zinc-100 uppercase tracking-wider">
                  HeyGen MCP 客户端通信配置
                </h2>
                <p className="text-[11px] text-zinc-400 mt-0.5">
                  通过 Model Context Protocol 管道调度对口型工具，无需填写 HeyGen API Key
                </p>
              </div>
            </div>
            <span className="flex items-center gap-1 text-[11px] text-emerald-300 bg-emerald-500/10 border border-emerald-500/25 px-2.5 py-0.5 rounded-lg font-semibold">
              <Sparkles className="h-3 w-3 text-emerald-400" />
              标准 MCP 管道就绪
            </span>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-zinc-300 mb-2 block">
                MCP 传输模式 (Transport)
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setConfig({ ...config, heygenMcpTransport: "stdio" })}
                  className={`rounded-xl border p-3.5 text-xs font-semibold transition-all text-left flex items-start gap-3 ${
                    config.heygenMcpTransport === "stdio"
                      ? "border-indigo-500/80 bg-indigo-500/20 text-indigo-200 shadow-sm shadow-indigo-500/10 ring-1 ring-indigo-500/30"
                      : "border-white/[0.06] bg-black/30 text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
                  }`}
                >
                  <Terminal className="h-4 w-4 mt-0.5 shrink-0 text-indigo-400" />
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
                      ? "border-indigo-500/80 bg-indigo-500/20 text-indigo-200 shadow-sm shadow-indigo-500/10 ring-1 ring-indigo-500/30"
                      : "border-white/[0.06] bg-black/30 text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
                  }`}
                >
                  <Server className="h-4 w-4 mt-0.5 shrink-0 text-purple-400" />
                  <div>
                    <div className="font-bold text-zinc-100">SSE / HTTP (远程模式)</div>
                    <div className="text-[11px] text-zinc-400 font-normal mt-0.5">
                      连接外部运行的 HeyGen MCP SSE 服务端
                    </div>
                  </div>
                </button>
              </div>
            </div>

            {config.heygenMcpTransport === "stdio" ? (
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
                    className="w-full rounded-xl border border-white/[0.08] bg-black/40 p-3 text-xs font-mono text-zinc-200 focus:border-indigo-500 focus:outline-none"
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
                    className="w-full rounded-xl border border-white/[0.08] bg-black/40 p-3 text-xs font-mono text-zinc-200 focus:border-indigo-500 focus:outline-none"
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
                  className="w-full rounded-xl border border-white/[0.08] bg-black/40 p-3 text-xs font-mono text-zinc-200 focus:border-indigo-500 focus:outline-none"
                />
              </div>
            )}
          </div>
        </div>

        {/* Section 2: IndexTTS 302.AI Configuration */}
        <div className="rounded-2xl border border-white/[0.08] bg-[#0f111a]/80 p-6 backdrop-blur-xl shadow-xl space-y-5">
          <div className="flex items-center gap-2.5 border-b border-white/[0.08] pb-3.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-400">
              <Mic className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-zinc-100 uppercase tracking-wider">
                302.AI IndexTTS-2 语音克隆与音色配置
              </h2>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                已自动读取 Skill 中的音色参考与凭据默认项
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
                className="w-full rounded-xl border border-white/[0.08] bg-black/40 p-3 text-xs font-mono text-zinc-200 focus:border-indigo-500 focus:outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-300">
                说话人音色克隆参考音频 URL (INDEXTTS_SPEAKER_AUDIO_URL)
              </label>
              <input
                type="text"
                value={config.indexttsSpeakerAudioUrl || ""}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    indexttsSpeakerAudioUrl: e.target.value,
                  })
                }
                placeholder="https://.../speaker_reference.wav"
                className="w-full rounded-xl border border-white/[0.08] bg-black/40 p-3 text-xs font-mono text-zinc-200 focus:border-indigo-500 focus:outline-none"
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
                className="w-full rounded-xl border border-white/[0.08] bg-black/40 p-3 text-xs font-mono text-zinc-200 focus:border-indigo-500 focus:outline-none"
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
          className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 px-6 py-3.5 text-xs font-bold text-white shadow-lg shadow-indigo-600/30 transition-all active:scale-[0.98] cursor-pointer"
        >
          <Save className="h-4 w-4" />
          <span>{saving ? "正在保存中..." : "保存配置"}</span>
        </button>
      </form>
    </div>
  );
}
