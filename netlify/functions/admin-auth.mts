import type { Context } from "@netlify/functions";
import { assertMethod, assertSameOrigin, handleError, HttpError, json, readJson } from "./_lib/http.js";
import {
  authenticateAdmin,
  clearAdminCookie,
  createAdminCookie,
  enforceRateLimit,
  requireAdmin,
} from "./_lib/security.js";
export default async (request: Request, _context: Context) => {
  try {
    assertMethod(request, "GET", "POST", "DELETE");
    if (request.method === "GET") {
      await requireAdmin(request);
      return json({ authenticated: true });
    }
    assertSameOrigin(request);
    if (request.method === "DELETE") {
      return json({ authenticated: false }, 200, { "set-cookie": clearAdminCookie() });
    }
    await enforceRateLimit(request, "admin-login", 8, 15 * 60);
    const body = await readJson<{ pin?: string }>(request);
    const pin = typeof body.pin === "string" ? body.pin : "";
    if (!(await authenticateAdmin(pin))) {
      throw new HttpError(401, "LOGIN_FAILED", "Die PIN ist nicht korrekt.");
    }
    return json(
      { authenticated: true },
      200,
      { "set-cookie": await createAdminCookie() },
    );
  } catch (error) {
    return handleError(error, "admin-auth");
  }
};
