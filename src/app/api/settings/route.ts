import { NextRequest, NextResponse } from "next/server";
import { getAppConfig, saveAppConfig } from "@/lib/config";

export async function GET() {
  const config = getAppConfig();
  const safeConfig = {
    ...config,
    indexttsApiKey: config.indexttsApiKey
      ? config.indexttsApiKey.slice(0, 4) + "••••••••" + config.indexttsApiKey.slice(-4)
      : "",
    openluxApiKey: config.openluxApiKey
      ? config.openluxApiKey.slice(0, 4) + "••••••••" + config.openluxApiKey.slice(-4)
      : "",
    pixverseIngestToken: config.pixverseIngestToken
      ? config.pixverseIngestToken.slice(0, 4) + "••••••••" + config.pixverseIngestToken.slice(-4)
      : "",
    falApiKey: config.falApiKey
      ? config.falApiKey.slice(0, 4) + "••••••••" + config.falApiKey.slice(-4)
      : "",
    rawKeysPresent: {
      indextts: !!config.indexttsApiKey,
      openlux: !!config.openluxApiKey,
      pixverseIngest: !!config.pixverseIngestToken,
      fal: !!config.falApiKey,
    },
  };
  return NextResponse.json({ config: safeConfig });
}

export async function POST(req: NextRequest) {
  const body = await req.json();

  if (body.indexttsApiKey && body.indexttsApiKey.includes("••••")) {
    delete body.indexttsApiKey;
  }
  if (body.openluxApiKey && body.openluxApiKey.includes("••••")) {
    delete body.openluxApiKey;
  }
  if (body.pixverseIngestToken && body.pixverseIngestToken.includes("••••")) {
    delete body.pixverseIngestToken;
  }
  if (body.falApiKey && body.falApiKey.includes("••••")) {
    delete body.falApiKey;
  }

  const updated = saveAppConfig(body);
  return NextResponse.json({ success: true, config: updated });
}
