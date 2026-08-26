import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { pipeline } from "stream/promises";
import { Readable } from "stream";
import { VoiceStore } from "@/lib/store/voice-store";
import { getAppConfig } from "@/lib/config";

export async function GET() {
  try {
    const voices = VoiceStore.getAll();
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
      const description = (formData.get("description") as string)?.trim() || "用户自定义克隆音色";

      if (!file) {
        return NextResponse.json({ error: "请上传音频文件 (MP3/WAV/M4A)" }, { status: 400 });
      }

      const uploadsDir = path.join(process.cwd(), "public", "uploads", "voices");
      fs.mkdirSync(uploadsDir, { recursive: true });

      const safeName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const filePath = path.join(uploadsDir, safeName);

      const nodeReadable = Readable.fromWeb(file.stream() as any);
      const writeStream = fs.createWriteStream(filePath);
      await pipeline(nodeReadable, writeStream);

      const config = getAppConfig();
      const baseUrl = config.publicBaseUrl.replace(/\/$/, "");
      const publicAudioUrl = `${baseUrl}/uploads/voices/${safeName}`;

      const createdVoice = VoiceStore.create({
        name,
        description,
        audioUrl: publicAudioUrl,
        audioPath: filePath,
        isDefault: false,
      });

      return NextResponse.json({ success: true, voice: createdVoice });
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
