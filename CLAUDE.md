# zuhd.news

Minimalist news site. Typography-first, no decoration, content speaks for itself.

## Key Documents

| Document | Location | Purpose |
|----------|----------|---------|
| Foundation manifesto | `foundation.md` | Philosophy, design principles, editorial voice — read this first |
| Foundation (Notion) | [Notion page](https://www.notion.so/Foundation-Manifesto-307e4123a255814cb5d5fac97ac210ac) | Same content, formatted in Notion |
| Project tasks | [Notion database](https://www.notion.so/307e4123a25581759d59ee259ae389ac) | All tasks with status, priority, phase |
| Notion skill | `~/.claude/commands/notion.md` | API templates and IDs for Notion operations |
| Project memory | `~/.claude/projects/-home-yunus-Work-zuhd-news/memory/MEMORY.md` | Persistent state across sessions |

## Architecture

- **Hosting:** Cloudflare Pages (static site, rebuilt on push)
- **Editorial engine:** Claude CLI runs every 3 hours via cron, full autopilot
- **Flow:** Claude sources news (Al Jazeera RSS to start) → writes 3-5 Smart Brevity articles → generates static HTML → pushes to repo → Cloudflare Pages rebuilds
- **Scope:** Global hard news only (politics, conflict, economics, climate, health)

## Current State

Track progress in Notion Project Tasks database. Query with `/notion` or check memory file for latest status.

## Key Decisions

- Serif-led typography (serif for body/headlines, sans-serif for UI)
- No images unless they inform. No hero banners. No decoration.
- No dark mode, no CMS, no database — just files
- English first
- Smart Brevity editorial format (Axios-style)

## Working With Notion

The Notion MCP server has a `parent` parameter serialization bug on page/database creation. Use `curl` for those operations. MCP works for search, reading, and appending blocks. See `/notion` skill for templates and IDs.
