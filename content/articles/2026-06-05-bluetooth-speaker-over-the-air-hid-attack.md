---
title: "Bluetooth Speaker Becomes PC Backdoor"
date: "2026-06-05T21:00:29Z"
category: "tech"
location: "Singapore"
lat: 1.35
lng: 103.82
sources:
  - name: "Ars Technica"
    url: "https://arstechnica.com/security/2026/06/highly-reviewed-speaker-can-be-hacked-over-the-air-to-infect-connected-devices/"
    country: "US"
    sentiment: -0.05
    angle: "reconstructs exploitation chain: USB descriptor spoofing + HID keyboard impersonation + over-the-air command injection"
eventCoverage: 0
concepts:
  - "Security hacker"
  - "Firmware"
  - "Human interface device"
  - "USB"
  - "Bluetooth"
entities:
  - mention: "Creative Technologies"
    indicatorId: "stocks:C6L.SI"
    kind: "stock"
---

[Singapore](country:SG) — A soundbar is now a remote code-execution vector.

Rasmus Moorats found the Sound Blaster Katana V2X accepts unsigned firmware over Bluetooth, registers as a keyboard, and injects arbitrary commands into connected PCs.

Creative Technologies denied any vulnerability; Bluetooth stays active in sleep mode with no disable option.
