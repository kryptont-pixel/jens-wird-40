import type { Config, Context } from "@netlify/functions";
import { rateStore, uploadStore } from "./_lib/data.js";
import type { UploadSession } from "./_lib/model.js";
import { abortMultipart, deleteObjects } from "./_lib/s3.js";

export default async (_request: Request, _context: Context) => {
  const now = Date.now();
  const uploads = uploadStore();
  const { blobs } = await uploads.list();
  let cleaned = 0;
  for (const { key } of blobs) {
    const session = (await uploads.get(key, { type: "json" })) as UploadSession | null;
    if (!session) continue;
    const expired = new Date(session.expiresAt).getTime() < now;
    const oldFinished = ["ready", "aborted", "rejected"].includes(session.status) && new Date(session.createdAt).getTime() < now - 7 * 86400_000;
    if (!expired && !oldFinished) continue;
    if (expired && ["uploading", "finalizing"].includes(session.status)) {
      if (session.multipartUploadId) await abortMultipart(session.originalKey, session.multipartUploadId).catch(() => undefined);
      await deleteObjects([session.originalKey, session.previewKey]).catch(() => undefined);
    }
    await uploads.delete(key);
    cleaned += 1;
  }

  const rates = rateStore();
  const rateList = await rates.list();
  for (const { key } of rateList.blobs) {
    const item = (await rates.get(key, { type: "json" })) as { expiresAt?: string } | null;
    if (item?.expiresAt && new Date(item.expiresAt).getTime() < now) await rates.delete(key);
  }
  return Response.json({ cleaned });
};

export const config: Config = { schedule: "@daily" };
