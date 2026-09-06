import type { Context } from "@netlify/functions";
import { deleteNetlifyMedia, getMedia, listMedia, mediaStore } from "./_lib/data.js";
import { assertMethod, assertSameOrigin, handleError, HttpError, json, readJson } from "./_lib/http.js";
import { requireAdmin } from "./_lib/security.js";
import { deleteObjects, signDownload } from "./_lib/s3.js";

export default async (request: Request, _context: Context) => {
  try {
    assertMethod(request, "GET", "DELETE");
    await requireAdmin(request);
    if (request.method === "GET") {
      const all = (await listMedia()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const items = await Promise.all(all.map(async (item) => ({
        id: item.id,
        kind: item.kind,
        mimeType: item.mimeType,
        size: item.size,
        createdAt: item.createdAt,
        originalName: item.originalName,
        status: item.status,
        width: item.width,
        height: item.height,
        previewUrl: item.previewKey ? item.storage === "netlify" ? `/api/media-file?id=${item.id}&asset=preview` : await signDownload(item.previewKey, "inline", `${item.id}.webp`) : null,
        viewUrl: item.kind === "video" ? item.storage === "netlify" ? `/api/media-file?id=${item.id}&asset=original` : await signDownload(item.originalKey, "inline", item.originalName) : null,
        originalViewUrl: item.storage === "netlify" ? `/api/media-file?id=${item.id}&asset=original` : await signDownload(item.originalKey, "inline", item.originalName),
        originalUrl: item.storage === "netlify" ? `/api/media-file?id=${item.id}&asset=original&download=1` : await signDownload(item.originalKey, "attachment", item.originalName),
      })));
      return json({ items });
    }

    assertSameOrigin(request);
    const body = await readJson<{ ids?: string[] }>(request);
    const ids = Array.isArray(body.ids) ? [...new Set(body.ids)] : [];
    if (!ids.length || ids.length > 100 || ids.some((id) => !/^[0-9a-f-]{36}$/i.test(id))) {
      throw new HttpError(400, "INVALID_SELECTION", "Die Dateiauswahl ist ungültig.");
    }
    const deleted: string[] = [];
    const failed: string[] = [];
    for (const id of ids) {
      try {
        const item = await getMedia(id);
        if (!item) continue;
        if (item.storage === "netlify") await deleteNetlifyMedia(item);
        else await deleteObjects([item.originalKey, item.previewKey]);
        await mediaStore().delete(id);
        deleted.push(id);
      } catch (error) {
        console.error(`[admin-media] delete ${id}`, error instanceof Error ? error.message : String(error));
        failed.push(id);
      }
    }
    return json({ deleted, failed }, failed.length ? 207 : 200);
  } catch (error) {
    return handleError(error, "admin-media");
  }
};
