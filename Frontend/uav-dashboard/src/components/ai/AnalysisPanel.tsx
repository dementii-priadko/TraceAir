import type { FlightAnalysis } from '../../types/flight'
import { renderMarkdown } from '../../utils/markdown'
import { SectionCard } from '../layout/SectionCard'

export type AnalysisPanelProps = {
  analysis: FlightAnalysis | null
  loading: boolean
  source: 'api' | 'mock'
}

export function AnalysisPanel({
  analysis,
  loading,
  source,
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
