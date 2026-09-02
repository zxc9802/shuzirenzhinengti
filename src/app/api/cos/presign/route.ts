import { NextRequest, NextResponse } from "next/server";
import { CosService } from "@/lib/cos";
import {
  resolveAccessContext,
  unauthorizedResponse,
} from "@/lib/access-control";

const ALLOWED_UPLOAD_FOLDERS = new Set(["videos", "voices", "thumbnails"]);

export async function POST(req: NextRequest) {
  try {
    const access = await resolveAccessContext(req);
    if (access.isolated && !access.userId) return unauthorizedResponse();

    const body = await req.json();
    const { fileName, folder = "videos" } = body;

    if (!fileName) {
      return NextResponse.json({ error: "fileName 必填" }, { status: 400 });
    }
    if (!ALLOWED_UPLOAD_FOLDERS.has(folder)) {
      return NextResponse.json({ error: "不支持的上传目录" }, { status: 400 });
    }

    if (!CosService.isConfigured()) {
      return NextResponse.json(
        { success: false, error: "云端存储未配置" },
        { status: 400 }
      );
    }

    const safeName = `${Date.now()}_${fileName.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const ownerKey = (access.userId || "local").replace(/[^a-zA-Z0-9_-]/g, "_");
    const key = `uploads/users/${ownerKey}/${folder}/${safeName}`;

    const presigned = await CosService.getPresignedPutUrl(key, 3600);

    return NextResponse.json({
      success: true,
      presignedUrl: presigned.presignedUrl,
      publicUrl: presigned.publicUrl,
      key,
      safeName,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "获取上传地址失败" }, { status: 500 });
  }
}
