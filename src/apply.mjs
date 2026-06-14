// apply.mjs — read/insert/replace/revert a fenced harness block inside a target file.
// upsert/remove are pure string transforms; only readTarget/writeTarget touch disk.

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { START, END } from './compile.mjs';

function esc(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function blockRe(id) {
  return new RegExp(esc(START(id)) + '[\\s\\S]*?' + esc(END(id)));
}

export async function readTarget(path) {
  if (!existsSync(path)) return '';
  return readFile(path, 'utf8');
}

export async function writeTarget(path, content) {
  await writeFile(path, content, 'utf8');
}

// Insert the block, or replace an existing block with the same id (idempotent).
export function upsert(existing, id, block) {
  const re = blockRe(id);
  if (re.test(existing)) {
    return { content: existing.replace(re, block), action: 'replaced' };
  }
  if (!existing.trim()) {
    return { content: block + '\n', action: 'created' };
  }
  return { content: existing.replace(/\s*$/, '') + '\n\n' + block + '\n', action: 'appended' };
}

// Remove the block for `id`, leaving the rest of the file intact.
export function remove(existing, id) {
  const re = blockRe(id);
  if (!re.test(existing)) return { content: existing, action: 'not-found' };
  const stripped = existing
    .replace(re, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\s+/, '');
  return { content: (stripped.trim() ? stripped.replace(/\s*$/, '') + '\n' : ''), action: 'removed' };
}
