export function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  if (!match) return { meta: {}, body: content }

  const meta = {}
  const lines = match[1].split('\n')
  let i = 0

  while (i < lines.length) {
    const line = lines[i]
    const idx = line.indexOf(':')
    if (idx === -1) { i++; continue }

    const key = line.slice(0, idx).trim()
    const value = line.slice(idx + 1).trim().replace(/^["']|["']$/g, '')

    // Check if next line starts an array
    if (value === '' && i + 1 < lines.length && lines[i + 1].trimStart().startsWith('- ')) {
      const arr = []
      i++
      while (i < lines.length && lines[i].trimStart().startsWith('- ')) {
        const itemLine = lines[i].trimStart().slice(2).trim()
        if (itemLine.includes(': ')) {
          // Object item — collect key-value pairs
          const obj = {}
          const firstIdx = itemLine.indexOf(': ')
          obj[itemLine.slice(0, firstIdx).trim()] = itemLine.slice(firstIdx + 2).trim().replace(/^["']|["']$/g, '')
          i++
          while (i < lines.length && /^\s{4,}\w/.test(lines[i])) {
            const propLine = lines[i].trim()
            const propIdx = propLine.indexOf(': ')
            if (propIdx !== -1) {
              obj[propLine.slice(0, propIdx).trim()] = propLine.slice(propIdx + 2).trim().replace(/^["']|["']$/g, '')
            }
            i++
          }
          arr.push(obj)
        } else {
          // Simple string value
          arr.push(itemLine.replace(/^["']|["']$/g, ''))
          i++
        }
      }
      meta[key] = arr
    } else {
      meta[key] = value
      i++
    }
  }

  return { meta, body: match[2].trim() }
}
