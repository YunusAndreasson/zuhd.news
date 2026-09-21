---
title: "OpenAI Ad Cookie Tracks Users"
date: "2026-09-20T15:18:44Z"
category: "tech"
location: "San Francisco"
lat: 37.77
lng: -122.42
sources:
  - name: "Hacker News"
    url: "https://www.buchodi.com/chatgpt-now-knows-what-you-do-on-other-websites-via-ad-collector/"
    country: "US"
    sentiment: -0.45
    angle: "reverse-engineers __obi cookie mechanism with JWT auth; verifies tracking across 936 advertiser pixels on 1,029 hostnames"
concepts:
  - "OpenAI"
  - "ChatGPT"
  - "Online advertising"
entities: []
---

San Francisco — OpenAI's ad cookie ties ChatGPT accounts to advertiser websites.

OpenAI can connect what users do on those sites to their ChatGPT account, the researcher found.

The browser attaches the __obi cookie when loading an advertiser's OpenAI script, before any OpenAI code runs.

The signed token expires in 60 seconds, but the cookie it sets lasts a year.

The researcher logged 936 advertiser pixels across 1,029 hostnames over several months.
