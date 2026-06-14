# One-click apply — design (AGENTS.md-first)

Decision 2 = **universal layer first.** A normalized harness compiles to a single `AGENTS.md` that 30+ agents already read, so one apply propagates to the user's whole fleet. Per-agent adapters (Claude Code, Cursor) are secondary, generated from the same canonical source.

## Compile pipeline

```
.harness.json ──compile(target)──▶ artifact + manifest ──preview──▶ [user approves] ──▶ write (idempotent, reversible)
```

A `compile()` maps canonical `components` → a target's idioms:

| canonical component | → AGENTS.md | → Claude Code | → Cursor |
|---|---|---|---|
| `system_prompt` | top-level prose | `CLAUDE.md` | `.cursor/rules/*.mdc` |
| `guardrails` | "## Guardrails" section | same | same |
| `formatting` | "## Output conventions" | same | same |
| `loop` | "## How to work" | same | same |
| `tools` | documented, not injected* | `.mcp.json` hints | rule notes |

\*Tools are *documented* in the universal layer (you can't force another vendor's runtime to mount them), but surfaced as adapter hints where the target supports it.

## CLI

```
harness apply <id> --target agents-md [--dry-run] [--into ./AGENTS.md] [--section harness-hub]
```

- Writes inside fenced markers so re-apply is **idempotent** and **reversible**:

```
<!-- harnesshub:start id=anthropic-claude-code/opus-4.8/20260612 -->
...compiled content...
<!-- harnesshub:end -->
```

- `harness apply <id> --revert` removes exactly that block. No lock-in residue (chezmoi-style).

## Approval preview (mandatory)

Before any write, print a preview the user must confirm — modeled on Claude Code `/plugin` and Cursor's "Add to" dialog:

```
Apply  anthropic-claude-code/opus-4.8/20260612  →  ./AGENTS.md

  + 64 lines into section "harness-hub"  (idempotent, revertible)
  provenance: asgeirtj/system_prompts_leaks · CC0 · captured 2026-06-12 · confidence 0.0
  ⚠ verbatim third-party content — unaffiliated with anthropic

Proceed? [y/N]
```

The preview always shows **provenance + the unaffiliated warning** — this is the trust layer; a one-click apply without it is a non-starter.

## Web → local deeplink

Catalog "Apply" button → `harness://apply/<id>?target=agents-md` → local CLI handler opens the same approval preview. Zero terminal, zero JSON for the user (matches the Cursor `cursor://` / `.mcpb` double-click UX bar).

## Example emitted AGENTS.md block

```markdown
<!-- harnesshub:start id=anthropic-claude-code/opus-4.8/20260612 -->
## Agent harness: Claude Code (Opus 4.8) — via HarnessHub
Source: asgeirtj/system_prompts_leaks (CC0). Unaffiliated with Anthropic. Extracted for interoperability.

### Role
<compiled persona>

### How to work
<compiled loop>

### Guardrails
<compiled guardrails>

### Output conventions
<compiled formatting>
<!-- harnesshub:end -->
```
