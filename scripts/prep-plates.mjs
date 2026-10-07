#!/usr/bin/env node
/**
 * Prepares the seven plates of the landing's descent.
 *
 *   npm run prep:art                 # write public/plates/*.jpg
 *   npm run prep:art -- --sheet out.png
 *                                    # …and a contact sheet of the plates as
 *                                    #    the page prints them (umber dither)
 *
 * Every plate is a Gustave Doré wood engraving, public domain, fetched from
 * Wikimedia Commons. Each is cropped to lose its border and caption, made
 * grey, stretched to the full range and written as a one-channel JPEG (which
 * beats WebP on engraved line) that the page dithers at runtime. The output
 * is committed, so the build never needs the network; run this only to
 * change a plate, a crop or a tone.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

/** The levels, top to bottom, in the old order of the planets — shared with
 *  the page, which reads the same file for credits, focus and tone. The
 *  printed border and caption are found and cut away (see `findPlate`). */
const PLATES = JSON.parse(await readFile(new URL('../src/lib/descent/plates.json', import.meta.url), 'utf8'));

const WIDTH = 900;
const UA = 'personal-site prep-plates (https://github.com/Sqhh99/personal-site)';
const OUT = 'public/plates';

const sheetArg = process.argv.indexOf('--sheet');
const sheetPath = sheetArg > 0 ? process.argv[sheetArg + 1] : null;

async function fetchPlate(file) {
  const url = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}`;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (res.ok) return Buffer.from(await res.arrayBuffer());
    console.warn(`  ${res.status} for ${file}, retrying`);
    await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
  }
  throw new Error(`Could not fetch ${file}`);
}

/** The page's own print (`src/lib/descent/gl.ts`): 8×8 Bayer, two inks, the
 *  plate's tone curve. Used only for the contact sheet. */
const BAYER8 = (() => {
  const m = [[0]];
  let out = m;
  for (let n = 1; n < 8; n *= 2) {
    const next = [];
    for (let y = 0; y < n * 2; y += 1) {
      next.push([]);
      for (let x = 0; x < n * 2; x += 1) {
        const q = [0, 2, 3, 1][(y >= n ? 2 : 0) + (x >= n ? 1 : 0)];
        next[y].push(4 * out[y % n][x % n] + q);
      }
    }
    out = next;
  }
  return out.map((row) => row.map((v) => (v + 0.5) / 64));
})();

async function ditherPreview(buf, w, [lo, hi, gamma]) {
  const { data, info } = await sharp(buf).resize({ width: w }).extractChannel(0).raw().toBuffer({ resolveWithObject: true });
  const rgb = Buffer.alloc(info.width * info.height * 3);
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const l = Math.min(1, Math.max(0, (data[y * info.width + x] / 255 - lo) / (hi - lo)));
      const lit = Math.pow(l, gamma) > BAYER8[y % 8][x % 8];
      const c = lit ? [0x9a, 0x82, 0x64] : [0x11, 0x0e, 0x0b];
      rgb.set(c, (y * info.width + x) * 3);
    }
  }
  return sharp(rgb, { raw: { width: info.width, height: info.height, channels: 3 } }).png().toBuffer();
}

/**
 * The engraved rectangle inside a scan: the longest run of rows, and of
 * columns, darker on average than the paper round it. The caption and the
 * margins are paper with a little type, so they fall out; a small inset then
 * loses the ruled line round the plate.
 */
async function findPlate(input) {
  const { data, info } = await sharp(input).grayscale().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const rows = new Float64Array(h);
  const cols = new Float64Array(w);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const v = data[y * w + x];
      rows[y] += v / w;
      cols[x] += v / h;
    }
  }
  const run = (means, n) => {
    let best = [0, n];
    let bestLen = 0;
    let start = -1;
    for (let i = 0; i <= n; i += 1) {
      const dark = i < n && means[i] < 200;
      if (dark && start < 0) start = i;
      if (!dark && start >= 0) {
        if (i - start > bestLen) {
          bestLen = i - start;
          best = [start, i];
        }
        start = -1;
      }
    }
    return best;
  };
  const [y0, y1] = run(rows, h);
  const [x0, x1] = run(cols, w);
  const inset = Math.round(Math.min(x1 - x0, y1 - y0) * 0.015);
  return { left: x0 + inset, top: y0 + inset, width: x1 - x0 - inset * 2, height: y1 - y0 - inset * 2 };
}

await mkdir(OUT, { recursive: true });
const previews = [];
for (const plate of PLATES) {
  const input = await fetchPlate(plate.file);
  const box = await findPlate(input);
  const img = await sharp(input)
    .extract(box)
    .grayscale()
    .resize({ width: WIDTH })
    .normalise({ lower: 0.5, upper: 99.8 })
    // A breath of blur: the page prints about one cell per pixel, so hatching
    // finer than that would only be noise in the file.
    .blur(0.5)
    .toColourspace('b-w')
    .jpeg({ quality: 68, mozjpeg: true })
    .toBuffer();
  const out = `${OUT}/${plate.id}.jpg`;
  await writeFile(out, img);
  const m = await sharp(img).metadata();
  console.log(`${out}: ${m.width}×${m.height}, ${(img.length / 1024).toFixed(0)} KB (plate ${box.width}×${box.height}+${box.left}+${box.top})`);
  if (sheetPath) previews.push(await ditherPreview(img, 600, plate.tone));
  await new Promise((r) => setTimeout(r, 800));
}

if (sheetPath) {
  const metas = await Promise.all(previews.map((p) => sharp(p).metadata()));
  const h = Math.max(...metas.map((m) => m.height));
  const sheet = await sharp({ create: { width: 600 * previews.length, height: h, channels: 3, background: '#110e0b' } })
    .composite(previews.map((input, i) => ({ input, left: i * 600, top: 0 })))
    .png()
    .toBuffer();
  await writeFile(sheetPath, sheet);
  console.log(`Wrote ${sheetPath}`);
}
