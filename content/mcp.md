Connect your AI assistant to zuhd.news.

The MCP server provides structured access to articles, story context, source analysis, and geographic coverage. Read-only. No account required.

## Connect

Endpoint: **https://mcp.zuhd.news/mcp**

In Claude Desktop, Cursor, or any MCP client, add zuhd-news as a remote server with the URL above. No authentication needed.

## Tools

**get_briefing** — Today's top stories across all categories. Optional focus parameter to narrow by category.

**get_articles** — Retrieve articles by category. Parameters: category (politics, economy, science, tech), limit (1-30), full (boolean for complete text).

**search_articles** — Keyword search across titles, concepts, locations, and content. Parameters: query (required), category (optional), limit (1-30).

**get_story_context** — Historical timeline and background for a story thread. Parameters: thread_id or article_slug.

**get_source_perspectives** — Source diversity analysis: which countries cover a story, sentiment divergence, missing perspectives. Parameters: article_slug or thread_id.

**get_coverage_map** — Geographic distribution of news from the last 72 hours. Optional region bounding box filter.

## Resources

**zuhd://meta** — Article counts per category, last update time, briefing status.

**zuhd://sources** — All 41 sources with countries, regions, and types.

**zuhd://about** — Editorial philosophy and principles.

## Prompts

**daily_briefing** — Structured morning briefing. Optional focus argument.

**story_deep_dive** — Comprehensive topic analysis with source perspectives. Requires topic argument.

## Rate limits

A burst of 30 requests, then 10 per minute as the bucket refills. No key required.

Every response carries **X-RateLimit-Remaining**. A 429 carries **X-RateLimit-Reset**, in seconds.

For higher limits, email [contact@zuhd.news](mailto:contact@zuhd.news) with your use case.

## Discovery

Server card at **https://mcp.zuhd.news/.well-known/mcp/server-card.json**
