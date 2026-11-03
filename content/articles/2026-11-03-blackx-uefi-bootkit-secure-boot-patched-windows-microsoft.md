---
title: "BlackX Bootkit Bypasses Secure Boot"
date: "2026-11-03T16:03:13Z"
category: "tech"
location: "United States"
lat: 39.83
lng: -98.58
sources:
  - name: "Ars Technica"
    url: "https://arstechnica.com/security/2026/11/uefi-bootkit-infected-fully-patched-windows-machines-is-microsoft-to-blame/"
    country: "US"
    sentiment: -0.3
    image: "https://cdn.arstechnica.net/wp-content/uploads/2020/10/malware-1000x648.jpg"
    angle: "blames Microsoft's unclear Secure Boot guidance, not unpatched systems, for BlackX infecting fully updated Windows machines"
concepts:
  - "BlackX"
  - "Microsoft"
  - "Kaspersky"
entities:
  - mention: "Microsoft"
    indicatorId: "stocks:MSFT"
    kind: "stock"
subjects: []
venues: []
thermal: false
---

United States — Kaspersky found BlackX infecting fully patched Windows machines.

Bootkits can survive a Windows reinstall when the infected boot partition remains intact.

Microsoft's 2023 and 2024 patches left the old signing certificate trusted until administrators manually revoke it.

Microsoft held back enforcement because early revocation could leave millions of devices unbootable.

Microsoft's guidance does not say whether home Windows users need to take the extra step.
