---
title: "Tiny Payment Exposes Bitcoin Wallets"
date: "2026-11-26T17:30:00Z"
category: "tech"
location: "United States"
lat: 39.83
lng: -98.58
sources:
  - name: "CoinDesk"
    url: "https://www.coindesk.com/tech/2026/11/26/a-tiny-payment-can-expose-the-ip-address-behind-a-bitcoin-wallet-developer-finds"
    country: "US"
    sentiment: -0.05
    image: "https://cdn.sanity.io/images/s3y3vcno/production/422bf0c58d3c5d984b8ee7f8a379b85250db7bc2-6016x4016.jpg?auto=format&fit=crop&crop=focalpoint&w=1200&h=675&q=75"
    angle: "shows a sub-35-cent payment exposes a node's IP: 30 of 30 test-network hits, untested on live Bitcoin"
concepts:
  - "Bitcoin Core"
  - "IP address"
  - "Privacy"
entities:
  - mention: "Bitcoin"
    indicatorId: "btc"
    kind: "crypto"
subjects: []
venues: []
thermal: false
starterReview: {"revision":"3d2d9ab339d48d5b9f7b74a06ac00af2cc086e8a15755fec5a3245c012b28ce8","domain":"technology","exclusions":[],"actors":"nonpartisan","measurement":"35 cents","sourceIndex":0,"subjectChart":null}
starterEligible: true
---

United States — 35 cents finds the computer behind a wallet.

Wallets built on Bitcoin Core, including Sparrow and Specter, share the exposure.

An unconfirmed payment gets re-announced after 12 to 36 hours, and only the node tracking that address does it.

In developer Abubakar Sadiq Ismail's tests, 30 of 30 attempts found the right computer, though none ran on Bitcoin's live network.

Contributor Martin Zumsande says the proposed, unreleased code fix only slightly raises the attacker's cost.
