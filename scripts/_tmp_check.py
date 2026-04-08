import json, sys
with open("/tmp/zuhd-feed-slim.json") as f:
    data = json.load(f)

interesting_multi = [0, 1, 3]
for i in interesting_multi:
    s = data["multiSourceStories"][i]
    title = s["title"]
    print(f"=== MULTI {i+1}: {title} ===")
    print(f"Category: {s.get('category')}")
    desc = s.get("description", "")[:300]
    print(f"Description: {desc}")
    print(f"Sources: {json.dumps(s.get('sources', []))}")
    print(f"Link: {s.get('link')}")
    print(f"PubDate: {s.get('pubDate')}")
    print(f"EventUri: {s.get('eventUri')}")
    print(f"EventCoverage: {s.get('eventCoverage')}")
    print(f"Concepts: {json.dumps(s.get('concepts', []))}")
    print(f"SentimentDivergence: {s.get('sentimentDivergence')}")
    print(f"Slug: {s.get('suggestedSlug')}")
    print()

interesting_niche = [0, 1, 7, 8, 9, 20, 24, 25, 26, 27, 29, 33, 34, 35, 36, 37, 19]
for i in interesting_niche:
    s = data["nicheStories"][i]
    title = s["title"]
    src = s.get("source", "?")
    print(f"=== NICHE {i+1}: {title} ({src}) ===")
    print(f"Category: {s.get('category')}")
    desc = s.get("description", "")[:300]
    print(f"Description: {desc}")
    print(f"Sources: {json.dumps(s.get('sources', []))}")
    print(f"Link: {s.get('link')}")
    print(f"PubDate: {s.get('pubDate')}")
    print(f"EventUri: {s.get('eventUri')}")
    print(f"EventCoverage: {s.get('eventCoverage')}")
    print(f"Concepts: {json.dumps(s.get('concepts', []))}")
    print(f"SentimentDivergence: {s.get('sentimentDivergence')}")
    print(f"Slug: {s.get('suggestedSlug')}")
    print()
