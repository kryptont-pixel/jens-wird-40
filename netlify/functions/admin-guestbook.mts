import type { Context } from "@netlify/functions";
import { guestbookStore, listGuestbook } from "./_lib/data.js";
import { assertMethod, assertSameOrigin, handleError, HttpError, json, readJson } from "./_lib/http.js";
import { requireAdmin } from "./_lib/security.js";

export default async (request: Request, _context: Context) => {
  try {
    assertMethod(request, "GET", "DELETE");
    await requireAdmin(request);
    if (request.method === "GET") {
      const entries = (await listGuestbook()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return json({ entries });
    }
    assertSameOrigin(request);
    const body = await readJson<{ ids?: string[] }>(request);
    const ids = Array.isArray(body.ids) ? [...new Set(body.ids)] : [];
    if (!ids.length || ids.length > 100 || ids.some((id) => !/^[0-9a-f-]{36}$/i.test(id))) {
      throw new HttpError(400, "INVALID_SELECTION", "Die Auswahl ist ungültig.");
    }
    await Promise.all(ids.map((id) => guestbookStore().delete(id)));
    return json({ deleted: ids });
  } catch (error) {
    return handleError(error, "admin-guestbook");
  }
};
