---
title: "Linux 7.0 Halves PostgreSQL Speed"
date: "2026-04-05T00:13:55Z"
category: "tech"
location: "Seattle"
lat: 47.61
lng: -122.33
sources:
  - name: "Hacker News"
    url: "https://www.phoronix.com/news/Linux-7.0-AWS-PostgreSQL-Drop"
    country: "US"
eventCoverage: null
concepts:
  - "Linux kernel"
  - "PostgreSQL"
  - "AWS"
  - "Performance regression"
---

Seattle — Linux 7.0 halved PostgreSQL throughput on AWS.

An AWS engineer traced it to scheduler changes not tested against database I/O workloads.

Fixing the regression risks breaking other workloads; no patch has been released.
