---
title: "Linux Eyes End of Fork and Exec"
date: "2026-06-06T14:34:20Z"
category: "tech"
location: "San Francisco"
lat: 37.77
lng: -122.42
sources:
  - name: "LWN.net"
    url: "https://lwn.net/SubscriberLink/1076018/16f01bbbb8e0d1f0/"
    country: "US"
    sentiment: 0
    angle: "explains fork()/exec() inefficiency via memory-copy waste, proposes 'spawn templates' as kernel optimization alternative"
eventCoverage: null
concepts: []
entities: []
---

San Francisco — Fork()'s spawn-templates successor was rejected in current form.

Fork() copies the parent's whole address space; the child discards it on exec() — a cost that multiplies on multithreaded systems.

A "spawn templates" proposal was rejected in current form; the search for a leaner primitive continues.
