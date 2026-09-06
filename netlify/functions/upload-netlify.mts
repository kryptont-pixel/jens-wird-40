import type { Context } from "@netlify/functions";
import { mediaBinaryStore, getUploadSession } from "./_lib/data.js";
import { assertMethod, assertSameOrigin, handleError, HttpError, json } from "./_lib/http.js";
import { NETLIFY_PART_BYTES, netlifyBlobKey } from "./_lib/config.js";
import { requireUploadToken } from "./_lib/security.js";
import { assertUploadOwnership } from "./_lib/validation.js";

export default async (request: Request, _context: Context) => {
  try {
    assertMethod(request, "PUT");
    assertSameOrigin(request);
    const url = new URL(request.url);
    const sessionId = url.searchParams.get("sessionId") ?? "";
    const kind = url.searchParams.get("kind");
    const partNumber = Number(url.searchParams.get("partNumber"));
    if (!/^[0-9a-f-]{36}$/i.test(sessionId) || (kind !== "original" && kind !== "preview") || !Number.isInteger(partNumber) || partNumber < 1) {
      throw new HttpError(400, "INVALID_NETLIFY_UPLOAD", "Die Netlify-Uploaddaten sind ungültig.");
    }
    const subject = await requireUploadToken(request, sessionId);
    const session = await getUploadSession(sessionId);
    if (!session) throw new HttpError(404, "UPLOAD_NOT_FOUND", "Die Upload-Sitzung wurde nicht gefunden.");
    assertUploadOwnership(session, subject);
    if (session.storage !== "netlify" || session.mode !== "netlify" || session.status !== "uploading") {
      throw new HttpError(409, "UPLOAD_NOT_ACTIVE", "Dieser Netlify-Upload ist nicht mehr aktiv.");
    }
    if (kind === "preview" && (!session.expectedPreview || partNumber !== 1)) {
      throw new HttpError(400, "INVALID_PREVIEW_PART", "Die Bildvorschau ist ungültig.");
    }
    if (kind === "original" && (!session.totalParts || partNumber > session.totalParts)) {
      throw new HttpError(400, "INVALID_PART", "Der Upload-Teil ist ungültig.");
    }
    const declaredLength = Number(request.headers.get("content-length") ?? 0);
    if (declaredLength > NETLIFY_PART_BYTES) throw new HttpError(413, "PART_TOO_LARGE", "Dieser Upload-Teil ist zu groß.");
    const data = await request.arrayBuffer();
    if (!data.byteLength || data.byteLength > NETLIFY_PART_BYTES) throw new HttpError(413, "PART_TOO_LARGE", "Dieser Upload-Teil ist zu groß.");
    const key = netlifyBlobKey(kind, session.id, partNumber);
    await mediaBinaryStore().set(key, data, {
      metadata: {
        "upload-session": session.id,
        "content-type": kind === "preview" ? "image/webp" : session.mimeType,
      },
    });
    return json({ ok: true });
  } catch (error) {
    return handleError(error, "upload-netlify");
  }
};
