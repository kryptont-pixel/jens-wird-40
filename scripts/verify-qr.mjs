import { readFile } from "node:fs/promises";
import jsQR from "jsqr";
import { PNG } from "pngjs";

const png = PNG.sync.read(await readFile("public/qr/jens-upload.png"));
const result = jsQR(new Uint8ClampedArray(png.data), png.width, png.height, { inversionAttempts: "dontInvert" });
if (!result?.data) throw new Error("Der QR-Code konnte nicht gelesen werden.");
const expectedBase = (process.env.VITE_PUBLIC_SITE_URL || process.env.PUBLIC_SITE_URL || "https://example.invalid").replace(/\/$/, "");
const expected = `${expectedBase}/upload`;
if (result.data !== expected) throw new Error(`Der QR-Code enthält '${result.data}', erwartet wurde '${expected}'.`);
console.log(`QR-Code erfolgreich gelesen: ${result.data}`);
