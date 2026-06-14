import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slugSeg, parseFilenameMeta, parseSections, normalize, parseToolsJson } from '../src/normalize.mjs';
import { selectAsgeirtj, selectX1xhlol } from '../src/pull.mjs';
import { validateHarness } from '../src/compile.mjs';

test('slugSeg respects the dot rule', () => {
  assert.equal(slugSeg('Anthropic-Claude Code', false), 'anthropic-claude-code');
  assert.equal(slugSeg('Opus 4.8', true), 'opus-4.8');
  assert.equal(slugSeg('Opus 4.8', false), 'opus-4-8');
});

test('parseFilenameMeta: surface-style filename', () => {
  assert.deepEqual(parseFilenameMeta('claude-code-opus-4.8'), { date: null, model: 'opus-4.8' });
  assert.deepEqual(parseFilenameMeta('claude-code-2.1.172-opus-4.8'), { date: null, model: 'opus-4.8+2.1.172' });
});

test('parseFilenameMeta: official date-prefixed filename', () => {
  assert.deepEqual(parseFilenameMeta('2026-01-18-claude-opus-4.5'), { date: '20260118', model: 'opus-4.5' });
});

test('parseFilenameMeta: spaces and trailing versions (x1xhlol names)', () => {
  assert.equal(parseFilenameMeta('Claude Sonnet 4.6').model, 'sonnet-4.6');
  assert.equal(parseFilenameMeta('Agent Prompt 2025-09-03').model, 'agent-prompt-2025-09-03');
});

test('parseFilenameMeta: no recognizable model falls back to cleaned base', () => {
  assert.equal(parseFilenameMeta('claude-code-docs-assistant').model, 'claude-code-docs-assistant');
});

const SAMPLE = `## Contents

- [System Prompt](#system-prompt)

---

# System Prompt

You are a helpful coding assistant operating in a terminal.

## Guardrails

Refuse destructive requests.

# Tools

## Bash
Runs a shell command and returns its output.

### Git
Use the gh CLI for GitHub.

## Read
Reads a file from the local filesystem.
`;

test('parseSections splits on headings', () => {
  const s = parseSections('# A\nbody a\n## B\nbody b');
  assert.equal(s.length, 2);
  assert.equal(s[0].heading, 'A');
  assert.equal(s[1].level, 2);
});

test('normalize: real-shaped doc -> valid harness with tools and clean system prompt', () => {
  const h = normalize(SAMPLE, {
    vendor: 'Anthropic', surface: 'Claude Code', base: 'claude-code-opus-4.8',
    path: 'Anthropic/Claude Code/claude-code-opus-4.8.md',
    repo: 'asgeirtj/system_prompts_leaks', branch: 'main', license: 'CC0-1.0', fallbackDate: '20260612',
  });
  assert.deepEqual(validateHarness(h), []);
  assert.equal(h.id, 'anthropic-claude-code/opus-4.8/20260612');
  assert.deepEqual(h.components.tools.map((t) => t.name), ['Bash', 'Read']);
  assert.equal(h.components.tools[0].category, 'shell');
  assert.match(h.components.system_prompt.content, /helpful coding assistant/);
  assert.doesNotMatch(h.components.system_prompt.content, /Runs a shell command/);
  assert.equal(h.provenance.upstream_license, 'CC0-1.0');
  assert.equal(h.provenance.verbatim, true);
  assert.equal(h.provenance.vendor_affiliated, false);
  assert.match(h.provenance.content_hash, /^[0-9a-f]{16}$/);
  assert.ok(h.components.system_prompt.summary.length > 0);
});

test('normalize: official folder -> capture_method official + filename date', () => {
  const h = normalize('# System Prompt\nThe assistant is Claude.', {
    vendor: 'Anthropic', surface: 'Official', base: '2026-01-18-claude-opus-4.5',
    path: 'Anthropic/Official/2026-01-18-claude-opus-4.5.md',
    repo: 'asgeirtj/system_prompts_leaks', branch: 'main', license: 'CC0-1.0', fallbackDate: '20260612',
  });
  assert.equal(h.id, 'anthropic-official/opus-4.5/20260118');
  assert.equal(h.provenance.capture_method, 'official');
  assert.equal(h.provenance.captured_at, '2026-01-18');
});

test('normalize: identical content yields identical content_hash (dedup key)', () => {
  const ctx = { vendor: 'X', surface: 'Y', base: 'a', path: 'X/Y/a.md', repo: 'r', branch: 'main', license: 'CC0-1.0', fallbackDate: '20260101' };
  const a = normalize('same text here', ctx);
  const b = normalize('same text here', { ...ctx, base: 'b', path: 'X/Y/b.md' });
  assert.equal(a.provenance.content_hash, b.provenance.content_hash);
  assert.notEqual(a.provenance.content_hash, normalize('different', ctx).provenance.content_hash);
});

test('selectAsgeirtj drops skills/tool-fragments/meta and builds units', () => {
  const paths = [
    'Anthropic/Claude Code/claude-code-opus-4.8.md',
    'Anthropic/Claude Code/bundled-skills/run.md',
    'Anthropic/Claude Code/grep-tool.md',
    '.github/CONTRIBUTING.md',
  ];
  const units = selectAsgeirtj(paths);
  assert.deepEqual(units.map((u) => u.promptPath), ['Anthropic/Claude Code/claude-code-opus-4.8.md']);
  assert.equal(units[0].vendor, 'Anthropic');
  assert.equal(units[0].surface, 'Claude Code');
});

test('selectX1xhlol pairs a prompt with its sibling tools json', () => {
  const paths = [
    'Cursor Prompts/Agent Prompt v1.2.txt',
    'Cursor Prompts/Agent Tools v1.0.json',
    'Devin AI/Prompt.txt',
    'assets/logo.png',
    'LICENSE.md',
  ];
  const units = selectX1xhlol(paths);
  const cursor = units.find((u) => u.promptPath.includes('Agent Prompt'));
  assert.equal(cursor.vendor, 'Cursor Prompts');
  assert.equal(cursor.surface, 'Cursor Prompts');
  assert.equal(cursor.toolsPath, 'Cursor Prompts/Agent Tools v1.0.json');
  const devin = units.find((u) => u.vendor === 'Devin AI');
  assert.equal(devin.toolsPath, null);
  assert.ok(!units.some((u) => /assets|LICENSE/i.test(u.promptPath)));
});

test('parseToolsJson handles array, name->def map, and OpenAI function shapes', () => {
  const arr = parseToolsJson(JSON.stringify([{ name: 'codebase_search', description: 'Find code.\nmore', parameters: { type: 'object' } }]));
  assert.equal(arr[0].name, 'codebase_search');
  assert.equal(arr[0].description, 'Find code.');
  assert.ok(arr[0].parameters);
  const map = parseToolsJson(JSON.stringify({ 'lov-add-dependency': { description: 'Add a dep.' } }));
  assert.equal(map[0].name, 'lov-add-dependency');
  const fn = parseToolsJson(JSON.stringify([{ type: 'function', function: { name: 'web_search', description: 'Search' } }]));
  assert.equal(fn[0].name, 'web_search');
  assert.deepEqual(parseToolsJson('not json'), []);
});
