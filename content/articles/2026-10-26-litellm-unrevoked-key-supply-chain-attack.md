---
title: "LiteLLM Key Left Live"
date: "2026-10-26T12:00:00Z"
category: "tech"
location: "United States"
lat: 39.83
lng: -98.58
sources:
  - name: "The Record"
    url: "https://therecord.media/litellm-hackers-ai-malware"
    country: "US"
    image: "http://cms.therecord.media/uploads/Lite_LLM_be1a113cd2.jpg"
    angle: "traces the attack to an unrevoked master key exposed in May, noting Wiz found credentials tested within hours"
    sentiment: -0.4
entities: []
subjects: []
venues: []
thermal: false
---

United States — Wiz counted about 49,000 downloads of a credential-stealing LiteLLM release.

LiteLLM removed an exposed configuration file in May but never revoked the master key inside it.

The key let an attacker grab a GitHub token for every LiteLLM repository, and the poisoned package sat on the Python Package Index for about 2 hours.

No affected organization has publicly confirmed a breach linked to the release.

LiteLLM told anyone who installed version 1.107.0 to assume theft and rotate every key the machine could reach.
