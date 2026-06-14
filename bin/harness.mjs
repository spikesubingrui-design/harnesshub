#!/usr/bin/env node
// harness — HarnessHub CLI (v0). Implements: apply --target agents-md.

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { createInterface } from 'node:readline/promises';
import { validateHarness, compileAgentsMd, countLines } from '../src/compile.mjs';
import { readTarget, upsert, remove, writeTarget } from '../src/apply.mjs';
import { runPull } from '../src/pull.mjs';
import { diffHarness, renderDiffText } from '../src/diff.mjs';
import { runWatch } from '../src/watch.mjs';
import { runCatalog } from '../src/catalog.mjs';

const USAGE = `harness — HarnessHub CLI (v0)

Usage:
  harness pull  [options]                 ingest + normalize an upstream into .harness.json
  harness apply <harness.json> [options]  compile a harness into AGENTS.md
  harness diff  <a> <b> [options]         compare two harnesses (file path or id)
  harness watch [options]                 re-check upstreams; report drift since capture
  harness catalog [options]               build a browsable web catalog (catalog.json + index.html)

pull options:
  --source <asgeirtj|x1xhlol>   upstream to pull (default: asgeirtj)
  --vendor <name>        only this vendor dir (e.g. Anthropic, Cursor Prompts)
  --filter <substr>      only paths containing this substring
  --limit <n>            cap number of units (default: 20)
  --out <dir>            output dir (default: ./harnesses)
  --no-dedup             keep content-identical duplicates from other sources
  --dry-run              list planned ids, download nothing
  (set GITHUB_TOKEN to raise GitHub API rate limits)

apply options:
  --target <agents-md>   compile target (default: agents-md; only target in v0)
  --into <path>          file to write into (default: ./AGENTS.md)
  --dry-run              show the approval preview, write nothing
  --revert               remove this harness's block instead of applying
  -y, --yes              confirm the write (required when non-interactive)

Examples:
  harness pull --vendor Anthropic --filter opus-4.8 --dry-run
  harness pull --vendor Anthropic --filter claude-code-opus-4.8 --limit 1
  harness apply harnesses/anthropic-claude-code/opus-4.8/20260612.harness.json --into ./AGENTS.md --yes
`;

function parseArgs(argv) {
  const a = { _: [], target: 'agents-md', into: 'AGENTS.md' };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === '--dry-run') a.dryRun = true;
    else if (t === '--revert') a.revert = true;
    else if (t === '-y' || t === '--yes') a.yes = true;
    else if (t === '--target') a.target = argv[++i];
    else if (t === '--into') a.into = argv[++i];
    else if (t === '--source') a.source = argv[++i];
    else if (t === '--vendor') a.vendor = argv[++i];
    else if (t === '--filter') a.filter = argv[++i];
    else if (t === '--limit') a.limit = Number(argv[++i]);
    else if (t === '--out') a.out = argv[++i];
    else if (t === '--dir') a.dir = argv[++i];
    else if (t === '--format') a.format = argv[++i];
    else if (t === '--full') a.full = true;
    else if (t === '--no-dedup') a.noDedup = true;
    else if (t === '--changelog') a.changelog = argv[++i];
    else if (t === '--verbose') a.verbose = true;
    else if (t.startsWith('--')) { console.error(`unknown option: ${t}`); process.exit(2); }
    else a._.push(t);
  }
  return a;
}

async function confirm(question) {
  if (!process.stdin.isTTY) return false;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ans = (await rl.question(question)).trim().toLowerCase();
  rl.close();
  return ans === 'y' || ans === 'yes';
}

function previewHeader(h, into, action) {
  const p = h.provenance || {};
  const conf = p.confidence ?? '?';
  return [
    '',
    `  ${action.toUpperCase()}  ${h.id}  →  ${into}`,
    '',
    `  provenance: ${p.source_repo || 'unknown'} · ${p.upstream_license || 'unknown'} · captured ${p.captured_at || '?'} · confidence ${conf}`,
    `  ! ${p.verbatim ? 'verbatim' : 'normalized'} third-party content — unaffiliated with ${h.identity?.vendor}`,
    '',
  ].join('\n');
}

async function loadHarness(arg, dir) {
  const candidates = [arg, join(dir, `${arg}.harness.json`), join(dir, arg)];
  const path = candidates.find((p) => existsSync(p));
  if (!path) throw new Error(`cannot resolve harness: ${arg} (tried path and ${dir}/<id>.harness.json)`);
  return JSON.parse(await readFile(path, 'utf8'));
}

async function diffCmd(args) {
  const [x, y] = args._;
  if (!x || !y) { console.error('error: diff needs two harnesses (file path or id)\n'); console.log(USAGE); process.exit(2); }
  const dir = args.dir || join(process.cwd(), 'harnesses');
  const a = await loadHarness(x, dir);
  const b = await loadHarness(y, dir);
  const d = diffHarness(a, b);
  if (args.format === 'json') { console.log(JSON.stringify(d, null, 2)); return; }
  console.log(renderDiffText(d, { full: args.full }));
}

async function main() {
  const argv = process.argv.slice(2);
  const cmd = argv[0];
  if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') { console.log(USAGE); return; }
  if (cmd === 'pull') { await runPull(parseArgs(argv.slice(1))); return; }
  if (cmd === 'diff') { await diffCmd(parseArgs(argv.slice(1))); return; }
  if (cmd === 'watch') { await runWatch(parseArgs(argv.slice(1))); return; }
  if (cmd === 'catalog') { await runCatalog(parseArgs(argv.slice(1))); return; }
  if (cmd !== 'apply') { console.error(`unknown command: ${cmd}\n`); console.log(USAGE); process.exit(2); }

  const args = parseArgs(argv.slice(1));
  const file = args._[0];
  if (!file) { console.error('error: missing <harness.json>\n'); console.log(USAGE); process.exit(2); }
  if (args.target !== 'agents-md') { console.error(`error: target "${args.target}" not implemented in v0 (only agents-md)`); process.exit(2); }
  if (!existsSync(file)) { console.error(`error: file not found: ${file}`); process.exit(2); }

  let h;
  try { h = JSON.parse(await readFile(file, 'utf8')); }
  catch (e) { console.error(`error: invalid JSON in ${file}: ${e.message}`); process.exit(1); }

  const errs = validateHarness(h);
  if (errs.length) {
    console.error('error: harness failed validation:');
    for (const e of errs) console.error(`  - ${e}`);
    process.exit(1);
  }

  const existing = await readTarget(args.into);

  if (args.revert) {
    const { content, action } = remove(existing, h.id);
    if (action === 'not-found') { console.log(`No block for ${h.id} in ${args.into} — nothing to revert.`); return; }
    process.stdout.write(previewHeader(h, args.into, 'revert'));
    if (args.dryRun) { console.log('  (dry-run) would remove the block above. No changes written.'); return; }
    if (!(args.yes || await confirm('  Remove this block? [y/N] '))) { console.log('  Aborted (re-run with --yes to confirm).'); return; }
    await writeTarget(args.into, content);
    console.log(`  removed ${h.id} from ${args.into}`);
    return;
  }

  const block = compileAgentsMd(h);
  const { content, action } = upsert(existing, h.id, block);

  process.stdout.write(previewHeader(h, args.into, action));
  console.log(block.split('\n').map((l) => '  | ' + l).join('\n'));
  console.log('');

  if (args.dryRun) {
    const verb = { created: 'create', replaced: 'replace', appended: 'append' }[action] || action;
    console.log(`  (dry-run) would ${verb} ${countLines(block)} lines in ${args.into}. No changes written.`);
    return;
  }
  if (!(args.yes || await confirm(`  Proceed to ${action} in ${args.into}? [y/N] `))) { console.log('  Aborted (re-run with --yes to confirm).'); return; }
  await writeTarget(args.into, content);
  console.log(`  ${action} ${h.id} in ${args.into}  (idempotent — re-apply replaces; --revert removes)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
