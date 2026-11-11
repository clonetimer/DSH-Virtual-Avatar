# Third-party notices

## PPL Runtime 0.1.0

- Upstream: https://github.com/clonetimer/PPL
- Pinned source commit: a587e5b6ffb62fd005ac67e98eed79fac3dd66de
- Upstream package: components/foundation/runtime/package.json
- Upstream package metadata declares: MIT
- Files included verbatim in this repository: src/ppl/lib/host-snapshot.js, src/ppl/lib/persona-runtime.js, src/ppl/vendor/pplc/runtime.js, src/ppl/vendor/pplc/renderer.js

The pinned upstream snapshot does not contain a separate LICENSE file or a named copyright holder for this package. The package manifest declares MIT; this notice records the source and declaration without inventing a copyright owner. Confirm the upstream copyright/license notice before a public Stable release.

## PPL Core compiler

The PPL Core reference compiler is not shipped or vendored in this plugin. CI checks out the pinned PPL repository solely as a build-time tool to compile personas/deepseek-whale.ppl into a PPL 0.3 Persona IR artifact. The generated IR is the runtime input.
