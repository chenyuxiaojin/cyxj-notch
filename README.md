**English** | [中文文档](README.zh-CN.md)

# cyxj-notch

> cyxj-notch is a macOS notch dashboard for Claude Code: hover over the MacBook notch to see your 5-hour and weekly usage limits, every open Claude Code session (working / idle / just finished), task progress, prompt-cache countdown, and your content to-dos — fed by five small Claude Code mods that are included in this repo.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/macOS-14%2B-black)](#requirements)
[![Claude Code](https://img.shields.io/badge/Claude%20Code-mods-orange)](#claude-code-mods-in-practice)
[![YouTube](https://img.shields.io/badge/YouTube-@cyxj__ai-red)](https://www.youtube.com/@cyxj_ai)

**v0.1.0 · updated 2026-10-09 · tested on Claude Code 2.1.295 and macOS 26.7.1** · [Changelog](CHANGELOG.md)

<p align="center"><img src="docs/demo.gif" width="560" alt="cyxj-notch: hovering the MacBook notch expands a frosted-glass Claude Code dashboard"></p>

---

## What it does

When the mouse is away, the panel is exactly the size of the hardware notch, so you don't see it. Hover for 0.15 s and it grows out of the notch into a frosted-glass panel; move away and it tucks back in.

<p align="center"><img src="docs/expanded.png" width="560" alt="Expanded panel: usage limits, sessions, cache countdown, to-dos, publish cadence"></p>

| Section | What you see | Data comes from |
|---|---|---|
| Usage | 5-hour and weekly limit used (%), when each resets | `quota-status` mod |
| Cache | The idle session whose prompt cache expires soonest ("12 min left") | `quota-status` mod |
| Sessions | Every open Claude Code session: running / idle / just finished, step `3/5` with a progress bar; click a session to jump to its Terminal.app tab | `quota-status` + `task-progress` mods |
| Versions | Preview servers started by headless `claude -p` runs, click to open | `version-board` mod |
| To-dos | Items from a Markdown log, "waiting on you" first, then "AI can continue", then "waiting until a time" | `todo-pane` mod |
| Publish cadence | Days since the last release and the next scheduled one | `publish-pulse` mod |

Design notes:
- Collapsed = the notch itself (220 × 38 pt on a 16" MacBook Pro), no extra "ears", so it never looks like something stuck on top of the menu bar.
- The strip touching the notch is pure black and fades into `NSVisualEffectView` glass, so there's no visible seam with the hardware.
- Opening uses a slightly bouncy spring and staggers the sections in (fade + 8 pt drop + blur); closing is faster, with no bounce. Exits are shorter than entrances.

## How it compares

| | Claude Code [status line](https://code.claude.com/docs/en/statusline) | cyxj-notch |
|---|---|---|
| Where | Inside one terminal | Top of the screen, reachable from any app |
| Sessions shown | The one it's running in | Every open session, across terminals and projects |
| Usage limits (5 h / weekly) | Yes, via `rate_limits` | Yes, same data, written by the `quota-status` mod |
| Task progress, cache countdown, to-dos | Only what you script | Built in, from the five mods |
| Setup | One script in `settings.json` | Build the app + load five mods |

The two work together: `quota-status` keeps its own status line and also feeds the notch.

## Requirements

- macOS 14 or later (a notched MacBook is best; on other screens it uses a 200 pt "virtual notch" at the top center)
- Swift 5.9+ (Xcode or Command Line Tools)
- Claude Code v2.1.287 or later, where [mods](https://code.claude.com/docs/en/plugins/mods/overview) are on by default (tested on 2.1.295)
- A Pro or Max subscription for the usage section: Claude Code only reports the 5-hour and weekly windows to subscribers, and only after the session's first response ([docs](https://code.claude.com/docs/en/statusline#rate-limit-usage))

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

`CLAUDE_CODE_PLUGIN_DIRS` loads plugin folders the same way as `--plugin-dir` ([docs](https://code.claude.com/docs/en/plugins/mods/reference#settings-and-environment-variables)); to try a mod for one session instead, run `claude --plugin-dir mods/quota-status`.

`quota-status` and `task-progress` need no configuration. The last three variables are optional; without them the to-do and publish sections simply stay hidden.

To tag "waiting on you" with your own name instead of `我`:

```sh
defaults write com.xiaochen.notchdesk ownerName YourName
```

## Claude Code mods in practice

A **Claude Code mod** is a plugin with a *hooks module*: a JavaScript or TypeScript file whose functions (hooks) Claude Code calls on events such as `session.start`, `turn.complete`, `tool.call` and `ui.render`, and which can call the mod API (`$.ui.status`, `$.ui.toast`, `$.fs.write`, `$.session.usage()`, `$.clock.every`, `$.tool.register`, `$.env.get`, …). In an interactive session, mods loaded with `--plugin-dir` or `CLAUDE_CODE_PLUGIN_DIRS` reload when you save them. Official docs: [overview](https://code.claude.com/docs/en/plugins/mods/overview) · [create a mod](https://code.claude.com/docs/en/plugins/mods/create) · [reference](https://code.claude.com/docs/en/plugins/mods/reference) · [testing](https://code.claude.com/docs/en/plugins/mods/test) · [loading plugins](https://code.claude.com/docs/en/plugins/loading) · [example mods](https://github.com/anthropics/claude-code/tree/main/mods).

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
claude plugin validate .   # checks the manifest and lists the events and API calls the mod uses
claude plugin test .       # runs every *.test.ts / *.test.tsx; quota-status: 9 passed, 0 failed
```

All five mods pass both commands on Claude Code 2.1.295 (44 tests in total: quota-status 9, task-progress 11, version-board 13, todo-pane 2, publish-pulse 9).

Lessons from building these:
- **Keep the mod tiny and the file format boring.** One JSON object per file, with an `at` timestamp; the app treats a session as closed after 150 s without an update, so crashes clean themselves up.
- **Write, don't serve.** Writing files beats running a local server: nothing to keep alive, nothing to secure, and any app (SwiftUI, a menu-bar script, a web page) can read it.
- **Pure logic in its own file.** `quota.ts`, `bar.ts`, `scan.ts`, `parse.ts`, `pulse.ts` have no engine calls, so they're unit-tested without Claude Code running.
- **Command names must be ASCII letters, digits, `_` or `-`, up to 64 characters** ([limits](https://code.claude.com/docs/en/plugins/mods/reference#limits)). On 2.1.295 `/daiban` registers but `/待办` and `/café` are rejected at runtime, and `claude plugin validate` doesn't catch it.

## Data format

Everything lives in `~/.claude/notch/`:

| File | Shape |
|---|---|
| `sessions/<id>.quota.json` | `{ id, cwd, at, working, cache, limits: [{ kind: "five_hour" \| "seven_day", percentUsed, resetsAt }], tty?, app? }` |
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
Claude Code reuses a [prompt cache](https://code.claude.com/docs/en/prompt-caching#cache-lifetime) while you keep talking. Each cache hit resets the timer; once a session sits idle past the lifetime, the next message re-sends the whole context — slower and more expensive. By default the main conversation gets 1 hour on a Pro/Max subscription within plan usage, and 5 minutes with an API key, a cloud provider, or usage credits beyond the plan. The mod assumes 1 hour when Claude Code reports usage windows and 5 minutes otherwise; it doesn't detect a custom `promptCacheTtl`, or the switch to 5 minutes once you go past plan usage. The panel shows the idle session closest to expiring, so you know which one to continue first.

**Does it work without a notch?**
Yes. On a screen without a notch it uses a 200 pt-wide area at the top center of the main screen.

**Does it send any data anywhere?**
No. The app only reads local files in `~/.claude/notch/`; the mods only write there. No network calls.

**Can I use only some of the mods?**
Yes. Each section hides itself when its file is missing or stale.

## For AI coding assistants

[`llms.txt`](llms.txt) lists every file worth reading in this repo, with one line each.

## About

Write-up (in Chinese) on how it was designed and iterated: [给 MacBook 刘海装了个 Claude Code 面板](https://blog.xiaochens.com/blog/claude-code-notch-dashboard/).

Made by [@cyxj_ai](https://www.youtube.com/@cyxj_ai), a non-programmer building tools with Claude Code. More projects: [cyxj-groksearch](https://github.com/chenyuxiaojin/cyxj-groksearch) · [cyxj-hyperframes](https://github.com/chenyuxiaojin/cyxj-hyperframes) · [cyxj-remotion-starter](https://github.com/chenyuxiaojin/cyxj-remotion-starter)

## License

[MIT](LICENSE)
