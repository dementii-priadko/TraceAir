function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function formatInlineMarkdown(value: string): string {
  return escapeHtml(value)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
}

export function renderMarkdown(markdown: string): string {
  const lines = markdown.replace(/\r/g, '').split('\n')
  const html: string[] = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index].trim()

    if (!line) {
      index += 1
      continue
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/)
    if (headingMatch) {
      const level = headingMatch[1].length
      html.push(
        `<h${level}>${formatInlineMarkdown(headingMatch[2])}</h${level}>`,
      )
      index += 1
      continue
    }

    if (/^[-*]\s+/.test(line)) {
      const items: string[] = []
      while (index < lines.length && /^[-*]\s+/.test(lines[index].trim())) {
        items.push(
          `<li>${formatInlineMarkdown(lines[index].trim().replace(/^[-*]\s+/, ''))}</li>`,
        )
        index += 1
      }
      html.push(`<ul>${items.join('')}</ul>`)
      continue
    }

    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = []
      while (index < lines.length && /^\d+\.\s+/.test(lines[index].trim())) {
        items.push(
          `<li>${formatInlineMarkdown(lines[index].trim().replace(/^\d+\.\s+/, ''))}</li>`,
        )
        index += 1
      }
      html.push(`<ol>${items.join('')}</ol>`)
      continue
    }

    const paragraph: string[] = [formatInlineMarkdown(line)]
    index += 1

    while (index < lines.length && lines[index].trim()) {
      paragraph.push(formatInlineMarkdown(lines[index].trim()))
      index += 1
    }

    html.push(`<p>${paragraph.join(' ')}</p>`)
  }

  return html.join('')
}
