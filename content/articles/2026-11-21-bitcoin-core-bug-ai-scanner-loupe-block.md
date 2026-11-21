---
title: "Bitcoin Core Patches Stall Bug"
date: "2026-11-21T06:16:42Z"
category: "tech"
location: "United States"
lat: 39.83
lng: -98.58
sources:
  - name: "CoinDesk"
    url: "https://www.coindesk.com/markets/2026/11/21/bitcoin-nodes-could-be-stalled-by-repeating-one-id-50-000-times-ai-found-the-bug"
    country: "US"
    sentiment: 0.05
    image: "https://cdn.sanity.io/images/s3y3vcno/production/0fd512cd2b3b63152562fab784b9d94b8b8b56ea-1500x994.jpg?auto=format&fit=crop&crop=focalpoint&w=1200&h=675&q=75"
    angle: "reports the bug was found by Block's Loupe AI scanner and credits the discovery to an automated AI scan, with the exchange-deposit and miner-waste consequences spelled out"
concepts:
  - "Bitcoin Core"
  - "Block"
entities:
  - mention: "Bitcoin"
    indicatorId: "btc"
    kind: "crypto"
subjects: []
venues: []
thermal: false
---

United States — AI found a way to stall Bitcoin nodes.

A stalled node processes no new blocks, so exchanges could delay deposits and miners waste work.

Repeating one transaction identifier 50,000 times makes a node redo expensive parent checks, stalling it over a dozen seconds per message.

Developers rated the bug medium severity, and Block's Spiral unit found it with its Loupe scanner.

Nodes on version 29.0 or later stay exposed until operators upgrade to 30.5 or 31.3.
