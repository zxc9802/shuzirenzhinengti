import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; file: string }> }
) {
  const { id, file } = await params;
  const safeFileName = path.basename(file);
  const filePath = path.join(process.cwd(), "public", "jobs", id, safeFileName);

  if (!fs.existsSync(filePath)) {
    return new NextResponse("File not found", { status: 404 });
  }

  const fileBuffer = fs.readFileSync(filePath);
  const headers = new Headers();
  headers.set("Content-Disposition", `attachment; filename="${safeFileName}"`);

  if (safeFileName.endsWith(".mp4")) {
    headers.set("Content-Type", "video/mp4");
  } else if (safeFileName.endsWith(".wav")) {
    headers.set("Content-Type", "audio/wav");
  } else if (safeFileName.endsWith(".json")) {
    headers.set("Content-Type", "application/json");
  }

  return new NextResponse(fileBuffer, { headers });
}
