---
name: Add an upstream source
about: Propose a new leaked/extracted-harness repo for `harness pull`
title: "Add upstream source: <owner>/<repo>"
labels: ["good first issue", "help wanted", "enhancement"]
---

**Upstream repo:** <owner>/<repo> (license: ?)

**Layout:** how are prompt files named / organized? Are there sidecar tool JSON files?

**Why it's worth adding:** what models/surfaces does it cover that we don't?

A source is ~10 lines — a `units(paths)` function in `src/pull.mjs` mapping the
repo tree to `{ promptPath, toolsPath, vendor, surface, base }`. See
[CONTRIBUTING.md](../CONTRIBUTING.md). `normalize`, dedup, diff, watch and apply
all work for free once the source is registered.
