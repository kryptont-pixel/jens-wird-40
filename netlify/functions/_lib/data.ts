import { getStore } from "@netlify/blobs";
import type { GuestbookRecord, MediaRecord, UploadSession } from "./model.js";

function store(name: string) {
  return getStore({ name, consistency: "strong" });
}

export const uploadStore = () => store("upload-sessions");
export const mediaStore = () => store("media-metadata");
export const guestbookStore = () => store("guestbook");
export const rateStore = () => store("rate-limits");

export async function getUploadSession(id: string): Promise<UploadSession | null> {
  return uploadStore().get(id, { type: "json" }) as Promise<UploadSession | null>;
}

export async function setUploadSession(session: UploadSession): Promise<void> {
  await uploadStore().setJSON(session.id, session);
}

export async function getMedia(id: string): Promise<MediaRecord | null> {
  return mediaStore().get(id, { type: "json" }) as Promise<MediaRecord | null>;
}

export async function listMedia(): Promise<MediaRecord[]> {
  const { blobs } = await mediaStore().list();
  const records = await Promise.all(blobs.map(({ key }) => getMedia(key)));
  return records.filter((item): item is MediaRecord => Boolean(item?.status === "ready"));
}

export async function getGuestbookEntry(id: string): Promise<GuestbookRecord | null> {
  return guestbookStore().get(id, { type: "json" }) as Promise<GuestbookRecord | null>;
}

export async function listGuestbook(): Promise<GuestbookRecord[]> {
  const { blobs } = await guestbookStore().list();
  const records = await Promise.all(blobs.map(({ key }) => getGuestbookEntry(key)));
  return records.filter((item): item is GuestbookRecord => Boolean(item));
}
