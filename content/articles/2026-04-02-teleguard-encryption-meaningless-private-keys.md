---
title: "TeleGuard Encryption Exposed as Broken"
date: "2026-04-02T13:47:24Z"
category: "tech"
location: "Zurich"
lat: 47.38
lng: 8.54
sources:
  - name: "404 Media"
    url: "https://www.404media.co/a-secure-chat-apps-encryption-is-so-bad-it-is-meaningless/"
    country: ""
eventCoverage: null
concepts:
  - "End-to-end encryption"
  - "Cryptography"
  - "Private key"
  - "Information security"
---

Zurich — TeleGuard sends private encryption keys to its servers. The app uses hardcoded salt and nonce values: TeleGuard itself and any attacker with a user's public ID can pull the private key via API and decrypt all messages. Over 1 million users are exposed; the flaw is architectural and requires a full cryptographic redesign.
