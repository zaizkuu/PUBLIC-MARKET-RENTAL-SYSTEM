// Downloads the Google Fonts used by the app into public/fonts/ and emits a
// local @font-face stylesheet, so the app renders with no internet access.
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const OUT_DIR = process.argv[2];
if (!OUT_DIR) throw new Error('usage: node fetch-fonts.mjs <public/fonts dir>');

// Only Latin coverage is needed; dropping Cyrillic/Greek/Vietnamese subsets
// takes Inter from 35 files down to a handful.
const KEEP_SUBSETS = new Set(['latin', 'latin-ext']);

const SOURCES = [
  { name: 'Inter', url: 'https://fonts.googleapis.com/css2?family=Inter:wght@400..800&display=swap', filterSubsets: true },
  { name: 'Material Symbols Outlined', url: 'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0', filterSubsets: false },
];

async function get(url, asBuffer = false) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`${res.status} for ${url}`);
  return asBuffer ? Buffer.from(await res.arrayBuffer()) : res.text();
}

/** Splits the Google CSS into { subset, block } pairs using the /* subset *\/ comments. */
function parseBlocks(css) {
  const out = [];
  const re = /\/\*\s*([a-z0-9-]+)\s*\*\/\s*(@font-face\s*\{[^}]*\})/gi;
  let m;
  while ((m = re.exec(css)) !== null) out.push({ subset: m[1], block: m[2] });
  if (out.length === 0) {
    for (const b of css.match(/@font-face\s*\{[^}]*\}/gi) ?? []) out.push({ subset: 'all', block: b });
  }
  return out;
}

await mkdir(OUT_DIR, { recursive: true });

const pieces = [];
let totalBytes = 0;

for (const src of SOURCES) {
  const css = await get(src.url);
  const blocks = parseBlocks(css).filter((b) => !src.filterSubsets || KEEP_SUBSETS.has(b.subset));
  let i = 0;
  for (const { subset, block } of blocks) {
    const urlMatch = block.match(/url\((https:\/\/[^)]+\.woff2)\)/);
    if (!urlMatch) continue;
    const weightMatch = block.match(/font-weight:\s*([^;]+);/);
    const slug = src.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const file = `${slug}-${subset}-${i++}.woff2`;
    const bytes = await get(urlMatch[1], true);
    await writeFile(path.join(OUT_DIR, file), bytes);
    totalBytes += bytes.length;
    console.log(`  ${file}  ${(bytes.length / 1024).toFixed(0)} KB  [${subset}] ${weightMatch ? weightMatch[1].trim() : ''}`);
    pieces.push(block.replace(urlMatch[0], `url(./${file})`).replace(/^\s*/gm, '  ').trim());
  }
}

// The .material-symbols-outlined rule ships in styles.css already; only the
// @font-face declarations need to live here.
const header = `/* Fonts vendored locally so the app runs fully offline.
   Regenerate with scripts/fetch-fonts.mjs. Do not edit by hand. */\n\n`;
await writeFile(path.join(OUT_DIR, 'fonts.css'), header + pieces.join('\n\n') + '\n');

console.log(`\n${pieces.length} font files, ${(totalBytes / 1024 / 1024).toFixed(2)} MB total`);
