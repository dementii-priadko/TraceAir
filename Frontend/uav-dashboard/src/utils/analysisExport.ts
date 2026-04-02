import type { FlightAnalysis } from '../types/flight'

function sanitizeFilePart(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function downloadTextFile(
  filename: string,
  content: string,
  mimeType: string,
): void {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function buildAnalysisMarkdown(
  analysis: FlightAnalysis,
  flightId: string,
  firmwareLabel: string,
  fileLabel?: string,
): string {
  return [
    '# TraceAir AI Analysis',
    '',
    `- File: ${fileLabel || flightId || 'analysis'}`,
    `- Firmware: ${firmwareLabel}`,
    `- Model: ${analysis.model || 'unknown'}`,
    '',
    analysis.summary.trim(),
    '',
  ].join('\n')
}

function buildAnalysisFilename(
  flightId: string,
  firmwareLabel: string,
  extension: 'md' | 'pdf',
): string {
  const safeFirmware = sanitizeFilePart(firmwareLabel) || 'flight'
  const safeFlightId = sanitizeFilePart(flightId) || 'analysis'
  return `${safeFirmware}-${safeFlightId}-ai-analysis.${extension}`
}

export function exportAnalysisMarkdown(
  analysis: FlightAnalysis,
  flightId: string,
  firmwareLabel: string,
  fileLabel?: string,
): void {
  downloadTextFile(
    buildAnalysisFilename(flightId, firmwareLabel, 'md'),
    buildAnalysisMarkdown(analysis, flightId, firmwareLabel, fileLabel),
    'text/markdown;charset=utf-8',
  )
}

export async function exportAnalysisPdf(
  analysis: FlightAnalysis,
  flightId: string,
  firmwareLabel: string,
  fileLabel?: string,
): Promise<void> {
  const { jsPDF } = await import('jspdf')
  const filename = buildAnalysisFilename(flightId, firmwareLabel, 'pdf')
  const displayLabel = fileLabel || flightId || 'analysis'
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'a4',
    compress: true,
  })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const marginX = 54
  const topY = 60
  const bottomY = pageHeight - 54
  const maxWidth = pageWidth - marginX * 2
  let cursorY = topY

  const ensureSpace = (requiredHeight: number) => {
    if (cursorY + requiredHeight <= bottomY) return
    doc.addPage()
    cursorY = topY
  }

  const drawSimpleLines = (
    text: string,
    options: {
      font: 'helvetica' | 'courier'
      style: 'normal' | 'bold'
      size: number
      color: [number, number, number]
      lineHeight: number
      indent?: number
    },
  ) => {
    const indent = options.indent ?? 0
    doc.setFont(options.font, options.style)
    doc.setFontSize(options.size)
    doc.setTextColor(...options.color)
    const lines = doc.splitTextToSize(text, maxWidth - indent) as string[]
    const blockHeight = lines.length * options.lineHeight
    ensureSpace(blockHeight)
    doc.text(lines, marginX + indent, cursorY)
    cursorY += blockHeight
  }

  const drawInlineParagraph = (
    text: string,
    options: {
      color: [number, number, number]
      size: number
      lineHeight: number
      indent?: number
    },
  ) => {
    const indent = options.indent ?? 0
    const segments = parseInlineMarkdown(text)
    const availableWidth = maxWidth - indent
    const lines = wrapInlineSegments(doc, segments, availableWidth, options.size)
    const blockHeight = lines.length * options.lineHeight
    ensureSpace(blockHeight)

    let y = cursorY
    for (const line of lines) {
      let x = marginX + indent
      for (const segment of line) {
        doc.setFont(segment.font, segment.style)
        doc.setFontSize(options.size)
        doc.setTextColor(...options.color)
        doc.text(segment.text, x, y)
        x += doc.getTextWidth(segment.text)
      }
      y += options.lineHeight
    }

    cursorY += blockHeight
  }

  doc.setFont('courier', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(207, 127, 69)
  doc.text('TRACEAIR REPORT', marginX, cursorY)
  cursorY += 20

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(24)
  doc.setTextColor(28, 23, 19)
  doc.text('AI Analysis', marginX, cursorY)
  cursorY += 28

  drawSimpleLines(
    'AI-generated interpretation of the selected mission log for post-flight review and export.',
    {
      font: 'helvetica',
      style: 'normal',
      size: 11,
      color: [111, 98, 86],
      lineHeight: 15,
    },
  )
  cursorY += 14

  const metadata = [
    ['File', displayLabel],
    ['Firmware', firmwareLabel],
    ['Model', analysis.model || 'unknown'],
  ] as const

  for (const [label, value] of metadata) {
    drawSimpleLines(`${label}: ${normalizePdfText(value)}`, {
      font: 'helvetica',
      style: 'bold',
      size: 11,
      color: [60, 52, 46],
      lineHeight: 15,
    })
    cursorY += 2
  }

  cursorY += 10
  ensureSpace(18)
  doc.setDrawColor(210, 191, 170)
  doc.line(marginX, cursorY, pageWidth - marginX, cursorY)
  cursorY += 22

  const blocks = parseMarkdownBlocks(analysis.summary)
  for (const block of blocks) {
    if (block.type === 'spacer') {
      cursorY += block.size
      continue
    }

    if (block.type === 'heading') {
      const fontSize = block.level === 1 ? 18 : block.level === 2 ? 15 : 13
      drawSimpleLines(block.text, {
        font: 'helvetica',
        style: 'bold',
        size: fontSize,
        color: [28, 23, 19],
        lineHeight: fontSize + 5,
      })
      cursorY += 8
      continue
    }

    if (block.type === 'list_item') {
      const prefix = block.ordered ? `${block.index}. ` : '- '
      drawInlineParagraph(`${prefix}${block.text}`, {
        size: 11,
        color: [60, 52, 46],
        lineHeight: 16,
        indent: 10,
      })
      cursorY += 4
      continue
    }

    drawInlineParagraph(block.text, {
      size: 11,
      color: [60, 52, 46],
      lineHeight: 16,
    })
    cursorY += 8
  }

  doc.save(filename)
}

type PdfBlock =
  | { type: 'heading'; level: number; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list_item'; text: string; ordered: boolean; index?: number }
  | { type: 'spacer'; size: number }

type InlineSegment = {
  text: string
  font: 'helvetica' | 'courier'
  style: 'normal' | 'bold'
}

function parseMarkdownBlocks(markdown: string): PdfBlock[] {
  const lines = markdown.replace(/\r/g, '').split('\n')
  const blocks: PdfBlock[] = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index].trim()

    if (!line) {
      blocks.push({ type: 'spacer', size: 8 })
      index += 1
      continue
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/)
    if (headingMatch) {
      blocks.push({
        type: 'heading',
        level: headingMatch[1].length,
        text: normalizePdfText(headingMatch[2]),
      })
      index += 1
      continue
    }

    if (/^[-*]\s+/.test(line)) {
      while (index < lines.length && /^[-*]\s+/.test(lines[index].trim())) {
        blocks.push({
          type: 'list_item',
          ordered: false,
          text: normalizePdfText(lines[index].trim().replace(/^[-*]\s+/, '')),
        })
        index += 1
      }
      continue
    }

    if (/^\d+\.\s+/.test(line)) {
      while (index < lines.length && /^\d+\.\s+/.test(lines[index].trim())) {
        const current = lines[index].trim()
        const numberMatch = current.match(/^(\d+)\.\s+/)
        blocks.push({
          type: 'list_item',
          ordered: true,
          index: numberMatch ? Number(numberMatch[1]) : undefined,
          text: normalizePdfText(current.replace(/^\d+\.\s+/, '')),
        })
        index += 1
      }
      continue
    }

    const paragraph: string[] = [normalizePdfText(line)]
    index += 1
    while (index < lines.length && lines[index].trim()) {
      paragraph.push(normalizePdfText(lines[index].trim()))
      index += 1
    }
    blocks.push({ type: 'paragraph', text: paragraph.join(' ') })
  }

  while (blocks.at(-1)?.type === 'spacer') {
    blocks.pop()
  }

  return blocks
}

function parseInlineMarkdown(value: string): InlineSegment[] {
  const segments: InlineSegment[] = []
  const normalized = normalizePdfText(value)
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`)/g
  let lastIndex = 0

  for (const match of normalized.matchAll(pattern)) {
    const start = match.index ?? 0
    if (start > lastIndex) {
      segments.push({
        text: normalized.slice(lastIndex, start),
        font: 'helvetica',
        style: 'normal',
      })
    }

    const token = match[0]
    if (token.startsWith('**') && token.endsWith('**')) {
      segments.push({
        text: token.slice(2, -2),
        font: 'helvetica',
        style: 'bold',
      })
    } else if (token.startsWith('`') && token.endsWith('`')) {
      segments.push({
        text: token.slice(1, -1),
        font: 'courier',
        style: 'normal',
      })
    }

    lastIndex = start + token.length
  }

  if (lastIndex < normalized.length) {
    segments.push({
      text: normalized.slice(lastIndex),
      font: 'helvetica',
      style: 'normal',
    })
  }

  return segments.flatMap(splitSegmentByWhitespace).filter((segment) => segment.text.length > 0)
}

function splitSegmentByWhitespace(segment: InlineSegment): InlineSegment[] {
  return segment.text.split(/(\s+)/).map((part) => ({
    ...segment,
    text: part,
  }))
}

function wrapInlineSegments(
  doc: {
    setFont: (fontName: string, fontStyle: string) => void
    setFontSize: (fontSize: number) => void
    getTextWidth: (text: string) => number
  },
  segments: InlineSegment[],
  maxWidth: number,
  fontSize: number,
): InlineSegment[][] {
  const lines: InlineSegment[][] = []
  let currentLine: InlineSegment[] = []
  let currentWidth = 0

  for (const segment of segments) {
    doc.setFont(segment.font, segment.style)
    doc.setFontSize(fontSize)
    const partWidth = doc.getTextWidth(segment.text)

    if (currentWidth + partWidth <= maxWidth || currentLine.length === 0) {
      currentLine.push(segment)
      currentWidth += partWidth
      continue
    }

    lines.push(trimLineEndWhitespace(currentLine))
    currentLine = segment.text.trim()
      ? [segment.text.match(/^\s+$/) ? { ...segment, text: '' } : segment]
      : []
    currentWidth = currentLine.length > 0 ? doc.getTextWidth(currentLine[0].text) : 0
  }

  if (currentLine.length > 0) {
    lines.push(trimLineEndWhitespace(currentLine))
  }

  return lines.length > 0 ? lines : [[{ text: '', font: 'helvetica', style: 'normal' }]]
}

function trimLineEndWhitespace(line: InlineSegment[]): InlineSegment[] {
  const copy = [...line]
  while (copy.length > 0 && /^\s+$/.test(copy.at(-1)?.text || '')) {
    copy.pop()
  }
  return copy
}

function normalizePdfText(value: string): string {
  return value
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[•]/g, '-')
    .replace(/[–—]/g, '-')
    .replace(/\t/g, '  ')
}
