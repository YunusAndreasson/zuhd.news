---
title: "Mullvad Exit IPs Fingerprint Users"
date: "2026-05-15T02:35:35Z"
category: "tech"
location: "Stockholm"
lat: 59.33
lng: 18.07
sources:
  - name: "Hacker News"
    url: "https://tmctmt.com/posts/mullvad-exit-ips-as-a-fingerprinting-vector/"
    country: "US"
    sentiment: -0.45
    angle: "reveals Mullvad's deterministic exit IP assignment creates fingerprinting vulnerability despite key rotation, pools of 8-91 IPs per server"
eventCoverage: 268
concepts:
  - "Virtual private network"
  - "Device fingerprint"
  - "Mullvad"
  - "Privacy"
entities: []
---

Stockholm — Mullvad's exit-IP pool narrows to 284 identifiable combinations.

Each WireGuard key occupies the same percentile slot across all servers, creating a stable cross-site fingerprint regardless of server choice.

Any virtual private network with a small advertised exit-IP pool shares this property, independent of privacy claims.
