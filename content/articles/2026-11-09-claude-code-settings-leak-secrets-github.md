---
title: "Claude Code Files Leak Secrets"
date: "2026-11-09T17:24:26Z"
category: "tech"
location: "United States"
lat: 39.83
lng: -98.58
sources:
  - name: "Ars Technica"
    url: "https://arstechnica.com/ai/2026/11/claude-code-settings-files-expose-thousands-of-secrets-on-github/"
    country: "US"
    sentiment: -0.45
    image: "https://cdn.arstechnica.net/wp-content/uploads/2026/11/claude-github-leaks-1152x648.jpg"
    angle: "traces the leak to Claude Code storing 'don't ask again' approvals verbatim in .claude/settings.local.json, which the repo-level gitignore misses"
concepts:
  - "API"
  - "GitHub"
  - "Password"
  - "Shell (computing)"
  - "Software repository"
entities: []
subjects: []
venues: []
thermal: false
---

United States — Over 100,000 Claude Code settings files sit on public GitHub.

About 1,100, from 63 organizations, held passwords, access tokens or private keys, security firm Apiiro found.

Choosing the don't-ask-again option writes the approved command, secrets included, into a settings file that can reach GitHub.

Claude Code's Boris Cherny said the files should almost never be checked in.

Cherny's team is weighing built-in secret scanning, though gitleaks and TruffleHog missed 215 of the secrets.
