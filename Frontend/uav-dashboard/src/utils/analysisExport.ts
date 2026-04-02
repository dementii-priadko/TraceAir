import type { FlightAnalysis } from '../types/flight'
import { renderMarkdown } from './markdown'

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
  source: 'api' | 'mock',
): string {
  return [
    '# TraceAir AI Analysis',
    '',
    `- Flight ID: ${flightId}`,
    `- Firmware: ${firmwareLabel}`,
    `- Source: ${source === 'api' ? 'backend' : 'mock fallback'}`,
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
  source: 'api' | 'mock',
): void {
  downloadTextFile(
    buildAnalysisFilename(flightId, firmwareLabel, 'md'),
    buildAnalysisMarkdown(analysis, flightId, firmwareLabel, source),
    'text/markdown;charset=utf-8',
  )
}

export function exportAnalysisPdf(
  analysis: FlightAnalysis,
  flightId: string,
  firmwareLabel: string,
  source: 'api' | 'mock',
): void {
  const printWindow = window.open('', '_blank', 'noopener,noreferrer')

  if (!printWindow) {
    return
  }

  const title = `TraceAir AI Analysis`
  const filename = buildAnalysisFilename(flightId, firmwareLabel, 'pdf')
  const renderedBody = renderMarkdown(analysis.summary)
  const metadata = [
    ['Flight ID', flightId],
    ['Firmware', firmwareLabel],
    ['Source', source === 'api' ? 'backend' : 'mock fallback'],
    ['Model', analysis.model || 'unknown'],
  ]

  const metadataMarkup = metadata
    .map(
      ([label, value]) =>
        `<div class="meta-card"><span class="meta-label">${label}</span><strong>${value}</strong></div>`,
    )
    .join('')

  printWindow.document.write(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>${title}</title>
    <style>
      :root {
        color-scheme: light;
        --ink: #1c1713;
        --muted: #6f6256;
        --line: rgba(108, 82, 58, 0.22);
        --accent: #b56b35;
        --paper: #fffdf9;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        background: var(--paper);
        color: var(--ink);
        font-family: "DM Sans", Arial, sans-serif;
      }
      .page {
        padding: 40px 48px 56px;
      }
      .eyebrow {
        margin: 0 0 12px;
        color: var(--accent);
        font: 600 11px/1.2 "IBM Plex Mono", monospace;
        letter-spacing: 0.2em;
        text-transform: uppercase;
      }
      h1 {
        margin: 0;
        font: 600 28px/1.05 "Sora", "DM Sans", Arial, sans-serif;
        letter-spacing: -0.04em;
      }
      .lede {
        margin: 14px 0 0;
        max-width: 720px;
        color: var(--muted);
        font-size: 14px;
        line-height: 1.7;
      }
      .meta-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
        margin: 26px 0 30px;
      }
      .meta-card {
        border: 1px solid var(--line);
        padding: 12px 14px;
      }
      .meta-label {
        display: block;
        margin-bottom: 6px;
        color: var(--muted);
        font: 600 10px/1.2 "IBM Plex Mono", monospace;
        letter-spacing: 0.16em;
        text-transform: uppercase;
      }
      .meta-card strong {
        font-size: 14px;
      }
      .report {
        border-top: 1px solid var(--line);
        padding-top: 22px;
      }
      .markdown-body h1,
      .markdown-body h2,
      .markdown-body h3,
      .markdown-body h4,
      .markdown-body h5,
      .markdown-body h6 {
        margin: 0 0 12px;
        line-height: 1.3;
      }
      .markdown-body h2 {
        margin-top: 24px;
        font-size: 17px;
      }
      .markdown-body p,
      .markdown-body ul,
      .markdown-body ol {
        margin: 0 0 14px;
        font-size: 14px;
        line-height: 1.75;
      }
      .markdown-body ul,
      .markdown-body ol {
        padding-left: 20px;
      }
      .markdown-body code {
        padding: 1px 5px;
        border-radius: 6px;
        background: rgba(181, 107, 53, 0.08);
        font-family: "IBM Plex Mono", monospace;
      }
      @media print {
        @page { size: auto; margin: 14mm; }
        .page { padding: 0; }
      }
    </style>
  </head>
  <body>
    <main class="page">
      <p class="eyebrow">TraceAir Report</p>
      <h1>${title}</h1>
      <p class="lede">AI-generated interpretation of the selected mission log, prepared for post-flight review and export.</p>
      <section class="meta-grid">${metadataMarkup}</section>
      <section class="report markdown-body">${renderedBody}</section>
    </main>
    <script>
      window.addEventListener('load', () => {
        document.title = ${JSON.stringify(filename)};
        window.print();
      });
      window.addEventListener('afterprint', () => window.close());
    </script>
  </body>
</html>`)
  printWindow.document.close()
}
