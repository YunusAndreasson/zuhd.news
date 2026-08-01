// Workers-runtime globals that are not in `lib.dom` and are not Node.
//
// This is one API, so it is one declaration rather than a dependency.
// `@cloudflare/workers-types` is the right answer the moment functions/ or
// workers/ reach for a second Workers API — it carries the full signatures,
// including the handler and env types this file deliberately does not attempt.
// Until then, a package whose only job is to name `HTMLRewriter` would be the
// larger of the two mistakes.
//
// Only the members functions/s/[slug].js actually calls are declared. That is
// the point: an incomplete declaration fails loudly the day someone uses
// something else, which is the moment to reach for the real package. A
// permissive `any` would silently type nothing forever.
//
// functions/s/[slug].js lifts the <title> and the whole og:* block out of
// /a/{slug} to build the share page — see "Sharing, discovery, and the app" in
// CLAUDE.md.

interface HTMLRewriterElement {
  getAttribute(name: string): string | null
  setAttribute(name: string, value: string): void
  setInnerContent(content: string, options?: { html?: boolean }): void
  before(content: string, options?: { html?: boolean }): void
  after(content: string, options?: { html?: boolean }): void
  replace(content: string, options?: { html?: boolean }): void
  remove(): void
  onEndTag(handler: (end: { before(content: string, options?: { html?: boolean }): void }) => void): void
}

interface HTMLRewriterText {
  readonly text: string
  readonly lastInTextNode: boolean
  before(content: string, options?: { html?: boolean }): void
  after(content: string, options?: { html?: boolean }): void
  replace(content: string, options?: { html?: boolean }): void
  remove(): void
}

interface HTMLRewriterHandlers {
  element?(element: HTMLRewriterElement): void | Promise<void>
  text?(text: HTMLRewriterText): void | Promise<void>
}

declare class HTMLRewriter {
  on(selector: string, handlers: HTMLRewriterHandlers): HTMLRewriter
  onDocument(handlers: HTMLRewriterHandlers): HTMLRewriter
  transform(response: Response): Response
}
