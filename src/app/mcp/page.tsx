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
  Layers,
  ArrowRight,
  Sparkles,
  Zap,
} from "lucide-react";
import { McpConnectionStatus, McpToolInfo } from "@/lib/mcp/client";

export default function McpPage() {
  const [status, setStatus] = useState<McpConnectionStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedTool, setSelectedTool] = useState<string>("list_lipsyncs");
  const [toolArgs, setToolArgs] = useState<string>("{\n  \"limit\": 10\n}");
  const [executing, setExecuting] = useState(false);
  const [execResult, setExecResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  // Transport settings
  const [transport, setTransport] = useState<"direct" | "sse" | "stdio">("stdio");
  const [serverUrl, setServerUrl] = useState("http://localhost:8000/sse");
  const [command, setCommand] = useState("node");
  const [commandArgs, setCommandArgs] = useState("scripts/heygen_mcp_server.mjs");

  const fetchStatus = async () => {
    setLoading(true);
    try {
      const resp = await fetch("/api/mcp/tools");
      const data = await resp.json();
      setStatus(data.status);
      if (data.status?.tools?.length > 0 && !selectedTool) {
        setSelectedTool(data.status.tools[0].name);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

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
            video_url: "https://your-domain.com/video.mp4",
            audio_url: "https://your-domain.com/audio.wav",
            title: "lipsync_sample_task",
            mode: "precision",
          },
          null,
          2
        )
      );
    } else if (tool.name.includes("get")) {
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
            <Cpu className="h-8 w-8 text-indigo-400" />
            <span>MCP (Model Context Protocol) 客户端控制台</span>
          </h1>
          <p className="mt-1 text-sm text-zinc-400">
            通过标准 MCP 协议管道直接与 HeyGen 对口型服务端通信，无需配置云端 API Key。
          </p>
        </div>

        <button
          onClick={fetchStatus}
          disabled={loading}
          className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-2 text-xs font-semibold text-zinc-300 hover:bg-white/[0.08] hover:text-white transition-all shadow-sm active:scale-[0.98]"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin text-indigo-400" : ""}`} />
          刷新连接状态
        </button>
      </div>

      {/* Connection Config & Status */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-7">
        {/* Left: Connection Config & Transport Switcher */}
        <div className="lg:col-span-5 space-y-6">
          <div className="rounded-2xl border border-white/[0.08] bg-[#0f111a]/80 p-6 backdrop-blur-xl shadow-xl space-y-5">
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-4">
              <span className="text-xs font-bold text-zinc-100 uppercase tracking-wider flex items-center gap-2">
                <Server className="h-4 w-4 text-indigo-400" />
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
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setTransport("stdio");
                    setCommand("node");
                    setCommandArgs("scripts/heygen_mcp_server.mjs");
                  }}
                  className={`rounded-xl border p-3 text-xs font-semibold transition-all ${
                    transport === "stdio"
                      ? "border-indigo-500/80 bg-indigo-500/20 text-indigo-200 shadow-sm shadow-indigo-500/10 ring-1 ring-indigo-500/30"
                      : "border-white/[0.06] bg-black/30 text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
                  }`}
                >
                  Stdio (本地自包含)
                </button>
                <button
                  type="button"
                  onClick={() => setTransport("sse")}
                  className={`rounded-xl border p-3 text-xs font-semibold transition-all ${
                    transport === "sse"
                      ? "border-indigo-500/80 bg-indigo-500/20 text-indigo-200 shadow-sm shadow-indigo-500/10 ring-1 ring-indigo-500/30"
                      : "border-white/[0.06] bg-black/30 text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
                  }`}
                >
                  SSE / HTTP (远程服务)
                </button>
              </div>
            </div>

            {/* Conditional input fields */}
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
                  className="w-full rounded-xl border border-white/[0.08] bg-black/40 p-3 text-xs font-mono text-zinc-200 focus:border-indigo-500 focus:outline-none"
                />
              </div>
            )}

            {transport === "stdio" && (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-zinc-300">
                    Stdio 启动程序 (Command)
                  </label>
                  <input
                    type="text"
                    value={command}
                    onChange={(e) => setCommand(e.target.value)}
                    placeholder="node"
                    className="w-full rounded-xl border border-white/[0.08] bg-black/40 p-3 text-xs font-mono text-zinc-200 focus:border-indigo-500 focus:outline-none"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-zinc-300">
                    执行参数 (Arguments)
                  </label>
                  <input
                    type="text"
                    value={commandArgs}
                    onChange={(e) => setCommandArgs(e.target.value)}
                    placeholder="scripts/heygen_mcp_server.mjs"
                    className="w-full rounded-xl border border-white/[0.08] bg-black/40 p-3 text-xs font-mono text-zinc-200 focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              </div>
            )}

            <button
              onClick={handleConnect}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 p-3 text-xs font-bold text-white transition-all shadow-md shadow-indigo-600/25 active:scale-[0.98]"
            >
              {loading ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              <span>重新连接并发现工具</span>
            </button>
          </div>

          {/* Tools Explorer */}
          <div className="rounded-2xl border border-white/[0.08] bg-[#0f111a]/80 p-6 backdrop-blur-xl shadow-xl space-y-4">
            <span className="text-xs font-bold text-zinc-100 uppercase tracking-wider flex items-center gap-2">
              <Layers className="h-4 w-4 text-purple-400" />
              已发现 MCP 工具 ({status?.tools.length || 0})
            </span>

            <div className="space-y-2.5">
              {status?.tools.map((tool) => (
                <div
                  key={tool.name}
                  onClick={() => handleToolSelect(tool)}
                  className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                    selectedTool === tool.name
                      ? "border-indigo-500/80 bg-indigo-500/15 text-white ring-1 ring-indigo-500/30"
                      : "border-white/[0.06] bg-black/30 text-zinc-400 hover:border-white/[0.12] hover:text-zinc-200"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono font-bold text-indigo-300">
                      {tool.name}
                    </span>
                    <ArrowRight className="h-3.5 w-3.5 opacity-60 text-indigo-400" />
                  </div>
                  {tool.description && (
                    <p className="mt-1 text-xs text-zinc-400 leading-snug">
                      {tool.description}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Interactive MCP Tool Runner & Inspector */}
        <div className="lg:col-span-7 space-y-6">
          <div className="rounded-2xl border border-white/[0.08] bg-[#0f111a]/80 p-6 backdrop-blur-xl shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-4">
              <div className="flex items-center gap-2">
                <Code2 className="h-4 w-4 text-indigo-400" />
                <span className="text-xs font-bold text-zinc-100 uppercase tracking-wider">
                  MCP Tool 执行器:{" "}
                  <span className="font-mono text-indigo-300 normal-case">{selectedTool}</span>
                </span>
              </div>
              <button
                onClick={handleExecuteTool}
                disabled={executing}
                className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 px-4 py-2 text-xs font-bold text-white shadow-lg shadow-indigo-600/30 transition-all active:scale-[0.98] cursor-pointer"
              >
                {executing ? (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Play className="h-3.5 w-3.5 fill-white" />
                )}
                <span>执行 MCP 调用</span>
              </button>
            </div>

            {/* Tool Schema & Arguments Editor */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-300">
                JSON 调用入参 (Arguments)
              </label>
              <textarea
                rows={7}
                value={toolArgs}
                onChange={(e) => setToolArgs(e.target.value)}
                className="w-full rounded-xl border border-white/[0.08] bg-black/40 p-3.5 font-mono text-xs text-indigo-200 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            {/* Error Message */}
            {error && (
              <div className="flex items-center gap-2 rounded-xl bg-rose-500/10 border border-rose-500/20 p-3 text-xs text-rose-300">
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
                <span>{error}</span>
              </div>
            )}

            {/* Execution Result */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-zinc-300 flex items-center gap-1.5">
                <Terminal className="h-3.5 w-3.5 text-indigo-400" />
                MCP 响应输出 (JSON-RPC Output)
              </label>
              <div className="rounded-xl border border-white/[0.08] bg-[#0c0e14] p-4 font-mono text-xs max-h-72 overflow-y-auto">
                {execResult ? (
                  <pre className="text-emerald-400 whitespace-pre-wrap leading-relaxed">
                    {JSON.stringify(execResult, null, 2)}
                  </pre>
                ) : (
                  <div className="text-zinc-600 italic">
                    点击右上角“执行 MCP 调用”按钮发起调试...
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
