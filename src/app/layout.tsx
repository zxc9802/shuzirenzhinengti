import type { Metadata } from "next";
import "./globals.css";
import Navbar from "@/components/Navbar";

export const metadata: Metadata = {
  title: "数字人对口型智能工作台 | MCP Enabled",
  description: "基于 IndexTTS-2 定制配音与 HeyGen Precision MCP 驱动的数字人对口型智能系统",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="dark">
      <body className="bg-zinc-950 text-zinc-100 antialiased selection:bg-indigo-500 selection:text-white">
        <div className="flex min-h-screen flex-col">
          <Navbar />
          <main className="flex-1 px-4 py-8 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full">
            {children}
          </main>
          <footer className="border-t border-zinc-900 py-6 text-center text-xs text-zinc-600">
            数字人对口型智能工作台 · Next.js + MCP Client + IndexTTS-2 + HeyGen Precision
          </footer>
        </div>
      </body>
    </html>
  );
}
