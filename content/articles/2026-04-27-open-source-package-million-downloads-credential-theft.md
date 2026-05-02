---
title: "Package Attack Stole Developer Keys"
date: "2026-04-27T21:04:03Z"
category: "tech"
location: "San Francisco"
lat: 37.77
lng: -122.42
sources:
  - name: "Ars Technica"
    url: "https://arstechnica.com/security/2026/04/open-source-package-with-1-million-monthly-downloads-stole-user-credentials/"
    country: "US"
    sentiment: -0.1
    angle: "catalogs PyPI supply-chain compromise: emphasizes CI/CD exposure and credential rotation across secret types"
eventCoverage: 0
concepts:
  - "Open-source software"
  - "Supply chain attack"
  - "GitHub Actions"
entities: []
---

San Francisco — elementary-data 0.23.3 harvested warehouse credentials and Secure Shell keys. A GitHub Actions flaw gave attackers signing keys, letting them push a malicious build of the genuine package — not a fake. Continuous integration runners are most exposed; anyone who ran 0.23.3 must rotate warehouse credentials, cloud keys, and Secure Shell keys.
