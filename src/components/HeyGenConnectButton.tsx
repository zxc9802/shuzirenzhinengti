"use client";

import React, { useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Link2,
  LogOut,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface HeyGenOAuthStatus {
  connected: boolean;
  needsAuth: boolean;
  user?: {
    email?: string;
    username?: string;
    firstName?: string;
    planName?: string;
    remainingCredits?: number;
    quota?: number;
  };
  error?: string;
}

interface HeyGenConnectButtonProps {
  variant?: "card" | "compact";
  className?: string;
  onStatusChange?: (status: HeyGenOAuthStatus) => void;
}

export default function HeyGenConnectButton({
  variant = "card",
  className,
  onStatusChange,
}: HeyGenConnectButtonProps) {
  const [status, setStatus] = useState<HeyGenOAuthStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<"success" | "error">("success");

  const applyStatus = (next: HeyGenOAuthStatus) => {
    setStatus(next);
    onStatusChange?.(next);
  };

  const fetchStatus = async () => {
    try {
      const resp = await fetch("/api/mcp/heygen/oauth/status");
      const data = await resp.json();
      applyStatus(data);
    } catch (err: any) {
      applyStatus({
        connected: false,
        needsAuth: true,
        error: err?.message || "无法读取 HeyGen 授权状态",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauth = params.get("heygen_oauth");
    const oauthMessage = params.get("message");

    if (oauth === "success") {
      setMessage("HeyGen 官方 MCP 已授权连接");
      setMessageTone("success");
    } else if (oauth === "already") {
      setMessage("HeyGen MCP 已处于授权状态");
      setMessageTone("success");
    } else if (oauth === "error") {
      setMessage(oauthMessage || "HeyGen 授权未完成");
      setMessageTone("error");
    }

    fetchStatus();
  }, []);

  const handleConnect = () => {
    window.location.href = "/api/mcp/heygen/oauth/start";
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      const resp = await fetch("/api/mcp/heygen/oauth/disconnect", { method: "POST" });
      const data = await resp.json();
      if (!resp.ok || data.success === false) {
        throw new Error(data.error || "断开失败");
      }
      applyStatus({ connected: false, needsAuth: true });
      setMessage("已断开 HeyGen MCP 授权");
      setMessageTone("success");
    } catch (err: any) {
      setMessage(err?.message || "断开 HeyGen MCP 失败");
      setMessageTone("error");
    } finally {
      setDisconnecting(false);
    }
  };

  const connected = Boolean(status?.connected);
  const displayName =
    status?.user?.firstName ||
    status?.user?.username ||
    status?.user?.email ||
    "HeyGen 账户";

  if (variant === "compact") {
    return (
      <a
        href={connected ? "/mcp" : "/api/mcp/heygen/oauth/start"}
        className={cn(
          "hidden lg:flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-[11px] font-semibold transition-colors",
          connected
            ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/15"
            : "border-blue-500/25 bg-blue-500/10 text-blue-300 hover:bg-blue-500/15",
          className
        )}
      >
        {connected ? (
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
        ) : (
          <Link2 className="h-3.5 w-3.5 text-blue-400" />
        )}
        <span>{connected ? "HeyGen 已连接" : "连接 HeyGen"}</span>
      </a>
    );
  }

  return (
    <div
      className={cn(
        "rounded-2xl border border-blue-500/30 bg-gradient-to-r from-blue-900/20 via-[#10121a] to-blue-950/30 p-6 backdrop-blur-xl shadow-xl space-y-4",
        className
      )}
    >
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
        <div className="space-y-2 min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-500/20 border border-blue-500/30 text-blue-400">
              <ShieldCheck className="h-4 w-4" />
            </span>
            <h2 className="text-base font-bold text-white">HeyGen 官方 MCP 授权</h2>
            {loading ? (
              <span className="text-xs text-zinc-400">正在检查连接…</span>
            ) : connected ? (
              <span className="flex items-center gap-1 text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/25 px-2.5 py-0.5 rounded-lg font-semibold">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                已连接官方 MCP
              </span>
            ) : (
              <span className="flex items-center gap-1 text-xs text-amber-300 bg-amber-500/10 border border-amber-500/25 px-2.5 py-0.5 rounded-lg font-semibold">
                <AlertCircle className="h-3.5 w-3.5 text-amber-400" />
                尚未授权
              </span>
            )}
          </div>
          <p className="text-xs text-zinc-300 max-w-2xl">
            点击按钮跳转 HeyGen 登录并授权。完成后会自动连上官方 Remote MCP，无需再手动粘贴 API Key。
          </p>
          {connected && (
            <div className="flex items-center gap-4 pt-1 flex-wrap text-xs text-zinc-400">
              <span>
                账户: <strong className="text-white">{displayName}</strong>
              </span>
              {status?.user?.planName && (
                <span>
                  套餐: <strong className="text-white">{status.user.planName}</strong>
                </span>
              )}
              {typeof status?.user?.remainingCredits === "number" && (
                <span>
                  剩余额度:{" "}
                  <strong className="text-emerald-400 font-mono">
                    {status.user.remainingCredits} Credits
                  </strong>
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {connected ? (
            <button
              type="button"
              onClick={handleDisconnect}
              disabled={disconnecting}
              className="flex items-center justify-center gap-2 rounded-xl border border-white/[0.1] bg-white/[0.04] hover:bg-white/[0.08] px-4 py-2.5 text-xs font-bold text-zinc-200 transition-all cursor-pointer"
            >
              {disconnecting ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <LogOut className="h-3.5 w-3.5" />
              )}
              <span>{disconnecting ? "正在断开…" : "断开连接"}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleConnect}
              disabled={loading}
              className="flex items-center justify-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-500 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-blue-600/25 transition-all active:scale-[0.98] cursor-pointer disabled:opacity-50"
            >
              {loading ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Link2 className="h-4 w-4" />
              )}
              <span>授权连接 HeyGen MCP</span>
            </button>
          )}
        </div>
      </div>

      {message && (
        <div
          className={cn(
            "flex items-center gap-2 rounded-xl p-3 text-xs",
            messageTone === "success"
              ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-300"
              : "bg-rose-500/10 border border-rose-500/30 text-rose-300"
          )}
        >
          {messageTone === "success" ? (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
          )}
          <span>{message}</span>
        </div>
      )}
    </div>
  );
}
