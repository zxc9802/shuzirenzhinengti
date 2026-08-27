import COS from "cos-nodejs-sdk-v5";
import fs from "fs";
import { getAppConfig } from "./config";

let cosInstance: COS | null = null;
let currentSecretId = "";
let currentSecretKey = "";

function getCosClient(): COS | null {
  const config = getAppConfig();
  if (!config.cosSecretId || !config.cosSecretKey) {
    return null;
  }

  if (
    !cosInstance ||
    currentSecretId !== config.cosSecretId ||
    currentSecretKey !== config.cosSecretKey
  ) {
    cosInstance = new COS({
      SecretId: config.cosSecretId,
      SecretKey: config.cosSecretKey,
    });
    currentSecretId = config.cosSecretId;
    currentSecretKey = config.cosSecretKey;
  }

  return cosInstance;
}

export const CosService = {
  isConfigured(): boolean {
    const config = getAppConfig();
    return Boolean(
      config.cosSecretId &&
      config.cosSecretKey &&
      config.cosBucket &&
      config.cosRegion
    );
  },

  getPublicUrl(key: string): string {
    const config = getAppConfig();
    const cleanKey = key.replace(/^\/+/, "");
    if (config.cosCustomDomain) {
      const domain = config.cosCustomDomain.replace(/^https?:\/\//, "").replace(/\/$/, "");
      return `https://${domain}/${cleanKey}`;
    }
    return `https://${config.cosBucket}.cos.${config.cosRegion}.myqcloud.com/${cleanKey}`;
  },

  async uploadFile(
    localFilePath: string,
    targetKey: string,
    onProgress?: (percent: number) => void
  ): Promise<string> {
    const config = getAppConfig();
    const cos = getCosClient();

    if (!cos || !config.cosBucket || !config.cosRegion) {
      throw new Error("腾讯云 COS 未配置，请先在系统设置中配置 SecretId / SecretKey / Bucket / Region");
    }

    if (!fs.existsSync(localFilePath)) {
      throw new Error(`本地文件不存在: ${localFilePath}`);
    }

    const cleanKey = targetKey.replace(/^\/+/, "");

    return new Promise((resolve, reject) => {
      cos.sliceUploadFile(
        {
          Bucket: config.cosBucket,
          Region: config.cosRegion,
          Key: cleanKey,
          FilePath: localFilePath,
          onProgress: (progressData) => {
            if (onProgress && progressData.percent) {
              onProgress(Math.round(progressData.percent * 100));
            }
          },
        },
        (err, data) => {
          if (err) {
            console.error("Tencent COS upload error:", err);
            reject(new Error(`腾讯云 COS 上传失败: ${err.message || JSON.stringify(err)}`));
            return;
          }

          let publicUrl = "";
          if (config.cosCustomDomain) {
            const domain = config.cosCustomDomain.replace(/^https?:\/\//, "").replace(/\/$/, "");
            publicUrl = `https://${domain}/${cleanKey}`;
          } else if (data?.Location) {
            publicUrl = data.Location.startsWith("http")
              ? data.Location
              : `https://${data.Location}`;
          } else {
            publicUrl = `https://${config.cosBucket}.cos.${config.cosRegion}.myqcloud.com/${cleanKey}`;
          }

          resolve(publicUrl);
        }
      );
    });
  },

  async saveJsonToCos(key: string, data: any): Promise<void> {
    const config = getAppConfig();
    const cos = getCosClient();
    if (!cos || !config.cosBucket || !config.cosRegion) return;

    const cleanKey = key.replace(/^\/+/, "");
    const jsonStr = JSON.stringify(data, null, 2);

    return new Promise((resolve, reject) => {
      cos.putObject(
        {
          Bucket: config.cosBucket,
          Region: config.cosRegion,
          Key: cleanKey,
          Body: Buffer.from(jsonStr, "utf-8"),
          ContentType: "application/json",
        },
        (err) => {
          if (err) {
            console.warn(`Failed to sync JSON to COS (${cleanKey}):`, err.message);
            reject(err);
          } else {
            resolve();
          }
        }
      );
    });
  },

  async getJsonFromCos<T>(key: string): Promise<T | null> {
    const config = getAppConfig();
    const cos = getCosClient();
    if (!cos || !config.cosBucket || !config.cosRegion) return null;

    const cleanKey = key.replace(/^\/+/, "");

    return new Promise((resolve) => {
      cos.getObject(
        {
          Bucket: config.cosBucket,
          Region: config.cosRegion,
          Key: cleanKey,
        },
        (err, data) => {
          if (err || !data?.Body) {
            resolve(null);
          } else {
            try {
              const bodyStr = data.Body.toString("utf-8");
              const parsed = JSON.parse(bodyStr);
              resolve(parsed as T);
            } catch {
              resolve(null);
            }
          }
        }
      );
    });
  },

  async listFiles(prefix: string): Promise<{ key: string; size: number; lastModified: string }[]> {
    const config = getAppConfig();
    const cos = getCosClient();
    if (!cos || !config.cosBucket || !config.cosRegion) return [];

    return new Promise((resolve) => {
      cos.getBucket(
        {
          Bucket: config.cosBucket,
          Region: config.cosRegion,
          Prefix: prefix,
        },
        (err, data) => {
          if (err || !data?.Contents) {
            resolve([]);
          } else {
            resolve(
              data.Contents.map((c: any) => ({
                key: c.Key,
                size: Number(c.Size || 0),
                lastModified: c.LastModified || "",
              }))
            );
          }
        }
      );
    });
  },

  async testConnection(): Promise<{ success: boolean; message: string; buckets?: any[] }> {
    const cos = getCosClient();
    if (!cos) {
      return { success: false, message: "缺少 SecretId 或 SecretKey" };
    }

    return new Promise((resolve) => {
      cos.getService((err, data) => {
        if (err) {
          resolve({
            success: false,
            message: `连接失败: ${err.message || "密钥校验未通过"}`,
          });
        } else {
          resolve({
            success: true,
            message: "腾讯云 COS 凭据校验成功！",
            buckets: data?.Buckets || [],
          });
        }
      });
    });
  },
};
