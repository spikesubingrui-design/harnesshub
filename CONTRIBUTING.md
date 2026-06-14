# Contributing to HarnessHub

Thanks for helping turn frontier-model harnesses into something you can actually *apply*.

## Dev setup

```bash
git clone https://github.com/spikesubingrui-design/harnesshub
cd harnesshub
node --test        # 29 unit tests, zero dependencies, Node >= 18
npm link           # optional: get the `harness` binary on your PATH
```

No build step, no dependencies. Source lives in `src/` (pure logic) + `bin/` (CLI). Network and filesystem are isolated to `pull.mjs` / `watch.mjs` / `catalog.mjs`; everything else is pure and unit-tested.

## Add an upstream source

Most-wanted contribution. A source is just a function that maps a repo's file tree to *units*:

```js
// in src/pull.mjs
export const SOURCES = {
  myupstream: {
    repo: 'owner/repo', branch: 'main', license: 'MIT',
    units: (paths) => paths
      .filter(/* the prompt files */)
      .map((p) => ({ promptPath: p, toolsPath: /* sidecar or null */, vendor, surface, base })),
  },
};
```

`normalize()` + the dedup/diff/apply pipeline then work for free. Add a test in `test/normalize.test.mjs`. Good next targets: `jujumilk3/leaked-system-prompts`, `0xeb/TheBigPromptLibrary`.

## Add an apply target

`apply` currently emits `AGENTS.md`. Per-target adapters (`--target claude-code`, `--target cursor`) compile the same canonical harness into that tool's idioms — see `src/compile.mjs`.

## Content & takedowns

HarnessHub stores **provenance, not copies** — the repo ships the tooling; verbatim prompts are fetched at runtime and git-ignored. When contributing, never commit verbatim third-party prompt text. To request removal of any indexed entry, see [LEGAL.md](LEGAL.md).

## Norms

- Keep `src/` pure where possible; put I/O behind the existing modules.
- Every new pure function gets a unit test.
- Sentence-case commit messages; describe the *why*.
