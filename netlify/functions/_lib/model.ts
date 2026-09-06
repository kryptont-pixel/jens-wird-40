export type MediaKind = "image" | "video";
export type UploadMode = "single" | "multipart";

export interface UploadSession {
  id: string;
  createdAt: string;
  expiresAt: string;
  originalName: string;
  originalKey: string;
  previewKey: string | null;
  expectedPreview: boolean;
  mimeType: string;
  declaredSize: number;
  kind: MediaKind;
  mode: UploadMode;
  multipartUploadId: string | null;
  partSize: number | null;
  totalParts: number | null;
  status: "uploading" | "finalizing" | "ready" | "aborted" | "rejected";
  mediaId: string | null;
}

export interface MediaRecord {
  id: string;
  createdAt: string;
  finalizedAt: string;
  originalName: string;
  originalKey: string;
  previewKey: string | null;
  mimeType: string;
  size: number;
  kind: MediaKind;
  width?: number;
  height?: number;
  status: "ready";
}

export interface GuestbookRecord {
  id: string;
  createdAt: string;
  name: string | null;
  message: string;
}
