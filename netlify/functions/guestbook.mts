import type { Context } from "@netlify/functions";
import { EVENT } from "./_lib/config.js";
import { guestbookStore, listGuestbook } from "./_lib/data.js";
import { assertMethod, assertSameOrigin, handleError, HttpError, json, readJson } from "./_lib/http.js";
import { enforceRateLimit, getOrCreateGuest } from "./_lib/security.js";
import { sanitizePlainText } from "./_lib/validation.js";
import type { GuestbookRecord } from "./_lib/model.js";

function publicEntry(entry: GuestbookRecord) {
  return {
    id: entry.id,
    createdAt: entry.createdAt,
    name: entry.name,
    message: entry.message,
  };
}

export default async (request: Request, _context: Context) => {
  try {
    assertMethod(request, "GET", "POST");
    const guest = await getOrCreateGuest(request);
    if (request.method === "GET") {
      const entries = (await listGuestbook())
        .filter((entry) => entry.ownerGuestId === guest.id)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 200)
        .map(publicEntry);
      return json({ entries }, 200, {
        "cache-control": "private, no-store",
        ...(guest.cookie ? { "set-cookie": guest.cookie } : {}),
      });
    }

    assertSameOrigin(request);
    const body = await readJson<{ name?: string; message?: string }>(request);
    await enforceRateLimit(request, "guestbook", 5, 30 * 60);
    const name = sanitizePlainText(body.name, 60);
    const message = sanitizePlainText(body.message, EVENT.guestbookMaxChars);
    if (message.length < 2) throw new HttpError(400, "MESSAGE_REQUIRED", "Bitte schreibe mindestens zwei Zeichen.");
    const record: GuestbookRecord = {
      id: crypto.randomUUID(),
      ownerGuestId: guest.id,
      createdAt: new Date().toISOString(),
      name: name || null,
      message,
    };
    await guestbookStore().setJSON(record.id, record);
    return json(
      { entry: publicEntry(record), message: "Danke für deinen Gruß! 🎉" },
      201,
      guest.cookie ? { "set-cookie": guest.cookie } : {},
    );
  } catch (error) {
    return handleError(error, "guestbook");
  }
};
