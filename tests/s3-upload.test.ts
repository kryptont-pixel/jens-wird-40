import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("Hetzner upload metadata", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("HETZNER_S3_REGION", "nbg1");
    vi.stubEnv("HETZNER_S3_ENDPOINT", "https://nbg1.your-objectstorage.com");
    vi.stubEnv("HETZNER_S3_BUCKET", "test-bucket");
    vi.stubEnv("HETZNER_S3_ACCESS_KEY", "test-access-key");
    vi.stubEnv("HETZNER_S3_SECRET_KEY", "test-secret-key");
  });
  afterEach(() => vi.unstubAllEnvs());

  it.each([
    ["originals/2026/10/11111111-1111-4111-8111-111111111111.jpg", "image/jpeg"],
    ["previews/2026/10/22222222-2222-4222-8222-222222222222.webp", "image/webp"],
  ])("transmits session metadata only once for %s", async (key, type) => {
    const { signSingleUpload } = await import("../netlify/functions/_lib/s3.js");
    const sessionId = "33333333-3333-4333-8333-333333333333";
    const signed = await signSingleUpload(key, type, sessionId);
    const url = new URL(signed.url);
    expect(url.searchParams.getAll("x-amz-meta-upload-session")).toEqual([sessionId]);
    expect(Object.keys(signed.headers).filter(name => name.toLowerCase() === "x-amz-meta-upload-session")).toHaveLength(0);
    expect(signed.headers["content-type"]).toBe(type);
    expect(signed.headers["if-none-match"]).toBe("*");
    expect(url.searchParams.get("X-Amz-SignedHeaders")?.split(";")).toEqual(expect.arrayContaining(["content-type", "if-none-match"]));
    expect(url.searchParams.get("X-Amz-Expires")).toBe("600");
  });
});
