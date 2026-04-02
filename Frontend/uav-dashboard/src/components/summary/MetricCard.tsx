import type { SummaryMetric } from '../../utils/flightAdapters'

export type MetricCardProps = {
  metric: SummaryMetric
}

export function MetricCard({ metric }: MetricCardProps) {
  return (
    <article className="relative overflow-hidden border border-[var(--color-border)] bg-[var(--panel-gradient)] px-4 py-4 shadow-[var(--card-shadow)]">
      <div className="pointer-events-none absolute left-0 top-0 h-full w-1 bg-[rgba(207,127,69,0.6)]" />
      <p className="pl-3 font-mono text-[0.62rem] font-medium uppercase tracking-[0.22em] text-[var(--color-text-muted)]">
        {metric.label}
      </p>
      <p className="mt-3 pl-3 font-[var(--font-display)] text-[1.7rem] font-semibold tracking-[-0.05em] text-[var(--color-text-primary)]">
        {metric.value}
      </p>
      <p className="mt-2 max-w-[18rem] pl-3 text-[0.78rem] leading-relaxed text-[var(--color-text-secondary)]">
        {metric.hint}
      </p>
    </article>
  )
}
