# PPL 0.3 language reference

These frozen reference copies are sourced from `clonetimer/PPL` at commit:

`a587e5b6ffb62fd005ac67e98eed79fac3dd66de`

The pinned upstream component is `components/foundation/core`, version `0.3.0`.
The plugin uses PPL Core as a build-time compiler; the distributed plugin executes the
compiled `ppl.persona-ir/0.3` artifact with the vendored PPL 0.3 runtime and renderer.

## Reference files

- [PPL 0.3 Stable semantics](./SPEC_0.3_STABLE.md)
- [PPL grammar (EBNF)](./grammar.ebnf)
- [Persona IR schema](./persona-ir.schema.json)
- [Resolution schema](./resolution.schema.json)
- [Runtime state schema](./runtime.schema.json)
- [Host snapshot schema](./host-snapshot.schema.json)

## Integration boundaries

- Authoritative character source: `personas/deepseek-whale.ppl`.
- Checked-in runtime artifact: `personas/deepseek-whale.pir.json`.
- Build-time compiler: pinned upstream PPL Core 0.3.0.
- Runtime and renderer: `src/ppl/vendor/pplc/runtime.js` and `renderer.js`, checked byte-for-byte against the pinned upstream runtime.
- Host snapshot contract: `src/ppl/lib/host-snapshot.js`, checked byte-for-byte against the pinned upstream runtime package.
- Plugin-specific adapter: `src/ppl/lib/persona-runtime.js`; it preserves the upstream runtime adapter and adds per-turn scene override support for the Whale's private/public interaction scene.

The upstream repository remains the canonical source. CI verifies these copies against the pinned commit, the compiler output against the checked-in Persona IR, and the runtime mirrors against the upstream implementation. Update the pin and all reference copies together when intentionally upgrading PPL.
