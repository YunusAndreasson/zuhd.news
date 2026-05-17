---
title: "Germany's .de Hit DNSSEC Failure"
date: "2026-05-05T20:16:35Z"
category: "tech"
location: "Frankfurt"
lat: 50.11
lng: 8.68
sources:
  - name: "DENIC"
    url: "https://status.denic.de/pages/incident/592577eab611ce1e0d00046f/69fa60ef9d12f5057a974f38"
    country: "DE"
    sentiment: 0
entities: []
---

Frankfurt — [Germany](country:DE)'s .de top-level domain went dark for Domain Name System security resolvers.

A DENIC signing error broke the cryptographic chain-of-trust, causing resolvers to reject every .de query.

DENIC restored service by rollback within hours; no safe key-rollover procedure is yet standardised across registries.
