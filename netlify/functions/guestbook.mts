import type { Context } from "@netlify/functions";
import { EVENT } from "./_lib/config.js";
import { guestbookStore, listGuestbook } from "./_lib/data.js";
import { assertMethod, assertSameOrigin, handleError, HttpError, json, readJson } from "./_lib/http.js";
import { enforceRateLimit } from "./_lib/security.js";
import { sanitizePlainText } from "./_lib/validation.js";
import type { GuestbookRecord } from "./_lib/model.js";

export default async (request: Request, _context: Context) => {
  try {
    assertMethod(request, "GET", "POST");
    if (request.method === "GET") {
      const entries = (await listGuestbook())
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 200);
      return json({ entries }, 200, { "cache-control": "public, max-age=15, stale-while-revalidate=30" });
    }

    assertSameOrigin(request);
    const body = await readJson<{ name?: string; message?: string }>(request);
    await enforceRateLimit(request, "guestbook", 5, 30 * 60);
    const name = sanitizePlainText(body.name, 60);
    const message = sanitizePlainText(body.message, EVENT.guestbookMaxChars);
    if (message.length < 2) throw new HttpError(400, "MESSAGE_REQUIRED", "Bitte schreibe mindestens zwei Zeichen.");
    const record: GuestbookRecord = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      name: name || null,
      message,
    };
    await guestbookStore().setJSON(record.id, record);
    return json({ entry: record, message: "Danke für deinen Gruß! 🎉" }, 201);
  } catch (error) {
    return handleError(error, "guestbook");
  }
};
