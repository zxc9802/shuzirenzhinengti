export interface MediaUploadResult {
  uploadKey: string;
  storedRemotely: boolean;
}

export function uploadMediaFile(
  file: File | Blob,
  fileName: string,
  folder: "videos" | "voices" | "thumbnails" = "videos",
  onProgress?: (percent: number) => void
): Promise<MediaUploadResult> {
  return new Promise<MediaUploadResult>((resolve, reject) => {
    const query = new URLSearchParams({ folder, fileName });
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/upload?${query.toString()}`, true);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(`上传异常 (${xhr.status})`));
        return;
      }
      try {
        const data = JSON.parse(xhr.responseText);
        if (!data.success || !data.uploadKey) {
          reject(new Error(data.error || "上传失败"));
          return;
        }
        resolve({
          uploadKey: data.uploadKey,
          storedRemotely: Boolean(data.storedRemotely),
        });
      } catch {
        reject(new Error("解析响应失败"));
      }
    };
    xhr.onerror = () => reject(new Error("网络连接失败"));
    xhr.send(file);
  });
}
