# Ingestion — multi-upstream + provenance + takedown

Decision 3 = **multi-upstream.** Decision 1 = **aggressive** (verbatim). The pipeline maximizes coverage while making provenance + takedown the survival layer.

## Sources

| source | license | role | freshness |
|---|---|---|---|
| `asgeirtj/system_prompts_leaks` | **CC0-1.0** | primary (cleanest legally) | fastest (new models in days) |
| `x1xhlol/system-prompts-and-models-of-ai-tools` | GPL-3.0 | breadth (30+ tools, tool-defs) | active |
| `jujumilk3/leaked-system-prompts` | none | verified + date-stamped | slower |
| `CL4R1T4S` (elder-plinius) | — | crowdsourced breadth | bursty |

Each gets a source adapter: `fetch → parse vendor folder layout → map to canonical components → attach provenance`.

## Pipeline

```
fetch (per source) → parse → normalize to .harness.json → dedup → diff vs last → index
```

- **Normalize:** split raw dump into `system_prompt / tools / loop / guardrails / formatting / context`. Auto-generate `components.*.summary` (the takedown-safe display field).
- **Dedup:** same `(vendor, surface, model)` from multiple sources → keep highest `confidence`; record all `source_url`s. Multi-upstream means the same Opus 4.8 prompt arrives 3× — collapse, don't triplicate.
- **Freshness / diff:** on each pull, diff against the last `captured_at` for that model. Surface "Opus 4.6 → 4.7: 3 guardrail clauses changed" as a changelog + (later) a drift alert. This turns asgeirtj's freshness advantage into *our* content cadence.
- **Automate the burden:** ingestion + normalization is the maintenance cost (Risk 5.2). Keep it CI-driven; reserve human verification for high-value/low-confidence items only.

## Provenance record

Every harness carries `provenance` (see schema): `source_repo`, `upstream_license`, `capture_method`, `captured_at`, `verbatim`, `confidence`, `vendor_affiliated: false`, `takedown_id`. Provenance is **not optional even in aggressive mode** — it is what lets you (a) honor a targeted takedown in seconds, (b) prove "research/interoperability, unaffiliated", (c) prefer CC0 content when a duplicate exists.

## Takedown mechanics

- Stable `takedown_id` per item → `POST /takedown/{id}` flips the item to **summary-only** (drop `content`, keep `summary` + provenance) or full tombstone.
- Compiled artifacts reference the id, so a takedown also stops future `apply` of withheld content.
- Designated DMCA agent + a one-click "report this harness" link in the catalog (mirrors why jujumilk3's strict intake keeps it alive).

## Aggressive-posture notes

Verbatim + multi-upstream + verbatim-apply is the highest-exposure configuration. The mitigations above (CC0-preference on dupes, instant per-item takedown, unaffiliated framing, summary fallback) don't soften the posture — they keep the project from being removed wholesale. Revisit with counsel before introducing any paid tier on top of verbatim content.
