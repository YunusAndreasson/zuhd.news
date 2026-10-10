#!/usr/bin/env node
// Measure body character counts for the cycle's new articles — gives the
// editor exact data on which articles need trimming. One line an article, on
// stdout, which the cycle puts into the editor's prompt. A file on the
// list that cannot be read gets no line. The line itself is
// `lib/body-lengths.js`.
import { readFileSync } from 'node:fs'
import { batchFiles } from './lib/article-files.js'
import { bodyLengthLine } from './lib/body-lengths.js'
import { runStage } from './lib/stage.js'

export function main() {
  const files = batchFiles()
  let measured = 0
  let over = 0
  for (const { rel, path } of files) {
    try {
      const line = bodyLengthLine(rel, readFileSync(path, 'utf8'))
      console.log(line)
      measured++
      if (line.startsWith('OVER')) over++
    } catch { /* not there: nothing to say about it */ }
  }
  return { counts: { listed: files.length, measured, over } }
}

await runStage(import.meta, 'body-lengths', main)
