import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  deleteBlob: vi.fn(),
  deleteObjects: vi.fn(),
  rateGet: vi.fn(async () => null),
  rateSet: vi.fn(async () => undefined),
}));
vi.mock("../netlify/functions/_lib/data.js", () => ({
  getMedia: vi.fn(async () => ({
    id: "5b8a7d70-9c32-4ce8-8f21-226ea44e07dd",
    originalKey: "originals/2026/10/5b8a7d70-9c32-4ce8-8f21-226ea44e07dd.jpg",
    previewKey: "previews/2026/10/6b8a7d70-9c32-4ce8-8f21-226ea44e07dd.webp",
  })),
  listMedia: vi.fn(async () => []),
  mediaStore: () => ({ delete: mocks.deleteBlob }),
  rateStore: () => ({ get: mocks.rateGet, setJSON: mocks.rateSet }),
}));
vi.mock("../netlify/functions/_lib/s3.js", () => ({ deleteObjects: mocks.deleteObjects, signDownload: vi.fn() }));

import adminMedia from "../netlify/functions/admin-media.mts";
import adminAuth from "../netlify/functions/admin-auth.mts";
import { authenticateAdmin, createAdminCookie } from "../netlify/functions/_lib/security.js";
import { SignJWT } from "jose";

describe("Adminrechte", () => {
  beforeEach(() => {
    process.env.SESSION_SECRET = "x".repeat(40);
    process.env.ADMIN_PIN_HASH = "$2b$04$CQvt4DLkimPSltQBcjALJuWNivyC7z6LVlK8dGb89buOMEzPyW31.";
    process.env.CONTEXT = "dev";
    mocks.deleteBlob.mockReset();
    mocks.deleteObjects.mockReset();
    mocks.rateGet.mockClear();
    mocks.rateSet.mockClear();
  });

  it("lässt Gäste niemals Medien löschen", async () => {
    const response = await adminMedia(new Request("http://localhost/api/admin-media", { method: "DELETE", body: JSON.stringify({ ids: ["5b8a7d70-9c32-4ce8-8f21-226ea44e07dd"] }) }), {} as never);
    expect(response.status).toBe(401);
    expect(mocks.deleteObjects).not.toHaveBeenCalled();
  });

  it("lässt Gäste keine Admin-Endpunkte lesen", async () => {
    const response = await adminMedia(new Request("http://localhost/api/admin-media"), {} as never);
    expect(response.status).toBe(401);
  });

  it("akzeptiert ausschließlich die konfigurierte sechsstellige PIN", async () => {
    await expect(authenticateAdmin("123456")).resolves.toBe(true);
    await expect(authenticateAdmin("654321")).resolves.toBe(false);
    await expect(authenticateAdmin("12345")).resolves.toBe(false);
  });

  it("meldet den Admin allein mit der PIN an", async () => {
    const response = await adminAuth(new Request("http://localhost/api/admin-auth", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost" },
      body: JSON.stringify({ pin: "123456" }),
    }), {} as never);
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("jens_admin=");
    await expect(response.json()).resolves.toEqual({ authenticated: true });
  });

  it("weist eine abgelaufene Adminsitzung zurück", async () => {
    const expired = await new SignJWT({ scope: "admin" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("party-admin")
      .setExpirationTime("1 second ago")
      .sign(new TextEncoder().encode(process.env.SESSION_SECRET));
    const response = await adminMedia(new Request("http://localhost/api/admin-media", { headers: { cookie: `jens_admin=${expired}` } }), {} as never);
    expect(response.status).toBe(401);
  });

  it("erlaubt einem authentifizierten Admin das vollständige Löschen", async () => {
    const cookie = await createAdminCookie();
    const response = await adminMedia(new Request("http://localhost/api/admin-media", {
      method: "DELETE",
      headers: { cookie },
      body: JSON.stringify({ ids: ["5b8a7d70-9c32-4ce8-8f21-226ea44e07dd"] }),
    }), {} as never);
    expect(response.status).toBe(200);
    expect(mocks.deleteObjects).toHaveBeenCalledOnce();
    expect(mocks.deleteBlob).toHaveBeenCalledOnce();
  });
});
