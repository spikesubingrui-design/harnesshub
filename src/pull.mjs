// pull.mjs — fetch + normalize upstreams into canonical .harness.json files.
// Network + dedup live here; the parsing/normalization is in normalize.mjs (pure, tested).
//
// A "unit" is one harness to pull: { promptPath, toolsPath|null, vendor, surface, base }.
// Each source maps its repo tree -> units; the loader is shared.

import { mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { normalize, parseToolsJson } from './normalize.mjs';
import { validateHarness } from './compile.mjs';

function commonPrefixLen(a, b) {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

// ---- source adapters --------------------------------------------------------

export function selectAsgeirtj(paths) {
  return paths
    .filter((p) => p.endsWith('.md'))
    .filter((p) => !/(^|\/)\.github\//.test(p))
    .filter((p) => !/bundled-skills|\/scripts\//i.test(p))
    .filter((p) => !/(CONTRIBUTING|README|FUNDING)\.md$/i.test(p))
    .filter((p) => !/-tool\.md$|deferred-tools\.md$/i.test(p))
    .filter((p) => p.split('/').length >= 2)
    .map((p) => {
      const parts = p.split('/');
      return {
        promptPath: p,
        toolsPath: null,
        vendor: parts[0],
        surface: parts.length >= 3 ? parts[1] : 'general',
        base: parts[parts.length - 1].replace(/\.md$/i, ''),
      };
    });
}

export function selectX1xhlol(paths) {
  const skip = (p) => /^\.github\//.test(p) || /^assets\//i.test(p) || /(^|\/)(LICENSE|README)/i.test(p);
  const prompts = paths.filter((p) => /\.(txt|md)$/i.test(p) && !skip(p));
  const jsons = paths.filter((p) => /\.json$/i.test(p) && !skip(p));
  return prompts.map((p) => {
    const parts = p.split('/');
    const dir = parts.slice(0, -1).join('/');
    const base = parts[parts.length - 1].replace(/\.(txt|md)$/i, '');
    const sib = jsons
      .filter((j) => j.slice(0, j.lastIndexOf('/')) === dir && /tool/i.test(j.split('/').pop()));
    let toolsPath = null;
    if (sib.length === 1) toolsPath = sib[0];
    else if (sib.length > 1) {
      toolsPath = sib
        .map((j) => ({ j, score: commonPrefixLen(base.toLowerCase(), j.split('/').pop().toLowerCase()) }))
        .sort((a, b) => b.score - a.score)[0].j;
    }
    return {
      promptPath: p,
      toolsPath,
      vendor: parts[0],
      surface: parts.length >= 3 ? parts[1] : parts[0],
      base,
    };
  });
}

export const SOURCES = {
  asgeirtj: { repo: 'asgeirtj/system_prompts_leaks', branch: 'main', license: 'CC0-1.0', units: selectAsgeirtj },
  x1xhlol: { repo: 'x1xhlol/system-prompts-and-models-of-ai-tools', branch: 'main', license: 'GPL-3.0', units: selectX1xhlol },
};

// ---- network ----------------------------------------------------------------

function ghHeaders() {
  const h = { 'User-Agent': 'harnesshub', Accept: 'application/vnd.github+json' };
  const tok = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (tok) h.Authorization = `Bearer ${tok}`;
  return h;
}

async function getJson(url) {
  const r = await fetch(url, { headers: ghHeaders() });
  if (!r.ok) throw new Error(`GitHub API ${r.status} ${r.statusText} (set GITHUB_TOKEN to raise rate limits)`);
  return r.json();
}

export async function fetchRaw(repo, branch, path) {
  const enc = path.split('/').map(encodeURIComponent).join('/');
  const r = await fetch(`https://raw.githubusercontent.com/${repo}/${branch}/${enc}`);
  if (!r.ok) throw new Error(`raw ${r.status} for ${path}`);
  return r.text();
}

// ---- dedup index ------------------------------------------------------------

async function buildHashIndex(dir) {
  const idx = new Map();
  let files = [];
  try { files = await readdir(dir, { recursive: true }); } catch { return idx; }
  for (const rel of files) {
    if (!String(rel).endsWith('.harness.json')) continue;
    const full = join(dir, rel);
    try {
      const h = JSON.parse(await readFile(full, 'utf8'));
      if (h.provenance?.content_hash) idx.set(h.provenance.content_hash, { path: full, id: h.id });
    } catch { /* ignore unreadable */ }
  }
  return idx;
}

function todayYmd() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

// ---- orchestration ----------------------------------------------------------

export async function runPull(args) {
  const sourceKey = args.source || 'asgeirtj';
  const s = SOURCES[sourceKey];
  if (!s) throw new Error(`unknown source "${sourceKey}" (have: ${Object.keys(SOURCES).join(', ')})`);

  const tree = await getJson(`https://api.github.com/repos/${s.repo}/git/trees/${s.branch}?recursive=1`);
  const paths = tree.tree.filter((n) => n.type === 'blob').map((n) => n.path);
  const all = s.units(paths);

  let sel = all;
  if (args.vendor) sel = sel.filter((u) => u.vendor.toLowerCase() === String(args.vendor).toLowerCase());
  if (args.filter) sel = sel.filter((u) => u.promptPath.toLowerCase().includes(String(args.filter).toLowerCase()));
  const limit = Number.isFinite(args.limit) ? args.limit : 20;
  const picked = sel.slice(0, limit);

  console.log(`source ${s.repo} (${s.license}) · ${all.length} harness units · ${sel.length} match · pulling ${picked.length}`);

  let fallbackDate = todayYmd();
  try {
    const repo = await getJson(`https://api.github.com/repos/${s.repo}`);
    if (repo.pushed_at) fallbackDate = repo.pushed_at.slice(0, 10).replace(/-/g, '');
  } catch { /* keep today */ }

  const ctxOf = (u) => ({ vendor: u.vendor, surface: u.surface, base: u.base, path: u.promptPath, repo: s.repo, branch: s.branch, license: s.license, fallbackDate });

  if (args.dryRun) {
    for (const u of picked) {
      const h = normalize('', ctxOf(u));
      console.log(`  ${h.id}   <-  ${u.promptPath}${u.toolsPath ? `  (+ ${u.toolsPath.split('/').pop()})` : ''}`);
    }
    console.log(`(dry-run) ${picked.length} units. No downloads, no writes.`);
    return { pulled: 0, deduped: 0, failed: 0 };
  }

  const outDir = args.out || join(process.cwd(), 'harnesses');
  const dedup = !args.noDedup;
  const hashIndex = dedup ? await buildHashIndex(outDir) : new Map();
  let ok = 0;
  let deduped = 0;
  let fail = 0;

  for (const u of picked) {
    try {
      const raw = await fetchRaw(s.repo, s.branch, u.promptPath);
      const h = normalize(raw, ctxOf(u));
      if (u.toolsPath) {
        const tools = parseToolsJson(await fetchRaw(s.repo, s.branch, u.toolsPath));
        if (tools.length) h.components.tools = tools;
      }
      const errs = validateHarness(h);
      if (errs.length) throw new Error(`validation: ${errs.join('; ')}`);

      const hash = h.provenance.content_hash;
      const hit = dedup && hashIndex.get(hash);
      if (hit && hit.id !== h.id) {
        const existing = JSON.parse(await readFile(hit.path, 'utf8'));
        const seen = new Set(existing.provenance.also_seen_in || []);
        seen.add(h.provenance.source_url);
        existing.provenance.also_seen_in = [...seen];
        await writeFile(hit.path, `${JSON.stringify(existing, null, 2)}\n`, 'utf8');
        console.log(`  = ${h.id}  identical to ${hit.id} — merged source (deduped)`);
        deduped++;
        continue;
      }

      const dest = join(outDir, `${h.id}.harness.json`);
      await mkdir(dirname(dest), { recursive: true });
      await writeFile(dest, `${JSON.stringify(h, null, 2)}\n`, 'utf8');
      hashIndex.set(hash, { path: dest, id: h.id });
      const nTools = h.components.tools ? h.components.tools.length : 0;
      console.log(`  + ${h.id}  (${nTools} tools, ${h.components.system_prompt.content.length} chars)`);
      ok++;
    } catch (e) {
      console.error(`  x ${u.promptPath}: ${e.message}`);
      fail++;
    }
  }
  console.log(`pulled ${ok}, deduped ${deduped}, failed ${fail} -> ${outDir}`);
  return { pulled: ok, deduped, failed: fail };
}
