import type { Context } from "@netlify/functions";
import { EVENT } from "./_lib/config.js";
import { listMedia } from "./_lib/data.js";
import { assertMethod, handleError, json } from "./_lib/http.js";
import { signDownload } from "./_lib/s3.js";

function decodeCursor(value: string | null): number {
  if (!value) return 0;
  try {
    const parsed = Number(Buffer.from(value, "base64url").toString("utf8"));
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
  } catch {
    return 0;
  }
}

export default async (request: Request, _context: Context) => {
  try {
    assertMethod(request, "GET");
    const url = new URL(request.url);
    const offset = decodeCursor(url.searchParams.get("cursor"));
    const all = (await listMedia()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const page = all.slice(offset, offset + EVENT.galleryPageSize);
    const items = await Promise.all(page.map(async (item) => {
      const previewUrl = item.previewKey ? item.storage === "netlify" ? `/api/media-file?id=${item.id}&asset=preview` : await signDownload(item.previewKey, "inline", `${item.id}.webp`) : null;
      const viewUrl = item.kind === "video" ? item.storage === "netlify" ? `/api/media-file?id=${item.id}&asset=original` : await signDownload(item.originalKey, "inline", item.originalName) : previewUrl;
      return {
        id: item.id,
        kind: item.kind,
        mimeType: item.mimeType,
        size: item.size,
        createdAt: item.createdAt,
        previewUrl,
        viewUrl,
        width: item.width,
        height: item.height,
      };
    }));
    const nextOffset = offset + page.length;
    return json(
      { items, nextCursor: nextOffset < all.length ? Buffer.from(String(nextOffset)).toString("base64url") : null },
      200,
      { "cache-control": "public, max-age=15, stale-while-revalidate=30" },
    );
  } catch (error) {
    return handleError(error, "gallery");
  }
};
