import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { extractVideoThumbnail } from "@/lib/engine/ffmpeg";
import { CosService } from "@/lib/cos";
import { AvatarStore } from "@/lib/store/avatar-store";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, timestamp = 1.0 } = body;

    if (!id) {
      return NextResponse.json({ error: "缺少形象素材 ID" }, { status: 400 });
    }

    const avatar = AvatarStore.get(id);
    if (!avatar) {
      return NextResponse.json({ error: "未找到对应形象素材" }, { status: 404 });
    }

    const videoSrc = (avatar.videoPath && fs.existsSync(avatar.videoPath))
      ? avatar.videoPath
      : avatar.videoUrl;

    if (!videoSrc) {
      return NextResponse.json({ error: "该形象素材无有效视频路径或链接" }, { status: 400 });
    }

    const uploadsDir = path.join(process.cwd(), "public", "uploads", "videos");
    fs.mkdirSync(uploadsDir, { recursive: true });

    const cleanId = id.replace(/[^a-zA-Z0-9_-]/g, "_");
    const thumbFileName = `cover_${cleanId}_${Date.now()}.jpg`;
    const thumbPath = path.join(uploadsDir, thumbFileName);

    // Extract frame with FFmpeg
    await extractVideoThumbnail(videoSrc, thumbPath, Number(timestamp) || 1.0);

    if (!fs.existsSync(thumbPath) || fs.statSync(thumbPath).size < 500) {
      return NextResponse.json({ error: "封面截取失败，未生成有效画面" }, { status: 500 });
    }

    let coverUrl = `/uploads/videos/${thumbFileName}`;

    // Upload to Tencent Cloud COS if configured
    if (CosService.isConfigured()) {
      try {
        CosService.ensureBucketPublicAndCors().catch(() => {});
        const cosThumbKey = `uploads/thumbnails/${thumbFileName}`;
        const cosUrl = await CosService.uploadFile(thumbPath, cosThumbKey);
        coverUrl = cosUrl;
      } catch (cosErr: any) {
        console.warn("Upload re-extracted thumbnail to COS error:", cosErr.message);
      }
    }

    // Update avatar store
    const updated = AvatarStore.update(id, { coverUrl });

    return NextResponse.json({
      success: true,
      coverUrl,
      avatar: updated,
    });
  } catch (err: any) {
    console.error("Extract cover error:", err);
    return NextResponse.json(
      { error: err.message || "截取封面异常" },
      { status: 500 }
    );
  }
}
