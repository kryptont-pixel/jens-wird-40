export const EVENT = {
  name: "Jens",
  occasion: "40. Geburtstag",
  date: "2026-10-10T00:00:00+02:00",
  dateLabel: "10.10.2026",
  language: "de",
  maxImageBytes: 50 * 1024 * 1024,
  maxVideoBytes: 2 * 1024 * 1024 * 1024,
  multipartThresholdBytes: 64 * 1024 * 1024,
  multipartPartBytes: 64 * 1024 * 1024,
  guestbookMaxChars: 500,
  galleryPageSize: 24,
  contact: "",
} as const;

export const IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
] as const;

export const VIDEO_MIME_TYPES = [
  "video/mp4",
  "video/quicktime",
  "video/webm",
] as const;

export const ALLOWED_MIME_TYPES = [
  ...IMAGE_MIME_TYPES,
  ...VIDEO_MIME_TYPES,
] as const;
