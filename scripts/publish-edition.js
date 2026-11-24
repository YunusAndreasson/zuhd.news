// The content cycle's build entry. Importing the SSG keeps its existing
// process-wide build lock through publication of both feed files.
import { existsSync, readdirSync } from 'node:fs'
import { basename, join } from 'node:path'
import { pathOf } from './lib/datasets.js'
import { ROOT } from './lib/paths.js'
import { starterCatalogue } from './lib/starter-articles.js'
import { captureFeedRevisions, publishFeedMetadata } from './lib/publisher-feed.js'

const revisions = await captureFeedRevisions(starterCatalogue, () => import('./build.js'))
// Publication consumes the captured revisions. Only editorial stages and the explicit
// maintenance command may update article frontmatter.
const fixtureDir = process.env.ZUHD_EXTRA_ARTICLES
const preview = !!fixtureDir || process.argv.includes('--preview')
const duplicateSlugs = new Set(fixtureDir ? readdirSync(fixtureDir)
  .filter(name => name.endsWith('.md') && existsSync(join(pathOf('articles'), name)))
  .map(name => basename(name, '.md')) : [])
publishFeedMetadata({
  api: join(ROOT, 'dist', 'api'), revisions, duplicateSlugs,
  signalPath: pathOf('marketSignalState'), preferencePath: preview ? null : pathOf('widgetExchange'),
})
