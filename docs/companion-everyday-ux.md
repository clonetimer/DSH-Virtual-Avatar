# Companion Everyday UX — dev.6

## Design objective

The companion window should make conversation the primary task. Maintenance, data-management and diagnostic functions remain available, but should not compete with the conversation controls during ordinary use.

## User-facing changes

### 1. One compact utility entry

The header now contains only the character identity, a short scene-aware subtitle, “更多” and “收起”. The former row of separate management buttons is grouped into four categories:

- 对话与关系：搜索对话、关系记录。
- 记忆管理：查看记忆、整理长期摘要。
- 角色与外观：角色设定、切换背景。
- 数据与支持：备份与恢复、运行诊断、刷新状态。

The menu closes when a utility is selected. Long-running actions expose their existing loading states.

### 2. One management panel at a time

The management panels share one active-panel state. Summary, profile, diagnostics, backup and memory management are presented in a dedicated overlay over the chat area, not interleaved with the conversation history. Search and relationship history have explicit close controls.

### 3. Human-readable relationship and character state

- Remove the duplicated relationship-stage line.
- Show “关系阶段、信任、亲近度” instead of exposing the internal term “依恋”; the relationship-history view uses the same wording.
- Replace raw PPL emotion percentages with qualitative labels: “精力、心情、表现”.
- Replace the implementation label “互动环境 · PPL 场景” with “互动场合”; explain the behavior in ordinary language.

The internal PPL state remains unchanged. Only its presentation is simplified.

### 4. Reliable message composition

The message draft is no longer cleared before the request completes. On model/API failure, the user can retry without retyping. If the conversation was successfully sent but the optional memory-candidate request fails, the UI reports that secondary issue separately.

### 5. Clear operation feedback

Successful backup creation, backup restore and background switching use neutral status feedback rather than the red error style. Actual failures continue to use the error presentation.

## Regression coverage

The classic DSH client test now asserts:

- The grouped “更多” menu is present.
- The utility overlay is included in the built classic-script artifact.
- The user-facing scene/state labels replace implementation jargon.
- The submitted message draft is cleared only after successful completion.
- The old row of separate utility-state controls is absent.
- Escape dismissal, outside-menu dismissal, and utility-panel empty states remain part of the client artifact.

The existing DSH classic-script loader check remains in place; this UX change does not introduce a second React runtime or change the Host API contract.

## Acceptance boundary

Automated CI verifies syntax, classic-script loading, packaged artifact contents and existing project tests. Actual visual spacing, menu dismissal, keyboard behavior and Windows DSH Desktop 0.2.2-rc.1 interaction still require real-host acceptance.

## Chat composer visibility and avatar motion（dev.7）

- Main layout uses an explicit constrained grid row; the character column can scroll independently and cannot force the chat column below the panel viewport.
- The chat history region is the only flexible scroll area. The composer is a non-shrinking footer anchored to the bottom of the visible panel.
- New conversations show three first-message suggestions and the input explains Enter-to-send.
- The portrait uses a gentle idle float, a distinct thinking motion while the model request is pending, and a short response bounce after a successful turn.
- Existing emotion-specific static portraits remain responsible for expression changes after a completed reply.
- The current portrait assets are static full-body images. dev.7 does not claim skeletal animation, independent limb motion or lip-sync; those require layered/rigged art or a dedicated Live2D/Spine asset pipeline.
- The animation respects the operating system's reduced-motion preference.