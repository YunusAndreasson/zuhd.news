import yaml from 'js-yaml'

export function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  if (!match) return { meta: {}, body: content }
  // Strip trailing commas after quoted values — Claude occasionally generates them
  const cleaned = match[1].replace(/",\s*$/gm, '"')
  return { meta: yaml.load(cleaned) ?? {}, body: match[2].trim() }
}
