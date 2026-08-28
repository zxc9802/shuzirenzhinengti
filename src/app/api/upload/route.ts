import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { pipeline } from "stream/promises";
import { Readable } from "stream";
import { probeMedia, extractVideoThumbnail } from "@/lib/engine/ffmpeg";
import { CosService } from "@/lib/cos";
import { AvatarStore } from "@/lib/store/avatar-store";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const avatarName = (formData.get("name") as string)?.trim();

    if (!file) {
      return NextResponse.json({ error: "未检测到上传文件" }, { status: 400 });
    }

    const uploadsDir = path.join(process.cwd(), "public", "uploads", "videos");
    fs.mkdirSync(uploadsDir, { recursive: true });

    const safeName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const filePath = path.join(uploadsDir, safeName);

    // Fast streaming write to disk
    const nodeReadable = Readable.fromWeb(file.stream() as any);
    const writeStream = fs.createWriteStream(filePath);
    await pipeline(nodeReadable, writeStream);

    let fileUrl = `/uploads/videos/${safeName}`;
    let coverUrl = "";
    let isCos = false;

    // Check media info
    let probe: any = null;
    try {
      probe = await probeMedia(filePath);
    } catch (e: any) {
      console.warn("Probe warning for uploaded file:", e.message);
    }

    const baseName = safeName.replace(/\.[^/.]+$/, "");
    const thumbFileName = `${baseName}_thumb.jpg`;
    const thumbPath = path.join(uploadsDir, thumbFileName);

    // 1. Check if client sent pre-captured thumbnail from canvas
    const clientThumb = formData.get("thumbnail") as File | null;
    if (clientThumb) {
      try {
        const clientThumbBuffer = Buffer.from(await clientThumb.arrayBuffer());
        if (clientThumbBuffer.length > 500) {
          fs.writeFileSync(thumbPath, clientThumbBuffer);
          coverUrl = `/uploads/videos/${thumbFileName}`;
        }
      } catch (clientThumbErr: any) {
        console.warn("Client thumbnail write error:", clientThumbErr.message);
      }
    }

    // 2. If thumbnail not yet ready, extract frame using FFmpeg at 1.0s (or probe duration * 0.1)
    if (!fs.existsSync(thumbPath) || fs.statSync(thumbPath).size < 500) {
      try {
        const seekTime = probe?.durationSeconds && probe.durationSeconds > 2 ? 1.0 : 0.5;
        await extractVideoThumbnail(filePath, thumbPath, seekTime);
        coverUrl = `/uploads/videos/${thumbFileName}`;
      } catch (thumbErr: any) {
        console.warn("FFmpeg thumbnail extraction error:", thumbErr.message);
      }
    }

    // If cloud object storage is configured, upload video & thumbnail to COS with public-read permissions
    if (CosService.isConfigured()) {
      try {
        CosService.ensureBucketPublicAndCors().catch(() => {});

        const cosKey = `uploads/videos/${safeName}`;
        const cosUrl = await CosService.uploadFile(filePath, cosKey);
        fileUrl = cosUrl;
        isCos = true;

        if (fs.existsSync(thumbPath)) {
          const cosThumbKey = `uploads/thumbnails/${safeName}.jpg`;
          const thumbCosUrl = await CosService.uploadFile(thumbPath, cosThumbKey);
          coverUrl = thumbCosUrl;
        }
      } catch (cosErr: any) {
        console.warn("cloud object storage upload fallback to local:", cosErr.message);
      }
    }

    // Automatically register into Avatar Library
    const displayName =
      avatarName ||
      file.name.replace(/\.[^/.]+$/, "").replace(/[^a-zA-Z0-9_\u4e00-\u9fa5 -]/g, "") ||
      "我的口播形象";

    const savedAvatar = AvatarStore.create({
      name: displayName,
      videoUrl: fileUrl,
      videoPath: filePath,
      coverUrl,
      durationSeconds: probe?.durationSeconds || 0,
      width: probe?.width || 1080,
      height: probe?.height || 1920,
      fps: probe?.fps || 30,
      fileSize: file.size,
      isCos,
    });

    return NextResponse.json({
      success: true,
      fileName: file.name,
      filePath,
      fileUrl,
      coverUrl,
      size: file.size,
      probe,
      isCos,
      avatar: savedAvatar,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "上传异常" },
      { status: 500 }
    );
  }
}
