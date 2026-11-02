---
title: "Weak Keys Break TLS Trust"
date: "2026-10-20T19:47:35Z"
category: "tech"
location: "India"
lat: 20.59
lng: 78.96
sources:
  - name: "Ars Technica"
    url: "https://arstechnica.com/security/2026/10/the-internet-goes-on-high-alert-after-discovery-of-8-compromised-tls-certs/"
    country: "US"
    sentiment: -0.3
    image: "https://cdn.arstechnica.net/wp-content/uploads/2026/07/broken-encryption-lock-1152x648.jpg"
    angle: "emphasizes that the compromised eMudhra keys could mint trusted credentials for any site, and that Linux distributions and IoT devices make the fix slow"
concepts:
  - "Certificate authority"
  - "Transport Layer Security"
  - "eMudhra"
entities: []
subjects: []
venues: []
thermal: false
---

India — Eight certificates had private keys just 3-8 bits long.

Anyone could forge trusted credentials for any website, until browsers blocked all eight on Tuesday.

The intermediates belong to [India](country:IN)-based certificate authority eMudhra, and a message signed with one key proved the weakness.

Exploiting them needs an adversary-in-the-middle attack, and no transparency log shows malicious use yet.

Engineer Filippo Valsorda expects a cleanup bigger than Heartbleed, with Linux distributions and embedded devices lagging.
