#!/usr/bin/env node
/**
 * Prepares the landing poster's source picture.
 *
 *   npm run prep:art
 *
 * Fetches Gustave Doré's Paradiso, Canto XXXI (1868, public domain, via
 * Wikimedia Commons), trims the plate border, and writes a small greyscale WebP
 * the poster samples cell by cell at runtime. The output is committed, so the
 * build never needs the network; run this only to change the crop or tone.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import sharp from 'sharp';

const SOURCE = 'https://upload.wikimedia.org/wikipedia/commons/d/d2/Paradiso_Canto_31.jpg';
const OUT = 'public/art/paradiso-31.webp';
const WIDTH = 420;
/** Fraction trimmed from each edge, to lose the plate line and the paper. */
const TRIM = 0.012;

const res = await fetch(SOURCE, { headers: { 'User-Agent': 'personal-site prep-hero-art (https://sqhh99.dev)' } });
if (!res.ok) {
  console.error(`Fetch failed: ${res.status} ${res.statusText}`);
  process.exit(1);
}
const input = Buffer.from(await res.arrayBuffer());
const meta = await sharp(input).metadata();
const w = meta.width ?? 0;
const h = meta.height ?? 0;
const dx = Math.round(w * TRIM);
const dy = Math.round(h * TRIM);

const img = await sharp(input)
  .extract({ left: dx, top: dy, width: w - dx * 2, height: h - dy * 2 })
  .grayscale()
  .normalise({ lower: 1, upper: 99.5 })
  .resize({ width: WIDTH })
  .toColourspace('b-w')
  .webp({ quality: 82, effort: 6 })
  .toBuffer();

await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, img);
const out = await sharp(img).metadata();
console.log(`Wrote ${OUT}: ${out.width}×${out.height}, ${(img.length / 1024).toFixed(1)} KB`);
