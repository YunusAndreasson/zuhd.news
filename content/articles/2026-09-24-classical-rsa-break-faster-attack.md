---
title: "RSA Forgery Beats Factoring"
date: "2026-09-24T11:15:44Z"
category: "tech"
location: "San Diego"
lat: 32.72
lng: -117.16
sources:
  - name: "Ars Technica"
    url: "https://arstechnica.com/security/2026/09/theres-a-new-way-to-break-rsa-thats-faster-than-anything-weve-seen-before/"
    country: "US"
    sentiment: 0
    angle: "details attack feasibility: generating 243 signatures equals Cloudflare's daily traffic, keys rotate but don't eliminate risk"
concepts:
  - "RSA (cryptosystem)"
  - "Nadia Heninger"
  - "Privacy Pass"
entities:
  - mention: "Apple"
    indicatorId: "stocks:AAPL"
    kind: "stock"
  - mention: "Cloudflare"
    indicatorId: "stocks:NET"
    kind: "stock"
---

San Diego — Forging an RSA signature took 1,380 core-years.

The attack cuts 1024-bit RSA security from 2^80 operations to 2^65 without factoring the key.

It runs a special number field sieve against a signing oracle, so it works only on blind-signature, or textbook, RSA.

The authors stress that RSA using PKCS or PSS padding, the overwhelming majority, is not exposed.

Privacy Pass, used by Apple and Cloudflare, is the best-known target, needing 2^43 signatures from a compromised server.
