---
title: "EDK2 Flaw Hits Server Firmware"
date: "2026-10-27T20:25:55Z"
category: "tech"
location: "United States"
lat: 39.80
lng: -98.60
sources:
  - name: "Ars Technica"
    url: "https://arstechnica.com/security/2026/10/code-execution-flaw-in-uefi-firmware-threatens-most-servers-on-planet-earth/"
    country: "US"
    sentiment: -0.35
    image: "https://cdn.arstechnica.net/wp-content/uploads/2024/04/malware.jpg"
    angle: "frames the CVE-2026-97631 EDK2 flaw as hitting pre-OS boot code that precedes Secure Boot, and notes Microsoft's Project Mu fork inherited it"
concepts:
  - "TianoCore EDK II"
  - "UEFI"
entities:
  - mention: "AMD"
    indicatorId: "stocks:AMD"
    kind: "stock"
  - mention: "Microsoft"
    indicatorId: "stocks:MSFT"
    kind: "stock"
  - mention: "Amazon"
    indicatorId: "stocks:AMZN"
    kind: "stock"
subjects: []
venues: []
thermal: false
---

United States — A 16-year-old bug runs attacker code before Secure Boot loads.

Virtually every server firmware maker, including AMI, Insyde and Phoenix, builds on the flawed code.

The 9.5-rated bug overflows a 504-byte buffer in the network-boot driver when an oversized error message arrives.

Attackers must already be on the network, and Eclypsium's Jesse Michael says each exploit needs tuning per firmware build.

The fix is public, but AMD, Microsoft and Amazon did not answer questions about their exposure.
