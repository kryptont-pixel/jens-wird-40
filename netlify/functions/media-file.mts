import type { Context } from "@netlify/functions";
import { getMedia, mediaBinaryStore } from "./_lib/data.js";
import { NETLIFY_PART_BYTES, netlifyBlobKey, netlifyPartCount } from "./_lib/config.js";
import { assertMethod, handleError, HttpError } from "./_lib/http.js";
import { getGuestId, isAdmin } from "./_lib/security.js";

function safeFilename(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100) || "datei";
}

function parseRange(value: string | null, size: number): { start: number; end: number } | null {
  if (!value) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!match || (!match[1] && !match[2])) throw new HttpError(416, "INVALID_RANGE", "Der angeforderte Medienbereich ist ungültig.");
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  const end = match[2] ? Number(match[2]) : size - 1;
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || start >= size) {
    throw new HttpError(416, "INVALID_RANGE", "Der angeforderte Medienbereich ist ungültig.");
  }
  return { start, end: Math.min(end, size - 1) };
}

async function readRange(id: string, asset: "original" | "preview", size: number, start: number, end: number): Promise<Uint8Array> {
  const firstPart = asset === "preview" ? 1 : Math.floor(start / NETLIFY_PART_BYTES) + 1;
  const lastPart = asset === "preview" ? 1 : Math.min(netlifyPartCount(size), Math.floor(end / NETLIFY_PART_BYTES) + 1);
  const chunks = await Promise.all(Array.from({ length: lastPart - firstPart + 1 }, (_, index) => mediaBinaryStore().get(netlifyBlobKey(asset, id, firstPart + index), { type: "arrayBuffer" })));
  if (chunks.some((chunk) => !chunk)) throw new HttpError(404, "MEDIA_NOT_FOUND", "Die Mediendatei ist nicht verfügbar.");
  const result = new Uint8Array(end - start + 1);
  let resultOffset = 0;
  chunks.forEach((chunk, index) => {
    const bytes = new Uint8Array(chunk);
    const partStart = (firstPart + index - 1) * NETLIFY_PART_BYTES;
    const from = Math.max(start, partStart) - partStart;
    const to = Math.min(end, partStart + bytes.byteLength - 1) - partStart + 1;
    if (to > from) {
      result.set(bytes.subarray(from, to), resultOffset);
      resultOffset += to - from;
    }
  });
  if (resultOffset !== result.byteLength) throw new HttpError(404, "MEDIA_NOT_FOUND", "Die Mediendatei ist nicht verfügbar.");
  return result;
}

export default async (request: Request, _context: Context) => {
  try {
    assertMethod(request, "GET");
    const url = new URL(request.url);
    const id = url.searchParams.get("id") ?? "";
    const asset = url.searchParams.get("asset") === "preview" ? "preview" : url.searchParams.get("asset") === "original" ? "original" : null;
    if (!/^[0-9a-f-]{36}$/i.test(id) || !asset) throw new HttpError(400, "INVALID_MEDIA", "Die Mediendatei ist ungültig.");
    const media = await getMedia(id);
    if (!media || media.status !== "ready" || media.storage !== "netlify") throw new HttpError(404, "MEDIA_NOT_FOUND", "Die Mediendatei ist nicht verfügbar.");
    const [admin, guestId] = await Promise.all([isAdmin(request), getGuestId(request)]);
    if (!admin && (!guestId || media.ownerGuestId !== guestId)) {
      throw new HttpError(404, "MEDIA_NOT_FOUND", "Die Mediendatei ist nicht verfügbar.");
    }
    if (asset === "preview" && !media.previewKey) throw new HttpError(404, "PREVIEW_NOT_FOUND", "Die Vorschau ist nicht verfügbar.");
    const previewData = asset === "preview" ? new Uint8Array(await mediaBinaryStore().get(netlifyBlobKey("preview", id), { type: "arrayBuffer" })) : null;
    const size = asset === "original" ? media.size : previewData?.byteLength ?? 0;
    if (!size) throw new HttpError(404, "MEDIA_NOT_FOUND", "Die Mediendatei ist nicht verfügbar.");
    const range = parseRange(request.headers.get("range"), size);
    const start = range?.start ?? 0;
    const end = range?.end ?? size - 1;
    const bytes = previewData ? previewData.subarray(start, end + 1) : await readRange(id, asset, size, start, end);
    const headers = new Headers({
      "content-type": asset === "preview" ? "image/webp" : media.mimeType,
      "content-length": String(bytes.byteLength),
      "accept-ranges": "bytes",
      "cache-control": "private, no-store",
      "content-disposition": `${url.searchParams.get("download") === "1" ? "attachment" : "inline"}; filename="${safeFilename(asset === "preview" ? `${id}.webp` : media.originalName)}"`,
    });
    if (range) headers.set("content-range", `bytes ${start}-${end}/${size}`);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes);
        controller.close();
      },
    });
    return new Response(stream, { status: range ? 206 : 200, headers });
  } catch (error) {
    return handleError(error, "media-file");
  }
};
