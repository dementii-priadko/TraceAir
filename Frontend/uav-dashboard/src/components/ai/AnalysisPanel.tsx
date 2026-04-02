import type { FlightAnalysis } from '../../types/flight'
import { exportAnalysisMarkdown, exportAnalysisPdf } from '../../utils/analysisExport'
import { renderMarkdown } from '../../utils/markdown'
import { SectionCard } from '../layout/SectionCard'

export type AnalysisPanelProps = {
  analysis: FlightAnalysis | null
  loading: boolean
  source: 'api' | 'mock'
  flightId: string
  firmwareLabel: string
  fileLabel: string
}

export function AnalysisPanel({
  analysis,
  loading,
  source,
  flightId,
  firmwareLabel,
  fileLabel,
}: AnalysisPanelProps) {
  let body = 'No analysis available for the current flight.'

  if (loading) {
    body = 'Loading backend analysis.'
  } else if (source === 'mock' && !analysis) {
    body = 'Backend unavailable. The dashboard is using local mock telemetry without backend analysis.'
  } else if (analysis) {
    body = analysis.summary
  }

  const renderedBody = renderMarkdown(body)

  return (
    <SectionCard
      title="Analysis"
      description="Backend-generated interpretation of the selected flight profile and anomalies."
      actions={
        analysis ? (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() =>
                exportAnalysisMarkdown(analysis, flightId, firmwareLabel, fileLabel)
              }
              className="inline-flex h-9 items-center border border-[var(--color-border)] bg-[var(--control-bg)] px-3 text-[0.72rem] font-medium uppercase tracking-[0.12em] text-[var(--color-text-secondary)] transition hover:border-[rgba(207,127,69,0.4)] hover:text-[var(--color-text-primary)]"
            >
              Export MD
            </button>
            <button
              type="button"
              onClick={() =>
                exportAnalysisPdf(analysis, flightId, firmwareLabel, fileLabel)
              }
              className="inline-flex h-9 items-center border border-[rgba(207,127,69,0.32)] bg-[rgba(207,127,69,0.08)] px-3 text-[0.72rem] font-medium uppercase tracking-[0.12em] text-[var(--color-text-primary)] transition hover:bg-[rgba(207,127,69,0.14)]"
            >
              Export PDF
            </button>
          </div>
        ) : null
      }
    >
      <div className="space-y-4">
        {analysis?.model ? (
          <div className="inline-flex rounded-full border border-[var(--color-border)] px-3 py-1 font-mono text-[0.68rem] uppercase tracking-[0.18em] text-[var(--color-text-muted)]">
            {analysis.model}
          </div>
        ) : null}
        <div
          className="markdown-body max-w-none text-[0.95rem] leading-7 text-[var(--color-text-secondary)]"
          dangerouslySetInnerHTML={{ __html: renderedBody }}
        />
      </div>
    </SectionCard>
  )
}
