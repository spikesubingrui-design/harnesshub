// catalog.mjs — build a static browsable site from local .harness.json files.
// Emits <out>/catalog.json (the data) and ensures <out>/index.html (the app).

import { readdir, readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const TEMPLATE = fileURLToPath(new URL('../web/index.html', import.meta.url));

async function walk(dir) {
  try { return (await readdir(dir, { recursive: true })).filter((f) => String(f).endsWith('.harness.json')); }
  catch { return []; }
}

function toEntry(h) {
  const c = h.components || {};
  const sp = c.system_prompt || {};
  return {
    id: h.id,
    vendor: h.identity?.vendor,
    surface: h.identity?.surface,
    model: h.identity?.model,
    captured_at: h.provenance?.captured_at,
    license: h.provenance?.upstream_license,
    capture_method: h.provenance?.capture_method,
    confidence: h.provenance?.confidence,
    source_url: h.provenance?.source_url,
    also_seen_in: h.provenance?.also_seen_in || [],
    tools: (c.tools || []).map((t) => ({ name: t.name, category: t.category || 'other' })),
    summary: sp.summary || '',
    sysLen: (sp.content || '').length,
    content: sp.content || '',
  };
}

export async function runCatalog(args) {
  const dir = args.dir || join(process.cwd(), 'harnesses');
  const out = args.out || join(process.cwd(), 'web');
  const files = await walk(dir);
  const harnesses = [];
  for (const rel of files) {
    try { harnesses.push(toEntry(JSON.parse(await readFile(join(dir, rel), 'utf8')))); }
    catch (e) { console.error(`  skip ${rel}: ${e.message}`); }
  }
  harnesses.sort((a, b) => `${a.vendor}${a.model}`.localeCompare(`${b.vendor}${b.model}`));

  await mkdir(out, { recursive: true });
  await writeFile(join(out, 'catalog.json'), `${JSON.stringify({ generated: new Date().toISOString(), count: harnesses.length, harnesses }, null, 2)}\n`);
  const dest = join(out, 'index.html');
  if (resolve(dest) !== resolve(TEMPLATE)) {
    try { await copyFile(TEMPLATE, dest); } catch (e) { console.error(`  (could not copy index.html: ${e.message})`); }
  }
  console.log(`catalog: ${harnesses.length} harnesses -> ${join(out, 'catalog.json')}`);
  console.log(`open ${dest} (or serve ${out}) to browse`);
  return { count: harnesses.length };
}
