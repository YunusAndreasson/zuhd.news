---
title: "Default Setting Gave Root Access"
date: "2026-08-30T15:59:49Z"
category: "tech"
location: "San Francisco"
lat: 37.77
lng: -122.42
sources:
  - name: "Hacker News"
    url: "https://0xcc.io/posts/omarchy-root-creds/"
    country: "US"
    sentiment: -0.05
    angle: "explains docker socket vulnerability enabling session-level root escalation via docker group membership in default config"
concepts: []
entities: []
---

San Francisco — Any app on the desktop could become root, no password asked.

Anyone running Omarchy inherited that risk the moment they installed it, without being told.

A default Docker group membership let any user process command the root-owned Docker daemon to mount and read the entire filesystem.

Omarchy shipped a fix in version 4.0.1; users who haven't updated remain exposed.
