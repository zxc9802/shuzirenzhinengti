import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { pipeline } from "stream/promises";
import { Readable } from "stream";
import { VoiceStore } from "@/lib/store/voice-store";
import { getAppConfig } from "@/lib/config";
import { CosService } from "@/lib/cos";
import { extractAudioFromMedia } from "@/lib/engine/ffmpeg";

export async function GET() {
  try {
    const voices = await VoiceStore.getAllAsync();
    return NextResponse.json({ success: true, voices });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      const name = (formData.get("name") as string)?.trim() || "未命名自定义音色";
      const description = (formData.get("description") as string)?.trim() || "用户自定义原声音频";

      if (!file) {
        return NextResponse.json(
          { error: "请上传音频文件 (MP3/WAV/M4A) 或视频文件 (MP4/MOV)" },
          { status: 400 }
        );
      }

      const uploadsDir = path.join(process.cwd(), "public", "uploads", "voices");
      fs.mkdirSync(uploadsDir, { recursive: true });

      const safeBaseName = `${Date.now()}_${file.name.replace(/\.[^/.]+$/, "").replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const ext = path.extname(file.name).toLowerCase() || ".mp3";
      const tempUploadPath = path.join(uploadsDir, `${safeBaseName}_raw${ext}`);

      // 1. Stream uploaded file to disk
      const nodeReadable = Readable.fromWeb(file.stream() as any);
      const writeStream = fs.createWriteStream(tempUploadPath);
      await pipeline(nodeReadable, writeStream);

      // 2. Extract or convert audio to MP3
      const isVideo = file.type.startsWith("video/") || [".mp4", ".mov", ".mkv", ".webm", ".avi"].includes(ext);
      const finalMp3FileName = `${safeBaseName}.mp3`;
      const finalAudioPath = path.join(uploadsDir, finalMp3FileName);

      let wasExtracted = false;
      if (isVideo || ext !== ".mp3") {
        try {
          await extractAudioFromMedia(tempUploadPath, finalAudioPath);
          wasExtracted = true;
          // Remove temp video file to save disk space
          if (fs.existsSync(tempUploadPath) && tempUploadPath !== finalAudioPath) {
            try { fs.unlinkSync(tempUploadPath); } catch {}
          }
        } catch (e: any) {
          console.warn("Audio extraction fallback, using original file:", e.message);
          // If ffmpeg extract fails, fallback to keeping temp file
          fs.copyFileSync(tempUploadPath, finalAudioPath);
        }
      } else {
        fs.copyFileSync(tempUploadPath, finalAudioPath);
        if (tempUploadPath !== finalAudioPath) {
          try { fs.unlinkSync(tempUploadPath); } catch {}
        }
      }

      const config = getAppConfig();
      let publicAudioUrl = `/uploads/voices/${finalMp3FileName}`;
      let isCos = false;

      // 3. Upload extracted audio to Tencent Cloud COS
      if (CosService.isConfigured()) {
        try {
          const cosKey = `uploads/voices/${finalMp3FileName}`;
          publicAudioUrl = await CosService.uploadFile(finalAudioPath, cosKey);
          isCos = true;
        } catch (cosErr: any) {
          console.warn("COS upload for voice fallback to local:", cosErr.message);
          const baseUrl = config.publicBaseUrl.replace(/\/$/, "");
          publicAudioUrl = `${baseUrl}/uploads/voices/${finalMp3FileName}`;
        }
      } else {
        const baseUrl = config.publicBaseUrl.replace(/\/$/, "");
        publicAudioUrl = `${baseUrl}/uploads/voices/${finalMp3FileName}`;
      }

      const createdVoice = VoiceStore.create({
        name,
        description: isVideo ? `${description} (由视频自动提取音频)` : description,
        audioUrl: publicAudioUrl,
        audioPath: finalAudioPath,
        isDefault: false,
      });

      return NextResponse.json({
        success: true,
        voice: createdVoice,
        isCos,
        extractedFromVideo: isVideo,
      });
    } else {
      const body = await req.json();
      const { name, audioUrl, description } = body;

      if (!name || !audioUrl) {
        return NextResponse.json({ error: "音色名称与音频 URL 均为必填项" }, { status: 400 });
      }

      const createdVoice = VoiceStore.create({
        name: name.trim(),
        description: description?.trim() || "自定义音频直链",
        audioUrl: audioUrl.trim(),
        isDefault: false,
      });

      return NextResponse.json({ success: true, voice: createdVoice });
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "创建音色失败" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "ID 必填" }, { status: 400 });
    }
    VoiceStore.delete(id);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
