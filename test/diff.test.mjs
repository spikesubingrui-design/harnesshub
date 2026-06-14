import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lineDiff, toolsDiff, diffHarness, renderDiffText } from '../src/diff.mjs';

test('lineDiff: identical text is 100% similar with no changes', () => {
  const d = lineDiff('a\nb\nc', 'a\nb\nc');
  assert.equal(d.sim, 100);
  assert.equal(d.added.length, 0);
  assert.equal(d.removed.length, 0);
});

test('lineDiff: one changed line shows as +/-', () => {
  const d = lineDiff('a\nb\nc', 'a\nB\nc');
  assert.deepEqual(d.removed, ['b']);
  assert.deepEqual(d.added, ['B']);
  assert.ok(d.sim < 100 && d.sim > 50);
});

test('toolsDiff: added / removed / changed', () => {
  const a = [{ name: 'Bash', description: 'run', category: 'shell' }, { name: 'Read', description: 'read' }];
  const b = [{ name: 'Bash', description: 'run commands', category: 'shell' }, { name: 'Write', description: 'write' }];
  const d = toolsDiff(a, b);
  assert.deepEqual(d.added, ['Write']);
  assert.deepEqual(d.removed, ['Read']);
  assert.deepEqual(d.changed, ['Bash']);
});

const mk = (over = {}) => ({
  schema_version: '0.1',
  id: over.id || 'anthropic-official/opus-4.6/20260101',
  identity: { vendor: 'anthropic', surface: 'Official', model: over.model || 'opus-4.6', display_name: 'x' },
  provenance: { captured_at: over.date || '2026-01-01', source_repo: 'asgeirtj/system_prompts_leaks', capture_method: 'official', confidence: 0.85 },
  components: {
    system_prompt: { content: over.sys || 'You are Claude.\nBe helpful.' },
    tools: over.tools || [{ name: 'Bash', description: 'run', category: 'shell' }],
  },
});

test('diffHarness: surfaces model + system_prompt + tool changes', () => {
  const a = mk();
  const b = mk({ id: 'anthropic-official/opus-4.8/20260528', model: 'opus-4.8', date: '2026-05-28', sys: 'You are Claude.\nBe concise.', tools: [{ name: 'Bash', description: 'run' }, { name: 'Web', description: 'search' }] });
  const d = diffHarness(a, b);
  assert.equal(d.identity.model.from, 'opus-4.6');
  assert.equal(d.identity.model.to, 'opus-4.8');
  assert.equal(d.provenance.captured_at.to, '2026-05-28');
  assert.ok(d.components.system_prompt);
  assert.deepEqual(d.tools.added, ['Web']);
  assert.deepEqual(d.tools.changed, ['Bash']); // category dropped
});

test('diffHarness + render: identical harnesses report no differences', () => {
  const d = diffHarness(mk(), mk());
  assert.equal(Object.keys(d.components).length, 0);
  assert.match(renderDiffText(d), /identical — no differences/);
});

test('renderDiffText caps changed lines unless --full', () => {
  const big = Array.from({ length: 100 }, (_, i) => `line ${i}`).join('\n');
  const big2 = Array.from({ length: 100 }, (_, i) => `LINE ${i}`).join('\n');
  const d = diffHarness(mk({ sys: big }), mk({ sys: big2 }));
  assert.match(renderDiffText(d, { full: false }), /more changed lines; --full/);
  assert.doesNotMatch(renderDiffText(d, { full: true }), /more changed lines; --full/);
});
