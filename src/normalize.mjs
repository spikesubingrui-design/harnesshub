// normalize.mjs — raw upstream content -> canonical harness object. Pure (hashing only).
// Handles asgeirtj markdown ("## Contents" TOC + "# Tools") and plain-text prompts
// (x1xhlol), plus sidecar tool-definition JSON.

import { createHash } from 'node:crypto';

const STRONG_MODEL = /(opus|sonnet|haiku|fable|gpt-?[0-9][a-z0-9.+-]*|gemini[a-z0-9.+-]*|grok[a-z0-9.+-]*|llama[a-z0-9.+-]*|mistral[a-z0-9.+-]*|mixtral[a-z0-9.+-]*|qwen[a-z0-9.+-]*|phi[a-z0-9.+-]*|deepseek[a-z0-9.+-]*|o[0-9][a-z0-9.+-]*)[a-z0-9.+-]*/gi;
const DATE_PREFIX = /^(\d{4})-(\d{2})-(\d{2})-(.+)$/;

export function slugSeg(s, allowDot) {
  const keep = allowDot ? 'a-z0-9.+-' : 'a-z0-9-';
  return String(s)
    .toLowerCase()
    .replace(new RegExp(`[^${keep}]+`, 'g'), '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
}

// "claude-code-opus-4.8" -> { date: null, model: "opus-4.8" }
// "2026-01-18-claude-opus-4.5" -> { date: "20260118", model: "opus-4.5" }
export function parseFilenameMeta(base) {
  const clean = String(base).trim().replace(/[\s_]+/g, '-');
  let date = null;
  let rest = clean;
  const m = clean.match(DATE_PREFIX);
  if (m) {
    date = `${m[1]}${m[2]}${m[3]}`;
    rest = m[4];
  }
  let model = rest;
  const strong = rest.match(STRONG_MODEL);
  if (strong && strong.length) model = strong[strong.length - 1];
  model = slugSeg(model, true);
  if (!model) model = slugSeg(rest, true);
  // Preserve an app/harness build (3-part semver, e.g. 2.1.172) so distinct
  // captures of the same model don't collapse to one id — feeds version governance.
  const build = rest.match(/\b\d+\.\d+\.\d+\b/);
  if (build && !model.includes(build[0])) model = `${model}+${build[0]}`;
  return { date, model };
}

export function parseSections(md) {
  const lines = md.split('\n');
  const sections = [{ level: 0, heading: null, body: [] }];
  for (const line of lines) {
    const m = line.match(/^(#{1,6})\s+(.*)$/);
    if (m) sections.push({ level: m[1].length, heading: m[2].trim(), body: [] });
    else sections[sections.length - 1].body.push(line);
  }
  if (sections[0].heading === null && sections[0].body.join('').trim() === '') sections.shift();
  return sections;
}

function renderSections(sections) {
  return sections
    .map((s) => (s.heading !== null ? `${'#'.repeat(s.level)} ${s.heading}\n` : '') + s.body.join('\n'))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function category(name) {
  const n = name.toLowerCase();
  if (/bash|shell|terminal|command|exec/.test(n)) return 'shell';
  if (/edit|write|read|glob|grep|file|str_replace|create|notebook/.test(n)) return 'filesystem';
  if (/web|fetch|search|browse|url|http/.test(n)) return 'web';
  if (/agent|task|dispatch|subagent|team/.test(n)) return 'agent';
  if (/mcp/.test(n)) return 'mcp';
  if (/python|code|repl|jupyter|sandbox/.test(n)) return 'code';
  return 'other';
}

function firstParagraph(md, max = 200) {
  const para = [];
  for (const raw of md.split('\n')) {
    const t = raw.trim();
    if (/^#{1,6}\s/.test(t)) continue;
    if (/^[-*>|]/.test(t) || /^```/.test(t)) { if (para.length) break; else continue; }
    if (/^<[^>]+>$/.test(t)) { if (para.length) break; else continue; }
    if (!t) { if (para.length) break; else continue; }
    para.push(t);
    if (para.join(' ').length >= max) break;
  }
  let s = para.join(' ').replace(/[*_`]/g, '').replace(/\s+/g, ' ').trim();
  if (s.length > max) s = s.slice(0, max - 1).trimEnd() + '…';
  return s;
}

// Pull tool defs out of a "# Tools" block; return tools + set of consumed indices.
function extractTools(sections) {
  const tools = [];
  const consumed = new Set();
  const i = sections.findIndex((s) => s.heading && /^tools?$/i.test(s.heading));
  if (i === -1) return { tools, consumed };
  const lvl = sections[i].level;
  consumed.add(i);
  for (let j = i + 1; j < sections.length; j++) {
    if (sections[j].level <= lvl) break;
    consumed.add(j);
    if (sections[j].level === lvl + 1) {
      const body = sections[j].body.join('\n').trim();
      tools.push({ name: sections[j].heading, description: firstParagraph(body, 200), category: category(sections[j].heading) });
    }
  }
  return { tools, consumed };
}

function stripToc(md) {
  if (!/^\s*##\s+Contents/i.test(md)) return md;
  const idx = md.search(/\n-{3,}[ \t]*\n/);
  return idx >= 0 ? md.slice(idx).replace(/^\n-{3,}[ \t]*\n/, '') : md;
}

export function normalize(raw, ctx) {
  const body = stripToc(raw);
  const { date: fnDate, model } = parseFilenameMeta(ctx.base);
  const captureDate = ctx.captureDate || fnDate || ctx.fallbackDate;

  const sections = parseSections(body);
  const { tools, consumed } = extractTools(sections);
  const systemContent = renderSections(sections.filter((_, idx) => !consumed.has(idx)));

  const sameVS = String(ctx.vendor).toLowerCase() === String(ctx.surface).toLowerCase();
  const vendorSurface = slugSeg(sameVS ? ctx.vendor : `${ctx.vendor}-${ctx.surface}`, false);
  const modelSlug = model || slugSeg(ctx.base, true);
  const id = `${vendorSurface}/${modelSlug}/${captureDate}`;
  const official = /official/i.test(ctx.surface);
  const encPath = ctx.path.split('/').map(encodeURIComponent).join('/');

  const components = {
    system_prompt: {
      content: systemContent,
      summary: firstParagraph(systemContent, 240),
    },
  };
  if (tools.length) components.tools = tools;

  return {
    schema_version: '0.1',
    id,
    identity: {
      vendor: slugSeg(ctx.vendor, false),
      surface: ctx.surface,
      model: modelSlug,
      display_name: `${ctx.surface} (${modelSlug})`,
    },
    provenance: {
      source_repo: ctx.repo,
      source_url: `https://github.com/${ctx.repo}/blob/${ctx.branch}/${encPath}`,
      upstream_license: ctx.license,
      capture_method: official ? 'official' : 'extraction',
      captured_at: `${captureDate.slice(0, 4)}-${captureDate.slice(4, 6)}-${captureDate.slice(6, 8)}`,
      verbatim: true,
      confidence: official ? 0.85 : 0.6,
      vendor_affiliated: false,
      content_hash: createHash('sha256').update(systemContent).digest('hex').slice(0, 16),
      takedown_id: `thb-${vendorSurface}-${modelSlug}-${captureDate}`.replace(/[^a-z0-9-]/g, ''),
      notes: 'Auto-normalized by `harness pull`. captured_at from filename date when present, else upstream last-push.',
    },
    components,
    tags: [slugSeg(ctx.vendor, false), official ? 'official' : 'surface'],
  };
}

// Parse a sidecar tool-definition JSON (x1xhlol). Handles: array of tool objects,
// { tools: [...] }, name->def maps, and OpenAI { type:'function', function:{...} }.
export function parseToolsJson(text) {
  let data;
  try { data = JSON.parse(text); } catch { return []; }
  let entries = [];
  if (Array.isArray(data)) entries = data;
  else if (data && Array.isArray(data.tools)) entries = data.tools;
  else if (data && typeof data === 'object') entries = Object.entries(data).map(([name, def]) => ({ name, ...(def && typeof def === 'object' ? def : {}) }));
  const tools = [];
  for (const e of entries) {
    if (!e || typeof e !== 'object') continue;
    const fn = e.function && typeof e.function === 'object' ? e.function : e;
    const name = fn.name || e.name;
    if (!name) continue;
    const desc = String(fn.description || e.description || '').split('\n')[0].trim().slice(0, 200);
    const parameters = fn.parameters || fn.input_schema || e.parameters || e.inputSchema || undefined;
    const tool = { name, description: desc, category: category(name) };
    if (parameters && typeof parameters === 'object') tool.parameters = parameters;
    tools.push(tool);
  }
  return tools;
}
