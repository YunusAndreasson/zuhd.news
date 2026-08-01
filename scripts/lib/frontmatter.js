// Named import, not default: js-yaml 5's ESM build dropped the default export.
import { load } from 'js-yaml'

/**
 * Split an article file into its frontmatter and its prose.
 *
 * `meta` is annotated rather than inferred because js-yaml 5 types `load` as
 * returning `object`, where 4 returned `any` — so every `meta.category` and
 * `meta.sources` downstream became a typecheck error the moment the dependency
 * moved. The shape genuinely is open (the pipeline adds fields to frontmatter
 * without touching this function), so the honest annotation is an index
 * signature rather than a struct that would go stale.
 *
 * @param {string} content
 * @returns {{ meta: Record<string, any>, body: string }}
 */
export function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  if (!match) return { meta: {}, body: content }
  // Strip trailing commas after quoted values — Claude occasionally generates them
  const cleaned = match[1].replace(/",\s*$/gm, '"')
  // js-yaml 5 throws on an empty document where 4 returned undefined, so the
  // `?? {}` that used to cover an article with an empty `---\n---` block no
  // longer runs. Answering it here rather than with a try/catch keeps a real
  // syntax error loud: this pipeline writes articles from a model, and a
  // frontmatter block that does not parse is exactly the failure the build
  // must not swallow. (The one file in 7,320 that js-yaml 5 rejected was a URL
  // wrapped across two lines, which 4 had been folding into a trailing space
  // inside the published href — a live defect, now fixed in the article.)
  if (!cleaned.trim()) return { meta: {}, body: match[2].trim() }
  return { meta: load(cleaned) ?? {}, body: match[2].trim() }
}
