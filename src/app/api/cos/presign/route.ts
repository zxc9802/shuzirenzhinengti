import { NextRequest, NextResponse } from "next/server";
import { CosService } from "@/lib/cos";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { fileName, folder = "videos" } = body;

    if (!fileName) {
      return NextResponse.json({ error: "fileName 必填" }, { status: 400 });
    }

    if (!CosService.isConfigured()) {
      return NextResponse.json(
        { success: false, error: "腾讯云 COS 未配置" },
        { status: 400 }
      );
    }

    const safeName = `${Date.now()}_${fileName.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const key = `uploads/${folder}/${safeName}`;

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
