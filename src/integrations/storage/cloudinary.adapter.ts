import cloudinary from "cloudinary";
import { AppError } from "../../shared/errors/app-error.js";
import { ErrorCodes } from "../../shared/errors/error-codes.js";
import type { StorageProvider } from "./storage.interface.js";

const SIGNED_URL_TTL_MS = 5 * 60 * 1000;

export class CloudinaryAdapter implements StorageProvider {
  private readonly provider = "cloudinary";

  constructor() {
    cloudinary.v2.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME ?? "",
      api_key: process.env.CLOUDINARY_API_KEY ?? "",
      api_secret: process.env.CLOUDINARY_API_SECRET ?? "",
      secure: true,
    });
  }

  private get isConfigured(): boolean {
    return Boolean(
      process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET,
    );
  }

  async upload(
    file: { id: string; path: string; originalName: string; mimeType: string; sizeBytes: number },
    folder: string,
  ): Promise<{ key: string; url: string }> {
    if (!this.isConfigured) {
      const key = `proofs/${file.id}/${Date.now()}`;
      return { key, url: `mock://res.cloudinary.com/${key}` };
    }

    try {
      const result = await new Promise<{ publicId: string; secureUrl: string }>((resolve, reject) => {
        cloudinary.v2.uploader.upload(
          file.path,
          {
            public_id: file.id,
            folder,
            resource_type: "image",
            access_mode: "authenticated",
            use_filename: false,
            unique_filename: false,
          },
          (error: unknown, result?: { public_id: string; secure_url: string }) => {
            if (error || !result) {
              reject(new AppError(503, ErrorCodes.DEPENDENCY_UNAVAILABLE, "Cloudinary upload failed"));
              return;
            }
            resolve({ publicId: result.public_id, secureUrl: result.secure_url });
          },
        );
      });

      return { key: result.publicId, url: result.secureUrl };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(503, ErrorCodes.DEPENDENCY_UNAVAILABLE, "Cloudinary upload failed");
    }
  }

  async delete(key: string): Promise<void> {
    if (!this.isConfigured) return;
    await new Promise<void>((resolve) => {
      cloudinary.v2.uploader.destroy(key, (error: unknown) => {
        if (error) resolve();
        else resolve();
      });
    });
  }

  async getSignedUrl(key: string, expiresInMs: number = SIGNED_URL_TTL_MS): Promise<string> {
    if (!this.isConfigured) {
      return `mock-signed-url/${encodeURIComponent(key)}?expires=${Math.round(Date.now() + expiresInMs)}`;
    }
    return cloudinary.v2.utils.private_download_url(key, "jpg", {
      expires_at: Math.round(Date.now() / 1000) + Math.round(expiresInMs / 1000),
    });
  }

  async getPresignedUploadUrl(_key: string, _contentType: string, _expiresInMs?: number): Promise<{ url: string }> {
    throw new AppError(503, ErrorCodes.DEPENDENCY_UNAVAILABLE, "Presigned upload is not enabled");
  }
}