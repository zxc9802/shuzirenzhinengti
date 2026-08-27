"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Users,
  Film,
  Plus,
  Play,
  Trash2,
  CheckCircle2,
  Cloud,
  HardDrive,
  RefreshCw,
  Search,
  Clock,
  Layers,
  ArrowRight,
  UploadCloud,
  X,
  AlertCircle,
  Video,
} from "lucide-react";
import { AvatarItem } from "@/lib/store/avatar-store";
import { formatBytes, formatDuration, cn } from "@/lib/utils";

export default function AvatarsPage() {
  const router = useRouter();
  const [avatars, setAvatars] = useState<AvatarItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // Upload modal states
  const [uploadName, setUploadName] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchAvatars = async () => {
    try {
      const resp = await fetch("/api/avatars");
      const data = await resp.json();
      if (data.avatars) {
        setAvatars(data.avatars);
      }
    } catch (err) {
      console.error("Failed to fetch avatars", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAvatars();
  }, []);

  const handleSelectFile = (file: File) => {
    if (!file) return;
    if (!file.type.startsWith("video/") && !file.name.match(/\.(mp4|mov|mkv|webm)$/i)) {
      setUploadError("请上传 MP4 或 MOV 格式口播视频");
      return;
    }
    setUploadFile(file);
    setUploadError(null);
    if (!uploadName) {
      setUploadName(file.name.replace(/\.[^/.]+$/, ""));
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) {
      setUploadError("请选择 MP4 或 MOV 格式口播视频");
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    setUploadError(null);

    try {
      const formData = new FormData();
      formData.append("file", uploadFile);
      if (uploadName.trim()) {
        formData.append("name", uploadName.trim());
      }

      const uploadPromise = new Promise<any>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", "/api/upload");

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            const percent = Math.round((e.loaded / e.total) * 100);
            setUploadProgress(percent);
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const res = JSON.parse(xhr.responseText);
              if (res.success) resolve(res);
              else reject(new Error(res.error || "上传失败"));
            } catch {
              reject(new Error("解析响应失败"));
            }
          } else {
            reject(new Error(`上传异常 (${xhr.status})`));
          }
        };

        xhr.onerror = () => reject(new Error("网络连接失败，请检查网络"));
        xhr.send(formData);
      });

      const res = await uploadPromise;
      if (res.avatar) {
        setAvatars((prev) => [res.avatar, ...prev]);
      } else {
        await fetchAvatars();
      }

      setIsUploadModalOpen(false);
      setUploadFile(null);
      setUploadName("");
    } catch (err: any) {
      setUploadError(err.message || "上传失败");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("确定要删除此形象素材吗？")) return;
    try {
      const resp = await fetch(`/api/avatars?id=${id}`, { method: "DELETE" });
      const data = await resp.json();
      if (data.success) {
        setAvatars((prev) => prev.filter((a) => a.id !== id));
      }
    } catch (err) {
      console.error("Delete avatar error", err);
    }
  };

  const handleUseAvatar = (avatar: AvatarItem) => {
    localStorage.setItem(
      "preselected_avatar",
      JSON.stringify({
        id: avatar.id,
        name: avatar.name,
        path: avatar.videoPath,
        url: avatar.videoUrl,
        size: avatar.fileSize,
        isCos: avatar.isCos,
        probe: {
          width: avatar.width,
          height: avatar.height,
          durationSeconds: avatar.durationSeconds,
          fps: avatar.fps || 30,
          hasAudio: true,
        },
      })
    );
    router.push("/");
  };

  const filteredAvatars = avatars.filter((a) =>
    a.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-white/[0.08] pb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white flex items-center gap-3">
            <Users className="h-7 w-7 text-blue-400" />
            <span>口播形象库 (Avatar Library)</span>
          </h1>
          <p className="mt-1.5 text-xs sm:text-sm text-zinc-400 max-w-2xl">
            支持拖拽上传或选择口播真人视频。制作数字人时，可一键选用此处的任意形象进行对口型渲染，自动存入腾讯云 COS 高速分发。
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsUploadModalOpen(true)}
          className="flex items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-500 px-4 py-2.5 text-xs font-bold text-white shadow-lg shadow-blue-600/20 transition-all active:scale-[0.98] cursor-pointer"
        >
          <Plus className="h-4 w-4" />
          <span>+ 拖拽/上传新口播形象</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索形象名称或文件名..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-white/[0.08] bg-[#10121a]/90 text-xs text-zinc-200 placeholder-zinc-500 focus:border-blue-500 focus:outline-none"
          />
        </div>

        <div className="text-xs font-medium text-zinc-400">
          共收录 <span className="font-mono text-blue-400 font-bold">{avatars.length}</span> 个形象素材
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-zinc-400 text-xs gap-2">
          <RefreshCw className="h-5 w-5 animate-spin text-blue-400" />
          <span>正在加载形象库...</span>
        </div>
      ) : filteredAvatars.length === 0 ? (
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
              setIsUploadModalOpen(true);
            }
          }}
          className={cn(
            "flex flex-col items-center justify-center p-12 rounded-2xl border border-dashed text-center space-y-3 transition-all",
            dragOver
              ? "border-blue-500 bg-blue-500/15 shadow-xl ring-2 ring-blue-500/30"
              : "border-white/[0.1] bg-[#10121a]/50"
          )}
        >
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-900 border border-white/[0.1] text-zinc-400">
            <UploadCloud className="h-7 w-7 text-blue-400" />
          </div>
          <h3 className="text-sm font-bold text-zinc-200">
            {dragOver ? "释放视频文件即可添加至形象库" : "形象库暂无素材"}
          </h3>
          <p className="text-xs text-zinc-500 max-w-sm">
            支持拖拽 MP4 / MOV 视频文件至此处，自动存入腾讯云 COS 新加坡存储桶。
          </p>
          <button
            type="button"
            onClick={() => setIsUploadModalOpen(true)}
            className="mt-2 inline-flex items-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 px-4 py-2 text-xs font-bold text-white shadow-md cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            <span>立即上传口播形象</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredAvatars.map((avatar) => (
            <div
              key={avatar.id}
              className="group flex flex-col rounded-2xl border border-white/[0.08] bg-[#10121a]/90 hover:border-blue-500/40 hover:bg-[#121522] transition-all overflow-hidden shadow-lg"
            >
              {/* Video Preview */}
              <div className="relative aspect-[9/10] w-full bg-black overflow-hidden border-b border-white/[0.08]">
                <video
                  src={`${avatar.videoUrl}#t=0.001`}
                  poster={avatar.coverUrl}
                  className="h-full w-full object-cover"
                  muted
                  playsInline
                  preload="auto"
                  onLoadedMetadata={(e) => {
                    try {
                      e.currentTarget.currentTime = 0.001;
                    } catch {}
                  }}
                  onMouseOver={(e) => {
                    try { (e.currentTarget as HTMLVideoElement).play(); } catch {}
                  }}
                  onMouseOut={(e) => {
                    try {
                      const v = e.currentTarget as HTMLVideoElement;
                      v.pause();
                      v.currentTime = 0.001;
                    } catch {}
                  }}
                />

                {/* Storage Badge */}
                <div className="absolute top-2.5 right-2.5 z-10">
                  {avatar.isCos ? (
                    <span className="flex items-center gap-1 rounded-md bg-blue-600/90 backdrop-blur-md px-2 py-0.5 text-[10px] font-bold text-white shadow-md">
                      <Cloud className="h-3 w-3" /> 腾讯云 COS
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 rounded-md bg-zinc-800/90 backdrop-blur-md px-2 py-0.5 text-[10px] font-mono text-zinc-300">
                      <HardDrive className="h-3 w-3" /> 本地
                    </span>
                  )}
                </div>

                <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity bg-black/70 backdrop-blur-sm px-2.5 py-1.5 rounded-lg text-[11px] text-zinc-200 z-10">
                  <span className="font-medium">悬停自动播放</span>
                  <span className="font-mono text-blue-300">{avatar.width}×{avatar.height}</span>
                </div>
              </div>

              {/* Info Body */}
              <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-bold text-sm text-zinc-100 truncate" title={avatar.name}>
                      {avatar.name}
                    </h3>
                    <button
                      type="button"
                      title="删除此形象"
                      onClick={(e) => handleDelete(avatar.id, e)}
                      className="text-zinc-500 hover:text-rose-400 p-1 rounded-md transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2 mt-2.5 text-xs text-zinc-400 bg-black/30 p-2 rounded-xl border border-white/[0.05]">
                    <div className="flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5 text-zinc-500" />
                      <span className="font-mono text-zinc-300">
                        {formatDuration(avatar.durationSeconds)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Layers className="h-3.5 w-3.5 text-zinc-500" />
                      <span className="font-mono text-zinc-300">
                        {avatar.fps || 30} FPS
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleUseAvatar(avatar)}
                  className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-blue-600/20 hover:bg-blue-600 text-blue-300 hover:text-white border border-blue-500/30 hover:border-blue-500 p-2.5 text-xs font-bold transition-all active:scale-[0.98] cursor-pointer"
                >
                  <Film className="h-3.5 w-3.5" />
                  <span>选用此形象去制作数字人</span>
                  <ArrowRight className="h-3.5 w-3.5 ml-0.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Upload Modal with Drag & Drop */}
      {isUploadModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4 animate-in fade-in duration-150">
          <div className="relative w-full max-w-md rounded-2xl border border-white/[0.12] bg-[#10121a] p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-3.5">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/15 text-blue-400 border border-blue-500/25">
                  <Video className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-zinc-100">
                    上传新口播形象视频
                  </h3>
                  <p className="text-[11px] text-zinc-400">
                    支持拖拽文件，视频将自动存入腾讯云 COS
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsUploadModalOpen(false)}
                className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/[0.08] hover:text-white transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleUpload} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-300">
                  形象自定义名称 (例如: 西装男高管口播 / 白色衬衫女士)
                </label>
                <input
                  type="text"
                  value={uploadName}
                  onChange={(e) => setUploadName(e.target.value)}
                  placeholder="可留空，默认按视频文件名命名"
                  className="w-full rounded-xl border border-white/[0.08] bg-black/40 p-3 text-xs text-zinc-100 placeholder-zinc-500 focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/mp4,video/quicktime,video/*"
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
                    "flex flex-col items-center justify-center p-6 rounded-xl border border-dashed transition-all cursor-pointer",
                    dragOver
                      ? "border-blue-500 bg-blue-500/15 ring-1 ring-blue-500/30"
                      : uploadFile
                      ? "border-emerald-500/50 bg-emerald-500/[0.06] text-emerald-300"
                      : "border-white/[0.12] bg-black/30 hover:border-blue-500/50 text-zinc-400"
                  )}
                >
                  <UploadCloud className="h-8 w-8 text-blue-400 mb-2" />
                  {uploadFile ? (
                    <div className="text-center">
                      <span className="text-xs font-semibold text-emerald-300 block truncate max-w-[260px]">
                        已选: {uploadFile.name} ({formatBytes(uploadFile.size)})
                      </span>
                      <span className="text-[10px] text-zinc-400">点击或拖拽可更换其他视频</span>
                    </div>
                  ) : (
                    <div className="text-center">
                      <span className="text-xs font-semibold text-zinc-200 block">
                        {dragOver ? "释放视频文件" : "点击或拖拽口播视频文件至此处"}
                      </span>
                      <span className="text-[10px] text-zinc-400 block mt-0.5">
                        支持 MP4 / MOV 格式，建议正面清晰、嘴部无遮挡
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {uploading && (
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs text-zinc-300 font-medium">
                    <span>正在上传并同步至腾讯云 COS...</span>
                    <span className="font-mono text-blue-400">{uploadProgress}%</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-900">
                    <div
                      className="h-full bg-blue-500 transition-all duration-200"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {uploadError && (
                <div className="flex items-center gap-2 rounded-xl bg-rose-500/10 border border-rose-500/20 p-3 text-xs text-rose-300">
                  <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
                  <span>{uploadError}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setIsUploadModalOpen(false)}
                  className="rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-2.5 text-xs font-semibold text-zinc-400 hover:text-white"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={uploading || !uploadFile}
                  className="flex items-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 px-5 py-2.5 text-xs font-bold text-white shadow-md transition-all active:scale-[0.98] disabled:opacity-50 cursor-pointer"
                >
                  {uploading ? (
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  )}
                  <span>{uploading ? "正在上传中..." : "确认添加至形象库"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
