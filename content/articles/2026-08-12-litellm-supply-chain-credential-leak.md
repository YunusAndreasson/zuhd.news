---
title: "AI Proxy Leaks Terabytes"
date: "2026-08-12T21:43:21Z"
category: "tech"
location: "San Francisco"
lat: 37.77
lng: -122.42
sources:
  - name: "Ars Technica"
    url: "https://arstechnica.com/security/2026/08/terabytes-of-credentials-leaked-in-massive-supply-chain-attack/"
    country: "US"
    sentiment: -0.05
    angle: "maps supply-chain cascade (Trivy → LiteLLM → 2,500 organizations), cites 40-minute extraction window from PyPI, identifies teenage-led TeamPCP attacker"
concepts:
  - "Supply chain attack"
  - "Credential"
entities:
  - mention: "Microsoft"
    indicatorId: "stocks:MSFT"
    kind: "stock"
  - mention: "Nvidia"
    indicatorId: "stocks:NVDA"
    kind: "stock"
---

San Francisco — A 40-minute breach exposed secrets from 2,500 firms.

Microsoft and Nvidia weren't hit directly, since the trust flowed through a shared open-source dependency.

Attackers compromised LiteLLM, a proxy holding every AI API key a firm uses, exfiltrating 434,000 pipelines' credentials.

Researchers are urging affected firms to rotate every cloud and pipeline credential now.
