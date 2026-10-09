**English** | [中文文档](README.zh-CN.md)

# cyxj-notch

> cyxj-notch is a macOS notch dashboard for Claude Code: hover over the MacBook notch to see your 5-hour and weekly usage limits, every open Claude Code session (working / idle / just finished), task progress, prompt-cache countdown, and your content to-dos — fed by five small Claude Code mods that are included in this repo.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/macOS-14%2B-black)](#requirements)
[![Claude Code](https://img.shields.io/badge/Claude%20Code-mods-orange)](#claude-code-mods-in-practice)
[![YouTube](https://img.shields.io/badge/YouTube-@cyxj__ai-red)](https://www.youtube.com/@cyxj_ai)

<p align="center"><img src="docs/demo.gif" width="560" alt="cyxj-notch: hovering the MacBook notch expands a frosted-glass Claude Code dashboard"></p>

---

## What it does

When the mouse is away, the panel is exactly the size of the hardware notch, so you don't see it. Hover for 0.15 s and it grows out of the notch into a frosted-glass panel; move away and it tucks back in.

<p align="center"><img src="docs/expanded.png" width="560" alt="Expanded panel: usage limits, sessions, cache countdown, to-dos, publish cadence"></p>

| Section | What you see | Data comes from |
|---|---|---|
| Usage | 5-hour and weekly limit used (%), when each resets | `quota-status` mod |
| Cache | The idle session whose prompt cache expires soonest ("12 min left") | `quota-status` mod |
| Sessions | Every open Claude Code session: running / idle / just finished, step `3/5` with a progress bar | `quota-status` + `task-progress` mods |
| Versions | Preview servers started by headless `claude -p` runs, click to open | `version-board` mod |
| To-dos | Items from a Markdown log, "waiting on you" first, then "AI can continue", then "waiting until a time" | `todo-pane` mod |
| Publish cadence | Days since the last release and the next scheduled one | `publish-pulse` mod |

Design notes:
- Collapsed = the notch itself (220 × 38 pt on a 16" MacBook Pro), no extra "ears", so it never looks like something stuck on top of the menu bar.
- The strip touching the notch is pure black and fades into `NSVisualEffectView` glass, so there's no visible seam with the hardware.
- Opening uses a slightly bouncy spring and staggers the sections in (fade + 8 pt drop + blur); closing is faster, with no bounce. Exits are shorter than entrances.

## Requirements

- macOS 14 or later (a notched MacBook is best; on other screens it uses a 200 pt "virtual notch" at the top center)
- Swift 5.9+ (Xcode or Command Line Tools)
- Claude Code with mod support (built and tested on Claude Code 2.1.295)

## Quick start

```sh
git clone https://github.com/chenyuxiaojin/cyxj-notch.git
cd cyxj-notch
./build.sh                      # swift build + package into build/刘海台.app
open build/刘海台.app           # no Dock or menu-bar icon
pkill -x NotchDesk              # quit
```

Then load the mods so the panel has something to show — add their folders to `CLAUDE_CODE_PLUGIN_DIRS` in `~/.claude/settings.json` (colon-separated, absolute paths):

```json
{
  "env": {
    "CLAUDE_CODE_PLUGIN_DIRS": "/path/to/cyxj-notch/mods/quota-status:/path/to/cyxj-notch/mods/task-progress:/path/to/cyxj-notch/mods/version-board:/path/to/cyxj-notch/mods/todo-pane:/path/to/cyxj-notch/mods/publish-pulse",
    "NOTCH_TODO_LOG": "/path/to/your/todo-log.md",
    "NOTCH_PUBLISH_ROOT": "/path/to/your/publish-folder",
    "NOTCH_TZ_OFFSET_HOURS": "8"
  }
}
```

`quota-status` and `task-progress` need no configuration. The last three variables are optional; without them the to-do and publish sections simply stay hidden.

To tag "waiting on you" with your own name instead of `我`:

```sh
defaults write com.xiaochen.notchdesk ownerName YourName
```

## Claude Code mods in practice

A **Claude Code mod** is a local plugin made of *function hooks*: a TypeScript module that registers handlers for Claude Code events (`session.start`, `turn.complete`, `tool.call`, `ui.render`, …) and calls an engine API (`$.ui.status`, `$.ui.toast`, `$.fs.write`, `$.session.usage()`, `$.clock.every`, `$.tool.register`, …). Mods hot-reload when you edit them and are loaded from the folders listed in `CLAUDE_CODE_PLUGIN_DIRS`.

This repo is a working example of one pattern: **mods write small JSON files, a native app reads them.** Claude Code stays the source of truth; the notch app is read-only and never talks to Claude Code directly.

```
Claude Code session ──(mod hooks)──► ~/.claude/notch/*.json ──(poll every 2 s)──► notch app
```

| Mod | What it does inside Claude Code | What it writes for the notch |
|---|---|---|
| [`quota-status`](mods/quota-status) | Status line with 5 h / weekly usage, reset day, session cost, cache countdown; toast at 90 % usage and 5 min before cache goes cold | `sessions/<id>.quota.json` every 60 s, marked `ended` on exit |
| [`task-progress`](mods/task-progress) | Registers a `progress` tool so Claude reports multi-step work; draws a progress bar above the input box | `sessions/<id>.progress.json` on every change |
| [`version-board`](mods/version-board) | Side pane listing preview servers from headless `claude -p` runs, with effort level and done/running; blocks opening more than 3 at once | `versions.json` every 8 s |
| [`todo-pane`](mods/todo-pane) | `/daiban` side pane showing "in progress" and "published, wrapping up" from a Markdown log | `todo.json` every 5 min and after each turn |
| [`publish-pulse`](mods/publish-pulse) | Status line with days since last publish (traffic light) and the next scheduled release | `pulse.json` every 10 min and after each turn |

Each mod has its configuration at the top of `hooks/register.ts(x)` and its own tests:

```sh
cd mods/quota-status
claude plugin validate .
claude plugin test .
```

Lessons from building these:
- **Keep the mod tiny and the file format boring.** One JSON object per file, with an `at` timestamp; the app treats a session as closed after 150 s without an update, so crashes clean themselves up.
- **Write, don't serve.** Writing files beats running a local server: nothing to keep alive, nothing to secure, and any app (SwiftUI, a menu-bar script, a web page) can read it.
- **Pure logic in its own file.** `quota.ts`, `bar.ts`, `scan.ts`, `parse.ts`, `pulse.ts` have no engine calls, so they're unit-tested without Claude Code running.
- **Command names must be ASCII** (`/daiban`, not a Chinese name) or registration fails.

## Data format

Everything lives in `~/.claude/notch/`:

| File | Shape |
|---|---|
| `sessions/<id>.quota.json` | `{ id, cwd, at, working, cache, limits: [{ kind: "five_hour" \| "seven_day", percentUsed, resetsAt }] }` |
| `sessions/<id>.progress.json` | `{ id, at, progress: { done, total, now } \| null }` |
| `versions.json` | `{ at, rows: [{ label, port, effort, state, isRunning, isVersion }] }` |
| `todo.json` | `{ at, busy: [{ title, next }], wrapUp: [{ title, next }] }` |
| `pulse.json` | `{ at, text }` |

The to-do log is plain Markdown with two sections. Each "next step" starts with who's up — `我:` (you), `AI:`, or `等 10-13 14:59:` (waiting until a time):

```markdown
## 当前在忙

### Notch app open source
- 状态(10-09): screenshots done, README drafted.
- 下一步: 我: record a 30-second demo
- 入口: `projects/notch/README.md`

## 已发布待收尾
- Last video(10-01): add links on two platforms.
```

## Developing the UI

```sh
NOTCH_FEED=<folder with sample JSON> NOTCH_OPEN=1 ./build/刘海台.app/Contents/MacOS/NotchDesk
```

`NOTCH_FEED` points the app at another data folder; `NOTCH_OPEN=1` opens the panel on launch and keeps it open, handy for screenshots.

Source layout:

```
Sources/NotchDesk/main.swift       borderless NSPanel above the menu bar, hover tracking, notch geometry
Sources/NotchDesk/NotchView.swift  SwiftUI panel, glass background, motion, all sections
Sources/NotchDesk/Feed.swift       reads ~/.claude/notch/
mods/                              the five Claude Code mods
docs/                              screenshots and demo GIF
```

## FAQ

**How do I see Claude Code usage limits on my Mac without opening a terminal?**
Run cyxj-notch with the `quota-status` mod. Hovering the notch shows your 5-hour and weekly percentages and their reset times, refreshed every 60 seconds.

**What does "cache 12 min left" mean?**
Claude Code reuses a prompt cache while you keep talking. After a session goes idle the cache expires (the mod counts 1 hour when your account has usage-limit windows, i.e. a subscription, and 5 minutes otherwise), and the next message re-sends the whole context — slower and more expensive. The panel shows the idle session closest to expiring, so you know which one to continue first.

**Does it work without a notch?**
Yes. On a screen without a notch it uses a 200 pt-wide area at the top center of the main screen.

**Does it send any data anywhere?**
No. The app only reads local files in `~/.claude/notch/`; the mods only write there. No network calls.

**Can I use only some of the mods?**
Yes. Each section hides itself when its file is missing or stale.

**How is this different from a status-line script?**
A status line lives inside one terminal. The notch shows every open session at once, across terminals and projects, and is reachable from any app.

## About

Made by [@cyxj_ai](https://www.youtube.com/@cyxj_ai), a non-programmer building tools with Claude Code. More projects: [cyxj-groksearch](https://github.com/chenyuxiaojin/cyxj-groksearch) · [cyxj-hyperframes](https://github.com/chenyuxiaojin/cyxj-hyperframes) · [cyxj-remotion-starter](https://github.com/chenyuxiaojin/cyxj-remotion-starter)

## License

[MIT](LICENSE)
