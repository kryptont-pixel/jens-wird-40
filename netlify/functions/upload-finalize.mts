import type { Context } from "@netlify/functions";
import { deleteNetlifyUpload, mediaBinaryStore, mediaStore, getUploadSession, setUploadSession } from "./_lib/data.js";
import { maxBytesFor, NETLIFY_MAX_FILE_BYTES, netlifyBlobKey } from "./_lib/config.js";
import { assertMethod, assertSameOrigin, handleError, HttpError, json, readJson } from "./_lib/http.js";
import { requireUploadToken } from "./_lib/security.js";
import { completeMultipart, deleteObjects, headObject } from "./_lib/s3.js";
import { assertUploadOwnership, validateDimensions } from "./_lib/validation.js";
import type { MediaRecord } from "./_lib/model.js";

interface Body {
  sessionId: string;
  parts?: Array<{ partNumber: number; etag: string }>;
  width?: number;
  height?: number;
}

export default async (request: Request, _context: Context) => {
  try {
    assertMethod(request, "POST");
    assertSameOrigin(request);
    const body = await readJson<Body>(request, 256_000);
    const subject = await requireUploadToken(request, body.sessionId);
    let session = await getUploadSession(body.sessionId);
    if (!session) throw new HttpError(404, "UPLOAD_NOT_FOUND", "Die Upload-Sitzung wurde nicht gefunden.");
    assertUploadOwnership(session, subject);
    if (session.status === "ready" && session.mediaId) return json({ ok: true, mediaId: session.mediaId, alreadyFinalized: true });
    if (!['uploading', 'finalizing'].includes(session.status)) throw new HttpError(409, "UPLOAD_NOT_ACTIVE", "Dieser Upload ist nicht mehr aktiv.");

    session = { ...session, status: "finalizing" };
    await setUploadSession(session);
    if (session.mode === "multipart") {
      if (!session.multipartUploadId || !session.totalParts || !Array.isArray(body.parts)) {
        throw new HttpError(400, "PARTS_MISSING", "Es fehlen Upload-Teile.");
      }
      const sorted = [...body.parts].sort((a, b) => a.partNumber - b.partNumber);
      if (sorted.length !== session.totalParts || sorted.some((part, i) => part.partNumber !== i + 1 || !/^\"?[A-Fa-f0-9-]{8,}\"?$/.test(part.etag))) {
        throw new HttpError(400, "PARTS_INVALID", "Die Liste der Upload-Teile ist ungültig.");
      }
      await completeMultipart(session.originalKey, session.multipartUploadId, sorted.map((part) => ({ PartNumber: part.partNumber, ETag: part.etag }))).catch((error) => {
        // Ein wiederholter Finalisierungsaufruf darf nach bereits erfolgreichem Complete fortfahren.
        console.warn("Multipart-Complete wird über HeadObject verifiziert", error instanceof Error ? error.message : String(error));
      });
    }

    const isNetlify = session.storage === "netlify";
    let actualSize = -1;
    let actualType = "";
    let owner = "";
    if (isNetlify) {
      if (!session.totalParts) throw new HttpError(400, "PARTS_MISSING", "Es fehlen Upload-Teile.");
      const parts = await Promise.all(Array.from({ length: session.totalParts }, (_, index) => mediaBinaryStore().getWithMetadata(netlifyBlobKey("original", session.id, index + 1), { type: "arrayBuffer" })));
      if (parts.some((part) => !part)) {
        await deleteNetlifyUpload(session);
        throw new HttpError(422, "OBJECT_MISMATCH", "Mindestens ein Upload-Teil fehlt.");
      }
      actualSize = parts.reduce((sum, part) => sum + (part?.data.byteLength ?? 0), 0);
      const firstContentType = parts[0]?.metadata?.["content-type"];
      actualType = typeof firstContentType === "string" ? firstContentType : "";
      owner = parts.every((part) => part?.metadata?.["upload-session"] === session.id) ? session.id : "";
    } else {
      const originalHead = await headObject(session.originalKey);
      actualSize = Number(originalHead.ContentLength ?? -1);
      actualType = originalHead.ContentType ?? "";
      owner = originalHead.Metadata?.["upload-session"] ?? "";
    }
    const maxBytes = isNetlify ? NETLIFY_MAX_FILE_BYTES : maxBytesFor(session.kind);
    if (actualSize !== session.declaredSize || actualSize > maxBytes || actualType !== session.mimeType || owner !== session.id) {
      if (isNetlify) await deleteNetlifyUpload(session);
      else await deleteObjects([session.originalKey, session.previewKey]);
      await setUploadSession({ ...session, status: "rejected" });
      throw new HttpError(422, "OBJECT_MISMATCH", "Die hochgeladene Datei stimmt nicht mit den geprüften Dateidaten überein.");
    }
    if (session.expectedPreview && session.previewKey) {
      let previewSize = 0;
      let previewType = "";
      let previewOwner = "";
      if (isNetlify) {
        const preview = await mediaBinaryStore().getWithMetadata(netlifyBlobKey("preview", session.id), { type: "arrayBuffer" });
        previewSize = preview?.data.byteLength ?? 0;
        const previewContentType = preview?.metadata?.["content-type"];
        previewType = typeof previewContentType === "string" ? previewContentType : "";
        const previewUploadSession = preview?.metadata?.["upload-session"];
        previewOwner = typeof previewUploadSession === "string" ? previewUploadSession : "";
      } else {
        const previewHead = await headObject(session.previewKey);
        previewSize = Number(previewHead.ContentLength ?? 0);
        previewType = previewHead.ContentType ?? "";
        previewOwner = previewHead.Metadata?.["upload-session"] ?? "";
      }
      if (previewType !== "image/webp" || previewSize <= 0 || previewSize > 5 * 1024 * 1024 || previewOwner !== session.id) {
        if (isNetlify) await deleteNetlifyUpload(session);
        else await deleteObjects([session.originalKey, session.previewKey]);
        await setUploadSession({ ...session, status: "rejected" });
        throw new HttpError(422, "PREVIEW_INVALID", "Die Bildvorschau ist ungültig.");
      }
    }

    // Die Sitzungs-ID ist zugleich die Medien-ID: parallele Wiederholungen bleiben idempotent.
    const mediaId = session.id;
    const finalizedAt = new Date().toISOString();
    const record: MediaRecord = {
      id: mediaId,
      createdAt: session.createdAt,
      finalizedAt,
      originalName: session.originalName,
      originalKey: session.originalKey,
      previewKey: session.previewKey,
      mimeType: session.mimeType,
      size: actualSize,
      kind: session.kind,
      storage: session.storage ?? "hetzner",
      status: "ready",
      ...validateDimensions(body.width, body.height),
    };
    await mediaStore().setJSON(mediaId, record);
    await setUploadSession({ ...session, status: "ready", mediaId });
    return json({ ok: true, mediaId });
  } catch (error) {
    return handleError(error, "upload-finalize");
  }
};
