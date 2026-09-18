---
title: "Nvidia Brings Rust To CUDA"
date: "2026-09-16T11:15:53Z"
category: "tech"
location: "Santa Clara"
lat: 37.35
lng: -121.96
sources:
  - name: "Hacker News"
    url: "https://developer.nvidia.com/blog/introducing-cuda-rust-two-tracks-for-writing-gpu-kernels/"
    country: "US"
    sentiment: 0.15
    angle: "foregrounds Rust's compile-time safety benefits in systems-layer AI, cites Nova driver and NVIDIA Dynamo as existing examples"
concepts:
  - "Nvidia"
  - "Rust"
  - "CUDA"
entities:
  - mention: "Nvidia"
    indicatorId: "stocks:NVDA"
    kind: "stock"
---

Santa Clara — Nvidia's new compiler routes Rust through PTX.

Rust's compile-time checks catch memory bugs that silently corrupt data in C++ kernels.

PTX is the same stable assembly target CUDA C++ already compiles to, so Rust kernels get full hardware access.

The move widens Nvidia's fifteen-year CUDA lock-in, which AMD and Intel have yet to break.
