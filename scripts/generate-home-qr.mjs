import { mkdir } from "node:fs/promises";
import QRCode from "qrcode";

const base = (process.env.VITE_PUBLIC_SITE_URL || process.env.PUBLIC_SITE_URL || "https://example.invalid").replace(/\/$/, "");
const target = `${base}/`;
const parsed = new URL(target);
if (!/^https?:$/.test(parsed.protocol)) throw new Error("Die Website-URL muss mit http:// oder https:// beginnen.");

await mkdir("public/qr", { recursive: true });
const common = { errorCorrectionLevel: "H", margin: 4, color: { dark: "#07111FFF", light: "#FFFFFFFF" } };
await QRCode.toFile("public/qr/jens-home.svg", target, { ...common, type: "svg", width: 1024 });
await QRCode.toFile("public/qr/jens-home.png", target, { ...common, type: "png", width: 1600 });
await QRCode.toFile("public/qr/jens-home-print.svg", target, { ...common, type: "svg", width: 2400, margin: 6 });
await QRCode.toFile("public/qr/jens-home-print.png", target, { ...common, type: "png", width: 2400, margin: 6 });

if (base === "https://example.invalid") console.warn("Hinweis: Platzhalter-QR erzeugt. Vor dem Druck VITE_PUBLIC_SITE_URL setzen und erneut ausführen.");
console.log(`QR-Code erzeugt: ${target}`);
