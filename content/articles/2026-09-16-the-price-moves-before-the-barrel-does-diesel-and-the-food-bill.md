---
title: "Oil Shock Hits Diesel, Food"
date: "2026-09-16T16:06:50Z"
category: "economy"
location: "London"
lat: 51.51
lng: -0.13
sources:
  - name: "BBC"
    url: "https://www.bbc.com/news/articles/cqlym3wye1ero"
    country: "GB"
    sentiment: 0
    angle: "maps economic cascade: $108/barrel (50% up from June) → 170p/litre UK petrol → Ofgem 25% energy cap rise (£440/year) → food and mortgage cost risks"
  - name: "Investing.com"
    url: "https://www.investing.com/analysis/oil-futures-fall-as-saudi-crude-exports-are-rerouted-and-us-inventories-rebuild-200687799"
    country: "IN"
    sentiment: -0.35
  - name: "RT"
    url: "https://www.rt.com/news/645782-saudi-arabia-cancels-oil-shipments-europe/"
    country: "RU"
    sentiment: -0.05
    angle: "reports Saudi cancellations to European customers, loss of East-West pipeline bypass, Riyadh's renewed dependence on Hormuz despite tanker traffic constraints"
eventCoverage: 877
concepts:
  - "Saudi Arabia"
  - "Strait of Hormuz"
indicators:
  - id: "brent"
    label: "Brent crude"
    level: 109.5
    unit: "$/bbl"
    cadence: "daily"
    recent:
      pct: 22
      over: "7 days"
    wider:
      pct: 28.1
      over: "30 days"
    asOf: "2026-09-09"
    ageDays: 8
sentimentDivergence: 0.56
entities:
  - mention: "Strait of Hormuz"
    indicatorId: "cp:hormuz"
    kind: "chokepoint"
  - mention: "Oil"
    indicatorId: "brent"
    kind: "commodity"
---

London — US diesel reached $6.31 a gallon, a record.

Diesel powers freight and irrigation, so the shock lands hardest as food inflation.

Oil is priced on expected barrels: drone strikes shut [Saudi Arabia](country:SA)'s Red Sea pipeline, moving prices before supply actually fell.

Chatham House says repairs could take eight weeks, as Houthi advances threaten the Red Sea route.
