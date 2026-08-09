import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { registerTools } from './tools.js'
import { registerResources } from './resources.js'
import { registerPrompts } from './prompts.js'
import { checkRateLimit } from './rate-limit.js'

const SERVER_CARD = {
  name: 'zuhd-mcp',
  description: 'Read-only MCP interface to zuhd.news — minimalist global news. Access articles, story context, source analysis, and geographic coverage.',
  version: '1.0.0',
  tools: [
    { name: 'get_briefing', description: "Today's top stories" },
    { name: 'get_articles', description: 'Articles by category' },
    { name: 'search_articles', description: 'Search by keyword' },
    { name: 'get_story_context', description: 'Story background and timeline' },
    { name: 'get_source_perspectives', description: 'Source diversity analysis' },
    { name: 'get_coverage_map', description: 'Geographic news distribution' }
  ],
  resources: [
    { uri: 'zuhd://meta', description: 'Site metadata and article counts' },
    { uri: 'zuhd://sources', description: 'All 40+ news sources' },
    { uri: 'zuhd://about', description: 'Editorial philosophy' }
  ],
  prompts: [
    { name: 'daily_briefing', description: 'Structured news briefing' },
    { name: 'story_deep_dive', description: 'Comprehensive topic analysis' }
  ]
}

function createServer() {
  const server = new McpServer(
    { name: 'zuhd-mcp', version: '1.0.0' },
    { capabilities: { logging: {} } }
  )
  registerTools(server)
  registerResources(server)
  registerPrompts(server)
  return server
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, Mcp-Session-Id, MCP-Protocol-Version'
}

export default {
  async fetch(request, env, _ctx) {
    const url = new URL(request.url)

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS })
    }

    // Server card discovery
    if (url.pathname === '/.well-known/mcp/server-card.json') {
      return Response.json(SERVER_CARD, {
        headers: { ...CORS_HEADERS, 'Cache-Control': 'public, max-age=3600' }
      })
    }

    // Health check
    if (url.pathname === '/health') {
      return Response.json({ status: 'ok', server: 'zuhd-mcp', version: '1.0.0' }, {
        headers: CORS_HEADERS
      })
    }

    // MCP endpoint
    if (url.pathname === '/mcp' || url.pathname === '/') {
      // Rate limiting
      const rl = await checkRateLimit(request, env)
      if (!rl.allowed) {
        return Response.json(
          { error: 'Rate limit exceeded. Try again later.' },
          { status: 429, headers: { ...CORS_HEADERS, ...rl.headers } }
        )
      }

      const server = createServer()
      const transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: undefined, // stateless
        enableJsonResponse: true
      })

      await server.connect(transport)
      const response = await transport.handleRequest(request)

      // Append CORS and rate limit headers
      const headers = new Headers(response.headers)
      for (const [k, v] of Object.entries(CORS_HEADERS)) headers.set(k, v)
      if (rl.headers) {
        for (const [k, v] of Object.entries(rl.headers)) headers.set(k, v)
      }

      return new Response(response.body, {
        status: response.status,
        headers
      })
    }

    return Response.json({ error: 'Not found. MCP endpoint is at /mcp' }, {
      status: 404,
      headers: CORS_HEADERS
    })
  }
}
