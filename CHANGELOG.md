# Changelog

## Unreleased

- Click a session card to jump to its Terminal.app tab (window comes to the front). macOS asks once for permission to control Terminal.
- quota-status mod now writes the session's `tty` and `app` (`TERM_PROGRAM`) into `sessions/<id>.quota.json`.

## 0.1.0 — 2026-10-09

First public release.

- Notch panel: collapsed to the exact hardware notch size, expands into a 480 pt frosted-glass panel on hover (0.15 s), collapses 0.3 s after the mouse leaves.
- Sections: 5-hour and weekly usage, soonest-expiring prompt cache, open sessions with progress, `claude -p` preview servers, Markdown to-dos ("waiting on you" first), publish cadence.
- Motion: spring open with staggered sections, faster no-bounce close.
- Five Claude Code mods in `mods/`: quota-status, task-progress, version-board, todo-pane, publish-pulse (44 tests, all passing on Claude Code 2.1.295).
- Tested on macOS 26.7.1, 16" MacBook Pro (notch 220 × 38 pt).
