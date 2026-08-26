import { NextRequest, NextResponse } from "next/server";
import { CosService } from "@/lib/cos";
import { saveAppConfig } from "@/lib/config";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (body.cosSecretId || body.cosSecretKey || body.cosBucket || body.cosRegion) {
      saveAppConfig({
        cosSecretId: body.cosSecretId,
        cosSecretKey: body.cosSecretKey,
        cosBucket: body.cosBucket,
        cosRegion: body.cosRegion,
        cosCustomDomain: body.cosCustomDomain,
        cosEnabled: true,
      });
    }

    const testResult = await CosService.testConnection();
    return NextResponse.json(testResult);
  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: err.message || "测试连接异常" },
      { status: 500 }
    );
  }
}
