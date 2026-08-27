"use client";

import React, { useState, useEffect } from "react";
import {
  Cpu,
  CheckCircle2,
  AlertCircle,
  Play,
  RefreshCw,
  Server,
  Code2,
  Terminal,
  Zap,
  ShieldCheck,
} from "lucide-react";
import { McpConnectionStatus, McpToolInfo } from "@/lib/mcp/client";
import HeyGenConnectButton from "@/components/HeyGenConnectButton";

export default function McpPage() {
  const [status, setStatus] = useState<McpConnectionStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedTool, setSelectedTool] = useState<string>("list_lipsyncs");
  const [toolArgs, setToolArgs] = useState<string>("{\n  \"limit\": 10\n}");
  const [executing, setExecuting] = useState(false);
  const [execResult, setExecResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  // HeyGen Subscription Auth State
  const [heygenToken, setHeygenToken] = useState("");
  const [verifyingAuth, setVerifyingAuth] = useState(false);
  const [quotaInfo, setQuotaInfo] = useState<{
    success: boolean;
    quota?: number;
    remainingQuota?: number;
    planName?: string;
    error?: string;
  } | null>(null);

  // Transport settings
  const [transport, setTransport] = useState<"direct" | "sse" | "stdio" | "remote">("remote");
  const [serverUrl, setServerUrl] = useState("http://localhost:8000/sse");
  const [command, setCommand] = useState("node");
  const [commandArgs, setCommandArgs] = useState("scripts/heygen_mcp_server.mjs");

  const fetchStatus = async () => {
    setLoading(true);
    try {
      const [mcpResp, authResp] = await Promise.all([
        fetch("/api/mcp/tools"),
        fetch("/api/mcp/heygen/auth"),
      ]);
      const data = await mcpResp.json();
      setStatus(data.status);
      if (data.status?.tools?.length > 0 && !selectedTool) {
        setSelectedTool(data.status.tools[0].name);
      }

      const authData = await authResp.json();
      setQuotaInfo(authData);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const handleVerifyAndSaveAuth = async () => {
    if (!heygenToken.trim()) {
      setError("请输入 HeyGen 账号套餐 Token / 凭证");
      return;
    }
    setVerifyingAuth(true);
    setError(null);

    try {
      const resp = await fetch("/api/mcp/heygen/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: heygenToken.trim() }),
      });
      const data = await resp.json();
      setQuotaInfo(data);
      if (data.success) {
        await fetchStatus();
      } else {
        setError(data.error || "HeyGen 授权校验未通过");
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setVerifyingAuth(false);
    }
  };

  const handleConnect = async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch("/api/mcp/tools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transport,
          serverUrl,
          command,
          args: commandArgs.split(" ").filter(Boolean),
        }),
      });
      const data = await resp.json();
      setStatus(data.status);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleToolSelect = (tool: McpToolInfo) => {
    setSelectedTool(tool.name);
    if (tool.name.includes("create")) {
      setToolArgs(
        JSON.stringify(
          {
            video_url: "https://shuziren-1410143389.cos.ap-singapore.myqcloud.com/uploads/videos/sample.mp4",
            audio_url: "https://shuziren-1410143389.cos.ap-singapore.myqcloud.com/jobs/sample.wav",
            title: "lipsync_sample_task",
            mode: "precision",
          },
          null,
          2
        )
      );
    } else if (tool.name.includes("get_lipsync")) {
      setToolArgs(
        JSON.stringify(
          {
            lipsync_id: "lipsync_xxxxxx",
          },
          null,
          2
        )
      );
    } else {
      setToolArgs(
        JSON.stringify(
          {
            limit: 10,
          },
          null,
          2
        )
      );
    }
  };

  const handleExecuteTool = async () => {
    setExecuting(true);
    setExecResult(null);
    setError(null);

    try {
      let parsed = {};
      try {
        parsed = JSON.parse(toolArgs);
      } catch {
        throw new Error("参数格式错误，请输入有效的 JSON");
      }

      const resp = await fetch("/api/mcp/call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toolName: selectedTool,
          args: parsed,
        }),
      });

      const data = await resp.json();
      if (!data.success) {
        throw new Error(data.error || "调用失败");
      }
      setExecResult(data.result);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setExecuting(false);
    }
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-white/[0.08] pb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white flex items-center gap-3">
            <Cpu className="h-8 w-8 text-blue-400" />
            <span>HeyGen MCP 套餐授权与控制台</span>
          </h1>
          <p className="mt-1 text-sm text-zinc-400">
            一键授权官方 HeyGen Remote MCP，用账号套餐额度直接调度高精度对口型。
          </p>
        </div>

        <button
          onClick={fetchStatus}
          disabled={loading}
          className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-2 text-xs font-semibold text-zinc-300 hover:bg-white/[0.08] hover:text-white transition-all shadow-sm active:scale-[0.98]"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin text-blue-400" : ""}`} />
          刷新 MCP 状态
        </button>
      </div>

      <HeyGenConnectButton onStatusChange={(s) => {
        if (s.connected && s.user) {
          setQuotaInfo({
            success: true,
            quota: s.user.quota,
            remainingQuota: s.user.remainingCredits,
            planName: s.user.planName,
          });
        }
      }} />

      <details className="rounded-2xl border border-white/[0.08] bg-[#10121a]/70 p-4">
        <summary className="cursor-pointer text-xs font-semibold text-zinc-300 hover:text-white">
          高级：仍可用 API Key / Token 作为备用鉴权
        </summary>
        <div className="mt-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <input
            type="password"
            value={heygenToken}
            onChange={(e) => setHeygenToken(e.target.value)}
            placeholder="输入 HeyGen API Token（可选备用）"
            className="flex-1 rounded-xl border border-white/[0.1] bg-black/60 px-3.5 py-2.5 text-xs font-mono text-zinc-200 placeholder-zinc-500 focus:border-blue-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={handleVerifyAndSaveAuth}
            disabled={verifyingAuth}
            className="flex items-center justify-center gap-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.1] px-4 py-2.5 text-xs font-bold text-zinc-200 transition-all cursor-pointer whitespace-nowrap"
          >
            {verifyingAuth ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <ShieldCheck className="h-3.5 w-3.5" />
            )}
            <span>验证 Token</span>
          </button>
        </div>
        {quotaInfo?.success && (
          <p className="mt-3 text-xs text-emerald-300">
            Token 套餐: {quotaInfo.planName || "标准套餐"} · 剩余 {quotaInfo.remainingQuota ?? 0} Credits
          </p>
        )}
      </details>

      {error && (
        <div className="flex items-center gap-2 rounded-xl bg-rose-500/10 border border-rose-500/30 p-3 text-xs text-rose-300">
          <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      {/* Connection Config & Status */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-7">
        {/* Left: Connection Config & Transport Switcher */}
        <div className="lg:col-span-5 space-y-6">
          <div className="rounded-2xl border border-white/[0.08] bg-[#0f111a]/80 p-6 backdrop-blur-xl shadow-xl space-y-5">
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-4">
              <span className="text-xs font-bold text-zinc-100 uppercase tracking-wider flex items-center gap-2">
                <Server className="h-4 w-4 text-blue-400" />
                MCP 通信传输配置
              </span>
              {status?.connected ? (
                <span className="flex items-center gap-1.5 text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/25 px-2.5 py-0.5 rounded-lg font-semibold">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                  已就绪 ({status.transportType.toUpperCase()})
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-xs text-rose-300 bg-rose-500/10 border border-rose-500/25 px-2.5 py-0.5 rounded-lg">
                  <AlertCircle className="h-3.5 w-3.5 text-rose-400" />
                  未连接
                </span>
              )}
            </div>

            {/* Transport type selector */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-zinc-300">
                协议通信模式
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setTransport("remote");
                    setServerUrl("https://mcp.heygen.com/mcp/v1");
                  }}
                  className={`rounded-xl border p-2.5 text-xs font-semibold transition-all ${
                    transport === "remote"
                      ? "border-blue-500/80 bg-blue-500/20 text-blue-200 shadow-sm ring-1 ring-blue-500/30"
                      : "border-white/[0.06] bg-black/30 text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
                  }`}
                >
                  官方 Remote
                </button>
                <button
                  type="button"
                  onClick={() => setTransport("direct")}
                  className={`rounded-xl border p-2.5 text-xs font-semibold transition-all ${
                    transport === "direct"
                      ? "border-blue-500/80 bg-blue-500/20 text-blue-200 shadow-sm ring-1 ring-blue-500/30"
                      : "border-white/[0.06] bg-black/30 text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
                  }`}
                >
                  原生内置 MCP
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTransport("stdio");
                    setCommand("node");
                    setCommandArgs("scripts/heygen_mcp_server.mjs");
                  }}
                  className={`rounded-xl border p-2.5 text-xs font-semibold transition-all ${
                    transport === "stdio"
                      ? "border-blue-500/80 bg-blue-500/20 text-blue-200 shadow-sm ring-1 ring-blue-500/30"
                      : "border-white/[0.06] bg-black/30 text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
                  }`}
                >
                  Stdio 子进程
                </button>
                <button
                  type="button"
                  onClick={() => setTransport("sse")}
                  className={`rounded-xl border p-2.5 text-xs font-semibold transition-all ${
                    transport === "sse"
                      ? "border-blue-500/80 bg-blue-500/20 text-blue-200 shadow-sm ring-1 ring-blue-500/30"
                      : "border-white/[0.06] bg-black/30 text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
                  }`}
                >
                  SSE 远程端点
                </button>
              </div>
            </div>

            {/* Conditional input fields */}
            {transport === "remote" && (
              <p className="text-[11px] text-zinc-400 leading-relaxed">
                官方端点 <span className="font-mono text-zinc-200">https://mcp.heygen.com/mcp/v1</span>。请先在上方完成 HeyGen 登录授权。
              </p>
            )}

            {transport === "sse" && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-300">
                  SSE 服务端端点 URL
                </label>
                <input
                  type="text"
                  value={serverUrl}
                  onChange={(e) => setServerUrl(e.target.value)}
                  placeholder="http://localhost:8000/sse"
                  className="w-full rounded-xl border border-white/[0.08] bg-black/40 p-3 text-xs font-mono text-zinc-200 focus:border-blue-500 focus:outline-none"
                />
              </div>
            )}

            {transport === "stdio" && (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-zinc-300">
                    启动命令 (Command)
                  </label>
                  <input
                    type="text"
                    value={command}
                    onChange={(e) => setCommand(e.target.value)}
                    className="w-full rounded-xl border border-white/[0.08] bg-black/40 p-3 text-xs font-mono text-zinc-200 focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-zinc-300">
                    命令参数 (Args)
                  </label>
                  <input
                    type="text"
                    value={commandArgs}
                    onChange={(e) => setCommandArgs(e.target.value)}
                    className="w-full rounded-xl border border-white/[0.08] bg-black/40 p-3 text-xs font-mono text-zinc-200 focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>
            )}

            <button
              onClick={handleConnect}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-500 p-3 text-xs font-bold text-white shadow-lg transition-all active:scale-[0.98] disabled:opacity-50 cursor-pointer"
            >
              {loading ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Zap className="h-4 w-4" />
              )}
              <span>重新初始化 MCP 连接</span>
            </button>
          </div>

          {/* Tools List */}
          <div className="rounded-2xl border border-white/[0.08] bg-[#0f111a]/80 p-6 backdrop-blur-xl shadow-xl space-y-4">
            <span className="text-xs font-bold text-zinc-100 uppercase tracking-wider flex items-center gap-2">
              <Code2 className="h-4 w-4 text-blue-400" />
              已发现的 MCP Tools ({status?.tools?.length || 0})
            </span>

            {status?.tools && status.tools.length > 0 ? (
              <div className="space-y-2">
                {status.tools.map((t) => {
                  const isSelected = selectedTool === t.name;
                  return (
                    <button
                      key={t.name}
                      onClick={() => handleToolSelect(t)}
                      className={`w-full text-left p-3.5 rounded-xl border transition-all flex flex-col gap-1 ${
                        isSelected
                          ? "border-blue-500 bg-blue-500/15 text-white ring-1 ring-blue-500/40"
                          : "border-white/[0.05] bg-black/30 text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs font-bold text-blue-300">
                          {t.name}
                        </span>
                        {isSelected && (
                          <span className="text-[10px] bg-blue-500/30 text-blue-200 px-2 py-0.5 rounded-md font-mono">
                            已选择
                          </span>
                        )}
                      </div>
                      {t.description && (
                        <p className="text-[11px] text-zinc-400 line-clamp-2 leading-relaxed">
                          {t.description}
                        </p>
                      )}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-6 text-xs text-zinc-500">
                暂未发现可用 Tools，请检查 MCP 连接。
              </div>
            )}
          </div>
        </div>

        {/* Right: Interactive MCP Tool Tester */}
        <div className="lg:col-span-7 space-y-6">
          <div className="rounded-2xl border border-white/[0.08] bg-[#0f111a]/80 p-6 backdrop-blur-xl shadow-xl space-y-5">
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-4">
              <span className="text-xs font-bold text-zinc-100 uppercase tracking-wider flex items-center gap-2">
                <Play className="h-4 w-4 text-emerald-400" />
                MCP 调试调用台: <span className="font-mono text-blue-400">{selectedTool}</span>
              </span>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-zinc-300">
                工具入参 JSON Payload
              </label>
              <textarea
                value={toolArgs}
                onChange={(e) => setToolArgs(e.target.value)}
                rows={7}
                className="w-full rounded-xl border border-white/[0.08] bg-black/50 p-4 font-mono text-xs text-zinc-200 focus:border-blue-500 focus:outline-none"
              />
            </div>

            <button
              onClick={handleExecuteTool}
              disabled={executing || !status?.connected}
              className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-2.5 text-xs font-bold text-white shadow-lg transition-all active:scale-[0.98] disabled:opacity-50 cursor-pointer"
            >
              {executing ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4 fill-white" />
              )}
              <span>执行 MCP Tool 调用</span>
            </button>

            {/* Execution Result Terminal */}
            {execResult && (
              <div className="space-y-2 mt-4">
                <label className="text-xs font-medium text-emerald-400 flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  调用返回结果 (JSON Response)
                </label>
                <div className="rounded-xl border border-white/[0.08] bg-black/80 p-4 font-mono text-xs text-zinc-300 overflow-x-auto max-h-96">
                  <pre>{JSON.stringify(execResult, null, 2)}</pre>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
