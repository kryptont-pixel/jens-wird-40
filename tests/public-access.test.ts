import { describe, expect, it, vi } from "vitest";

vi.mock("../netlify/functions/_lib/data.js", () => ({
  listMedia: vi.fn(async () => []),
  listGuestbook: vi.fn(async () => []),
  guestbookStore: () => ({ setJSON: vi.fn() }),
  rateStore: () => ({ get: vi.fn(async () => null), setJSON: vi.fn() }),
}));
vi.mock("../netlify/functions/_lib/s3.js", () => ({ signDownload: vi.fn() }));

import gallery from "../netlify/functions/gallery.mts";
import guestbook from "../netlify/functions/guestbook.mts";

describe("Öffentliche Bereiche", () => {
  it("lässt Gäste die Galerie lesen", async () => {
    const response = await gallery(new Request("http://localhost/api/gallery"), {} as never);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ items: [], nextCursor: null });
  });

  it("lässt Gäste das Gästebuch lesen", async () => {
    const response = await guestbook(new Request("http://localhost/api/guestbook"), {} as never);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ entries: [] });
  });
});
