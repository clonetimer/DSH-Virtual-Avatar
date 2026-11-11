# DeepSeek Whale MVP — implementation slice

Status: in progress. This slice activates one companion character while keeping the storage and registry model multi-character capable.

## Product scope

The first usable character is **DeepSeek 鲸鱼娘** (deepseek). The other five characters in the Whale upstream roster are deferred. Their original data remains archived during migration; this is a scope reduction for the first usable release, not a destructive deletion.

## Included domain modules

- src/characters/deepseek-whale/profile.mjs: character identity, visual/profile overrides, affection caps, intimacy bands and companion prompt.
- src/characters/deepseek-whale/relationship.mjs: deterministic interaction events, Whale-compatible affection delta/level-up and PPL relationship state mapping.
- src/characters/deepseek-whale/service.mjs: prepare/resolve/finalize companion turns; commit only completed model turns.
- src/memory/service.mjs: shared/agent/character owner namespaces, similarity merge, pinning and bounded prompt context.
- src/storage/sqlite-store.mjs: durable local state, event idempotency, optimistic revisions, memory and migration source archive.
- personas/deepseek-whale.ppl: PPL 0.3 source of personality invariants and relationship rules.
- src/ppl/: PPL Runtime host adapter; the PPL Core compiler remains a pinned build-time tool, not shipped in the plugin.

## Behavior contract

1. Galgame character prompts are only assembled for the companion channel. They are never injected into ordinary Agent work requests.
2. Affection retains Whale's upstream progression: level-1 cap 30, then +15 per level; excess affection carries forward.
3. Trust and attachment are PPL relationship state, not aliases for affection.
4. Comfort, positive/negative interaction and confession are deterministic host-classified events.
5. PPL commits are staged during preparation and applied only after completed or max-tokens; abort/error/interruption does not commit.
6. Memory owner is explicit. character/deepseek cannot read shared/user or another character's memory by default.
7. Legacy Whale migration imports the DeepSeek state only; the full original JSON is archived and other roster members are reported as deferred.

## Deliberately deferred

- DSH Host plugin entrypoint and settings/client UI.
- Full Galgame dialogue UI, choices generation, emotion classification, side stories, CG generation/gallery and desktop pet.
- Multi-character activation and cross-character cast.
- DSH Web/Desktop real-host qualification.

## Acceptance tests

- PPL source compiles and embedded PPL source tests pass with the pinned PPL Core compiler.
- PPL relationship commits do not apply for aborted turns.
- SQLite state survives close/reopen and rejects stale revisions.
- Replayed event IDs are idempotent; same ID with changed payload is rejected.
- Character memory does not leak across owners.
- Whale migration imports DeepSeek state, preserves the full source archive and marks all other characters deferred.
- One DeepSeek companion turn can be prepared, finalized and durably reloaded without mutating the main Agent persona.
