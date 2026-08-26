"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Video, Cpu, History, Settings, Play, Radio, Activity } from "lucide-react";
import { cn } from "@/lib/utils";

export default function Navbar() {
  const pathname = usePathname();

  const navItems = [
    { name: "制作台", href: "/", icon: Video },
    { name: "MCP 控制台", href: "/mcp", icon: Cpu },
    { name: "任务历史", href: "/history", icon: History },
    { name: "系统配置", href: "/settings", icon: Settings },
  ];

  return (
    <header className="sticky top-0 z-50 w-full border-b border-white/[0.08] bg-[#0a0b0e]/85 backdrop-blur-xl transition-all">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-3 group">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-900 border border-white/[0.15] text-zinc-100 shadow-md group-hover:border-blue-500/50 group-hover:bg-zinc-800 transition-all">
            <Video className="h-5 w-5 text-blue-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-base font-bold tracking-tight text-zinc-100 group-hover:text-white transition-colors">
                数字人对口型 Studio
              </span>
              <span className="inline-flex items-center gap-1 rounded-md bg-zinc-800/80 px-2 py-0.5 text-[11px] font-semibold text-zinc-300 border border-white/[0.08]">
                <Radio className="h-2.5 w-2.5 text-blue-400" />
                MCP 协议架构
              </span>
            </div>
            <p className="text-[11px] text-zinc-400 font-normal hidden sm:block">
              IndexTTS-2 原声克隆 · HeyGen Precision
            </p>
          </div>
        </Link>

        <nav className="flex items-center gap-1 sm:gap-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "relative flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition-all",
                  active
                    ? "bg-zinc-800 text-white shadow-sm border border-white/[0.14]"
                    : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
                )}
              >
                <Icon className={cn("h-4 w-4", active ? "text-blue-400" : "text-zinc-500")} />
                <span>{item.name}</span>
                {active && (
                  <span className="absolute -bottom-[17px] left-1/2 -translate-x-1/2 w-7 h-[2px] bg-blue-500" />
                )}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
