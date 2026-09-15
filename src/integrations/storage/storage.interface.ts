export interface UploadedFile {
  id: string;
  path: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
}

export interface StorageProvider {
  upload(file: UploadedFile, folder: string): Promise<{ key: string; url: string }>;
  delete(key: string): Promise<void>;
  getSignedUrl(key: string, expiresInMs?: number): Promise<string>;
  getPresignedUploadUrl(key: string, contentType: string, expiresInMs?: number): Promise<{ url: string }>;
}