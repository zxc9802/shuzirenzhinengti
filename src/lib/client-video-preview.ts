export interface VideoInspection {
  width: number;
  height: number;
  durationSeconds: number;
  thumbnail: Blob | null;
}

export function inspectVideoFile(file: Blob): Promise<VideoInspection> {
  return new Promise(resolve => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(file);
    let settled = false;
    let capturing = false;
    const finish = (thumbnail: Blob | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const result = {
        width: video.videoWidth || 1080, height: video.videoHeight || 1920,
        durationSeconds: Number.isFinite(video.duration) ? video.duration : 0, thumbnail,
      };
      video.onloadeddata = video.onseeked = video.onerror = null;
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(url);
      resolve(result);
    };
    const timer = setTimeout(() => finish(null), 10_000);
    const capture = () => {
      if (capturing || settled) return;
      capturing = true;
      try {
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const context = canvas.getContext("2d");
        if (!context || !canvas.width || !canvas.height) return finish(null);
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(finish, "image/jpeg", 0.9);
      } catch { finish(null); }
    };
    video.onloadeddata = () => {
      const timestamp = Math.min(1, (video.duration || 0) * 0.2);
      if (timestamp > 0) video.currentTime = timestamp;
      else capture();
    };
    video.onseeked = capture;
    video.onerror = () => finish(null);
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.src = url;
  });
}

export async function recoverAvatarCover(id: string): Promise<string | null> {
  try {
    const response = await fetch("/api/avatars/extract-cover", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, timestamp: 1 }),
    });
    const data = await response.json();
    return response.ok && data.success && data.coverUrl ? data.coverUrl : null;
  } catch { return null; }
}
