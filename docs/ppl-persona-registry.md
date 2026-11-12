# PPL Persona Runtime Registry

## 1. Purpose

The registry separates immutable Persona IR definitions from mutable per-character Runtime state. A persona definition can be registered once and used to create multiple independent runtime adapters without sharing session, relationship or emotional state.

The registry is an in-process module. It does not start a PPL Gateway or add an external service dependency.

## 2. Registry contract

The current API is implemented in `src/ppl/registry.mjs`:

- `register({ id, ir, profile, hostKind })`: validate and register a PPL 0.3 Persona IR under a stable uppercase ID.
- `has(id)`: check registration.
- `get(id)`: return safe metadata and Persona binding, not the mutable IR object.
- `list()`: enumerate registered persona metadata in stable ID order.
- `createRuntime(id, options)`: create an isolated Runtime adapter for the selected persona.
- `unregister(id)`: remove the definition from the registry. Existing Runtime instances remain independent and are not mutated.

Registration rejects invalid IDs, duplicate IDs, schema mismatch, missing runtime fields and IR/persona ID mismatch.

## 3. Runtime isolation

Each call to `createRuntime()` clones the registered Persona IR before constructing a Runtime adapter. Each call to `initialState()` returns a fresh copy of the persona's initial relationship and emotional state plus its own session ID and turn counter.

The registry owns definitions only. Character storage services own persisted state, conversation history, relationship events and character-private memory. The registry does not merge those stores or share them between characters.

The DSH Host now creates the DeepSeek Whale PPL Runtime through `createDefaultPersonaRegistry()`. This makes the production entry point use the same registration and validation path intended for additional characters.

## 4. Current qualification boundary

- Registered Persona: DEEPSEEK_WHALE.
- PPL IR schema: ppl.persona-ir/0.3.
- Runtime adapter: in-process, using the existing PPL Core 0.3 Runtime contract.
- Isolation tests: separate Persona IR copies, Runtime instances, session IDs and relationship/emotion state.
- Not yet delivered: additional playable character definitions, character-specific storage services, character switcher UI, cross-character migration and multi-character real-host qualification.

A registry foundation is not evidence that multiple characters are already available in the UI. Additional personas must pass their own source/IR validation, character service integration, memory isolation, migration and DSH host tests before being enabled.

## 5. Validation

The registry tests cover default registration, metadata enumeration, duplicate/invalid/mismatched IDs, unknown persona lookup, independent Runtime objects and independent initial state. The full Node 24.9.0 / 24 CI matrix validates the packaged DSH client and Host integration.
