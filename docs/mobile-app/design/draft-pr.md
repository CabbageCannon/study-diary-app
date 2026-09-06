# Draft PR notes — mist-sage mobile design system

## Summary

- Adds A-role-only files under `docs/mobile-app/design/`; no production frontend, backend, PWA configuration, data, or personal content is changed.
- Customer selected **雾绿延续** on 2026-09-06. Removes the unselected exploration and freezes the mist-sage tokens and component treatment.
- Provides separate, large, readable 1170×2532 exports for 今日、八股作答、算法作答、核对反馈、复习列表 and for 键盘展开、核对中、失败重试、无内容.
- Adds pre-selection layout, component, interaction, responsive, accessibility, and failure/retry rules for B/C handoff.

## Review request

Review the final design system in [`README.md`](README.md), [`visual-spec.md`](visual-spec.md), and [`shared-interaction.md`](shared-interaction.md). B can now use the fixed layout, state, and token rules for a fixture implementation once M0 and C's API contract are available.

## Verification

- Ran `node docs/mobile-app/design/tools/build-mockups.mjs` to regenerate all SVG source exports.
- Rendered every SVG to PNG with ImageMagick and visually inspected today, feedback, and keyboard-open outputs at full 1170×2532 resolution.
- Ran `git diff --check`.

## Dependency / base note

This branch starts at `2c6a83c6728237e4f99402e7d20ed91cc40d81e6`, because the M0 baseline and `codex/mobile-integration` remote branch are not yet published. The PR is intentionally draft-only; it should be retargeted to the M0 integration branch when E publishes it. No claim is made that the images equal Safari, PWA, iPhone keyboard, speech input, or LLM end-to-end validation.
