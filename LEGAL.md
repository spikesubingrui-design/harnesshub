# Legal & takedown policy

**Posture (decision 1): aggressive.** HarnessHub aggregates and applies third-party model harnesses verbatim, from multiple upstreams. This maximizes coverage *and* legal exposure. The policy below is the survival layer that an aggressive posture requires — not a softening of it.

## Disclaimer

- HarnessHub is **not affiliated with, authorized by, or endorsed by** any model vendor (Anthropic, OpenAI, Google, Cursor, etc.).
- Content is **extracted/leaked by the community** and aggregated here for **research, transparency, and interoperability**.
- All vendor names, model names, and prompt text are the property of their respective owners.
- No vendor relationship is implied by inclusion. `provenance.vendor_affiliated` is always `false`.

## Honest risk statement

Redistributing proprietary system prompts verbatim, and helping users apply them into other agents, sits in unsettled legal territory (copyright, trade-secret, vendor ToS on prompt extraction). Large repos survive because enforcement on the *display* layer has been lax — but **HarnessHub adds a commercialized "apply" step, raising the profile beyond a passive archive.** Consult IP counsel before any monetization on top of verbatim content (decision 4 keeps that deferred, which lowers near-term exposure).

## Takedown — fast and per-item

1. Email the designated agent or open a "report this harness" issue with the `takedown_id`.
2. Within SLA, the item flips to **summary-only** (raw `content` removed, abstractive `summary` + provenance retained) or a full tombstone.
3. Compiled `apply` artifacts reference the id, so withheld content cannot be re-applied.
4. We prefer **CC0 / permissively-licensed upstreams** (asgeirtj) when a duplicate exists, to minimize the surface.

## What we will not do

- Imply vendor endorsement.
- Paywall raw leaked content.
- Ship our own extraction/red-team tooling under this project.
- Ignore a good-faith takedown.
