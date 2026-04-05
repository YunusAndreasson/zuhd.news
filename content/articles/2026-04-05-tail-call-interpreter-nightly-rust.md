---
title: "Rust Gets Guaranteed Tail Calls"
date: "2026-04-05T15:18:01Z"
category: "tech"
location: "San Francisco"
lat: 37.77
lng: -122.42
sources:
  - name: "Hacker News"
    url: "https://www.mattkeeter.com/blog/2026-04-05-tailcall/"
    country: "US"
eventCoverage: null
concepts:
  - "Rust"
  - "Tail call optimization"
  - "Programming language"
  - "Interpreter"
---

San Francisco — Rust nightly gains guaranteed tail calls via `become`. Tail-call elimination lets recursive interpreters run indefinitely without stack overflow — turning toy implementations into production-grade language runtimes. `become` is nightly-only; stabilization will determine when it reaches the compiler that millions already use.
