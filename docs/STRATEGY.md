# Strategy notes

Internal-ish notes on why HarnessHub is built the way it is. Summarized from a 2026-06 market scan.

## The gap

The "collection layer" is saturated and has **zero moat** — dozens of near-identical dumps of leaked prompts (x1xhlol ~140K★, asgeirtj ~42K★ CC0, jujumilk3 ~15K★). They are read-only museums: no apply, no real versioning, no cross-model normalization, no governance.

Nobody does **aggregate leaked frontier harnesses × one-click apply + governance + standardization** at the same time. That quadrant is empty — HarnessHub lives there. We consume the dumps above as free upstream fuel and build the moat on top.

## Operating decisions (v0)

| # | decision | choice |
|---|---|---|
| 1 | Legal posture | **Aggressive** — multi-upstream, verbatim apply. But the *repo* ships only tooling; verbatim content is fetched at runtime and git-ignored, and every entry carries provenance + a takedown id. See [LEGAL.md](../LEGAL.md). |
| 2 | Apply target | **Universal layer first** — compile to `AGENTS.md` (read by 30+ agents); Claude Code / Cursor adapters next. |
| 3 | Data sources | **Multi-upstream** with content-hash dedup. |
| 4 | Monetization | **Deferred** — build the product first; OSS core, with team governance (review/approval, drift alerts, audit) as the eventual paid layer. |
| 5 | Moat order | **apply (hook) → standardization (base) → governance (moat)**. |

## Moat, in order

1. **One-click apply** — the verb nobody owns. Select a harness → compile → write into your stack, behind an approval preview, emitted to `AGENTS.md`.
2. **Cross-model standardization** — one canonical, queryable schema over heterogeneous vendor dumps.
3. **Version governance + drift intel** — real diffs, changelogs, alerts when a vendor silently changes its harness.

Don't out-collect the big dumps. Consume them; win on apply, standardization, and governance.
