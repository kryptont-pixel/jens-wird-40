import type { Context } from "@netlify/functions";
import { getUploadSession, setUploadSession } from "./_lib/data.js";
import { assertMethod, assertSameOrigin, handleError, HttpError, json, readJson } from "./_lib/http.js";
import { requireUploadToken } from "./_lib/security.js";
import { abortMultipart, deleteObjects } from "./_lib/s3.js";
import { assertUploadOwnership } from "./_lib/validation.js";

export default async (request: Request, _context: Context) => {
  try {
    assertMethod(request, "POST");
    assertSameOrigin(request);
    const body = await readJson<{ sessionId: string }>(request);
    const subject = await requireUploadToken(request, body.sessionId);
    const session = await getUploadSession(body.sessionId);
    if (!session) return json({ ok: true });
    assertUploadOwnership(session, subject);
    if (session.status === "ready") throw new HttpError(409, "ALREADY_FINALIZED", "Der Upload ist bereits abgeschlossen.");
    if (session.multipartUploadId && session.mode === "multipart") {
      await abortMultipart(session.originalKey, session.multipartUploadId).catch((error) => console.warn("Abort multipart", error));
    }
    await deleteObjects([session.originalKey, session.previewKey]);
    await setUploadSession({ ...session, status: "aborted" });
    return json({ ok: true });
  } catch (error) {
    return handleError(error, "upload-abort");
  }
};
