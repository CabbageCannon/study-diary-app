# Draft PR notes — mist-sage mobile design system

## Summary

- Adds A-role-only files under `docs/mobile-app/design/`; no production frontend, backend, PWA configuration, data, or personal content is changed.
- Customer selected **雾绿延续** on 2026-09-06. Removes the unselected exploration and freezes the mist-sage tokens and component treatment.
- Provides separate, large, readable 1170×2532 exports for 今日、八股作答、算法作答、核对反馈、复习列表 and for 键盘展开、核对中、保存未完成/重试、无内容、核对失败重试. All source SVGs use a 390×844 CSS px viewBox at an explicit 3× export scale.
- Adds final layout, component, interaction, responsive, accessibility, icon mapping, and save/evaluation failure rules for B/C handoff.

## Review request

Review the final design system in [`design README`](docs/mobile-app/design/README.md), [`visual tokens`](docs/mobile-app/design/visual-spec.md), [`interaction rules`](docs/mobile-app/design/shared-interaction.md), and [`handoff`](docs/mobile-app/design/HANDOFF.md). B can use the fixed layout, state, and token rules for a fixture implementation; C must align the save/evaluation-state contract.

## Verification

- Ran `node docs/mobile-app/design/tools/build-mockups.mjs` to regenerate all SVG source exports.
- Rendered every SVG to PNG with ImageMagick; all 10 PNGs identify as 1170×2532, and all 10 SVGs contain `width="1170" height="2532" viewBox="0 0 390 844"`.
- Visually inspected all 10 final PNGs, with extra attention to the today headline, long interview answer text, keyboard-open layout, review grouping, save-unknown copy, evaluation-failed copy, and empty-state check mark.
- Ran `git diff --check`.

## Dependency / base note

The base branch is E's published `codex/mobile-integration`; this PR remains draft-only until the integration owner reviews it. No claim is made that the images equal Safari, PWA, iPhone keyboard, speech input, or LLM end-to-end validation.
