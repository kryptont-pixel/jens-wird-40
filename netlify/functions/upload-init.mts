import type { Context } from "@netlify/functions";
import { EVENT, extensionFor, mediaStorageBackend, NETLIFY_MAX_FILE_BYTES, NETLIFY_PART_BYTES, netlifyPartCount } from "./_lib/config.js";
import { enforceRateLimit, issueUploadToken } from "./_lib/security.js";
import { assertMethod, assertSameOrigin, handleError, HttpError, json, readJson } from "./_lib/http.js";
import { setUploadSession } from "./_lib/data.js";
import { signPart, signSingleUpload, startMultipart } from "./_lib/s3.js";
import { sanitizePlainText, validateUploadSpec, type UploadSpec } from "./_lib/validation.js";
import type { UploadSession } from "./_lib/model.js";

interface Body {
  files: UploadSpec[];
}

export default async (request: Request, _context: Context) => {
  try {
    assertMethod(request, "POST");
    assertSameOrigin(request);
    const body = await readJson<Body>(request, 128_000);
    await enforceRateLimit(request, "upload-init", 30, 15 * 60);
    if (!Array.isArray(body.files) || body.files.length === 0 || body.files.length > 20) {
      throw new HttpError(400, "INVALID_FILE_COUNT", "Bitte wähle zwischen 1 und 20 Dateien aus.");
    }

    const specs = body.files.map(validateUploadSpec);
    const storage = mediaStorageBackend();
    if (storage === "netlify" && specs.some((spec) => spec.size > NETLIFY_MAX_FILE_BYTES)) {
      throw new HttpError(413, "NETLIFY_FILE_TOO_LARGE", "Im Netlify-Testbetrieb sind Dateien bis 20 MB möglich. Für größere Videos bitte später Hetzner aktivieren.");
    }
    const results = [];
    for (const spec of specs) {
      const id = crypto.randomUUID();
      const createdAt = new Date().toISOString();
      const date = createdAt.slice(0, 7).replace("-", "/");
      const originalKey = `originals/${date}/${crypto.randomUUID()}.${extensionFor(spec.type)}`;
      const previewKey = spec.wantsPreview ? `previews/${date}/${crypto.randomUUID()}.webp` : null;
      const mode = storage === "netlify" ? "netlify" : spec.size > EVENT.multipartThresholdBytes ? "multipart" : "single";
      let multipartUploadId: string | null = null;
      const partSize = mode === "netlify" ? NETLIFY_PART_BYTES : mode === "multipart" ? EVENT.multipartPartBytes : null;
      const totalParts = partSize ? (mode === "netlify" ? netlifyPartCount(spec.size) : Math.ceil(spec.size / partSize)) : null;

      if (mode === "multipart") multipartUploadId = await startMultipart(originalKey, spec.type, id);
      const session: UploadSession = {
        id,
        createdAt,
        expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
        originalName: sanitizePlainText(spec.name, 180).split(/[\\/]/).pop() || "datei",
        originalKey,
        previewKey,
        expectedPreview: Boolean(previewKey),
        mimeType: spec.type,
        declaredSize: spec.size,
        kind: spec.kind,
        mode,
        storage,
        multipartUploadId,
        partSize,
        totalParts,
        status: "uploading",
        mediaId: null,
      };
      await setUploadSession(session);
      const uploadToken = await issueUploadToken(id);
      const original = mode === "netlify"
        ? {
            partSize: NETLIFY_PART_BYTES,
            parts: Array.from({ length: totalParts! }, (_, index) => ({
              partNumber: index + 1,
              url: `/api/upload-netlify?sessionId=${encodeURIComponent(id)}&kind=original&partNumber=${index + 1}`,
            })),
            expiresIn: 7200,
          }
        : mode === "single"
        ? await signSingleUpload(originalKey, spec.type, id)
        : {
            partSize,
            parts: await Promise.all(
              Array.from({ length: totalParts! }, async (_, index) => ({
                partNumber: index + 1,
                url: await signPart(originalKey, multipartUploadId!, index + 1),
              })),
            ),
            expiresIn: 600,
          };
      const preview = previewKey
        ? storage === "netlify"
          ? { url: `/api/upload-netlify?sessionId=${encodeURIComponent(id)}&kind=preview&partNumber=1`, headers: {}, expiresIn: 7200 }
          : await signSingleUpload(previewKey, "image/webp", id)
        : null;
      results.push({ id, uploadToken, mode, original, preview });
    }
    return json({ uploads: results });
  } catch (error) {
    return handleError(error, "upload-init");
  }
};
