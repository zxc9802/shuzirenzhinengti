import { NextRequest, NextResponse } from "next/server";
import { AvatarStore } from "@/lib/store/avatar-store";

export async function GET() {
  try {
    const avatars = await AvatarStore.getAllAsync();
    return NextResponse.json({ success: true, avatars });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, videoUrl, videoPath, durationSeconds, width, height, fps, fileSize, isCos } = body;

    if (!videoUrl) {
      return NextResponse.json({ error: "视频 URL 必填" }, { status: 400 });
    }

    const created = AvatarStore.create({
      name: name?.trim() || "未命名口播形象",
      videoUrl,
      videoPath: videoPath || "",
      durationSeconds: durationSeconds || 0,
      width: width || 1080,
      height: height || 1920,
      fps: fps || 30,
      fileSize: fileSize || 0,
      isCos: Boolean(isCos),
    });

    return NextResponse.json({ success: true, avatar: created });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "ID 必填" }, { status: 400 });
    }
    AvatarStore.delete(id);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
