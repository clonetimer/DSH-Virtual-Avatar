# Upstream source lock (P0 baseline)

Snapshot date: 2026-11-11

These SHAs identify the source revisions inspected for the initial architecture review. They are audit anchors, not dependency pins or proof that every file was reviewed at those revisions.

| Upstream | Declared version reviewed | Commit SHA | Role |
|---|---:|---|---|
| `yimengsuper2432/dsh-virtual-person` | 0.7.2 | `f68e7f99f2ccb9dc87d3671545d4692d1cd1356a` | Global persona Markdown and memory management |
| `JAdpp/dsh-whale-galgame` | 0.7.0 | `aa6ee3df79f8707131eefcdf17acef37cfd5bc4f` | Six-character Galgame, pet, activity context and assets |
| `clonetimer/PPL` | 1.0.0-dev.5 product; Core 0.3 / Runtime 0.1 stable references | `a587e5b6ffb62fd005ac67e98eed79fac3dd66de` | Persona Core/Runtime, DSH adapter, Character Governance |

## Qualification caveats

- The upstream repositories can advance independently. Re-run the source review and update this file before absorbing newer revisions.
- PPL's product suite remains development / non-Stable at this baseline. Character Governance must be qualified independently before enabling it for durable user state.
- The Whale default-art license boundaries are file-specific; see its upstream `LICENSE.md`, `NOTICE.md` and `THIRD_PARTY_LICENSES.md`.
- virtual-person's 0.7.2 feature baseline is recorded in `docs/feature-baseline.md`; its source data is one global `AGENT.md`, not six independent role stores.
