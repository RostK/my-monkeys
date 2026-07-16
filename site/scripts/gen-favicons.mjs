#!/usr/bin/env node
/**
 * gen-favicons.mjs — rasterize public/favicon.svg into the PNG/ICO favicon set.
 *
 * Dev-only tool. The generated files are committed, so the site build and CI do
 * NOT need this or sharp. Only re-run when the logo changes:
 *
 *   npm run favicons        (requires the `sharp` devDependency)
 *
 * Emits into public/: favicon-96x96.png, apple-touch-icon.png (180),
 * web-app-manifest-192x192.png, web-app-manifest-512x512.png, and favicon.ico
 * (16/32/48, PNG-encoded).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const PUBLIC = resolve(dirname(fileURLToPath(import.meta.url)), "..", "public");
const svg = readFileSync(join(PUBLIC, "favicon.svg"));

const png = (size) => sharp(svg, { density: 384 }).resize(size, size).png().toBuffer();

/** Assemble a PNG-encoded .ico from {size,buf} entries (Vista+ / all modern browsers). */
function buildIco(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);
  let offset = 6 + entries.length * 16;
  const dir = [];
  const data = [];
  for (const { size, buf } of entries) {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0);
    e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt16LE(1, 4); // color planes
    e.writeUInt16LE(32, 6); // bits per pixel
    e.writeUInt32LE(buf.length, 8);
    e.writeUInt32LE(offset, 12);
    dir.push(e);
    data.push(buf);
    offset += buf.length;
  }
  return Buffer.concat([header, ...dir, ...data]);
}

const named = {
  "favicon-96x96.png": 96,
  "apple-touch-icon.png": 180,
  "web-app-manifest-192x192.png": 192,
  "web-app-manifest-512x512.png": 512,
};

for (const [file, size] of Object.entries(named)) {
  writeFileSync(join(PUBLIC, file), await png(size));
  console.log("  wrote", file, `(${size}x${size})`);
}

const icoEntries = await Promise.all([16, 32, 48].map(async (size) => ({ size, buf: await png(size) })));
writeFileSync(join(PUBLIC, "favicon.ico"), buildIco(icoEntries));
console.log("  wrote favicon.ico (16/32/48)");
