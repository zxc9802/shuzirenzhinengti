import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { CosService } from "@/lib/cos";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string[] }> }
) {
  const { slug } = await params;
  if (!slug || slug.length === 0) {
    return new NextResponse("Not found", { status: 404 });
  }

  const safeRelPath = slug.map((s) => path.basename(s)).join("/");
  const filePath = path.join(process.cwd(), "public", "uploads", safeRelPath.split("/").join(path.sep));

  if (!fs.existsSync(filePath)) {
    if (CosService.isConfigured()) {
      const cosKey = `uploads/${safeRelPath}`;
      const cosUrl = CosService.getPublicUrl(cosKey);
      return NextResponse.redirect(cosUrl, 307);
    }
    return new NextResponse("File not found", { status: 404 });
  }

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.get("range");

  const ext = path.extname(filePath).toLowerCase();
  let contentType = "application/octet-stream";
  if (ext === ".mp4") contentType = "video/mp4";
  else if (ext === ".mov") contentType = "video/quicktime";
  else if (ext === ".webm") contentType = "video/webm";
  else if (ext === ".wav") contentType = "audio/wav";
  else if (ext === ".mp3") contentType = "audio/mpeg";
  else if (ext === ".m4a") contentType = "audio/mp4";
  else if (ext === ".aac") contentType = "audio/aac";

  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunksize = end - start + 1;

    const stream = fs.createReadStream(filePath, { start, end });
    const responseStream = new ReadableStream({
      start(controller) {
        stream.on("data", (chunk) => controller.enqueue(chunk));
        stream.on("end", () => controller.close());
        stream.on("error", (err) => controller.error(err));
      },
    });

    return new NextResponse(responseStream as any, {
      status: 206,
      headers: {
        "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        "Accept-Ranges": "bytes",
        "Content-Length": chunksize.toString(),
        "Content-Type": contentType,
      },
    });
  } else {
    const stream = fs.createReadStream(filePath);
    const responseStream = new ReadableStream({
      start(controller) {
        stream.on("data", (chunk) => controller.enqueue(chunk));
        stream.on("end", () => controller.close());
        stream.on("error", (err) => controller.error(err));
      },
    });

    return new NextResponse(responseStream as any, {
      status: 200,
      headers: {
        "Content-Length": fileSize.toString(),
        "Content-Type": contentType,
        "Accept-Ranges": "bytes",
      },
    });
  }
}
