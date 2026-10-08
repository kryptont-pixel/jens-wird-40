import type { Context } from "@netlify/functions";
import { getUploadSession } from "./_lib/data.js";
import { assertMethod, assertSameOrigin, handleError, HttpError, json, readJson } from "./_lib/http.js";
import { requireUploadToken } from "./_lib/security.js";
import { signPart } from "./_lib/s3.js";
import { assertUploadOwnership } from "./_lib/validation.js";

export default async (request: Request, _context: Context) => {
  try {
    assertMethod(request, "POST");
    assertSameOrigin(request);
    const body = await readJson<{ sessionId: string; partNumber: number }>(request);
    const subject = await requireUploadToken(request, body.sessionId);
    const session = await getUploadSession(body.sessionId);
    if (!session) throw new HttpError(404, "UPLOAD_NOT_FOUND", "Die Upload-Sitzung wurde nicht gefunden.");
    assertUploadOwnership(session, subject);
    if (session.status !== "uploading" || session.mode !== "multipart" || !session.multipartUploadId || !session.totalParts) {
      throw new HttpError(409, "UPLOAD_NOT_ACTIVE", "Dieser Upload ist nicht mehr aktiv.");
    }
    if (!Number.isInteger(body.partNumber) || body.partNumber < 1 || body.partNumber > session.totalParts) {
      throw new HttpError(400, "INVALID_PART", "Der Upload-Teil ist ungültig.");
    }
    const url = await signPart(session.originalKey, session.multipartUploadId, body.partNumber);
    return json({ url, expiresIn: 600 });
  } catch (error) {
    return handleError(error, "upload-part");
  }
};
