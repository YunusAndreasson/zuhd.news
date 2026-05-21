---
title: "C Compilers Delete Safe Code"
date: "2026-05-20T06:07:22Z"
category: "tech"
location: "Stockholm"
lat: 59.33
lng: 18.07
sources:
  - name: "Hacker News"
    url: "https://blog.habets.se/2026/05/Everything-in-C-is-undefined-behavior.html"
    country: "US"
    sentiment: -0.4
    angle: "opens with Cardinal Richelieu analogy, cites prior SOX-violation argument, claims hidden undefined-behavior categories exceed known ones"
eventCoverage: 0
concepts:
  - "C programming language"
  - "Undefined behavior"
  - "Compiler optimization"
  - "Memory safety"
entities: []
---

Stockholm — Signed-overflow guards silently vanish under C compilation.

The C standard permits compilers to treat undefined behavior as impossible, removing overflow safety checks even without optimization.

Rust in Linux and Swift at Apple exist because C's undefined-behavior rules cannot be worked around.
