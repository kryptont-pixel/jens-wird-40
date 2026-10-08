import { classifyMime, EVENT, maxBytesFor } from "./config.js";
import type { MediaKind, UploadSession } from "./model.js";
import { HttpError } from "./http.js";

export interface UploadSpec {
  name: string;
  size: number;
  type: string;
  wantsPreview?: boolean;
}

export interface ValidUploadSpec extends UploadSpec {
  kind: MediaKind;
  wantsPreview: boolean;
}

export function validateUploadSpec(spec: UploadSpec): ValidUploadSpec {
  if (!spec || typeof spec.name !== "string" || typeof spec.type !== "string") {
    throw new HttpError(400, "INVALID_FILE", "Die Dateiangaben sind ungültig.");
  }
  const kind = classifyMime(spec.type);
  if (!kind) throw new HttpError(415, "TYPE_NOT_ALLOWED", "Dieser Dateityp wird nicht unterstützt.");
  if (!Number.isSafeInteger(spec.size) || spec.size <= 0) {
    throw new HttpError(400, "INVALID_SIZE", "Die Dateigröße ist ungültig.");
  }
  if (spec.size > maxBytesFor(kind)) {
    const limit = kind === "image" ? "50 MB" : "2 GB";
    throw new HttpError(413, "FILE_TOO_LARGE", `Die Datei ist größer als ${limit}.`);
  }
  const previewRequired = kind === "image" && !["image/heic", "image/heif"].includes(spec.type);
  if (previewRequired && spec.wantsPreview !== true) {
    throw new HttpError(400, "PREVIEW_REQUIRED", "Für dieses Bild konnte keine Vorschau vorbereitet werden.");
  }
  return { ...spec, kind, wantsPreview: spec.wantsPreview === true };
}

const SAFE_KEY = /^(originals|previews)\/\d{4}\/\d{2}\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp|gif|heic|heif|mp4|mov|webm)$/i;

export function isSafeObjectKey(key: string): boolean {
  return SAFE_KEY.test(key) && !key.includes("..") && !key.startsWith("/");
}

export function assertSafeObjectKey(key: string): void {
  if (!isSafeObjectKey(key)) throw new HttpError(400, "INVALID_OBJECT_KEY", "Der Speicherpfad ist ungültig.");
}

export function assertUploadOwnership(session: UploadSession, tokenSubject: string, requestedKey?: string): void {
  if (session.id !== tokenSubject) throw new HttpError(403, "FOREIGN_UPLOAD", "Diese Upload-Sitzung gehört nicht zu dieser Anfrage.");
  if (requestedKey && requestedKey !== session.originalKey) {
    throw new HttpError(403, "FOREIGN_UPLOAD", "Ein fremder Speicherpfad kann nicht verwendet werden.");
  }
  assertSafeObjectKey(session.originalKey);
  if (session.previewKey) assertSafeObjectKey(session.previewKey);
}

export function sanitizePlainText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value
    .normalize("NFKC")
    // Kontrollzeichen werden bewusst aus öffentlichen Texteingaben entfernt.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/[<>]/g, "")
    .replace(/\r\n?/g, "\n")
    .trim()
    .slice(0, maxLength);
}

export function validateDimensions(width: unknown, height: unknown): { width?: number; height?: number } {
  const valid = (v: unknown) => Number.isInteger(v) && Number(v) > 0 && Number(v) <= 50_000;
  return valid(width) && valid(height) ? { width: Number(width), height: Number(height) } : {};
}

export const LIMITS = EVENT;
