// compile.mjs — pure functions: a canonical harness object -> an AGENTS.md block.
// No filesystem, no side effects. Easy to unit-test.

export const START = (id) => `<!-- harnesshub:start id=${id} -->`;
export const END = (id) => `<!-- harnesshub:end id=${id} -->`;

const REQUIRED = ['schema_version', 'id', 'identity', 'provenance', 'components'];
const ID_RE = /^[a-z0-9-]+\/[a-z0-9.+-]+\/[0-9]{8}$/;

export function validateHarness(h) {
  const errors = [];
  if (!h || typeof h !== 'object') return ['not an object'];
  for (const k of REQUIRED) if (h[k] === undefined) errors.push(`missing required field: ${k}`);
  if (h.identity) {
    for (const k of ['vendor', 'surface', 'model']) {
      if (!h.identity[k]) errors.push(`missing identity.${k}`);
    }
  }
  if (h.id !== undefined && !ID_RE.test(h.id)) {
    errors.push(`id must match vendorSurface/model/YYYYMMDD (got: ${h.id})`);
  }
  return errors;
}

function isPlaceholder(s) {
  return !s || !String(s).trim() || /^<placeholder/i.test(String(s).trim());
}

// Returns { text, withheld } or null when nothing renderable.
// Falls back to the takedown-safe `summary` when `content` is a placeholder/withheld.
function renderComponent(comp) {
  if (!comp) return null;
  if (!isPlaceholder(comp.content)) return { text: String(comp.content).trim(), withheld: false };
  if (comp.summary && comp.summary.trim()) return { text: comp.summary.trim(), withheld: true };
  return null;
}

const SECTIONS = [
  ['system_prompt', 'Role / persona'],
  ['loop', 'How to work'],
  ['guardrails', 'Guardrails'],
  ['formatting', 'Output conventions'],
  ['context', 'Context & memory'],
];

export function compileAgentsMd(h) {
  const id = h.id;
  const ident = h.identity || {};
  const p = h.provenance || {};
  const dn = ident.display_name || `${ident.surface} (${ident.model})`;
  const out = [];

  out.push(START(id));
  out.push(`## Agent harness: ${dn} — via HarnessHub`);
  out.push(
    `> Source: ${p.source_repo || 'unknown'} (${p.upstream_license || 'unknown'}). ` +
      `Unaffiliated with ${ident.vendor}. Extracted for research/interoperability. id: \`${id}\``
  );
  out.push('');

  const c = h.components || {};
  for (const [key, heading] of SECTIONS) {
    const r = renderComponent(c[key]);
    if (!r) continue;
    out.push(`### ${heading}`);
    if (r.withheld) out.push('_(summary — verbatim content withheld)_');
    out.push(r.text);
    out.push('');
  }

  if (Array.isArray(c.tools) && c.tools.length) {
    out.push('### Tools (documented, not injected)');
    for (const t of c.tools) {
      const cat = t.category ? ` _(${t.category})_` : '';
      const desc = t.description && !isPlaceholder(t.description) ? ` — ${t.description}` : '';
      out.push(`- **${t.name}**${cat}${desc}`);
    }
    out.push('');
  }

  out.push(END(id));
  return out.join('\n');
}

export function countLines(block) {
  return block.split('\n').length;
}
