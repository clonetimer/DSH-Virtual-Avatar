# Memory panel return and DyberPet interaction compatibility

## 1. Memory panel navigation fix

The memory list request is an asynchronous data operation. It must not own panel navigation state.

The earlier client set `activePanel = memories` both before and after `memory-list` completed. If a user closed the panel while the request was still pending, the completion callback could reopen it. The corrected behavior is:

1. The menu action calls `openUtilityPanel('memories')` immediately.
2. `loadMemories()` only fetches and updates the list; it never changes `activePanel`.
3. The user can return to chat using the always-visible `返回聊天` control or Escape.
4. An in-flight memory request may finish after the panel closes, but it cannot reopen the panel.

The memory toolbar is grouped into search, memory level, pin status, filter and export controls. Loading and empty states are distinct.

## 2. DyberPet native action format

This plugin includes a format adapter for the native DyberPet role configuration documented in the user's `clonetimer/DyberPet` repository:

- `pet_conf.json`: default/left/right/drag/fall/focus bindings, tier-specific `patpat`, and `random_act` groups.
- `act_conf.json`: `images` prefix, `act_num`, `frame_refresh`, optional `need_move`, `direction`, `frame_move`, and `anchor`.
- `action/<prefix>_<numeric-index>.png`: ordered PNG frames; ordering is numeric, not lexical.

The adapter in `src/characters/deepseek-whale/dyberpet-motion.mjs` validates the config and frame inventory, compiles a safe action catalog, and maps elapsed playback time to an original frame. It rejects path traversal, duplicate frames, invalid references, invalid timing, unsupported directions and oversized actions.

This is an independently implemented format adapter based on the documented data contract. It does not copy the DyberPet runtime implementation or include its GPL-licensed application code.

## 3. Artwork and character identity boundary

The current DSH repository contains the Whale full-body portrait and expression portraits, not a complete multi-frame Whale role package. The public DyberPet repository's built-in `Kitty` and `ChrisKitty` sample roles are unrelated cat artwork; they are not substituted for the Whale.

The UI now uses the DyberPet-style `patpat` interaction concept: clicking or keyboard-activating the Whale portrait triggers a short shy-expression reaction and a speech bubble. This is a local visual interaction only; it does not silently add affection or relationship points.

The current Whale still uses its existing portrait-based idle/thinking/reply animations. True frame-by-frame Whale movement requires an actual authorized Whale role package containing the corresponding `action/*.png` frames and native configuration. The adapter is ready to validate that format; it does not fabricate missing frames.

## 4. Verification

- Memory loader regression: the async loader must not set or reopen `activePanel`.
- Client artifact regression: the memory panel must expose `返回聊天`, and the menu must open it independently of the fetch completion.
- DyberPet format tests: numeric frame ordering, repeated playback, movement metadata, patpat tier mapping, random action references, invalid timing and unsafe paths.
- Client artifact still runs as a DSH classic script and retains the shell-owned React runtime contract.
