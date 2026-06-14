import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSourceUrl } from '../src/watch.mjs';

test('parseSourceUrl decodes repo, branch, and url-encoded path', () => {
  const u = 'https://github.com/asgeirtj/system_prompts_leaks/blob/main/Anthropic/Official/2026-05-28-claude-opus-4.8.md';
  assert.deepEqual(parseSourceUrl(u), {
    repo: 'asgeirtj/system_prompts_leaks',
    branch: 'main',
    path: 'Anthropic/Official/2026-05-28-claude-opus-4.8.md',
  });
});

test('parseSourceUrl decodes percent-encoded spaces (x1xhlol paths)', () => {
  const u = 'https://github.com/x1xhlol/system-prompts-and-models-of-ai-tools/blob/main/Cursor%20Prompts/Agent%20Prompt%20v1.2.txt';
  const r = parseSourceUrl(u);
  assert.equal(r.repo, 'x1xhlol/system-prompts-and-models-of-ai-tools');
  assert.equal(r.path, 'Cursor Prompts/Agent Prompt v1.2.txt');
});

test('parseSourceUrl returns null for non-blob urls', () => {
  assert.equal(parseSourceUrl('https://example.com/x'), null);
  assert.equal(parseSourceUrl(''), null);
  assert.equal(parseSourceUrl(undefined), null);
});
