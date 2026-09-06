import {
  ALLOWED_MIME_TYPES,
  EVENT,
  IMAGE_MIME_TYPES,
  VIDEO_MIME_TYPES,
} from "../../../src/config/event.js";
import type { MediaKind } from "./model.js";

export { EVENT };

const allowed = new Set<string>(ALLOWED_MIME_TYPES);
const images = new Set<string>(IMAGE_MIME_TYPES);
const videos = new Set<string>(VIDEO_MIME_TYPES);

export function classifyMime(mimeType: string): MediaKind | null {
  if (!allowed.has(mimeType)) return null;
  if (images.has(mimeType)) return "image";
  if (videos.has(mimeType)) return "video";
  return null;
}

export function maxBytesFor(kind: MediaKind): number {
  return kind === "image" ? EVENT.maxImageBytes : EVENT.maxVideoBytes;
}

export function extensionFor(mimeType: string): string {
  const extensions: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/heic": "heic",
    "image/heif": "heif",
    "video/mp4": "mp4",
    "video/quicktime": "mov",
    "video/webm": "webm",
  };
  return extensions[mimeType] ?? "bin";
}

export function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Serverkonfiguration fehlt: ${name}`);
  return value;
}

export function isProduction(): boolean {
  return process.env.CONTEXT === "production";
}
