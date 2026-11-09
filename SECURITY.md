# Security policy

zuhd.news is a static site on Cloudflare Pages, an MCP server (a Worker that
reads the published articles) and an iPhone and Android app. Please report a
vulnerability privately.

## Reporting a vulnerability

Use GitHub's private reporting:
[report a vulnerability](https://github.com/YunusAndreasson/zuhd.news/security/advisories/new).
Please don't open a public issue.

Include the URL or file, what you did, what happened, and what an attacker
would gain. A fix is coordinated with you before anything is published, and
you're credited in the advisory unless you'd rather not be.

## Supported versions

What is live at https://zuhd.news and the latest release of the app in the
App Store and Google Play. Fixes land on `master`.

## Scope

In scope: the site and its response headers, the MCP server in `workers/mcp/`,
the Pages Functions in `functions/`, the app in `mobile/`, and this
repository's workflows.

Out of scope: vulnerabilities in Cloudflare's platform, Expo or other
dependencies (report those upstream), and findings that need a compromised
browser or device.
