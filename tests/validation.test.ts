import { describe, expect, it } from "vitest";
import { assertUploadOwnership, isSafeObjectKey, sanitizePlainText, validateUploadSpec } from "../netlify/functions/_lib/validation.js";
import type { UploadSession } from "../netlify/functions/_lib/model.js";

describe("Uploadsicherheit", () => {
  it("akzeptiert einen erlaubten Gast-Upload", () => {
    expect(validateUploadSpec({ name: "foto.jpg", size: 1024, type: "image/jpeg", wantsPreview: true }).kind).toBe("image");
  });

  it("lehnt ausführbare und unbekannte Dateitypen ab", () => {
    expect(() => validateUploadSpec({ name: "schadcode.exe", size: 10, type: "application/x-msdownload" })).toThrow(/nicht unterstützt/);
  });

  it("lehnt Bilder über 50 MB ab", () => {
    expect(() => validateUploadSpec({ name: "gross.jpg", size: 50 * 1024 * 1024 + 1, type: "image/jpeg", wantsPreview: true })).toThrow(/50 MB/);
  });

  it("lehnt Videos über 2 GB ab", () => {
    expect(() => validateUploadSpec({ name: "gross.mp4", size: 2 * 1024 * 1024 * 1024 + 1, type: "video/mp4" })).toThrow(/2 GB/);
  });

  it("verhindert Path Traversal und manipulierte Objektpfade", () => {
    expect(isSafeObjectKey("../../secret.env")).toBe(false);
    expect(isSafeObjectKey("originals/2026/10/123.jpg")).toBe(false);
    expect(isSafeObjectKey("originals/2026/10/5b8a7d70-9c32-4ce8-8f21-226ea44e07dd.jpg")).toBe(true);
  });

  it("verhindert die Finalisierung einer fremden Upload-Sitzung", () => {
    const session = {
      id: "own-session",
      originalKey: "originals/2026/10/5b8a7d70-9c32-4ce8-8f21-226ea44e07dd.jpg",
      previewKey: null,
    } as UploadSession;
    expect(() => assertUploadOwnership(session, "foreign-session")).toThrow(/gehört nicht/);
  });

  it("bereinigt Gästebuchtexte gegen HTML- und Script-Injection", () => {
    const value = sanitizePlainText('<script>alert("xss")</script><b>Hallo</b>', 500);
    expect(value).not.toContain("<");
    expect(value).not.toContain(">");
    expect(value).toContain("Hallo");
  });
});
