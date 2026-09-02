import { NextRequest, NextResponse } from "next/server";
import { AvatarStore } from "@/lib/store/avatar-store";
import {
  canManageMediaItem,
  canViewAllMedia,
  mediaNotFoundResponse,
  resolveAccessContext,
  unauthorizedResponse,
} from "@/lib/access-control";

export async function GET(req: NextRequest) {
  try {
    const access = await resolveAccessContext(req);
    if (access.isolated && !access.userId) return unauthorizedResponse();

    const avatars = await AvatarStore.getAllAsync();
    const visibleAvatars = (canViewAllMedia(access)
      ? avatars
      : avatars.filter((avatar) => avatar.userId === access.userId)
    ).map((avatar) => ({
      ...avatar,
      canManage: canManageMediaItem(access, avatar),
    }));

    return NextResponse.json({ success: true, avatars: visibleAvatars });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const access = await resolveAccessContext(req);
    if (access.isolated && !access.userId) return unauthorizedResponse();

    const body = await req.json();
    const { name, videoUrl, videoPath, coverUrl, durationSeconds, width, height, fps, fileSize, isCos } = body;

    if (!videoUrl) {
      return NextResponse.json({ error: "视频 URL 必填" }, { status: 400 });
    }

    const created = AvatarStore.create({
      userId: access.userId || undefined,
      name: name?.trim() || "未命名口播形象",
      videoUrl,
      videoPath: videoPath || "",
      coverUrl: coverUrl || "",
      durationSeconds: durationSeconds || 0,
      width: width || 1080,
      height: height || 1920,
      fps: fps || 30,
      fileSize: fileSize || 0,
      isCos: Boolean(isCos),
    });

    return NextResponse.json({
      success: true,
      avatar: { ...created, canManage: true },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const access = await resolveAccessContext(req);
    if (access.isolated && !access.userId) return unauthorizedResponse();

    const body = await req.json();
    const { id } = body;
    if (!id) {
      return NextResponse.json({ error: "ID 必填" }, { status: 400 });
    }

    const avatar = AvatarStore.get(id);
    if (!avatar || !canManageMediaItem(access, avatar)) return mediaNotFoundResponse();

    const updates = { ...body };
    delete updates.id;
    delete updates.userId;
    delete updates.createdAt;
    delete updates.canManage;

    const updated = AvatarStore.update(id, updates);
    if (!updated) return mediaNotFoundResponse();

    return NextResponse.json({
      success: true,
      avatar: { ...updated, canManage: true },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const access = await resolveAccessContext(req);
    if (access.isolated && !access.userId) return unauthorizedResponse();

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "ID 必填" }, { status: 400 });
    }
    const avatar = AvatarStore.get(id);
    if (!avatar || !canManageMediaItem(access, avatar)) return mediaNotFoundResponse();

    AvatarStore.delete(id);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
