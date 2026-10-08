import type { Context } from "@netlify/functions";
import { assertMethod, handleError, json } from "./_lib/http.js";
import { getOrCreateGuest } from "./_lib/security.js";

export default async (request: Request, _context: Context) => {
  try {
    assertMethod(request, "GET");
    const guest = await getOrCreateGuest(request);
    return json(
      { ok: true },
      200,
      {
        "cache-control": "private, no-store",
        ...(guest.cookie ? { "set-cookie": guest.cookie } : {}),
      },
    );
  } catch (error) {
    return handleError(error, "guest-session");
  }
};
