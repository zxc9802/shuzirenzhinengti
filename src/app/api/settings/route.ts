import { NextRequest, NextResponse } from "next/server";
import { getAppConfig, saveAppConfig } from "@/lib/config";

export async function GET() {
  const config = getAppConfig();
  const safeConfig = {
    ...config,
    indexttsApiKey: config.indexttsApiKey
      ? config.indexttsApiKey.slice(0, 4) + "••••••••" + config.indexttsApiKey.slice(-4)
      : "",
    rawKeysPresent: {
      indextts: !!config.indexttsApiKey,
    },
  };
  return NextResponse.json({ config: safeConfig });
}

export async function POST(req: NextRequest) {
  const body = await req.json();

  if (body.indexttsApiKey && body.indexttsApiKey.includes("••••")) {
    delete body.indexttsApiKey;
  }

  const updated = saveAppConfig(body);
  return NextResponse.json({ success: true, config: updated });
}
