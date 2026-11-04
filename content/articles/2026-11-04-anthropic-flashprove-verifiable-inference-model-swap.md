---
title: "Anthropic Open-Sources FlashProve"
date: "2026-11-04T09:53:45Z"
category: "tech"
location: "San Francisco"
lat: 37.77
lng: -122.42
sources:
  - name: "Zhidx"
    url: "https://zhidx.com/p/607361.html"
    country: "CN"
    image: "https://oss.zhidx.com/67a2776d89127f673d5d0e459b3fe4ea/6aea0500/uploads/2026/11/6aeae5a90189a_6aeae5a8f294b_6aeae5a8f2920_%E5%A4%B4%E5%9B%BE.png"
    angle: "reports Anthropic's FlashProve as a cryptographic check against model swapping, with the 70–95x GPU overhead as the cost caveat"
    sentiment: 0.1
concepts:
  - "Anthropic"
  - "FlashProve"
entities: []
subjects: []
venues: []
thermal: false
---

San Francisco — Anthropic's FlashProve verifies an AI answer in 17 seconds.

Developers renting a model cannot otherwise tell whether a provider swapped in a cheaper one.

On Llama 4 Maverick, a cryptographic proof lets a 24-thread CPU check the output against committed weights it never sees.

Proving still costs 70 to 95 times the graphics-chip time of ordinary inference, and it needs the provider's cooperation.

Anthropic released the code under Apache 2.0 so other researchers can reproduce it and cut the cost.
