import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ setUploadSession: vi.fn() }));
vi.mock("../netlify/functions/_lib/data.js", () => ({
  setUploadSession: mocks.setUploadSession,
  rateStore: () => ({ get: vi.fn(async () => null), setJSON: vi.fn(async () => undefined) }),
}));
vi.mock("../netlify/functions/_lib/s3.js", () => ({
  signSingleUpload: vi.fn(async () => ({ url: "https://storage.example/upload", headers: { "content-type": "image/jpeg" }, expiresIn: 600 })),
  signPart: vi.fn(),
  startMultipart: vi.fn(),
}));

import uploadInit from "../netlify/functions/upload-init.mts";

describe("Upload-Sitzung", () => {
  beforeEach(() => {
    process.env.CONTEXT = "dev";
    process.env.SESSION_SECRET = "x".repeat(40);
    mocks.setUploadSession.mockClear();
  });

  afterEach(() => {
    delete process.env.MEDIA_STORAGE;
  });

  it("erlaubt einem Gast ohne Konto eine echte Upload-Sitzung anzufordern", async () => {
    const response = await uploadInit(new Request("http://localhost/api/upload-init", {
      method: "POST",
      body: JSON.stringify({
        files: [{ name: "party.jpg", size: 2048, type: "image/jpeg", wantsPreview: true }],
      }),
    }), {} as never);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.uploads).toHaveLength(1);
    expect(data.uploads[0].uploadToken).toBeTypeOf("string");
    expect(mocks.setUploadSession).toHaveBeenCalledOnce();
  });

  it("liefert im Netlify-Testbetrieb 4-MB-Uploadteile", async () => {
    process.env.MEDIA_STORAGE = "netlify";
    const response = await uploadInit(new Request("http://localhost/api/upload-init", {
      method: "POST",
      body: JSON.stringify({
        files: [{ name: "party.mp4", size: 5 * 1024 * 1024, type: "video/mp4", wantsPreview: false }],
      }),
    }), {} as never);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.uploads[0].mode).toBe("netlify");
    expect(data.uploads[0].original.partSize).toBe(4 * 1024 * 1024);
    expect(data.uploads[0].original.parts).toHaveLength(2);
  });

  it("weist im Netlify-Testbetrieb Dateien über 20 MB ab", async () => {
    process.env.MEDIA_STORAGE = "netlify";
    const response = await uploadInit(new Request("http://localhost/api/upload-init", {
      method: "POST",
      body: JSON.stringify({
        files: [{ name: "party.mp4", size: 20 * 1024 * 1024 + 1, type: "video/mp4", wantsPreview: false }],
      }),
    }), {} as never);
    expect(response.status).toBe(413);
    expect((await response.json()).error.code).toBe("NETLIFY_FILE_TOO_LARGE");
  });
});
