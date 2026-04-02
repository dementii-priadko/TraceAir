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
      title="Analysis Summary"
      description="Text summary returned by the backend for the selected flight."
    >
      <div className="space-y-3">
        {analysis ? (
          <div className="text-xs text-slate-500">{analysis.model}</div>
        ) : null}
        <div
          className="markdown-body text-sm leading-6 text-slate-300"
          dangerouslySetInnerHTML={{ __html: renderedBody }}
        />
      </div>
    </SectionCard>
  )
}
