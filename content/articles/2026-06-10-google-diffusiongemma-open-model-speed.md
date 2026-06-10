---
title: "Google Releases Parallel-Decoding Text Model"
date: "2026-06-10T19:29:21Z"
category: "tech"
location: "Mountain View"
lat: 37.42
lng: -122.08
sources:
  - name: "Ars Technica"
    url: "https://arstechnica.com/google/2026/06/googles-latest-diffusiongemma-open-ai-model-comes-with-a-4x-speed-boost/"
    country: "US"
    sentiment: 0
    angle: "explains why text diffusion works for local use despite higher error rates, unlike autoregressive models for cloud deployment"
concepts:
  - "Autoregressive model"
  - "Artificial intelligence"
  - "Google"
entities:
  - mention: "Google"
    indicatorId: "stocks:GOOGL"
    kind: "stock"
---

Mountain View — DiffusionGemma generates whole text blocks, not tokens.

Standard models predict one token at a time; DiffusionGemma denoises a full block in parallel, reaching 4× speed and 1,000 tokens per second on an H100.

Google flags the model as experimental; a higher per-block error rate has kept diffusion text out of cloud production.
