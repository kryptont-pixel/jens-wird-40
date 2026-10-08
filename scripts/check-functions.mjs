import { readdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { build } from "esbuild";

const directory = "netlify/functions";
const entries = (await readdir(directory)).filter((file) => /\.(mts|ts)$/.test(file));
const names = new Set();
for (const file of entries) {
  const name = file.replace(/\.(mts|ts)$/, "");
  if (names.has(name)) throw new Error(`Doppelte Netlify Function: ${name}. Nur eine .ts- oder .mts-Datei behalten.`);
  names.add(name);
}
const files = entries.map((file) => resolve(directory, file));
if (!files.length) throw new Error("Keine Netlify Functions gefunden.");
const outdir = resolve("netlify/functions-dist");
await rm(outdir, { recursive: true, force: true });
await build({ entryPoints: files, outdir, absWorkingDir: process.cwd(), bundle: true, platform: "node", format: "esm", target: "node20", sourcemap: false, logLevel: "warning" });
console.log(`${files.length} Netlify Functions erfolgreich gebündelt.`);
