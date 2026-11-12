# PPL-driven Whale presentation and autonomous idle motion（dev.9）

## 1. Presentation ownership

The Whale's visible expression is derived from her own persisted PPL Runtime state. The presentation resolver is read-only: it does not write PPL state, change trust/attachment/affection, or classify the user's mental or physical condition.

The resolver receives:
- `pplState.emotion.anger`
- `pplState.emotion.grief`
- `pplState.emotion.anxiety`
- `pplState.emotion.embarrassment`
- `pplState.physical.fatigue`
- The latest completed reply's one-turn emotion label

All state values are normalized to the interval [0, 1]. Invalid, non-finite and out-of-range values are safely handled.

## 2. Expression selection

Persistent PPL emotion has precedence over the latest reply-text heuristic. A reply label is only used when no PPL emotion crosses its presentation threshold.

| PPL state | Threshold | Existing Whale expression | Motion profile |
|---|---:|---|---|
| anger | >= 0.65 | angry | tense |
| grief | >= 0.60 | serious | subdued |
| anxiety | >= 0.65 | frightened | nervous |
| embarrassment | >= 0.70 | shy | shy |

If multiple thresholds are crossed, the resolver chooses the strongest normalized intensity (`value / threshold`); ties use a stable priority order. When none is active, the latest completed reply's existing expression label is used. With no reply expression, the neutral `maid-left.webp` asset remains the fallback.

No image is generated, mirrored, recolored or altered. The implementation uses the existing upstream Whale expression assets already included in the plugin.

## 3. Fatigue and motion tempo

Character fatigue is not treated as an emotion and does not select a facial expression.

- `fatigue >= 0.75` selects a slower ambient animation tempo.
- Below that threshold, normal ambient tempo is used.
- A simultaneously active emotion still controls the expression and motion profile; fatigue only affects tempo.

This reflects the PPL character's own state and is not a measurement or inference about the user.

## 4. Autonomous behavior

The client now provides restrained ambient movement:
- The collapsed desktop pet uses a gentle float.
- The expanded portrait retains its normal idle float.
- A short body sway is scheduled about every 24 seconds while the companion is open, idle and not displaying a utility panel.
- The sway pauses during model requests and while a management panel is open.
- PPL-derived state profiles slightly alter the idle animation: shy sway, tense micro-shake, nervous movement, subdued breathing or resting motion.
- Thinking, response and patting actions retain priority over ambient movement.

All CSS motion is disabled when the operating system requests `prefers-reduced-motion`.

## 5. Interaction boundaries

- Ambient motion is client-side presentation only. It does not create PPL events or change relationship growth.
- The existing patting interaction remains visual-only and does not award affection.
- No blink, lip-sync, gaze tracking, skeletal rig, independently moving limbs or frame-by-frame animation is claimed. Those require actual matching layered/rigged or multi-frame Whale artwork.
- The DyberPet native action adapter from dev.8 remains available for validating a future authorized `pet_conf.json` / `act_conf.json` frame package.

## 6. Verification

- Unit tests cover baseline, reply fallback, each PPL emotion, overlapping emotion precedence, fatigue tempo and invalid input normalization.
- Host integration test applies repeated praise events through the real chat route and verifies that the resulting PPL embarrassment state selects the existing shy portrait.
- Client artifact tests verify state attributes, state-specific CSS profiles, reduced-motion support and the 24-second idle sway scheduler.
- Full CI remains responsible for the DSH classic-script loader, PPL compilation and install-package verification.