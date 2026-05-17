---
title: "Adobe Hijacks System DNS Config"
date: "2026-04-06T17:38:30Z"
category: "tech"
location: "San Jose"
lat: 37.34
lng: -121.89
sources:
  - name: "Hacker News"
    url: "https://www.osnews.com/story/144737/adobe-secretly-modifies-your-hosts-file-for-the-stupidest-reason/"
    country: "US"
concepts:
  - "Adobe"
  - "Creative Cloud"
  - "Hosts file"
---

San Jose — Adobe silently edited users' system hosts files.

Adobe's installer writes to the system hosts file — the DNS-level config admins rely on for security — rather than check the registry.

Sysadmins use the hosts file to block malware; Adobe has repurposed it as a private installation flag.
