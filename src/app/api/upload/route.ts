import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { pipeline } from "stream/promises";
import { Readable } from "stream";
import { probeMedia } from "@/lib/engine/ffmpeg";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "未检测到上传文件" }, { status: 400 });
    }

    const uploadsDir = path.join(process.cwd(), "public", "uploads");
    fs.mkdirSync(uploadsDir, { recursive: true });

    const safeName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const filePath = path.join(uploadsDir, safeName);

    // Fast streaming write to disk
    const nodeReadable = Readable.fromWeb(file.stream() as any);
    const writeStream = fs.createWriteStream(filePath);
    await pipeline(nodeReadable, writeStream);

    const fileUrl = `/uploads/${safeName}`;

    let probe = null;
    try {
      probe = await probeMedia(filePath);
    } catch (e: any) {
      console.warn("Probe warning for uploaded file:", e.message);
    }

    return NextResponse.json({
      success: true,
      fileName: file.name,
      filePath,
      fileUrl,
      size: file.size,
      probe,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "上传异常" },
      { status: 500 }
    );
  }
}
