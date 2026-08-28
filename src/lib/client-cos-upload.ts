export interface DirectUploadResult {
  fileUrl: string;
  key: string;
  isCos: boolean;
}

export async function uploadFileDirectToCos(
  file: File | Blob,
  fileName: string,
  folder: "videos" | "voices" | "thumbnails" = "videos",
  onProgress?: (percent: number) => void
): Promise<DirectUploadResult> {
  // 1. Try to get presigned URL from backend
  try {
    const presignResp = await fetch("/api/cos/presign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileName, folder }),
    });

    if (presignResp.ok) {
      const presignData = await presignResp.json();
      if (presignData.success && presignData.presignedUrl) {
        // 2. Direct PUT to cloud object storage (Bypasses server proxy & 413 limits)
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("PUT", presignData.presignedUrl, true);
          xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");

          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable && onProgress) {
              const percent = Math.round((e.loaded / e.total) * 100);
              onProgress(percent);
            }
          };

          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve();
            } else {
              reject(new Error(`云端存储直传失败 (${xhr.status})`));
            }
          };

          xhr.onerror = () => reject(new Error("网络连接异常，无法连接至云端存储"));
          xhr.send(file);
        });

        return {
          fileUrl: presignData.publicUrl,
          key: presignData.key,
          isCos: true,
        };
      }
    }
  } catch (err: any) {
    console.warn("Direct COS upload fallback to server:", err.message);
  }

  // Fallback: standard server-side upload
  const formData = new FormData();
  formData.append("file", file, fileName);

  return new Promise<DirectUploadResult>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/upload", true);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        const percent = Math.round((e.loaded / e.total) * 100);
        onProgress(percent);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText);
          if (data.success) {
            resolve({
              fileUrl: data.fileUrl,
              key: data.filePath,
              isCos: data.isCos,
            });
          } else {
            reject(new Error(data.error || "上传失败"));
          }
        } catch {
          reject(new Error("解析响应失败"));
        }
      } else {
        reject(new Error(`上传异常 (${xhr.status})`));
      }
    };

    xhr.onerror = () => reject(new Error("网络连接失败"));
    xhr.send(formData);
  });
}
