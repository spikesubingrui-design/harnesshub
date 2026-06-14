// watch.mjs — drift watcher. Re-fetch each local harness's upstream, recompute its
// content hash, and report which harnesses the vendor has silently changed.
// Turns the static archive into a live monitor. Reuses normalize + lineDiff.

import { readdir, readFile, appendFile } from 'node:fs/promises';
import { join } from 'node:path';
import process from 'node:process';
import { SOURCES, fetchRaw } from './pull.mjs';
import { normalize } from './normalize.mjs';
import { lineDiff } from './diff.mjs';

// "https://github.com/<owner>/<repo>/blob/<branch>/<encPath>" -> { repo, branch, path }
export function parseSourceUrl(url) {
  const m = String(url || '').match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)$/);
  if (!m) return null;
  return { repo: `${m[1]}/${m[2]}`, branch: m[3], path: m[4].split('/').map(decodeURIComponent).join('/') };
}

async function loadLocal(dir) {
  let files = [];
  try { files = await readdir(dir, { recursive: true }); } catch { return []; }
  const out = [];
  for (const rel of files) {
    if (!String(rel).endsWith('.harness.json')) continue;
    const path = join(dir, rel);
    try { out.push({ path, harness: JSON.parse(await readFile(path, 'utf8')) }); } catch { /* skip */ }
  }
  return out;
}

// content_hash depends only on the raw upstream, but normalize needs a ctx shape.
function ctxFor(h, loc) {
  return {
    vendor: h.identity?.vendor || 'x',
    surface: h.identity?.surface || 'x',
    base: 'x',
    path: loc.path,
    repo: loc.repo,
    branch: loc.branch,
    license: h.provenance?.upstream_license,
    fallbackDate: String(h.provenance?.captured_at || '20200101').replace(/-/g, ''),
  };
}

async function writeChangelog(file, report) {
  const date = new Date().toISOString().slice(0, 10);
  const lines = [`\n# Harness drift — ${date}\n`];
  for (const { h, d } of report) {
    lines.push(`## ${h.id}`);
    lines.push(`- system_prompt: ${d.sim}% similar (+${d.added.length} / -${d.removed.length} lines)`);
    lines.push(`- source: ${h.provenance?.source_url || '?'}`);
    lines.push('');
  }
  await appendFile(file, lines.join('\n'));
}

export async function runWatch(args) {
  const dir = args.dir || join(process.cwd(), 'harnesses');
  let items = await loadLocal(dir);
  if (args.source && SOURCES[args.source]) items = items.filter((i) => i.harness.provenance?.source_repo === SOURCES[args.source].repo);
  if (args.vendor) items = items.filter((i) => (i.harness.identity?.vendor || '').toLowerCase() === String(args.vendor).toLowerCase());
  if (args.filter) items = items.filter((i) => i.harness.id.includes(args.filter));
  if (Number.isFinite(args.limit)) items = items.slice(0, args.limit);

  console.log(`watching ${items.length} local harnesses in ${dir}`);
  let drifted = 0;
  let unchanged = 0;
  let errors = 0;
  const report = [];

  for (const it of items) {
    const h = it.harness;
    const loc = parseSourceUrl(h.provenance?.source_url);
    if (!loc) { console.error(`  ? ${h.id}  no parseable source_url — skipped`); errors++; continue; }
    try {
      const raw = await fetchRaw(loc.repo, loc.branch, loc.path);
      const fresh = normalize(raw, ctxFor(h, loc));
      if (fresh.provenance.content_hash === h.provenance?.content_hash) {
        unchanged++;
        if (args.verbose) console.log(`  = ${h.id}  unchanged`);
        continue;
      }
      const d = lineDiff(h.components?.system_prompt?.content, fresh.components.system_prompt.content);
      drifted++;
      console.log(`  ~ DRIFT  ${h.id}   ${d.sim}% similar  (+${d.added.length} / -${d.removed.length} lines)  — upstream changed since ${h.provenance?.captured_at || '?'}`);
      report.push({ h, d });
    } catch (e) {
      console.error(`  ! ${h.id}  ${e.message}`);
      errors++;
    }
  }

  console.log(`${items.length} watched · ${drifted} drifted · ${unchanged} unchanged · ${errors} errors`);
  if (args.changelog && report.length) {
    await writeChangelog(args.changelog, report);
    console.log(`changelog -> ${args.changelog}`);
  }
  return { watched: items.length, drifted, unchanged, errors };
}
