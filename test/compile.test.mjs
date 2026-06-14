import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileAgentsMd, validateHarness, START, END } from '../src/compile.mjs';
import { upsert, remove } from '../src/apply.mjs';

const sample = {
  schema_version: '0.1',
  id: 'anthropic-claude-code/opus-4.8/20260612',
  identity: { vendor: 'anthropic', surface: 'Claude Code', model: 'opus-4.8', display_name: 'Claude Code (Opus 4.8)' },
  provenance: {
    source_repo: 'asgeirtj/system_prompts_leaks',
    upstream_license: 'CC0-1.0',
    captured_at: '2026-06-12',
    verbatim: false,
    confidence: 0.0,
    vendor_affiliated: false,
    capture_method: 'reconstructed',
  },
  components: {
    system_prompt: { content: '<placeholder>', summary: 'A terminal coding agent.' },
    guardrails: { content: 'Refuse destructive requests.' },
    tools: [{ name: 'Bash', category: 'shell', description: 'run commands' }],
  },
};

test('validate passes for a good harness', () => {
  assert.deepEqual(validateHarness(sample), []);
});

test('validate flags a bad id', () => {
  assert.ok(validateHarness({ ...sample, id: 'nope' }).some((e) => e.includes('id must match')));
});

test('validate flags missing identity fields', () => {
  const bad = { ...sample, identity: { vendor: 'anthropic' } };
  const errs = validateHarness(bad);
  assert.ok(errs.some((e) => e.includes('identity.surface')));
  assert.ok(errs.some((e) => e.includes('identity.model')));
});

test('compile falls back to summary when content is a placeholder', () => {
  const block = compileAgentsMd(sample);
  assert.ok(block.includes('A terminal coding agent.'));
  assert.ok(block.includes('verbatim content withheld'));
  assert.ok(block.includes('Refuse destructive requests.'));
  assert.ok(block.includes('**Bash**'));
  assert.ok(block.startsWith(START(sample.id)));
  assert.ok(block.trimEnd().endsWith(END(sample.id)));
});

test('upsert creates then replaces idempotently (exactly one block)', () => {
  const a = upsert('', sample.id, compileAgentsMd(sample));
  assert.equal(a.action, 'created');
  const b = upsert(a.content, sample.id, compileAgentsMd(sample));
  assert.equal(b.action, 'replaced');
  assert.equal(b.content.split(START(sample.id)).length - 1, 1);
});

test('upsert appends and preserves existing content', () => {
  const r = upsert('# My agents\n\nexisting notes\n', sample.id, compileAgentsMd(sample));
  assert.equal(r.action, 'appended');
  assert.ok(r.content.includes('existing notes'));
  assert.ok(r.content.includes(START(sample.id)));
});

test('remove deletes the block and leaves other content', () => {
  const withNotes = upsert('# My agents\n\nexisting notes\n', sample.id, compileAgentsMd(sample));
  const r = remove(withNotes.content, sample.id);
  assert.equal(r.action, 'removed');
  assert.ok(!r.content.includes(START(sample.id)));
  assert.ok(r.content.includes('existing notes'));
});

test('remove on absent id is a no-op', () => {
  assert.equal(remove('# nothing here\n', sample.id).action, 'not-found');
});
