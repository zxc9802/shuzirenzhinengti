"use client";

import React, { useState, useRef } from "react";
import { UploadCloud, Film, CheckCircle2, AlertCircle, RefreshCw, Layers, Clock, Activity } from "lucide-react";
import { formatBytes, formatDuration } from "@/lib/utils";

interface VideoUploaderProps {
  onVideoUploaded: (videoData: {
    name: string;
    path: string;
    url: string;
    probe: any;
  }) => void;
  disabled?: boolean;
}

export default function VideoUploader({
  onVideoUploaded,
  disabled = false,
}: VideoUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [uploadedInfo, setUploadedInfo] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (file: File) => {
    if (!file) return;
    if (!file.type.startsWith("video/")) {
      setError("请上传 MP4 或 MOV 格式的单人口播视频文件");
      return;
    }

    setError(null);
    setUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const resp = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!resp.ok) {
        throw new Error("上传失败，请检查文件后重试");
      }

      const data = await resp.json();
      if (!data.success) {
        throw new Error(data.error || "处理失败");
      }

      setUploadedInfo(data);
      onVideoUploaded({
        name: data.fileName,
        path: data.filePath,
        url: data.fileUrl,
        probe: data.probe,
      });
    } catch (err: any) {
      setError(err.message || "上传异常");
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (disabled || uploading) return;
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleUpload(e.dataTransfer.files[0]);
    }
  };

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => !disabled && !uploading && fileInputRef.current?.click()}
        className={`group relative flex flex-col items-center justify-center rounded-2xl border transition-all duration-200 cursor-pointer overflow-hidden ${
          dragOver
            ? "border-indigo-500 bg-indigo-500/[0.08] shadow-lg shadow-indigo-500/10"
            : uploadedInfo
            ? "border-white/[0.1] bg-[#12141f]/70 hover:border-indigo-500/40"
            : "border-white/[0.08] bg-[#0f111a]/60 hover:border-white/[0.16] hover:bg-[#131622]/80"
        } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="video/mp4,video/quicktime,video/*"
          className="hidden"
          onChange={(e) => {
            if (e.target.files && e.target.files[0]) {
              handleUpload(e.target.files[0]);
            }
          }}
          disabled={disabled || uploading}
        />

        {uploading ? (
          <div className="flex flex-col items-center py-8 text-center px-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 mb-3">
              <RefreshCw className="h-6 w-6 animate-spin" />
            </div>
            <p className="text-sm font-semibold text-zinc-100">
              正在上传并分析音视频轨道...
            </p>
            <p className="text-xs text-zinc-400 mt-1">
              执行 FFprobe 探测分辨率、帧率与旋转方向
            </p>
          </div>
        ) : uploadedInfo ? (
          <div className="w-full flex flex-col sm:flex-row items-center gap-4 p-4">
            <div className="relative h-28 w-44 shrink-0 overflow-hidden rounded-xl bg-black border border-white/[0.1] shadow-md group/video">
              <video
                src={uploadedInfo.fileUrl}
                className="h-full w-full object-cover"
                muted
                playsInline
                onMouseOver={(e) => (e.currentTarget as HTMLVideoElement).play()}
                onMouseOut={(e) => (e.currentTarget as HTMLVideoElement).pause()}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover/video:opacity-100 transition-opacity flex items-end p-2">
                <span className="text-[10px] text-zinc-300 font-medium">悬停预览画面</span>
              </div>
            </div>

            <div className="flex-1 space-y-2 text-left w-full">
              <div className="flex items-center gap-2 flex-wrap">
                <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                <span className="font-semibold text-sm text-zinc-100 truncate max-w-[240px]">
                  {uploadedInfo.fileName}
                </span>
                <span className="rounded-md bg-white/[0.06] border border-white/[0.08] px-2 py-0.5 text-[11px] font-mono text-zinc-400">
                  {formatBytes(uploadedInfo.size)}
                </span>
              </div>

              {uploadedInfo.probe && (
                <div className="grid grid-cols-2 gap-2 text-xs bg-black/40 p-2.5 rounded-xl border border-white/[0.06]">
                  <div className="flex items-center gap-1.5 text-zinc-400">
                    <Layers className="h-3.5 w-3.5 text-indigo-400" />
                    <span>分辨率:</span>
                    <span className="text-zinc-200 font-mono font-medium">
                      {uploadedInfo.probe.width}×{uploadedInfo.probe.height}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-zinc-400">
                    <Clock className="h-3.5 w-3.5 text-purple-400" />
                    <span>时长:</span>
                    <span className="text-zinc-200 font-mono font-medium">
                      {formatDuration(uploadedInfo.probe.durationSeconds)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-zinc-400">
                    <Activity className="h-3.5 w-3.5 text-blue-400" />
                    <span>帧率:</span>
                    <span className="text-zinc-200 font-mono font-medium">
                      {uploadedInfo.probe.fps} FPS
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-zinc-400">
                    <span>音轨:</span>
                    <span
                      className={`font-medium ${
                        uploadedInfo.probe.hasAudio
                          ? "text-emerald-400 font-medium"
                          : "text-amber-400"
                      }`}
                    >
                      {uploadedInfo.probe.hasAudio ? "已包含有效音轨" : "无音轨(将自适应补全)"}
                    </span>
                  </div>
                </div>
              )}
              <p className="text-[11px] font-medium text-indigo-400 hover:text-indigo-300 transition-colors">
                点击更换其他视频素材 →
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center py-8 text-center px-4">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 group-hover:scale-105 group-hover:bg-indigo-500/15 transition-all shadow-sm">
              <UploadCloud className="h-6 w-6" />
            </div>
            <p className="text-sm font-semibold text-zinc-100">
              点击或拖拽上传口播视频
            </p>
            <p className="mt-1 text-xs text-zinc-400 max-w-sm">
              支持 MP4 / MOV 格式，建议单人正面、嘴部轮廓清晰（最大边建议 ≤ 1920）
            </p>
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl bg-rose-500/10 border border-rose-500/20 p-3 text-xs text-rose-300">
          <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
