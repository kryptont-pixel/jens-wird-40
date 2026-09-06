export type MediaKind = "image" | "video";
export type StorageBackend = "hetzner" | "netlify";
export type UploadMode = "single" | "multipart" | "netlify";

export interface UploadSession {
  id: string;
  ownerGuestId: string;
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
  storage?: StorageBackend;
  multipartUploadId: string | null;
  partSize: number | null;
  totalParts: number | null;
  status: "uploading" | "finalizing" | "ready" | "aborted" | "rejected";
  mediaId: string | null;
}

export interface MediaRecord {
  id: string;
  ownerGuestId?: string;
  createdAt: string;
  finalizedAt: string;
  originalName: string;
  originalKey: string;
  previewKey: string | null;
  mimeType: string;
  size: number;
  kind: MediaKind;
  storage?: StorageBackend;
  width?: number;
  height?: number;
  status: "ready";
}

export interface GuestbookRecord {
  id: string;
  ownerGuestId?: string;
  createdAt: string;
  name: string | null;
  message: string;
}
