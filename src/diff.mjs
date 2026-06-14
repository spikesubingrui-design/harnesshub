// diff.mjs — compare two canonical harnesses. Pure, no I/O.
// Powers the governance story: "what changed between two captures / two models".

const COMPONENT_KEYS = ['system_prompt', 'loop', 'guardrails', 'formatting', 'context'];
const LCS_CAP = 2500; // above this, fall back to an order-insensitive multiset diff

function trimCommon(a, b) {
  let s = 0;
  while (s < a.length && s < b.length && a[s] === b[s]) s++;
  let ea = a.length;
  let eb = b.length;
  while (ea > s && eb > s && a[ea - 1] === b[eb - 1]) { ea--; eb--; }
  return { a: a.slice(s, ea), b: b.slice(s, eb) };
}

function lcsDiff(a, b) {
  const n = a.length;
  const m = b.length;
  const W = m + 1;
  const dp = new Int32Array((n + 1) * W);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i * W + j] = a[i] === b[j]
        ? dp[(i + 1) * W + (j + 1)] + 1
        : Math.max(dp[(i + 1) * W + j], dp[i * W + (j + 1)]);
    }
  }
  const added = [];
  const removed = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { i++; j++; }
    else if (dp[(i + 1) * W + j] >= dp[i * W + (j + 1)]) removed.push(a[i++]);
    else added.push(b[j++]);
  }
  while (i < n) removed.push(a[i++]);
  while (j < m) added.push(b[j++]);
  return { added, removed, approx: false };
}

function multisetDiff(a, b) {
  const ca = new Map();
  const cb = new Map();
  for (const l of a) ca.set(l, (ca.get(l) || 0) + 1);
  for (const l of b) cb.set(l, (cb.get(l) || 0) + 1);
  const added = [];
  const removed = [];
  for (const [l, c] of cb) for (let k = 0; k < c - (ca.get(l) || 0); k++) added.push(l);
  for (const [l, c] of ca) for (let k = 0; k < c - (cb.get(l) || 0); k++) removed.push(l);
  return { added, removed, approx: true };
}

export function lineDiff(aText, bText) {
  const a = String(aText || '').split('\n');
  const b = String(bText || '').split('\n');
  const t = trimCommon(a, b);
  const raw = Math.max(t.a.length, t.b.length) <= LCS_CAP ? lcsDiff(t.a, t.b) : multisetDiff(t.a, t.b);
  const changed = raw.added.length + raw.removed.length;
  const total = a.length + b.length || 1;
  return {
    added: raw.added.filter((s) => s.trim()),
    removed: raw.removed.filter((s) => s.trim()),
    sim: Math.round((1 - changed / total) * 100),
    approx: raw.approx,
  };
}

export function toolsDiff(a = [], b = []) {
  const ta = new Map(a.map((t) => [t.name, t]));
  const tb = new Map(b.map((t) => [t.name, t]));
  const added = [];
  const removed = [];
  const changed = [];
  for (const name of tb.keys()) if (!ta.has(name)) added.push(name);
  for (const [name, t] of ta) {
    if (!tb.has(name)) { removed.push(name); continue; }
    const o = tb.get(name);
    if ((t.description || '') !== (o.description || '') || (t.category || '') !== (o.category || '')) changed.push(name);
  }
  return { added, removed, changed };
}

function fieldChanges(a = {}, b = {}, keys) {
  const out = {};
  for (const k of keys) if ((a[k] ?? '') !== (b[k] ?? '')) out[k] = { from: a[k] ?? null, to: b[k] ?? null };
  return out;
}

export function diffHarness(a, b) {
  const components = {};
  for (const key of COMPONENT_KEYS) {
    const ca = a.components?.[key]?.content;
    const cb = b.components?.[key]?.content;
    if (ca === undefined && cb === undefined) continue;
    const d = lineDiff(ca, cb);
    if (d.added.length || d.removed.length) components[key] = d;
  }
  return {
    a: { id: a.id, captured_at: a.provenance?.captured_at },
    b: { id: b.id, captured_at: b.provenance?.captured_at },
    identity: fieldChanges(a.identity, b.identity, ['vendor', 'surface', 'model', 'display_name']),
    provenance: fieldChanges(a.provenance, b.provenance, ['captured_at', 'source_repo', 'capture_method', 'confidence']),
    tools: toolsDiff(a.components?.tools, b.components?.tools),
    components,
  };
}

function changedLines(d, cap) {
  const lines = [];
  for (const l of d.removed) lines.push(`    - ${l}`);
  for (const l of d.added) lines.push(`    + ${l}`);
  if (cap && lines.length > cap) return [...lines.slice(0, cap), `    … (${lines.length - cap} more changed lines; --full to show all)`];
  return lines;
}

export function renderDiffText(d, { full } = {}) {
  const cap = full ? 0 : 24;
  const out = [];
  out.push('HARNESS DIFF');
  out.push(`  A  ${d.a.id}   captured ${d.a.captured_at || '?'}`);
  out.push(`  B  ${d.b.id}   captured ${d.b.captured_at || '?'}`);
  out.push('');

  const idK = Object.keys(d.identity);
  if (idK.length) {
    out.push('identity:');
    for (const k of idK) out.push(`  ${k}: ${d.identity[k].from} -> ${d.identity[k].to}`);
  }
  const provK = Object.keys(d.provenance);
  if (provK.length) {
    out.push('provenance:');
    for (const k of provK) out.push(`  ${k}: ${d.provenance[k].from} -> ${d.provenance[k].to}`);
  }

  const t = d.tools;
  if (t.added.length || t.removed.length || t.changed.length) {
    out.push(`tools:  +${t.added.length} added, -${t.removed.length} removed, ~${t.changed.length} changed`);
    for (const n of t.added) out.push(`  + ${n}`);
    for (const n of t.removed) out.push(`  - ${n}`);
    for (const n of t.changed) out.push(`  ~ ${n} (definition changed)`);
  }

  const compKeys = Object.keys(d.components);
  for (const key of compKeys) {
    const c = d.components[key];
    out.push(`${key}:  ${c.sim}% similar  (+${c.added.length} / -${c.removed.length} lines${c.approx ? ', approx' : ''})`);
    out.push(...changedLines(c, cap));
  }

  if (!idK.length && !provK.length && !t.added.length && !t.removed.length && !t.changed.length && !compKeys.length) {
    out.push('identical — no differences.');
  }
  return out.join('\n');
}
