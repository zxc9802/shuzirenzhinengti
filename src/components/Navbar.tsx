"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Video, Cpu, History, Settings, Users, Mic, User, LogOut, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

export default function Navbar() {
  const pathname = usePathname();
  const [user, setUser] = useState<{ nickname?: string; account?: string; role?: string } | null>(null);

  useEffect(() => {
    fetch("/api/sso/session")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.data?.user) {
          setUser(data.data.user);
        }
      })
      .catch(() => {});
  }, []);

  const navItems = [
    { name: "制作台", href: "/", icon: Video },
    { name: "形象库", href: "/avatars", icon: Users },
    { name: "声音库", href: "/voices", icon: Mic },
    { name: "任务历史", href: "/history", icon: History },
    { name: "MCP 控制台", href: "/mcp", icon: Cpu },
    { name: "系统配置", href: "/settings", icon: Settings },
  ];

  return (
    <header className="sticky top-0 z-50 w-full border-b border-white/[0.08] bg-[#0a0b0e]/85 backdrop-blur-xl transition-all">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-3 group shrink-0">
          <div className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-xl bg-zinc-900 border border-white/[0.15] text-zinc-100 shadow-md group-hover:border-blue-500/50 group-hover:bg-zinc-800 transition-all">
            <Video className="h-4 w-4 sm:h-5 sm:w-5 text-blue-400" />
          </div>
          <div>
            <span className="text-sm sm:text-base font-bold tracking-tight text-zinc-100 group-hover:text-white transition-colors">
              数字人制作
            </span>
            <p className="text-[11px] text-zinc-400 font-normal hidden sm:block">
              AI 智能原声克隆 · 高精唇形驱动
            </p>
          </div>
        </Link>

        {/* Navigation Items */}
        <div className="flex items-center gap-2 sm:gap-4">
          <nav className="flex items-center gap-1 sm:gap-1.5 shrink-0 overflow-hidden">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "relative flex items-center gap-1.5 rounded-xl px-2.5 sm:px-3 py-1.5 sm:py-2 text-xs font-semibold transition-all whitespace-nowrap",
                    active
                      ? "bg-zinc-800 text-white shadow-sm border border-white/[0.14]"
                      : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
                  )}
                >
                  <Icon className={cn("h-3.5 w-3.5 sm:h-4 sm:w-4", active ? "text-blue-400" : "text-zinc-500")} />
                  <span>{item.name}</span>
                  {active && (
                    <span className="absolute -bottom-[17px] left-1/2 -translate-x-1/2 w-6 h-[2px] bg-blue-500" />
                  )}
                </Link>
              );
            })}
          </nav>

          {/* SSO User Badge & Main App Link */}
          {user && (
            <div className="flex items-center gap-2 border-l border-white/[0.1] pl-3">
              <a
                href="https://www.qycm.top/home2"
                title="返回起芽电商主站"
                className="hidden lg:flex items-center gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06] transition-colors"
              >
                <span>起芽主站</span>
                <ArrowUpRight className="h-3 w-3 text-zinc-500" />
              </a>

              <div className="flex items-center gap-2 bg-zinc-900/80 border border-white/[0.08] rounded-xl px-2.5 py-1 text-xs">
                <div className="h-5 w-5 rounded-full bg-blue-600/30 border border-blue-500/40 flex items-center justify-center text-[10px] font-bold text-blue-300">
                  {user.nickname ? user.nickname.charAt(0) : "U"}
                </div>
                <span className="text-zinc-300 font-medium max-w-[90px] truncate hidden md:inline">
                  {user.nickname || user.account}
                </span>
                <a
                  href="/api/sso/logout"
                  title="退出登录"
                  className="text-zinc-500 hover:text-rose-400 p-0.5 transition-colors"
                >
                  <LogOut className="h-3.5 w-3.5" />
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
